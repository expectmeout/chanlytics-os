/**
 * The thread verbs, run: each port a fake that records its call, so what is
 * proved is the order and the outcome, not the routes' text.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { importSrc } from "./_source.mjs";

const core = await importSrc("packages/core/src/conversations/index.ts");
const NOW = Date.parse("2026-09-11T12:00:00Z");
const HOUR = 3_600_000;
const conv = (over = {}) => ({ id: "c1", tenant_id: "t1", state: "open", paused_until: null, phone_e164: "+15550000001", ...over });

/** Every port answers a value (or a function of its arguments) and logs its call as [name, ...args]; pauseMs and now are reads and stay off the log. */
function fakes(over = {}) {
  const log = [];
  const answers = {
    pauseMs: 2 * HOUR, pauseBot: undefined, claim: true, release: true, snooze: true, wake: true, archive: true,
    takeControl: undefined, letControlGo: undefined,
    withdrawDrafts: 1, resolveEscalation: undefined, record: "d1", resolve: true, link: undefined, cancelQueued: true, cancelJob: 1,
    ...over,
  };
  const ports = { now: () => NOW };
  for (const [name, answer] of Object.entries(answers)) {
    ports[name] = async (...args) => {
      if (name !== "pauseMs") log.push([name, ...args]);
      return typeof answer === "function" ? answer(...args) : answer;
    };
  }
  // By NAME, never by position: indexing the log means one new step in a verb
  // renumbers assertions in tests that have nothing to do with the change.
  const call = (name) => log.find((l) => l[0] === name);
  return { ports, log, call, ops: () => log.map((l) => l[0]) };
}
const refused = async (p, code, status, words) => assert.rejects(p, (e) => e.code === code && (status === undefined || e.status === status) && (words === undefined || words.test(e.message)));

test("take over: the bot is paused FIRST, then the claim, then the drafts, then the ledger; a thread with no number has no mirror to pause and is taken all the same", async () => {
  const { ports, log, call, ops } = fakes();
  const r = await core.takeOver(ports, { conv: conv(), userId: "u1" });
  const until = new Date(NOW + 2 * HOUR).toISOString();
  // The hold on who is speaking (00130) is taken between the claim and the
  // withdrawal, and that position is the point of it: a draft written in the
  // same second still reaches the wire, and the wire asks this.
  assert.deepEqual(ops(), ["pauseBot", "claim", "takeControl", "withdrawDrafts", "record"]);
  assert.deepEqual(log[0], ["pauseBot", "t1", "+15550000001", NOW + 2 * HOUR]);
  assert.deepEqual(log[1], ["claim", "c1", until, "u1"]);
  assert.deepEqual(call("record"), ["record", "t1", "conversation", "c1", "take_over", { paused_until: until }]);
  assert.deepEqual(r, { state: "needs_human", paused_until: until, decision_id: "d1", withdrawn_drafts: 1 });
  // A person with an email and no number: the mirror is the number's store, so there is none; the row holds the thread.
  const bare = fakes();
  const taken = await core.takeOver(bare.ports, { conv: conv({ phone_e164: null }), userId: "u1" });
  assert.deepEqual(bare.ops(), ["claim", "takeControl", "withdrawDrafts", "record"]);
  assert.equal(taken.paused_until, until);
  const lost = fakes({ claim: false });
  await refused(core.takeOver(lost.ports, { conv: conv({ phone_e164: null }), userId: "u1" }), "conflict", 409, /reload/);
  assert.deepEqual(lost.ops(), ["claim"], "and a lost claim has no mirror to release");
});

test("take over: a claim that changed no row releases the pause it mirrored and is a 409, with no decision", async () => {
  const { ports, log, call, ops } = fakes({ claim: false });
  await refused(core.takeOver(ports, { conv: conv(), userId: "u1" }), "conflict", 409, /reload/);
  assert.deepEqual(ops(), ["pauseBot", "claim", "pauseBot"]);
  assert.equal(log[2][3], 0, "the second mirror releases");
});

