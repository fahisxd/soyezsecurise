# Coffre Web

Coffre is an experimental browser-based password vault. It explores client-side encryption, challenge-response authentication, sessions, OTP, and shared team access with plain HTML, CSS, and JavaScript.

> [!WARNING]
> Coffre is an unaudited learning project. Do not store real credentials in it or treat it as a production password manager.

## What it contains

The web client has two connected experiences:

- **Personal Coffre** in `index.html` for account creation, login, OTP setup, profile state, and storing/retrieving/listing/deleting personal vault entries.
- **Coffre Teams** in `team.html`, `team-login.html`, and `team-owner-dashboard.html` for shared encrypted passwords and API keys.

The pages are static. They call the FastAPI application in `../soyezsecurise-backend/` for account state, challenges, sessions, access control, ciphertext storage, and email/OTP flows.

## Personal vault design

```text
master password + random salt
              │
              ▼
  Argon2id (t=4, m=64 MiB, p=4)
              │
              ▼
       separated key material
          ┌───┴──────────┐
          ▼              ▼
  authentication key   vault key
  HMAC-SHA-256         AES-256-GCM
  signs challenges     encrypts credentials locally
```

The client encrypts credential values before uploading them. Authenticated operations use server-issued nonces and request IDs so the browser can prove possession of authentication key material without submitting the master password.

The vault key is kept in page memory and is lost when the page is refreshed. Some session and authentication state is stored in browser storage by the current implementation, which is one reason this project needs more review and hardening.

## What Coffre Teams is

Coffre Teams is a shared encrypted workspace for a small group. It is a feature inside Coffre; it is not the development team behind Soyez Sécurisé.

### Roles and access

| Role | Access |
| --- | --- |
| Owner | Full team management, invitations, secret storage, admin permissions, and team deletion |
| Admin | Can store secrets and manage API access; the owner can separately grant permission to delete secrets or remove users |
| Member | Can retrieve team passwords marked for members and API keys explicitly shared with that user |

### How it works

1. The owner creates a team and verifies an OTP.
2. The browser derives a team key from a separate team password using Argon2id.
3. Existing personal Coffre users are invited as members or admins and accept from an active personal-vault session.
4. A team login signs a fresh server nonce with HMAC-SHA-256 and verifies the user's TOTP or emailed OTP.
5. The browser receives a 30-minute team session and keeps the derived team key only in page memory.
6. Team secret values are encrypted/decrypted locally with AES-256-GCM; the API stores and returns ciphertext according to the user's role and per-secret policy.

Passwords may optionally require OTP and may be opened to all members. API keys always require OTP and use an explicit allow-list. Destructive actions use a separate short-lived, action-bound HMAC and OTP challenge.

Every participant uses the same team password to derive the same team key. If that password is shared outside the intended group, server roles cannot stop the recipient from deriving the key. This tradeoff is important when evaluating the current prototype.

## Project layout

```text
index.html                     personal Coffre interface
enable-otp.html                second-factor setup
team.html                      team landing/access page
team-login.html                team access interface
team-owner-dashboard.html      shared workspace dashboard
assets/css/                    shared and page-specific styles
assets/js/config.js            backend URL
assets/js/login.js             personal login/key derivation
assets/js/signup.js            personal registration
assets/js/store.js             local encryption and storage flow
assets/js/get.js               retrieval and local decryption
assets/js/list.js              vault listing
assets/js/delete.js            entry deletion
assets/js/team_session.js      team session and cryptographic helpers
assets/js/team_login.js        create/invite/login flows
assets/js/team_owner_dashboard.js
Android/                       unfinished native Android client
```

## Run locally

Start the backend first, then configure the API URL in `assets/js/config.js`:

```js
const COFFRE_API_URL = "http://127.0.0.1:8000";
```

Serve this directory:

```bash
python3 -m http.server 8080
```

Open `http://127.0.0.1:8080` for personal Coffre or `http://127.0.0.1:8080/team.html` for Coffre Teams.

## Android status

The `Android/` directory is a native Kotlin/Jetpack Compose rewrite. **It is not finished, not released, and not ready for production use.** It remains in development even though several screens, repository classes, and cryptographic building blocks exist. See `Android/README.md` for the honest current status and developer setup.

## Current limitations

- No external security audit has been performed.
- The backend's development CORS policy is permissive.
- Browser storage is used for some sensitive session/authentication state.
- The shared team-password model has operational key-sharing risks.
- Database migrations and end-to-end automated tests are incomplete.
- The frontend expects modern Web Crypto and Argon2 browser support.
- HTTPS and a hardened deployment are mandatory before any realistic security testing.

## Related projects

- `../soyezsecurise-backend/` — API used by this client
- `../soyezsecurise-frontend/` — main portfolio and Coffre project notes
- `../soyezsecurise-frontend-neuris/` — Neuris web client
