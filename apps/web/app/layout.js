import "./globals.css";

export const metadata = {
  title: "TikTok Lyric Platform",
  description: "Mobile-first control panel for automated lyric video generation and posting.",
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
