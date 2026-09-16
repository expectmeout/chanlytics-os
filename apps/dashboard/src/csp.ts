/**
 * The Content-Security-Policy, composed once and read by the middleware.
 *
 * Pure: a nonce and the Supabase origin in, one header value out, so a test
 * reads the policy without a request and the middleware cannot compose it
 * differently on two paths.
 *
 * What it allows, and why each origin is there:
 *
 *   script-src   the app's own bundles, each inline script by this request's
 *                nonce (Next attaches it to its own), and, under
 *                'strict-dynamic', whatever a trusted script loads -- which is
 *                how Meta's Embedded Signup SDK arrives (whatsapp-connect.ts
 *                creates its <script>). Never 'unsafe-inline': that is the
 *                directive a policy exists to withhold.
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
 * Report-only first. The header is Content-Security-Policy-Report-Only until
 * the nightly, which walks every page signed in, has run clean of violations
 * (e2e/csp.spec.ts reads the console); then the middleware flips the name and
 * nothing else. next.config.ts keeps its enforced `frame-ancestors 'none'`
 * whatever this says, so clickjacking never waits on the flip.
 */
export interface CspInputs {
  /** This request's nonce, base64 -- the middleware mints one per request. */
  nonce: string;
  /** NEXT_PUBLIC_SUPABASE_URL; its origin is allowed over https and wss. */
  supabaseUrl?: string | null;
  /** A development server needs eval for React's fast refresh; production never does. */
  dev?: boolean;
  /** Riding the report-only header: upgrade-insecure-requests is ignored there, and the browser says so on every page. */
  reportOnly?: boolean;
}

const META = ["https://connect.facebook.net", "https://www.facebook.com", "https://web.facebook.com", "https://graph.facebook.com"];
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
    ["script-src", ["'self'", `'nonce-${o.nonce}'`, "'strict-dynamic'", ...(o.dev ? ["'unsafe-eval'"] : []), META[0]]],
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

/** The header the policy rides on while it only reports; the middleware flips to the enforcing name when the nightly is clean. */
export const CSP_HEADER = "content-security-policy-report-only";
