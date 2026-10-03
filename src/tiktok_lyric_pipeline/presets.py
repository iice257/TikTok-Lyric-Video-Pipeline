"""Render presets: named looks (colors, font, motion, grain) picked per song.

Presets live in ``config/presets.json``. Their looks come from the VISUALICER
themes, and their fonts are the TTFs bundled with the web app's copy of the
visualizer, so a rendered clip uses the same typography as the preview.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from functools import lru_cache
import json
from pathlib import Path
from typing import Any

RANDOM_PRESET_ID = "surprise"


@dataclass(frozen=True, slots=True)
class Preset:
    id: str
    name: str
    description: str = ""
    font: str | None = None
    lyric_style: str | None = None
    layout: str | None = None
    grain: int | None = None
    colors: dict[str, str] = field(default_factory=dict)

    @property
    def is_random(self) -> bool:
        return self.id == RANDOM_PRESET_ID or not self.font

    def to_dict(self) -> dict[str, Any]:
        return {
            "id": self.id,
            "name": self.name,
            "description": self.description,
            "font": self.font,
            "lyric_style": self.lyric_style,
            "layout": self.layout,
            "grain": self.grain,
            "colors": dict(self.colors),
            "is_random": self.is_random,
        }


@dataclass(frozen=True, slots=True)
class PresetCatalog:
    default_id: str
    fonts_dir: Path | None
    presets: tuple[Preset, ...]

    def get(self, preset_id: str | None) -> Preset | None:
        for preset in self.presets:
            if preset.id == preset_id:
                return preset
        return None

    def resolve(self, preset_id: str | None) -> Preset | None:
        """Return the named preset, falling back to the catalog default."""
        return self.get(preset_id) or self.get(self.default_id)


def default_presets_path(root_dir: Path) -> Path:
    return root_dir / "config" / "presets.json"


@lru_cache(maxsize=4)
def load_presets(path: Path) -> PresetCatalog:
    if not path.exists():
        return PresetCatalog(default_id=RANDOM_PRESET_ID, fonts_dir=None, presets=())
    payload = json.loads(path.read_text(encoding="utf-8"))
    root_dir = path.parent.parent if path.parent.name == "config" else path.parent
    fonts_dir_raw = payload.get("fonts_dir")
    fonts_dir = (root_dir / fonts_dir_raw).resolve() if fonts_dir_raw else None
    presets = tuple(
        Preset(
            id=str(item["id"]),
            name=str(item.get("name") or item["id"]),
            description=str(item.get("description") or ""),
            font=item.get("font"),
            lyric_style=item.get("lyric_style"),
            layout=item.get("layout"),
            grain=int(item["grain"]) if item.get("grain") is not None else None,
            colors={str(key): str(value) for key, value in (item.get("colors") or {}).items()},
        )
        for item in payload.get("presets", [])
    )
    return PresetCatalog(
        default_id=str(payload.get("default") or RANDOM_PRESET_ID),
        fonts_dir=fonts_dir if fonts_dir and fonts_dir.exists() else None,
        presets=presets,
    )
