"use client";

import { useState } from "react";

import { Panel, Shell } from "@/components/shell";
import { apiFetch } from "@/lib/api";
import { useResource } from "@/components/client-page";

export default function SettingsPage() {
  const { data, loading, error, setData } = useResource("/pipeline/settings");
  const [message, setMessage] = useState("");

  async function patchSettings(event) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const paused = form.get("paused") === "true";
    const uploadMode = form.get("upload_mode");
    const targetVideosMin = Number(form.get("target_videos_min"));
    const targetVideosMax = Number(form.get("target_videos_max"));
    try {
      const payload = await apiFetch("/pipeline/settings", {
        method: "PATCH",
        body: JSON.stringify({
          paused,
          upload_mode: uploadMode,
          target_videos_min: Number.isNaN(targetVideosMin) ? null : targetVideosMin,
          target_videos_max: Number.isNaN(targetVideosMax) ? null : targetVideosMax,
        }),
      });
      setData((current) => ({ ...current, pipeline: payload.settings }));
      setMessage("Settings updated.");
    } catch (err) {
      setMessage(err.message);
    }
  }

  return (
    <Shell title="Settings">
      <Panel title="Pipeline Controls" subtitle="Pause state, upload mode, and lab boundary">
        {loading ? <p>Loading settings...</p> : null}
        {error ? <p className="errorText">{error}</p> : null}
        {data ? (
          <form className="stack" onSubmit={patchSettings}>
            <label className="field">
              <span>Paused</span>
              <select name="paused" defaultValue={String(data.pipeline.paused || false)}>
                <option value="false">false</option>
                <option value="true">true</option>
              </select>
            </label>
            <label className="field">
              <span>Upload mode</span>
              <select name="upload_mode" defaultValue={data.env.upload_mode}>
                <option value="hybrid">hybrid</option>
                <option value="draft">draft</option>
                <option value="direct">direct</option>
              </select>
            </label>
            <div className="fieldGroup">
              <label className="field">
                <span>Target min</span>
                <input name="target_videos_min" type="number" min="1" defaultValue={data.pipeline.target_videos_min || 10} />
              </label>
              <label className="field">
                <span>Target max</span>
                <input name="target_videos_max" type="number" min="1" defaultValue={data.pipeline.target_videos_max || 15} />
              </label>
            </div>
            <div className="tagRow">
              <span className="tag">{data.env.app_env}</span>
              <span className={`tag ${data.env.lab_enabled ? "warning" : "success"}`}>
                lab {data.env.lab_enabled ? "enabled" : "disabled"}
              </span>
            </div>
            {message ? <p className={message.includes("updated") ? "muted" : "errorText"}>{message}</p> : null}
            <button type="submit">Save Settings</button>
          </form>
        ) : null}
      </Panel>
    </Shell>
  );
}
