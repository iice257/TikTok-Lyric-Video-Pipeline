"use client";

import { useState } from "react";

import { apiFetch, buildMediaUrl, toDatetimeLocal } from "@/lib/api";
import { useResource } from "@/components/client-page";
import { AdminShell } from "@/components/admin/admin-shell";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";

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
      setMessage("CLIP UPDATED");
    } catch (err) {
      setMessage(`ERROR: ${err.message}`);
    } finally {
      setSubmitting(false);
    }
  }

  async function rerender() {
    setSubmitting(true);
    setMessage("");
    try {
      await apiFetch(`/clips/${params.id}/rerender`, { method: "POST" });
      setMessage("RERENDER QUEUED");
    } catch (err) {
      setMessage(`ERROR: ${err.message}`);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <AdminShell title="Clip Detail" subtitle="Edit caption, inspect jobs, and preview media.">
      <div className="space-y-4">
        {loading ? <p className="text-sm text-muted-foreground">Loading clip...</p> : null}
        {error ? <p className="text-sm text-destructive">{error}</p> : null}

        {data?.clip ? (
          <Card className="border-border bg-card">
            <CardContent className="space-y-4 p-4">
              <form className="space-y-4" onSubmit={saveClip}>
                <div className="grid gap-2">
                  <p className="text-xs uppercase tracking-widest text-muted-foreground">Caption</p>
                  <Textarea name="caption" defaultValue={data.clip.caption} className="min-h-24 bg-secondary/40" />
                </div>
                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="grid gap-2">
                    <p className="text-xs uppercase tracking-widest text-muted-foreground">Hook Category</p>
                    <Input name="hook_category" defaultValue={data.clip.hook_category || ""} className="bg-secondary/40" />
                  </div>
                  <div className="grid gap-2">
                    <p className="text-xs uppercase tracking-widest text-muted-foreground">Scheduled At</p>
                    <Input name="scheduled_at" type="datetime-local" defaultValue={toDatetimeLocal(data.clip.scheduled_at)} className="bg-secondary/40" />
                  </div>
                </div>
                <div className="flex flex-wrap gap-2">
                  <Badge variant="outline" className="uppercase tracking-widest">{data.clip.lyric_style}</Badge>
                  <Badge variant="outline" className="uppercase tracking-widest">{data.clip.layout_template}</Badge>
                  <Badge variant="secondary" className="uppercase tracking-widest">{data.clip.status}</Badge>
                </div>
                {message ? (
                  <p className={message.startsWith("ERROR") ? "text-xs uppercase tracking-widest text-destructive" : "text-xs uppercase tracking-widest text-primary"}>
                    {message}
                  </p>
                ) : null}
                <div className="flex flex-wrap gap-2">
                  <Button type="submit" disabled={submitting} className="uppercase tracking-widest">Save</Button>
                  <Button type="button" variant="outline" onClick={rerender} disabled={submitting} className="uppercase tracking-widest">
                    Queue Rerender
                  </Button>
                </div>
              </form>
            </CardContent>
          </Card>
        ) : null}

        <Card className="border-border bg-card">
          <CardContent className="space-y-3 p-4">
            <p className="text-xs font-bold uppercase tracking-widest text-muted-foreground">Jobs</p>
            {(data?.render_jobs || []).map((job) => (
              <div key={job.id} className="space-y-1 border border-border bg-background/40 p-3">
                <p className="text-sm font-semibold">Render job</p>
                <p className="text-xs uppercase tracking-wider text-muted-foreground">{job.status}</p>
                {job.stderr_text ? <p className="text-xs text-destructive">{job.stderr_text}</p> : null}
              </div>
            ))}
            {(data?.upload_jobs || []).map((job) => (
              <div key={job.id} className="space-y-1 border border-border bg-background/40 p-3">
                <p className="text-sm font-semibold">Upload job</p>
                <p className="text-xs uppercase tracking-wider text-muted-foreground">{job.status} | {job.publish_mode}</p>
                {job.last_error ? <p className="text-xs text-destructive">{job.last_error}</p> : null}
              </div>
            ))}
          </CardContent>
        </Card>

        <Card className="border-border bg-card">
          <CardContent className="space-y-3 p-4">
            <p className="text-xs font-bold uppercase tracking-widest text-muted-foreground">Media</p>
            {data?.clip?.video_path ? (
              <>
                <video className="aspect-video w-full border border-border bg-background/40 object-cover" controls playsInline src={buildMediaUrl(data.clip.video_path)} />
                <div className="flex flex-wrap gap-2">
                  <Button asChild size="sm" className="uppercase tracking-widest">
                    <a href={buildMediaUrl(data.clip.video_path)} target="_blank" rel="noreferrer">Open Video</a>
                  </Button>
                  {data.clip.subtitle_path ? (
                    <Button asChild variant="outline" size="sm" className="uppercase tracking-widest">
                      <a href={buildMediaUrl(data.clip.subtitle_path)} target="_blank" rel="noreferrer">Subtitles</a>
                    </Button>
                  ) : null}
                  {data.clip.render_manifest_path ? (
                    <Button asChild variant="ghost" size="sm" className="uppercase tracking-widest">
                      <a href={buildMediaUrl(data.clip.render_manifest_path)} target="_blank" rel="noreferrer">Manifest</a>
                    </Button>
                  ) : null}
                </div>
              </>
            ) : (
              <p className="text-sm text-muted-foreground">No render output yet.</p>
            )}
          </CardContent>
        </Card>
      </div>
    </AdminShell>
  );
}
