"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useState } from "react";

import { apiFetch, buildMediaUrl, toDatetimeLocal } from "@/lib/api";
import { formatDateTime, formatDuration } from "@/lib/format";
import { isActiveStatus, useResource } from "@/components/client-page";
import { AdminShell } from "@/components/admin/admin-shell";
import { Panel, StatusPill, VideoThumb, statusLabel } from "@/components/app/bits";
import { presetSummary } from "@/components/app/preset-picker";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

export const dynamic = "force-dynamic";

function clipIsBusy(data) {
  return (
    isActiveStatus(data?.clip?.status) ||
    (data?.render_jobs || []).some((job) => isActiveStatus(job.status)) ||
    (data?.upload_jobs || []).some((job) => isActiveStatus(job.status))
  );
}

export default function ClipPage() {
  const params = useParams();
  const clipId = typeof params?.id === "string" ? params.id : "";
  const encodedClipId = encodeURIComponent(clipId);
  const { data, loading, error, setData, reload } = useResource(clipId ? `/clips/${encodedClipId}` : "", null, {
    enabled: Boolean(clipId),
    isActive: clipIsBusy,
  });
  const songId = data?.clip?.song_id;
  const songResource = useResource(songId ? `/songs/${encodeURIComponent(songId)}` : "", null, { enabled: Boolean(songId), intervalMs: 0 });
  const presets = useResource("/presets", null, { intervalMs: 0 });
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState("");

  const clip = data?.clip;
  const song = songResource.data?.song;
  const preset = (presets.data?.presets || []).find((item) => item.id === clip?.preset_id);
  const playable = clip?.video_path && ["rendered", "posted"].includes(clip.status);

  async function saveClip(event) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setSubmitting(true);
    setMessage("");
    try {
      const payload = await apiFetch(`/clips/${encodedClipId}`, {
        method: "PATCH",
        body: JSON.stringify({
          caption: form.get("caption"),
          hook_category: form.get("hook_category"),
          scheduled_at: form.get("scheduled_at") ? new Date(form.get("scheduled_at")).toISOString() : null,
        }),
      });
      setData((current) => ({ ...current, clip: payload.clip }));
      setMessage("Saved.");
    } catch (err) {
      setMessage(err.message);
    } finally {
      setSubmitting(false);
    }
  }

  async function rerender() {
    setSubmitting(true);
    setMessage("");
    try {
      await apiFetch(`/clips/${encodedClipId}/rerender`, { method: "POST" });
      setMessage("Re-rendering…");
      await reload(false).catch(() => null);
    } catch (err) {
      setMessage(err.message);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <AdminShell
      title={song ? song.title : "Clip"}
      subtitle={song ? song.artist : null}
      actions={
        song ? (
          <Button asChild variant="outline" className="rounded-full">
            <Link href={`/songs/${song.id}`}>All clips from this song</Link>
          </Button>
        ) : null
      }
    >
      {loading ? <p className="text-sm text-muted-foreground">Loading…</p> : null}
      {error ? <p className="text-sm text-destructive">{error}</p> : null}

      {clip ? (
        <div className="grid gap-6 lg:grid-cols-[minmax(0,22rem)_1fr]">
          <div className="mx-auto flex w-full max-w-xs flex-col gap-3 lg:max-w-none">
            {playable ? (
              <video
                className="aspect-[9/16] w-full rounded-3xl bg-muted object-cover"
                controls
                playsInline
                preload="metadata"
                src={buildMediaUrl(clip.video_path)}
              />
            ) : (
              <VideoThumb path={null} className="rounded-3xl" />
            )}
            <div className="flex flex-wrap items-center gap-2">
              <StatusPill status={clip.status} />
              <span className="text-sm text-muted-foreground">{formatDuration(clip.duration_seconds)}</span>
              {playable ? (
                <a href={buildMediaUrl(clip.video_path)} download className="ml-auto text-sm text-primary hover:underline">
                  Download
                </a>
              ) : null}
            </div>
            {clip.last_error ? <p className="text-sm text-destructive">{clip.last_error}</p> : null}
          </div>

          <div className="flex flex-col gap-6">
            <Panel>
              <h2 className="font-heading text-2xl">Look</h2>
              <p className="mt-1 text-sm text-muted-foreground">
                {preset ? `${preset.name} · ${presetSummary(preset)}` : "Surprise me"}
                {data.segment ? ` · ${formatDuration(data.segment.start_second)}–${formatDuration(data.segment.end_second)} of the song` : ""}
              </p>
              <Button variant="outline" className="mt-4 rounded-full" onClick={rerender} disabled={submitting || isActiveStatus(clip.status)}>
                Render again
              </Button>
            </Panel>

            <Panel>
              <form className="flex flex-col gap-4" onSubmit={saveClip}>
                <h2 className="font-heading text-2xl">Post</h2>
                <div className="grid gap-2">
                  <Label htmlFor="clip-caption">Caption</Label>
                  <Textarea id="clip-caption" name="caption" maxLength={2200} required defaultValue={clip.caption} className="min-h-24 rounded-xl" />
                </div>
                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="grid gap-2">
                    <Label htmlFor="clip-hook-category">Hook</Label>
                    <Input id="clip-hook-category" name="hook_category" maxLength={128} defaultValue={clip.hook_category || ""} className="rounded-xl" />
                  </div>
                  <div className="grid gap-2">
                    <Label htmlFor="clip-scheduled-at">Post time</Label>
                    <Input id="clip-scheduled-at" name="scheduled_at" type="datetime-local" defaultValue={toDatetimeLocal(clip.scheduled_at)} className="rounded-xl" />
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <Button type="submit" disabled={submitting} className="rounded-full px-6">
                    Save
                  </Button>
                  {message ? <p aria-live="polite" className="text-sm text-muted-foreground">{message}</p> : null}
                </div>
              </form>
            </Panel>

            <details className="group rounded-3xl border border-border bg-card p-5 sm:p-6">
              <summary className="cursor-pointer list-none font-heading text-xl">
                History <span className="text-sm text-muted-foreground group-open:hidden">· show</span>
              </summary>
              <ol className="mt-4 flex flex-col gap-3">
                {(data.state_events || []).map((event) => (
                  <li key={event.id} className="flex flex-wrap justify-between gap-2 text-sm">
                    <span>
                      {event.event_type.replaceAll("_", " ")}
                      {event.to_state ? <span className="text-muted-foreground"> → {statusLabel(event.to_state).toLowerCase()}</span> : null}
                    </span>
                    <span className="text-muted-foreground">{formatDateTime(event.created_at)}</span>
                  </li>
                ))}
                {[...(data.render_jobs || []), ...(data.upload_jobs || [])]
                  .filter((job) => job.stderr_text || job.last_error)
                  .map((job) => (
                    <li key={job.id} className="text-sm text-destructive">
                      {job.last_error || job.stderr_text}
                    </li>
                  ))}
                {!(data.state_events || []).length ? <li className="text-sm text-muted-foreground">Nothing yet.</li> : null}
              </ol>
              {clip.subtitle_path ? (
                <a href={buildMediaUrl(clip.subtitle_path)} target="_blank" rel="noreferrer" className="mt-4 inline-block text-sm text-primary hover:underline">
                  Subtitle file
                </a>
              ) : null}
            </details>
          </div>
        </div>
      ) : null}
    </AdminShell>
  );
}
