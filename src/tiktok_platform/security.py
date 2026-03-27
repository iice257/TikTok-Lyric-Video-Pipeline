from __future__ import annotations

from datetime import timedelta
import hashlib
import hmac
import secrets


PBKDF2_PREFIX = "pbkdf2_sha256"
PBKDF2_ITERATIONS = 390000


def hash_password(password: str) -> str:
    salt = secrets.token_hex(16)
    digest = hashlib.pbkdf2_hmac("sha256", password.encode("utf-8"), salt.encode("utf-8"), PBKDF2_ITERATIONS)
    return f"{PBKDF2_PREFIX}${PBKDF2_ITERATIONS}${salt}${digest.hex()}"


def verify_password(password: str, encoded: str) -> bool:
    try:
        prefix, iterations_text, salt, digest = encoded.split("$", 3)
    except ValueError:
        return False
    if prefix != PBKDF2_PREFIX:
        return False
    candidate = hashlib.pbkdf2_hmac(
        "sha256",
        password.encode("utf-8"),
        salt.encode("utf-8"),
        int(iterations_text),
    ).hex()
    return hmac.compare_digest(candidate, digest)


def issue_session_token() -> str:
    return secrets.token_urlsafe(32)


def session_token_hash(token: str, secret: str) -> str:
    return hashlib.sha256(f"{secret}:{token}".encode("utf-8")).hexdigest()


def default_session_ttl() -> timedelta:
    return timedelta(days=7)
