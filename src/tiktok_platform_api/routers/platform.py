from __future__ import annotations

from datetime import datetime
import re
import shutil
from uuid import uuid4

from fastapi import APIRouter, Depends, File, Form, HTTPException, Query, Request, UploadFile, status
from fastapi.responses import FileResponse, HTMLResponse
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.orm import Session

from tiktok_platform.db import get_db, utcnow
from tiktok_platform.models import (
    Alert,
    Clip,
    LyricsArtifact,
    OperatorAction,
    RenderJob,
    SegmentCandidate,
    Song,
    SongInput,
    StateEvent,
    UploadJob,
    WorkerHeartbeat,
)
from tiktok_platform.services import (
    create_alert,
    ensure_media_root,
    get_setting,
    get_oauth_token,
    guess_extension,
    log_operator_action,
    persist_upload_file,
    record_state_event,
    resolve_managed_path,
    serialize_alert,
    serialize_clip,
    serialize_operator_action,
    serialize_render_job,
    serialize_song,
    serialize_state_event,
    serialize_upload_job,
    serialize_worker,
    set_setting,
    upsert_oauth_token,
)
from tiktok_platform.settings import PlatformSettings
from tiktok_platform.tiktok_api import DEFAULT_SCOPES, TikTokApiClient, TikTokApiError

from ..dependencies import get_current_user, get_platform_settings, require_mutation_auth


router = APIRouter(tags=["platform"])


class ClipPatchRequest(BaseModel):
    caption: str | None = None
    hook_category: str | None = None
    scheduled_at: datetime | None = None


class JobActionRequest(BaseModel):
    reason: str | None = None


class UploadActionRequest(BaseModel):
    scheduled_at: datetime | None = None


class SettingsPatchRequest(BaseModel):
    paused: bool | None = None
    upload_mode: str | None = None
    target_videos_min: int | None = None
    target_videos_max: int | None = None


class TikTokPreferencesPatchRequest(BaseModel):
    preferred_privacy_level: str | None = None
    allow_comment: bool | None = None
    allow_duet: bool | None = None
    allow_stitch: bool | None = None


def _default_tiktok_preferences() -> dict[str, object]:
    return {
        "preferred_privacy_level": "SELF_ONLY",
        "allow_comment": False,
        "allow_duet": False,
        "allow_stitch": False,
    }


ALLOWED_ENVIRONMENTS = {"prod", "lab"}
ALLOWED_RIGHTS_STATUSES = {"licensed", "tiktok_cml", "approved_tiktok", "metadata_only", "pending_review"}


def _creator_info_cache(db: Session) -> dict[str, object]:
    return get_setting(db, "tiktok_creator_info_cache", {})


def _safe_path_component(value: str, *, fallback: str) -> str:
    cleaned = re.sub(r"[^A-Za-z0-9 _.-]+", "", value).strip().strip(".")
    cleaned = re.sub(r"\s+", " ", cleaned)
    return cleaned or fallback


def _serialize_tiktok_status(db: Session, settings: PlatformSettings) -> dict[str, object]:
    token = get_oauth_token(db, "tiktok")
    creator_cache = _creator_info_cache(db)
    creator_info = creator_cache.get("data") if isinstance(creator_cache.get("data"), dict) else None
    scopes = token.scopes_json if token else []
    return {
        "configured": bool(settings.tiktok_client_key and settings.tiktok_client_secret and settings.tiktok_redirect_uri),
        "connected": token is not None,
        "subject": token.subject if token else None,
        "expires_at": token.expires_at.isoformat() if token and token.expires_at else None,
        "scopes": scopes,
        "preferences": get_setting(db, "tiktok_preferences", _default_tiktok_preferences()),
        "creator_info": creator_info,
        "creator_info_fetched_at": creator_cache.get("fetched_at"),
        "last_error": creator_cache.get("last_error"),
        "upload_mode": settings.upload_mode,
        "simulate_uploads": settings.simulate_uploads,
        "required_scopes": list(DEFAULT_SCOPES),
    }


def _build_tiktok_client(settings: PlatformSettings) -> TikTokApiClient:
    if not settings.tiktok_client_key or not settings.tiktok_client_secret or not settings.tiktok_redirect_uri:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="TikTok OAuth settings are incomplete.")
    return TikTokApiClient(settings)


def _job_payload(job: RenderJob | UploadJob) -> dict[str, object]:
    if isinstance(job, RenderJob):
        return serialize_render_job(job)
    return serialize_upload_job(job)


