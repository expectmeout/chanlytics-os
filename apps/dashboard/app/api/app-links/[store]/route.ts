import { NextResponse } from "next/server";
import { appLinksFor } from "@/server/public/app-links";

/**
 * GET /.well-known/apple-app-site-association and /.well-known/assetlinks.json (next.config rewrites both here;
 * the proxy leaves /.well-known/ public). The file for one store, from its variable, or 404 while it is unset.
 */
export async function GET(_req: Request, ctx: { params: Promise<{ store: string }> }): Promise<Response> {
  const { store } = await ctx.params;
  const file = appLinksFor(store, { apple: process.env.APP_LINKS_APPLE, android: process.env.APP_LINKS_ANDROID });
  if (!file) return new NextResponse(null, { status: 404 });
  return NextResponse.json(file, {
    headers: { "content-type": "application/json", "cache-control": "public, max-age=3600" },
  });
}
