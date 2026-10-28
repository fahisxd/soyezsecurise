# Archive VPS setup

Archive content is managed directly in PostgreSQL. The backend exposes a
read-only API; it does not scan folders or import JSON files. No additional
service, account system, or visitor-history table is required.

## Deploy once

From the backend directory, with your normal deployment environment active:

```sh
pip install -r requirements.txt
psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f migrations/001_archive.sql
```

Keep `DATABASE_URL` pointing to the existing database. Apply the migration once;
application startup never creates or changes tables.

Set the Archive frontend build environment:

```text
VITE_ARCHIVE_API_URL=https://api.soyezsecurise.com/archive/flashes
```

Build from `soyezsecurise-frontend/archive` using `npm ci` and `npm run build`.
Serve the resulting `dist/` directory at the main website's `/archive/` path.
The existing backend CORS configuration permits public reads. Verify
`GET /archive/flashes` before deploying the connected frontend. Without the
frontend variable, Archive continues to use the local demonstration catalog.

## Add and edit flashes

Use `archive_examples/community-quiz.json` as a content example. Insert the
complete flash JSON into `archive_flashes.content` and copy its searchable fields
to the matching table columns. For a published record, set `status` to
`published`, provide `published_at` and `first_published_at`, set
`source_present=true`, and give `source_path` a unique value such as
`manual:<flash-id>`. For a draft, leave both publication timestamps null.

Example for a version 2 published flash (replace the sample JSON and metadata
with the values for your flash):

```sql
INSERT INTO archive_flashes
  (id, schema_version, title, description, category, tags, author, sources,
   content, status, published_at, first_published_at, event_date,
   source_path, source_present)
VALUES
  ('example-flash', 2, 'Example title', 'Example description', 'facts', '{}',
   '{"name":"Editorial team"}'::jsonb, '[]'::jsonb,
   '{"schemaVersion":2,"id":"example-flash","type":"security-fact","title":"Example title","description":"Example description","category":"facts","author":{"name":"Editorial team"},"status":"published","publishedAt":"2026-10-28T00:00:00Z","provenance":{"kind":"editorial","origin":"manual"},"html":"<main><h1>Example</h1></main>","css":"","javascript":"","externalHosts":{}}'::jsonb,
   'published', '2026-10-28T00:00:00Z', now(), NULL,
   'manual:example-flash', true);
```

To edit a flash, update the row's `content` and matching metadata columns in one
transaction. To unpublish it, set `status='draft'` and clear `published_at`;
to remove it from the public API, set `source_present=false` or delete the row.
There is no public write endpoint. `published_at` is editorial ordering metadata,
not scheduled publication. New publications enter fresh browsing sessions; an
existing paginated shuffle keeps its original publication cutoff.

Review content, contributor code, and external hosts before inserting it. Credit
contributors with `author.name`, optional `author.handle`, and optional HTTPS
`author.url`.

## External requests and isolation

Version 2 supports `externalHosts` with arrays named `connect`, `script`, `image`,
`style`, `font`, `media`, and `frame`. Each entry is an exact HTTPS origin, for example:

```json
{
  "externalHosts": {
    "connect": ["https://api.example.com"],
    "image": ["https://images.example.com"]
  }
}
```

Omitted lists allow no remote hosts for that resource type. Inline CSS/scripts
and data images are supported. Application/authentication hosts cannot be listed:
`soyezsecurise.com` and all its subdomains are always protected. The frontend also
protects its current hostname and configured API hostname. For custom deployments,
set comma-separated `ARCHIVE_PROTECTED_HOSTS` (backend) and
`VITE_ARCHIVE_PROTECTED_HOSTS` (frontend build) to every additional authenticated
hostname. Host protection applies to every resource list, not just `connect`.

Interactive flashes require both `sandbox="allow-scripts"` and `credentialless`.
The sandbox never grants same-origin, popups, forms, downloads, top navigation,
storage-access, or pointer lock. Each flash has an opaque origin; DOM, credentials,
and storage from the parent and siblings are inaccessible. Credentialless mode
adds an ephemeral network context, so contributor requests cannot reuse the
visitor's existing cookies. Sandbox alone is insufficient for that protection.
Unsupported browsers show the title, description, attribution, and navigation
without instantiating a contributor iframe or executing its JavaScript.

