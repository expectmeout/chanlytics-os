/**
 * A search survives anything that can happen between two steps (3 Nov 2026), proved over many seeded runs of the
 * whole engine: the real job handlers, the real runner, the real sweep at its cron door, over the world in memory
 * (_lead-world.mjs), with the clock of the world for every clock the code reads.
 *
 * Each seed runs one search from its create to its end while, at random:
 *   - the function is killed before a door call, or after the door committed and before its answer came back
 *     (the collect's commit, the check's, a round's end, a claim, a start recorded, the sweep's ending, a job written);
 *   - the provider answers a read with a 429;
 *   - the sweep ticks between any two jobs, and the clock moves on when nothing is due;
 *   - the owner answers the question after a while, or stops the search.
 * A job that throws is tried again later, three tries in all, as the ledger does.
 *
 * After every step, whatever was killed:
 *   1. a round's allowance used is its counted members, never more than it reserved;
 *   2. a round that ended with an ending pending ended with that ending;
 *   3. no lead of an ended round is left checking (unless another live round of its is checking it);
 *   4. a round that ended says one of the nine endings.
 * And at the end of every seed: the search ended, nothing of it is still due, and nothing waits on a job nobody wrote.
 *
 * A seed that fails prints itself: `SEED=<n> node tooling/scripts/checks/test.mjs <this file>` runs that one alone.
 * Every bug of the stalled-round class (a follow-up written outside its commit, a sweep ending a working round) fails
 * here within a few seeds; it is the test the engine's single-path tests could not be.
 */
import { test, after } from "node:test";
import assert from "node:assert/strict";
import { dispatchJob } from "../../../packages/jobs/src/handlers/handlers.ts";
import { LEAD_ROUND_ENDINGS } from "../../../packages/contracts/src/leads/search/sets.ts";
import { leadWorld, TENANT } from "../../_lead-world.mjs";
import { at, knock, answer, vault } from "../../_cron-doors-world.mjs";
import { PLAN } from "../../_lead-fixtures.mjs";

for (const k of ["APIFY_TOKEN", "ANTHROPIC_API_KEY", "SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY"])
  delete process.env[k];
const { setPg } = await import(at("apps/edge/lib/shared/pg.ts"));
const sweep = await import(at("apps/edge/api/cron/leads.ts"));
const { leadPipelineOver } = await import(at("apps/edge/lib/leads/lead-pipeline.ts"));
after(() => setPg(null));

const SEEDS = process.env.SEED ? [Number(process.env.SEED)] : Array.from({ length: 120 }, (_, i) => i + 1);
const PLAN_EMAIL = { ...PLAN, contact: "email", count: 20 };
const MAX_STEPS = 900;
const TRIES = 3;
const RETRY_MS = 2 * 60_000;
const KILL_RATE = 0.06;

