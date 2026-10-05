"""Turn a capture of real API responses into the web app's demo fixtures.

The hosted frontend has no backend, so it serves these fixtures instead
(see apps/web/lib/demo.js). To refresh them:

1. Run the API locally against a database with rendered clips.
2. Log in and save GET responses to a JSON file keyed by path
   ("/clips", "/clips/<id>", "/songs", ...).
3. python scripts/build_demo_fixtures.py capture.json

Local filesystem paths are rewritten to repo-relative ones, and media the
UI links to is pointed at the files in apps/web/public/demo/. Session IPs
and user agents are replaced with placeholders.
"""

from __future__ import annotations

import json
import re
import sys
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[1]
OUTPUT = REPO_ROOT / "apps" / "web" / "lib" / "demo-fixtures.json"

# Any absolute path into this repo, in either slash style (ffmpeg filter
# strings escape the drive colon as "C\:").
REPO_PREFIX = re.compile(
    r"[A-Za-z]\\?:[\\/](?:[^\"'\\/]+[\\/])*?TikTok-Lyric-Video-Pipeline[\\/]",
)
HASH_SUFFIX = re.compile(r"-[0-9a-f]{12}$")


def slugify(name: str) -> str:
    return re.sub(r"[^a-z0-9]+", "-", name.lower()).strip("-")


def demo_media(path: str) -> str | None:
    """Map a captured media path to its file under public/demo/, if shipped."""
    p = Path(path.replace("\\", "/"))
    stem, suffix = p.stem, p.suffix.lower()
    if "manual-intake" in p.parts:
        slug = slugify(stem.split(" - ", 1)[-1])
        ext = {".png": ".jpg", ".jpg": ".jpg", ".wav": ".mp3", ".mp3": ".mp3", ".lrc": ".lrc"}.get(suffix)
        return f"/demo/{slug}{ext}" if ext else None
    if p.parent.name == "videos" and suffix == ".mp4":
        return f"/demo/{HASH_SUFFIX.sub('', stem.removeprefix('test-artist-'))}.mp4"
    if p.parent.name == "render_work" and suffix == ".ass":
        return f"/demo/{HASH_SUFFIX.sub('', stem)}.ass"
    return None


def rewrite(value, key: str = ""):
    if isinstance(value, dict):
        return {k: rewrite(v, k) for k, v in value.items()}
    if isinstance(value, list):
        return [rewrite(v, key) for v in value]
    if not isinstance(value, str):
        return value
    if key == "ip_address":
        return "203.0.113.10"
    if key == "user_agent":
        return "Mozilla/5.0 (demo)"
    if key.endswith("_path") and REPO_PREFIX.match(value):
        mapped = demo_media(value)
        if mapped:
            return mapped
    return REPO_PREFIX.sub("", value).replace("\\", "/") if REPO_PREFIX.search(value) else value


def main() -> None:
    capture = json.loads(Path(sys.argv[1]).read_text(encoding="utf-8"))
    capture.pop("/auth/login", None)
    fixtures = rewrite(capture)
    leftovers = re.findall(r"[A-Za-z]:\\\\Users[^\"]*", json.dumps(fixtures))
    if leftovers:
        raise SystemExit(f"Unrewritten local paths remain: {leftovers[:3]}")
    OUTPUT.write_text(json.dumps(fixtures, indent=1) + "\n", encoding="utf-8")
    print(f"Wrote {len(fixtures)} endpoints to {OUTPUT.relative_to(REPO_ROOT)}")


if __name__ == "__main__":
    main()
