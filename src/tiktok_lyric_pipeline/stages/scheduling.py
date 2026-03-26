from __future__ import annotations

from dataclasses import dataclass, field
from datetime import date, datetime, timedelta, time, timezone
from pathlib import Path
from typing import Any
import json
import random

from ..config import PipelineConfig
from ..models import ScheduledUpload
from ..utils import ensure_directory, stable_id


@dataclass(slots=True)
class ScheduledJob:
    clip_id: str
    video_path: Path
    caption: str
    hook_category: str | None
    scheduled_at: datetime
    platform: str = "tiktok"
    upload_window_start: datetime | None = None
    upload_window_end: datetime | None = None
    extra_metadata: dict[str, Any] = field(default_factory=dict)

    def to_scheduled_upload(self) -> ScheduledUpload:
        window_start = self.upload_window_start or self.scheduled_at
        window_end = self.upload_window_end or self.scheduled_at
        return ScheduledUpload(
            clip_id=self.clip_id,
            video_path=self.video_path,
            caption=self.caption,
            hook_category=self.hook_category,
            scheduled_at=self.scheduled_at,
            upload_window_start=window_start,
            upload_window_end=window_end,
            platform=self.platform,
            extra_metadata=self.extra_metadata,
        )


@dataclass(slots=True)
class ScheduledBatch:
    window_date: date
    jobs: list[ScheduledJob]
    bucket_hours: list[int]

    def to_dict(self) -> dict[str, Any]:
        return {
            "window_date": self.window_date.isoformat(),
            "bucket_hours": self.bucket_hours,
            "jobs": [
                {
                    "clip_id": job.clip_id,
                    "video_path": str(job.video_path),
                    "caption": job.caption,
                    "hook_category": job.hook_category,
                    "scheduled_at": job.scheduled_at.isoformat(),
                    "platform": job.platform,
                    "extra_metadata": job.extra_metadata,
                }
                for job in self.jobs
            ],
        }


class SchedulePlanner:
    def __init__(self, config: PipelineConfig, seed: int | None = None) -> None:
        self.config = config
        self.rng = random.Random(config.random_seed if seed is None else seed)

    def plan_next_day_window(
        self,
        clip_ids: list[str],
        clip_paths: list[Path],
        captions: list[str],
        hook_categories: list[str | None] | None = None,
        *,
        now: datetime | None = None,
    ) -> ScheduledBatch:
        now = now or datetime.now(timezone.utc)
        window_date = self.next_day(now).date()
        hours = self.build_bucket_hours(window_date)
        jobs: list[ScheduledJob] = []
        for index, clip_path in enumerate(clip_paths):
            hour = hours[index % len(hours)]
            minute = self.rng.randint(0, 59)
            second = self.rng.randint(0, 59)
            scheduled_at = datetime.combine(window_date, time(hour, minute, second), tzinfo=now.tzinfo)
            category = hook_categories[index] if hook_categories and index < len(hook_categories) else None
            caption = captions[index] if index < len(captions) else clip_paths[index].stem
            clip_id = clip_ids[index] if index < len(clip_ids) else stable_id(clip_path.stem, scheduled_at.isoformat(), str(index))
            jobs.append(
                ScheduledJob(
                    clip_id=clip_id,
                    video_path=clip_path,
                    caption=self.compose_caption(caption, category),
                    hook_category=category,
                    scheduled_at=scheduled_at,
                    platform="tiktok",
                    upload_window_start=datetime.combine(window_date, time(self.config.schedule.upload_window_start_hour, 0, 0), tzinfo=now.tzinfo),
                    upload_window_end=datetime.combine(window_date, time(self.config.schedule.upload_window_end_hour, 59, 59), tzinfo=now.tzinfo),
                )
            )
        return ScheduledBatch(window_date=window_date, jobs=jobs, bucket_hours=hours)

    def build_bucket_hours(self, window_date: date) -> list[int]:
        buckets = list(self.config.schedule.publish_hour_buckets)
        if not buckets:
            buckets = list(range(self.config.schedule.upload_window_start_hour, self.config.schedule.upload_window_end_hour + 1))
        if len(buckets) < 2:
            buckets = buckets * 2
        self.rng.shuffle(buckets)
        return buckets

    def next_day(self, now: datetime) -> datetime:
        return (now + timedelta(days=1)).replace(hour=0, minute=0, second=0, microsecond=0)

    def compose_caption(self, caption: str, hook_category: str | None) -> str:
        parts = [caption.strip()]
        if hook_category:
            parts.append(f"#{self.slug_tag(hook_category)}")
        return " ".join(part for part in parts if part)

    def slug_tag(self, value: str) -> str:
        return "".join(ch.lower() if ch.isalnum() else "" for ch in value)

    def schedule_jobs(
        self,
        clip_ids: list[str],
        clip_paths: list[Path],
        captions: list[str],
        hook_categories: list[str | None] | None = None,
        *,
        now: datetime | None = None,
    ) -> list[ScheduledJob]:
        return self.plan_next_day_window(clip_ids, clip_paths, captions, hook_categories, now=now).jobs
