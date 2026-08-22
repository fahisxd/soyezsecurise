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
import json
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
    passdel,
    newteamcreated,
    team_otp,
    team_invitation,
    team_login,
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


def otp_generation_and_verfication_team(
    username,
    user_otp,
    cursor,
    cmd,
    background_tasks=None,
    require_configured=False,
    teamid=None,
    teamname="Team vault",
    action="login",
):
    cursor.execute(
        "SELECT id FROM users WHERE username = %s;",
        (username,),
    )
    row = cursor.fetchone()
    if not row:
        return "INVALID"  # unknown user — never trust silently
    userid = row["id"]
    # Team challenges must not share the personal-vault OTP namespace.  The
    # team id also prevents concurrent logins to different teams colliding.
    key = f"team-otp:{username}:{teamid}" if teamid is not None else f"{username}:Gotp"

    cursor.execute(
        "SELECT enabled, method, secret, salt FROM twofa WHERE userid = %s;",
        (userid,),
    )
    twofa = cursor.fetchone()
    method = None
    if twofa and twofa.get("enabled"):
        method = twofa.get("method")

    if require_configured and method not in ("totp", "gmail"):
        return "NOT_CONFIGURED"

    if cmd == "gen":
        if method == "totp":
            return "totp"
        characters = string.ascii_uppercase + string.digits
        otp = ''.join(secrets.choice(characters) for _ in range(6))
        gmail_otp.set(key, otp)
        gmail_otp.expire(key, 600)

        cursor.execute(
            "SELECT email FROM emails WHERE userid = %s;",
            (userid,),
        )
        email = cursor.fetchone()["email"]
        queue_email(background_tasks, team_otp, username, otp, teamname, action, email)
        return "queued"

    if cmd == "ver" and method == "totp":
        try:
            enc_secret = base64.b64decode(twofa["secret"])
            salt = base64.b64decode(twofa["salt"])
            cursor.execute(
                "SELECT authkey FROM users WHERE id = %s;",
                (userid,),
            )
            auth = cursor.fetchone()
            if not auth:
                return "INVALID"
            key1 = HKDF(
                algorithm=hashes.SHA256(),
                length=32,
                salt=None,
                info=b'otpsecretencryption',
            )
            key_material = key1.derive(bytes.fromhex(auth["authkey"]))
            nonce = salt[:12]
            tag = salt[12:]
            secret = decrypt(enc_secret, key_material, tag, nonce).decode().strip()
            if verify_totp_once(gmail_otp, userid, secret, user_otp):
                return "VALID"
            return "INVALID"
        except (ValueError, TypeError, KeyError):
            return "INVALID"

    if cmd in ("ver", "verG"):
        # GETDEL atomically makes the code single-attempt, including when two
        # requests arrive concurrently.
        stored = gmail_otp.getdel(key)
        if stored is None:
            return "expired"
        user_otp = user_otp.strip().upper()
        if not hmac.compare_digest(stored, user_otp):
            return "INVALID"
        return "VALID"

    return "INVALID"

            
def generate_otp_code():
    characters = string.ascii_uppercase + string.digits
    return ''.join(secrets.choice(characters) for _ in range(6))

def seesion_id_checker(U_session_id, un):
    stored_session = session.hgetall(f"session_id:{un}")
    if not U_session_id or not stored_session:
        return "INVALID"
    if hmac.compare_digest(stored_session.get("value", ""), U_session_id):
        return "VALID"
    return "INVALID"


def session_expired_response():
    return {"ERROR": "Session expired, login again"}


def require_active_session(data):
    if seesion_id_checker(getattr(data, "session_id", None), data.username) != "VALID":
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

    session_valid = hmac.compare_digest(stored_session.get("value", ""), session_id)
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


NEW_TEAM_OTP_MESSAGE = {
    "message": "If the account and team name were valid, a verification code was sent"
}
NEW_TEAM_RESULT_MESSAGE = {
    "message": "If the team request was valid, the team was created"
}


def team_registration_rate_limited(stage, username, ip, limit=5, window=900):
    """Rate limit by both source IP and target account to stop mail bombing."""
    limited = False
    for identity in (f"ip:{ip}", f"username:{username}"):
        key = f"team-registration:{stage}:{identity}"
        count = ratelimitin.incr(key)
        if count == 1:
            ratelimitin.expire(key, window)
        limited = limited or count > limit
    return limited


def send_team_registration_otp(username, email, teamname, background_tasks=None):
    otp = generate_otp_code()
    key = registration_key(f"{username}-{teamname}")
    gmail_otp.hset(
        key,
        mapping={
            "otp": otp,
            "email": email
        },
    )
    gmail_otp.expire(key, 600)
    queue_email(background_tasks, team_otp, username, otp, teamname, "create-team", email)
    return "queued"


def verify_registration_otp(username, user_otp, teamname):
    key = registration_key(f"{username}-{teamname}")
    pending = consume_otp_hash(gmail_otp, key)
    if not pending:
        return "expired"
    otp = user_otp.strip().upper()
    # The continuation is single-attempt.  Its Redis key already binds the
    # challenge to username + team name; email is server-derived in step one.
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


def team_invite_key(userid, teamid, role):
    return f"TeamInvite:{userid}:{teamid}:{role}"


def get_team_context(cursor, username, teamname=None, teamid=None):
    if teamid is not None:
        selector = "t.id = %s"
        selector_value = teamid
    else:
        selector = "t.teamname = %s"
        selector_value = teamname

    cursor.execute(
        f"""
        SELECT
            u.id AS userid,
            u.username,
            t.id AS teamid,
            t.userid AS ownerid,
            t.teamname,
            CASE
                WHEN t.userid = u.id THEN 'OWNER'
                WHEN u.admin = t.id THEN 'ADMIN'
                WHEN u.member = t.id THEN 'MEMBER'
            END AS role
        FROM users u
        JOIN teams t ON {selector}
        WHERE u.username = %s
          AND (t.userid = u.id OR u.admin = t.id OR u.member = t.id);
        """,
        (selector_value, username),
    )
    return cursor.fetchone()


def get_team_user(cursor, teamid, username):
    cursor.execute(
        """
        SELECT
            u.id,
            u.username,
            CASE
                WHEN t.userid = u.id THEN 'OWNER'
                WHEN u.admin = t.id THEN 'ADMIN'
                WHEN u.member = t.id THEN 'MEMBER'
            END AS role
        FROM users u
        JOIN teams t ON t.id = %s
        WHERE u.username = %s
          AND (t.userid = u.id OR u.admin = t.id OR u.member = t.id);
        """,
        (teamid, username),
    )
    return cursor.fetchone()


def team_session_is_valid(username, teamid, session_id):
    if not session_id:
        return False
    server_session = session.hgetall(f"Team_session_id:{username},{teamid}")
    if not server_session:
        return False
    try:
        session_bytes = bytes.fromhex(session_id)
    except (ValueError, TypeError):
        return False
    client_session = hashlib.sha256(session_bytes).hexdigest()
    return hmac.compare_digest(
        client_session,
        server_session.get("Team-session_token", ""),
    )


def require_team_session(context, session_id):
    if not context or not team_session_is_valid(
        context["username"],
        context["teamid"],
        session_id,
    ):
        return session_expired_response()
    return None


