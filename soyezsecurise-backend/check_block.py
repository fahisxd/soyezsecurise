import redis
import os
import time
import psycopg2
import traceback
from psycopg2.extras import RealDictCursor
from dotenv import load_dotenv
from logger import (
    login_logger,
    db_logger,
    sys_logger,
    otp_logger,
    Log_event
)
load_dotenv()
REDIS_URL = os.getenv("REDIS_URL")
DATABASE_URL = os.getenv("DATABASE_URL")

ip_db = redis.Redis.from_url(
    REDIS_URL,
    decode_responses=True,
    socket_connect_timeout=5,
    socket_timeout=5,
)


def get_db_connection():
    return psycopg2.connect(
        DATABASE_URL,
        cursor_factory=RealDictCursor,
        connect_timeout=5,
    )

def blocker(ip, request_id):
    conn = None
    try:
        if ip_db.exists(f"sus:{ip}"):
            ip_db.incr(f"sus:{ip}")
        else:
            ip_db.set(f"sus:{ip}", 1)
            ip_db.expire(f"sus:{ip}", 3600)

        susscore = int(ip_db.get(f"sus:{ip}"))

        if susscore >= 20:
            conn = get_db_connection()
            cursor = conn.cursor()

            cursor.execute("SELECT times_blocked FROM sususers WHERE ip = %s;", (ip,))
            row = cursor.fetchone()

            if not row:
                cursor.execute("INSERT INTO sususers(ip, times_blocked) VALUES(%s, 1);", (ip,))
                times_blocked = 1
            else:
                times_blocked = row['times_blocked']

            expires = int(time.time()) + (3600 * times_blocked)

            # Update times_blocked
            cursor.execute("UPDATE sususers SET times_blocked = times_blocked + 1 WHERE ip = %s;", (ip,))

            # Check if already blocked
            cursor.execute("SELECT * FROM blocked WHERE ip = %s;", (ip,))
            already_blocked = cursor.fetchone()

            if not already_blocked:
                cursor.execute(
                    "INSERT INTO blocked(ip, blocked, time) VALUES(%s, 'yes', %s);",
                    (ip, expires)
                )

            conn.commit()

            Log_event(
                sys_logger,
                "/check_block.py",
                "CRITICAL",
                "IP Blocked",
                "--",
                f"{ip}",
                f"{request_id}"
            )

            return "IP BLOCKED"

    except Exception:
        Log_event(
            sys_logger,
            "/check_block.py:blocker",
            "ERROR",
            traceback.format_exc(),
            "--",
            f"{ip}",
            f"{request_id}"
        )
        if conn is not None:
            conn.rollback()

    finally:
        if conn is not None:
            conn.close()

    return "not blocked"


def check(ip):
    conn = None
    try:
        now = int(time.time())
        conn = get_db_connection()
        cursor = conn.cursor()
        cursor.execute("SELECT time FROM blocked WHERE ip = %s;", (ip,))
        row = cursor.fetchone()

        if row:
            if now > row['time']:
                cursor.execute("DELETE FROM blocked WHERE ip = %s;", (ip,))
                conn.commit()
                return "not blocked"
            else:
                return "IP BLOCKED"
        else:
            return "not blocked"

    except Exception:
        Log_event(
            sys_logger,
            "/check_block.py:check",
            "ERROR",
            traceback.format_exc(),
            "--",
            f"{ip}",
            "-"
        )
        return "not blocked"

    finally:
        if conn is not None:
            conn.close()
