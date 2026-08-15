const list_status = document.getElementById("status-list")

const listpasswordfunc = document.getElementById("listpassword")

let listbox = document.getElementById("passwordList")
const dashboardListbox = document.getElementById("dashboardPasswordList")
const dashboardStatus = document.getElementById("dashboard-vault-status")
const dashboardCount = document.getElementById("dashboard-vault-count")
const dashboardStorePassword = document.getElementById("dashboard-storepassword")
const dashboardDeletePassword = document.getElementById("dashboard-deletepassword")

let dashboardLoadStarted = false

function createVaultSkeletonItem(){
    let li = document.createElement("li")
    li.className = "vault-item vault-item-skeleton"
    li.setAttribute("aria-hidden", "true")

    let meta = document.createElement("div")
    meta.className = "vault-skeleton-meta"

    let service = document.createElement("span")
    service.className = "vault-skeleton-line service"

    let account = document.createElement("span")
    account.className = "vault-skeleton-line account"

    let actions = document.createElement("div")
    actions.className = "vault-skeleton-actions"

    let primary = document.createElement("span")
    primary.className = "vault-skeleton-button"

    let secondary = document.createElement("span")
    secondary.className = "vault-skeleton-button secondary"

    meta.appendChild(service)
    meta.appendChild(account)
    actions.appendChild(primary)
    actions.appendChild(secondary)
    li.appendChild(meta)
    li.appendChild(actions)

    return li
}

function showVaultLoading(options){
    const targetList = options.listElement

    if(options.statusElement){
        options.statusElement.innerText = ""
    }

    if(options.countElement){
        options.countElement.innerText = ""
    }

    if(!targetList){
        return
    }

    targetList.innerText = ""
    targetList.classList.add("vault-list-loading")

    for(let i = 0; i < 3; i++){
        targetList.appendChild(createVaultSkeletonItem())
    }
}

function clearVaultLoading(options){
    if(options.listElement){
        options.listElement.classList.remove("vault-list-loading")
        options.listElement.innerText = ""
    }
}

function showVaultError(options, message){
    clearVaultLoading(options)

    if(options.statusElement){
        options.statusElement.innerText = message
    }

    if(options.countElement){
        options.countElement.innerText = "Unavailable"
    }
}

function canShowVaultDashboard(){
    return hasActiveSession() && !!window.vaultkey
}

function updateVaultDashboardVisibility(){
    const showDashboard = canShowVaultDashboard()
    document.body.classList.toggle("dashboard-authenticated", showDashboard)

    if(showDashboard && !dashboardLoadStarted){
        loadVaultList({
            listElement: dashboardListbox,
            statusElement: dashboardStatus,
            countElement: dashboardCount
        })
    }

    if(!showDashboard){
        dashboardLoadStarted = false
        if(dashboardListbox){
            dashboardListbox.innerText = ""
        }
        if(dashboardStatus){
            dashboardStatus.innerText = "Your vault is empty. Store your first credential."
        }
        if(dashboardCount){
            dashboardCount.innerText = "Locked"
        }
    }
}

function setCredentialTargets(password, username){
    document.getElementById("getp-username").value = username || ""
    document.getElementById("getp-usernameS").value = password.username
    document.getElementById("Servicename_G").value = password.service
}

function setHintTargets(password, username){
    document.getElementById("hint-username").value = username || ""
    document.getElementById("hint-service-name").value = password.service
    const hintStoredUsername = document.getElementById("hint-stored-username")
    if(hintStoredUsername){
        hintStoredUsername.value = password.username
    }
}

function createVaultItem(password, username){
    let li = document.createElement("li")
    li.className = "vault-item"

    let meta = document.createElement("div")
    meta.className = "vault-item-meta"

    let service = document.createElement("strong")
    service.innerText = password.service

    let account = document.createElement("span")
    account.innerText = password.username

    let actions = document.createElement("div")
    actions.className = "vault-item-actions"

    let retrieve = document.createElement("a")
    retrieve.href = "#Getpassword"
    retrieve.className = "button primary small"
    retrieve.innerText = "Retrieve"
    retrieve.addEventListener("click", function(){
        setCredentialTargets(password, username)
    })

    let hint = document.createElement("a")
    hint.href = "#Hintpassword"
    hint.className = "button small"
    hint.innerText = "Hint"
    hint.addEventListener("click", function(){
        setHintTargets(password, username)
    })

    meta.appendChild(service)
    meta.appendChild(account)
    actions.appendChild(retrieve)
    actions.appendChild(hint)
    li.appendChild(meta)
    li.appendChild(actions)

    return li
}

