"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { AlertTriangle, Clapperboard, Home, Music2, Settings, ShieldAlert, Terminal, Waves, ListChecks, FileClock, LogOut } from "lucide-react";
import { useState } from "react";

import { IntakeSheet } from "@/components/intake-sheet";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { apiFetch, setCsrfToken } from "@/lib/api";

const primaryNav = [
  { href: "/", label: "Event Console", icon: Terminal },
  { href: "/songs", label: "Clip Browser", icon: Clapperboard },
  { href: "/settings", label: "Configuration", icon: Settings },
];

const secondaryNav = [
  { href: "/queue", label: "Queue", icon: ListChecks },
  { href: "/alerts", label: "Alerts", icon: ShieldAlert },
  { href: "/logs", label: "Logs", icon: FileClock },
];

export function Shell({
  title,
  subtitle,
  children,
  status,
  queueCount,
  workerLabel,
  rightActions,
  contentClassName = "",
}) {
  const pathname = usePathname();
  const [intakeOpen, setIntakeOpen] = useState(false);

  async function logout() {
    try {
      await apiFetch("/auth/logout", { method: "POST" });
    } finally {
      setCsrfToken("");
      window.location.href = "/login";
    }
  }

  return (
    <div className="flex h-screen w-screen flex-col overflow-hidden bg-background text-foreground">
      <div className="flex h-6 items-center gap-8 overflow-hidden border-b border-border bg-card px-4 text-[0.625rem] uppercase tracking-[0.2em] text-muted-foreground">
        <div className="flex items-center gap-2 text-primary">
          <span className="size-1.5 animate-pulse rounded-full bg-primary" />
          <span>Sys Log: Console synchronized</span>
        </div>
        <span className="opacity-50">14:45:01 buffer cleared</span>
        <span className="opacity-50">14:44:32 stream healthy</span>
      </div>

      <div className="flex min-h-0 flex-1 overflow-hidden">
        <aside className="hidden w-64 shrink-0 flex-col border-r border-border bg-popover lg:flex">
          <div className="flex items-center gap-3 border-b border-border px-6 py-6">
            <div className="flex size-10 items-center justify-center rounded-md border border-border bg-primary/10 text-primary">
              <Waves className="size-5" />
            </div>
            <div>
              <p className="font-medium leading-none">Pipeline Cockpit</p>
              <p className="mt-1 text-[0.625rem] uppercase tracking-[0.2em] text-primary">Terminal v2.4</p>
            </div>
          </div>
          <nav className="space-y-1 px-3 py-5">
            {primaryNav.map((item) => {
              const Icon = item.icon;
              const active = pathname === item.href;
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={`flex items-center gap-3 rounded-md px-3 py-2 text-sm transition-colors ${
                    active ? "bg-primary/10 text-primary" : "text-muted-foreground hover:bg-accent hover:text-foreground"
                  }`}
                >
                  <Icon className="size-4" />
                  <span>{item.label}</span>
                </Link>
              );
            })}
            <button
              type="button"
              onClick={() => setIntakeOpen(true)}
              className="flex w-full items-center gap-3 rounded-md px-3 py-2 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
            >
              <Music2 className="size-4" />
              <span>Song Intake</span>
            </button>
            <Link
              href="/"
              className="flex items-center gap-3 rounded-md px-3 py-2 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
            >
              <Home className="size-4" />
              <span>TikTok Sync</span>
            </Link>
          </nav>
          <Separator />
          <nav className="space-y-1 px-3 py-5">
            {secondaryNav.map((item) => {
              const Icon = item.icon;
              const active = pathname === item.href;
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={`flex items-center gap-3 rounded-md px-3 py-2 text-sm transition-colors ${
                    active ? "bg-primary/10 text-primary" : "text-muted-foreground hover:bg-accent hover:text-foreground"
                  }`}
                >
                  <Icon className="size-4" />
                  <span>{item.label}</span>
                </Link>
              );
            })}
          </nav>
          <div className="mt-auto border-t border-border px-3 py-4">
            <Button variant="ghost" className="w-full justify-start" onClick={logout}>
              <LogOut className="size-4" />
              Logout
            </Button>
          </div>
        </aside>

        <main className="flex min-w-0 flex-1 flex-col overflow-hidden">
          <header className="border-b border-border bg-popover px-6 py-4">
            <div className="flex flex-wrap items-center justify-between gap-4">
              <div className="flex flex-wrap items-center gap-6">
                <div>
                  <p className="text-[0.625rem] uppercase tracking-[0.2em] text-muted-foreground">State</p>
                  <div className="mt-1 flex items-center gap-2">
                    <span className={`size-2 rounded-full ${status === "RUNNING" ? "bg-primary" : "bg-destructive"}`} />
                    <span className="text-base font-semibold">{status || "RUNNING"}</span>
                  </div>
                </div>
                <Separator orientation="vertical" className="hidden h-8 sm:block" />
                <div>
                  <p className="text-[0.625rem] uppercase tracking-[0.2em] text-muted-foreground">Worker</p>
                  <p className="mt-1 text-base font-semibold text-primary">{workerLabel || "ALIVE (2s)"}</p>
                </div>
                <Separator orientation="vertical" className="hidden h-8 sm:block" />
                <div>
                  <p className="text-[0.625rem] uppercase tracking-[0.2em] text-muted-foreground">Queue</p>
                  <p className="mt-1 text-base font-semibold">{queueCount ?? 0} jobs</p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <div className="flex rounded-md border border-border bg-card p-1">
                  <Button size="xs" className="uppercase">Main</Button>
                  <Button size="xs" variant="ghost" className="uppercase text-muted-foreground">Staging</Button>
                </div>
                <Button variant="destructive" size="sm" className="uppercase">
                  Next Post: 0d, 14h
                </Button>
                {rightActions}
              </div>
            </div>
          </header>

          <section className={`app-shell-scroll min-h-0 flex-1 overflow-auto bg-background px-6 py-8 ${contentClassName}`}>
            <div className="mx-auto flex w-full max-w-[75rem] flex-col gap-6">
              <div className="flex flex-wrap items-end justify-between gap-3">
                <div>
                  <h1 className="text-3xl font-bold">{title}</h1>
                  {subtitle ? <p className="mt-1 text-sm text-muted-foreground">{subtitle}</p> : null}
                </div>
                <div className="flex items-center gap-2">
                  <Button variant="outline" size="sm" className="uppercase">
                    Filter
                  </Button>
                  <Button variant="outline" size="sm" className="uppercase">
                    Clear
                  </Button>
                  <Button onClick={() => setIntakeOpen(true)} size="sm" className="uppercase">
                    Song Intake
                  </Button>
                </div>
              </div>
              {children}
            </div>
          </section>
        </main>
      </div>

      <div className="fixed inset-x-0 bottom-0 z-30 flex border-t border-border bg-popover/95 p-2 backdrop-blur lg:hidden">
        {[...primaryNav, { href: "/queue", label: "Queue", icon: ListChecks }, { href: "/alerts", label: "Alerts", icon: AlertTriangle }].map(
          (item) => {
            const Icon = item.icon;
            const active = pathname === item.href;
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`flex flex-1 flex-col items-center gap-1 rounded-md px-2 py-1 text-[0.625rem] uppercase ${
                  active ? "text-primary" : "text-muted-foreground"
                }`}
              >
                <Icon className="size-4" />
                <span>{item.label}</span>
              </Link>
            );
          }
        )}
      </div>

      <IntakeSheet open={intakeOpen} onOpenChange={setIntakeOpen} />
    </div>
  );
}

export function Panel({ title, subtitle, children, action, className = "" }) {
  return (
    <Card className={`border-border bg-card/70 ${className}`}>
      <CardHeader className="flex flex-row items-start justify-between gap-3 border-b border-border">
        <div>
          <CardTitle>{title}</CardTitle>
          {subtitle ? <CardDescription className="mt-1">{subtitle}</CardDescription> : null}
        </div>
        {action}
      </CardHeader>
      <CardContent className="pt-5">{children}</CardContent>
    </Card>
  );
}

export function StatusBadge({ tone = "muted", children }) {
  const toneClass =
    tone === "success"
      ? "border-primary/30 bg-primary/10 text-primary"
      : tone === "warning"
        ? "border-destructive/40 bg-destructive/10 text-destructive"
        : "border-border bg-muted text-muted-foreground";
  return <Badge className={`${toneClass} uppercase`}>{children}</Badge>;
}
