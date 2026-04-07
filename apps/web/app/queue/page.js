"use client";

import Link from "next/link";
import { useState } from "react";

import { apiFetch, toDatetimeLocal } from "@/lib/api";
import { useResource } from "@/components/client-page";
import { AdminShell } from "@/components/admin/admin-shell";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";

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
    <AdminShell
      title="TikTok Queue"
      subtitle="Review and operate scheduled upload jobs."
    >
      <div className="space-y-4">
        {loading ? <p className="text-sm text-muted-foreground">Loading queue...</p> : null}
        {error ? <p className="text-sm text-destructive">{error}</p> : null}

        {(data?.upload_jobs || []).map((job) => (
          <Card key={job.id} className="border-border bg-card">
            <CardContent className="space-y-4 p-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="space-y-1">
                  <p className="text-sm font-semibold">Clip: {job.clip_id}</p>
                  <p className="text-xs text-muted-foreground">
                    Scheduled: {job.scheduled_at ? new Date(job.scheduled_at).toLocaleString() : "unscheduled"}
                  </p>
                </div>
                <div className="flex gap-2">
                  <Badge variant="outline" className="uppercase tracking-widest">{job.publish_mode}</Badge>
                  <Badge variant="secondary" className="uppercase tracking-widest">{job.status}</Badge>
                </div>
              </div>

              {job.last_error ? <p className="text-xs uppercase tracking-widest text-destructive">{job.last_error}</p> : null}

              <div className="grid gap-2 sm:max-w-sm">
                <p className="text-xs uppercase tracking-widest text-muted-foreground">Reschedule</p>
                <Input
                  type="datetime-local"
                  value={scheduleEdits[job.id] ?? toDatetimeLocal(job.scheduled_at)}
                  onChange={(event) => setScheduleEdits((current) => ({ ...current, [job.id]: event.target.value }))}
                  className="bg-secondary/40"
                />
              </div>

              <div className="flex flex-wrap gap-2">
                <Button onClick={() => runAction(job.id, `/upload-jobs/${job.id}/approve`)} disabled={busyId === job.id} size="sm" className="uppercase tracking-widest">
                  Approve
                </Button>
                <Button
                  variant="outline"
                  onClick={() =>
                    runAction(job.id, `/upload-jobs/${job.id}/reschedule`, {
                      scheduled_at: new Date(scheduleEdits[job.id] || job.scheduled_at).toISOString(),
                    })
                  }
                  disabled={busyId === job.id}
                  size="sm"
                  className="uppercase tracking-widest"
                >
                  Reschedule
                </Button>
                <Button variant="secondary" onClick={() => runAction(job.id, `/upload-jobs/${job.id}/force-publish`)} disabled={busyId === job.id} size="sm" className="uppercase tracking-widest">
                  Force Publish
                </Button>
                <Button variant="ghost" onClick={() => runAction(job.id, `/jobs/${job.id}/retry`, { reason: "retried from queue" })} disabled={busyId === job.id} size="sm" className="uppercase tracking-widest">
                  Retry
                </Button>
                <Button variant="ghost" onClick={() => runAction(job.id, `/jobs/${job.id}/quarantine`, { reason: "quarantined from queue" })} disabled={busyId === job.id} size="sm" className="uppercase tracking-widest">
                  Quarantine
                </Button>
                <Button variant="ghost" onClick={() => runAction(job.id, `/jobs/${job.id}/cancel`, { reason: "cancelled from queue" })} disabled={busyId === job.id} size="sm" className="uppercase tracking-widest">
                  Cancel
                </Button>
                <Button asChild variant="outline" size="sm" className="uppercase tracking-widest">
                  <Link href={`/clips/${job.clip_id}`}>Open Clip</Link>
                </Button>
              </div>
            </CardContent>
          </Card>
        ))}

        {!loading && !(data?.upload_jobs || []).length ? (
          <Card className="border-border bg-card">
            <CardContent className="p-5 text-sm text-muted-foreground">
              Queue is empty.
            </CardContent>
          </Card>
        ) : null}
      </div>
    </AdminShell>
  );
}
