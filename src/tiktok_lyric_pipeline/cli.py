from __future__ import annotations

import argparse
import json
import time
from pathlib import Path

from .config import PipelineConfig
from .pipeline import TikTokLyricPipeline


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description="Automated TikTok lyric video generation pipeline")
    parser.add_argument(
        "--config",
        type=Path,
        default=Path("config/pipeline.example.json"),
        help="Path to the pipeline JSON config.",
    )
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="Prepare render artifacts and queue records without invoking ffmpeg.",
    )
    parser.add_argument(
        "--max-clips",
        type=int,
        default=None,
        help="Override the daily target clip count for this run.",
    )
    parser.add_argument(
        "--force-automated",
        action="store_true",
        help="Reprocess automated-feed songs even if they were recorded in pipeline state.",
    )
    parser.add_argument(
        "--watch",
        action="store_true",
        help="Keep polling for new songs until interrupted.",
    )
    parser.add_argument(
        "--poll-interval-seconds",
        type=int,
        default=60,
        help="Seconds to sleep between watch-mode runs.",
    )
    return parser


def main() -> None:
    parser = build_parser()
    args = parser.parse_args()
    config = PipelineConfig.from_json(args.config) if args.config.exists() else PipelineConfig.default(Path.cwd())
    pipeline = TikTokLyricPipeline(config)
    if args.watch:
        cycle = 0
        try:
            while True:
                cycle += 1
                result = pipeline.run(
                    dry_run=args.dry_run,
                    max_clips=args.max_clips,
                    force_automated=args.force_automated,
                )
                payload = {
                    "mode": "watch",
                    "cycle": cycle,
                    "sleep_seconds": max(args.poll_interval_seconds, 1),
                }
                if result.produced_clip_count == 0 and result.failed == 0:
                    payload["result"] = {
                        "target_clip_count": result.target_clip_count,
                        "produced_clip_count": result.produced_clip_count,
                        "rendered": result.rendered,
                        "planned_only": result.planned_only,
                        "failed": result.failed,
                    }
                else:
                    payload["result"] = result.to_dict()
                print(
                    json.dumps(payload, indent=2),
                    flush=True,
                )
                time.sleep(max(args.poll_interval_seconds, 1))
        except KeyboardInterrupt:
            print(json.dumps({"mode": "watch", "status": "stopped"}, indent=2), flush=True)
    else:
        result = pipeline.run(
            dry_run=args.dry_run,
            max_clips=args.max_clips,
            force_automated=args.force_automated,
        )
        print(json.dumps(result.to_dict(), indent=2))


if __name__ == "__main__":
    main()
