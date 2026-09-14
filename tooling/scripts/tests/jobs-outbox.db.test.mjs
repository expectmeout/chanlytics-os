/**
 * The outbox's rules live in SQL, so they are proved against Postgres: a fresh
 * one that `supabase start` builds from every migration and supabase/seed.sql,
 * never production. A due row in production is claimed by the real heartbeat
 * within ten seconds and run, so this suite refuses any database that is not on
 * this machine.
 *
 *   supabase start
 *   SUPABASE_URL=http://127.0.0.1:54321 \
 *   SUPABASE_SERVICE_ROLE_KEY="$(supabase status -o env | sed -n 's/^SERVICE_ROLE_KEY="\(.*\)"$/\1/p')" \
 *   pnpm test:db
 *
 * .github/workflows/database.yml runs exactly that on every pull request that could change the database.
 */
import { test, before, after, afterEach } from "node:test";
import assert from "node:assert/strict";
import { createClient } from "@supabase/supabase-js";

const URL_ = process.env.SUPABASE_URL;
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const skip = !URL_ || !KEY
  ? "no database in env"
  : !/^http:\/\/(127\.0\.0\.1|localhost):\d+\/?$/.test(URL_)
    ? "refusing a database that is not on this machine: this suite writes due jobs"
    : false;

let db;
let tenantId;
let phones = 0;
const ago = (s) => new Date(Date.now() - s * 1000).toISOString();
const ahead = (s) => new Date(Date.now() + s * 1000).toISOString();

before(async () => {
  if (skip) return;
  db = createClient(URL_, KEY, { auth: { persistSession: false } });
  // The row clocks write events, and events are partitioned by month.
  const month = new Date();
  month.setUTCDate(1);
  month.setUTCHours(0, 0, 0, 0);
  await db.rpc("ensure_events_partition", { p_month: month.toISOString().slice(0, 10) });
  const { data, error } = await db.from("tenants").insert({ slug: `outbox-${Date.now()}`, name: "Outbox" }).select("id").single();
  assert.equal(error, null, error?.message);
  tenantId = data.id;
});

afterEach(async () => {
  if (skip) return;
  // Every case starts from an empty ledger: a due row one case left behind
  // would be claimed by the next and make it prove something else.
  await db.from("jobs").delete().eq("tenant_id", tenantId);
});

after(async () => {
  if (skip || !tenantId) return;
  await db.from("tenants").delete().eq("id", tenantId);
});

async function insertJob(patch = {}) {
  const { data, error } = await db.from("jobs")
    .insert({ tenant_id: tenantId, kind: "blob_thread_erase", due_at: ago(60), payload: {}, ...patch })
    .select("id")
    .single();
  assert.equal(error, null, error?.message);
  return data.id;
}

const claim = (limit) => db.rpc("claim_due_jobs", { p_limit: limit, p_lease_seconds: 90 });

/** A conversation of its own contact: conversations are one per contact. */
async function thread(fields) {
  phones += 1;
  const { data: c, error: cErr } = await db.from("contacts")
    .insert({ tenant_id: tenantId, phone_e164: `+1555${String(phones).padStart(7, "0")}` })
    .select("id")
    .single();
  assert.equal(cErr, null, cErr?.message);
  const { data: v, error: vErr } = await db.from("conversations")
    .insert({ tenant_id: tenantId, contact_id: c.id, ...fields })
    .select("id")
    .single();
  assert.equal(vErr, null, vErr?.message);
  return v.id;
}

async function statesOf(ids) {
  const { data, error } = await db.from("conversations").select("id, state, snooze_until, paused_until").in("id", ids);
  assert.equal(error, null, error?.message);
  return Object.fromEntries(data.map((r) => [r.id, r]));
}

test("a claim takes what is due, leaves what is not, and holds it on a lease", { skip }, async () => {
  const due = await insertJob();
  const later = await insertJob({ due_at: ahead(3600) });
  const { data, error } = await claim(50);
  assert.equal(error, null, error?.message);
  assert.deepEqual(data.map((r) => r.id), [due]);
  assert.equal(data[0].state, "fired");
  assert.equal(data[0].attempts, 1);
  assert.ok(Date.parse(data[0].lease_until) > Date.now() + 60_000, "the lease outlives the run that holds it");
  const { data: rest } = await db.from("jobs").select("state").eq("id", later).single();
  assert.equal(rest.state, "scheduled");
});

