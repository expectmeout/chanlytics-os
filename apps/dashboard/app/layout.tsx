import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { themeBootScript, themeColorOf } from "@chanlytics/contracts";
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
  // The browser's own chrome -- a phone's address bar, the tab strip, the installed shell's status bar -- in the
  // paper of the theme the document says it is (contracts THEME_COLORS, tokens.css --bg as sRGB).
  //
  // It was a pair keyed off (prefers-color-scheme), which is the DEVICE's setting, and the app's theme is not: it is
  // the data-theme below, resolved from the member's stored preference. Anyone whose two disagreed read every screen
  // through a strip of the other theme, for good, because nothing in the app ever re-read the meta. One colour
  // stands here now, the dark the document below also stands in, and it is what a device running no script keeps;
  // the boot script writes the resolved theme's over it before first paint, and LegacyApp's paintThemeColor writes
  // it again on every change.
  themeColor: themeColorOf("dark"),
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
