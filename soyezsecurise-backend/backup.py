import hmac
import hashlib
from itertools import count
import os
import sqlite3
from fastapi import FastAPI
import redis
import base64
from pydantic import BaseModel, StringConstraints
from typing import Annotated
import pyotp
from Crypto.Cipher import ChaCha20_Poly1305
from cryptography.hazmat.primitives.kdf.hkdf import HKDF
from cryptography.hazmat.primitives import hashes
import psycopg2
from fastapi import Request
import uuid
from logger import (
    login_logger,
    db_logger,
    sys_logger,
    otp_logger,
    Log_event
)



#---------------------------------------------------setup--------------------------------------------------#

conn = psycopg2.connect(
    dbname="database",
    user="fahisxd",
    password="fahis$fish$321",
    host="localhost"
)

nonce_db = redis.Redis(host="localhost", port=6379, db=0, decode_responses=True)
ratelimitin = redis.Redis(host="localhost", port=6379, db=1, decode_responses=True)
temp_blocked = redis.Redis(host="localhost", port=6379, db=2, decode_responses=True)
app = FastAPI()
cursor = conn.cursor()

#--------------------------------------------strict input classes--------------------------------------------------#

# =========================
# Strict input parameters 
# =========================

OTPType = Annotated[
    str,
    StringConstraints(
        min_length=0,
        max_length=6,
        pattern=r"^[0-9]"
    )
]

