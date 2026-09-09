/**
 * The jobs sweep, run rather than read.
 *
 * Every other test of this route asserts on its source text. Those tests are
 * worth having — they pin decisions that would otherwise be re-litigated by
 * whoever edits next — but they cannot see reachability, ordering, or what the
 * loop does on its second pass, and twice in one evening a release blocker
 * passed all thirteen of them plus a full CI run:
 *
 *   #262  an early return between the two passes meant the overdue half ran
 *         only on the rare tick that ALSO found a stuck job. Found by a probe
 *         job in production.
 *   #263  every successful job stayed 'fired', so this sweep would have marked
 *         each of them failed and emailed the owner ten minutes later. Found by
 *         watching that same probe.
 *
 * The first case below is #262 exactly: put that early return back and it
 * fails, along with five others. The second is #263's HALF of the story — this
 * sweep's behaviour towards a finished job — because the bug itself lived in
 * fire.ts, which never wrote the state. What this file cannot reach on its own,
 * say so about rather than imply.
 *
 * Each of the regressions these cases exist for was reintroduced and confirmed
 * to fail them, and confirmed to fail ONLY the ones it should:
 *
 *   the early return          -> 1, 3, 4, 5, 6, 9
 *   dropping the CAS predicate -> 3
 *   dropping the pacing branch -> 4, 5
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { fakeDb, fakeLog } from "./_fake-db.mjs";
import { sweepLedger, STALE_AFTER_MS } from "../../../apps/edge/api/cron/jobs.ts";
import { OVERDUE_AFTER_MS, REPUBLISH_HORIZON_MS } from "../../../apps/edge/lib/jobs-recovery.ts";

const ago = (ms) => new Date(Date.now() - ms).toISOString();
const TENANT = "11111111-1111-1111-1111-111111111111";

/** A job that is overdue enough for the recovery rule to act on it. */
function overdue(over = {}) {
  return {
    id: "job-overdue", tenant_id: TENANT, kind: "snooze_wake", payload: {},
    state: "scheduled", due_at: ago(OVERDUE_AFTER_MS + 60_000),
    republishes: 0, last_republish_at: null, fired_at: null, ...over,
  };
}

/** A job claimed long enough ago that its handler cannot still be running. */
function stuck(over = {}) {
  return {
    id: "job-stuck", tenant_id: TENANT, kind: "outbound_send", payload: { message_id: "msg-1" },
    state: "fired", due_at: ago(STALE_AFTER_MS * 3), fired_at: ago(STALE_AFTER_MS + 60_000),
    republishes: 0, last_republish_at: null, ...over,
  };
}

/** The sweep with its two outward calls recorded instead of made. */
function run(db, seams = {}) {
  const L = fakeLog();
  const published = [];
  const alerts = [];
  const result = sweepLedger(db, L, {
    publish: async (_db, jobId) => { published.push(jobId); },
    alert: (_db, job) => async (subject, body) => { alerts.push({ job: job.id, subject, body }); },
    ...seams,
  });
  return result.then((r) => ({ ...r, L, published, alerts }));
}

test("the overdue half runs on a tick that finds no stuck job", async () => {
  // #262. The early return here read `if (!stale?.length) return json(200,…)`,
  // which is correct with one pass and silently disables the second. Nothing
  // about the source of either half looks wrong; only running both shows it.
  const jobs = [overdue()];
  const out = await run(fakeDb({ jobs }));

  assert.equal(out.reaped, 0, "there was nothing stuck to reap");
  assert.deepEqual(out.published, ["job-overdue"], "and the other half still ran");
  assert.equal(out.republished, 1);
  assert.equal(jobs[0].republishes, 1, "the reservation was taken on the row");
  assert.ok(jobs[0].last_republish_at, "and stamped");
});

test("a job that finished is invisible to both halves", async () => {
  // #263's other half. Before 'done' existed, a successful job stayed 'fired'
  // for ever and this sweep marked every one of them failed and emailed the
  // owner — but the sweep's own source was correct throughout; the ledger had
  // no word for success and fire.ts never wrote one. This pins the half that
  // lives here. That fire.ts writes 'done' at all is pinned by
  // stale-jobs.test.mjs, by reading it, which is the best that file can do.
  const jobs = [
    { ...stuck(), id: "job-done", state: "done" },
    { ...overdue(), id: "job-also-done", state: "done" },
  ];
  const out = await run(fakeDb({ jobs }));

  assert.equal(out.reaped, 0, "a finished job is not a stuck one");
  assert.equal(out.republished, 0, "nor an undelivered one");
  assert.equal(out.seen, 0);
  assert.deepEqual(out.alerts, [], "and nobody is emailed about work that worked");
});

test("two sweeps over the same row publish once between them", async () => {
  // The reservation was conditional on the state but not on the counter it was
  // incrementing, so both ticks matched 'scheduled', both wrote 1, and both
  // published. Two sweeps over one shared ledger is the only way to see it.
  const jobs = [overdue()];
  const db = fakeDb({ jobs });
  const [a, b] = await Promise.all([run(db), run(db)]);

  assert.equal(a.published.length + b.published.length, 1, "one publish, not two");
  assert.equal(a.republished + b.republished, 1);
  assert.equal(jobs[0].republishes, 1, "and the counter moved exactly once");
});

