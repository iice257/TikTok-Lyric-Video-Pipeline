"use client";

import Link from "next/link";
import { useMemo, useState } from "react";

import { apiFetch, toDatetimeLocal } from "@/lib/api";
import { formatDateTime } from "@/lib/format";
import { isActiveStatus, useResource } from "@/components/client-page";
import { AdminShell } from "@/components/admin/admin-shell";
import { EmptyState, Panel, StatusPill, VideoThumb, songName } from "@/components/app/bits";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export const dynamic = "force-dynamic";

const uploadsAreBusy = (data) => (data?.upload_jobs || []).some((job) => isActiveStatus(job.status));
const DONE = ["posted", "cancelled"];

function JobRow({ job, clip, song, busy, onAction }) {
  const [editing, setEditing] = useState(false);
  const [when, setWhen] = useState(toDatetimeLocal(job.scheduled_at));
  const done = DONE.includes(job.status);
  const needsApproval = !job.approved_at && !done;

  function saveSchedule() {
    const date = new Date(when);
    if (!when || Number.isNaN(date.getTime())) return;
    onAction(`/upload-jobs/${job.id}/reschedule`, { scheduled_at: date.toISOString() });
    setEditing(false);
  }

  return (
    <div className="flex gap-4 rounded-2xl border border-border p-3">
      <Link href={`/clips/${job.clip_id}`} className="w-16 shrink-0">
        <VideoThumb path={clip?.video_path} className="rounded-xl" />
      </Link>
      <div className="flex min-w-0 flex-1 flex-col gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <p className="truncate font-medium">{songName(song)}</p>
          <StatusPill status={needsApproval ? "pending" : job.status} />
        </div>
        <p className="text-sm text-muted-foreground">
          {job.status === "posted" ? "Posted" : "Posts"} {formatDateTime(job.completed_at || job.scheduled_at, "when ready")}
          {{ draft: " · as a draft", direct: " · directly" }[job.publish_mode] || ""}
        </p>
        {job.last_error ? <p className="text-sm text-destructive">{job.last_error}</p> : null}
        {editing ? (
          <div className="flex flex-wrap items-center gap-2">
            <Input
              type="datetime-local"
              value={when}
              onChange={(event) => setWhen(event.target.value)}
              aria-label="New post time"
              className="h-9 w-auto rounded-full"
            />
            <Button size="sm" className="rounded-full" onClick={saveSchedule} disabled={busy}>
              Save
            </Button>
            <Button size="sm" variant="ghost" className="rounded-full" onClick={() => setEditing(false)}>
              Cancel
            </Button>
          </div>
        ) : !done ? (
          <div className="flex flex-wrap gap-2">
            {needsApproval ? (
              <Button size="sm" className="rounded-full" disabled={busy} onClick={() => onAction(`/upload-jobs/${job.id}/approve`)}>
                Approve
              </Button>
            ) : null}
            <Button size="sm" variant="outline" className="rounded-full" disabled={busy} onClick={() => onAction(`/upload-jobs/${job.id}/force-publish`)}>
              Post now
            </Button>
            <Button size="sm" variant="ghost" className="rounded-full" disabled={busy} onClick={() => setEditing(true)}>
              Change time
            </Button>
            {job.status === "failed" ? (
              <Button size="sm" variant="ghost" className="rounded-full" disabled={busy} onClick={() => onAction(`/jobs/${job.id}/retry`, { reason: "retried from schedule" })}>
                Retry
              </Button>
            ) : null}
            <Button size="sm" variant="ghost" className="rounded-full text-muted-foreground" disabled={busy} onClick={() => onAction(`/jobs/${job.id}/cancel`, { reason: "cancelled from schedule" })}>
              Remove
            </Button>
          </div>
        ) : null}
      </div>
    </div>
  );
}

export default function SchedulePage() {
  const jobs = useResource("/upload-jobs", null, { isActive: uploadsAreBusy });
  const clips = useResource("/clips");
  const songs = useResource("/songs");
  const [busyId, setBusyId] = useState("");
  const [error, setError] = useState("");

  const clipsById = useMemo(() => Object.fromEntries((clips.data?.clips || []).map((clip) => [clip.id, clip])), [clips.data?.clips]);
  const songsById = useMemo(() => Object.fromEntries((songs.data?.songs || []).map((song) => [song.id, song])), [songs.data?.songs]);

  const groups = useMemo(() => {
    const all = jobs.data?.upload_jobs || [];
    const bySchedule = (a, b) => new Date(a.scheduled_at || 0) - new Date(b.scheduled_at || 0);
    return [
      { title: "Needs approval", items: all.filter((job) => !job.approved_at && !DONE.includes(job.status)).sort(bySchedule) },
      { title: "Upcoming", items: all.filter((job) => job.approved_at && !DONE.includes(job.status)).sort(bySchedule) },
      { title: "History", items: all.filter((job) => DONE.includes(job.status)).sort((a, b) => bySchedule(b, a)) },
    ];
  }, [jobs.data?.upload_jobs]);

  async function runAction(job, path, body) {
    setBusyId(job.id);
    setError("");
    try {
      await apiFetch(path, { method: "POST", body: body ? JSON.stringify(body) : undefined });
      await jobs.reload(false);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusyId("");
    }
  }

  const empty = !jobs.loading && !(jobs.data?.upload_jobs || []).length;

  return (
    <AdminShell title="Schedule" subtitle="Rendered clips waiting to post to TikTok.">
      {error ? <p aria-live="polite" className="text-sm text-destructive">{error}</p> : null}
      {jobs.error ? <p className="text-sm text-destructive">{jobs.error}</p> : null}
      {jobs.loading ? <p className="text-sm text-muted-foreground">Loading…</p> : null}
      {empty ? (
        <EmptyState title="Nothing scheduled">Clips land here once they finish rendering.</EmptyState>
      ) : null}
      {groups
        .filter((group) => group.items.length)
        .map((group) => (
          <Panel key={group.title} className="flex flex-col gap-3">
            <h2 className="font-heading text-2xl">
              {group.title} <span className="text-base text-muted-foreground">{group.items.length}</span>
            </h2>
            {group.items.map((job) => {
              const clip = clipsById[job.clip_id];
              return (
                <JobRow
                  key={job.id}
                  job={job}
                  clip={clip}
                  song={clip ? songsById[clip.song_id] : null}
                  busy={busyId === job.id}
                  onAction={(path, body) => runAction(job, path, body)}
                />
              );
            })}
          </Panel>
        ))}
    </AdminShell>
  );
}