def _mutate_job_status(
    db: Session,
    *,
    subject: RenderJob | UploadJob,
    new_status: str,
    actor_user_id: str,
    request: Request,
    reason: str | None,
) -> dict[str, object]:
    _validate_job_transition(subject, new_status)
    old_status = subject.status
    subject.status = new_status
    subject.claimed_by = None
    subject.claimed_at = None
    subject.lease_expires_at = None
    if new_status in {"failed", "cancelled", "quarantined", "posted"}:
        subject.completed_at = utcnow()
    db.add(subject)
    record_state_event(
        db,
        subject_type="upload_job" if isinstance(subject, UploadJob) else "render_job",
        subject_id=subject.id,
        event_type="status_change",
        from_state=old_status,
        to_state=new_status,
        payload={"reason": reason or ""},
        actor_user_id=actor_user_id,
    )
    log_operator_action(
        db,
        user_id=actor_user_id,
        action=f"{new_status}_job",
        target_type="upload_job" if isinstance(subject, UploadJob) else "render_job",
        target_id=subject.id,
        request=request,
        details={"reason": reason or ""},
    )
    db.commit()
    db.refresh(subject)
    return _job_payload(subject)


def _validate_job_transition(subject: RenderJob | UploadJob, new_status: str) -> None:
    terminal_states = {"posted", "cancelled", "quarantined"}
    if subject.status == "posted":
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Posted jobs cannot be mutated.")
    if isinstance(subject, RenderJob) and new_status == "posted":
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Render jobs cannot transition to posted.")
    if subject.status in terminal_states and new_status == subject.status:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Job is already in that terminal state.")


@router.get("/integrations/tiktok/status")
def get_tiktok_status(
    _: object = Depends(get_current_user),
    db: Session = Depends(get_db),
    settings: PlatformSettings = Depends(get_platform_settings),
) -> dict[str, object]:
    return {"integration": _serialize_tiktok_status(db, settings)}


@router.post("/integrations/tiktok/connect")
def connect_tiktok(
    request: Request,
    user: object = Depends(require_mutation_auth),
    db: Session = Depends(get_db),
    settings: PlatformSettings = Depends(get_platform_settings),
) -> dict[str, object]:
    client = _build_tiktok_client(settings)
    state = client.new_state()
    set_setting(
        db,
        "tiktok_oauth_state",
        {
            "value": state,
            "requested_at": utcnow().isoformat(),
            "requested_by_id": user.id,
            "scopes": list(DEFAULT_SCOPES),
        },
    )
    log_operator_action(
        db,
        user_id=user.id,
        action="connect_tiktok",
        target_type="integration",
        target_id="tiktok",
        request=request,
        details={"scopes": list(DEFAULT_SCOPES)},
    )
    db.commit()
    return {"auth_url": client.build_authorize_url(state, DEFAULT_SCOPES)}


@router.get("/integrations/tiktok/callback", response_class=HTMLResponse)
def tiktok_callback(
    code: str | None = None,
    state: str | None = None,
    error: str | None = None,
    error_description: str | None = None,
    db: Session = Depends(get_db),
    settings: PlatformSettings = Depends(get_platform_settings),
) -> HTMLResponse:
    if error:
        return HTMLResponse(
            f"<html><body><h1>TikTok connection failed</h1><p>{error_description or error}</p></body></html>",
            status_code=status.HTTP_400_BAD_REQUEST,
        )
    expected = get_setting(db, "tiktok_oauth_state", {})
    if not code or not state or state != expected.get("value"):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="TikTok OAuth state did not match.")
    client = _build_tiktok_client(settings)
    try:
        bundle = client.exchange_code(code)
        upsert_oauth_token(
            db,
            provider="tiktok",
            subject=bundle.subject,
            access_token=bundle.access_token,
            refresh_token=bundle.refresh_token,
            scopes=bundle.scopes,
            expires_at=bundle.expires_at,
        )
    except TikTokApiError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc
    creator_info = client.query_creator_info(bundle.access_token)
    set_setting(
        db,
        "tiktok_creator_info_cache",
        {"data": creator_info, "fetched_at": utcnow().isoformat(), "last_error": None},
    )
    set_setting(db, "tiktok_oauth_state", {"state": None, "updated_at": utcnow().isoformat()})
    return HTMLResponse(
        """
        <html>
          <body style="font-family:Segoe UI,sans-serif;padding:24px;background:#f4efe7;color:#1f1d1b;">
            <h1 style="margin:0 0 12px;">TikTok account connected</h1>
            <p style="margin:0 0 12px;">Return to the control panel. This tab can be closed.</p>
            <script>
              if (window.opener) {
                window.opener.location.reload();
              }
              setTimeout(function () { window.close(); }, 400);
            </script>
          </body>
        </html>
        """
    )


