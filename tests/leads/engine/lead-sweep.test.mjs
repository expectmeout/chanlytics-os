/**
 * The lead finder's sweep: the planner on rows, and the route run at the cron
 * door over the world in memory (the _cron-doors-world harness). Since 00506 a
 * quiet round is carried on from where it stands (core nextStepOf), and only
 * one nothing can carry on is ended, with the ending it had pending.
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
  GIVE_UP_FAILED_COLLECTS,
  carrySeq,
} from "../../../apps/edge/lib/leads/sweep-plan.ts";
import { MAX_CARRY_ONS, REDRIVE_AFTER_MS } from "../../../packages/core/src/leads/runner/next-step.ts";
import { at, knock, answer, vault } from "../../_cron-doors-world.mjs";
import { leadWorld, TENANT } from "../../_lead-world.mjs";

for (const k of ["APIFY_TOKEN", "ANTHROPIC_API_KEY", "SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY"])
  delete process.env[k];
const { setPg } = await import(at("apps/edge/lib/shared/pg.ts"));
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
  part: "probe",
  collect_scheduled: false,
  collects_failed: 0,
  ...over,
});
/** A round quiet a moment past the wait before it is carried on. */
const round = (over = {}) => ({
  id: "rd1",
  tenant_id: TENANT,
  state: "queued",
  purpose: "probe",
  ending_pending: null,
  waiting_since: null,
  state_since: iso(NOW - REDRIVE_AFTER_MS - 1),
  created_at: iso(NOW - 3 * 3_600_000),
  ...over,
});
const jobs = (over = {}) => new Map([["rd1", { start: false, check: false, carriedOn: 0, ...over }]]);

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

test("the planner: a quiet round is carried on from where it stands -- its start, its main phase, a collect of its newest finished run, or its checks -- never ended while something can carry it on (3 Nov 2026)", () => {
  const carry = carrySeq(NOW);
  const plan = (runs, rd, j = jobs()) => planLeadSweep({ runs, rounds: [rd], roundJobs: j }, NOW);
  assert.deepEqual(
    plan([], round()),
    [{ kind: "carry_start", roundId: "rd1", tenantId: TENANT, resume: false }],
    "a start job that died leaves a round queued with no run at all: the sweep starts it, it no longer ends it",
  );
  assert.deepEqual(
    plan([], round({ state_since: iso(NOW - 60_000) })),
    [],
    "a round that moved a minute ago is between two of its steps",
  );
  assert.deepEqual(
    plan([run()], round()),
    [{ kind: "collect", runId: "r1", tenantId: TENANT, seq: `s${Math.floor(NOW / 60_000)}` }],
    "a round with a run still at the provider is its run's to carry",
  );
  assert.deepEqual(
    plan([run({ state: "succeeded" })], round({ state: "probing" })),
    [{ kind: "carry_collect", runId: "r1", tenantId: TENANT, seq: carry }],
    "a probe whose last run finished and never told the round: its collect decides what that end should have",
  );
  assert.deepEqual(
    plan([run({ state: "succeeded" })], round({ state: "running" })),
    [{ kind: "carry_start", roundId: "rd1", tenantId: TENANT, resume: true }],
    "a probe that passed and whose main phase was never started",
  );
  assert.deepEqual(
    plan(
      [run({ state: "succeeded" }), run({ id: "r2", state: "succeeded", part: "main" })],
      round({ state: "running" }),
    ),
    [{ kind: "carry_collect", runId: "r2", tenantId: TENANT, seq: carry }],
    "a main phase whose last run finished and never sent the round to its checks",
  );
  assert.deepEqual(
    plan([run({ state: "succeeded", part: "main" })], round({ state: "checking", ending_pending: "target_reached" })),
    [{ kind: "carry_check", roundId: "rd1", tenantId: TENANT }],
    "REGRESSION: a round whose runs are all done and whose checks were never written is checked -- it was ended 'the source failed', over its pending ending, with its addresses left Checking for good",
  );
  assert.deepEqual(
    plan(
      [
        run({ state: "succeeded", part: "main" }),
        run({ id: "c1", purpose: "check", part: "check", state: "succeeded" }),
      ],
      round({ state: "checking" }),
    ),
    [{ kind: "carry_collect", runId: "c1", tenantId: TENANT, seq: carry }],
    "a check that finished and never told the round reads its answers again",
  );
  assert.deepEqual(plan([], round(), jobs({ start: true })), [], "its start is on its way");
  assert.deepEqual(plan([], round({ state: "checking" }), jobs({ check: true })), [], "its checks are on their way");
  assert.deepEqual(
    plan([run({ state: "succeeded", collect_scheduled: true })], round({ state: "probing" })),
    [],
    "a collect of its run is on its way",
  );
  assert.deepEqual(
    plan([], round({ state: "waiting_on_owner", waiting_since: iso(NOW - 3_600_000) })),
    [],
    "a question keeps its own day to be answered",
  );
  assert.deepEqual(plan([], round({ state: "ended" })), [], "an ended round is done with");
});

