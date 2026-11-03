/**
 * The ledger under chaos (decision 0089, T7), on this machine's Postgres: the real tick (packages/jobs runTick) over the
 * real claim, exits and retries, with handlers that at random finish, throw, or die (the run never reports back, so its
 * lease runs out and the ledger takes the row back). Whatever the draw, the invariants hold:
 *
 *   - a job that speaks to a person reaches its wire at most once;
 *   - every job ends done or failed, and none is left scheduled or fired;
 *   - no job is claimed more often than the cap allows;
 *   - every job that ended failed was settled once, and no job that ended done was settled at all.
 *
 * The clock is the database's own; a retry's wait and a dead run's lease are brought forward between ticks, so the run
 * takes seconds. Rows are a workspace's of its own, under the ledger's lock (_file-lock.mjs), removed after.
 */
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { createClient } from "@supabase/supabase-js";
import { takeLock } from "../_file-lock.mjs";
import { runTick } from "../../../../packages/jobs/src/tick.ts";
import {
  claimNext,
  completeJob,
  deferJob,
  failJob,
  LEASE_SECONDS,
  MAX_ATTEMPTS,
  SPEAKS_TO_A_PERSON,
} from "../../../../packages/jobs/src/ledger.ts";

const URL_ = process.env.SUPABASE_URL;
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const skip =
  !URL_ || !KEY
    ? "no database in env"
    : !/^http:\/\/(127\.0\.0\.1|localhost):\d+\/?$/.test(URL_)
      ? "refusing a database that is not on this machine: this suite claims due jobs"
      : false;

let releaseLedger;
before(async () => {
  if (skip) return;
  releaseLedger = await takeLock("jobs-ledger");
});
after(async () => {
  await releaseLedger?.();
});

/** A seeded draw, so a red run can be run again as it was. */
function drawFrom(seed) {
  let s = seed >>> 0 || 1;
  return () => {
    s ^= s << 13;
    s ^= s >>> 17;
    s ^= s << 5;
    return (s >>> 0) / 4294967296;
  };
}

/** A run that dies: the tick hears nothing, so its row stays fired until its lease runs out. */
class Died extends Error {}

test(
  "whatever finishes, throws or dies, a send reaches its wire at most once and every job ends, settled once if it failed",
  { skip },
  async () => {
    const seed = Number(process.env.CHAOS_SEED ?? Date.now() % 100_000);
    const draw = drawFrom(seed);
    const db = createClient(URL_, KEY, { auth: { persistSession: false } });
    const { data: ws, error } = await db
      .from("tenants")
      .insert({ slug: `chaos-${Date.now()}-${seed}`, name: "chaos" })
      .select("id")
      .single();
    assert.equal(error, null, error?.message);
    const T = ws.id;
    try {
      const KINDS = ["outbound_send", "broadcast_send", "push_receipts", "lead_check", "line_provision"];
      const N = 150;
      const made = await db
        .from("jobs")
        .insert(
          Array.from({ length: N }, (_, i) => {
            const kind = KINDS[i % KINDS.length];
            const ids =
              kind === "outbound_send"
                ? { message_id: `m-${i}`, conversation_id: `c-${i}` }
                : kind === "broadcast_send"
                  ? { broadcast_id: `b-${i}` }
                  : {};
            return { tenant_id: T, kind, due_at: new Date(Date.now() - 1000).toISOString(), payload: { n: i, ...ids } };
          }),
        )
        .select("id, kind");
      assert.equal(made.error, null, made.error?.message);
      const mine = new Map(made.data.map((r) => [r.id, r.kind]));
      const wire = new Map();
      const settled = new Map();

      /** The next due job of this workspace; another's met on the way is put out of reach for the run. */
      const claim = async (lease) => {
        for (;;) {
          const row = await claimNext(db, lease);
          if (!row || mine.has(row.id)) return row;
          await db
            .from("jobs")
            .update({ lease_until: new Date(Date.now() + 3_600_000).toISOString() })
            .eq("id", row.id);
        }
      };
      const ports = {
        claim,
        dispatch: async (job) => {
          const roll = draw();
          if (SPEAKS_TO_A_PERSON.has(job.kind)) wire.set(job.id, (wire.get(job.id) ?? 0) + 1);
          if (roll < 0.15) throw new Died("killed at the ceiling");
          if (roll < 0.4) throw new Error("the provider's bad minute");
          return "done";
        },
        complete: (job) => completeJob(db, job),
        fail: (job, reason) => (reason === "killed at the ceiling" ? Promise.resolve(false) : failJob(db, job, reason)),
        defer: (job, untilIso, reason) =>
          reason === "killed at the ceiling" ? Promise.resolve(false) : deferJob(db, job, untilIso, reason),
        deferUnknown: (job, untilIso, reason) => deferJob(db, job, untilIso, reason, true),
        settle: async (job) => {
          settled.set(job.id, (settled.get(job.id) ?? 0) + 1);
          return [];
        },
        alert: async () => {},
        page: async () => {},
        log: { info() {}, warn() {}, error() {} },
        now: Date.now,
        random: draw,
      };

      for (let tick = 0; tick < 200; tick += 1) {
        const counts = await runTick(ports, {
          claimForMs: 20_000,
          yieldAtMs: 45_000,
          leaseSeconds: LEASE_SECONDS,
          slots: 3,
        });
        // The clock brought forward: a retry's wait is over, and a dead run's lease has run out.
        const past = new Date(Date.now() - 1000).toISOString();
        await db.from("jobs").update({ due_at: past }).eq("tenant_id", T).eq("state", "scheduled");
        await db.from("jobs").update({ lease_until: past }).eq("tenant_id", T).eq("state", "fired");
        const { count } = await db
          .from("jobs")
          .select("id", { count: "exact", head: true })
          .eq("tenant_id", T)
          .in("state", ["scheduled", "fired"]);
        if (counts.claimed === 0 && count === 0) break;
      }

      const { data: end } = await db.from("jobs").select("id, kind, state, attempts").eq("tenant_id", T);
      const say = `seed ${seed} (CHAOS_SEED to run it again)`;
      assert.equal(end.length, N, say);
      for (const j of end) {
        assert.ok(["done", "failed"].includes(j.state), `${j.kind} ${j.id} ended ${j.state}: ${say}`);
        assert.ok(j.attempts <= MAX_ATTEMPTS + 1, `${j.kind} ${j.id} claimed ${j.attempts} times: ${say}`);
        if (SPEAKS_TO_A_PERSON.has(j.kind))
          assert.ok((wire.get(j.id) ?? 0) <= 1, `${j.kind} ${j.id} reached its wire ${wire.get(j.id)} times: ${say}`);
        assert.equal(settled.get(j.id) ?? 0, j.state === "failed" ? 1 : 0, `${j.kind} ${j.id} settled: ${say}`);
      }
    } finally {
      await db.from("jobs").delete().eq("tenant_id", T);
      await db.from("tenants").delete().eq("id", T);
    }
  },
);
