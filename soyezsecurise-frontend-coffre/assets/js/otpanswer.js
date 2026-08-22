const otpFacts = [

"Two-factor authentication adds an extra security layer by requiring a second verification step during login.",

"2FA helps protect accounts from unauthorized access even if passwords become compromised.",

"A second authentication factor significantly reduces the risk of account takeover.",

"Security becomes stronger when identity requires more than a password alone.",

"2FA enhances account protection by combining passwords with time-based verification.",

"Even strong passwords can leak; 2FA adds an additional defense layer.",

"Authentication should rely on verification, not passwords alone.",

"Two-factor authentication helps prevent attackers from accessing accounts with stolen credentials.",

"An additional verification step can greatly improve account security.",

"2FA strengthens identity verification and reduces unauthorized login attempts."

]


const answer = document.getElementById("answerforotpq")

setInterval(()=>{
    let randomIndex =
    Math.floor(Math.random()*otpFacts.length)
    

answer.innerText = otpFacts[randomIndex]
}, 5000)