The iframe `allow` policy explicitly denies every Permissions Policy feature
exposed by the browser (with sensitive-feature defaults where enumeration is
unavailable). This includes camera/microphone, geolocation, clipboard, fullscreen,
WebAuthn, payment, device APIs, and storage access. The CSP denies workers,
service-worker script loads, plugins, manifests, forms, and unlisted subresources.
There is no parent message handler or privileged RPC bridge; messages from frames
are not commands. Author HTML/CSS/JS is never injected into the parent document.

External fetch services must accept requests from an opaque origin (`Origin:
null`); allowlisting does not bypass remote CORS. No referrer is sent. Host lists
constrain subresources/fetches, not a flash navigating its own iframe. Such
navigation stays sandboxed and credentialless and cannot navigate the parent.

Published content remains public: isolation prevents reading another iframe's
DOM or private runtime state, not obtaining another published post from a public
URL. Never put secrets in a flash. Approved remote services receive requests and
can collect content explicitly supplied to them. Remote host approval still
requires editorial review, including redirects and embedded content. Contributor
code can consume CPU/memory; browser sandboxing is not a resource quota or a
complete defense against browser implementation vulnerabilities.

Security evidence and remaining deployment boundaries are in the frontend
[isolation audit](../soyezsecurise-frontend/archive/docs/ISOLATION.md).

## Tables and diagnostics

`migrations/001_archive.sql` defines the complete columns and indexes:

- `archive_flashes`: stable ID; schema version; title, description, category and
  tags; author and sources; complete JSON content; publication status and dates;
  original source path and presence; created/updated timestamps.
- `archive_import_files`: legacy importer diagnostics; no longer read or written
  by the backend.

```sql
SELECT id, status, source_present, updated_at
FROM archive_flashes ORDER BY updated_at DESC;
```

Database errors return a retryable 503 instead of switching visitors to demo
content. Take your normal PostgreSQL backup before applying the migration. The
legacy importer diagnostics table is retained by the migration for compatibility.

The authoritative frontend schema is `archive/schema/flash.schema.json`; its
backend copy is `archive_schema/flash.schema.json`. Update both together; the
backend test verifies parity. The legacy proposed SQL file in the frontend is
superseded by the applied backend migration.

## Public API

`GET /archive/flashes?strategy=random&seed=42&limit=10`
returns `{ "records": [...], "nextCursor": "..." }`, with `null` at the end.
Pass the cursor back with the same strategy, category, search text and seed.
Limit defaults to 10 and is capped at 30. Optional `category` and `q` filter
published, present records. A seed is an integer from 0 through 2147483647.

Random uses deterministic hash ordering of seed + ID; recommended currently
uses the same shuffle and makes no personalization claim. Latest/category sort
by publication date descending; chronological uses event date ascending with
undated records last. All use ID tiebreakers and keyset pagination. Cursor state
is validated and contains no secrets; it is opaque to clients, not signed or an
authorization token. Deletions and unpublishing take effect on the next query.
Changing ordering metadata during a latest/chronological traversal can move a
record; the frontend also deduplicates appended IDs. Shuffle keys remain stable.
New publications are excluded after a session's cutoff. Shuffling mixes
categories statistically, without category quotas. Hash sorting is suitable for
the initial catalog; inspect query timings before scaling to very large catalogs.

`GET /archive/flashes/{id}` returns the full public JSON or 404. Deep links and
saved cards use it regardless of the current page/search. Bookmarks remain local;
no visitor identity or reading history is sent. The frontend displays flashes,
saved posts, and search/filter controls.

## Checks

```sh
python -m unittest discover -s tests -p test_archive.py -v
```

Set `ARCHIVE_TEST_DATABASE_URL` to a **disposable PostgreSQL database** to enable
integration tests; they create/truncate the two Archive tables. Leave it unset to
run validation-only tests. Install `httpx` alongside backend dependencies for
FastAPI's test client. Existing homepage deck tests remain separate.

From the Archive frontend:

```sh
npm run validate:content
npm test
npm run build
npm run test:browser
npm run test:api-browser
```
