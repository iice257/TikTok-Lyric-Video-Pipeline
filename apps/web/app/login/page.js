"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

import { apiFetch, setCsrfToken } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("admin@example.com");
  const [password, setPassword] = useState("admin123");
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
      router.push("/");
    } catch (err) {
      setError(err.message);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-background px-4">
      <Card className="w-full max-w-md border-border bg-card">
        <CardHeader className="space-y-2">
          <p className="text-xs uppercase tracking-widest text-primary">Control Panel</p>
          <CardTitle className="text-2xl font-bold">Sign In</CardTitle>
        </CardHeader>
        <CardContent>
          <form className="space-y-4" onSubmit={onSubmit}>
            <div className="grid gap-2">
              <Label className="text-xs uppercase tracking-widest text-muted-foreground">Email</Label>
              <Input value={email} onChange={(e) => setEmail(e.target.value)} className="bg-secondary/40" />
            </div>
            <div className="grid gap-2">
              <Label className="text-xs uppercase tracking-widest text-muted-foreground">Password</Label>
              <Input type="password" value={password} onChange={(e) => setPassword(e.target.value)} className="bg-secondary/40" />
            </div>
            {error ? <p className="text-xs uppercase tracking-widest text-destructive">{error}</p> : null}
            <Button type="submit" disabled={submitting} className="w-full uppercase tracking-widest">
              {submitting ? "Signing in..." : "Sign In"}
            </Button>
          </form>
        </CardContent>
      </Card>
    </main>
  );
}
