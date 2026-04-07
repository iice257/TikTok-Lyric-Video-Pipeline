"use client";

import { useMemo, useState } from "react";

import { apiFetch } from "@/lib/api";
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
  const { data, loading, error, setData } = useResource("/dashboard/summary");
  const [busy, setBusy] = useState(false);
  const [busyAlertId, setBusyAlertId] = useState("");

  const nextPublishLabel = useMemo(
    () => describeCountdown(data?.next_publish_at),
    [data?.next_publish_at]
  );

  async function togglePipeline(paused) {
    setBusy(true);
    try {
      const payload = await apiFetch(paused ? "/pipeline/resume" : "/pipeline/pause", { method: "POST" });
      setData((current) => ({ ...current, pipeline: payload.settings }));
    } finally {
      setBusy(false);
    }
  }

  async function acknowledgeAlert(alertId) {
    setBusyAlertId(alertId);
    try {
      const payload = await apiFetch(`/alerts/${alertId}/ack`, { method: "POST" });
      setData((current) => ({
        ...current,
        recent_alerts: current.recent_alerts.map((alert) => (alert.id === alertId ? payload.alert : alert)),
      }));
    } finally {
      setBusyAlertId("");
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
        <Button variant="ghost" size="sm" disabled className="uppercase tracking-[0.18em] text-muted-foreground">
          Filter
        </Button>
        <Button variant="ghost" size="sm" disabled className="uppercase tracking-[0.18em] text-muted-foreground">
          Clear
        </Button>
      </div>

      <div className="space-y-5">
        {loading ? <p className="text-sm text-muted-foreground">Loading event stream...</p> : null}
        {error ? <p className="text-sm text-destructive">{error}</p> : null}

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
                        {new Date(alert.created_at).toLocaleTimeString()} • {alert.source_type || "system"}
                      </span>
                    </div>
                    <p className="text-lg font-semibold tracking-tight">{alert.message}</p>
                    <p className="text-sm text-muted-foreground">
                      Severity: {alert.severity} • Status: {alert.status}
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
      </div>
    </AdminShell>
  );
}
