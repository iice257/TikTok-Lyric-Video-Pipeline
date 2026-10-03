"use client";

import { buildMediaUrl } from "@/lib/api";
import { cn } from "@/lib/utils";

// Plain-language labels for pipeline statuses, grouped by tone.
const STATUS = {
  ingested: ["Getting ready", "progress"],
  lyrics_ready: ["Finding clips", "progress"],
  queued_for_render: ["Rendering", "progress"],
  queued: ["Queued", "progress"],
  claimed: ["Rendering", "progress"],
  rendering: ["Rendering", "progress"],
  rendered: ["Ready", "success"],
  ready: ["Ready", "success"],
  pending: ["Needs approval", "warn"],
  waiting_window: ["Scheduled", "neutral"],
  queued_for_upload: ["Scheduled", "neutral"],
  uploading: ["Posting", "progress"],
  retry_wait: ["Retrying", "warn"],
  posted: ["Posted", "success"],
  failed: ["Failed", "error"],
  quarantined: ["On hold", "warn"],
  cancelled: ["Cancelled", "neutral"],
  planned_only: ["Not rendered", "warn"],
};

const TONES = {
  progress: "bg-primary/15 text-primary",
  success: "bg-highlight/15 text-highlight",
  warn: "bg-primary/10 text-foreground",
  error: "bg-destructive/15 text-destructive",
  neutral: "bg-muted text-muted-foreground",
};

export function statusLabel(status) {
  return (STATUS[status] || [String(status || "Unknown").replaceAll("_", " ")])[0];
}

export function StatusPill({ status, label, className }) {
  const tone = (STATUS[status] || [null, "neutral"])[1];
  return (
    <span className={cn("inline-flex h-6 items-center gap-1.5 rounded-full px-2.5 text-xs font-medium", TONES[tone], className)}>
      {tone === "progress" ? <span className="size-1.5 animate-pulse rounded-full bg-current" /> : null}
      {label || statusLabel(status)}
    </span>
  );
}

export function VideoThumb({ path, className }) {
  return (
    <div className={cn("relative aspect-[9/16] overflow-hidden rounded-2xl bg-muted", className)}>
      {path ? (
        <video
          className="absolute inset-0 h-full w-full object-cover"
          muted
          playsInline
          preload="metadata"
          // #t= asks the browser to show a frame from inside the clip instead of a black first frame.
          src={`${buildMediaUrl(path)}#t=1.5`}
        />
      ) : (
        <div className="absolute inset-0 flex items-center justify-center text-muted-foreground">
          <svg aria-hidden="true" viewBox="0 0 24 24" className="size-8 opacity-40" fill="none" stroke="currentColor" strokeWidth="1.5">
            <rect x="4" y="3" width="16" height="18" rx="3" />
            <path d="m10 9 5 3-5 3z" />
          </svg>
        </div>
      )}
    </div>
  );
}

export function EmptyState({ title, children, action }) {
  return (
    <div className="flex flex-col items-center gap-3 rounded-3xl border border-dashed border-border px-6 py-14 text-center">
      <p className="font-heading text-2xl">{title}</p>
      {children ? <p className="max-w-sm text-sm text-muted-foreground">{children}</p> : null}
      {action}
    </div>
  );
}

export function Panel({ className, children }) {
  return <section className={cn("rounded-3xl border border-border bg-card p-5 sm:p-6", className)}>{children}</section>;
}

export function songName(song) {
  return song ? `${song.artist} — ${song.title}` : "Unknown song";
}