test("two claims at once never take the same row", { skip }, async () => {
  const mine = await Promise.all([insertJob(), insertJob(), insertJob(), insertJob()]);
  const [a, b] = await Promise.all([claim(2), claim(2)]);
  assert.equal(a.error, null, a.error?.message);
  assert.equal(b.error, null, b.error?.message);
  const ids = [...a.data, ...b.data].map((r) => r.id);
  assert.equal(new Set(ids).size, ids.length, "SKIP LOCKED: no row claimed twice");
  assert.deepEqual([...ids].sort(), [...mine].sort(), "and between them they took all four");
});

test("a lease that ran out is taken back with attempts + 1; a live one is left alone", { skip }, async () => {
  const dead = await insertJob({ state: "fired", fired_at: ago(200), lease_until: ago(10), attempts: 1 });
  const alive = await insertJob({ state: "fired", fired_at: ago(5), lease_until: ahead(80), attempts: 1 });
  const { data, error } = await claim(50);
  assert.equal(error, null, error?.message);
  assert.deepEqual(data.map((r) => r.id), [dead]);
  assert.equal(data[0].attempts, 2, "verdictFor reads this: a second claim means a run started and never came back");
  assert.ok(!data.some((r) => r.id === alive));
});

test("the database refuses every transition the machine does not have", { skip }, async () => {
  const id = await insertJob();
  await claim(50);
  const done = await db.from("jobs").update({ state: "done" }).eq("id", id).eq("state", "fired").select("id");
  assert.equal(done.error, null, done.error?.message);
  assert.equal(done.data.length, 1, "fired -> done");

  const back = await db.from("jobs").update({ state: "scheduled" }).eq("id", id);
  assert.match(back.error?.message ?? "", /terminal/, "done is final, whoever asks");

  const scrub = await db.from("jobs").update({ payload: { scrubbed: true } }).eq("id", id).select("id");
  assert.equal(scrub.error, null, scrub.error?.message);
  assert.equal(scrub.data.length, 1, "but a finished row's payload can still be scrubbed, which erasure needs");

  const waiting = await insertJob({ due_at: ahead(3600) });
  const skipped = await db.from("jobs").update({ state: "done" }).eq("id", waiting);
  assert.match(skipped.error?.message ?? "", /only be fired or canceled/);

  const running = await insertJob({ state: "fired", lease_until: ahead(80), attempts: 1 });
  const unclaimed = await db.from("jobs").update({ state: "scheduled" }).eq("id", running);
  assert.match(unclaimed.error?.message ?? "", /only finish or fail/);
});

test("a retired kind can no longer be queued", { skip }, async () => {
  for (const kind of ["snooze_wake", "pause_expire"]) {
    const { error } = await db.from("jobs").insert({ tenant_id: tenantId, kind, due_at: ahead(60), payload: {} });
    assert.match(error?.message ?? "", /jobs_kind_check/, kind);
  }
});

test("the heartbeat records that it looked, and asks the edge only when something is due", { skip }, async () => {
  const t0 = Date.now();
  const idle = await db.rpc("trigger_jobs_tick");
  assert.equal(idle.error, null, idle.error?.message);
  assert.equal(idle.data, null, "nothing due, so nothing is asked of the edge");
  const quiet = await db.from("sweep_status").select("requested_at").eq("sweep", "jobs").single();
  assert.ok(Date.parse(quiet.data.requested_at) >= t0 - 5_000, "but the look is on the record, which is what sweep_health() watches");

  await insertJob();
  const busy = await db.rpc("trigger_jobs_tick");
  assert.equal(busy.error, null, busy.error?.message);
  const asked = await db.from("sweep_status").select("note").eq("sweep", "jobs").single();
  // supabase/seed.sql takes the edge's address out of this database's Vault.
  // If that did not happen, this database is posting to production.
  assert.match(asked.data.note ?? "", /missing cron_sweep_key or edge_base_url/,
    "with a job due it goes to call the edge, and a database with no edge says so instead");
});

