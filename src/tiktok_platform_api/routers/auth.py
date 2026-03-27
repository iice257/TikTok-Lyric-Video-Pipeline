from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, Request, Response, status
from pydantic import BaseModel
from sqlalchemy.orm import Session

from tiktok_platform.db import get_db
from tiktok_platform.services import authenticate_user, create_session, revoke_session
from tiktok_platform.settings import PlatformSettings

from ..dependencies import get_current_session, get_platform_settings


router = APIRouter(prefix="/auth", tags=["auth"])


class LoginRequest(BaseModel):
    email: str
    password: str


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
        max_age=60 * 60 * 24 * 7,
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
) -> dict[str, str]:
    _, session = payload
    revoke_session(db, session)
    response.delete_cookie("platform_session", path="/")
    return {"status": "logged_out"}


@router.get("/me")
def me(payload: tuple = Depends(get_current_session)) -> dict[str, object]:
    user, session = payload
    return {
        "user": {"id": user.id, "email": user.email, "role": user.role},
        "session": {"expires_at": session.expires_at.isoformat(), "csrf_token": session.csrf_token},
    }
