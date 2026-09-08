/**
 * Jobs that never came back.
 *
 * claim_job flips a job to 'fired' and the handler runs. Nothing swept the
 * ones whose handler never returned — a timeout, a cold start, a deploy
 * mid-flight — and fire.ts answers 200 by design so QStash will not retry
 * either. So 'fired' was the one state a job could not leave, and for an
 * outbound_send that is a reply the operator watches sit at "Sending…" for
 * ever with nobody told.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { ROOT, readCode, readRaw } from "./_source.mjs";

const sweep = readCode("apps/edge/api/cron/jobs.ts");
const mig = readRaw("supabase/migrations/00078_stale_jobs.sql");

test("it marks, it never retries", () => {
  // A crash between send() returning ok and the status write landing leaves
  // the message still 'queued', so re-firing would deliver it a second time to
  // a real person. Marking is the only honest move: the outcome is unknown,
  // and the owner is the one who can look.
  assert.ok(sweep.includes('.update({ state: "failed", last_error: RUN_INTERRUPTED })'), "a stale job is failed");
  assert.ok(!sweep.includes('state: "scheduled"'), "it must never put a job back on the queue");
  assert.ok(!sweep.includes("scheduleJob") && !sweep.includes("publishJSON"), "and never fire one itself");
  assert.ok(/its outcome is unknown/.test(sweep), "the reason says unknown, not failed");
});

test("both writes are conditional, so two ticks cannot report the same job twice", () => {
  // The job: `.eq("state", "fired")` is the gate, not a filter. Zero rows means
  // somebody else got there first — a late handler, an overlapping tick — and
  // there is nothing to say about it.
  assert.ok(sweep.includes('.eq("state", "fired")') && sweep.includes('.select("id")'), "the job is taken by compare-and-swap");
  assert.ok(sweep.includes("if (!won?.length) continue;"), "losing the race is silent, not a second alert");

  // The message: if the handler DID record the send before dying, that row is
  // already 'sent', and saying otherwise would be a lie about a message that
  // reached someone.
  assert.ok(sweep.includes('.eq("status", "queued")'), "only a message still claiming to be on its way is touched");
  assert.ok(sweep.includes('.eq("tenant_id", job.tenant_id)'), "and only within the job's own workspace");
  assert.ok(sweep.includes('job.kind === "outbound_send" && typeof messageId === "string"'), "and only for the kind that has one");
});

test("the staleness threshold sits between the longest honest run and the tick", () => {
  const fire = readCode("apps/edge/api/jobs/fire.ts");
  assert.ok(fire.includes("maxDuration: 60"), "fire.ts may run for a minute");
  const m = /STALE_AFTER_MS = (\d+) \* 60_000/.exec(sweep);
  assert.ok(m, "the threshold is stated in minutes");
  const minutes = Number(m[1]);
  assert.ok(minutes >= 5, `${minutes}m would judge a job that might still be working`);
  assert.ok(minutes <= 15, `${minutes}m is longer than the gap between ticks, so a backlog would never drain`);
});

test("the clock is pg_cron's, on a minute nothing else uses", () => {
  assert.ok(mig.includes("url     := v_url || '/api/cron/jobs',"), "it calls the route that exists");
  assert.ok(fs.existsSync(path.join(ROOT, "apps/edge/api/cron/jobs.ts")), "and that route is a file");
  assert.ok(mig.includes("cron.schedule('stale-jobs-sweep', '4,19,34,49 * * * *'"), "every quarter hour, off the grid");

  // No two sweeps on the same minute: a tick landing on another sweep's tick
  // judges work seconds old, which is the trap sweep-health documents.
  const mine = new Set(["4", "19", "34", "49"]);
  const dir = path.join(ROOT, "supabase/migrations");
  for (const f of fs.readdirSync(dir)) {
    if (!f.endsWith(".sql") || f.startsWith("00078")) continue;
    const sql = fs.readFileSync(path.join(dir, f), "utf8");
    for (const [, name, when] of sql.matchAll(/cron\.schedule\('([a-z-]+)', '([^']+)'/g)) {
      const minutes = when.split(" ")[0].split(",");
      for (const x of minutes) assert.ok(!mine.has(x), `${name} already runs at :${x}`);
    }
  }
});

test("the read is indexed, because it runs four times an hour to find nothing", () => {
  assert.ok(
    mig.includes("create index if not exists jobs_fired_at_idx on public.jobs (fired_at) where state = 'fired'"),
    "a partial index on exactly the query the sweep makes",
  );
  assert.ok(sweep.includes('.eq("state", "fired")') && sweep.includes('.lt("fired_at", cutoff)'), "which is state then age");
});

test("who may be told lives in ONE place", () => {
  // fire.ts once fell back to a literal name and address, which with a second
  // tenant delivered one business's delivery failure — naming its customer's
  // number — to a different business's owner. There are now two places a job
  // can fail, and two copies of that rule is how the bug happens twice.
  const alert = readCode("apps/edge/lib/job-alert.ts");
  assert.ok(alert.includes("loadTenantNotifications(db, job.tenant_id)"), "addressed from the tenant's own runtime");
  assert.ok(alert.includes('kind: "job_failed"') && alert.includes("redactedBody:"), "and redacted for anyone else");
  for (const [name, src] of [["fire.ts", readCode("apps/edge/api/jobs/fire.ts")], ["the sweep", sweep]]) {
    assert.ok(src.includes('import { alertFor } from "../../lib/job-alert.js";'), `${name} imports it`);
    assert.ok(!src.includes("function alertFor"), `${name} must not carry a second copy`);
  }
});

test("the sweep keeps the same door as every other sweep", () => {
  assert.ok(sweep.includes('request.headers.get("x-cron-key")') && sweep.includes('db.rpc("get_cron_sweep_key")'), "the Vault-held key");
  assert.ok(sweep.includes("crypto.timingSafeEqual"), "compared in constant time, like the others");
  assert.ok(sweep.includes("MAX_PER_TICK") && sweep.includes(".limit(MAX_PER_TICK)"), "bounded per tick so a backlog drains over several");
  assert.ok(sweep.includes("stale_job_alert_failed"), "a failed alert must not turn a recorded reaping into an unrecorded one");
});
