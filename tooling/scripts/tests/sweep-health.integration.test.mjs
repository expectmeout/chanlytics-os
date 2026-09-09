/**
 * The watchdog, against the live database.
 *
 * Read-only apart from two writes that are no-ops by construction: an empty
 * sweep_mark_alerted, and an insert the CHECK constraint is expected to
 * reject. It creates no rows and mutates no sweep state.
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
const db = skip ? null : createClient(URL_, KEY, { auth: { persistSession: false } });

test("sweep_health() names every watched sweep and every schedule exists", { skip }, async () => {
  const { data, error } = await db.rpc("sweep_health");
  assert.equal(error, null, error?.message);
  // The names, not a count: the LEFT JOINs make the count the same whatever
  // sweep_status holds, so a count assertion would be vacuous. 'jobs' joined
  // them in 00083 — the sweep that marks jobs failed, settles what they left
  // behind and emails the workspace, watched by nothing until then.
  assert.deepEqual(data.map((r) => r.sweep), ["calls", "deadman", "health", "jobs"]);
  for (const r of data) assert.equal(r.scheduled, true, `${r.sweep}: ${r.detail}`);
});

test("every sweep is currently answering the edge", { skip }, async () => {
  // Deliberately its own test: a red here means production is unwell right
  // now, not that the migration is wrong. The failure message IS the detail
  // string, which names the cause without further digging.
  const { data, error } = await db.rpc("sweep_health");
  assert.equal(error, null, error?.message);
  for (const r of data) assert.equal(r.healthy, true, `${r.sweep}: ${r.detail}`);
});

test("the deadman trigger records what it enqueued", { skip }, async () => {
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
  const { error } = await db.from("sweep_status").insert({ sweep: "bogus" });
  assert.notEqual(error, null, "an unwatched sweep name was accepted");
  assert.match(error.message, /sweep_status_sweep_check|violates check constraint/);
  const { data } = await db.from("sweep_status").select("sweep");
  assert.deepEqual(data.map((r) => r.sweep).sort(), ["calls", "deadman", "health", "jobs"]);
  // Belt and braces, in case a future migration ever widens the set.
  await db.from("sweep_status").delete().eq("sweep", "bogus");
});

test("every schedule the watchdog depends on is present and active", { skip }, async () => {
  const { data, error } = await db.rpc("sweep_schedules");
  assert.equal(error, null, error?.message);
  const byName = new Map(data.map((j) => [j.jobname, j]));
  for (const n of ["deadman-sweep", "call-reconcile", "expire-stale-pauses", "sweep-health", "purge-cron-history"]) {
    assert.ok(byName.has(n), `no cron job named ${n}`);
    assert.equal(byName.get(n).active, true, `${n} is disabled`);
  }
  // Catches someone re-scheduling sweep-health onto the */30 grid live, where
  // it goes blind to deadman failures with no code change to blame.
  assert.equal(byName.get("sweep-health").schedule, "13,43 * * * *");
});

test("the cron-history purge exists and is callable, without deleting anything", { skip }, async () => {
  // Proved without removing a row: nothing here is 9,999 days old.
  const { data, error } = await db.rpc("purge_cron_history", { p_keep: "9999 days", p_keep_per_job: 30 });
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
