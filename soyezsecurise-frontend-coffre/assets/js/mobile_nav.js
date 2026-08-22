const mobileVaultRoutes = []

function setMobileActiveTab(){
    document.querySelectorAll(".mobile-tabbar a").forEach(function(link){
        link.classList.toggle("active", link.getAttribute("href") === window.location.hash)
    })
}

mobileVaultRoutes.forEach(function(item){
    const link = document.getElementById(item.id)

    if(!link){
        return
    }

    link.addEventListener("click", function(event){
        event.preventDefault()
        goToVaultRoute(item.route)
    })
})

window.addEventListener("hashchange", setMobileActiveTab)
document.addEventListener("DOMContentLoaded", setMobileActiveTab)
