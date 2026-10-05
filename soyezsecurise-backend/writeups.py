"""Public writeup links maintained on the VPS."""
import json
import os
from pathlib import Path
from urllib.parse import urlsplit

from fastapi import APIRouter, HTTPException, Response

router = APIRouter()


@router.get("/writeups")
def list_writeups(response: Response):
    response.headers["Cache-Control"] = "no-store"
    path = Path(os.getenv("WRITEUPS_FILE") or Path(__file__).with_name("writeups.json"))
    try:
        posts = json.loads(path.read_text(encoding="utf-8"))
        if not isinstance(posts, list):
            raise ValueError("Expected a list")
        for post in posts:
            if not isinstance(post, dict):
                raise ValueError("Invalid writeup")
            title, url = post.get("title"), post.get("url")
            if not isinstance(title, str) or not title.strip() or not isinstance(url, str):
                raise ValueError("Title and URL required")
            parsed = urlsplit(url)
            if parsed.scheme not in ("http", "https") or not parsed.hostname or any(c.isspace() for c in url):
                raise ValueError("Invalid URL")
            if not isinstance(post.get("description", ""), str):
                raise ValueError("Invalid description")
        return {"writeups": [{"title": p["title"], "url": p["url"], "description": p.get("description", "")} for p in posts]}
    except FileNotFoundError:
        return {"writeups": []}
    except (OSError, UnicodeError, ValueError) as exc:
        raise HTTPException(503, "Writeup links temporarily unavailable", headers={"Cache-Control": "no-store"}) from exc
