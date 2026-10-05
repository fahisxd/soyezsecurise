# Soyez Sécurisé Backend

This directory contains the shared FastAPI backend for **Coffre**, **Coffre Teams**, and **Neuris**. It is an experimental learning project, not a hosted-service guarantee or production-ready security product.

> [!WARNING]
> The backend has not been independently audited. Do not connect it to real credentials or expose it publicly without reviewing the code, database schema, secrets, transport security, CORS, rate limiting, logging, and deployment configuration.

## What it does

The application in `main.py` exposes three related API areas:

- `/coffre/*` implements personal-vault registration, login, profiles, OTP setup, hints, encrypted credential operations, and account deletion.
- `/coffre/team/*` implements shared team vaults, invitations, roles, team sessions, secret access, and protected administrative actions.
- `GET /neuris` runs the bundled character-level NumPy classifier and returns a predicted input category and probability distribution.

PostgreSQL stores durable application state. Redis stores short-lived challenges, OTP state, invitations, sessions, counters, and blocking state. Email notifications and email OTPs are sent through Resend.

## Architecture

```text
Web or Android client
        │
        │ JSON over HTTP
        ▼
main.py (FastAPI routes, validation, middleware)
        │
        ├── coffre.py       personal Coffre flows
        ├── coffreteam.py   shared team-vault flows
        ├── neuris.py       model loading and inference
        ├── otp_security.py one-time TOTP/OTP handling
        ├── check_block.py  IP blocking controls
        ├── gmail.py        Resend email templates
        └── logger.py       structured application logs
                │
                ├── PostgreSQL
                ├── Redis
                └── model/model.npz + model/vocab.json
```

`main.py` defines the request models and public routes, then delegates most Coffre work to `coffre.py` and `coffreteam.py`. The copies and older experiments elsewhere in this directory are not the primary entry point.

## How personal Coffre works

The client derives key material from the master password with Argon2id and separates authentication from vault encryption. It uses the authentication key to sign one-time server challenges with HMAC-SHA-256 and uses the vault key to encrypt credential values locally with AES-256-GCM.

For an authenticated operation:

1. The client requests a challenge.
2. The backend creates a random nonce and request ID with a short Redis lifetime.
3. The client signs the nonce.
4. The backend compares signatures, consumes the challenge, checks session/OTP policy, and performs the database operation.
5. Encrypted vault data is returned to the client and decrypted there.

The intended boundary is that credential plaintext and the vault decryption key remain on the client. That boundary is design intent in an unaudited prototype, not a formal security guarantee.

## What Coffre Teams is

Coffre Teams is a separate shared workspace built on Coffre accounts. It is meant to let a small group share encrypted passwords and API keys while controlling which users can retrieve them.

### Roles

| Role | Main abilities |
| --- | --- |
| Owner | Creates and deletes the team, invites users, manages admin permissions, stores secrets, and has access to all team secrets |
| Admin | Can store secrets and manage API access; destructive powers such as deleting secrets or removing users must be explicitly granted by the owner |
| Member | Can retrieve passwords marked for member access and API keys for which the member is explicitly allow-listed |

### Team flow

1. A Coffre user requests team creation and verifies an emailed OTP.
2. The browser generates a salt and derives a 32-byte team key from the team password with Argon2id.
3. The backend stores the derived authentication material and salt, but not the team password.
4. Invited users accept through an active personal Coffre session. Admin invitations also use a dedicated invitation code.
5. Team login uses a one-time nonce, HMAC-SHA-256 signature, and the user's configured TOTP or emailed OTP.
6. A successful login creates a random team session token. Redis stores its SHA-256 hash for 30 minutes; the raw token goes to the browser.
7. The browser keeps the team key in page memory. It encrypts/decrypts team secret values locally with AES-256-GCM.

### Secret and action policy

- Only owners and admins can store team secrets.
- Passwords can optionally be visible to members and can optionally require OTP for retrieval.
- API secrets always require OTP and an explicit per-user allow-list; the owner is always included.
- Secret deletion, member removal, admin-permission changes, and team deletion use an action-bound nonce, HMAC signature, OTP, request ID, IP binding, and a five-minute challenge lifetime.
- Removing a user also clears permissions, API allow-list entries, invitations, and that user's team session.

