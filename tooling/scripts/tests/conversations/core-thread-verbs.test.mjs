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
    claim: true,
    release: true,
    snooze: true,
    wake: true,
    archive: true,
    takeControl: undefined,
    letControlGo: undefined,
    withdrawDrafts: 1,
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

test("take over: the claim IS the pause, then the hold, then the drafts, then the ledger", async () => {
  const { ports, log, call, ops } = fakes();
  const r = await core.takeOver(ports, { conv: conv(), userId: "u1" });
  const until = new Date(NOW + 2 * HOUR).toISOString();
  // The hold on who is speaking (00132) is taken between the claim and the
  // withdrawal, and that position is the point of it: a draft written in the
  // same second still reaches the wire, and the wire asks this.
  assert.deepEqual(ops(), ["claim", "takeControl", "withdrawDrafts", "record"]);
  assert.deepEqual(log[0], ["claim", "c1", until, "u1"]);
  assert.deepEqual(call("record"), ["record", "t1", "conversation", "c1", "take_over", { paused_until: until }]);
  assert.deepEqual(r, { state: "needs_human", paused_until: until, decision_id: "d1", withdrawn_drafts: 1 });
  // A person reached by email alone is taken over EXACTLY as one with a number.
  // It used to differ: the first step was a mirror keyed by the phone number,
  // so a thread with none skipped it, and "does this person have a number" was
  // a branch in a verb that has nothing to do with numbers.
  const bare = fakes();
  const taken = await core.takeOver(bare.ports, { conv: conv({ phone_e164: null }), userId: "u1" });
  assert.deepEqual(bare.ops(), ["claim", "takeControl", "withdrawDrafts", "record"]);
  assert.equal(taken.paused_until, until);
});

test("take over: a claim that changed no row is a 409 that leaves nothing behind", async () => {
  // There is nothing to undo now. The mirror this used to release was a second
  // store the receptionist read; the row is the only one, so a claim that
  // matched nothing simply did not happen.
  for (const c of [conv(), conv({ phone_e164: null })]) {
    const lost = fakes({ claim: false });
    await refused(core.takeOver(lost.ports, { conv: c, userId: "u1" }), "conflict", 409, /reload/);
    assert.deepEqual(lost.ops(), ["claim"]);
  }
});

test("hand back: the thread opened, the hold let go, the decision recorded, and the open escalation resolved by it", async () => {
  const { ports, log, call, ops } = fakes();
  assert.deepEqual(await core.handBack(ports, { conv: conv(), userId: "u1" }), { state: "open", decision_id: "d1" });
  // The hold goes LAST, and only if it is ours: a release that ran first and
  // then failed to open the row would leave the receptionist free on a thread
  // still marked for a person, which is the one direction this must not fail in.
  assert.deepEqual(ops(), ["release", "letControlGo", "record", "resolveEscalation"]);
  assert.deepEqual(log[0], ["release", "c1"]);
  assert.deepEqual(call("resolveEscalation"), ["resolveEscalation", "c1", "d1"]);
  assert.deepEqual(
    call("letControlGo"),
    ["letControlGo", "t1", "c1", "u1"],
    "only this person\u2019s hold: somebody else\u2019s is left where it is",
  );
  // With or without a number, held or not: the same four calls. Each of those
  // used to change the shape, because a second store was keyed by the number.
  const bare = fakes();
  assert.deepEqual(
    await core.handBack(bare.ports, {
      conv: conv({ phone_e164: null, paused_until: new Date(NOW + HOUR).toISOString() }),
    }),
    { state: "open", decision_id: "d1" },
  );
  assert.deepEqual(bare.ops(), ["release", "letControlGo", "record", "resolveEscalation"]);
});

test("hand back, snooze and archive: a row that did not change leaves nothing behind", async () => {
  // The compensation these carried -- release the receptionist's other store,
  // then put it back if the row turned out not to have changed -- is gone with
  // the store. What is left is the property it was reaching for, and it now
  // holds by construction: a verb that changed no row did nothing at all.
  const until = new Date(NOW + HOUR).toISOString();
  const hb = fakes({ release: false });
  await refused(
    core.handBack(hb.ports, { conv: conv({ paused_until: until }), userId: "u1" }),
    "conflict",
    409,
    /reload/,
  );
  assert.deepEqual(hb.ops(), ["release"], "no decision and no resolve for a change that never happened");
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
    const { ports, call, ops } = fakes();
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
 * that used to be covered by a compensation step nobody could see failing.
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
      "claim",
      (p) => p.claim("c1", new Date(NOW + HOUR).toISOString(), "u1"),
      { state: "needs_human", snooze_until: null, assignee_user_id: "u1" },
    ],
    [
      "release",
      (p) => p.release("c1"),
      { state: "open", paused_until: null, snooze_until: null, assignee_user_id: null },
    ],
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
