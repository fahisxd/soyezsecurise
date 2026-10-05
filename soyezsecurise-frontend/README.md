# Soyez Sécurisé Frontend

This is the main Soyez Sécurisé website: Fahis Shehandi's personal portfolio, project catalog, field notes, and public learning log.

> [!IMPORTANT]
> Soyez Sécurisé is **not a real company**. The site uses a product/studio identity, but it represents one student's personal projects. It is not a registered business, staffed security team, certification body, or guarantee of professional security services.

## What is on the site?

- `index.html` introduces Fahis (`fahisxd`), current work, selected projects, and contact links.
- `projects/coffre.html` explains the Coffre password-vault experiment, including Coffre Teams.
- `projects/neuris.html` documents the Neuris classifier, its results, and its limitations.
- `projects/ayano.html` introduces the separately maintained Ayano CVE research CLI.
- `writing/` contains development notes and longer-form writing.
- `freelance.html` describes the kinds of small development work Fahis is interested in.
- `coming-soon.html` distinguishes deployed experiments from future work.
- `premium.html` and `it-was-a-joke.html` are intentionally playful pages, not a real paid plan.

## Projects represented here

### Coffre

A web password-manager experiment focused on browser-side encryption, challenge-response authentication, OTP, sessions, and controlled team access. The main Coffre interface lives in `../soyezsecurise-frontend-coffre/`, while the API lives in `../soyezsecurise-backend/`.

### Neuris / v0id

An experimental character-level classifier for safe text, path traversal, SQL injection, command injection, and XSS. Its terminal interface lives in `../soyezsecurise-frontend-neuris/` and its model endpoint is part of the backend.

### Ayano

A CLI that collects CVE details, affected-product context, public proof-of-concept searches, and research references. This repository contains its project page, not its implementation.

## Technology

The site is intentionally simple and dependency-free:

- semantic HTML pages
- one shared `styles.css`
- one shared `script.js`
- local favicon/image assets
- no build step or package manager

## Run locally

Serve the directory with any static server:

```bash
python3 -m http.server 8080
```

Then open `http://127.0.0.1:8080`.

Opening the HTML files directly may work for basic browsing, but an HTTP server gives behavior closer to deployment.

## Editing the site

- Update shared visual rules in `styles.css`.
- Update shared navigation and small interactions in `script.js`.
- Keep claims about project status consistent across the homepage, project pages, and `coming-soon.html`.
- Continue to describe Soyez Sécurisé as a personal workspace rather than a real company.
- Do not describe Coffre or Neuris as audited production security controls.
- The Coffre Android app is not finished and should be labeled as in development wherever it is mentioned.

## VPS announcements

The homepage's **Upcoming & announcements** section fetches public text from
`GET https://api.soyezsecurise.com/announcements`. Change `data-endpoint` in
`index.html` for a different API host, or use `http://127.0.0.1:8000/announcements`
for local development.

Deploy the updated frontend and backend once, then edit the backend's
`announcements.txt` on the VPS to publish news. Plain text and line breaks are
supported; HTML is displayed as text. Visitors see updates on page reload,
without rebuilding the frontend or restarting the backend. An empty file shows
“No announcements right now.”

## Writeup links

The homepage's **Writeups & discoveries** section loads links from `GET /writeups`.
Edit `../soyezsecurise-backend/writeups.json` on the VPS to add titles, URLs,
and optional descriptions. See the backend README for the format and
`WRITEUPS_FILE` configuration. Change the section's `data-endpoint` in
`index.html` to use a different backend host.

## Related directories

- `../soyezsecurise-backend/` — shared API and Neuris model
- `../soyezsecurise-frontend-coffre/` — Coffre web application
- `../soyezsecurise-frontend-neuris/` — Neuris web application
