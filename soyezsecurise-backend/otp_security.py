from datetime import datetime, timezone

import pyotp


def consume_otp_hash(store, key):
    """Atomically read and delete a Redis hash-backed OTP challenge."""
    transaction = store.pipeline(transaction=True)
    transaction.hgetall(key)
    transaction.delete(key)
    pending, _ = transaction.execute()
    return pending


def verify_totp_once(store, subject, secret, candidate):
    """Atomically accept a valid TOTP time-step only once per subject."""
    totp = pyotp.TOTP(secret)
    now = datetime.now(timezone.utc)
    if not totp.verify(str(candidate), for_time=now):
        return False

    time_step = totp.timecode(now)
    replay_key = f"totp-used:{subject}:{time_step}"
    # SET NX makes simultaneous verification attempts race safely: only one
    # request can claim this user/time-step.  Keep it beyond the current step.
    return bool(store.set(replay_key, "1", nx=True, ex=(totp.interval * 2) + 5))
