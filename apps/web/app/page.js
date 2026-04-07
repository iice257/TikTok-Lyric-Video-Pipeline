"use client";

import Link from "next/link";
import { useMemo, useState } from "react";

import { apiFetch, buildMediaUrl } from "@/lib/api";
import { useResource } from "@/components/client-page";
import { AdminShell } from "@/components/admin/admin-shell";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";

export const dynamic = "force-dynamic";

function eventTone(alert) {
  if (alert.severity === "error") {
    return "destructive";
  }
  if (alert.status === "acknowledged") {
    return "secondary";
  }
  return "outline";
}

function describeCountdown(nextPublishAt) {
  if (!nextPublishAt) {
    return "Next post: unscheduled";
  }

  const deltaMs = new Date(nextPublishAt).getTime() - Date.now();
  if (Number.isNaN(deltaMs) || deltaMs <= 0) {
    return "Next post: due now";
  }

  const totalMinutes = Math.floor(deltaMs / 60000);
  const days = Math.floor(totalMinutes / (24 * 60));
  const hours = Math.floor((totalMinutes % (24 * 60)) / 60);
  const minutes = totalMinutes % 60;
  return `Next post: ${days}d ${hours}h ${minutes}m`;
}

export default function OverviewPage() {
  const { data, loading, error, reload } = useResource("/dashboard/summary");
  const [busy, setBusy] = useState(false);
  const [busyAlertId, setBusyAlertId] = useState("");
  const [busyUploadId, setBusyUploadId] = useState("");

  const nextPublishLabel = useMemo(
    () => describeCountdown(data?.next_publish_at),
    [data?.next_publish_at]
  );

  async function togglePipeline(paused) {
    setBusy(true);
    try {
      await apiFetch(paused ? "/pipeline/resume" : "/pipeline/pause", { method: "POST" });
      await reload(false);
    } finally {
      setBusy(false);
    }
  }

  async function acknowledgeAlert(alertId) {
    setBusyAlertId(alertId);
    try {
      await apiFetch(`/alerts/${alertId}/ack`, { method: "POST" });
      await reload(false);
    } finally {
      setBusyAlertId("");
    }
  }

  async function handleUploadAction(jobId, path, body) {
    setBusyUploadId(jobId);
    try {
      await apiFetch(path, {
        method: "POST",
        body: body ? JSON.stringify(body) : undefined,
      });
      await reload(false);
    } finally {
      setBusyUploadId("");
    }
  }

  return (
    <AdminShell
      title="Live Event Stream"
      subtitle="Monitoring all pipeline activities and required actions"
      status={{
        state: data?.pipeline?.paused ? "PAUSED" : "RUNNING",
        worker: data?.workers?.length ? "ALIVE (2s)" : "IDLE",
        queue: `${data?.counts?.upload_backlog ?? 0} Jobs`,
      }}
      actions={
        <>
          <Button variant="outline" size="sm" disabled className="uppercase tracking-[0.18em] text-destructive">
            {nextPublishLabel}
          </Button>
          <Button variant="destructive" size="sm" disabled className="uppercase tracking-[0.18em]">
            Emergency Stop
          </Button>
          <Button
            size="sm"
            className="uppercase tracking-[0.18em]"
            disabled={busy}
            onClick={() => togglePipeline(Boolean(data?.pipeline?.paused))}
          >
            {data?.pipeline?.paused ? "Resume Flow" : "Pause Flow"}
          </Button>
        </>
      }
    >
      <div className="flex items-center justify-end gap-2">
        <Button variant="outline" size="sm" disabled className="uppercase tracking-[0.18em] text-muted-foreground">
          Filter
        </Button>
        <Button variant="outline" size="sm" disabled className="uppercase tracking-[0.18em] text-muted-foreground">
          Clear
        </Button>
      </div>

      <div className="space-y-5">
        {loading ? <p className="text-sm text-muted-foreground">Loading event stream...</p> : null}
        {error ? <p className="text-sm text-destructive">{error}</p> : null}

        {(data?.pending_upload_jobs || []).map((job) => (
          <Card key={job.id} className="border-border bg-card/80">
            <CardContent className="flex flex-col gap-4 p-4 md:flex-row md:items-center md:justify-between">
              <div className="flex min-w-0 flex-1 items-center gap-4">
                <div className="flex size-16 shrink-0 items-center justify-center overflow-hidden rounded-md border border-border bg-background">
                  {job.clip_preview_path || job.clip_video_path ? (
                    <video
                      className="h-full w-full object-cover"
                      muted
                      playsInline
                      preload="metadata"
                      src={buildMediaUrl(job.clip_preview_path || job.clip_video_path)}
                    />
                  ) : null}
                </div>
                <div className="min-w-0 space-y-2">
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge className="uppercase tracking-[0.18em]">Pending Approval</Badge>
                    <span className="text-[11px] uppercase tracking-[0.16em] text-muted-foreground">
                      {job.song_artist && job.song_title ? `${job.song_artist} | ${job.song_title}` : job.publish_mode}
                    </span>
                  </div>
                  <p className="truncate text-lg font-semibold tracking-tight">
                    {job.clip_caption || job.id}
                  </p>
                  <p className="text-sm text-muted-foreground">
                    Scheduled {job.scheduled_at ? new Date(job.scheduled_at).toLocaleString() : "unscheduled"} | {job.status}
                  </p>
                </div>
              </div>

              <div className="flex flex-wrap gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  disabled={busyUploadId === job.id}
                  onClick={() =>
                    handleUploadAction(job.id, `/jobs/${job.id}/quarantine`, {
                      reason: "rejected from event console",
                    })
                  }
                  className="uppercase tracking-[0.18em]"
                >
                  Reject
                </Button>
                <Button
                  size="sm"
                  disabled={busyUploadId === job.id}
                  onClick={() => handleUploadAction(job.id, `/upload-jobs/${job.id}/approve`)}
                  className="uppercase tracking-[0.18em]"
                >
                  Approve & Post
                </Button>
              </div>
            </CardContent>
          </Card>
        ))}

        {data?.recent_alerts?.length ? (
          <div className="space-y-4">
            {data.recent_alerts.map((alert) => (
              <Card key={alert.id} className="border-border bg-card/80">
                <CardContent className="flex flex-col gap-4 p-4 md:flex-row md:items-center md:justify-between">
                  <div className="min-w-0 flex-1 space-y-2">
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge variant={eventTone(alert)} className="uppercase tracking-[0.18em]">
                        {alert.kind.replaceAll("_", " ")}
                      </Badge>
                      <span className="text-[11px] uppercase tracking-[0.16em] text-muted-foreground">
                        {new Date(alert.created_at).toLocaleTimeString()} | {alert.source_type || "system"}
                      </span>
                    </div>
                    <p className="text-lg font-semibold tracking-tight">{alert.message}</p>
                    <p className="text-sm text-muted-foreground">
                      Severity: {alert.severity} | Status: {alert.status}
                    </p>
                  </div>

                  <div className="flex flex-wrap gap-2">
                    {alert.status !== "acknowledged" ? (
                      <Button
                        variant="outline"
                        size="sm"
                        disabled={busyAlertId === alert.id}
                        onClick={() => acknowledgeAlert(alert.id)}
                        className="uppercase tracking-[0.18em]"
                      >
                        Acknowledge
                      </Button>
                    ) : null}
                    {alert.source_id ? (
                      <Button variant="ghost" size="sm" disabled className="uppercase tracking-[0.18em] text-muted-foreground">
                        Source {alert.source_id.slice(0, 8)}
                      </Button>
                    ) : null}
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        ) : (
          <Card className="border-border bg-card">
            <CardContent className="p-5 text-sm text-muted-foreground">
              No alerts in the current event stream.
            </CardContent>
          </Card>
        )}

        {data?.workers?.length ? (
          <Card className="border-border bg-card/80">
            <CardContent className="space-y-4 p-4">
              <div className="flex items-center justify-between gap-3">
                <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-muted-foreground">
                  Worker Heartbeats
                </p>
                <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-muted-foreground">
                  {data.workers.length} active
                </p>
              </div>

              <div className="grid gap-3 lg:grid-cols-3">
                {data.workers.map((worker) => (
                  <div key={worker.id} className="rounded-md border border-border bg-background px-4 py-3">
                    <p className="text-sm font-semibold">{worker.worker_name}</p>
                    <p className="mt-1 text-[11px] font-bold uppercase tracking-[0.16em] text-primary">
                      {worker.status}
                    </p>
                    <p className="mt-2 text-sm text-muted-foreground">{worker.current_loop || "idle"}</p>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        ) : null}

        {!data?.integrations?.tiktok?.connected || data?.integrations?.tiktok?.last_error ? (
          <Card className="border-border bg-card/80">
            <CardContent className="flex flex-col gap-4 p-4 md:flex-row md:items-center md:justify-between">
              <div className="space-y-2">
                <div className="flex flex-wrap items-center gap-2">
                  <Badge variant="secondary" className="uppercase tracking-[0.18em]">
                    Auth Required
                  </Badge>
                  <span className="text-[11px] uppercase tracking-[0.16em] text-muted-foreground">
                    Account: {data?.integrations?.tiktok?.creator_nickname || data?.integrations?.tiktok?.subject || "unlinked"}
                  </span>
                </div>
                <p className="text-lg font-semibold tracking-tight">
                  {data?.integrations?.tiktok?.connected ? "TikTok token needs attention" : "TikTok API session missing"}
                </p>
                <p className="text-sm text-muted-foreground">
                  {data?.integrations?.tiktok?.last_error || "Scheduled uploads will stall until the TikTok connection is refreshed."}
                </p>
              </div>

              <Button asChild variant="outline" size="sm" className="uppercase tracking-[0.18em]">
                <Link href="/settings">Re-authenticate</Link>
              </Button>
            </CardContent>
          </Card>
        ) : null}

        <Card className="border-border bg-card/60">
          <CardContent className="flex flex-col gap-2 p-4 md:flex-row md:items-center md:justify-between">
            <div className="space-y-1">
              <div className="flex flex-wrap items-center gap-2">
                <Badge variant="outline" className="uppercase tracking-[0.18em]">
                  System
                </Badge>
                <span className="text-[11px] uppercase tracking-[0.16em] text-muted-foreground">
                  Pipeline
                </span>
              </div>
              <p className="text-lg font-semibold tracking-tight">
                {data?.health === "healthy" ? "System healthy and synchronized" : "Pipeline requires operator attention"}
              </p>
              <p className="text-sm text-muted-foreground">
                {data?.counts?.render_backlog ?? 0} render jobs | {data?.counts?.upload_backlog ?? 0} upload jobs | {data?.counts?.open_alerts ?? 0} open alerts
              </p>
            </div>

            <Button asChild variant="ghost" size="sm" className="uppercase tracking-[0.18em] text-muted-foreground">
              <Link href="/logs">Open Logs</Link>
            </Button>
          </CardContent>
        </Card>
      </div>
    </AdminShell>
  );
}
