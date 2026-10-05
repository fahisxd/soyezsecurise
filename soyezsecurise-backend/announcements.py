"""Public bulletin, edited through a plain text file on the server."""

import os
from pathlib import Path

from fastapi import APIRouter, HTTPException, Response

router = APIRouter()


@router.get("/announcements")
def get_announcements(response: Response):
    configured = os.getenv("ANNOUNCEMENTS_FILE")
    path = Path(configured) if configured else Path(__file__).with_name("announcements.txt")
    response.headers["Cache-Control"] = "no-store"
    try:
        text = path.read_text(encoding="utf-8").strip()
    except FileNotFoundError:
        text = ""
    except (OSError, UnicodeError) as exc:
        raise HTTPException(
            status_code=503,
            detail="Announcements temporarily unavailable",
            headers={"Cache-Control": "no-store"},
        ) from exc
    return {"text": text}
