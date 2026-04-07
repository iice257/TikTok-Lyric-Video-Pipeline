"use client";

import { useMemo, useState } from "react";

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

  const stats = useMemo(() => {
    const alerts = data?.alerts || [];
    return {
      open: alerts.filter((alert) => alert.status !== "acknowledged").length,
      critical: alerts.filter((alert) => alert.severity === "error").length,
      total: alerts.length,
    };
  }, [data?.alerts]);

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
    <AdminShell
      title="Alerts"
      subtitle="Failures, stalls, and token issues."
      status={{ queue: `${stats.open} Open` }}
    >
      <div className="grid gap-3 md:grid-cols-3">
        <Card className="border-border bg-card/80">
          <CardContent className="p-4">
            <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-muted-foreground">Open</p>
            <p className="mt-3 text-3xl font-semibold tracking-tight">{stats.open}</p>
          </CardContent>
        </Card>
        <Card className="border-border bg-card/80">
          <CardContent className="p-4">
            <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-muted-foreground">Critical</p>
            <p className="mt-3 text-3xl font-semibold tracking-tight text-primary">{stats.critical}</p>
          </CardContent>
        </Card>
        <Card className="border-border bg-card/80">
          <CardContent className="p-4">
            <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-muted-foreground">Total</p>
            <p className="mt-3 text-3xl font-semibold tracking-tight">{stats.total}</p>
          </CardContent>
        </Card>
      </div>

      <div className="space-y-4">
        {loading ? <p className="text-sm text-muted-foreground">Loading alerts...</p> : null}
        {error ? <p className="text-sm text-destructive">{error}</p> : null}

        {(data?.alerts || []).map((alert) => (
          <Card key={alert.id} className="border-border bg-card/80">
            <CardContent className="flex flex-col gap-4 p-4">
              <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                <div className="space-y-2">
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge variant={alertVariant(alert.severity)} className="uppercase tracking-[0.18em]">
                      {alert.kind}
                    </Badge>
                    <Badge variant="outline" className="uppercase tracking-[0.18em]">
                      {alert.status}
                    </Badge>
                  </div>
                  <p className="text-lg font-semibold tracking-tight">{alert.message}</p>
                  <p className="text-sm text-muted-foreground">
                    {new Date(alert.created_at).toLocaleString()} | {alert.source_type || "system"}
                  </p>
                  {alert.source_id ? (
                    <p className="text-xs uppercase tracking-[0.18em] text-muted-foreground">
                      Source {alert.source_id}
                    </p>
                  ) : null}
                </div>

                {alert.status !== "acknowledged" ? (
                  <Button
                    onClick={() => acknowledge(alert.id)}
                    disabled={busyId === alert.id}
                    size="sm"
                    className="uppercase tracking-[0.18em]"
                  >
                    Acknowledge
                  </Button>
                ) : null}
              </div>
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
