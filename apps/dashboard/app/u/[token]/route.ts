/**
 * /u/<token> — the unsubscribe link every campaign email carries (RFC 8058). GET shows one button and changes
 * nothing: link scanners fetch every URL in an email. POST is the mail client's one click or that button, and
 * either records the stop in the same response, with no redirect, no cookie and no sign-in. The token is the
 * authority (packages/channels unsubscribe-token.ts); all it can do is narrow what may be sent. The rest is
 * src/server/public/unsubscribe.ts.
 */
import { unsubscribeGet, unsubscribePost } from "@/server/public/unsubscribe";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ token: string }> };

export async function GET(_req: Request, ctx: Ctx): Promise<Response> {
  return unsubscribeGet((await ctx.params).token);
}

export async function POST(req: Request, ctx: Ctx): Promise<Response> {
  return unsubscribePost((await ctx.params).token, req);
}
