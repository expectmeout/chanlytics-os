/**
 * A job killed at a named step, and run again (the plan "Prove it works", lane 7; the reviews' R1.23, R2.14, R3.25).
 *
 * What a test of "exactly once" has to do is stop the work in the middle, as a function killed at its ceiling or a
 * deploy stops it, and then let the ledger carry on: the lease runs out, the row is claimed again, and whatever the
 * second run does is what a customer gets. This is that, over the real tick (packages/jobs runTick), the real claim and
 * exits, and whichever handler the test binds, on the database in memory or on a real one.
 *
 * A STEP is something a run does that the world can see after the process is gone: a write (`posts.update`,
 * `jobs.insert`), a function called (`rpc:post_unanswered`), a file written (`storage:upload`), a call that left for a
 * provider (`out:<name>`, where the test wraps it with `outside`), and the ledger's own moves, named for what they are
 * (`claim`, `complete`, `keep`, `fail`, `defer`, `alert`, `page`). A read is not a step: dying before or after one
 * leaves the same world.
 *
 * KILLED AFTER a step means the step landed and the process never saw its answer: the write is in the database, the
 * provider took the request, and nothing after it happens. Every later write, call and read of that run throws
 * `Killed` and changes nothing, whoever catches it, and the run reports nothing back: no complete, no fail, no settle.
 *
 *   const world = ledgerWorld(db, { dispatch: (db, world) => async (job, deadline) => ... });
 *   await world.put({ tenantId, kind, dueAt, payload });       // written as the ledger writes it, with its key
 *   const first = await world.run({ killAfter: "out:graph" }); // { died: true, killedAfter, steps, ... }
 *   const rest = await world.untilQuiet();                     // the lease run out, claimed again, until nothing is due
 *   await world.jobs();                                         // where each row ended
 *
 * `atEveryStep(make, check)` does it at every step a clean run takes, each in a world of its own: the test says what
 * must hold whichever step the run died after.
 *
 * Not named *.test.mjs on purpose: the runner globs that pattern.
 */
import {
  claimNext,
  completeJob,
  deferJob,
  dispatchJob,
  failJob,
  keepJob,
  LEASE_SECONDS,
  runTick,
  scheduleJob,
  scheduleJobOnce,
  settleJob,
} from "@chanlytics/jobs";
import { resetBreakers } from "@chanlytics/channels/shared";

/** What a killed run throws from everything it touches after the step it died on. */
export class Killed extends Error {
  constructor(after) {
    super(`killed after ${after}`);
    this.name = "Killed";
    this.after = after;
  }
}

const TABLE_WRITES = new Set(["insert", "update", "upsert", "delete"]);
const FILE_WRITES = new Set(["upload", "update", "remove", "move", "copy", "uploadToSignedUrl"]);
const FILE_READS = new Set(["download", "createSignedUrl", "createSignedUrls", "list", "exists", "info"]);
const isThenable = (v) => v !== null && typeof v === "object" && typeof v.then === "function";
const iso = (ms) => new Date(ms).toISOString();

/**
 * claim_due_jobs as the database runs it (00098, 00526), for a ledger in memory: what is due, or fired with its lease
 * run out, lowest lane first and then earliest due, each fired with a fresh lease and one more attempt.
 */
export function claimDue(jobs, { p_limit, p_lease_seconds }) {
  const now = Date.now();
  const due = jobs
    .filter(
      (j) =>
        ((j.state ?? "scheduled") === "scheduled" && Date.parse(j.due_at) <= now) ||
        (j.state === "fired" && j.lease_until != null && Date.parse(j.lease_until) < now),
    )
    .sort((a, b) => (a.lane ?? 9) - (b.lane ?? 9) || Date.parse(a.due_at) - Date.parse(b.due_at))
    .slice(0, p_limit);
  for (const j of due)
    Object.assign(j, {
      state: "fired",
      fired_at: iso(now),
      attempts: (j.attempts ?? 0) + 1,
      lease_until: iso(now + p_lease_seconds * 1000),
    });
  return due.map((j) => ({ ...j }));
}

/**
 * The steps of the runs made over one client: the client wrapped so each write is a step and a kill stops everything
 * after it. `db` is what the code under test is handed; `raw` is the test's own way in, which no kill touches.
 */
