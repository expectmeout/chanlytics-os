/**
 * The Content-Security-Policy, composed once and read by the middleware.
 *
 * Pure: the Supabase origin in, one header value out, so a test reads the
 * policy without a request and the proxy cannot compose it differently on two
 * paths.
 *
 * What it allows, and why each origin is there:
 *
 *   script-src   the app's own bundles and Meta's SDK host (the Embedded
 *                Signup SDK, whatsapp-connect.ts), and 'unsafe-inline' for the
 *                inline scripts Next streams its pages with. NOT a nonce,
 *                though a nonce is what a policy exists to carry: Next takes
 *                the nonce from the request's content-security-policy header,
 *                and on Vercel that header, set by the proxy, does not reach
 *                the render -- a custom header set beside it does (x-nonce
 *                arrived, verified 17 Sep 2026 on the login page), the
 *                policy-named ones do not, and the same build started on a
 *                laptop nonces every script. Without the nonce, every inline
 *                script Next streams would be refused, so inline is allowed by
 *                name, and what the policy still withholds is every foreign
 *                script origin and eval. The road back to a nonce is Vercel's
 *                self-fetch pattern (kb/guide/csp-nonces-with-cdn-cache), the
 *                day it is worth its cost.
 *   style-src    'unsafe-inline', deliberately. The ported mockup sets styles
 *                as attributes on thousands of elements; an attribute cannot
 *                carry a nonce, and a policy that forbade them would take the
 *                whole operator UI down. Inline STYLE is not the vector inline
 *                SCRIPT is.
 *   connect-src  the app plane is same-origin; Supabase for auth, storage and
 *                Realtime (its websocket); Meta's SDK talks to facebook.com.
 *   img / media  signed URLs from the private media bucket (inbound photos,
 *                call recordings) live on the Supabase origin; a listing photo
 *                Google hands back lives on googleusercontent.com.
 *   frame-src    Meta's SDK plants a hidden iframe under its root element.
 *   fonts        self-hosted by next/font, so no font host is named; only the
 *                standalone harness (Chanlytics.html, never served by the app)
 *                still reaches Google Fonts.
 *
 * Enforced since 17 September 2026. It rode the report-only header first,
 * until the nightly, which walks every page signed in, ran clean of
 * violations (e2e/csp.spec.ts reads the console; run 35170328083 was the
 * clean one); then the proxy flipped the name and nothing else. next.config.ts
 * keeps its own enforced `frame-ancestors 'none'` beside this one, so
 * clickjacking never waited on the flip.
 */
export interface CspInputs {
  /** NEXT_PUBLIC_SUPABASE_URL; its origin is allowed over https and wss. */
  supabaseUrl?: string | null;
  /** A development server needs eval for React's fast refresh; production never does. */
  dev?: boolean;
  /** Riding the report-only header: upgrade-insecure-requests is ignored there, and the browser says so on every page. */
  reportOnly?: boolean;
}

const META = [
  "https://connect.facebook.net",
  "https://www.facebook.com",
  "https://web.facebook.com",
  "https://graph.facebook.com",
];
const GOOGLE_PHOTOS = "https://*.googleusercontent.com";

function originOf(url: string | null | undefined): string | null {
  if (!url) return null;
  try {
    return new URL(url).origin;
  } catch {
    return null;
  }
}

export function contentSecurityPolicy(o: CspInputs): string {
  const supabase = originOf(o.supabaseUrl);
  const supabaseWs = supabase ? supabase.replace(/^https:/, "wss:") : null;
  const directives: Array<[string, string[]]> = [
    ["default-src", ["'self'"]],
    ["script-src", ["'self'", "'unsafe-inline'", ...(o.dev ? ["'unsafe-eval'"] : []), META[0]]],
    ["style-src", ["'self'", "'unsafe-inline'"]],
    ["font-src", ["'self'"]],
    ["img-src", ["'self'", "data:", "blob:", ...(supabase ? [supabase] : []), GOOGLE_PHOTOS]],
    ["media-src", ["'self'", "blob:", ...(supabase ? [supabase] : [])]],
    ["connect-src", ["'self'", ...(supabase ? [supabase, supabaseWs!] : []), ...META]],
    ["frame-src", [META[1], META[2]]],
    ["worker-src", ["'self'", "blob:"]],
    ["manifest-src", ["'self'"]],
    ["object-src", ["'none'"]],
    ["base-uri", ["'self'"]],
    ["form-action", ["'self'"]],
    ["frame-ancestors", ["'none'"]],
  ];
  const parts = directives.map(([name, values]) => `${name} ${values.join(" ")}`);
  if (!o.dev && !o.reportOnly) parts.push("upgrade-insecure-requests");
  return parts.join("; ");
}

export type CspHeaderName = "content-security-policy" | "content-security-policy-report-only";
/** The header the policy rides on. Flip back to the report-only name to observe without blocking; the proxy reads the name, nothing else changes. */
export const CSP_HEADER: CspHeaderName = "content-security-policy";
