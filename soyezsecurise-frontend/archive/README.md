# THE ARCHIVE

A cybersecurity flashcard archive for SoyezSécurisé. React, strict TypeScript, Vite, and plain CSS. Flash content comes only from the existing FastAPI backend with PostgreSQL and automatic VPS JSON imports. There are no bundled default stories or local fallback catalog.

This directory is independent of the existing website. Nothing outside `archive/` needs to change to develop it. **No deployment or live-site modification has been performed or authorized.** The intended eventual address is `https://soyezsecurise.com/archive/`.

## Connected feed and custom HTML flashes

The current connected implementation and VPS setup are documented in
[the backend Archive guide](../../soyezsecurise-backend/ARCHIVE.md).
That guide supersedes the historical “future backend” notes below. The backend
migration is `soyezsecurise-backend/migrations/001_archive.sql`, not the old SQL proposal.

Production builds read `VITE_ARCHIVE_API_URL` from the tracked `.env.production`.
For local development, copy `.env.example` to `.env.local` and adjust the URL if
you are using a different API host.
Connected feeds load batches of 10, prefetch near the end, preserve the active
card on append, and finish with a reshuffle action. If the API URL is missing,
the archive displays a backend configuration error and no stories.
Share links and saved items resolve independently through the record endpoint.
The interface focuses on flashes, saved posts, and search/filter controls.

Version 2 JSON supports isolated HTML/CSS/JavaScript flashes, contributor handles,
and exact HTTPS origin allowlists. A working draft is in
`soyezsecurise-backend/archive_examples/community-quiz.json`. Version 1 templates
remain supported. Interactive version 2 flashes require credentialless iframe
support; unsupported browsers show a non-executing fallback. See the
[isolation audit](docs/ISOLATION.md) for the threat model and browser tests. Both versions share the JSON schema; version 2 publication
requires explicit published status and date, while version 1 retains its review gate.
Run `npm run test:api-browser` for connected-feed browser checks in addition to the
browser suite.

## Open from the main site

The main site's Archive links open `archive/index.html` explicitly. That entry
uses the production `assets/archive.js` classic bundle and `assets/archive.css`
with relative paths, so it works both over HTTP and when the homepage is opened
from disk. Opening a directory itself through `file://` displays Chrome's directory
listing; use the main-site link or the explicit `index.html` entry.

`npm run build` rebuilds the app and refreshes the generated `assets/` and `media/`
next to this entry, as well as the standalone deployment in `dist/`. Commit the
updated entry/assets/media with source changes so the plain HTML site stays usable.
The Vite development server substitutes the TypeScript entry automatically.

For deployment, publish only `dist/` at `/archive/`, alongside the existing main
site. The source directory contains development dependencies and unpublished
content and is not the deployment artifact. `npm run test:static` verifies the
actual homepage link from disk, a plain HTTP server, and the exported build.

## Run locally

Use Node.js 22.12+ (or a supported newer LTS) and npm.

```sh
cd archive
npm ci
npm run dev
```

Open `http://127.0.0.1:5173/archive/`. The checked-in `.env.production` configures
the production build; Vite dev reads `.env.local` when present.

```sh
npm test                 # schema, backend feed contract, virtualization, local state
npm run build            # TypeScript check + production build
npm run preview          # inspect dist locally, usually at /archive/ on port 4173
npm run test:browser     # browser interactions, desktop and touch mobile
```

Browser tests use an installed Chromium at `/usr/bin/chromium`. Override with `CHROMIUM_PATH=/path/to/chromium npm run test:browser` if needed. They start a local Vite server on port 4173. The unit tests require no browser or external services.

## Publish a flash

Create and review a JSON file in the VPS backend's `archive_content/` folder. The backend validates it, stores it in PostgreSQL, and serves published records through the API. Follow the [backend Archive guide](../../soyezsecurise-backend/ARCHIVE.md); frontend files are not a publishing surface.

Minimal draft:

```json
{
  "schemaVersion": 1,
  "id": "your-permanent-id",
  "type": "security-fact",
  "title": "A small detail. A big consequence.",
  "description": "A short, accessible introduction.",
  "category": "facts",
  "slides": [
    {
      "front": { "heading": "The hook", "body": "What makes this interesting?" },
      "back": { "heading": "The context", "body": "What actually happened, and why?" }
    }
  ],
  "author": { "name": "Your name" },
  "status": "draft",
  "provenance": { "kind": "editorial", "origin": "manual" }
}
```

After human review, use real values for:

```json
{
  "status": "published",
  "publishedAt": "2026-10-26T10:00:00Z",
  "review": {
    "reviewedBy": "Reviewer name",
    "reviewedAt": "2026-10-26T09:00:00Z"
  }
}
```

`publishedAt` is ordering metadata, **not a scheduling mechanism**. A reviewed record with published status enters the build even if its timestamp is in the future. Keep future stories in draft until ready.

