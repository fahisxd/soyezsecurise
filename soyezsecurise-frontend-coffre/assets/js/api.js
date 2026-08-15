const SESSION_STORAGE_KEY = "session_id"
const AUTH_STATE_EVENT = "auth-state-changed"

function getSessionId(){
    return localStorage.getItem(SESSION_STORAGE_KEY)
}

function notifyAuthStateChanged(){
    window.dispatchEvent(new CustomEvent(AUTH_STATE_EVENT))
}

function setSessionId(sessionId){
    if(sessionId){
        localStorage.setItem(SESSION_STORAGE_KEY, sessionId)
        notifyAuthStateChanged()
    }
}

function clearSession(){
    localStorage.setItem("userLoggedIn", "false")
    localStorage.removeItem("username")
    localStorage.removeItem("authkey")
    localStorage.removeItem(SESSION_STORAGE_KEY)
    window.vaultkey = null
    notifyAuthStateChanged()
}

function setAuthenticatedSession(username, authkeyHex, sessionId){
    localStorage.setItem("username", username)
    localStorage.setItem("authkey", authkeyHex)
    localStorage.setItem(SESSION_STORAGE_KEY, sessionId)
    localStorage.setItem("userLoggedIn", "true")
    notifyAuthStateChanged()
}

function hasActiveSession(){
    return localStorage.getItem("userLoggedIn") === "true" && !!getSessionId()
}

function withSession(payload){
    return Object.assign({}, payload, {
        session_id: getSessionId()
    })
}

function bytesToHex(bytes){
    return Array.from(bytes, function(byte){
        return byte.toString(16).padStart(2, "0")
    }).join("")
}

function hexToBytes(hex){
    return Uint8Array.from(hex.match(/.{1,2}/g).map(function(byte){
        return parseInt(byte, 16)
    }))
}

function base64ToBytes(base64){
    const binary = window.atob(base64.trim())
    const bytes = new Uint8Array(binary.length)

    for(let i = 0; i < binary.length; i++){
        bytes[i] = binary.charCodeAt(i)
    }

    return bytes
}

function bytesToBase64(bytes){
    let binary = ""
    bytes.forEach(function(byte){
        binary += String.fromCharCode(byte)
    })
    return window.btoa(binary)
}

function textToBase64(text){
    return bytesToBase64(new TextEncoder().encode(text))
}

function base64ToText(base64){
    return new TextDecoder().decode(base64ToBytes(base64))
}

async function generateSignature(nonceHex, keyHex){
    const nonceBytes = hexToBytes(nonceHex)
    const keyBytes = keyHex instanceof ArrayBuffer
        ? new Uint8Array(keyHex)
        : hexToBytes(keyHex)
    const cryptoKey = await crypto.subtle.importKey(
        "raw",
        keyBytes,
        { name: "HMAC", hash: "SHA-256" },
        false,
        ["sign"]
    )
    const signatureBytes = await crypto.subtle.sign("HMAC", cryptoKey, nonceBytes)
    return bytesToHex(new Uint8Array(signatureBytes))
}

function goToLogin(){
    window.location.href = "#login"
}

function goToVaultRoute(route){
    if(hasActiveSession() && window.vaultkey){
        window.location.href = route
        return true
    }

    goToLogin()
    return false
}
