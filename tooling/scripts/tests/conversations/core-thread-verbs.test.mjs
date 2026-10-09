/**
 * The thread verbs, run: each port a fake that records its call, so what is
 * proved is the order and the outcome, not the routes' text.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { importSrc } from "../_source.mjs";
import { fakeDb } from "../_fake-db.mjs";

const core = await importSrc("packages/core/src/conversations/index.ts");
const NOW = Date.parse("2026-09-11T12:00:00Z");
const HOUR = 3_600_000;
const conv = (over = {}) => ({
  id: "c1",
  tenant_id: "t1",
  state: "open",
  paused_until: null,
  phone_e164: "+15550000001",
  ...over,
});

/** Every port answers a value (or a function of its arguments) and logs its call as [name, ...args]; pauseMs and now are reads and stay off the log. */
function fakes(over = {}) {
  const log = [];
  const answers = {
    pauseMs: 2 * HOUR,
    takeOver: { withdrawn_drafts: 1, decision_id: "d1" },
    handBack: { decision_id: "d1" },
    snooze: true,
    wake: true,
    archive: true,
    resolveEscalation: undefined,
    record: "d1",
    resolve: true,
    link: undefined,
    cancelQueued: true,
    cancelJob: 1,
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
const refused = async (p, code, status, words) =>
  assert.rejects(
    p,
    (e) =>
      e.code === code &&
      (status === undefined || e.status === status) &&
      (words === undefined || words.test(e.message)),
  );

test("take over: the pause is decided here, and the claim, the hold, the drafts and the ledger are one call", async () => {
  const { ports, log, call, ops } = fakes();
  const r = await core.takeOver(ports, { conv: conv() });
  const until = new Date(NOW + 2 * HOUR).toISOString();
  // How long is the verb's (the workspace's pause, from now); the door takes
  // the moment and writes the rest in one transaction (00364): the claim IS the
  // pause, the hold on who is speaking (00132) is taken with it, the drafts
  // written before it are withdrawn, and the ledger says who. Four writes on
  // two clients used to make this, and each after the first could fail with the
  // ones before it standing.
  assert.deepEqual(ops(), ["takeOver"]);
  assert.deepEqual(log[0], ["takeOver", "t1", "c1", until]);
  assert.equal(call("record"), undefined, "the decision is the door's: no second write records it");
  assert.deepEqual(r, { state: "needs_human", paused_until: until, decision_id: "d1", withdrawn_drafts: 1 });
  // A person reached by email alone is taken over EXACTLY as one with a number.
  // It used to differ: the first step was a mirror keyed by the phone number,
  // so a thread with none skipped it, and "does this person have a number" was
  // a branch in a verb that has nothing to do with numbers.
  const bare = fakes();
  const taken = await core.takeOver(bare.ports, { conv: conv({ phone_e164: null }) });
  assert.deepEqual(bare.ops(), ["takeOver"]);
  assert.equal(taken.paused_until, until);
});

test("take over: a door that changed no row is a 409 that leaves nothing behind", async () => {
  // There is nothing to undo now. The mirror this used to release was a second
  // store the receptionist read; the row is the only one, so a claim that
  // matched nothing simply did not happen, and the door wrote nothing after it.
  for (const c of [conv(), conv({ phone_e164: null })]) {
    const lost = fakes({ takeOver: null });
    await refused(core.takeOver(lost.ports, { conv: c }), "conflict", 409, /reload/);
    assert.deepEqual(lost.ops(), ["takeOver"]);
  }
});

test("hand back: the thread opened, the hold let go, the decision recorded and the open escalation resolved, as one call", async () => {
  const { ports, log, call, ops } = fakes();
  assert.deepEqual(await core.handBack(ports, { conv: conv() }), { state: "open", decision_id: "d1" });
  // The release and the hold let go are one transaction (00364): a release that
  // ran and a hold that then failed to go left the receptionist held off a
  // thread the Inbox showed open, which is the one direction this must not fail
  // in. Only this person's hold: somebody else's is the door's to leave alone.
  assert.deepEqual(ops(), ["handBack"]);
  assert.deepEqual(log[0], ["handBack", "t1", "c1"]);
  assert.equal(call("resolveEscalation"), undefined, "the escalation is resolved by the door, by its own decision");
  // With or without a number, held or not: the same one call. Each of those
  // used to change the shape, because a second store was keyed by the number.
  const bare = fakes();
  assert.deepEqual(
    await core.handBack(bare.ports, {
      conv: conv({ phone_e164: null, paused_until: new Date(NOW + HOUR).toISOString() }),
    }),
    { state: "open", decision_id: "d1" },
  );
  assert.deepEqual(bare.ops(), ["handBack"]);
});

test("hand back, snooze and archive: a row that did not change leaves nothing behind", async () => {
  // The compensation these carried -- release the receptionist's other store,
  // then put it back if the row turned out not to have changed -- is gone with
  // the store. What is left is the property it was reaching for, and it now
  // holds by construction: a verb that changed no row did nothing at all.
  const until = new Date(NOW + HOUR).toISOString();
  const hb = fakes({ handBack: null });
  await refused(core.handBack(hb.ports, { conv: conv({ paused_until: until }) }), "conflict", 409, /reload/);
  assert.deepEqual(hb.ops(), ["handBack"], "no decision and no resolve for a change that never happened");
  const sn = fakes({ snooze: false });
  await refused(
    core.snooze(sn.ports, { conv: conv({ paused_until: until }), until: new Date(NOW + 2 * HOUR).toISOString() }),
    "conflict",
    409,
    /reload/,
  );
  assert.deepEqual(sn.ops(), ["snooze"]);
  const ar = fakes({
    archive: () => {
      throw new Error("PostgREST blip");
    },
  });
  await assert.rejects(core.archive(ar.ports, { conv: conv({ paused_until: until }) }), /blip/);
  assert.deepEqual(ar.ops(), ["archive"], "a write that threw has nothing to compensate either");
});

test("snooze: a missing, malformed, past or too-distant until is refused before anything is touched", async () => {
  for (const until of [
    undefined,
    "yesterday",
    new Date(NOW - 1).toISOString(),
    new Date(NOW + core.MAX_SNOOZE_MS + 1).toISOString(),
  ]) {
    const { ports, ops } = fakes();
    await refused(core.snooze(ports, { conv: conv(), until }), "validation", undefined, /snooze/);
    assert.deepEqual(ops(), []);
  }
});

test("snooze: hides the thread, and leaves the escalation OPEN", async () => {
  const until = new Date(NOW + HOUR).toISOString();
  // A held thread and a plain one snooze identically: the UPDATE clears the
  // pause in the same statement that sets the wake time, so there is no
  // separate release to run, to forget, or to put back.
  const paused = fakes();
  const r = await core.snooze(paused.ports, {
    conv: conv({ paused_until: new Date(NOW + HOUR).toISOString() }),
    until,
  });
  assert.deepEqual(paused.ops(), ["snooze", "record"]);
  assert.deepEqual(r, { state: "snoozed", snooze_until: until, decision_id: "d1" });
  const plain = fakes();
  await core.snooze(plain.ports, { conv: conv(), until });
  assert.deepEqual(plain.ops(), ["snooze", "record"]);
  assert.deepEqual(plain.log[1], ["record", "t1", "conversation", "c1", "snooze", { until }]);
});

test("wake: only a snoozed thread wakes, only while still snoozed, and it goes back to being whatever it was", async () => {
  const { ports, ops } = fakes();
  assert.deepEqual(await core.wake(ports, { conv: conv({ state: "snoozed" }) }), { state: "open", decision_id: "d1" });
  assert.deepEqual(ops(), ["wake", "record"]);
  const open = fakes();
  await refused(core.wake(open.ports, { conv: conv({ state: "open" }) }), "conflict", 409, /not snoozed/);
  assert.deepEqual(open.ops(), []);
  const raced = fakes({ wake: false });
  await refused(core.wake(raced.ports, { conv: conv({ state: "snoozed" }) }), "conflict", 409, /reload/);
  assert.deepEqual(raced.ops(), ["wake"]);
});

test("archive: the thread closed and the escalation resolved, held or not", async () => {
  const { ports, ops } = fakes();
  assert.deepEqual(await core.archive(ports, { conv: conv({ paused_until: new Date(NOW + HOUR).toISOString() }) }), {
    state: "archived",
    decision_id: "d1",
  });
  assert.deepEqual(ops(), ["archive", "record", "resolveEscalation"]);
  const plain = fakes();
  await core.archive(plain.ports, { conv: conv() });
  assert.deepEqual(
    plain.ops(),
    ["archive", "record", "resolveEscalation"],
    "the same three, because closing a thread clears its pause in the one UPDATE",
  );
  const stale = fakes({ archive: false });
  await refused(core.archive(stale.ports, { conv: conv() }), "conflict", 409, /reload/);
  assert.deepEqual(stale.ops(), ["archive"]);
});

/* -------------------------------------------------------------------------- *
 * And the rows those ports actually write.
 *
 * The verbs above no longer release the receptionist themselves -- the UPDATE
 * does it, in the same statement that moves the state. That is only true if
 * the UPDATE says so, so it is read here rather than assumed: this is the half
 * that used to be covered by a compensation step nobody could see failing. The
 * take-over's and the hand-back's UPDATEs are SQL's own now (00364), held to
 * the same table on a real database in
 * conversations/take-over-and-hand-back-are-one-write.db.test.mjs.
 * -------------------------------------------------------------------------- */

test("every state a verb writes clears what that state cannot coexist with", async () => {
  const { threadPorts } = await import("../../../../apps/dashboard/src/server/ports/core-ports.ts");
  const held = () => ({
    id: "c1",
    tenant_id: "t1",
    state: "needs_human",
    paused_until: new Date(NOW + HOUR).toISOString(),
    snooze_until: null,
    assignee_user_id: "u1",
  });

  for (const [verb, call, expect] of [
    [
      "snooze",
      (p) => p.snooze("c1", new Date(NOW + 2 * HOUR).toISOString()),
      { state: "snoozed", paused_until: null, assignee_user_id: null },
    ],
    ["archive", (p) => p.archive("c1"), { state: "archived", paused_until: null, assignee_user_id: null }],
  ]) {
    const conversations = [held()];
    const ports = threadPorts({ supabase: fakeDb({ conversations }), userId: "u1" });
    assert.equal(await call(ports), true, verb);
    for (const [col, want] of Object.entries(expect))
      assert.deepEqual(conversations[0][col], want, `${verb} leaves ${col} as ${String(want)}`);
  }
});
