import hmac
import hashlib
import os
import redis
import base64
import pyotp
from Crypto.Cipher import ChaCha20_Poly1305
from cryptography.hazmat.primitives.kdf.hkdf import HKDF
from cryptography.hazmat.primitives import hashes
import psycopg2
from fastapi import Request
import uuid
from fastapi.middleware.cors import CORSMiddleware
import time
import qrcode
import io
from dotenv import load_dotenv
from typing import Optional
import traceback
import secrets
import string
import ipaddress
from psycopg2.extras import RealDictCursor
from datetime import datetime, timezone
from otp_security import consume_otp_hash, verify_totp_once

from check_block import(
    check,
    blocker
)
from logger import (
    login_logger,
    db_logger,
    sys_logger,
    otp_logger,
    access_logger,
    Log_event
)
from gmail import(
    otpVE,
    NewUserD,
    welcome,
    validlogin,
    passretrieved,
    passdel
)

load_dotenv()

DATABASE_URL = os.getenv("DATABASE_URL")
REDIS_URL = os.getenv("REDIS_URL")

redis_options = {
    "decode_responses": True,
    "socket_connect_timeout": 5,
    "socket_timeout": 5,
}
nonce_db = redis.Redis.from_url(REDIS_URL, **redis_options)
ratelimitin = redis.Redis.from_url(REDIS_URL, **redis_options)
temp_blocked = redis.Redis.from_url(REDIS_URL, **redis_options)
session = redis.Redis.from_url(REDIS_URL, **redis_options)
gmail_otp = redis.Redis.from_url(REDIS_URL, **redis_options)
invites = redis.Redis.from_url(REDIS_URL, **redis_options)

def get_db():
    conn = psycopg2.connect(
        DATABASE_URL,
        cursor_factory=RealDictCursor,
        connect_timeout=5,
    )

    try:
        yield conn
    finally:
        conn.close()

# =========================
# decrypting
# =========================

def decrypt(enc_secret, key, tag, nonce):
    cipher = ChaCha20_Poly1305.new(key=key, nonce=nonce)
    plaintext = cipher.decrypt_and_verify(enc_secret, tag)
    return plaintext

# =========================
# verifying otp
# =========================

def queue_email(background_tasks, email_func, *args):
    if background_tasks:
        background_tasks.add_task(send_email_safely, email_func, *args)
    else:
        send_email_safely(email_func, *args)


def send_email_safely(email_func, *args):
    try:
        email_func(*args)
    except Exception:
        Log_event(
            sys_logger,
            "/email",
            "ERROR",
            traceback.format_exc(),
            args[0] if args else "-",
            "-",
            "-",
        )


def otp_generation_and_verfication(username, user_otp, cursor, cmd, background_tasks=None):
    cursor.execute(
        """
    SELECT id FROM users WHERE username = %s;""",
    (username,),)
    userid = cursor.fetchone()["id"]
    key = f"{username}:Gotp"
    if cmd == "ver":
        cursor.execute(
        """
        SELECT method FROM twofa WHERE userid = %s;""",
            (userid,),)
        
        row = cursor.fetchone()
        if row and row["method"]:
            method = row["method"]
            if method == "totp":
                cursor.execute("""
                SELECT secret,salt FROM twofa WHERE userid = %s;
                """, (userid,),
                )
                row = cursor.fetchone()
                enc_secret = row["secret"]
                enc_secret = base64.b64decode(enc_secret)
                salt = row["salt"]
                salt = base64.b64decode(salt)
                cursor.execute("""
                    SELECT authkey FROM users WHERE id = %s;
                """, (userid,),
                )
                base_key = bytes.fromhex(cursor.fetchone()["authkey"])
                key1 = HKDF(
                algorithm=hashes.SHA256(),
                length=32,
                salt=None,
                    info=b'otpsecretencryption',
                )
                key = key1.derive(base_key)
                nonce = salt[:12]
                tag = salt[12:]
                secret = decrypt(enc_secret, key, tag, nonce)
                secret = secret.decode().strip()
                if verify_totp_once(gmail_otp, userid, secret, user_otp):
                    return "VALID"
                else:
                    return "INVALID"
            elif method == "gmail":
                stored = gmail_otp.getdel(key)
                if stored is None:
                    return "expired"
                user_otp = user_otp.strip().upper()
                if not hmac.compare_digest(stored, user_otp):
                    return "INVALID"
                return "VALID"
    if cmd == "gen":
            characters = string.ascii_uppercase + string.digits
            otp = ''.join(
                secrets.choice(characters)
                for _ in range(6)
            )
            gmail_otp.set(
                key,
                otp
            )

            cursor.execute("""
                SELECT email FROM emails WHERE userid = %s;
            """, (userid,),
            )
            email = cursor.fetchone()["email"]
            gmail_otp.expire(key, 600)
            queue_email(background_tasks, otpVE, username, otp, email)
            return "queued"
    if cmd == "verG":
        stored = gmail_otp.getdel(key)
        if stored is None:
            return "expired"
        user_otp = user_otp.strip().upper()
        if not hmac.compare_digest(stored, user_otp):
            return "INVALID"
        return "VALID"
    

            
def generate_otp_code():
    characters = string.ascii_uppercase + string.digits
    return ''.join(secrets.choice(characters) for _ in range(6))

def session_id_checker(U_session_id, un):
    stored_session = session.hgetall(f"session_id:{un}")

    if not U_session_id or not stored_session:
        return "INVALID"

    try:
        session_bytes = bytes.fromhex(U_session_id)
    except (ValueError, TypeError):
        return "INVALID"

    client_hash = hashlib.sha256(session_bytes).hexdigest()

    server_hash = stored_session.get("session_token", "")

    if hmac.compare_digest(server_hash, client_hash):
        return "VALID"

    return "INVALID"

def session_expired_response():
    return {"ERROR": "Session expired, login again"}


def require_active_session(data):
    if session_id_checker(getattr(data, "session_id", None), data.username) != "VALID":
        return session_expired_response()
    return None


def get_session_status(username, session_id, ip):
    key = f"session_id:{username}"
    stored_session = session.hgetall(key)
    if not session_id or not stored_session:
        return {
            "authenticated": False,
            "session_valid": False,
            "session_ttl": 0,
            "ip_match": False,
        }

    session_valid = session_id_checker(session_id, username) == "VALID"
    ip_match = stored_session.get("ip") == ip
    ttl = session.ttl(key)
    return {
        "authenticated": session_valid,
        "session_valid": session_valid,
        "session_ttl": ttl if ttl > 0 else 0,
        "ip_match": ip_match,
    }

def registration_key(username):
    return f"signup:{username}"


def profile_challenge_key(username, request_id):
    return f"profile:{username}:{request_id}"


def team_invite_key(userid, teamid, role):
    return f"TeamInvite:{userid}:{teamid}:{role}"


def pending_team_invite(userid):
    for key in invites.scan_iter(match=f"TeamInvite:{userid}:*:*"):
        invite = invites.hgetall(key)
        if str(invite.get("valid", "")).lower() in ("true", "1"):
            return invite
    return None


def rebuild_teamconfig(cursor, teamid, ownerid):
    cursor.execute(
        """
        INSERT INTO teamconfig (ownerid, admins, members, teamid)
        VALUES (
            %s,
            COALESCE((SELECT jsonb_agg(id) FROM users WHERE admin = %s), '[]'::jsonb),
            COALESCE((SELECT jsonb_agg(id) FROM users WHERE member = %s), '[]'::jsonb),
            %s
        )
        ON CONFLICT (teamid)
        DO UPDATE SET
            ownerid = EXCLUDED.ownerid,
            admins = EXCLUDED.admins,
            members = EXCLUDED.members;
        """,
        (ownerid, teamid, teamid, teamid),
    )


def send_registration_otp(username, email, background_tasks=None):
    otp = generate_otp_code()
    key = registration_key(username)
    gmail_otp.hset(
        key,
        mapping={
            "otp": otp,
            "email": email
        },
    )
    gmail_otp.expire(key, 600)
    queue_email(background_tasks, otpVE, username, otp, email)
    return "queued"


def verify_registration_otp(username, email, user_otp):
    key = registration_key(username)
    pending = consume_otp_hash(gmail_otp, key)
    if not pending:
        return "expired"
    if (
        pending.get("email") != email
    ):
        return "INVALID"
    otp = user_otp.strip().upper()
    if not hmac.compare_digest(pending.get("otp", ""), otp):
        return "INVALID"
    return "VALID"



    
# =========================
# time_equilizer
# =========================

def time_equilizer(started_time):
    time_taken = time.time() - started_time
    target = 0.30
    required = target - time_taken
    if required > 0:
        time.sleep(required)



# =========================
# ip
# =========================

def get_client_ip(request: Request):
    trusted_proxies = {"127.0.0.1", "::1", "localhost"}
    client_host = request.client.host if request.client else ""
    x_forwarded_for = request.headers.get("x-forwarded-for")
    if x_forwarded_for and client_host in trusted_proxies:
        ip = x_forwarded_for.split(",")[0].strip()
    else:
        ip = client_host
    try:
        return str(ipaddress.ip_address(ip))
    except ValueError:
        return client_host


