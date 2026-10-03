"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

import { apiFetch } from "@/lib/api";
import { formatDateTime, formatRelativeAge } from "@/lib/format";
import { FONTS, THEMES, useAppTheme } from "@/lib/theme";
import { cn } from "@/lib/utils";
import { useResource } from "@/components/client-page";
import { AdminShell } from "@/components/admin/admin-shell";
import { Panel } from "@/components/app/bits";
import { PresetPicker, presetDescription } from "@/components/app/preset-picker";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

export const dynamic = "force-dynamic";

const PRIVACY_AUTO = "__auto__";
const PRIVACY_LABELS = {
  SELF_ONLY: "Only me",
  MUTUAL_FOLLOW_FRIENDS: "Friends",
  FOLLOWER_OF_CREATOR: "Followers",
  PUBLIC_TO_EVERYONE: "Everyone",
};
const POST_MODES = [
  { id: "hybrid", label: "Auto", detail: "Post directly when TikTok allows it, otherwise send a draft" },
  { id: "draft", label: "Drafts", detail: "Send to your TikTok inbox to finish and post yourself" },
  { id: "direct", label: "Direct", detail: "Post straight to your profile" },
];

function Row({ title, detail, children }) {
  return (
    <div className="flex flex-col gap-3 border-t border-border py-4 first:border-t-0 first:pt-0 last:pb-0 sm:flex-row sm:items-center sm:justify-between">
      <div className="min-w-0">
        <p className="text-sm font-medium">{title}</p>
        {detail ? <p className="text-sm text-muted-foreground">{detail}</p> : null}
      </div>
      <div className="shrink-0">{children}</div>
    </div>
  );
}

function SectionTitle({ children, note }) {
  return (
    <div className="mb-4 flex items-baseline justify-between gap-3">
      <h2 className="font-heading text-2xl">{children}</h2>
      {note ? <span className="text-xs text-muted-foreground">{note}</span> : null}
    </div>
  );
}

function TikTokSection() {
  const resource = useResource("/integrations/tiktok/status", null, { intervalMs: 0 });
  const pipeline = useResource("/pipeline/settings", null, { intervalMs: 0 });
  const [prefs, setPrefs] = useState(null);
  const [message, setMessage] = useState("");
  const tiktok = resource.data?.integration;
  const creator = tiktok?.creator_info;
  const postMode = pipeline.data?.pipeline?.upload_mode || pipeline.data?.env?.upload_mode || "hybrid";

  useEffect(() => {
    const stored = tiktok?.preferences;
    if (stored) {
      setPrefs({
        preferred_privacy_level: stored.preferred_privacy_level || PRIVACY_AUTO,
        allow_comment: Boolean(stored.allow_comment),
        allow_duet: Boolean(stored.allow_duet),
        allow_stitch: Boolean(stored.allow_stitch),
      });
    }
  }, [tiktok?.preferences]);

  async function run(action, done) {
    setMessage("");
    try {
      await action();
      if (done) setMessage(done);
    } catch (err) {
      setMessage(err.message);
    }
  }

  const connect = () =>
    run(async () => {
      const payload = await apiFetch("/integrations/tiktok/connect", { method: "POST" });
      const popup = window.open(payload.auth_url, "tiktok-connect", "popup=yes,width=640,height=840");
      if (!popup) window.location.href = payload.auth_url;
    }, "Finish signing in to TikTok in the new window.");

  const disconnect = () =>
    run(async () => {
      await apiFetch("/integrations/tiktok/disconnect", { method: "POST" });
      await resource.reload(false);
    }, "Disconnected.");

  const savePrefs = (next) => {
    setPrefs(next);
    run(() =>
      apiFetch("/integrations/tiktok/preferences", {
        method: "PATCH",
        body: JSON.stringify({ ...next, preferred_privacy_level: next.preferred_privacy_level === PRIVACY_AUTO ? null : next.preferred_privacy_level }),
      })
    );
  };

  const setPostMode = (mode) =>
    run(async () => {
      await apiFetch("/pipeline/settings", { method: "PATCH", body: JSON.stringify({ upload_mode: mode }) });
      await pipeline.reload(false);
    });

  return (
    <Panel>
      <SectionTitle note={tiktok?.simulate_uploads ? "Test mode: posts are simulated" : null}>TikTok</SectionTitle>
      {resource.error ? <p className="text-sm text-destructive">{resource.error}</p> : null}
      {tiktok ? (
        <div className="flex flex-col">
          <Row
            title={tiktok.connected ? creator?.creator_nickname || creator?.creator_username || "Connected" : "Not connected"}
            detail={
              !tiktok.configured
                ? "Add TIKTOK_CLIENT_KEY, TIKTOK_CLIENT_SECRET and TIKTOK_REDIRECT_URI to the backend environment first."
                : tiktok.connected
                  ? `Signed in${tiktok.expires_at ? ` · token renews ${formatDateTime(tiktok.expires_at)}` : ""}`
                  : "Connect your account so scheduled clips can post."
            }
          >
            <div className="flex gap-2">
              <Button className="rounded-full" onClick={connect} disabled={!tiktok.configured}>
                {tiktok.connected ? "Reconnect" : "Connect"}
              </Button>
              {tiktok.connected ? (
                <Button variant="ghost" className="rounded-full" onClick={disconnect}>
                  Disconnect
                </Button>
              ) : null}
            </div>
          </Row>
          {tiktok.last_error ? <p className="pb-2 text-sm text-destructive">{tiktok.last_error}</p> : null}
          <Row title="How clips post" detail={POST_MODES.find((mode) => mode.id === postMode)?.detail}>
            <div className="flex gap-1 rounded-full border border-border p-1">
              {POST_MODES.map((mode) => (
                <button
                  key={mode.id}
                  type="button"
                  aria-pressed={postMode === mode.id}
                  onClick={() => setPostMode(mode.id)}
                  className={cn(
                    "h-8 rounded-full px-4 text-sm transition-colors",
                    postMode === mode.id ? "bg-foreground text-background" : "text-muted-foreground hover:text-foreground"
                  )}
                >
                  {mode.label}
                </button>
              ))}
            </div>
          </Row>
          {prefs ? (
            <>
              <Row title="Who can see posts" detail="TikTok only offers the options your account allows.">
                <Select value={prefs.preferred_privacy_level} onValueChange={(value) => savePrefs({ ...prefs, preferred_privacy_level: value })}>
                  <SelectTrigger className="min-w-40 rounded-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectGroup>
                      <SelectItem value={PRIVACY_AUTO}>Automatic</SelectItem>
                      {[...new Set([...(creator?.privacy_level_options || []), prefs.preferred_privacy_level])]
                        .filter((option) => option !== PRIVACY_AUTO)
                        .map((option) => (
                          <SelectItem key={option} value={option}>
                            {PRIVACY_LABELS[option] || option.replaceAll("_", " ").toLowerCase()}
                          </SelectItem>
                        ))}
                    </SelectGroup>
                  </SelectContent>
                </Select>
              </Row>
              {[
                ["allow_comment", "Comments"],
                ["allow_duet", "Duets"],
                ["allow_stitch", "Stitches"],
              ].map(([key, label]) => (
                <Row key={key} title={`Allow ${label.toLowerCase()}`}>
                  <Switch checked={prefs[key]} onCheckedChange={(checked) => savePrefs({ ...prefs, [key]: checked })} aria-label={`Allow ${label}`} />
                </Row>
              ))}
            </>
          ) : null}
          {message ? <p aria-live="polite" className="pt-3 text-sm text-muted-foreground">{message}</p> : null}
        </div>
      ) : (
        <p className="text-sm text-muted-foreground">Loading…</p>
      )}
    </Panel>
  );
}

