from __future__ import annotations

from contextlib import asynccontextmanager
import os

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
import uvicorn

from tiktok_platform.db import SessionLocal, init_db
from tiktok_platform.services import encrypt_stored_oauth_tokens, ensure_admin_user, ensure_media_root
from tiktok_platform.settings import get_settings, validate_runtime_settings

from .routers import auth, dashboard, platform


@asynccontextmanager
async def lifespan(app: FastAPI):
    settings = get_settings()
    validate_runtime_settings(settings)
    init_db()
    ensure_media_root(settings)
    with SessionLocal() as db:
        ensure_admin_user(db, settings)
        encrypt_stored_oauth_tokens(db, settings)
    yield


def create_app() -> FastAPI:
    settings = get_settings()
    app = FastAPI(title="TikTok Lyric Automation Platform", version="0.1.0", lifespan=lifespan)
    app.add_middleware(
        CORSMiddleware,
        allow_origins=[settings.frontend_base_url],
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )
    app.include_router(auth.router)
    app.include_router(dashboard.router)
    app.include_router(platform.router)

    return app


app = create_app()


def main() -> None:
    port = int(os.getenv("API_PORT", os.getenv("PORT", "8000")))
    uvicorn.run("tiktok_platform_api.app:app", host="127.0.0.1", port=port, reload=False)


if __name__ == "__main__":
    main()
