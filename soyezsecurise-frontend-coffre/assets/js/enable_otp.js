const otp_link = document.getElementById("otpenabling-link")
const otpSetupForm = document.getElementById("otp-status-form")
const otpMethod = document.getElementById("otp-method")
const otpMethodHint = document.getElementById("otp-method-hint")
const otpSelectedMethod = document.getElementById("otp-selected-method")
const otpEmailCode = document.getElementById("otp-email-code")
const otpStatus = document.getElementById("status-otp")
const otpStatusMessage = document.getElementById("otp-status-message")
const otpContinueBtn = document.getElementById("otp-continue-btn")
const otpResendBtn = document.getElementById("otp-resend-btn")
const otpSetupSteps = document.getElementById("otp-setup-steps")
const otpAccount = document.getElementById("otp-account")
const otpErrorMessage = document.getElementById("otp-error-message")
const otpCopyBtn = document.getElementById("otp-copy-btn")
const otpCopyStatus = document.getElementById("otp-copy-status")
const doneotpbtn = document.querySelector("#otp input.primary")

let otpChallenge = null
let setupInProgress = false

function warnUser(e){
    e.preventDefault()
    e.returnValue = true
}

function setSetupControls(enabled){
    otpMethod.disabled = !enabled
    otpContinueBtn.disabled = !enabled
    otpResendBtn.disabled = setupInProgress
}

function setSetupStep(step){
    if(!otpSetupSteps){
        return
    }
    let steps = otpSetupSteps.querySelectorAll("span")
    steps.forEach(function(item, index){
        item.classList.toggle("active", index === step)
    })
}

function updateMethodHint(){
    const selectedLabel = otpMethod.options[otpMethod.selectedIndex].text
    if(otpSelectedMethod){
        otpSelectedMethod.innerText = "Selected method: " + selectedLabel
    }

    if(otpMethod.value === "gmail"){
        otpMethodHint.innerText = "Use your email inbox for future login codes. No QR code is needed."
        otpContinueBtn.value = "Enable email OTP"
        return
    }

    otpMethodHint.innerText = "Use an authenticator app for stronger sign-in protection. You will save a QR code next."
    otpContinueBtn.value = "Enable authenticator"
}

async function copyotp(){
    let secret = document.getElementById("otp-secret")
    if(!secret.value){
        otpCopyStatus.innerText = "Secret is not ready yet."
        return
    }

    try {
        await navigator.clipboard.writeText(secret.value)
        otpCopyStatus.innerText = "Secret copied."
        otpCopyBtn.innerText = "Copied"
    }
    catch(error) {
        secret.type = "text"
        secret.select()
        otpCopyStatus.innerText = "Copy blocked. The key is selected so you can copy it manually."
    }
}

function showOtpError(message){
    otpErrorMessage.innerText = message || "We could not prepare OTP setup."
    otp_link.href = "#otp-error"
    window.location.href = "#otp-error"
}

function showOtpSuccess(message){
    document.getElementById("otp-success-message").innerText = message || "Your account protection method was enabled successfully."
    window.removeEventListener("beforeunload", warnUser)
    localStorage.setItem("userLoggedIn", "false")
    localStorage.removeItem("session_id")
    window.location.href = "#otp-success"
}

window.addEventListener("beforeunload", warnUser)

