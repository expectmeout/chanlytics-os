import { NextResponse } from "next/server";

/** Public build identifier — the client heartbeat flags stale long-lived tabs. */
export function GET() {
  // MIN_APP_VERSION: the oldest phone app this site still speaks to (the app's User-Agent token carries its version);
  // an older shell shows "update the app" instead of a page that no longer fits. Unset, every version is welcome.
  const minApp = (process.env.MIN_APP_VERSION ?? "").trim();
  return NextResponse.json(
    { sha: process.env.VERCEL_GIT_COMMIT_SHA ?? "dev", ...(minApp ? { min_app: minApp } : {}) },
    { headers: { "cache-control": "no-store" } },
  );
}
