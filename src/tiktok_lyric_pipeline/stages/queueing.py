from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime
from pathlib import Path
import json

from ..models import ScheduledUpload
from ..utils import ensure_directory, read_json, write_json
from .scheduling import ScheduledJob


@dataclass(slots=True)
class QueueExport:
    json_path: Path
    ndjson_path: Path
    records: list[ScheduledUpload]

    def to_dict(self) -> dict[str, object]:
        return {
            "json_path": str(self.json_path),
            "ndjson_path": str(self.ndjson_path),
            "count": len(self.records),
            "records": [record.to_dict() for record in self.records],
        }


class QueueExporter:
    def export(
        self,
        jobs: list[ScheduledJob],
        queue_path: Path,
        *,
        ndjson_path: Path | None = None,
    ) -> QueueExport:
        ensure_directory(queue_path.parent)
        existing_records = self.load_existing(queue_path)
        queue_records = [job.to_scheduled_upload() for job in jobs]
        merged_records = self.merge_records(existing_records, queue_records)
        payload = {
            "count": len(merged_records),
            "jobs": [record.to_dict() for record in merged_records],
        }
        write_json(queue_path, payload)
        ndjson_target = ndjson_path or queue_path.with_suffix(".ndjson")
        self.write_ndjson(ndjson_target, merged_records)
        return QueueExport(json_path=queue_path, ndjson_path=ndjson_target, records=merged_records)

    def load_existing(self, queue_path: Path) -> list[ScheduledUpload]:
        payload = read_json(queue_path, {"jobs": []})
        records: list[ScheduledUpload] = []
        for job in payload.get("jobs", []):
            try:
                records.append(
                    ScheduledUpload(
                        clip_id=str(job["clip_id"]),
                        video_path=Path(job["video_path"]),
                        caption=str(job["caption"]),
                        hook_category=job.get("hook_category"),
                        scheduled_at=datetime.fromisoformat(job["scheduled_at"]),
                        upload_window_start=datetime.fromisoformat(job["upload_window_start"]),
                        upload_window_end=datetime.fromisoformat(job["upload_window_end"]),
                        platform=str(job.get("platform", "tiktok")),
                        publish_state=str(job.get("publish_state", "scheduled")),
                        extra_metadata=dict(job.get("extra_metadata", {})),
                    )
                )
            except (KeyError, TypeError, ValueError):
                continue
        return records

    def merge_records(
        self,
        existing_records: list[ScheduledUpload],
        new_records: list[ScheduledUpload],
    ) -> list[ScheduledUpload]:
        merged: dict[str, ScheduledUpload] = {record.clip_id: record for record in existing_records}
        for record in new_records:
            merged[record.clip_id] = record
        return sorted(merged.values(), key=lambda record: record.scheduled_at)

    def write_ndjson(self, path: Path, records: list[ScheduledUpload]) -> None:
        ensure_directory(path.parent)
        with path.open("w", encoding="utf-8") as handle:
            for record in records:
                handle.write(json.dumps(record.to_dict(), ensure_ascii=False))
                handle.write("\n")
