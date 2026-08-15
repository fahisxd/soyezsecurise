import json
import logging
import os
import sys
from datetime import datetime, timezone
from logging.handlers import RotatingFileHandler


LOG_DIR = os.getenv("LOG_DIR", "logs")
LOG_LEVEL = os.getenv("LOG_LEVEL", "INFO").upper()
LOG_TO_CONSOLE = os.getenv("LOG_TO_CONSOLE", "1") == "1"

os.makedirs(LOG_DIR, exist_ok=True)


class JsonFormatter(logging.Formatter):
    def format(self, record):
        if isinstance(record.msg, dict):
            payload = record.msg.copy()
        else:
            payload = {"event": record.getMessage()}

        payload.setdefault("level", record.levelname)
        payload.setdefault("logger", record.name)
        payload.setdefault("time", datetime.now(timezone.utc).isoformat())

        if record.exc_info:
            payload["exception"] = self.formatException(record.exc_info)

        return json.dumps(payload, ensure_ascii=False)


def build_logger(name, filename):
    logger = logging.getLogger(name)
    logger.setLevel(LOG_LEVEL)
    logger.propagate = False

    if logger.handlers:
        return logger

    formatter = JsonFormatter()
    file_handler = RotatingFileHandler(
        os.path.join(LOG_DIR, filename),
        maxBytes=1_000_000,
        backupCount=5,
        encoding="utf-8",
    )
    file_handler.setFormatter(formatter)
    logger.addHandler(file_handler)

    if LOG_TO_CONSOLE:
        console_handler = logging.StreamHandler(sys.stdout)
        console_handler.setFormatter(formatter)
        logger.addHandler(console_handler)

    return logger


login_logger = build_logger("login", "login.log")
db_logger = build_logger("database", "database.log")
sys_logger = build_logger("system", "system.log")
otp_logger = build_logger("otp", "otp.log")
access_logger = build_logger("access", "access.log")


def Log_event(func, location, level, event, user="-", ip="-", request_id="-", **extra):
    payload = {
        "level": level.upper(),
        "request_id": request_id,
        "event": event,
        "user": user or "-",
        "ip": ip or "-",
        "location": location,
    }
    payload.update(extra)

    log_method = getattr(func, level.lower(), func.info)
    log_method(payload)
