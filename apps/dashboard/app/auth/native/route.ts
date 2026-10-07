import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { fromAnotherSite, nativeSignInPlan, NATIVE_FAILED } from "@/server/auth/native-sign-in";
import { takeRate } from "@/server/rate-limit";
import { ipOf, hashKey } from "@/server/request-ip";
import { log } from "@/server/log";

/**
 * POST /auth/native -- where the native app hands in the identity token it got from Apple or Google.
 *
 * Signs it in through the same cookie-backed server client every route uses, so the cookie it writes is the one the
 * proxy reads, and lands the WebView where the app asked, on this site only (native-sign-in.ts). Public by an exact
 * entry in the proxy's PUBLIC_PATHS: nobody has a session yet, that is the point. Rate-limited per network like
 * sign-up: a token that does not verify costs a Supabase call each time.
 *
 * The body is JSON or a form: the app posts either. A refusal is the sign-in page saying so once, never a JSON error
 * the WebView would render as text: a form posted from another site (login CSRF; native-sign-in.ts fromAnotherSite),
 * a network past its hour's limit, or a token the provider does not know.
 */
export async function POST(request: Request): Promise<Response> {
  if (fromAnotherSite(request.headers)) {
    log.warn("native_sign_in_refused", { why: "another site" });
    return land(NATIVE_FAILED);
  }
  try {
    await takeRate(`ip:${hashKey(ipOf(request))}`, "native_sign_in");
  } catch {
    log.warn("native_sign_in_rate_limited");
    return land(NATIVE_FAILED);
  }
  const body = await readBody(request);
  const plan = nativeSignInPlan(body);
  let to = plan.to;
  if (plan.signIn) {
    const supabase = await createClient();
    const { error } = await supabase.auth.signInWithIdToken({
      provider: plan.signIn.provider,
      token: plan.signIn.token,
      ...(plan.signIn.nonce ? { nonce: plan.signIn.nonce } : {}),
    });
    if (error) {
      log.warn("native_sign_in_failed", { provider: plan.signIn.provider, message: error.message.slice(0, 120) });
      to = NATIVE_FAILED;
    }
  } else {
    log.warn("native_sign_in_refused", { why: plan.refused });
  }
  return land(to);
}

/** Relative, like the callback's: safeNext() guarantees a path on this site. 303 so the WebView's POST becomes a GET. */
function land(to: string): Response {
  return new NextResponse(null, { status: 303, headers: { location: to, "cache-control": "private, no-store" } });
}

async function readBody(request: Request): Promise<unknown> {
  const type = request.headers.get("content-type") ?? "";
  try {
    if (type.includes("application/json")) return await request.json();
    if (type.includes("form")) return Object.fromEntries((await request.formData()).entries());
  } catch {
    /* an unreadable body is a refusal below */
  }
  return null;
}
