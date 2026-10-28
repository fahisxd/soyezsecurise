"""ARCHIVE_TEST_DATABASE_URL must point to a disposable PostgreSQL database."""
import copy
import json
import os
import unittest
from pathlib import Path
from unittest.mock import patch

from fastapi import FastAPI
from fastapi.testclient import TestClient
from psycopg2.extras import Json
import main as archive

ROOT = Path(__file__).resolve().parents[1]
EXAMPLE = json.loads((ROOT / 'archive_examples/community-quiz.json').read_text())


class CursorTests(unittest.TestCase):
    def test_schema_copy_matches_frontend(self):
        backend = json.loads((ROOT / 'archive_schema/flash.schema.json').read_text())
        frontend = json.loads((ROOT.parent / 'soyezsecurise-frontend/archive/schema/flash.schema.json').read_text())
        self.assertEqual(backend, frontend)

    def test_cursor_rejects_malformed_input(self):
        for raw in ['?', 'e30', 'a' * 5000]:
            with self.subTest(raw=raw[:10]), self.assertRaises(Exception):
                archive.decode_cursor(raw)

    def test_cursor_rejects_timezone_naive_cutoff(self):
        raw = archive.encode_cursor({
            'options': ['random', None, '', 1988],
            'cutoff': '2026-10-28T00:00:00',
            'position': 'abc',
            'id': 'example',
        })
        with self.assertRaises(Exception):
            archive.decode_cursor(raw)


@unittest.skipUnless(os.getenv('ARCHIVE_TEST_DATABASE_URL'), 'Requires disposable PostgreSQL')
class DatabaseTests(unittest.TestCase):
    def setUp(self):
        self.env = patch.dict(os.environ, {'DATABASE_URL': os.environ['ARCHIVE_TEST_DATABASE_URL']})
        self.env.start()
        with archive.connect() as conn, conn.cursor() as cur:
            cur.execute((ROOT / 'migrations/001_archive.sql').read_text())
            cur.execute('TRUNCATE archive_flashes,archive_import_files')
        app = FastAPI()
        app.include_router(archive.archive_router)
        self.client = TestClient(app)

    def tearDown(self):
        self.client.close()
        self.env.stop()

    def insert(self, flash_id='one', **updates):
        record = {
            **copy.deepcopy(EXAMPLE),
            'id': flash_id,
            'status': 'published',
            'publishedAt': '2026-10-27T00:00:00Z',
            **updates,
        }
        with archive.connect() as conn, conn.cursor() as cur:
            cur.execute('''INSERT INTO archive_flashes
                (id,schema_version,title,description,category,tags,author,sources,content,status,
                 published_at,first_published_at,event_date,source_path,source_present)
                VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,now(),%s,%s,true)''',
                (record['id'], record['schemaVersion'], record['title'], record['description'],
                 record['category'], record.get('tags', []), Json(record['author']),
                 Json(record.get('sources', [])), Json(record), record['status'],
                 record.get('publishedAt'), record.get('eventDate'), 'manual:' + flash_id))
        return record

    def get(self, **params):
        response = self.client.get('/archive/flashes', params=params)
        self.assertEqual(response.status_code, 200, response.text)
        return response.json()

    def test_manually_inserted_flash_is_public_and_deep_linkable(self):
        record = self.insert()
        response = self.client.get('/archive/flashes/one')
        self.assertEqual(response.status_code, 200, response.text)
        self.assertEqual(response.json(), record)
        self.assertEqual(self.get()['records'], [record])

    def test_feed_pagination_filters_and_unpublished_records(self):
        for i in range(24):
            self.insert(f'item-{i}', category='facts' if i % 2 else 'research')
        self.insert('draft', status='draft', publishedAt=None)
        first = self.get(seed=42, limit=5)
        ids = [record['id'] for record in first['records']]
        cursor = first['nextCursor']
        while cursor:
            page = self.get(seed=42, limit=5, cursor=cursor)
            ids.extend(record['id'] for record in page['records'])
            cursor = page['nextCursor']
        self.assertEqual(len(ids), 24)
        self.assertEqual(len(set(ids)), 24)
        self.assertTrue(all(record['category'] == 'research' for record in self.get(category='research')['records']))
        self.assertEqual(self.client.get('/archive/flashes/draft').status_code, 404)
        self.assertEqual(self.client.get('/archive/flashes', params={'cursor': first['nextCursor'], 'seed': 43}).status_code, 400)


if __name__ == '__main__':
    unittest.main()
