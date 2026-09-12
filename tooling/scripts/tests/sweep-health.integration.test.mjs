/**
 * The watchdog, against the live database.
 *
 * Read-only apart from two writes that are no-ops by construction: an empty
 * sweep_mark_alerted, and an insert the registration trigger (00107) is
 * expected to reject. It creates no rows and mutates no sweep state.
 *
 * Skips without service-role credentials, which is what happens in CI — the
 * same bargain the other integration suites make.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { createClient } from "@supabase/supabase-js";

const URL_ = process.env.SUPABASE_URL;
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const skip = !URL_ || !KEY ? "no service-role credentials in env" : false;
// Two of these ask whether production is answering right now. The database
// workflow replays the migrations on this machine, where seed.sql removes
// edge_base_url on purpose (so a local sweep never posts to production) and
// the deadman trigger has nowhere to send; those two answer only live.
const liveOnly = !skip && /^http:\/\/(127\.0\.0\.1|localhost):\d+\/?$/.test(URL_)
  ? "a replayed database has no edge to answer (seed.sql removes edge_base_url on purpose)"
  : false;
const db = skip ? null : createClient(URL_, KEY, { auth: { persistSession: false } });

test("sweep_health() names every watched sweep and every schedule exists", { skip }, async () => {
  const { data, error } = await db.rpc("sweep_health");
  assert.equal(error, null, error?.message);
  // The names, not a count: the LEFT JOINs make the count the same whatever
  // sweep_status holds, so a count assertion would be vacuous. 'jobs' joined
  // them in 00083 — the sweep that marks jobs failed, settles what they left
  // behind and emails the workspace, watched by nothing until then. 00086
  // finished the job: every sweep that changes state on its own is here, the
  // last two of them SQL that never leaves the database. 00098 added 'lines',
  // which 00097 had registered with sweep_status and never here. 00107 made
  // the register data and added the six clocks nobody had typed in: the
  // monthly partition precreate and the five nightly purges.
  assert.deepEqual(data.map((r) => r.sweep), ["calendar", "calls", "deadman", "google", "health", "jobs", "lines", "partitions", "pauses", "playbooks", "purge_ask", "purge_cron_history", "purge_events", "purge_notifications", "purge_rate_hits", "registration", "snoozes"]);
  for (const r of data) assert.equal(r.scheduled, true, `${r.sweep}: ${r.detail}`);
});

test("every sweep is currently answering the edge", { skip: skip || liveOnly }, async () => {
  // Deliberately its own test: a red here means production is unwell right
  // now, not that the migration is wrong. The failure message IS the detail
  // string, which names the cause without further digging.
  const { data, error } = await db.rpc("sweep_health");
  assert.equal(error, null, error?.message);
  for (const r of data) assert.equal(r.healthy, true, `${r.sweep}: ${r.detail}`);
});

test("the deadman trigger records what it enqueued", { skip: skip || liveOnly }, async () => {
  // Without this the rewritten trigger could silently stop recording, and
  // sweep_health() would report "has never enqueued a request" forever — a
  // watchdog that cries wolf every six hours.
  const { data, error } = await db
    .from("sweep_status")
    .select("sweep, request_id, requested_at, note")
    .eq("sweep", "deadman")
    .single();
  assert.equal(error, null, error?.message);
  assert.equal(data.note, null);
  assert.equal(typeof data.request_id, "number");
  // 15 minutes is one and a half deadman ticks, so a single skipped tick is
  // not a red test.
  assert.ok(
    Date.now() - Date.parse(data.requested_at) < 15 * 60_000,
    "the deadman trigger has not recorded a request in the last 15 minutes",
  );
});

test("an unexpected sweep name cannot be added behind sweep_health()'s back", { skip }, async () => {
  // Since 00107 the register is data, so the guard is a trigger, not a CHECK:
  // a name that arrives without the cron job it is has nothing to be judged
  // by, and is refused.
  const { error } = await db.from("sweep_status").insert({ sweep: "bogus" });
  assert.notEqual(error, null, "an unregistered sweep name was accepted");
  assert.match(error.message, /not registered/);
  const { data } = await db.from("sweep_status").select("sweep");
  // Seventeen: every clock has a row now, the ones that run inside Postgres included.
  assert.deepEqual(data.map((r) => r.sweep).sort(), ["calendar", "calls", "deadman", "google", "health", "jobs", "lines", "partitions", "pauses", "playbooks", "purge_ask", "purge_cron_history", "purge_events", "purge_notifications", "purge_rate_hits", "registration", "snoozes"]);
  // Belt and braces, in case a future migration ever widens the set.
  await db.from("sweep_status").delete().eq("sweep", "bogus");
});

test("every schedule the watchdog depends on is present and active", { skip }, async () => {
  const { data, error } = await db.rpc("sweep_schedules");
  assert.equal(error, null, error?.message);
  const byName = new Map(data.map((j) => [j.jobname, j]));
  for (const n of [
    "deadman-sweep", "call-reconcile", "expire-stale-pauses", "sweep-health", "purge-cron-history",
    // Added with 00086, which is what made their absence something the
    // watchdog would report rather than something nobody would ever see.
    "registration-sweep", "calendar-people-sweep", "google-listings-sweep", "playbooks-sweep", "wake-stale-snoozes",
    // 00098: the ledger's heartbeat, and the lines sweep 00097 left unwatched.
    "jobs-tick", "lines-sweep",
    // 00107: the six clocks nobody watched, registered as data and judged on their runs.
    "events-partition-precreate", "purge-events", "purge-ask", "purge-notifications", "purge-rate-hits",
  ]) {
    assert.ok(byName.has(n), `no cron job named ${n}`);
    assert.equal(byName.get(n).active, true, `${n} is disabled`);
  }
  // Catches someone re-scheduling sweep-health onto the */30 grid live, where
  // it goes blind to deadman failures with no code change to blame.
  assert.equal(byName.get("sweep-health").schedule, "13,43 * * * *");
});

test("the cron-history purge exists and is callable, without deleting anything", { skip }, async () => {
  // Proved without removing a row: nothing here is 9,999 days old.
  const { data, error } = await db.rpc("purge_cron_history", { p_keep: "9999 days", p_keep_per_job: 30, p_keep_frequent: "9999 days" });
  assert.equal(error, null, error?.message);
  assert.equal(data, 0);
});

test("an empty sweep_mark_alerted stamps nothing and clears nothing", { skip }, async () => {
  // A signature change here would make every alert repeat every 30 minutes,
  // because nothing would ever be stamped.
  const { data, error } = await db.rpc("sweep_mark_alerted", { p_alerted: [], p_healthy: [] });
  assert.equal(error, null, error?.message);
  assert.equal(data, 0, "an empty call must stamp nothing and clear nothing");
});
