import { NextResponse } from "next/server";
import { AppError, err, ok } from "@chanlytics/contracts";
import { createClient } from "@/lib/supabase/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@chanlytics/db";

export interface RouteContext {
  supabase: SupabaseClient<Database>;
  userId: string;
  email: string | undefined;
}

/**
 * The one wrapper every /api/v1 handler goes through (Blueprint §4/§8):
 * verified session (getUser, never the cookie JWT alone) -> handler runs on the
 * SESSION-scoPED client so RLS is the enforcement -> envelope + structured log.
 * Service-role never appears here.
 */
export function withRoute<T>(
  handler: (req: Request, ctx: RouteContext) => Promise<T>,
) {
  return async (req: Request): Promise<NextResponse> => {
    const started = Date.now();
    const route = new URL(req.url).pathname;
    try {
      const supabase = await createClient();
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) {
        return NextResponse.json(err("unauthorized", "Sign in required."), { status: 401 });
      }
      const data = await handler(req, { supabase, userId: user.id, email: user.email });
      console.log(JSON.stringify({ level: "info", route, user: user.id, ms: Date.now() - started }));
      return NextResponse.json(ok(data));
    } catch (e) {
      if (e instanceof AppError) {
        console.log(JSON.stringify({ level: "warn", route, code: e.code, ms: Date.now() - started }));
        return NextResponse.json(err(e.code, e.message, e.details), { status: e.status });
      }
      console.error(JSON.stringify({ level: "error", route, error: e instanceof Error ? e.message : String(e) }));
      return NextResponse.json(err("internal", "Something went wrong."), { status: 500 });
    }
  };
}
