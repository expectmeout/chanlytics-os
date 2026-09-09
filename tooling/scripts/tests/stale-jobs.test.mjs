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
import { recoveryFor, OVERDUE_AFTER_MS, MAX_REPUBLISHES, STALE_TO_A_PERSON_MS } from "../../../apps/edge/lib/jobs-recovery.ts";
import { JOB_STATES } from "@chanlytics/contracts";

const sweep = readCode("apps/edge/api/cron/jobs.ts");
const mig = readRaw("supabase/migrations/00078_stale_jobs.sql");

test("it marks, it never retries", () => {
  // A crash between send() returning ok and the status write landing leaves
  // the message still 'queued', so re-firing would deliver it a second time to
  // a real person. Marking is the only honest move: the outcome is unknown,
  // and the owner is the one who can look.
  assert.ok(sweep.includes('.update({ state: "failed", last_error: RUN_INTERRUPTED })'), "a stale job is failed");
  assert.ok(/its outcome is unknown/.test(sweep), "the reason says unknown, not failed");

  // Scoped to the FIRED half. The other half re-publishes on purpose, because
  // a job nothing ever claimed provably never ran — so this cannot be asserted
  // over the whole file any more, only over the pass it is true of.
  // Anchored on CODE, not a comment: readCode strips comments, so a marker
  // comment slices to -1 and silently takes the whole rest of the file.
  const fired = sweep.slice(sweep.indexOf("for (const job of stale ?? [])"), sweep.indexOf("const overdueBefore ="));
  assert.ok(fired.length > 200 && sweep.indexOf("const overdueBefore =") > 0, "the two passes are actually separable");
  assert.ok(!fired.includes('state: "scheduled"'), "a job that may have run is never put back on the queue");
  assert.ok(!fired.includes("republishJob") && !fired.includes("publishJSON"), "and never fired again");
  assert.ok(!sweep.includes("scheduleJob("), "neither half inserts a second row for the same work");
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

test("what to do with a job whose message never arrived", () => {
  const due = (minsAgo) => new Date(Date.now() - minsAgo * 60_000).toISOString();

  // QStash retries three times with backoff — 12s, 2m28s, 30m8s — so a message
  // is exhausted and in the dead-letter queue at about 33 minutes. Sooner than
  // that and this races a delivery still in flight.
  assert.equal(recoveryFor({ kind: "snooze_wake", due_at: due(20), republishes: 0 }), "wait");
  assert.equal(recoveryFor({ kind: "snooze_wake", due_at: due(50), republishes: 0 }), "republish");
  assert.ok(OVERDUE_AFTER_MS > 33 * 60_000, "past QStash's last retry, or this races a delivery");

  // Bounded: a message nobody will ever accept must not be published every
  // quarter hour for ever.
  assert.equal(recoveryFor({ kind: "snooze_wake", due_at: due(120), republishes: MAX_REPUBLISHES }), "give_up");

  // A reply the customer stopped waiting for is not worth sending late; an
  // operator decides whether to say it again.
  assert.equal(recoveryFor({ kind: "outbound_send", due_at: due(60), republishes: 0 }), "republish");
  assert.equal(recoveryFor({ kind: "outbound_send", due_at: due(7 * 60), republishes: 0 }), "give_up");
  assert.equal(recoveryFor({ kind: "broadcast_send", due_at: due(7 * 60), republishes: 0 }), "give_up");

  // Internal work is late, never pointless.
  assert.equal(recoveryFor({ kind: "pause_expire", due_at: due(7 * 60), republishes: 0 }), "republish");
  assert.equal(recoveryFor({ kind: "blob_thread_erase", due_at: due(48 * 60), republishes: 0 }), "republish");
  assert.ok(STALE_TO_A_PERSON_MS > OVERDUE_AFTER_MS);

  // The clock is injectable, so this reads the same in a year.
  const fixed = Date.parse("2026-01-01T12:00:00Z");
  assert.equal(recoveryFor({ kind: "snooze_wake", due_at: "2026-01-01T11:00:00Z", republishes: 0 }, fixed), "republish");
  assert.equal(recoveryFor({ kind: "snooze_wake", due_at: "2026-01-01T11:50:00Z", republishes: 0 }, fixed), "wait");
});

test("the sweep reads BOTH halves of the ledger", () => {
  // #256 closed 'fired' and left 'scheduled' open, which is the larger hole: a
  // message that never arrives needs only QStash to fail once, and rotated
  // signing keys put every job in the product here at once with no signal.
  assert.ok(sweep.includes('.eq("state", "fired")'), "jobs whose handler never returned");
  assert.ok(sweep.includes('.eq("state", "scheduled")') && sweep.includes('.lt("due_at", overdueBefore)'), "and jobs whose message never arrived");
  assert.ok(sweep.includes("recoveryFor(job)"), "the rule decides; the sweep only carries it out");
  // 00002 already has `jobs_due_scheduled on (due_at) where state = 'scheduled'`.
  assert.ok(!readRaw("supabase/migrations/00079_job_republishes.sql").includes("create index"), "no second index for a query 00002 already covers");
});

test("a re-publish is bounded, recorded, and silent; giving up is loud", () => {
  assert.ok(sweep.includes("republishes: job.republishes + 1"), "the counter goes up with the publish");
  assert.ok(
    sweep.indexOf("republishes: job.republishes + 1") < sweep.indexOf("await republishJob(db, job.id)"),
    "and BEFORE it, so a publish that throws cannot loop for ever",
  );
  const republish = sweep.slice(sweep.indexOf('if (verdict === "republish")'), sweep.indexOf('const { data: won, error: fErr }'));
  assert.ok(!republish.includes("alertFor"), "a re-publish alerts nobody: it is self-healing");
  assert.ok(republish.includes("jobs_republished"), "but it is logged, so a pile-up is visible");
  assert.ok(sweep.includes('alertFor(db, job)') && sweep.includes("never ran"), "giving up reaches the owner");
});

test("a re-publish keeps the job's own row, and a stranded broadcast is released", () => {
  // QStash's dedup window is ten minutes and this fires at forty-five, so the
  // message is accepted rather than dropped. claim_job, not the dedup id, is
  // what stops a late original and this one both firing.
  assert.ok(sweep.includes("deduplicationId: jobId"), "the job's own id");
  assert.ok(!sweep.includes("notBefore:"), "already due: nothing left to hold it back for");
  assert.ok(sweep.includes('.update({ qstash_id: res.messageId })'), "the new message id replaces the lost one");
  assert.ok(!sweep.includes("scheduleJob("), "scheduleJob would insert a SECOND row for the same work");

  // broadcastSend schedules its own next batch, so one lost link strands the run.
  assert.ok(sweep.includes('job.kind !== "broadcast_send"'), "only a broadcast job releases a broadcast");
  assert.ok(sweep.includes('.eq("state", "sending")'), "conditional, so a broadcast that finished is left alone");
  const handlers = readCode("packages/jobs/src/handlers.ts");
  assert.ok(handlers.includes('ctx.schedule("broadcast_send", new Date(), { broadcast_id: b.id })'), "the chain this repairs");
});

test("neither half can silence the other", () => {
  // This shipped once and did nothing. #256's `if (!stale?.length) return`
  // was right while there was one pass; with two it meant the overdue half
  // ran only on the rare tick that ALSO found a stuck job. Every test here
  // reads source, so none of them noticed — a probe job in production did.
  assert.ok(!sweep.includes("if (!stale?.length) return"), "no early exit between the passes");
  assert.ok(sweep.includes("for (const job of stale ?? [])"), "an empty first half is a loop that does nothing, not a return");
  assert.ok(sweep.includes('L.error("stuck_read_failed"'), "a failed read of one half is logged, not fatal to the other");

  // One answer, after both passes. A second 200 anywhere earlier is the same
  // bug wearing different clothes.
  const answers = (sweep.match(/return json\(200/g) ?? []).length;
  assert.equal(answers, 2, "the overdue-read failure path, and the one at the end");
  assert.ok(
    sweep.lastIndexOf("return json(200") > sweep.indexOf("recoveryFor(job)"),
    "the final answer comes after the recovery loop, not before it",
  );
});

test("'fired' means claimed, not finished — or the sweep reaps every success", () => {
  // jobs.state had four values and none meant "this ran and returned".
  // claim_job set 'fired'; on success fire.ts logged, answered 200, and left
  // it there. Harmless while nothing read the column — and, the moment this
  // sweep did, a false alarm emailed to the owner ten minutes after every
  // successful job in the product. Caught by a probe, not by any test here.
  const fire = readCode("apps/edge/api/jobs/fire.ts");
  assert.ok(
    fire.includes('.update({ state: "done" }).eq("id", jobId).eq("state", "fired")'),
    "a handler that returns moves the job out of 'fired'",
  );
  assert.ok(
    fire.indexOf('state: "done"') > fire.indexOf("dispatchJob("),
    "and only after the handler actually returned",
  );
  assert.ok(JOB_STATES.includes("done"), "the ledger can say a job finished");
  assert.ok(readRaw("supabase/migrations/00080_job_done.sql").includes("set state = 'done'"), "and history was backfilled, not judged");

  // The sweep still reads 'fired', which now means exactly what it reaps for.
  assert.ok(sweep.includes('.eq("state", "fired")'));
  assert.ok(!sweep.includes('.eq("state", "done")'), "a finished job is not the sweep's business");
});
