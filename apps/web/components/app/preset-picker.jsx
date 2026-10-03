"use client";

import { cn } from "@/lib/utils";

const MOTION = {
  karaoke: "Word by word",
  stacked_3_line: "Three lines",
  line_swap: "Line by line",
  beat_pulse: "Pulse",
};

const LAYOUT = {
  blurred_cover_center_lyrics: "Cover",
  fullscreen_cover_overlay: "Full cover",
  blurred_background_small_cover: "Small cover",
  minimal_typography_black: "Type only",
};

const MOTION_DETAILS = {
  karaoke: "Highlights each word as it's sung.",
  stacked_3_line: "Shows the current line between the previous and next ones.",
  line_swap: "Shows one line at a time.",
  beat_pulse: "Lyrics pulse on every beat of the song.",
};

const LAYOUT_DETAILS = {
  blurred_cover_center_lyrics: "Cover art centered on a blurred copy of itself, lyrics below.",
  fullscreen_cover_overlay: "Cover art fills the frame, lyrics on top.",
  blurred_background_small_cover: "A smaller centered cover on a blurred backdrop, lyrics below.",
  minimal_typography_black: "Just the lyrics on the look's background color, no cover art.",
};

export function presetSummary(preset) {
  if (!preset || preset.is_random) return "A different look every clip";
  return [MOTION[preset.lyric_style], LAYOUT[preset.layout]].filter(Boolean).join(" · ");
}

export function presetDescription(preset) {
  if (!preset || preset.is_random) return "Picks different colors, layout and lyric motion for each clip.";
  return [MOTION_DETAILS[preset.lyric_style], LAYOUT_DETAILS[preset.layout]].filter(Boolean).join(" ");
}

function PresetPreview({ preset }) {
  if (preset.is_random) {
    return (
      <div className="flex h-full items-center justify-center bg-[conic-gradient(from_200deg,#e96b42,#ff42a1,#9e67ff,#4f94ef,#46e568,#d9a51e,#e96b42)]">
        <span className="font-heading text-4xl text-white drop-shadow">?</span>
      </div>
    );
  }
  const { background, text, highlight } = preset.colors;
  const showCover = preset.layout !== "minimal_typography_black";
  const fullCover = preset.layout === "fullscreen_cover_overlay";
  const font = { fontFamily: `"${preset.font}", sans-serif` };
  return (
    <div className="relative flex h-full flex-col items-center justify-end gap-1 px-2 pb-[18%]" style={{ background }}>
      {showCover ? (
        <div
          className={cn(
            "absolute rounded-md",
            fullCover ? "inset-0 rounded-none" : preset.layout === "blurred_background_small_cover" ? "left-1/2 top-[24%] aspect-square w-[34%] -translate-x-1/2" : "left-1/2 top-[18%] aspect-square w-[58%] -translate-x-1/2"
          )}
          style={{ background: `linear-gradient(135deg, ${highlight}, ${preset.colors.accent || text})`, opacity: fullCover ? 0.45 : 0.85 }}
        />
      ) : null}
      <span className="relative text-center text-[11px] leading-tight opacity-70" style={{ ...font, color: text }}>
        hold on, hold on
      </span>
      <span className="relative text-center text-[13px] leading-tight" style={{ ...font, color: highlight }}>
        never let it go
      </span>
    </div>
  );
}

export function PresetPicker({ presets, value, onChange, name }) {
  return (
    <div role="radiogroup" className="grid grid-cols-3 gap-3 sm:grid-cols-4 lg:grid-cols-6">
      {name ? <input type="hidden" name={name} value={value || ""} /> : null}
      {presets.map((preset) => {
        const selected = preset.id === value;
        const description = presetDescription(preset);
        return (
          <button
            key={preset.id}
            type="button"
            role="radio"
            aria-checked={selected}
            title={description}
            onClick={() => onChange(preset.id)}
            className="group flex flex-col gap-2 text-left"
          >
            <span
              className={cn(
                "block aspect-[9/16] overflow-hidden rounded-2xl ring-offset-2 ring-offset-background transition",
                selected ? "ring-2 ring-primary" : "ring-1 ring-border group-hover:ring-primary/50"
              )}
            >
              <PresetPreview preset={preset} />
            </span>
            <span className="min-w-0">
              <span className={cn("block truncate text-sm", selected && "font-semibold text-primary")}>{preset.name}</span>
              <span className="block truncate text-xs text-muted-foreground">{presetSummary(preset)}</span>
            </span>
          </button>
        );
      })}
    </div>
  );
}
