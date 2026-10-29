import type { Metadata, Viewport } from "next";
import localFont from "next/font/local";
import {
  inAppBootScript,
  outlineBootScript,
  routePrefetchScript,
  themeBootScript,
  themeColorOf,
  DEFAULT_LOOK_PREF,
} from "@chanlytics/contracts";
import "./globals.css";

/**
 * next/font self-hosts the files: one origin instead of three, no render-blocking third-party stylesheet before
 * first paint, automatic preload, and a size-adjusted fallback so the swap stops reflowing every label in the app.
 * The two variable files under app/fonts are Vercel's own, vendored byte for byte from the geist package (1.7.2).
 * They were fetched from Google Fonts at build, and Google's answer sometimes carries a URL Turbopack cannot
 * resolve ("next/font/google queries have exactly one entry", vercel/next.js#99114): the production build of
 * #1348 died on it on 30 Sep 2026 while CI's build of the same commit passed. A build asks nothing over the
 * network now. Each weight range is the set of weights that was loaded before, so a heavier request still renders
 * as it did. The CSS variables are what the legacy design system consumes (tokens.css --font-sans/--font-mono), so
 * the literal family name "Geist" never has to resolve for the UI to look right.
 *
 * Glass's type is Mona Sans, the canvases' (tokens.css, the look's --font-sans): three @font-face rules in globals.css
 * over public/fonts, in the subsets Google Fonts splits it into, so a name in Vietnamese or Polish takes its own glyphs
 * rather than Geist's. next/font/local takes one file per face and no unicode-range, so those are written by hand; the
 * latin file is preloaded below, since Glass is the default look (contracts DEFAULT_LOOK_PREF).
 */
// Geist's sans is no longer the app's type: the desk sign's (yes/DeskSign.tsx, `.sign-body`) and a fallback behind Mona
// Sans. It is not preloaded, so a page fetches it only where it is drawn; preloaded, every page asked for its 70 KB ahead
// of its own stylesheets and drew nothing in it (the load review of 28 Oct 2026: document.fonts said "geist unloaded").
const geist = localFont({
  src: "./fonts/Geist-Variable.woff2",
  weight: "300 600",
  variable: "--font-geist",
  display: "swap",
  preload: false,
});
const geistMono = localFont({
  src: "./fonts/GeistMono-Variable.woff2",
  weight: "400 500",
  variable: "--font-geist-mono",
  display: "swap",
});

export const metadata: Metadata = {
  title: "Chanlytics",
  description: "The business workspace where AI agents do the work and you make the calls.",
  // The installable shell: a manifest, the icons a phone wants, and the
  // full-screen mode Safari reads from here rather than from the manifest.
  //
  // The phone's own bar (the clock, the battery) stands over the app, never on it: "default". It was
  // "black-translucent", which draws the page under that bar, and iOS 26 and 27 lay such a page out one bar short of
  // the screen: the app ended 59px above an iPhone's foot on a strip nothing can be drawn in, its tab bar and every
  // sheet with it (Ruben's screenshots, 7 Oct 2026; the same on other apps' iOS 27 phones that month). Under "default"
  // the app starts under the bar and reaches the foot, and iOS colours the bar from the page and picks a clock that
  // reads on it, in either theme. iOS reads this when the app is added to the home screen, so an app added before
  // keeps the old layout until it is removed and added again; the frame still keeps the bar's room for those
  // (components.css, .app-root).
  //
  // The tab's icon is the three on nothing: it sits on the browser's own strip, light or dark, so it brings no ground
  // of its own, and only the shadows the tiles cast on each other are kept. The home-screen icon is the three on white
  // (Ruben, 9 Oct 2026); iOS rounds the square itself and paints black wherever it is transparent, so it is opaque.
  manifest: "/manifest.webmanifest",
  icons: {
    icon: [
      { url: "/icons/favicon-32.png", sizes: "32x32", type: "image/png" },
      { url: "/icons/favicon-192.png", sizes: "192x192", type: "image/png" },
    ],
    apple: "/icons/apple-touch-icon.png",
  },
  appleWebApp: { capable: true, statusBarStyle: "default", title: "Chanlytics" },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  // Draw to the screen's edges, under the home bar and beside a notch; the shell pads with the safe-area insets.
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
    // data-look is the look beside it, the same way: the default until the script stamps the one this device keeps.
    <html
      lang="en"
      data-theme="dark"
      data-look={DEFAULT_LOOK_PREF}
      suppressHydrationWarning
      className={`${geist.variable} ${geistMono.variable}`}
    >
      <head>
        <link rel="preload" href="/fonts/MonaSans-latin.woff2" as="font" type="font/woff2" crossOrigin="anonymous" />
        <script dangerouslySetInnerHTML={{ __html: themeBootScript() }} />
        {/* Inside the native shell (a User-Agent token, contracts inAppBootScript): html.in-app and window.__IN_APP, before paint. */}
        <script dangerouslySetInnerHTML={{ __html: inAppBootScript() }} />
        {/* What the frame's outline is drawn by, before paint: the sidebar this device keeps, and the first run's address
            (contracts outlineBootScript, surfaces/frame/outline.tsx). */}
        <script dangerouslySetInnerHTML={{ __html: outlineBootScript() }} />
        {/* The route's own reads, started here rather than after the shell has mounted (contracts routePrefetchScript). An
            async module, inline: it runs as it is parsed. A plain inline script waits for every stylesheet before it, and React
            sets the frame's thirteen ahead of anything in the head, so the reads left only once the last had come (on
            production, 2 ms after it: the Today load review, 27 Oct 2026). An async script waits for none, and a module
            inline fetches nothing. A browser without modules skips it, and the page asks for its reads itself. */}
        <script type="module" async dangerouslySetInnerHTML={{ __html: routePrefetchScript() }} />
      </head>
      <body>{children}</body>
    </html>
  );
}