test("the planner: a round carried on three times and still quiet is ended through the door that looks again, with the ending it had pending, else the source's failure", () => {
  assert.equal(MAX_CARRY_ONS, 3);
  const since = iso(NOW - REDRIVE_AFTER_MS - 1);
  const plan = (rd, carriedOn) => planLeadSweep({ runs: [], rounds: [rd], roundJobs: jobs({ carriedOn }) }, NOW);
  assert.deepEqual(plan(round({ state: "checking" }), 2), [{ kind: "carry_check", roundId: "rd1", tenantId: TENANT }]);
  assert.deepEqual(plan(round({ state: "checking", ending_pending: "target_reached" }), 3), [
    { kind: "end_stuck", roundId: "rd1", tenantId: TENANT, ending: "target_reached", since },
  ]);
  assert.deepEqual(plan(round(), 3), [
    { kind: "end_stuck", roundId: "rd1", tenantId: TENANT, ending: "source_failed", since },
  ]);
});

test("the planner: a run whose collects failed for good three times is given up, never collected or aborted again; two failures are still collected", () => {
  const seq = `s${Math.floor(NOW / 60_000)}`;
  const giveUp = [{ kind: "give_up", runId: "r1", apifyRunId: "RunA", owner: `sweep:${Math.floor(NOW / 60_000)}` }];
  assert.equal(GIVE_UP_FAILED_COLLECTS, 3);
  assert.deepEqual(
    planLeadSweep({ runs: [run({ collects_failed: 2 })], rounds: [] }, NOW),
    [{ kind: "collect", runId: "r1", tenantId: TENANT, seq }],
    "a provider's bad half hour is ridden out",
  );
  assert.deepEqual(planLeadSweep({ runs: [run({ collects_failed: 3 })], rounds: [] }, NOW), giveUp);
  assert.deepEqual(
    planLeadSweep({ runs: [run({ collects_failed: 3, created_at: iso(NOW - RUN_MAX_AGE_MS - 1) })], rounds: [] }, NOW),
    giveUp,
    "past its 45 minutes it is given up, not aborted and collected once more",
  );
  assert.deepEqual(
    planLeadSweep({ runs: [run({ collects_failed: 4, collect_scheduled: true })], rounds: [] }, NOW),
    giveUp,
    "a collect still on its way finds the round ended, so it is not waited for",
  );
  assert.deepEqual(
    planLeadSweep({ runs: [run({ collects_failed: 3 })], rounds: [round()] }, NOW),
    giveUp,
    "the round is the give-up's to end, in the same commit: end_stuck does not race it",
  );
  assert.deepEqual(
    planLeadSweep({ runs: [run({ state: "unknown", apify_run_id: null, collects_failed: 3 })], rounds: [] }, NOW),
    [{ kind: "reconcile", runId: "r1" }],
    "only a run the provider started is given up",
  );
});