Optional fields:

| Field | Shape / behavior |
| --- | --- |
| `tags` | Array of strings; searched and shown below the card |
| `eventDate` | `YYYY-MM-DD`; undated events sort last in chronological mode |
| `media` | `[{ "kind": "image", "url": "media/example.webp", "alt": "Meaningful description" }]`; place local files in `public/media/`; HTTPS images also supported |
| `sources` | `[{ "title": "Primary source", "url": "https://…", "note": "Optional citation detail" }]` |
| `author.url` | HTTPS author link metadata |
| `slides[].front/back.code` | Optional text diagram / snippet; never evaluated |
| `slides[].front/back.caption` | Short footer note or attribution |
| `provenance.generatedAt` | ISO timestamp for an upstream generated draft |

Optional images appear on the front of each slide and preload near the viewport. Card faces use readable excerpts, with the complete original text and diagrams available through “Read full story.” The feed is the only scroll surface until a dialog or menu is opened. Missing optional fields are omitted; unavailable images get a descriptive fallback. External images can contact their host; local media is preferable for privacy and availability. Only image media is supported in schema version 1; video/audio can be added in a later version.

Supported content types: `historical-incident`, `vulnerability`, `malware-history`, `security-research`, `meme`, `security-fact`. Categories: `incidents`, `vulnerabilities`, `malware`, `research`, `memes`, `facts` (shown as “Curiosities”). Type and category are independent editorial metadata. Provenance kinds: `sample`, `editorial`, `original-research`.

### Future Monday workflow

Monday may write schema-valid drafts with `provenance.origin: "monday"`, an optional generation timestamp, sources, and `status: "draft"`. There is no Monday integration or automatic approval in Phase 1. A human checks claims and citations, edits, adds review metadata, and explicitly publishes. The review object is an editorial convention enforced by validation, not an authentication or cryptographic approval system. File write access remains the trust boundary.

## Feed and interactions

- Scroll or swipe to move one full-screen story at a time. Use ↑ / ↓ while the feed is focused; Home returns to the beginning. There are no separate on-screen up/down navigation arrows or page scrollbar.
- Focus a card and press Enter or Space to flip it. Slide buttons, or ← / → inside a card, move between slides.
- Bookmark locally; saved files survive reloads and synchronize across tabs. If storage is unavailable, bookmarks remain for the session and a notice explains this. No reading history is stored.
- Share copies a stable `/archive/#flash/<id>` URL. A selectable link appears if clipboard access fails. Unknown or unpublished IDs fall back to the archive with a notice.
- Open Search & filter to search titles, descriptions, tags, IDs, authors, and slide text, or choose a category. Saved flashes are one tap away in the compact header. Menus dismiss on outside click or Escape.
- The API supplies the feed in its chosen order; the frontend requests more pages as the reader advances.
- Only the active card is in the tab sequence; nearby cards are inert. Focus indicators, reduced motion, semantic buttons, source links, accessible labels, and live status messages are included.


## Story-first presentation

The default view is an edge-to-edge story poster with compact navigation and actions floating over the story. A cropped preview of the next story remains at the bottom, showing its actual headline and visual accent; tap it or scroll/swipe to continue. The page has no permanent sidebar or right-hand preview. Native scroll snapping moves one story at a time; story text does not add a nested scrollbar. Short entrance transitions and subtle illustration motion support the reel pacing, and reduced-motion preferences disable both. The full-story dialog contains all original faces, code, and captions without truncation. Flips, slide navigation, bookmarks, sharing, and citations still use the same validated records.

An optional `presentation` object gives each JSON record a visual treatment:

```json
{
  "presentation": {
    "visual": "memory-leak",
    "accent": "coral",
    "displayText": "64 KB",
    "caption": "A small request. A chunk of someone else’s memory."
  }
}
```

Visual choices are `memory-leak`, `network`, `timeline`, `bit-flip`, `terminal`, `typography`, `disclosure`, and `entropy`. Accents are `sage`, `coral`, `amber`, and `ice`. Labels, large display text, and captions are editorial JSON, never inferred research claims. Story visuals use native SVG/CSS and optional supplied images; they need no generation service, remote font, or additional asset host. Missing presentation metadata falls back to a readable terminal or supplied-media treatment. A backend storing presentation metadata must preserve this optional object in its JSON serialization; no backend or SQL changes are included in this presentation update.

## Architecture

| Module | Responsibility |
| --- | --- |
| `schema/flash.schema.json`, `src/types.ts` | Content contract and strict UI types |
| `src/lib/validation.ts` | Shared validation and publication boundary |
| `vite.config.ts` | Development and production app entry configuration |
| `src/lib/feed.ts`, `src/lib/api.ts` | Backend strategy requests, ordered-response adapter, viewport helpers |
| `src/components/Feed.tsx` | Viewport snapping, bounded rendering, nearby asset preloading |
| `src/components/FlashCard.tsx` | Faces, slides, sources and actions |
| `src/lib/bookmarks.ts` | Defensive, versioned local bookmark serialization |
| `src/lib/engagement.ts` | Future signal interface; current sink intentionally discards every signal |

