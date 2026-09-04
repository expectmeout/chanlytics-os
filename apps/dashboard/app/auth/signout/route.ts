import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createClient } from "@/lib/supabase/server";
// One implementation, shared with withRoute — every mutating /api/v1 route
// now makes the same check this route has made since the auth hardening pass.
import { isSameOrigin } from "@/server/request-guards";

/**
 * Is this request provably from our own pages?
 *
 * The previous version compared Origin to Host but only `if (origin && host)`,
 * so a request that simply omitted Origin skipped the check entirely — the one
 * thing an attacker controls is which headers they send. This asks for positive
 * evidence instead: no evidence, no sign-out.
 *
 * Sec-Fetch-Site is the primary signal (Chromium, Firefox, Safari 16.4+) and
 * cannot be set by page JavaScript. `same-site` is deliberately NOT accepted —
 * on vercel.app a sibling subdomain is someone else's deployment. Origin is the
 * fallback for anything that predates Fetch Metadata; browsers always send it on
 * POST, same-origin included.
 */

export async function POST(request: Request) {
  if (!isSameOrigin(request)) {
    return NextResponse.json({ ok: false, error: { code: "forbidden" } }, { status: 403 });
  }

  const supabase = await createClient();
  // signOut() defaults to scope:"global" — every session for this user, on every
  // device, is revoked. An operator who signs out on a lost laptop expects that.
  // Errors are swallowed on purpose: if the refresh token is already dead the
  // call fails, and a failed sign-out must still end the local session rather
  // than 500 and leave the operator signed in.
  try {
    await supabase.auth.signOut();
  } catch {
    // fall through to the cookie clear below
  }

  const response = NextResponse.redirect(new URL("/login", request.url), { status: 303 });
  // Belt and braces. supabase.auth.signOut() clears cookies through the
  // next/headers store, and Next merges that store into the returned response —
  // but a sign-out that silently fails to clear is the worst bug this route can
  // have, so the auth cookies are also deleted on the response we return.
  // Chunked tokens land as sb-<ref>-auth-token.0/.1, hence the prefix match.
  const store = await cookies();
  for (const cookie of store.getAll()) {
    if (cookie.name.startsWith("sb-") && cookie.name.includes("-auth-token")) {
      response.cookies.delete(cookie.name);
    }
  }
  response.headers.set("cache-control", "private, no-store");
  return response;
}
