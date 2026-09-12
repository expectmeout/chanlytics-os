/**
 * The ledger's rules, run: which claim goes ahead, how a run finishes the row,
 * and what a job that will not finish leaves behind. Everything here is a
 * value or a write to a double, so nothing in this file reads source.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { fakeDb } from "./_fake-db.mjs";
import {
  verdictFor, claimNext, completeJob, failJob,
  CLAIM_FOR_MS, YIELD_AT_MS, LEASE_SECONDS, MAX_ATTEMPTS, SPEAKS_TO_A_PERSON,
} from "../../../packages/jobs/src/ledger.ts";
import { settleJob, saySettled } from "../../../packages/jobs/src/settle.ts";

const TENANT = "11111111-1111-1111-1111-111111111111";

test("a first run always runs", () => {
  for (const kind of ["outbound_send", "broadcast_send", "blob_thread_erase"]) {
    assert.equal(verdictFor({ kind, attempts: 1 }), "run", kind);
  }
});

test("work that speaks to a person is never run a second time", () => {
  // A second claim means a run STARTED and never reported back. It may have
  // died after the provider accepted the message and before the row said so,
  // and running it again risks a second text to a real person.
  for (const kind of SPEAKS_TO_A_PERSON) {
    assert.equal(verdictFor({ kind, attempts: 2 }), "give_up", kind);
  }
});

test("internal work is tried again up to the cap, then given up", () => {
  assert.equal(verdictFor({ kind: "blob_thread_erase", attempts: 2 }), "run");
  assert.equal(verdictFor({ kind: "blob_thread_erase", attempts: MAX_ATTEMPTS }), "run");
  assert.equal(verdictFor({ kind: "blob_thread_erase", attempts: MAX_ATTEMPTS + 1 }), "give_up");
});

test("the timings nest: claiming stops, then handlers yield, then a lease runs out", () => {
  assert.ok(CLAIM_FOR_MS < YIELD_AT_MS, "a job claimed last still has time before its handler must yield");
  assert.ok(YIELD_AT_MS < LEASE_SECONDS * 1000, "and nothing is taken back while a handler can still be sending");
});

test("a claim asks for one job, hands it back, and is null when nothing is due", async () => {
  const row = { id: "j1", tenant_id: TENANT, kind: "outbound_send", payload: {}, due_at: "2026-01-01T00:00:00Z", attempts: 1 };
  const asked = [];
  const db = fakeDb({}, {}, { claim_due_jobs: (args) => { asked.push(args); return [row]; } });
  assert.deepEqual(await claimNext(db, 90), row);
  assert.deepEqual(asked, [{ p_limit: 1, p_lease_seconds: 90 }], "one at a time: a claimed job is a started job");
  assert.equal(await claimNext(fakeDb({}, {}, { claim_due_jobs: () => [] }), 90), null);
  await assert.rejects(
    claimNext(fakeDb({}, {}, { claim_due_jobs: () => { throw new Error("canceling statement due to statement timeout"); } }), 90),
    /claim_due_jobs: canceling statement/,
    "a ledger that cannot be claimed from is an error, not an empty queue",
  );
});

test("finishing a job is a compare-and-swap on the claim that ran it", async () => {
  const jobs = [{ id: "j1", state: "fired", attempts: 2, lease_until: "2026-01-01T00:01:30Z", last_error: null }];
  const db = fakeDb({ jobs });
  assert.equal(await completeJob(db, { id: "j1", attempts: 1 }), false, "a run whose lease was taken back cannot finish the row");
  assert.equal(jobs[0].state, "fired");
  assert.equal(await completeJob(db, { id: "j1", attempts: 2 }), true);
  assert.equal(jobs[0].state, "done");
  assert.equal(jobs[0].lease_until, null);
  assert.equal(await failJob(db, { id: "j1", attempts: 2 }, "late"), false, "and a finished row cannot then be failed");
  assert.equal(jobs[0].state, "done");
});

test("a failure is recorded on the claim that ran it, its reason bounded", async () => {
  const jobs = [{ id: "j1", state: "fired", attempts: 1, lease_until: "2026-01-01T00:01:30Z", last_error: null }];
  assert.equal(await failJob(fakeDb({ jobs }), { id: "j1", attempts: 1 }, "x".repeat(900)), true);
  assert.equal(jobs[0].state, "failed");
  assert.equal(jobs[0].last_error.length, 500);
  assert.equal(jobs[0].lease_until, null);
});

test("a message still on its way is marked failed; one already sent is left exactly as it was", async () => {
  const messages = [
    { id: "m1", tenant_id: TENANT, status: "queued", error: null },
    { id: "m2", tenant_id: TENANT, status: "sent", error: null },
  ];
  const db = fakeDb({ messages });
  const send = (id) => ({ id: `job-${id}`, kind: "outbound_send", tenant_id: TENANT, payload: { message_id: id } });

  assert.deepEqual(await settleJob(db, send("m1"), false), [{ what: "message", changed: true }]);
  assert.equal(messages[0].status, "failed");
  assert.deepEqual(messages[0].error, { reason: "run_interrupted", note: "the run that was sending this did not finish" });

  // The run may have sent before it died, and a row that says so is the truth.
  assert.deepEqual(await settleJob(db, send("m2"), false), [{ what: "message", changed: false }]);
  assert.equal(messages[1].status, "sent");
  assert.equal(messages[1].error, null);
});

test("certain changes the words, never the condition", async () => {
  const messages = [{ id: "m1", tenant_id: TENANT, status: "queued", error: null }];
  await settleJob(fakeDb({ messages }), { id: "j", kind: "outbound_send", tenant_id: TENANT, payload: { message_id: "m1" } }, true);
  assert.deepEqual(messages[0].error, { reason: "never_delivered", note: "the job that would have sent this never ran" });
});

test("a broadcast mid-send is handed to a fresh run, with what it reached and what is left; only in its own workspace; failed only when no run can be written", async () => {
  // It used to be marked failed with the rest still queued for ever. The rest
  // go to a fresh run; the batch reads the message a dying run left rather
  // than sending twice (core-broadcast.test.mjs), which is what makes this safe.
  const broadcasts = [
    { id: "b1", tenant_id: TENANT, state: "sending", finished_at: null },
    { id: "b2", tenant_id: "22222222-2222-2222-2222-222222222222", state: "sending", finished_at: null },
    { id: "b3", tenant_id: TENANT, state: "sent", finished_at: "2026-09-12T00:00:00Z" },
  ];
  const broadcast_recipients = [
    { broadcast_id: "b1", contact_id: "k1", state: "sent" }, { broadcast_id: "b1", contact_id: "k2", state: "sent" },
    { broadcast_id: "b1", contact_id: "k3", state: "queued" }, { broadcast_id: "b1", contact_id: "k4", state: "queued" }, { broadcast_id: "b1", contact_id: "k5", state: "skipped" },
  ];
  const jobs = [];
  const db = fakeDb({ broadcasts, broadcast_recipients, jobs });
  const run = (id) => ({ id: "j", kind: "broadcast_send", tenant_id: TENANT, payload: { broadcast_id: id } });
  assert.deepEqual(await settleJob(db, run("b1"), false), [{ what: "broadcast", changed: true, resumed: true, reached: 2, remaining: 2 }]);
  assert.equal(broadcasts[0].state, "sending", "still sending: the fresh run carries it");
  assert.equal(jobs.length, 1);
  assert.equal(jobs[0].kind, "broadcast_send");
  assert.equal(jobs[0].tenant_id, TENANT);
  assert.deepEqual(jobs[0].payload, { broadcast_id: "b1" });
  assert.deepEqual(await settleJob(db, run("b2"), false), [{ what: "broadcast", changed: false }]);
  assert.equal(broadcasts[1].state, "sending", "another workspace's broadcast is not this job's to settle");
  assert.deepEqual(await settleJob(db, run("b3"), false), [{ what: "broadcast", changed: false }], "one that finished on its own is left as it finished");
  assert.equal(jobs.length, 1, "no run for either");
  // A ledger that refuses the fresh row: the honest failure, with both reasons.
  const refused = fakeDb({ broadcasts: [{ id: "b1", tenant_id: TENANT, state: "sending", finished_at: null }], broadcast_recipients, jobs: [] }, { "jobs.insert": { message: "jobs_guard says no" } });
  const out = await settleJob(refused, run("b1"), false);
  assert.equal(out[0].changed, true);
  assert.equal(out[0].resumed, undefined);
  assert.match(out[0].error, /jobs_guard says no/);
  assert.equal(out[0].reached, 2);
});

test("a settlement that cannot be written, or has nothing to point at, says so", async () => {
  const refused = fakeDb({ messages: [{ id: "m1", tenant_id: TENANT, status: "queued" }] }, { "messages.update": { message: "permission denied" } });
  assert.deepEqual(
    await settleJob(refused, { id: "j", kind: "outbound_send", tenant_id: TENANT, payload: { message_id: "m1" } }, false),
    [{ what: "message", changed: false, error: "permission denied" }],
  );
  assert.deepEqual(
    await settleJob(fakeDb({}), { id: "j", kind: "outbound_send", tenant_id: TENANT, payload: {} }, false),
    [{ what: "message", changed: false, error: "no message_id on the job" }],
  );
  assert.deepEqual(await settleJob(fakeDb({}), { id: "j", kind: "blob_thread_erase", tenant_id: TENANT, payload: {} }, false), []);
});

test("the owner reads what the writes returned, not what they meant to do", () => {
  assert.match(saySettled([{ what: "message", changed: true }]), /marked failed, so it is no longer shown as on its way/);
  assert.match(saySettled([{ what: "broadcast", changed: true }]), /people it had already reached still got it/);
  assert.equal(saySettled([{ what: "broadcast", changed: true, resumed: true, reached: 12, remaining: 30 }]), "The broadcast carries on in a fresh run: 12 reached so far, 30 still to go. Nobody is sent it twice.");
  assert.match(saySettled([{ what: "broadcast", changed: true, reached: 12, remaining: 30 }]), /the 12 it had already reached still got it, and 30 did not/);
  assert.match(saySettled([{ what: "message", changed: false, error: "permission denied" }]), /could not be updated \(permission denied\)/);
  assert.equal(saySettled([{ what: "message", changed: false }]), null, "a row that moved on by itself is nothing to report");
  assert.equal(saySettled([]), null);
});
