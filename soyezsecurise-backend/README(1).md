# 🔐 Soyez Sécurisé
> *"Be Secure"* — A zero-knowledge password manager built from scratch by a self-taught 15-year-old developer.

No auth libraries. No crypto shortcuts. Just vanilla JavaScript WebCrypto, a Python FastAPI backend, PostgreSQL, and Redis doing real cryptography.

---

## What It Does

Store, retrieve, list, and delete passwords through a browser interface. The core guarantee: **the server never sees your passwords, never sees your vault key, and cannot decrypt your data even with full database access.**

Everything sensitive is encrypted on your device before it touches the network. The server only ever receives ciphertext and HMAC signatures.

---

## ⚙️ Architecture

```
[ Browser — Your Device ]
        │
        ├─ Master Password + Salt
        │           │
        │           ▼
        │     Argon2id  (time=4, mem=64MB, parallelism=4)
        │           │
        │           ▼
        │     HKDF + SHA-256 (key separation)
        │           ├──► Auth Key   ──► HMAC-SHA256 signatures (sent to server)
        │           └──► Vault Key  ──► AES-256-GCM encryption (stays in RAM only)
        │
        │   [Login Flow]
        ├─ POST /login ──────────────► Server issues nonce + request_id (stored in Redis, TTL 300s)
        ├─ HMAC(nonce, authkey) ─────► POST /login2 ──► Server verifies, checks OTP, returns session
        │
        │   [Store Flow]
        ├─ AES-256-GCM encrypt(password, vaultkey, random IV)
        ├─ base64(IV + ciphertext) ──► POST /storepassword2 (HMAC verified)
        │
        │   [Get Flow]
        ├─ POST /getenc2 (HMAC verified) ◄──► Server returns encrypted blob
        └─ AES-256-GCM decrypt(blob, vaultkey) ──► plaintext (never leaves browser)

[ Server — Never Sees Plaintext ]
        ├─ PostgreSQL  — stores users, salts, encrypted blobs, OTP config, emails, IP logs
        └─ Redis       — stores one-time nonces (TTL 300s), rate limit counters, blocked IPs
```

---

## 🛡️ Security Design

### Cryptographic Stack

| Layer | Algorithm | Where |
|---|---|---|
| Password hashing | Argon2id `(t=4, m=65536, p=4, len=32)` | Browser (signup + login) |
| Key separation | HKDF-SHA256 | Browser |
| Request authentication | HMAC-SHA256 | Browser signs, server verifies |
| Credential encryption | AES-256-GCM with random IV | Browser only |
| OTP secret storage | ChaCha20-Poly1305 | Server-side at rest |
| OTP verification | TOTP via pyotp | Server |

### Nonce / Replay Attack Prevention
Every authenticated action (`/login2`, `/storepassword2`, `/getenc2`, `/list2`, `/delete2`) requires a **one-time nonce** issued by the server and stored in Redis with a 5-minute TTL. The nonce is deleted immediately after use. A captured HMAC signature cannot be replayed.

### Timing Attack Prevention
All endpoints that check usernames call `time_equilizer()` — a function that pads the response to a fixed minimum duration (300ms) regardless of whether the user exists. This prevents username enumeration via timing differences.

### Rate Limiting & IP Blocking
- Per-username request counters in Redis (db=1)
- After 10 failed attempts: account temporarily blocked for 1 hour
- IP-level blocking tracked separately (db=2) via `check_block.py`
- All events logged with IP, username, request ID, and severity

### Vault Key Safety
`window.vaultkey` (the AES-256-GCM key) lives **in browser RAM only**. It is never written to `localStorage`, `sessionStorage`, cookies, or sent to the server. A page reload destroys it intentionally — re-authentication is required.

Only the HMAC auth key fingerprint is stored in `localStorage` (as hex), used for subsequent vault operations without re-entering the master password.

---

## 💾 Database Schema

```sql
public.users
  id          SERIAL PRIMARY KEY
  username    TEXT UNIQUE
  hash        TEXT        -- HMAC-SHA256 auth key hex (NOT the master password)

public.salt
  id          SERIAL PRIMARY KEY
  userid      INTEGER REFERENCES users(id)
  salt        TEXT        -- Argon2id salt hex (64 chars)

public.stored
  id          SERIAL PRIMARY KEY
  userid      INTEGER REFERENCES users(id)
  servicename TEXT        -- service/site name
  accountusername TEXT    -- username for that service
  encdata     TEXT        -- base64(IV || AES-256-GCM ciphertext)

public.twofa
  id          SERIAL PRIMARY KEY
  userid      INTEGER REFERENCES users(id)
  secret      TEXT        -- base64(ChaCha20-Poly1305 encrypted TOTP secret)
  salt        TEXT        -- base64(nonce || tag)

public.emails
  id          SERIAL PRIMARY KEY
  userid      INTEGER REFERENCES users(id)
  email       TEXT

public.iptracking
  id          SERIAL PRIMARY KEY
  ip          TEXT
  -- login history and access audit trail
```

