const username_del = document.getElementById("usernameD")

const usernameD = document.getElementById("user-nameSD")

const servicename_D = document.getElementById("password-nameD")

const del_status = document.getElementById("status-del")

const delpasswordfunc = document.getElementById("deletepassword")



document.getElementById("deletepassword").addEventListener("click",
function(e){
    e.preventDefault() 
    delpasswordfunc.href = hasActiveSession() && window.vaultkey ? "#Deletepassword" : "#login"
    goToVaultRoute("#Deletepassword")
})

document.getElementById("delete-password").addEventListener("submit",
    async function(e){
        e.preventDefault()
        if(!hasActiveSession()){
            del_status.innerText = "Session expired, login again"
            goToLogin()
            return
        }

        del_status.innerText = "Getting values..."
        let usernameDV = username_del.value
        let usernameDVS = usernameD.value
        let service_nameDV = servicename_D.value
        del_status.innerText = "Requesting server...."
        let response = await fetch(`${server_link}/coffre/delete`,
            {
                method:"POST",
                headers:{
                    "Content-Type":"application/json"
            },
            body:JSON.stringify(withSession({
                    username:usernameDV
                }))
            })
        let deldata = await response.json()
        if(deldata.ERROR){
        del_status.innerText = deldata.ERROR
        return
        }
        else if(!response.ok){
            del_status.innerText = "The server could not start this request. Please try again."
            return
        }
        else{
            let nonce = deldata.nonce
            let requestid = deldata.request_id
            let authkey = localStorage.getItem("authkey")
            let signature = await generateSignature(nonce, authkey)
            del_status.innerText = "Verifying"
            let delverifyResponse = await fetch(`${server_link}/coffre/delete2`,
            {
                method:"POST",

                headers:{
                "Content-Type":
                "application/json"
                },
                body:JSON.stringify({
                    signature:signature,
                    username:usernameDV,
                    session_id: getSessionId(),
                    password_name:service_nameDV,
                    usernameS:usernameDVS,
                    request_id:requestid

                    })
            })
            let delverifyData = await delverifyResponse.json()
            if(delverifyData.ERROR){
                del_status.innerText = delverifyData.ERROR
                return
            }
            else if(!delverifyResponse.ok){
                del_status.innerText = "The password could not be deleted. Please try again."
                return
            }
            else{
                del_status.innerText = "Password deleted successfully"
            }

        }
})
