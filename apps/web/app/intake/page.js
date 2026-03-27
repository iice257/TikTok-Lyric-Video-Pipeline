"use client";

import { useState } from "react";

import { Panel, Shell } from "@/components/shell";
import { apiFetch } from "@/lib/api";

export default function IntakePage() {
  const [message, setMessage] = useState("");
  const [submitting, setSubmitting] = useState(false);

  async function onSubmit(event) {
    event.preventDefault();
    setSubmitting(true);
    setMessage("");
    const form = new FormData(event.currentTarget);
    try {
      const payload = await apiFetch("/manual-intake", {
        method: "POST",
        body: form,
      });
      setMessage(`Queued ${payload.song.artist} - ${payload.song.title}`);
      event.currentTarget.reset();
    } catch (err) {
      setMessage(err.message);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Shell title="Manual Intake">
      <Panel title="Upload Song Assets" subtitle="Create a new song directly from phone or desktop">
        <form className="stack" onSubmit={onSubmit}>
          <div className="fieldGroup">
            <label className="field">
              <span>Artist</span>
              <input name="artist" required />
            </label>
            <label className="field">
              <span>Title</span>
              <input name="title" required />
            </label>
          </div>
          <div className="fieldGroup">
            <label className="field">
              <span>Rights status</span>
              <select name="rights_status" defaultValue="licensed">
                <option value="licensed">licensed</option>
                <option value="tiktok_cml">tiktok_cml</option>
                <option value="pending_review">pending_review</option>
              </select>
            </label>
            <label className="field">
              <span>Environment</span>
              <select name="environment" defaultValue="prod">
                <option value="prod">prod</option>
                <option value="lab">lab</option>
              </select>
            </label>
          </div>
          <label className="field">
            <span>Audio</span>
            <input type="file" name="audio" accept=".mp3,.wav,.m4a,.flac" required />
          </label>
          <label className="field">
            <span>Cover art</span>
            <input type="file" name="cover" accept=".jpg,.jpeg,.png,.webp" />
          </label>
          <label className="field">
            <span>Lyrics</span>
            <input type="file" name="lyrics" accept=".lrc,.srt,.json,.txt" />
          </label>
          {message ? <p className={message.startsWith("Queued") ? "muted" : "errorText"}>{message}</p> : null}
          <button type="submit" disabled={submitting}>{submitting ? "Uploading..." : "Upload"}</button>
        </form>
      </Panel>
    </Shell>
  );
}
