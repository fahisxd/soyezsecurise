import resend
from dotenv import load_dotenv
import os

RESEND_URL = os.getenv("RESEND_API")

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
<body style="background-color: #0B0F17; font-family: 'Helvetica Neue', Arial, sans-serif; color: #E2E8F0; margin: 0; padding: 40px 20px;">
    <table align="center" border="0" cellpadding="0" cellspacing="0" width="100%" style="max-width: 550px; background-color: #161B26; border-radius: 8px; border: 1px solid #232D3F; padding: 30px;">
        <tr>
            <td align="center" style="padding-bottom: 20px;">
                <h2 style="margin: 0; font-size: 24px; font-weight: 700; color: #FFFFFF;">Soyez<span style="color: #73D2DE;">Sécurisé.</span></h2>
                <p style="margin: 5px 0 0 0; font-size: 11px; text-transform: uppercase; letter-spacing: 2px; color: #64748B;">Private Password Vault</p>
            </td>
        </tr>
        <tr>
            <td style="padding: 20px 0;">
                <p style="font-size: 15px; line-height: 1.6; color: #94A3B8;">Bonjour <strong>{username}</strong>,</p>
                <p style="font-size: 15px; line-height: 1.6; color: #94A3B8;">Use the following One-Time Password (OTP) to complete your verification request in <strong>coffre</strong>. This code is highly time-sensitive.</p>
                
                <div style="background-color: #0B0F17; border: 1px solid #232D3F; border-radius: 6px; padding: 15px; text-align: center; margin: 25px 0;">
                    <span style="font-family: monospace; font-size: 32px; font-weight: bold; letter-spacing: 6px; color: #73D2DE;">{otp}</span>
                </div>
                
                <p style="font-size: 13px; color: #64748B; text-align: center; margin-bottom: 0;">⏳ This code will expire in <strong>10 minutes</strong>.</p>
            </td>
        </tr>
        <tr>
            <td style="border-top: 1px solid #232D3F; padding-top: 20px; font-size: 12px; color: #64748B; text-align: center;">
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
<body style="background-color: #0B0F17; font-family: 'Helvetica Neue', Arial, sans-serif; color: #E2E8F0; margin: 0; padding: 40px 20px;">
    <table align="center" border="0" cellpadding="0" cellspacing="0" width="100%" style="max-width: 550px; background-color: #161B26; border-radius: 8px; border: 1px solid #232D3F; padding: 30px;">
        <tr>
            <td align="center" style="padding-bottom: 20px;">
                <h2 style="margin: 0; font-size: 24px; font-weight: 700; color: #FFFFFF;">Soyez<span style="color: #73D2DE;">Sécurisé.</span></h2>
            </td>
        </tr>
        <tr>
            <td style="padding: 20px 0;">
                <p style="font-size: 15px; line-height: 1.6; color: #94A3B8;">Hello <strong>{username}</strong>,</p>
                <p style="font-size: 15px; line-height: 1.6; color: #94A3B8;">Our adaptive security mechanisms detected that a <strong>new user account action or registration</strong> was initiated from your currently active IP address.</p>
                
                <p style="font-size: 14px; line-height: 1.6; color: #94A3B8;">If you are attempting to configure a secondary vault or sandbox environment from your network, no action is required.</p>
            </td>
        </tr>
        <tr>
            <td style="border-top: 1px solid #232D3F; padding-top: 20px; background-color: #1A1315; border-radius: 6px; padding: 15px; border: 1px solid #3F2328;">
                <p style="margin: 0 0 10px 0; font-size: 14px; font-weight: bold; color: #FF4A5A;">⚠️ Was this not you?</p>
                <p style="margin: 0 0 15px 0; font-size: 13px; color: #E2E8F0; line-height: 1.5;">If you didn't initiate this action from your network, your current IP environment might be compromised, or unauthorized access was attempted.</p>
                <a href="#" style="display: inline-block; background-color: #FF4A5A; color: #FFFFFF; font-weight: bold; font-size: 13px; text-decoration: none; padding: 10px 18px; border-radius: 4px;">Delete Unrecognized Account</a>
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
<body style="background-color: #0B0F17; font-family: 'Helvetica Neue', Arial, sans-serif; color: #E2E8F0; margin: 0; padding: 40px 20px;">
    <table align="center" border="0" cellpadding="0" cellspacing="0" width="100%" style="max-width: 550px; background-color: #161B26; border-radius: 8px; border: 1px solid #232D3F; padding: 30px;">
        <tr>
            <td align="center" style="padding-bottom: 20px;">
                <h2 style="margin: 0; font-size: 24px; font-weight: 700; color: #FFFFFF;">Soyez<span style="color: #73D2DE;">Sécurisé.</span></h2>
                <p style="margin: 5px 0 0 0; font-size: 11px; text-transform: uppercase; letter-spacing: 2px; color: #64748B;">Private Password Vault</p>
            </td>
        </tr>
        <tr>
            <td style="padding: 20px 0; text-align: center;">
                <h3 style="font-size: 20px; color: #FFFFFF; margin-bottom: 10px;">Vault Initialized Successfully</h3>
                <p style="font-size: 15px; line-height: 1.6; color: #94A3B8;">Welcome <strong>{username}</strong>. Your personal cryptographic container <strong>coffre</strong> is ready to protect your sensitive data.</p>
                
                <p style="font-size: 14px; color: #94A3B8; margin-top: 20px;">Your environment is reinforced with zero-knowledge standard engineering:</p>
                <span style="display: inline-block; background: #0B0F17; padding: 6px 12px; margin: 5px; border-radius: 4px; font-size: 12px; font-family: monospace; border: 1px solid #232D3F; color: #73D2DE;">AES-256-GCM</span>
                <span style="display: inline-block; background: #0B0F17; padding: 6px 12px; margin: 5px; border-radius: 4px; font-size: 12px; font-family: monospace; border: 1px solid #232D3F; color: #73D2DE;">Argon2id</span>
                <span style="display: inline-block; background: #0B0F17; padding: 6px 12px; margin: 5px; border-radius: 4px; font-size: 12px; font-family: monospace; border: 1px solid #232D3F; color: #73D2DE;">Two-Factor Ready</span>
                
                <div style="margin-top: 30px;">
                    <a href="#" style="display: inline-block; background-color: #73D2DE; color: #0B0F17; font-weight: bold; font-size: 14px; text-decoration: none; padding: 12px 24px; border-radius: 4px;">Open Your Vault</a>
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
<body style="background-color: #0B0F17; font-family: 'Helvetica Neue', Arial, sans-serif; color: #E2E8F0; margin: 0; padding: 40px 20px;">
    <table align="center" border="0" cellpadding="0" cellspacing="0" width="100%" style="max-width: 550px; background-color: #161B26; border-radius: 8px; border: 1px solid #232D3F; padding: 30px;">
        <tr>
            <td align="center" style="padding-bottom: 20px;">
                <h2 style="margin: 0; font-size: 24px; font-weight: 700; color: #FFFFFF;">Soyez<span style="color: #73D2DE;">Sécurisé.</span></h2>
            </td>
        </tr>
        <tr>
            <td style="padding: 10px 0;">
                <p style="font-size: 15px; line-height: 1.6; color: #94A3B8;">Hello <strong>{{username}}</strong>,</p>
                <p style="font-size: 15px; line-height: 1.6; color: #94A3B8;">A successful login to your <strong>coffre</strong> vault profile was tracked.</p>
                
                <table width="100%" style="background-color: #0B0F17; border: 1px solid #232D3F; border-radius: 6px; padding: 15px; margin: 20px 0; font-size: 14px;">
                    <tr>
                        <td style="color: #64748B; padding: 4px 0; width: 100px;"><strong>Account:</strong></td>
                        <td style="color: #E2E8F0; padding: 4px 0;">{username}</td>
                    </tr>
                    <tr>
                        <td style="color: #64748B; padding: 4px 0;"><strong>IP Address:</strong></td>
                        <td style="color: #73D2DE; padding: 4px 0; font-family: monospace;">{ip}</td>
                    </tr>
                </table>
            </td>
        </tr>
        <tr>
            <td style="border-top: 1px solid #232D3F; padding-top: 20px; background-color: #1A1315; border-radius: 6px; padding: 15px; border: 1px solid #3F2328;">
                <p style="margin: 0 0 8px 0; font-size: 14px; font-weight: bold; color: #FF4A5A;">🔴 Unrecognized Session?</p>
                <p style="margin: 0 0 15px 0; font-size: 13px; color: #E2E8F0; line-height: 1.5;">If this wasn't you, an attacker might have acquired your primary credentials. Terminate exposure immediately.</p>
                <a href="#" style="display: inline-block; background-color: #FF4A5A; color: #FFFFFF; font-weight: bold; font-size: 12px; text-decoration: none; padding: 10px 16px; border-radius: 4px;">Delete This Account</a>
            </td>
        </tr>
    </table>
