from __future__ import annotations

import importlib
import io
from urllib.parse import parse_qs, urlparse

from fastapi.testclient import TestClient
from tiktok_platform.tiktok_api import TikTokTokenBundle
from tiktok_platform.token_crypto import generate_token_encryption_key


def build_test_client(tmp_path, monkeypatch) -> TestClient:
    monkeypatch.setenv("DATABASE_URL", f"sqlite:///{(tmp_path / 'platform.db').as_posix()}")
    monkeypatch.setenv("SESSION_SECRET", "test-secret")
    monkeypatch.setenv("TOKEN_ENCRYPTION_KEY", generate_token_encryption_key())
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


def test_manual_intake_rejects_invalid_environment(tmp_path, monkeypatch) -> None:
    client = build_test_client(tmp_path, monkeypatch)
    login = client.post("/auth/login", json={"email": "admin@example.com", "password": "admin123"})
    csrf = login.json()["csrf_token"]

    response = client.post(
        "/manual-intake",
        data={"title": "Song", "artist": "Artist", "environment": "../prod", "rights_status": "licensed"},
        files={"audio": ("track-a.mp3", io.BytesIO(b"same-audio-binary"), "audio/mpeg")},
        headers={"x-csrf-token": csrf},
    )

    assert response.status_code == 400
    assert response.json()["detail"] == "Unsupported environment."


def test_manual_intake_rejects_unsupported_audio_extension(tmp_path, monkeypatch) -> None:
    client = build_test_client(tmp_path, monkeypatch)
    login = client.post("/auth/login", json={"email": "admin@example.com", "password": "admin123"})
    csrf = login.json()["csrf_token"]

    response = client.post(
        "/manual-intake",
        data={"title": "Song", "artist": "Artist", "environment": "prod", "rights_status": "licensed"},
        files={"audio": ("track.exe", io.BytesIO(b"not-audio"), "application/octet-stream")},
        headers={"x-csrf-token": csrf},
    )

    assert response.status_code == 400
    assert "Unsupported audio file extension" in response.json()["detail"]


def test_search_returns_song_matches(tmp_path, monkeypatch) -> None:
    client = build_test_client(tmp_path, monkeypatch)
    login = client.post("/auth/login", json={"email": "admin@example.com", "password": "admin123"})
    csrf = login.json()["csrf_token"]

    created = client.post(
        "/manual-intake",
        data={"title": "Midnight Signal", "artist": "Aster Grey", "environment": "prod", "rights_status": "licensed"},
        files={"audio": ("midnight-signal.mp3", io.BytesIO(b"audio"), "audio/mpeg")},
        headers={"x-csrf-token": csrf},
    )
    assert created.status_code == 200

    response = client.get("/search", params={"q": "Midnight", "limit": 5})

    assert response.status_code == 200
    body = response.json()
    assert body["strategy"] == "substring"
    assert [song["title"] for song in body["songs"]] == ["Midnight Signal"]


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


def test_tiktok_callback_persists_subject_and_scopes(tmp_path, monkeypatch) -> None:
    client = build_test_client(tmp_path, monkeypatch)
    login = client.post("/auth/login", json={"email": "admin@example.com", "password": "admin123"})
    csrf = login.json()["csrf_token"]

    connect = client.post("/integrations/tiktok/connect", headers={"x-csrf-token": csrf})
    assert connect.status_code == 200
    state = parse_qs(urlparse(connect.json()["auth_url"]).query)["state"][0]

    fake_bundle = TikTokTokenBundle(
        subject="open-id-123",
        access_token="access-token",
        refresh_token="refresh-token",
        scopes=["video.publish", "video.upload"],
        expires_at=None,
        raw_payload={},
    )

    monkeypatch.setattr("tiktok_platform.tiktok_api.TikTokApiClient.exchange_code", lambda self, code: fake_bundle)
    monkeypatch.setattr(
        "tiktok_platform.tiktok_api.TikTokApiClient.query_creator_info",
        lambda self, access_token: {"creator_username": "creator_test"},
    )

    callback = client.get("/integrations/tiktok/callback", params={"code": "oauth-code", "state": state})
    assert callback.status_code == 200

    status_resp = client.get("/integrations/tiktok/status")
    assert status_resp.status_code == 200
    integration = status_resp.json()["integration"]
    assert integration["connected"] is True
    assert integration["subject"] == "open-id-123"
    assert integration["scopes"] == ["video.publish", "video.upload"]

    import tiktok_platform.db as db_module
    import tiktok_platform.models as models_module

    with db_module.SessionLocal() as db:
        token = db.query(models_module.OAuthToken).filter_by(provider="tiktok").one()
        assert token.access_token.startswith("fernet:")
        assert token.refresh_token.startswith("fernet:")


def test_startup_encrypts_existing_plaintext_oauth_tokens(tmp_path, monkeypatch) -> None:
    client = build_test_client(tmp_path, monkeypatch)

    import tiktok_platform.db as db_module
    import tiktok_platform.models as models_module
    import tiktok_platform.services as services_module
    import tiktok_platform.settings as settings_module

    with db_module.SessionLocal() as db:
        token = models_module.OAuthToken(
            provider="tiktok",
            subject="open-id-plain",
            access_token="plain-access",
            refresh_token="plain-refresh",
            scopes_json=["video.upload"],
        )
        db.add(token)
        db.commit()

    with db_module.SessionLocal() as db:
        updated = services_module.encrypt_stored_oauth_tokens(db, settings_module.get_settings())
        token = db.query(models_module.OAuthToken).filter_by(subject="open-id-plain").one()
        assert updated == 1
        assert token.access_token.startswith("fernet:")
        assert token.refresh_token.startswith("fernet:")

    response = client.post("/auth/login", json={"email": "admin@example.com", "password": "admin123"})
    assert response.status_code == 200


def test_pause_resume_preserves_pipeline_settings(tmp_path, monkeypatch) -> None:
    client = build_test_client(tmp_path, monkeypatch)
    login = client.post("/auth/login", json={"email": "admin@example.com", "password": "admin123"})
    csrf = login.json()["csrf_token"]

    patched = client.patch(
        "/pipeline/settings",
        json={"upload_mode": "draft", "target_videos_min": 11, "target_videos_max": 13},
        headers={"x-csrf-token": csrf},
    )
    assert patched.status_code == 200

    paused = client.post("/pipeline/pause", headers={"x-csrf-token": csrf})
    assert paused.status_code == 200
    assert paused.json()["settings"]["paused"] is True
    assert paused.json()["settings"]["upload_mode"] == "draft"
    assert paused.json()["settings"]["target_videos_min"] == 11
    assert paused.json()["settings"]["target_videos_max"] == 13

    resumed = client.post("/pipeline/resume", headers={"x-csrf-token": csrf})
    assert resumed.status_code == 200
    assert resumed.json()["settings"]["paused"] is False
    assert resumed.json()["settings"]["upload_mode"] == "draft"
