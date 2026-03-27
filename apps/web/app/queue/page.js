"use client";

import { useState } from "react";
import Link from "next/link";

import { EmptyState, useResource } from "@/components/client-page";
import { Panel, Shell } from "@/components/shell";
import { apiFetch, toDatetimeLocal } from "@/lib/api";

export default function QueuePage() {
  const { data, loading, error, setData } = useResource("/upload-jobs");
  const [busyId, setBusyId] = useState("");
  const [scheduleEdits, setScheduleEdits] = useState({});

  async function runAction(jobId, path, body) {
    setBusyId(jobId);
    try {
      const payload = await apiFetch(path, {
        method: "POST",
        body: body ? JSON.stringify(body) : undefined,
      });
      const updatedJob = payload.upload_job || payload.job;
      setData((current) => ({
        ...current,
        upload_jobs: current.upload_jobs.map((job) => (job.id === jobId ? updatedJob : job)),
      }));
    } finally {
      setBusyId("");
    }
  }

  return (
    <Shell title="Queue">
      <Panel title="Upcoming Uploads" subtitle="Review, approve, reschedule, or force publish">
        {loading ? <p>Loading queue...</p> : null}
        {error ? <p className="errorText">{error}</p> : null}
        {data?.upload_jobs?.length ? (
          <div className="list">
            {data.upload_jobs.map((job) => (
              <div className="itemCard" key={job.id}>
                <strong>{job.clip_id}</strong>
                <p className="muted">{job.scheduled_at ? new Date(job.scheduled_at).toLocaleString() : "unscheduled"}</p>
                <div className="tagRow">
                  <span className="tag">{job.publish_mode}</span>
                  <span className="tag">{job.status}</span>
                </div>
                {job.last_error ? <p className="errorText">{job.last_error}</p> : null}
                <label className="field" style={{ marginTop: 12 }}>
                  <span>Schedule</span>
                  <input
                    type="datetime-local"
                    value={scheduleEdits[job.id] ?? toDatetimeLocal(job.scheduled_at)}
                    onChange={(event) =>
                      setScheduleEdits((current) => ({ ...current, [job.id]: event.target.value }))
                    }
                  />
                </label>
                <div className="actions" style={{ marginTop: 12 }}>
                  <button onClick={() => runAction(job.id, `/upload-jobs/${job.id}/approve`)} disabled={busyId === job.id}>Approve</button>
                  <button
                    className="button secondary"
                    onClick={() =>
                      runAction(job.id, `/upload-jobs/${job.id}/reschedule`, {
                        scheduled_at: new Date(scheduleEdits[job.id] || job.scheduled_at).toISOString(),
                      })
                    }
                    disabled={busyId === job.id}
                  >
                    Reschedule
                  </button>
                  <button className="button ghost" onClick={() => runAction(job.id, `/jobs/${job.id}/retry`, { reason: "retried from queue" })} disabled={busyId === job.id}>Retry</button>
                  <button className="button ghost" onClick={() => runAction(job.id, `/jobs/${job.id}/quarantine`, { reason: "quarantined from queue" })} disabled={busyId === job.id}>Quarantine</button>
                  <button className="button secondary" onClick={() => runAction(job.id, `/upload-jobs/${job.id}/force-publish`)} disabled={busyId === job.id}>Force</button>
                  <button className="button ghost" onClick={() => runAction(job.id, `/jobs/${job.id}/cancel`, { reason: "cancelled from queue" })} disabled={busyId === job.id}>Cancel</button>
                  <Link className="button ghost" href={`/clips/${job.clip_id}`}>Clip</Link>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <EmptyState title="Queue is empty" body="Rendered clips will appear here once upload jobs are created." />
        )}
      </Panel>
    </Shell>
  );
}
