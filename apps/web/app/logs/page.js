"use client";

import { EmptyState, useResource } from "@/components/client-page";
import { Panel, Shell } from "@/components/shell";

export default function LogsPage() {
  const { data, loading, error } = useResource("/operator-actions");

  return (
    <Shell title="Logs">
      <Panel title="Operator Actions" subtitle="Audit trail of control-panel mutations">
        {loading ? <p>Loading logs...</p> : null}
        {error ? <p className="errorText">{error}</p> : null}
        {data?.operator_actions?.length ? (
          <div className="list">
            {data.operator_actions.map((action) => (
              <div className="itemCard" key={action.id}>
                <strong>{action.action}</strong>
                <p className="muted">{action.target_type} · {action.target_id || "n/a"}</p>
                <p className="muted">{new Date(action.created_at).toLocaleString()}</p>
              </div>
            ))}
          </div>
        ) : (
          <EmptyState title="No operator actions" body="Mutating API calls will appear here." />
        )}
      </Panel>
    </Shell>
  );
}
