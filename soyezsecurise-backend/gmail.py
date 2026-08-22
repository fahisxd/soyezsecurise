import resend
from dotenv import load_dotenv
import os
from html import escape

load_dotenv()
RESEND_URL = os.getenv("RESEND_API")

resend.api_key = RESEND_URL

TEAM_ACTION_LABELS = {
    "login": "sign in to the team vault",
    "create-team": "create the team vault",
    "retrieve-secret": "retrieve a protected team secret",
    "delete-secret": "delete a team secret",
    "remove-member": "remove a team member",
    "admin-permissions": "change administrator permissions",
    "delete-team": "delete the team vault",
}


def _team_email(title, username, teamname, content):
    """Build a compact, Gmail-safe transactional email using inline styles."""
    safe_title = escape(str(title))
    safe_username = escape(str(username))
    safe_teamname = escape(str(teamname))
    return f"""<!doctype html>
<html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width">
<title>{safe_title}</title></head>
<body style="margin:0;padding:32px 16px;background:#111712;color:#E8EEE6;font-family:Arial,sans-serif">
<table role="presentation" width="100%" cellspacing="0" cellpadding="0"><tr><td align="center">
<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:560px;background:#18211A;border:1px solid #314235;border-radius:10px">
<tr><td style="padding:28px 30px 18px;text-align:center;border-bottom:1px solid #314235">
<div style="font-size:24px;font-weight:700;color:#F3F6F1">Soyez<span style="color:#A8C3AD">Sécurisé.</span></div>
<div style="margin-top:6px;font-size:11px;letter-spacing:2px;color:#7E9182;text-transform:uppercase">Team password vault</div>
</td></tr><tr><td style="padding:28px 30px">
<p style="margin:0 0 16px;color:#AAB7AB;font-size:15px;line-height:1.6">Hello <strong style="color:#F3F6F1">{safe_username}</strong>,</p>
<div style="margin:0 0 20px;padding:13px 16px;background:#111712;border:1px solid #314235;border-radius:6px;color:#7E9182;font-size:12px;text-transform:uppercase;letter-spacing:1px">Team&nbsp; <strong style="color:#A8C3AD;font-size:15px;text-transform:none;letter-spacing:0">{safe_teamname}</strong></div>
{content}
</td></tr><tr><td style="padding:18px 30px;border-top:1px solid #314235;text-align:center;color:#7E9182;font-size:12px;line-height:1.5">This is an automated security message from SoyezSécurisé.<br>Never share a verification code with anyone.</td></tr>
</table></td></tr></table></body></html>"""


def team_otp(username, otp, teamname, action, email):
    safe_otp = escape(str(otp))
    action_label = escape(TEAM_ACTION_LABELS.get(action, "authorize a team vault action"))
    content = f"""
<p style="margin:0;color:#AAB7AB;font-size:15px;line-height:1.6">Use this one-time code to {action_label}:</p>
<div style="margin:24px 0;padding:18px;text-align:center;background:#111712;border:1px solid #A8C3AD;border-radius:7px">
<span style="font-family:monospace;font-size:32px;font-weight:700;letter-spacing:6px;color:#A8C3AD">{safe_otp}</span></div>
<p style="margin:0;text-align:center;color:#7E9182;font-size:13px">This code expires in <strong>10 minutes</strong> and can be used once.</p>"""
    return resend.Emails.send({
        "from": "alert@soyezsecurise.com",
        "to": str(email),
        "subject": f"Team verification code - {teamname} | Soyez Sécurisé",
        "html": _team_email("Team verification", username, teamname, content),
    })


def team_invitation(username, inviter, teamname, role, email):
    safe_inviter = escape(str(inviter))
    safe_role = escape(str(role).title())
    content = f"""
<p style="margin:0 0 18px;color:#AAB7AB;font-size:15px;line-height:1.6"><strong style="color:#F3F6F1">{safe_inviter}</strong> invited you to join this team vault.</p>
<div style="padding:16px;background:#111712;border:1px solid #314235;border-radius:6px;color:#AAB7AB">Assigned role: <strong style="color:#A8C3AD">{safe_role}</strong><br><span style="font-size:12px;color:#7E9182">The invitation expires in 48 hours.</span></div>"""
    return resend.Emails.send({
        "from": "alert@soyezsecurise.com",
        "to": str(email),
        "subject": f"Invitation to join {teamname} | Soyez Sécurisé",
        "html": _team_email("Team invitation", username, teamname, content),
    })


