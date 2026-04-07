"use client";

import Link from "next/link";
import { useState } from "react";

import { EmptyState, useResource } from "@/components/client-page";
import { Shell } from "@/components/shell";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
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
    <Shell title="Upload Queue" subtitle="Review, approve, reschedule, or force publish jobs.">
      {loading ? <p className="text-sm text-muted-foreground">Loading queue...</p> : null}
      {error ? <p className="text-sm text-destructive">{error}</p> : null}
      {data?.upload_jobs?.length ? (
        <div className="space-y-4">
          {data.upload_jobs.map((job) => (
            <Card key={job.id} className="space-y-4 border-border bg-card p-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <h3 className="text-base font-semibold">{job.clip_id}</h3>
                  <p className="text-sm text-muted-foreground">
                    {job.scheduled_at ? new Date(job.scheduled_at).toLocaleString() : "unscheduled"}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <Badge variant="outline">{job.publish_mode}</Badge>
                  <Badge variant="outline">{job.status}</Badge>
                </div>
              </div>
              {job.last_error ? <p className="text-sm text-destructive">{job.last_error}</p> : null}
              <div className="max-w-xs space-y-2">
                <p className="text-xs uppercase tracking-[0.2em] text-muted-foreground">Schedule</p>
                <Input
                  type="datetime-local"
                  value={scheduleEdits[job.id] ?? toDatetimeLocal(job.scheduled_at)}
                  onChange={(event) => setScheduleEdits((current) => ({ ...current, [job.id]: event.target.value }))}
                />
              </div>
              <div className="flex flex-wrap gap-2">
                <Button size="sm" onClick={() => runAction(job.id, `/upload-jobs/${job.id}/approve`)} disabled={busyId === job.id}>
                  Approve
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() =>
                    runAction(job.id, `/upload-jobs/${job.id}/reschedule`, {
                      scheduled_at: new Date(scheduleEdits[job.id] || job.scheduled_at).toISOString(),
                    })
                  }
                  disabled={busyId === job.id}
                >
                  Reschedule
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => runAction(job.id, `/jobs/${job.id}/retry`, { reason: "retried from queue" })}
                  disabled={busyId === job.id}
                >
                  Retry
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => runAction(job.id, `/jobs/${job.id}/quarantine`, { reason: "quarantined from queue" })}
                  disabled={busyId === job.id}
                >
                  Quarantine
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => runAction(job.id, `/upload-jobs/${job.id}/force-publish`)}
                  disabled={busyId === job.id}
                >
                  Force
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => runAction(job.id, `/jobs/${job.id}/cancel`, { reason: "cancelled from queue" })}
                  disabled={busyId === job.id}
                >
                  Cancel
                </Button>
                <Button size="sm" variant="ghost" asChild>
                  <Link href={`/clips/${job.clip_id}`}>Clip</Link>
                </Button>
              </div>
            </Card>
          ))}
        </div>
      ) : (
        <EmptyState title="Queue is empty" body="Rendered clips will appear here once upload jobs are created." />
      )}
    </Shell>
  );
}