test("a snooze that has run out reopens its thread; one that has not stays asleep", { skip }, async () => {
  const lapsed = await thread({ state: "snoozed", snooze_until: ago(5) });
  const asleep = await thread({ state: "snoozed", snooze_until: ahead(3600) });
  const { error } = await db.rpc("wake_stale_snoozes");
  assert.equal(error, null, error?.message);
  const rows = await statesOf([lapsed, asleep]);
  assert.equal(rows[lapsed].state, "open");
  assert.equal(rows[lapsed].snooze_until, null);
  assert.equal(rows[asleep].state, "snoozed");
  const { data: ev } = await db.from("events").select("id")
    .eq("tenant_id", tenantId).eq("kind", "conversation.snooze_expired").eq("subject_id", lapsed);
  assert.equal(ev.length, 1, "the wake is on the record once, whichever clock got there first");
});

test("a pause that has run out hands the thread back, unless the customer's request for a person is still open", { skip }, async () => {
  const lapsed = await thread({ state: "needs_human", paused_until: ago(5) });
  const running = await thread({ state: "needs_human", paused_until: ahead(3600) });
  // The escalation goes in BEFORE the pause lapses: the real clock runs every
  // ten seconds and would otherwise get there first.
  const asked = await thread({ state: "needs_human", paused_until: ahead(3600) });
  const { error: eErr } = await db.from("escalations").insert({ tenant_id: tenantId, conversation_id: asked, reason: "manual" });
  assert.equal(eErr, null, eErr?.message);
  const { error: lErr } = await db.from("conversations").update({ paused_until: ago(5) }).eq("id", asked);
  assert.equal(lErr, null, lErr?.message);

  const { error } = await db.rpc("expire_stale_pauses");
  assert.equal(error, null, error?.message);
  const rows = await statesOf([lapsed, asked, running]);
  assert.equal(rows[lapsed].state, "open");
  assert.equal(rows[lapsed].paused_until, null);
  // The retired pause_expire job would have handed this one back as well. A
  // person was asked for and has not answered; that is not the bot's to take.
  assert.equal(rows[asked].state, "needs_human");
  assert.equal(rows[running].state, "needs_human");
});

test("jobs_backlog() counts due work nobody has claimed for two minutes, and a claim takes it off the count", { skip }, async () => {
  // What the health sweep pages on and the public health door reports: run
  // against the function, which until now only the pager's memory test
  // described. Relative to whatever the ledger already holds, since the
  // count is platform-wide by design.
  const before = await db.rpc("jobs_backlog");
  assert.equal(before.error, null, before.error?.message);
  const base = before.data;
  await insertJob({ due_at: ago(180) });
  await insertJob({ due_at: ago(30) });
  const { data: waiting, error } = await db.rpc("jobs_backlog");
  assert.equal(error, null, error?.message);
  assert.equal(waiting, base + 1, "a job due thirty seconds ago is the heartbeat's next tick, not a backlog");
  const { data: patient } = await db.rpc("jobs_backlog", { p_wait: "10 seconds" });
  assert.equal(patient, base + 2, "the grace is the caller's to set");
  await claim(50);
  const { data: drained } = await db.rpc("jobs_backlog");
  assert.equal(drained, base, "claimed is not waiting");
});

test("the three clocks run every ten seconds, and the sweep that re-published is gone", { skip }, async () => {
  const { data, error } = await db.rpc("sweep_schedules");
  assert.equal(error, null, error?.message);
  const byName = new Map(data.map((j) => [j.jobname, j]));
  for (const name of ["jobs-tick", "expire-stale-pauses", "wake-stale-snoozes"]) {
    assert.equal(byName.get(name)?.schedule, "10 seconds", name);
    assert.equal(byName.get(name)?.active, true, name);
  }
  assert.equal(byName.has("stale-jobs-sweep"), false);
});

test("sweep_health() watches the heartbeat, and the lines sweep 00097 left out", { skip }, async () => {
  const { data, error } = await db.rpc("sweep_health");
  assert.equal(error, null, error?.message);
  const bySweep = new Map(data.map((r) => [r.sweep, r]));
  assert.equal(bySweep.get("jobs")?.scheduled, true, "judged against jobs-tick, which exists and is on");
  assert.equal(bySweep.get("lines")?.scheduled, true);
});
