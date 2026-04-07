"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";

import { cn } from "@/lib/utils";
import { apiFetch } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { SongIntakeSheet } from "@/components/admin/song-intake-sheet";

const navEntries = [
  { label: "Event Console", href: "/" },
  { label: "Song Intake", action: "intake" },
  { label: "Clip Browser", href: "/songs" },
  { label: "TikTok Sync", action: "sync" },
  { label: "Configuration", href: "/settings" },
];

function StatusPill({ label, value, emphasis }) {
  return (
    <div className="flex flex-col gap-1">
      <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">{label}</p>
      <p className={cn("text-sm font-bold uppercase tracking-wide", emphasis && "text-primary")}>{value}</p>
    </div>
  );
}

export function AdminShell({ title, subtitle, children, actions, status }) {
  const pathname = usePathname();
  const router = useRouter();
  const [queryString, setQueryString] = useState("");
  const [syncState, setSyncState] = useState("idle");

  useEffect(() => {
    if (typeof window === "undefined") return;
    const applySearch = () => setQueryString(window.location.search);
    applySearch();
    window.addEventListener("popstate", applySearch);
    return () => window.removeEventListener("popstate", applySearch);
  }, [pathname]);

  const currentParams = new URLSearchParams(queryString.startsWith("?") ? queryString.slice(1) : queryString);
  const intakeOpen = currentParams.get("overlay") === "intake";

  function setOverlayState(open) {
    const next = new URLSearchParams(currentParams.toString());
    if (open) {
      next.set("overlay", "intake");
    } else {
      next.delete("overlay");
    }
    const suffix = next.toString();
    setQueryString(suffix ? `?${suffix}` : "");
    router.push(suffix ? `${pathname}?${suffix}` : pathname);
  }

  async function runSyncAction() {
    setSyncState("loading");
    try {
      await apiFetch("/integrations/tiktok/sync", { method: "POST" });
      setSyncState("success");
      window.setTimeout(() => setSyncState("idle"), 2500);
    } catch {
      setSyncState("error");
      window.setTimeout(() => setSyncState("idle"), 2500);
    }
  }

  return (
    <div className="flex min-h-screen w-full bg-background text-foreground">
      <aside className="hidden w-64 shrink-0 border-r border-border bg-card md:flex md:flex-col">
        <div className="border-b border-border px-6 py-5">
          <h1 className="text-base font-bold tracking-tight">Pipeline Cockpit</h1>
          <p className="mt-1 text-[10px] font-bold uppercase tracking-[0.2em] text-primary">Terminal v2.4</p>
        </div>
        <nav className="flex flex-1 flex-col gap-1 p-3">
          {navEntries.map((entry) => {
            if (entry.href) {
              const active = pathname === entry.href;
              return (
                <Link
                  key={entry.label}
                  href={entry.href}
                  className={cn(
                    "inline-flex h-10 items-center px-3 text-sm font-semibold tracking-wide transition-colors",
                    active
                      ? "border-l-2 border-primary bg-secondary/60 text-primary"
                      : "text-muted-foreground hover:bg-secondary/40 hover:text-foreground"
                  )}
                >
                  {entry.label}
                </Link>
              );
            }

            if (entry.action === "intake") {
              return (
                <Button
                  key={entry.label}
                  variant="ghost"
                  className={cn(
                    "h-10 justify-start rounded-none px-3 text-sm font-semibold tracking-wide",
                    intakeOpen ? "border-l-2 border-primary bg-secondary/60 text-primary" : "text-muted-foreground"
                  )}
                  onClick={() => setOverlayState(true)}
                >
                  {entry.label}
                </Button>
              );
            }

            return (
              <Button
                key={entry.label}
                variant="ghost"
                className="h-10 justify-start rounded-none px-3 text-sm font-semibold tracking-wide text-muted-foreground"
                onClick={runSyncAction}
              >
                {entry.label}
                <span className="ml-auto text-[10px] uppercase tracking-widest">
                  {syncState === "loading" ? "..." : syncState === "success" ? "ok" : syncState === "error" ? "err" : ""}
                </span>
              </Button>
            );
          })}
        </nav>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <div className="flex h-6 items-center gap-6 border-b border-border bg-card px-4 text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
          <span className="text-primary">Sys Log: Console synchronized</span>
          <span className="hidden sm:inline">14:45:01 Buffer cleared</span>
          <span className="hidden md:inline">14:44:32 Stream healthy</span>
        </div>

        <header className="border-b border-border bg-card px-4 py-4 sm:px-6">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <h2 className="text-3xl font-bold tracking-tight">{title}</h2>
              {subtitle ? <p className="mt-1 text-sm text-muted-foreground">{subtitle}</p> : null}
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <div className="hidden items-center rounded-md border border-border bg-secondary/40 p-1 sm:flex">
                <Button size="xs" className="uppercase tracking-wide">
                  Main
                </Button>
                <Button size="xs" variant="ghost" className="uppercase tracking-wide text-muted-foreground">
                  Staging
                </Button>
              </div>
              {actions}
            </div>
          </div>

          <div className="mt-4 flex flex-wrap items-center gap-4">
            <StatusPill label="State" value={status?.state || "RUNNING"} emphasis />
            <Separator orientation="vertical" className="hidden h-8 sm:block" />
            <StatusPill label="Worker" value={status?.worker || "ALIVE (2s)"} emphasis />
            <Separator orientation="vertical" className="hidden h-8 sm:block" />
            <StatusPill label="Queue" value={status?.queue || "18 JOBS"} />
          </div>
        </header>

        <main className="terminal-scroll flex-1 overflow-y-auto p-4 sm:p-6">{children}</main>
      </div>

      <SongIntakeSheet open={intakeOpen} onOpenChange={setOverlayState} />
    </div>
  );
}
