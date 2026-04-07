"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";

import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { SongIntakeSheet } from "@/components/admin/song-intake-sheet";

const primaryEntries = [
  { label: "Event Console", href: "/", icon: TerminalIcon },
  { label: "Song Intake", action: "intake", icon: NoteIcon },
  { label: "Clip Browser", href: "/songs", icon: LibraryIcon },
  { label: "TikTok Sync", disabled: true, icon: SyncIcon },
];

function TerminalIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" className="size-4" fill="none" stroke="currentColor" strokeWidth="1.8">
      <path d="M4 7h16" />
      <path d="M7 7V5h10v2" />
      <path d="M6 11h5" />
      <path d="M6 15h8" />
      <path d="M5 19h14a1 1 0 0 0 1-1V8H4v10a1 1 0 0 0 1 1Z" />
    </svg>
  );
}

function NoteIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" className="size-4" fill="none" stroke="currentColor" strokeWidth="1.8">
      <path d="M8 18a2.5 2.5 0 1 1-2.5-2.5A2.5 2.5 0 0 1 8 18Z" />
      <path d="M18 15a2.5 2.5 0 1 1-2.5-2.5A2.5 2.5 0 0 1 18 15Z" />
      <path d="M8 18V7l10-2v10" />
      <path d="M8 11 18 9" />
    </svg>
  );
}

function LibraryIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" className="size-4" fill="none" stroke="currentColor" strokeWidth="1.8">
      <path d="M4 6h4v12H4z" />
      <path d="M10 4h4v14h-4z" />
      <path d="M16 8h4v10h-4z" />
    </svg>
  );
}

function SyncIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" className="size-4" fill="none" stroke="currentColor" strokeWidth="1.8">
      <path d="M19 7V4l-3 3" />
      <path d="M5 17v3l3-3" />
      <path d="M7 7a7 7 0 0 1 11-2.5L19 5" />
      <path d="M17 17A7 7 0 0 1 6 19.5L5 19" />
    </svg>
  );
}

function SettingsIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" className="size-4" fill="none" stroke="currentColor" strokeWidth="1.8">
      <path d="M12 8.5A3.5 3.5 0 1 1 8.5 12 3.5 3.5 0 0 1 12 8.5Z" />
      <path d="M19.4 15a1 1 0 0 0 .2 1.1l.1.1a1 1 0 0 1 0 1.4l-1.4 1.4a1 1 0 0 1-1.4 0l-.1-.1a1 1 0 0 0-1.1-.2 1 1 0 0 0-.6.9V20a1 1 0 0 1-1 1h-2a1 1 0 0 1-1-1v-.2a1 1 0 0 0-.7-.9 1 1 0 0 0-1.1.2l-.1.1a1 1 0 0 1-1.4 0L4.3 17.8a1 1 0 0 1 0-1.4l.1-.1a1 1 0 0 0 .2-1.1 1 1 0 0 0-.9-.6H3.5a1 1 0 0 1-1-1v-2a1 1 0 0 1 1-1h.2a1 1 0 0 0 .9-.7 1 1 0 0 0-.2-1.1l-.1-.1a1 1 0 0 1 0-1.4l1.4-1.4a1 1 0 0 1 1.4 0l.1.1a1 1 0 0 0 1.1.2 1 1 0 0 0 .6-.9V4a1 1 0 0 1 1-1h2a1 1 0 0 1 1 1v.2a1 1 0 0 0 .7.9 1 1 0 0 0 1.1-.2l.1-.1a1 1 0 0 1 1.4 0l1.4 1.4a1 1 0 0 1 0 1.4l-.1.1a1 1 0 0 0-.2 1.1 1 1 0 0 0 .9.6h.2a1 1 0 0 1 1 1v2a1 1 0 0 1-1 1h-.2a1 1 0 0 0-.9.7Z" />
    </svg>
  );
}

function BoltBadge() {
  return (
    <div className="flex size-8 items-center justify-center rounded-md bg-primary text-primary-foreground">
      <svg aria-hidden="true" viewBox="0 0 24 24" className="size-4" fill="currentColor">
        <path d="M13 2 5.5 13H11l-1 9L18.5 11H13z" />
      </svg>
    </div>
  );
}

function NavButton({ active, children, icon: Icon, disabled, href, onClick }) {
  const classes = cn(
    "mx-3 flex h-10 items-center gap-3 rounded-sm px-4 text-sm transition-colors",
    active
      ? "bg-primary/10 font-semibold text-primary"
      : disabled
        ? "text-muted-foreground/45"
        : "font-medium text-muted-foreground hover:bg-muted hover:text-foreground"
  );

  if (href) {
    return (
      <Link href={href} className={classes}>
        <Icon />
        <span>{children}</span>
      </Link>
    );
  }

  if (disabled) {
    return (
      <div aria-disabled="true" className={classes}>
        <Icon />
        <span>{children}</span>
        <span className="ml-auto text-[10px] font-bold uppercase tracking-[0.2em] text-muted-foreground/55">
          idle
        </span>
      </div>
    );
  }

  return (
    <button type="button" onClick={onClick} className={classes}>
      <Icon />
      <span>{children}</span>
    </button>
  );
}

function StatusBlock({ label, value, accent }) {
  return (
    <div className="flex min-w-20 flex-col gap-1">
      <span className="text-[10px] font-bold uppercase tracking-[0.2em] text-muted-foreground">
        {label}
      </span>
      <span className={cn("flex items-center gap-2 text-base font-semibold uppercase tracking-tight", accent && "text-primary")}>
        {accent ? <span className="size-2 rounded-full bg-primary" /> : null}
        {value}
      </span>
    </div>
  );
}

