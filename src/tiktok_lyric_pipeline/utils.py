from __future__ import annotations

import hashlib
import json
import math
import random
import shutil
import subprocess
from collections.abc import Iterable
from pathlib import Path
from typing import TypeVar

T = TypeVar("T")


def slugify(value: str) -> str:
    cleaned = "".join(ch.lower() if ch.isalnum() else "-" for ch in value)
    while "--" in cleaned:
        cleaned = cleaned.replace("--", "-")
    return cleaned.strip("-") or "item"


def stable_id(*parts: str, length: int = 12) -> str:
    digest = hashlib.sha1("::".join(parts).encode("utf-8")).hexdigest()
    return digest[:length]


def clamp(value: float, low: float, high: float) -> float:
    return max(low, min(value, high))


def normalize(value: float, low: float, high: float) -> float:
    if math.isclose(low, high):
        return 0.0
    return clamp((value - low) / (high - low), 0.0, 1.0)


def weighted_choice(rng: random.Random, weighted_items: Iterable[tuple[T, float]]) -> T:
    items = [(item, weight) for item, weight in weighted_items if weight > 0]
    if not items:
        raise ValueError("weighted_choice() requires at least one positive weight")
    total = sum(weight for _, weight in items)
    roll = rng.uniform(0, total)
    cursor = 0.0
    for item, weight in items:
        cursor += weight
        if roll <= cursor:
            return item
    return items[-1][0]


def ensure_directory(path: Path) -> Path:
    path.mkdir(parents=True, exist_ok=True)
    return path


def read_json(path: Path, default: T) -> T:
    if not path.exists():
        return default
    return json.loads(path.read_text(encoding="utf-8"))


def write_json(path: Path, payload: object) -> None:
    ensure_directory(path.parent)
    path.write_text(json.dumps(payload, indent=2, ensure_ascii=False), encoding="utf-8")


def which(command: str) -> str | None:
    return shutil.which(command)


def run_command(command: list[str], *, cwd: Path | None = None) -> subprocess.CompletedProcess[str]:
    return subprocess.run(
        command,
        cwd=str(cwd) if cwd else None,
        text=True,
        check=False,
        capture_output=True,
    )