</body>
</html>
"""
    })

def passretrieved(username, time, ip, pn, sn, email):
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
<body style="background-color: #0B0F17; font-family: 'Helvetica Neue', Arial, sans-serif; color: #E2E8F0; margin: 0; padding: 40px 20px;">
    <table align="center" border="0" cellpadding="0" cellspacing="0" width="100%" style="max-width: 550px; background-color: #161B26; border-radius: 8px; border: 1px solid #232D3F; padding: 30px;">
        <tr>
            <td align="center" style="padding-bottom: 20px;">
                <h2 style="margin: 0; font-size: 24px; font-weight: 700; color: #FFFFFF;">Soyez<span style="color: #73D2DE;">Sécurisé.</span></h2>
            </td>
        </tr>
        <tr>
            <td style="padding: 10px 0;">
                <p style="font-size: 15px; line-height: 1.6; color: #94A3B8;">Hello <strong>{username}</strong>,</p>
                <p style="font-size: 15px; line-height: 1.6; color: #94A3B8;">An encrypted credential stored within your vault was accessed and decrypted.</p>
                
                <table width="100%" style="background-color: #0B0F17; border: 1px solid #232D3F; border-radius: 6px; padding: 15px; margin: 20px 0; font-size: 14px;">
                    <tr>
                        <td style="color: #64748B; padding: 4px 0; width: 120px;"><strong>Service Name:</strong></td>
                        <td style="color: #E2E8F0; padding: 4px 0;">{sn}</td>
                    </tr>
                    <tr>
                        <td style="color: #64748B; padding: 4px 0;"><strong>Password Identifier:</strong></td>
                        <td style="color: #E2E8F0; padding: 4px 0; font-style: italic;">{pn}</td>
                    </tr>
                    <tr>
                        <td style="color: #64748B; padding: 4px 0;"><strong>Timestamp:</strong></td>
                        <td style="color: #E2E8F0; padding: 4px 0;">{time}</td>
                    </tr>
                    <tr>
                        <td style="color: #64748B; padding: 4px 0;"><strong>Source IP:</strong></td>
                        <td style="color: #73D2DE; padding: 4px 0; font-family: monospace;">{ip}</td>
                    </tr>
                </table>
            </td>
        </tr>
        <tr>
            <td style="border-top: 1px solid #232D3F; padding-top: 20px; background-color: #1A1315; border-radius: 6px; padding: 15px; border: 1px solid #3F2328;">
                <p style="margin: 0 0 8px 0; font-size: 14px; font-weight: bold; color: #FF4A5A;">🚨 Unauthorized Decryption Alert</p>
                <p style="margin: 0 0 15px 0; font-size: 13px; color: #E2E8F0; line-height: 1.5;">If you did not authorize this retrieval, malicious activity may be occurring within your profile configuration.</p>
                <a href="#" style="display: inline-block; background-color: #FF4A5A; color: #FFFFFF; font-weight: bold; font-size: 12px; text-decoration: none; padding: 10px 16px; border-radius: 4px;">Emergency: Delete Account</a>
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
<body style="background-color: #0B0F17; font-family: 'Helvetica Neue', Arial, sans-serif; color: #E2E8F0; margin: 0; padding: 40px 20px;">
    <table align="center" border="0" cellpadding="0" cellspacing="0" width="100%" style="max-width: 550px; background-color: #161B26; border-radius: 8px; border: 2px solid #FF4A5A; padding: 30px;">
        <tr>
            <td align="center" style="padding-bottom: 20px;">
                <h2 style="margin: 0; font-size: 24px; font-weight: 700; color: #FF4A5A;">CRITICAL SECURITY ALERT</h2>
                <p style="margin: 5px 0 0 0; font-size: 11px; text-transform: uppercase; letter-spacing: 2px; color: #64748B;">SoyezSécurisé Ecosystem Tracking</p>
            </td>
        </tr>
        <tr>
            <td style="padding: 10px 0;">
                <p style="font-size: 15px; line-height: 1.6; color: #FFFFFF;">Attention <strong>{username}</strong>,</p>
                <p style="font-size: 15px; line-height: 1.6; color: #94A3B8;">A destructive action occurred. A credential block has been permanently **purged and deleted** from your <strong>coffre</strong> database profile.</p>
                
                <table width="100%" style="background-color: #0B0F17; border: 1px solid #3F2328; border-radius: 6px; padding: 15px; margin: 20px 0; font-size: 14px;">
                    <tr>
                        <td style="color: #64748B; padding: 4px 0; width: 120px;"><strong>Service Target:</strong></td>
                        <td style="color: #FF4A5A; padding: 4px 0; font-weight: bold;">{sn}</td>
                    </tr>
                    <tr>
                        <td style="color: #64748B; padding: 4px 0;"><strong>Password Entry:</strong></td>
                        <td style="color: #E2E8F0; padding: 4px 0;">{pn}</td>
                    </tr>
                    <tr>
                        <td style="color: #64748B; padding: 4px 0;"><strong>Timestamp:</strong></td>
                        <td style="color: #E2E8F0; padding: 4px 0;">{time}</td>
                    </tr>
                    <tr>
                        <td style="color: #64748B; padding: 4px 0;"><strong>Origin IP:</strong></td>
                        <td style="color: #E2E8F0; padding: 4px 0; font-family: monospace;">{ip}</td>
                    </tr>
                </table>
                <p style="font-size: 13px; color: #64748B; font-style: italic;">Note: Deleted secrets cannot be recovered by the server due to strict zero-knowledge architecture.</p>
            </td>
        </tr>
        <tr>
            <td style="border-top: 1px solid #3F2328; padding-top: 20px; background-color: #1A1315; border-radius: 6px; padding: 20px; border: 1px solid #3F2328; text-align: center;">
                <p style="margin: 0 0 10px 0; font-size: 15px; font-weight: bold; color: #FF4A5A;">Was this a malicious intrusion?</p>
                <p style="margin: 0 0 20px 0; font-size: 13px; color: #E2E8F0; line-height: 1.5;">If someone else performed this deletion, your entire vault infrastructure is exposed. Take dynamic lockdown action immediately.</p>
                <a href="#" style="display: inline-block; background-color: #FF4A5A; color: #FFFFFF; font-weight: bold; font-size: 14px; text-decoration: none; padding: 12px 24px; border-radius: 4px; letter-spacing: 0.5px;">Permanently Delete My Account Now</a>
            </td>
        </tr>
    </table>
</body>
</html>
"""
    })

otpVE("fahisxd", 6769911, "fahisshehandim@gmail.com")
NewUserD("fahisxd", "fahisshehandim@gmail.com")
welcome("fahisxd", "fahisshehandim@gmail.com")
validlogin("fahisxd", "8.8.8.8", "fahisshehandim@gmail.com")
passretrieved("fahisxd", "12:00", "8.8.8.8", "fahh", "fahh.com", "fahisshehandim@gmail.com")
passdel("fahisxd", "12:00", "8.8.8.8", "fahh", "fahh.com", "fahisshehandim@gmail.com")