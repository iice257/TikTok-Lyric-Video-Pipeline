"use client";

import { useState } from "react";

import { EmptyState, useResource } from "@/components/client-page";
import { Panel, Shell } from "@/components/shell";
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
    <Shell title="Alerts">
      <Panel title="Active Alerts" subtitle="Failures, stalls, and token issues">
        {loading ? <p>Loading alerts...</p> : null}
        {error ? <p className="errorText">{error}</p> : null}
        {data?.alerts?.length ? (
          <div className="list">
            {data.alerts.map((alert) => (
              <div className="itemCard" key={alert.id}>
                <strong>{alert.kind}</strong>
                <p>{alert.message}</p>
                <div className="tagRow">
                  <span className={`tag ${alert.severity === "error" ? "danger" : "warning"}`}>{alert.severity}</span>
                  <span className="tag">{alert.status}</span>
                </div>
                {alert.status !== "acknowledged" ? (
                  <div className="actions" style={{ marginTop: 12 }}>
                    <button onClick={() => acknowledge(alert.id)} disabled={busyId === alert.id}>Acknowledge</button>
                  </div>
                ) : null}
              </div>
            ))}
          </div>
        ) : (
          <EmptyState title="No alerts" body="The monitor has not raised any issues." />
        )}
      </Panel>
    </Shell>
  );
}
