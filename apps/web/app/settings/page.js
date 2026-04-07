"use client";

import { useEffect, useState } from "react";

import { Shell } from "@/components/shell";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { useResource } from "@/components/client-page";
import { apiFetch } from "@/lib/api";

const PRIVACY_AUTO = "__auto__";

function ToggleRow({ title, description, checked, onCheckedChange }) {
  return (
    <div className="flex items-center justify-between gap-4">
      <div>
        <p className="text-sm font-medium">{title}</p>
        <p className="text-xs text-muted-foreground">{description}</p>
      </div>
      <Switch checked={checked} onCheckedChange={onCheckedChange} />
    </div>
  );
}

export default function SettingsPage() {
  const pipelineResource = useResource("/pipeline/settings");
  const tiktokResource = useResource("/integrations/tiktok/status");
  const [pipelineMessage, setPipelineMessage] = useState("");
  const [tiktokMessage, setTiktokMessage] = useState("");
  const [allowComment, setAllowComment] = useState(false);
  const [allowDuet, setAllowDuet] = useState(false);
  const [allowStitch, setAllowStitch] = useState(false);
  const [preferredPrivacyLevel, setPreferredPrivacyLevel] = useState(PRIVACY_AUTO);

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
    const prefs = tiktokResource.data?.integration?.preferences;
    if (!prefs) {
      return;
    }
    setAllowComment(Boolean(prefs.allow_comment));
    setAllowDuet(Boolean(prefs.allow_duet));
    setAllowStitch(Boolean(prefs.allow_stitch));
    setPreferredPrivacyLevel(prefs.preferred_privacy_level || PRIVACY_AUTO);
  }, [tiktokResource.data]);

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
    try {
      const payload = await apiFetch("/integrations/tiktok/preferences", {
        method: "PATCH",
        body: JSON.stringify({
          preferred_privacy_level: preferredPrivacyLevel === PRIVACY_AUTO ? null : preferredPrivacyLevel,
          allow_comment: allowComment,
          allow_duet: allowDuet,
          allow_stitch: allowStitch,
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
  const creatorInfo = tiktokData?.creator_info;
  const privacyOptions = creatorInfo?.privacy_level_options || [];

  return (
    <Shell
      title="Configuration"
      subtitle="Manage system settings, integrations, and operational parameters."
      status={pipelineData?.pipeline?.paused ? "PAUSED" : "RUNNING"}
      queueCount={pipelineData?.pipeline?.target_videos_max || 0}
    >
      <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
        <Card className="border-border bg-card/70">
          <CardHeader>
            <CardTitle>Pipeline Settings</CardTitle>
            <CardDescription>Pause state, upload mode, and throughput controls.</CardDescription>
          </CardHeader>
          <CardContent>
            {pipelineResource.loading ? <p className="text-sm text-muted-foreground">Loading settings...</p> : null}
            {pipelineResource.error ? <p className="text-sm text-destructive">{pipelineResource.error}</p> : null}
            {pipelineData ? (
              <form className="space-y-5" onSubmit={patchSettings}>
                <div className="space-y-2">
                  <Label htmlFor="paused">Paused</Label>
                  <Select name="paused" defaultValue={String(pipelineData.pipeline.paused || false)}>
                    <SelectTrigger id="paused">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="false">false</SelectItem>
                      <SelectItem value="true">true</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="upload_mode">Upload Mode</Label>
                  <Select name="upload_mode" defaultValue={pipelineData.env.upload_mode}>
                    <SelectTrigger id="upload_mode">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="hybrid">hybrid</SelectItem>
                      <SelectItem value="draft">draft</SelectItem>
                      <SelectItem value="direct">direct</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="space-y-2">
                    <Label htmlFor="target_videos_min">Target Min</Label>
                    <Input
                      id="target_videos_min"
                      name="target_videos_min"
                      type="number"
                      min="1"
                      defaultValue={pipelineData.pipeline.target_videos_min || 10}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="target_videos_max">Target Max</Label>
                    <Input
                      id="target_videos_max"
                      name="target_videos_max"
                      type="number"
                      min="1"
                      defaultValue={pipelineData.pipeline.target_videos_max || 15}
                    />
                  </div>
                </div>
                <div className="flex flex-wrap gap-2">
                  <Badge variant="outline">{pipelineData.env.app_env}</Badge>
                  <Badge className={pipelineData.env.lab_enabled ? "border-destructive/40 bg-destructive/10 text-destructive" : "border-primary/30 bg-primary/10 text-primary"}>
                    lab {pipelineData.env.lab_enabled ? "enabled" : "disabled"}
                  </Badge>
                </div>
                {pipelineMessage ? (
                  <p className={pipelineMessage.includes("updated") ? "text-sm text-muted-foreground" : "text-sm text-destructive"}>{pipelineMessage}</p>
                ) : null}
                <Button type="submit" className="uppercase">
                  Save Changes
                </Button>
              </form>
            ) : null}
          </CardContent>
        </Card>

        <Card className="border-border bg-card/70">
          <CardHeader>
            <CardTitle>Integrations</CardTitle>
            <CardDescription>OAuth connection, creator status, and publish defaults.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-5">
            {tiktokResource.loading ? <p className="text-sm text-muted-foreground">Loading TikTok integration...</p> : null}
            {tiktokResource.error ? <p className="text-sm text-destructive">{tiktokResource.error}</p> : null}
            {tiktokData ? (
              <>
                <div className="flex flex-wrap gap-2">
                  <Badge className={tiktokData.connected ? "border-primary/30 bg-primary/10 text-primary" : "border-border bg-muted text-muted-foreground"}>
                    {tiktokData.connected ? "CONNECTED" : "NOT CONNECTED"}
                  </Badge>
                  <Badge className={tiktokData.configured ? "border-primary/30 bg-primary/10 text-primary" : "border-destructive/40 bg-destructive/10 text-destructive"}>
                    {tiktokData.configured ? "CONFIGURED" : "MISSING OAUTH"}
                  </Badge>
                </div>
                <div className="flex flex-wrap gap-2">
                  <Button type="button" onClick={connectTikTok} disabled={!tiktokData.configured}>
                    {tiktokData.connected ? "Reconnect TikTok" : "Connect TikTok"}
                  </Button>
                  <Button type="button" variant="outline" onClick={disconnectTikTok} disabled={!tiktokData.connected}>
                    Disconnect
                  </Button>
                </div>
                <div className="rounded-lg border border-border bg-background/50 p-4 text-sm text-muted-foreground">
                  Account: {tiktokData.subject || "none"}
                  <br />
                  Token expiry: {tiktokData.expires_at || "unknown"}
                </div>
                {creatorInfo ? (
                  <div className="rounded-lg border border-border bg-background/50 p-4 text-sm text-muted-foreground">
                    <p className="font-medium text-foreground">{creatorInfo.creator_nickname || creatorInfo.creator_username || "Connected creator"}</p>
                    <p className="mt-1">
                      Privacy options: {(creatorInfo.privacy_level_options || []).join(", ") || "none returned"}
                    </p>
                  </div>
                ) : null}
                <form className="space-y-5" onSubmit={patchTikTokPreferences}>
                  <div className="space-y-2">
                    <Label htmlFor="preferred_privacy_level">Preferred Privacy Level</Label>
                    <Select value={preferredPrivacyLevel} onValueChange={setPreferredPrivacyLevel}>
                      <SelectTrigger id="preferred_privacy_level">
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
                  </div>

                  <div className="space-y-4">
                    <ToggleRow
                      title="Allow comments"
                      description="Allow comments when TikTok creator settings permit it."
                      checked={allowComment}
                      onCheckedChange={setAllowComment}
                    />
                    <ToggleRow
                      title="Allow duet"
                      description="Allow duet when TikTok creator settings permit it."
                      checked={allowDuet}
                      onCheckedChange={setAllowDuet}
                    />
                    <ToggleRow
                      title="Allow stitch"
                      description="Allow stitch when TikTok creator settings permit it."
                      checked={allowStitch}
                      onCheckedChange={setAllowStitch}
                    />
                  </div>
                  {tiktokMessage ? (
                    <p
                      className={
                        tiktokMessage.includes("updated") || tiktokMessage.includes("opened") || tiktokMessage.includes("disconnected")
                          ? "text-sm text-muted-foreground"
                          : "text-sm text-destructive"
                      }
                    >
                      {tiktokMessage}
                    </p>
                  ) : null}
                  <Button type="submit" className="uppercase">
                    Save TikTok Preferences
                  </Button>
                </form>
              </>
            ) : null}
          </CardContent>
        </Card>
      </div>
    </Shell>
  );
}
