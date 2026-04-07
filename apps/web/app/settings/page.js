"use client";

import { useEffect, useState } from "react";

import { AdminShell } from "@/components/admin/admin-shell";
import { useResource } from "@/components/client-page";
import { apiFetch } from "@/lib/api";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";

const PRIVACY_AUTO = "__auto__";

export const dynamic = "force-dynamic";

function Stepper({ value, onChange, min = 1 }) {
  return (
    <div className="flex items-center rounded-md border border-border bg-background">
      <button
        type="button"
        onClick={() => onChange(Math.max(min, value - 1))}
        className="flex size-8 items-center justify-center text-muted-foreground transition-colors hover:text-foreground"
      >
        -
      </button>
      <span className="flex min-w-10 items-center justify-center border-x border-border px-3 text-sm font-semibold">
        {value}
      </span>
      <button
        type="button"
        onClick={() => onChange(value + 1)}
        className="flex size-8 items-center justify-center text-muted-foreground transition-colors hover:text-foreground"
      >
        +
      </button>
    </div>
  );
}

function SettingRow({ title, description, control }) {
  return (
    <div className="flex items-center justify-between gap-4">
      <div className="min-w-0">
        <p className="text-sm font-medium">{title}</p>
        <p className="text-xs text-muted-foreground">{description}</p>
      </div>
      {control}
    </div>
  );
}