def has_destructive_permission(cursor, context, permission):
    if context["role"] == "OWNER":
        return True
    if context["role"] != "ADMIN":
        return False
    column = {
        "delete_secrets": "can_delete_secrets",
        "remove_members": "can_remove_members",
    }.get(permission)
    if not column:
        return False
    cursor.execute(
        f"""
        SELECT 1
        FROM team_admin_permissions
        WHERE teamid = %s AND userid = %s AND {column} = TRUE;
        """,
        (context["teamid"], context["userid"]),
    )
    return cursor.fetchone() is not None


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


def delete_team_invites(teamid, userid=None):
    if userid is None:
        pattern = f"TeamInvite:*:{teamid}:*"
    else:
        pattern = f"TeamInvite:{userid}:{teamid}:*"
    keys = set(invites.scan_iter(match=pattern))
    for key in invites.scan_iter(match="signup:*"):
        invite = invites.hgetall(key)
        key_matches_team = key.endswith(f"-{teamid}-member") or key.endswith(f"-{teamid}-admin")
        invite_matches_team = str(invite.get("teamid", "")) == str(teamid)
        if key_matches_team or invite_matches_team:
            if userid is None or f":{userid}" in key or f"-{userid}-" in key:
                keys.add(key)
    if keys:
        invites.delete(*list(keys))


def create_team_action_challenge(
    action,
    binding,
    context,
    cursor,
    ip,
    background_tasks=None,
):
    if check(ip) == "IP BLOCKED":
        return {"ERROR": "You have been blocked for violating policies, Try again later"}
    otp_status = otp_generation_and_verfication_team(
        context["username"],
        "",
        cursor,
        "gen",
        background_tasks,
        require_configured=True,
        teamid=context["teamid"],
        teamname=context["teamname"],
        action=action,
    )
    if otp_status == "NOT_CONFIGURED":
        return {"ERROR": "OTP must be enabled before this action"}

    cursor.execute(
        "SELECT salt FROM teamauth WHERE teamid = %s;",
        (context["teamid"],),
    )
    auth = cursor.fetchone()
    if not auth:
        return {"ERROR": "Team authentication is not configured"}

    request_id = uuid.uuid4().hex
    nonce = os.urandom(32).hex()
    key = f"team-action:{action}:{context['username']},{context['teamid']}"
    nonce_db.hset(
        key,
        mapping={
            "value": nonce,
            "request_id": request_id,
            "ip": ip,
            "binding": str(binding),
        },
    )
    nonce_db.expire(key, 300)
    return {
        "nonce": nonce,
        "salt": auth["salt"],
        "request_id": request_id,
        "otp_required": True,
        "otp_method": "totp" if otp_status == "totp" else "gmail",
    }


def verify_team_action(
    action,
    binding,
    context,
    signature,
    user_otp,
    request_id,
    cursor,
    ip,
):
    if check(ip) == "IP BLOCKED":
        return {"ERROR": "You have been blocked for violating policies, Try again later"}
    key = f"team-action:{action}:{context['username']},{context['teamid']}"
    pending = nonce_db.hgetall(key)
    if not pending:
        return {"ERROR": "Authorization challenge expired"}
    if (
        pending.get("request_id") != request_id
        or pending.get("binding") != str(binding)
        or pending.get("ip") != ip
    ):
        nonce_db.delete(key)
        blocker(ip, request_id)
        return {"ERROR": "Invalid authorization challenge"}

    try:
        signature_bytes = bytes.fromhex(signature)
    except (ValueError, TypeError):
        blocker(ip, request_id)
        return {"ERROR": "Invalid signature"}
    if len(signature_bytes) != 32:
        blocker(ip, request_id)
        return {"ERROR": "Invalid signature"}

    cursor.execute(
        "SELECT authkey FROM teamauth WHERE teamid = %s;",
        (context["teamid"],),
    )
    auth = cursor.fetchone()
    if not auth:
        return {"ERROR": "Team authentication is not configured"}
    server_signature = hmac.new(
        bytes.fromhex(auth["authkey"]),
        bytes.fromhex(pending["value"]),
        hashlib.sha256,
    ).digest()
    if not hmac.compare_digest(signature_bytes, server_signature):
        blocker(ip, request_id)
        Log_event(
            login_logger,
            f"/team/{action}",
            "WARNING",
            "Invalid signature",
            context["username"],
            ip,
            request_id,
        )
        return {"ERROR": "Invalid signature"}

    otp_status = otp_generation_and_verfication_team(
        context["username"],
        user_otp,
        cursor,
        "ver",
        require_configured=True,
        teamid=context["teamid"],
        teamname=context["teamname"],
        action=action,
    )
    if otp_status == "NOT_CONFIGURED":
        return {"ERROR": "OTP must be enabled before this action"}
    if otp_status == "expired":
        return {"ERROR": "OTP expired"}
    if otp_status != "VALID":
        blocker(ip, request_id)
        return {"ERROR": "Wrong OTP"}

    nonce_db.delete(key)
    return None


async def newteam1(data, request: Request, background_tasks, conn):
    start = time.time()
    cursor = conn.cursor()
    un = data.username
    tn = data.team_name
    ip = get_client_ip(request)
    request_id = uuid.uuid4().hex
    try:
        if check(ip) == "IP BLOCKED":
            return {"ERROR": "You have been blocked for violating policies, Try again later"}
        if team_registration_rate_limited("request", un, ip):
            blocker(ip, request_id)
            Log_event(login_logger, "/newteam1", "WARNING", "Rate limit exceeded", un, ip, request_id)
            time_equilizer(start)
            return NEW_TEAM_OTP_MESSAGE
        
        cursor.execute(
        """
        SELECT * FROM users WHERE username = %s""",
        (un,),
        )
        result = cursor.fetchone()
        if not result:
            Log_event(login_logger, "/newteam1", "WARNING", "Invalid username entered", f"{un}", f"{ip}", f"{request_id}")
            time_equilizer(start)
            return NEW_TEAM_OTP_MESSAGE
        
        cursor.execute("SELECT id FROM users WHERE username = %s", (un,))
        user_id = cursor.fetchone()["id"]
        cursor.execute(
            """
            SELECT * FROM teams WHERE teamname = %s;
            """,
            (tn,),
        )
        result = cursor.fetchone()

        if result:
            Log_event(
                login_logger,
                "/newteam1",
                "WARNING",
                "InValid Team name entered!",
                f"{un}",
                f"{ip}",
                f"{request_id}",
            )
            time_equilizer(start)
            return NEW_TEAM_OTP_MESSAGE
        cursor.execute("""
                        SELECT email FROM emails WHERE userid = %s;
                    """, (user_id,),
                    )
        email = cursor.fetchone()["email"]
        send_team_registration_otp(un, email, tn,background_tasks)
        Log_event(
            otp_logger,
            "/newteam1",
            "INFO",
            "NewTeam OTP sent",
            f"{un}",
            f"{ip}",
            f"{request_id}",
        )
        time_equilizer(start)
        return NEW_TEAM_OTP_MESSAGE
    except Exception:
        conn.rollback()
        Log_event(
            sys_logger,
            "/newteam1",
            "ERROR",
            traceback.format_exc(),
            f"{un}",
            f"{ip}",
            f"{request_id}",
        )
        time_equilizer(start)
        return NEW_TEAM_OTP_MESSAGE

