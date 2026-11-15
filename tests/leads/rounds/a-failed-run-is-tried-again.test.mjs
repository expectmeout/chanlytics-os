/**
 * A source's failure tried again (decision 0133, step 4): a term whose run failed or timed out partway is started again
 * twenty minutes on, under a run of its own that asks past what it read, up to three times, before its round ends on the
 * source; a term read whole on a later try ends the round as one that never failed. Every term failing within half a
 * minute is a fault no wait mends: no try is spent, and the platform is told at once. The real runner and the real
 * database adapter over the world in memory.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { startRound } from "../../../packages/core/src/leads/runner/start.ts";
import { collect } from "../../../packages/core/src/leads/runner/collect/collect.ts";
import { retryOf, LEAD_RUN_RETRY_SECONDS } from "../../../packages/core/src/leads/runner/retries.ts";
import { standingRuns } from "../../../packages/core/src/leads/endings.ts";
import { retryRunIdFor, runIdFor } from "../../../packages/core/src/leads/ids.ts";
import { leadDb } from "../../../apps/edge/lib/leads/db.ts";
import { leadWorld, TENANT } from "../../_lead-world.mjs";
import { LABELS, PLAN, mapsItem } from "../../_lead-fixtures.mjs";

const OWNER = "job-1";
const MINUTE = 60_000;
const PLAN_ONE = { ...PLAN, terms: ["hair salon"], count: 50 };

/** The end of a phase read at 13:00, an hour after the first run was made. */
const decide = (runs) => retryOf(runs, Date.UTC(2026, 10, 14, 13));

/** A run row as the runner reads it: its term, its state, and when it was made and ended. */
const run = (term, state, madeMin, endedMin) => ({
  id: randomUUID(),
  purpose: "discover",
  term,
  state,
  created_at: new Date(Date.UTC(2026, 10, 14, 12, madeMin)).toISOString(),
  finished_at: endedMin === null ? null : new Date(Date.UTC(2026, 10, 14, 12, endedMin)).toISOString(),
});

test("a term that failed partway is tried again; one tried three times is not; every term failing at once is the source down", () => {
  const ok = run("barber", "succeeded", 0, 9);
  assert.equal(decide([run("hair salon", "failed", 0, 6), ok]), "retry", "it failed six minutes in: a bad minute");
  assert.equal(decide([run("hair salon", "timed_out", 0, 30), ok]), "retry", "a run out of time is tried again too");
  const fourth = [0, 1, 2, 3].map((i) => run("hair salon", "failed", i * 10, i * 10 + 5));
  assert.equal(decide([...fourth.slice(0, 3), ok]), "retry", "three tries failed: one more");
  assert.equal(decide([...fourth, ok]), "none", "a fourth failure ends the round on the source");
  assert.equal(
    decide([run("hair salon", "failed", 0, 0), run("barber", "failed", 0, 0)]),
    "down",
    "every term failed within half a minute: a key, a limit or a build",
  );
  assert.equal(decide([ok]), "none");
  const tried = [run("hair salon", "failed", 0, 6), run("hair salon", "succeeded", 26, 40)];
  assert.deepEqual(
    standingRuns(tried).map((r) => r.state),
    ["succeeded"],
    "a failed try a later run of its term followed says nothing of the area",
  );
});

/** A round on its main phase, its one term ranked as `ranked` by the provider, with the clock the world keeps. */
function mainRound(ranked) {
  const w = leadWorld({ plan: PLAN_ONE });
  w.rpcs.lead_search_create({ p_tenant_id: TENANT, p_plan: PLAN_ONE, p_via: "people", p_estimate_usd: 5 });
  Object.assign(w.round(), { purpose: "topup", state: "queued", target: 50 });
  const start = w.apify.startRun;
  w.apify.startRun = async (actor, input, opts) => {
    const out = await start(actor, input, opts);
    if (!actor.includes("email-verifier"))
      w.apify.state.datasets[out.datasetId] = ranked.slice(0, input.maxCrawledPlacesPerSearch);
    return out;
  };
  const told = [];
  const db = leadDb(w.db);
  const p = (owner = OWNER) => w.ports(owner, { db, tell: async (e) => void told.push(e) });
  return { w, p, told };
}

/** The round's start, its runs stamped by the world's clock: the table in memory stamps a row by the wall's. */
async function startOn(w, p, roundId) {
  await startRound(p(), roundId, OWNER, true);
  for (const r of w.runs()) if (!r.finished_at) r.created_at = w.clock.now().toISOString();
}

/** The provider ends every running run with `status` after `minutes`, and each is collected. */
async function endRuns(w, p, status, minutes) {
  w.clock.advance(minutes * MINUTE);
  w.finishRuns(status);
  for (const r of w.runs().filter((x) => !x.finished_at)) await collect(p(`c-${r.id}`), r.id, "p0", `c-${r.id}`);
}

const fitting = (n) =>
  Array.from({ length: n }, (_, i) => {
    const item = mapsItem(200 + i);
    LABELS.set(item.title, "fit");
    return item;
  });

test("a run that failed partway is started again twenty minutes on, under a run of its own that asks past what it read; read whole, the round ends on what it found", async () => {
  const { w, p } = mainRound(fitting(6));
  const round = w.round();
  await startOn(w, p, round.id);
  assert.equal(w.runs().length, 1);
  await endRuns(w, p, "FAILED", 6);
  const after = w.T.lead_rounds.find((r) => r.id === round.id);
  assert.equal(after.state, "running", "the round runs on: nothing ends on a source's bad minute");
  assert.equal(after.ending_pending ?? null, null);
  const again = w.T.jobs.find((j) => j.kind === "lead_round_start" && j.payload.resume === true);
  assert.ok(again, "its start is scheduled again");
  assert.equal(Date.parse(again.due_at), w.clock.ms + LEAD_RUN_RETRY_SECONDS * 1000, "twenty minutes on");

  w.clock.advance(LEAD_RUN_RETRY_SECONDS * 1000);
  await startOn(w, p, round.id);
  const runs = w.runs();
  assert.equal(runs.length, 2, "one more run, for the term that failed");
  assert.equal(runs[1].id, await retryRunIdFor(round.id, "hair salon", 1), "its second try, a row of its own");
  assert.notEqual(runs[1].id, await runIdFor(round.id, "main", "hair salon"));
  const asks = w.apify.calls.filter((c) => c.op === "startRun" && !c.actor.includes("email-verifier"));
  assert.ok(
    asks[1].input.maxCrawledPlacesPerSearch > runs[0].items_seen,
    "asked past the places the failed try read: the provider answers a term from the top",
  );
  await endRuns(w, p, "SUCCEEDED", 9);
  const ended = w.T.lead_rounds.find((r) => r.id === round.id);
  assert.notEqual(ended.ending_pending ?? ended.ending, "source_failed", "read whole on its second try");
});

test("every term failing within half a minute spends no try: the round ends on the source and the platform is told", async () => {
  const { w, p, told } = mainRound(fitting(2));
  const round = w.round();
  await startOn(w, p, round.id);
  await endRuns(w, p, "FAILED", 0.2);
  const after = w.T.lead_rounds.find((r) => r.id === round.id);
  assert.equal(after.ending_pending ?? after.ending, "source_failed");
  assert.equal(
    w.T.jobs.filter((j) => j.kind === "lead_round_start" && j.payload.resume === true).length,
    0,
    "no try again",
  );
  assert.deepEqual(
    told.map((e) => e.kind),
    ["source_down"],
    "the platform is paged in the provider's own names",
  );
});
