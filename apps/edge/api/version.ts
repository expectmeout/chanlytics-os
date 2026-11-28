/**
 * GET /api/version — the commit this deployment was built from.
 *
 * The dashboard has always named its build (app/api/version/route.ts); the edge named none, so after a merge nobody
 * could tell whether the edge serving the doors was the new one, and a rollback could not be confirmed from outside.
 * Vercel sets VERCEL_GIT_COMMIT_SHA on every build; a laptop has none and answers "dev". No key: a commit is not a
 * secret, and the release steps (docs/runbook.md, Deploy) read it with curl beside the dashboard's.
 *
 * Beside it `migration`: the newest migration this build was written against (contracts' SCHEMA_HEAD, written with the
 * migration ledger). The smoke after a deploy holds it to what production has applied, which the health door says, and
 * is red when this build is ahead of its database (tooling/scripts/checks/smoke.mjs).
 */
import { SCHEMA_HEAD } from "@chanlytics/contracts";
import { env } from "../lib/shared/env.js";
import { door } from "../lib/shared/log.js";

export const GET = door(function GET(): Promise<Response> {
  return Promise.resolve(
    new Response(JSON.stringify({ sha: env.VERCEL_GIT_COMMIT_SHA ?? "dev", migration: SCHEMA_HEAD }), {
      status: 200,
      headers: { "content-type": "application/json", "cache-control": "no-store" },
    }),
  );
});