test("the loop, and its end: a run whose collect fails for good is collected again at every tick until its third failed collect; then it is failed in our books, its round ends 'the source failed' keeping what it found and giving back the rest, and nothing more is scheduled", async () => {
  const w = leadWorld();
  Object.assign(w.rpcs, vault);
  const ago = (ms) => new Date(Date.now() - ms).toISOString();
  w.T.lead_rounds.push({
    id: "rd1",
    tenant_id: TENANT,
    search_id: "s1",
    seq: 1,
    purpose: "probe",
    plan: {},
    state: "running",
    waiting_since: null,
    ending: null,
    ending_pending: null,
    allowance_reserved: 25,
    allowance_used: 3,
    cost_reserved_usd: 2,
    cost_usd: 0.4,
    state_since: ago(20 * 60_000),
    created_at: ago(3 * 3_600_000),
  });
  w.T.lead_runs.push({
    id: "r1",
    tenant_id: TENANT,
    round_id: "rd1",
    purpose: "discover",
    state: "running",
    apify_run_id: "RunA",
    claimed_by: "job-1",
    claimed_at: ago(20 * 60_000),
    lease_owner: null,
    lease_gen: 0,
    lease_until: null,
    read_offset: 9,
    items_seen: 9,
    usage_usd: 0.4,
    created_at: ago(20 * 60_000),
  });
  // What it found before its collect began to fail: kept whatever the round's ending.
  w.T.lead_search_members.push({ search_id: "s1", lead_id: "l1", round_id: "rd1", tenant_id: TENANT, counted: true });
  setPg(w.db);
  const collectsOf = () => w.T.jobs.filter((j) => j.kind === "lead_collect" && j.payload.run_id === "r1");
  // The loop: each tick asks for another collect, and each one fails for good (the ledger's three tries, a bell each).
  for (let tick = 1; tick <= GIVE_UP_FAILED_COLLECTS; tick++) {
    const [, body] = await answer(await knock(POST, "leads"));
    assert.equal(body.collected, 1, `tick ${tick}: collected again`);
    for (const j of collectsOf()) Object.assign(j, { state: "failed", attempts: 3, last_error: "timeout" });
  }
  // Its end: the next tick gives it up.
  const [, body] = await answer(await knock(POST, "leads"));
  assert.equal(collectsOf().length, GIVE_UP_FAILED_COLLECTS, "no fourth collect, so no fourth bell");
  assert.deepEqual([body.collected, body.aborted, body.given_up, body.failed], [0, 0, 1, 0]);
  const r1 = w.T.lead_runs[0];
  const rd1 = w.T.lead_rounds[0];
  assert.deepEqual([r1.state, r1.read_offset, r1.lease_owner], ["failed", 9, null]);
  assert.deepEqual(
    [rd1.state, rd1.ending, rd1.allowance_reserved, rd1.cost_reserved_usd],
    ["ended", "source_failed", 3, 0.4],
    "the round ends: what it counted stays counted, and what it reserved and did not use goes back",
  );
  assert.equal(w.T.lead_search_members.length, 1, "what it found is kept");
  // And again: nothing twice.
  const [, again] = await answer(await knock(POST, "leads"));
  assert.deepEqual(
    [again.collected, again.given_up, again.rounds_ended, again.failed, collectsOf().length],
    [0, 0, 0, 0, GIVE_UP_FAILED_COLLECTS],
  );
});