async function prepareOtpChallenge(){
    let otp_username = localStorage.getItem("username")
    let otp_key = localStorage.getItem("authkey")
    let session_id = getSessionId()

    if(!otp_username || !otp_key){
        showOtpError("Create your account again before enabling OTP.")
        return
    }

    otpChallenge = null
    setupInProgress = true
    setSetupStep(0)
    setSetupControls(false)
    otpStatus.innerText = "Preparing secure challenge..."
    otpStatusMessage.innerText = "Preparing a signed setup challenge for " + otp_username + "."
    otpResendBtn.disabled = true

    try {
        let response = await fetch(`${server_link}/coffre/enableotp`,
        {
            method:"POST",
            headers:{
                "Content-Type":
                "application/json"
            },
            body:JSON.stringify({
                "username": otp_username
            })
        })

        let data = await response.json()

        if(data.ERROR){
            if(data.ERROR == "otp Already enabled"){
                showOtpSuccess("OTP is already enabled for this account.")
                return
            }
            showOtpError(data.ERROR)
            return
        }

        if(response.status !== 200){
            showOtpError("The server could not start OTP setup. Please try again.")
            return
        }

        let signature = await generateSignature(data.nonce, otp_key)
        otpChallenge = {
            username: otp_username,
            session_id: session_id,
            signature: signature,
            request_id: data.request_id
        }
        otp_link.href = "#otp-status"
        setSetupStep(1)
        otpStatus.innerText = "Challenge ready. Choose a protection method."
        otpStatusMessage.innerText = "Choose how future logins should be protected. This request is tied to your new account setup."
        setupInProgress = false
        setSetupControls(true)
        otpMethod.focus()
    }
    catch(error) {
        showOtpError("OTP setup failed: " + error.message)
    }
    finally {
        setupInProgress = false
        otpResendBtn.disabled = false
    }
}

document.addEventListener("DOMContentLoaded", async function(){
    let otp_username = localStorage.getItem("username")
    if(otp_username && otpAccount){
        otpAccount.innerText = otp_username
    }

    window.location.href = "#otp-status"
    updateMethodHint()
    setSetupControls(false)
    await prepareOtpChallenge()
})

otpMethod.addEventListener("change", updateMethodHint)

otpResendBtn.addEventListener("click", async function(){
    otpStatus.innerText = "Restarting challenge..."
    await prepareOtpChallenge()
})

otpSetupForm.addEventListener("submit", async function(e){
    e.preventDefault()

    if(!otpChallenge){
        showOtpError("OTP setup is not ready yet. Please refresh and try again.")
        return
    }

    otpContinueBtn.disabled = true
    otpResendBtn.disabled = true
    setSetupStep(2)
    otpStatus.innerText = "Finishing OTP setup..."

    try {
        let verifyPayload = {
            "signature": otpChallenge.signature,
            "username": otpChallenge.username,
            "method": otpMethod.value,
            "request_id": otpChallenge.request_id
        }

        if(otpChallenge.session_id){
            verifyPayload.session_id = otpChallenge.session_id
        }

        let verifyResponse = await fetch(`${server_link}/coffre/enable_otp2`,
        {
            method:"POST",
            headers:{
                "Content-Type":
                "application/json"
            },
            body:JSON.stringify(verifyPayload)
        })
        let verifyData = await verifyResponse.json()

        if(verifyData.ERROR){
            otpStatus.innerText = verifyData.ERROR
            otpContinueBtn.disabled = false
            otpResendBtn.disabled = false
            setSetupStep(1)
            return
        }

        if(verifyResponse.status !== 200){
            otpStatus.innerText = "OTP setup could not be completed. Please try again."
            otpContinueBtn.disabled = false
            otpResendBtn.disabled = false
            setSetupStep(1)
            return
        }

        if(verifyData.qr && verifyData.secret_code){
            let qrimg = document.getElementById("qr")
            qrimg.src = "data:image/png;base64," + verifyData.qr
            document.getElementById("otp-secret").value = verifyData.secret_code
            otpCopyBtn.innerText = "Copy"
            otpCopyStatus.innerText = "Save this before returning to your vault."
            window.location.href = "#otp-scanner"
            return
        }

        showOtpSuccess(verifyData.message || "OTP enabled successfully.")
    }
    catch(error) {
        otpStatus.innerText = "OTP setup failed: " + error.message
        otpContinueBtn.disabled = false
        otpResendBtn.disabled = false
        setSetupStep(1)
    }
})

otpCopyBtn.addEventListener("click", copyotp)

document.getElementById("otp").addEventListener(
"submit",
async function(e){
    e.preventDefault()
    doneotpbtn.disabled = true
    window.removeEventListener("beforeunload", warnUser)
    localStorage.setItem("userLoggedIn", "false")
    localStorage.removeItem("session_id")
    window.location.href = "index.html#login"
})
