"""Public study decks, read from VPS JSON files on every request."""
import json
import logging
import os
from pathlib import Path
from urllib.parse import urlsplit

from fastapi import APIRouter, HTTPException, Response
from pydantic import BaseModel, ConfigDict, Field, StrictStr, field_validator

router = APIRouter()
logger = logging.getLogger(__name__)


class Content(BaseModel):
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)


class Card(Content):
    prompt: StrictStr = Field(min_length=1)
    title: StrictStr = Field(min_length=1)
    answer: StrictStr = Field(min_length=1)
    kicker: StrictStr = ""
    context: StrictStr = ""


class Completion(Content):
    title: StrictStr = "Deck complete."
    description: StrictStr = "Review the cards again whenever you need a refresher."
    highlight_label: StrictStr = ""
    highlight: StrictStr = ""
    link_label: StrictStr = "Read more"
    link_url: StrictStr = ""

    @field_validator("link_url")
    @classmethod
    def validate_link(cls, value):
        if not value:
            return value
        parsed = urlsplit(value)
        if (parsed.scheme not in ("http", "https") or not parsed.hostname
                or any(c.isspace() for c in value) or "\\" in value):
            raise ValueError("Completion links must be absolute HTTP/HTTPS URLs")
        return value


class Deck(Content):
    id: StrictStr = Field(pattern=r"^[a-z][a-z0-9]*(?:-[a-z0-9]+)*-deck$")
    title: StrictStr = Field(min_length=1)
    description: StrictStr = ""
    topic: StrictStr = "Study deck"
    eyebrow: StrictStr = "STUDY DECK"
    front_label: StrictStr = "S/S / STUDY NOTES"
    back_hint: StrictStr = "Compare with your answer."
    completion: Completion = Field(default_factory=Completion)
    cards: list[Card] = Field(min_length=1)


@router.get("/flashcards")
def list_flashcards(response: Response):
    response.headers["Cache-Control"] = "no-store"
    directory = Path(os.getenv("FLASHCARDS_DIR") or Path(__file__).with_name("flashcards"))
    source = directory
    try:
        if not directory.exists():
            return {"decks": []}
        if not directory.is_dir():
            raise ValueError("FLASHCARDS_DIR must be a directory")
        decks, ids = [], set()
        # Sorting filenames gives authors a predictable display order.
        for path in sorted(directory.glob("*.json")):
            source = path
            data = json.loads(path.read_text(encoding="utf-8"))
            if not isinstance(data, dict):
                raise ValueError(f"{path.name}: expected a deck object")
            deck = Deck.model_validate({"id": path.stem, **data})
            if deck.id in ids:
                raise ValueError(f"Duplicate deck ID: {deck.id}")
            ids.add(deck.id)
            decks.append(deck.model_dump())
        return {"decks": decks}
    except (OSError, UnicodeError, ValueError) as exc:
        logger.warning("Cannot load flashcards from %s: %s", source, exc)
        raise HTTPException(
            503, "Flash cards temporarily unavailable",
            headers={"Cache-Control": "no-store"},
        ) from exc
