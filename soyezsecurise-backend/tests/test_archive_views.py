import os
import sqlite3
import tempfile
import unittest
from concurrent.futures import ThreadPoolExecutor
from unittest.mock import patch
from archive_views import record_view


class ArchiveViewsTests(unittest.TestCase):
    def test_concurrent_counts_persist_and_ids_are_parameters(self):
        with tempfile.TemporaryDirectory() as directory:
            path = directory + '/nested/views.sqlite3'
            with patch.dict(os.environ, ARCHIVE_VIEWS_FILE=path):
                record_view("quote'flash")
                with ThreadPoolExecutor(max_workers=8) as pool:
                    list(pool.map(record_view, ['first'] * 40))
                record_view('second')
            with sqlite3.connect(path) as conn:
                rows = dict(conn.execute('SELECT flash_id, views FROM flash_views'))
            self.assertEqual(rows, {"quote'flash": 1, 'first': 40, 'second': 1})