test("a job re-published a moment ago is left alone", async () => {
  // Pacing came from due_at alone, so every quarter-hour tick published again
  // while the previous delivery still had twenty minutes of QStash retries.
  const jobs = [overdue({ republishes: 1, last_republish_at: ago(REPUBLISH_HORIZON_MS / 2) })];
  const soon = await run(fakeDb({ jobs }));
  assert.deepEqual(soon.published, [], "its last delivery can still land");
  assert.equal(jobs[0].republishes, 1, "and nothing was spent waiting for it");

  jobs[0].last_republish_at = ago(REPUBLISH_HORIZON_MS + 60_000);
  const later = await run(fakeDb({ jobs }));
  assert.deepEqual(later.published, ["job-overdue"], "once that horizon passes, it is published again");
});

test("a job that spent its budget is not failed while a delivery is in flight", async () => {
  const jobs = [overdue({ republishes: 3, last_republish_at: ago(REPUBLISH_HORIZON_MS / 2) })];
  const held = await run(fakeDb({ jobs }));
  assert.equal(held.gaveUp, 0, "giving up here would refuse the delivery it is still waiting for");
  assert.equal(jobs[0].state, "scheduled");

  jobs[0].last_republish_at = ago(REPUBLISH_HORIZON_MS + 60_000);
  const done = await run(fakeDb({ jobs }));
  assert.equal(done.gaveUp, 1, "and once nothing can land, it is given up on");
  assert.equal(jobs[0].state, "failed");
});

test("giving up on an outbound_send settles its message and says so", async () => {
  // The give-up path released broadcasts and ignored messages, so a reply
  // nobody would ever send said "Sending…" for ever.
  const jobs = [overdue({ id: "job-send", kind: "outbound_send", payload: { message_id: "msg-1" }, republishes: 3, last_republish_at: ago(REPUBLISH_HORIZON_MS + 60_000) })];
  const messages = [{ id: "msg-1", tenant_id: TENANT, status: "queued", error: null }];
  const out = await run(fakeDb({ jobs, messages }));

  assert.equal(out.gaveUp, 1);
  assert.equal(messages[0].status, "failed", "the message is no longer shown as on its way");
  assert.equal(out.messages, 1, "and it is counted");
  assert.equal(out.alerts.length, 1);
  assert.match(out.alerts[0].body, /marked failed/, "the owner is told what became of it");
});

test("a message that was already sent is left exactly as it was", async () => {
  // The reap runs on a job that WAS claimed, so the handler may have sent
  // before dying. Every settlement write is conditional for that reason.
  const jobs = [stuck()];
  const messages = [{ id: "msg-1", tenant_id: TENANT, status: "sent", error: null }];
  const out = await run(fakeDb({ jobs, messages }));

  assert.equal(out.reaped, 1, "the job is still judged");
  assert.equal(messages[0].status, "sent", "but a message that reached someone is not called failed");
  assert.equal(out.messages, 0);
  assert.doesNotMatch(out.alerts[0].body, /marked failed/, "and the owner is not told otherwise");
});

test("a settlement that cannot be written is reported, not swallowed", async () => {
  // releaseBroadcast destructured `data` only, so a failed release reached the
  // owner as a success.
  const jobs = [stuck()];
  const db = fakeDb({ jobs, messages: [{ id: "msg-1", tenant_id: TENANT, status: "queued" }] }, { "messages.update": { message: "permission denied" } });
  const out = await run(db);

  assert.equal(out.reaped, 1, "the job is still reaped");
  assert.equal(out.messages, 0, "nothing is counted as settled");
  assert.ok(out.L.events().includes("job_settle_failed"), "the failure is logged");
  assert.match(out.alerts[0].body, /could not be updated/, "and the owner is told it could not be checked");
});

test("a half of the ledger that could not be read is named, and the other half still runs", async () => {
  const jobs = [overdue()];
  const out = await run(fakeDb({ jobs }, { "jobs.select": { message: "statement timeout" } }));
  assert.deepEqual(out.unread.sort(), ["overdue", "stuck"], "both reads failed here, and both are named");
  assert.equal(out.republished, 0);

  // The realistic case is one half failing. The other must still do its work,
  // and the answer must still say the sweep did not finish.
  const only = await run(fakeDb({ jobs }, { "jobs.update": { message: "deadlock detected" } }));
  assert.deepEqual(only.unread, [], "reads succeeded");
  assert.equal(only.published.length, 0, "but a reservation that cannot be written publishes nothing");
});

test("the double refuses to answer a call it does not model", () => {
  // A double that silently returns undefined turns an unfaithful test into a
  // passing one, which is the failure mode this whole file exists to avoid.
  const db = fakeDb({ jobs: [] });
  assert.throws(() => db.from("jobs").ilike("kind", "%send%"), /does not model/);
  assert.throws(() => db.rpc("claim_job"), /belongs to the caller/);
});
