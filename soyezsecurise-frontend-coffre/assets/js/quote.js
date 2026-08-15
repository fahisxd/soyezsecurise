const securityQuotes = [

"Security is not built when an attack begins. It is built long before anyone attempts one.",

"Strong systems are not defined by what they stop, but by how well they recover and adapt.",

"Privacy is more than hiding information; it is maintaining control over what belongs to you.",

"Every login, request, and interaction carries trust. Security exists to protect that trust.",

"Protection is strongest when security becomes part of design rather than an afterthought.",

"Modern threats evolve constantly. Defense must evolve faster.",

"A secure vault is more than encrypted storage; it is architecture designed to resist failure.",

"The safest systems assume compromise, monitor behavior, and prepare for uncertainty.",

"Authentication proves identity. Authorization controls access. Security protects both.",

"Convenience opens doors. Security decides which ones remain locked.",

"One overlooked vulnerability can become the beginning of a larger incident.",

"Good security rarely announces itself. Its importance appears when something goes wrong.",

"Trust is valuable, but systems should always verify before granting access.",

"Real protection is built in layers, because a single defense should never carry everything.",

"Attackers automate. Defenders observe, adapt, and prepare.",

"Security is not a product that can be added later. It is a process that shapes every system."

]


const quote = document.getElementById("quote")

setInterval(()=>{
    let randomIndex =
    Math.floor(Math.random()*securityQuotes.length)

quote.innerText = securityQuotes[randomIndex]
}, 5000)

