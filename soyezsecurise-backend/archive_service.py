"""Archive file importer and public read-only API. No migration runs on startup."""
import asyncio
import base64
import hashlib
import json
import logging
import os
from contextlib import asynccontextmanager, contextmanager, suppress
from datetime import datetime, timezone
from pathlib import Path
from typing import Literal
from urllib.parse import urlsplit

import psycopg2
from psycopg2.extras import Json, RealDictCursor
from fastapi import APIRouter, HTTPException, Query
from jsonschema import Draft7Validator, FormatChecker

logger = logging.getLogger('archive')
SCHEMA = json.loads(Path(__file__).with_name('archive_schema').joinpath('flash.schema.json').read_text())
validator = Draft7Validator(SCHEMA, format_checker=FormatChecker())
MAX_BYTES = 512_000


@contextmanager
def connect():
    conn = psycopg2.connect(os.environ['DATABASE_URL'], cursor_factory=RealDictCursor, connect_timeout=5)
    try:
        with conn:
            yield conn
    finally:
        conn.close()


def validate_record(value):
    validator.validate(value)
    protected = ['soyezsecurise.com'] + [host.strip().lower() for host in os.getenv('ARCHIVE_PROTECTED_HOSTS', '').split(',') if host.strip()]
    for origins in value.get('externalHosts', {}).values():
        for origin in origins:
            parsed_origin = urlsplit(origin)
            _ = parsed_origin.port  # Reject out-of-range ports, as the browser URL parser does.
            host = parsed_origin.hostname.lower().rstrip('.')
            if any(host == root or host.endswith('.' + root) for root in protected):
                raise ValueError('Flash external hosts cannot include application or authentication hosts')
    if any('..' in media['url'].split('/') for media in value.get('media', [])):
        raise ValueError('Media paths cannot contain parent traversal')
    if value.get('review') and value.get('publishedAt'):
        parse = lambda text: datetime.fromisoformat(text.replace('Z', '+00:00'))
        if parse(value['review']['reviewedAt']) > parse(value['publishedAt']):
            raise ValueError('Publication must be on or after review')
    return value


def read_folder(root):
    """Read the entire directory before any mutation; failures must not imply deletion."""
    if not root.is_dir():
        raise OSError('Archive content directory is unavailable')
    result = {}
    def walk(folder):
        for path in folder.iterdir():
            if path.is_symlink():
                continue
            if path.is_dir():
                walk(path)
            elif path.suffix == '.json':
                with path.open('rb') as stream:
                    raw = stream.read(MAX_BYTES + 1)
                result[path.relative_to(root).as_posix()] = raw
    walk(root)
    return result


def import_once():
    root = Path(os.getenv('ARCHIVE_CONTENT_DIR', Path(__file__).with_name('archive_content')))
    with connect() as conn:
        with conn.cursor() as cur:
            cur.execute('SELECT pg_try_advisory_xact_lock(846192735) AS locked')
            if not cur.fetchone()['locked']:
                return
            files = read_folder(root)
            parsed, errors, ids = {}, {}, {}
            for path, raw in files.items():
                try:
                    if len(raw) > MAX_BYTES:
                        raise ValueError('File exceeds 512000 bytes')
                    record = validate_record(json.loads(raw))
                    parsed[path] = record
                    ids.setdefault(record['id'], []).append(path)
                except Exception as exc:
                    errors[path] = str(exc)[:2000]
            for paths in ids.values():
                if len(paths) > 1:
                    for path in paths:
                        errors[path] = 'Duplicate flash ID; all copies rejected'
            cur.execute('SELECT * FROM archive_import_files')
            previous = {row['source_path']: row for row in cur.fetchall()}
            for path, raw in files.items():
                digest = hashlib.sha256(raw).hexdigest()
                old = previous.get(path)
                # Recheck duplicate errors even when a previously valid file is unchanged.
                if path not in errors and old and old['content_hash'] == digest and old['state'] == 'imported':
                    continue
                record = parsed.get(path)
                error = errors.get(path)
                if not error:
                    cur.execute('SELECT id,source_path FROM archive_flashes WHERE id=%s OR source_path=%s', (record['id'], path))
                    owners = cur.fetchall()
                    if any(row['id'] != record['id'] or row['source_path'] != path for row in owners):
                        error = 'ID is permanent and belongs to its original source path'
                if not error:
                    published = record.get('publishedAt')
                    cur.execute('''INSERT INTO archive_flashes
                        (id,schema_version,title,description,category,tags,author,sources,content,status,published_at,first_published_at,event_date,source_path)
                        VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,CASE WHEN %s='published' THEN clock_timestamp() END,%s,%s)
                        ON CONFLICT(id) DO UPDATE SET schema_version=excluded.schema_version,title=excluded.title,
                        description=excluded.description,category=excluded.category,tags=excluded.tags,author=excluded.author,
                        sources=excluded.sources,content=excluded.content,status=excluded.status,published_at=excluded.published_at,
                        first_published_at=coalesce(archive_flashes.first_published_at,excluded.first_published_at),
                        event_date=excluded.event_date,source_present=true,updated_at=now()''',
                        (record['id'],record['schemaVersion'],record['title'],record['description'],record['category'],
                         record.get('tags',[]),Json(record['author']),Json(record.get('sources',[])),Json(record),
                         record['status'],published,record['status'],record.get('eventDate'),path))
                else:
                    logger.warning('Archive import rejected %s: %s', path, error)
                cur.execute('''INSERT INTO archive_import_files(source_path,content_hash,flash_id,state,error,last_success_at)
                    VALUES (%s,%s,%s,%s,%s,CASE WHEN %s THEN now() END)
                    ON CONFLICT(source_path) DO UPDATE SET content_hash=excluded.content_hash,
                    flash_id=coalesce(archive_import_files.flash_id,excluded.flash_id),state=excluded.state,error=excluded.error,
                    last_checked_at=now(),last_success_at=coalesce(excluded.last_success_at,archive_import_files.last_success_at)''',
                    (path,digest,record['id'] if record else None,'invalid' if error else 'imported',error,not error))
            missing = list(set(previous) - set(files))
            if missing:
                cur.execute('UPDATE archive_flashes SET source_present=false,updated_at=now() WHERE source_present AND source_path=ANY(%s)', (missing,))
                cur.execute("UPDATE archive_import_files SET state='missing',last_checked_at=now() WHERE source_path=ANY(%s)", (missing,))