def reject_blocked_ip(ip):
    """Return the common API error when the request IP is currently blocked."""
    if check(ip) == "IP BLOCKED":
        return {
            "ERROR": "You have been blocked for violating policies, Try again later"
        }
    return None


def encrypter(data, un, cursor):
    nonce_gen = os.urandom(12)
    cursor.execute("""
        SELECT authkey FROM users WHERE id = %s;""",
        (un,),
    )
    hash_key = cursor.fetchone()["authkey"]
    key1 = HKDF(
    algorithm=hashes.SHA256(),
    length=32,
    salt=None,
    info=b'otpsecretencryption',
    )
    key = key1.derive(bytes.fromhex(hash_key))
    nonce = nonce_gen
    encrypted_data = ChaCha20_Poly1305.new(key=key, nonce=nonce)
    ciphertext, tag = encrypted_data.encrypt_and_digest(data.encode())
    salt_payload = nonce + tag 
    salt_payload = base64.b64encode(salt_payload).decode()
    secret = ciphertext
    secret = base64.b64encode(ciphertext).decode()
    sys_logger.info(f"Secret was encrypted for user -{un}-")
    return {
        "secret" : secret,
        "salt_payload" : salt_payload
    }

# =========================
# New IP alerting -- under development
# =========================

def IP_check(userid, ip , cursor):
    cursor.execute("""
        SELECT ip FROM iptracking WHERE userid = %s;
""", (userid,))
    result = cursor.fetchone()
    if result is None:
        return "new user"
    old_ip = result["ip"]
    if ip == old_ip:
        return "current_ip"
    else:
        return "new_ip"
        
async def enable_otp(data, request: Request, conn):
    cursor = conn.cursor()
    start = time.time()
    request_id = uuid.uuid4().hex
    ip = get_client_ip(request)
    blocked_response = reject_blocked_ip(ip)
    if blocked_response:
        return blocked_response
    
    username = data.username
    count = ratelimitin.incr(f"rlpost:{username}")
    cursor.execute(
        """
    SELECT * FROM users WHERE username = %s""",
        (username,),
    )
    
    result = cursor.fetchone()
    if not result:
        Log_event(login_logger, "/enableotp", "WARNING", "Invalid username entered", f"{username}", f"{ip}", f"{request_id}")
        nonce = os.urandom(32).hex()
        salt = os.urandom(32).hex()
        time_equilizer(start)
        return {"nonce" : nonce,
                "request_id" : request_id}
    else:
        if ratelimitin.exists(f"rlpost:{username}"):
            if int(ratelimitin.get(f"rlpost:{username}")) >= 10:
                temp_blocked.set(f"blocked:{username}", "1")
                temp_blocked.expire(f"blocked:{username}", 3600)
                ratelimitin.delete(f"rlpost:{username}")
                Log_event(login_logger, "/enableotp", "WARNING", "Rapid requests detected", f"{username}", f"{ip}", f"{request_id}")
                return {"ERROR": "Too many requests, try again in an hour"}
            else:
                pass
        else:
            ratelimitin.set(f"rlpost:{username}", "0")
        
        if temp_blocked.exists(f"blocked:{username}"):
            Log_event(login_logger, "/enableotp", "CRITICAL", "User blocked", f"{username}", f"{ip}", f"{request_id}")
            return {"ERROR": "You are temporarily blocked, try again in an hour"}
        nonce = os.urandom(32).hex()
        Log_event(sys_logger, "/enableotp", "INFO", "Nonce generated", f"{username}", f"{ip}", f"{request_id}")
        cursor.execute("SELECT id FROM users WHERE username = %s", (username,))
        userid = cursor.fetchone()["id"]
        cursor.execute(
            "SELECT 1 FROM twofa WHERE userid = %s",
            (userid,)
        ) 
        ifexists = cursor.fetchone()
        if ifexists:
            return {"ERROR" : "otp Already enabled"}
        key = f"{username}:otp"
        nonce_db.hset(
        key,
         mapping={
            "value": nonce,
            },
        )
        Log_event(sys_logger, "/enableotp", "INFO", "Temporary nonce stored", f"{username}", f"{ip}", f"{request_id}")
        Log_event(sys_logger, "/enableotp", "INFO", "temperory Nonce Stored", f"{username}", f"{ip}", f"{request_id}")
        nonce_db.expire(key, 300)
        if count == 1:
            ratelimitin.expire(f"rlpost:{username}", 3600)
        cursor.execute(
    "SELECT salt FROM salt WHERE userid = %s",
    (userid,)
)
        salt = cursor.fetchone()["salt"]
        Log_event(sys_logger, "/enableotp", "INFO", "Nonce generated", f"{username}", f"{ip}", f"{request_id}")
        time_equilizer(start)
        
        return {
            "nonce": nonce,
            "request_id" : request_id
            }
    

async def enable_otp2(data, request, conn):
    cursor = conn.cursor()
    try:
        start = time.time()
        signature = data.signature
        un = data.username
        request_id = data.request_id
        method = data.method
        ip = get_client_ip(request)
        blocked_response = reject_blocked_ip(ip)
        if blocked_response:
            return blocked_response
        signature_bytes = bytes.fromhex(signature)
        cursor.execute(
        """
        SELECT * FROM users WHERE username = %s""",
        (un,),
        )
        result = cursor.fetchone()
        if not result:
            time_equilizer(start)
            return {"ERROR": f"Username or password is wrong"}

        if data.session_id:
            session_error = require_active_session(data)
            if session_error:
                return session_error

        nonce_data = nonce_db.hgetall(f"{un}:otp")
        if not nonce_data:
            blocker(ip, request_id)
            return {"ERROR": "Session expired"}

        user_id = result["id"]
        hash = result["authkey"]

        server_signature = hmac.new(
            bytes.fromhex(hash), bytes.fromhex(nonce_data["value"]), hashlib.sha256
        ).digest()
        Log_event(sys_logger, "/enable_otp2", "INFO", "Server signature generated", f"{un}", f"{ip}", f"{request_id}")
        if not hmac.compare_digest(signature_bytes, server_signature):
            ratelimitin.incr(f"rlpost:{un}")
            Log_event(login_logger, "/enable_otp2", "WARNING", "Invalid signature", f"{un}", f"{ip}", f"{request_id}")
            blocker(ip, request_id)
            time_equilizer(start)
            return {"ERROR": f"Username or password is wrong"}
        Log_event(login_logger, "/enable_otp2", "INFO", "Valid signature", f"{un}", f"{ip}", f"{request_id}")
        if method == "totp":
            secret = pyotp.random_base32()
            totp = pyotp.TOTP(secret)
            uri = totp.provisioning_uri(
                name=un,
                issuer_name="Coffre",
            )
            enabled = True
            encrypt = encrypter(secret, user_id, cursor)
            enc_secret = encrypt["secret"]
            salt = encrypt["salt_payload"]
            img = qrcode.make(uri)
            buffer = io.BytesIO()
            img.save(
            buffer,
            format="PNG"
            )
            img_b64 = base64.b64encode(
                buffer.getvalue()
            ).decode()
            cursor.execute(
            """
            INSERT INTO twofa(userid, method, enabled, secret, salt) VALUES (%s,%s,%s,%s,%s)
    """,(user_id, method, enabled, enc_secret, salt) )
            Log_event(otp_logger, "/enable_otp2", "INFO", f"OTP enabled({method})", f"{un}", f"{ip}", f"{request_id}")
            conn.commit()
            time_equilizer(start)
            return {"secret_code": secret,
                    "qr" : img_b64}
        elif method == "gmail":
            enabled = True
            cursor.execute(
            """
            INSERT INTO twofa(userid, method, enabled, secret, salt) VALUES (%s,%s,%s,%s,%s)
    """,(user_id, method, enabled, None, None) )
            Log_event(otp_logger, "/enable_otp2", "INFO", f"OTP enabled({method})", f"{un}", f"{ip}", f"{request_id}")
            conn.commit()
            time_equilizer(start)
            return {"message" : "Otp enabled successfully"}
        else:
            return {"ERROR": "Invalid 2FA method"}

    except Exception as e:
        conn.rollback()
        Log_event(sys_logger, "/enableotp2", "ERROR", traceback.format_exc(), f"{un}", f"{ip}", f"{request_id}")
        return {"ERROR": "Something Went Wrong"}



def newuser1(data, request: Request, background_tasks, conn):
    cursor = conn.cursor()
    un = data.username
    ip = get_client_ip(request)
    request_id = uuid.uuid4().hex
    try:
        email = data.email
        blocked_response = reject_blocked_ip(ip)
        if blocked_response:
            return blocked_response

        cursor.execute(
            """
            SELECT * FROM users WHERE username = %s;
            """,
            (un,),
        )
        result = cursor.fetchone()

        if result:
            Log_event(
                login_logger,
                "/newuser",
                "WARNING",
                "Duplicate username registration attempt",
                f"{un}",
                f"{ip}",
                f"{request_id}",
            )
            return {"ERROR": "Invalid username"}

        send_registration_otp(un, email, background_tasks)
        Log_event(
            otp_logger,
            "/newuser1",
            "INFO",
            "Signup OTP sent",
            f"{un}",
            f"{ip}",
            f"{request_id}",
        )
        return {"message": "Otp Sent", "sent on": email}
    except Exception:
        conn.rollback()
        Log_event(
            sys_logger,
            "/newuser1",
            "ERROR",
            traceback.format_exc(),
            f"{un}",
            f"{ip}",
            f"{request_id}",
        )
        return {"ERROR": "Something Went Wrong"}


