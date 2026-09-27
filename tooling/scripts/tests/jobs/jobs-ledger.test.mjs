/**
 * The ledger's rules, run: which claim goes ahead, how a run finishes the row,
 * and what a job that will not finish leaves behind. Everything here is a
 * value or a write to a double, so nothing in this file reads source.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { fakeDb } from "../_fake-db.mjs";
import {
  verdictFor,
  retryWait,
  claimNext,
  completeJob,
  failJob,
  deferJob,
  CLAIM_FOR_MS,
  YIELD_AT_MS,
  LEASE_SECONDS,
  MAX_ATTEMPTS,
  MAX_RESUMES,
  SPEAKS_TO_A_PERSON,
  RETRY_WAITS_MS,
} from "../../../../packages/jobs/src/ledger.ts";
import { JOB_KINDS } from "../../../../packages/contracts/src/shared/enums.ts";
import { settleJob, saySettled } from "../../../../packages/jobs/src/settle.ts";

const TENANT = "11111111-1111-1111-1111-111111111111";

test("a first run always runs", () => {
  for (const kind of JOB_KINDS) {
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
  assert.equal(verdictFor({ kind: "line_provision", attempts: 2 }), "run");
  assert.equal(verdictFor({ kind: "line_provision", attempts: MAX_ATTEMPTS }), "run");
  assert.equal(verdictFor({ kind: "line_provision", attempts: MAX_ATTEMPTS + 1 }), "give_up");
});

test("an intake that threw waits five minutes, then thirty, and its last try is not waited on", () => {
  assert.equal(retryWait({ kind: "email_ingest", attempts: 1 }), 5 * 60_000);
  assert.equal(retryWait({ kind: "email_ingest", attempts: 2 }), 30 * 60_000);
  assert.equal(
    retryWait({ kind: "email_ingest", attempts: MAX_ATTEMPTS }),
    null,
    "the last try fails the row and tells the owner",
  );
  for (const kind of ["outbound_send", "broadcast_send", "line_provision"]) {
    assert.equal(retryWait({ kind, attempts: 1 }), null, `${kind} fails on its first throw`);
  }
});

test("only a declared kind that speaks to nobody is tried again after a throw, and every wait it names is reached", () => {
  for (const [kind, waits] of Object.entries(RETRY_WAITS_MS)) {
    assert.ok(JOB_KINDS.includes(kind), `${kind} is a kind the ledger holds`);
    assert.ok(!SPEAKS_TO_A_PERSON.has(kind), `${kind}: a second try could reach a real person twice`);
    assert.ok(waits.length <= MAX_ATTEMPTS - 1, `${kind}: a wait past the last try is never reached`);
    assert.ok(
      waits.every((w) => w > LEASE_SECONDS * 1000),
      `${kind}: a wait no longer than a lease is not a wait`,
    );
  }
});

test("a job kept to be tried again keeps its claim and why, on the claim that ran it", async () => {
  const jobs = [{ id: "j1", state: "fired", attempts: 1, lease_until: "2026-01-01T00:01:30Z", last_error: null }];
  const db = fakeDb({ jobs });
  assert.equal(
    await deferJob(db, { id: "j1", attempts: 2 }, "2026-01-01T00:05:00Z", "late"),
    false,
    "a run that no longer holds the row cannot put it off",
  );
  assert.equal(jobs[0].lease_until, "2026-01-01T00:01:30Z");
  assert.equal(await deferJob(db, { id: "j1", attempts: 1 }, "2026-01-01T00:05:00Z", "x".repeat(900)), true);
  assert.deepEqual(
    [jobs[0].state, jobs[0].lease_until, jobs[0].last_error.length],
    ["fired", "2026-01-01T00:05:00Z", 500],
    "still fired, claimed again when the lease ends, why bounded",
  );
  jobs[0].state = "failed";
  assert.equal(
    await deferJob(db, { id: "j1", attempts: 1 }, "2026-01-01T00:35:00Z", "late"),
    false,
    "a failed row is never brought back",
  );
});

test("the timings nest: claiming stops, then handlers yield, then a lease runs out", () => {
  assert.ok(CLAIM_FOR_MS < YIELD_AT_MS, "a job claimed last still has time before its handler must yield");
  assert.ok(YIELD_AT_MS < LEASE_SECONDS * 1000, "and nothing is taken back while a handler can still be sending");
});

test("a claim asks for one job, hands it back, and is null when nothing is due", async () => {
  const row = {
    id: "j1",
    tenant_id: TENANT,
    kind: "outbound_send",
    payload: {},
    due_at: "2026-01-01T00:00:00Z",
    attempts: 1,
  };
  const asked = [];
  const db = fakeDb(
    {},
    {},
    {
      claim_due_jobs: (args) => {
        asked.push(args);
        return [row];
      },
    },
  );
  assert.deepEqual(await claimNext(db, 90), row);
  assert.deepEqual(asked, [{ p_limit: 1, p_lease_seconds: 90 }], "one at a time: a claimed job is a started job");
  assert.equal(await claimNext(fakeDb({}, {}, { claim_due_jobs: () => [] }), 90), null);
  await assert.rejects(
    claimNext(
      fakeDb(
        {},
        {},
        {
          claim_due_jobs: () => {
            throw new Error("canceling statement due to statement timeout");
          },
        },
      ),
      90,
    ),
    /claim_due_jobs: canceling statement/,
    "a ledger that cannot be claimed from is an error, not an empty queue",
  );
});

test("finishing a job is a compare-and-swap on the claim that ran it", async () => {
  const jobs = [{ id: "j1", state: "fired", attempts: 2, lease_until: "2026-01-01T00:01:30Z", last_error: null }];
  const db = fakeDb({ jobs });
  assert.equal(
    await completeJob(db, { id: "j1", attempts: 1 }),
    false,
    "a run whose lease was taken back cannot finish the row",
  );
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
  assert.deepEqual(messages[0].error, {
    reason: "run_interrupted",
    note: "the run that was sending this did not finish",
    outcome: "unknown",
  });

  // The run may have sent before it died, and a row that says so is the truth.
  assert.deepEqual(await settleJob(db, send("m2"), false), [{ what: "message", changed: false }]);
  assert.equal(messages[1].status, "sent");
  assert.equal(messages[1].error, null);
});

test("certain changes the words, never the condition", async () => {
  const messages = [{ id: "m1", tenant_id: TENANT, status: "queued", error: null }];
  await settleJob(
    fakeDb({ messages }),
    { id: "j", kind: "outbound_send", tenant_id: TENANT, payload: { message_id: "m1" } },
    true,
  );
  assert.deepEqual(messages[0].error, {
    reason: "never_delivered",
    note: "the job that would have sent this never ran",
  });
});

/** A broadcast's people, as the table really holds them: with a tenant on every row. */
const peopleOf = (broadcastId, states) =>
  states.map((state, i) => ({ tenant_id: TENANT, broadcast_id: broadcastId, contact_id: `k${i}`, state }));
