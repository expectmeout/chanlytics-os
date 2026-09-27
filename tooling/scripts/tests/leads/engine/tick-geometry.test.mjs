/**
 * The tick's geometry and the lead runner's margins, held to each other.
 *
 * Core does not import the ledger and the ledger does not import the runner,
 * so nothing but this file can say that a lead job claimed at the end of the
 * claim window still has room to read a page and judge it. On the first real
 * searches nothing did: the judge's 40-second timeout was sized against "forty
 * of the sixty before the function is killed" (ledger.ts CLAIM_FOR_MS), while
 * the runner measures against the DEADLINE it is handed, 45 seconds from the
 * tick's start -- 25 seconds for the last job claimed. Every collect but a
 * tick's first retried into the same arithmetic ("out of time before the
 * judge") until the ledger gave up on it, and four of five rounds froze with
 * their Apify runs long finished.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  CLAIM_FOR_MS,
  FUNCTION_CEILING_MS,
  LEAD_YIELD_AT_MS,
  YIELD_AT_MS,
  runTick,
} from "../../../../../packages/jobs/src/index.ts";
import { DEADLINE_MARGIN_MS, JUDGE_MARGIN_MS } from "../../../../../packages/core/src/leads/runner.ts";
import { JUDGE_TIMEOUT_MS, PAGE_READ_ALLOWANCE_MS } from "../../../../../packages/core/src/leads/judge.ts";

test("the last lead job a tick claims can still read a page and start the judge", () => {
  const promised = LEAD_YIELD_AT_MS - CLAIM_FOR_MS;
  assert.ok(
    promised - PAGE_READ_ALLOWANCE_MS >= JUDGE_MARGIN_MS,
    `a lead job claimed ${CLAIM_FOR_MS / 1000}s in is promised ${promised / 1000}s; after ${PAGE_READ_ALLOWANCE_MS / 1000}s reading it needs ${JUDGE_MARGIN_MS / 1000}s for the judge`,
  );
  assert.equal(JUDGE_MARGIN_MS, JUDGE_TIMEOUT_MS, "the judge is never started with less than its whole timeout left");
});

test("a lead job's deadline never reaches the function's ceiling, and a broadcast's stays where it was", () => {
  assert.ok(
    LEAD_YIELD_AT_MS + DEADLINE_MARGIN_MS <= FUNCTION_CEILING_MS,
    "the runner's kill margin fits between the lead deadline and the ceiling",
  );
  assert.ok(LEAD_YIELD_AT_MS > YIELD_AT_MS, "the lead window is the longer one, or this file has nothing to hold");
  assert.equal(
    YIELD_AT_MS,
    45_000,
    "a broadcast's yield is unchanged: a send in flight still has fifteen seconds to come back",
  );
});

test("the tick hands a lead job the lead deadline and every other job the ordinary one", async () => {
  const seen = [];
  let now = 1_000_000;
  const job = (kind) => ({ id: kind, tenant_id: "t", kind, payload: {}, attempts: 0 });
  const queue = [job("lead_collect"), job("broadcast_batch")];
  await runTick(
    {
      now: () => now,
      claim: async () => queue.shift() ?? null,
      dispatch: async (j, deadline) => {
        seen.push([j.kind, deadline - 1_000_000]);
        return "done";
      },
      complete: async () => true,
      fail: async () => true,
      defer: async () => true,
      settle: async () => [],
      alert: async () => {},
      log: { info() {}, warn() {}, error() {} },
    },
    {
      claimForMs: CLAIM_FOR_MS,
      yieldAtMs: YIELD_AT_MS,
      yieldAtFor: (k) => (k.startsWith("lead_") ? LEAD_YIELD_AT_MS : undefined),
      leaseSeconds: 60,
    },
  );
  assert.deepEqual(seen, [
    ["lead_collect", LEAD_YIELD_AT_MS],
    ["broadcast_batch", YIELD_AT_MS],
  ]);
});
