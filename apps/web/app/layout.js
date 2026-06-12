import "./globals.css";

export const metadata = {
  title: "TikTok Lyric Platform",
  description: "Mobile-first control panel for automated lyric video generation and posting.",
  robots: {
    index: false,
    follow: false,
  },
};

export const viewport = {
  colorScheme: "dark",
  themeColor: "#252525",
};

export default function RootLayout({ children }) {
  return (
    <html lang="en" className="dark">
      <body className="min-h-screen bg-background text-foreground">
        <a
          href="#main-content"
          className="sr-only fixed left-3 top-3 z-[100] bg-primary px-3 py-2 text-primary-foreground focus:not-sr-only"
        >
          Skip to content
        </a>
        {children}
      </body>
    </html>
  );
}
