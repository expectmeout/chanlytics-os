import { NextResponse, type NextRequest } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { isRetryableAuthError } from "@/server/auth-errors";
import { contentSecurityPolicy, CSP_HEADER } from "@/csp";
import { linkHostAnswers, linkHostOf } from "@/link-host";
import { writeAuthCookies } from "@/server/auth-cookies";

/**
 * The complete set of paths reachable without a session. Everything else — every
 * page, every /api/v1 route — requires a validated user.
 *
 * /auth/signout is here because signing out must work even when the session is
 * already gone; the route does its own same-origin check.
 * /api/version is the deploy probe, and returns only a build sha.
 */
// The manifest is fetched without credentials by the browser's installer; it
// names the product and its icons, nothing else, so it is public like the
// icons themselves (which the matcher already skips by extension).
// /signup and its route are the one door a stranger may use; the route
// keeps the same-origin check, its own rate buckets and an optional invite
// code, and creates the user with the service role (the project stays
// invite-only at the auth level).
// /auth/callback is where a provider sends the browser back with a code:
// nobody has a session at that moment, which is the point. Exact path; the
// route exchanges the code and redirects, on this site only.
// /reset-password is public because nobody resetting a password has a session
// to show. It takes an address, asks Supabase for a recovery code, and then
// verifies that code — which is what CREATES the session the new password is
// written on. Note it is deliberately absent from the signed-in redirect
// below: bouncing a signed-in person off this page would break its own second
// half, one step after the code signed them in.
const PUBLIC_PATHS = new Set([
  "/login",
  "/auth/signout",
  "/auth/callback",
  "/auth/native",
  "/api/version",
  "/manifest.webmanifest",
  "/signup",
  "/api/v1/signup",
  "/api/v1/calendar/filler.ics",
  "/reset-password",
  "/privacy",
  "/terms",
  "/data-deletion",
]);

/**
 * The public PREFIXES. Both carry a workspace's slug, so neither can be an exact
 * path; both take no input, write nothing, and read only what they display.
 *
 *   /yes/   the "say yes" page, opened by a customer from a QR at the desk.
 *   /b/     the workspace's own page: who they are, what they do, their text
 *           terms. It is filed with the carriers as a campaign's website and
 *           privacy policy, which means the reader is often a REVIEWER — and a
 *           reviewer who gets a login screen has been shown a business that
 *           cannot be looked up, which is error 30919 with extra steps.
 *
 *   /u/     the unsubscribe link every campaign email carries (RFC 8058). It
 *           carries a token, not a slug, and it is the one public route that
 *           takes input: its only write is a person's own "stop", under a key
 *           only we hold, and a GET changes nothing (src/server/unsubscribe.ts).
 *
 * Adding one here is adding a page anybody on the internet may read. Each was
 * built for exactly that; nothing else goes on this list without the same
 * argument.
 */
const PUBLIC_PREFIXES = ["/yes/", "/b/", "/.well-known/", "/u/"];

/**
 * An auth redirect must never be stored. These responses depend entirely on a
 * cookie, so any cache that keys on the URL alone would serve one visitor's
 * outcome to the next — sending a signed-in operator to /login, or worse.
 */
function noStore(response: NextResponse): NextResponse {
  response.headers.set("cache-control", "private, no-store");
  return response;
}

/** Session refresh + auth gate: everything outside PUBLIC_PATHS requires a user. */
/**
 * The product has ONE address.
 *
 * A Vercel project keeps its deploy alias working for ever, so the app was
 * reachable at two origins at once. Cookies are per-origin, so a person
 * signed in on one was signed out on the other — and once Google's callback
 * moved to the custom domain, starting Connect from the alias sent the
 * browser back to a host it had no session on. The alias now redirects,
 * permanently, path and query intact.
 *
 * Production only, and only a `.vercel.app` host: a preview deployment is
 * also a vercel.app host and must keep answering as itself.
 */
function canonicalRedirect(request: NextRequest): NextResponse | null {
  const canonical = process.env.CANONICAL_HOST;
  if (!canonical || process.env.VERCEL_ENV !== "production") return null;
  const host = request.headers.get("host");
  if (!host || host === canonical || !host.endsWith(".vercel.app")) return null;
  // The unsubscribe link answers where it is pressed: a mail client's one click must never be redirected (RFC
  // 8058), and the page holds no session for a second host to lose.
  if (request.nextUrl.pathname.startsWith("/u/")) return null;
  const url = new URL(request.url);
  url.host = canonical;
  url.protocol = "https:";
  url.port = "";
  return NextResponse.redirect(url, 308);
}

