from __future__ import annotations

import argparse
import json
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
    return parser


def main() -> None:
    parser = build_parser()
    args = parser.parse_args()
    config = PipelineConfig.from_json(args.config) if args.config.exists() else PipelineConfig.default(Path.cwd())
    pipeline = TikTokLyricPipeline(config)
    result = pipeline.run(
        dry_run=args.dry_run,
        max_clips=args.max_clips,
        force_automated=args.force_automated,
    )
    print(json.dumps(result.to_dict(), indent=2))


if __name__ == "__main__":
    main()
