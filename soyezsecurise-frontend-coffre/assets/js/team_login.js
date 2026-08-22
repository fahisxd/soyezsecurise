(function (window, document) {
    "use strict";

    var session = window.CoffreTeamSession;
    var usernamePattern = /^[A-Za-z0-9@._]{1,32}$/;
    var pendingLogin = null;
    var pendingCreate = null;

    var choice = document.getElementById("team-choice");
    var loginCard = document.getElementById("team-login-card");
    var createCard = document.getElementById("team-create-card");
    var acceptCard = document.getElementById("team-accept-card");
    var accessShell = document.querySelector(".login-shell");
    var login = {
        form: document.getElementById("team-login-form"), username: document.getElementById("team-login-username"), teamname: document.getElementById("team-login-name"),
        password: document.getElementById("team-login-password"), otp: document.getElementById("team-login-otp"), secretFields: document.getElementById("secret-login-fields"),
        steps: document.getElementById("team-login-steps"), submit: document.getElementById("team-login-submit"), status: document.getElementById("team-login-status"),
        otpHint: document.querySelector("#secret-login-fields .field-hint")
    };
    var create = {
        form: document.getElementById("team-create-form"), username: document.getElementById("team-create-username"), teamname: document.getElementById("team-create-name"),
        password: document.getElementById("team-create-password"), confirm: document.getElementById("team-create-confirm"), otp: document.getElementById("team-create-otp"),
        secretFields: document.getElementById("team-create-secret-fields"), steps: document.getElementById("team-create-steps"), submit: document.getElementById("team-create-submit"),
        status: document.getElementById("team-create-status"), strength: document.getElementById("team-password-strength"), strengthLabel: document.getElementById("team-strength-label"),
        strengthBar: document.getElementById("team-strength-bar"), strengthRules: document.getElementById("team-strength-rules")
    };
    var accept = {
        form: document.getElementById("team-accept-form"), username: document.getElementById("team-accept-username"), teamname: document.getElementById("team-accept-name"),
        role: document.getElementById("team-accept-role"), code: document.getElementById("team-accept-code"), codeField: document.getElementById("team-admin-code-field"),
        submit: document.getElementById("team-accept-submit"), status: document.getElementById("team-accept-status")
    };

    function bytesToHex(bytes) { return Array.from(bytes, function (byte) { return byte.toString(16).padStart(2, "0"); }).join(""); }
    function hexToBytes(hex) { return Uint8Array.from((hex.match(/.{1,2}/g) || []).map(function (pair) { return parseInt(pair, 16); })); }
    function unwrap(data) { return data && Object.prototype.hasOwnProperty.call(data, "result") ? data.result : data; }

    function normalizeSessionToken(token) {
        if (typeof token === "string") {
            if (/^[a-fA-F0-9]{64}$/.test(token)) { return token.toLowerCase(); }
            try {
                var decoded = window.atob(token);
                if (decoded.length === 32) { return bytesToHex(Uint8Array.from(decoded, function (character) { return character.charCodeAt(0); })); }
            } catch (error) { /* The response may be a raw byte string. */ }
            if (token.length === 32) { return bytesToHex(Uint8Array.from(token, function (character) { return character.charCodeAt(0) & 255; })); }
        }
        var byteArray = Array.isArray(token) ? token : token && Array.isArray(token.data) ? token.data : null;
        return byteArray && byteArray.length === 32 ? bytesToHex(Uint8Array.from(byteArray)) : null;
    }

    function setStatus(flow, message, type) {
        flow.status.textContent = message || "";
        flow.status.className = "form-status" + (type ? " is-" + type : "");
    }

    function setBusy(flow, busy, label) {
        flow.submit.disabled = busy;
        flow.submit.querySelector("span:first-child").textContent = label;
    }

    function showMode(mode, updateHash) {
        if (accessShell) { accessShell.hidden = false; }
        choice.hidden = mode !== "choice";
        loginCard.hidden = mode !== "login";
        createCard.hidden = mode !== "create";
        acceptCard.hidden = mode !== "accept";
        if (updateHash !== false) {
            if (mode === "choice") { window.history.replaceState(null, "", window.location.pathname); }
            else { window.history.replaceState(null, "", "#" + mode); }
        }
        if (mode === "accept") { prepareAcceptForm(); }
        var target = mode === "login" ? login.username : mode === "create" ? create.username : mode === "accept" ? accept.teamname : choice.querySelector("button");
        window.setTimeout(function () { if (target) { target.focus(); } }, 0);
    }

    function validIdentity(flow) {
        if (!usernamePattern.test(flow.username.value.trim())) { setStatus(flow, "Enter a valid Coffre username.", "error"); flow.username.focus(); return false; }
        if (!usernamePattern.test(flow.teamname.value.trim())) { setStatus(flow, "Enter a valid team name.", "error"); flow.teamname.focus(); return false; }
        return true;
    }

    function showSecondStep(flow) {
        flow.secretFields.hidden = false;
        flow.username.readOnly = true;
        flow.teamname.readOnly = true;
        flow.steps.querySelectorAll("span")[1].classList.add("active");
        flow.password.focus();
    }

    function resetLogin() {
        pendingLogin = null;
        login.secretFields.hidden = true;
        login.username.readOnly = false;
        login.teamname.readOnly = false;
        login.steps.querySelectorAll("span")[1].classList.remove("active");
        setBusy(login, false, "Continue");
        setStatus(login, "");
    }

    function resetCreate() {
        pendingCreate = null;
        create.secretFields.hidden = true;
        create.username.readOnly = false;
        create.teamname.readOnly = false;
        create.steps.querySelectorAll("span")[1].classList.remove("active");
        setBusy(create, false, "Continue");
        setStatus(create, "");
        updateStrength();
    }

    function getPersonalSession() {
        try {
            return {
                username: window.localStorage.getItem("username"),
                sessionId: window.localStorage.getItem("session_id"),
                active: window.localStorage.getItem("userLoggedIn") === "true"
            };
        } catch (error) {
            return { username: null, sessionId: null, active: false };
        }
    }

    function prepareAcceptForm() {
        var personal = getPersonalSession();
        if (personal.username) {
            accept.username.value = personal.username;
            accept.username.readOnly = true;
        } else {
            accept.username.readOnly = false;
        }
        accept.codeField.hidden = accept.role.value !== "admin";
        if (!personal.active || !/^[a-fA-F0-9]{64}$/.test(personal.sessionId || "")) {
            setStatus(accept, "Log in to your personal Coffre vault before accepting an invitation.", "error");
        }
    }

    function resetAccept() {
        setBusy(accept, false, "Accept invitation");
        setStatus(accept, "");
        accept.codeField.hidden = true;
        accept.code.value = "";
        prepareAcceptForm();
    }

    async function requestLoginChallenge() {
        if (!validIdentity(login)) { return; }
        setBusy(login, true, "Requesting...");
        setStatus(login, "Requesting a fresh team challenge...");
        try {
            var data = await session.post("/coffre/team/login", { username: login.username.value.trim(), teamname: login.teamname.value.trim() });
            if (data.ERROR) { throw new Error(data.ERROR); }
            if (!/^[a-fA-F0-9]{64}$/.test(data.nonce || "") || !/^[a-fA-F0-9]{64}$/.test(data.salt || "") || !/^[a-fA-F0-9]{32}$/.test(data.request_id || "")) { throw new Error("The server returned an incomplete login challenge."); }
            pendingLogin = { username: login.username.value.trim(), teamname: login.teamname.value.trim(), nonce: data.nonce, salt: data.salt, requestId: data.request_id };
            showSecondStep(login);
            setBusy(login, false, "Unlock team");
            login.otpHint.textContent = data.otp_method === "totp" ? "Use the code from your authenticator app." : "Check the email linked to your Coffre account.";
            setStatus(login, data.otp_method === "totp" ? "Challenge ready. Enter the team password and authenticator code." : "Challenge ready. Enter the team password and emailed OTP.");
        } catch (error) { setStatus(login, error.message || "The login challenge could not be requested.", "error"); setBusy(login, false, "Continue"); }
    }

    async function verifyLogin() {
        var otp = login.otp.value.trim().toUpperCase();
        if (!login.password.value) { setStatus(login, "Enter your team password.", "error"); login.password.focus(); return; }
        if (!/^[0-9A-Z]{1,6}$/.test(otp)) { setStatus(login, "Enter the OTP code from your email.", "error"); login.otp.focus(); return; }
        if (!window.argon2) { setStatus(login, "The secure key-derivation library did not load.", "error"); return; }
        setBusy(login, true, "Deriving keys...");
        try {
            var derived = await window.argon2.hash({ pass: new TextEncoder().encode(login.password.value), salt: hexToBytes(pendingLogin.salt), time: 4, mem: 65536, parallelism: 4, hashLen: 32, type: window.argon2.ArgonType.Argon2id });
            var teamKey = new Uint8Array(derived.hash);
            setBusy(login, true, "Verifying...");
            var data = await session.post("/coffre/team/login2", { signature: await session.signNonce(pendingLogin.nonce, teamKey), username: pendingLogin.username, teamname: pendingLogin.teamname, otp: otp, request_id: pendingLogin.requestId });
            if (data.ERROR) { throw new Error(data.ERROR); }
            var sessionId = normalizeSessionToken(data.session_id || data.session_token);
            if (!sessionId) { throw new Error("Login succeeded, but the server did not return a valid team session."); }
            session.saveCredentials({ username: pendingLogin.username, teamname: pendingLogin.teamname, sessionId: sessionId, requestId: data.request_id || pendingLogin.requestId });
            window.coffreTeamKey = teamKey;
            login.password.value = "";
            login.otp.value = "";
            setStatus(login, "Team session ready.", "success");
            window.CoffreTeamDashboard.open(session.getCredentials());
        } catch (error) {
            var message = error.message || "Team login failed.";
            login.password.value = "";
            login.otp.value = "";
            resetLogin();
            setStatus(login, message + " Request a fresh challenge to try again.", "error");
        }
    }

    function passwordStrength(password) {
        var rules = { length: password.length >= 12, uppercase: /[A-Z]/.test(password), lowercase: /[a-z]/.test(password), number: /\d/.test(password), symbol: /[^A-Za-z0-9]/.test(password) };
        var score = Object.values(rules).filter(Boolean).length;
        var level = !password ? "empty" : score <= 2 ? "weak" : score <= 4 ? "medium" : password.length >= 16 ? "excellent" : "strong";
        var labels = { empty: "Start typing", weak: "Weak", medium: "Medium", strong: "Strong", excellent: "Excellent" };
        var widths = { empty: 0, weak: 25, medium: 55, strong: 82, excellent: 100 };
        return { rules: rules, level: level, label: labels[level], width: widths[level], acceptable: score === 5 };
    }

    function updateStrength() {
        var strength = passwordStrength(create.password.value);
        create.strength.dataset.strength = strength.level;
        create.strengthLabel.textContent = strength.label;
        create.strengthBar.style.width = strength.width + "%";
        Array.from(create.strengthRules.children).forEach(function (item) { item.classList.toggle("met", Boolean(strength.rules[item.dataset.rule])); });
        return strength;
    }

    async function requestCreateChallenge() {
        if (!validIdentity(create)) { return; }
        setBusy(create, true, "Sending OTP...");
        setStatus(create, "Checking the team name and sending a verification code...");
        try {
            var result = unwrap(await session.post("/coffre/team/newteam", { username: create.username.value.trim(), team_name: create.teamname.value.trim() }));
            if (result && result.ERROR) { throw new Error(result.ERROR); }
            pendingCreate = { username: create.username.value.trim(), teamname: create.teamname.value.trim() };
            showSecondStep(create);
            setBusy(create, false, "Create team");
            setStatus(create, (result && result.message) || "If the details are valid, an OTP has been sent.");
        } catch (error) { setStatus(create, error.message || "Team creation could not be started.", "error"); setBusy(create, false, "Continue"); }
    }

    async function finishCreate() {
        var strength = updateStrength();
        var otp = create.otp.value.trim().toUpperCase();
        var requestSubmitted = false;
        if (!strength.acceptable) { setStatus(create, "Use a stronger team password that meets every rule.", "error"); create.password.focus(); return; }
        if (create.password.value !== create.confirm.value) { setStatus(create, "Team passwords do not match.", "error"); create.confirm.focus(); return; }
        if (!/^[0-9A-Z]{1,6}$/.test(otp)) { setStatus(create, "Enter the OTP code from your email.", "error"); create.otp.focus(); return; }
        if (!window.argon2) { setStatus(create, "The secure key-derivation library did not load.", "error"); return; }
        setBusy(create, true, "Creating...");
        setStatus(create, "Deriving the team authentication key on this device...");
        try {
            var salt = window.crypto.getRandomValues(new Uint8Array(32));
            var derived = await window.argon2.hash({ pass: new TextEncoder().encode(create.password.value), salt: salt, time: 4, mem: 65536, parallelism: 4, hashLen: 32, type: window.argon2.ArgonType.Argon2id });
            requestSubmitted = true;
            var result = unwrap(await session.post("/coffre/team/newteam2", { username: pendingCreate.username, teamname: pendingCreate.teamname, hash: bytesToHex(new Uint8Array(derived.hash)), salt: bytesToHex(salt), otp: otp, memberinvites: [], admininvites: [] }));
            if (result && result.ERROR) { throw new Error(result.ERROR); }
            var createdUsername = pendingCreate.username;
            var createdTeam = pendingCreate.teamname;
            var resultMessage = result && result.message ? result.message : "The team creation request was processed";
            create.form.reset();
            resetCreate();
            showMode("login");
            login.username.value = createdUsername;
            login.teamname.value = createdTeam;
            setStatus(login, resultMessage + ". Try team login now. If the team does not open, start creation again to request a fresh code.");
        } catch (error) {
            var message = error.message || "The team request could not be processed.";
            if (requestSubmitted) {
                var retryUsername = pendingCreate.username;
                var retryTeam = pendingCreate.teamname;
                create.form.reset();
                resetCreate();
                create.username.value = retryUsername;
                create.teamname.value = retryTeam;
                setStatus(create, message + " Request a fresh verification code before trying again.", "error");
            } else {
                setStatus(create, message, "error");
                setBusy(create, false, "Create team");
            }
        }
    }

    async function acceptInvitation(event) {
        event.preventDefault();
        var personal = getPersonalSession();
        var username = accept.username.value.trim();
        var teamname = accept.teamname.value.trim();
        var isAdmin = accept.role.value === "admin";
        if (!personal.active || !/^[a-fA-F0-9]{64}$/.test(personal.sessionId || "")) {
            setStatus(accept, "Your personal Coffre session is missing or expired. Log in there first.", "error");
            return;
        }
        if (username !== personal.username || !usernamePattern.test(username)) {
            setStatus(accept, "Use the username from your active personal Coffre session.", "error");
            return;
        }
        if (!usernamePattern.test(teamname)) {
            setStatus(accept, "Enter a valid team name.", "error");
            accept.teamname.focus();
            return;
        }
        if (isAdmin && !accept.code.value.trim()) {
            setStatus(accept, "Enter the admin invite code shared by the team owner.", "error");
            accept.code.focus();
            return;
        }
        setBusy(accept, true, "Accepting...");
        setStatus(accept, "Checking your invitation...");
        try {
            var payload = { username: username, session_id: personal.sessionId, teamname: teamname };
            if (isAdmin) { payload.code = accept.code.value.trim(); }
            var data = await session.post(isAdmin ? "/coffre/accept_invite_admin" : "/coffre/accept_invite", payload);
            if (data && data.ERROR) { throw new Error(data.ERROR); }
            accept.code.value = "";
            setBusy(accept, false, "Accept invitation");
            showMode("login");
            login.username.value = username;
            login.teamname.value = teamname;
            setStatus(login, "Invitation accepted. Log in with the team password to continue.", "success");
        } catch (error) {
            setStatus(accept, error.message || "The invitation could not be accepted.", "error");
            setBusy(accept, false, "Accept invitation");
        }
    }

    document.querySelectorAll("[data-team-mode]").forEach(function (button) { button.addEventListener("click", function () { showMode(button.dataset.teamMode); }); });
    document.querySelectorAll("[data-password-target]").forEach(function (button) { button.addEventListener("click", function () { var field = document.getElementById(button.dataset.passwordTarget); var show = field.type === "password"; field.type = show ? "text" : "password"; button.textContent = show ? "Hide" : "Show"; button.setAttribute("aria-label", (show ? "Hide" : "Show") + " protected value"); }); });
    login.form.addEventListener("submit", function (event) { event.preventDefault(); pendingLogin ? verifyLogin() : requestLoginChallenge(); });
    login.form.addEventListener("reset", function () { window.setTimeout(resetLogin, 0); });
    create.form.addEventListener("submit", function (event) { event.preventDefault(); pendingCreate ? finishCreate() : requestCreateChallenge(); });
    create.form.addEventListener("reset", function () { window.setTimeout(resetCreate, 0); });
    accept.form.addEventListener("submit", acceptInvitation);
    accept.form.addEventListener("reset", function () { window.setTimeout(resetAccept, 0); });
    accept.role.addEventListener("change", function () { accept.codeField.hidden = accept.role.value !== "admin"; accept.code.value = ""; setStatus(accept, ""); });
    login.otp.addEventListener("input", function () { login.otp.value = login.otp.value.toUpperCase(); });
    create.otp.addEventListener("input", function () { create.otp.value = create.otp.value.toUpperCase(); });
    create.password.addEventListener("input", updateStrength);

    window.CoffreTeamAccess = {
        showLogin: function (message) {
            resetLogin();
            showMode("login");
            if (message) { setStatus(login, message, "error"); }
        },
        showChoice: function () {
            resetLogin();
            resetCreate();
            resetAccept();
            showMode("choice");
        }
    };

    var flash = session.consumeFlash();
    var initialMode = window.location.hash === "#login" ? "login" : window.location.hash === "#create" ? "create" : window.location.hash === "#accept" ? "accept" : "choice";
    showMode(initialMode, false);
    if (flash) { showMode("login", false); setStatus(login, flash, "error"); }
}(window, document));
