"use client";

import { useEffect, useState } from "react";

import { apiFetch } from "@/lib/api";

export function useResource(path, initial = null) {
  const [data, setData] = useState(initial);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

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

  return { data, loading, error, setData };
}

export function EmptyState({ title, body }) {
  return (
    <div className="rounded-lg border border-dashed border-border bg-background/50 p-6">
      <h3 className="text-base font-semibold">{title}</h3>
      <p className="mt-1 text-sm text-muted-foreground">{body}</p>
    </div>
  );
}