function stepsOver(raw) {
  const state = { dead: false, killedAfter: null, steps: [], kill: null, name: null };

  /** Whether the step that just landed is the one this run dies after. */
  const dieHere = (step) => {
    const k = state.kill;
    if (k === null || k === undefined) return false;
    if (typeof k === "number") return state.steps.length === k;
    if (typeof k === "function") return k(step, state.steps.length, state.steps);
    const [name, nth] = typeof k === "string" ? [k, 1] : [k.step, k.nth ?? 1];
    return step === name && state.steps.filter((s) => s === name).length === nth;
  };
  const gone = () => new Killed(state.killedAfter);
  /** A step that landed, under the ledger's own name for it when the tick is making one of its moves. */
  const landed = (step) => {
    const named = state.name ?? step;
    state.name = null;
    state.steps.push(named);
    if (!dieHere(named)) return;
    state.dead = true;
    state.killedAfter = named;
    throw gone();
  };
  /** One statement or call run to its end: refused when the run is dead, counted when it is a step. */
  const ran = async (start, step) => {
    if (state.dead) throw gone();
    const answer = await start();
    // Died while this was in flight (another slot's kill): it landed, and nobody read the answer.
    if (state.dead) throw gone();
    if (step) landed(step);
    return answer;
  };

  /** A request being built: every method chains as it did, and its await is where it runs. */
  const building = (target, meta) =>
    new Proxy(target, {
      get(t, prop) {
        if (prop === "then")
          return (resolve, reject) =>
            ran(() => t, meta.write ? `${meta.what}.${meta.write}` : meta.step).then(resolve, reject);
        const value = Reflect.get(t, prop, t);
        if (typeof value !== "function") return value;
        return (...args) => {
          if (state.dead) throw gone();
          if (meta.what && TABLE_WRITES.has(prop)) meta.write = String(prop);
          const out = value.apply(t, args);
          return isThenable(out) ? building(out, meta) : out;
        };
      },
    });

  /** A bucket of the files store: a write there is a step, a signed address or a read is not. */
  const bucket = (target) =>
    new Proxy(target, {
      get(t, prop) {
        const value = Reflect.get(t, prop, t);
        if (typeof value !== "function") return value;
        if (FILE_WRITES.has(prop)) return (...args) => ran(async () => value.apply(t, args), `storage:${String(prop)}`);
        if (FILE_READS.has(prop)) return (...args) => ran(async () => value.apply(t, args), null);
        return value.bind(t);
      },
    });

  const db = new Proxy(raw, {
    get(t, prop) {
      if (prop === "from") return (table) => building(t.from(table), { what: table, write: null, step: null });
      if (prop === "rpc")
        return (fn, ...rest) => building(t.rpc(fn, ...rest), { what: null, write: null, step: `rpc:${fn}` });
      if (prop === "storage") {
        const storage = Reflect.get(t, prop, t);
        if (!storage) return storage;
        return new Proxy(storage, {
          get(s, p) {
            const value = Reflect.get(s, p, s);
            if (p !== "from" || typeof value !== "function") return value;
            return (...args) => bucket(value.apply(s, args));
          },
        });
      }
      const value = Reflect.get(t, prop, t);
      return typeof value === "function" ? value.bind(t) : value;
    },
  });

  return {
    db,
    state,
    landed,
    /** Throws where the run is dead: asked before a move that goes round the wrapped client. */
    alive: () => {
      if (state.dead) throw gone();
    },
    /** A call that leaves for a provider, as a step named `out:<name>`: the provider took it, then the run may die. */
    outside:
      (name, call) =>
      (...args) =>
        ran(async () => call(...args), `out:${name}`),
    /** One of the ledger's own moves, said by its name instead of the write that makes it. */
    as: async (name, move) => {
      state.name = name;
      try {
        return await move();
      } finally {
        state.name = null;
      }
    },
    /** Something the tick does that is no write of the database's (an owner told, the platform paged). */
    did: (name, act) => ran(async () => act(), name),
  };
}

