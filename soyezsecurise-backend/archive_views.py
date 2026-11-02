"""File-backed aggregate Archive view counts; no visitor data is stored."""
import os
import sqlite3
from pathlib import Path


def record_view(flash_id):
    path = Path(os.environ.get('ARCHIVE_VIEWS_FILE', Path(__file__).parent / 'data' / 'archive-views.sqlite3'))
    path.parent.mkdir(parents=True, exist_ok=True)
    with sqlite3.connect(path, timeout=5) as conn:
        conn.execute('CREATE TABLE IF NOT EXISTS flash_views (flash_id TEXT PRIMARY KEY, views INTEGER NOT NULL, last_viewed_at TEXT NOT NULL)')
        conn.execute('''INSERT INTO flash_views VALUES (?, 1, strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))
            ON CONFLICT(flash_id) DO UPDATE SET views=views+1, last_viewed_at=excluded.last_viewed_at''', (flash_id,))