function renderVaultList(passwords, options){
    const targetList = options.listElement
    const statusElement = options.statusElement
    const countElement = options.countElement
    const username = localStorage.getItem("username")

    if(!targetList){
        return
    }

    targetList.classList.remove("vault-list-loading")
    targetList.innerText = ""

    if(!Array.isArray(passwords)){
        if(statusElement){
            statusElement.innerText = "The server returned an incomplete vault response."
        }
        if(countElement){
            countElement.innerText = "Unavailable"
        }
        return
    }

    if(countElement){
        countElement.innerText = passwords.length === 1 ? "1 credential" : `${passwords.length} credentials`
    }

    if(passwords.length === 0){
        if(statusElement){
            statusElement.innerText = "Your vault is empty. Store your first credential."
        }
        return
    }

    if(statusElement){
        statusElement.innerText = ""
    }

    passwords.forEach(function(password){
        targetList.appendChild(createVaultItem(password, username))
    })
}

async function loadVaultList(options){
    const targetOptions = Object.assign({
        listElement: listbox,
        statusElement: list_status,
        countElement: null
    }, options || {})

    if(!canShowVaultDashboard()){
        showVaultError(targetOptions, "Session expired, login again")
        goToLogin()
        return
    }

    if(targetOptions.listElement === dashboardListbox){
        dashboardLoadStarted = true
    }

    const username_L = localStorage.getItem("username")
    const authkey_list = localStorage.getItem("authkey")

    showVaultLoading(targetOptions)

    let response = await fetch(`${server_link}/coffre/list`,
        {
            method:"POST",
            headers:{
                "Content-Type":"application/json"
                },
            body:JSON.stringify(withSession({
                username: username_L
            }))
        })
    let data_L = await response.json()
    if(data_L.ERROR){
        showVaultError(targetOptions, data_L.ERROR)
        return
    }
    else if(!response.ok){
        showVaultError(targetOptions, "The server could not load your vault. Please try again.")
        return
    }
    else{
        let nonce = data_L.nonce
        let requestid = data_L.request_id
        let signature = await generateSignature(nonce, authkey_list)
        let listverifyResponse = await fetch(`${server_link}/coffre/list2`,
            {
                method:"POST",

                headers:{
                "Content-Type":
                "application/json"
                },
                body:JSON.stringify({
                    signature:signature,
                    username:username_L,
                    session_id: getSessionId(),
                    request_id: requestid
                    })
            })
        let listverifyData = await listverifyResponse.json()
        if(listverifyData.ERROR){
                showVaultError(targetOptions, listverifyData.ERROR)
            }
        else if(!listverifyResponse.ok){
            showVaultError(targetOptions, "Your vault could not be verified. Please try again.")
            return
        }
        else{
            renderVaultList(listverifyData.passwords, targetOptions)
        }
    }
}

if(dashboardStorePassword){
    dashboardStorePassword.addEventListener("click", function(e){
        e.preventDefault()
        goToVaultRoute("#store-password")
    })
}

if(dashboardDeletePassword){
    dashboardDeletePassword.addEventListener("click", function(e){
        e.preventDefault()
        goToVaultRoute("#Deletepassword")
    })
}

if(listpasswordfunc){
    listpasswordfunc.addEventListener("click",
    async function(e){
        e.preventDefault()
        listpasswordfunc.href = hasActiveSession() && window.vaultkey ? "#" : "#login"
        if(!hasActiveSession() || !window.vaultkey){
            goToLogin()
            return
        }
        window.location.href = "#"
        dashboardLoadStarted = false
        updateVaultDashboardVisibility()

    })
}

document.addEventListener("DOMContentLoaded", updateVaultDashboardVisibility)
window.addEventListener(AUTH_STATE_EVENT, updateVaultDashboardVisibility)
window.addEventListener("storage", updateVaultDashboardVisibility)
window.addEventListener("vault-data-changed", function(){
    dashboardLoadStarted = false
    updateVaultDashboardVisibility()
})
