const login_username = document.getElementById("login-username")
const login_masterPassword = document.getElementById("login-password")
const loginPasswordField = document.getElementById("login-password-field")
const loginbtn = document.getElementById("loginbtn")
const login_statusmsg = document.getElementById("status-login")
const login_otp = document.getElementById("otp")
const loginOtpField = document.getElementById("login-otp-field")
const loginStepPanel = document.getElementById("login-step-panel")

let pendingLoginChallenge = null

document.addEventListener("DOMContentLoaded", function(){
    let savedUsername = localStorage.getItem("username")
    if(savedUsername && !login_username.value){
        login_username.value = savedUsername
    }
})

async function login_hasher(password, salt){
    let saltBytes = hexToBytes(salt)
    let passwordbytes = new TextEncoder().encode(password)
    let result = await argon2.hash({
        pass:passwordbytes,
        salt:saltBytes,
        time:4,
        mem:65536,
        parallelism:4,
        hashLen:32,
        type: argon2.ArgonType.Argon2id
    })

    return {
        result,
        saltBytes
    }
}

function showLoginSecretStep(){
    loginPasswordField.style.display = "block"
    loginOtpField.style.display = "block"
    login_username.readOnly = true
    loginbtn.value = "Login"
    if(loginStepPanel){
        loginStepPanel.classList.add("otp-active")
    }
    login_masterPassword.focus()
}

function completeLogin(usernameV, login_authkey1, sessionId){
    login_statusmsg.innerText = "Logged in successfully"
    setAuthenticatedSession(usernameV, bytesToHex(new Uint8Array(login_authkey1)), sessionId)
    window.location.href = "#"
}

document.getElementById("Login").addEventListener(
"submit",
async function(e){
    e.preventDefault()
    loginbtn.disabled = true

    if(!pendingLoginChallenge){
        login_statusmsg.innerText = "Requesting login challenge..."
        let usernameV = login_username.value

        let response = await fetch(`${server_link}/coffre/login`,
            {
                method:"POST",
                headers:{
                    "Content-Type":
                    "application/json"
                },
                body:JSON.stringify({
                    "username": usernameV
                })
            })

        let data = await response.json()

        if(data.ERROR){
            login_statusmsg.innerText = data.ERROR
            loginbtn.disabled = false
            return
        }

        if(!response.ok){
            login_statusmsg.innerText = "Request failed"
            loginbtn.disabled = false
            return
        }

        pendingLoginChallenge = {
            username: usernameV,
            nonce: data.nonce,
            salt: data.salt,
            requestid: data.request_id
        }

        showLoginSecretStep()
        login_statusmsg.innerText = "Challenge ready. Enter your master password and OTP code."
        loginbtn.disabled = false
        return
    }

    let masterpassV = login_masterPassword.value
    let otpV = login_otp.value.trim().toUpperCase()
    if(!masterpassV){
        login_statusmsg.innerText = "Enter your master password."
        loginbtn.disabled = false
        return
    }
    if(!otpV){
        login_statusmsg.innerText = "Enter your OTP code. For email OTP, use the code sent after the first step."
        loginbtn.disabled = false
        return
    }

    login_statusmsg.innerText = "Deriving keys..."
    let result = await login_hasher(masterpassV, pendingLoginChallenge.salt)
    let argonOutput = result.result.hash
    let key = await crypto.subtle.importKey(
        "raw",
        argonOutput,
        "HKDF",
        false,
        ["deriveBits"]
    )
    let login_authkey1 = await crypto.subtle.deriveBits(
        {
            name:"HKDF",
            hash:"SHA-256",
            salt: new Uint8Array(32),
            info: new TextEncoder().encode("Authentication/store/list")
        },
        key,
        256
    )

    window.vaultkey = await crypto.subtle.deriveBits(
        {
            name:"HKDF",
            hash:"SHA-256",
            salt: new Uint8Array(32),
            info: new TextEncoder().encode("EnCryPtiONKeY")
        },
        key,
        256
    )

    let signature = await generateSignature(pendingLoginChallenge.nonce, login_authkey1)
    login_statusmsg.innerText = "Verifying login..."

    let verifyResponse = await fetch(`${server_link}/coffre/login2`,
        {
            method:"POST",
            headers:{
                "Content-Type":
                "application/json"
            },
            body:JSON.stringify({
                "signature": signature,
                "username": pendingLoginChallenge.username,
                "otp": otpV,
                "request_id": pendingLoginChallenge.requestid
            })
        })
    let verifyData = await verifyResponse.json()

    if(verifyData.ERROR){
        login_statusmsg.innerText = verifyData.ERROR
        loginbtn.disabled = false
        return
    }

    if(!verifyResponse.ok){
        login_statusmsg.innerText = "Request failed"
        loginbtn.disabled = false
        return
    }

    // The backend names the returned bearer value `session_token`, while the
    // rest of the frontend stores and sends it as `session_id`.
    let returnedSessionId = verifyData.session_id || verifyData.session_token

    if(!returnedSessionId || !/^[a-fA-F0-9]{64}$/.test(returnedSessionId)){
        login_statusmsg.innerText = "Login succeeded but the server did not return a session. Please try again."
        loginbtn.disabled = false
        return
    }

    completeLogin(pendingLoginChallenge.username, login_authkey1, returnedSessionId)
    updateUserIcon();
    updateProfileDisplay()
})

login_otp.addEventListener("input", function(){
    login_otp.value = login_otp.value.toUpperCase()
})

document.getElementById("Login").addEventListener("reset", function(){
    pendingLoginChallenge = null
    loginPasswordField.style.display = "none"
    loginOtpField.style.display = "none"
    login_username.readOnly = false
    loginbtn.value = "Continue"
    loginbtn.disabled = false
    if(loginStepPanel){
        loginStepPanel.classList.remove("otp-active")
    }
    login_statusmsg.innerText = ""
})