const sending = (over = {}) => ({
  id: "b1",
  tenant_id: TENANT,
  state: "sending",
  finished_at: null,
  failure: null,
  ...over,
});
const ranAndDied = (payload) => ({ id: "j", kind: "broadcast_send", tenant_id: TENANT, payload });

test("a broadcast still in flight is handed to a fresh run, with what it reached and what is left; only in its own workspace", async () => {
  // It used to be marked failed with the rest still queued for ever. The rest
  // go to a fresh run; the batch reads the message a dying run left rather
  // than sending twice (core-broadcast.test.mjs), which is what makes this safe.
  const broadcasts = [
    sending(),
    sending({ id: "b2", tenant_id: "22222222-2222-2222-2222-222222222222" }),
    sending({ id: "b3", state: "sent", finished_at: "2026-09-12T00:00:00Z" }),
    // A run killed before it could move the row off 'scheduled' reached nobody,
    // and used to be left exactly there: not sending, not failed, not said, and
    // with no job anywhere that would ever pick the broadcast up again.
    sending({ id: "b4", state: "scheduled" }),
  ];
  const broadcast_recipients = [
    ...peopleOf("b1", ["sent", "sent", "queued", "queued", "skipped"]),
    ...peopleOf("b4", ["queued"]),
  ];
  const jobs = [];
  const db = fakeDb({ broadcasts, broadcast_recipients, jobs });
  const run = (id) => ranAndDied({ broadcast_id: id });
  assert.deepEqual(await settleJob(db, run("b1"), false), [
    { what: "broadcast", changed: true, resumed: true, reached: 2, remaining: 2 },
  ]);
  assert.equal(broadcasts[0].state, "sending", "still sending: the fresh run carries it");
  assert.equal(jobs.length, 1);
  assert.equal(jobs[0].kind, "broadcast_send");
  assert.equal(jobs[0].tenant_id, TENANT);
  assert.deepEqual(
    jobs[0].payload,
    { broadcast_id: "b1", resumes: 1 },
    "how many fresh runs it has had rides the payload; nothing else survives the run",
  );
  // COUNTED, never a page of rows: PostgREST caps a plain select at max_rows and
  // a broadcast may carry more people than that, so reading the rows to count
  // them understates exactly the broadcasts big enough for the number to matter.
  const counts = db.seen.filter((s) => s.table === "broadcast_recipients");
  assert.ok(counts.length > 0 && counts.every((s) => s.counted), "every recipient read here is a count");
  assert.deepEqual(await settleJob(db, run("b2"), false), [{ what: "broadcast", changed: false }]);
  assert.equal(broadcasts[1].state, "sending", "another workspace's broadcast is not this job's to settle");
  assert.deepEqual(
    await settleJob(db, run("b3"), false),
    [{ what: "broadcast", changed: false }],
    "one that finished on its own is left as it finished",
  );
  assert.equal(jobs.length, 1, "no run for either");
  assert.deepEqual(
    await settleJob(db, run("b4"), false),
    [{ what: "broadcast", changed: true, resumed: true, reached: 0, remaining: 1 }],
    "one that never left 'scheduled' is resumed, not stranded",
  );
  assert.equal(jobs.length, 2);
});