def team_login(username, teamname, ip, email):
    safe_ip = escape(str(ip))
    content = f"""
<p style="margin:0 0 18px;color:#AAB7AB;font-size:15px;line-height:1.6">A successful login to this team vault was recorded.</p>
<div style="padding:16px;background:#111712;border:1px solid #314235;border-radius:6px;color:#7E9182;font-size:13px">Source IP<br><strong style="color:#A8C3AD;font-family:monospace;font-size:15px">{safe_ip}</strong></div>
<p style="margin:18px 0 0;color:#D8A5A5;font-size:13px;line-height:1.5">If this was not you, secure your account and contact the team owner immediately.</p>"""
    return resend.Emails.send({
        "from": "alert@soyezsecurise.com",
        "to": str(email),
        "subject": f"Team login successful - {teamname} | Soyez Sécurisé",
        "html": _team_email("Team login", username, teamname, content),
    })

def otpVE(username, otp, email):
    r = resend.Emails.send({
    "from": "alert@soyezsecurise.com",
    "to": f"{email}",   
    "subject": "Use this OTP - Soyez Sécurisé",
    "html": f"""
        <!DOCTYPE html>
<html>
<head>
    <meta charset="utf-8">
    <title>SoyezSécurisé - OTP Verification</title>
</head>
<body style="background-color: #111712; font-family: 'Helvetica Neue', Arial, sans-serif; color: #E8EEE6; margin: 0; padding: 40px 20px;">
    <table align="center" border="0" cellpadding="0" cellspacing="0" width="100%" style="max-width: 550px; background-color: #18211A; border-radius: 8px; border: 1px solid #314235; padding: 30px;">
        <tr>
            <td align="center" style="padding-bottom: 20px;">
                <h2 style="margin: 0; font-size: 24px; font-weight: 700; color: #F3F6F1;">Soyez<span style="color: #A8C3AD;">Sécurisé.</span></h2>
                <p style="margin: 5px 0 0 0; font-size: 11px; text-transform: uppercase; letter-spacing: 2px; color: #7E9182;">Private Password Vault</p>
            </td>
        </tr>
        <tr>
            <td style="padding: 20px 0;">
                <p style="font-size: 15px; line-height: 1.6; color: #AAB7AB;">Bonjour <strong>{username}</strong>,</p>
                <p style="font-size: 15px; line-height: 1.6; color: #AAB7AB;">Use the following One-Time Password (OTP) to complete your verification request in <strong>coffre</strong>. This code is highly time-sensitive.</p>
                
                <div style="background-color: #111712; border: 1px solid #314235; border-radius: 6px; padding: 15px; text-align: center; margin: 25px 0;">
                    <span style="font-family: monospace; font-size: 32px; font-weight: bold; letter-spacing: 6px; color: #A8C3AD;">{otp}</span>
                </div>
                
                <p style="font-size: 13px; color: #7E9182; text-align: center; margin-bottom: 0;">This code will expire in <strong>10 minutes</strong>.</p>
            </td>
        </tr>
        <tr>
            <td style="border-top: 1px solid #314235; padding-top: 20px; font-size: 12px; color: #7E9182; text-align: center;">
                If you did not request this code, please ignore this email. Secure your vault options at any time.
            </td>
        </tr>
    </table>
</body>
</html>
"""
    })

