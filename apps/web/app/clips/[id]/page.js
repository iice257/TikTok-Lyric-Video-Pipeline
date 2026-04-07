"use client";

import { useState } from "react";

import { EmptyState, useResource } from "@/components/client-page";
import { Shell } from "@/components/shell";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { apiFetch, buildMediaUrl, toDatetimeLocal } from "@/lib/api";

export default function ClipDetailPage({ params }) {
  const { data, loading, error, setData } = useResource(`/clips/${params.id}`);
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState("");

  async function saveClip(event) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setSubmitting(true);
    setMessage("");
    try {
      const payload = await apiFetch(`/clips/${params.id}`, {
        method: "PATCH",
        body: JSON.stringify({
          caption: form.get("caption"),
          hook_category: form.get("hook_category"),
          scheduled_at: form.get("scheduled_at") ? new Date(form.get("scheduled_at")).toISOString() : null,
        }),
      });
      setData((current) => ({ ...current, clip: payload.clip }));
      setMessage("Clip updated.");
    } catch (err) {
      setMessage(err.message);
    } finally {
      setSubmitting(false);
    }
  }

  async function rerender() {
    setSubmitting(true);
    setMessage("");
    try {
      await apiFetch(`/clips/${params.id}/rerender`, { method: "POST" });
      setMessage("Rerender job queued.");
    } catch (err) {
      setMessage(err.message);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Shell title="Clip Detail" subtitle="Edit caption metadata, inspect media, and manage jobs.">
      {loading ? <p className="text-sm text-muted-foreground">Loading clip...</p> : null}
      {error ? <p className="text-sm text-destructive">{error}</p> : null}

      {data?.clip ? (
        <Card className="space-y-4 border-border bg-card p-4">
          <form className="space-y-4" onSubmit={saveClip}>
            <div className="space-y-2">
              <Label htmlFor="caption">Caption</Label>
              <Textarea id="caption" name="caption" defaultValue={data.clip.caption} />
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="hook_category">Hook Category</Label>
                <Input id="hook_category" name="hook_category" defaultValue={data.clip.hook_category || ""} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="scheduled_at">Scheduled At</Label>
                <Input id="scheduled_at" name="scheduled_at" type="datetime-local" defaultValue={toDatetimeLocal(data.clip.scheduled_at)} />
              </div>
            </div>
            <div className="flex flex-wrap gap-2">
              <Badge variant="outline">{data.clip.lyric_style}</Badge>
              <Badge variant="outline">{data.clip.layout_template}</Badge>
              <Badge variant="outline">{data.clip.status}</Badge>
            </div>
            {message ? <p className={message.includes("updated") || message.includes("queued") ? "text-sm text-muted-foreground" : "text-sm text-destructive"}>{message}</p> : null}
            <div className="flex flex-wrap gap-2">
              <Button type="submit" disabled={submitting}>
                Save
              </Button>
              <Button type="button" variant="outline" onClick={rerender} disabled={submitting}>
                Queue Rerender
              </Button>
            </div>
          </form>
        </Card>
      ) : (
        <EmptyState title="Clip not found" body="This clip may have been deleted or not created yet." />
      )}

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
        <Card className="space-y-4 border-border bg-card p-4">
          <h3 className="text-base font-semibold">Jobs</h3>
          {data?.render_jobs?.length || data?.upload_jobs?.length ? (
            <div className="space-y-3">
              {data.render_jobs?.map((job) => (
                <div key={job.id} className="rounded-md border border-border bg-background/50 p-3">
                  <p className="text-sm font-medium">Render job</p>
                  <p className="text-sm text-muted-foreground">{job.status}</p>
                  {job.stderr_text ? <p className="mt-1 text-sm text-destructive">{job.stderr_text}</p> : null}
                </div>
              ))}
              {data.upload_jobs?.map((job) => (
                <div key={job.id} className="rounded-md border border-border bg-background/50 p-3">
                  <p className="text-sm font-medium">Upload job</p>
                  <p className="text-sm text-muted-foreground">
                    {job.status} | {job.publish_mode}
                  </p>
                  {job.last_error ? <p className="mt-1 text-sm text-destructive">{job.last_error}</p> : null}
                </div>
              ))}
            </div>
          ) : (
            <EmptyState title="No jobs yet" body="Render and upload attempts will appear here." />
          )}
        </Card>

        <Card className="space-y-4 border-border bg-card p-4">
          <h3 className="text-base font-semibold">Media</h3>
          {data?.clip?.video_path ? (
            <div className="space-y-3">
              <video className="w-full rounded-md border border-border bg-background" controls playsInline src={buildMediaUrl(data.clip.video_path)} />
              <div className="flex flex-wrap gap-2">
                <Button asChild size="sm">
                  <a href={buildMediaUrl(data.clip.video_path)} target="_blank" rel="noreferrer">
                    Open Video
                  </a>
                </Button>
                {data.clip.subtitle_path ? (
                  <Button asChild size="sm" variant="outline">
                    <a href={buildMediaUrl(data.clip.subtitle_path)} target="_blank" rel="noreferrer">
                      Subtitles
                    </a>
                  </Button>
                ) : null}
                {data.clip.render_manifest_path ? (
                  <Button asChild size="sm" variant="outline">
                    <a href={buildMediaUrl(data.clip.render_manifest_path)} target="_blank" rel="noreferrer">
                      Manifest
                    </a>
                  </Button>
                ) : null}
              </div>
            </div>
          ) : (
            <EmptyState title="No render output yet" body="Rendered video and artifact links will appear once jobs complete." />
          )}
        </Card>
      </div>

      <Card className="space-y-4 border-border bg-card p-4">
        <h3 className="text-base font-semibold">Audit Trail</h3>
        {data?.state_events?.length ? (
          <div className="space-y-3">
            {data.state_events.map((event) => (
              <div key={event.id} className="rounded-md border border-border bg-background/50 p-3">
                <p className="text-sm font-medium">{event.event_type}</p>
                <p className="text-sm text-muted-foreground">
                  {event.subject_type} | {event.from_state || "none"} to {event.to_state || "none"}
                </p>
                <p className="text-xs uppercase tracking-[0.2em] text-muted-foreground">{new Date(event.created_at).toLocaleString()}</p>
              </div>
            ))}
          </div>
        ) : (
          <EmptyState title="No state events yet" body="Lifecycle changes will appear here as worker and operator actions run." />
        )}
      </Card>
    </Shell>
  );
}