async def newuser2(data, request: Request, background_tasks, conn):
    cursor = conn.cursor()
    clean_un = data.username
    ip = get_client_ip(request)
    request_id = uuid.uuid4().hex
    try:
        hp = data.hash
        salt = data.salt
        email = data.email
        otp = data.otp
        blocked_response = reject_blocked_ip(ip)
        if blocked_response:
            return blocked_response

        cursor.execute(
            """
            SELECT * FROM users WHERE username = %s;
            """,
            (clean_un,),
        )
        result = cursor.fetchone()

        if result:
            Log_event(
                login_logger,
                "/newuser",
                "WARNING",
                "Duplicate username registration attempt",
                f"{clean_un}",
                f"{ip}",
                f"{request_id}",
            )
            return {"ERROR": "Invalid username"}

        status = verify_registration_otp(clean_un, email, otp)
        if status == "VALID":
            Log_event(
                otp_logger,
                "/newuser2",
                "INFO",
                "OTP verified",
                f"{clean_un}",
                f"{ip}",
                f"{request_id}",
            )
        elif status == "INVALID":
            blocker(ip, request_id)
            Log_event(
                otp_logger,
                "/newuser2",
                "WARNING",
                "Invalid OTP entered",
                f"{clean_un}",
                f"{ip}",
                f"{request_id}",
            )
            return {"ERROR": "Wrong OTP"}
        elif status == "expired":
            return {"ERROR": "OTP Expired!"}

        cursor.execute(
            """
            INSERT INTO users (username, authkey)
            VALUES (%s, %s);
            """,
            (clean_un, hp),
        )
        cursor.execute("SELECT id FROM users WHERE username = %s;", (clean_un,))
        user_id = cursor.fetchone()["id"]
        cursor.execute(
            """
            INSERT INTO emails (userid, email)
            VALUES (%s, %s);
            """,
            (user_id, email),
        )
        Log_event(
            db_logger,
            "/newuser",
            "INFO",
            "User authkey stored",
            f"{clean_un}",
            f"{ip}",
            f"{request_id}",
        )
        cursor.execute(
            """
            INSERT INTO iptracking (userid, ip) VALUES (%s, %s);
            """,
            (user_id, ip),
        )
        Log_event(
            db_logger,
            "/newuser",
            "INFO",
            "IP stored",
            f"{clean_un}",
            f"{ip}",
            f"{request_id}",
        )
        cursor.execute(
            """
            INSERT INTO salt (userid, salt)
            VALUES (%s, %s);
            """,
            (user_id, salt),
        )
        Log_event(
            db_logger,
            "/newuser",
            "INFO",
            "Salt stored",
            f"{clean_un}",
            f"{ip}",
            f"{request_id}",
        )
        conn.commit()
        Log_event(
            login_logger,
            "/newuser",
            "INFO",
            "New user created",
            f"{clean_un}",
            f"{ip}",
            f"{request_id}",
        )
        queue_email(background_tasks, welcome, clean_un, email)
        return {"message": "User created successfully", "username": clean_un}
    except Exception:
        conn.rollback()
        Log_event(
            sys_logger,
            "/newuser2",
            "ERROR",
            traceback.format_exc(),
            f"{clean_un}",
            f"{ip}",
            f"{request_id}",
        )
        return {"ERROR": "Something Went Wrong"}





async def store_password(data, request, conn):
    cursor = conn.cursor()
    start = time.time()
    username = data.username
    request_id = uuid.uuid4().hex
    ip = get_client_ip(request)
    blocked_response = reject_blocked_ip(ip)
    if blocked_response:
        return blocked_response
    cursor.execute(
        """
    SELECT * FROM users WHERE username = %s""",
        (username,),
    )
    result = cursor.fetchone()
    if not result:
        Log_event(login_logger, "/storepassword", "WARNING", "Invalid username entered", f"{username}", f"{ip}", f"{request_id}")
        nonce = os.urandom(32).hex()
        salt = os.urandom(32).hex()
        time_equilizer(start)
        return {"nonce" : nonce,
                "salt" : salt,
                "request_id" : request_id}
    else:
        session_error = require_active_session(data)
        if session_error:
            return session_error
        if ratelimitin.exists(f"rlpost:{username}"):
            if int(ratelimitin.get(f"rlpost:{username}")) >= 10:
                temp_blocked.set(f"blocked:{username}", "1")
                temp_blocked.expire(f"blocked:{username}", 3600)
                ratelimitin.delete(f"rlpost:{username}")
                Log_event(login_logger, "/storepassword", "WARNING", "Rapid requests detected", f"{username}", f"{ip}", f"{request_id}")
                return {"ERROR": "Too many requests"}
            else:
                pass
        else:
            ratelimitin.set(f"rlpost:{username}", "0")
        if temp_blocked.exists(f"blocked:{username}"):
            Log_event(login_logger, "/storepassword", "CRITICAL", "User blocked", f"{username}", f"{ip}", f"{request_id}")
            return {"ERROR": "You are temporarily blocked, try again after some time"}
        nonce = os.urandom(32).hex()
        Log_event(sys_logger, "/storepassword", "INFO", "Nonce generated", f"{username}", f"{ip}", f"{request_id}")
        key = f"post:{username}"
        nonce_db.hset(
            key,
            mapping={
                "value": nonce,
            },
        )
        Log_event(sys_logger, "/storepassword", "INFO", "Temporary nonce stored", f"{username}", f"{ip}", f"{request_id}")
        nonce_db.expire(f"post:{username}", 300)
        count = ratelimitin.incr(f"rlpost:{username}")
        if count == 1:
            ratelimitin.expire(f"rlpost:{username}", 3600)
        cursor.execute("SELECT id FROM users WHERE username = %s", (username,))
        userid = cursor.fetchone()["id"]
        cursor.execute(
    "SELECT salt FROM salt WHERE userid = %s",
    (userid,)
)
        salt = cursor.fetchone()["salt"]
        time_equilizer(start)
        return {
            "nonce": nonce,
            "salt" : salt,
            "request_id" : request_id
            }


async def store_password2(Pdata, request, conn):
    cursor = conn.cursor()
    try:
        signature = Pdata.signature
        un = Pdata.username
        password_name = Pdata.password_name
        usernametobestored = Pdata.usernametbs
        enc_data = Pdata.enc_data
        hint = Pdata.hint
        ip = get_client_ip(request)
        blocked_response = reject_blocked_ip(ip)
        if blocked_response:
            return blocked_response
        request_id = Pdata.request_id
        signature_bytes = bytes.fromhex(signature)
        cursor.execute(
        """
        SELECT * FROM users WHERE username = %s""",
        (un,),
        )
        result = cursor.fetchone()
        if not result:
            return {"ERROR": f"Username or password is wrong"}

        session_error = require_active_session(Pdata)
        if session_error:
            return session_error

        data = nonce_db.hgetall(f"post:{un}")
        if not data:
            blocker(ip, request_id)
            return {"ERROR": "Session expired"}

        user_id = result["id"]
        hash = result["authkey"]
        server_signature = hmac.new(
            bytes.fromhex(hash), bytes.fromhex(data["value"]), hashlib.sha256
        ).digest()
        Log_event(sys_logger, "/storepassword2", "INFO", "Server signature generated", f"{un}", f"{ip}", f"{request_id}")
        if not hmac.compare_digest(signature_bytes, server_signature):
            ratelimitin.incr(f"rlpost:{un}")
            Log_event(login_logger, "/storepassword2", "WARNING", "Invalid signature", f"{un}", f"{ip}", f"{request_id}")
            blocker(ip, request_id)
            return {
                "ERROR": f"Username or password is wrong"
            }
        Log_event(login_logger, "/storepassword2", "INFO", "Valid signature", f"{un}", f"{ip}", f"{request_id}")
        
        sys_logger.info(f"base64 encrypted transmitted data was decrypted form base64 at store-password")
        cursor.execute(
            "SELECT accountusername FROM stored where userid = %s", (user_id,))
        raw_names = cursor.fetchall()
        names = []
        for name in raw_names:
            names.append(name["accountusername"])
        if password_name in names:
            return {"ERROR" : "You have Already stored a password with this name"}
        cursor.execute(
            "INSERT INTO stored (userid,accountusername ,encdata ,servicename) VALUES (%s,  %s, %s, %s)",
            (user_id, usernametobestored ,enc_data ,password_name),
        )
        Log_event(db_logger, "/storepassword2", "INFO", "Password stored", f"{un}", f"{ip}", f"{request_id}")
        conn.commit()
        nonce_db.delete(f"post:{un}")
        ratelimitin.delete(f"rlpost:{un}")
        cursor.execute(
        "SELECT id FROM stored where userid = %s AND accountusername = %s AND servicename = %s", (user_id, usernametobestored, password_name),)
        password_id = cursor.fetchone()
        password_id = password_id["id"]
        cursor.execute(
        "INSERT INTO hints (password_id,hint,userid) VALUES (%s,  %s, %s)",
        (password_id, hint, user_id),
        )
        conn.commit()
            

        return {"message": "Password stored successfully"}

    except Exception as e:
        conn.rollback()
        Log_event(sys_logger, "/store-password2", "ERROR", traceback.format_exc(), f"{un}", f"{ip}", f"{request_id}")
        sys_logger.error(f"Error: -{str(e)} occured at store-password")
        return {
            "ERROR": "Something went wrong",
        }