@router.post("/integrations/tiktok/disconnect")
def disconnect_tiktok(
    request: Request,
    user: object = Depends(require_mutation_auth),
    db: Session = Depends(get_db),
    settings: PlatformSettings = Depends(get_platform_settings),
) -> dict[str, object]:
    token = get_oauth_token(db, "tiktok")
    if token is not None:
        try:
            _build_tiktok_client(settings).revoke(token.access_token)
        except (HTTPException, TikTokApiError):
            pass
        db.delete(token)
        db.commit()
    set_setting(db, "tiktok_creator_info_cache", {})
    log_operator_action(
        db,
        user_id=user.id,
        action="disconnect_tiktok",
        target_type="integration",
        target_id="tiktok",
        request=request,
        details={"subject": token.subject if token else None},
    )
    db.commit()
    return {"disconnected": True}


@router.patch("/integrations/tiktok/preferences")
def patch_tiktok_preferences(
    payload: TikTokPreferencesPatchRequest,
    request: Request,
    user: object = Depends(require_mutation_auth),
    db: Session = Depends(get_db),
    settings: PlatformSettings = Depends(get_platform_settings),
) -> dict[str, object]:
    merged = {**get_setting(db, "tiktok_preferences", _default_tiktok_preferences()), **payload.model_dump(exclude_none=True), "updated_at": utcnow().isoformat()}
    record = set_setting(db, "tiktok_preferences", merged)
    log_operator_action(
        db,
        user_id=user.id,
        action="patch_tiktok_preferences",
        target_type="integration",
        target_id="tiktok",
        request=request,
        details=payload.model_dump(exclude_none=True),
    )
    db.commit()
    return {"preferences": record.value_json}