async def import_loop():
    while True:
        try:
            await asyncio.to_thread(import_once)
        except Exception:
            logger.exception('Archive scan failed; retaining existing catalog')
        await asyncio.sleep(5)


@asynccontextmanager
async def lifespan(app):
    task = asyncio.create_task(import_loop()) if os.getenv('ARCHIVE_CONTENT_DIR') else None
    try:
        yield
    finally:
        if task:
            task.cancel()
            with suppress(asyncio.CancelledError):
                await task


router = APIRouter(prefix='/archive', tags=['archive'], lifespan=lifespan)


def encode_cursor(value):
    return base64.urlsafe_b64encode(json.dumps(value, separators=(',', ':')).encode()).decode().rstrip('=')


def decode_cursor(value):
    try:
        if len(value) > 4096:
            raise ValueError()
        result = json.loads(base64.urlsafe_b64decode(value + '=' * (-len(value) % 4)))
        if not isinstance(result, dict) or set(result) != {'options','cutoff','position','id'}:
            raise ValueError()
        datetime.fromisoformat(result['cutoff'])
        if not isinstance(result['position'], str) or not isinstance(result['id'], str):
            raise ValueError()
        return result
    except Exception:
        raise HTTPException(400, 'Invalid archive cursor') from None


@router.get('/flashes')
def flashes(strategy: Literal['latest','random','chronological','category','recommended']='random',
            category: Literal['incidents','vulnerabilities','malware','research','memes','facts'] | None=None,
            q: str=Query('', max_length=200), seed: int=Query(1988, ge=0, le=2147483647),
            limit: int=Query(10, ge=1, le=30), cursor: str | None=None):
    options = [strategy,category,q.strip(),seed]
    state = decode_cursor(cursor) if cursor else None
    if state and state['options'] != options:
        raise HTTPException(400, 'Cursor does not match feed options')
    cutoff = state['cutoff'] if state else datetime.now(timezone.utc).isoformat()
    # All order keys are ascending text, with ID as a deterministic tiebreaker.
    # The shuffled key is immutable for a given seed and ID.
    if strategy in ('random','recommended'):
        rank = "md5(id || ':' || %s)"
        params = [str(seed)]
    elif strategy == 'chronological':
        rank = "coalesce(to_char(event_date,'YYYY-MM-DD'),'9999-99-99')"
        params = []
    else:
        rank = "lpad((999999999999999 - (extract(epoch FROM published_at)*1000)::bigint)::text,15,'0')"
        params = []
    sql = f'''WITH ranked AS (SELECT id,content,{rank} AS rank FROM archive_flashes
        WHERE status='published' AND source_present AND first_published_at<=%s'''
    params.append(cutoff)
    if category:
        sql += ' AND category=%s'; params.append(category)
    if q.strip():
        # Search the structured payload, including legacy slide text and contributor metadata.
        sql += " AND strpos(lower(content::text),lower(%s))>0"; params.append(q.strip())
    sql += ') SELECT * FROM ranked'
    if state:
        sql += ' WHERE (rank,id)>(%s,%s)'; params.extend([state['position'],state['id']])
    sql += ' ORDER BY rank,id LIMIT %s'; params.append(limit+1)
    try:
        with connect() as conn, conn.cursor() as cur:
            cur.execute(sql,params); rows=cur.fetchall()
    except Exception:
        logger.exception('Archive feed query failed')
        raise HTTPException(503,'Archive is temporarily unavailable') from None
    page=rows[:limit]
    next_cursor = encode_cursor({'options':options,'cutoff':cutoff,'position':page[-1]['rank'],'id':page[-1]['id']}) if len(rows)>limit else None
    return {'records':[row['content'] for row in page],'nextCursor':next_cursor}


@router.get('/flashes/{flash_id}')
def flash(flash_id: str):
    try:
        with connect() as conn, conn.cursor() as cur:
            cur.execute("SELECT content FROM archive_flashes WHERE id=%s AND status='published' AND source_present", (flash_id,))
            row=cur.fetchone()
    except Exception:
        logger.exception('Archive record query failed')
        raise HTTPException(503,'Archive is temporarily unavailable') from None
    if not row:
        raise HTTPException(404,'Flash unavailable')
    return row['content']
