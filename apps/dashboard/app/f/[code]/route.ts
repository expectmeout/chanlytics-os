/**
 * /f/<code>: a form framed in a business's own website (the Forms plan, F4). GET draws it, its open counted; POST takes
 * an entry from it. Public, and it knows no session: the visitor is on another site, and the address names the sites
 * that may show it as its frame's only ancestors. The rest is src/server/public/form-frame.ts.
 */
import { drawFramedForm, takeFramedForm } from "@/server/public/form-frame";

type Ctx = { params: Promise<{ code: string }> };

export async function GET(request: Request, ctx: Ctx): Promise<Response> {
  return drawFramedForm((await ctx.params).code, request);
}

export async function POST(request: Request, ctx: Ctx): Promise<Response> {
  return takeFramedForm((await ctx.params).code, request);
}
