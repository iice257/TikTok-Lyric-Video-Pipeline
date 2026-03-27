from __future__ import annotations

from fastapi import Depends, Request
from sqlalchemy.orm import Session

from tiktok_platform.db import get_db
from tiktok_platform.models import SessionRecord, User
from tiktok_platform.services import require_authenticated_session, require_csrf
from tiktok_platform.settings import PlatformSettings, get_settings


def get_platform_settings() -> PlatformSettings:
    return get_settings()


def get_current_session(
    request: Request,
    db: Session = Depends(get_db),
    settings: PlatformSettings = Depends(get_platform_settings),
) -> tuple[User, SessionRecord]:
    return require_authenticated_session(db, settings, request)


def get_current_user(
    payload: tuple[User, SessionRecord] = Depends(get_current_session),
) -> User:
    user, _ = payload
    return user


def require_mutation_auth(
    request: Request,
    payload: tuple[User, SessionRecord] = Depends(get_current_session),
) -> User:
    user, session = payload
    require_csrf(request, session)
    return user
