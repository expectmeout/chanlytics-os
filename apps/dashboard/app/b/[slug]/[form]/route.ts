/**
 * /b/<workspace>/<form>: a form a business shares with no website (00680; the Forms plan, F1). GET draws it in the
 * business's own look and language; POST takes an entry and answers the thank-you, or the form again with what is
 * wrong. Public: a visitor comes from a link or a printed code and has no account. Its own small HTML, so it carries
 * none of the app. The rest is src/server/public/form-page.ts.
 *
 * The session is read only for a test its owner sends (the address says `test=1`): a member of the workspace alone
 * may send an entry that tells nobody.
 */
import { createClient } from "@/lib/supabase/server";
import { drawFormPage, takeFormPost } from "@/server/public/form-page";

type Ctx = { params: Promise<{ slug: string; form: string }> };

export async function GET(request: Request, ctx: Ctx): Promise<Response> {
  const { slug, form } = await ctx.params;
  return drawFormPage(slug, form, request, createClient);
}

export async function POST(request: Request, ctx: Ctx): Promise<Response> {
  const { slug, form } = await ctx.params;
  return takeFormPost(slug, form, request, createClient);
}
