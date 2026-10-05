import hmac
import hashlib
import os
from fastapi import FastAPI, Depends, BackgroundTasks
import redis
import base64
from pydantic import BaseModel, StringConstraints, Field
from typing import Annotated, Literal
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
from coffre import (
    delete_account as coffre_delete_account,
    delete_account2 as coffre_delete_account2,
    delete_password as coffre_delete_password,
    delete_password2 as coffre_delete_password2,
    enable_otp as coffre_enable_otp,
    enable_otp2 as coffre_enable_otp2,
    get_enc as coffre_get_enc,
    get_enc2 as coffre_get_enc2,
    hint as coffre_hint,
    hint2 as coffre_hint2,
    list as coffre_list,
    list2 as coffre_list2,
    login as coffre_login,
    login2 as coffre_login2,
    newuser1 as coffre_newuser1,
    newuser2 as coffre_newuser2,
    profile_status as coffre_profile_status,
    profile_status2 as coffre_profile_status2,
    store_password as coffre_store_password,
    store_password2 as coffre_store_password2,
    accept_invite as coffre_accept_invite,
    accept_invite_admin as coffre_accept_invite_admin,
)

from coffreteam import (
    newteam1,
    newteam2,
    teamlogin1 as coffre_teamlogin1,
    teamlogin2 as coffre_teamlogin2,
    addmem as coffre_addmem,
    team_dashboard as coffre_team_dashboard,
    store_secret as coffre_store_team_secret,
    retrieve_secret as coffre_retrieve_team_secret,
    retrieve_secret2 as coffre_retrieve_team_secret2,
    add_api_secret_users as coffre_add_api_secret_users,
    delete_secret_challenge as coffre_delete_team_secret_challenge,
    delete_secret as coffre_delete_team_secret,
    remove_member_challenge as coffre_remove_team_member_challenge,
    remove_member as coffre_remove_team_member,
    resign_team as coffre_resign_team,
    admin_permissions_challenge as coffre_admin_permissions_challenge,
    set_admin_permissions as coffre_set_admin_permissions,
    delete_team_challenge as coffre_delete_team_challenge,
    delete_team as coffre_delete_team,
)

from neuris import neuris
from announcements import router as announcements_router
#---------------------------------------------------setup--------------------------------------------------#
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
app = FastAPI()
app.include_router(announcements_router)

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

#--------------------------------------------strict input classes--------------------------------------------------#

# =========================
# Strict input parameters 
# =========================

OTPType = Annotated[
    str,
    StringConstraints(
        min_length=0,
        max_length=6,
        pattern=r"^[0-9A-Z]*$"
    )
]

EmailType = Annotated[
    str,
    StringConstraints(
        min_length=3,
        max_length=90,
        pattern=r"^[a-zA-Z0-9@._]+$"
    )
]

UsernameType = Annotated[
    str,
    StringConstraints(
        min_length=1,
        max_length=32,
        pattern=r"^[a-zA-Z0-9@._]+$"
    )
]

Hex64Type = Annotated[
    str,
    StringConstraints(
        min_length=64,
        max_length=64,
        pattern=r"^[a-fA-F0-9]+$"
    )
]



PasswordNameType = Annotated[
    str,
    StringConstraints(
        min_length=1,
        max_length=64,
        pattern=r"^[a-zA-Z0-9.@_]+$"
    )
]

Base64Type = Annotated[
    str,
    StringConstraints(
        min_length=1,
        max_length=10000,
        pattern=r"^[A-Za-z0-9+/=]+$"
    )
]

HintBase64Type = Annotated[
    str,
    StringConstraints(
        min_length=0,
        max_length=10000,
        pattern=r"^[A-Za-z0-9+/=]+$"
    )
]

Requets_ID = Annotated[
    str,
    StringConstraints(
        min_length=32,
        max_length=32,
        pattern=r"^[a-fA-F0-9]{32}$"
    )
]

SessionIdType = Annotated[
    str,
    StringConstraints(
        min_length=64,
        max_length=64,
        pattern=r"^[a-fA-F0-9]{64}$"
    )
]

PasswordHintType = Annotated[
    str,
    StringConstraints(
        min_length=0,
        max_length=100,
        pattern=r"^[ -~]{0,100}$"
    )
]


# =========================
# Request Models
# =========================

class UsernameRequest(BaseModel):
    username: UsernameType
    session_id: SessionIdType | None = None

