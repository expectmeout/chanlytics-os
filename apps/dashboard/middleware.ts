import { NextResponse, type NextRequest } from "next/server";
import { createServerClient } from "@supabase/ssr";

/**
 * The complete set of paths reachable without a session. Everything else — every
 * page, every /api/v1 route — requires a validated user.
 *
 * /auth/signout is here because signing out must work even when the session is
 * already gone; the route does its own same-origin check.
 * /api/version is the deploy probe, and returns only a build sha.
 */
const PUBLIC_PATHS = new Set(["/login", "/auth/signout", "/api/version"]);

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
export async function middleware(request: NextRequest) {
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
  } = await supabase.auth.getUser();

  const path = request.nextUrl.pathname;
  // Exact paths, not prefixes. `path.startsWith("/auth")` made every future
  // route under /auth public the moment it was created — a callback or a
  // token-exchange endpoint would have shipped unauthenticated by default, and
  // nothing in review would have flagged it. Adding a public route is now a
  // deliberate edit to this list, which the auth tests assert against.
  const isPublic = PUBLIC_PATHS.has(path);

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
