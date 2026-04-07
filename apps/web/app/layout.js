import "./globals.css";
import { Inter, Space_Grotesk } from "next/font/google";

import { TooltipProvider } from "@/components/ui/tooltip";

const bodyFont = Inter({
  variable: "--font-body",
  subsets: ["latin"],
});

const headlineFont = Space_Grotesk({
  variable: "--font-headline",
  subsets: ["latin"],
});

export const metadata = {
  title: "TikTok Lyric Platform",
  description: "Mobile-first control panel for automated lyric video generation and posting.",
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body className={`${bodyFont.variable} ${headlineFont.variable} dark`}>
        <TooltipProvider>{children}</TooltipProvider>
      </body>
    </html>
  );
}
