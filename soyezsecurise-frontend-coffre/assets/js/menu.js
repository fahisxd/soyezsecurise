const menuButton = document.getElementById("menu-btn")
const userButton = document.getElementById("user-button")
const menu = document.getElementById("menu")
const menuIcon = document.querySelector("#menu-btn .icon")
const loggedInMenu = document.getElementById("logged-in")
const loggedOutMenu = document.getElementById("logged-out")
const logoutRequest = document.getElementById("logoutrequest")

menuButton.addEventListener("click", function(){
    menu.classList.toggle("active")
})


function updateUserIcon() {
    const loggedIn = hasActiveSession()

    document.body.classList.toggle("user-authenticated", loggedIn)
    userButton.style.display = loggedIn ? "flex" : "none"
    if(!loggedIn){
        menu.classList.remove("active")
    }
    menuIcon.classList.toggle("fa-user", !loggedIn)
    menuIcon.classList.toggle("fa-gem", loggedIn)
    loggedInMenu.style.display = loggedIn ? "block" : "none"
    loggedOutMenu.style.display = loggedIn ? "none" : "block"
}


logoutRequest.addEventListener("click", function(e) {
    e.preventDefault()
    clearSession()
    menu.classList.remove("active")
})


document.addEventListener("DOMContentLoaded", updateUserIcon)


window.addEventListener("storage", updateUserIcon)
window.addEventListener(AUTH_STATE_EVENT, updateUserIcon)