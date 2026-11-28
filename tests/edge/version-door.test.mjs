/**
 * The edge names its build: GET /api/version answers the commit Vercel built it from, as the dashboard's does, so a
 * release and a rollback can be confirmed from outside (docs/runbook.md, Deploy and Roll back). Before this the edge
 * named none (the scorecard's CI/CD evidence: "No commit SHA or migration on the edge").
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const { GET } = await import(pathToFileURL(path.join(ROOT, "apps/edge/api/version.ts")).href);
const { headOf, readLedger } = await import(
  pathToFileURL(path.join(ROOT, "tooling/scripts/checks/migration-ledger.mjs")).href
);
/** The newest migration the tree carries, as the ledger records it: what a build of it is written against. */
const HEAD = String(headOf(readLedger(ROOT))).padStart(5, "0");

test("it answers the newest migration the build was written against, which is the ledger's head", async () => {
  // The smoke after a deploy holds this to what production has applied (tests/checks/smoke.test.mjs): a number the
  // door made up, or one a migration's pull request left behind, would pass a build its database cannot serve.
  const said = await (await GET()).json();
  assert.match(said.migration, /^\d{5}$/);
  assert.equal(said.migration, HEAD);
});

test("it answers the commit the deployment was built from, never cached, and 'dev' where nothing built it", async () => {
  const before = process.env.VERCEL_GIT_COMMIT_SHA;
  try {
    process.env.VERCEL_GIT_COMMIT_SHA = "1388f2cc6581dc21596184252dc090b65d2f1d4c";
    const res = await GET();
    assert.equal(res.status, 200);
    assert.ok(res.headers.get("x-request-id"), "a door names its request, this one too");
    assert.equal(res.headers.get("cache-control"), "no-store");
    assert.deepEqual(await res.json(), { sha: "1388f2cc6581dc21596184252dc090b65d2f1d4c", migration: HEAD });
    process.env.VERCEL_GIT_COMMIT_SHA = "  ";
    assert.equal((await (await GET()).json()).sha, "dev", "blank is unset, as every edge variable");
    delete process.env.VERCEL_GIT_COMMIT_SHA;
    assert.equal((await (await GET()).json()).sha, "dev");
  } finally {
    if (before === undefined) delete process.env.VERCEL_GIT_COMMIT_SHA;
    else process.env.VERCEL_GIT_COMMIT_SHA = before;
  }
});