class TeamRequest(BaseModel):
    username: UsernameType
    team_name: UsernameType
    session_id: SessionIdType | None = None

class NewUserVerification(BaseModel):
    username: UsernameType
    email: EmailType

class NewUserRequest(BaseModel):
    username: UsernameType
    hash: Hex64Type
    email: EmailType
    salt: Annotated[
        str,
        StringConstraints(
            min_length=64,
            max_length=64,
            pattern=r"^[a-fA-F0-9]+$"
        )
    ]
    otp: OTPType
    

class NewTeamRequest(BaseModel):
    username: UsernameType
    teamname: UsernameType
    hash: Hex64Type
    salt: Annotated[
        str,
        StringConstraints(
            min_length=64,
            max_length=64,
            pattern=r"^[a-fA-F0-9]+$"
        )
    ]
    otp: OTPType
    memberinvites: list[str] = Field(default_factory=list)
    admininvites: list[str] = Field(default_factory=list)

class TeamLoginRequest(BaseModel):
    username: UsernameType
    teamname: UsernameType

class TeamLogin2Request(BaseModel):
    signature: Hex64Type
    username: UsernameType
    teamname: UsernameType
    otp: OTPType
    request_id: Requets_ID

class AddMemberRequest(BaseModel):
    username: UsernameType
    session_id: SessionIdType
    teamname: UsernameType
    request_id: Requets_ID
    members: list[UsernameType] = Field(default_factory=list)
    admin: list[UsernameType] = Field(default_factory=list)
    code: str | None = None

class TeamDashboardRequest(BaseModel):
    username: UsernameType
    session_id: SessionIdType
    teamname: UsernameType
    request_id: Requets_ID

class TeamStoreSecretRequest(BaseModel):
    username: UsernameType
    session_id: SessionIdType
    teamname: UsernameType
    secret_name: PasswordNameType
    service_name: PasswordNameType | None = None
    enc_data: Base64Type
    category: Literal["PASSWORD", "API"] = "PASSWORD"
    member_can_view: bool = False
    require_2fa: bool = False
    selected_users: list[UsernameType] = Field(default_factory=list, max_length=100)
    request_id: Requets_ID

class TeamSecretRequest(BaseModel):
    username: UsernameType
    session_id: SessionIdType
    teamname: UsernameType
    secret_id: int = Field(gt=0)

class TeamSecretOTPRequest(TeamSecretRequest):
    otp: OTPType
    request_id: Requets_ID

class TeamAPIUsersRequest(BaseModel):
    username: UsernameType
    session_id: SessionIdType
    teamname: UsernameType
    secret_id: int = Field(gt=0)
    users: list[UsernameType] = Field(default_factory=list, max_length=100)
    request_id: Requets_ID

class TeamSecretActionRequest(TeamSecretRequest):
    pass

class TeamSecretAction2Request(TeamSecretOTPRequest):
    signature: Hex64Type

class TeamMemberActionRequest(BaseModel):
    username: UsernameType
    session_id: SessionIdType
    teamname: UsernameType
    target_username: UsernameType

class TeamMemberAction2Request(TeamMemberActionRequest):
    signature: Hex64Type
    otp: OTPType
    request_id: Requets_ID

class TeamResignRequest(BaseModel):
    username: UsernameType
    session_id: SessionIdType
    teamname: UsernameType
    request_id: Requets_ID

class TeamAdminPermissionsRequest(BaseModel):
    username: UsernameType
    session_id: SessionIdType
    teamname: UsernameType
    admin_username: UsernameType
    can_delete_secrets: bool = False
    can_remove_members: bool = False

class TeamAdminPermissions2Request(TeamAdminPermissionsRequest):
    signature: Hex64Type
    otp: OTPType
    request_id: Requets_ID

class TeamDeleteRequest(BaseModel):
    username: UsernameType
    session_id: SessionIdType
    teamname: UsernameType

class TeamDelete2Request(TeamDeleteRequest):
    signature: Hex64Type
    otp: OTPType
    request_id: Requets_ID

class AcceptInviteRequest(BaseModel):
    username: UsernameType
    session_id: SessionIdType
    teamname: UsernameType

class AcceptInviteAdminRequest(BaseModel):
    username: UsernameType
    session_id: SessionIdType
    teamname: UsernameType
    code: str

