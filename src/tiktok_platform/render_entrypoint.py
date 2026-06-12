from __future__ import annotations

import os
import signal
import subprocess
import sys
import time
from typing import NoReturn


def _terminate(processes: list[subprocess.Popen[bytes]]) -> None:
    for process in processes:
        if process.poll() is None:
            process.terminate()
    for process in processes:
        if process.poll() is None:
            try:
                process.wait(timeout=10)
            except subprocess.TimeoutExpired:
                process.kill()


def main() -> NoReturn:
    poll_interval = os.getenv("WORKER_POLL_INTERVAL_SECONDS", "20")
    subprocess.run(
        [sys.executable, "-m", "alembic", "upgrade", "head"],
        check=True,
    )
    commands = [
        [sys.executable, "-m", "tiktok_platform_api.app"],
        [sys.executable, "-m", "tiktok_platform_worker.main", "--poll-interval-seconds", poll_interval],
    ]
    processes = [subprocess.Popen(command) for command in commands]

    def _handle_signal(signum: int, _frame: object | None) -> None:
        _terminate(processes)
        raise SystemExit(128 + signum)

    signal.signal(signal.SIGINT, _handle_signal)
    signal.signal(signal.SIGTERM, _handle_signal)

    try:
        while True:
            for process in processes:
                return_code = process.poll()
                if return_code is not None:
                    _terminate(processes)
                    raise SystemExit(return_code)
            time.sleep(1)
    finally:
        _terminate(processes)


if __name__ == "__main__":
    main()