/**
 * A ledger a test runs: jobs put on it, a tick run over it that may be killed at a step, the clock brought forward,
 * and what happened read back.
 *
 * @param raw a Supabase client: the database in memory (tests/_fake-db.mjs, with `claim_due_jobs: (a) =>
 *   claimDue(tables.jobs, a)` among its functions), or a real one on this machine.
 * @param opts.dispatch `(db, world) => (job, deadline) => outcome`: how a claimed job is run, over the wrapped client.
 *   `throughDispatch(contextOf)` is the real dispatchJob with the context a handler needs.
 * @param opts.tenantId on a real database: the workspace whose jobs this world runs; another's met at the claim is put
 *   out of reach for the run and never run here (the ledger is one queue).
 * @param opts.slots how many jobs a tick runs side by side; one, so a run's steps are in the order they happened.
 */
export function ledgerWorld(raw, opts) {
  const steps = stepsOver(raw);
  const { db, state } = steps;
  const history = [];
  // A world meets its providers afresh, and so does the run after a death: a breaker lives in the process, and a new
  // process has none open. A kill inside a provider call reads to the door as that provider failing.
  resetBreakers();
  const world = {
    /** The wrapped client: what the handler, the settle and the tick's own moves write through. */
    db,
    raw,
    outside: steps.outside,
    history,
    /** Each owner told, and each page made, by any run so far. */
    told: [],
    paged: [],
    /** A job written as the ledger writes it: its lane and its once-only key are the database's (jobs_take_their_kind). */
    put: (job) => scheduleJobOnce(raw, job),
    /** The same with no once-only answer: a kind the ledger holds as often as it is asked. */
    putAgain: (job) => scheduleJob(raw, job),
    /** Every job of the world, as its row reads now. */
    async jobs() {
      let q = raw
        .from("jobs")
        .select("id, tenant_id, kind, state, attempts, payload, dedupe_key, spoke_at, last_error, due_at");
      if (opts.tenantId) q = q.eq("tenant_id", opts.tenantId);
      const { data, error } = await q;
      if (error) throw new Error(`ledgerWorld: the jobs could not be read: ${error.message}`);
      // The database in memory keeps no default: a row never claimed is scheduled, as the real one writes it.
      return data.map((row) => ({ ...row, state: row.state ?? "scheduled", attempts: row.attempts ?? 0 }));
    },
    /** The clock brought forward: a dead run's lease has run out, and a retry's wait is over. */
    async forward() {
      const past = iso(Date.now() - 1000);
      const mine = (q) => (opts.tenantId ? q.eq("tenant_id", opts.tenantId) : q);
      const leases = await mine(raw.from("jobs").update({ lease_until: past }).eq("state", "fired"));
      const waits = await mine(raw.from("jobs").update({ due_at: past }).eq("state", "scheduled"));
      const error = leases.error ?? waits.error;
      if (error) throw new Error(`ledgerWorld: the clock could not be brought forward: ${error.message}`);
    },
    /**
     * One heartbeat. `killAfter` names the step this run dies after: its name (the first of that name, or
     * `{ step, nth }`), its number in the run from 1, or `(step, n, steps) => boolean`.
     */
    async run({ killAfter = null } = {}) {
      if (history.at(-1)?.died) resetBreakers();
      Object.assign(state, { dead: false, killedAfter: null, steps: [], kill: killAfter, name: null });
      const lines = [];
      const say = (level) => (event, fields) => {
        // A dead process writes no log line either.
        if (!state.dead) lines.push({ level, event, ...fields });
      };
      const settled = [];
      const dispatch = opts.dispatch(db, world);
      const ports = {
        claim: async (lease) => {
          for (;;) {
            steps.alive();
            // Asked of the database itself: a claim that finds nothing due moved nothing, and is no step.
            const row = await claimNext(raw, lease);
            if (!row) return null;
            if (!opts.tenantId || row.tenant_id === opts.tenantId) {
              // Claimed: the row is fired, whether or not this run lives to start it.
              steps.landed("claim");
              return row;
            }
            // Another suite's row: out of reach for this run, as the chaos suite puts it, and never a step of ours.
            await raw
              .from("jobs")
              .update({ lease_until: iso(Date.now() + 3_600_000) })
              .eq("id", row.id);
          }
        },
        dispatch,
        complete: (job) => steps.as("complete", () => completeJob(db, job)),
        fail: (job, reason) => steps.as("fail", () => failJob(db, job, reason)),
        keep: (job) => steps.as("keep", () => keepJob(db, job)),
        defer: (job, untilIso, reason) => steps.as("defer", () => deferJob(db, job, untilIso, reason)),
        deferUnknown: (job, untilIso, reason) => steps.as("defer", () => deferJob(db, job, untilIso, reason, true)),
        settle: async (job, certain, why) => {
          const out = await (opts.settle ?? settleJob)(db, job, certain, why);
          if (!state.dead) settled.push(...out);
          return out;
        },
        alert: (job, news) => steps.did("alert", () => world.told.push({ job: job.id, kind: job.kind, ...news })),
        page: (key, subject, body, tenantId) =>
          steps.did("page", () => world.paged.push({ key, subject, body, tenantId: tenantId ?? null })),
        log: { info: say("info"), warn: say("warn"), error: say("error") },
        now: Date.now,
        random: () => 0,
      };
      let counts = null;
      try {
        counts = await runTick(ports, {
          claimForMs: 20_000,
          yieldAtMs: 45_000,
          leaseSeconds: LEASE_SECONDS,
          slots: opts.slots ?? 1,
        });
      } catch (e) {
        // The claim of a dead run throws out of the tick: that is the process ending, and anything else is a fault.
        if (!(e instanceof Killed)) throw e;
      }
      const run = {
        died: state.dead,
        killedAfter: state.killedAfter,
        steps: [...state.steps],
        counts: state.dead ? null : counts,
        lines,
        settled,
      };
      // What a dead run still held in memory is gone with it.
      Object.assign(state, { dead: false, kill: null, name: null });
      history.push(run);
      return run;
    },
    /** The clock forward and a heartbeat, again, until one claims nothing: each run, in order. */
    async untilQuiet({ max = 12 } = {}) {
      const runs = [];
      for (let i = 0; i < max; i += 1) {
        await world.forward();
        const run = await world.run();
        runs.push(run);
        if (!run.steps.includes("claim")) return runs;
      }
      throw new Error(`ledgerWorld: the ledger was still working after ${max} heartbeats`);
    },
  };
  return world;
}

