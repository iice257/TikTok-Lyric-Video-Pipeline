"use client";

import { useState } from "react";

import { EmptyState, useResource } from "@/components/client-page";
import { Shell } from "@/components/shell";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { apiFetch } from "@/lib/api";

export default function AlertsPage() {
  const { data, loading, error, setData } = useResource("/alerts");
  const [busyId, setBusyId] = useState("");

  async function acknowledge(alertId) {
    setBusyId(alertId);
    try {
      const payload = await apiFetch(`/alerts/${alertId}/ack`, { method: "POST" });
      setData((current) => ({
        ...current,
        alerts: current.alerts.map((alert) => (alert.id === alertId ? payload.alert : alert)),
      }));
    } finally {
      setBusyId("");
    }
  }

  return (
    <Shell title="Active Alerts" subtitle="Failures, stalls, and token issues requiring action.">
      {loading ? <p className="text-sm text-muted-foreground">Loading alerts...</p> : null}
      {error ? <p className="text-sm text-destructive">{error}</p> : null}
      {data?.alerts?.length ? (
        <div className="space-y-4">
          {data.alerts.map((alert) => (
            <Card key={alert.id} className="space-y-4 border-border bg-card p-4">
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div className="space-y-2">
                  <h3 className="text-base font-semibold">{alert.kind}</h3>
                  <p className="text-sm text-muted-foreground">{alert.message}</p>
                </div>
                <div className="flex items-center gap-2">
                  <Badge className={alert.severity === "error" ? "border-destructive/40 bg-destructive/10 text-destructive" : "border-primary/30 bg-primary/10 text-primary"}>
                    {alert.severity}
                  </Badge>
                  <Badge variant="outline">{alert.status}</Badge>
                </div>
              </div>
              {alert.status !== "acknowledged" ? (
                <Button size="sm" onClick={() => acknowledge(alert.id)} disabled={busyId === alert.id}>
                  Acknowledge
                </Button>
              ) : null}
            </Card>
          ))}
        </div>
      ) : (
        <EmptyState title="No alerts" body="The monitor has not raised any active incidents." />
      )}
    </Shell>
  );
}