**Ordering belongs to the existing backend.** There are no sorting, shuffling, ranking, or recommendation algorithms in the browser. The strategy selector sends `latest`, `random`, `chronological`, `category`, or `recommended` to the configured API. The frontend validates and preserves the returned sequence.

The feed uses a virtual scroll track with at most five mounted flashcards (active ±2). Track capacity extends as the visitor approaches its end, and records are selected by index modulo the current ordered catalog. Nearby faces and slides are already rendered. Scrolling tracks the viewport's actual height; resize preserves the current position. All published metadata is loaded upfront, so very large catalogs will eventually need segmented static manifests and paged fetching; this version virtualizes rendering, not catalog download size.

Drafts, rejected records, and invalid records are excluded by the backend before the API response. The frontend validates responses before rendering them.

Signals distinguish views (1.2 seconds visible), immediate skips, bookmarks, and completion (all slide backs revealed). The Phase 1 sink is a no-op. An optional unused in-memory aggregator demonstrates coarse per-record counts without visitor IDs, fingerprints, timestamps, or event trails. Any future remote aggregation, consent rules, deduplication, ranking, or analytics UI needs explicit design and implementation; none is silently enabled here. Flip/slide state is ephemeral and may reset when a distant card is unmounted.

## Reviewable hosting output — not deployed

`npm run build` writes only `archive/dist/`. Vite's base is `/archive/`; local media resolves under the same base. After a separate deployment approval, those files can be served as the site's `archive/` directory. Configure the host to redirect `/archive` to `/archive/` and serve `index.html` there. Hash-based record links need no server-side record routes. Do not replace the existing website root or copy this app's `index.html` over the existing home page.

No root site links, hosting configuration, live files, or deployment pipelines are changed by this project.

## Existing backend: the one table to create

The existing FastAPI backend uses PostgreSQL (`psycopg2`). Reuse that database. The proposed content table is **`archive_flashes`**; the full, unapplied definition is [schema/archive_flashes.sql](schema/archive_flashes.sql).

It stores typed, queryable content metadata, publication status and review timestamps, with JSONB for slides, sources, media, author, and provenance. A constraint prevents publishing without reviewer metadata. Partial indexes support latest, category, and chronological published feeds. Nested slide objects preserve the JSON front/back format. The SQL comments define snake_case to camelCase API mappings. Backend imports still need full JSON Schema validation; the SQL constraints are deliberately not a second complete JSON validator.

No additional users, bookmarks, scores, or analytics tables are needed for Phase 1. Bookmarks stay on the device. The existing `/flashcards` endpoint has a different study-deck format and stays intact. The Archive endpoint returns validated published records.

Local visual previews are in `docs/previews/`. With the app running at port 4173, regenerate them with `node scripts/capture.mjs`.


## Connect the existing backend

Copy `.env.example` to `.env.local` and set `VITE_ARCHIVE_API_URL` to your backend's archive endpoint for local development. Production builds use `.env.production`.

Request contract:

```text
GET /archive/flashes?strategy=latest&category=malware&q=worm
GET /archive/flashes?strategy=random&seed=1988
```

The public response is `{ "records": [ ...schema-valid published flashes in backend order... ] }`. The browser never sorts or shuffles this array. Category and search parameters are processed by the backend in API mode. The seed is only sent for random requests; the browser increments it when a visitor requests another shuffle. Save filtering remains local and preserves upstream order. Abortable requests prevent stale searches replacing newer results. Invalid response envelopes show a retry state; individual invalid records are skipped. A backend error does not silently switch to demo content.

The backend owns publication validation, discovery/import, review, ordering, future engagement aggregation, recommendation experiments, and any later cursor pagination. A first backend implementation can offer deterministic latest/chronological/category ordering, seeded randomization, and a clearly declared latest fallback for recommended. These algorithms are intentionally **not implemented in this frontend**. Use the existing FastAPI service and proposed `archive_flashes` table, rather than introducing another service or database.

The API returns a cursor-paginated collection. No user identifiers or reading trails are sent. The existing backend must allow this site's origin through its CORS configuration.

Phone layouts reserve separate areas for metadata, story text, centered artwork, and controls, with notch/home-indicator insets. Artwork stays upright, images retain their proportions, and revealing the debrief changes the face without a spinning animation. Landscape phones use two columns and preserve the active story and face when rotated. The active story fills the feed slot; scrolling or swiping advances to the next story. Browser checks cover both faces of every visual treatment from 320×568 to 430×932, landscape at 844×390, and native touch navigation. Phone previews are in `docs/previews/mobile.png`, `mobile-small.png`, and `mobile-meme.png`.
