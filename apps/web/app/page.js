"use client";

import { useState } from "react";

import { apiFetch } from "@/lib/api";
import { useResource } from "@/components/client-page";
import { AdminShell } from "@/components/admin/admin-shell";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";

export const dynamic = "force-dynamic";

function eventTone(alert) {
  if (alert.severity === "error") return "destructive";
  if (alert.status === "acknowledged") return "secondary";
  return "outline";
}

export default function OverviewPage() {
  const { data, loading, error, setData } = useResource("/dashboard/summary");
  const [busy, setBusy] = useState(false);

  async function togglePipeline(paused) {
    setBusy(true);
    try {
      const payload = await apiFetch(paused ? "/pipeline/resume" : "/pipeline/pause", { method: "POST" });
      setData((current) => ({ ...current, pipeline: payload.settings }));
    } finally {
      setBusy(false);
    }
  }

  return (
    <AdminShell
      title="Live Event Stream"
      subtitle="Monitoring all pipeline activities and required actions"
      status={{
        state: data?.pipeline?.paused ? "PAUSED" : "RUNNING",
        worker: data?.workers?.length ? "ALIVE (2s)" : "IDLE",
        queue: `${data?.counts?.upload_backlog ?? 0} JOBS`,
      }}
      actions={
        <>
          <Button variant="destructive" size="sm" className="uppercase tracking-widest">
            Emergency Stop
          </Button>
          <Button
            size="sm"
            className="uppercase tracking-widest"
            disabled={busy}
            onClick={() => togglePipeline(Boolean(data?.pipeline?.paused))}
          >
            {data?.pipeline?.paused ? "Resume Flow" : "Pause Flow"}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        {loading ? <p className="text-sm text-muted-foreground">Loading event stream...</p> : null}
        {error ? <p className="text-sm text-destructive">{error}</p> : null}

        {data?.recent_alerts?.length ? (
          <div className="space-y-4">
            {data.recent_alerts.map((alert) => (
              <Card key={alert.id} className="border-border bg-card">
                <CardContent className="flex flex-wrap items-center justify-between gap-4 p-4">
                  <div className="min-w-0 flex-1 space-y-2">
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge variant={eventTone(alert)} className="uppercase tracking-widest">
                        {alert.kind}
                      </Badge>
                      <span className="text-xs text-muted-foreground">
                        {new Date(alert.created_at).toLocaleTimeString()}
                      </span>
                    </div>
                    <p className="text-base font-semibold">{alert.message}</p>
                    <p className="text-sm text-muted-foreground">
                      Severity: {alert.severity} | Status: {alert.status}
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <Button variant="outline" size="sm" className="uppercase tracking-widest">
                      Dismiss
                    </Button>
                    <Button size="sm" className="uppercase tracking-widest">
                      Retry Job
                    </Button>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        ) : (
          <Card className="border-border bg-card">
            <CardContent className="p-5 text-sm text-muted-foreground">No alerts in the current event stream.</CardContent>
          </Card>
        )}

        {data?.workers?.length ? (
          <Card className="border-border bg-card">
            <CardContent className="p-4">
              <p className="mb-3 text-xs font-bold uppercase tracking-widest text-muted-foreground">Worker Heartbeats</p>
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {data.workers.map((worker) => (
                  <div key={worker.id} className="space-y-2 border border-border bg-background/50 p-3">
                    <p className="text-sm font-semibold">{worker.worker_name}</p>
                    <p className="text-xs uppercase tracking-wider text-primary">{worker.status}</p>
                    <p className="text-xs text-muted-foreground">{worker.current_loop || "idle"}</p>
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
