from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime, timedelta
import mimetypes
from pathlib import Path
import secrets
from urllib.parse import urlencode

import httpx

from .db import ensure_utc, utcnow
from .models import OAuthToken
from .settings import PlatformSettings


AUTHORIZE_URL = "https://www.tiktok.com/v2/auth/authorize/"
TOKEN_URL = "https://open.tiktokapis.com/v2/oauth/token/"
REVOKE_URL = "https://open.tiktokapis.com/v2/oauth/revoke/"
CREATOR_INFO_URL = "https://open.tiktokapis.com/v2/post/publish/creator_info/query/"
DIRECT_POST_INIT_URL = "https://open.tiktokapis.com/v2/post/publish/video/init/"
INBOX_UPLOAD_INIT_URL = "https://open.tiktokapis.com/v2/post/publish/inbox/video/init/"
STATUS_FETCH_URL = "https://open.tiktokapis.com/v2/post/publish/status/fetch/"
DEFAULT_SCOPES = ("video.publish", "video.upload")


class TikTokApiError(RuntimeError):
    def __init__(self, message: str, *, payload: dict[str, object] | None = None) -> None:
        super().__init__(message)
        self.payload = payload or {}


@dataclass(slots=True)
class TikTokTokenBundle:
    subject: str
    access_token: str
    refresh_token: str | None
    scopes: list[str]
    expires_at: datetime | None
    raw_payload: dict[str, object]