async def newteam2(data, request: Request, background_tasks, conn):
    cursor = conn.cursor()
    start = time.time()
    clean_un = data.username
    tn = data.teamname
    ip = get_client_ip(request)
    request_id = uuid.uuid4().hex
    try:
        memberinvites = data.memberinvites
        admininvites = data.admininvites
        hp = data.hash
        salt = data.salt
        otp = data.otp
        if check(ip) == "IP BLOCKED":
            return {"ERROR": "You have been blocked for violating policies, Try again later"}
        if team_registration_rate_limited("verify", clean_un, ip, limit=10):
            blocker(ip, request_id)
            Log_event(login_logger, "/newteam2", "WARNING", "Rate limit exceeded", clean_un, ip, request_id)
            time_equilizer(start)
            return NEW_TEAM_RESULT_MESSAGE

        # Authenticate the continuation before looking up the owner, team, or
        # invitees.  Until this succeeds every failure is deliberately
        # indistinguishable, preventing username enumeration via newteam2.
        status = verify_registration_otp(clean_un, otp, tn)
        if status != "VALID":
            if status == "INVALID":
                blocker(ip, request_id)
            Log_event(
                otp_logger,
                "/newteam2",
                "WARNING",
                "Invalid or expired team registration challenge",
                clean_un,
                ip,
                request_id,
            )
            time_equilizer(start)
            return NEW_TEAM_RESULT_MESSAGE
        Log_event(otp_logger, "/newteam2", "INFO", "OTP verified", clean_un, ip, request_id)

        cursor.execute("SELECT id FROM users WHERE username = %s;", (clean_un,))
        owner = cursor.fetchone()
        if not owner:
            time_equilizer(start)
            return NEW_TEAM_RESULT_MESSAGE
        user_id = owner["id"]

        cursor.execute(
            "SELECT 1 FROM teams WHERE teamname = %s;",
            (tn,),
        )
        if cursor.fetchone():
            Log_event(
                login_logger,
                "/newteam2",
                "WARNING",
                "Team name unavailable",
                clean_un,
                ip,
                request_id,
            )
            time_equilizer(start)
            return NEW_TEAM_RESULT_MESSAGE

        all_invitees = list(memberinvites or []) + list(admininvites or [])
        if set(memberinvites or []) & set(admininvites or []):
            return {"ERROR": "User cannot be both member and admin"}
        if clean_un in all_invitees:
            return {"ERROR": "The team owner cannot be invited"}
        user_map = {}
        if all_invitees:
            cursor.execute(
                """
                SELECT u.id, u.username, e.email
                FROM users u
                LEFT JOIN emails e ON e.userid = u.id
                WHERE u.username = ANY(%s);
                """,
                (all_invitees,),
            )
            invitee_rows = cursor.fetchall()
            user_map = {row["username"]: row["id"] for row in invitee_rows}
            invitee_emails = {row["username"]: row["email"] for row in invitee_rows}
            if set(all_invitees) - set(user_map):
                return {"ERROR": "Some invited users don't exist"}
        cursor.execute("SELECT email FROM emails WHERE userid = %s;", (user_id,))
        email_row = cursor.fetchone()
        if not email_row:
            time_equilizer(start)
            return NEW_TEAM_RESULT_MESSAGE
        email = email_row["email"]
    
        cursor.execute(
            """
            INSERT INTO teams (userid, teamname)
            VALUES (%s, %s)
            RETURNING id;
            """,
            (user_id, tn),
        )
        team_id = cursor.fetchone()["id"]        
        cursor.execute(
            """
            INSERT INTO teamauth (teamid, salt, authkey)
            VALUES (%s, %s, %s);
            """,
            (team_id, salt, hp),
        )
        rebuild_teamconfig(cursor, team_id, user_id)
        Log_event(
            db_logger,
            "/newteam2",
            "INFO",
            "User added in teams",
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
            "/newteam2",
            "INFO",
            "IP stored",
            f"{clean_un}",
            f"{ip}",
            f"{request_id}",
        )
        Log_event(
            login_logger,
            "/newteam2",
            "INFO",
            f"New team created, {tn}",
            f"{clean_un}",
            f"{ip}",
            f"{request_id}",
        )
        if memberinvites:
            for member in memberinvites:
                role = "member"
                key = team_invite_key(user_map[member], team_id, role)
                invites.hset(
                    key,
                    mapping={
                        "valid": "1",
                        "from": clean_un,
                        "teamname": tn,
                        "teamid": team_id,
                        "role": role,
                    },
                    )
                invites.expire(key, 172800)
        if admininvites:
            for admin in admininvites:
                role = "admin"
                key = team_invite_key(user_map[admin], team_id, role)
                invites.hset(
                    key,
                    mapping={
                      "valid": "1",
                      "from": clean_un,
                      "teamname": tn,
                      "teamid": team_id,
                      "role": role,
                    },
                    )
                invites.expire(key, 172800)
        conn.commit()
        queue_email(background_tasks, newteamcreated, clean_un, tn, email)
        for invitee in all_invitees:
            invitee_email = invitee_emails.get(invitee)
            if invitee_email:
                role = "admin" if invitee in (admininvites or []) else "member"
                queue_email(
                    background_tasks,
                    team_invitation,
                    invitee,
                    clean_un,
                    tn,
                    role,
                    invitee_email,
                )
        time_equilizer(start)
        return NEW_TEAM_RESULT_MESSAGE
    except Exception:
        conn.rollback()
        if "team_id" in locals():
            delete_team_invites(team_id)
        Log_event(
            sys_logger,
            "/newteam2",
            "ERROR",
            traceback.format_exc(),
            f"{clean_un}",
            f"{ip}",
            f"{request_id}",
        )
        return {"ERROR": "Something Went Wrong"}






async def teamlogin1(data, request, background_tasks, conn):
    cursor = conn.cursor()
    start = time.time()
    username = data.username
    teamname = data.teamname
    ip = get_client_ip(request)
    if check(ip) == "IP BLOCKED":
            return {"ERROR" : "You have been blocked for violating policies, Try again later"}
    request_id = uuid.uuid4().hex
    if check(ip) == "IP BLOCKED":
        return "IP BLOCKED, Check after some time"
    if ratelimitin.exists(f"rlpost:{username}"):
        if int(ratelimitin.get(f"rlpost:{username}")) >= 10:
            temp_blocked.set(f"blocked:{username}", "1")
            temp_blocked.expire(f"blocked:{username}", 3600)
            ratelimitin.delete(f"rlpost:{username}")
            Log_event(login_logger, "/setup1", "WARNING", "Rapid requests detected", f"{username}", f"{ip}", f"{request_id}")
            return {"ERROR": "Too many requests, try again in an hour"}
        else:
            pass
    else:
        ratelimitin.set(f"rlpost:{username}", "0")
    context = get_team_context(cursor, username, teamname=teamname)
    if not context:
        Log_event(login_logger, "/setup1", "WARNING", "Invalid username entered", f"{username}", f"{ip}", f"{request_id}")
        nonce = os.urandom(32).hex()
        salt = os.urandom(32).hex()
        time_equilizer(start)
        return {"nonce" : nonce,
                "salt" : salt,
                "request_id" : request_id}

    nonce = os.urandom(32)
    Log_event(sys_logger, "/setup1", "INFO", "Nonce generated", f"{username}", f"{ip}", f"{request_id}")
    teamid = context["teamid"]
    key = f"setup-team:{username},{teamid}"
    nonce_db.hset(
        key,
        mapping={
            "value": nonce.hex(),
            "request_id": request_id,
            "ip": ip,
        },
    )
    Log_event(sys_logger, "/setup1", "INFO", "Temporary nonce stored", f"{username}", f"{ip}", f"{request_id}")
    nonce_db.expire(key, 300)
    cursor.execute(
        "SELECT salt FROM teamauth WHERE teamid = %s",
        (teamid,),
    )
    salt_row = cursor.fetchone()
    if not salt_row:
        Log_event(sys_logger, "/setup1", "ERROR", "Missing salt for team", f"{username}", f"{ip}", f"{request_id}")
        return {"ERROR": "Something Went Wrong"}
    otp_status = otp_generation_and_verfication_team(
        username,
        "",
        cursor,
        "gen",
        background_tasks,
        teamid=teamid,
        teamname=context["teamname"],
        action="login",
    )
    time_equilizer(start)
    return {
        "nonce": nonce.hex(),
        "salt": salt_row["salt"],
        "request_id": request_id,
        "otp_method": "totp" if otp_status == "totp" else "gmail",
    }

