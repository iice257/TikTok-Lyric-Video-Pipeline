from __future__ import annotations

import io
from pathlib import Path
import random

from tiktok_lyric_pipeline.config import PipelineConfig
from tiktok_lyric_pipeline.models import SegmentSelection, SongAsset
from tiktok_lyric_pipeline.presets import RANDOM_PRESET_ID, default_presets_path, load_presets
from tiktok_lyric_pipeline.stages.rendering import RenderPlanner
from tiktok_lyric_pipeline.stages.styling import StyleDecisionEngine

from test_platform_api_smoke import build_test_client

REPO_ROOT = Path(__file__).resolve().parents[1]


def catalog():
    return load_presets(default_presets_path(REPO_ROOT))


def test_catalog_has_visualicer_themes_and_bundled_fonts() -> None:
    presets = catalog()
    assert presets.get(RANDOM_PRESET_ID) is not None
    themed = [preset for preset in presets.presets if not preset.is_random]
    assert len(themed) == 16
    assert presets.fonts_dir is not None
    bundled_css = (presets.fonts_dir / "local-fonts.css").read_text(encoding="utf-8")
    for preset in themed:
        # Every render font must be one of the TTFs libass can load from fonts_dir.
        assert preset.font in bundled_css, preset.id
        assert {"background", "text", "highlight"} <= preset.colors.keys(), preset.id


def test_style_from_preset_is_fixed_except_hook() -> None:
    preset = catalog().get("matrix")
    engine = StyleDecisionEngine(PipelineConfig.default(REPO_ROOT).render, random.Random(1))
    song = SongAsset(song_id="s", title="T", artist="A", audio_path=Path("a.mp3"), source="manual")
    style = engine.decide(song, preset)
    assert style.preset_id == "matrix"
    assert style.font_family == preset.font
    assert style.lyric_style == preset.lyric_style
    assert style.layout_template == preset.layout
    assert style.highlight_color == preset.colors["highlight"]
    assert style.background_color == preset.colors["background"]
    assert style.grain_strength == preset.grain


def test_surprise_preset_keeps_random_styling() -> None:
    engine = StyleDecisionEngine(PipelineConfig.default(REPO_ROOT).render, random.Random(1))
    song = SongAsset(song_id="s", title="T", artist="A", audio_path=Path("a.mp3"), source="manual")
    style = engine.decide(song, catalog().get(RANDOM_PRESET_ID))
    assert style.preset_id is None


def test_filter_chain_uses_preset_fonts_and_background(tmp_path) -> None:
    preset = catalog().get("paper")
    engine = StyleDecisionEngine(PipelineConfig.default(REPO_ROOT).render, random.Random(1))
    song = SongAsset(song_id="s", title="T", artist="A", audio_path=Path("a.mp3"), source="manual")
    style = engine.decide(song, preset)
    planner = RenderPlanner(PipelineConfig.default(REPO_ROOT))
    segment = SegmentSelection(segment_id="g", song_id="s", start=0.0, end=30.0, score=1.0, reason="", caption_seed="")
    chain = planner.build_filter_chain(song, tmp_path / "x.ass", style, "", segment)
    assert "fontsdir=" in chain
    assert f"color=0x{preset.colors['background'][1:]}@1.0" in chain


def test_presets_api_and_intake(tmp_path, monkeypatch) -> None:
    client = build_test_client(tmp_path, monkeypatch)
    csrf = client.post("/auth/login", json={"email": "admin99", "password": "admin99"}).json()["csrf_token"]

    listing = client.get("/presets").json()
    assert listing["default"] == RANDOM_PRESET_ID
    assert {"surprise", "amber", "matrix"} <= {preset["id"] for preset in listing["presets"]}

    changed = client.patch("/presets/default", json={"preset_id": "amber"}, headers={"x-csrf-token": csrf})
    assert changed.status_code == 200
    assert client.get("/presets").json()["default"] == "amber"

    def intake(**extra):
        return client.post(
            "/manual-intake",
            data={"title": "Song", "artist": "Artist", **extra},
            files={"audio": ("a.mp3", io.BytesIO(f"audio-{extra}".encode()), "audio/mpeg")},
            headers={"x-csrf-token": csrf},
        )

    assert intake(preset="nope").status_code == 400
    assert intake().json()["song"]["preset_id"] == "amber"
    assert intake(preset="matrix").json()["song"]["preset_id"] == "matrix"


def test_catalog_follows_pipeline_config_root(tmp_path, monkeypatch) -> None:
    # Docker installs the package non-editable, so presets must be found via the config path, not __file__.
    import tiktok_platform.services as services_module
    import tiktok_platform.settings as settings_module

    config_dir = tmp_path / "config"
    fonts_dir = tmp_path / "fonts"
    config_dir.mkdir()
    fonts_dir.mkdir()
    (config_dir / "pipeline.json").write_text("{}", encoding="utf-8")
    (config_dir / "presets.json").write_text(
        '{"default": "only", "fonts_dir": "fonts", "presets": [{"id": "only", "name": "Only", "font": "Abel"}]}',
        encoding="utf-8",
    )
    monkeypatch.setenv("PIPELINE_CONFIG_PATH", str(config_dir / "pipeline.json"))
    settings_module.get_settings.cache_clear()
    try:
        presets = services_module.get_preset_catalog()
        assert [preset.id for preset in presets.presets] == ["only"]
        assert presets.fonts_dir == fonts_dir.resolve()
    finally:
        settings_module.get_settings.cache_clear()


def test_preview_endpoint_rejects_unknown_and_random_presets(tmp_path, monkeypatch) -> None:
    client = build_test_client(tmp_path, monkeypatch)
    client.post("/auth/login", json={"email": "admin99", "password": "admin99"})
    assert client.get("/presets/nope/preview").status_code == 404
    # "Surprise me" is random per clip, so there is no single look to show.
    assert client.get("/presets/surprise/preview").status_code == 422
