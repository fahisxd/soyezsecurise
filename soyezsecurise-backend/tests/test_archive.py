"""ARCHIVE_TEST_DATABASE_URL must point to a disposable database: tests truncate Archive tables."""
import copy
import json
import os
from pathlib import Path
import tempfile
import time
import unittest
from unittest.mock import patch

from fastapi import FastAPI
from fastapi.testclient import TestClient
import main as archive

ROOT = Path(__file__).resolve().parents[1]
EXAMPLE = json.loads((ROOT / 'archive_examples/community-quiz.json').read_text())


class ValidationTests(unittest.TestCase):
    def test_versions_and_publication(self):
        archive.validate_record(EXAMPLE)
        with self.assertRaises(Exception):
            archive.validate_record({**EXAMPLE, 'status': 'published'})
        with self.assertRaises(Exception):
            archive.validate_record({**EXAMPLE, 'externalHosts': {'script': ['https://example.com; unsafe-inline']}})
        self.assertEqual(json.loads((ROOT / 'archive_schema/flash.schema.json').read_text()), json.loads((ROOT.parent / 'soyezsecurise-frontend/archive/schema/flash.schema.json').read_text()))

    def test_contributors_cannot_allowlist_application_hosts(self):
        for kind in ['connect', 'script', 'image', 'style', 'font', 'media', 'frame']:
            for origin in ['https://soyezsecurise.com', 'https://api.soyezsecurise.com', 'https://coffre.soyezsecurise.com', 'https://API.SOYEZSECURISE.COM:443']:
                with self.subTest(kind=kind, origin=origin), self.assertRaises(ValueError):
                    archive.validate_record({**EXAMPLE, 'externalHosts': {kind: [origin]}})
        with patch.dict(os.environ, {'ARCHIVE_PROTECTED_HOSTS': 'auth.custom.test'}):
            with self.assertRaises(ValueError):
                archive.validate_record({**EXAMPLE, 'externalHosts': {'connect': ['https://auth.custom.test']}})
        archive.validate_record({**EXAMPLE, 'externalHosts': {'connect': ['https://api.example.com']}})

    def test_cursor_rejects_malformed_input(self):
        for raw in ['?', 'e30', 'a' * 5000]:
            with self.subTest(raw=raw[:10]), self.assertRaises(Exception):
                archive.decode_cursor(raw)


