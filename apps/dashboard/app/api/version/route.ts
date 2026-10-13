import { NextResponse, connection } from "next/server";
import { env } from "@/server/env";

/**
 * Public build identifier — the client heartbeat flags stale long-lived tabs, and the smoke after a deploy asks it which
 * build answers (tooling/scripts/checks/smoke.mjs). Answered by the running deploy at each request (`connection()`),
 * never by a file the build wrote: it reads nothing of the request, so under cacheComponents the build would have
 * written its answer once, and the probe would have proved a file, not a function that started.
 */
export async function GET() {
  await connection();
  // MIN_APP_VERSION: the oldest phone app this site still speaks to (the app's User-Agent token carries its version);
  // an older shell shows "update the app" instead of a page that no longer fits. Unset, every version is welcome.
  const minApp = env.MIN_APP_VERSION;
  return NextResponse.json(
    { sha: env.VERCEL_GIT_COMMIT_SHA ?? "dev", ...(minApp ? { min_app: minApp } : {}) },
    { headers: { "cache-control": "no-store" } },
  );
}
