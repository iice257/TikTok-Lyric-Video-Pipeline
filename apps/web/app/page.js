"use client";

import Link from "next/link";
import { useState } from "react";

import { EmptyState, useResource } from "@/components/client-page";
import { Panel, Shell } from "@/components/shell";
import { apiFetch } from "@/lib/api";

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
    <Shell title="Overview">
      <Panel
        title="System Health"
        subtitle="Live queue and worker summary"
        action={
          data ? (
            <button type="button" className="button secondary" onClick={() => togglePipeline(Boolean(data.pipeline?.paused))} disabled={busy}>
              {data.pipeline?.paused ? "Resume" : "Pause"}
            </button>
          ) : null
        }
      >
        {loading ? <p>Loading dashboard...</p> : null}
        {error ? <p className="errorText">{error}</p> : null}
        {data ? (
          <div className="stack">
            <div className="metrics">
              <div className="metric">
                <span>Health</span>
                <strong>{data.health}</strong>
              </div>
              <div className="metric">
                <span>Pipeline</span>
                <strong>{data.pipeline?.paused ? "paused" : "running"}</strong>
              </div>
              <div className="metric">
                <span>Songs</span>
                <strong>{data.counts.songs}</strong>
              </div>
              <div className="metric">
                <span>Render Backlog</span>
                <strong>{data.counts.render_backlog}</strong>
              </div>
              <div className="metric">
                <span>Upload Backlog</span>
                <strong>{data.counts.upload_backlog}</strong>
              </div>
              <div className="metric">
                <span>Next Publish</span>
                <strong>{data.next_publish_at ? new Date(data.next_publish_at).toLocaleString() : "none"}</strong>
              </div>
            </div>
            <div className="actions">
              <Link className="button" href="/intake">Manual Intake</Link>
              <Link className="button secondary" href="/queue">Open Queue</Link>
              <Link className="button ghost" href="/settings">Settings</Link>
            </div>
          </div>
        ) : null}
      </Panel>
      <Panel title="Workers" subtitle="Heartbeat and current loop">
        {data?.workers?.length ? (
          <div className="list">
            {data.workers.map((worker) => (
              <div className="itemCard" key={worker.id}>
                <strong>{worker.worker_name}</strong>
                <p className="muted">
                  {worker.status} · {worker.current_loop || "idle"}
                </p>
                <div className="tagRow">
                  <span className="tag">{new Date(worker.last_seen_at).toLocaleString()}</span>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <EmptyState title="No workers yet" body="Start the worker process to populate heartbeat data." />
        )}
      </Panel>
      <Panel title="Recent Alerts" subtitle="Newest issues surfaced by the monitor" className="full">
        {data?.recent_alerts?.length ? (
          <div className="list">
            {data.recent_alerts.map((alert) => (
              <div className="itemCard" key={alert.id}>
                <strong>{alert.kind}</strong>
                <p>{alert.message}</p>
                <div className="tagRow">
                  <span className={`tag ${alert.severity === "error" ? "danger" : "warning"}`}>{alert.severity}</span>
                  <span className="tag">{alert.status}</span>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <EmptyState title="No alerts" body="Current runs are not raising incidents." />
        )}
      </Panel>
    </Shell>
  );
}
