const HOME_PROMPT_DISMISSED_KEY = "home_auth_prompt_dismissed"

function isHomeRoute(){
    return window.location.hash === "" || window.location.hash === "#"
}

function shouldShowHomePrompt(){
    return isHomeRoute() &&
        !hasActiveSession() &&
        sessionStorage.getItem(HOME_PROMPT_DISMISSED_KEY) !== "true"
}

function updateHomePrompt(){
    const prompt = document.getElementById("home-auth-prompt")
    if(!prompt){
        return
    }

    prompt.hidden = !shouldShowHomePrompt()
}

document.addEventListener("DOMContentLoaded", function(){
    const prompt = document.getElementById("home-auth-prompt")
    const closeButton = document.getElementById("home-auth-prompt-close")

    if(closeButton){
        closeButton.addEventListener("click", function(){
            sessionStorage.setItem(HOME_PROMPT_DISMISSED_KEY, "true")
            updateHomePrompt()
        })
    }

    if(prompt){
        prompt.querySelectorAll("a").forEach(function(link){
            link.addEventListener("click", function(){
                sessionStorage.setItem(HOME_PROMPT_DISMISSED_KEY, "true")
            })
        })
    }

    updateHomePrompt()
})

window.addEventListener("hashchange", updateHomePrompt)
window.addEventListener("storage", updateHomePrompt)
window.addEventListener(AUTH_STATE_EVENT, updateHomePrompt)
window.updateHomePrompt = updateHomePrompt
