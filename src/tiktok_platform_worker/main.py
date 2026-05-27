from __future__ import annotations

import argparse

from tiktok_platform.db import SessionLocal, init_db
from tiktok_platform.services import encrypt_stored_oauth_tokens, ensure_media_root
from tiktok_platform.settings import get_settings, validate_runtime_settings

from .engine import PlatformWorker


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description="Always-on worker for the TikTok lyric automation platform")
    parser.add_argument("--once", action="store_true", help="Run one worker pass and exit.")
    parser.add_argument("--poll-interval-seconds", type=int, default=30, help="Seconds to wait between worker passes.")
    parser.add_argument("--worker-name", default="platform-worker", help="Worker heartbeat name.")
    return parser


def main() -> None:
    parser = build_parser()
    args = parser.parse_args()
    settings = get_settings()
    validate_runtime_settings(settings)
    init_db()
    ensure_media_root(settings)
    with SessionLocal() as db:
        encrypt_stored_oauth_tokens(db, settings)
    worker = PlatformWorker(worker_name=args.worker_name)
    if args.once:
        worker.run_once()
    else:
        worker.run_forever(poll_interval_seconds=args.poll_interval_seconds)


if __name__ == "__main__":
    main()
