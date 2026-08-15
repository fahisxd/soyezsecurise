const notLoggedInDiv = document.getElementById("profile-not-logged-in")
const loggedInDiv = document.getElementById("profile-logged-in")
const usernameSpan = document.getElementById("usernameP")
const profileStatusMsg = document.getElementById("profile-status-msg")
const profilePasswordCount = document.getElementById("profile-password-count")
const profileLastModified = document.getElementById("profile-last-modified")
const twoFAStatus = document.getElementById("2fa-status")
const profileEmail = document.getElementById("profile-email")
const profileLogoutBtn = document.getElementById("profile-logout-btn")
const deleteAccountForm = document.getElementById("delete-account-form")
const deleteAccountUnderstand = document.getElementById("delete-account-understand")
const deleteAccountUsername = document.getElementById("delete-account-username")
const deleteAccountPhrase = document.getElementById("delete-account-phrase")
const deleteAccountBtn = document.getElementById("delete-account-btn")
const deleteAccountStatus = document.getElementById("status-delete-account")
let profileRequestVersion = 0
const DELETE_ACCOUNT_PHRASE = "DELETE MY ACCOUNT"

function updateProfileDisplay() {
    const username = localStorage.getItem("username")
    const userLoggedIn = hasActiveSession()
    
    if (!username || !userLoggedIn) {
        profileRequestVersion++
        notLoggedInDiv.style.display = "block"
        loggedInDiv.style.display = "none"
        return
    }
    

    notLoggedInDiv.style.display = "none"
    loggedInDiv.style.display = "block"
    usernameSpan.innerText = username
    resetDeleteAccountConfirmation()

    loadProfileStatus(username)
}

async function loadProfileStatus(username) {
    const requestVersion = ++profileRequestVersion
    try {
        setProfileStatus("Loading profile status...")
        const authkey = localStorage.getItem("authkey")
        
        if (!authkey) {
            setProfileStatus("Error: Authentication key not found", true)
            return
        }
        
        let response = await fetch(`${server_link}/coffre/profile/status`, {
            method: "POST",
            headers: {
                "Content-Type": "application/json"
            },
            body: JSON.stringify(withSession({
                username: username
            }))
        })
        
        let data = await response.json()
        
        if (data.ERROR) {
            handleProfileError(data.ERROR)
            return
        }
        
        if (!response.ok) {
            setProfileStatus("Error loading profile status", true)
            return
        }
        
        let nonce = data.nonce
        let requestid = data.request_id
        let signature = await generateSignature(nonce, authkey)
        
        let statusVerifyResponse = await fetch(`${server_link}/coffre/profile/status2`, {
            method: "POST",
            headers: {
                "Content-Type": "application/json"
            },
            body: JSON.stringify({
                signature: signature,
                username: username,
                session_id: getSessionId(),
                request_id: requestid
            })
        })
        
        let statusData = await statusVerifyResponse.json()

        if (requestVersion !== profileRequestVersion) {
            return
        }
        
        if (statusData.ERROR) {
            handleProfileError(statusData.ERROR)
            return
        }
        
        if (!statusVerifyResponse.ok) {
            setProfileStatus("Error loading profile status", true)
            return
        }

        renderProfileStatus(statusData)
        
    } catch (error) {
        setProfileStatus("Error loading profile status: " + error.message, true)
    }
}

function renderProfileStatus(profile) {
    usernameSpan.innerText = profile.username || localStorage.getItem("username") || ""

    if (profileEmail) {
        profileEmail.innerText = profile.gmail || "Not available"
    }

    if (twoFAStatus) {
        if (profile.otp_enabled) {
            twoFAStatus.innerText = profile.otp_method ? `Enabled (${profile.otp_method})` : "Enabled"
        } else {
            twoFAStatus.innerText = "Not enabled"
        }
    }

    profilePasswordCount.innerText = String(profile.stored_password_count || 0)
    profileLastModified.innerText = formatSessionTtl(profile.session_ttl)
    setProfileStatus("")
}

function formatSessionTtl(ttl) {
    const seconds = Number(ttl)
    if (!Number.isFinite(seconds) || seconds <= 0) {
        return "Expired"
    }

    const minutes = Math.ceil(seconds / 60)
    if (minutes === 1) {
        return "About 1 minute left"
    }
    return `About ${minutes} minutes left`
}

function handleProfileError(message) {
    setProfileStatus("Error: " + message, true)
    if (message === "Session expired, login again") {
        profileRequestVersion++
        clearSession()
        notLoggedInDiv.style.display = "block"
        loggedInDiv.style.display = "none"
    }
}