async def teamlogin2(data, request, background_tasks, conn):
    cursor = conn.cursor()
    try:
        start = time.time()
        signature = data.signature
        un = data.username
        teamname = data.teamname
        user_otp = data.otp
        ip = get_client_ip(request)
        request_id = data.request_id
        if check(ip) == "IP BLOCKED":
            return "IP BLOCKED, Check after some time"
        if ratelimitin.exists(f"rlpost:{un}"):
            if int(ratelimitin.get(f"rlpost:{un}")) >= 10:
                temp_blocked.set(f"blocked:{un}", "1")
                temp_blocked.expire(f"blocked:{un}", 3600)
                ratelimitin.delete(f"rlpost:{un}")
                Log_event(login_logger, "/storepassword", "WARNING", "Rapid requests detected", f"{un}", f"{ip}", f"{request_id}")
                return {"ERROR": "Too many requests"}
            else:
                pass
        else:
            ratelimitin.set(f"rlpost:{un}", "0")
        if temp_blocked.exists(f"blocked:{un}"):
            Log_event(login_logger, "/storepassword", "CRITICAL", "User blocked", f"{un}", f"{ip}", f"{request_id}")
            return {"ERROR": "You are temporarily blocked, try again after some time"}
        context = get_team_context(cursor, un, teamname=teamname)
        if not context:
            time_equilizer(start)
            return {"ERROR": f"Username or password is wrong"}
        teamid = context["teamid"]
        try:
            signature_bytes = bytes.fromhex(signature)
        except (ValueError, TypeError):
            blocker(ip, request_id)
            time_equilizer(start)
            return {"ERROR": "Username or password is wrong"}

        if len(signature_bytes) != 32:
            blocker(ip, request_id)
            time_equilizer(start)
            return {"ERROR": "Username or password is wrong"}
        
        data_nonce = nonce_db.hgetall(f"setup-team:{un},{teamid}")
        if not data_nonce:
            blocker(ip, request_id)
            time_equilizer(start)
            return {"ERROR": "Username or password is wrong"}
        if data_nonce.get("request_id") != request_id:
            nonce_db.delete(f"setup-team:{un},{teamid}")
            blocker(ip, request_id)
            Log_event(login_logger, "/login2", "WARNING", "Nonce request id mismatch", f"{un}", f"{ip}", f"{request_id}")
            time_equilizer(start)
            return {"ERROR": "Username or password is wrong"}
        if data_nonce.get("ip") != ip:
            nonce_db.delete(f"setup-team:{un},{teamid}")
            blocker(ip, request_id)
            return {"ERROR": "Username or password is wrong"}

        cursor.execute(
            """
        SELECT authkey FROM teamauth WHERE teamid = %s""",
            (teamid,))
        auth = cursor.fetchone()
        if not auth:
            time_equilizer(start)
            return {"ERROR": "Something went wrong"}

        authkey = auth["authkey"]
        server_signature = hmac.new(
           bytes.fromhex(authkey), bytes.fromhex(data_nonce["value"]), hashlib.sha256
        ).digest()
        Log_event(sys_logger, "/login2", "INFO", "Server signature generated", f"{un}", f"{ip}", f"{request_id}")
        if not hmac.compare_digest(signature_bytes, server_signature):
            ratelimitin.incr(f"rlpost:{un}")
            Log_event(login_logger, "/login2", "WARNING", "Invalid signature", f"{un}", f"{ip}", f"{request_id}")
            blocker(ip, request_id)
            time_equilizer(start)
            return {"ERROR": f"Username or password is wrong"}
        nonce_db.delete(f"setup-team:{un},{teamid}")
        status = otp_generation_and_verfication_team(
            un,
            user_otp,
            cursor,
            "ver",
            teamid=teamid,
            teamname=context["teamname"],
            action="login",
        )
        if status == "VALID":
                Log_event(otp_logger, "/login2", "INFO", "OTP verified", f"{un}", f"{ip}", f"{request_id}")
                pass
        elif status == "INVALID":
            blocker(ip, request_id)
            Log_event(otp_logger, "/login2", "WARNING", "Invalid OTP entered! Generate a new OTP to proceed", f"{un}", f"{ip}", f"{request_id}")
            return {"ERROR" : "Wrong OTP"}
        elif status == "expired":
            return {"ERROR" : "OTP Expired! Generate a new OTP to proceed"}
        Log_event(login_logger, "/login2", "INFO", "Valid signature", f"{un}", f"{ip}", f"{request_id}")
        session_token = secrets.token_bytes(32)
        hashed_session_token = hashlib.sha256(session_token).hexdigest()
        key = f"Team_session_id:{un},{teamid}"
        session.hset(
            key,
            mapping={
                "Team-session_token": hashed_session_token,
                "request_id": request_id,
                "ip": ip,
            },
        )
        session.expire(key, 1800)
        cursor.execute("SELECT email FROM emails WHERE userid = %s;", (context["userid"],))
        email_row = cursor.fetchone()
        if email_row and email_row.get("email"):
            queue_email(
                background_tasks,
                team_login,
                un,
                context["teamname"],
                ip,
                email_row["email"],
            )
        return {
            "message": "Login successful",
            "session_token": session_token.hex(),
            "request_id": request_id,
            "role": context["role"],
        }

    except Exception as e:
        conn.rollback()
        Log_event(sys_logger, "/login2", "ERROR", traceback.format_exc(), f"{un}", f"{ip}", f"{request_id}")
        sys_logger.error(f"Error: -{str(e)} occured at get-backup")
        return {"ERROR": "Something went wrong"}



