from __future__ import annotations

import importlib
import io

from fastapi.testclient import TestClient


def build_test_client(tmp_path, monkeypatch) -> TestClient:
    monkeypatch.setenv("DATABASE_URL", f"sqlite:///{(tmp_path / 'platform.db').as_posix()}")
    monkeypatch.setenv("SESSION_SECRET", "test-secret")
    monkeypatch.setenv("ADMIN_EMAIL", "admin@example.com")
    monkeypatch.setenv("ADMIN_PASSWORD_HASH", "")
    monkeypatch.setenv("TIKTOK_CLIENT_KEY", "client-key")
    monkeypatch.setenv("TIKTOK_CLIENT_SECRET", "client-secret")
    monkeypatch.setenv("TIKTOK_REDIRECT_URI", "http://localhost:8000/integrations/tiktok/callback")
    monkeypatch.setenv("TIKTOK_SIMULATE_UPLOADS", "true")

    import tiktok_platform.settings as settings_module
    import tiktok_platform.db as db_module
    import tiktok_platform.models as models_module
    import tiktok_platform.services as services_module
    import tiktok_platform_api.dependencies as dependencies_module
    import tiktok_platform_api.routers.auth as auth_router_module
    import tiktok_platform_api.routers.dashboard as dashboard_router_module
    import tiktok_platform_api.routers.platform as platform_router_module
    import tiktok_platform_api.app as app_module

    settings_module.get_settings.cache_clear()
    for module in (
        settings_module,
        db_module,
        models_module,
        services_module,
        dependencies_module,
        auth_router_module,
        dashboard_router_module,
        platform_router_module,
        app_module,
    ):
        importlib.reload(module)

    db_module.init_db()
    with db_module.SessionLocal() as db:
        services_module.ensure_admin_user(db, settings_module.get_settings())

    app = app_module.create_app()
    return TestClient(app)


def test_health_and_login(tmp_path, monkeypatch) -> None:
    client = build_test_client(tmp_path, monkeypatch)

    health = client.get("/health")
    assert health.status_code == 200
    assert health.json()["status"] == "ok"

    login = client.post("/auth/login", json={"email": "admin@example.com", "password": "admin123"})
    assert login.status_code == 200
    body = login.json()
    assert body["user"]["email"] == "admin@example.com"
    assert "csrf_token" in body


def test_manual_intake_dedupes_by_audio_hash(tmp_path, monkeypatch) -> None:
    client = build_test_client(tmp_path, monkeypatch)
    login = client.post("/auth/login", json={"email": "admin@example.com", "password": "admin123"})
    csrf = login.json()["csrf_token"]

    files = {"audio": ("track-a.mp3", io.BytesIO(b"same-audio-binary"), "audio/mpeg")}
    first = client.post(
        "/manual-intake",
        data={"title": "Song", "artist": "Artist", "environment": "prod", "rights_status": "licensed"},
        files=files,
        headers={"x-csrf-token": csrf},
    )
    assert first.status_code == 200
    assert first.json().get("duplicate") is None

    duplicate = client.post(
        "/manual-intake",
        data={"title": "Song", "artist": "Artist", "environment": "prod", "rights_status": "licensed"},
        files={"audio": ("renamed.mp3", io.BytesIO(b"same-audio-binary"), "audio/mpeg")},
        headers={"x-csrf-token": csrf},
    )
    assert duplicate.status_code == 200
    assert duplicate.json()["duplicate"] is True
    assert duplicate.json()["song"]["id"] == first.json()["song"]["id"]

    media = client.get("/media", params={"path": first.json()["song"]["audio_path"]})
    assert media.status_code == 200
    assert media.content == b"same-audio-binary"


def test_tiktok_connect_returns_auth_url(tmp_path, monkeypatch) -> None:
    client = build_test_client(tmp_path, monkeypatch)
    login = client.post("/auth/login", json={"email": "admin@example.com", "password": "admin123"})
    csrf = login.json()["csrf_token"]

    response = client.post("/integrations/tiktok/connect", headers={"x-csrf-token": csrf})

    assert response.status_code == 200
    auth_url = response.json()["auth_url"]
    assert auth_url.startswith("https://www.tiktok.com/v2/auth/authorize/")
    assert "client_key=client-key" in auth_url
    assert "redirect_uri=http%3A%2F%2Flocalhost%3A8000%2Fintegrations%2Ftiktok%2Fcallback" in auth_url
    assert "video.publish%2Cvideo.upload" in auth_url
