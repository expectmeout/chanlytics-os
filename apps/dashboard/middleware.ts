import { NextResponse, type NextRequest } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { isRetryableAuthError } from "@/server/auth-errors";

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
const PUBLIC_PATHS = new Set(["/login", "/auth/signout", "/api/version", "/manifest.webmanifest", "/signup", "/api/v1/signup", "/privacy", "/terms", "/data-deletion"]);

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
 * Adding one here is adding a page anybody on the internet may read. Both were
 * built for exactly that; nothing else goes on this list without the same
 * argument.
 */
const PUBLIC_PREFIXES = ["/yes/", "/b/"];

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
  const url = new URL(request.url);
  url.host = canonical;
  url.protocol = "https:";
  url.port = "";
  return NextResponse.redirect(url, 308);
}

export async function middleware(request: NextRequest) {
  const moved = canonicalRedirect(request);
  if (moved) return moved;
  let response = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
          response = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options),
          );
        },
      },
    },
  );

  // getUser() validates the JWT server-side — never trust getSession() here.
  const {
    data: { user },
    error: authErr,
  } = await supabase.auth.getUser();

  const path = request.nextUrl.pathname;
  // Exact paths, not prefixes. `path.startsWith("/auth")` made every future
  // route under /auth public the moment it was created — a callback or a
  // token-exchange endpoint would have shipped unauthenticated by default, and
  // nothing in review would have flagged it. Adding a public route is now a
  // deliberate edit to this list, which the auth tests assert against.
  const isPublic = PUBLIC_PATHS.has(path) || PUBLIC_PREFIXES.some((p) => path.startsWith(p));

  // "We could not ask" is not "you are not signed in". withRoute answers 503
  // for a retryable auth failure so the client keeps its session — but this
  // gate ran first and answered 401, so that branch was unreachable in the
  // exact outage it was written for.
  if (!user && !isPublic && isRetryableAuthError(authErr)) {
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

  if (!user && !isPublic) {
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
  if (user && path === "/login") {
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
