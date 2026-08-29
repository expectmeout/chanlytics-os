import type { NextConfig } from "next";

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
  // This app needs none of these; denying them removes a whole class of
  // prompt-and-permission abuse from an embedded or compromised page.
  {
    key: "Permissions-Policy",
    value: "camera=(), microphone=(), geolocation=(), payment=(), usb=(), interest-cohort=()",
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
    NEXT_PUBLIC_BUILD_SHA: process.env.VERCEL_GIT_COMMIT_SHA ?? "dev",
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
    ];
  },
};

export default nextConfig;
