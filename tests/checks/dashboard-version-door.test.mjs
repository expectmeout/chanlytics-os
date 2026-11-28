/**
 * The dashboard names its build and the database it needs: GET /api/version answers the commit Vercel built it from
 * and the newest migration the build was written against, the real route run. The two apps deploy apart, so the smoke
 * after a deploy holds each one's `migration` to what production has applied (tests/checks/smoke.test.mjs); the edge's
 * door is held the same way in tests/edge/version-door.test.mjs.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { AsyncLocalStorage } from "node:async_hooks";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { headOf, readLedger } from "../../tooling/scripts/checks/migration-ledger.mjs";

// Next's server puts Node's AsyncLocalStorage on the global before its stores are made: so does this file.
globalThis.AsyncLocalStorage ??= AsyncLocalStorage;
process.env.NEXT_PUBLIC_SUPABASE_URL ??= "http://127.0.0.1:1";
process.env.SUPABASE_SERVICE_ROLE_KEY ??= "test-only";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const { GET } = await import(pathToFileURL(path.join(ROOT, "apps/dashboard/app/api/version/route.ts")).href);
/** Next's own store for a request, which the door's `connection()` asks for: here a request that reads nothing. */
const NEXT = createRequire(path.join(ROOT, "apps/dashboard/package.json"));
const { workAsyncStorage } = NEXT("next/dist/server/app-render/work-async-storage.external");
const asARequest = (fn) => workAsyncStorage.run({ route: "/api/version", forceStatic: true }, fn);
/** The newest migration the tree carries, as the ledger records it. */
const HEAD = String(headOf(readLedger(ROOT))).padStart(5, "0");

test("it answers the commit and the newest migration the build was written against, never cached", async () => {
  const before = process.env.VERCEL_GIT_COMMIT_SHA;
  try {
    process.env.VERCEL_GIT_COMMIT_SHA = "1388f2cc6581dc21596184252dc090b65d2f1d4c";
    const res = await asARequest(() => GET());
    assert.equal(res.status, 200);
    assert.equal(res.headers.get("cache-control"), "no-store");
    const said = await res.json();
    assert.equal(said.sha, "1388f2cc6581dc21596184252dc090b65d2f1d4c");
    assert.match(said.migration, /^\d{5}$/);
    assert.equal(said.migration, HEAD, "the ledger's head: what the smoke holds to production's own record");
  } finally {
    if (before === undefined) delete process.env.VERCEL_GIT_COMMIT_SHA;
    else process.env.VERCEL_GIT_COMMIT_SHA = before;
  }
});
