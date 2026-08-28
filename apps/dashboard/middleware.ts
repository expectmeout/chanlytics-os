import { NextResponse, type NextRequest } from "next/server";
import { createServerClient } from "@supabase/ssr";

/** Session refresh + auth gate: everything except /login and /auth/* requires a user. */
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
  const isPublic = path === "/login" || path.startsWith("/auth") || path === "/api/version";

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
    return NextResponse.redirect(url);
  }
  if (user && path === "/login") {
    const url = request.nextUrl.clone();
    url.pathname = "/";
    return NextResponse.redirect(url);
  }
  return response;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|css|js|map)$).*)"],
};
