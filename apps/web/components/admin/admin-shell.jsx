"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";

import { apiFetch, clearCsrfToken, getApiBaseUrl, setCsrfToken } from "@/lib/api";
import { hasEnteredDemo, isDemoMode, leaveDemo } from "@/lib/demo";
import { cn } from "@/lib/utils";
import { useThemeSync } from "@/lib/theme";

function Icon({ children }) {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" className="size-[18px] shrink-0" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      {children}
    </svg>
  );
}

const HomeIcon = () => <Icon><path d="M4 11.5 12 5l8 6.5" /><path d="M6 10v9h12v-9" /></Icon>;
const PlusIcon = () => <Icon><circle cx="12" cy="12" r="8.5" /><path d="M12 8v8M8 12h8" /></Icon>;
const LibraryIcon = () => <Icon><rect x="4" y="4" width="7" height="7" rx="1.5" /><rect x="13" y="4" width="7" height="7" rx="1.5" /><rect x="4" y="13" width="7" height="7" rx="1.5" /><rect x="13" y="13" width="7" height="7" rx="1.5" /></Icon>;
const CalendarIcon = () => <Icon><rect x="4" y="5.5" width="16" height="14" rx="2" /><path d="M8 3.5v4M16 3.5v4M4 10h16" /></Icon>;
const RingIcon = () => <Icon><circle cx="12" cy="12" r="8.5" /><circle cx="12" cy="12" r="3" /><path d="M12 3.5v2M20.5 12h-2M12 20.5v-2M3.5 12h2" /></Icon>;
const GearIcon = () => <Icon><circle cx="12" cy="12" r="3" /><path d="M12 3v2.5M12 18.5V21M3 12h2.5M18.5 12H21M5.6 5.6l1.8 1.8M16.6 16.6l1.8 1.8M5.6 18.4l1.8-1.8M16.6 7.4l1.8-1.8" /></Icon>;
const ExitIcon = () => <Icon><path d="M10 5H5v14h5" /><path d="m14 8 4 4-4 4M8 12h10" /></Icon>;

const NAV = [
  { label: "Home", href: "/", icon: HomeIcon, match: (path) => path === "/" },
  { label: "New video", href: "/new", icon: PlusIcon, match: (path) => path.startsWith("/new") },
  { label: "Library", href: "/songs", icon: LibraryIcon, match: (path) => path.startsWith("/songs") || path.startsWith("/clips") },
  { label: "Schedule", href: "/queue", icon: CalendarIcon, match: (path) => path.startsWith("/queue") },
  { label: "Visualizer", href: "/visualizer", icon: RingIcon, match: (path) => path.startsWith("/visualizer") },
  { label: "Settings", href: "/settings", icon: GearIcon, match: (path) => ["/settings", "/alerts", "/logs"].some((prefix) => path.startsWith(prefix)) },
];