async def get_enc(data, request, conn):
    cursor = conn.cursor()
    start = time.time()
    username = data.username
    ip = get_client_ip(request)
    blocked_response = reject_blocked_ip(ip)
    if blocked_response:
        return blocked_response
    request_id = uuid.uuid4().hex
    cursor.execute(
        """
    SELECT * FROM users WHERE username = %s""",
        (username,),
    )
    result = cursor.fetchone()
    if not result:
        Log_event(login_logger, "/getenc", "WARNING", "Invalid username entered", f"{username}", f"{ip}", f"{request_id}")
        time_equilizer(start)
        nonce = os.urandom(32).hex()
        salt = os.urandom(32).hex()
        time_equilizer(start)
        return {"nonce" : nonce,
                "salt" : salt,
                "request_id" : request_id}
    else:
        session_error = require_active_session(data)
        if session_error:
            return session_error
        if ratelimitin.exists(f"rlpost:{username}"):
            if int(ratelimitin.get(f"rlpost:{username}")) >= 10:
                temp_blocked.set(f"blocked:{username}", "1")
                temp_blocked.expire(f"blocked:{username}", 3600)
                ratelimitin.delete(f"rlpost:{username}")
                Log_event(login_logger, "/getenc", "WARNING", "Rapid requests detected", f"{username}", f"{ip}", f"{request_id}")
                return {"ERROR": "Too many requests, try again in an hour"}
            else:
                pass
            if temp_blocked.exists(f"blocked:{username}"):
                Log_event(login_logger, "/getenc", "CRITICAL", "User blocked", f"{username}", f"{ip}", f"{request_id}")
                return {"ERROR": "You are temporarily blocked, try again after some time"}
            else:
                pass
        else:
            ratelimitin.set(f"rlpost:{username}", "0")
        nonce = os.urandom(32)
        Log_event(sys_logger, "/getenc", "INFO", "Nonce generated", f"{username}", f"{ip}", f"{request_id}")
        key = f"get:{username}"
        nonce_db.hset(
            key,
            mapping={
                "value": nonce.hex(),
                "request_id": request_id,
                "ip": ip,
            },
        )
        Log_event(sys_logger, "/getenc", "INFO", "Temporary nonce stored", f"{username}", f"{ip}", f"{request_id}")
        nonce_db.expire(f"get:{username}", 300)
        sys_logger.info(f"Nonce was generated for user -{username}- at getting-encrpyted-data")
        cursor.execute("SELECT id FROM users WHERE username = %s", (username,))
        userid = cursor.fetchone()["id"]
        cursor.execute(
    "SELECT salt FROM salt WHERE userid = %s",
    (userid,)
)
        salt = cursor.fetchone()["salt"]
        time_equilizer(start)
        return {
            "nonce": nonce.hex(),
            "salt" : salt,
            "request_id" : request_id
            }


async def get_enc2(Pdata, request, background_tasks, conn):
    cursor = conn.cursor()
    try:
        signature = Pdata.signature
        un = Pdata.username
        password_name = Pdata.password_name
        unS = Pdata.usernameS
        ip = get_client_ip(request)
        blocked_response = reject_blocked_ip(ip)
        if blocked_response:
            return blocked_response
        request_id = Pdata.request_id
        signature_bytes = bytes.fromhex(signature)
        cursor.execute(
        """
        SELECT * FROM users WHERE username = %s""",
        (un,),
        )
        result = cursor.fetchone()
        if not result:
            return {"ERROR": f"Username or password is wrong"}

        session_error = require_active_session(Pdata)
        if session_error:
            return session_error

        data = nonce_db.hgetall(f"get:{un}")
        if not data:
            blocker(ip, request_id)
            return {"ERROR": "Session expired"}

        hash = result["authkey"]
        server_signature = hmac.new(
            bytes.fromhex(hash), bytes.fromhex(data["value"]), hashlib.sha256
        ).digest()
        Log_event(sys_logger, "/getenc2", "INFO", "Server signature generated", f"{un}", f"{ip}", f"{request_id}")
        if not hmac.compare_digest(signature_bytes, server_signature):
            ratelimitin.incr(f"rlpost:{un}")
            Log_event(login_logger, "/getenc2", "WARNING", "Invalid signature", f"{un}", f"{ip}", f"{request_id}")
            blocker(ip, request_id)
            return {"ERROR": f"Username or password is wrong"}
        Log_event(login_logger, "/getenc2", "INFO", "Valid signature", f"{un}", f"{ip}", f"{request_id}")
        user_id = result["id"]
        cursor.execute(
            """
            SELECT encdata FROM stored WHERE userid = %s AND servicename = %s AND accountusername=%s""",
            (user_id, password_name, unS),
        )
        enc = cursor.fetchone()["encdata"]
        if isinstance(enc, memoryview):
            enc = enc.tobytes()
        cursor.execute(
            """
            SELECT accountusername FROM stored WHERE userid = %s AND servicename = %s""",
            (user_id, password_name),
        )
        username_A = cursor.fetchone()["accountusername"]
        nonce_db.delete(f"get:{un}")
        nonce_db.delete(f"post:{un}")
        cursor.execute("""
                SELECT email FROM emails WHERE userid = %s;
            """, (user_id,),
            )
        email = cursor.fetchone()["email"]
        time = datetime.now(timezone.utc)
        Log_event(db_logger, "/getenc2", "INFO", "Password retrieved", f"{un}", f"{ip}", f"{request_id}")
        queue_email(background_tasks, passretrieved, un, time, ip, username_A, password_name, email)
        return {"encdata": enc,
                "username_A": username_A}
    except Exception as e:
        conn.rollback()
        Log_event(db_logger, "/getenc2", "WARNING", "Failed password retrieval", f"{un}", f"{ip}", f"{request_id}")
        sys_logger.error(f"Error: -{str(e)} occured at ")
        return {"ERROR":  f"Something Went Wrong"}


async def login(data, request, background_tasks, conn):
    cursor = conn.cursor()
    start = time.time()
    username = data.username
    ip = get_client_ip(request)
    blocked_response = reject_blocked_ip(ip)
    if blocked_response:
        return blocked_response
    request_id = uuid.uuid4().hex
    cursor.execute(
        """
    SELECT * FROM users WHERE username = %s""",
        (username,),
    )
    result = cursor.fetchone()
    if not result:
        Log_event(login_logger, "/login", "WARNING", "Invalid username entered", f"{username}", f"{ip}", f"{request_id}")
        time_equilizer(start)
        nonce = os.urandom(32).hex()
        salt = os.urandom(32).hex()
        return {"nonce" : nonce,
                "salt" : salt,
                "request_id" : request_id}
    else:
        if ratelimitin.exists(f"rlpost:{username}"):
            if int(ratelimitin.get(f"rlpost:{username}")) >= 10:
                temp_blocked.set(f"blocked:{username}", "1")
                temp_blocked.expire(f"blocked:{username}", 3600)
                ratelimitin.delete(f"rlpost:{username}")
                Log_event(login_logger, "/login", "WARNING", "Rapid requests detected", f"{username}", f"{ip}", f"{request_id}")
                return {"ERROR": "Too many requests, try again in an hour"}
            else:
                pass
        else:
            ratelimitin.set(f"rlpost:{username}", "0")
        nonce = os.urandom(32)
        Log_event(sys_logger, "/login", "INFO", "Nonce generated", f"{username}", f"{ip}", f"{request_id}")
        key = f"login:{username}"
        nonce_db.hset(
            key,
            mapping={
                "value": nonce.hex(),
                "request_id": request_id,
                "ip": ip,
            },
        )
        Log_event(sys_logger, "/login", "INFO", "Temporary nonce stored", f"{username}", f"{ip}", f"{request_id}")
        nonce_db.expire(f"login:{username}", 300)
        sys_logger.info(f"Nonce was generated for user -{username}- at get-backup")
        cursor.execute("SELECT id FROM users WHERE username = %s", (username,))
        userid = cursor.fetchone()["id"]
        cursor.execute(
            "SELECT salt FROM salt WHERE userid = %s",
            (userid,)
        )
        salt_row = cursor.fetchone()
        if not salt_row:
            Log_event(sys_logger, "/login", "ERROR", "Missing salt for user", f"{username}", f"{ip}", f"{request_id}")
            return {"ERROR": "Something Went Wrong"}
        cursor.execute("SELECT enabled,method FROM twofa WHERE userid = %s", (userid,))
        otp_status = cursor.fetchone()
        if otp_status and otp_status["method"] == "gmail":
            otp_generation_and_verfication(username, "67", cursor, "gen", background_tasks)
        
        salt = salt_row["salt"]
        time_equilizer(start)
        return {
            "nonce": nonce.hex(),
            "salt": salt,
            "request_id": request_id
                }