test("a broadcast whose dying run already scheduled the next batch is not handed a SECOND run", async () => {
  // The dying run may have scheduled its own next batch before it failed to
  // report back, and that chain has been working the queue for the ninety
  // seconds this row's lease took to expire. A second chain beside it reads the
  // same queued rows, finds no message written for them yet, and delivers to
  // every one of them AGAIN.
  const broadcasts = [sending()];
  const broadcast_recipients = peopleOf("b1", ["sent", "queued"]);
  const chain = (state, id = "j-next") => [
    { id, tenant_id: TENANT, kind: "broadcast_send", state, payload: { broadcast_id: "b1" } },
  ];
  for (const state of ["scheduled", "fired"]) {
    const jobs = chain(state);
    const out = await settleJob(
      fakeDb({ broadcasts, broadcast_recipients, jobs }),
      ranAndDied({ broadcast_id: "b1" }),
      false,
    );
    assert.deepEqual(out, [{ what: "broadcast", changed: false, resumed: true, reached: 1, remaining: 1 }], state);
    assert.equal(jobs.length, 1, `a ${state} run is already coming, so nothing is scheduled`);
  }
  const over = chain("done");
  await settleJob(fakeDb({ broadcasts, broadcast_recipients, jobs: over }), ranAndDied({ broadcast_id: "b1" }), false);
  assert.equal(over.length, 2, "a run that is over is not a run that is coming");
  const itself = chain("fired", "j");
  await settleJob(
    fakeDb({ broadcasts, broadcast_recipients, jobs: itself }),
    ranAndDied({ broadcast_id: "b1" }),
    false,
  );
  assert.equal(itself.length, 2, "and the row being settled is not its own successor");
  const elsewhere = [
    { id: "j-other", tenant_id: TENANT, kind: "broadcast_send", state: "scheduled", payload: { broadcast_id: "b9" } },
  ];
  await settleJob(
    fakeDb({ broadcasts, broadcast_recipients, jobs: elsewhere }),
    ranAndDied({ broadcast_id: "b1" }),
    false,
  );
  assert.equal(elsewhere.length, 2, "nor is a run for a different broadcast");
});

