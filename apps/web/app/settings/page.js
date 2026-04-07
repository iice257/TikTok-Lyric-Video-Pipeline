"use client";

import { useEffect, useState } from "react";

import { AdminShell } from "@/components/admin/admin-shell";
import { useResource } from "@/components/client-page";
import { apiFetch } from "@/lib/api";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";

const PRIVACY_AUTO = "__auto__";

export const dynamic = "force-dynamic";

export default function SettingsPage() {
  const pipelineResource = useResource("/pipeline/settings");
  const tiktokResource = useResource("/integrations/tiktok/status");
  const [pipelineMessage, setPipelineMessage] = useState("");
  const [tiktokMessage, setTiktokMessage] = useState("");
  const [pipelinePaused, setPipelinePaused] = useState(false);
  const [prefs, setPrefs] = useState({
    preferred_privacy_level: PRIVACY_AUTO,
    allow_comment: false,
    allow_duet: false,
    allow_stitch: false,
  });

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

  useEffect(() => {
    const stored = tiktokResource.data?.integration?.preferences;
    if (!stored) return;
    setPrefs({
      preferred_privacy_level: stored.preferred_privacy_level || PRIVACY_AUTO,
      allow_comment: Boolean(stored.allow_comment),
      allow_duet: Boolean(stored.allow_duet),
      allow_stitch: Boolean(stored.allow_stitch),
    });
  }, [tiktokResource.data?.integration?.preferences]);

  useEffect(() => {
    const paused = pipelineResource.data?.pipeline?.paused;
    if (typeof paused === "boolean") {
      setPipelinePaused(paused);
    }
  }, [pipelineResource.data?.pipeline?.paused]);

  async function patchSettings(event) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const targetVideosMin = Number(form.get("target_videos_min"));
    const targetVideosMax = Number(form.get("target_videos_max"));
    try {
      const payload = await apiFetch("/pipeline/settings", {
        method: "PATCH",
        body: JSON.stringify({
          paused: pipelinePaused,
          upload_mode: form.get("upload_mode"),
          target_videos_min: Number.isNaN(targetVideosMin) ? null : targetVideosMin,
          target_videos_max: Number.isNaN(targetVideosMax) ? null : targetVideosMax,
        }),
      });
      pipelineResource.setData((current) => ({ ...current, pipeline: payload.settings }));
      setPipelineMessage("SETTINGS SAVED");
    } catch (err) {
      setPipelineMessage(`ERROR: ${err.message}`);
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
      const payload = await apiFetch("/integrations/tiktok/disconnect", { method: "POST" });
      tiktokResource.setData(payload);
      setTiktokMessage("ACCOUNT DISCONNECTED");
    } catch (err) {
      setTiktokMessage(`ERROR: ${err.message}`);
    }
  }

  async function patchTikTokPreferences(event) {
    event.preventDefault();
    try {
      const payload = await apiFetch("/integrations/tiktok/preferences", {
        method: "PATCH",
        body: JSON.stringify({
          preferred_privacy_level: prefs.preferred_privacy_level === PRIVACY_AUTO ? null : prefs.preferred_privacy_level,
          allow_comment: prefs.allow_comment,
          allow_duet: prefs.allow_duet,
          allow_stitch: prefs.allow_stitch,
        }),
      });
      tiktokResource.setData(payload);
      setTiktokMessage("PREFERENCES SAVED");
    } catch (err) {
      setTiktokMessage(`ERROR: ${err.message}`);
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
      actions={
        <>
          <Button variant="destructive" size="sm" className="uppercase tracking-widest">
            Emergency Stop
          </Button>
          <Button size="sm" className="uppercase tracking-widest">
            Pause Flow
          </Button>
        </>
      }
    >
      <div className="grid gap-6 lg:grid-cols-2">
        <Card className="border-border bg-card">
          <CardHeader>
            <CardTitle className="text-xs uppercase tracking-widest text-muted-foreground">
              Pipeline Settings
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {pipelineResource.loading ? <p className="text-sm text-muted-foreground">Loading settings...</p> : null}
            {pipelineResource.error ? <p className="text-sm text-destructive">{pipelineResource.error}</p> : null}

            {pipelineData ? (
              <form className="space-y-4" onSubmit={patchSettings}>
                <div className="flex items-center justify-between gap-4">
                  <div>
                    <p className="text-sm font-semibold">Auto-Scaling</p>
                    <p className="text-xs text-muted-foreground">Enable processing pipeline</p>
                  </div>
                  <Switch checked={!pipelinePaused} onCheckedChange={(checked) => setPipelinePaused(!checked)} />
                </div>

                <div className="grid gap-2">
                  <Label className="text-xs uppercase tracking-wider text-muted-foreground">Upload Mode</Label>
                  <Select name="upload_mode" defaultValue={pipelineData.env.upload_mode}>
                    <SelectTrigger className="bg-secondary/40">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="hybrid">hybrid</SelectItem>
                      <SelectItem value="draft">draft</SelectItem>
                      <SelectItem value="direct">direct</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="grid gap-2">
                    <Label className="text-xs uppercase tracking-wider text-muted-foreground">Min Videos</Label>
                    <Input
                      name="target_videos_min"
                      type="number"
                      min="1"
                      defaultValue={pipelineData.pipeline.target_videos_min || 10}
                      className="bg-secondary/40"
                    />
                  </div>
                  <div className="grid gap-2">
                    <Label className="text-xs uppercase tracking-wider text-muted-foreground">Max Videos</Label>
                    <Input
                      name="target_videos_max"
                      type="number"
                      min="1"
                      defaultValue={pipelineData.pipeline.target_videos_max || 15}
                      className="bg-secondary/40"
                    />
                  </div>
                </div>

                <div className="flex flex-wrap gap-2">
                  <Badge variant="outline" className="uppercase tracking-widest">{pipelineData.env.app_env}</Badge>
                  <Badge variant={pipelineData.env.lab_enabled ? "secondary" : "default"} className="uppercase tracking-widest">
                    LAB {pipelineData.env.lab_enabled ? "ON" : "OFF"}
                  </Badge>
                </div>

                {pipelineMessage ? (
                  <p className={pipelineMessage.startsWith("ERROR") ? "text-xs uppercase tracking-widest text-destructive" : "text-xs uppercase tracking-widest text-primary"}>
                    {pipelineMessage}
                  </p>
                ) : null}

                <Button type="submit" className="w-full uppercase tracking-widest">
                  Save Pipeline Settings
                </Button>
              </form>
            ) : null}
          </CardContent>
        </Card>

        <Card className="border-border bg-card">
          <CardHeader>
            <CardTitle className="text-xs uppercase tracking-widest text-muted-foreground">
              Integrations
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {tiktokResource.loading ? <p className="text-sm text-muted-foreground">Loading integrations...</p> : null}
            {tiktokResource.error ? <p className="text-sm text-destructive">{tiktokResource.error}</p> : null}

            {tiktokData ? (
              <>
                <div className="space-y-2">
                  <div className="flex items-center justify-between gap-3 border border-border bg-background/40 p-3">
                    <div>
                      <p className="text-sm font-semibold">TikTok API</p>
                      <p className="text-xs text-muted-foreground">Upload lyric clips and synchronize account state</p>
                    </div>
                    <Badge variant={tiktokData.connected ? "default" : "secondary"} className="uppercase tracking-widest">
                      {tiktokData.connected ? "Connected" : "Disconnected"}
                    </Badge>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <Button onClick={connectTikTok} disabled={!tiktokData.configured} className="uppercase tracking-widest">
                      {tiktokData.connected ? "Reconnect" : "Connect"}
                    </Button>
                    <Button variant="outline" onClick={disconnectTikTok} disabled={!tiktokData.connected} className="uppercase tracking-widest">
                      Disconnect
                    </Button>
                  </div>
                </div>

                {creatorInfo ? (
                  <div className="space-y-2 border border-border bg-background/40 p-3">
                    <p className="text-sm font-semibold">
                      {creatorInfo.creator_nickname || creatorInfo.creator_username || "Connected creator"}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      Max direct-post video length: {creatorInfo.max_video_post_duration_sec || "unknown"}s
                    </p>
                  </div>
                ) : null}

                <form className="space-y-4" onSubmit={patchTikTokPreferences}>
                  <div className="grid gap-2">
                    <Label className="text-xs uppercase tracking-wider text-muted-foreground">Preferred Privacy Level</Label>
                    <Select
                      value={prefs.preferred_privacy_level}
                      onValueChange={(value) => setPrefs((current) => ({ ...current, preferred_privacy_level: value }))}
                    >
                      <SelectTrigger className="bg-secondary/40">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value={PRIVACY_AUTO}>auto select</SelectItem>
                        {privacyOptions.map((option) => (
                          <SelectItem key={option} value={option}>{option}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-3">
                    <div className="flex items-center justify-between">
                      <p className="text-sm">Allow comments</p>
                      <Switch
                        checked={prefs.allow_comment}
                        onCheckedChange={(checked) => setPrefs((current) => ({ ...current, allow_comment: checked }))}
                      />
                    </div>
                    <div className="flex items-center justify-between">
                      <p className="text-sm">Allow duet</p>
                      <Switch
                        checked={prefs.allow_duet}
                        onCheckedChange={(checked) => setPrefs((current) => ({ ...current, allow_duet: checked }))}
                      />
                    </div>
                    <div className="flex items-center justify-between">
                      <p className="text-sm">Allow stitch</p>
                      <Switch
                        checked={prefs.allow_stitch}
                        onCheckedChange={(checked) => setPrefs((current) => ({ ...current, allow_stitch: checked }))}
                      />
                    </div>
                  </div>

                  {tiktokMessage ? (
                    <p className={tiktokMessage.startsWith("ERROR") ? "text-xs uppercase tracking-widest text-destructive" : "text-xs uppercase tracking-widest text-primary"}>
                      {tiktokMessage}
                    </p>
                  ) : null}

                  <Button type="submit" className="w-full uppercase tracking-widest">
                    Save TikTok Preferences
                  </Button>
                </form>
              </>
            ) : null}
          </CardContent>
        </Card>
      </div>
    </AdminShell>
  );
}