async def login2(data, request, background_tasks, conn):
    cursor = conn.cursor()
    try:
        signature = data.signature
        un = data.username
        user_otp = data.otp
        ip = get_client_ip(request)
        request_id = data.request_id
        blocked_response = reject_blocked_ip(ip)
        if blocked_response:
            return blocked_response

        cursor.execute(
            "SELECT * FROM users WHERE username = %s",
            (un,),
        )
        result = cursor.fetchone()
        if not result:
            return {"ERROR": "Username or password is wrong"}

        try:
            signature_bytes = bytes.fromhex(signature)
        except (ValueError, TypeError):
            blocker(ip, request_id)
            return {"ERROR": "Username or password is wrong"}

        if len(signature_bytes) != 32:
            blocker(ip, request_id)
            return {"ERROR": "Username or password is wrong"}
        data = nonce_db.hgetall(f"login:{un}")

        if not data:
            blocker(ip, request_id)
            return {"ERROR": "Username or password is wrong"}
        if data.get("request_id") != request_id:
            nonce_db.delete(f"login:{un}")
            blocker(ip, request_id)
            Log_event(login_logger, "/login2", "WARNING", "Nonce request id mismatch", f"{un}", f"{ip}", f"{request_id}")
            return {"ERROR": "Username or password is wrong"}
        hash = result["authkey"]
        server_signature = hmac.new(
           bytes.fromhex(hash), bytes.fromhex(data["value"]), hashlib.sha256
        ).digest()
        Log_event(sys_logger, "/login2", "INFO", "Server signature generated", f"{un}", f"{ip}", f"{request_id}")
        if not hmac.compare_digest(signature_bytes, server_signature):
            ratelimitin.incr(f"rlpost:{un}")
            Log_event(login_logger, "/login2", "WARNING", "Invalid signature", f"{un}", f"{ip}", f"{request_id}")
            blocker(ip, request_id)
            return {"ERROR": f"Username or password is wrong"}
        
        Log_event(login_logger, "/login2", "INFO", "Valid signature", f"{un}", f"{ip}", f"{request_id}")
        user_id = result["id"]
        nonce_db.delete(f"login:{un}")
        nonce_db.delete(f"list:{un}")
        nonce_db.delete(f"post:{un}")
        cursor.execute("SELECT enabled,method FROM twofa WHERE userid = %s", (user_id,))
        otp_status = cursor.fetchone()
        if otp_status and otp_status["enabled"]:
            if otp_status["method"] == "totp":
                status = otp_generation_and_verfication(un, user_otp, cursor, "ver")
                if status == "VALID":
                    Log_event(otp_logger, "/login2", "INFO", "OTP verified", f"{un}", f"{ip}", f"{request_id}")
                    pass
                elif status == "INVALID":
                    blocker(ip, request_id)
                    Log_event(otp_logger, "/login2", "WARNING", "Invalid OTP entered", f"{un}", f"{ip}", f"{request_id}")
                    return {"ERROR" : "Wrong OTP"}
                elif status == "expired":
                    return {"ERROR" : "OTP Expired!"}
            elif otp_status["method"] == "gmail":
                status =  otp_generation_and_verfication(un, user_otp, cursor, "ver")
                if status == "VALID":
                    Log_event(otp_logger, "/login2", "INFO", "OTP verified", f"{un}", f"{ip}", f"{request_id}")
                    pass
                elif status == "INVALID":
                    blocker(ip, request_id)
                    Log_event(otp_logger, "/login2", "WARNING", "Invalid OTP entered", f"{un}", f"{ip}", f"{request_id}")
                    return {"ERROR" : "Wrong OTP"}
                elif status == "expired":
                    return {"ERROR" : "OTP Expired!"}
        cursor.execute("""
                SELECT email FROM emails WHERE userid = %s;
            """, (user_id,),
            )
        email = cursor.fetchone()["email"]
        ip_check = IP_check(user_id, ip , cursor)
        if ip_check == "current_ip":
            pass
        else:
            queue_email(background_tasks, validlogin, un, ip, email)
        Log_event(sys_logger, "/login2", "INFO", "session_id", f"{un}", f"{ip}", f"{request_id}")
        session_token = secrets.token_bytes(32)
        hashed_session_token = hashlib.sha256(session_token).hexdigest()
        key = f"session_id:{un}"
        session.hset(
            key,
            mapping={
                "session_token": hashed_session_token,
                "request_id": request_id,
                "ip": ip,
            },
            )
        session.expire(key, 1800)


        invites_d = pending_team_invite(user_id)
        if not invites_d:
            return {"message": "Login successful", "session_token": session_token.hex(), "request_id": request_id}
        owner = invites_d.get("from")
        teamname = invites_d.get("teamname")
        role = invites_d.get("role", "member")
        return {
            "message": "Login successful",
            "session_token": session_token.hex(),
            "invite": "You have been invited to a team, please accept the invite to proceed",
            "request_id": request_id,
            "from": owner,
            "teamname": teamname,
            "role": role,
        }
    except Exception as e:
        conn.rollback()
        Log_event(sys_logger, "/login2", "ERROR", traceback.format_exc(), f"{un}", f"{ip}", f"{request_id}")
        sys_logger.error(f"Error: -{str(e)} occured at get-backup")
        return {"ERROR": "Something went wrong"}

async def accept_invite(data, request, conn, background_tasks):
    cursor = conn.cursor()
    start = time.time()
    username = data.username
    teamname = data.teamname
    request_id = uuid.uuid4().hex
    ip = get_client_ip(request)

    blocked_response = reject_blocked_ip(ip)
    if blocked_response:
        return blocked_response

    cursor.execute("""SELECT * FROM users WHERE username = %s""",(username,),)
    result = cursor.fetchone()
    if not result:
        Log_event(login_logger, "/accept_invite", "WARNING", "Invalid username entered", f"{username}", f"{ip}", f"{request_id}")
        time_equilizer(start)
        return {"message" : "if your request was valid, you will be able to login to the team with your credentials"}

    session_error = require_active_session(data)
    if session_error:
        return session_error
    userid = result["id"]

    cursor.execute(
        "SELECT id, userid FROM teams WHERE teamname = %s;",
        (teamname,),
    )
    team_row = cursor.fetchone()
    if not team_row:
        return {"ERROR": "Invite expired or not found"}
    teamid = team_row["id"]
    invite_key = team_invite_key(userid, teamid, "member")
    invites_d = invites.hgetall(invite_key)
    if not invites_d:
        return {"ERROR": "Invite expired or not found"}
    if str(invites_d.get("valid", "")).lower() not in ("true", "1"):
        return {"ERROR": "Invite expired or invalid"}
    cursor.execute("SELECT member, admin FROM users WHERE id = %s;", (userid,))
    current_role = cursor.fetchone()
    if current_role["member"] not in (None, teamid) or current_role["admin"] not in (None, teamid):
        return {"ERROR": "You already belong to another team"}
    cursor.execute(
        """
        UPDATE users
        SET member = %s,
            admin = NULL
        WHERE id = %s;
        """,
        (teamid, userid),
    )
    rebuild_teamconfig(cursor, teamid, team_row["userid"])
    invites.delete(invite_key)

    conn.commit()
    return {"message": "if your request was valid, you will be able to login to the team with your credentials"}
    
    
async def accept_invite_admin(data, request, conn, background_tasks):
    cursor = conn.cursor()
    start = time.time()
    username = data.username
    teamname = data.teamname
    request_id = uuid.uuid4().hex
    ip = get_client_ip(request)

    blocked_response = reject_blocked_ip(ip)
    if blocked_response:
        return blocked_response

    cursor.execute("SELECT id FROM users WHERE username = %s", (username,))
    result = cursor.fetchone()
    if not result:
        Log_event(login_logger, "/accept_invite_admin", "WARNING", "Invalid username entered", f"{username}", f"{ip}", f"{request_id}")
        time_equilizer(start)
        return {"message": "if your request was valid, you will be able to login to the team with your credentials"}

    session_error = require_active_session(data)
    if session_error:
        return session_error
    userid = result["id"]

    cursor.execute("SELECT id, userid FROM teams WHERE teamname = %s", (teamname,))
    team_row = cursor.fetchone()
    if not team_row:
        time_equilizer(start)
        return {"ERROR": "Seems like no one invited you as admin or the invite has expired"}
    teamid = team_row["id"]

    key = team_invite_key(userid, teamid, "admin")
    invites_d = invites.hgetall(key)
    if not invites_d or str(invites_d.get("valid", "")).lower() not in ("true", "1"):
        time_equilizer(start)
        return {"ERROR": "Seems like no one invited you as admin or the invite has expired"}

    I_code = data.code
    S_code = invites_d.get("code", "")

    if not hmac.compare_digest(I_code, S_code):
        blocker(ip, request_id)
        Log_event(login_logger, "/accept_invite_admin", "WARNING", "Invalid admin invite code", f"{username}", f"{ip}", f"{request_id}")
        time_equilizer(start)
        return {"ERROR": "Invalid code"}

    cursor.execute("SELECT member, admin FROM users WHERE id = %s;", (userid,))
    current_role = cursor.fetchone()
    if current_role["member"] not in (None, teamid) or current_role["admin"] not in (None, teamid):
        return {"ERROR": "You already belong to another team"}

    cursor.execute(
        "UPDATE users SET admin = %s WHERE id = %s;",
        (teamid, userid),
    )
    cursor.execute(
        "UPDATE users SET member = Null WHERE id = %s;",
        (userid,),
    )
    rebuild_teamconfig(cursor, teamid, team_row["userid"])
    conn.commit()
    invites.delete(key)

    Log_event(login_logger, "/accept_invite_admin", "INFO", f"User accepted admin invite for team {teamname}", f"{username}", f"{ip}", f"{request_id}")
    time_equilizer(start)
    return {"message": "if your request was valid, you will be able to login to the team with your credentials"}
    
    