test("fresh runs are bounded: a broadcast whose runs never finish is failed, with its reason on the row", async () => {
  // settleJob mints a NEW row, with its own attempts of one, so MAX_ATTEMPTS
  // cannot reach it: without a bound, a broadcast that kills every run would
  // fail, resume, fail for ever, one owner alert per cycle.
  const broadcasts = [sending()];
  const broadcast_recipients = peopleOf("b1", ["sent", "queued"]);
  const jobs = [];
  const db = fakeDb({ broadcasts, broadcast_recipients, jobs });
  assert.deepEqual(
    await settleJob(db, ranAndDied({ broadcast_id: "b1", resumes: MAX_RESUMES - 1 }), false),
    [{ what: "broadcast", changed: true, resumed: true, reached: 1, remaining: 1 }],
    "the last one it is allowed",
  );
  assert.deepEqual(jobs[0].payload, { broadcast_id: "b1", resumes: MAX_RESUMES });
  jobs.length = 0;
  const out = await settleJob(db, ranAndDied({ broadcast_id: "b1", resumes: MAX_RESUMES }), false);
  assert.deepEqual(out, [
    {
      what: "broadcast",
      changed: true,
      notResumed: `${MAX_RESUMES} fresh runs in a row did not finish`,
      reached: 1,
      remaining: 1,
    },
  ]);
  assert.equal(jobs.length, 0, "and no more runs");
  assert.equal(broadcasts[0].state, "failed");
  assert.equal(broadcasts[0].failure, "run_interrupted", "the broadcast's own page says Failed AND why");
});

test("a ledger that refuses the fresh run fails the broadcast and says THAT, not that it may still be sending", async () => {
  const broadcasts = [sending()];
  const refused = fakeDb(
    { broadcasts, broadcast_recipients: peopleOf("b1", ["sent", "sent", "queued", "queued"]), jobs: [] },
    { "jobs.insert": { message: "jobs_guard says no" } },
  );
  const out = await settleJob(refused, ranAndDied({ broadcast_id: "b1" }), false);
  assert.equal(out[0].changed, true);
  assert.equal(out[0].resumed, undefined);
  assert.equal(out[0].error, undefined, "the broadcast WAS written; what failed was the reschedule");
  assert.match(out[0].notResumed, /jobs_guard says no/);
  assert.equal(out[0].reached, 2);
  assert.equal(broadcasts[0].state, "failed");
  assert.equal(broadcasts[0].failure, "run_interrupted");
  assert.match(
    saySettled(out),
    /could not be handed to a fresh run \(.*jobs_guard says no.*\), so it has been marked failed; the 2 it had already reached still got it, and 2 did not/,
  );
});

test("a count that could not be read is never reported as zero, and never risks a second run", async () => {
  const broadcasts = [sending()];
  const blind = fakeDb(
    { broadcasts, broadcast_recipients: [], jobs: [] },
    { "broadcast_recipients.select": { message: "statement timeout" } },
  );
  const out = await settleJob(blind, ranAndDied({ broadcast_id: "b1" }), false);
  assert.deepEqual(
    out,
    [{ what: "broadcast", changed: false, error: "statement timeout" }],
    "not '0 reached so far, 0 still to go'",
  );
  assert.equal(broadcasts[0].state, "sending");
  assert.match(saySettled(out), /could not be updated \(statement timeout\)/);
  // A ledger it cannot read is not a ledger with no run coming: scheduling one
  // on a guess is how the same people are sent the same template twice.
  const deaf = fakeDb(
    { broadcasts, broadcast_recipients: peopleOf("b1", ["queued"]), jobs: [] },
    { "jobs.select": { message: "statement timeout" } },
  );
  assert.deepEqual(await settleJob(deaf, ranAndDied({ broadcast_id: "b1" }), false), [
    { what: "broadcast", changed: false, reached: 0, remaining: 1, error: "statement timeout" },
  ]);
});

test("a settlement that cannot be written, or has nothing to point at, says so", async () => {
  const refused = fakeDb(
    { messages: [{ id: "m1", tenant_id: TENANT, status: "queued" }] },
    { "messages.update": { message: "permission denied" } },
  );
  assert.deepEqual(
    await settleJob(
      refused,
      { id: "j", kind: "outbound_send", tenant_id: TENANT, payload: { message_id: "m1" } },
      false,
    ),
    [{ what: "message", changed: false, error: "permission denied" }],
  );
  assert.deepEqual(
    await settleJob(fakeDb({}), { id: "j", kind: "outbound_send", tenant_id: TENANT, payload: {} }, false),
    [{ what: "message", changed: false, error: "no message_id on the job" }],
  );
  // A kind with nothing to settle leaves nothing behind that says it is still going.
  assert.deepEqual(
    await settleJob(fakeDb({}), { id: "j", kind: "line_provision", tenant_id: TENANT, payload: {} }, false),
    [],
  );
});

