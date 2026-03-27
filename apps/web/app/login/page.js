"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

import { apiFetch, setCsrfToken } from "@/lib/api";

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
    <main className="page" style={{ minHeight: "100vh", alignContent: "center" }}>
      <section className="panel full">
        <div className="panelHeader">
          <div>
            <p className="eyebrow">Control Panel</p>
            <h1>Sign In</h1>
          </div>
        </div>
        <div className="panelBody">
          <form className="stack" onSubmit={onSubmit}>
            <label className="field">
              <span>Email</span>
              <input value={email} onChange={(e) => setEmail(e.target.value)} />
            </label>
            <label className="field">
              <span>Password</span>
              <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} />
            </label>
            {error ? <p className="errorText">{error}</p> : null}
            <button type="submit" disabled={submitting}>
              {submitting ? "Signing in..." : "Sign In"}
            </button>
          </form>
        </div>
      </section>
    </main>
  );
}