async def profile_status(data, request, conn):
    cursor = conn.cursor()
    start = time.time()
    username = data.username
    request_id = uuid.uuid4().hex
    ip = get_client_ip(request)

    blocked_response = reject_blocked_ip(ip)
    if blocked_response:
        return blocked_response
    cursor.execute(
        """
    SELECT * FROM users WHERE username = %s""",
        (username,),
    )
    result = cursor.fetchone()
    if not result:
        Log_event(login_logger, "/profile/status", "WARNING", "Invalid username entered", f"{username}", f"{ip}", f"{request_id}")
        nonce = os.urandom(32).hex()
        salt = os.urandom(32).hex()
        time_equilizer(start)
        return {
            "nonce": nonce,
            "salt": salt,
            "request_id": request_id,
        }

    session_error = require_active_session(data)
    if session_error:
        return session_error
    if ratelimitin.exists(f"rlpost:{username}"):
        if int(ratelimitin.get(f"rlpost:{username}")) >= 10:
            temp_blocked.set(f"blocked:{username}", "1")
            temp_blocked.expire(f"blocked:{username}", 3600)
            ratelimitin.delete(f"rlpost:{username}")
            Log_event(login_logger, "/profile/status", "WARNING", "Rapid requests detected", f"{username}", f"{ip}", f"{request_id}")
            return {"ERROR": "Too many requests, try again in an hour"}
    else:
        ratelimitin.set(f"rlpost:{username}", "0")
    if temp_blocked.exists(f"blocked:{username}"):
        Log_event(login_logger, "/profile/status", "CRITICAL", "User blocked", f"{username}", f"{ip}", f"{request_id}")
        return {"ERROR": "You are temporarily blocked, try again after some time"}

    nonce = os.urandom(32).hex()
    Log_event(sys_logger, "/profile/status", "INFO", "Nonce generated", f"{username}", f"{ip}", f"{request_id}")
    key = profile_challenge_key(username, request_id)
    nonce_db.hset(
        key,
        mapping={
            "value": nonce,
            "request_id": request_id,
            "ip": ip,
        },
    )
    Log_event(sys_logger, "/profile/status", "INFO", "Temporary nonce stored", f"{username}", f"{ip}", f"{request_id}")
    nonce_db.expire(key, 300)
    count = ratelimitin.incr(f"rlpost:{username}")
    if count == 1:
        ratelimitin.expire(f"rlpost:{username}", 3600)
    cursor.execute("SELECT id FROM users WHERE username = %s", (username,))
    userid = cursor.fetchone()["id"]
    cursor.execute(
        "SELECT salt FROM salt WHERE userid = %s",
        (userid,),
    )
    salt = cursor.fetchone()["salt"]
    time_equilizer(start)
    return {
        "nonce": nonce,
        "salt": salt,
        "request_id": request_id,
    }


async def profile_status2(data, request, conn):
    cursor = conn.cursor()
    try:
        signature = data.signature
        username = data.username
        request_id = data.request_id
        ip = get_client_ip(request)
        blocked_response = reject_blocked_ip(ip)
        if blocked_response:
            return blocked_response

        signature_bytes = bytes.fromhex(signature)
        cursor.execute(
            """
        SELECT * FROM users WHERE username = %s""",
            (username,),
        )
        result = cursor.fetchone()
        if not result:
            return {"ERROR": "Username or password is wrong"}

        session_error = require_active_session(data)
        if session_error:
            return session_error
        status = get_session_status(username, data.session_id, ip)
        if not status["authenticated"]:
            return session_expired_response()

        challenge_key = profile_challenge_key(username, request_id)
        nonce_data = nonce_db.hgetall(challenge_key)
        if not nonce_data:
            blocker(ip, request_id)
            return {"ERROR": "Session expired"}
        if nonce_data.get("request_id") != request_id:
            nonce_db.delete(challenge_key)
            blocker(ip, request_id)
            Log_event(login_logger, "/profile/status2", "WARNING", "Nonce request id mismatch", f"{username}", f"{ip}", f"{request_id}")
            return {"ERROR": "Username or password is wrong"}

        userid = result["id"]
        hash = result["authkey"]
        server_signature = hmac.new(
            bytes.fromhex(hash), bytes.fromhex(nonce_data["value"]), hashlib.sha256
        ).digest()
        Log_event(sys_logger, "/profile/status2", "INFO", "Server signature generated", f"{username}", f"{ip}", f"{request_id}")
        if not hmac.compare_digest(signature_bytes, server_signature):
            ratelimitin.incr(f"rlpost:{username}")
            Log_event(login_logger, "/profile/status2", "WARNING", "Invalid signature", f"{username}", f"{ip}", f"{request_id}")
            blocker(ip, request_id)
            return {"ERROR": "Username or password is wrong"}

        cursor.execute(
            """
            SELECT
                users.id,
                emails.email AS gmail,
                twofa.enabled AS otp_enabled,
                twofa.method AS otp_method
            FROM users
            LEFT JOIN emails ON emails.userid = users.id
            LEFT JOIN twofa ON twofa.userid = users.id
            WHERE users.username = %s
            """,
            (username,),
        )
        profile = cursor.fetchone()
        if not profile:
            session.delete(f"session_id:{username}")
            nonce_db.delete(challenge_key)
            Log_event(login_logger, "/profile/status2", "WARNING", "Session exists for missing user", f"{username}", f"{ip}", f"{request_id}")
            return session_expired_response()

        cursor.execute(
            """
            SELECT servicename, accountusername
            FROM stored
            WHERE userid = %s
            ORDER BY servicename, accountusername;
            """,
            (profile["id"],),
        )
        stored_passwords = [
            {
                "service": row["servicename"],
                "username": row["accountusername"],
            }
            for row in cursor.fetchall()
        ]

        nonce_db.delete(challenge_key)
        Log_event(login_logger, "/profile/status2", "INFO", "Profile status checked", f"{username}", f"{ip}", f"{request_id}")
        return {
            **status,
            "username": username,
            "profile_exists": True,
            "gmail": profile["gmail"],
            "otp_enabled": bool(profile["otp_enabled"]),
            "otp_method": profile["otp_method"] if profile["otp_enabled"] else None,
            "stored_password_count": len(stored_passwords),
            "stored_passwords": stored_passwords,
        }

    except Exception:
        conn.rollback()
        Log_event(sys_logger, "/profile/status2", "ERROR", traceback.format_exc(), f"{username}", f"{ip}", f"{request_id}")
        return {"ERROR": "Something went wrong"}


async def list(data, request, conn):
    cursor = conn.cursor()
    start = time.time()
    username = data.username
    ip = get_client_ip(request)
    blocked_response = reject_blocked_ip(ip)
    if blocked_response:
        return blocked_response
    request_id = uuid.uuid4().hex
    cursor.execute(
        """
    SELECT * FROM users WHERE username = %s""",
        (username,),
    )
    result = cursor.fetchone()
    if not result:
        Log_event(login_logger, "/list", "WARNING", "Invalid username entered", f"{username}", f"{ip}", f"{request_id}")
        time_equilizer(start)
        nonce = os.urandom(32).hex()
        salt = os.urandom(32).hex()
        time_equilizer(start)
        return {"nonce" : nonce,
                "salt" : salt,
                "request_id" : request_id}
    else:
        session_error = require_active_session(data)
        if session_error:
            return session_error
        if ratelimitin.exists(f"rlpost:{username}"):
            if int(ratelimitin.get(f"rlpost:{username}")) >= 10:
                temp_blocked.set(f"blocked:{username}", "1")
                temp_blocked.expire(f"blocked:{username}", 3600)
                ratelimitin.delete(f"rlpost:{username}")
                Log_event(login_logger, "/list", "WARNING", "Rapid requests detected", f"{username}", f"{ip}", f"{request_id}")
                return {"ERROR": "Too many requests, try again in an hour"}            
            else:
                pass
        else:
            ratelimitin.set(f"rlpost:{username}", "0")
        nonce = os.urandom(32)
        Log_event(sys_logger, "/list", "INFO", "Nonce generated", f"{username}", f"{ip}", f"{request_id}")
        key = f"list:{username}"
        nonce_db.hset(
            key,
            mapping={
                "value": nonce.hex(),
            },
        )
        Log_event(sys_logger, "/list", "INFO", "Temporary nonce stored", f"{username}", f"{ip}", f"{request_id}")
        nonce_db.expire(f"list:{username}", 300)
        cursor.execute("SELECT id FROM users WHERE username = %s", (username,))
        userid = cursor.fetchone()["id"]
        cursor.execute(
    "SELECT salt FROM salt WHERE userid = %s",
    (userid,))
        salt = cursor.fetchone()["salt"]
        time_equilizer(start)
        return {
            "nonce": nonce.hex(),
            "salt": salt,
            "request_id": request_id 
                }


