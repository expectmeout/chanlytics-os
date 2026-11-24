import { NextResponse } from "next/server";
import { takeWeekMade } from "@/server/content/week-made";

/**
 * POST /api/content/week-made — `{ tenant_id, plan_id }`: a week a rung let AI approve, made as AI (00714; the content
 * loop PRD's 12.4). Called by the edge's content_week_go job alone, with a token it signs for this door, this workspace
 * and this body (contracts WEEK_MADE_DOOR); no cookie, so no gate here, as the platform's clock has none
 * (app/api/ask/morning-sweep). Answers 202 at once and makes after; 401 for anything unsigned, 409 for a week the rung
 * did not approve. The handle is in src/server/content/week-made.ts.
 */
export async function POST(request: Request): Promise<Response> {
  const answer = await takeWeekMade(request);
  return NextResponse.json({ ok: answer.status === 202, said: answer.said }, { status: answer.status });
}

export const maxDuration = 300;