function AppearanceSection() {
  const presets = useResource("/presets", null, { intervalMs: 0 });
  const [theme, setTheme] = useAppTheme();
  const [presetError, setPresetError] = useState("");
  const [systemMode, setSystemMode] = useState("dark");
  const selectedPreset = presets.data?.presets?.find((item) => item.id === presets.data.default);
  const selectedAppTheme = THEMES.find((item) => item.id === theme.id) || THEMES[0];
  const paletteMode = theme.mode === "auto" ? systemMode : theme.mode;

  useEffect(() => {
    const preference = window.matchMedia("(prefers-color-scheme: light)");
    const updateMode = () => setSystemMode(preference.matches ? "light" : "dark");
    updateMode();
    preference.addEventListener("change", updateMode);
    return () => preference.removeEventListener("change", updateMode);
  }, []);

  async function choosePreset(presetId) {
    setPresetError("");
    try {
      await apiFetch("/presets/default", { method: "PATCH", body: JSON.stringify({ preset_id: presetId }) });
      await presets.reload(false);
    } catch (err) {
      setPresetError(err.message);
    }
  }

  const modeChoices = [
    { id: "dark", label: "Dark", detail: "Use the selected theme's dark colors." },
    { id: "light", label: "Light", detail: "Use the selected theme's light colors." },
    { id: "auto", label: "Auto", detail: "Match your device's light or dark setting." },
  ];

  return (
    <Panel>
      <SectionTitle note="App and video styles">Appearance</SectionTitle>
      <Tabs defaultValue="app-theme" className="gap-5">
        <TabsList aria-label="Appearance settings">
          <TabsTrigger value="app-theme">App Theme</TabsTrigger>
          <TabsTrigger value="video-theme">Video Theme</TabsTrigger>
        </TabsList>
        <TabsContent value="app-theme" className="space-y-5">
          <div>
            <h3 className="text-sm font-medium">Theme mode</h3>
            <p className="mt-1 text-sm text-muted-foreground">Choose how the app and Visualizer use the selected theme.</p>
            <div className="mt-3 flex w-fit gap-1 rounded-full border border-border p-1">
              {modeChoices.map((mode) => (
                <button
                  key={mode.id}
                  type="button"
                  title={mode.detail}
                  aria-label={`${mode.label}: ${mode.detail}`}
                  aria-pressed={theme.mode === mode.id}
                  onClick={() => setTheme({ mode: mode.id })}
                  className={cn(
                    "h-8 rounded-full px-4 text-sm transition-colors",
                    theme.mode === mode.id ? "bg-foreground text-background" : "text-muted-foreground hover:text-foreground"
                  )}
                >
                  {mode.label}
                </button>
              ))}
            </div>
            <p aria-live="polite" className="mt-2 text-xs text-muted-foreground">
              {modeChoices.find((mode) => mode.id === theme.mode)?.detail}
            </p>
          </div>
          <div>
            <h3 className="text-sm font-medium">App theme</h3>
            <p className="mt-1 text-sm text-muted-foreground">The selected palette and typography also appear in the Visualizer.</p>
            <p aria-live="polite" className="mt-1 text-xs text-muted-foreground">
              {selectedAppTheme.name} applies its colors and typography across the app and Visualizer.
            </p>
            <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-5">
              {THEMES.map((item) => {
                const palette = item[paletteMode];
                const selected = theme.id === item.id;
                const description = `${item.name} sets the app and Visualizer colors and typography.`;
                return (
                  <button
                    key={item.id}
                    type="button"
                    title={description}
                    aria-label={description}
                    aria-pressed={selected}
                    onClick={() => setTheme({ id: item.id })}
                    className={cn(
                      "flex h-20 flex-col justify-between rounded-2xl p-3 text-left ring-offset-2 ring-offset-background transition",
                      selected ? "ring-2 ring-primary" : "ring-1 ring-border hover:ring-primary/50"
                    )}
                    style={{ background: palette.bg, color: palette.text }}
                  >
                    <span className="flex gap-1" aria-hidden="true">
                      <span className="size-3 rounded-full" style={{ background: palette.accent }} />
                      <span className="size-3 rounded-full" style={{ background: palette.accent2 }} />
                    </span>
                    <span className="truncate text-sm" style={{ fontFamily: (FONTS[item.fonts[0]] || FONTS.hanken)[1] }}>
                      {item.name}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
        </TabsContent>
        <TabsContent value="video-theme" className="space-y-4">
          <div>
            <h3 className="text-sm font-medium">Default look</h3>
            <p className="mt-1 text-sm text-muted-foreground">Preselected for new songs. Existing videos keep their current look.</p>
          </div>
          {presetError ? <p className="text-sm text-destructive">{presetError}</p> : null}
          {presets.data ? (
            <PresetPicker presets={presets.data.presets} value={presets.data.default} onChange={choosePreset} />
          ) : (
            <p className="text-sm text-muted-foreground">Loading…</p>
          )}
          {selectedPreset ? (
            <p aria-live="polite" className="text-xs text-muted-foreground">
              {presetDescription(selectedPreset)} It will be used as the starting look for new songs.
            </p>
          ) : null}
        </TabsContent>
      </Tabs>
    </Panel>
  );
}

function ProcessingSection() {
  const summary = useResource("/dashboard/summary");
  const [busy, setBusy] = useState(false);
  const data = summary.data;
  const paused = Boolean(data?.pipeline?.paused);
  const workers = data?.workers || [];

  async function toggle() {
    setBusy(true);
    try {
      await apiFetch(paused ? "/pipeline/resume" : "/pipeline/pause", { method: "POST" });
      await summary.reload(false);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Panel>
      <SectionTitle>Processing</SectionTitle>
      <Row title="Process new songs" detail={paused ? "Paused. Nothing new will render or post." : "On. Songs render and post on schedule."}>
        <Switch checked={!paused} onCheckedChange={toggle} disabled={busy || !data} aria-label="Process new songs" />
      </Row>
      <Row
        title="Worker"
        detail={
          workers.length
            ? workers.map((worker) => `${worker.worker_name}: ${worker.is_stale ? "not responding" : worker.status} (seen ${formatRelativeAge(worker.last_seen_at)} ago)`).join(" · ")
            : "Not running. Start it with scripts/dev-no-docker.ps1."
        }
      />
      <Row title="Alerts" detail={`${data?.counts?.open_alerts ?? 0} open`}>
        <Button asChild variant="outline" size="sm" className="rounded-full">
          <Link href="/alerts">View</Link>
        </Button>
      </Row>
      <Row title="Activity log" detail="Everything changed from this app, with timestamps.">
        <Button asChild variant="outline" size="sm" className="rounded-full">
          <Link href="/logs">View</Link>
        </Button>
      </Row>
    </Panel>
  );
}

export default function SettingsPage() {
  return (
    <AdminShell title="Settings">
      <TikTokSection />
      <AppearanceSection />
      <ProcessingSection />
    </AdminShell>
  );
}
