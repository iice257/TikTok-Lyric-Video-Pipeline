"use client";

import { useState } from "react";

import { apiFetch } from "@/lib/api";
import { useResource } from "@/components/client-page";
import { AdminShell } from "@/components/admin/admin-shell";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";

function alertVariant(severity) {
  if (severity === "error") return "destructive";
  if (severity === "warning") return "secondary";
  return "outline";
}

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
    <AdminShell title="Alerts" subtitle="Failures, stalls, and token issues.">
      <div className="space-y-4">
        {loading ? <p className="text-sm text-muted-foreground">Loading alerts...</p> : null}
        {error ? <p className="text-sm text-destructive">{error}</p> : null}

        {(data?.alerts || []).map((alert) => (
          <Card key={alert.id} className="border-border bg-card">
            <CardContent className="space-y-3 p-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <p className="text-sm font-semibold">{alert.kind}</p>
                <div className="flex gap-2">
                  <Badge variant={alertVariant(alert.severity)} className="uppercase tracking-widest">
                    {alert.severity}
                  </Badge>
                  <Badge variant="outline" className="uppercase tracking-widest">
                    {alert.status}
                  </Badge>
                </div>
              </div>
              <p className="text-sm">{alert.message}</p>
              <p className="text-xs text-muted-foreground">{new Date(alert.created_at).toLocaleString()}</p>
              {alert.status !== "acknowledged" ? (
                <Button
                  onClick={() => acknowledge(alert.id)}
                  disabled={busyId === alert.id}
                  size="sm"
                  className="uppercase tracking-widest"
                >
                  Acknowledge
                </Button>
              ) : null}
            </CardContent>
          </Card>
        ))}

        {!loading && !(data?.alerts || []).length ? (
          <Card className="border-border bg-card">
            <CardContent className="p-5 text-sm text-muted-foreground">No alerts found.</CardContent>
          </Card>
        ) : null}
      </div>
    </AdminShell>
  );
}