@router.get("/songs")
def list_songs(
    _: object = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> dict[str, object]:
    songs = db.scalars(select(Song).order_by(Song.updated_at.desc())).all()
    return {"songs": [serialize_song(song) for song in songs]}


@router.get("/media")
def get_media(
    path: str = Query(...),
    _: object = Depends(get_current_user),
    settings: PlatformSettings = Depends(get_platform_settings),
) -> FileResponse:
    target = resolve_managed_path(settings, path)
    return FileResponse(target, filename=target.name)


@router.get("/songs/{song_id}")
def get_song(
    song_id: str,
    _: object = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> dict[str, object]:
    song = db.get(Song, song_id)
    if not song:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Song not found.")
    lyrics = db.scalars(select(LyricsArtifact).where(LyricsArtifact.song_id == song_id).order_by(LyricsArtifact.created_at.desc())).all()
    segments = db.scalars(select(SegmentCandidate).where(SegmentCandidate.song_id == song_id).order_by(SegmentCandidate.rank.asc())).all()
    clips = db.scalars(select(Clip).where(Clip.song_id == song_id).order_by(Clip.created_at.desc())).all()
    return {
        "song": serialize_song(song),
        "lyrics_artifacts": [
            {
                "id": item.id,
                "source_format": item.source_format,
                "source_name": item.source_name,
                "source_ref": item.source_ref,
                "status": item.status,
                "was_aligned": item.was_aligned,
                "confidence": item.confidence,
                "line_count": item.line_count,
                "created_at": item.created_at.isoformat(),
            }
            for item in lyrics
        ],
        "segment_candidates": [
            {
                "id": item.id,
                "start_second": item.start_second,
                "end_second": item.end_second,
                "score": item.score,
                "reason": item.reason,
                "caption_seed": item.caption_seed,
                "selected": item.selected,
                "rank": item.rank,
            }
            for item in segments
        ],
        "clips": [serialize_clip(clip) for clip in clips],
    }


@router.post("/manual-intake")
def manual_intake(
    request: Request,
    title: str = Form(...),
    artist: str = Form(...),
    rights_status: str = Form("licensed"),
    environment: str = Form("prod"),
    audio: UploadFile = File(...),
    cover: UploadFile | None = File(None),
    lyrics: UploadFile | None = File(None),
    user: object = Depends(require_mutation_auth),
    db: Session = Depends(get_db),
    settings: PlatformSettings = Depends(get_platform_settings),
) -> dict[str, object]:
    if environment not in ALLOWED_ENVIRONMENTS:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Unsupported environment.")
    if rights_status not in ALLOWED_RIGHTS_STATUSES:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Unsupported rights status.")

    media_root = ensure_media_root(settings) / "manual-intake" / environment
    song_key = uuid4().hex
    stem = f"{_safe_path_component(artist, fallback='Unknown Artist')} - {_safe_path_component(title, fallback='Untitled')}"
    audio_ext = guess_extension(audio.filename or "audio.mp3", ".mp3")
    audio_path = media_root / song_key / f"{stem}{audio_ext}"
    audio_meta = persist_upload_file(audio, audio_path)
    cover_path = None
    lyrics_path = None
    if cover is not None:
        cover_ext = guess_extension(cover.filename or "cover.jpg", ".jpg")
        cover_path = media_root / song_key / f"{stem}{cover_ext}"
        persist_upload_file(cover, cover_path)
    if lyrics is not None:
        lyrics_ext = guess_extension(lyrics.filename or "lyrics.lrc", ".lrc")
        lyrics_path = media_root / song_key / f"{stem}{lyrics_ext}"
        persist_upload_file(lyrics, lyrics_path)

    ingest_fingerprint = f"sha256:{audio_meta['sha256']}:{environment}"
    duplicate = db.scalar(select(Song).where(Song.ingest_fingerprint == ingest_fingerprint))
    if duplicate:
        shutil.rmtree(media_root / song_key, ignore_errors=True)
        return {"song": serialize_song(duplicate), "duplicate": True}

    publish_eligible = environment == "prod" and rights_status in {"licensed", "tiktok_cml", "approved_tiktok"}
    song = Song(
        song_key=song_key,
        title=title,
        artist=artist,
        source_type="manual",
        provider_name="manual-intake",
        environment=environment,
        rights_status=rights_status,
        status="ingested",
        review_status="pending",
        publish_eligible=publish_eligible,
        manual_priority=True,
        ingest_fingerprint=ingest_fingerprint,
        audio_path=str(audio_path),
        cover_path=str(cover_path) if cover_path else None,
        lyrics_path=str(lyrics_path) if lyrics_path else None,
        metadata_json={
            "original_audio_name": audio.filename,
            "audio_sha256": audio_meta["sha256"],
            "audio_size_bytes": audio_meta["size_bytes"],
            "audio_content_type": audio.content_type,
        },
    )
    db.add(song)
    db.flush()
    db.add(
        SongInput(
            song_id=song.id,
            source_type="manual",
            provider_name="manual-intake",
            file_path=str(audio_path),
            raw_payload_json={"cover_path": str(cover_path) if cover_path else None, "lyrics_path": str(lyrics_path) if lyrics_path else None},
        )
    )
    record_state_event(
        db,
        subject_type="song",
        subject_id=song.id,
        event_type="ingested",
        from_state=None,
        to_state=song.status,
        payload={"environment": environment, "rights_status": rights_status},
        actor_user_id=user.id,
    )
    log_operator_action(
        db,
        user_id=user.id,
        action="manual_intake",
        target_type="song",
        target_id=song.id,
        request=request,
        details={"title": title, "artist": artist, "environment": environment},
    )
    db.commit()
    db.refresh(song)
    return {"song": serialize_song(song)}


@router.get("/clips")
def list_clips(
    _: object = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> dict[str, object]:
    clips = db.scalars(select(Clip).order_by(Clip.updated_at.desc())).all()
    return {"clips": [serialize_clip(clip) for clip in clips]}


@router.get("/clips/{clip_id}")
def get_clip(
    clip_id: str,
    _: object = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> dict[str, object]:
    clip = db.get(Clip, clip_id)
    if not clip:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Clip not found.")
    render_jobs = db.scalars(select(RenderJob).where(RenderJob.clip_id == clip_id).order_by(RenderJob.created_at.desc())).all()
    upload_jobs = db.scalars(select(UploadJob).where(UploadJob.clip_id == clip_id).order_by(UploadJob.created_at.desc())).all()
    segment = db.get(SegmentCandidate, clip.segment_candidate_id)
    events = db.scalars(
        select(StateEvent).where(
            (StateEvent.subject_type == "clip") & (StateEvent.subject_id == clip_id)
        ).order_by(StateEvent.created_at.desc())
    ).all()
    job_ids = [job.id for job in render_jobs] + [job.id for job in upload_jobs]
    if job_ids:
        events.extend(
            db.scalars(
                select(StateEvent).where(StateEvent.subject_id.in_(job_ids)).order_by(StateEvent.created_at.desc())
            ).all()
        )
    events = sorted(events, key=lambda item: item.created_at, reverse=True)
    return {
        "clip": serialize_clip(clip),
        "segment": {
            "id": segment.id,
            "start_second": segment.start_second,
            "end_second": segment.end_second,
            "score": segment.score,
            "reason": segment.reason,
            "caption_seed": segment.caption_seed,
        } if segment else None,
        "render_jobs": [serialize_render_job(job) for job in render_jobs],
        "upload_jobs": [serialize_upload_job(job) for job in upload_jobs],
        "state_events": [serialize_state_event(event) for event in events[:30]],
    }


@router.patch("/clips/{clip_id}")
def patch_clip(
    clip_id: str,
    payload: ClipPatchRequest,
    request: Request,
    user: object = Depends(require_mutation_auth),
    db: Session = Depends(get_db),
) -> dict[str, object]:
    clip = db.get(Clip, clip_id)
    if not clip:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Clip not found.")
    if payload.caption is not None:
        clip.caption = payload.caption
    if payload.hook_category is not None:
        clip.hook_category = payload.hook_category
    if payload.scheduled_at is not None:
        clip.scheduled_at = payload.scheduled_at
        for upload_job in db.scalars(select(UploadJob).where(UploadJob.clip_id == clip.id)).all():
            upload_job.scheduled_at = payload.scheduled_at
            upload_job.status = "waiting_window" if payload.scheduled_at > utcnow() else "queued"
            db.add(upload_job)
    db.add(clip)
    log_operator_action(
        db,
        user_id=user.id,
        action="patch_clip",
        target_type="clip",
        target_id=clip.id,
        request=request,
        details=payload.model_dump(exclude_none=True),
    )
    db.commit()
    db.refresh(clip)
    return {"clip": serialize_clip(clip)}


@router.post("/clips/{clip_id}/rerender")
def rerender_clip(
    clip_id: str,
    request: Request,
    user: object = Depends(require_mutation_auth),
    db: Session = Depends(get_db),
) -> dict[str, object]:
    clip = db.get(Clip, clip_id)
    if not clip:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Clip not found.")
    clip.status = "queued_for_render"
    clip.last_error = None
    db.add(clip)
    render_job = RenderJob(
        clip_id=clip.id,
        status="queued",
        idempotency_key=f"rerender-{clip.id}-{uuid4().hex}",
    )
    db.add(render_job)
    record_state_event(
        db,
        subject_type="render_job",
        subject_id=render_job.id,
        event_type="rerender_requested",
        from_state=None,
        to_state="queued",
        payload={"clip_id": clip.id},
        actor_user_id=user.id,
    )
    log_operator_action(
        db,
        user_id=user.id,
        action="rerender_clip",
        target_type="clip",
        target_id=clip.id,
        request=request,
        details={"render_job_id": render_job.id},
    )
    db.commit()
    db.refresh(render_job)
    return {"render_job": serialize_render_job(render_job)}


@router.get("/jobs")
def list_jobs(
    _: object = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> dict[str, object]:
    render_jobs = db.scalars(select(RenderJob).order_by(RenderJob.updated_at.desc()).limit(100)).all()
    upload_jobs = db.scalars(select(UploadJob).order_by(UploadJob.updated_at.desc()).limit(100)).all()
    jobs = sorted(
        [serialize_render_job(job) for job in render_jobs] + [serialize_upload_job(job) for job in upload_jobs],
        key=lambda item: item["updated_at"],
        reverse=True,
    )
    return {"jobs": jobs}


@router.get("/jobs/{job_id}")
def get_job(
    job_id: str,
    _: object = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> dict[str, object]:
    render_job = db.get(RenderJob, job_id)
    if render_job:
        return {"job": serialize_render_job(render_job)}
    upload_job = db.get(UploadJob, job_id)
    if upload_job:
        return {"job": serialize_upload_job(upload_job)}
    raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Job not found.")


@router.post("/jobs/{job_id}/retry")
def retry_job(
    job_id: str,
    payload: JobActionRequest,
    request: Request,
    user: object = Depends(require_mutation_auth),
    db: Session = Depends(get_db),
) -> dict[str, object]:
    render_job = db.get(RenderJob, job_id)
    if render_job:
        render_job.attempt_count += 1
        return {"job": _mutate_job_status(db, subject=render_job, new_status="queued", actor_user_id=user.id, request=request, reason=payload.reason)}
    upload_job = db.get(UploadJob, job_id)
    if upload_job:
        upload_job.attempt_count += 1
        return {"job": _mutate_job_status(db, subject=upload_job, new_status="queued", actor_user_id=user.id, request=request, reason=payload.reason)}
    raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Job not found.")


@router.post("/jobs/{job_id}/cancel")
def cancel_job(
    job_id: str,
    payload: JobActionRequest,
    request: Request,
    user: object = Depends(require_mutation_auth),
    db: Session = Depends(get_db),
) -> dict[str, object]:
    render_job = db.get(RenderJob, job_id)
    if render_job:
        return {"job": _mutate_job_status(db, subject=render_job, new_status="cancelled", actor_user_id=user.id, request=request, reason=payload.reason)}
    upload_job = db.get(UploadJob, job_id)
    if upload_job:
        return {"job": _mutate_job_status(db, subject=upload_job, new_status="cancelled", actor_user_id=user.id, request=request, reason=payload.reason)}
    raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Job not found.")


@router.post("/jobs/{job_id}/quarantine")
def quarantine_job(
    job_id: str,
    payload: JobActionRequest,
    request: Request,
    user: object = Depends(require_mutation_auth),
    db: Session = Depends(get_db),
) -> dict[str, object]:
    render_job = db.get(RenderJob, job_id)
    if render_job:
        return {"job": _mutate_job_status(db, subject=render_job, new_status="quarantined", actor_user_id=user.id, request=request, reason=payload.reason)}
    upload_job = db.get(UploadJob, job_id)
    if upload_job:
        return {"job": _mutate_job_status(db, subject=upload_job, new_status="quarantined", actor_user_id=user.id, request=request, reason=payload.reason)}
    raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Job not found.")


@router.get("/upload-jobs")
def list_upload_jobs(
    _: object = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> dict[str, object]:
    jobs = db.scalars(select(UploadJob).order_by(UploadJob.scheduled_at.asc())).all()
    return {"upload_jobs": [serialize_upload_job(job) for job in jobs]}


@router.post("/upload-jobs/{job_id}/approve")
def approve_upload_job(
    job_id: str,
    request: Request,
    user: object = Depends(require_mutation_auth),
    db: Session = Depends(get_db),
) -> dict[str, object]:
    job = db.get(UploadJob, job_id)
    if not job:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Upload job not found.")
    job.approved_at = utcnow()
    job.approved_by_id = user.id
    if job.status == "quarantined":
        job.status = "queued"
    db.add(job)
    log_operator_action(db, user_id=user.id, action="approve_upload_job", target_type="upload_job", target_id=job.id, request=request, details={})
    db.commit()
    db.refresh(job)
    return {"upload_job": serialize_upload_job(job)}


@router.post("/upload-jobs/{job_id}/reschedule")
def reschedule_upload_job(
    job_id: str,
    payload: UploadActionRequest,
    request: Request,
    user: object = Depends(require_mutation_auth),
    db: Session = Depends(get_db),
) -> dict[str, object]:
    job = db.get(UploadJob, job_id)
    if not job:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Upload job not found.")
    if payload.scheduled_at is None:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="scheduled_at is required.")
    job.scheduled_at = payload.scheduled_at
    job.status = "waiting_window"
    db.add(job)
    log_operator_action(
        db,
        user_id=user.id,
        action="reschedule_upload_job",
        target_type="upload_job",
        target_id=job.id,
        request=request,
        details={"scheduled_at": payload.scheduled_at.isoformat()},
    )
    db.commit()
    db.refresh(job)
    return {"upload_job": serialize_upload_job(job)}


@router.post("/upload-jobs/{job_id}/force-publish")
def force_publish_upload_job(
    job_id: str,
    request: Request,
    user: object = Depends(require_mutation_auth),
    db: Session = Depends(get_db),
) -> dict[str, object]:
    job = db.get(UploadJob, job_id)
    if not job:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Upload job not found.")
    job.scheduled_at = utcnow()
    job.approved_at = utcnow()
    job.approved_by_id = user.id
    job.status = "queued"
    db.add(job)
    log_operator_action(db, user_id=user.id, action="force_publish_upload_job", target_type="upload_job", target_id=job.id, request=request, details={})
    db.commit()
    db.refresh(job)
    return {"upload_job": serialize_upload_job(job)}


@router.post("/pipeline/pause")
def pause_pipeline(
    request: Request,
    user: object = Depends(require_mutation_auth),
    db: Session = Depends(get_db),
) -> dict[str, object]:
    existing = get_setting(db, "pipeline", {"paused": False})
    record = set_setting(db, "pipeline", {**existing, "paused": True, "updated_at": utcnow().isoformat()})
    log_operator_action(db, user_id=user.id, action="pause_pipeline", target_type="pipeline", target_id=record.key, request=request, details={"paused": True})
    db.commit()
    return {"settings": record.value_json}


@router.post("/pipeline/resume")
def resume_pipeline(
    request: Request,
    user: object = Depends(require_mutation_auth),
    db: Session = Depends(get_db),
) -> dict[str, object]:
    existing = get_setting(db, "pipeline", {"paused": False})
    record = set_setting(db, "pipeline", {**existing, "paused": False, "updated_at": utcnow().isoformat()})
    log_operator_action(db, user_id=user.id, action="resume_pipeline", target_type="pipeline", target_id=record.key, request=request, details={"paused": False})
    db.commit()
    return {"settings": record.value_json}


@router.get("/pipeline/settings")
def get_pipeline_settings(
    _: object = Depends(get_current_user),
    db: Session = Depends(get_db),
    settings: PlatformSettings = Depends(get_platform_settings),
) -> dict[str, object]:
    stored = get_setting(db, "pipeline", {"paused": False})
    return {
        "pipeline": stored,
        "env": {
            "app_env": settings.app_env,
            "upload_mode": settings.upload_mode,
            "lab_enabled": settings.lab_enabled,
        },
    }


@router.patch("/pipeline/settings")
def patch_pipeline_settings(
    payload: SettingsPatchRequest,
    request: Request,
    user: object = Depends(require_mutation_auth),
    db: Session = Depends(get_db),
) -> dict[str, object]:
    existing = get_setting(db, "pipeline", {"paused": False})
    merged = {**existing, **payload.model_dump(exclude_none=True), "updated_at": utcnow().isoformat()}
    record = set_setting(db, "pipeline", merged)
    log_operator_action(db, user_id=user.id, action="patch_pipeline_settings", target_type="pipeline", target_id=record.key, request=request, details=payload.model_dump(exclude_none=True))
    db.commit()
    return {"settings": record.value_json}


@router.get("/alerts")
def list_alerts(
    _: object = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> dict[str, object]:
    alerts = db.scalars(select(Alert).order_by(Alert.created_at.desc())).all()
    return {"alerts": [serialize_alert(alert) for alert in alerts]}


@router.post("/alerts/{alert_id}/ack")
def acknowledge_alert(
    alert_id: str,
    request: Request,
    user: object = Depends(require_mutation_auth),
    db: Session = Depends(get_db),
) -> dict[str, object]:
    alert = db.get(Alert, alert_id)
    if not alert:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Alert not found.")
    alert.status = "acknowledged"
    alert.acknowledged_at = utcnow()
    alert.acknowledged_by_id = user.id
    db.add(alert)
    log_operator_action(db, user_id=user.id, action="ack_alert", target_type="alert", target_id=alert.id, request=request, details={})
    db.commit()
    db.refresh(alert)
    return {"alert": serialize_alert(alert)}


@router.get("/operator-actions")
def list_operator_actions(
    _: object = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> dict[str, object]:
    actions = db.scalars(select(OperatorAction).order_by(OperatorAction.created_at.desc()).limit(200)).all()
    return {"operator_actions": [serialize_operator_action(action) for action in actions]}


@router.get("/workers")
def list_workers(
    _: object = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> dict[str, object]:
    workers = db.scalars(select(WorkerHeartbeat).order_by(WorkerHeartbeat.worker_name.asc())).all()
    return {"workers": [serialize_worker(worker) for worker in workers]}


@router.get("/workers/{worker_id}")
def get_worker(
    worker_id: str,
    _: object = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> dict[str, object]:
    worker = db.get(WorkerHeartbeat, worker_id)
    if not worker:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Worker not found.")
    return {"worker": serialize_worker(worker)}
