"use client";

import { useEffect, useRef, useState } from "react";

import { apiFetch } from "@/lib/api";

export function useResource(path, initial = null, options = {}) {
  const { enabled = true, intervalMs = 15000, pauseWhenHidden = true } = options;
  const [data, setData] = useState(initial);
  const [loading, setLoading] = useState(initial === null);
  const [error, setError] = useState("");
  const reloadRef = useRef(async () => {});
  const requestIdRef = useRef(0);

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

    load(true);
    const interval = intervalMs ? window.setInterval(() => load(false), intervalMs) : null;
    const onVisibilityChange = () => {
      if (!document.hidden) {
        load(false);
      }
    };
    if (pauseWhenHidden && typeof document !== "undefined") {
      document.addEventListener("visibilitychange", onVisibilityChange);
    }
    return () => {
      cancelled = true;
      requestIdRef.current += 1;
      controller.abort();
      if (interval) {
        window.clearInterval(interval);
      }
      if (pauseWhenHidden && typeof document !== "undefined") {
        document.removeEventListener("visibilitychange", onVisibilityChange);
      }
    };
  }, [enabled, intervalMs, path, pauseWhenHidden]);

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
