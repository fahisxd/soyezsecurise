const usernametobestored = document.getElementById("usernametobestored")

const storeservicename = document.getElementById("store-service-name")

const passwordtobestored = document.querySelector("#StorePassword input[name='password']")

const hinttobestored = document.getElementById("store-hint-input")

const storepasswordfunc = document.getElementById("storepassword")

const store_status = document.getElementById("status-store")

document.getElementById("storepassword").addEventListener("click",
function(e){
    e.preventDefault() 
    storepasswordfunc.href = hasActiveSession() && window.vaultkey ? "#store-password" : "#login"
    goToVaultRoute("#store-password")
})

document.getElementById("StorePassword").addEventListener("submit",
async function(e){
    e.preventDefault()
    if(!hasActiveSession() || !window.vaultkey){
        store_status.innerText = "Session expired, login again"
        goToLogin()
        return
    }

    store_status.innerText = "Encrypting..."
    let usernameS = usernametobestored.value
    let service_nameV = storeservicename.value
    let usernameV = localStorage.getItem("username")
    const passwordValue = passwordtobestored.value
    const hintValue = hinttobestored.value.trim()
    let keybytes = window.vaultkey
    let iv = crypto.getRandomValues(new Uint8Array(12))
    let key = await crypto.subtle.importKey(
        "raw",
        keybytes,
        {
            name:"AES-GCM"
        },
        false,
        ["encrypt"]

    )
    let encrypted = await crypto.subtle.encrypt(
        {
            name:"AES-GCM",

            iv:iv

        },
        key,
        new TextEncoder().encode(passwordValue)
    )

    let payload = new Uint8Array(iv.length + encrypted.byteLength)
    payload.set(iv)
    payload.set(new Uint8Array(encrypted),iv.length)
    const final = bytesToBase64(payload)
    store_status.innerText = "Requesting server challenge..."

    let response = await fetch(`${server_link}/coffre/storepassword`,
        {
            method:"POST",
            headers:{
                "Content-Type":
                "application/json"
            },
            body:JSON.stringify(withSession({
                "username": usernameV
            }))

        }

    )

    let data = await response.json()

    if(data.ERROR){

        store_status.innerText = data.ERROR
        return
    }

    else if(!response.ok){
        store_status.innerText = "The server could not start this request. Please try again."
        return
    }

    else{
        store_status.innerText = "Verifying"
        let authkey =  localStorage.getItem("authkey")
        
        store_status.innerText = "Generating Signature"
        let nonce = data.nonce
        let requestid = data.request_id
        let enc_data = final


        let signature = await generateSignature(nonce, authkey)
        store_status.innerText = "Requesting server"
        let storePayload = {
                "signature": signature,
                "username": usernameV,
                "session_id": getSessionId(),
                "password_name": service_nameV,
                "usernametbs": usernameS,
                "enc_data": enc_data,
                "request_id": requestid
            }
        storePayload.hint = hintValue ? textToBase64(hintValue) : "None"

        let verifyResponse = await fetch(`${server_link}/coffre/storepassword2`,
        {
        method:"POST",

        headers:{
            "Content-Type":
            "application/json"
        },
        body:JSON.stringify(storePayload)
        })
        let verifyData = await verifyResponse.json()
        if(verifyData.ERROR){
                store_status.innerText = verifyData.ERROR
            }
            else if(!verifyResponse.ok){
                store_status.innerText = "The password could not be stored. Please try again."
                return
            }
            else{
                store_status.innerText = "Stored successfully"
                window.dispatchEvent(new CustomEvent("vault-data-changed"))
}
}
}
)
