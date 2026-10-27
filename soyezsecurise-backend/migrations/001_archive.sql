BEGIN;
CREATE TABLE IF NOT EXISTS archive_flashes (
 id text PRIMARY KEY CHECK (id ~ '^[a-z0-9]+(-[a-z0-9]+)*$' AND length(id)<=80),
 schema_version smallint NOT NULL CHECK (schema_version IN (1,2)),
 title text NOT NULL, description text NOT NULL, category text NOT NULL,
 tags text[] NOT NULL DEFAULT '{}', author jsonb NOT NULL, sources jsonb NOT NULL DEFAULT '[]',
 content jsonb NOT NULL, status text NOT NULL CHECK (status IN ('draft','published','rejected')),
 published_at timestamptz, first_published_at timestamptz, event_date date,
 source_path text NOT NULL UNIQUE, source_present boolean NOT NULL DEFAULT true,
 created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
 CHECK (status <> 'published' OR (published_at IS NOT NULL AND first_published_at IS NOT NULL))
);
CREATE INDEX IF NOT EXISTS archive_latest ON archive_flashes(published_at DESC,id) WHERE status='published' AND source_present;
CREATE INDEX IF NOT EXISTS archive_category ON archive_flashes(category,published_at DESC,id) WHERE status='published' AND source_present;
CREATE INDEX IF NOT EXISTS archive_events ON archive_flashes(event_date,id) WHERE status='published' AND source_present;
CREATE INDEX IF NOT EXISTS archive_tags ON archive_flashes USING gin(tags);
CREATE TABLE IF NOT EXISTS archive_import_files (
 source_path text PRIMARY KEY, content_hash text, flash_id text,
 state text NOT NULL CHECK (state IN ('imported','invalid','missing')), error text,
 last_checked_at timestamptz NOT NULL DEFAULT now(), last_success_at timestamptz
);
COMMIT;
