/**
 * The lead finder's sweep: the planner on rows, and the route run at the cron
 * door over the world in memory (the _cron-doors-world harness).
 */
import { test, after } from "node:test";
import assert from "node:assert/strict";
import {
  planLeadSweep,
  RUN_MAX_AGE_MS,
  STARTING_STALE_MS,
  CLAIMED_STALE_MS,
  LEASE_STALE_MS,
  QUESTION_WAIT_MS,
  ROUND_STUCK_MS,
} from "../../../apps/edge/lib/lead-sweep.ts";
import { at, knock, answer, vault } from "./_cron-doors-world.mjs";
import { leadWorld, TENANT } from "./_lead-world.mjs";

for (const k of ["APIFY_TOKEN", "ANTHROPIC_API_KEY", "SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY"])
  delete process.env[k];
const { setPg } = await import(at("apps/edge/lib/pg.ts"));
const { POST } = await import(at("apps/edge/api/cron/leads.ts"));
after(() => setPg(null));

const NOW = Date.parse("2026-09-19T12:00:00.000Z");
const iso = (ms) => new Date(ms).toISOString();
const run = (over = {}) => ({
  id: "r1",
  tenant_id: TENANT,
  round_id: "rd1",
  purpose: "discover",
  state: "running",
  apify_run_id: "RunA",
  claimed_by: "job-1",
  claimed_at: iso(NOW - 60_000),
  lease_owner: null,
  lease_gen: 0,
  lease_until: null,
  created_at: iso(NOW - 60_000),
  collect_scheduled: false,
  ...over,
});
const round = (over = {}) => ({
  id: "rd1",
  tenant_id: TENANT,
  state: "queued",
  waiting_since: null,
  created_at: iso(NOW - ROUND_STUCK_MS - 1),
  ...over,
});

test("the planner: a running run nobody is collecting is collected; one past 45 minutes is aborted and read once more; an unknown start is reconciled; a stale claim is marked unknown; a stale lease is released by its own owner and generation; a question a day old ends its round", () => {
  const seq = `s${Math.floor(NOW / 60_000)}`;
  assert.deepEqual(planLeadSweep({ runs: [run()], rounds: [] }, NOW), [
    { kind: "collect", runId: "r1", tenantId: TENANT, seq },
  ]);
  assert.deepEqual(
    planLeadSweep({ runs: [run({ collect_scheduled: true })], rounds: [] }, NOW),
    [],
    "a collect is already coming",
  );
  assert.deepEqual(planLeadSweep({ runs: [run({ created_at: iso(NOW - RUN_MAX_AGE_MS - 1) })], rounds: [] }, NOW), [
    { kind: "abort", runId: "r1", tenantId: TENANT, apifyRunId: "RunA", seq },
  ]);
  assert.deepEqual(planLeadSweep({ runs: [run({ state: "unknown", apify_run_id: null })], rounds: [] }, NOW), [
    { kind: "reconcile", runId: "r1" },
  ]);
  assert.deepEqual(
    planLeadSweep(
      {
        runs: [run({ state: "starting", apify_run_id: null, claimed_at: iso(NOW - STARTING_STALE_MS - 1) })],
        rounds: [],
      },
      NOW,
    ),
    [{ kind: "mark_unknown", runId: "r1", owner: "job-1" }],
  );
  assert.deepEqual(
    planLeadSweep({ runs: [run({ state: "starting", apify_run_id: null })], rounds: [] }, NOW),
    [],
    "a claim a minute old is still starting",
  );
  assert.deepEqual(
    planLeadSweep(
      {
        runs: [
          run({
            state: "claimed",
            apify_run_id: null,
            claimed_by: null,
            claimed_at: null,
            created_at: iso(NOW - CLAIMED_STALE_MS - 1),
          }),
        ],
        rounds: [],
      },
      NOW,
    ),
    [{ kind: "orphan", runId: "r1", owner: `sweep:${Math.floor(NOW / 60_000)}` }],
    "a row nobody claimed in an hour is the sweep's to claim and mark unknown",
  );
  const stale = run({
    lease_owner: "job-9",
    lease_gen: 3,
    lease_until: iso(NOW - LEASE_STALE_MS - 1),
    collect_scheduled: true,
  });
  assert.deepEqual(planLeadSweep({ runs: [stale], rounds: [] }, NOW), [
    { kind: "release_lease", runId: "r1", owner: "job-9", gen: 3 },
  ]);
  assert.deepEqual(
    planLeadSweep(
      {
        runs: [],
        rounds: [
          { id: "rd1", tenant_id: TENANT, state: "waiting_on_owner", waiting_since: iso(NOW - QUESTION_WAIT_MS - 1) },
        ],
      },
      NOW,
    ),
    [{ kind: "end_question", roundId: "rd1", tenantId: TENANT }],
  );
  assert.deepEqual(
    planLeadSweep(
      {
        runs: [],
        rounds: [{ id: "rd1", tenant_id: TENANT, state: "waiting_on_owner", waiting_since: iso(NOW - 3_600_000) }],
      },
      NOW,
    ),
    [],
    "an hour is not a day",
  );
});

