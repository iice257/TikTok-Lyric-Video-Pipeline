"use client";

import { useState } from "react";

import { apiFetch, buildMediaUrl, toDatetimeLocal } from "@/lib/api";
import { useResource } from "@/components/client-page";
import { AdminShell } from "@/components/admin/admin-shell";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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
          scheduled_at: form.get("scheduled_at")
            ? new Date(form.get("scheduled_at")).toISOString()
            : null,
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
      <div className="space-y-6">
        {loading ? <p className="text-sm text-muted-foreground">Loading clip...</p> : null}
        {error ? <p className="text-sm text-destructive">{error}</p> : null}

        {data?.clip ? (
          <div className="grid gap-6 xl:grid-cols-[1.2fr_0.8fr]">
            <Card className="border-border bg-card/80">
              <CardHeader>
                <CardTitle className="text-lg font-semibold tracking-tight">Clip Metadata</CardTitle>
              </CardHeader>
              <CardContent className="space-y-5">
                <form className="space-y-5" onSubmit={saveClip}>
                  <div className="grid gap-2">
                    <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-muted-foreground">Caption</p>
                    <Textarea name="caption" defaultValue={data.clip.caption} className="min-h-28 border-border bg-background" />
                  </div>
                  <div className="grid gap-4 md:grid-cols-2">
                    <div className="grid gap-2">
                      <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-muted-foreground">Hook Category</p>
                      <Input name="hook_category" defaultValue={data.clip.hook_category || ""} className="border-border bg-background" />
                    </div>
                    <div className="grid gap-2">
                      <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-muted-foreground">Scheduled At</p>
                      <Input
                        name="scheduled_at"
                        type="datetime-local"
                        defaultValue={toDatetimeLocal(data.clip.scheduled_at)}
                        className="border-border bg-background"
                      />
                    </div>
                  </div>

                  <div className="flex flex-wrap gap-2">
                    <Badge variant="outline" className="uppercase tracking-[0.18em]">{data.clip.lyric_style}</Badge>
                    <Badge variant="outline" className="uppercase tracking-[0.18em]">{data.clip.layout_template}</Badge>
                    <Badge variant="secondary" className="uppercase tracking-[0.18em]">{data.clip.status}</Badge>
                  </div>

                  {message ? (
                    <p className={message.startsWith("ERROR") ? "text-xs uppercase tracking-[0.18em] text-destructive" : "text-xs uppercase tracking-[0.18em] text-primary"}>
                      {message}
                    </p>
                  ) : null}

                  <div className="flex flex-wrap gap-2">
                    <Button type="submit" disabled={submitting} className="uppercase tracking-[0.18em]">
                      Save
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      onClick={rerender}
                      disabled={submitting}
                      className="uppercase tracking-[0.18em]"
                    >
                      Queue Rerender
                    </Button>
                  </div>
                </form>
              </CardContent>
            </Card>

            <Card className="border-border bg-card/80">
              <CardHeader>
                <CardTitle className="text-lg font-semibold tracking-tight">Media Preview</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                {data.clip.video_path ? (
                  <>
                    <video className="aspect-video w-full rounded-md border border-border bg-background object-cover" controls playsInline src={buildMediaUrl(data.clip.video_path)} />
                    <div className="flex flex-wrap gap-2">
                      <Button asChild size="sm" className="uppercase tracking-[0.18em]">
                        <a href={buildMediaUrl(data.clip.video_path)} target="_blank" rel="noreferrer">Open Video</a>
                      </Button>
                      {data.clip.subtitle_path ? (
                        <Button asChild variant="outline" size="sm" className="uppercase tracking-[0.18em]">
                          <a href={buildMediaUrl(data.clip.subtitle_path)} target="_blank" rel="noreferrer">Subtitles</a>
                        </Button>
                      ) : null}
                      {data.clip.render_manifest_path ? (
                        <Button asChild variant="ghost" size="sm" className="uppercase tracking-[0.18em]">
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
        ) : null}

        <div className="grid gap-6 lg:grid-cols-2">
          <Card className="border-border bg-card/80">
            <CardHeader>
              <CardTitle className="text-lg font-semibold tracking-tight">Render Jobs</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {(data?.render_jobs || []).map((job) => (
                <div key={job.id} className="rounded-md border border-border bg-background px-4 py-3">
                  <p className="text-sm font-medium">Render job</p>
                  <p className="mt-1 text-xs uppercase tracking-[0.18em] text-muted-foreground">{job.status}</p>
                  {job.stderr_text ? <p className="mt-2 text-sm text-destructive">{job.stderr_text}</p> : null}
                </div>
              ))}
              {!loading && !(data?.render_jobs || []).length ? (
                <p className="text-sm text-muted-foreground">No render jobs yet.</p>
              ) : null}
            </CardContent>
          </Card>

          <Card className="border-border bg-card/80">
            <CardHeader>
              <CardTitle className="text-lg font-semibold tracking-tight">Upload Jobs</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {(data?.upload_jobs || []).map((job) => (
                <div key={job.id} className="rounded-md border border-border bg-background px-4 py-3">
                  <p className="text-sm font-medium">Upload job</p>
                  <p className="mt-1 text-xs uppercase tracking-[0.18em] text-muted-foreground">
                    {job.status} | {job.publish_mode}
                  </p>
                  {job.last_error ? <p className="mt-2 text-sm text-destructive">{job.last_error}</p> : null}
                </div>
              ))}
              {!loading && !(data?.upload_jobs || []).length ? (
                <p className="text-sm text-muted-foreground">No upload jobs yet.</p>
              ) : null}
            </CardContent>
          </Card>
        </div>
      </div>
    </AdminShell>
  );
}
