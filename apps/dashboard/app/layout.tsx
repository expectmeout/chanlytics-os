import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

/**
 * next/font self-hosts the files at build time: one origin instead of three,
 * no render-blocking third-party stylesheet before first paint, automatic
 * preload, and a size-adjusted fallback so the swap stops reflowing every
 * label in the app. The CSS variables are what the legacy design system
 * consumes (tokens.css --font-sans/--font-mono), so the literal family name
 * "Geist" no longer has to resolve for the UI to look right.
 */
const geist = Geist({
  subsets: ["latin"],
  weight: ["300", "400", "500", "600"],
  variable: "--font-geist",
  display: "swap",
});
const geistMono = Geist_Mono({
  subsets: ["latin"],
  weight: ["400", "500"],
  variable: "--font-geist-mono",
  display: "swap",
});

export const metadata: Metadata = {
  title: "Chanlytics OS",
  description: "The business workspace where AI agents do the work and you make the calls.",
  // The installable shell: a manifest, the icons a phone wants, and the
  // full-screen mode Safari reads from here rather than from the manifest.
  manifest: "/manifest.webmanifest",
  icons: { icon: "/icons/icon-192.png", apple: "/icons/apple-touch-icon.png" },
  appleWebApp: { capable: true, statusBarStyle: "black-translucent", title: "Chanlytics" },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  // Draw under the notch and the home bar; the shell pads with the safe-area insets.
  viewportFit: "cover",
  themeColor: "#0e1512",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" data-theme="dark" className={`${geist.variable} ${geistMono.variable}`}>
      <body>{children}</body>
    </html>
  );
}