---

## 🌐 API Endpoints

All endpoints are `POST`. The backend runs on FastAPI (`localhost:8000` by default).

| Endpoint | Purpose |
|---|---|
| `POST /newuser` | Register: accepts username, Argon2id hash, salt, email |
| `POST /login` | Step 1: returns nonce + salt for the given username |
| `POST /login2` | Step 2: verifies HMAC signature + OTP, establishes session |
| `POST /storepassword` | Step 1: issues nonce for store operation |
| `POST /storepassword2` | Step 2: verifies HMAC, stores encrypted blob |
| `POST /getenc` | Step 1: issues nonce for get operation |
| `POST /getenc2` | Step 2: verifies HMAC, returns encrypted blob |
| `POST /list` | Step 1: issues nonce for list operation |
| `POST /list2` | Step 2: verifies HMAC, returns service names + usernames |
| `POST /delete` | Step 1: issues nonce for delete operation |
| `POST /delete2` | Step 2: verifies HMAC, deletes record |
| `POST /enableotp` | Step 1: issues nonce for OTP setup |
| `POST /enable_otp2` | Step 2: verifies HMAC, generates TOTP secret + QR code |

---

## 🚀 Quickstart

### Prerequisites

- Python 3.10+
- PostgreSQL
- Redis
- A modern browser (WebCrypto API required)

### 1. Clone the repo

```bash
git clone https://github.com/yourusername/soyez-securise.git
cd soyez-securise
```

### 2. Install Python dependencies

```bash
pip install fastapi uvicorn psycopg2 redis pyotp pycryptodome cryptography qrcode pillow
```

### 3. Set up PostgreSQL

Create the database and tables using the schema above, then update the connection details in `main.py`:

```python
conn = psycopg2.connect(
    dbname="your_db_name",
    user="your_user",
    password="your_password",
    host="localhost"
)
```

### 4. Start Redis

```bash
redis-server
```

### 5. Start the backend

```bash
uvicorn main:app --host 0.0.0.0 --port 8000
```

### 6. Open the frontend

Serve `main.html` from any static file server, or open it directly in a browser. If using VS Code, the Live Server extension works fine.

---

## 📁 Project Structure

```
├── main.html              # Main app page
├── enable-otp.html        # OTP setup page (redirected to after signup)
├── assets/
│   ├── css/
│   └── js/
│       ├── login.js       # Argon2id + HKDF pipeline, login flow
│       ├── signup.js      # Account creation, key derivation
│       ├── store.js       # AES-256-GCM encryption + store flow
│       ├── get.js         # Retrieve + decrypt credentials
│       ├── list.js        # List stored service names
│       ├── delete.js      # Delete credentials
│       ├── menu.js        # Dropdown nav, session state, icon switching
│       ├── enable_otp.js  # TOTP setup flow
│       ├── quote.js       # Rotating security quotes
│       └── otpanswer.js   # Rotating 2FA education facts
├── main.py                # FastAPI backend — all routes
├── check_block.py         # IP blocking logic
└── logger.py              # Structured logging (login, db, sys, otp events)
```

---

## ⚠️ Known Limitations (V1)

This is a first version built as a learning project. Some things to be aware of:

- The backend uses a single persistent PostgreSQL connection (`psycopg2`) — not connection-pooled, not safe for concurrent production load
- `localhost:8000` is hardcoded in all frontend JS files — needs an environment config for deployment
- No HTTPS enforcement in the current setup — **do not deploy without TLS**, as HMAC signatures travel over the wire
- No account recovery — if you forget your master password, your vault data is unrecoverable by design (zero-knowledge)
- Has not been audited by a security professional

---

## 🧑‍💻 Author

Built by **fahisxd**, age 15.

Designed and implemented independently — the cryptographic architecture, the nonce/HMAC auth flow, the key separation scheme, and the backend were all figured out without following a tutorial for any of it.

---

## License

Do whatever you want with it. Credit is appreciated but not required.