export default function SettingsPage() {
  const pipelineResource = useResource("/pipeline/settings");
  const tiktokResource = useResource("/integrations/tiktok/status");
  const [pipelineMessage, setPipelineMessage] = useState("");
  const [tiktokMessage, setTiktokMessage] = useState("");
  const [pipelinePaused, setPipelinePaused] = useState(false);
  const [uploadMode, setUploadMode] = useState("hybrid");
  const [minVideos, setMinVideos] = useState(10);
  const [maxVideos, setMaxVideos] = useState(15);
  const [prefs, setPrefs] = useState({
    preferred_privacy_level: PRIVACY_AUTO,
    allow_comment: false,
    allow_duet: false,
    allow_stitch: false,
  });
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const pipeline = pipelineResource.data?.pipeline;
    const env = pipelineResource.data?.env;
    if (!pipeline) {
      return;
    }
    setPipelinePaused(Boolean(pipeline.paused));
    setUploadMode(pipeline.upload_mode || env?.upload_mode || "hybrid");
    setMinVideos(pipeline.target_videos_min || 10);
    setMaxVideos(pipeline.target_videos_max || 15);
  }, [pipelineResource.data]);

  useEffect(() => {
    const stored = tiktokResource.data?.integration?.preferences;
    if (!stored) {
      return;
    }
    setPrefs({
      preferred_privacy_level: stored.preferred_privacy_level || PRIVACY_AUTO,
      allow_comment: Boolean(stored.allow_comment),
      allow_duet: Boolean(stored.allow_duet),
      allow_stitch: Boolean(stored.allow_stitch),
    });
  }, [tiktokResource.data?.integration?.preferences]);

  async function patchSettings() {
    setBusy(true);
    try {
      await apiFetch("/pipeline/settings", {
        method: "PATCH",
        body: JSON.stringify({
          paused: pipelinePaused,
          upload_mode: uploadMode,
          target_videos_min: minVideos,
          target_videos_max: maxVideos,
        }),
      });
      await pipelineResource.reload();
      setPipelineMessage("SETTINGS SAVED");
    } catch (err) {
      setPipelineMessage(`ERROR: ${err.message}`);
    } finally {
      setBusy(false);
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
      setTiktokMessage("AUTH WINDOW OPENED");
    } catch (err) {
      setTiktokMessage(`ERROR: ${err.message}`);
    }
  }

  async function disconnectTikTok() {
    try {
      await apiFetch("/integrations/tiktok/disconnect", { method: "POST" });
      await tiktokResource.reload();
      setTiktokMessage("ACCOUNT DISCONNECTED");
    } catch (err) {
      setTiktokMessage(`ERROR: ${err.message}`);
    }
  }

  async function patchTikTokPreferences() {
    try {
      await apiFetch("/integrations/tiktok/preferences", {
        method: "PATCH",
        body: JSON.stringify({
          preferred_privacy_level: prefs.preferred_privacy_level === PRIVACY_AUTO ? null : prefs.preferred_privacy_level,
          allow_comment: prefs.allow_comment,
          allow_duet: prefs.allow_duet,
          allow_stitch: prefs.allow_stitch,
        }),
      });
      await tiktokResource.reload();
      setTiktokMessage("PREFERENCES SAVED");
    } catch (err) {
      setTiktokMessage(`ERROR: ${err.message}`);
    }
  }

  async function togglePipeline() {
    const paused = Boolean(pipelineResource.data?.pipeline?.paused);
    setBusy(true);
    try {
      await apiFetch(paused ? "/pipeline/resume" : "/pipeline/pause", { method: "POST" });
      await pipelineResource.reload();
    } finally {
      setBusy(false);
    }
  }

  const pipelineData = pipelineResource.data;
  const tiktokData = tiktokResource.data?.integration;
  const creatorInfo = tiktokData?.creator_info;
  const privacyOptions = creatorInfo?.privacy_level_options || [];

  return (
    <AdminShell
      title="Configuration"
      subtitle="Manage system settings, integrations, and operational parameters."
      status={{
        state: pipelinePaused ? "PAUSED" : "RUNNING",
      }}
      actions={
        <>
          <Button variant="destructive" size="sm" disabled className="uppercase tracking-[0.18em]">
            Emergency Stop
          </Button>
          <Button size="sm" disabled={busy} onClick={togglePipeline} className="uppercase tracking-[0.18em]">
            {pipelinePaused ? "Resume Flow" : "Pause Flow"}
          </Button>
        </>
      }
    >
      <div className="grid gap-6 lg:grid-cols-2">
        <Card className="border-border bg-card/80">
          <CardHeader>
            <CardTitle className="text-[10px] font-bold uppercase tracking-[0.2em] text-muted-foreground">
              Pipeline Settings
            </CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-5">
            {pipelineResource.loading ? <p className="text-sm text-muted-foreground">Loading settings...</p> : null}
            {pipelineResource.error ? <p className="text-sm text-destructive">{pipelineResource.error}</p> : null}

            {pipelineData ? (
              <>
                <SettingRow
                  title="Auto-Scaling"
                  description="Enable processing pipeline"
                  control={<Switch checked={!pipelinePaused} onCheckedChange={(checked) => setPipelinePaused(!checked)} />}
                />

                <SettingRow
                  title="Upload Mode"
                  description="Current publish strategy"
                  control={
                    <Select value={uploadMode} onValueChange={setUploadMode}>
                      <SelectTrigger className="min-w-32 border-border bg-background">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="hybrid">hybrid</SelectItem>
                        <SelectItem value="draft">draft</SelectItem>
                        <SelectItem value="direct">direct</SelectItem>
                      </SelectContent>
                    </Select>
                  }
                />

                <SettingRow
                  title="Min Videos"
                  description="Lower production target"
                  control={<Stepper value={minVideos} onChange={setMinVideos} />}
                />

                <SettingRow
                  title="Max Videos"
                  description="Upper production target"
                  control={<Stepper value={maxVideos} onChange={setMaxVideos} />}
                />

                <div className="flex flex-wrap gap-2">
                  <Badge variant="outline" className="uppercase tracking-[0.18em]">
                    {pipelineData.env.app_env}
                  </Badge>
                  <Badge variant={pipelineData.env.lab_enabled ? "secondary" : "outline"} className="uppercase tracking-[0.18em]">
                    Lab {pipelineData.env.lab_enabled ? "On" : "Off"}
                  </Badge>
                </div>

                {pipelineMessage ? (
                  <p className={pipelineMessage.startsWith("ERROR") ? "text-xs uppercase tracking-[0.18em] text-destructive" : "text-xs uppercase tracking-[0.18em] text-primary"}>
                    {pipelineMessage}
                  </p>
                ) : null}

                <Button onClick={patchSettings} disabled={busy} className="w-full uppercase tracking-[0.18em]">
                  Save Pipeline Settings
                </Button>
              </>
            ) : null}
          </CardContent>
        </Card>

        <Card className="border-border bg-card/80">
          <CardHeader>
            <CardTitle className="text-[10px] font-bold uppercase tracking-[0.2em] text-muted-foreground">
              Integrations
            </CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-5">
            {tiktokResource.loading ? <p className="text-sm text-muted-foreground">Loading integrations...</p> : null}
            {tiktokResource.error ? <p className="text-sm text-destructive">{tiktokResource.error}</p> : null}

            {tiktokData ? (
              <>
                <div className="rounded-md border border-border bg-background px-4 py-4">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="text-sm font-medium">TikTok API</p>
                      <p className="text-xs text-muted-foreground">Upload lyric clips and synchronize account state</p>
                    </div>
                    <Badge variant={tiktokData.connected ? "default" : "secondary"} className="uppercase tracking-[0.18em]">
                      {tiktokData.connected ? "Connected" : "Disconnected"}
                    </Badge>
                  </div>

                  <div className="mt-4 flex flex-wrap gap-2">
                    <Button onClick={connectTikTok} disabled={!tiktokData.configured} className="uppercase tracking-[0.18em]">
                      {tiktokData.connected ? "Reconnect" : "Connect"}
                    </Button>
                    <Button variant="outline" onClick={disconnectTikTok} disabled={!tiktokData.connected} className="uppercase tracking-[0.18em]">
                      Disconnect
                    </Button>
                  </div>
                </div>

                {creatorInfo ? (
                  <div className="rounded-md border border-border bg-background px-4 py-4">
                    <p className="text-sm font-medium">
                      {creatorInfo.creator_nickname || creatorInfo.creator_username || "Connected creator"}
                    </p>
                    <p className="mt-2 text-xs text-muted-foreground">
                      Max direct-post duration: {creatorInfo.max_video_post_duration_sec || "unknown"}s
                    </p>
                  </div>
                ) : null}

                <div className="flex flex-col gap-4 rounded-md border border-border bg-background px-4 py-4">
                  <SettingRow
                    title="Preferred Privacy"
                    description="Default publish privacy selection"
                    control={
                      <Select
                        value={prefs.preferred_privacy_level}
                        onValueChange={(value) =>
                          setPrefs((current) => ({ ...current, preferred_privacy_level: value }))
                        }
                      >
                        <SelectTrigger className="min-w-36 border-border bg-background">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value={PRIVACY_AUTO}>auto select</SelectItem>
                          {privacyOptions.map((option) => (
                            <SelectItem key={option} value={option}>
                              {option}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    }
                  />

                  <SettingRow
                    title="Allow Comments"
                    description="Carry comment permission into uploads"
                    control={
                      <Switch
                        checked={prefs.allow_comment}
                        onCheckedChange={(checked) =>
                          setPrefs((current) => ({ ...current, allow_comment: checked }))
                        }
                      />
                    }
                  />

                  <SettingRow
                    title="Allow Duet"
                    description="Carry duet permission into uploads"
                    control={
                      <Switch
                        checked={prefs.allow_duet}
                        onCheckedChange={(checked) =>
                          setPrefs((current) => ({ ...current, allow_duet: checked }))
                        }
                      />
                    }
                  />

                  <SettingRow
                    title="Allow Stitch"
                    description="Carry stitch permission into uploads"
                    control={
                      <Switch
                        checked={prefs.allow_stitch}
                        onCheckedChange={(checked) =>
                          setPrefs((current) => ({ ...current, allow_stitch: checked }))
                        }
                      />
                    }
                  />
                </div>

                {tiktokMessage ? (
                  <p className={tiktokMessage.startsWith("ERROR") ? "text-xs uppercase tracking-[0.18em] text-destructive" : "text-xs uppercase tracking-[0.18em] text-primary"}>
                    {tiktokMessage}
                  </p>
                ) : null}

                <Button onClick={patchTikTokPreferences} className="w-full uppercase tracking-[0.18em]">
                  Save TikTok Preferences
                </Button>
              </>
            ) : null}
          </CardContent>
        </Card>
      </div>
    </AdminShell>
  );
}
