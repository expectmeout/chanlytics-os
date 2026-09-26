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
const skip =
  !URL_ || !KEY
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
  const { data, error } = await db
    .from("tenants")
    .insert({ slug: `outbox-${Date.now()}`, name: "Outbox" })
    .select("id")
    .single();
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
  const { data, error } = await db
    .from("jobs")
    .insert({ tenant_id: tenantId, kind: "line_provision", due_at: ago(60), payload: {}, ...patch })
    .select("id")
    .single();
  assert.equal(error, null, error?.message);
  return data.id;
}

const claim = (limit) => db.rpc("claim_due_jobs", { p_limit: limit, p_lease_seconds: 90 });

/**
 * A claim that came back holding a row this suite made.
 *
 * The ledger is ONE queue and claim_due_jobs takes from all of it: no kind,
 * no workspace, just what is due. Another database suite claiming at the same
 * moment can therefore carry a row of ours off between the insert and the
 * call, and that row is then fired on somebody else's lease -- the ledger
 * working, not a fault here. So the row is made again and the claim repeated,
 * a few times at most, and the batch is never read as if it were all ours.
 */
async function claimHolding(limit, make) {
  for (let attempt = 1; attempt <= 5; attempt += 1) {
    const id = await make();
    const { data, error } = await claim(limit);
    assert.equal(error, null, error?.message);
    const row = (data ?? []).find((r) => r.id === id);
    if (row) return { id, row, batch: data ?? [] };
    const gone = await db.from("jobs").select("state, lease_until").eq("id", id).single();
    assert.ok(
      gone.data && gone.data.state === "fired" && Date.parse(gone.data.lease_until) > Date.now(),
      `attempt ${attempt}: the row did not come back, and no other claim is holding it either (${JSON.stringify(gone.data)})`,
    );
  }
  return assert.fail("five claims running: another suite's claim reached this suite's row first every time");
}

/** A conversation of its own contact: conversations are one per contact. */
async function thread(fields) {
  phones += 1;
  const { data: c, error: cErr } = await db
    .from("contacts")
    .insert({ tenant_id: tenantId, phone_e164: `+1555${String(phones).padStart(7, "0")}` })
    .select("id")
    .single();
  assert.equal(cErr, null, cErr?.message);
  const { data: v, error: vErr } = await db
    .from("conversations")
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
  const later = await insertJob({ due_at: ahead(3600) });
  const { id: due, row, batch } = await claimHolding(50, () => insertJob());
  // This suite's own two rows, never the whole batch: other suites claim from
  // this same queue, and whatever they have due comes back in it too.
  assert.deepEqual(
    batch.filter((r) => r.id === due || r.id === later).map((r) => r.id),
    [due],
    "the one that is due came back, and the one that is not did not",
  );
  assert.equal(row.state, "fired");
  assert.equal(row.attempts, 1);
  assert.ok(Date.parse(row.lease_until) > Date.now() + 60_000, "the lease outlives the run that holds it");
  const { data: rest } = await db.from("jobs").select("state").eq("id", later).single();
  assert.equal(rest.state, "scheduled");
});

test("two claims at once never take the same row", { skip }, async () => {
  // Two hours due, which is older than anything another suite leaves lying in
  // the queue: claim_due_jobs orders by due_at, so the four slots these two
  // claims have go to these four rows and not to somebody else's work.
  const mine = await Promise.all([0, 1, 2, 3].map(() => insertJob({ due_at: ago(7200) })));
  const [a, b] = await Promise.all([claim(2), claim(2)]);
  assert.equal(a.error, null, a.error?.message);
  assert.equal(b.error, null, b.error?.message);
  const ids = [...a.data, ...b.data].map((r) => r.id);
  assert.equal(new Set(ids).size, ids.length, "SKIP LOCKED: no row claimed twice");
  const got = ids.filter((id) => mine.includes(id));
  assert.equal(new Set(got).size, got.length, "and none of this suite's four twice");
  // Taken, every one of them: by these two claims, or by another suite's
  // claim on the same queue, which fires it just the same.
  const rows = await db.from("jobs").select("id, state").in("id", mine);
  assert.equal(rows.error, null, rows.error?.message);
  assert.deepEqual(
    rows.data.map((r) => r.state).sort(),
    ["fired", "fired", "fired", "fired"],
    "and between them they took all four",
  );
});

