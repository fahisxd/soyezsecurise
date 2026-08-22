(function (window, document) {
    "use strict";

    var session = window.CoffreTeamSession;
    var credentials = null;
    var usernamePattern = /^[A-Za-z0-9@._]{1,32}$/;
    var secretNamePattern = /^[A-Za-z0-9.@_]{1,64}$/;
    var state = {
        role: null, owner: null, admins: [], members: [], participants: [], passwords: [], apis: [],
        permissions: { canDeleteSecrets: false, canRemoveMembers: false }, adminPermissions: {},
        secretCategory: "PASSWORD", pendingRetrieve: null, retrievalToken: 0, currentApi: null,
        pendingAction: null, permissionAdmin: null, pendingCode: null, modalTrigger: null
    };

    var elements = {
        teamTitle: document.getElementById("team-title"), currentName: document.getElementById("owner-name"),
        currentAvatar: document.getElementById("owner-avatar"), currentRole: document.getElementById("current-role"),
        dashboardAlert: document.getElementById("dashboard-alert"), passwordList: document.getElementById("password-list"),
        passwordCount: document.getElementById("password-count"), apiList: document.getElementById("api-list"),
        rosterBody: document.getElementById("roster-body"), rosterCount: document.getElementById("roster-count"),
        storePanel: document.getElementById("store-panel"), storeForm: document.getElementById("store-secret-form"),
        storeModes: Array.from(document.querySelectorAll("[data-secret-category]")), secretName: document.getElementById("team-secret-name"),
        serviceName: document.getElementById("team-service-name"), serviceNameField: document.getElementById("service-name-field"),
        secretValue: document.getElementById("team-secret-value"), passwordOptions: document.getElementById("password-options"),
        memberCanView: document.getElementById("member-can-view"), passwordRequire2FA: document.getElementById("password-require-2fa"),
        storeApiUsers: document.getElementById("store-api-users"), storeApiUserList: document.getElementById("store-api-user-list"),
        storeSecurityCopy: document.getElementById("store-security-copy"), storeSubmit: document.getElementById("store-secret-submit"),
        storeStatus: document.getElementById("store-secret-status"), invitePanel: document.getElementById("invite-panel"),
        inviteForm: document.getElementById("invite-form"), inviteRows: Array.from(document.querySelectorAll("[data-invite-row]")),
        inviteFilledCount: document.getElementById("invite-filled-count"), inviteSubmit: document.getElementById("invite-submit"),
        inviteStatus: document.getElementById("invite-status"), permissionPanel: document.getElementById("permissions-panel"),
        permissionList: document.getElementById("permission-list"), permissionsStatus: document.getElementById("permissions-status"),
        leaveWrap: document.getElementById("leave-team-wrap"), leaveTeam: document.getElementById("leave-team"),
        deleteTeamWrap: document.getElementById("delete-team-wrap"), deleteTeam: document.getElementById("delete-team"),
        teamActionsStatus: document.getElementById("team-actions-status"), signout: document.getElementById("team-signout"),
        codeModal: document.getElementById("admin-code-modal"), codeMessage: document.getElementById("admin-code-message"),
        code: document.getElementById("admin-invite-code"), copyCode: document.getElementById("copy-admin-code"),
        copyCodeLabel: document.getElementById("copy-admin-code-label"), closeCode: document.getElementById("close-admin-code"),
        secretModal: document.getElementById("secret-modal"), secretModalKicker: document.getElementById("secret-modal-kicker"),
        secretModalTitle: document.getElementById("secret-modal-title"), secretModalMessage: document.getElementById("secret-modal-message"),
        secretOtpForm: document.getElementById("secret-otp-form"), secretOtp: document.getElementById("secret-otp"),
        secretOtpSubmit: document.getElementById("secret-otp-submit"), secretModalStatus: document.getElementById("secret-modal-status"),
        secretReveal: document.getElementById("secret-reveal"), revealedSecret: document.getElementById("revealed-team-secret"),
        revealSecret: document.getElementById("reveal-team-secret"), copySecret: document.getElementById("copy-team-secret"),
        secretCopyStatus: document.getElementById("secret-copy-status"), apiModal: document.getElementById("api-access-modal"),
        apiAccessTitle: document.getElementById("api-access-title"), apiAccessForm: document.getElementById("api-access-form"),
        apiAccessUsers: document.getElementById("api-access-users"), apiAccessSubmit: document.getElementById("api-access-submit"),
        apiAccessStatus: document.getElementById("api-access-status"), actionModal: document.getElementById("action-modal"),
        actionTitle: document.getElementById("action-modal-title"), actionMessage: document.getElementById("action-modal-message"),
        actionConfirmStage: document.getElementById("action-confirm-stage"), actionContinue: document.getElementById("action-continue"),
        actionOtpForm: document.getElementById("action-otp-form"), actionOtp: document.getElementById("action-otp"),
        actionOtpSubmit: document.getElementById("action-otp-submit"), actionStatus: document.getElementById("action-modal-status"),
        permissionModal: document.getElementById("permission-modal"), permissionMessage: document.getElementById("permission-modal-message"),
        permissionForm: document.getElementById("permission-form"), permissionDelete: document.getElementById("permission-delete-secrets"),
        permissionRemove: document.getElementById("permission-remove-members"), permissionStatus: document.getElementById("permission-modal-status")
    };
    elements.refreshButtons = Array.from(document.querySelectorAll("[data-refresh-section]"));
    var accessShell = document.querySelector(".login-shell");
    var dashboardView = document.getElementById("team-dashboard-view");
    var personalVaultLink = document.getElementById("team-personal-vault");

    function initials(username) {
        if (!username) { return "?"; }
        var pieces = username.split(/[._@]+/).filter(Boolean);
        return (pieces.length > 1 ? pieces[0][0] + pieces[1][0] : username.slice(0, 2)).toUpperCase();
    }

    function setStatus(element, message, type) {
        if (!element) { return; }
        var modal = element.classList.contains("modal-status");
        element.textContent = message || "";
        element.className = "form-status" + (modal ? " modal-status" : "") + (type ? " is-" + type : "");
    }

    function setButtonBusy(button, busy, busyLabel, readyLabel) {
        if (!button) { return; }
        button.disabled = busy;
        var label = button.querySelector("span:first-child");
        if (label) { label.textContent = busy ? busyLabel : readyLabel; }
        else { button.textContent = busy ? busyLabel : readyLabel; }
    }

    function basePayload(includeRequestId) {
        var payload = { username: credentials.username, session_id: credentials.sessionId, teamname: credentials.teamname };
        if (includeRequestId) { payload.request_id = session.makeRequestId(); }
        return payload;
    }

    function payloadWith(extra, includeRequestId) { return Object.assign(basePayload(includeRequestId), extra || {}); }

    function throwForError(data) {
        if (data && data.ERROR) { throw new Error(data.ERROR); }
        if (typeof data === "string") { throw new Error(data); }
        return data;
    }

    function shouldReturnToLogin(message) {
        var normalized = String(message || "").toLowerCase();
        return session.isSessionExpired(message) || normalized.includes("team not found or access denied");
    }

    function handleFlowError(error, statusElement, fallback) {
        var message = error && error.message ? error.message : fallback;
        if (shouldReturnToLogin(message)) {
            session.redirectToLogin("Your team session is no longer valid. Log in again to continue.");
            return true;
        }
        setStatus(statusElement, message || fallback, "error");
        return false;
    }

    function showDashboardMessage(message, type) {
        elements.dashboardAlert.textContent = message;
        elements.dashboardAlert.className = "dashboard-alert" + (type === "success" ? " is-success" : "");
        elements.dashboardAlert.hidden = false;
    }

    function makeRoleTag(role) {
        var tag = document.createElement("span");
        tag.className = "role-tag role-" + role.toLowerCase();
        tag.textContent = role;
        return tag;
    }

    function normalizePermissions(data) {
        var source = data && data.permissions && typeof data.permissions === "object" ? data.permissions : data || {};
        state.permissions.canDeleteSecrets = state.role === "OWNER" || source.can_delete_secrets === true;
        state.permissions.canRemoveMembers = state.role === "OWNER" || source.can_remove_members === true;
        state.adminPermissions = {};
        if (data && Array.isArray(data.admin_permissions)) {
            data.admin_permissions.forEach(function (entry) { if (entry && entry.username) { state.adminPermissions[entry.username] = entry; } });
        } else if (data && data.admin_permissions && typeof data.admin_permissions === "object") {
            state.adminPermissions = data.admin_permissions;
        }
    }

    function participantEntries(data) {
        var entries = [{ username: data.owner, role: "Owner" }]
            .concat(state.admins.map(function (username) { return { username: username, role: "Admin" }; }))
            .concat(state.members.map(function (username) { return { username: username, role: "Member" }; }));
        var seen = new Set();
        return entries.filter(function (entry) {
            if (typeof entry.username !== "string" || !usernamePattern.test(entry.username) || seen.has(entry.username)) { return false; }
            seen.add(entry.username);
            return true;
        });
    }

    function renderRoleUI() {
        var isOwner = state.role === "OWNER";
        var canStore = isOwner || state.role === "ADMIN";
        document.querySelectorAll("[data-owner-admin]").forEach(function (item) { item.hidden = !canStore; });
        document.querySelectorAll("[data-role-owner]").forEach(function (item) { item.hidden = !isOwner; });
        elements.leaveWrap.hidden = isOwner;
        elements.deleteTeamWrap.hidden = !isOwner;
        elements.currentRole.textContent = state.role || "Role";
        elements.currentRole.className = "role-tag role-" + String(state.role || "member").toLowerCase();
    }

    function makeMemberPicker(container, namePrefix) {
        container.replaceChildren();
        state.participants.forEach(function (participant, index) {
            var label = document.createElement("label");
            var input = document.createElement("input");
            var copy = document.createElement("span");
            var strong = document.createElement("strong");
            var small = document.createElement("small");
            input.type = "checkbox";
            input.name = namePrefix;
            input.value = participant.username;
            input.id = namePrefix + "-" + index;
            strong.textContent = participant.username;
            small.textContent = participant.role;
            copy.append(strong, small);
            label.className = "member-check";
            label.append(input, copy);
            container.appendChild(label);
        });
        if (!state.participants.length) {
            var empty = document.createElement("p");
            empty.className = "secret-empty";
            empty.textContent = "No valid team participants were returned.";
            container.appendChild(empty);
        }
    }

    function selectedUsers(container) {
        return Array.from(container.querySelectorAll("input[type='checkbox']:checked")).map(function (input) { return input.value; });
    }

    function makeSecretRow(secret, category) {
        var row = document.createElement("article");
        var identity = document.createElement("div");
        var icon = document.createElement("span");
        var copy = document.createElement("span");
        var name = document.createElement("strong");
        var detail = document.createElement("small");
        var actions = document.createElement("div");
        var retrieve = document.createElement("button");
        row.className = "secret-row";
        identity.className = "secret-identity";
        icon.className = "secret-kind";
        icon.textContent = category === "API" ? "API" : "PW";
        name.textContent = secret.name || "Unnamed secret";
        detail.textContent = category === "API" ? "2FA required" : (secret.service_name || "Unknown service");
        copy.append(name, detail);
        identity.append(icon, copy);
        actions.className = "secret-actions";
        retrieve.type = "button";
        retrieve.className = "secondary-action compact-action";
        retrieve.textContent = "Retrieve";
        retrieve.addEventListener("click", function () { retrieveSecret(secret, category, retrieve); });
        actions.appendChild(retrieve);
        if (category === "API" && (state.role === "OWNER" || state.role === "ADMIN")) {
            var manage = document.createElement("button");
            manage.type = "button";
            manage.className = "secondary-action compact-action";
            manage.textContent = "Manage access";
            manage.addEventListener("click", function () { openApiAccess(secret, manage); });
            actions.appendChild(manage);
        }
        if (state.permissions.canDeleteSecrets) {
            var remove = document.createElement("button");
            remove.type = "button";
            remove.className = "text-danger-action";
            remove.textContent = "Delete";
            remove.addEventListener("click", function () { confirmDeleteSecret(secret, remove); });
            actions.appendChild(remove);
        }
        row.append(identity, actions);
        return row;
    }

    function renderSecrets() {
        elements.passwordList.replaceChildren();
        elements.apiList.replaceChildren();
        if (!state.passwords.length) {
            var passwordEmpty = document.createElement("div");
            passwordEmpty.className = "secret-empty";
            passwordEmpty.textContent = "No accessible team passwords.";
            elements.passwordList.appendChild(passwordEmpty);
        } else { state.passwords.forEach(function (secret) { elements.passwordList.appendChild(makeSecretRow(secret, "PASSWORD")); }); }
        if (!state.apis.length) {
            var apiEmpty = document.createElement("div");
            apiEmpty.className = "secret-empty";
            apiEmpty.textContent = "No accessible API keys.";
            elements.apiList.appendChild(apiEmpty);
        } else { state.apis.forEach(function (secret) { elements.apiList.appendChild(makeSecretRow(secret, "API")); }); }
        elements.passwordCount.textContent = state.passwords.length + (state.passwords.length === 1 ? " password" : " passwords");
    }

    function makeRosterRow(entry, index) {
        var row = document.createElement("tr");
        var userCell = document.createElement("td");
        var userWrap = document.createElement("div");
        var avatar = document.createElement("span");
        var identity = document.createElement("span");
        var displayName = document.createElement("strong");
        var reference = document.createElement("small");
        var roleCell = document.createElement("td");
        var accessCell = document.createElement("td");
        var actions = document.createElement("div");
        userWrap.className = "roster-user";
        avatar.className = "member-avatar";
        avatar.textContent = initials(entry.username);
        displayName.textContent = entry.username;
        reference.textContent = entry.role === "Owner" ? "Workspace owner" : "Team identity " + String(index).padStart(2, "0");
        identity.append(displayName, reference);
        userWrap.append(avatar, identity);
        userCell.appendChild(userWrap);
        roleCell.appendChild(makeRoleTag(entry.role));
        accessCell.className = "access-copy";
        actions.className = "roster-actions";
        if (state.role === "OWNER" && entry.role === "Admin") {
            var permissions = document.createElement("button");
            permissions.type = "button";
            permissions.className = "table-action";
            permissions.textContent = "Permissions";
            permissions.addEventListener("click", function () { openPermissionModal(entry.username, permissions); });
            actions.appendChild(permissions);
        }
        if (state.permissions.canRemoveMembers && entry.role !== "Owner" && entry.username !== credentials.username) {
            var remove = document.createElement("button");
            remove.type = "button";
            remove.className = "table-action is-danger";
            remove.textContent = "Remove";
            remove.addEventListener("click", function () { confirmRemoveMember(entry.username, remove); });
            actions.appendChild(remove);
        }
        if (!actions.children.length) { actions.textContent = entry.role === "Member" ? "Shared resources" : "Team management"; }
        accessCell.appendChild(actions);
        row.append(userCell, roleCell, accessCell);
        return row;
    }

    function renderRoster() {
        elements.rosterBody.replaceChildren();
        state.participants.forEach(function (entry, index) { elements.rosterBody.appendChild(makeRosterRow(entry, index + 1)); });
        if (!state.participants.length) { elements.rosterBody.innerHTML = "<tr class=\"roster-empty\"><td colspan=\"3\">No team roster was returned.</td></tr>"; }
        elements.rosterCount.textContent = state.participants.length + (state.participants.length === 1 ? " person" : " people");
        makeMemberPicker(elements.storeApiUserList, "store-api-user");
        renderPermissionList();
    }

    function permissionSummary(permission) {
        var labels = [];
        if (permission.can_delete_secrets) { labels.push("Delete secrets"); }
        if (permission.can_remove_members) { labels.push("Remove members"); }
        return labels.length ? labels.join(" · ") : "No destructive permissions";
    }

    function renderPermissionList() {
        elements.permissionList.replaceChildren();
        if (!state.admins.length) {
            var empty = document.createElement("div");
            empty.className = "secret-empty";
            empty.textContent = "No team admins to manage.";
            elements.permissionList.appendChild(empty);
            return;
        }
        state.admins.forEach(function (username) {
            var row = document.createElement("div");
            var copy = document.createElement("span");
            var strong = document.createElement("strong");
            var small = document.createElement("small");
            var button = document.createElement("button");
            var known = state.adminPermissions[username];
            strong.textContent = username;
            small.textContent = known ? permissionSummary(known) : "Current flags are not included in the dashboard response";
            copy.append(strong, small);
            button.type = "button";
            button.className = "secondary-action compact-action";
            button.textContent = "Set permissions";
            button.addEventListener("click", function () { openPermissionModal(username, button); });
            row.className = "permission-row";
            row.append(copy, button);
            elements.permissionList.appendChild(row);
        });
    }

    async function loadDashboard() {
        if (!session.credentialsAreValid(credentials) || !session.getTeamKey()) {
            session.redirectToLogin("A fresh team login is required to open this workspace.");
            return;
        }
        elements.dashboardAlert.hidden = true;
        try {
            var data = throwForError(await session.post("/coffre/team/dashboard", payloadWith({}, true)));
            if (!data || typeof data !== "object" || !["OWNER", "ADMIN", "MEMBER"].includes(data.role)) { throw new Error("The server returned an incomplete team dashboard."); }
            state.role = data.role;
            state.owner = data.owner || null;
            state.admins = Array.isArray(data.admins) ? data.admins.filter(function (name) { return typeof name === "string"; }) : [];
            state.members = Array.isArray(data.members) ? data.members.filter(function (name) { return typeof name === "string"; }) : [];
            state.passwords = Array.isArray(data.passwords) ? data.passwords : [];
            state.apis = Array.isArray(data.apis) ? data.apis : [];
            normalizePermissions(data);
            state.participants = participantEntries(data);
            elements.teamTitle.textContent = data.teamname || credentials.teamname;
            elements.currentName.textContent = credentials.username;
            elements.currentAvatar.textContent = initials(credentials.username);
            renderRoleUI();
            renderSecrets();
            renderRoster();
        } catch (error) {
            if (handleFlowError(error, null, "The team dashboard could not be loaded.")) { return; }
            elements.passwordList.innerHTML = "<div class=\"secret-empty\">Passwords unavailable.</div>";
            elements.apiList.innerHTML = "<div class=\"secret-empty\">API keys unavailable.</div>";
            elements.rosterBody.innerHTML = "<tr class=\"roster-empty\"><td colspan=\"3\">Roster unavailable.</td></tr>";
            elements.passwordCount.textContent = "Unavailable";
            elements.rosterCount.textContent = "Unavailable";
            showDashboardMessage(error.message || "The team dashboard could not be loaded.", "error");
        }
    }

    async function refreshDashboardSection(button) {
        if (button.disabled) { return; }
        var originalLabel = button.innerHTML;
        button.disabled = true;
        button.classList.add("is-refreshing");
        button.innerHTML = "<span aria-hidden=\"true\">↻</span> Refreshing";
        try {
            await loadDashboard();
        } finally {
            button.disabled = false;
            button.classList.remove("is-refreshing");
            button.innerHTML = originalLabel;
        }
    }

    function openDashboard(nextCredentials) {
        credentials = nextCredentials || session.getCredentials();
        if (accessShell) { accessShell.hidden = true; }
        dashboardView.hidden = false;
        personalVaultLink.hidden = true;
        elements.signout.hidden = false;
        document.body.classList.add("team-dashboard-active");
        elements.teamTitle.textContent = credentials.teamname || "Team workspace";
        elements.currentName.textContent = credentials.username || "Unknown user";
        elements.currentAvatar.textContent = initials(credentials.username);
        loadDashboard();
        window.scrollTo(0, 0);
    }

    function closeDashboard() {
        clearSensitiveUI();
        dashboardView.hidden = true;
        if (accessShell) { accessShell.hidden = false; }
        personalVaultLink.hidden = false;
        elements.signout.hidden = true;
        document.body.classList.remove("team-dashboard-active");
    }

    function setSecretCategory(category) {
        state.secretCategory = category;
        var isApi = category === "API";
        elements.storeModes.forEach(function (button) { button.classList.toggle("is-active", button.dataset.secretCategory === category); });
        elements.serviceNameField.hidden = isApi;
        elements.passwordOptions.hidden = isApi;
        elements.storeApiUsers.hidden = !isApi;
        elements.storeSecurityCopy.textContent = isApi ? "API keys always require 2FA and use an explicit allow-list." : "Passwords can optionally require 2FA.";
        if (isApi) { elements.memberCanView.checked = false; elements.passwordRequire2FA.checked = true; }
    }

    async function storeSecret(event) {
        event.preventDefault();
        var category = state.secretCategory;
        var secretName = elements.secretName.value.trim();
        var serviceName = elements.serviceName.value.trim();
        var plaintext = elements.secretValue.value;
        if (!secretNamePattern.test(secretName)) { setStatus(elements.storeStatus, "Use 1-64 letters, numbers, dots, @ or underscores for the secret name.", "error"); elements.secretName.focus(); return; }
        if (category === "PASSWORD" && !secretNamePattern.test(serviceName)) { setStatus(elements.storeStatus, "Enter a valid service name using letters, numbers, dots, @ or underscores.", "error"); elements.serviceName.focus(); return; }
        if (!plaintext) { setStatus(elements.storeStatus, "Enter the password or API value to encrypt.", "error"); elements.secretValue.focus(); return; }
        setButtonBusy(elements.storeSubmit, true, "Encrypting...", "Encrypt and store");
        setStatus(elements.storeStatus, "Encrypting the value on this device...");
        try {
            var encrypted = await session.encryptSecret(plaintext);
            plaintext = "";
            elements.secretValue.value = "";
            setButtonBusy(elements.storeSubmit, true, "Storing...", "Encrypt and store");
            var data = throwForError(await session.post("/coffre/team/store_secret", payloadWith({
                secret_name: secretName, service_name: category === "PASSWORD" ? serviceName : null, enc_data: encrypted, category: category,
                member_can_view: category === "PASSWORD" && elements.memberCanView.checked,
                require_2fa: category === "API" || elements.passwordRequire2FA.checked,
                selected_users: category === "API" ? selectedUsers(elements.storeApiUserList) : []
            }, true)));
            elements.storeForm.reset();
            setSecretCategory("PASSWORD");
            setStatus(elements.storeStatus, data.message || "Team secret stored successfully.", "success");
            await loadDashboard();
        } catch (error) {
            plaintext = "";
            handleFlowError(error, elements.storeStatus, "The team secret could not be stored.");
        } finally { setButtonBusy(elements.storeSubmit, false, "Encrypting...", "Encrypt and store"); }
    }

    function openSecretModal(secret, category) {
        closeSecretModal();
        state.pendingRetrieve = { id: secret.id, name: secret.name, category: category, requestId: null };
        elements.secretModalTitle.textContent = secret.name || "Protected value";
        elements.secretModalKicker.textContent = category === "API" ? "API key · 2FA required" : "Team password";
        elements.secretModalMessage.textContent = "Requesting protected access from Coffre…";
        elements.secretModal.hidden = false;
        document.body.classList.add("modal-open");
    }

    async function retrieveSecret(secret, category, trigger) {
        var token = ++state.retrievalToken;
        state.modalTrigger = trigger;
        openSecretModal(secret, category);
        token = state.retrievalToken;
        try {
            var data = throwForError(await session.post("/coffre/team/retrieve_secret", payloadWith({ secret_id: secret.id }, false)));
            if (token !== state.retrievalToken || elements.secretModal.hidden) { return; }
            if (data.otp_required) {
                if (!/^[a-fA-F0-9]{32}$/.test(data.request_id || "")) { throw new Error("The server returned an incomplete OTP challenge."); }
                state.pendingRetrieve.requestId = data.request_id;
                elements.secretModalMessage.textContent = data.otp_method === "totp" ? "Enter the code from your authenticator app." : "Enter the OTP sent to your email.";
                elements.secretOtpForm.hidden = false;
                elements.secretOtp.focus();
                return;
            }
            await revealEncryptedSecret(data.enc_data, token);
        } catch (error) {
            if (handleFlowError(error, elements.secretModalStatus, "The secret could not be retrieved.")) { return; }
            elements.secretModalMessage.textContent = "Coffre did not release this protected value.";
        }
    }

    async function submitSecretOtp(event) {
        event.preventDefault();
        var pending = state.pendingRetrieve;
        var otp = elements.secretOtp.value.trim().toUpperCase();
        if (!pending || !pending.requestId) { setStatus(elements.secretModalStatus, "This OTP challenge is no longer available.", "error"); return; }
        if (!/^[0-9A-Z]{1,6}$/.test(otp)) { setStatus(elements.secretModalStatus, "Enter the OTP issued by Coffre.", "error"); elements.secretOtp.focus(); return; }
        elements.secretOtpSubmit.disabled = true;
        elements.secretOtpSubmit.textContent = "Verifying…";
        try {
            var data = throwForError(await session.post("/coffre/team/retrieve_secret2", payloadWith({ secret_id: pending.id, otp: otp, request_id: pending.requestId }, false)));
            elements.secretOtp.value = "";
            pending.requestId = null;
            await revealEncryptedSecret(data.enc_data, state.retrievalToken);
        } catch (error) { handleFlowError(error, elements.secretModalStatus, "The OTP could not be verified."); }
        finally { elements.secretOtpSubmit.disabled = false; elements.secretOtpSubmit.textContent = "Verify and decrypt"; }
    }

    async function revealEncryptedSecret(encData, token) {
        setStatus(elements.secretModalStatus, "Decrypting on this device...");
        var plaintext = await session.decryptSecret(encData);
        if (token !== state.retrievalToken || elements.secretModal.hidden) { plaintext = ""; return; }
        elements.revealedSecret.value = plaintext;
        plaintext = "";
        elements.revealedSecret.type = "password";
        elements.revealSecret.textContent = "Show";
        elements.secretOtpForm.hidden = true;
        elements.secretReveal.hidden = false;
        elements.secretModalMessage.textContent = "The value was decrypted locally. Close this dialog when finished.";
        setStatus(elements.secretModalStatus, "");
        elements.copySecret.focus();
    }

    function closeSecretModal() {
        state.retrievalToken += 1;
        state.pendingRetrieve = null;
        elements.secretOtp.value = "";
        elements.revealedSecret.value = "";
        elements.revealedSecret.type = "password";
        elements.revealSecret.textContent = "Show";
        elements.secretOtpForm.hidden = true;
        elements.secretReveal.hidden = true;
        setStatus(elements.secretModalStatus, "");
        setStatus(elements.secretCopyStatus, "");
        elements.secretModal.hidden = true;
        syncModalBodyState();
    }

    async function copyRevealedSecret() {
        if (!elements.revealedSecret.value) { return; }
        try { await window.navigator.clipboard.writeText(elements.revealedSecret.value); setStatus(elements.secretCopyStatus, "Copied. Clear your clipboard when you are finished.", "success"); }
        catch (error) { setStatus(elements.secretCopyStatus, "Clipboard access was denied. Select and copy the value manually.", "error"); }
    }

    function openApiAccess(secret, trigger) {
        state.currentApi = secret;
        state.modalTrigger = trigger;
        elements.apiAccessTitle.textContent = "Add access to " + (secret.name || "API key");
        makeMemberPicker(elements.apiAccessUsers, "api-access-user");
        setStatus(elements.apiAccessStatus, "");
        elements.apiModal.hidden = false;
        document.body.classList.add("modal-open");
        var first = elements.apiAccessUsers.querySelector("input");
        if (first) { first.focus(); }
    }

    function closeApiAccess() {
        state.currentApi = null;
        elements.apiAccessUsers.replaceChildren();
        setStatus(elements.apiAccessStatus, "");
        elements.apiModal.hidden = true;
        syncModalBodyState();
    }

    async function submitApiAccess(event) {
        event.preventDefault();
        var users = selectedUsers(elements.apiAccessUsers);
        if (!state.currentApi || !users.length) { setStatus(elements.apiAccessStatus, "Select at least one current team participant.", "error"); return; }
        elements.apiAccessSubmit.disabled = true;
        elements.apiAccessSubmit.textContent = "Updating…";
        try {
            var data = throwForError(await session.post("/coffre/team/api_secret/add_users", payloadWith({ secret_id: state.currentApi.id, users: users }, true)));
            var duplicateCopy = data.already_allowed ? " " + data.already_allowed + " already had access." : "";
            setStatus(elements.apiAccessStatus, (data.message || "API access updated.") + duplicateCopy, "success");
            elements.apiAccessUsers.querySelectorAll("input").forEach(function (input) { input.checked = false; });
        } catch (error) { handleFlowError(error, elements.apiAccessStatus, "API access could not be updated."); }
        finally { elements.apiAccessSubmit.disabled = false; elements.apiAccessSubmit.textContent = "Add selected users"; }
    }

    function openAction(config) {
        closeActionModal();
        state.pendingAction = Object.assign({ challenge: null, trigger: null }, config);
        state.modalTrigger = config.trigger || null;
        elements.actionTitle.textContent = config.title;
        elements.actionMessage.textContent = config.message;
        elements.actionContinue.textContent = config.continueLabel || "Continue";
        elements.actionConfirmStage.hidden = false;
        elements.actionOtpForm.hidden = true;
        elements.actionModal.hidden = false;
        document.body.classList.add("modal-open");
        elements.actionContinue.focus();
    }

    function closeActionModal() {
        state.pendingAction = null;
        elements.actionOtp.value = "";
        elements.actionConfirmStage.hidden = false;
        elements.actionOtpForm.hidden = true;
        setStatus(elements.actionStatus, "");
        elements.actionModal.hidden = true;
        elements.actionContinue.disabled = false;
        elements.actionOtpSubmit.disabled = false;
        elements.actionOtpSubmit.textContent = "Authorize action";
        syncModalBodyState();
    }

    async function beginAction() {
        var action = state.pendingAction;
        if (!action) { return; }
        elements.actionContinue.disabled = true;
        elements.actionContinue.textContent = "Starting…";
        setStatus(elements.actionStatus, "Starting a fresh authorization challenge...");
        try {
            if (action.directPath) {
                var directData = throwForError(await session.post(action.directPath, action.payload));
                state.pendingAction = null;
                closeActionModal();
                await action.onSuccess(directData);
                return;
            }
            var challenge = throwForError(await session.post(action.firstPath, action.payload));
            if (!/^[a-fA-F0-9]{64}$/.test(challenge.nonce || "") || !/^[a-fA-F0-9]{32}$/.test(challenge.request_id || "")) { throw new Error("The server returned an incomplete authorization challenge."); }
            var signature = await session.signNonce(challenge.nonce);
            if (state.pendingAction !== action) { return; }
            action.challenge = { requestId: challenge.request_id, signature: signature };
            elements.actionConfirmStage.hidden = true;
            elements.actionOtpForm.hidden = false;
            setStatus(elements.actionStatus, challenge.otp_method === "totp" ? "Enter your authenticator code." : "Enter the OTP sent to your email.");
            elements.actionOtp.focus();
        } catch (error) { handleFlowError(error, elements.actionStatus, "The protected action could not be started."); }
        finally {
            if (state.pendingAction === action) { elements.actionContinue.disabled = false; elements.actionContinue.textContent = action.continueLabel || "Continue"; }
        }
    }

    async function finishAction(event) {
        event.preventDefault();
        var action = state.pendingAction;
        var otp = elements.actionOtp.value.trim().toUpperCase();
        if (!action || !action.challenge) { setStatus(elements.actionStatus, "This authorization challenge is no longer available.", "error"); return; }
        if (!/^[0-9A-Z]{1,6}$/.test(otp)) { setStatus(elements.actionStatus, "Enter the OTP issued by Coffre.", "error"); elements.actionOtp.focus(); return; }
        elements.actionOtpSubmit.disabled = true;
        elements.actionOtpSubmit.textContent = "Authorizing…";
        try {
            var finalPayload = Object.assign({}, action.payload, { signature: action.challenge.signature, otp: otp, request_id: action.challenge.requestId });
            var data = throwForError(await session.post(action.secondPath, finalPayload));
            state.pendingAction = null;
            closeActionModal();
            await action.onSuccess(data);
        } catch (error) {
            var message = error.message || "The protected action could not be completed.";
            handleFlowError(error, elements.actionStatus, "The protected action could not be completed.");
            if (/challenge expired|invalid authorization challenge|invalid signature|otp expired/i.test(message) && state.pendingAction === action) {
                action.challenge = null;
                elements.actionOtp.value = "";
                elements.actionOtpForm.hidden = true;
                elements.actionConfirmStage.hidden = false;
                elements.actionMessage.textContent = action.message + " Start a new challenge to try again.";
            }
        } finally { elements.actionOtpSubmit.disabled = false; elements.actionOtpSubmit.textContent = "Authorize action"; }
    }

    function confirmDeleteSecret(secret, trigger) {
        openAction({ title: "Delete " + (secret.name || "team secret"), message: "This permanently removes the protected entry for everyone in the team.", continueLabel: "Start deletion",
            firstPath: "/coffre/team/delete_secret", secondPath: "/coffre/team/delete_secret2", payload: payloadWith({ secret_id: secret.id }, false), trigger: trigger,
            onSuccess: async function (data) { await loadDashboard(); showDashboardMessage(data.message || "Team secret deleted successfully.", "success"); } });
    }

    function confirmRemoveMember(username, trigger) {
        openAction({ title: "Remove " + username, message: "This removes the user from the team and revokes their API allow-list entries.", continueLabel: "Start removal",
            firstPath: "/coffre/team/remove_member", secondPath: "/coffre/team/remove_member2", payload: payloadWith({ target_username: username }, false), trigger: trigger,
            onSuccess: async function (data) { await loadDashboard(); showDashboardMessage(data.message || "Team user removed successfully.", "success"); } });
    }

    function openPermissionModal(username, trigger) {
        var known = state.adminPermissions[username];
        state.permissionAdmin = username;
        state.modalTrigger = trigger;
        elements.permissionDelete.checked = Boolean(known && known.can_delete_secrets);
        elements.permissionRemove.checked = Boolean(known && known.can_remove_members);
        elements.permissionMessage.textContent = known ? "Choose the complete destructive permission state for " + username + "." : "The dashboard does not expose current flags for " + username + ". Choose the complete state you want to save.";
        setStatus(elements.permissionStatus, "");
        elements.permissionModal.hidden = false;
        document.body.classList.add("modal-open");
        elements.permissionDelete.focus();
    }

    function closePermissionModal() {
        state.permissionAdmin = null;
        elements.permissionDelete.checked = false;
        elements.permissionRemove.checked = false;
        setStatus(elements.permissionStatus, "");
        elements.permissionModal.hidden = true;
        syncModalBodyState();
    }

    function submitPermissionState(event) {
        event.preventDefault();
        var admin = state.permissionAdmin;
        if (!admin) { return; }
        var canDelete = elements.permissionDelete.checked;
        var canRemove = elements.permissionRemove.checked;
        closePermissionModal();
        openAction({ title: "Update " + admin, message: "Save this complete admin permission state: delete secrets " + (canDelete ? "on" : "off") + ", remove members " + (canRemove ? "on" : "off") + ".", continueLabel: "Start permission change",
            firstPath: "/coffre/team/admin_permissions", secondPath: "/coffre/team/admin_permissions2",
            payload: payloadWith({ admin_username: admin, can_delete_secrets: canDelete, can_remove_members: canRemove }, false),
            onSuccess: async function (data) { await loadDashboard(); showDashboardMessage(data.message || "Admin permissions updated.", "success"); } });
    }

    function confirmLeaveTeam() {
        openAction({ title: "Leave " + credentials.teamname, message: "Your team access and API allow-list entries will be removed. This does not delete the team.", continueLabel: "Leave team",
            directPath: "/coffre/team/resign", payload: payloadWith({}, true), trigger: elements.leaveTeam,
            onSuccess: async function () { session.clearCredentials(); closeDashboard(); window.CoffreTeamAccess.showChoice(); } });
    }

    function confirmDeleteTeam() {
        openAction({ title: "Delete " + credentials.teamname, message: "This permanently deletes the team, every shared secret, permissions, invitations, and participant sessions.", continueLabel: "Start team deletion",
            firstPath: "/coffre/team/delete_team", secondPath: "/coffre/team/delete_team2", payload: payloadWith({}, false), trigger: elements.deleteTeam,
            onSuccess: async function () { session.clearCredentials(); closeDashboard(); window.CoffreTeamAccess.showChoice(); } });
    }

    function clearRowError(row) {
        var input = row.querySelector("[data-invite-username]");
        row.querySelector("[data-row-error]").textContent = "";
        input.removeAttribute("aria-invalid");
    }

    function setRowError(row, message) {
        var input = row.querySelector("[data-invite-username]");
        row.querySelector("[data-row-error]").textContent = message;
        input.setAttribute("aria-invalid", "true");
    }

    function updateFilledCount() {
        elements.inviteFilledCount.textContent = elements.inviteRows.filter(function (row) { return row.querySelector("[data-invite-username]").value.trim(); }).length;
    }

    function collectInvites() {
        return elements.inviteRows.map(function (row) { return { row: row, username: row.querySelector("[data-invite-username]").value.trim(), role: row.querySelector("[data-invite-role]").value }; }).filter(function (invite) { return invite.username; });
    }

    function validateInvites(invites) {
        var valid = true;
        var byUsername = new Map();
        elements.inviteRows.forEach(clearRowError);
        if (!invites.length) { setRowError(elements.inviteRows[0], "Enter at least one username."); return false; }
        invites.forEach(function (invite) {
            if (!usernamePattern.test(invite.username)) { setRowError(invite.row, "Use 1-32 letters, numbers, @, dots or underscores."); valid = false; }
            if (byUsername.has(invite.username)) { setRowError(invite.row, "This username is listed more than once."); setRowError(byUsername.get(invite.username).row, "This username is listed more than once."); valid = false; }
            else { byUsername.set(invite.username, invite); }
            if (invite.role === "admin" && state.members.indexOf(invite.username) === -1) { setRowError(invite.row, invite.username + " must already be a team member before becoming admin."); valid = false; }
        });
        return valid;
    }

    function generateAdminCode() {
        var alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
        var bytes = window.crypto.getRandomValues(new Uint8Array(16));
        return Array.from(bytes, function (byte) { return alphabet[byte % alphabet.length]; }).join("").match(/.{1,4}/g).join("-");
    }

    function openCodeModal(code, admins) {
        state.pendingCode = code;
        elements.code.textContent = code;
        elements.copyCodeLabel.textContent = "Copy";
        elements.codeMessage.textContent = "Share this code with " + admins.join(", ") + " through a channel you trust. They need it to accept the admin invitation.";
        elements.codeModal.hidden = false;
        document.body.classList.add("modal-open");
        elements.copyCode.focus();
    }

    function closeCodeModal() {
        state.pendingCode = null;
        elements.code.textContent = "";
        elements.codeModal.hidden = true;
        syncModalBodyState();
    }

    async function copyAdminCode() {
        if (!state.pendingCode) { return; }
        try { await window.navigator.clipboard.writeText(state.pendingCode); elements.copyCodeLabel.textContent = "Copied"; }
        catch (error) { elements.copyCodeLabel.textContent = "Copy denied"; }
    }

    async function submitInvites(event) {
        event.preventDefault();
        var inviteEntries = collectInvites();
        setStatus(elements.inviteStatus, "");
        if (!validateInvites(inviteEntries)) { return; }
        var members = inviteEntries.filter(function (item) { return item.role === "member"; }).map(function (item) { return item.username; });
        var admins = inviteEntries.filter(function (item) { return item.role === "admin"; }).map(function (item) { return item.username; });
        var code = admins.length ? generateAdminCode() : null;
        setButtonBusy(elements.inviteSubmit, true, "Sending...", "Send invitations");
        try {
            var data = throwForError(await session.post("/coffre/team/addmem", payloadWith({ members: members, admin: admins, code: code }, true)));
            elements.inviteForm.reset();
            elements.inviteRows.forEach(clearRowError);
            updateFilledCount();
            setStatus(elements.inviteStatus, data.message || "Invitations sent successfully.", "success");
            if (code) { openCodeModal(code, admins); }
        } catch (error) { handleFlowError(error, elements.inviteStatus, "Invitations could not be sent."); }
        finally { setButtonBusy(elements.inviteSubmit, false, "Sending...", "Send invitations"); }
    }

    function syncModalBodyState() {
        var openModal = Array.from(document.querySelectorAll(".code-modal")).some(function (modal) { return !modal.hidden; });
        document.body.classList.toggle("modal-open", openModal);
    }

    function clearSensitiveUI() {
        state.retrievalToken += 1;
        state.pendingRetrieve = null;
        state.currentApi = null;
        state.pendingAction = null;
        state.permissionAdmin = null;
        state.pendingCode = null;
        elements.secretValue.value = "";
        elements.secretOtp.value = "";
        elements.actionOtp.value = "";
        elements.revealedSecret.value = "";
        elements.code.textContent = "";
        document.querySelectorAll(".code-modal").forEach(function (modal) { modal.hidden = true; });
        document.body.classList.remove("modal-open");
    }

    elements.storeModes.forEach(function (button) { button.addEventListener("click", function () { setSecretCategory(button.dataset.secretCategory); }); });
    elements.refreshButtons.forEach(function (button) { button.addEventListener("click", function () { refreshDashboardSection(button); }); });
    elements.storeForm.addEventListener("submit", storeSecret);
    elements.secretOtpForm.addEventListener("submit", submitSecretOtp);
    elements.secretOtp.addEventListener("input", function () { elements.secretOtp.value = elements.secretOtp.value.toUpperCase(); });
    elements.revealSecret.addEventListener("click", function () { var reveal = elements.revealedSecret.type === "password"; elements.revealedSecret.type = reveal ? "text" : "password"; elements.revealSecret.textContent = reveal ? "Hide" : "Show"; });
    elements.copySecret.addEventListener("click", copyRevealedSecret);
    document.querySelectorAll("[data-close-secret-modal]").forEach(function (button) { button.addEventListener("click", closeSecretModal); });
    elements.apiAccessForm.addEventListener("submit", submitApiAccess);
    document.querySelectorAll("[data-close-api-modal]").forEach(function (button) { button.addEventListener("click", closeApiAccess); });
    elements.actionContinue.addEventListener("click", beginAction);
    elements.actionOtpForm.addEventListener("submit", finishAction);
    elements.actionOtp.addEventListener("input", function () { elements.actionOtp.value = elements.actionOtp.value.toUpperCase(); });
    document.querySelectorAll("[data-close-action-modal]").forEach(function (button) { button.addEventListener("click", closeActionModal); });
    elements.permissionForm.addEventListener("submit", submitPermissionState);
    document.querySelectorAll("[data-close-permission-modal]").forEach(function (button) { button.addEventListener("click", closePermissionModal); });
    elements.leaveTeam.addEventListener("click", confirmLeaveTeam);
    elements.deleteTeam.addEventListener("click", confirmDeleteTeam);
    elements.inviteForm.addEventListener("submit", submitInvites);
    elements.inviteRows.forEach(function (row) {
        row.querySelector("[data-invite-username]").addEventListener("input", function () { clearRowError(row); updateFilledCount(); });
        row.querySelector("[data-invite-role]").addEventListener("change", function () { clearRowError(row); });
    });
    elements.copyCode.addEventListener("click", copyAdminCode);
    elements.closeCode.addEventListener("click", closeCodeModal);
    elements.signout.addEventListener("click", function () {
        session.clearCredentials();
        closeDashboard();
        if (window.CoffreTeamAccess) { window.CoffreTeamAccess.showChoice(); }
        else { window.location.replace("team.html"); }
    });
    window.addEventListener("coffre-team-cleared", clearSensitiveUI);
    window.addEventListener("beforeunload", clearSensitiveUI);
    document.addEventListener("keydown", function (event) {
        if (event.key !== "Escape") { return; }
        if (!elements.secretModal.hidden) { closeSecretModal(); }
        else if (!elements.apiModal.hidden) { closeApiAccess(); }
        else if (!elements.permissionModal.hidden) { closePermissionModal(); }
        else if (!elements.actionModal.hidden) { closeActionModal(); }
        else if (!elements.codeModal.hidden) { closeCodeModal(); }
    });

    setSecretCategory("PASSWORD");
    window.CoffreTeamDashboard = { open: openDashboard, close: closeDashboard, reload: loadDashboard };
}(window, document));
