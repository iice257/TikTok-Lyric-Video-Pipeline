"use client";

import { useState } from "react";

import { EmptyState, useResource } from "@/components/client-page";
import { Panel, Shell } from "@/components/shell";
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
    <Shell title="Clip Detail">
      <Panel title="Clip" subtitle="Edit caption, inspect style, rerender">
        {loading ? <p>Loading clip...</p> : null}
        {error ? <p className="errorText">{error}</p> : null}
        {data?.clip ? (
          <form className="stack" onSubmit={saveClip}>
            <label className="field">
              <span>Caption</span>
              <textarea name="caption" defaultValue={data.clip.caption} />
            </label>
            <label className="field">
              <span>Hook category</span>
              <input name="hook_category" defaultValue={data.clip.hook_category || ""} />
            </label>
            <label className="field">
              <span>Scheduled at</span>
              <input name="scheduled_at" type="datetime-local" defaultValue={toDatetimeLocal(data.clip.scheduled_at)} />
            </label>
            <div className="tagRow">
              <span className="tag">{data.clip.lyric_style}</span>
              <span className="tag">{data.clip.layout_template}</span>
              <span className="tag">{data.clip.status}</span>
            </div>
            {message ? <p className={message.includes("updated") || message.includes("queued") ? "muted" : "errorText"}>{message}</p> : null}
            <div className="actions">
              <button type="submit" disabled={submitting}>Save</button>
              <button className="button secondary" type="button" onClick={rerender} disabled={submitting}>Queue Rerender</button>
            </div>
          </form>
        ) : (
          <EmptyState title="Clip not found" body="This clip may have been deleted or not created yet." />
        )}
      </Panel>
      <Panel title="Jobs" subtitle="Render and upload attempts">
        {data?.render_jobs?.length || data?.upload_jobs?.length ? (
          <div className="list">
            {data.render_jobs?.map((job) => (
              <div className="itemCard" key={job.id}>
                <strong>Render job</strong>
                <p className="muted">{job.status}</p>
                {job.stderr_text ? <p className="errorText">{job.stderr_text}</p> : null}
              </div>
            ))}
            {data.upload_jobs?.map((job) => (
              <div className="itemCard" key={job.id}>
                <strong>Upload job</strong>
                <p className="muted">{job.status} · {job.publish_mode}</p>
                {job.last_error ? <p className="errorText">{job.last_error}</p> : null}
              </div>
            ))}
          </div>
        ) : (
          <EmptyState title="No jobs yet" body="Render and upload attempts will appear here." />
        )}
      </Panel>
      <Panel title="Media" subtitle="Preview rendered output and download artifacts">
        {data?.clip?.video_path ? (
          <div className="stack">
            <video className="mediaFrame" controls playsInline src={buildMediaUrl(data.clip.video_path)} />
            <div className="actions">
              <a className="button" href={buildMediaUrl(data.clip.video_path)} target="_blank" rel="noreferrer">Open Video</a>
              {data.clip.subtitle_path ? <a className="button secondary" href={buildMediaUrl(data.clip.subtitle_path)} target="_blank" rel="noreferrer">Subtitles</a> : null}
              {data.clip.render_manifest_path ? <a className="button ghost" href={buildMediaUrl(data.clip.render_manifest_path)} target="_blank" rel="noreferrer">Manifest</a> : null}
            </div>
          </div>
        ) : (
          <EmptyState title="No render output yet" body="Rendered video and artifact links will appear here after the render job succeeds." />
        )}
      </Panel>
      <Panel title="Audit Trail" subtitle="Recent state changes for this clip and its jobs">
        {data?.state_events?.length ? (
          <div className="list">
            {data.state_events.map((event) => (
              <div className="itemCard" key={event.id}>
                <strong>{event.event_type}</strong>
                <p className="muted">
                  {event.subject_type} · {event.from_state || "none"} to {event.to_state || "none"}
                </p>
                <p className="muted">{new Date(event.created_at).toLocaleString()}</p>
              </div>
            ))}
          </div>
        ) : (
          <EmptyState title="No state events yet" body="Lifecycle changes will appear here as the worker and operator actions run." />
        )}
      </Panel>
    </Shell>
  );
}
