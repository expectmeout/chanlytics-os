/**
 * A spec that writes must name its workspace, because the app does.
 *
 * `scoped()` (apps/dashboard/src/legacy-bridge/surface-data.ts) appends
 * ?workspace= to every URL the client fetches, and its own comment records
 * this bug being fixed there once already. Specs that call page.request
 * directly skip it, so they test a request the product never makes — and
 * `requireRole` refuses them with a 400 (with-route.ts:180) as soon as the
 * account holds a second membership, which self-serve sign-up makes ordinary.
 *
 * Two failures in the first credentialed nightly were exactly this, and read
 * as a billing bug and a phone-number bug for a day.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { ROOT, readCode } from "./_source.mjs";

const SPECS = fs.readdirSync(path.join(ROOT, "e2e")).filter((f) => f.endsWith(".spec.ts"));

test("every direct write in the e2e suite names a workspace", () => {
  const offenders = [];
  for (const f of SPECS) {
    for (const line of readCode(`e2e/${f}`).split("\n")) {
      if (!/page\.request\.(post|patch|put|delete)\(/.test(line)) continue;
      if (line.includes("workspace=") || line.includes("scoped(")) continue;
      // An absolute URL is the edge, which carries its own credential. The
      // bare `request` fixture has no session at all, which is the point of
      // ask.spec.ts's unauthenticated case, so only `page.request` is judged.
      if (line.includes("https://")) continue;
      // A route that names a row resolves the workspace FROM that row:
      // requireOperator(ctx, m.tenant_id) passes it as `wanted`, so the
      // ambiguity guard cannot fire. steer.spec.ts:47 proves it — it posts
      // unscoped and passes.
      if (/\/(messages|conversations|threads|proposals)\//.test(line)) continue;
      offenders.push(`${f}: ${line.trim().slice(0, 90)}`);
    }
  }
  assert.deepEqual(offenders, [], "these writes would be refused for an account with two workspaces");
});
