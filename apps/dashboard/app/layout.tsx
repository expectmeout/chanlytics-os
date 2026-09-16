import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { headers } from "next/headers";

/**
 * Every page is rendered per request. The Content-Security-Policy carries a
 * nonce the middleware mints, and Next attaches it to the scripts it emits
 * only while rendering; a page prerendered at build time ships its scripts
 * without one, and the nightly's first report-only run showed the login page
 * doing exactly that (ten script tags, none nonced). At this traffic a
 * request per page costs nothing; a policy that cannot hold costs the app.
 */
export const dynamic = "force-dynamic";

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

/** The nonce the middleware minted for this request, as it reached the render: read from the header Next reads. */
async function requestNonce(): Promise<string | null> {
  const h = await headers();
  const csp = h.get("content-security-policy") ?? h.get("content-security-policy-report-only") ?? "";
  const m = /'nonce-([A-Za-z0-9+/=_-]+)'/.exec(csp);
  return m ? m[1] : null;
}

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  // Rendered into the page so the nightly can compare it with the header's:
  // a page whose scripts carry no nonce while this meta carries one is Next
  // not applying it; one where this is empty is the header not arriving.
  const nonce = await requestNonce();
  return (
    <html lang="en" data-theme="dark" className={`${geist.variable} ${geistMono.variable}`}>
      <head>{nonce ? <meta name="csp-nonce" content={nonce} /> : null}</head>
      <body>{children}</body>
    </html>
  );
}
