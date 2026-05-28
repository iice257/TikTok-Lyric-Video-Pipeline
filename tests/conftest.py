from __future__ import annotations

from pathlib import Path
import shutil
from uuid import uuid4

import pytest


@pytest.fixture
def tmp_path() -> Path:
    root = Path(__file__).resolve().parents[1] / ".tmp" / "test-runs"
    root.mkdir(parents=True, exist_ok=True)
    path = root / uuid4().hex
    path.mkdir()
    try:
        yield path
    finally:
        shutil.rmtree(path, ignore_errors=True)