async def list2(Pdata, request, conn):
    cursor = conn.cursor()
    try:
        signature = Pdata.signature
        un = Pdata.username
        ip = get_client_ip(request)
        request_id = Pdata.request_id
        blocked_response = reject_blocked_ip(ip)
        if blocked_response:
            return blocked_response
        signature_bytes = bytes.fromhex(signature)
        cursor.execute(
        """
        SELECT * FROM users WHERE username = %s""",
        (un,),
        )
        result = cursor.fetchone()
        if not result:
            return {"ERROR": f"Username or password is wrong"}
        session_error = require_active_session(Pdata)
        if session_error:
            return session_error

        data = nonce_db.hgetall(f"list:{un}")
        if not data:
            blocker(ip, request_id)
            return {"ERROR": "Session expired"}

        userid = result["id"]
        hash = result["authkey"]
        server_signature = hmac.new(
            bytes.fromhex(hash), bytes.fromhex(data["value"]), hashlib.sha256).digest()
        Log_event(sys_logger, "/list2", "INFO", "Server signature generated", f"{un}", f"{ip}", f"{request_id}")
        if not hmac.compare_digest(signature_bytes, server_signature):
            ratelimitin.incr(f"rlpost:{un}")
            Log_event(login_logger, "/list2", "WARNING", "Invalid signature", f"{un}", f"{ip}", f"{request_id}")
            blocker(ip, request_id)
            return {"ERROR": f"Username or password is wrong"}
        Log_event(login_logger, "/list2", "INFO", "Valid signature", f"{un}", f"{ip}", f"{request_id}")
        cursor.execute("""
        SELECT servicename, accountusername FROM stored WHERE userid=%s;
        """,
        (userid,),
        )
        rows = cursor.fetchall()
        passwords = []

        for row in rows:
            passwords.append({
                "service": row["servicename"],
                "username": row["accountusername"]
            })

        nonce_db.delete(f"list:{un}")
        return {
            "passwords": passwords
        }
    except Exception as e:
        conn.rollback()
        Log_event(sys_logger, "/list2", "ERROR", f"""{str(e)}""", f"{un}", f"{ip}", f"{request_id}")
        return {"ERROR": "Something Went Wrong"}


async def delete_password(data, request, conn):
    cursor = conn.cursor()
    start = time.time()
    username = data.username
    ip = get_client_ip(request)
    blocked_response = reject_blocked_ip(ip)
    if blocked_response:
        return blocked_response
    request_id = uuid.uuid4().hex
    cursor.execute(
        """
    SELECT * FROM users WHERE username = %s""",
        (username,),
    )
    result = cursor.fetchone()
    if not result:
        Log_event(login_logger, "/delete_password", "WARNING", "Invalid username entered", f"{username}", f"{ip}", f"{request_id}")
        time_equilizer(start)
        nonce = os.urandom(32).hex()
        salt = os.urandom(32).hex()
        time_equilizer(start)
        return {"nonce" : nonce,
                "salt" : salt,
                "request_id" : request_id}
    else:
        session_error = require_active_session(data)
        if session_error:
            return session_error
        if ratelimitin.exists(f"rlpost:{username}"):
            if int(ratelimitin.get(f"rlpost:{username}")) >= 10:
                temp_blocked.set(f"blocked:{username}", "1")
                temp_blocked.expire(f"blocked:{username}", 3600)
                ratelimitin.delete(f"rlpost:{username}")
                Log_event(login_logger, "/delete_password", "WARNING", "Rapid requests detected", f"{username}", f"{ip}", f"{request_id}")
                return {"ERROR": "Too many requests, try again in an hour"}            
            else:
                pass
        else:
            ratelimitin.set(f"rlpost:{username}", "0")
        nonce = os.urandom(32)
        Log_event(sys_logger, "/delete_password", "INFO", "Nonce generated", f"{username}", f"{ip}", f"{request_id}")
        key = f"delete:{username}"
        nonce_db.hset(
            key,
            mapping={
                "value": nonce.hex(),
            },
        )
        Log_event(sys_logger, "/delete_password", "INFO", "Temporary nonce stored", f"{username}", f"{ip}", f"{request_id}")
        nonce_db.expire(f"delete:{username}", 300)
        cursor.execute("SELECT id FROM users WHERE username = %s", (username,))
        userid = cursor.fetchone()["id"]
        cursor.execute(
    "SELECT salt FROM salt WHERE userid = %s",
    (userid,))
        salt = cursor.fetchone()["salt"]
        time_equilizer(start)
        return {
            "nonce": nonce.hex(),
            "salt": salt,
            "request_id": request_id
            }


async def delete_password2(Pdata, request, conn):
    cursor = conn.cursor()
    try:
        signature = Pdata.signature
        un = Pdata.username
        password_name = Pdata.password_name
        unS = Pdata.usernameS
        ip = get_client_ip(request)
        blocked_response = reject_blocked_ip(ip)
        if blocked_response:
            return blocked_response
        request_id = Pdata.request_id
        signature_bytes = bytes.fromhex(signature)
        cursor.execute(
        """
        SELECT * FROM users WHERE username = %s""",
        (un,),
        )
        result = cursor.fetchone()
        if not result:
            return {"ERROR": f"Username or password is wrong"}
        session_error = require_active_session(Pdata)
        if session_error:
            return session_error

        data = nonce_db.hgetall(f"delete:{un}")
        if not data:
            blocker(ip, request_id)
            return {"ERROR": "Session expired"}

        hash = result["authkey"]
        server_signature = hmac.new(
           bytes.fromhex(hash), bytes.fromhex(data["value"]), hashlib.sha256).digest()
        Log_event(sys_logger, "/delete2", "INFO", "Server signature generated", f"{un}", f"{ip}", f"{request_id}")
        if not hmac.compare_digest(signature_bytes, server_signature):
            ratelimitin.incr(f"rlpost:{un}")
            Log_event(login_logger, "/delete2", "WARNING", "Invalid signature", f"{un}", f"{ip}", f"{request_id}")
            blocker(ip, request_id)
            return {"ERROR": f"Username or password is wrong"}
        Log_event(login_logger, "/delete2", "INFO", "Valid signature", f"{un}", f"{ip}", f"{request_id}")
        user_id = result["id"]
        cursor.execute(
            """
            DELETE FROM stored
            WHERE userid = %s AND servicename = %s AND accountusername = %s
            RETURNING id
            """,
            (user_id, password_name, unS),
        )
        deleted_password = cursor.fetchone()
        if deleted_password is None:
            conn.rollback()
            nonce_db.delete(f"delete:{un}")
            Log_event(
                db_logger,
                "/delete2",
                "WARNING",
                "Password not found for user",
                f"{un}",
                f"{ip}",
                f"{request_id}",
            )
            return {"ERROR": "Password not found"}

        Log_event(db_logger, "/delete2", "INFO", "Password deleted", f"{un}", f"{ip}", f"{request_id}")
        conn.commit()
        nonce_db.delete(f"delete:{un}")
        return {"message": "Password deleted successfully"}
    except Exception as e:
        conn.rollback()
        Log_event(sys_logger, "/delete2", "ERROR", f"""{str(e)}""", f"{un}", f"{ip}", f"{request_id}")
        return {"ERROR": "Something Went Wrong"}


async def hint(data, request, conn):
    cursor = conn.cursor()
    start = time.time()
    username = data.username
    ip = get_client_ip(request)
    blocked_response = reject_blocked_ip(ip)
    if blocked_response:
        return blocked_response
    request_id = uuid.uuid4().hex
    cursor.execute(
        """
    SELECT * FROM users WHERE username = %s""",
        (username,),
    )
    result = cursor.fetchone()
    if not result:
        Log_event(login_logger, "/hint", "WARNING", "Invalid username entered", f"{username}", f"{ip}", f"{request_id}")
        time_equilizer(start)
        nonce = os.urandom(32).hex()
        salt = os.urandom(32).hex()
        time_equilizer(start)
        return {"nonce" : nonce,
                "salt" : salt,
                "request_id" : request_id}
    else:
        session_error = require_active_session(data)
        if session_error:
            return session_error
        if ratelimitin.exists(f"rlpost:{username}"):
            if int(ratelimitin.get(f"rlpost:{username}")) >= 10:
                temp_blocked.set(f"blocked:{username}", "1")
                temp_blocked.expire(f"blocked:{username}", 3600)
                ratelimitin.delete(f"rlpost:{username}")
                Log_event(login_logger, "/hint", "WARNING", "Rapid requests detected", f"{username}", f"{ip}", f"{request_id}")
                return {"ERROR": "Too many requests, try again in an hour"}            
            else:
                pass
        else:
            ratelimitin.set(f"rlpost:{username}", "0")
        nonce = os.urandom(32)
        Log_event(sys_logger, "/hint", "INFO", "Nonce generated", f"{username}", f"{ip}", f"{request_id}")
        key = f"hint:{username}"
        nonce_db.hset(
            key,
            mapping={
                "value": nonce.hex(),
            },
        )
        Log_event(sys_logger, "/hint", "INFO", "Temporary nonce stored", f"{username}", f"{ip}", f"{request_id}")
        nonce_db.expire(f"hint:{username}", 300)
        cursor.execute("SELECT id FROM users WHERE username = %s", (username,))
        userid = cursor.fetchone()["id"]
        cursor.execute(
    "SELECT salt FROM salt WHERE userid = %s",
    (userid,))
        salt = cursor.fetchone()["salt"]
        time_equilizer(start)
        return {
            "nonce": nonce.hex(),
            "salt": salt,
            "request_id": request_id 
                }


