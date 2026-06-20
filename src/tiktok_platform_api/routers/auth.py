from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, Request, Response, status
from pydantic import BaseModel, Field, field_validator
from sqlalchemy.orm import Session

from tiktok_platform.db import get_db
from tiktok_platform.security import default_session_ttl
from tiktok_platform.services import authenticate_user, create_session, revoke_session
from tiktok_platform.settings import PlatformSettings

from ..dependencies import get_current_session, get_platform_settings


router = APIRouter(prefix="/auth", tags=["auth"])


class LoginRequest(BaseModel):
    email: str = Field(min_length=3, max_length=254)
    password: str = Field(min_length=1, max_length=1024)

    @field_validator("email")
    @classmethod
    def normalize_login_identifier(cls, value: str) -> str:
        normalized = value.strip().lower()
        if not normalized:
            raise ValueError("Admin ID is required.")
        return normalized


@router.post("/login")
def login(
    payload: LoginRequest,
    request: Request,
    response: Response,
    db: Session = Depends(get_db),
    settings: PlatformSettings = Depends(get_platform_settings),
) -> dict[str, object]:
    user = authenticate_user(db, settings, payload.email, payload.password)
    if not user:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid credentials.")
    session, raw_token = create_session(db, user, settings, request)
    response.set_cookie(
        "platform_session",
        raw_token,
        httponly=True,
        secure=settings.cookie_secure,
        samesite=settings.cookie_samesite,
        max_age=int(default_session_ttl().total_seconds()),
        path="/",
    )
    return {
        "user": {"id": user.id, "email": user.email, "role": user.role},
        "csrf_token": session.csrf_token,
    }


@router.post("/logout")
def logout(
    response: Response,
    payload: tuple = Depends(get_current_session),
    db: Session = Depends(get_db),
    settings: PlatformSettings = Depends(get_platform_settings),
) -> dict[str, str]:
    _, session = payload
    revoke_session(db, session)
    response.delete_cookie(
        "platform_session",
        path="/",
        secure=settings.cookie_secure,
        httponly=True,
        samesite=settings.cookie_samesite,
    )
    return {"status": "logged_out"}


@router.get("/me")
def me(payload: tuple = Depends(get_current_session)) -> dict[str, object]:
    user, session = payload
    return {
        "user": {"id": user.id, "email": user.email, "role": user.role},
        "session": {"expires_at": session.expires_at.isoformat(), "csrf_token": session.csrf_token},
    }
