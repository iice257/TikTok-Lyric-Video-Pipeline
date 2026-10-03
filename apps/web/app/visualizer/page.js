"use client";

import { AdminShell } from "@/components/admin/admin-shell";

// VISUALICER is a self-contained page copied into public/visualizer; it keeps
// its own settings in localStorage and never uploads media.
const ABOUT_URL = "https://lyric-audio-visualizer.vercel.app/about";
// Versioned so browsers don't reuse a cached copy served with the old X-Frame-Options: DENY.
const VISUALIZER_SRC = "/visualizer/index.html?v=2";

function connectAboutLink(event) {
  const readMore = event.currentTarget.contentDocument?.querySelector("#infoPanel a");
  if (readMore) {
    readMore.href = ABOUT_URL;
    readMore.target = "_blank";
    readMore.rel = "noreferrer";
  }
}

export default function VisualizerPage() {
  return (
    <AdminShell bleed>
      <iframe
        src={VISUALIZER_SRC}
        title="VISUALICER lyric and audio visualizer"
        allow="autoplay"
        onLoad={connectAboutLink}
        className="min-h-[calc(100dvh-8.5rem)] w-full flex-1 border-0 md:min-h-screen"
      />
    </AdminShell>
  );
}