async def addmem(data, request, background_tasks, conn):
    cursor = conn.cursor()
    un = data.username
    ip = get_client_ip(request)
    request_id = data.request_id
    try:
        start = time.time()
        teamname = data.teamname
        members = data.members
        admins = data.admin
        if check(ip) == "IP BLOCKED":
            return "IP BLOCKED, Check after some time"

        context = get_team_context(cursor, un, teamname=teamname)
        if not context:
            time_equilizer(start)
            return {"ERROR": f"Username or password is wrong"}
        session_error = require_team_session(context, data.session_id)
        if session_error:
            return session_error
        if context["role"] != "OWNER":
            return {"ERROR": "Only the team owner can invite users"}

        teamid = context["teamid"]
        if not members and not admins:
            return {"ERROR": "No invitation was sent"}
        if len(members or []) + len(admins or []) > 3:
            return {"ERROR": "You can invite up to 3 users at a time"}
        all_invitees = list(members or []) + list(admins or [])
        if all_invitees:
            cursor.execute(
            """
            SELECT u.id, u.username, e.email
            FROM users u
            LEFT JOIN emails e ON e.userid = u.id
            WHERE u.username = ANY(%s)
            """,
            (all_invitees,),
        )
        invitee_rows = cursor.fetchall()
        user_map = {
            row["username"]: row["id"]
            for row in invitee_rows
        }
        invitee_emails = {
            row["username"]: row["email"]
            for row in invitee_rows
        }

        invalid = set(all_invitees) - set(user_map)

        if invalid:
            return {"ERROR": "Some users don't exist"}
        overlap = set(members or []) & set(admins or [])
        if overlap:
            return {"ERROR": f"User cannot be both member and admin"}
        if un in all_invitees:
            return {"ERROR": "The team owner cannot be invited"}

        if members:
            role = "member"
            for member in members:
                member_id = user_map[member]
                if get_team_user(cursor, teamid, member):
                    return {"ERROR": f"{member} already belongs to this team"}
                key = team_invite_key(member_id, teamid, role)
                invites.hset(
                    key,
                    mapping={
                      "valid": "1",
                      "from": un,
                      "teamid": teamid,
                      "teamname": teamname,
                      "role": role,
                    },
                    )
                invites.expire(key, 172800)
        if admins:
            role = "admin"
            code = data.code
            if not code:
                return {"ERROR": "An admin invite code is required"}
            for admin in admins:
                admin_id = user_map[admin]
                cursor.execute(
                    """
                    SELECT 1
                    FROM users
                    WHERE id = %s AND member = %s;
                    """,
                    (admin_id, teamid),
                )
                is_member = cursor.fetchone()
                if not is_member:
                    return {"ERROR": f"{admin} must be a team member before becoming an admin"}
                key = team_invite_key(admin_id, teamid, role)
                invites.hset(
                    key,
                    mapping={
                        "valid": "1",
                        "from": un,
                        "teamname": teamname,
                        "teamid": teamid,
                        "role": role,
                        "code" : code
                    },
                        )
                invites.expire(key, 172800)

        for invitee in all_invitees:
            invitee_email = invitee_emails.get(invitee)
            if invitee_email:
                role = "admin" if invitee in (admins or []) else "member"
                queue_email(
                    background_tasks,
                    team_invitation,
                    invitee,
                    un,
                    teamname,
                    role,
                    invitee_email,
                )
        return {"message": "Invitations sent successfully"}
    except Exception as e:
        conn.rollback()
        Log_event(sys_logger, "/team/addmem", "ERROR", traceback.format_exc(), f"{un}", f"{ip}", f"{request_id}")
        return {"ERROR": "Something went wrong"}


def can_retrieve_secret(cursor, context, secret):
    if secret["category"] == "PASSWORD":
        return context["role"] in ("OWNER", "ADMIN") or bool(secret["member_can_view"])
    if secret["category"] != "API":
        return False
    if context["role"] == "OWNER":
        return True
    cursor.execute(
        """
        SELECT 1
        FROM team_api_secret_users
        WHERE secretid = %s AND userid = %s;
        """,
        (secret["id"], context["userid"]),
    )
    return cursor.fetchone() is not None


def secret_response(secret):
    response = {
        "id": secret["id"],
        "name": secret["secretname"],
        "category": secret["category"],
        "enc_data": secret["encdata"],
    }
    if secret["category"] == "PASSWORD":
        response["service_name"] = secret["servicename"]
    return response


async def team_dashboard(data, request, conn):
    cursor = conn.cursor()
    un = data.username
    ip = get_client_ip(request)
    request_id = data.request_id
    try:
        if check(ip) == "IP BLOCKED":
            return "IP BLOCKED, Check after some time"
        context = get_team_context(cursor, un, teamname=data.teamname)
        if not context:
            return {"ERROR": "Team not found or access denied"}
        session_error = require_team_session(context, data.session_id)
        if session_error:
            return session_error

        cursor.execute("SELECT username FROM users WHERE id = %s;", (context["ownerid"],))
        owner = cursor.fetchone()
        cursor.execute("SELECT username FROM users WHERE admin = %s ORDER BY username;", (context["teamid"],))
        admins = [row["username"] for row in cursor.fetchall()]
        cursor.execute("SELECT username FROM users WHERE member = %s ORDER BY username;", (context["teamid"],))
        members = [row["username"] for row in cursor.fetchall()]

        cursor.execute(
            """
            SELECT s.id, s.secretname, s.servicename, s.category
            FROM teamsecrets s
            WHERE s.teamid = %s
              AND (
                    (s.category = 'PASSWORD' AND (%s IN ('OWNER', 'ADMIN') OR s.member_can_view = TRUE))
                 OR (s.category = 'API' AND (
                        %s = 'OWNER'
                        OR EXISTS (
                            SELECT 1
                            FROM team_api_secret_users a
                            WHERE a.secretid = s.id AND a.userid = %s
                        )
                    ))
              )
            ORDER BY s.category, s.secretname;
            """,
            (
                context["teamid"],
                context["role"],
                context["role"],
                context["userid"],
            ),
        )
        passwords = []
        apis = []
        for row in cursor.fetchall():
            if row["category"] == "API":
                apis.append({"id": row["id"], "name": row["secretname"]})
            else:
                passwords.append({
                    "id": row["id"],
                    "name": row["secretname"],
                    "service_name": row["servicename"],
                })
        return {
            "teamname": context["teamname"],
            "role": context["role"],
            "owner": owner["username"] if owner else None,
            "admins": admins,
            "members": members,
            "passwords": passwords,
            "apis": apis,
        }
    except Exception:
        conn.rollback()
        Log_event(sys_logger, "/team/dashboard", "ERROR", traceback.format_exc(), un, ip, request_id)
        return {"ERROR": "Something went wrong"}