Because all team participants derive the same team key from the team password, anyone who knows that password can derive the cryptographic key. Server-side roles control which ciphertext the API returns, but they cannot make a shared team password unknown again. Treat team-password distribution as part of the threat model.

## Neuris

`GET /neuris?string=...` classifies an input into one of five labels:

- `SAFE`
- `PATH_TRAVERSAL`
- `SQLI`
- `COMMAND_INJECTION`
- `XSS`

The endpoint returns the chosen class, its confidence, and probabilities for every class. Neuris is useful for model experimentation and error analysis; it must not replace normal application-security controls.

## Setup

### Requirements

- Python 3.10+
- PostgreSQL
- Redis
- Resend credentials for email flows

Create and activate a virtual environment, then install the pinned dependencies:

```bash
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
```

Create `.env`:

```dotenv
DATABASE_URL=postgresql://user:password@127.0.0.1:5432/soyezsecurise
REDIS_URL=redis://127.0.0.1:6379/0
RESEND_API=your_resend_api_key

# Optional logging configuration
LOG_DIR=logs
LOG_LEVEL=INFO
LOG_TO_CONSOLE=1
```

> [!NOTE]
> A complete migration set and canonical schema are not currently included. The code expects personal-vault tables such as `users`, `emails`, `salt`, `stored`, `hints`, `twofa`, IP-control tables, and team tables such as `teams`, `teamauth`, `teamconfig`, `teamsecrets`, `team_api_secret_users`, and `team_admin_permissions`.

Run the application from this directory:

```bash
uvicorn main:app --reload --host 127.0.0.1 --port 8000
```

Interactive OpenAPI documentation is then available at `http://127.0.0.1:8000/docs`.

## Public announcements

`GET /announcements` returns `{"text": "..."}` for the main website's bulletin.
It reads UTF-8 text from `announcements.txt` beside `main.py` on every request.
Edit or upload this file on the VPS to publish news; no restart is needed.
An empty or missing file returns an empty string. Unreadable files return HTTP 503.
Responses use `Cache-Control: no-store`.

To store content outside the deployed code directory, set `ANNOUNCEMENTS_FILE`
to an absolute path in the backend's environment, for example
`/var/lib/soyezsecurise/announcements.txt`. The backend user needs read access.
Set this variable once and restart the service; subsequent text edits are read
immediately. Keeping the file outside the deployment directory prevents later
code deployments from replacing your announcements. All text in this file is public.

Example content:

```text
Coffre update coming this weekend.

More details will be posted here soon.
```

## API groups

The exact request and response schemas are documented by FastAPI at `/docs`. Important route groups include:

```text
POST /coffre/newuser1              registration challenge
POST /coffre/newuser2              complete registration
POST /coffre/login                 login challenge
POST /coffre/login2                complete login
POST /coffre/storepassword[2]      store encrypted personal entry
POST /coffre/getenc[2]             retrieve encrypted personal entry
POST /coffre/list[2]               list personal entries
POST /coffre/delete[2]             delete personal entry
POST /coffre/enableotp             begin OTP setup
POST /coffre/enable_otp2            complete OTP setup

POST /coffre/team/newteam[2]       create team
POST /coffre/team/login[2]         team challenge and login
POST /coffre/team/addmem           invite members/admins
POST /coffre/team/dashboard        role-filtered team state
POST /coffre/team/store_secret     store team ciphertext
POST /coffre/team/retrieve_secret[2]
POST /coffre/team/delete_secret[2]
POST /coffre/team/remove_member[2]
POST /coffre/team/admin_permissions[2]
POST /coffre/team/delete_team[2]

GET  /neuris?string=...            classify input
```

Brackets above are shorthand for paired challenge/completion routes, not literal URL syntax.

## Known limitations

- No complete database migration or bootstrap process is included.
- CORS currently allows every origin.
- The security-header middleware is commented out.
- Automated test and CI coverage is limited.
- The backend is a prototype and has not received an external security audit.
- Some legacy/backup files remain in the directory and should not be treated as deployment configuration.

## Related projects

- `../soyezsecurise-frontend-coffre/` — Coffre web client
- `../soyezsecurise-frontend-coffre/Android/` — unfinished Android client
- `../soyezsecurise-frontend-neuris/` — Neuris web client
- `../soyezsecurise-frontend/` — portfolio and project notes
