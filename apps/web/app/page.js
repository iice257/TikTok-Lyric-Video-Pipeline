"use client";

import Link from "next/link";
import { useMemo, useState } from "react";

import { apiFetch } from "@/lib/api";
import { formatDateTime } from "@/lib/format";
import { isActiveStatus, useResource } from "@/components/client-page";
import { AdminShell } from "@/components/admin/admin-shell";
import { EmptyState, Panel, StatusPill, VideoThumb, songName } from "@/components/app/bits";
import { Button } from "@/components/ui/button";

export const dynamic = "force-dynamic";

const workerIsBusy = (data) =>
  (data?.workers || []).some((worker) => !worker.is_stale && worker.status === "running");
const clipsAreBusy = (data) => (data?.clips || []).some((clip) => isActiveStatus(clip.status));

function Stat({ label, value, detail, href }) {
  const body = (
    <>
      <p className="text-sm text-muted-foreground">{label}</p>
      <p className={typeof value === "number" ? "mt-1 font-heading text-3xl" : "mt-2 font-heading text-xl"}>{value}</p>
      {detail ? <p className="mt-1 truncate text-xs text-muted-foreground">{detail}</p> : null}
    </>
  );
  const className = "rounded-3xl border border-border bg-card p-5 transition-colors";
  return href ? (
    <Link href={href} className={`${className} hover:border-primary/60`}>
      {body}
    </Link>
  ) : (
    <div className={className}>{body}</div>
  );
}

function Notice({ children, action }) {
  return (
    <div className="flex flex-col gap-3 rounded-3xl border border-primary/40 bg-primary/10 px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
      <p className="text-sm">{children}</p>
      {action}
    </div>
  );
}

export default function HomePage() {
  const summary = useResource("/dashboard/summary", null, { isActive: workerIsBusy });
  const clips = useResource("/clips", null, { isActive: clipsAreBusy });
  const songs = useResource("/songs");
  const [resuming, setResuming] = useState(false);

  const data = summary.data;
  const songsById = useMemo(
    () => Object.fromEntries((songs.data?.songs || []).map((song) => [song.id, song])),
    [songs.data?.songs]
  );
  const allClips = clips.data?.clips || [];
  const recent = allClips.slice(0, 8);
  const inProgress = allClips.filter((clip) => isActiveStatus(clip.status)).length;
  const ready = allClips.filter((clip) => clip.status === "rendered").length;
  const tiktok = data?.integrations?.tiktok;
  const liveWorkers = (data?.workers || []).filter((worker) => !worker.is_stale);
  const openAlerts = data?.counts?.open_alerts ?? 0;

  async function resume() {
    setResuming(true);
    try {
      await apiFetch("/pipeline/resume", { method: "POST" });
      await summary.reload(false);
    } finally {
      setResuming(false);
    }
  }

  return (
    <AdminShell
      title="Your videos"
      subtitle="Songs in, synced lyric clips out."
      actions={
        <Button asChild size="lg" className="rounded-full px-6">
          <Link href="/new">New video</Link>
        </Button>
      }
    >
      {summary.error ? <p className="text-sm text-destructive">{summary.error}</p> : null}

      {data?.pipeline?.paused ? (
        <Notice
          action={
            <Button size="sm" className="rounded-full" onClick={resume} disabled={resuming}>
              Resume
            </Button>
          }
        >
          Processing is paused. New songs wait until you resume.
        </Notice>
      ) : null}
      {data && !liveWorkers.length ? (
        <Notice>The worker isn&apos;t running, so nothing will render. Start it with <code>scripts/dev-no-docker.ps1</code>.</Notice>
      ) : null}
      {openAlerts ? (
        <Notice
          action={
            <Button asChild size="sm" variant="outline" className="rounded-full">
              <Link href="/alerts">Review</Link>
            </Button>
          }
        >
          {openAlerts === 1 ? "1 thing needs a look." : `${openAlerts} things need a look.`}
        </Notice>
      ) : null}

      <div className="grid gap-3 sm:grid-cols-3">
        <Stat label="In progress" value={inProgress} detail={inProgress ? "Rendering now" : "Nothing rendering"} href="/songs" />
        <Stat
          label="Scheduled"
          value={data?.counts?.upload_backlog ?? 0}
          detail={data?.next_publish_at ? `Next ${formatDateTime(data.next_publish_at)}` : `${ready} ready to schedule`}
          href="/queue"
        />
        <Stat
          label="TikTok"
          value={tiktok?.connected ? "Connected" : "Not connected"}
          detail={tiktok?.connected ? tiktok?.subject || "Ready to post" : "Connect in Settings"}
          href="/settings"
        />
      </div>

      <Panel>
        <div className="mb-5 flex items-center justify-between">
          <h2 className="font-heading text-2xl">Recent</h2>
          {allClips.length ? (
            <Link href="/songs" className="text-sm text-muted-foreground hover:text-foreground">
              See all
            </Link>
          ) : null}
        </div>
        {clips.loading ? <p className="text-sm text-muted-foreground">Loading…</p> : null}
        {!clips.loading && !recent.length ? (
          <EmptyState
            title="No videos yet"
            action={
              <Button asChild className="rounded-full">
                <Link href="/new">Start with a song</Link>
              </Button>
            }
          >
            Add a song with its lyrics and pick a look. Clips render automatically.
          </EmptyState>
        ) : null}
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
          {recent.map((clip) => (
            <Link key={clip.id} href={`/clips/${clip.id}`} className="group flex flex-col gap-2">
              <VideoThumb path={clip.status === "rendered" || clip.status === "posted" ? clip.video_path : null} className="transition-transform group-hover:-translate-y-0.5" />
              <div className="min-w-0">
                <p className="truncate text-sm font-medium">{songName(songsById[clip.song_id])}</p>
                <StatusPill status={clip.status} className="mt-1.5" />
              </div>
            </Link>
          ))}
        </div>
      </Panel>
    </AdminShell>
  );
}
