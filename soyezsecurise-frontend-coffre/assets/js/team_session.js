(function (window) {
    "use strict";

    var API_BASE = window.COFFRE_API_URL;
    if (!API_BASE) {
        throw new Error("Coffre API configuration is missing. Load assets/js/config.js first.");
    }
    var STORAGE_KEYS = {
        username: "coffre.team.username",
        teamname: "coffre.team.teamname",
        sessionId: "coffre.team.session_id",
        requestId: "coffre.team.request_id",
        flash: "coffre.team.flash"
    };

    function storageGet(key) {
        try { return window.sessionStorage.getItem(key); }
        catch (error) { return null; }
    }

    function storageSet(key, value) {
        try { window.sessionStorage.setItem(key, value); }
        catch (error) { /* The current page can continue even if storage is unavailable. */ }
    }

    function storageRemove(key) {
        try { window.sessionStorage.removeItem(key); }
        catch (error) { /* Nothing else to clear. */ }
    }

    function makeRequestId() {
        var bytes = new Uint8Array(16);
        window.crypto.getRandomValues(bytes);
        return Array.from(bytes, function (byte) {
            return byte.toString(16).padStart(2, "0");
        }).join("");
    }

    function bytesToHex(bytes) {
        return Array.from(bytes, function (byte) {
            return byte.toString(16).padStart(2, "0");
        }).join("");
    }

    function hexToBytes(hex) {
        return Uint8Array.from((hex.match(/.{1,2}/g) || []).map(function (pair) {
            return parseInt(pair, 16);
        }));
    }

    function bytesToBase64(bytes) {
        var binary = "";
        bytes.forEach(function (byte) { binary += String.fromCharCode(byte); });
        return window.btoa(binary);
    }

    function base64ToBytes(base64) {
        var binary = window.atob(String(base64 || "").trim());
        return Uint8Array.from(binary, function (character) { return character.charCodeAt(0); });
    }

    function getTeamKey() {
        return window.coffreTeamKey instanceof Uint8Array && window.coffreTeamKey.length === 32
            ? window.coffreTeamKey
            : null;
    }

    async function signNonce(nonceHex, keyBytes) {
        var signingKey = keyBytes || getTeamKey();
        if (!signingKey || !/^[a-fA-F0-9]{64}$/.test(nonceHex || "")) {
            throw new Error("The signed team challenge is unavailable. Log in again.");
        }
        var key = await window.crypto.subtle.importKey("raw", signingKey, { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
        var signature = await window.crypto.subtle.sign("HMAC", key, hexToBytes(nonceHex));
        return bytesToHex(new Uint8Array(signature));
    }

    async function encryptSecret(plaintext) {
        var teamKey = getTeamKey();
        if (!teamKey) { throw new Error("Your team encryption key is unavailable. Log in again."); }
        var iv = window.crypto.getRandomValues(new Uint8Array(12));
        var key = await window.crypto.subtle.importKey("raw", teamKey, { name: "AES-GCM" }, false, ["encrypt"]);
        var encrypted = new Uint8Array(await window.crypto.subtle.encrypt(
            { name: "AES-GCM", iv: iv },
            key,
            new TextEncoder().encode(plaintext)
        ));
        var payload = new Uint8Array(iv.length + encrypted.length);
        payload.set(iv);
        payload.set(encrypted, iv.length);
        return bytesToBase64(payload);
    }

    async function decryptSecret(encodedPayload) {
        var teamKey = getTeamKey();
        if (!teamKey) { throw new Error("Your team encryption key is unavailable. Log in again."); }
        var payload;
        try { payload = base64ToBytes(encodedPayload); }
        catch (error) { throw new Error("The protected value has an invalid format."); }
        if (payload.length <= 28) { throw new Error("The protected value is incomplete."); }
        var key = await window.crypto.subtle.importKey("raw", teamKey, { name: "AES-GCM" }, false, ["decrypt"]);
        try {
            var decrypted = await window.crypto.subtle.decrypt(
                { name: "AES-GCM", iv: payload.slice(0, 12) },
                key,
                payload.slice(12)
            );
            return new TextDecoder().decode(decrypted);
        } catch (error) {
            throw new Error("This secret could not be decrypted with the current team key.");
        }
    }

    function getCredentials() {
        return {
            username: storageGet(STORAGE_KEYS.username),
            teamname: storageGet(STORAGE_KEYS.teamname),
            sessionId: storageGet(STORAGE_KEYS.sessionId),
            requestId: storageGet(STORAGE_KEYS.requestId)
        };
    }

    function credentialsAreValid(credentials) {
        return Boolean(
            credentials &&
            credentials.username &&
            credentials.teamname &&
            /^[a-fA-F0-9]{64}$/.test(credentials.sessionId || "") &&
            /^[a-fA-F0-9]{32}$/.test(credentials.requestId || "")
        );
    }

    function saveCredentials(credentials) {
        storageSet(STORAGE_KEYS.username, credentials.username);
        storageSet(STORAGE_KEYS.teamname, credentials.teamname);
        storageSet(STORAGE_KEYS.sessionId, credentials.sessionId);
        storageSet(STORAGE_KEYS.requestId, credentials.requestId);
    }

    function clearCredentials() {
        storageRemove(STORAGE_KEYS.username);
        storageRemove(STORAGE_KEYS.teamname);
        storageRemove(STORAGE_KEYS.sessionId);
        storageRemove(STORAGE_KEYS.requestId);
        if (getTeamKey()) { window.coffreTeamKey.fill(0); }
        window.coffreTeamKey = null;
        window.dispatchEvent(new CustomEvent("coffre-team-cleared"));
    }

    function setFlash(message) { storageSet(STORAGE_KEYS.flash, message); }

    function consumeFlash() {
        var message = storageGet(STORAGE_KEYS.flash);
        storageRemove(STORAGE_KEYS.flash);
        return message;
    }

    function isSessionExpired(message) {
        if (typeof message !== "string") { return false; }
        var normalized = message.toLowerCase();
        return normalized.includes("session expired") || normalized.includes("login again");
    }

    function redirectToLogin(message) {
        clearCredentials();
        if (window.CoffreTeamDashboard) {
            window.CoffreTeamDashboard.close();
        }
        if (window.CoffreTeamAccess) {
            window.CoffreTeamAccess.showLogin(message);
            return;
        }
        if (message) { setFlash(message); }
        window.location.replace("team.html#login");
    }

    async function post(path, payload) {
        var response;
        try {
            response = await window.fetch(API_BASE + path, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(payload)
            });
        } catch (error) {
            throw new Error("The Coffre server could not be reached. Please try again.");
        }

        var data;
        try {
            data = await response.json();
        } catch (error) {
            throw new Error("The server returned an unreadable response.");
        }

        if (!response.ok) {
            var validationMessage = data && Array.isArray(data.detail)
                ? data.detail.map(function (item) { return item.msg; }).join(" ")
                : null;
            throw new Error((data && (data.ERROR || data.message)) || validationMessage || "Request failed.");
        }

        return data;
    }

    window.CoffreTeamSession = {
        getCredentials: getCredentials,
        credentialsAreValid: credentialsAreValid,
        saveCredentials: saveCredentials,
        clearCredentials: clearCredentials,
        makeRequestId: makeRequestId,
        getTeamKey: getTeamKey,
        signNonce: signNonce,
        encryptSecret: encryptSecret,
        decryptSecret: decryptSecret,
        isSessionExpired: isSessionExpired,
        redirectToLogin: redirectToLogin,
        consumeFlash: consumeFlash,
        post: post
    };
}(window));