def NewUserD(username, email):
    r = resend.Emails.send({
    "from": "alert@soyezsecurise.com",
    "to": f"{email}",   
    "subject": "New User Detected - Soyez Sécurisé",
    "html": f"""
<!DOCTYPE html>
<html>
<head>
    <meta charset="utf-8">
    <title>SoyezSécurisé - Security Alert</title>
</head>
<body style="background-color: #111712; font-family: 'Helvetica Neue', Arial, sans-serif; color: #E8EEE6; margin: 0; padding: 40px 20px;">
    <table align="center" border="0" cellpadding="0" cellspacing="0" width="100%" style="max-width: 550px; background-color: #18211A; border-radius: 8px; border: 1px solid #314235; padding: 30px;">
        <tr>
            <td align="center" style="padding-bottom: 20px;">
                <h2 style="margin: 0; font-size: 24px; font-weight: 700; color: #F3F6F1;">Soyez<span style="color: #A8C3AD;">Sécurisé.</span></h2>
            </td>
        </tr>
        <tr>
            <td style="padding: 20px 0;">
                <p style="font-size: 15px; line-height: 1.6; color: #AAB7AB;">Bonjour <strong>{username}</strong>,</p>
                <p style="font-size: 15px; line-height: 1.6; color: #AAB7AB;">Our adaptive security mechanisms detected that a <strong>new user account action or registration</strong> was initiated from your currently active IP address.</p>
                
                <p style="font-size: 14px; line-height: 1.6; color: #AAB7AB;">If you are attempting to configure a secondary vault or sandbox environment from your network, no action is required.</p>
            </td>
        </tr>
        <tr>
            <td style="border-top: 1px solid #314235; padding-top: 20px; background-color: #201716; border-radius: 6px; padding: 15px; border: 1px solid #5B2D31;">
                <p style="margin: 0 0 10px 0; font-size: 14px; font-weight: bold; color: #FF4A5A;">Was this not you?</p>
                <p style="margin: 0 0 15px 0; font-size: 13px; color: #E8EEE6; line-height: 1.5;">If you didn't initiate this action from your network, your current IP environment might be compromised, or unauthorized access was attempted.</p>
                <a href="#" style="display: inline-block; background-color: #FF4A5A; color: #F3F6F1; font-weight: bold; font-size: 13px; text-decoration: none; padding: 10px 18px; border-radius: 4px;">Delete Unrecognized Account</a>
            </td>
        </tr>
    </table>
</body>
</html>
"""
    })

def welcome(username, email):
    r = resend.Emails.send({
    "from": "alert@soyezsecurise.com",
    "to": f"{email}",   
    "subject": "Welcome to coffre - Soyez Sécurisé",
    "html": f"""
<!DOCTYPE html>
<html>
<head>
    <meta charset="utf-8">
    <title>Welcome to SoyezSécurisé</title>
</head>
<body style="background-color: #111712; font-family: 'Helvetica Neue', Arial, sans-serif; color: #E8EEE6; margin: 0; padding: 40px 20px;">
    <table align="center" border="0" cellpadding="0" cellspacing="0" width="100%" style="max-width: 550px; background-color: #18211A; border-radius: 8px; border: 1px solid #314235; padding: 30px;">
        <tr>
            <td align="center" style="padding-bottom: 20px;">
                <h2 style="margin: 0; font-size: 24px; font-weight: 700; color: #F3F6F1;">Soyez<span style="color: #A8C3AD;">Sécurisé.</span></h2>
                <p style="margin: 5px 0 0 0; font-size: 11px; text-transform: uppercase; letter-spacing: 2px; color: #7E9182;">Private Password Vault</p>
            </td>
        </tr>
        <tr>
            <td style="padding: 20px 0; text-align: center;">
                <h3 style="font-size: 20px; color: #F3F6F1; margin-bottom: 10px;">Vault Initialized Successfully</h3>
                <p style="font-size: 15px; line-height: 1.6; color: #AAB7AB;">Welcome <strong>{username}</strong>. Your personal cryptographic container <strong>coffre</strong> is ready to protect your sensitive data.</p>
                
                <p style="font-size: 14px; color: #AAB7AB; margin-top: 20px;">Your environment is reinforced with zero-knowledge standard engineering:</p>
                <span style="display: inline-block; background: #111712; padding: 6px 12px; margin: 5px; border-radius: 4px; font-size: 12px; font-family: monospace; border: 1px solid #314235; color: #A8C3AD;">AES-256-GCM</span>
                <span style="display: inline-block; background: #111712; padding: 6px 12px; margin: 5px; border-radius: 4px; font-size: 12px; font-family: monospace; border: 1px solid #314235; color: #A8C3AD;">Argon2id</span>
                <span style="display: inline-block; background: #111712; padding: 6px 12px; margin: 5px; border-radius: 4px; font-size: 12px; font-family: monospace; border: 1px solid #314235; color: #A8C3AD;">Two-Factor Ready</span>
                
                <div style="margin-top: 30px;">
                    <a href="#" style="display: inline-block; background-color: #A8C3AD; color: #111712; font-weight: bold; font-size: 14px; text-decoration: none; padding: 12px 24px; border-radius: 4px;">Open Your Vault</a>
                </div>
            </td>
        </tr>
    </table>
</body>
</html>
"""
    })

