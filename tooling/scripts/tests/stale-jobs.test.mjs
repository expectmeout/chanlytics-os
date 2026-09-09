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
import { recoveryFor, OVERDUE_AFTER_MS, MAX_REPUBLISHES, STALE_TO_A_PERSON_MS, REPUBLISH_HORIZON_MS } from "../../../apps/edge/lib/jobs-recovery.ts";
import { JOB_STATES } from "@chanlytics/contracts";

const sweep = readCode("apps/edge/api/cron/jobs.ts");
const settleSrc = readCode("apps/edge/lib/jobs-settle.ts");
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
  // reached someone. The write lives in lib/jobs-settle.ts now, because both
  // terminal paths need it and each used to do only half.
  assert.ok(settleSrc.includes('.eq("status", "queued")'), "only a message still claiming to be on its way is touched");
  assert.ok(settleSrc.includes('.eq("tenant_id", job.tenant_id)'), "and only within the job's own workspace");
  assert.ok(settleSrc.includes('job.kind === "outbound_send"'), "and only for the kind that has one");
});

test("both terminal paths settle the same wreckage", () => {
  // They used to settle a half each: the reap marked a stuck outbound_send's
  // message failed and ignored broadcasts, the give-up released the broadcast
  // and ignored messages. So an outbound_send given up on said "Sending…" for
  // ever. One module, both callers, one set of conditions.
  const calls = (sweep.match(/await settle\(db, job, (?:true|false)\)/g) ?? []).sort();
  assert.deepEqual(calls, ["await settle(db, job, false)", "await settle(db, job, true)"], "each path settles, and they disagree only about certainty");

  // Certain means the work provably never happened: nothing ever claimed the
  // job. It changes the WORDS, never the conditions — every write is still
  // conditional on the row claiming to be in flight.
  const reap = sweep.slice(sweep.indexOf("for (const job of stale ?? [])"), sweep.indexOf("const overdueBefore ="));
  assert.ok(reap.includes("await settle(db, job, false)"), "a job that was claimed may have done its work");
  assert.ok(settleSrc.includes('.eq("status", "queued")') && settleSrc.includes('.eq("state", "sending")'), "both writes stay conditional either way");

  // releaseBroadcast destructured `data` only, so a failed release was reported
  // to the owner as a success. Nothing here discards an error.
  assert.ok(settleSrc.includes("error: error.message"), "a settlement that could not be written says so");
  assert.ok(sweep.includes('L.error("job_settle_failed"'), "and the sweep records it");
  assert.ok(!sweep.includes("releaseBroadcast"), "the half-settlement it replaced is gone");

  // The alert used to state the broadcast had been failed whether or not the
  // write found anything. Now the sentence is built from what came back.
  assert.ok(sweep.includes("const wreckage = saySettled(settled)"), "the owner is told what actually happened");
  assert.ok(!sweep.includes("The broadcast has been marked failed;") || settleSrc.includes("The broadcast has been marked failed;"), "and that sentence lives with the write that earns it");
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

test("a second publish waits for the first to exhaust itself", () => {
  const ago = (mins) => new Date(Date.now() - mins * 60_000).toISOString();

  // The budget used to burn in forty-five minutes. due_at was the only clock,
  // so every quarter-hour tick published again while the previous delivery
  // still had twenty minutes of QStash retries left: three publishes by T+75,
  // failed at T+90 with two deliveries in flight, and claim_job then refusing
  // both because the row was no longer 'scheduled'.
  assert.equal(recoveryFor({ kind: "snooze_wake", due_at: ago(60), republishes: 1, last_republish_at: ago(15) }), "wait");
  assert.equal(recoveryFor({ kind: "snooze_wake", due_at: ago(120), republishes: 1, last_republish_at: ago(70) }), "republish");
  assert.ok(REPUBLISH_HORIZON_MS > 33 * 60_000, "past QStash's own retry horizon, or two publishes overlap");

  // A job that has never been published still keys off due_at; there is no
  // previous delivery to wait for.
  assert.equal(recoveryFor({ kind: "snooze_wake", due_at: ago(50), republishes: 0, last_republish_at: null }), "republish");
  assert.equal(recoveryFor({ kind: "snooze_wake", due_at: ago(50), republishes: 0 }), "republish");

  // Pacing outranks the budget: a job that has spent every publish is WAITING,
  // not failed, while the last one can still land. The reverse ordering is the
  // original bug — it declared jobs dead underneath deliveries still in flight.
  assert.equal(recoveryFor({ kind: "snooze_wake", due_at: ago(120), republishes: MAX_REPUBLISHES, last_republish_at: ago(15) }), "wait");
  assert.equal(recoveryFor({ kind: "snooze_wake", due_at: ago(240), republishes: MAX_REPUBLISHES, last_republish_at: ago(70) }), "give_up");

  // Nor does the six-hour rule get to skip the wait: an outbound_send long past
  // being worth sending is still not declared dead while QStash may deliver it.
  assert.equal(recoveryFor({ kind: "outbound_send", due_at: ago(7 * 60), republishes: 1, last_republish_at: ago(15) }), "wait");
  assert.equal(recoveryFor({ kind: "outbound_send", due_at: ago(7 * 60), republishes: 1, last_republish_at: ago(70) }), "give_up");

  // An unparseable stamp must not be read as "published infinitely long ago"
  // and licence a publish; NaN fails the comparison and the job waits.
  assert.equal(recoveryFor({ kind: "snooze_wake", due_at: ago(120), republishes: 1, last_republish_at: "not a date" }), "wait");
});

test("the pacing column is actually fetched", () => {
  // recoveryFor reads job.last_republish_at, and this select names its columns.
  // Leaving it out does not fail: the value is undefined, the pacing branch is
  // skipped, and the fix ships inert — which is precisely how #261 shipped.
  assert.ok(
    sweep.includes("republishes, last_republish_at"),
    "the overdue read fetches the pacing column, or recoveryFor paces nothing",
  );
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
    sweep.indexOf("republishes: job.republishes + 1") < sweep.indexOf("await publish(db, job.id)"),
    "and BEFORE it, so a publish that throws cannot loop for ever",
  );
  const republish = sweep.slice(sweep.indexOf('if (verdict === "republish")'), sweep.indexOf('const { data: won, error: fErr }'));
  assert.ok(!republish.includes("alertFor"), "a re-publish alerts nobody: it is self-healing");
  assert.ok(republish.includes("jobs_republished"), "but it is logged, so a pile-up is visible");
  assert.ok(sweep.includes("alert(db, job)") && sweep.includes("never ran"), "giving up reaches the owner");
  assert.ok(sweep.includes("seams.alert ?? alertFor"), "and by default that is the real alert, not a test's");
});

test("a re-publish is reserved, not raced", () => {
  // The update was conditional on the STATE but not on the counter it was
  // incrementing, which is not a compare-and-swap: two overlapping ticks both
  // read republishes 0, both wrote 1, both matched 'scheduled', and both
  // published. Naming the value being replaced is the whole difference.
  assert.ok(sweep.includes('.eq("republishes", job.republishes)'), "the counter is a condition, not only the state");
  assert.ok(sweep.includes("last_republish_at: new Date().toISOString()"), "and the reservation stamps when it happened");
  assert.ok(
    sweep.indexOf('.eq("republishes", job.republishes)') < sweep.indexOf("await publish(db, job.id)"),
    "reserved before published, so the sweep that loses the race publishes nothing",
  );
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
  assert.ok(settleSrc.includes('job.kind === "broadcast_send"'), "only a broadcast job releases a broadcast");
  assert.ok(settleSrc.includes('.eq("state", "sending")'), "conditional, so a broadcast that finished is left alone");
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

  // ONE exit, after both passes. The overdue-read failure used to return early
  // with its own 200 — the same bug wearing different clothes, and it also
  // claimed the sweep was healthy while half of it had not run. The sweep
  // itself no longer speaks HTTP at all, so the shape to hold is that its body
  // has exactly one return: the counts, at the end.
  const loop = sweep.slice(sweep.indexOf("export async function sweepLedger"));
  assert.equal((loop.match(/^ {2}return /gm) ?? []).length, 1, "one exit from the sweep, and it is the last thing it does");
  assert.ok(!loop.includes("return json("), "the sweep counts; the route answers");
  assert.ok(loop.lastIndexOf("return {") > loop.indexOf("recoveryFor(job)"), "and it comes after the recovery loop, not before it");
});

test("a snooze whose job was lost still wakes up", () => {
  // 00006 gave pauses a sweeper for exactly this reason and snoozes never got
  // one: snooze_until is cleared by the job, by an inbound message (00005) and
  // by opt-out (00013), so a snooze whose job never arrives keeps a real
  // conversation out of the inbox permanently, showing an hour that passed
  // days ago, with nothing watching a row that looks freshly snoozed.
  const wake = readRaw("supabase/migrations/00082_wake_stale_snoozes.sql");
  assert.ok(wake.includes("c.state = 'snoozed'") && wake.includes("c.snooze_until < now()"), "expired snoozes only");
  assert.ok(wake.includes("set state = 'open', snooze_until = null"), "the same edge the handler walks");
  assert.ok(wake.includes("cron.schedule('wake-stale-snoozes'"), "on a clock of its own");
  assert.ok(wake.includes("conversation.snooze_expired"), "and it leaves a trace, like its sibling");

  // Deliberately the SAME rule as the handler, not a second policy that
  // disagrees with the first. The handler has no escalation guard; 00006 does,
  // because a paused thread a human owns is a different thing.
  const handlers = readCode("packages/jobs/src/handlers.ts");
  const snoozeWake = handlers.slice(handlers.indexOf("async function snoozeWake"));
  assert.ok(snoozeWake.includes('conv.state !== "snoozed"') && snoozeWake.includes("snooze_until: null"), "the handler this mirrors");
  assert.ok(!wake.includes("escalations"), "no guard the handler does not have");

  // pause_expire needs nothing: 00006 has covered it since long before this.
  assert.ok(readRaw("supabase/migrations/00006_expire_stale_pauses.sql").includes("cron.schedule('expire-stale-pauses'"), "the sibling that made this gap visible");
});

test("a sweep that could not read half the ledger does not answer 200", () => {
  // A failed read used to be a 200 with an overdue_error field, so anything
  // watching HTTP status read a half-broken sweep as healthy — and the stuck
  // read's failure did not reach the response at all.
  assert.ok(!sweep.includes("overdue_error"), "not a healthy answer with an error stapled to it");
  assert.ok(sweep.includes('unread: [error && "stuck", oErr && "overdue"]'), "both halves are accounted for");
  assert.ok(sweep.includes("unread.length ? 503 : 200"), "and a failed read is not a 200");
  assert.ok(sweep.includes("ok: unread.length === 0"), "nor an ok:true");

  // The counts still come back: what the working half achieved is true
  // whatever the other half did.
  assert.ok(/reaped, messages, broadcasts, republished, gaveUp/.test(sweep), "the work that WAS done is still reported");
  // 503 is already this route's word for "the work could not be done".
  assert.ok(sweep.includes('json(503, { ok: false, error: "no_database" })'), "the same status the route already uses");
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
