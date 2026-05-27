from __future__ import annotations

from sqlalchemy import func, or_, select
from sqlalchemy.orm import Session

from .models import Clip, Song
from .services import serialize_clip, serialize_song
from .settings import PlatformSettings


def search_catalog(db: Session, settings: PlatformSettings, query: str, *, limit: int = 20) -> dict[str, object]:
    cleaned = " ".join(query.split())
    if not cleaned:
        return {"query": query, "songs": [], "clips": []}
    bounded_limit = max(1, min(limit, 50))
    if settings.database_url.startswith("postgresql"):
        return _search_postgres(db, cleaned, bounded_limit)
    return _search_fallback(db, cleaned, bounded_limit)


def _search_fallback(db: Session, query: str, limit: int) -> dict[str, object]:
    pattern = f"%{query}%"
    songs = db.scalars(
        select(Song)
        .where(
            or_(
                Song.title.ilike(pattern),
                Song.artist.ilike(pattern),
                Song.status.ilike(pattern),
                Song.rights_status.ilike(pattern),
            )
        )
        .order_by(Song.updated_at.desc())
        .limit(limit)
    ).all()
    clips = db.scalars(
        select(Clip)
        .join(Song, Song.id == Clip.song_id)
        .where(
            or_(
                Clip.caption.ilike(pattern),
                Clip.hook_category.ilike(pattern),
                Clip.status.ilike(pattern),
                Song.title.ilike(pattern),
                Song.artist.ilike(pattern),
            )
        )
        .order_by(Clip.updated_at.desc())
        .limit(limit)
    ).all()
    return {
        "query": query,
        "strategy": "substring",
        "songs": [serialize_song(song) for song in songs],
        "clips": [serialize_clip(clip) for clip in clips],
    }


def _search_postgres(db: Session, query: str, limit: int) -> dict[str, object]:
    ts_query = func.plainto_tsquery("simple", query)
    song_document = func.to_tsvector(
        "simple",
        func.concat_ws(
            " ",
            Song.title,
            Song.artist,
            Song.status,
            Song.rights_status,
            Song.review_status,
        ),
    )
    clip_document = func.to_tsvector(
        "simple",
        func.concat_ws(
            " ",
            Clip.caption,
            Clip.hook_category,
            Clip.status,
            Song.title,
            Song.artist,
        ),
    )
    song_rank = func.ts_rank(song_document, ts_query).label("rank")
    clip_rank = func.ts_rank(clip_document, ts_query).label("rank")
    song_rows = db.execute(
        select(Song, song_rank)
        .where(song_document.op("@@")(ts_query))
        .order_by(song_rank.desc(), Song.updated_at.desc())
        .limit(limit)
    ).all()
    clip_rows = db.execute(
        select(Clip, clip_rank)
        .join(Song, Song.id == Clip.song_id)
        .where(clip_document.op("@@")(ts_query))
        .order_by(clip_rank.desc(), Clip.updated_at.desc())
        .limit(limit)
    ).all()
    return {
        "query": query,
        "strategy": "postgres_full_text",
        "songs": [
            {**serialize_song(song), "search_rank": float(rank or 0.0)}
            for song, rank in song_rows
        ],
        "clips": [
            {**serialize_clip(clip), "search_rank": float(rank or 0.0)}
            for clip, rank in clip_rows
        ],
    }