export async function proxy(request: NextRequest) {
  // On the cold link host (D17) the unsubscribe page and nothing else: never a sign-in form on a domain cold mail names.
  const linkHost = linkHostOf(process.env.UNSUBSCRIBE_ORIGIN);
  if (!linkHostAnswers({ host: request.headers.get("host"), path: request.nextUrl.pathname, linkHost }))
    return new NextResponse("Not found", { status: 404 });
  const moved = canonicalRedirect(request);
  if (moved) return moved;
  // The policy composed in src/csp.ts, on the response so the browser
  // enforces it. Nothing rides on the request: the
  // nonce a request header would carry does not reach the render on Vercel
  // (src/csp.ts says what was tried), so the policy names inline by name.
  const csp = contentSecurityPolicy({
    supabaseUrl: process.env.NEXT_PUBLIC_SUPABASE_URL,
    leadMapBase: process.env.NEXT_PUBLIC_LEAD_MAP_BASE,
    dev: process.env.NODE_ENV !== "production",
    reportOnly: CSP_HEADER === "content-security-policy-report-only",
  });
  const nextWithPolicy = () => {
    const r = NextResponse.next();
    r.headers.set(CSP_HEADER, csp);
    return r;
  };
  let response = nextWithPolicy();

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet, headers) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
          response = nextWithPolicy();
          // A refreshed token rides out on THIS response, so the headers that
          // keep it out of every cache in front of us ride with it. Dropping
          // them lets a shared cache hand one operator's Set-Cookie to the
          // next person who asks for the URL -- see src/server/auth-cookies.ts.
          writeAuthCookies(response, cookiesToSet, headers);
        },
      },
    },
  );

  // getClaims() VERIFIES the token's signature -- locally, over the project's public signing key (the JWKS, fetched
  // once per process and kept ten minutes), where the project signs with an asymmetric key; over the Auth server,
  // as getUser() did, where it still signs with the shared secret. Never getSession(), which reads the cookie and
  // asks nobody. Measured on production (25 Sep 2026): every request paid this round trip here and again in the
  // route wrapper, twice on a page, some fifty times on a cold load of a person's page. What the local check does
  // not see is a session revoked before its token expires (an hour at most): the route's own reads run under RLS
  // with that same token either way.
  const { data: verified, error: authErr } = await supabase.auth.getClaims();
  const user = verified?.claims ?? null;

  const path = request.nextUrl.pathname;
  // Exact paths, not prefixes. `path.startsWith("/auth")` made every future
  // route under /auth public the moment it was created — a callback or a
  // token-exchange endpoint would have shipped unauthenticated by default, and
  // nothing in review would have flagged it. Adding a public route is now a
  // deliberate edit to this list, which the auth tests assert against.
  const isPublic = PUBLIC_PATHS.has(path) || PUBLIC_PREFIXES.some((p) => path.startsWith(p));
  // A /api/v1 request that carries a bearer token (decision 0011: the phone app's native screens) has no cookie for
  // this gate to read; the route's own wrapper verifies the token, and auth-gate.test.mjs holds every /api/v1 route
  // to that wrapper. Only there, only with the header: a page request never passes on a header.
  const bearer = path.startsWith("/api/v1/") && /^Bearer\s+\S+/i.test(request.headers.get("authorization") ?? "");

  // "We could not ask" is not "you are not signed in". withRoute answers 503
  // for a retryable auth failure so the client keeps its session — but this
  // gate ran first and answered 401, so that branch was unreachable in the
  // exact outage it was written for.
  if (!user && !isPublic && !bearer && isRetryableAuthError(authErr)) {
    if (path.startsWith("/api/")) {
      return NextResponse.json(
        { ok: false, error: { code: "upstream_auth", message: "Could not verify your session just now — try again." } },
        { status: 503, headers: { "cache-control": "private, no-store", "retry-after": "5" } },
      );
    }
    return noStore(
      new NextResponse("Could not verify your session just now. Please try again in a moment.", {
        status: 503,
        headers: { "content-type": "text/plain; charset=utf-8", "retry-after": "5" },
      }),
    );
  }

  if (!user && !isPublic && !bearer) {
    // API callers get a machine-readable 401 — redirecting a fetch() to the
    // login HTML makes every client parse failure look like a data bug.
    if (path.startsWith("/api/")) {
      return NextResponse.json(
        { ok: false, error: { code: "unauthorized", message: "Sign in required." } },
        { status: 401, headers: { "cache-control": "private, no-store" } },
      );
    }
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    // Drop the query string: clone() carries it over, so a conversation id in a
    // param would be copied onto the login URL and into the access logs. The
    // app routes on the hash, which the browser preserves across redirects
    // without the server ever seeing it — nothing is lost here.
    url.search = "";
    return noStore(NextResponse.redirect(url));
  }
  // A signed-in person has no business on either door: /signup would send a
  // code to a second address and strand it, since the session stays theirs.
  if (user && (path === "/login" || path === "/signup")) {
    const url = request.nextUrl.clone();
    url.pathname = "/";
    url.search = "";
    return noStore(NextResponse.redirect(url));
  }
  return response;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|css|js|map)$).*)"],
};
