"use client";

const CONFIGURED_API_BASE_URL =
  process.env.NEXT_PUBLIC_API_BASE_URL ||
  process.env.NEXT_PUBLIC_API_URL ||
  "";

function isLocalHost(hostname) {
  return ["localhost", "127.0.0.1", "::1"].includes(hostname);
}

export const getApiBaseUrl = () => {
  const configured = CONFIGURED_API_BASE_URL.replace(/\/$/, "");
  if (typeof window === "undefined") {
    return configured || "http://localhost:8000";
  }
  const localBrowser = isLocalHost(window.location.hostname);
  if (configured && (!configured.includes("localhost") || localBrowser)) {
    return configured;
  }
  return localBrowser ? "http://localhost:8000" : "/api";
};

export const buildMediaUrl = (path) =>
  path ? `${getApiBaseUrl()}/media?path=${encodeURIComponent(path)}` : "";

export function getCsrfToken() {
  if (typeof window === "undefined") {
    return "";
  }
  return window.localStorage.getItem("platform_csrf_token") || "";
}

export function setCsrfToken(token) {
  if (typeof window === "undefined") {
    return;
  }
  window.localStorage.setItem("platform_csrf_token", token);
}

export function clearCsrfToken() {
  if (typeof window === "undefined") {
    return;
  }
  window.localStorage.removeItem("platform_csrf_token");
}

function describeApiError(payload, fallback) {
  const detail = payload?.detail;
  if (typeof detail === "string") {
    return detail;
  }
  if (Array.isArray(detail)) {
    return detail
      .map((item) => item?.msg || item?.message)
      .filter(Boolean)
      .join("; ") || fallback;
  }
  return payload?.message || fallback;
}

export async function apiFetch(path, options = {}) {
  const headers = new Headers(options.headers || {});
  if (!headers.has("Content-Type") && !(options.body instanceof FormData)) {
    headers.set("Content-Type", "application/json");
  }
  const csrf = getCsrfToken();
  if (csrf && !headers.has("x-csrf-token")) {
    headers.set("x-csrf-token", csrf);
  }
  const response = await fetch(`${getApiBaseUrl()}${path}`, {
    ...options,
    headers,
    credentials: "include",
  });
  if (response.status === 401 && typeof window !== "undefined") {
    clearCsrfToken();
    const next = `${window.location.pathname}${window.location.search}`;
    if (!window.location.pathname.startsWith("/login")) {
      window.location.href = `/login?next=${encodeURIComponent(next)}`;
    }
  }
  const isJson = response.headers.get("content-type")?.includes("application/json");
  let payload = null;
  if (isJson) {
    try {
      payload = await response.json();
    } catch {
      payload = null;
    }
  }
  if (!response.ok) {
    const message = describeApiError(payload, `Request failed (${response.status})`);
    throw new Error(message);
  }
  return payload;
}

export function toDatetimeLocal(value) {
  if (!value) {
    return "";
  }
  const date = new Date(value);
  const pad = (part) => String(part).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}
