/**
 * The judge's time, counted for every step a batch takes (3 Nov 2026). A collect checked for the judge's 28 seconds
 * before it ran the second model's screen (up to 8 s and its usage write), and asked a refused answer once more with
 * whatever was left: a judge call started short of its bound is killed with the function, the page is never committed,
 * and both models are paid twice when the job is tried again. Now the screen is asked only where the judge keeps its
 * whole bound after it, and a refused answer is asked again only with that bound still left; short of it the batch is
 * Needs review, in the judge's own words, and the page commits.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { startRound } from "../../../packages/core/src/leads/runner/start.ts";
import { collect } from "../../../packages/core/src/leads/runner/collect.ts";
import { JUDGE_MARGIN_MS, SCREEN_MARGIN_MS } from "../../../packages/core/src/leads/runner/rules.ts";
import { JUDGE_REFUSED_REASON, JUDGE_TIMEOUT_MS } from "../../../packages/core/src/leads/judge.ts";
import { judgeCallPlaces } from "../../../packages/contracts/src/leads/lead-judge.ts";
import { LEAD_SCREEN_BOUND_MS, SHADOW_WRITE_MS } from "../../../packages/contracts/src/ai/shadow.ts";
import { leadDb } from "../../../apps/edge/lib/leads/lead-db.ts";
import { leadWorld, TENANT } from "../../_lead-world.mjs";
import { PLAN } from "../../_lead-fixtures.mjs";

const OWNER = "job-1";

/** A search whose probe runs finished, ready for their first collect. */
async function probed() {
  const w = leadWorld();
  w.rpcs.lead_search_create({ p_tenant_id: TENANT, p_plan: PLAN, p_via: "people", p_estimate_usd: 2 });
  const db = leadDb(w.db);
  const p = (owner = OWNER, o = {}) => w.ports(owner, { db, ...o });
  await startRound(p(), w.round().id, OWNER);
  w.finishRuns();
  return { w, p };
}

/** The fixture judge, made to refuse every call's first ask and to take `ms` of the world's clock for each ask. */
function refusingJudge(w, ms) {
  const real = w.judge.judge.bind(w.judge);
  const asks = [];
  const seen = new Map();
  w.judge.judge = async (plan, places, tenantId, roundId) => {
    const key = places.map((x) => x.name).join("|");
    seen.set(key, (seen.get(key) ?? 0) + 1);
    asks.push(key);
    w.clock.advance(ms);
    return seen.get(key) === 1 ? { refused: true, why: "max_tokens" } : real(plan, places, tenantId, roundId);
  };
  return asks;
}

test("the screen's budget is its bound and its usage write, and the edge bounds it by the same number", () => {
  assert.equal(SCREEN_MARGIN_MS, LEAD_SCREEN_BOUND_MS + SHADOW_WRITE_MS);
  assert.equal(JUDGE_MARGIN_MS, JUDGE_TIMEOUT_MS, "the judge is never started with less than its whole bound left");
});

test("short of the judge's bound, a refused answer is not asked again: the batch is Needs review in the judge's words, and the page commits", async () => {
  const { w, p } = await probed();
  const asks = refusingJudge(w, 20_000);
  const r1 = w.runs()[0];
  // Room for one call of the judge, not two: the second would be killed mid-way and paid twice.
  const deadline = w.clock.ms + JUDGE_TIMEOUT_MS + 5_000;
  const out = await collect(p("c1", { deadline }), r1.id, "p0", "c1");
  assert.equal(out.kind, "committed", "the page is committed, not retried");
  const calls = Math.ceil(13 / judgeCallPlaces(PLAN));
  assert.equal(asks.length, calls, "each call asked once");
  const mine = w.members().filter((m) => m.round_id === w.round().id);
  assert.ok(mine.length > 0);
  assert.ok(
    mine.filter((m) => m.reason === JUDGE_REFUSED_REASON).every((m) => m.class === "review"),
    "what the judge could not read waits in Needs review",
  );
  assert.ok(mine.some((m) => m.reason === JUDGE_REFUSED_REASON));
});

test("with the judge's bound still left, a refused answer is asked once more, as before", async () => {
  const { w, p } = await probed();
  const asks = refusingJudge(w, 1_000);
  const r1 = w.runs()[0];
  await collect(p("c1", { deadline: w.clock.ms + 10 * JUDGE_TIMEOUT_MS }), r1.id, "p0", "c1");
  const calls = Math.ceil(13 / judgeCallPlaces(PLAN));
  assert.equal(asks.length, 2 * calls, "each call asked twice: refused, then answered");
});

test("the screen is asked only where the judge keeps its whole bound after it; short of that, the judge reads every place", async () => {
  const { w, p } = await probed();
  let screened = 0;
  w.judge.screen = async () => {
    screened += 1;
    return { answers: [], model: "screen-model" };
  };
  const r1 = w.runs()[0];
  // Room for the judge, not for the screen and then the judge.
  await collect(p("c1", { deadline: w.clock.ms + JUDGE_MARGIN_MS + SCREEN_MARGIN_MS - 1_000 }), r1.id, "p0", "c1");
  assert.equal(screened, 0, "the screen is not asked when it would leave the judge short");
  const r2 = w.runs()[1];
  await collect(p("c2", { deadline: w.clock.ms + JUDGE_MARGIN_MS + SCREEN_MARGIN_MS + 1_000 }), r2.id, "p0", "c2");
  assert.equal(screened, 1, "with room for both, the screen goes first");
});