async def store_secret(data, request, conn):
    cursor = conn.cursor()
    un = data.username
    ip = get_client_ip(request)
    request_id = data.request_id
    try:
        if check(ip) == "IP BLOCKED":
            return {"ERROR": "You have been blocked for violating policies, Try again later"}
        context = get_team_context(cursor, un, teamname=data.teamname)
        if not context:
            return {"ERROR": "Team not found or access denied"}
        session_error = require_team_session(context, data.session_id)
        if session_error:
            return session_error
        if context["role"] not in ("OWNER", "ADMIN"):
            return {"ERROR": "Only the owner or an admin can store team secrets"}

        category = data.category
        member_can_view = bool(data.member_can_view)
        require_2fa = bool(data.require_2fa)
        selected_users = list(dict.fromkeys(data.selected_users or []))
        if category == "API":
            if not require_2fa:
                return {"ERROR": "API secrets always require OTP"}
            if member_can_view:
                return {"ERROR": "API secrets use an explicit user allow-list"}
            require_2fa = True
            member_can_view = False
        elif selected_users:
            return {"ERROR": "Selected users are only supported for API secrets"}
        if category == "PASSWORD" and not data.service_name:
            return {"ERROR": "A service name is required for passwords"}

        selected_rows = []
        for selected_username in selected_users:
            selected = get_team_user(cursor, context["teamid"], selected_username)
            if not selected:
                return {"ERROR": f"{selected_username} does not belong to this team"}
            selected_rows.append(selected)
        if category == "API" and context["ownerid"] not in {
            selected["id"] for selected in selected_rows
        }:
            selected_rows.append({"id": context["ownerid"]})

        cursor.execute(
            """
            SELECT 1 FROM teamsecrets
            WHERE teamid = %s AND category = %s AND secretname = %s;
            """,
            (context["teamid"], category, data.secret_name),
        )
        if cursor.fetchone():
            return {"ERROR": "A team secret with this name and category already exists"}

        cursor.execute(
            """
            INSERT INTO teamsecrets (
                teamid, creatorid, secretname, servicename, encdata,
                category, member_can_view, require_2fa
            )
            VALUES (%s, %s, %s, %s, %s, %s, %s, %s)
            RETURNING id;
            """,
            (
                context["teamid"],
                context["userid"],
                data.secret_name,
                data.service_name,
                data.enc_data,
                category,
                member_can_view,
                require_2fa,
            ),
        )
        secretid = cursor.fetchone()["id"]
        for selected in selected_rows:
            cursor.execute(
                """
                INSERT INTO team_api_secret_users (secretid, userid, grantedby)
                VALUES (%s, %s, %s)
                ON CONFLICT (secretid, userid) DO NOTHING;
                """,
                (secretid, selected["id"], context["userid"]),
            )
        conn.commit()
        Log_event(db_logger, "/team/store_secret", "INFO", "Team secret stored", un, ip, request_id)
        return {"message": "Team secret stored successfully", "secret_id": secretid}
    except Exception:
        conn.rollback()
        Log_event(sys_logger, "/team/store_secret", "ERROR", traceback.format_exc(), un, ip, request_id)
        return {"ERROR": "Something went wrong"}


async def retrieve_secret(data, request, background_tasks, conn):
    cursor = conn.cursor()
    un = data.username
    ip = get_client_ip(request)
    try:
        if check(ip) == "IP BLOCKED":
            return {"ERROR": "You have been blocked for violating policies, Try again later"}
        context = get_team_context(cursor, un, teamname=data.teamname)
        if not context:
            return {"ERROR": "Team not found or access denied"}
        session_error = require_team_session(context, data.session_id)
        if session_error:
            return session_error
        cursor.execute(
            "SELECT * FROM teamsecrets WHERE id = %s AND teamid = %s;",
            (data.secret_id, context["teamid"]),
        )
        secret = cursor.fetchone()
        if not secret:
            return {"ERROR": "Team secret not found"}
        if not can_retrieve_secret(cursor, context, secret):
            return {"ERROR": "You do not have access to this team secret"}

        require_2fa = secret["category"] == "API" or bool(secret["require_2fa"])
        if not require_2fa:
            return secret_response(secret)

        otp_status = otp_generation_and_verfication_team(
            un,
            "",
            cursor,
            "gen",
            background_tasks,
            require_configured=True,
            teamid=context["teamid"],
            teamname=context["teamname"],
            action="retrieve-secret",
        )
        if otp_status == "NOT_CONFIGURED":
            return {"ERROR": "OTP must be enabled to retrieve this secret"}
        request_id = uuid.uuid4().hex
        key = f"team-retrieve:{un},{context['teamid']},{secret['id']}"
        nonce_db.hset(
            key,
            mapping={"request_id": request_id, "ip": ip},
        )
        nonce_db.expire(key, 300)
        return {
            "message": "OTP required",
            "otp_required": True,
            "otp_method": "totp" if otp_status == "totp" else "gmail",
            "request_id": request_id,
        }
    except Exception:
        conn.rollback()
        Log_event(sys_logger, "/team/retrieve_secret", "ERROR", traceback.format_exc(), un, ip, "-")
        return {"ERROR": "Something went wrong"}


async def retrieve_secret2(data, request, conn):
    cursor = conn.cursor()
    un = data.username
    ip = get_client_ip(request)
    request_id = data.request_id
    try:
        if check(ip) == "IP BLOCKED":
            return {"ERROR": "You have been blocked for violating policies, Try again later"}
        context = get_team_context(cursor, un, teamname=data.teamname)
        if not context:
            return {"ERROR": "Team not found or access denied"}
        session_error = require_team_session(context, data.session_id)
        if session_error:
            return session_error
        cursor.execute(
            "SELECT * FROM teamsecrets WHERE id = %s AND teamid = %s;",
            (data.secret_id, context["teamid"]),
        )
        secret = cursor.fetchone()
        if not secret:
            return {"ERROR": "Team secret not found"}
        if not can_retrieve_secret(cursor, context, secret):
            return {"ERROR": "You do not have access to this team secret"}
        if secret["category"] != "API" and not secret["require_2fa"]:
            return secret_response(secret)

        key = f"team-retrieve:{un},{context['teamid']},{secret['id']}"
        pending = nonce_db.hgetall(key)
        if not pending or pending.get("request_id") != request_id or pending.get("ip") != ip:
            return {"ERROR": "OTP challenge expired"}
        otp_status = otp_generation_and_verfication_team(
            un,
            data.otp,
            cursor,
            "ver",
            require_configured=True,
            teamid=context["teamid"],
            teamname=context["teamname"],
            action="retrieve-secret",
        )
        if otp_status == "expired":
            return {"ERROR": "OTP expired"}
        if otp_status != "VALID":
            blocker(ip, request_id)
            return {"ERROR": "Wrong OTP"}
        nonce_db.delete(key)
        Log_event(access_logger, "/team/retrieve_secret2", "INFO", "Team secret retrieved", un, ip, request_id)
        return secret_response(secret)
    except Exception:
        conn.rollback()
        Log_event(sys_logger, "/team/retrieve_secret2", "ERROR", traceback.format_exc(), un, ip, request_id)
        return {"ERROR": "Something went wrong"}


async def add_api_secret_users(data, request, conn):
    cursor = conn.cursor()
    un = data.username
    ip = get_client_ip(request)
    request_id = data.request_id
    try:
        if check(ip) == "IP BLOCKED":
            return {"ERROR": "You have been blocked for violating policies, Try again later"}
        context = get_team_context(cursor, un, teamname=data.teamname)
        if not context:
            return {"ERROR": "Team not found or access denied"}
        session_error = require_team_session(context, data.session_id)
        if session_error:
            return session_error
        if context["role"] not in ("OWNER", "ADMIN"):
            return {"ERROR": "Only the owner or an admin can modify API access"}
        cursor.execute(
            "SELECT id, category FROM teamsecrets WHERE id = %s AND teamid = %s;",
            (data.secret_id, context["teamid"]),
        )
        secret = cursor.fetchone()
        if not secret:
            return {"ERROR": "Team secret not found"}
        if secret["category"] != "API":
            return {"ERROR": "Access lists can only be modified for API secrets"}

        target_users = list(dict.fromkeys(data.users or []))
        if not target_users:
            return {"ERROR": "No users were selected"}
        targets = []
        for target_username in target_users:
            target = get_team_user(cursor, context["teamid"], target_username)
            if not target:
                return {"ERROR": f"{target_username} does not belong to this team"}
            targets.append(target)
        added = 0
        for target in targets:
            cursor.execute(
                """
                INSERT INTO team_api_secret_users (secretid, userid, grantedby)
                VALUES (%s, %s, %s)
                ON CONFLICT (secretid, userid) DO NOTHING;
                """,
                (secret["id"], target["id"], context["userid"]),
            )
            added += cursor.rowcount
        conn.commit()
        return {
            "message": "API access updated",
            "added": added,
            "already_allowed": len(targets) - added,
        }
    except Exception:
        conn.rollback()
        Log_event(sys_logger, "/team/api_secret/add_users", "ERROR", traceback.format_exc(), un, ip, request_id)
        return {"ERROR": "Something went wrong"}


