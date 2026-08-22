const username_get = document.getElementById("getp-username")

const usernameS = document.getElementById("getp-usernameS")

const servicename_G = document.getElementById("Servicename_G")

const get_status = document.getElementById("status-get")

const getpasswordfunc = document.getElementById("getpassword")


document.getElementById("getpassword").addEventListener("click",
function(e){
    e.preventDefault() 
    getpasswordfunc.href = hasActiveSession() && window.vaultkey ? "#Getpassword" : "#login"
    goToVaultRoute("#Getpassword")
})

async function copypass(){

    let secret = document.getElementById("retrievedPassword")

    await navigator.clipboard.writeText(secret.value)
}


document.getElementById("get-password").addEventListener("submit",
    async function(e){
        e.preventDefault()
        if(!hasActiveSession() || !window.vaultkey){
            get_status.innerText = "Session expired, login again"
            goToLogin()
            return
        }

        get_status.innerText = "Getting values..."
        let usernameGV = username_get.value
        let usernameGVS = usernameS.value
        let service_nameGV = servicename_G.value
        let keybytes = window.vaultkey
        let key = await crypto.subtle.importKey(
            "raw",
            keybytes,
            {
                name:"AES-GCM"
            },
            false,
            ["decrypt"]
        )
        get_status.innerText = "Requesting server...."
        let response = await fetch(`${server_link}/coffre/getenc`,
            {
                method:"POST",
                headers:{
                    "Content-Type":"application/json"
            },
            body:JSON.stringify(withSession({
                    username:usernameGV
                }))
            })
        let getdata = await response.json()
    if(getdata.ERROR){

        get_status.innerText = getdata.ERROR
        return
    }

    else if(!response.ok){
        get_status.innerText = "The server could not start this request. Please try again."
        return
    }

    else{
        let nonce = getdata.nonce
        let requestid = getdata.request_id
        let authkey = localStorage.getItem("authkey")
        let signature = await generateSignature(nonce, authkey)
        get_status.innerText = "Verifying"
        let getverifyResponse = await fetch(`${server_link}/coffre/getenc2`,
            {
                method:"POST",

                headers:{
                "Content-Type":
                "application/json"
                },
                body:JSON.stringify({
                    signature:signature,
                    username:usernameGV,
                    session_id: getSessionId(),
                    password_name:service_nameGV,
                    usernameS:usernameGVS,
                    request_id:requestid

                    })
            })
        let getverifyData = await getverifyResponse.json()
        if(getverifyData.ERROR){
                get_status.innerText = getverifyData.ERROR
                return
            }
            else if(!getverifyResponse.ok){
                get_status.innerText = "The password could not be retrieved. Please try again."
                return
            }
            else{
                get_status.innerText = "Retrieved"
                let encrypted = await base64ToBytes(getverifyData.encdata)
                let iv = encrypted.slice(0,12)
                let ciphertext = encrypted.slice(12)
                let decrypted = await crypto.subtle.decrypt(
                    {
                        name:"AES-GCM",
                        iv:iv
                    },
                    key,
                    ciphertext
                )
                let password = new TextDecoder().decode(decrypted)
                document.getElementById("retrievedPassword").value=password
                document.getElementById("gotpassword").style.display="block"
                let username_A = getverifyData.username_A
                document.getElementById("username_A").innerText="Username: " + username_A


}
}
})