def validlogin(username, ip, email):
    r = resend.Emails.send({
    "from": "alert@soyezsecurise.com",
    "to": f"{email}",   
    "subject": "Succesfully loged in - Soyez Sécurisé",
    "html": f"""
<!DOCTYPE html>
<html>
<head>
    <meta charset="utf-8">
    <title>SoyezSécurisé - Login Notification</title>
</head>
<body style="background-color: #111712; font-family: 'Helvetica Neue', Arial, sans-serif; color: #E8EEE6; margin: 0; padding: 40px 20px;">
    <table align="center" border="0" cellpadding="0" cellspacing="0" width="100%" style="max-width: 550px; background-color: #18211A; border-radius: 8px; border: 1px solid #314235; padding: 30px;">
        <tr>
            <td align="center" style="padding-bottom: 20px;">
                <h2 style="margin: 0; font-size: 24px; font-weight: 700; color: #F3F6F1;">Soyez<span style="color: #A8C3AD;">Sécurisé.</span></h2>
            </td>
        </tr>
        <tr>
            <td style="padding: 10px 0;">
                <p style="font-size: 15px; line-height: 1.6; color: #AAB7AB;">Hello <strong>{username}</strong>,</p>
                <p style="font-size: 15px; line-height: 1.6; color: #AAB7AB;">A successful login to your <strong>coffre</strong> vault profile was tracked.</p>
                
                <table width="100%" style="background-color: #111712; border: 1px solid #314235; border-radius: 6px; padding: 15px; margin: 20px 0; font-size: 14px;">
                    <tr>
                        <td style="color: #7E9182; padding: 4px 0; width: 100px;"><strong>Account:</strong></td>
                        <td style="color: #E8EEE6; padding: 4px 0;">{username}</td>
                    </tr>
                    <tr>
                        <td style="color: #7E9182; padding: 4px 0;"><strong>IP Address:</strong></td>
                        <td style="color: #A8C3AD; padding: 4px 0; font-family: monospace;">{ip}</td>
                    </tr>
                </table>
            </td>
        </tr>
        <tr>
            <td style="border-top: 1px solid #314235; padding-top: 20px; background-color: #201716; border-radius: 6px; padding: 15px; border: 1px solid #5B2D31;">
                <p style="margin: 0 0 8px 0; font-size: 14px; font-weight: bold; color: #FF4A5A;">Unrecognized Session?</p>
                <p style="margin: 0 0 15px 0; font-size: 13px; color: #E8EEE6; line-height: 1.5;">If this wasn't you, an attacker might have acquired your primary credentials. Terminate exposure immediately.</p>
                <a href="#" style="display: inline-block; background-color: #FF4A5A; color: #F3F6F1; font-weight: bold; font-size: 12px; text-decoration: none; padding: 10px 16px; border-radius: 4px;">Delete This Account</a>
            </td>
        </tr>
    </table>
</body>
</html>
"""
    })

def passretrieved(username, time, ip, pn, sn, email):
    time.strftime("%d %b %Y, %H:%M UTC")
    r = resend.Emails.send({
    "from": "alert@soyezsecurise.com",
    "to": f"{email}",   
    "subject": "Password succesfully retrieved - Soyez Sécurisé",
    "html": f"""
<!DOCTYPE html>
<html>
<head>
    <meta charset="utf-8">
    <title>SoyezSécurisé - Vault Item Decrypted</title>
</head>
<body style="background-color: #111712; font-family: 'Helvetica Neue', Arial, sans-serif; color: #E8EEE6; margin: 0; padding: 40px 20px;">
    <table align="center" border="0" cellpadding="0" cellspacing="0" width="100%" style="max-width: 550px; background-color: #18211A; border-radius: 8px; border: 1px solid #314235; padding: 30px;">
        <tr>
            <td align="center" style="padding-bottom: 20px;">
                <h2 style="margin: 0; font-size: 24px; font-weight: 700; color: #F3F6F1;">Soyez<span style="color: #A8C3AD;">Sécurisé.</span></h2>
            </td>
        </tr>
        <tr>
            <td style="padding: 10px 0;">
                <p style="font-size: 15px; line-height: 1.6; color: #AAB7AB;">Hello <strong>{username}</strong>,</p>
                <p style="font-size: 15px; line-height: 1.6; color: #AAB7AB;">An encrypted credential stored within your vault was accessed and decrypted.</p>
                
                <table width="100%" style="background-color: #111712; border: 1px solid #314235; border-radius: 6px; padding: 15px; margin: 20px 0; font-size: 14px;">
                    <tr>
                        <td style="color: #7E9182; padding: 4px 0; width: 120px;"><strong>Service Name:</strong></td>
                        <td style="color: #E8EEE6; padding: 4px 0;">{sn}</td>
                    </tr>
                    <tr>
                        <td style="color: #7E9182; padding: 4px 0;"><strong>Password Identifier:</strong></td>
                        <td style="color: #E8EEE6; padding: 4px 0; font-style: italic;">{pn}</td>
                    </tr>
                    <tr>
                        <td style="color: #7E9182; padding: 4px 0;"><strong>Timestamp:</strong></td>
                        <td style="color: #E8EEE6; padding: 4px 0;">{time}</td>
                    </tr>
                    <tr>
                        <td style="color: #7E9182; padding: 4px 0;"><strong>Source IP:</strong></td>
                        <td style="color: #A8C3AD; padding: 4px 0; font-family: monospace;">{ip}</td>
                    </tr>
                </table>
            </td>
        </tr>
        <tr>
            <td style="border-top: 1px solid #314235; padding-top: 20px; background-color: #201716; border-radius: 6px; padding: 15px; border: 1px solid #5B2D31;">
                <p style="margin: 0 0 8px 0; font-size: 14px; font-weight: bold; color: #FF4A5A;">Unauthorized Decryption Alert</p>
                <p style="margin: 0 0 15px 0; font-size: 13px; color: #E8EEE6; line-height: 1.5;">If you did not authorize this retrieval, malicious activity may be occurring within your profile configuration.</p>
                <a href="#" style="display: inline-block; background-color: #FF4A5A; color: #F3F6F1; font-weight: bold; font-size: 12px; text-decoration: none; padding: 10px 16px; border-radius: 4px;">Emergency: Delete Account</a>
            </td>
        </tr>
    </table>
</body>
</html>
"""
    })