class StoredPasswordRequest(BaseModel):
    signature: Hex64Type
    username: UsernameType
    session_id: SessionIdType
    password_name: PasswordNameType 
    usernametbs: UsernameType
    enc_data: Base64Type
    hint: Optional[Base64Type] = None
    request_id: Requets_ID 


class GetEncryptedRequest(BaseModel):
    signature: Hex64Type
    username: UsernameType
    session_id: SessionIdType
    password_name: PasswordNameType
    usernameS: PasswordNameType
    request_id: Requets_ID


class GetBackupRequest(BaseModel):
    signature: Hex64Type
    username: UsernameType
    otp: OTPType
    request_id: Requets_ID

class ListPasswordRequest(BaseModel):
    signature: Hex64Type
    username: UsernameType
    session_id: SessionIdType
    request_id: Requets_ID

class ProfileStatusRequest(BaseModel):
    signature: Hex64Type
    username: UsernameType
    session_id: SessionIdType
    request_id: Requets_ID

class HintPasswordRequest(BaseModel):
    signature: Hex64Type
    username: UsernameType
    session_id: SessionIdType
    service_name: PasswordNameType
    storedusername : UsernameType
    request_id: Requets_ID

class GetOTPRequest(BaseModel):
    signature: Hex64Type
    username: UsernameType
    session_id: SessionIdType | None = None
    method: Annotated[
        str,
        StringConstraints(
            min_length=4,
            max_length=5,
            pattern=r"^[a-z]+$"
        )
    ]
    request_id: Requets_ID


class DeletePasswordRequest2(BaseModel):
    signature: Hex64Type
    username: UsernameType
    session_id: SessionIdType
    password_name: PasswordNameType
    usernameS: PasswordNameType
    request_id: Requets_ID

#----------------------------------------------functions--------------------------------------------------#

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


@app.middleware("http")
async def log_requests(request: Request, call_next):
    request_id = request.headers.get("x-request-id") or uuid.uuid4().hex
    ip = get_client_ip(request)
    start = time.perf_counter()
    path = request.url.path

    Log_event(
        access_logger,
        path,
        "INFO",
        "request_started",
        "-",
        ip,
        request_id,
        method=request.method,
    )

    try:
        response = await call_next(request)
    except Exception:
        duration_ms = round((time.perf_counter() - start) * 1000, 2)
        Log_event(
            access_logger,
            path,
            "ERROR",
            "request_failed",
            "-",
            ip,
            request_id,
            method=request.method,
            duration_ms=duration_ms,
        )
        raise

    duration_ms = round((time.perf_counter() - start) * 1000, 2)
    Log_event(
        access_logger,
        path,
        "INFO" if response.status_code < 400 else "WARNING",
        "request_finished",
        "-",
        ip,
        request_id,
        method=request.method,
        status_code=response.status_code,
        duration_ms=duration_ms,
    )
    response.headers["X-Request-ID"] = request_id
    return response

# =========================
# encrypting otp secret
# =========================

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
        


# =========================
# Middleware
# =========================


app.add_middleware(

    CORSMiddleware,

    allow_origins=["*"],

    allow_credentials=True,

    allow_methods=["*"],

    allow_headers=["*"]


)

# @app.middleware("http")
# async def security_headers(request, call_next):
#     response = await call_next(request)
    
#     response.headers["X-Content-Type-Options"] = "nosniff"
#     response.headers["X-Frame-Options"] = "DENY"
#     response.headers["X-XSS-Protection"] = "1; mode=block"
#     response.headers["Referrer-Policy"] = "strict-origin-when-cross-origin"
#     response.headers["Content-Security-Policy"] = "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; object-src 'none'; frame-ancestors 'none';"
    
#     return response


#--------------------------------------------APIs--------------------------------------------------#

# =========================
# otp enabling
# =========================

@app.post("/coffre/enableotp")
async def enable_otp(data: UsernameRequest, request: Request, conn=Depends(get_db)):
    return await coffre_enable_otp(data, request, conn)

@app.post("/coffre/enable_otp2")
async def enable_otp2(data: GetOTPRequest, request: Request, conn=Depends(get_db)):
    return await coffre_enable_otp2(data, request, conn)
    

# =========================
# new user creation
# =========================


@app.post("/coffre/newuser1")
def new_user(data: NewUserVerification, request: Request, background_tasks: BackgroundTasks, conn=Depends(get_db)):
    return coffre_newuser1(data, request, background_tasks, conn)

