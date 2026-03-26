from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path
import json

from ..models import ScheduledUpload
from ..utils import ensure_directory, write_json
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
        queue_records = [job.to_scheduled_upload() for job in jobs]
        payload = {
            "count": len(queue_records),
            "jobs": [record.to_dict() for record in queue_records],
        }
        write_json(queue_path, payload)
        ndjson_target = ndjson_path or queue_path.with_suffix(".ndjson")
        self.write_ndjson(ndjson_target, queue_records)
        return QueueExport(json_path=queue_path, ndjson_path=ndjson_target, records=queue_records)

    def write_ndjson(self, path: Path, records: list[ScheduledUpload]) -> None:
        ensure_directory(path.parent)
        with path.open("w", encoding="utf-8") as handle:
            for record in records:
                handle.write(json.dumps(record.to_dict(), ensure_ascii=False))
                handle.write("\n")

