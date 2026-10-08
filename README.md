<p align="center">
  <img src="SS.png" alt="Soyez Sécurisé logo" width="160">
</p>

# Soyez Sécurisé

Soyez Sécurisé is Fahis Shehandi's personal cybersecurity workspace: a collection of learning projects, experiments, interfaces, and notes built under one name.

> [!IMPORTANT]
> **Soyez Sécurisé is not a real company, registered business, security vendor, or commercial service.** The company-like branding is part of a personal portfolio created by a student developer. Nothing in this repository should be interpreted as a corporate claim, professional certification, warranty, or promise of production-grade security.

The projects are public so their design, mistakes, and progress can be studied. They are not independently audited and should not be trusted with real credentials or used as security controls without a thorough review.

## About the developer

Soyez Sécurisé is designed and developed by **Fahis Shehandi**, also known as **fahisxd**. It serves as his public workspace for learning cybersecurity through projects, CTFs, research, and experimentation.

The word “team” elsewhere in this repository usually means **Coffre Teams**, a product feature for shared vaults. It does not mean that Soyez Sécurisé has a company team.

## Projects

| Project | What it is | Status |
| --- | --- | --- |
| [Main frontend](soyezsecurise-frontend/) | Portfolio, project catalog, development notes, writing, and contact pages | Static site |
| [Backend](soyezsecurise-backend/) | Shared FastAPI API for Coffre, Coffre Teams, and Neuris | Experimental; active development |
| [Coffre web](soyezsecurise-frontend-coffre/) | Browser-based personal and team password-vault experiment | Public beta; unaudited |
| [Coffre Android](soyezsecurise-frontend-coffre/Android/) | Native Kotlin/Jetpack Compose client for Coffre | **Not finished; in development** |
| [Neuris web](soyezsecurise-frontend-neuris/) | Terminal-style client for the Neuris input classifier | Experimental |

**Ayano** is a CVE research CLI within the Soyez Sécurisé project collection. Its source is maintained in a separate repository.

## Neuris APEX

[Neuris APEX 1.0](soyezsecurise-frontend/projects/neuris-apex.html) is the first experimental release of Neuris’s LLM-based generation (Neuris v2). It is a specialized 3B cybersecurity input classifier fine-tuned from Ministral 3B using SFT + LoRA, returning a verdict plus attack family. The ~2.1 GB Q4_K_M model runs locally through Ollama:

```bash
ollama run fahisshehandim/Neuris-Apex
```

[Public Ollama model](https://ollama.com/fahisshehandim/Neuris-Apex). APEX is not a general-purpose chatbot or a sole production security control. The website’s [version selector](soyezsecurise-frontend/projects/neuris-versions.html) links to current APEX information and the preserved legacy Neuris v1 page. The [Dispatches observation](soyezsecurise-frontend/writing/neuris-apex-context.html) documents session-context sensitivity and benign framing without claiming benchmark accuracy.

## How the repository fits together

```text
soyezsecurise-frontend/          personal site and project documentation
             │
             ├── links to Coffre and Neuris
             │
             ▼
soyezsecurise-frontend-coffre/  ─┐
                                 ├── HTTP ──> soyezsecurise-backend/
soyezsecurise-frontend-neuris/  ─┘               │
                                                 ├── PostgreSQL: accounts, vault metadata, ciphertext
                                                 ├── Redis: challenges, OTP state, sessions, limits
                                                 └── NumPy model: Neuris classifications
```

The frontends are static HTML, CSS, and JavaScript. Coffre performs its key derivation and vault encryption in the client before sending ciphertext to the API. The backend handles account state, challenges, sessions, permissions, email delivery, database persistence, and the Neuris model endpoint.

## Coffre Teams in one minute

Coffre Teams is a shared-vault feature for small groups:

- An owner creates a team with a separate team password.
- Existing Coffre users can be invited as an **admin** or **member**.
- Everyone unlocks the same team key locally from the team password.
- Owners and admins can add encrypted team secrets; members receive only the access allowed by the team policy.
- Password entries can be visible to members and can optionally require a second factor.
- API keys always require a second factor and use an explicit user allow-list.
- Removing users, changing admin permissions, deleting secrets, and deleting a team use fresh authorization challenges.

The server stores the team authentication key material and encrypted payloads. The browser keeps the derived team key in memory and uses it for AES-256-GCM encryption/decryption and HMAC-SHA-256 challenge signing. This is an experimental design, not an audited enterprise vault.

## Local development

### Requirements

- Python 3.10 or newer
- PostgreSQL
- Redis
- A modern browser
- A Resend API key if email and email-OTP flows are needed
- Java 21 and Android SDK 36 only if working on the unfinished Android client

### Run the backend

```bash
cd soyezsecurise-backend
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
```

Create `.env` in `soyezsecurise-backend/`:

```dotenv
DATABASE_URL=postgresql://user:password@127.0.0.1:5432/soyezsecurise
REDIS_URL=redis://127.0.0.1:6379/0
RESEND_API=your_resend_api_key
```

The repository currently has no complete migration/bootstrap workflow, so the PostgreSQL schema must be provisioned separately. Then start the API:

```bash
uvicorn main:app --reload --host 127.0.0.1 --port 8000
```

### Run a web frontend

Each web project can be served with a static HTTP server. For Coffre:

```bash
cd soyezsecurise-frontend-coffre
python3 -m http.server 8080
```

Open `http://127.0.0.1:8080`. Coffre's API URL is configured in `assets/js/config.js`. Neuris uses `NEURIS_SERVER_URL` near the beginning of its `app.js`.

## Important limitations

- No project here has been independently security-audited.
- The backend currently permits all CORS origins and its security-header middleware is disabled.
- Database migrations and a canonical development seed are missing.
- The clients and API are still changing, and compatibility can break.
- Neuris is a classifier experiment, not a WAF or a substitute for validation, escaping, and parameterized queries.
- The Android application is incomplete and must not be described as released or production-ready.

## Author

[Fahis Shehandi](https://github.com/fahisxd) builds these projects to develop his understanding of software engineering, cryptography, authentication, machine learning, and application security.