async def hint2(Pdata, request, conn):
    cursor = conn.cursor()
    try:
        signature = Pdata.signature
        un = Pdata.username
        pn = Pdata.service_name
        an = Pdata.storedusername
        ip = get_client_ip(request)
        request_id = Pdata.request_id
        blocked_response = reject_blocked_ip(ip)
        if blocked_response:
            return blocked_response
        signature_bytes = bytes.fromhex(signature)
        cursor.execute(
        """
        SELECT * FROM users WHERE username = %s""",
        (un,),
        )
        result = cursor.fetchone()
        if not result:
            return {"ERROR": f"Username or password is wrong"}
        session_error = require_active_session(Pdata)
        if session_error:
            return session_error

        data = nonce_db.hgetall(f"hint:{un}")
        if not data:
            blocker(ip, request_id)
            return {"ERROR": "Session expired"}

        userid = result["id"]
        hash = result["authkey"]
        server_signature = hmac.new(
            bytes.fromhex(hash), bytes.fromhex(data["value"]), hashlib.sha256).digest()
        Log_event(sys_logger, "/hint2", "INFO", "Server signature generated", f"{un}", f"{ip}", f"{request_id}")
        if not hmac.compare_digest(signature_bytes, server_signature):
            ratelimitin.incr(f"rlpost:{un}")
            Log_event(login_logger, "/hint2", "WARNING", "Invalid signature", f"{un}", f"{ip}", f"{request_id}")
            blocker(ip, request_id)
            return {"ERROR": f"Username or password is wrong"}
        Log_event(login_logger, "/hint2", "INFO", "Valid signature", f"{un}", f"{ip}", f"{request_id}")
        cursor.execute("""
        SELECT id FROM stored WHERE userid=%s and servicename=%s and accountusername=%s;
        """,
        (userid,pn,an),
        )
        result_I = cursor.fetchone()
        if result_I is None:
            return {"ERROR" : "Password doesn't exists"}
        P_id = result_I["id"]
        cursor.execute("""
        SELECT hint FROM hints WHERE password_id=%s;
        """,
        (P_id,),
        )
        result_H = cursor.fetchone()
        if result_H is None:
            return {"ERROR" : "Password hint doesn't exists"}
        hint = result_H["hint"]
        nonce_db.delete(f"hint:{un}")
        return {"hint" : hint}
    except Exception as e:
        conn.rollback()
        Log_event(sys_logger, "/hint2", "ERROR", f"""{str(e)}""", f"{un}", f"{ip}", f"{request_id}")
        return {"ERROR": "Something Went Wrong"}


async def delete_account(data, request, conn):
    cursor = conn.cursor()
    start = time.time()
    username = data.username
    ip = get_client_ip(request)
    blocked_response = reject_blocked_ip(ip)
    if blocked_response:
        return blocked_response
    request_id = uuid.uuid4().hex
    cursor.execute(
        """
    SELECT * FROM users WHERE username = %s""",
        (username,),
    )
    result = cursor.fetchone()
    if not result:
        Log_event(login_logger, "/delete_account", "WARNING", "Invalid username entered", f"{username}", f"{ip}", f"{request_id}")
        time_equilizer(start)
        nonce = os.urandom(32).hex()
        salt = os.urandom(32).hex()
        time_equilizer(start)
        return {"nonce" : nonce,
                "salt" : salt,
                "request_id" : request_id}
    else:
        session_error = require_active_session(data)
        if session_error:
            return session_error
        if ratelimitin.exists(f"rlpost:{username}"):
            if int(ratelimitin.get(f"rlpost:{username}")) >= 10:
                temp_blocked.set(f"blocked:{username}", "1")
                temp_blocked.expire(f"blocked:{username}", 3600)
                ratelimitin.delete(f"rlpost:{username}")
                Log_event(login_logger, "/delete_password", "WARNING", "Rapid requests detected", f"{username}", f"{ip}", f"{request_id}")
                return {"ERROR": "Too many requests, try again in an hour"}            
            else:
                pass
        else:
            ratelimitin.set(f"rlpost:{username}", "0")
        nonce = os.urandom(32)
        Log_event(sys_logger, "/delete_password", "INFO", "Nonce generated", f"{username}", f"{ip}", f"{request_id}")
        key = f"delete:{username}"
        nonce_db.hset(
            key,
            mapping={
                "value": nonce.hex(),
            },
        )
        Log_event(sys_logger, "/delete_password", "INFO", "Temporary nonce stored", f"{username}", f"{ip}", f"{request_id}")
        nonce_db.expire(f"delete:{username}", 300)
        cursor.execute("SELECT id FROM users WHERE username = %s", (username,))
        userid = cursor.fetchone()["id"]
        cursor.execute(
    "SELECT salt FROM salt WHERE userid = %s",
    (userid,))
        salt = cursor.fetchone()["salt"]
        time_equilizer(start)
        return {
            "nonce": nonce.hex(),
            "salt": salt,
            "request_id": request_id
            }


async def delete_account2(Pdata, request, conn):
    cursor = conn.cursor()
    try:
        signature = Pdata.signature
        un = Pdata.username
        ip = get_client_ip(request)
        blocked_response = reject_blocked_ip(ip)
        if blocked_response:
            return blocked_response
        request_id = Pdata.request_id
        signature_bytes = bytes.fromhex(signature)
        cursor.execute(
        """
        SELECT * FROM users WHERE username = %s""",
        (un,),
        )
        result = cursor.fetchone()
        if not result:
            return {"ERROR": f"Username or password is wrong"}
        session_error = require_active_session(Pdata)
        if session_error:
            return session_error

        data = nonce_db.hgetall(f"delete:{un}")
        if not data:
            blocker(ip, request_id)
            return {"ERROR": "Session expired"}

        hash = result["authkey"]
        server_signature = hmac.new(
           bytes.fromhex(hash), bytes.fromhex(data["value"]), hashlib.sha256).digest()
        Log_event(sys_logger, "/delete2", "INFO", "Server signature generated", f"{un}", f"{ip}", f"{request_id}")
        if not hmac.compare_digest(signature_bytes, server_signature):
            ratelimitin.incr(f"rlpost:{un}")
            Log_event(login_logger, "/delete2", "WARNING", "Invalid signature", f"{un}", f"{ip}", f"{request_id}")
            blocker(ip, request_id)
            return {"ERROR": f"Username or password is wrong"}
        Log_event(login_logger, "/deleteacc2", "INFO", "Valid signature", f"{un}", f"{ip}", f"{request_id}")
        user_id = result["id"]
        cursor.execute("SELECT 1 FROM teams WHERE userid = %s;", (user_id,))
        if cursor.fetchone():
            return {"ERROR": "Delete or transfer ownership of your team before deleting this account"}
        cursor.execute("SELECT member, admin FROM users WHERE id = %s;", (user_id,))
        team_roles = cursor.fetchone()
        affected_teamids = {
            teamid
            for teamid in (team_roles.get("member"), team_roles.get("admin"))
            if teamid is not None
        }
        cursor.execute(
            """
            DELETE FROM stored WHERE userid = %s""",
            (user_id,),
        )
        cursor.execute(
            """
            DELETE FROM emails WHERE userid = %s""",
            (user_id,),
        )
        cursor.execute(
            """
            DELETE FROM salt WHERE userid = %s""",
            (user_id,),
        )
        cursor.execute(
            """
            DELETE FROM iptracking WHERE userid = %s""",
            (user_id,),
        )
        cursor.execute(
            """
            DELETE FROM hints WHERE userid = %s""",
            (user_id,),
        )
        cursor.execute(
            """
            DELETE FROM twofa WHERE userid = %s""",
            (user_id,),
        )
        cursor.execute(
            """
            DELETE FROM users WHERE id = %s""",
            (user_id,),
        )
        for teamid in affected_teamids:
            cursor.execute("SELECT userid FROM teams WHERE id = %s;", (teamid,))
            team = cursor.fetchone()
            if team:
                rebuild_teamconfig(cursor, teamid, team["userid"])
        conn.commit()
        nonce_db.delete(f"delete:{un}")
        session.delete(f"session_id:{un}")
        for teamid in affected_teamids:
            session.delete(f"Team_session_id:{un},{teamid}")
        invite_keys = list(invites.scan_iter(match=f"TeamInvite:{user_id}:*:*") )
        if invite_keys:
            invites.delete(*invite_keys)
        return {"message": "Account deleted successfully"}
    except Exception as e:
        conn.rollback()
        Log_event(sys_logger, "/delete2", "ERROR", f"""{str(e)}""", f"{un}", f"{ip}", f"{request_id}")
        return {"ERROR": "Something Went Wrong"}
