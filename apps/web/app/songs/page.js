"use client";

import Link from "next/link";
import { useDeferredValue, useMemo, useState } from "react";

import { buildMediaUrl } from "@/lib/api";
import { formatDuration } from "@/lib/format";
import { cn } from "@/lib/utils";
import { isActiveStatus, useResource } from "@/components/client-page";
import { AdminShell } from "@/components/admin/admin-shell";
import { EmptyState, StatusPill, VideoThumb, songName } from "@/components/app/bits";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export const dynamic = "force-dynamic";

const clipsAreBusy = (data) => (data?.clips || []).some((clip) => isActiveStatus(clip.status));
const songsAreBusy = (data) => (data?.songs || []).some((song) => isActiveStatus(song.status));

const FILTERS = [
  { id: "all", label: "All", test: () => true },
  { id: "progress", label: "In progress", test: (status) => isActiveStatus(status) },
  { id: "ready", label: "Ready", test: (status) => status === "rendered" },
  { id: "posted", label: "Posted", test: (status) => status === "posted" },
  { id: "failed", label: "Failed", test: (status) => status === "failed" },
];

function Chip({ active, onClick, children }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        "h-9 rounded-full px-4 text-sm transition-colors",
        active ? "bg-primary text-primary-foreground" : "bg-card text-muted-foreground hover:text-foreground"
      )}
    >
      {children}
    </button>
  );
}

export default function LibraryPage() {
  const clipResource = useResource("/clips", null, { isActive: clipsAreBusy });
  const songResource = useResource("/songs", null, { isActive: songsAreBusy });
  const presetResource = useResource("/presets", null, { intervalMs: 0 });
  const [view, setView] = useState("clips");
  const [filter, setFilter] = useState("all");
  const [query, setQuery] = useState("");
  const search = useDeferredValue(query.trim().toLowerCase());

  const songsById = useMemo(
    () => Object.fromEntries((songResource.data?.songs || []).map((song) => [song.id, song])),
    [songResource.data?.songs]
  );
  const presetNames = useMemo(
    () => Object.fromEntries((presetResource.data?.presets || []).map((preset) => [preset.id, preset.name])),
    [presetResource.data?.presets]
  );
  const test = FILTERS.find((item) => item.id === filter).test;

  const clips = useMemo(
    () =>
      (clipResource.data?.clips || []).filter((clip) => {
        const text = `${songName(songsById[clip.song_id])} ${clip.caption || ""}`.toLowerCase();
        return test(clip.status) && (!search || text.includes(search));
      }),
    [clipResource.data?.clips, songsById, search, test]
  );
  const songs = useMemo(
    () =>
      (songResource.data?.songs || []).filter(
        (song) => test(song.status) && (!search || songName(song).toLowerCase().includes(search))
      ),
    [songResource.data?.songs, search, test]
  );

  const loading = view === "clips" ? clipResource.loading : songResource.loading;
  const error = view === "clips" ? clipResource.error : songResource.error;

  return (
    <AdminShell
      title="Library"
      subtitle="Every song you've added and the clips made from it."
      actions={
        <Button asChild className="rounded-full">
          <Link href="/new">New video</Link>
        </Button>
      }
    >
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex w-fit gap-1 rounded-full border border-border p-1">
          {["clips", "songs"].map((item) => (
            <button
              key={item}
              type="button"
              onClick={() => setView(item)}
              aria-pressed={view === item}
              className={cn(
                "h-8 rounded-full px-5 text-sm capitalize transition-colors",
                view === item ? "bg-foreground text-background" : "text-muted-foreground hover:text-foreground"
              )}
            >
              {item}
            </button>
          ))}
        </div>
        <div className="flex flex-wrap gap-2">
          {FILTERS.map((item) => (
            <Chip key={item.id} active={filter === item.id} onClick={() => setFilter(item.id)}>
              {item.label}
            </Chip>
          ))}
        </div>
      </div>
      <Input
        value={query}
        onChange={(event) => setQuery(event.target.value)}
        placeholder="Search by artist or title"
        aria-label="Search library"
        className="h-11 rounded-full px-5"
      />

      {loading ? <p className="text-sm text-muted-foreground">Loading…</p> : null}
      {error ? <p className="text-sm text-destructive">{error}</p> : null}

      {view === "clips" ? (
        <div className="grid grid-cols-2 gap-5 sm:grid-cols-3 lg:grid-cols-5">
          {clips.map((clip) => (
            <Link key={clip.id} href={`/clips/${clip.id}`} className="group flex flex-col gap-2">
              <VideoThumb
                path={clip.status === "rendered" || clip.status === "posted" ? clip.video_path : null}
                className="transition-transform group-hover:-translate-y-0.5"
              />
              <div className="min-w-0">
                <p className="truncate text-sm font-medium">{songName(songsById[clip.song_id])}</p>
                <p className="truncate text-xs text-muted-foreground">
                  {formatDuration(clip.duration_seconds)}
                  {clip.preset_id ? ` · ${presetNames[clip.preset_id] || clip.preset_id}` : ""}
                </p>
                <StatusPill status={clip.status} className="mt-1.5" />
              </div>
            </Link>
          ))}
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          {songs.map((song) => (
            <Link
              key={song.id}
              href={`/songs/${song.id}`}
              className="flex items-center gap-4 rounded-2xl border border-border bg-card p-3 transition-colors hover:border-primary/60"
            >
              <div className="size-14 shrink-0 overflow-hidden rounded-xl bg-muted">
                {song.cover_path ? (
                  // Media is served by the API, so next/image optimisation doesn't apply.
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={buildMediaUrl(song.cover_path)} alt="" className="h-full w-full object-cover" />
                ) : null}
              </div>
              <div className="min-w-0 flex-1">
                <p className="truncate font-medium">{song.title}</p>
                <p className="truncate text-sm text-muted-foreground">
                  {song.artist}
                  {song.preset_id ? ` · ${presetNames[song.preset_id] || song.preset_id}` : ""}
                </p>
              </div>
              <StatusPill status={song.status} />
            </Link>
          ))}
        </div>
      )}

      {!loading && !(view === "clips" ? clips : songs).length ? (
        <EmptyState title={query || filter !== "all" ? "Nothing matches" : "Nothing here yet"}>
          {query || filter !== "all" ? "Try a different search or filter." : "Songs you add show up here with their clips."}
        </EmptyState>
      ) : null}
    </AdminShell>
  );
}
