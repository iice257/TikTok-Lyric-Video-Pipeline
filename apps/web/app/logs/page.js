"use client";

import { useResource } from "@/components/client-page";
import { AdminShell } from "@/components/admin/admin-shell";
import { Card, CardContent } from "@/components/ui/card";

export default function LogsPage() {
  const { data, loading, error } = useResource("/operator-actions");

  return (
    <AdminShell title="Operator Logs" subtitle="Audit trail of control-panel mutations.">
      <div className="space-y-3">
        {loading ? <p className="text-sm text-muted-foreground">Loading logs...</p> : null}
        {error ? <p className="text-sm text-destructive">{error}</p> : null}
        {(data?.operator_actions || []).map((action) => (
          <Card key={action.id} className="border-border bg-card">
            <CardContent className="space-y-2 p-4">
              <p className="text-sm font-semibold">{action.action}</p>
              <p className="text-xs uppercase tracking-wider text-muted-foreground">
                {action.target_type} | {action.target_id || "n/a"}
              </p>
              <p className="text-xs text-muted-foreground">{new Date(action.created_at).toLocaleString()}</p>
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
