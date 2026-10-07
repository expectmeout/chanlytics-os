/**
 * GET /api/version — the commit this deployment was built from.
 *
 * The dashboard has always named its build (app/api/version/route.ts); the edge named none, so after a merge nobody
 * could tell whether the edge serving the doors was the new one, and a rollback could not be confirmed from outside.
 * Vercel sets VERCEL_GIT_COMMIT_SHA on every build; a laptop has none and answers "dev". No key: a commit is not a
 * secret, and the release steps (docs/runbook.md, Deploy) read it with curl beside the dashboard's.
 */
import { env } from "../lib/env.js";
import { door } from "../lib/log.js";

export const GET = door(function GET(): Promise<Response> {
  return Promise.resolve(
    new Response(JSON.stringify({ sha: env.VERCEL_GIT_COMMIT_SHA ?? "dev" }), {
      status: 200,
      headers: { "content-type": "application/json", "cache-control": "no-store" },
    }),
  );
});
