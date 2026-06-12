"use client";

import Link from "next/link";
import { useMemo, useState } from "react";

import { apiFetch, toDatetimeLocal } from "@/lib/api";
import { formatDateTime } from "@/lib/format";
import { useResource } from "@/components/client-page";
import { AdminShell } from "@/components/admin/admin-shell";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

function queueVariant(job) {
  if (job.status === "quarantined") return "destructive";
  if (job.approved_at) return "default";
  return "secondary";
}

export default function QueuePage() {
  const { data, loading, error, setData } = useResource("/upload-jobs");
  const [busyId, setBusyId] = useState("");
  const [scheduleEdits, setScheduleEdits] = useState({});
  const [message, setMessage] = useState("");

  const stats = useMemo(() => {
    const jobs = data?.upload_jobs || [];
    return {
      total: jobs.length,
      pending: jobs.filter(
        (job) => !job.approved_at && !["posted", "cancelled"].includes(job.status)
      ).length,
      failed: jobs.filter(
        (job) => job.last_error && !["posted", "cancelled"].includes(job.status)
      ).length,
    };
  }, [data?.upload_jobs]);

  async function runAction(jobId, path, body) {
    setBusyId(jobId);
    setMessage("");
    try {
      const payload = await apiFetch(path, {
        method: "POST",
        body: body ? JSON.stringify(body) : undefined,
      });
      const updatedJob = payload.upload_job || payload.job;
      if (updatedJob) {
        setData((current) => ({
          ...current,
          upload_jobs: (current?.upload_jobs || []).map((job) => (job.id === jobId ? updatedJob : job)),
        }));
      }
      setMessage("QUEUE UPDATED");
    } catch (err) {
      setMessage(`ERROR: ${err.message}`);
    } finally {
      setBusyId("");
    }
  }

  function reschedule(job) {
    const rawValue = scheduleEdits[job.id] || toDatetimeLocal(job.scheduled_at);
    const nextDate = new Date(rawValue);
    if (!rawValue || Number.isNaN(nextDate.getTime())) {
      setMessage("ERROR: Choose a valid schedule time.");
      return;
    }
    runAction(job.id, `/upload-jobs/${job.id}/reschedule`, {
      scheduled_at: nextDate.toISOString(),
    });
  }

  return (
    <AdminShell
      title="TikTok Queue"
      subtitle="Review and operate scheduled upload jobs."
      status={{ queue: `${stats.total} Jobs` }}
    >
      <div className="grid gap-3 md:grid-cols-3">
        <Card className="border-border bg-card/80">
          <CardContent className="p-4">
            <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-muted-foreground">Total</p>
            <p className="mt-3 text-3xl font-semibold tracking-tight">{stats.total}</p>
          </CardContent>
        </Card>
        <Card className="border-border bg-card/80">
          <CardContent className="p-4">
            <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-muted-foreground">Pending Approval</p>
            <p className="mt-3 text-3xl font-semibold tracking-tight text-primary">{stats.pending}</p>
          </CardContent>
        </Card>
        <Card className="border-border bg-card/80">
          <CardContent className="p-4">
            <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-muted-foreground">Needs Attention</p>
            <p className="mt-3 text-3xl font-semibold tracking-tight">{stats.failed}</p>
          </CardContent>
        </Card>
      </div>

      <div className="space-y-4">
        {loading ? <p className="text-sm text-muted-foreground">Loading queue...</p> : null}
        {error ? <p className="text-sm text-destructive">{error}</p> : null}
        {message ? (
          <p
            aria-live="polite"
            className={message.startsWith("ERROR") ? "text-xs uppercase tracking-[0.18em] text-destructive" : "text-xs uppercase tracking-[0.18em] text-primary"}
          >
            {message}
          </p>
        ) : null}

        {(data?.upload_jobs || []).map((job) => {
          const terminal = ["posted", "cancelled"].includes(job.status);
          const posted = job.status === "posted";
          const rescheduleId = `schedule-${job.id}`;
          return (
          <Card key={job.id} className="border-border bg-card/80">
            <CardContent className="flex flex-col gap-4 p-4">
              <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                <div className="space-y-2">
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge variant={queueVariant(job)} className="uppercase tracking-[0.18em]">
                      {job.approved_at ? "Approved" : "Pending"}
                    </Badge>
                    <Badge variant="outline" className="uppercase tracking-[0.18em]">
                      {job.publish_mode}
                    </Badge>
                    <Badge variant="outline" className="uppercase tracking-[0.18em]">
                      {job.status}
                    </Badge>
                  </div>
                  <p className="text-lg font-semibold tracking-tight">Clip: {job.clip_id}</p>
                  <p className="text-sm text-muted-foreground">
                    Scheduled: {formatDateTime(job.scheduled_at, "unscheduled")}
                  </p>
                </div>

                <div className="grid gap-2 sm:min-w-64">
                  <Label htmlFor={rescheduleId} className="text-[10px] font-bold uppercase tracking-[0.2em] text-muted-foreground">Reschedule</Label>
                  <Input
                    id={rescheduleId}
                    type="datetime-local"
                    value={scheduleEdits[job.id] ?? toDatetimeLocal(job.scheduled_at)}
                    onChange={(event) =>
                      setScheduleEdits((current) => ({ ...current, [job.id]: event.target.value }))
                    }
                    className="border-border bg-background"
                  />
                </div>
              </div>

              {job.last_error ? (
                <p className="text-sm text-destructive">{job.last_error}</p>
              ) : null}

              <div className="flex flex-wrap gap-2">
                <Button
                  onClick={() => runAction(job.id, `/upload-jobs/${job.id}/approve`)}
                  disabled={busyId === job.id || terminal || Boolean(job.approved_at)}
                  size="sm"
                  className="uppercase tracking-[0.18em]"
                >
                  Approve
                </Button>
                <Button
                  variant="outline"
                  onClick={() => reschedule(job)}
                  disabled={busyId === job.id || terminal}
                  size="sm"
                  className="uppercase tracking-[0.18em]"
                >
                  Reschedule
                </Button>
                <Button
                  variant="secondary"
                  onClick={() => runAction(job.id, `/upload-jobs/${job.id}/force-publish`)}
                  disabled={busyId === job.id || terminal}
                  size="sm"
                  className="uppercase tracking-[0.18em]"
                >
                  Force Publish
                </Button>
                <Button
                  variant="ghost"
                  onClick={() => runAction(job.id, `/jobs/${job.id}/retry`, { reason: "retried from queue" })}
                  disabled={busyId === job.id || posted}
                  size="sm"
                  className="uppercase tracking-[0.18em]"
                >
                  Retry
                </Button>
                <Button
                  variant="ghost"
                  onClick={() => runAction(job.id, `/jobs/${job.id}/quarantine`, { reason: "quarantined from queue" })}
                  disabled={busyId === job.id || posted || job.status === "quarantined"}
                  size="sm"
                  className="uppercase tracking-[0.18em]"
                >
                  Quarantine
                </Button>
                <Button
                  variant="ghost"
                  onClick={() => runAction(job.id, `/jobs/${job.id}/cancel`, { reason: "cancelled from queue" })}
                  disabled={busyId === job.id || posted || job.status === "cancelled"}
                  size="sm"
                  className="uppercase tracking-[0.18em]"
                >
                  Cancel
                </Button>
                <Button asChild variant="outline" size="sm" className="uppercase tracking-[0.18em]">
                  <Link href={`/clips/${job.clip_id}`}>Open Clip</Link>
                </Button>
              </div>
            </CardContent>
          </Card>
          );
        })}

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
