import { NextResponse } from "next/server";
import { env } from "@/server/shared/env";
import { runMorningSweep } from "@/server/ask/notice/sweep";

/**
 * GET /api/ask/morning-sweep — Ask looks once a morning for each business (D20 of the answers canvas). Called by the platform's
 * clock with its CRON_SECRET; with no secret set, it answers nothing and does nothing, so it is dormant until a person turns it
 * on. Only the businesses whose morning it is now are looked at, a few a run, so the clock's next tick carries on.
 */
export async function GET(req: Request): Promise<Response> {
  const secret = env.CRON_SECRET;
  if (!secret || req.headers.get("authorization") !== `Bearer ${secret}`)
    return NextResponse.json({ ok: false }, { status: 401 });
  return NextResponse.json({ ok: true, data: await runMorningSweep(new Date()) });
}

export const maxDuration = 300;