test("the owner reads what the writes returned, not what they meant to do", () => {
  assert.match(
    saySettled([{ what: "message", changed: true }]),
    /marked failed, so it is no longer shown as on its way/,
  );
  assert.match(saySettled([{ what: "broadcast", changed: true }]), /people it had already reached still got it/);
  // Not "nobody is sent it twice": a run killed between the wire accepting a
  // message and the row recording it leaves no row for the next run to read.
  const carriesOn =
    "The broadcast carries on in a fresh run: 12 reached so far, 30 still to go. Anyone it already recorded as sent is skipped, not sent again.";
  assert.equal(
    saySettled([{ what: "broadcast", changed: true, resumed: true, reached: 12, remaining: 30 }]),
    carriesOn,
  );
  assert.equal(
    saySettled([{ what: "broadcast", changed: false, resumed: true, reached: 12, remaining: 30 }]),
    carriesOn,
    "a run already coming reads the same to an owner",
  );
  assert.match(
    saySettled([{ what: "broadcast", changed: true, notResumed: "jobs_guard says no", reached: 12, remaining: 30 }]),
    /could not be handed to a fresh run \(jobs_guard says no\), so it has been marked failed; the 12 it had already reached still got it, and 30 did not/,
  );
  assert.match(
    saySettled([{ what: "broadcast", changed: true, reached: 12, remaining: 30 }]),
    /the 12 it had already reached still got it, and 30 did not/,
  );
  assert.match(
    saySettled([{ what: "message", changed: false, error: "permission denied" }]),
    /could not be updated \(permission denied\)/,
  );
  assert.equal(
    saySettled([{ what: "message", changed: false }]),
    null,
    "a row that moved on by itself is nothing to report",
  );
  // An email that was never stored has no thread to flag, so the alert says
  // where it WAS said -- and says the plain thing when the mailbox could not
  // be marked either, rather than claiming a mark that did not happen.
  assert.match(
    saySettled([{ what: "email", changed: false, mailbox: "marked" }]),
    /never stored, so there is no thread to flag; the workspace's mailbox now says an email could not be taken in/,
  );
  for (const m of [{}, { mailbox: "gone" }, { mailbox: "failed" }]) {
    assert.match(
      saySettled([{ what: "email", changed: false, ...m }]),
      /never stored, so there is nothing to flag for a person/,
      JSON.stringify(m),
    );
  }
  assert.match(
    saySettled([{ what: "email", changed: true, flagged: "opened", mailbox: "marked" }]),
    /in the Inbox and flagged for a person/,
    "the thread is the news when there is one",
  );
  assert.match(
    saySettled([{ what: "email", changed: false, error: "statement timeout" }]),
    /could not be flagged for a person \(statement timeout\)/,
  );
  assert.equal(saySettled([]), null);
});

test("a send that died mid-flight is unknown, so its receipt can still settle it; a campaign's email flags no thread (Part 2.6)", async () => {
  // A campaign's email is frozen with its unsubscribe (channels isCampaignEmail); a reply is not.
  const campaign = { email: { request: { headers: { "List-Unsubscribe": "<https://app.chanlytics.com/u/t>" } } } };
  const reply = { email: { request: { headers: {} } } };
  const messages = [
    {
      id: "m1",
      tenant_id: TENANT,
      conversation_id: "c1",
      channel: "email",
      sender: "ai",
      status: "queued",
      error: null,
      meta: campaign,
    },
    {
      id: "m2",
      tenant_id: TENANT,
      conversation_id: "c2",
      channel: "email",
      sender: "ai",
      status: "queued",
      error: null,
      meta: reply,
    },
  ];
  const escalations = [];
  const db = fakeDb({ messages, escalations });
  const send = (id) => ({ id: `job-${id}`, kind: "outbound_send", tenant_id: TENANT, payload: { message_id: id } });

  assert.deepEqual(await settleJob(db, send("m1"), false), [{ what: "message", changed: true }]);
  assert.equal(messages[0].error.outcome, "unknown", "the provider may have taken it: a receipt may still say so");
  assert.deepEqual(escalations, [], "nobody on a campaign's thread is waiting for an answer");

  const [settled] = await settleJob(db, send("m2"), false);
  assert.equal(settled.changed, true);
  assert.deepEqual(
    escalations.map((e) => [e.conversation_id, e.reason]),
    [["c2", "send_failed"]],
    "a reply that may never have left is still a customer to look at",
  );
});