UsernameType = Annotated[
    str,
    StringConstraints(
        min_length=3,
        max_length=32,
        pattern=r"^[a-zA-Z0-9_]+$"
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
        pattern=r"^[a-zA-Z0-9_]+$"
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

Requets_ID = Annotated[
    str,
    StringConstraints(
        min_length=32,
        max_length=32,
        pattern=r"^[A-Za-z0-9+/=]+$"
    )
]

# =========================
# Request Models
# =========================

class UsernameRequest(BaseModel):
    username: UsernameType


class NewUserRequest(BaseModel):
    username: UsernameType
    hash: Hex64Type

    salt: Annotated[
        str,
        StringConstraints(
            min_length=64,
            max_length=64,
            pattern=r"^[a-fA-F0-9]+$"
        )
    ]


class StoredPasswordRequest(BaseModel):
    signature: Hex64Type
    username: UsernameType
    password_name: PasswordNameType
    enc_data: Base64Type
    request_id: Requets_ID


class GetEncryptedRequest(BaseModel):
    signature: Hex64Type
    username: UsernameType
    password_name: PasswordNameType
    otp: OTPType
    request_id: Requets_ID


class GetBackupRequest(BaseModel):
    signature: Hex64Type
    username: UsernameType
    otp: OTPType
    request_id: Requets_ID

class GetOTPRequest(BaseModel):
    signature: Hex64Type
    username: UsernameType
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

def otp_generation_and_verfication(username, user_otp):
    cursor.execute(
        """
    SELECT id FROM users WHERE username = %s;""",
        (username,),)
    userid = cursor.fetchone()[0]
    cursor.execute("""
    SELECT secret,salt FROM twofa WHERE userid = %s;
""", (userid,),
)
    row = cursor.fetchone()
    enc_secret = row[0]
    enc_secret = base64.b64decode(enc_secret)
    salt = row[1]
    salt = base64.b64decode(salt)
    cursor.execute("""
    SELECT hash FROM users WHERE id = %s;
""", (userid,),
)
    base_key = bytes.fromhex(cursor.fetchone()[0])
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
    sys_logger.info(f"OTP secret was decrypted for User -{username}-")
    secret = secret.decode().strip()
    totp = pyotp.TOTP(secret)
    if totp.verify(str(user_otp)):
        return "VALID"
    else:
        return "INVALID"

    
# =========================
# encrypting otp secret
# =========================

def encrypter(data, un):
    nonce_gen = os.urandom(12)
    cursor.execute("""
        SELECT hash FROM users WHERE id = %s;""",
        (un,),
    )
    hash_key = cursor.fetchone()[0]
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
    sys_logger.info(f"Secret was Encrpyted for user -{un}-")
    return {
        "secret" : secret,
        "salt_payload" : salt_payload
    }

# =========================
# New IP alerting
# =========================

def IP_check(userid, ip):
    cursor.execute("""
        SELECT ip FROM iptracking WHERE userid = %s;
""", userid,)
    old_ip = cursor.fetchone()[0]
    if ip == old_ip:
        return {"No ERROR" : "--"}
    else:
        return {"ERROR" : "You have Loggesd in form another device or ip"}
    

#--------------------------------------------APIs--------------------------------------------------#

# =========================
# otp enabling
# =========================

@app.post("/enableotp")
async def enable_otp(data: UsernameRequest, request: Request):
    request_id = uuid.uuid4().hex
    ip = request.client.host
    username = data.username
    count = ratelimitin.incr(f"rlpost:{username}")
    cursor.execute(
        """
    SELECT * FROM users WHERE username = %s""",
        (username,),
    )
    if username == "' 1=1--":
        Log_event(login_logger, "/enableotp", "WARNING", "Bypassed pydantic", f"{username}", f"{ip}", f"{request_id}")
        return {"ERROR" : "Thats not gonna work bruh"}
    
    result = cursor.fetchone()
    if not result:
        Log_event(login_logger, "/enableotp", "INFO", "Invalid username entered", f"{username}", f"{ip}", f"{request_id}")
        return {"ERROR": f"Invalid username: {username}"}
    else:
        if ratelimitin.exists(f"rlpost:{username}"):
            if int(ratelimitin.get(f"rlpost:{username}")) >= 10:
                temp_blocked.set(f"blocked:{username}", "1")
                temp_blocked.expire(f"blocked:{username}", 3600)
                ratelimitin.delete(f"rlpost:{username}")
                return {"ERROR": "Too many requests, try again in an hour"}
            else:
                pass
        else:
            ratelimitin.set(f"rlpost:{username}", "0")
        
        if temp_blocked.exists(f"blocked:{username}"):
            Log_event(login_logger, "/enableotp", "CRITICAL", "User blocked", f"{username}", f"{ip}", f"{request_id}")
            return {"ERROR": "You are temporarily blocked, try again in an hour"}
        nonce = os.urandom(32).hex()
        cursor.execute("SELECT id FROM users WHERE username = %s", (username,))
        userid = cursor.fetchone()[0]
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
        Log_event(sys_logger, "/enableotp", "INFO", "temperory Nonce Stored", f"{username}", f"{ip}", f"{request_id}")
        nonce_db.expire(key, 300)
        ratelimitin.incr(f"rlpost:{username}")
        if count == 1:
            ratelimitin.expire(f"rlpost:{username}", 3600)
        Log_event(sys_logger, "/enableotp", "INFO", "Nonce generated", f"{username}", f"{ip}", f"{request_id}")
        return {"nonce": nonce}

@app.post("/enable_otp2")
async def enable_otp2(data: GetOTPRequest, request: Request):
    try:
        signature = data.signature
        un = data.username
        request_id = data.request_id
        ip = request.client.host
        signature_bytes = bytes.fromhex(signature)
        data = nonce_db.hgetall(f"{un}:otp")

        if not data:
            return {"ERROR": f"Session expired"}
        cursor.execute(
            """
        SELECT hash FROM users WHERE username = %s""",
            (un,),
        )
        hash = cursor.fetchone()[0]

        server_signature = hmac.new(
            hash.encode(), bytes.fromhex(data["value"]), hashlib.sha256
        ).digest()
        Log_event(sys_logger, "/enableotp2", "INFO", "Server signature generated", f"{un}", f"{ip}", f"{request_id}")
        if not hmac.compare_digest(signature_bytes, server_signature):
            ratelimitin.incr(f"rlpost:{un}")
            Log_event(login_logger, "/enableotp2", "WARNING", "Invalid Signature", f"{un}", f"{ip}", f"{request_id}")
            return {"ERROR": f"Invalid signature{signature_bytes},{server_signature}"}
        Log_event(login_logger, "/enableotp2", "INFO", "Succesfull Logging", f"{un}", f"{ip}", f"{request_id}")
        secret = pyotp.random_base32()
        enabled = True
        cursor.execute("SELECT id FROM users WHERE username = %s", (un,))
        row = cursor.fetchone()
        user_id = row[0]
        encrypt = encrypter(secret, user_id)
        enc_secret = encrypt["secret"]
        salt = encrypt["salt_payload"]
        cursor.execute(
        """
        INSERT INTO twofa(userid, enabled, secret, salt) VALUES (%s,%s,%s,%s)
""",(user_id, enabled, enc_secret, salt) )
        Log_event(db_logger, "/enableotp2", "INFO", "Data stored for OTP verification", f"{un}", f"{ip}", f"{request_id}")
        Log_event(otp_logger, "/enableotp2", "INFO", "OTP Enabled", f"{un}", f"{ip}", f"{request_id}")
        conn.commit()
        return {"secret_code": secret}

    except Exception as e:
        Log_event(sys_logger, "/enableotp2", "ERROR", f"""{str(e)}""", f"{un}", f"{ip}", f"{request_id}")
        sys_logger.error(f"error: -{str(e)}- at otp-enabling")
        return {"ERROR": "Something Went Wrong"}
    

# =========================
# new user creation
# =========================


@app.post("/newuser")
async def new_user(data: NewUserRequest, request: Request):
    try:
        un = data.username
        hp = data.hash
        salt = data.salt
        ip = request.client.host
        request_id = uuid.uuid4().hex
        cursor.execute(
            """
            SELECT * FROM users WHERE username = %s;""",
            (un,),
        )
        result = cursor.fetchone()
        if result:
            Log_event(login_logger, "/newuser", "INFO", "Already existing user has been entered", f"{un}", f"{ip}" , f"{request_id}")
            return {"ERROR": "Invalid username"}
        else:
            clean_un = un
            cursor.execute(
                """
            INSERT INTO users (username, hash)
        VALUES (%s, %s);
        """,
                (clean_un, hp),
            )
            Log_event(db_logger, "/newuser", "INFO", "New user's hash stored", f"{un}", f"{ip}", f"{request_id}")
            cursor.execute("SELECT id FROM users WHERE username = %s;", (clean_un,))
            row = cursor.fetchone()[0]
            user_id = row
            cursor.execute("""
            INSERT INTO iptracking (userid, ip) VALUES(%s, %s);
""", (user_id, ip))
            Log_event(db_logger, "/newuser", "INFO", "ip stored", f"{un}", f"{ip}", f"{request_id}")
            cursor.execute(
                """
            INSERT INTO salt (userid, salt)
            VALUES(%s, %s);
            """,
                (user_id, salt),
            )
            Log_event(db_logger, "/newuser", "INFO", "Salt stored", f"{un}", f"{ip}", f"{request_id}")
            conn.commit()
            Log_event(login_logger, "/newuser", "INFO", "", f"{un}", f"{ip}", f"{request_id}")
            Log_event(login_logger, "/newuser", "INFO", "New user was created", f"{un}", f"{ip}", f"{request_id}")
            login_logger.info(f"User -{clean_un}- was created succesfully")
            return {"message": "User created successfully", "username": clean_un}
    except Exception as e:
        Log_event(sys_logger, "/newuser", "ERROR", f"""{str(e)}""", f"{un}", f"{ip}", f"{request_id}")
        return {"ERROR" : "Something Went Wrong"}

# =========================
# storing password
# =========================

# To store the password.
@app.post("/storepassword")
async def store_password(data: UsernameRequest, request: Request):
    username = data.username
    request_id = uuid.uuid4().hex
    ip = request.client.host
    cursor.execute(
        """
    SELECT * FROM users WHERE username = %s""",
        (username,),
    )
    result = cursor.fetchone()
    if not result:
        Log_event(login_logger, "/storepassword", "WARNING", "Already existing user has been entered", f"{username}", f"{ip}", f"{request_id}")
        return {"ERROR": f"Invalid username: {username}"}
    else:
        if ratelimitin.exists(f"rlpost:{username}"):
            if int(ratelimitin.get(f"rlpost:{username}")) >= 10:
                temp_blocked.set(f"blocked:{username}", "1")
                temp_blocked.expire(f"blocked:{username}", 3600)
                ratelimitin.delete(f"rlpost:{username}")
                return {"ERROR": "Too many requests"}
            else:
                pass
        else:
            ratelimitin.set(f"rlpost:{username}", "0")
        if temp_blocked.exists(f"blocked:{username}"):
            Log_event(login_logger, "/enableotp", "CRITICAL", "User blocked", f"{username}", f"{ip}", f"{request_id}")
            return {"ERROR": "You are temporarily blocked, try again after some time"}
        nonce = os.urandom(32)
        key = f"post:{username}"
        nonce_db.hset(
            key,
            mapping={
                "value": nonce.hex(),
            },
        )
        nonce_db.expire(f"post:{username}", 300)
        ratelimitin.incr(f"rlpost:{username}")
        if count == 1:
            ratelimitin.expire(f"rlpost:{username}", 3600)
        return {"nonce": nonce.hex()}


@app.post("/storepassword2")
async def store_password2(data: StoredPasswordRequest):
    try:
        signature = data.signature
        un = data.username
        password_name = data.password_name
        ed = data.enc_data
        request_id = data.request_id
        signature_bytes = bytes.fromhex(signature)
        data = nonce_db.hgetall(f"post:{un}")

        if not data:
            return {"ERROR": "Session expired"}
        cursor.execute(
            """
        SELECT hash FROM users WHERE username = %s""",
            (un,),
        )
        hash = cursor.fetchone()[0]

        server_signature = hmac.new(
            hash.encode(), bytes.fromhex(data["value"]), hashlib.sha256
        ).digest()

        if not hmac.compare_digest(signature_bytes, server_signature):
            ratelimitin.incr(f"rlpost:{un}")
            
            return {
                "ERROR": f"Invalid signature"
            }
        enc_data = base64.b64decode(ed)
        sys_logger.info(f"base64 encrypted transmitted data was decrypted form base64 at store-password")
        cursor.execute("SELECT id FROM users WHERE username = %s", (un,))
        row = cursor.fetchone()
        if row is None:
            return {"ERROR": "User not found"}
        user_id = row
        cursor.execute(
            "SELECT name FROM stored where userid = %s", (user_id))
        raw_names = cursor.fetchall()
        names = []
        for name in raw_names:
            names.append(name[0])
        if password_name in names:
            return {"ERROR" : "You have Already stored a password with this name"}
        cursor.execute(
            "INSERT INTO stored (userid, encdata, name) VALUES (%s, %s, %s)",
            (user_id, enc_data, password_name),
        )
        db_logger.info(f"User -{un}- password was stored through store-password")
        conn.commit()
        nonce_db.delete(f"post:{un}")
        ratelimitin.delete(f"rlpost:{un}")
        return {"message": "Password stored successfully"}

    except Exception as e:
        sys_logger.error(f"Error: -{str(e)} occured at store-password")
        return {
            "ERROR": "Something went wrong",
        }



# =========================
# retreving password
# =========================


@app.post("/getenc")
async def get_enc(data: UsernameRequest):
    username = data.username
    cursor.execute(
        """
    SELECT * FROM users WHERE username = %s""",
        (username,),
    )
    result = cursor.fetchone()
    if not result:
        login_logger.info(f"An invalid user was requested in getting-encrpyted-data")
        return {"ERROR": "Invalid username"}
    else:
        if ratelimitin.exists(f"rlpost:{username}"):
            if int(ratelimitin.get(f"rlpost:{username}")) >= 10:
                temp_blocked.set(f"blocked:{username}", "1")
                temp_blocked.expire(f"blocked:{username}", 3600)
                ratelimitin.delete(f"rlpost:{username}")
                return {"ERROR": "Too many requests, try again in an hour"}
            else:
                pass
        else:
            ratelimitin.set(f"rlpost:{username}", "0")
        nonce = os.urandom(32)
        key = f"get:{username}"
        nonce_db.hset(
            key,
            mapping={
                "value": nonce.hex(),
            },
        )
        nonce_db.expire(f"get:{username}", 300)
        sys_logger.info(f"Nonce was generated for user -{username}- at getting-encrpyted-data")
        return {"nonce": nonce.hex()}


@app.post("/getenc2")
async def get_enc2(data: GetEncryptedRequest):
    try:
        signature = data.signature
        un = data.username
        password_name = data.password_name
        un = data.username
        user_otp = data.otp

        signature_bytes = bytes.fromhex(signature)
        data = nonce_db.hgetall(f"get:{un}")

        if not data:
            return {"ERROR": "Session expired"}
        cursor.execute(
            """
        SELECT hash FROM users WHERE username = %s""",
            (un,),
        )
        hash = cursor.fetchone()[0]

        server_signature = hmac.new(
            hash.encode(), bytes.fromhex(data["value"]), hashlib.sha256
        ).digest()

        if not hmac.compare_digest(signature_bytes, server_signature):
            ratelimitin.incr(f"rlpost:{un}")
            login_logger.warning(f"Invalid signature was entered from user -{un}- in getting-encrpyted-data")
            return {"ERROR": "Invalid signature"}
        login_logger.info(f"Valid login from user -{un}- in getting-encrpyted-data")
        cursor.execute("SELECT id FROM users WHERE username = %s", (un,))
        row = cursor.fetchone()
        user_id = row
        if row is None:
            return {"ERROR": "User not found"}
        cursor.execute("SELECT enabled FROM twofa WHERE userid = %s", (user_id,))
        otp_status = cursor.fetchall()

        if otp_status:
            status = otp_generation_and_verfication(un, user_otp)
            if status == "VALID":
                otp_logger.info(f"Valid OTP was Entered for User -{un}- at get-backup")
                pass
            else:
                otp_logger.warning(f"Invalid OTP was Entered for User -{un}- at get-backup")
                return {"ERROR" : "Wrong OTP"}
        cursor.execute(
            """
            SELECT encdata FROM stored WHERE userid = %s AND name = %s""",
            (user_id, password_name),
        )
        enc = cursor.fetchone()[0]
        enc = enc.removeprefix(r"\x")
        enc = bytes.fromhex(enc)
        nonce_db.delete(f"get:{un}")
        nonce_db.delete(f"post:{un}")
        db_logger.info(f"User -{un}- password named -{password_name}- was retrieved")
        sys_logger.info(f"Encrypted data of User -{un}- was encrypted uaing base64 before transmision at getting-encrpyted-data")
        return {"encdata": base64.b64encode(enc).decode()}
    except Exception as e:
        sys_logger.error(f"Error: -{str(e)} occured at ")
        return {"ERROR":  f"Something Went Wrong"}

# =========================
# retriving backup
# =========================
@app.post("/getbackup")
async def get_backup(data: UsernameRequest):
    username = data.username
    cursor.execute(
        """
    SELECT * FROM users WHERE username = %s""",
        (username,),
    )
    result = cursor.fetchone()
    if not result:
        login_logger.info(f"An invalid user was requested in get-backup")
        return {"ERROR": "Invalid username"}
    else:
        if ratelimitin.exists(f"rlpost:{username}"):
            if int(ratelimitin.get(f"rlpost:{username}")) >= 10:
                temp_blocked.set(f"blocked:{username}", "1")
                temp_blocked.expire(f"blocked:{username}", 3600)
                ratelimitin.delete(f"rlpost:{username}")
                return {"ERROR": "Too many requests, try again in an hour"}
            else:
                pass
        else:
            ratelimitin.set(f"rlpost:{username}", "0")
        nonce = os.urandom(32)
        key = f"backup:{username}"
        nonce_db.hset(
            key,
            mapping={
                "value": nonce.hex(),
            },
        )
        nonce_db.expire(f"backup:{username}", 300)
        sys_logger.info(f"Nonce was generated for user -{username}- at get-backup")
        return {"nonce": nonce.hex()}


@app.post("/getbackup2")
async def get_backup2(data: GetBackupRequest):
    try:
        signature = data.signature
        un = data.username
        un = data.username
        user_otp = data.otp

        signature_bytes = bytes.fromhex(signature)
        data = nonce_db.hgetall(f"backup:{un}")

        if not data:
            return {"ERROR": "Session expired"}
        cursor.execute(
            """
        SELECT hash FROM users WHERE username = %s""",
            (un,),
        )
        hash = cursor.fetchone()[0]

        server_signature = hmac.new(
            hash.encode(), bytes.fromhex(data["value"]), hashlib.sha256
        ).digest()
        sys_logger.info(f"Server Signature was generated for User -{un}- at get-backup")
        if not hmac.compare_digest(signature_bytes, server_signature):
            ratelimitin.incr(f"rlpost:{un}")
            login_logger.warning(f"Invalid signature was entered from user -{un}- in get-backup")
            return {"ERROR": "Invalid signature"}
        login_logger.info(f"Valid login from user -{un}- in get-backup")
        cursor.execute("SELECT id FROM users WHERE username = %s", (un,))
        user_id = cursor.fetchone()[0]
        cursor.execute("SELECT name FROM stored WHERE userid = %s", (user_id,))
        names = cursor.fetchall()
        cursor.execute("SELECT salt FROM salt WHERE userid = %s", (user_id,))
        salt = cursor.fetchone()[0]
        nonce_db.delete(f"backup:{un}")
        nonce_db.delete(f"post:{un}")
        cursor.execute("SELECT enabled FROM twofa WHERE userid = %s", (user_id,))
        otp_status = cursor.fetchall()

        if otp_status:
            status = otp_generation_and_verfication(un, user_otp)
            if status == "VALID":
                otp_logger.info(f"Valid OTP was Entered for User -{un}- at get-backup")
                pass
            else:
                otp_logger.warning(f"Invalid OTP was Entered for User -{un}- at get-backup")
                return {"ERROR" : "Wrong OTP"}
            cursor.execute("SELECT salt FROM salt WHERE userid = %s", (user_id,))
            
            db_logger.info(f"Backup Data was given of user {un}")
        return {"passwords": [name[0] for name in names], "salt": salt}
    except Exception as e:
        sys_logger.error(f"Error: -{str(e)} occured at get-backup")
        return {"ERROR": "Something went wrong"}