test("hand back: the pause released, the thread opened, the decision recorded, and the open escalation resolved by it", async () => {
  const { ports, log, call, ops } = fakes();
  assert.deepEqual(await core.handBack(ports, { conv: conv(), userId: "u1" }), { state: "open", decision_id: "d1" });
  // The hold goes LAST, and only if it is ours: a release that ran first and
  // then failed to open the row would leave the receptionist free on a thread
  // still marked for a person, which is the one direction this must not fail in.
  assert.deepEqual(ops(), ["pauseBot", "release", "letControlGo", "record", "resolveEscalation"]);
  assert.deepEqual(log[0], ["pauseBot", "t1", "+15550000001", 0]);
  assert.deepEqual(call("resolveEscalation"), ["resolveEscalation", "c1", "d1"]);
  assert.deepEqual(call("letControlGo"), ["letControlGo", "t1", "c1", "u1"], "only this person’s hold: somebody else’s is left where it is");
  const stale = fakes({ release: false });
  await refused(core.handBack(stale.ports, { conv: conv(), userId: "u1" }), "conflict", 409, /reload/);
  assert.deepEqual(stale.ops(), ["pauseBot", "release"], "no decision and no resolve for a change that never happened");
  const bare = fakes();
  assert.deepEqual(await core.handBack(bare.ports, { conv: conv({ phone_e164: null, paused_until: new Date(NOW + HOUR).toISOString() }) }), { state: "open", decision_id: "d1" });
  assert.deepEqual(bare.ops(), ["release", "letControlGo", "record", "resolveEscalation"], "a thread with no number is handed back with no mirror to release");
});

test("hand back, snooze and archive: a row that did not change gets its pause back, so the receptionist never speaks under a person still holding the thread", async () => {
  const until = new Date(NOW + HOUR).toISOString();
  const hb = fakes({ release: false });
  await refused(core.handBack(hb.ports, { conv: conv({ paused_until: until }), userId: "u1" }), "conflict", 409, /reload/);
  assert.deepEqual(hb.ops(), ["pauseBot", "release", "pauseBot"]);
  assert.equal(hb.log[2][3], NOW + HOUR, "mirrored back as it was");
  const sn = fakes({ snooze: false });
  await refused(core.snooze(sn.ports, { conv: conv({ paused_until: until }), until: new Date(NOW + 2 * HOUR).toISOString() }), "conflict", 409, /reload/);
  assert.deepEqual(sn.ops(), ["pauseBot", "snooze", "pauseBot"]);
  assert.equal(sn.log[2][3], NOW + HOUR);
  const ar = fakes({ archive: () => { throw new Error("PostgREST blip"); } });
  await assert.rejects(core.archive(ar.ports, { conv: conv({ paused_until: until }) }), /blip/);
  assert.deepEqual(ar.ops(), ["pauseBot", "archive", "pauseBot"], "a write that threw is compensated too");
});

test("snooze: a missing, malformed, past or too-distant until is refused before anything is touched", async () => {
  for (const until of [undefined, "yesterday", new Date(NOW - 1).toISOString(), new Date(NOW + core.MAX_SNOOZE_MS + 1).toISOString()]) {
    const { ports, call, ops } = fakes();
    await refused(core.snooze(ports, { conv: conv(), until }), "validation", undefined, /snooze/);
    assert.deepEqual(ops(), []);
  }
});

test("snooze: releases the receptionist's pause only when the thread holds one, hides the thread, and leaves the escalation OPEN", async () => {
  const until = new Date(NOW + HOUR).toISOString();
  const paused = fakes();
  const r = await core.snooze(paused.ports, { conv: conv({ paused_until: new Date(NOW + HOUR).toISOString() }), until });
  assert.deepEqual(paused.ops(), ["pauseBot", "snooze", "record"]);
  assert.equal(paused.log[0][3], 0, "released, not extended");
  assert.deepEqual(r, { state: "snoozed", snooze_until: until, decision_id: "d1" });
  const plain = fakes();
  await core.snooze(plain.ports, { conv: conv(), until });
  assert.deepEqual(plain.ops(), ["snooze", "record"]);
  assert.deepEqual(plain.log[1], ["record", "t1", "conversation", "c1", "snooze", { until }]);
  const stale = fakes({ snooze: false });
  await refused(core.snooze(stale.ports, { conv: conv(), until }), "conflict", 409, /reload/);
  assert.deepEqual(stale.ops(), ["snooze"]);
});

