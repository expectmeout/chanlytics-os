/**
 * /p/<code> — a partner's link (decision 0011). It leaves one cookie naming the code and goes on to sign-up; the
 * workspace made while the cookie is there is credited to the partner (create_workspace, 00190). Public: the reader
 * has no account yet. It reads nothing: a code that names nobody is still a cookie, and create_workspace ignores it
 * with a record of why, so the link is never a door that can be probed for which codes exist.
 *
 * First touch wins: a second link does not move the credit, so the partner who found the business is the one
 * credited. Thirty days, never cleared by hand: it expires on its own, and every workspace made in the window is
 * the partner's. Not a code (a path someone typed) is a plain redirect and no cookie.
 */
import { PARTNER_COOKIE, PARTNER_COOKIE_DAYS, cleanPartnerCode, partnerCodeFromCookie } from "@chanlytics/contracts";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ code: string }> };

/** Where the link lands. Sign-up; a signed-in person is sent on by the proxy, cookie in hand. */
const NEXT = "/signup";

export async function GET(req: Request, ctx: Ctx): Promise<Response> {
  const cleaned = cleanPartnerCode((await ctx.params).code);
  const headers = new Headers({ location: NEXT, "cache-control": "no-store" });
  if (cleaned.ok && !partnerCodeFromCookie(req.headers.get("cookie"))) {
    headers.append(
      "set-cookie",
      `${PARTNER_COOKIE}=${encodeURIComponent(cleaned.code)}; Max-Age=${PARTNER_COOKIE_DAYS * 86400}; Path=/; SameSite=Lax; Secure`,
    );
  }
  return new Response(null, { status: 302, headers });
}