function MobileEntry({ entry, active, onIntakeOpen }) {
  if (entry.href) {
    const Icon = entry.icon;
    return (
      <Link
        href={entry.href}
        className={cn(
          "inline-flex items-center gap-2 border-b-2 px-1 py-3 text-xs font-medium uppercase tracking-[0.16em]",
          active ? "border-primary text-primary" : "border-transparent text-muted-foreground"
        )}
      >
        <Icon />
        <span>{entry.label}</span>
      </Link>
    );
  }

  if (entry.disabled) {
    const Icon = entry.icon;
    return (
      <div className="inline-flex items-center gap-2 border-b-2 border-transparent px-1 py-3 text-xs font-medium uppercase tracking-[0.16em] text-muted-foreground/45">
        <Icon />
        <span>{entry.label}</span>
      </div>
    );
  }

  const Icon = entry.icon;
  return (
    <button
      type="button"
      onClick={onIntakeOpen}
      className={cn(
        "inline-flex items-center gap-2 border-b-2 px-1 py-3 text-xs font-medium uppercase tracking-[0.16em]",
        active ? "border-primary text-primary" : "border-transparent text-muted-foreground"
      )}
    >
      <Icon />
      <span>{entry.label}</span>
    </button>
  );
}

export function AdminShell({ title, subtitle, children, actions, status }) {
  const pathname = usePathname();
  const router = useRouter();
  const [queryString, setQueryString] = useState("");

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }
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

  return (
    <div className="min-h-screen bg-background text-foreground">
      <div className="flex h-6 items-center gap-4 border-b border-border bg-card px-4 text-[10px] font-bold uppercase tracking-[0.2em] text-muted-foreground">
        <span className="flex items-center gap-2 text-primary">
          <span className="size-1.5 rounded-full bg-primary" />
          Sys Log: Console synchronized
        </span>
        <span className="hidden md:inline">14:45:01 Buffer cleared</span>
        <span className="hidden lg:inline">14:44:32 Stream healthy</span>
      </div>

      <div className="flex min-h-[calc(100vh-1.5rem)]">
        <aside className="hidden w-64 shrink-0 border-r border-border bg-card md:flex md:flex-col">
          <div className="flex items-center gap-3 border-b border-border px-6 py-6">
            <div className="rounded-sm ring-1 ring-border/70">
              <BoltBadge />
            </div>
            <div className="min-w-0">
              <p className="truncate text-base font-semibold tracking-tight">Pipeline Cockpit</p>
              <p className="mt-1 text-[10px] font-bold uppercase tracking-[0.22em] text-primary">
                Terminal v2.4
              </p>
            </div>
          </div>

          <nav className="flex flex-1 flex-col gap-1 py-4">
            {primaryEntries.map((entry) => (
              <NavButton
                key={entry.label}
                active={entry.href ? pathname === entry.href : intakeOpen}
                disabled={entry.disabled}
                href={entry.href}
                icon={entry.icon}
                onClick={entry.action === "intake" ? () => setOverlayState(true) : undefined}
              >
                {entry.label}
              </NavButton>
            ))}
          </nav>

          <div className="border-t border-border py-4">
            <NavButton active={pathname === "/settings"} href="/settings" icon={SettingsIcon}>
              Configuration
            </NavButton>
          </div>
        </aside>

        <div className="flex min-w-0 flex-1 flex-col">
          <div className="border-b border-border bg-background md:hidden">
            <div className="terminal-scroll flex items-center gap-4 overflow-x-auto px-4">
              {primaryEntries.map((entry) => (
                <MobileEntry
                  key={entry.label}
                  entry={entry}
                  active={entry.href ? pathname === entry.href : intakeOpen}
                  onIntakeOpen={() => setOverlayState(true)}
                />
              ))}
              <Link
                href="/settings"
                className={cn(
                  "inline-flex items-center gap-2 border-b-2 px-1 py-3 text-xs font-medium uppercase tracking-[0.16em]",
                  pathname === "/settings" ? "border-primary text-primary" : "border-transparent text-muted-foreground"
                )}
              >
                <SettingsIcon />
                <span>Configuration</span>
              </Link>
            </div>
          </div>

          <header className="border-b border-border bg-card">
            <div className="flex flex-col gap-6 px-5 py-5 lg:px-8">
              <div className="flex flex-col gap-5 xl:flex-row xl:items-center xl:justify-between">
                <div className="flex flex-wrap items-center gap-5">
                  <StatusBlock label="State" value={status?.state || "RUNNING"} accent />
                  <Separator orientation="vertical" className="hidden h-8 sm:block" />
                  <StatusBlock label="Worker" value={status?.worker || "ALIVE (2s)"} />
                  <Separator orientation="vertical" className="hidden h-8 sm:block" />
                  <StatusBlock label="Queue" value={status?.queue || "18 Jobs"} />
                </div>

                <div className="flex flex-wrap items-center gap-3">
                  <div className="flex items-center gap-1 rounded-md border border-border bg-background p-1">
                    <Button size="xs" className="uppercase tracking-[0.18em]">
                      Main
                    </Button>
                    <Button size="xs" variant="ghost" className="text-muted-foreground uppercase tracking-[0.18em]">
                      Staging
                    </Button>
                  </div>
                  {actions}
                </div>
              </div>

              <div className="flex flex-col gap-1">
                <h1 className="text-3xl font-semibold tracking-tight">{title}</h1>
                {subtitle ? <p className="text-sm text-muted-foreground">{subtitle}</p> : null}
              </div>
            </div>
          </header>

          <main className="terminal-scroll flex-1 overflow-y-auto px-5 py-6 lg:px-8">
            <div className="mx-auto flex w-full max-w-6xl flex-col gap-6">{children}</div>
          </main>
        </div>
      </div>

      <SongIntakeSheet open={intakeOpen} onOpenChange={setOverlayState} />
    </div>
  );
}
