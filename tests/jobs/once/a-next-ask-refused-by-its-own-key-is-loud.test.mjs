/**
 * A job that asks for its own next run under the key it is itself holding (the plan "Prove it works", handed on by lane
 * 5; #2728). The ledger keeps one job per once-only key among those waiting or running, and the job that asks is still
 * running, so the database refuses the next ask (23505) and `scheduleJobOnce` read that as "already on the ledger": no
 * error, no line, the next run never written. A post waiting for a new version stayed "Getting ready" for good that way.
 *
 * The runner now tells that one refusal from every other: where the ask is for other work than its writer is doing (one
 * more wait, a later step) and the key that refused it is held by nothing but that writer, the ask throws, the job fails
 * by its kind's policy, and whoever its kind tells hears of it. Every other refusal is the fact it was: the work is
 * already on the ledger. That includes the same work asked again from inside it (a copy's return asks for "its return"
 * and is that return) and a key kept past its job's end (a lead's collect, once per run and minute by design).
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { scheduleJobOnce } from "@chanlytics/jobs";
import { fakeDb } from "../../_fake-db.mjs";
import { claimDue, ledgerWorld, throughDispatch } from "./_kill-at.mjs";

const T = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const ITEM = "item-1";
const past = () => new Date(Date.now() - 1000);

/**
 * A take of a watched folder's item (source_take, keyed by its workspace, its item and its try), whose handler asks for
 * `next` from inside its own run, as an edge handler does (`scheduleJobOnce` over the job's database).
 */
function aJobThatAsksAgain(next) {
  const tables = { jobs: [] };
  const outcomes = [];
  const world = ledgerWorld(fakeDb(tables, {}, { claim_due_jobs: (args) => claimDue(tables.jobs, args) }), {
    dispatch: throughDispatch((db, job) => ({
      takes: {
        take: async () => {
          for (const ask of next(job))
            outcomes.push(await scheduleJobOnce(db, { tenantId: T, dueAt: new Date(Date.now() + 60_000), ...ask }));
          return {};
        },
      },
    })),
  });
  return Object.assign(world, { tables, outcomes });
}
const take = (attempt, more = {}) => ({ kind: "source_take", payload: { item_id: ITEM, try: attempt, ...more } });
/** The same item and try, one more wait: other work, under a key that does not count waits. */
const again = (job) => take(String(job.payload.try), { wait: String(Number(job.payload.wait ?? 0) + 1) });

test("a next ask under the key of the job that writes it is refused out loud: the job does not end as if it had asked", async () => {
  const world = aJobThatAsksAgain((job) => [again(job)]);
  await world.put({ tenantId: T, dueAt: past(), ...take("1") });
  const run = await world.run();
  assert.deepEqual(world.outcomes, [], "the ask did not come back as already on the ledger");
  const [job] = await world.jobs();
  assert.equal(job.state, "scheduled", "the run threw, and its kind is tried again");
  assert.match(job.last_error, /source_take.*the key of the job that wrote it/);
  assert.match(
    job.last_error,
    new RegExp(`source_take:${T}:${ITEM}:1`),
    "the key is named, for whoever mends the kind",
  );
  assert.ok(run.lines.some((l) => l.event === "job_deferred"));
  assert.equal(world.tables.jobs.length, 1, "and nothing else was written");
});

test("its last try fails the job, and whoever the kind tells hears of it: never a job that ended quietly with nothing after it", async () => {
  const world = aJobThatAsksAgain((job) => [again(job)]);
  await world.put({ tenantId: T, dueAt: past(), ...take("1") });
  await world.run();
  await world.untilQuiet();
  const [job] = await world.jobs();
  assert.deepEqual([job.state, job.attempts], ["failed", 3]);
  assert.ok(world.history.some((r) => r.lines.some((l) => l.event === "job_failed")));
});

test("a next ask that counts its asks has a key of its own: written, and the job ends done", async () => {
  const world = aJobThatAsksAgain((job) => [take(String(Number(job.payload.try) + 1))]);
  await world.put({ tenantId: T, dueAt: past(), ...take("1") });
  await world.run();
  assert.deepEqual(world.outcomes, ["scheduled"]);
  const jobs = await world.jobs();
  assert.deepEqual(
    jobs.map((j) => [j.payload.try, j.state]),
    [
      ["1", "done"],
      ["2", "scheduled"],
    ],
  );
});

test("the same next ask written twice is the fact it always was: already on the ledger, held by the ask, not by its writer", async () => {
  const world = aJobThatAsksAgain(() => [take("2"), take("2")]);
  await world.put({ tenantId: T, dueAt: past(), ...take("1") });
  await world.run();
  assert.deepEqual(world.outcomes, ["scheduled", "already_scheduled"]);
  assert.equal((await world.jobs()).find((j) => j.payload.try === "1").state, "done");
});

test("another job's key that refuses an ask is that job's: a second writer of work already running is told so, quietly", async () => {
  // Two takes of two items; the first asks for the second's work while the second is on the ledger.
  const world = aJobThatAsksAgain((job) =>
    job.payload.item_id === ITEM ? [{ kind: "source_take", payload: { item_id: "item-2", try: "1" } }] : [],
  );
  await world.put({
    tenantId: T,
    dueAt: new Date(Date.now() + 3_600_000),
    kind: "source_take",
    payload: { item_id: "item-2", try: "1" },
  });
  await world.put({ tenantId: T, dueAt: past(), ...take("1") });
  await world.run();
  assert.deepEqual(world.outcomes, ["already_scheduled"]);
});

test("the same work asked again from inside it joins the run that is doing it, quietly: every asker of a copy's return joins the one in flight", async () => {
  const world = aJobThatAsksAgain((job) => [{ kind: job.kind, payload: { ...job.payload } }]);
  await world.put({ tenantId: T, dueAt: past(), ...take("1") });
  const run = await world.run();
  assert.deepEqual(world.outcomes, ["already_scheduled"]);
  assert.equal(run.steps.at(-1), "complete");
  assert.equal((await world.jobs())[0].state, "done");
});

test("a key kept past its job's end refuses a second ask by design, its own writer's too: a lead's collect is once per run and minute", async () => {
  const tables = { jobs: [] };
  const outcomes = [];
  const collect = (more = {}) => ({ kind: "lead_collect", payload: { run_id: "run-1", seq: "p29400000", ...more } });
  const world = ledgerWorld(fakeDb(tables, {}, { claim_due_jobs: (args) => claimDue(tables.jobs, args) }), {
    dispatch: throughDispatch((db) => ({
      leads: {
        collect: async () => {
          outcomes.push(
            await scheduleJobOnce(db, { tenantId: T, dueAt: new Date(Date.now() + 15_000), ...collect({ poll: "2" }) }),
          );
        },
      },
    })),
  });
  await world.put({ tenantId: T, dueAt: past(), ...collect() });
  assert.equal(tables.jobs[0].dedupe_kept, true);
  await world.run();
  assert.deepEqual(outcomes, ["already_scheduled"], "refused, and quietly: the leads clock takes the run up");
  assert.equal((await world.jobs())[0].state, "done");
});

test("outside a job (a door, a clock) a refused ask is already on the ledger, as before", async () => {
  const tables = { jobs: [] };
  const db = fakeDb(tables);
  const job = { tenantId: T, dueAt: past(), ...take("1") };
  assert.equal(await scheduleJobOnce(db, job), "scheduled");
  tables.jobs[0].state = "fired";
  assert.equal(await scheduleJobOnce(db, job), "already_scheduled");
});
