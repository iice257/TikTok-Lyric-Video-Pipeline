"use client";

const API_BASE_URL =
  process.env.NEXT_PUBLIC_API_BASE_URL || "http://localhost:8000";

export const getApiBaseUrl = () => API_BASE_URL.replace(/\/$/, "");

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
    window.location.href = "/login";
  }
  const isJson = response.headers.get("content-type")?.includes("application/json");
  const payload = isJson ? await response.json() : null;
  if (!response.ok) {
    const message = payload?.detail || "Request failed";
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
