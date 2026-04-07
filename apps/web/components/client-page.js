"use client";

import { useEffect, useRef, useState } from "react";

import { apiFetch } from "@/lib/api";

export function useResource(path, initial = null) {
  const [data, setData] = useState(initial);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const reloadRef = useRef(async () => {});

  useEffect(() => {
    let cancelled = false;
    async function load(showSpinner = false) {
      if (showSpinner) {
        setLoading(true);
      }
      try {
        const payload = await apiFetch(path);
        if (!cancelled) {
          setData(payload);
          setError("");
        }
      } catch (err) {
        if (!cancelled) {
          setError(err.message);
        }
      } finally {
        if (!cancelled && showSpinner) {
          setLoading(false);
        }
      }
    }

    load(true);
    const interval = window.setInterval(() => load(false), 15000);
    return () => {
      cancelled = true;
        window.clearInterval(interval);
      };
  }, [path]);

  reloadRef.current = async (showSpinner = true) => {
    if (showSpinner) {
      setLoading(true);
    }
    try {
      const payload = await apiFetch(path);
      setData(payload);
      setError("");
      return payload;
    } catch (err) {
      setError(err.message);
      throw err;
    } finally {
      if (showSpinner) {
        setLoading(false);
      }
    }
  };

  return { data, loading, error, setData, reload: reloadRef.current };
}
