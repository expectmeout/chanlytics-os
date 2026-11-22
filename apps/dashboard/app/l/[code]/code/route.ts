/**
 * /l/<code>/code: a form's link drawn as a code, an SVG to show, save or print (00680). Public, as the link is: the
 * code says nothing the link does not. The rest is src/server/public/form-sign.ts.
 */
import { linkCodeGet } from "@/server/public/form-sign";

type Ctx = { params: Promise<{ code: string }> };

export async function GET(request: Request, ctx: Ctx): Promise<Response> {
  return linkCodeGet((await ctx.params).code, request);
}