/**
 * The real dispatch (packages/jobs dispatchJob), as the edge binds it (apps/edge/lib/ops/jobs-tick.ts): the job as its
 * handler holds it, what it says of itself carried back to the claim, and a context of the ports every handler may
 * ask for plus whatever `contextOf(db, job, world)` adds for the kind under test.
 */
export const throughDispatch =
  (contextOf = () => ({})) =>
  (db, world) =>
  async (job, deadline) => {
    const claimed = {
      id: job.id,
      tenant_id: job.tenant_id,
      kind: job.kind,
      payload: job.payload && typeof job.payload === "object" && !Array.isArray(job.payload) ? job.payload : {},
      attempts: job.attempts,
    };
    try {
      return await dispatchJob(
        {
          db,
          wire: {},
          alert: async (news) => {
            world.told.push({ job: job.id, kind: job.kind, ...news });
          },
          page: async (key, subject, body, tenantId) => {
            world.paged.push({ key, subject, body, tenantId: tenantId ?? null });
          },
          schedule: async (kind, dueAt, payload) => {
            await scheduleJob(db, { tenantId: job.tenant_id, kind, dueAt, payload });
          },
          scheduleOnce: (kind, dueAt, payload) =>
            scheduleJobOnce(db, { tenantId: job.tenant_id, kind, dueAt, payload }),
          deadline,
          ...contextOf(db, job, world),
        },
        claimed,
      );
    } finally {
      if (claimed.spoke_at) job.spoke_at = claimed.spoke_at;
    }
  };

/**
 * The same story killed after each step a clean run of it takes, each in a world of its own. `make()` builds the world
 * with its job on the ledger; `check(world, { killedAfter, n, first, rest })` says what must hold once the ledger is
 * quiet again. Answers the steps it killed after, so a test can also hold the list.
 */
export async function atEveryStep(make, check) {
  const clean = await make();
  const whole = await clean.run();
  if (whole.died) throw new Error("atEveryStep: the clean run died");
  for (let n = 1; n <= whole.steps.length; n += 1) {
    const world = await make();
    const first = await world.run({ killAfter: n });
    if (!first.died) throw new Error(`atEveryStep: the run was not killed after step ${n} (${whole.steps[n - 1]})`);
    const rest = await world.untilQuiet();
    await check(world, { killedAfter: first.killedAfter, n, first, rest });
  }
  return whole.steps;
}
