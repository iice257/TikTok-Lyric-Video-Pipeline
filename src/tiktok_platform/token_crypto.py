from __future__ import annotations

from cryptography.fernet import Fernet, InvalidToken

from .settings import PlatformSettings


ENCRYPTED_PREFIX = "fernet:"


def generate_token_encryption_key() -> str:
    return Fernet.generate_key().decode("ascii")


def is_encrypted_secret(value: str | None) -> bool:
    return bool(value and value.startswith(ENCRYPTED_PREFIX))


def encrypt_secret(value: str | None, settings: PlatformSettings) -> str | None:
    if not value or is_encrypted_secret(value):
        return value
    if not settings.token_encryption_key:
        return value
    encrypted = Fernet(settings.token_encryption_key.encode("ascii")).encrypt(value.encode("utf-8"))
    return ENCRYPTED_PREFIX + encrypted.decode("ascii")


def decrypt_secret(value: str | None, settings: PlatformSettings) -> str | None:
    if not value or not is_encrypted_secret(value):
        return value
    if not settings.token_encryption_key:
        raise RuntimeError("TOKEN_ENCRYPTION_KEY is required to decrypt stored OAuth tokens.")
    payload = value.removeprefix(ENCRYPTED_PREFIX).encode("ascii")
    try:
        return Fernet(settings.token_encryption_key.encode("ascii")).decrypt(payload).decode("utf-8")
    except InvalidToken as exc:
        raise RuntimeError("Stored OAuth token could not be decrypted with TOKEN_ENCRYPTION_KEY.") from exc


def validate_token_encryption_key(value: str) -> bool:
    if not value:
        return False
    try:
        Fernet(value.encode("ascii"))
    except (ValueError, TypeError):
        return False
    return True
