import type { Metadata, Viewport } from "next";

import "./globals.css";

export const metadata: Metadata = {
  title: "TF2 Cosmetics Catalogue",
  description: "Every Team Fortress 2 Cosmetic with its trade price in Keys, Metal and dollars.",
};

export const viewport: Viewport = {
  // The list fills the screen and scrolls inside itself, so the page must be
  // exactly as tall as the phone it is on.
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className="h-full">
      {/* The list is the only thing that scrolls, so the header above it and the
          credits below it stay put while it does. */}
      <body className="flex h-full flex-col antialiased">{children}</body>
    </html>
  );
}
