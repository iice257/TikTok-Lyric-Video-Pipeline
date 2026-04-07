"use client";

import { EmptyState, useResource } from "@/components/client-page";
import { Shell } from "@/components/shell";
import { Card } from "@/components/ui/card";

export default function LogsPage() {
  const { data, loading, error } = useResource("/operator-actions");

  return (
    <Shell title="Operator Logs" subtitle="Audit trail of control-panel mutations.">
      {loading ? <p className="text-sm text-muted-foreground">Loading logs...</p> : null}
      {error ? <p className="text-sm text-destructive">{error}</p> : null}
      {data?.operator_actions?.length ? (
        <div className="space-y-3">
          {data.operator_actions.map((action) => (
            <Card key={action.id} className="space-y-2 border-border bg-card p-4">
              <p className="text-sm font-semibold">{action.action}</p>
              <p className="text-sm text-muted-foreground">
                {action.target_type} | {action.target_id || "n/a"}
              </p>
              <p className="text-xs uppercase tracking-[0.2em] text-muted-foreground">{new Date(action.created_at).toLocaleString()}</p>
            </Card>
          ))}
        </div>
      ) : (
        <EmptyState title="No operator actions" body="Mutating API calls will appear here." />
      )}
    </Shell>
  );
}
