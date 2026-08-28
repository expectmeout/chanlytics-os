import type { Metadata } from "next";
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
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" data-theme="dark" className={`${geist.variable} ${geistMono.variable}`}>
      <body>{children}</body>
    </html>
  );
}
