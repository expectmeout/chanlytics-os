import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { callbackPlan, landingAfter, OAUTH_FAILED } from "@/server/auth/oauth-callback";
import { log } from "@/server/log";

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
  const plan = callbackPlan({
    code: url.searchParams.get("code"),
    next: url.searchParams.get("next"),
    error: url.searchParams.get("error"),
    errorCode: url.searchParams.get("error_code"),
    errorDescription: url.searchParams.get("error_description"),
  });
  let to = plan.to;
  // The provider refused, or Supabase did on its behalf, before there was a
  // code to exchange. The reason is in the query and nowhere else on this side.
  if (plan.refused) log.warn("oauth_provider_refused", { ...plan.refused });
  if (plan.exchange) {
    const supabase = await createClient();
    const { error } = await supabase.auth.exchangeCodeForSession(plan.exchange);
    if (error) {
      // A code that did not exchange -- used twice, expired (five minutes), or
      // opened in a browser that never started the sign-in -- is a sign-in
      // to try again, not an error page.
      log.warn("oauth_exchange_failed", { message: error.message.slice(0, 120) });
      to = OAUTH_FAILED;
    } else {
      // An account with an authenticator shows its code before it lands anywhere (0013).
      const { data: aal } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel().catch(() => ({ data: null }));
      to = landingAfter(to, aal);
    }
  }
  // A RELATIVE Location, resolved by the browser against the address it asked
  // for. Building an absolute one from `x-forwarded-host` took the destination
  // host from a request header: safeNext() guarantees `to` is a path on this
  // site, and the origin it was resolved against then undid that, so a request
  // carrying `X-Forwarded-Host: somewhere.else` sent a freshly signed-in
  // browser there. Relative is both safer and more correct — whatever name the
  // browser used to reach this route is the name it should stay on.
  const response = new NextResponse(null, { status: 307, headers: { location: to } });
  response.headers.set("cache-control", "private, no-store");
  return response;
}