@app.post("/coffre/newuser2")
async def newuser2(data: NewUserRequest, request: Request, background_tasks: BackgroundTasks, conn=Depends(get_db)):
    return await coffre_newuser2(data, request, background_tasks, conn)

# =========================
# storing password
# =========================

# To store the password.
@app.post("/coffre/storepassword")
async def store_password(data: UsernameRequest, request: Request, conn=Depends(get_db)):
    return await coffre_store_password(data, request, conn)


@app.post("/coffre/storepassword2")
async def store_password2(Pdata: StoredPasswordRequest, request: Request, conn=Depends(get_db)):
    return await coffre_store_password2(Pdata, request, conn)



# =========================
# retreving password
# =========================


@app.post("/coffre/getenc")
async def get_enc(data: UsernameRequest, request: Request, conn=Depends(get_db)):
    return await coffre_get_enc(data, request, conn)


@app.post("/coffre/getenc2")
async def get_enc2(Pdata: GetEncryptedRequest, request: Request, background_tasks: BackgroundTasks, conn=Depends(get_db)):
    return await coffre_get_enc2(Pdata, request, background_tasks, conn)

# =========================
# retriving backup
# =========================
@app.post("/coffre/login")
async def login(data: UsernameRequest, request: Request, background_tasks: BackgroundTasks, conn=Depends(get_db)):
    return await coffre_login(data, request, background_tasks, conn)


@app.post("/coffre/login2")
async def login2(data: GetBackupRequest, request: Request, background_tasks: BackgroundTasks, conn=Depends(get_db)):
    return await coffre_login2(data, request, background_tasks, conn)


@app.post("/coffre/profile/status")
async def profile_status(data: UsernameRequest, request: Request, conn=Depends(get_db)):
    return await coffre_profile_status(data, request, conn)


@app.post("/coffre/profile/status2")
async def profile_status2(data: ProfileStatusRequest, request: Request, conn=Depends(get_db)):
    return await coffre_profile_status2(data, request, conn)


@app.post("/coffre/list")
async def list(data: UsernameRequest, request: Request, conn=Depends(get_db)):
    return await coffre_list(data, request, conn)

@app.post("/coffre/list2")
async def list2(Pdata: ListPasswordRequest, request: Request, conn=Depends(get_db)):
    return await coffre_list2(Pdata, request, conn)
    

@app.post("/coffre/delete")
async def delete_password(data: UsernameRequest, request: Request, conn=Depends(get_db)):
    return await coffre_delete_password(data, request, conn)
@app.post("/coffre/delete2")
async def delete_password2(Pdata: DeletePasswordRequest2, request: Request, conn=Depends(get_db)):
    return await coffre_delete_password2(Pdata, request, conn)

@app.post("/coffre/hint")
async def hint(data: UsernameRequest, request: Request, conn=Depends(get_db)):
    return await coffre_hint(data, request, conn)


@app.post("/coffre/hint2")
async def hint2(Pdata: HintPasswordRequest, request: Request, conn=Depends(get_db)):
    return await coffre_hint2(Pdata, request, conn)
    
@app.post("/coffre/acc-delete")
async def delete_account(data: UsernameRequest, request: Request, conn=Depends(get_db)):
    return await coffre_delete_account(data, request, conn)


@app.post("/coffre/acc-delete2")
async def delete_account2(Pdata: DeletePasswordRequest2, request: Request, conn=Depends(get_db)):
    return await coffre_delete_account2(Pdata, request, conn)


@app.get("/neuris")
async def neuris_api(string):
    result = neuris(string)
    return {"result": result}


@app.post("/coffre/team/newteam")
async def new_team(data: TeamRequest, request: Request, background_tasks: BackgroundTasks, conn=Depends(get_db)):
    result = await newteam1(data, request, background_tasks, conn)
    return {"result": result}

@app.post("/coffre/team/newteam2")
async def new_team2(data: NewTeamRequest, request: Request, background_tasks: BackgroundTasks, conn=Depends(get_db)):
    result = await newteam2(data, request, background_tasks, conn)
    return {"result": result}

@app.post("/coffre/accept_invite")
async def accept_invite_route(data: AcceptInviteRequest, request: Request, background_tasks: BackgroundTasks, conn=Depends(get_db)):
    return await coffre_accept_invite(data, request, conn, background_tasks)