export function AdminShell({ title, subtitle, children, actions, bleed = false }) {
  const pathname = usePathname();
  useThemeSync();
  const router = useRouter();
  const [session, setSession] = useState(null);
  const [signingOut, setSigningOut] = useState(false);
  const [demo, setDemo] = useState(false);

  useEffect(() => {
    // Frontend-only deployments run on demo data (lib/demo.js); sending
    // first-time visitors to /login lets them see why before entering.
    if (isDemoMode(getApiBaseUrl()) && !hasEnteredDemo()) {
      router.replace("/login");
      return undefined;
    }
    setDemo(isDemoMode(getApiBaseUrl()));
    // Old links opened intake as an overlay; it is a page now.
    if (new URLSearchParams(window.location.search).get("overlay") === "intake") {
      router.replace("/new");
    }
    let cancelled = false;
    apiFetch("/auth/me")
      .then((payload) => {
        if (!cancelled) {
          setSession(payload);
          if (payload?.session?.csrf_token) {
            setCsrfToken(payload.session.csrf_token);
          }
        }
      })
      .catch(() => {
        if (!cancelled) {
          setSession(null);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [router]);

  async function signOut() {
    setSigningOut(true);
    try {
      await apiFetch("/auth/logout", { method: "POST" });
    } catch {
      // Local session state is still cleared so a failed logout request cannot trap the user.
    } finally {
      clearCsrfToken();
      leaveDemo();
      router.push("/login");
      setSigningOut(false);
    }
  }

  return (
    <div className="min-h-screen bg-background text-foreground md:flex">
      <aside className="sticky top-0 hidden h-screen w-60 shrink-0 flex-col border-r border-border bg-card md:flex">
        <Link href="/" className="px-6 pb-6 pt-7">
          <span className="font-heading text-3xl leading-none text-primary">SSS</span>
          <span className="mt-1.5 block text-xs text-muted-foreground">Lyric videos, on schedule</span>
        </Link>
        <nav className="flex flex-1 flex-col gap-1 px-3">
          {NAV.map((item) => {
            const active = item.match(pathname);
            const ItemIcon = item.icon;
            return (
              <Link
                key={item.href}
                href={item.href}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "flex h-10 items-center gap-3 rounded-full px-4 text-sm transition-colors",
                  active ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-accent hover:text-foreground"
                )}
              >
                <ItemIcon />
                {item.label}
              </Link>
            );
          })}
        </nav>
        <div className="m-3 flex items-center gap-2 rounded-2xl border border-border px-3 py-2.5">
          <span className="min-w-0 flex-1 truncate text-sm">{session?.user?.email || "…"}</span>
          <button
            type="button"
            onClick={signOut}
            disabled={signingOut}
            aria-label="Sign out"
            title="Sign out"
            className="rounded-full p-1.5 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
          >
            <ExitIcon />
          </button>
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col pb-20 md:pb-0">
        <div className="flex items-center justify-between border-b border-border px-4 py-3 md:hidden">
          <Link href="/" className="font-heading text-2xl leading-none text-primary">SSS</Link>
          <button
            type="button"
            onClick={signOut}
            disabled={signingOut}
            aria-label="Sign out"
            className="rounded-full p-2 text-muted-foreground hover:bg-accent hover:text-foreground"
          >
            <ExitIcon />
          </button>
        </div>

        {demo ? (
          <div role="status" className="border-b border-border bg-accent px-5 py-2 text-xs text-muted-foreground lg:px-10">
            Demo mode: sample data from a local run. Changes stay in this tab, and rendering and TikTok posting need a local install.
          </div>
        ) : null}

        {title ? (
          <header className={cn("flex flex-col gap-4 px-5 pt-6 sm:flex-row sm:items-end sm:justify-between lg:px-10 lg:pt-9", bleed && "pb-4")}>
            <div className="min-w-0">
              <h1 className="font-heading text-3xl leading-tight sm:text-4xl">{title}</h1>
              {subtitle ? <p className="mt-1.5 text-sm text-muted-foreground">{subtitle}</p> : null}
            </div>
            {actions ? <div className="flex flex-wrap items-center gap-2">{actions}</div> : null}
          </header>
        ) : null}

        <main id="main-content" className={cn("flex-1", bleed ? "flex flex-col" : "px-5 py-6 lg:px-10 lg:py-8")}>
          {bleed ? children : <div className="mx-auto flex w-full max-w-6xl flex-col gap-6">{children}</div>}
        </main>
      </div>

      <nav className="fixed inset-x-0 bottom-0 z-40 grid grid-cols-6 border-t border-border bg-card/95 backdrop-blur md:hidden">
        {NAV.map((item) => {
          const active = item.match(pathname);
          const ItemIcon = item.icon;
          return (
            <Link
              key={item.href}
              href={item.href}
              aria-current={active ? "page" : undefined}
              className={cn(
                "flex flex-col items-center gap-1 py-2.5 text-[10px]",
                active ? "text-primary" : "text-muted-foreground"
              )}
            >
              <ItemIcon />
              {item.label.split(" ")[0]}
            </Link>
          );
        })}
      </nav>
    </div>
  );
}
