import type { Metadata, Viewport } from "next";
import { Barlow, Lilita_One } from "next/font/google";

import "./globals.css";

/*
 * The game's own faces — TF2 Build and TF2 Secondary — are Valve's, so the page
 * wears the nearest open ones instead. Lilita One has TF2 Build's chunky,
 * rounded, even-stroked capitals, and is kept to what the game sets in TF2
 * Build: the title, item names, headings and buttons. Barlow is everything
 * else, down to the figures, because it has tabular numerals and stays legible
 * at the eleven pixels a caption is.
 *
 * `next/font` downloads both while the site is built and serves them from the
 * site itself, so a viewer's browser never asks Google for anything.
 */
const heading = Lilita_One({ weight: "400", subsets: ["latin"], variable: "--font-heading", display: "swap" });
const body = Barlow({ weight: ["400", "500", "600", "700"], subsets: ["latin"], variable: "--font-body", display: "swap" });

export const metadata: Metadata = {
  title: "TF2 Cosmetics Catalogue",
  description: "Every Team Fortress 2 Cosmetic with its trade price in Keys, Metal and dollars.",
};

export const viewport: Viewport = {
  // The list fills the screen and scrolls inside itself, so the page must be
  // exactly as tall as the phone it is on.
  width: "device-width",
  initialScale: 1,
  // The browser's own bar in the colour of the page under it.
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#e6dcc3" },
    { media: "(prefers-color-scheme: dark)", color: "#181513" },
  ],
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`h-full ${heading.variable} ${body.variable}`}>
      {/* The list is the only thing that scrolls, so the header above it and the
          credits below it stay put while it does. */}
      <body className="flex h-full flex-col font-sans antialiased">{children}</body>
    </html>
  );
}
