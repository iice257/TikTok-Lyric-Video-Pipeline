"use client";

import { useMemo } from "react";

import { formatDateTime } from "@/lib/format";
import { useResource } from "@/components/client-page";
import { AdminShell } from "@/components/admin/admin-shell";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";

export default function LogsPage() {
  const { data, loading, error } = useResource("/operator-actions");

  const stats = useMemo(() => {
    const actions = data?.operator_actions || [];
    return {
      total: actions.length,
      uniqueTargets: new Set(actions.map((action) => `${action.target_type}:${action.target_id || "n/a"}`)).size,
    };
  }, [data?.operator_actions]);

  return (
    <AdminShell title="Operator Logs" subtitle="Audit trail of control-panel mutations.">
      <div className="grid gap-3 md:grid-cols-2">
        <Card className="border-border bg-card/80">
          <CardContent className="p-4">
            <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-muted-foreground">Recorded Actions</p>
            <p className="mt-3 text-3xl font-semibold tracking-tight">{stats.total}</p>
          </CardContent>
        </Card>
        <Card className="border-border bg-card/80">
          <CardContent className="p-4">
            <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-muted-foreground">Unique Targets</p>
            <p className="mt-3 text-3xl font-semibold tracking-tight">{stats.uniqueTargets}</p>
          </CardContent>
        </Card>
      </div>

      <div className="space-y-3">
        {loading ? <p className="text-sm text-muted-foreground">Loading logs...</p> : null}
        {error ? <p className="text-sm text-destructive">{error}</p> : null}

        {(data?.operator_actions || []).map((action) => (
          <Card key={action.id} className="border-border bg-card/80">
            <CardContent className="flex flex-col gap-3 p-4 lg:flex-row lg:items-center lg:justify-between">
              <div className="space-y-2">
                <p className="text-lg font-semibold tracking-tight">{action.action}</p>
                <p className="text-sm text-muted-foreground">
                  {action.target_type} | {action.target_id || "n/a"}
                </p>
                <p className="text-sm text-muted-foreground">{formatDateTime(action.created_at)}</p>
              </div>
              <Badge variant="outline" className="uppercase tracking-[0.18em]">
                {action.user_id || "system"}
              </Badge>
            </CardContent>
          </Card>
        ))}

        {!loading && !(data?.operator_actions || []).length ? (
          <Card className="border-border bg-card">
            <CardContent className="p-5 text-sm text-muted-foreground">No operator actions yet.</CardContent>
          </Card>
        ) : null}
      </div>
    </AdminShell>
  );
}
