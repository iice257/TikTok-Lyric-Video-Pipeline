"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { apiFetch, setCsrfToken } from "@/lib/api";

const navItems = [
  ["/", "Overview"],
  ["/queue", "Queue"],
  ["/songs", "Songs"],
  ["/intake", "Intake"],
  ["/alerts", "Alerts"],
  ["/settings", "Settings"],
  ["/logs", "Logs"],
];

export function Shell({ title, children }) {
  const pathname = usePathname();

  async function logout() {
    try {
      await apiFetch("/auth/logout", { method: "POST" });
    } finally {
      setCsrfToken("");
      window.location.href = "/login";
    }
  }

  return (
    <div className="shell">
      <header className="topbar">
        <div className="topbarRow">
          <p className="eyebrow">TikTok Lyric Platform</p>
          <h1>{title}</h1>
        </div>
        <button className="button ghost topbarButton" type="button" onClick={logout}>Logout</button>
      </header>
      <main className="page">{children}</main>
      <nav className="bottomNav">
        {navItems.map(([href, label]) => (
          <Link
            key={href}
            href={href}
            className={pathname === href ? "navLink active" : "navLink"}
          >
            {label}
          </Link>
        ))}
      </nav>
    </div>
  );
}

export function Panel({ title, subtitle, children, action }) {
  return (
    <section className="panel">
      <div className="panelHeader">
        <div>
          <h2>{title}</h2>
          {subtitle ? <p>{subtitle}</p> : null}
        </div>
        {action ? <div>{action}</div> : null}
      </div>
      <div className="panelBody">{children}</div>
    </section>
  );
}