@app.post("/coffre/accept_invite_admin")
async def accept_invite_admin_route(data: AcceptInviteAdminRequest, request: Request, background_tasks: BackgroundTasks, conn=Depends(get_db)):
    return await coffre_accept_invite_admin(data, request, conn, background_tasks)

@app.post("/coffre/team/login")
async def team_login(data: TeamLoginRequest, request: Request, background_tasks: BackgroundTasks, conn=Depends(get_db)):
    return await coffre_teamlogin1(data, request, background_tasks, conn)

@app.post("/coffre/team/login2")
async def team_login2(data: TeamLogin2Request, request: Request, background_tasks: BackgroundTasks, conn=Depends(get_db)):
    return await coffre_teamlogin2(data, request, background_tasks, conn)

@app.post("/coffre/team/addmem")
async def team_addmem(data: AddMemberRequest, request: Request, background_tasks: BackgroundTasks, conn=Depends(get_db)):
    return await coffre_addmem(data, request, background_tasks, conn)

@app.post("/coffre/team/dashboard")
async def team_dashboard(data: TeamDashboardRequest, request: Request, conn=Depends(get_db)):
    return await coffre_team_dashboard(data, request, conn)

@app.post("/coffre/team/store_secret")
async def store_team_secret(data: TeamStoreSecretRequest, request: Request, conn=Depends(get_db)):
    return await coffre_store_team_secret(data, request, conn)

@app.post("/coffre/team/retrieve_secret")
async def retrieve_team_secret(data: TeamSecretRequest, request: Request, background_tasks: BackgroundTasks, conn=Depends(get_db)):
    return await coffre_retrieve_team_secret(data, request, background_tasks, conn)

@app.post("/coffre/team/retrieve_secret2")
async def retrieve_team_secret2(data: TeamSecretOTPRequest, request: Request, conn=Depends(get_db)):
    return await coffre_retrieve_team_secret2(data, request, conn)

@app.post("/coffre/team/api_secret/add_users")
async def add_api_secret_users(data: TeamAPIUsersRequest, request: Request, conn=Depends(get_db)):
    return await coffre_add_api_secret_users(data, request, conn)

@app.post("/coffre/team/delete_secret")
async def delete_team_secret_challenge(data: TeamSecretActionRequest, request: Request, background_tasks: BackgroundTasks, conn=Depends(get_db)):
    return await coffre_delete_team_secret_challenge(data, request, background_tasks, conn)

@app.post("/coffre/team/delete_secret2")
async def delete_team_secret(data: TeamSecretAction2Request, request: Request, conn=Depends(get_db)):
    return await coffre_delete_team_secret(data, request, conn)

@app.post("/coffre/team/remove_member")
async def remove_team_member_challenge(data: TeamMemberActionRequest, request: Request, background_tasks: BackgroundTasks, conn=Depends(get_db)):
    return await coffre_remove_team_member_challenge(data, request, background_tasks, conn)

@app.post("/coffre/team/remove_member2")
async def remove_team_member(data: TeamMemberAction2Request, request: Request, conn=Depends(get_db)):
    return await coffre_remove_team_member(data, request, conn)

@app.post("/coffre/team/resign")
async def resign_team(data: TeamResignRequest, request: Request, conn=Depends(get_db)):
    return await coffre_resign_team(data, request, conn)

@app.post("/coffre/team/admin_permissions")
async def admin_permissions_challenge(data: TeamAdminPermissionsRequest, request: Request, background_tasks: BackgroundTasks, conn=Depends(get_db)):
    return await coffre_admin_permissions_challenge(data, request, background_tasks, conn)

@app.post("/coffre/team/admin_permissions2")
async def set_admin_permissions(data: TeamAdminPermissions2Request, request: Request, conn=Depends(get_db)):
    return await coffre_set_admin_permissions(data, request, conn)

@app.post("/coffre/team/delete_team")
async def delete_team_challenge(data: TeamDeleteRequest, request: Request, background_tasks: BackgroundTasks, conn=Depends(get_db)):
    return await coffre_delete_team_challenge(data, request, background_tasks, conn)

@app.post("/coffre/team/delete_team2")
async def delete_team(data: TeamDelete2Request, request: Request, conn=Depends(get_db)):
    return await coffre_delete_team(data, request, conn)
