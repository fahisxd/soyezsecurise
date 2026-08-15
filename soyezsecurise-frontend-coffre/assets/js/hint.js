const hint_username = document.getElementById("hint-username")
const hint_service = document.getElementById("hint-service-name")
const hint_storedU = document.getElementById("hint-stored-username")
const hint_status = document.getElementById("status-hint")
const hint_result = document.getElementById("hint-result")
const hint_output = document.getElementById("hint-output")
const hintpasswordfunc = document.getElementById("hintpassword")

document.getElementById("hintpassword").addEventListener("click",
function(e){
    e.preventDefault()
    if(hasActiveSession() && window.vaultkey){
        hintpasswordfunc.href = "#Hintpassword"
        window.location.href = "#Hintpassword"
        hint_username.value = localStorage.getItem("username") || ""
    }
    else{
        hintpasswordfunc.href = "#login"
        window.location.href = "#login"
    }
})

document.getElementById("hint-password").addEventListener("submit",
async function(e){
    e.preventDefault()
    if(!hasActiveSession()){
        hint_status.innerText = "Session expired, login again"
        goToLogin()
        return
    }

    hint_status.innerText = "Requesting hint challenge..."
    hint_result.style.display = "none"

    let usernameV = hint_username.value
    let serviceV = hint_service.value
    let storeduV = hint_storedU.value
    let authkey = localStorage.getItem("authkey")

    let response = await fetch(`${server_link}/coffre/hint`,
        {
            method:"POST",
            headers:{
                "Content-Type":"application/json"
            },
            body:JSON.stringify(withSession({
                username: usernameV
            }))
        })

    let data = await response.json()
    if(data.ERROR){
        hint_status.innerText = data.ERROR
        return
    }
    else if(!response.ok){
        hint_status.innerText = "The server could not start this request. Please try again."
        return
    }
    else{
        let nonce = data.nonce
        let requestid = data.request_id
        let signature = await generateSignature(nonce, authkey)
        hint_status.innerText = "Verifying request..."

        let verifyResponse = await fetch(`${server_link}/coffre/hint2`,
            {
                method:"POST",
                headers:{
                    "Content-Type":"application/json"
                },
                body:JSON.stringify({
                    signature: signature,
                    username: usernameV,
                    session_id: getSessionId(),
                    service_name: serviceV,
                    storedusername : storeduV,
                    request_id: requestid
                })
            })

        let verifyData = await verifyResponse.json()
        if(verifyData.ERROR){
            hint_status.innerText = verifyData.ERROR
            return
        }
        else if(!verifyResponse.ok){
            hint_status.innerText = "The hint could not be retrieved. Please try again."
            return
        }
        else{
            hint_status.innerText = "Hint retrieved"
            hint_output.innerText = verifyData.hint === "None" ? "No hint saved" : base64ToText(verifyData.hint)
            hint_result.style.display = "block"
        }
    }
})