test("the planner: a round stuck with nothing live is ended once its hour is up, so its allowance and its share of the day's cap come back", () => {
  const stuck = [{ kind: "end_stuck", roundId: "rd1", tenantId: TENANT }];
  assert.deepEqual(
    planLeadSweep({ runs: [], rounds: [round()] }, NOW),
    stuck,
    "a start job that died leaves a round queued with no run at all, and only the sweep ends it",
  );
  assert.deepEqual(
    planLeadSweep({ runs: [], rounds: [round({ created_at: iso(NOW - 60_000) })] }, NOW),
    [],
    "a minute old is not an hour",
  );
  assert.deepEqual(
    planLeadSweep({ runs: [run()], rounds: [round()] }, NOW),
    [{ kind: "collect", runId: "r1", tenantId: TENANT, seq: `s${Math.floor(NOW / 60_000)}` }],
    "a round with a run still live is nobody's to end",
  );
  assert.deepEqual(
    planLeadSweep({ runs: [run({ state: "succeeded" })], rounds: [round({ state: "checking" })] }, NOW),
    stuck,
    "a round whose runs are all done and whose last commit never landed",
  );
  assert.deepEqual(
    planLeadSweep(
      { runs: [], rounds: [round({ state: "waiting_on_owner", waiting_since: iso(NOW - 3_600_000) })] },
      NOW,
    ),
    [],
    "a question keeps its own day to be answered",
  );
  assert.deepEqual(
    planLeadSweep({ runs: [], rounds: [round({ state: "ended" })] }, NOW),
    [],
    "an ended round is done with",
  );
});

test("the route: refused without the key; with it, the rows are read, each action applied on its own, and the counts answered", async () => {
  const w = leadWorld();
  Object.assign(w.rpcs, vault);
  const old = new Date(Date.now() - QUESTION_WAIT_MS - 60_000).toISOString();
  const stale = new Date(Date.now() - ROUND_STUCK_MS - 60_000).toISOString();
  w.T.lead_rounds.push(
    {
      id: "rd1",
      tenant_id: TENANT,
      search_id: "s1",
      seq: 1,
      purpose: "probe",
      plan: {},
      state: "waiting_on_owner",
      waiting_since: old,
      ending: null,
      ending_pending: null,
      allowance_reserved: 5,
      allowance_used: 0,
      cost_reserved_usd: 1,
      cost_usd: 0,
      created_at: old,
    },
    // A round whose lead_round_start job died: queued, no run of its own, and its reservation held for ever until the sweep ends it.
    {
      id: "rd2",
      tenant_id: TENANT,
      search_id: "s1",
      seq: 2,
      purpose: "topup",
      plan: {},
      state: "queued",
      waiting_since: null,
      ending: null,
      ending_pending: null,
      allowance_reserved: 5,
      allowance_used: 0,
      cost_reserved_usd: 1,
      cost_usd: 0,
      created_at: stale,
    },
  );
  w.T.lead_runs.push(
    {
      id: "r1",
      tenant_id: TENANT,
      round_id: "rd1",
      purpose: "discover",
      state: "running",
      apify_run_id: "RunA",
      claimed_by: "job-1",
      claimed_at: new Date().toISOString(),
      lease_owner: null,
      lease_gen: 0,
      lease_until: null,
      read_offset: 0,
      items_seen: 0,
      created_at: new Date().toISOString(),
    },
    {
      id: "r2",
      tenant_id: TENANT,
      round_id: "rd1",
      purpose: "discover",
      state: "succeeded",
      apify_run_id: "RunB",
      claimed_by: "job-1",
      claimed_at: new Date().toISOString(),
      lease_owner: "job-7",
      lease_gen: 2,
      lease_until: new Date(Date.now() - LEASE_STALE_MS - 60_000).toISOString(),
      read_offset: 0,
      items_seen: 0,
      created_at: new Date().toISOString(),
    },
  );
  setPg(w.db);
  assert.equal((await knock(POST, "leads", null)).status, 401);
  const [status, body] = await answer(await knock(POST, "leads"));
  assert.equal(status, 200);
  assert.deepEqual(body, {
    ok: true,
    collected: 1,
    aborted: 0,
    reconciled: 0,
    marked_unknown: 0,
    released: 1,
    questions_ended: 1,
    rounds_ended: 1,
    failed: 0,
    source: "off",
  });
  assert.deepEqual(
    w.T.jobs.map((j) => [j.kind, j.payload.run_id, /^s\d+$/.test(j.payload.seq)]),
    [["lead_collect", "r1", true]],
  );
  assert.deepEqual(
    [w.T.lead_runs[1].lease_owner, w.T.lead_rounds[0].state, w.T.lead_rounds[0].ending],
    [null, "ended", "question_unanswered"],
  );
  assert.deepEqual(
    [w.T.lead_rounds[1].state, w.T.lead_rounds[1].ending, w.T.lead_rounds[1].allowance_reserved],
    ["ended", "source_failed", 0],
    "the stuck round is ended and gives its allowance back",
  );
  // Again: nothing twice.
  const [, again] = await answer(await knock(POST, "leads"));
  assert.deepEqual(
    [again.collected, again.released, again.questions_ended, again.rounds_ended],
    [0, 0, 0, 0],
    "the collect is already coming; the lease, the question and the stuck round are done",
  );
  assert.equal(w.T.jobs.length, 1);
});