async def delete_secret_challenge(data, request, background_tasks, conn):
    cursor = conn.cursor()
    un = data.username
    ip = get_client_ip(request)
    try:
        context = get_team_context(cursor, un, teamname=data.teamname)
        if not context:
            return {"ERROR": "Team not found or access denied"}
        session_error = require_team_session(context, data.session_id)
        if session_error:
            return session_error
        if not has_destructive_permission(cursor, context, "delete_secrets"):
            return {"ERROR": "You do not have permission to delete team secrets"}
        cursor.execute(
            "SELECT 1 FROM teamsecrets WHERE id = %s AND teamid = %s;",
            (data.secret_id, context["teamid"]),
        )
        if not cursor.fetchone():
            return {"ERROR": "Team secret not found"}
        return create_team_action_challenge(
            "delete-secret",
            data.secret_id,
            context,
            cursor,
            ip,
            background_tasks,
        )
    except Exception:
        conn.rollback()
        Log_event(sys_logger, "/team/delete_secret", "ERROR", traceback.format_exc(), un, ip, "-")
        return {"ERROR": "Something went wrong"}


async def delete_secret(data, request, conn):
    cursor = conn.cursor()
    un = data.username
    ip = get_client_ip(request)
    request_id = data.request_id
    try:
        context = get_team_context(cursor, un, teamname=data.teamname)
        if not context:
            return {"ERROR": "Team not found or access denied"}
        session_error = require_team_session(context, data.session_id)
        if session_error:
            return session_error
        if not has_destructive_permission(cursor, context, "delete_secrets"):
            return {"ERROR": "You do not have permission to delete team secrets"}
        auth_error = verify_team_action(
            "delete-secret",
            data.secret_id,
            context,
            data.signature,
            data.otp,
            request_id,
            cursor,
            ip,
        )
        if auth_error:
            return auth_error
        cursor.execute(
            "DELETE FROM teamsecrets WHERE id = %s AND teamid = %s RETURNING id;",
            (data.secret_id, context["teamid"]),
        )
        if not cursor.fetchone():
            conn.rollback()
            return {"ERROR": "Team secret not found"}
        conn.commit()
        Log_event(db_logger, "/team/delete_secret2", "INFO", "Team secret deleted", un, ip, request_id)
        return {"message": "Team secret deleted successfully"}
    except Exception:
        conn.rollback()
        Log_event(sys_logger, "/team/delete_secret2", "ERROR", traceback.format_exc(), un, ip, request_id)
        return {"ERROR": "Something went wrong"}


async def remove_member_challenge(data, request, background_tasks, conn):
    cursor = conn.cursor()
    un = data.username
    ip = get_client_ip(request)
    try:
        context = get_team_context(cursor, un, teamname=data.teamname)
        if not context:
            return {"ERROR": "Team not found or access denied"}
        session_error = require_team_session(context, data.session_id)
        if session_error:
            return session_error
        if not has_destructive_permission(cursor, context, "remove_members"):
            return {"ERROR": "You do not have permission to remove team users"}
        target = get_team_user(cursor, context["teamid"], data.target_username)
        if not target:
            return {"ERROR": "Target user is not part of this team"}
        if target["role"] == "OWNER":
            return {"ERROR": "The team owner cannot be removed"}
        if target["id"] == context["userid"]:
            return {"ERROR": "Use the resign endpoint to leave the team"}
        return create_team_action_challenge(
            "remove-member",
            target["id"],
            context,
            cursor,
            ip,
            background_tasks,
        )
    except Exception:
        conn.rollback()
        Log_event(sys_logger, "/team/remove_member", "ERROR", traceback.format_exc(), un, ip, "-")
        return {"ERROR": "Something went wrong"}


async def remove_member(data, request, conn):
    cursor = conn.cursor()
    un = data.username
    ip = get_client_ip(request)
    request_id = data.request_id
    try:
        context = get_team_context(cursor, un, teamname=data.teamname)
        if not context:
            return {"ERROR": "Team not found or access denied"}
        session_error = require_team_session(context, data.session_id)
        if session_error:
            return session_error
        if not has_destructive_permission(cursor, context, "remove_members"):
            return {"ERROR": "You do not have permission to remove team users"}
        target = get_team_user(cursor, context["teamid"], data.target_username)
        if not target:
            return {"ERROR": "Target user is not part of this team"}
        if target["role"] == "OWNER":
            return {"ERROR": "The team owner cannot be removed"}
        if target["id"] == context["userid"]:
            return {"ERROR": "Use the resign endpoint to leave the team"}
        auth_error = verify_team_action(
            "remove-member",
            target["id"],
            context,
            data.signature,
            data.otp,
            request_id,
            cursor,
            ip,
        )
        if auth_error:
            return auth_error
        if target["role"] == "ADMIN":
            cursor.execute(
                "UPDATE users SET admin = NULL WHERE id = %s AND admin = %s;",
                (target["id"], context["teamid"]),
            )
        else:
            cursor.execute(
                "UPDATE users SET member = NULL WHERE id = %s AND member = %s;",
                (target["id"], context["teamid"]),
            )
        cursor.execute(
            "DELETE FROM team_admin_permissions WHERE teamid = %s AND userid = %s;",
            (context["teamid"], target["id"]),
        )
        cursor.execute(
            """
            DELETE FROM team_api_secret_users a
            USING teamsecrets s
            WHERE a.secretid = s.id AND s.teamid = %s AND a.userid = %s;
            """,
            (context["teamid"], target["id"]),
        )
        rebuild_teamconfig(cursor, context["teamid"], context["ownerid"])
        conn.commit()
        delete_team_invites(context["teamid"], target["id"])
        session.delete(f"Team_session_id:{target['username']},{context['teamid']}")
        Log_event(db_logger, "/team/remove_member2", "INFO", "Team user removed", un, ip, request_id)
        return {"message": "Team user removed successfully"}
    except Exception:
        conn.rollback()
        Log_event(sys_logger, "/team/remove_member2", "ERROR", traceback.format_exc(), un, ip, request_id)
        return {"ERROR": "Something went wrong"}


async def resign_team(data, request, conn):
    cursor = conn.cursor()
    un = data.username
    ip = get_client_ip(request)
    request_id = data.request_id
    try:
        if check(ip) == "IP BLOCKED":
            return {"ERROR": "You have been blocked for violating policies, Try again later"}
        context = get_team_context(cursor, un, teamname=data.teamname)
        if not context:
            return {"ERROR": "Team not found or access denied"}
        session_error = require_team_session(context, data.session_id)
        if session_error:
            return session_error
        if context["role"] == "OWNER":
            return {"ERROR": "The owner must delete the team or transfer ownership before leaving"}
        if context["role"] == "ADMIN":
            cursor.execute(
                "UPDATE users SET admin = NULL WHERE id = %s AND admin = %s;",
                (context["userid"], context["teamid"]),
            )
        else:
            cursor.execute(
                "UPDATE users SET member = NULL WHERE id = %s AND member = %s;",
                (context["userid"], context["teamid"]),
            )
        cursor.execute(
            "DELETE FROM team_admin_permissions WHERE teamid = %s AND userid = %s;",
            (context["teamid"], context["userid"]),
        )
        cursor.execute(
            """
            DELETE FROM team_api_secret_users a
            USING teamsecrets s
            WHERE a.secretid = s.id AND s.teamid = %s AND a.userid = %s;
            """,
            (context["teamid"], context["userid"]),
        )
        rebuild_teamconfig(cursor, context["teamid"], context["ownerid"])
        conn.commit()
        delete_team_invites(context["teamid"], context["userid"])
        session.delete(f"Team_session_id:{un},{context['teamid']}")
        return {"message": "You have left the team"}
    except Exception:
        conn.rollback()
        Log_event(sys_logger, "/team/resign", "ERROR", traceback.format_exc(), un, ip, request_id)
        return {"ERROR": "Something went wrong"}


