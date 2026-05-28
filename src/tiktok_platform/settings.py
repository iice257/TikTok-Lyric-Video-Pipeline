from __future__ import annotations

from dataclasses import dataclass
from functools import lru_cache
import os
from pathlib import Path

WEAK_SESSION_SECRETS = {
    "",
    "change-me",
    "change-me-session-secret",
    "changeme",
    "secret",
    "default",
}


def _bool_env(name: str, default: bool) -> bool:
    value = os.getenv(name)
    if value is None:
        return default
    return value.strip().lower() in {"1", "true", "yes", "on"}


def _int_env(name: str, default: int) -> int:
    value = os.getenv(name)
    if value is None:
        return default
    try:
        return int(value)
    except ValueError:
        return default


@dataclass(slots=True)
class PlatformSettings:
    app_env: str
    app_base_url: str
    frontend_base_url: str
    database_url: str
    session_secret: str
    token_encryption_key: str
    media_root: Path
    admin_email: str
    admin_password_hash: str
    tiktok_client_key: str
    tiktok_client_secret: str
    tiktok_redirect_uri: str
    smtp_host: str
    smtp_port: int
    smtp_user: str
    smtp_pass: str
    alert_from_email: str
    lab_enabled: bool
    upload_mode: str
    simulate_uploads: bool
    pipeline_config_path: Path
    cookie_secure: bool
    cookie_samesite: str
    max_audio_upload_bytes: int
    max_cover_upload_bytes: int
    max_lyrics_upload_bytes: int

    @property
    def is_production(self) -> bool:
        return self.app_env.lower() == "prod"


@lru_cache(maxsize=1)
def get_settings() -> PlatformSettings:
    repo_root = Path(__file__).resolve().parents[2]
    default_db_path = repo_root / "output" / "platform.db"
    return PlatformSettings(
        app_env=os.getenv("APP_ENV", "dev"),
        app_base_url=os.getenv("APP_BASE_URL", "http://localhost:8000"),
        frontend_base_url=os.getenv("FRONTEND_BASE_URL", "http://localhost:3000"),
        database_url=os.getenv("DATABASE_URL", f"sqlite:///{default_db_path.as_posix()}"),
        session_secret=os.getenv("SESSION_SECRET", "change-me-session-secret"),
        token_encryption_key=os.getenv("TOKEN_ENCRYPTION_KEY", ""),
        media_root=Path(os.getenv("MEDIA_ROOT", str(repo_root / "storage"))).resolve(),
        admin_email=os.getenv("ADMIN_EMAIL", "admin@example.com"),
        admin_password_hash=os.getenv("ADMIN_PASSWORD_HASH", ""),
        tiktok_client_key=os.getenv("TIKTOK_CLIENT_KEY", ""),
        tiktok_client_secret=os.getenv("TIKTOK_CLIENT_SECRET", ""),
        tiktok_redirect_uri=os.getenv("TIKTOK_REDIRECT_URI", ""),
        smtp_host=os.getenv("SMTP_HOST", ""),
        smtp_port=int(os.getenv("SMTP_PORT", "587")),
        smtp_user=os.getenv("SMTP_USER", ""),
        smtp_pass=os.getenv("SMTP_PASS", ""),
        alert_from_email=os.getenv("ALERT_FROM_EMAIL", "alerts@example.com"),
        lab_enabled=_bool_env("LAB_ENABLED", True),
        upload_mode=os.getenv("UPLOAD_MODE", "hybrid"),
        simulate_uploads=_bool_env("TIKTOK_SIMULATE_UPLOADS", True),
        pipeline_config_path=Path(
            os.getenv("PIPELINE_CONFIG_PATH", str(repo_root / "config" / "pipeline.example.json"))
        ).resolve(),
        cookie_secure=_bool_env("COOKIE_SECURE", False),
        cookie_samesite=os.getenv("COOKIE_SAME_SITE", "lax").strip().lower(),
        max_audio_upload_bytes=_int_env("MAX_AUDIO_UPLOAD_MB", 250) * 1024 * 1024,
        max_cover_upload_bytes=_int_env("MAX_COVER_UPLOAD_MB", 15) * 1024 * 1024,
        max_lyrics_upload_bytes=_int_env("MAX_LYRICS_UPLOAD_MB", 5) * 1024 * 1024,
    )


def _is_weak_session_secret(secret: str) -> bool:
    normalized = secret.strip().lower()
    return normalized in WEAK_SESSION_SECRETS or len(secret.strip()) < 32


def validate_runtime_settings(settings: PlatformSettings) -> None:
    from .token_crypto import validate_token_encryption_key

    if settings.upload_mode not in {"hybrid", "draft", "direct"}:
        raise RuntimeError("Invalid settings: UPLOAD_MODE must be one of hybrid, draft, direct.")
    if settings.cookie_samesite not in {"lax", "strict", "none"}:
        raise RuntimeError("Invalid settings: COOKIE_SAME_SITE must be one of lax, strict, none.")
    if not settings.is_production:
        return
    issues: list[str] = []
    if settings.database_url.startswith("sqlite"):
        issues.append("DATABASE_URL must point to Postgres in production.")
    if _is_weak_session_secret(settings.session_secret):
        issues.append("SESSION_SECRET must be a strong non-placeholder value with at least 32 characters in production.")
    if not validate_token_encryption_key(settings.token_encryption_key):
        issues.append("TOKEN_ENCRYPTION_KEY must be set to a valid Fernet key in production.")
    if not settings.admin_password_hash:
        issues.append("ADMIN_PASSWORD_HASH must be set in production.")
    if settings.simulate_uploads:
        issues.append("TIKTOK_SIMULATE_UPLOADS must be false in production.")
    if not settings.cookie_secure:
        issues.append("COOKIE_SECURE must be true in production.")
    if issues:
        raise RuntimeError("Invalid production settings: " + " ".join(issues))
