"use client";

import { useEffect, useState } from "react";

import { getApiBaseUrl } from "@/lib/api";
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

function PreviewDialog({ preset, onClose }) {
  const [state, setState] = useState("loading");

  useEffect(() => {
    const onKey = (event) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={`${preset.name} preview`}
      onClick={onClose}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-6 backdrop-blur-sm"
    >
      <div className="flex flex-col items-center gap-3" onClick={(event) => event.stopPropagation()}>
        <div className="relative aspect-[9/16] h-[min(78vh,720px)] overflow-hidden rounded-3xl bg-muted">
          {state === "loading" ? (
            <p className="absolute inset-0 flex items-center justify-center text-sm text-muted-foreground">Rendering preview…</p>
          ) : null}
          {state === "error" ? (
            <p className="absolute inset-0 flex items-center justify-center p-6 text-center text-sm text-destructive">
              Couldn&apos;t render a preview. Is the backend running with ffmpeg?
            </p>
          ) : null}
          <video
            src={`${getApiBaseUrl()}/presets/${encodeURIComponent(preset.id)}/preview`}
            autoPlay
            loop
            playsInline
            controls
            onCanPlay={() => setState("ready")}
            onError={() => setState("error")}
            className={cn("h-full w-full object-cover", state !== "ready" && "invisible")}
          />
        </div>
        <p className="text-sm text-white">
          {preset.name} <span className="text-white/60">· {presetSummary(preset)}</span>
        </p>
        <button type="button" onClick={onClose} className="rounded-full bg-white/10 px-5 py-2 text-sm text-white hover:bg-white/20">
          Close
        </button>
      </div>
    </div>
  );
}

export function PresetPicker({ presets, value, onChange, name }) {
  const [previewing, setPreviewing] = useState(null);
  return (
    <div role="radiogroup" className="grid grid-cols-3 gap-3 sm:grid-cols-4 lg:grid-cols-6">
      {name ? <input type="hidden" name={name} value={value || ""} /> : null}
      {presets.map((preset) => {
        const selected = preset.id === value;
        const description = presetDescription(preset);
        return (
          <div key={preset.id} className="relative">
            <button
              type="button"
              role="radio"
              aria-checked={selected}
              title={description}
              onClick={() => onChange(preset.id)}
              className="group flex w-full flex-col gap-2 text-left"
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
            {preset.is_random ? null : (
              <button
                type="button"
                onClick={() => setPreviewing(preset)}
                aria-label={`Preview ${preset.name}`}
                title="Play a sample clip in this look"
                className="absolute right-2 top-2 flex size-8 items-center justify-center rounded-full bg-black/55 text-white backdrop-blur transition hover:scale-105 hover:bg-black/75"
              >
                <svg aria-hidden="true" viewBox="0 0 24 24" className="size-4" fill="currentColor">
                  <path d="M8 5.5v13l11-6.5z" />
                </svg>
              </button>
            )}
          </div>
        );
      })}
      {previewing ? <PreviewDialog preset={previewing} onClose={() => setPreviewing(null)} /> : null}
    </div>
  );
}
