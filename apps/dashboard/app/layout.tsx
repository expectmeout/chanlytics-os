import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { themeBootScript } from "@chanlytics/contracts";
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
  // The browser's own chrome, in each theme's paper (tokens.css --bg, as sRGB): one dark green-black tinted every
  // workspace's bars, a light one's too, and matched neither theme's page.
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#fbfaf8" },
    { media: "(prefers-color-scheme: dark)", color: "#0c0d0f" },
  ],
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    // data-theme="dark" is what the document says until the script in its head has run, which is before anything
    // paints: the theme the app will resolve for this device (contracts themeBootScript, over themePrefOf and
    // resolveTheme). It was corrected only in an effect after the bundle had mounted, so a light workspace opened
    // dark and flipped on every refresh. The script changes the attribute before hydration, so the element says
    // the difference is expected. The CSP admits the inline script (csp.ts: 'unsafe-inline' for what Next streams).
    <html lang="en" data-theme="dark" suppressHydrationWarning className={`${geist.variable} ${geistMono.variable}`}>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeBootScript() }} />
      </head>
      <body>{children}</body>
    </html>
  );
}