def passdel(username, time, ip, pn, sn, email):
    r = resend.Emails.send({
    "from": "alert@soyezsecurise.com",
    "to": f"{email}",   
    "subject": "CRITICAL - Soyez Sécurisé",
    "html": f"""
<!DOCTYPE html>
<html>
<head>
    <meta charset="utf-8">
    <title>CRITICAL ACTION - Password Purged From Vault</title>
</head>
<body style="background-color: #111712; font-family: 'Helvetica Neue', Arial, sans-serif; color: #E8EEE6; margin: 0; padding: 40px 20px;">
    <table align="center" border="0" cellpadding="0" cellspacing="0" width="100%" style="max-width: 550px; background-color: #18211A; border-radius: 8px; border: 2px solid #FF4A5A; padding: 30px;">
        <tr>
            <td align="center" style="padding-bottom: 20px;">
                <h2 style="margin: 0; font-size: 24px; font-weight: 700; color: #FF4A5A;">CRITICAL SECURITY ALERT</h2>
                <p style="margin: 5px 0 0 0; font-size: 11px; text-transform: uppercase; letter-spacing: 2px; color: #7E9182;">SoyezSécurisé Ecosystem Tracking</p>
            </td>
        </tr>
        <tr>
            <td style="padding: 10px 0;">
                <p style="font-size: 15px; line-height: 1.6; color: #F3F6F1;">Attention <strong>{username}</strong>,</p>
                <p style="font-size: 15px; line-height: 1.6; color: #AAB7AB;">A destructive action occurred. A credential block has been permanently **purged and deleted** from your <strong>coffre</strong> database profile.</p>
                
                <table width="100%" style="background-color: #111712; border: 1px solid #5B2D31; border-radius: 6px; padding: 15px; margin: 20px 0; font-size: 14px;">
                    <tr>
                        <td style="color: #7E9182; padding: 4px 0; width: 120px;"><strong>Service Target:</strong></td>
                        <td style="color: #FF4A5A; padding: 4px 0; font-weight: bold;">{sn}</td>
                    </tr>
                    <tr>
                        <td style="color: #7E9182; padding: 4px 0;"><strong>Password Entry:</strong></td>
                        <td style="color: #E8EEE6; padding: 4px 0;">{pn}</td>
                    </tr>
                    <tr>
                        <td style="color: #7E9182; padding: 4px 0;"><strong>Timestamp:</strong></td>
                        <td style="color: #E8EEE6; padding: 4px 0;">{time}</td>
                    </tr>
                    <tr>
                        <td style="color: #7E9182; padding: 4px 0;"><strong>Origin IP:</strong></td>
                        <td style="color: #E8EEE6; padding: 4px 0; font-family: monospace;">{ip}</td>
                    </tr>
                </table>
                <p style="font-size: 13px; color: #7E9182; font-style: italic;">Note: Deleted secrets cannot be recovered by the server due to strict zero-knowledge architecture.</p>
            </td>
        </tr>
        <tr>
            <td style="border-top: 1px solid #5B2D31; padding-top: 20px; background-color: #201716; border-radius: 6px; padding: 20px; border: 1px solid #5B2D31; text-align: center;">
                <p style="margin: 0 0 10px 0; font-size: 15px; font-weight: bold; color: #FF4A5A;">Was this a malicious intrusion?</p>
                <p style="margin: 0 0 20px 0; font-size: 13px; color: #E8EEE6; line-height: 1.5;">If someone else performed this deletion, your entire vault infrastructure is exposed. Take dynamic lockdown action immediately.</p>
                <a href="#" style="display: inline-block; background-color: #FF4A5A; color: #F3F6F1; font-weight: bold; font-size: 14px; text-decoration: none; padding: 12px 24px; border-radius: 4px; letter-spacing: 0.5px;">Permanently Delete My Account Now</a>
            </td>
        </tr>
    </table>
</body>
</html>
"""
    })


