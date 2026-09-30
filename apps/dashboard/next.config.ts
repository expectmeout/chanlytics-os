import type { NextConfig } from "next";
import { env } from "./src/server/env";

/**
 * Response headers for an application that renders other people's customers.
 *
 * Vercel already sends HSTS; everything here was absent. The one that matters
 * most is framing: this dashboard has Approve, Send and Take-over buttons bound
 * to a signed-in session, so without frame-ancestors an attacker could embed it
 * invisibly and have an operator click those controls on someone else's page.
 *
 * Deliberately NOT a full Content-Security-Policy yet. A real script-src needs
 * per-request nonces threaded through the document, and the ported mockup uses
 * inline styles throughout — a CSP added without that plumbing either breaks the
 * app or is written so permissively ('unsafe-inline' 'unsafe-eval') that it
 * provides no protection while looking like it does. frame-ancestors is the
 * directive that does not need nonces, so it ships now and the rest is honest
 * about waiting.
 */
const SECURITY_HEADERS = [
  // Clickjacking. Both forms: frame-ancestors is the modern directive, and
  // X-Frame-Options still covers older agents.
  { key: "Content-Security-Policy", value: "frame-ancestors 'none'" },
  { key: "X-Frame-Options", value: "DENY" },
  // Stop a response being re-interpreted as a script or stylesheet.
  { key: "X-Content-Type-Options", value: "nosniff" },
  // Never leak a path (which can carry a conversation id) to another origin.
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  // This app needs none of these but the microphone, which hold-to-talk (the
  // Ask palette, the live whisper) asks the browser for on this origin only;
  // denying the rest removes a whole class of prompt-and-permission abuse
  // from an embedded or compromised page. Framing is already refused above,
  // so (self) can never be a frame on someone else's page.
  {
    key: "Permissions-Policy",
    value: "camera=(), microphone=(self), geolocation=(), payment=(), usb=(), interest-cohort=()",
  },
];

const nextConfig: NextConfig = {
  // Workspace packages ship built dist/ (tsup); no transpilePackages needed.
  // The legacy mockup bridge (Slice 0B) mounts client-only under app/(os).
  reactStrictMode: true,
  // The framework advertises its own version to every visitor; there is no
  // reason to hand an attacker the exact build to look up CVEs against.
  poweredByHeader: false,
  env: {
    // Inlined at build time so the surface cache can key on it synchronously,
    // before first paint. A deploy that changes a viewmodel's shape must not
    // restore the old shape into new components — a new sha starts cold.
    NEXT_PUBLIC_BUILD_SHA: env.VERCEL_GIT_COMMIT_SHA ?? "dev",
  },
  async headers() {
    return [
      { source: "/:path*", headers: SECURITY_HEADERS },
      {
        // The sign-in page must never sit in a shared or back-button cache: it
        // reflects the email being entered and its state decides what an
        // attacker with the device can resume.
        source: "/login",
        headers: [{ key: "Cache-Control", value: "private, no-store, max-age=0" }],
      },
      {
        // The other two credential pages, for the same reason and more of it:
        // both now hold a password field, and the reset page holds a code that
        // opens an account.
        source: "/signup",
        headers: [{ key: "Cache-Control", value: "private, no-store, max-age=0" }],
      },
      {
        source: "/reset-password",
        headers: [{ key: "Cache-Control", value: "private, no-store, max-age=0" }],
      },
    ];
  },
  async rewrites() {
    return {
      // The two files a phone's OS reads before it lets a link open the app. One route renders both
      // (app/api/app-links/[store]); the proxy leaves /.well-known/ public.
      beforeFiles: [
        { source: "/.well-known/apple-app-site-association", destination: "/api/app-links/apple" },
        { source: "/.well-known/assetlinks.json", destination: "/api/app-links/android" },
      ],
    };
  },
  async redirects() {
    return [
      // A workspace's public pages move with its slug; a carrier filing does not.
      // RJ Capital LLC's A2P registration was filed while this workspace was
      // "billing-probe" and names /yes/billing-probe as its website. The workspace
      // became "chanlytics" before launch, that address went 404, and the campaign
      // was refused on it (30891, 18 Sep 2026: "unverifiable website"). Re-filing an
      // approved brand re-vets it, so the old address answers instead — both
      // prefixes, and every page beneath them (form, sign, terms).
      //
      // EXCEPT THE ADDRESS ITSELF, which is filed as the brand's WEBSITE (Trust Hub
      // business information, read 22 Sep 2026), not as its opt-in page. Sent to the
      // sign-up page, it was read as the business's website twice: the eighth refusal
      // (30919, 21 Sep) found no business on it, and the ninth (30919 on
      // USE_CASE_DESCRIPTION, 22 Sep) found no "operational business model", which a
      // page asking for a yes cannot show. So it goes to the company's own website,
      // which says what the business sells, to whom and how it charges. The campaign
      // names the sign-up page by its own address. Temporary, because only the
      // brand's filing decides what this address is, and a 308 is cached for good.
      // First match wins, so this comes before the prefix rule, which also matches it.
      { source: "/yes/billing-probe", destination: "https://www.chanlytics.com/", permanent: false },
      { source: "/yes/billing-probe/:path*", destination: "/yes/chanlytics/:path*", permanent: true },
      { source: "/b/billing-probe/:path*", destination: "/b/chanlytics/:path*", permanent: true },
    ];
  },
};

export default nextConfig;