class TikTokApiClient:
    def __init__(self, settings: PlatformSettings, timeout_seconds: float = 30.0) -> None:
        self.settings = settings
        self.timeout_seconds = timeout_seconds

    def new_state(self) -> str:
        return secrets.token_urlsafe(32)

    def build_authorize_url(self, state: str, scopes: tuple[str, ...] = DEFAULT_SCOPES) -> str:
        if not self.settings.tiktok_client_key or not self.settings.tiktok_redirect_uri:
            raise TikTokApiError("TikTok OAuth is not configured.")
        query = urlencode(
            {
                "client_key": self.settings.tiktok_client_key,
                "redirect_uri": self.settings.tiktok_redirect_uri,
                "response_type": "code",
                "scope": ",".join(scopes),
                "state": state,
            }
        )
        return f"{AUTHORIZE_URL}?{query}"

    def exchange_code(self, code: str) -> TikTokTokenBundle:
        payload = self._request_form(
            TOKEN_URL,
            {
                "client_key": self.settings.tiktok_client_key,
                "client_secret": self.settings.tiktok_client_secret,
                "code": code,
                "grant_type": "authorization_code",
                "redirect_uri": self.settings.tiktok_redirect_uri,
            },
        )
        return self._parse_token_bundle(payload)

    def refresh_token(self, refresh_token: str) -> TikTokTokenBundle:
        payload = self._request_form(
            TOKEN_URL,
            {
                "client_key": self.settings.tiktok_client_key,
                "client_secret": self.settings.tiktok_client_secret,
                "refresh_token": refresh_token,
                "grant_type": "refresh_token",
            },
        )
        return self._parse_token_bundle(payload)

    def revoke(self, access_token: str) -> None:
        self._request_form(
            REVOKE_URL,
            {
                "client_key": self.settings.tiktok_client_key,
                "client_secret": self.settings.tiktok_client_secret,
                "token": access_token,
            },
        )

    def ensure_fresh_token(self, token: OAuthToken) -> TikTokTokenBundle | None:
        expires_at = ensure_utc(token.expires_at)
        if expires_at is None or expires_at > utcnow() + timedelta(minutes=5):
            return None
        if not token.refresh_token:
            raise TikTokApiError("TikTok refresh token is missing.")
        return self.refresh_token(token.refresh_token)

    def query_creator_info(self, access_token: str) -> dict[str, object]:
        payload = self._request_json("POST", CREATOR_INFO_URL, access_token=access_token, json_payload={})
        return self._extract_data(payload)

    def init_direct_post(
        self,
        access_token: str,
        *,
        file_path: Path,
        title: str,
        privacy_level: str,
        disable_comment: bool,
        disable_duet: bool,
        disable_stitch: bool,
    ) -> dict[str, object]:
        payload = self._request_json(
            "POST",
            DIRECT_POST_INIT_URL,
            access_token=access_token,
            json_payload={
                "post_info": {
                    "title": title,
                    "privacy_level": privacy_level,
                    "disable_comment": disable_comment,
                    "disable_duet": disable_duet,
                    "disable_stitch": disable_stitch,
                },
                "source_info": self._file_source_info(file_path),
            },
        )
        return self._extract_data(payload)

    def init_inbox_upload(
        self,
        access_token: str,
        *,
        file_path: Path,
    ) -> dict[str, object]:
        payload = self._request_json(
            "POST",
            INBOX_UPLOAD_INIT_URL,
            access_token=access_token,
            json_payload={"source_info": self._file_source_info(file_path)},
        )
        return self._extract_data(payload)

    def upload_file(self, upload_url: str, file_path: Path) -> None:
        total_size = file_path.stat().st_size
        content_type = mimetypes.guess_type(file_path.name)[0] or "video/mp4"
        with file_path.open("rb") as handle:
            response = httpx.put(
                upload_url,
                content=handle.read(),
                headers={
                    "Content-Type": content_type,
                    "Content-Length": str(total_size),
                    "Content-Range": f"bytes 0-{max(total_size - 1, 0)}/{total_size}",
                },
                timeout=self.timeout_seconds,
            )
        if response.status_code >= 400:
            raise TikTokApiError(
                f"TikTok upload failed with status {response.status_code}.",
                payload={"response_text": response.text},
            )

    def fetch_post_status(self, access_token: str, publish_id: str) -> dict[str, object]:
        payload = self._request_json(
            "POST",
            STATUS_FETCH_URL,
            access_token=access_token,
            json_payload={"publish_id": publish_id},
        )
        return self._extract_data(payload)

    def _file_source_info(self, file_path: Path) -> dict[str, object]:
        return {
            "source": "FILE_UPLOAD",
            "video_size": file_path.stat().st_size,
            "chunk_size": file_path.stat().st_size,
            "total_chunk_count": 1,
        }

    def _parse_token_bundle(self, payload: dict[str, object]) -> TikTokTokenBundle:
        subject = str(payload.get("open_id") or payload.get("union_id") or "")
        access_token = str(payload.get("access_token") or "")
        if not subject or not access_token:
            raise TikTokApiError("TikTok OAuth response did not include subject and access token.", payload=payload)
        scopes_raw = str(payload.get("scope") or "")
        scopes = [scope.strip() for scope in scopes_raw.split(",") if scope.strip()]
        expires_in = payload.get("expires_in")
        expires_at = utcnow() + timedelta(seconds=int(expires_in)) if expires_in is not None else None
        return TikTokTokenBundle(
            subject=subject,
            access_token=access_token,
            refresh_token=str(payload.get("refresh_token")) if payload.get("refresh_token") else None,
            scopes=scopes,
            expires_at=expires_at,
            raw_payload=payload,
        )

    def _request_form(self, url: str, form_data: dict[str, object]) -> dict[str, object]:
        try:
            response = httpx.post(
                url,
                data=form_data,
                headers={"Content-Type": "application/x-www-form-urlencoded"},
                timeout=self.timeout_seconds,
            )
        except httpx.HTTPError as exc:
            raise TikTokApiError(f"TikTok request failed: {exc}") from exc
        payload = self._parse_json(response)
        if response.status_code >= 400:
            message = str(payload.get("error_description") or payload.get("message") or "TikTok request failed.")
            raise TikTokApiError(message, payload=payload)
        if payload.get("error"):
            raise TikTokApiError(str(payload.get("error_description") or payload.get("error")), payload=payload)
        return payload

    def _request_json(
        self,
        method: str,
        url: str,
        *,
        access_token: str,
        json_payload: dict[str, object],
    ) -> dict[str, object]:
        headers = {
            "Authorization": f"Bearer {access_token}",
            "Content-Type": "application/json; charset=UTF-8",
        }
        try:
            response = httpx.request(method, url, json=json_payload, headers=headers, timeout=self.timeout_seconds)
        except httpx.HTTPError as exc:
            raise TikTokApiError(f"TikTok request failed: {exc}") from exc
        payload = self._parse_json(response)
        if response.status_code >= 400:
            nested_error = payload.get("error") if isinstance(payload.get("error"), dict) else {}
            message = str(nested_error.get("message") or payload.get("message") or "TikTok request failed.")
            raise TikTokApiError(message, payload=payload)
        nested_error = payload.get("error")
        if isinstance(nested_error, dict) and nested_error.get("code") not in {None, "", "ok"}:
            raise TikTokApiError(str(nested_error.get("message") or nested_error.get("code")), payload=payload)
        return payload

    def _extract_data(self, payload: dict[str, object]) -> dict[str, object]:
        data = payload.get("data")
        if not isinstance(data, dict):
            raise TikTokApiError("TikTok response did not include a data payload.", payload=payload)
        return data

    def _parse_json(self, response: httpx.Response) -> dict[str, object]:
        try:
            payload = response.json()
        except ValueError as exc:
            raise TikTokApiError("TikTok returned a non-JSON response.", payload={"response_text": response.text}) from exc
        if not isinstance(payload, dict):
            raise TikTokApiError("TikTok returned an unexpected response payload.", payload={"payload": payload})
        return payload