test("wake: only a snoozed thread wakes, only while still snoozed, and it goes back to being whatever it was", async () => {
  const { ports, call, ops } = fakes();
  assert.deepEqual(await core.wake(ports, { conv: conv({ state: "snoozed" }) }), { state: "open", decision_id: "d1" });
  assert.deepEqual(ops(), ["wake", "record"]);
  const open = fakes();
  await refused(core.wake(open.ports, { conv: conv({ state: "open" }) }), "conflict", 409, /not snoozed/);
  assert.deepEqual(open.ops(), []);
  const raced = fakes({ wake: false });
  await refused(core.wake(raced.ports, { conv: conv({ state: "snoozed" }) }), "conflict", 409, /reload/);
  assert.deepEqual(raced.ops(), ["wake"]);
});

test("archive: a paused thread's receptionist is released, the thread closed, the escalation resolved", async () => {
  const { ports, call, ops } = fakes();
  assert.deepEqual(await core.archive(ports, { conv: conv({ paused_until: new Date(NOW + HOUR).toISOString() }) }), { state: "archived", decision_id: "d1" });
  assert.deepEqual(ops(), ["pauseBot", "archive", "record", "resolveEscalation"]);
  const plain = fakes();
  await core.archive(plain.ports, { conv: conv() });
  assert.deepEqual(plain.ops(), ["archive", "record", "resolveEscalation"], "no pause, nothing to release");
  const stale = fakes({ archive: false });
  await refused(core.archive(stale.ports, { conv: conv() }), "conflict", 409, /reload/);
  assert.deepEqual(stale.ops(), ["archive"]);
});

test("resolve: an already-resolved escalation is an answer, not an error; the update lands before the ledger; the decision is linked back", async () => {
  const done = fakes();
  assert.deepEqual(await core.resolveEscalation(done.ports, { esc: { id: "e1", tenant_id: "t1", state: "resolved" } }), { state: "resolved", already: true });
  assert.deepEqual(done.ops(), []);
  const { ports, ops, log } = fakes();
  assert.deepEqual(await core.resolveEscalation(ports, { esc: { id: "e1", tenant_id: "t1", state: "open" } }), { state: "resolved", decision_id: "d1" });
  assert.deepEqual(ops(), ["resolve", "record", "link"]);
  assert.deepEqual(log[1], ["record", "t1", "escalation", "e1", "resolve"]);
  assert.deepEqual(log[2], ["link", "e1", "d1"]);
  const raced = fakes({ resolve: false });
  await refused(core.resolveEscalation(raced.ports, { esc: { id: "e1", tenant_id: "t1", state: "open" } }), "conflict", 409, /already resolved/);
  assert.deepEqual(raced.ops(), ["resolve"]);
});

test("cancel a send: only a queued row, the row before the job, and the words when the job won", async () => {
  const { ports, ops, log } = fakes();
  assert.deepEqual(await core.cancelSend(ports, { msg: { id: "m1", tenant_id: "t1", status: "queued" } }), { status: "canceled", decision_id: "d1" });
  assert.deepEqual(ops(), ["cancelQueued", "cancelJob", "record"]);
  assert.deepEqual(log[2], ["record", "t1", "message", "m1", "cancel_send"]);
  const sent = fakes();
  await refused(core.cancelSend(sent.ports, { msg: { id: "m1", tenant_id: "t1", status: "sent" } }), "conflict", undefined, /already been sent/);
  assert.deepEqual(sent.ops(), []);
  const raced = fakes({ cancelQueued: false });
  await refused(core.cancelSend(raced.ports, { msg: { id: "m1", tenant_id: "t1", status: "queued" } }), "conflict", undefined, /while you were canceling/);
  assert.deepEqual(raced.ops(), ["cancelQueued"]);
});
