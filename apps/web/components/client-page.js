"use client";

import { useEffect, useRef, useState } from "react";

import { apiFetch } from "@/lib/api";

// Statuses where the worker is actively moving something forward, so the UI
// should poll quickly. Long waits (retry_wait, waiting_window, approval) are
// deliberately excluded and fall back to the slow interval.
const ACTIVE_STATUSES = new Set([
  "ingested",
  "lyrics_ready",
  "queued_for_render",
  "claimed",
  "rendering",
  "uploading",
]);

export function isActiveStatus(status) {
  return ACTIVE_STATUSES.has(status);
}

export function useResource(path, initial = null, options = {}) {
  const {
    enabled = true,
    intervalMs = 15000,
    activeIntervalMs = 2000,
    isActive = null,
    pauseWhenHidden = true,
  } = options;
  const [data, setData] = useState(initial);
  const [loading, setLoading] = useState(initial === null);
  const [error, setError] = useState("");
  const reloadRef = useRef(async () => {});
  const requestIdRef = useRef(0);
  const isActiveRef = useRef(isActive);
  const dataRef = useRef(data);
  const rescheduleRef = useRef(() => {});
  isActiveRef.current = isActive;
  dataRef.current = data;

  const active = Boolean(isActive && data && isActive(data));
  useEffect(() => {
    // Switch to the fast interval right away when work starts (e.g. after a
    // rerender is queued) instead of waiting out the slow timer.
    if (active) {
      rescheduleRef.current();
    }
  }, [active]);

  useEffect(() => {
    if (!enabled || !path) {
      setLoading(false);
      return undefined;
    }
    let cancelled = false;
    const controller = new AbortController();

    async function load(showSpinner = false) {
      if (pauseWhenHidden && !showSpinner && typeof document !== "undefined" && document.hidden) {
        return null;
      }
      if (showSpinner) {
        setLoading(true);
      }
      const requestId = ++requestIdRef.current;
      try {
        const payload = await apiFetch(path, { signal: controller.signal });
        if (!cancelled && requestId === requestIdRef.current) {
          dataRef.current = payload;
          setData(payload);
          setError("");
        }
        return payload;
      } catch (err) {
        if (!cancelled && requestId === requestIdRef.current && err.name !== "AbortError") {
          setError(err.message);
        }
        return null;
      } finally {
        if (!cancelled && requestId === requestIdRef.current) {
          setLoading(false);
        }
      }
    }

    let timer = null;
    function schedule() {
      if (timer) {
        window.clearTimeout(timer);
        timer = null;
      }
      if (cancelled) {
        return;
      }
      const busy = Boolean(isActiveRef.current && dataRef.current && isActiveRef.current(dataRef.current));
      const delay = busy ? activeIntervalMs : intervalMs;
      if (!delay) {
        return;
      }
      timer = window.setTimeout(async () => {
        timer = null;
        await load(false);
        schedule();
      }, delay);
    }
    rescheduleRef.current = schedule;

    load(true).then(schedule);
    const onVisibilityChange = () => {
      if (!document.hidden) {
        load(false).then(schedule);
      }
    };
    if (pauseWhenHidden && typeof document !== "undefined") {
      document.addEventListener("visibilitychange", onVisibilityChange);
    }
    return () => {
      cancelled = true;
      requestIdRef.current += 1;
      controller.abort();
      rescheduleRef.current = () => {};
      if (timer) {
        window.clearTimeout(timer);
      }
      if (pauseWhenHidden && typeof document !== "undefined") {
        document.removeEventListener("visibilitychange", onVisibilityChange);
      }
    };
  }, [activeIntervalMs, enabled, intervalMs, path, pauseWhenHidden]);

  reloadRef.current = async (showSpinner = true) => {
    if (!path) {
      return null;
    }
    if (showSpinner) {
      setLoading(true);
    }
    const requestId = ++requestIdRef.current;
    try {
      const payload = await apiFetch(path);
      if (requestId === requestIdRef.current) {
        setData(payload);
        setError("");
      }
      return payload;
    } catch (err) {
      if (requestId === requestIdRef.current) {
        setError(err.message);
      }
      throw err;
    } finally {
      if (requestId === requestIdRef.current) {
        setLoading(false);
      }
    }
  };

  return { data, loading, error, setData, reload: reloadRef.current };
}
