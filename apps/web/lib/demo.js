"use client";

// Demo mode for the hosted, frontend-only deployment. There is no API or
// worker behind it, so apiFetch() answers from demo-fixtures.json: real
// responses captured from a local run (see scripts/build_demo_fixtures.py).
// Reads come from an in-memory copy, simple toggles mutate it, and anything
// that needs the real pipeline explains that instead of failing silently.

import fixtures from "./demo-fixtures.json";

const DEMO_FLAG = "sss_demo";
const ISO_DATE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/;
// Anchor for shifting timestamps: the worker heartbeat at capture time.
const CAPTURED_AT = Date.parse(fixtures["/dashboard/summary"].workers[0].last_seen_at);

export const DEMO_UNAVAILABLE =
  "Demo mode: this needs the pipeline backend, which runs on a local install.";

export function isDemoMode(apiBaseUrl) {
  return typeof window !== "undefined" && apiBaseUrl === "/api";
}

export function enterDemo() {
  try {
    window.localStorage.setItem(DEMO_FLAG, "1");
  } catch {
    // Storage can be blocked; demo mode does not depend on it.
  }
}

export function hasEnteredDemo() {
  try {
    return window.localStorage.getItem(DEMO_FLAG) === "1";
  } catch {
    return true;
  }
}

export function leaveDemo() {
  try {
    window.localStorage.removeItem(DEMO_FLAG);
  } catch {
    // Nothing to clear.
  }
}

export function demoMediaUrl(path) {
  return path?.startsWith("/demo/") ? path : "";
}

// Fixture timestamps are from the capture. Shift them so the data always
// reads as recent ("2 minutes ago", "tomorrow") instead of aging.
function freshen(value, offsetMs) {
  if (Array.isArray(value)) return value.map((item) => freshen(item, offsetMs));
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, freshen(v, offsetMs)]));
  }
  if (typeof value === "string" && ISO_DATE.test(value)) {
    const time = Date.parse(value);
    return Number.isNaN(time) ? value : new Date(time + offsetMs).toISOString().replace("Z", "");
  }
  return value;
}

const HOUR = 3600 * 1000;
const iso = (ms) => new Date(ms).toISOString().replace("Z", "");

function buildState() {
  const state = freshen(structuredClone(fixtures), Date.now() - CAPTURED_AT);
  state["/auth/me"].user.email = "demo";

  // The capture's upload jobs were all cancelled during testing. Stage them as
  // a live schedule: one posted, one approved and upcoming, two awaiting review.
  const now = Date.now();
  const jobs = state["/upload-jobs"].upload_jobs;
  const staged = [
    { status: "posted", approved_at: iso(now - 26 * HOUR), scheduled_at: iso(now - 24 * HOUR), completed_at: iso(now - 24 * HOUR), platform_post_id: "demo-7421" },
    { status: "waiting_window", approved_at: iso(now - HOUR), scheduled_at: iso(now + 5 * HOUR), completed_at: null },
    { status: "waiting_window", approved_at: null, scheduled_at: iso(now + 20 * HOUR), completed_at: null },
    { status: "waiting_window", approved_at: null, scheduled_at: iso(now + 44 * HOUR), completed_at: null },
  ];
  jobs.forEach((job, index) => Object.assign(job, staged[index % staged.length], { approved_by_id: null, last_error: null }));

  const summary = state["/dashboard/summary"];
  summary.pending_upload_jobs = jobs.filter((job) => job.status !== "posted");
  summary.counts.upload_backlog = summary.pending_upload_jobs.length;
  summary.next_publish_at = jobs[1].scheduled_at;
  summary.workers.forEach((worker) => {
    worker.last_seen_at = iso(now - 20 * 1000);
    worker.seconds_since_seen = 20;
    worker.is_stale = false;
  });
  return state;
}

let state = null;

function getState() {
  if (!state) state = buildState();
  return state;
}

function setPaused(paused) {
  const s = getState();
  s["/dashboard/summary"].pipeline.paused = paused;
  s["/pipeline/settings"].pipeline.paused = paused;
  return { settings: { ...s["/pipeline/settings"].pipeline } };
}

function updateJob(path, change) {
  const id = decodeURIComponent(path.split("/")[2]);
  const job = getState()["/upload-jobs"].upload_jobs.find((item) => item.id === id);
  if (!job) throw new Error("Upload job not found.");
  Object.assign(job, change);
  return { upload_job: job };
}

export async function demoFetch(path, options = {}) {
  const method = (options.method || "GET").toUpperCase();
  const route = path.split("?")[0];
  const s = getState();
  // A short delay keeps loading states honest without feeling slow.
  await new Promise((resolve) => setTimeout(resolve, 120));

  if (method === "GET") {
    if (route in s) return structuredClone(s[route]);
    throw new Error("Not found in demo data.");
  }

  const body = typeof options.body === "string" ? JSON.parse(options.body || "{}") : {};
  if (route === "/auth/login") {
    enterDemo();
    return { user: s["/auth/me"].user, csrf_token: "demo" };
  }
  if (route === "/auth/logout") return { ok: true };
  if (route === "/pipeline/pause") return setPaused(true);
  if (route === "/pipeline/resume") return setPaused(false);
  if (route === "/pipeline/settings") {
    Object.assign(s["/pipeline/settings"].env, body);
    s["/integrations/tiktok/status"].integration.upload_mode = body.upload_mode ?? s["/integrations/tiktok/status"].integration.upload_mode;
    return structuredClone(s["/pipeline/settings"]);
  }
  if (route === "/presets/default") {
    s["/presets"].default = body.preset_id;
    return { default: body.preset_id };
  }
  if (route === "/integrations/tiktok/preferences") {
    Object.assign(s["/integrations/tiktok/status"].integration.preferences, body);
    return structuredClone(s["/integrations/tiktok/status"]);
  }
  if (/^\/upload-jobs\/[^/]+\/approve$/.test(route)) return updateJob(route, { approved_at: iso(Date.now()) });
  if (/^\/upload-jobs\/[^/]+\/reschedule$/.test(route)) return updateJob(route, { scheduled_at: body.scheduled_at?.replace("Z", ""), status: "waiting_window" });
  if (/^\/upload-jobs\/[^/]+\/force-publish$/.test(route)) {
    return updateJob(route, { status: "posted", approved_at: iso(Date.now()), scheduled_at: iso(Date.now()), completed_at: iso(Date.now()) });
  }
  if (method === "PATCH" && /^\/clips\/[^/]+$/.test(route) && s[route]) {
    Object.assign(s[route].clip, body);
    const listed = s["/clips"].clips.find((clip) => clip.id === s[route].clip.id);
    if (listed) Object.assign(listed, body);
    return structuredClone(s[route]);
  }
  if (/^\/alerts\/[^/]+\/ack$/.test(route)) {
    const id = route.split("/")[2];
    const alert = s["/alerts"].alerts.find((item) => item.id === id);
    if (alert) alert.acknowledged_at = iso(Date.now());
    return { alert };
  }
  // Intake, rerenders, job retries and the TikTok OAuth flow need the real
  // API, worker and ffmpeg.
  throw new Error(DEMO_UNAVAILABLE);
}
