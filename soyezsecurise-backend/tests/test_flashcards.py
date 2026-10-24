"""Run: python -m unittest discover -s tests -p 'test_flashcards.py' -v"""
import json
import os
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch

from fastapi import FastAPI
from fastapi.testclient import TestClient

from flashcards import router


class FlashcardsTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.directory = Path(self.temp.name)
        self.env = patch.dict(os.environ, {"FLASHCARDS_DIR": self.temp.name})
        self.env.start()
        self.addCleanup(self.env.stop)
        app = FastAPI()
        app.include_router(router)
        self.client = TestClient(app)
        self.addCleanup(self.client.close)

    def write_deck(self, filename="example-deck.json", **changes):
        deck = {
            "title": "Example deck",
            "cards": [{"prompt": "Question?", "title": "Answer", "answer": "Explanation."}],
            **changes,
        }
        (self.directory / filename).write_text(json.dumps(deck), encoding="utf-8")
        return deck

    def test_add_edit_remove_without_restart(self):
        self.assertEqual(self.client.get("/flashcards").json(), {"decks": []})
        self.write_deck()
        response = self.client.get("/flashcards")
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.headers["cache-control"], "no-store")
        self.assertEqual(response.json()["decks"][0]["id"], "example-deck")
        self.assertEqual(response.json()["decks"][0]["completion"]["title"], "Deck complete.")
        self.write_deck(title="Edited live")
        self.assertEqual(self.client.get("/flashcards").json()["decks"][0]["title"], "Edited live")
        self.write_deck("another-deck.json")
        self.assertEqual([deck["id"] for deck in self.client.get("/flashcards").json()["decks"]],
                         ["another-deck", "example-deck"])
        (self.directory / "example-deck.json").unlink()
        self.assertEqual(len(self.client.get("/flashcards").json()["decks"]), 1)

    def test_missing_directory_and_non_json_files(self):
        (self.directory / "unfinished.json.tmp").write_text("not json")
        self.assertEqual(self.client.get("/flashcards").json(), {"decks": []})
        os.environ["FLASHCARDS_DIR"] = str(self.directory / "missing")
        self.assertEqual(self.client.get("/flashcards").json(), {"decks": []})

    def test_invalid_content_returns_uncached_503(self):
        cases = [
            {"cards": []},
            {"title": "   "},
            {"id": "../../unsafe"},
            {"cards": [{"prompt": "Question", "title": "Title", "answer": 123}]},
            {"cards": [{"prompt": "Question", "title": "Title", "answer": "   "}]},
            {"completion": {"link_url": "javascript:alert(1)"}},
            {"completion": {"link_url": "https://example.com\\@evil.example"}},
            {"completion": {"link_url": "https://example.com/has space"}},
            {"unknown_field": "typo"},
        ]
        for changes in cases:
            with self.subTest(changes=changes), self.assertLogs("flashcards", level="WARNING"):
                self.write_deck(**changes)
                response = self.client.get("/flashcards")
            self.assertEqual(response.status_code, 503)
            self.assertEqual(response.headers["cache-control"], "no-store")
            self.assertEqual(response.json(), {"detail": "Flash cards temporarily unavailable"})

    def test_broken_json_duplicate_ids_and_invalid_directory(self):
        for raw in ("{", "[]", "null"):
            with self.subTest(raw=raw), self.assertLogs("flashcards", level="WARNING"):
                (self.directory / "example-deck.json").write_text(raw)
                self.assertEqual(self.client.get("/flashcards").status_code, 503)
        self.write_deck()
        self.write_deck("duplicate-deck.json", id="example-deck")
        with self.assertLogs("flashcards", level="WARNING"):
            self.assertEqual(self.client.get("/flashcards").status_code, 503)
        os.environ["FLASHCARDS_DIR"] = str(self.directory / "example-deck.json")
        with self.assertLogs("flashcards", level="WARNING"):
            self.assertEqual(self.client.get("/flashcards").status_code, 503)

    def test_existing_php_deck_preserves_shared_link_and_cards(self):
        os.environ.pop("FLASHCARDS_DIR")
        response = self.client.get("/flashcards")
        self.assertEqual(response.status_code, 200)
        deck = next(deck for deck in response.json()["decks"] if deck["id"] == "php-memory-deck")
        self.assertEqual(deck["id"], "php-memory-deck")
        self.assertEqual(len(deck["cards"]), 6)
        self.assertEqual(deck["cards"][0]["prompt"], "What does memory_limit actually limit?")
        self.assertEqual(deck["completion"]["highlight"], "8.2.35 · 8.3.36 · 8.4.27 · 8.5.12")


if __name__ == "__main__":
    unittest.main()
