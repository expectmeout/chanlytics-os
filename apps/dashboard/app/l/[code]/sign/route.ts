/**
 * /l/<code>/sign: a form's printed sheet, one page with the link as a code (00680). Public, as the form's own page is:
 * it is printed from wherever the owner happens to be. The rest is src/server/public/form-sign.ts.
 */
import { linkSignGet } from "@/server/public/form-sign";

type Ctx = { params: Promise<{ code: string }> };

export async function GET(request: Request, ctx: Ctx): Promise<Response> {
  return linkSignGet((await ctx.params).code, request);
}
