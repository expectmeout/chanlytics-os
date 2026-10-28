/**
 * /c/<token> — a website sign-up's confirmation link (00489). GET shows one question and one button and changes
 * nothing: link scanners fetch every URL in an email. POST is that button, and records the person's yes to offers by
 * email in the same response, with no redirect, no cookie and no sign-in. The token is the authority (packages/channels
 * confirm-token.ts), and the yes door judges the press itself. The rest is src/server/public/confirm.ts.
 */
import { confirmGet, confirmPost } from "@/server/public/confirm";

type Ctx = { params: Promise<{ token: string }> };

export async function GET(_req: Request, ctx: Ctx): Promise<Response> {
  return confirmGet((await ctx.params).token);
}

export async function POST(req: Request, ctx: Ctx): Promise<Response> {
  return confirmPost((await ctx.params).token, req);
}
