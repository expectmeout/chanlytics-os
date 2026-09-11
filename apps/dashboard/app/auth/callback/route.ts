import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { callbackPlan, OAUTH_FAILED } from "@/server/oauth-callback";

/**
 * GET /auth/callback -- where a provider sends the browser back.
 *
 * Sign in with Google runs the PKCE flow: the browser client sends the person
 * to Google with a code challenge and keeps the verifier in a cookie; Google
 * sends them to Supabase, and Supabase here, with a code. This exchanges it for
 * the session -- through the same cookie-backed server client every route uses,
 * so the cookie it writes is the one the middleware reads -- and lands the
 * browser where the page asked, on this site only (oauth-callback.ts).
 *
 * Public by an exact entry in the middleware's PUBLIC_PATHS: nobody has a
 * session yet, that is the point. It takes nothing but the query the provider
 * built, writes nothing but the session cookie, and a redirect that depends on
 * a cookie is never cacheable.
 */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const plan = callbackPlan({ code: url.searchParams.get("code"), next: url.searchParams.get("next"), error: url.searchParams.get("error") });
  let to = plan.to;
  if (plan.exchange) {
    const supabase = await createClient();
    const { error } = await supabase.auth.exchangeCodeForSession(plan.exchange);
    if (error) {
      // A code that did not exchange -- used twice, expired (five minutes), or
      // opened in a browser that never started the sign-in -- is a sign-in
      // to try again, not an error page.
      console.warn("oauth_exchange_failed", JSON.stringify({ message: error.message.slice(0, 120) }));
      to = OAUTH_FAILED;
    }
  }
  // The origin as the browser saw it, which behind Vercel is the forwarded host.
  const host = request.headers.get("x-forwarded-host");
  const origin = host ? `https://${host}` : url.origin;
  const response = NextResponse.redirect(new URL(to, origin));
  response.headers.set("cache-control", "private, no-store");
  return response;
}
