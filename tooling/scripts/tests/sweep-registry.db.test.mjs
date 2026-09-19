/**
 * Every clock is registered (00107), proved on a real Postgres: the register
 * names all nineteen cron jobs, the nine that are judged on their runs are
 * judged that way, a name that arrives without its job is refused, the
 * upserts the sweeps themselves make still land, and the alert stamp works
 * on the new rows.
 *
 * Runs the way jobs-outbox.db.test.mjs does: against the database
 * `supabase start` builds on this machine, never production.
 */
import { test, before } from "node:test";
import assert from "node:assert/strict";
import { createClient } from "@supabase/supabase-js";

const URL_ = process.env.SUPABASE_URL;
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const skip = !URL_ || !KEY
  ? "no database in env"
  : !/^http:\/\/(127\.0\.0\.1|localhost):\d+\/?$/.test(URL_)
    ? "refusing a database that is not on this machine: this suite writes sweep rows"
    : false;

const EVERY_CLOCK = {
  calendar: "calendar-people-sweep",
  calls: "call-reconcile",
  deadman: "deadman-sweep",
  google: "google-listings-sweep",
  health: "sweep-health",
  jobs: "jobs-tick",
  lines: "lines-sweep",
  partitions: "events-partition-precreate",
  pauses: "expire-stale-pauses",
  playbooks: "playbooks-sweep",
  purge_ask: "purge-ask",
  purge_cron_history: "purge-cron-history",
  purge_events: "purge-events",
  purge_notifications: "purge-notifications",
  purge_rate_hits: "purge-rate-hits",
  registration: "registration-sweep",
  snoozes: "wake-stale-snoozes",
  // The lead finder (00140): a five-minute clock that asks the edge only when
  // a run is live or a round has not ended, and its nightly purge.
  leads: "leads-sweep",
  purge_leads: "purge-leads",
};
const RUN_JUDGED = ["partitions", "pauses", "purge_ask", "purge_cron_history", "purge_events", "purge_leads", "purge_notifications", "purge_rate_hits", "snoozes"];

let db;
before(() => {
  if (skip) return;
  db = createClient(URL_, KEY, { auth: { persistSession: false } });
});

test("the register names every cron job, and every one of them is scheduled", { skip }, async () => {
  const { data, error } = await db.from("sweep_status").select("sweep, jobname, judged_by, max_silence").order("sweep");
  assert.equal(error, null, error?.message);
  assert.deepEqual(Object.fromEntries(data.map((r) => [r.sweep, r.jobname])), EVERY_CLOCK, "one row per clock, each naming its job");
  for (const r of data) assert.equal(r.judged_by, RUN_JUDGED.includes(r.sweep) ? "run" : "request", `${r.sweep} is judged the right way`);
  const { data: jobs, error: jerr } = await db.rpc("sweep_schedules");
  assert.equal(jerr, null, jerr?.message);
  const byName = new Map(jobs.map((j) => [j.jobname, j]));
  for (const [sweep, jobname] of Object.entries(EVERY_CLOCK)) {
    assert.ok(byName.has(jobname), `${sweep}: no cron job named ${jobname}`);
    assert.equal(byName.get(jobname).active, true, `${jobname} is disabled`);
  }
});

test("sweep_health() judges every registered clock, and a clock that has not run yet is healthy until its silence is up", { skip }, async () => {
  const { data, error } = await db.rpc("sweep_health");
  assert.equal(error, null, error?.message);
  assert.deepEqual(data.map((r) => r.sweep), Object.keys(EVERY_CLOCK).sort(), "the names, not a count");
  for (const r of data) assert.equal(r.scheduled, true, `${r.sweep}: ${r.detail}`);
  // A fresh database has never run a nightly purge or the monthly precreate;
  // they were registered moments ago, well inside their silence, so they are
  // healthy. The row clocks have run every ten seconds since the database
  // came up, so they are healthy on their runs.
  for (const r of data.filter((x) => RUN_JUDGED.includes(x.sweep))) {
    assert.equal(r.healthy, true, `${r.sweep}: ${r.detail}`);
  }
  const clock = data.find((r) => r.sweep === "pauses");
  assert.ok(clock.last_request_at === null || Date.now() - Date.parse(clock.last_request_at) < 3 * 60_000, "a row clock's last word is its last successful run");
});

test("a name that arrives without its job is refused; one that names a job nobody scheduled is reported", { skip }, async () => {
  const bare = await db.from("sweep_status").insert({ sweep: "bogus" });
  assert.notEqual(bare.error, null, "an unregistered name was accepted");
  assert.match(bare.error.message, /not registered/);

  const named = await db.from("sweep_status").insert({ sweep: "bogus", jobname: "nothing-of-the-kind", judged_by: "run", max_silence: "1 hour" });
  assert.equal(named.error, null, named.error?.message);
  try {
    const { data, error } = await db.rpc("sweep_health");
    assert.equal(error, null, error?.message);
    const row = data.find((r) => r.sweep === "bogus");
    assert.equal(row.healthy, false);
    assert.equal(row.scheduled, false);
    assert.match(row.detail, /no cron job named nothing-of-the-kind/);
  } finally {
    await db.from("sweep_status").delete().eq("sweep", "bogus");
  }
});

test("the upserts the sweeps make still land on a registered row, and the alert stamp works on a run-judged one", { skip }, async () => {
  // request_sweep() carries no jobname; BEFORE INSERT must let it through to
  // ON CONFLICT because the row exists. Locally the Vault holds no edge
  // address, so it records a note rather than a request, which is a write
  // all the same.
  const before_ = await db.from("sweep_status").select("requested_at").eq("sweep", "deadman").single();
  assert.equal(before_.error, null, before_.error?.message);
  const { error } = await db.rpc("request_sweep", { p_sweep: "deadman", p_path: "/api/cron/deadman" });
  assert.equal(error, null, error?.message);
  const after_ = await db.from("sweep_status").select("requested_at, note, jobname").eq("sweep", "deadman").single();
  assert.equal(after_.error, null, after_.error?.message);
  assert.equal(after_.data.jobname, "deadman-sweep", "the registration survives the upsert");
  assert.ok(after_.data.requested_at !== before_.data.requested_at || after_.data.note !== null, "the sweep recorded its attempt");

  const stamped = await db.rpc("sweep_mark_alerted", { p_alerted: ["purge_events"], p_healthy: [] });
  assert.equal(stamped.error, null, stamped.error?.message);
  assert.equal(stamped.data, 1, "one run-judged row stamped");
  const cleared = await db.rpc("sweep_mark_alerted", { p_alerted: [], p_healthy: ["purge_events"] });
  assert.equal(cleared.error, null, cleared.error?.message);
  assert.equal(cleared.data, 1, "and cleared");
});
