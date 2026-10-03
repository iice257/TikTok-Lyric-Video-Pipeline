"use client";

import Link from "next/link";
import { useParams } from "next/navigation";

import { buildMediaUrl } from "@/lib/api";
import { formatDuration } from "@/lib/format";
import { isActiveStatus, useResource } from "@/components/client-page";
import { AdminShell } from "@/components/admin/admin-shell";
import { EmptyState, Panel, StatusPill, VideoThumb } from "@/components/app/bits";
import { presetSummary } from "@/components/app/preset-picker";

export const dynamic = "force-dynamic";

function songIsBusy(data) {
  return isActiveStatus(data?.song?.status) || (data?.clips || []).some((clip) => isActiveStatus(clip.status));
}

export default function SongPage() {
  const params = useParams();
  const songId = typeof params?.id === "string" ? params.id : "";
  const { data, loading, error } = useResource(songId ? `/songs/${encodeURIComponent(songId)}` : "", null, {
    enabled: Boolean(songId),
    isActive: songIsBusy,
  });
  const presets = useResource("/presets", null, { intervalMs: 0 });
  const song = data?.song;
  const preset = (presets.data?.presets || []).find((item) => item.id === song?.preset_id);
  const lyrics = (data?.lyrics_artifacts || [])[0];

  return (
    <AdminShell title={song?.title || "Song"} subtitle={song?.artist}>
      {loading ? <p className="text-sm text-muted-foreground">Loading…</p> : null}
      {error ? <p className="text-sm text-destructive">{error}</p> : null}

      {song ? (
        <Panel className="flex flex-col gap-5 sm:flex-row sm:items-center">
          <div className="size-28 shrink-0 overflow-hidden rounded-2xl bg-muted">
            {song.cover_path ? (
              // Media is served by the API, so next/image optimisation doesn't apply.
              // eslint-disable-next-line @next/next/no-img-element
              <img src={buildMediaUrl(song.cover_path)} alt="" className="h-full w-full object-cover" />
            ) : null}
          </div>
          <div className="flex min-w-0 flex-col gap-2">
            <StatusPill status={song.status} />
            <p className="text-sm text-muted-foreground">{preset ? `${preset.name} · ${presetSummary(preset)}` : "Surprise me"}</p>
            <p className="text-sm text-muted-foreground">
              {lyrics ? `${lyrics.line_count} lyric lines${lyrics.was_aligned ? ", auto-timed" : ""}` : "No lyrics found"}
            </p>
            {song.last_error ? <p className="text-sm text-destructive">{song.last_error}</p> : null}
          </div>
          <a href={buildMediaUrl(song.audio_path)} target="_blank" rel="noreferrer" className="text-sm text-primary hover:underline sm:ml-auto">
            Play audio
          </a>
        </Panel>
      ) : null}

      <Panel>
        <h2 className="mb-5 font-heading text-2xl">Clips</h2>
        {!loading && !(data?.clips || []).length ? (
          <EmptyState title="No clips yet">They appear here as soon as the song has been split into moments.</EmptyState>
        ) : null}
        <div className="grid grid-cols-2 gap-5 sm:grid-cols-3 lg:grid-cols-5">
          {(data?.clips || []).map((clip) => {
            const segment = (data?.segment_candidates || []).find((item) => item.id === clip.segment_candidate_id);
            return (
              <Link key={clip.id} href={`/clips/${clip.id}`} className="group flex flex-col gap-2">
                <VideoThumb
                  path={["rendered", "posted"].includes(clip.status) ? clip.video_path : null}
                  className="transition-transform group-hover:-translate-y-0.5"
                />
                <p className="truncate text-sm text-muted-foreground">
                  {segment ? `${formatDuration(segment.start_second)}–${formatDuration(segment.end_second)}` : formatDuration(clip.duration_seconds)}
                </p>
                <StatusPill status={clip.status} />
              </Link>
            );
          })}
        </div>
      </Panel>
    </AdminShell>
  );
}
