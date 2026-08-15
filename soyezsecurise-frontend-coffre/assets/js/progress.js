const PROGRESS_STATUS_SELECTOR = [
    "[id^='status-']",
    "#profile-status-msg",
    "#otp-status-message",
    "#otp-copy-status"
].join(",")

function inferProgressState(message){
    let text = (message || "").trim().toLowerCase()

    if(!text || text === "first login"){
        return {
            percent: 0,
            state: "idle"
        }
    }

    if(
        text.includes("error") ||
        text.includes("failed") ||
        text.includes("wrong") ||
        text.includes("could not") ||
        text.includes("blocked") ||
        text.includes("expired") ||
        text.includes("doesn't exists") ||
        text.includes("not found") ||
        text.includes("incomplete") ||
        text.includes("not ready") ||
        text.startsWith("enter ")
    ){
        return {
            percent: 100,
            state: "error"
        }
    }

    if(
        text.includes("success") ||
        text.includes("succeeded") ||
        text.includes("ready") ||
        text.includes("sent") ||
        text.includes("stored") ||
        text.includes("retrieved") ||
        text.includes("retrieved") ||
        text.includes("deleted") ||
        text.includes("copied") ||
        text.includes("empty") ||
        text.includes("enabled") ||
        text.includes("created") ||
        text.includes("logged in")
    ){
        return {
            percent: 100,
            state: "success"
        }
    }

    if(text.includes("verifying") || text.includes("finishing")){
        return {
            percent: 78,
            state: "active"
        }
    }

    if(text.includes("generating") || text.includes("preparing keys")){
        return {
            percent: 58,
            state: "active"
        }
    }

    if(text.includes("deriving") || text.includes("encrypting")){
        return {
            percent: 42,
            state: "active"
        }
    }

    if(text.includes("requesting") || text.includes("sending") || text.includes("loading") || text.includes("restarting")){
        return {
            percent: 26,
            state: "active"
        }
    }

    if(text.includes("preparing")){
        return {
            percent: 34,
            state: "active"
        }
    }

    return {
        percent: 50,
        state: "active"
    }
}

function ensureProgressBar(statusElement){
    if(!statusElement || statusElement.dataset.progressReady === "true"){
        return
    }

    let wrapper = document.createElement("div")
    wrapper.className = "progress-shell"
    wrapper.setAttribute("aria-hidden", "true")

    let track = document.createElement("div")
    track.className = "progress-track"

    let fill = document.createElement("span")
    fill.className = "progress-fill"

    track.appendChild(fill)
    wrapper.appendChild(track)
    statusElement.insertAdjacentElement("afterend", wrapper)

    statusElement.dataset.progressReady = "true"
    statusElement.dataset.progressState = "idle"
    statusElement.dataset.progressPercent = "0"
    updateProgressBar(statusElement)

    let observer = new MutationObserver(function(){
        updateProgressBar(statusElement)
    })
    observer.observe(statusElement, {
        childList: true,
        characterData: true,
        subtree: true
    })
}

function updateProgressBar(statusElement, options){
    if(!statusElement){
        return
    }

    let progressShell = statusElement.nextElementSibling
    if(!progressShell || !progressShell.classList.contains("progress-shell")){
        return
    }

    let progressFill = progressShell.querySelector(".progress-fill")
    let inferred = inferProgressState(statusElement.innerText)
    let percent = options && typeof options.percent === "number" ? options.percent : inferred.percent
    let state = options && options.state ? options.state : inferred.state

    progressShell.hidden = state === "idle"
    progressShell.classList.remove("is-active", "is-success", "is-error")
    progressShell.classList.add("is-" + state)
    progressFill.style.width = Math.max(0, Math.min(100, percent)) + "%"

    statusElement.dataset.progressState = state
    statusElement.dataset.progressPercent = String(percent)
}

function setProgress(statusElement, message, percent, state){
    if(!statusElement){
        return
    }

    ensureProgressBar(statusElement)

    if(typeof message === "string"){
        statusElement.innerText = message
    }

    updateProgressBar(statusElement, {
        percent: percent,
        state: state
    })
}

function bootProgressBars(){
    document.querySelectorAll(PROGRESS_STATUS_SELECTOR).forEach(ensureProgressBar)
}

document.addEventListener("DOMContentLoaded", bootProgressBars)
window.setProgress = setProgress
