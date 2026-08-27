import { NextResponse } from "next/server";

/** Public build identifier — the client heartbeat flags stale long-lived tabs. */
export function GET() {
  return NextResponse.json(
    { sha: process.env.VERCEL_GIT_COMMIT_SHA ?? "dev" },
    { headers: { "cache-control": "no-store" } },
  );
}