@unittest.skipUnless(os.getenv('ARCHIVE_TEST_DATABASE_URL'), 'Requires disposable PostgreSQL')
class DatabaseTests(unittest.TestCase):
    def setUp(self):
        self.directory = tempfile.TemporaryDirectory()
        self.root = Path(self.directory.name)
        self.env = patch.dict(os.environ, {'DATABASE_URL': os.environ['ARCHIVE_TEST_DATABASE_URL'], 'ARCHIVE_CONTENT_DIR': str(self.root)})
        self.env.start()
        with archive.connect() as conn, conn.cursor() as cur:
            cur.execute((ROOT / 'migrations/001_archive.sql').read_text())
            cur.execute('TRUNCATE archive_flashes,archive_import_files')
        app = FastAPI(); app.include_router(archive.archive_router)
        self.client = TestClient(app)  # no background scanner; tests explicitly control imports

    def tearDown(self):
        self.client.close(); self.env.stop(); self.directory.cleanup()

    def write(self, name='one', **updates):
        value = {**copy.deepcopy(EXAMPLE), 'id': name, 'status': 'published', 'publishedAt': '2026-10-27T00:00:00Z', **updates}
        (self.root / (name + '.json')).write_text(json.dumps(value))
        return value

    def get(self, **params):
        response = self.client.get('/archive/flashes', params=params)
        self.assertEqual(response.status_code, 200, response.text)
        return response.json()

    def test_import_edit_invalid_delete_restore(self):
        self.write(); archive.import_once()
        self.assertEqual(len(self.get()['records']), 1)
        self.write(title='Edited'); archive.import_once()
        self.assertEqual(self.client.get('/archive/flashes/one').json()['title'], 'Edited')
        (self.root / 'one.json').write_text('{')
        archive.import_once()
        self.assertEqual(self.client.get('/archive/flashes/one').json()['title'], 'Edited')
        (self.root / 'one.json').unlink(); archive.import_once()
        self.assertEqual(self.client.get('/archive/flashes/one').status_code, 404)
        self.write(); archive.import_once()
        self.assertEqual(len(self.get()['records']), 1)
        self.write(status='draft'); archive.import_once()
        self.assertEqual(self.get()['records'], [])

    def test_duplicates_id_changes_and_unavailable_folder(self):
        record = self.write(); archive.import_once()
        (self.root / 'copy.json').write_text(json.dumps(record)); archive.import_once()
        self.assertEqual(len(self.get()['records']), 1)  # last valid version survives
        (self.root / 'copy.json').unlink()
        self.write(id='changed-id'); archive.import_once()
        self.assertEqual(self.client.get('/archive/flashes/changed-id').status_code, 404)
        with patch.object(archive, 'read_folder', side_effect=PermissionError()):
            with self.assertRaises(PermissionError): archive.import_once()
        self.assertEqual(self.client.get('/archive/flashes/one').status_code, 200)

    def test_partial_oversized_and_symlink_files(self):
        self.write(); (self.root / 'pending.tmp').write_text('{')
        (self.root / 'huge.json').write_bytes(b' ' * (archive.MAX_BYTES + 1))
        (self.root / 'alias.json').symlink_to(self.root / 'one.json')
        archive.import_once()
        self.assertEqual(len(self.get()['records']), 1)

    def test_snapshot_pagination_filters_and_restarts(self):
        for i in range(24): self.write(f'item-{i}', category='facts' if i % 2 else 'research')
        self.write('draft', status='draft'); archive.import_once()
        first = self.get(seed=42, limit=5)
        self.write('new-entry'); archive.import_once()
        ids = [r['id'] for r in first['records']]; cursor = first['nextCursor']
        while cursor:
            result = self.get(seed=42, limit=5, cursor=cursor)
            ids.extend(r['id'] for r in result['records']); cursor=result['nextCursor']
        self.assertEqual(len(ids), 24); self.assertEqual(len(set(ids)), 24)
        self.assertNotIn('new-entry', ids)
        self.assertNotEqual(ids[:5], [r['id'] for r in self.get(seed=43,limit=5)['records']])
        self.assertTrue(all(r['category']=='research' for r in self.get(category='research')['records']))
        self.assertEqual(len(self.get(q='@yourhandle', limit=30)['records']),25)
        self.assertEqual(self.client.get('/archive/flashes', params={'cursor': first['nextCursor'], 'seed':43}).status_code,400)
        for strategy in ['latest','chronological','category','recommended']:
            self.assertEqual(len(self.get(strategy=strategy,limit=30)['records']),25)

    def test_advisory_lock_skips_second_importer(self):
        self.write()
        with archive.connect() as conn, conn.cursor() as cur:
            cur.execute('SELECT pg_advisory_xact_lock(846192735)')
            archive.import_once()
            self.assertEqual(self.get()['records'], [])
        archive.import_once()
        self.assertEqual(len(self.get()['records']),1)

    def test_startup_scanner_imports_without_a_manual_call(self):
        self.write('automatic')
        app = FastAPI(); app.include_router(archive.archive_router)
        with TestClient(app) as client:
            deadline = time.monotonic() + 3
            while time.monotonic() < deadline:
                response = client.get('/archive/flashes/automatic')
                if response.status_code == 200:
                    break
                time.sleep(.02)
            self.assertEqual(response.status_code, 200, response.text)

    def test_validation_and_unpublished_lookup(self):
        self.write('draft', status='draft'); archive.import_once()
        self.assertEqual(self.client.get('/archive/flashes/draft').status_code,404)
        for params in [{'limit':31},{'seed':-1},{'category':'unknown'},{'strategy':'oops'}]:
            self.assertEqual(self.client.get('/archive/flashes',params=params).status_code,422)