function setProfileStatus(message, isError) {
    profileStatusMsg.innerText = message
    profileStatusMsg.classList.toggle("status-error", !!isError)
}





profileLogoutBtn.addEventListener('click', function(e) {
    e.preventDefault()
    profileRequestVersion++
    clearSession()
    window.location.href = "#login"
    updateProfileDisplay()
})

function resetDeleteAccountConfirmation() {
    if (!deleteAccountForm) {
        return
    }

    deleteAccountForm.reset()
    setDeleteAccountStatus("")
    updateDeleteAccountButton()
}

function updateDeleteAccountButton() {
    if (!deleteAccountBtn) {
        return
    }

    const username = localStorage.getItem("username") || ""
    const typedUsername = deleteAccountUsername ? deleteAccountUsername.value.trim() : ""
    const typedPhrase = deleteAccountPhrase ? deleteAccountPhrase.value.trim() : ""
    const confirmed = !!(deleteAccountUnderstand && deleteAccountUnderstand.checked)

    deleteAccountBtn.disabled = !(confirmed && typedUsername === username && typedPhrase === DELETE_ACCOUNT_PHRASE)
}

function setDeleteAccountStatus(message, isError) {
    if (!deleteAccountStatus) {
        return
    }

    deleteAccountStatus.innerText = message
    deleteAccountStatus.classList.toggle("status-error", !!isError)
}

async function deleteAccountPermanently() {
    const username = localStorage.getItem("username")
    const authkey = localStorage.getItem("authkey")

    if (!username || !hasActiveSession()) {
        setDeleteAccountStatus("Session expired, login again", true)
        clearSession()
        updateProfileDisplay()
        return
    }

    if (!authkey) {
        setDeleteAccountStatus("Error: Authentication key not found", true)
        return
    }

    setDeleteAccountStatus("Requesting account deletion challenge...")
    deleteAccountBtn.disabled = true

    let response = await fetch(`${server_link}/coffre/acc-delete`, {
        method: "POST",
        headers: {
            "Content-Type": "application/json"
        },
        body: JSON.stringify(withSession({
            username: username
        }))
    })

    let data = await response.json()

    if (data.ERROR) {
        setDeleteAccountStatus(data.ERROR, true)
        updateDeleteAccountButton()
        return
    }

    if (!response.ok) {
        setDeleteAccountStatus("The server could not start account deletion. Please try again.", true)
        updateDeleteAccountButton()
        return
    }

    const signature = await generateSignature(data.nonce, authkey)
    setDeleteAccountStatus("Verifying account deletion...")

    let verifyResponse = await fetch(`${server_link}/coffre/acc-delete2`, {
        method: "POST",
        headers: {
            "Content-Type": "application/json"
        },
        body: JSON.stringify({
            signature: signature,
            username: username,
            session_id: getSessionId(),
            password_name: username,
            usernameS: username,
            request_id: data.request_id
        })
    })

    let verifyData = await verifyResponse.json()

    if (verifyData && verifyData.ERROR) {
        setDeleteAccountStatus(verifyData.ERROR, true)
        updateDeleteAccountButton()
        return
    }

    if (!verifyResponse.ok) {
        setDeleteAccountStatus("The account could not be deleted. Please try again.", true)
        updateDeleteAccountButton()
        return
    }

    profileRequestVersion++
    clearSession()
    setDeleteAccountStatus("Account deleted.")
    window.location.href = "#login"
    updateProfileDisplay()
}

if (deleteAccountForm) {
    deleteAccountForm.addEventListener("input", updateDeleteAccountButton)
    deleteAccountForm.addEventListener("submit", async function(e) {
        e.preventDefault()
        updateDeleteAccountButton()

        if (deleteAccountBtn.disabled) {
            setDeleteAccountStatus("Complete every confirmation field before deleting.", true)
            return
        }

        const confirmed = window.confirm("This permanently deletes your account and vault. Continue?")
        if (!confirmed) {
            setDeleteAccountStatus("Account deletion cancelled.")
            updateDeleteAccountButton()
            return
        }

        try {
            await deleteAccountPermanently()
        } catch (error) {
            setDeleteAccountStatus("Account deletion failed: " + error.message, true)
            updateDeleteAccountButton()
        }
    })
}


document.addEventListener('DOMContentLoaded', function() {
    updateProfileDisplay()
})


window.addEventListener('storage', function() {
    updateProfileDisplay()
})

window.addEventListener(AUTH_STATE_EVENT, function() {
    updateProfileDisplay()
})
