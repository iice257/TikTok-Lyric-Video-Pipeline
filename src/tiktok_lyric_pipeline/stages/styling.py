from __future__ import annotations

import random

from ..config import RenderConfig
from ..hooks import HOOK_CATEGORIES
from ..models import SongAsset, StyleDecision
from ..utils import weighted_choice


class StyleDecisionEngine:
    def __init__(self, config: RenderConfig, rng: random.Random) -> None:
        self.config = config
        self.rng = rng

    def decide(self, song: SongAsset) -> StyleDecision:
        lyric_style = weighted_choice(
            self.rng,
            [
                ("karaoke", 35),
                ("stacked_3_line", 35),
                ("line_swap", 20),
                ("beat_pulse", 10),
            ],
        )
        layout_template = weighted_choice(
            self.rng,
            [
                ("blurred_cover_center_lyrics", 40),
                ("fullscreen_cover_overlay", 30),
                ("blurred_background_small_cover", 20),
                ("minimal_typography_black", 10),
            ],
        )
        font_bucket = weighted_choice(
            self.rng,
            [
                ("bold_sans", 70),
                ("editorial_serif", 15),
                ("cursive", 10),
                ("experimental", 5),
            ],
        )
        font_family = self.rng.choice(self.config.default_fonts[font_bucket])
        use_album_palette = self.rng.random() < 0.10
        text_color = self.rng.choice(["white", "black"])
        highlight_color = self._pick_highlight(song, text_color, use_album_palette)
        hook_category = self.rng.choice(list(HOOK_CATEGORIES.keys()))
        include_hook = self.rng.random() < 0.50
        hook_phrase = self.rng.choice(HOOK_CATEGORIES[hook_category]) if include_hook else None
        return StyleDecision(
            lyric_style=lyric_style,
            layout_template=layout_template,
            font_family=font_family,
            text_color=text_color,
            highlight_color=highlight_color,
            use_album_palette=use_album_palette,
            hook_category=hook_category,
            hook_phrase=hook_phrase,
        )

    def _pick_highlight(self, song: SongAsset, text_color: str, use_album_palette: bool) -> str:
        if use_album_palette and song.metadata.get("dominant_color"):
            return str(song.metadata["dominant_color"])
        if text_color == "white":
            return self.rng.choice(["yellow", "white"])
        return self.rng.choice(["black", "yellow"])
