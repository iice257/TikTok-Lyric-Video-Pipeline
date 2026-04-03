"use client";

import { useEffect, useState } from "react";

import { Panel, Shell } from "@/components/shell";
import { useResource } from "@/components/client-page";
import { apiFetch } from "@/lib/api";

const PRIVACY_AUTO = "__auto__";

export default function SettingsPage() {
  const pipelineResource = useResource("/pipeline/settings");
  const tiktokResource = useResource("/integrations/tiktok/status");
  const [pipelineMessage, setPipelineMessage] = useState("");
  const [tiktokMessage, setTiktokMessage] = useState("");

  useEffect(() => {
    function handleTikTokConnected(event) {
      if (event?.data?.type !== "tiktok-connected") {
        return;
      }
      window.location.reload();
    }
    window.addEventListener("message", handleTikTokConnected);
    return () => window.removeEventListener("message", handleTikTokConnected);
  }, []);

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
      pipelineResource.setData((current) => ({ ...current, pipeline: payload.settings }));
      setPipelineMessage("Settings updated.");
    } catch (err) {
      setPipelineMessage(err.message);
    }
  }

  async function connectTikTok() {
    try {
      const payload = await apiFetch("/integrations/tiktok/connect", { method: "POST" });
      const popup = window.open(payload.auth_url, "tiktok-connect", "popup=yes,width=640,height=840");
      if (!popup) {
        window.location.href = payload.auth_url;
        return;
      }
      setTiktokMessage("TikTok authorization opened in a new window.");
    } catch (err) {
      setTiktokMessage(err.message);
    }
  }

  async function disconnectTikTok() {
    try {
      const payload = await apiFetch("/integrations/tiktok/disconnect", { method: "POST" });
      tiktokResource.setData(payload);
      setTiktokMessage("TikTok account disconnected.");
    } catch (err) {
      setTiktokMessage(err.message);
    }
  }

  async function patchTikTokPreferences(event) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const preferredPrivacyLevel = form.get("preferred_privacy_level");
    try {
      const payload = await apiFetch("/integrations/tiktok/preferences", {
        method: "PATCH",
        body: JSON.stringify({
          preferred_privacy_level: preferredPrivacyLevel === PRIVACY_AUTO ? null : preferredPrivacyLevel,
          allow_comment: form.get("allow_comment") === "on",
          allow_duet: form.get("allow_duet") === "on",
          allow_stitch: form.get("allow_stitch") === "on",
        }),
      });
      tiktokResource.setData(payload);
      setTiktokMessage("TikTok preferences updated.");
    } catch (err) {
      setTiktokMessage(err.message);
    }
  }

  const pipelineData = pipelineResource.data;
  const tiktokData = tiktokResource.data?.integration;
  const preferences = tiktokData?.preferences;
  const creatorInfo = tiktokData?.creator_info;
  const privacyOptions = creatorInfo?.privacy_level_options || [];

  return (
    <Shell title="Settings">
      <Panel title="Pipeline Controls" subtitle="Pause state, upload mode, and lab boundary">
        {pipelineResource.loading ? <p>Loading settings...</p> : null}
        {pipelineResource.error ? <p className="errorText">{pipelineResource.error}</p> : null}
        {pipelineData ? (
          <form className="stack" onSubmit={patchSettings}>
            <label className="field">
              <span>Paused</span>
              <select name="paused" defaultValue={String(pipelineData.pipeline.paused || false)}>
                <option value="false">false</option>
                <option value="true">true</option>
              </select>
            </label>
            <label className="field">
              <span>Upload mode</span>
              <select name="upload_mode" defaultValue={pipelineData.env.upload_mode}>
                <option value="hybrid">hybrid</option>
                <option value="draft">draft</option>
                <option value="direct">direct</option>
              </select>
            </label>
            <div className="fieldGroup">
              <label className="field">
                <span>Target min</span>
                <input name="target_videos_min" type="number" min="1" defaultValue={pipelineData.pipeline.target_videos_min || 10} />
              </label>
              <label className="field">
                <span>Target max</span>
                <input name="target_videos_max" type="number" min="1" defaultValue={pipelineData.pipeline.target_videos_max || 15} />
              </label>
            </div>
            <div className="tagRow">
              <span className="tag">{pipelineData.env.app_env}</span>
              <span className={`tag ${pipelineData.env.lab_enabled ? "warning" : "success"}`}>
                lab {pipelineData.env.lab_enabled ? "enabled" : "disabled"}
              </span>
            </div>
            {pipelineMessage ? <p className={pipelineMessage.includes("updated") ? "muted" : "errorText"}>{pipelineMessage}</p> : null}
            <button type="submit">Save Settings</button>
          </form>
        ) : null}
      </Panel>

      <Panel title="TikTok Uploader" subtitle="OAuth connection, creator status, and publish defaults">
        {tiktokResource.loading ? <p>Loading TikTok integration...</p> : null}
        {tiktokResource.error ? <p className="errorText">{tiktokResource.error}</p> : null}
        {tiktokData ? (
          <div className="stack">
            <div className="tagRow">
              <span className={`tag ${tiktokData.connected ? "success" : "warning"}`}>
                {tiktokData.connected ? "connected" : "not connected"}
              </span>
              <span className={`tag ${tiktokData.configured ? "success" : "danger"}`}>
                backend {tiktokData.configured ? "configured" : "missing oauth env"}
              </span>
              <span className={`tag ${tiktokData.simulate_uploads ? "warning" : "success"}`}>
                uploads {tiktokData.simulate_uploads ? "simulated" : "live"}
              </span>
            </div>

            <div className="stack">
              <p className="muted">
                Account: {tiktokData.subject || "none"}
                <br />
                Token expiry: {tiktokData.expires_at || "unknown"}
              </p>
              <div className="actions">
                <button type="button" onClick={connectTikTok} disabled={!tiktokData.configured}>
                  {tiktokData.connected ? "Reconnect TikTok" : "Connect TikTok"}
                </button>
                <button type="button" className="secondary" onClick={disconnectTikTok} disabled={!tiktokData.connected}>
                  Disconnect
                </button>
              </div>
            </div>

            {creatorInfo ? (
              <div className="itemCard">
                <strong>{creatorInfo.creator_nickname || creatorInfo.creator_username || "Connected creator"}</strong>
                <p className="muted">
                  Privacy options: {(creatorInfo.privacy_level_options || []).join(", ") || "none returned"}
                  <br />
                  Max direct-post video length: {creatorInfo.max_video_post_duration_sec || "unknown"} seconds
                </p>
              </div>
            ) : (
              <p className="muted">Creator info will appear here after a successful TikTok connection.</p>
            )}

            <form className="stack" onSubmit={patchTikTokPreferences}>
              <label className="field">
                <span>Preferred privacy level</span>
                <select
                  name="preferred_privacy_level"
                  defaultValue={preferences?.preferred_privacy_level || PRIVACY_AUTO}
                >
                  <option value={PRIVACY_AUTO}>auto select</option>
                  {privacyOptions.map((option) => (
                    <option key={option} value={option}>
                      {option}
                    </option>
                  ))}
                </select>
              </label>
              <label className="checkboxField">
                <input name="allow_comment" type="checkbox" defaultChecked={Boolean(preferences?.allow_comment)} />
                <span>Allow comments when TikTok creator settings permit it</span>
              </label>
              <label className="checkboxField">
                <input name="allow_duet" type="checkbox" defaultChecked={Boolean(preferences?.allow_duet)} />
                <span>Allow duet when TikTok creator settings permit it</span>
              </label>
              <label className="checkboxField">
                <input name="allow_stitch" type="checkbox" defaultChecked={Boolean(preferences?.allow_stitch)} />
                <span>Allow stitch when TikTok creator settings permit it</span>
              </label>
              {tiktokMessage ? <p className={tiktokMessage.includes("updated") || tiktokMessage.includes("opened") || tiktokMessage.includes("disconnected") ? "muted" : "errorText"}>{tiktokMessage}</p> : null}
              <button type="submit">Save TikTok Preferences</button>
            </form>
          </div>
        ) : null}
      </Panel>
    </Shell>
  );
}