def newteamcreated(username, teamname, email):
    r = resend.Emails.send({
        "from": "alert@soyezsecurise.com",
        "to": f"{email}",
        "subject": f"Team created - {teamname} | Soyez Sécurisé",
        "html": f"""
<!DOCTYPE html>
<html>
<head>
    <meta charset="utf-8">
    <title>SoyezSécurisé - Team Created</title>
</head>

<body style="
    background-color: #111712;
    font-family: 'Helvetica Neue', Arial, sans-serif;
    color: #E8EEE6;
    margin: 0;
    padding: 40px 20px;
">

    <table
        align="center"
        border="0"
        cellpadding="0"
        cellspacing="0"
        width="100%"
        style="
            max-width: 550px;
            background-color: #18211A;
            border-radius: 8px;
            border: 1px solid #314235;
            padding: 30px;
        "
    >

        <!-- Header -->
        <tr>
            <td align="center" style="padding-bottom: 20px;">

                <h2 style="
                    margin: 0;
                    font-size: 24px;
                    font-weight: 700;
                    color: #F3F6F1;
                ">
                    Soyez<span style="color: #A8C3AD;">Sécurisé.</span>
                </h2>

                <p style="
                    margin: 5px 0 0 0;
                    font-size: 11px;
                    text-transform: uppercase;
                    letter-spacing: 2px;
                    color: #7E9182;
                ">
                    Private Password Vault
                </p>

            </td>
        </tr>

        <!-- Content -->
        <tr>
            <td style="padding: 20px 0;">

                <p style="
                    font-size: 15px;
                    line-height: 1.6;
                    color: #AAB7AB;
                ">
                    Bonjour <strong>{username}</strong>,
                </p>

                <p style="
                    font-size: 15px;
                    line-height: 1.6;
                    color: #AAB7AB;
                ">
                    Your team has been created successfully in
                    <strong>Coffre</strong>.
                </p>

                <!-- Team card -->
                <div style="
                    background-color: #111712;
                    border: 1px solid #314235;
                    border-radius: 6px;
                    padding: 20px;
                    margin: 25px 0;
                ">

                    <p style="
                        margin: 0 0 8px 0;
                        font-size: 11px;
                        text-transform: uppercase;
                        letter-spacing: 2px;
                        color: #7E9182;
                    ">
                        Team
                    </p>

                    <p style="
                        margin: 0;
                        font-size: 22px;
                        font-weight: 600;
                        color: #A8C3AD;
                    ">
                        {teamname}
                    </p>

                </div>

                <p style="
                    font-size: 14px;
                    line-height: 1.6;
                    color: #AAB7AB;
                ">
                    You are now the administrator of this team.
                    You can invite members, manage access, and configure
                    team security settings from your Coffre dashboard.
                </p>

                <p style="
                    font-size: 13px;
                    color: #7E9182;
                    text-align: center;
                    margin: 25px 0 0 0;
                ">
                    Team status:
                    <strong style="color: #A8C3AD;">
                        ACTIVE
                    </strong>
                </p>

            </td>
        </tr>

        <!-- Footer -->
        <tr>
            <td style="
                border-top: 1px solid #314235;
                padding-top: 20px;
                font-size: 12px;
                line-height: 1.6;
                color: #7E9182;
                text-align: center;
            ">
                This notification was sent because a team was created
                using your Coffre account.
                <br><br>
                SoyezSécurisé · Security, built to understand.
            </td>
        </tr>

    </table>

</body>
</html>
"""
    })

    return r