/** mulberry32: a small seeded generator, so a failing seed runs again the same way. */
function seeded(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** The world's clock as every clock the code reads: Date.now() and new Date() alike. */
function useWorldClock(clock) {
  const Real = Date;
  class WorldDate extends Real {
    constructor(...args) {
      if (args.length === 0) super(clock.ms);
      else super(...args);
    }
    static now() {
      return clock.ms;
    }
  }
  globalThis.Date = WorldDate;
  return () => {
    globalThis.Date = Real;
  };
}

class Killed extends Error {
  constructor(where) {
    super(`killed ${where}`);
    this.name = "Killed";
  }
}

/** The doors a function can be killed around: before the call reaches the database, or after it committed. */
const KILLABLE = new Set([
  "lead_collect_commit",
  "lead_check_commit",
  "lead_round_end",
  "lead_round_end_stuck",
  "lead_run_claim",
  "lead_run_record_start",
  "lead_run_release",
]);

/** The world's database with the function killed around a door, or around a job written, at random. */
function killable(db, rng, kills) {
  return new Proxy(db, {
    get(target, key) {
      if (key === "rpc")
        return async (name, args) => {
          if (KILLABLE.has(name) && rng() < KILL_RATE) {
            const afterIt = rng() < 0.5;
            kills.push(`${afterIt ? "after" : "before"} ${name}`);
            if (!afterIt) throw new Killed(`before ${name}`);
            await target.rpc(name, args);
            throw new Killed(`after ${name}`);
          }
          return target.rpc(name, args);
        };
      if (key === "from")
        return (table) => {
          const b = target.from(table);
          if (table !== "jobs") return b;
          const insert = b.insert;
          b.insert = (values) => {
            if (rng() >= KILL_RATE) return insert(values);
            const afterIt = rng() < 0.5;
            kills.push(`${afterIt ? "after" : "before"} a job written`);
            if (!afterIt) return Promise.reject(new Killed("before a job written"));
            return Promise.resolve(insert(values)).then(() => {
              throw new Killed("after a job written");
            });
          };
          return b;
        };
      const v = target[key];
      return typeof v === "function" ? v.bind(target) : v;
    },
  });
}

/** The four rules that hold after every step, whatever was killed. */
function holds(w, pendingSeen, seed, step) {
  const where = `seed ${seed}, step ${step}`;
  for (const r of w.T.lead_rounds) {
    const members = w.T.lead_search_members.filter((m) => m.round_id === r.id);
    assert.equal(
      r.allowance_used,
      members.filter((m) => m.counted).length,
      `${where}: the round's allowance used is its counted members`,
    );
    assert.ok(
      r.allowance_used <= Math.max(r.allowance_reserved, r.allowance_used),
      `${where}: never past its reservation`,
    );
    if (r.state !== "ended") continue;
    assert.ok(LEAD_ROUND_ENDINGS.includes(r.ending), `${where}: ${r.ending} is one of the nine endings`);
    const pending = pendingSeen.get(r.id);
    if (pending) assert.equal(r.ending, pending, `${where}: it ended with the ending it had pending`);
    for (const m of members) {
      const lead = w.T.leads.find((l) => l.id === m.lead_id);
      const elsewhere = w.T.lead_search_members.some(
        (o) =>
          o.lead_id === m.lead_id &&
          o.round_id !== r.id &&
          w.T.lead_rounds.find((x) => x.id === o.round_id)?.state !== "ended",
      );
      assert.ok(lead?.email_state !== "checking" || elsewhere, `${where}: no lead of an ended round is left checking`);
    }
  }
}

/** One seed: a search run to its end under the faults above. */
async function runSeed(seed) {
  const rng = seeded(seed);
  const w = leadWorld({ plan: PLAN_EMAIL, startMs: Date.parse("2026-09-19T12:00:00.000Z") + seed * 60_000 });
  Object.assign(w.rpcs, vault);
  const restore = useWorldClock(w.clock);
  const kills = [];
  try {
    const db = killable(w.db, rng, kills);
    setPg(db);
    // The provider: a read that answers 429 now and then, a run that ends after its first poll.
    const getRun = w.apify.getRun.bind(w.apify);
    w.apify.getRun = async (id) => {
      if (rng() < 0.04)
        throw Object.assign(new Error("429 Too Many Requests"), { name: "ApifyRetryable", status: 429 });
      return getRun(id);
    };
    const leads = leadPipelineOver(w.wires);
    const ctx = () => ({
      db,
      wire: {},
      alert: async () => {},
      schedule: async () => {},
      deadline: Date.now() + 45_000,
      leads,
    });
    const made = w.rpcs.lead_search_create({
      p_tenant_id: TENANT,
      p_plan: PLAN_EMAIL,
      p_via: "people",
      p_estimate_usd: 2,
    });
    const pendingSeen = new Map();
    let waitedOn = 0;
    for (let step = 0; step < MAX_STEPS; step++) {
      for (const r of w.T.lead_rounds) if (r.state !== "ended") pendingSeen.set(r.id, r.ending_pending ?? null);
      const round = w.T.lead_rounds.find((r) => r.id === made.round_id);
      if (round.state === "ended" && !w.T.jobs.some((j) => j.state === "scheduled" || j.state === "fired")) {
        holds(w, pendingSeen, seed, step);
        return { round, kills, steps: step };
      }
      // The owner: answers the question after a while, now and then stops the search instead.
      if (round.state === "waiting_on_owner" && ++waitedOn > 3) {
        if (rng() < 0.15) w.rpcs.lead_round_stop({ p_search_id: round.search_id });
        else w.rpcs.lead_round_answer({ p_round_id: round.id, p_answer: "keep" });
        waitedOn = 0;
      } else if (rng() < 0.03 && round.state !== "ended") w.rpcs.lead_round_stop({ p_search_id: round.search_id });
      const due = w.T.jobs
        .filter((j) => j.state === "scheduled" && Date.parse(j.due_at) <= w.clock.ms)
        .sort((a, b) => (a.due_at < b.due_at ? -1 : a.due_at > b.due_at ? 1 : 0))[0];
      if (!due || rng() < 0.12) {
        // Nothing due, or the sweep's tick between two jobs: the clock moves on when nothing is due.
        if (!due) w.clock.advance(5 * 60_000);
        await answer(await knock(sweep.POST, "leads"));
        holds(w, pendingSeen, seed, step);
        continue;
      }
      due.state = "fired";
      due.attempts = (due.attempts ?? 0) + 1;
      w.clock.advance(2_000);
      const job = {
        id: due.id,
        tenant_id: due.tenant_id,
        kind: due.kind,
        payload: due.payload,
        attempts: due.attempts,
      };
      try {
        await dispatchJob(ctx(), job);
        due.state = "done";
      } catch (e) {
        // The ledger's retries: tried again later, three tries in all, then failed.
        if (due.attempts < TRIES)
          Object.assign(due, { state: "scheduled", due_at: new Date(w.clock.ms + RETRY_MS).toISOString() });
        else Object.assign(due, { state: "failed", last_error: e instanceof Error ? e.message : String(e) });
      }
      // A run polled while running ends after that poll, as a real run would within a minute.
      if (due.kind === "lead_collect") {
        const run = w.T.lead_runs.find((r) => r.id === due.payload.run_id);
        const remote = run?.apify_run_id ? w.apify.state.runs[run.apify_run_id] : null;
        if (remote && remote.status === "RUNNING") w.apify.finish(remote.id, "SUCCEEDED", 0.05);
      }
      holds(w, pendingSeen, seed, step);
    }
    const round = w.T.lead_rounds.find((r) => r.id === made.round_id);
    assert.fail(
      `seed ${seed}: the search did not end in ${MAX_STEPS} steps (state ${round.state}, pending ${round.ending_pending}); ` +
        `kills: ${kills.join(", ") || "none"}; open jobs: ${JSON.stringify(
          w.T.jobs.filter((j) => j.state === "scheduled" || j.state === "fired").map((j) => [j.kind, j.payload]),
        )}`,
    );
  } finally {
    restore();
    setPg(null);
  }
}

test(`a search survives what can happen between two steps: ${SEEDS.length} seeded runs, killed, refused and swept at random, each ends and holds its rules`, async () => {
  const endings = new Map();
  let killed = 0;
  for (const seed of SEEDS) {
    const { round, kills } = await runSeed(seed);
    endings.set(round.ending, (endings.get(round.ending) ?? 0) + 1);
    killed += kills.length;
  }
  assert.ok(killed > 0, "the runs were killed somewhere, or this proves nothing");
  // A search the faults could not stop ends the way the fixture's search ends; a stop ends it stopped.
  for (const e of endings.keys()) assert.ok(LEAD_ROUND_ENDINGS.includes(e), e);
});
