"use client";

import { AlertTriangle, CheckCircle2, Eye, KeyRound } from "lucide-react";
import { useState } from "react";

import { EmptyState, useResource } from "@/components/client-page";
import { Shell } from "@/components/shell";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { apiFetch } from "@/lib/api";

function EventIcon({ kind, severity }) {
  if (kind?.includes("auth")) {
    return <KeyRound className="size-5" />;
  }
  if (severity === "error") {
    return <AlertTriangle className="size-5" />;
  }
  if (kind?.includes("approval")) {
    return <Eye className="size-5" />;
  }
  return <CheckCircle2 className="size-5" />;
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
    <Shell
      title="Live Event Stream"
      subtitle="Monitoring all pipeline activities and required actions"
      status={data?.pipeline?.paused ? "PAUSED" : "RUNNING"}
      queueCount={data?.counts?.upload_backlog || 0}
      workerLabel={data?.workers?.[0] ? `${data.workers[0].status.toUpperCase()} (${data.workers[0].current_loop || "idle"})` : "ALIVE (2s)"}
      rightActions={
        <Button size="sm" className="uppercase" onClick={() => togglePipeline(Boolean(data?.pipeline?.paused))} disabled={busy}>
          {data?.pipeline?.paused ? "Resume Flow" : "Pause Flow"}
        </Button>
      }
    >
      {loading ? <p className="text-sm text-muted-foreground">Loading dashboard...</p> : null}
      {error ? <p className="text-sm text-destructive">{error}</p> : null}

      {data?.recent_alerts?.length ? (
        <div className="flex flex-col gap-6 pb-12">
          {data.recent_alerts.map((alert, index) => (
            <div key={alert.id || `${alert.kind}-${index}`} className="event-node relative flex items-start gap-4">
              <div
                className={`relative z-10 flex size-11 items-center justify-center rounded-full border ${
                  alert.severity === "error" ? "border-destructive/40 bg-destructive/10 text-destructive" : "border-primary/40 bg-primary/10 text-primary"
                }`}
              >
                <EventIcon kind={alert.kind} severity={alert.severity} />
              </div>
              <Card className="w-full border-border bg-card/80 p-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="space-y-2">
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge variant="outline" className="uppercase">
                        {alert.severity === "error" ? "Critical Alert" : "Pending Approval"}
                      </Badge>
                      <span className="text-xs text-muted-foreground">{new Date(alert.created_at).toLocaleTimeString()}</span>
                    </div>
                    <h3 className="text-base font-semibold">{alert.kind}</h3>
                    <p className="text-sm text-muted-foreground">{alert.message}</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <Button size="sm" variant="outline" className="uppercase">
                      Dismiss
                    </Button>
                    <Button size="sm" className="uppercase">
                      Retry Job
                    </Button>
                  </div>
                </div>
              </Card>
            </div>
          ))}
        </div>
      ) : (
        <EmptyState title="No events yet" body="Pipeline events and approvals will stream here once jobs begin running." />
      )}
    </Shell>
  );
}