test("a lease that ran out is taken back with attempts + 1; a live one is left alone", { skip }, async () => {
  const alive = await insertJob({ state: "fired", fired_at: ago(5), lease_until: ahead(80), attempts: 1 });
  const {
    id: dead,
    row,
    batch,
  } = await claimHolding(50, () =>
    insertJob({ state: "fired", fired_at: ago(200), lease_until: ago(10), attempts: 1 }),
  );
  // This suite's own two rows again, not the batch: see claimHolding.
  assert.deepEqual(
    batch.filter((r) => r.id === dead || r.id === alive).map((r) => r.id),
    [dead],
    "the lease that ran out came back, and the one still running did not",
  );
  assert.equal(row.attempts, 2, "verdictFor reads this: a second claim means a run started and never came back");
});

test("the database refuses every transition the machine does not have", { skip }, async () => {
  const id = await insertJob();
  await claim(50);
  const done = await db.from("jobs").update({ state: "done" }).eq("id", id).eq("state", "fired").select("id");
  assert.equal(done.error, null, done.error?.message);
  assert.equal(done.data.length, 1, "fired -> done");

  const back = await db.from("jobs").update({ state: "scheduled" }).eq("id", id);
  assert.match(back.error?.message ?? "", /terminal/, "done is final, whoever asks");

  const scrub = await db
    .from("jobs")
    .update({ payload: { scrubbed: true } })
    .eq("id", id)
    .select("id");
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
  assert.ok(
    Date.parse(quiet.data.requested_at) >= t0 - 5_000,
    "but the look is on the record, which is what sweep_health() watches",
  );

  await insertJob();
  const busy = await db.rpc("trigger_jobs_tick");
  assert.equal(busy.error, null, busy.error?.message);
  const asked = await db.from("sweep_status").select("note").eq("sweep", "jobs").single();
  // supabase/seed.sql takes the edge's address out of this database's Vault.
  // If that did not happen, this database is posting to production.
  assert.match(
    asked.data.note ?? "",
    /missing cron_sweep_key or edge_base_url/,
    "with a job due it goes to call the edge, and a database with no edge says so instead",
  );
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
  const { data: ev } = await db
    .from("events")
    .select("id")
    .eq("tenant_id", tenantId)
    .eq("kind", "conversation.snooze_expired")
    .eq("subject_id", lapsed);
  assert.equal(ev.length, 1, "the wake is on the record once, whichever clock got there first");
});

test(
  "a pause that has run out hands the thread back, unless the customer's request for a person is still open",
  { skip },
  async () => {
    const lapsed = await thread({ state: "needs_human", paused_until: ago(5) });
    const running = await thread({ state: "needs_human", paused_until: ahead(3600) });
    // The escalation goes in BEFORE the pause lapses: the real clock runs every
    // ten seconds and would otherwise get there first.
    const asked = await thread({ state: "needs_human", paused_until: ahead(3600) });
    const { error: eErr } = await db
      .from("escalations")
      .insert({ tenant_id: tenantId, conversation_id: asked, reason: "manual" });
    assert.equal(eErr, null, eErr?.message);
    const { error: lErr } = await db
      .from("conversations")
      .update({ paused_until: ago(5) })
      .eq("id", asked);
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
  },
);

test(
  "jobs_backlog() counts due work nobody has claimed for two minutes, and a claim takes it off the count",
  { skip },
  async () => {
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
  },
);

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
