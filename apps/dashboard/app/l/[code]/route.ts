/**
 * /l/<code>: a short link to one place a form is shared (00680). It counts the open for its day, leaves no cookie, and
 * goes on to the form under the business's own page. Public: whoever opens it has no account. The rest is
 * src/server/public/form-link.ts.
 */
import { linkGet } from "@/server/public/form-link";

type Ctx = { params: Promise<{ code: string }> };

export async function GET(request: Request, ctx: Ctx): Promise<Response> {
  return linkGet((await ctx.params).code, request);
}
