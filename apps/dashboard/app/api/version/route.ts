import { NextResponse, connection } from "next/server";
import { SCHEMA_HEAD } from "@chanlytics/contracts";
import { env } from "@/server/shared/env";

/**
 * Public build identifier — the client heartbeat flags stale long-lived tabs, and the smoke after a deploy asks it which
 * build answers (tooling/scripts/checks/smoke.mjs). Answered by the running deploy at each request (`connection()`),
 * never by a file the build wrote: it reads nothing of the request, so under cacheComponents the build would have
 * written its answer once, and the probe would have proved a file, not a function that started.
 *
 * Beside the commit, `migration`: the newest migration this build was written against (contracts' SCHEMA_HEAD, written
 * with the migration ledger). The two apps deploy apart, so each says its own, and the smoke is red when either is
 * ahead of what production has applied.
 */
export async function GET() {
  await connection();
  // MIN_APP_VERSION: the oldest phone app this site still speaks to (the app's User-Agent token carries its version);
  // an older shell shows "update the app" instead of a page that no longer fits. Unset, every version is welcome.
  const minApp = env.MIN_APP_VERSION;
  return NextResponse.json(
    { sha: env.VERCEL_GIT_COMMIT_SHA ?? "dev", migration: SCHEMA_HEAD, ...(minApp ? { min_app: minApp } : {}) },
    { headers: { "cache-control": "no-store" } },
  );
}
