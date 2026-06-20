"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

import { apiFetch, getSafeRedirectPath, setCsrfToken } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  async function onSubmit(event) {
    event.preventDefault();
    setSubmitting(true);
    setError("");
    try {
      const payload = await apiFetch("/auth/login", {
        method: "POST",
        body: JSON.stringify({ email, password }),
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
    <main id="main-content" className="min-h-screen bg-background text-foreground">
      <div className="flex h-6 items-center gap-4 border-b border-border bg-card px-4 text-[10px] font-bold uppercase tracking-[0.2em] text-muted-foreground">
        <span className="flex items-center gap-2 text-primary">
          <span className="size-1.5 rounded-full bg-primary" />
          Sys Log: Control surface locked
        </span>
        <span className="hidden md:inline">Secure session required</span>
      </div>

      <div className="flex min-h-[calc(100vh-1.5rem)] items-center justify-center px-4 py-8">
        <Card className="w-full max-w-md border-border bg-card/90">
          <CardHeader className="space-y-3">
            <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-primary">Pipeline Cockpit</p>
            <CardTitle className="text-3xl font-semibold tracking-tight">Sign In</CardTitle>
            <p className="text-sm text-muted-foreground">Authenticate to access the admin terminal.</p>
          </CardHeader>
          <CardContent>
            <form className="flex flex-col gap-4" onSubmit={onSubmit}>
              <div className="grid gap-2">
                <Label htmlFor="email" className="text-[10px] font-bold uppercase tracking-[0.2em] text-muted-foreground">Admin ID</Label>
                <Input
                  id="email"
                  type="text"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="Admin99"
                  autoComplete="username"
                  required
                  className="h-10 border-border bg-background"
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="password" className="text-[10px] font-bold uppercase tracking-[0.2em] text-muted-foreground">Password</Label>
                <Input
                  id="password"
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Enter password"
                  autoComplete="current-password"
                  required
                  className="h-10 border-border bg-background"
                />
              </div>
              {error ? <p aria-live="polite" className="text-xs uppercase tracking-[0.18em] text-destructive">{error}</p> : null}
              <Button type="submit" disabled={submitting} size="lg" className="w-full uppercase tracking-[0.2em]">
                {submitting ? "Signing In..." : "Sign In"}
              </Button>
            </form>
          </CardContent>
        </Card>
      </div>
    </main>
  );
}