def admin_permission_binding(targetid, can_delete_secrets, can_remove_members):
    return f"{targetid}:{int(can_delete_secrets)}:{int(can_remove_members)}"


async def admin_permissions_challenge(data, request, background_tasks, conn):
    cursor = conn.cursor()
    un = data.username
    ip = get_client_ip(request)
    try:
        context = get_team_context(cursor, un, teamname=data.teamname)
        if not context:
            return {"ERROR": "Team not found or access denied"}
        session_error = require_team_session(context, data.session_id)
        if session_error:
            return session_error
        if context["role"] != "OWNER":
            return {"ERROR": "Only the team owner can grant destructive permissions"}
        target = get_team_user(cursor, context["teamid"], data.admin_username)
        if not target or target["role"] != "ADMIN":
            return {"ERROR": "Target user is not an admin of this team"}
        binding = admin_permission_binding(
            target["id"],
            data.can_delete_secrets,
            data.can_remove_members,
        )
        return create_team_action_challenge(
            "admin-permissions",
            binding,
            context,
            cursor,
            ip,
            background_tasks,
        )
    except Exception:
        conn.rollback()
        Log_event(sys_logger, "/team/admin_permissions", "ERROR", traceback.format_exc(), un, ip, "-")
        return {"ERROR": "Something went wrong"}


async def set_admin_permissions(data, request, conn):
    cursor = conn.cursor()
    un = data.username
    ip = get_client_ip(request)
    request_id = data.request_id
    try:
        context = get_team_context(cursor, un, teamname=data.teamname)
        if not context:
            return {"ERROR": "Team not found or access denied"}
        session_error = require_team_session(context, data.session_id)
        if session_error:
            return session_error
        if context["role"] != "OWNER":
            return {"ERROR": "Only the team owner can grant destructive permissions"}
        target = get_team_user(cursor, context["teamid"], data.admin_username)
        if not target or target["role"] != "ADMIN":
            return {"ERROR": "Target user is not an admin of this team"}
        binding = admin_permission_binding(
            target["id"],
            data.can_delete_secrets,
            data.can_remove_members,
        )
        auth_error = verify_team_action(
            "admin-permissions",
            binding,
            context,
            data.signature,
            data.otp,
            request_id,
            cursor,
            ip,
        )
        if auth_error:
            return auth_error
        cursor.execute(
            """
            INSERT INTO team_admin_permissions (
                teamid, userid, can_delete_secrets, can_remove_members, grantedby
            )
            VALUES (%s, %s, %s, %s, %s)
            ON CONFLICT (teamid, userid)
            DO UPDATE SET
                can_delete_secrets = EXCLUDED.can_delete_secrets,
                can_remove_members = EXCLUDED.can_remove_members,
                grantedby = EXCLUDED.grantedby;
            """,
            (
                context["teamid"],
                target["id"],
                data.can_delete_secrets,
                data.can_remove_members,
                context["userid"],
            ),
        )
        conn.commit()
        return {"message": "Admin permissions updated"}
    except Exception:
        conn.rollback()
        Log_event(sys_logger, "/team/admin_permissions2", "ERROR", traceback.format_exc(), un, ip, request_id)
        return {"ERROR": "Something went wrong"}


async def delete_team_challenge(data, request, background_tasks, conn):
    cursor = conn.cursor()
    un = data.username
    ip = get_client_ip(request)
    try:
        context = get_team_context(cursor, un, teamname=data.teamname)
        if not context:
            return {"ERROR": "Team not found or access denied"}
        session_error = require_team_session(context, data.session_id)
        if session_error:
            return session_error
        if context["role"] != "OWNER":
            return {"ERROR": "Only the team owner can delete the team"}
        return create_team_action_challenge(
            "delete-team",
            context["teamid"],
            context,
            cursor,
            ip,
            background_tasks,
        )
    except Exception:
        conn.rollback()
        Log_event(sys_logger, "/team/delete_team", "ERROR", traceback.format_exc(), un, ip, "-")
        return {"ERROR": "Something went wrong"}


async def delete_team(data, request, conn):
    cursor = conn.cursor()
    un = data.username
    ip = get_client_ip(request)
    request_id = data.request_id
    try:
        context = get_team_context(cursor, un, teamname=data.teamname)
        if not context:
            return {"ERROR": "Team not found or access denied"}
        session_error = require_team_session(context, data.session_id)
        if session_error:
            return session_error
        if context["role"] != "OWNER":
            return {"ERROR": "Only the team owner can delete the team"}
        auth_error = verify_team_action(
            "delete-team",
            context["teamid"],
            context,
            data.signature,
            data.otp,
            request_id,
            cursor,
            ip,
        )
        if auth_error:
            return auth_error

        cursor.execute(
            """
            SELECT username
            FROM users
            WHERE id = %s OR member = %s OR admin = %s;
            """,
            (context["ownerid"], context["teamid"], context["teamid"]),
        )
        participant_usernames = [row["username"] for row in cursor.fetchall()]
        cursor.execute(
            """
            DELETE FROM team_api_secret_users a
            USING teamsecrets s
            WHERE a.secretid = s.id AND s.teamid = %s;
            """,
            (context["teamid"],),
        )
        cursor.execute("DELETE FROM team_admin_permissions WHERE teamid = %s;", (context["teamid"],))
        cursor.execute("DELETE FROM teamsecrets WHERE teamid = %s;", (context["teamid"],))
        cursor.execute("DELETE FROM teamconfig WHERE teamid = %s;", (context["teamid"],))
        cursor.execute("DELETE FROM teamauth WHERE teamid = %s;", (context["teamid"],))
        cursor.execute(
            "UPDATE users SET member = NULL WHERE member = %s;",
            (context["teamid"],),
        )
        cursor.execute(
            "UPDATE users SET admin = NULL WHERE admin = %s;",
            (context["teamid"],),
        )
        cursor.execute(
            "DELETE FROM teams WHERE id = %s AND userid = %s RETURNING id;",
            (context["teamid"], context["userid"]),
        )
        if not cursor.fetchone():
            conn.rollback()
            return {"ERROR": "Team not found or access denied"}
        conn.commit()
        delete_team_invites(context["teamid"])
        for participant_username in participant_usernames:
            session.delete(f"Team_session_id:{participant_username},{context['teamid']}")
        Log_event(db_logger, "/team/delete_team2", "INFO", "Team deleted", un, ip, request_id)
        return {"message": "Team deleted successfully"}
    except Exception:
        conn.rollback()
        Log_event(sys_logger, "/team/delete_team2", "ERROR", traceback.format_exc(), un, ip, request_id)
        return {"ERROR": "Something went wrong"}