test("the route: refused without the key; with it, the rows are read, each action applied on its own, and the counts answered", async () => {
  const w = leadWorld();
  Object.assign(w.rpcs, vault);
  const old = new Date(Date.now() - QUESTION_WAIT_MS - 60_000).toISOString();
  const stale = new Date(Date.now() - REDRIVE_AFTER_MS - 60_000).toISOString();
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
      state_since: old,
      created_at: old,
    },
    // A round whose lead_round_start job died: queued, no run of its own. The sweep starts it (it used to end it).
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
      state_since: stale,
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
    rounds_ended: 0,
    carried_on: 1,
    given_up: 0,
    rechecks_asked: 0,
    rechecks_held: 0,
    rechecks_freed: 0,
    marks_due: 0,
    marks_kept: 0,
    failed: 0,
    source: "off",
  });
  assert.deepEqual(w.rechecks, [200], "the addresses that did not answer are asked again, 200 at most a tick");
  assert.deepEqual(
    w.T.jobs.map((j) => [
      j.kind,
      j.payload.run_id ?? j.payload.round_id,
      j.payload.carry_on ?? /^s\d+$/.test(j.payload.seq),
    ]),
    [
      ["lead_collect", "r1", true],
      ["lead_round_start", "rd2", true],
    ],
  );
  assert.deepEqual(
    [w.T.lead_runs[1].lease_owner, w.T.lead_rounds[0].state, w.T.lead_rounds[0].ending],
    [null, "ended", "question_unanswered"],
  );
  assert.deepEqual(
    [w.T.lead_rounds[1].state, w.T.lead_rounds[1].allowance_reserved],
    ["queued", 5],
    "the round whose start died is started, its reservation still its own",
  );
  // Again: nothing twice.
  const [, again] = await answer(await knock(POST, "leads"));
  assert.deepEqual(
    [again.collected, again.released, again.questions_ended, again.rounds_ended, again.carried_on],
    [0, 0, 0, 0, 0],
    "the collect and the start are already coming; the lease and the question are done",
  );
  assert.equal(w.T.jobs.length, 2);
});

test("the route's ending: a checking round carried on three times and still quiet is ended by lead_round_end_stuck with the ending it had pending, and none of its addresses is left checking", async () => {
  const w = leadWorld();
  Object.assign(w.rpcs, vault);
  const ago = (ms) => new Date(Date.now() - ms).toISOString();
  const since = ago(REDRIVE_AFTER_MS + 30 * 60_000);
  w.T.lead_rounds.push({
    id: "rd1",
    tenant_id: TENANT,
    search_id: "s1",
    seq: 1,
    purpose: "probe",
    plan: {},
    state: "checking",
    waiting_since: null,
    ending: null,
    ending_pending: "target_reached",
    allowance_reserved: 10,
    allowance_used: 10,
    cost_reserved_usd: 2,
    cost_usd: 0.5,
    state_since: since,
    created_at: ago(3 * 3_600_000),
  });
  w.T.leads.push({ id: "l1", tenant_id: TENANT, email: "hello@a.example", email_state: "checking" });
  w.T.lead_search_members.push({ search_id: "s1", lead_id: "l1", round_id: "rd1", tenant_id: TENANT, counted: false });
  // Three carry-ons of its checks the sweep wrote since it last moved, each done and the round still quiet.
  for (let i = 0; i < MAX_CARRY_ONS; i++)
    w.T.jobs.push({
      id: `j${i}`,
      tenant_id: TENANT,
      kind: "lead_check",
      state: "done",
      due_at: ago(20 * 60_000 - i),
      payload: { round_id: "rd1", batch: 0, carry_on: true },
      attempts: 1,
      created_at: ago(20 * 60_000 - i),
    });
  setPg(w.db);
  const [, body] = await answer(await knock(POST, "leads"));
  assert.deepEqual([body.rounds_ended, body.carried_on, body.failed], [1, 0, 0]);
  const rd1 = w.T.lead_rounds[0];
  assert.deepEqual(
    [rd1.state, rd1.ending],
    ["ended", "target_reached"],
    "the ending it had pending, not the source's failure",
  );
  assert.equal(
    w.T.leads[0].email_state,
    "unknown",
    "an address that never answered is Couldn't check, for Check again",
  );
});
