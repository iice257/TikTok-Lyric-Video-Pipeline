"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

import { apiFetch, getApiBaseUrl, getSafeRedirectPath, setCsrfToken } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export function LoginForm() {
  const router = useRouter();
  const [adminId, setAdminId] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  // Hosted deployments ship the frontend only; the API and worker run locally.
  const [backendless, setBackendless] = useState(false);

  useEffect(() => {
    setBackendless(getApiBaseUrl() === "/api");
  }, []);

  async function onSubmit(event) {
    event.preventDefault();
    setSubmitting(true);
    setError("");
    try {
      const payload = await apiFetch("/auth/login", {
        method: "POST",
        body: JSON.stringify({ email: adminId, password }),
      });
      setCsrfToken(payload.csrf_token);
      const next = typeof window !== "undefined" ? new URLSearchParams(window.location.search).get("next") : "";
      router.replace(getSafeRedirectPath(next));
    } catch (err) {
      setError(err.message);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main id="main-content" className="flex min-h-screen items-center justify-center bg-background px-4 py-10 text-foreground">
      <div className="w-full max-w-sm">
        <p className="font-heading text-5xl text-primary">SSS</p>
        <p className="mt-2 text-sm text-muted-foreground">Sign in to make and schedule lyric videos.</p>
        <form className="mt-8 flex flex-col gap-4 rounded-3xl border border-border bg-card p-6" onSubmit={onSubmit}>
          <div className="grid gap-2">
            <Label htmlFor="admin-id">Username</Label>
            <Input
              id="admin-id"
              name="admin-id"
              type="text"
              value={adminId}
              onChange={(e) => setAdminId(e.target.value)}
              autoComplete="username"
              required
              className="h-11 rounded-xl"
            />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="password">Password</Label>
            <Input
              id="password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="current-password"
              required
              className="h-11 rounded-xl"
            />
          </div>
          {backendless ? (
            <p className="text-sm text-muted-foreground">
              This deployment is frontend only. The pipeline backend runs locally, so sign-in is available on a local install.
            </p>
          ) : null}
          {error ? <p aria-live="polite" className="text-sm text-destructive">{error}</p> : null}
          <Button type="submit" disabled={submitting || backendless} size="lg" className="mt-2 h-11 rounded-full">
            {submitting ? "Signing in…" : "Sign in"}
          </Button>
        </form>
      </div>
    </main>
  );
}
