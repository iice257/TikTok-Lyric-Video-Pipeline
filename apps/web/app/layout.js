import "./globals.css";

import { themeBootScript } from "@/lib/theme-data";

export const metadata = {
  title: { default: "SSS", template: "%s · SSS" },
  description: "Turn songs into synced lyric videos for TikTok.",
  robots: {
    index: false,
    follow: false,
  },
};

export const viewport = {
  themeColor: "#0b0907",
};

export default function RootLayout({ children }) {
  return (
    <html lang="en" className="dark" suppressHydrationWarning>
      <head>
        <link rel="stylesheet" href="/visualizer/fonts/local-fonts.css" />
        <script dangerouslySetInnerHTML={{ __html: themeBootScript() }} />
      </head>
      <body className="min-h-screen bg-background text-foreground">
        <a
          href="#main-content"
          className="sr-only fixed left-3 top-3 z-[100] rounded-md bg-primary px-3 py-2 text-primary-foreground focus:not-sr-only"
        >
          Skip to content
        </a>
        {children}
      </body>
    </html>
  );
}
