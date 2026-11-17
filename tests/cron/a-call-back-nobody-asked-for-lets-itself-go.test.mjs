/**
 * A call back nobody asked for in words lets itself go (decision 0136): the deadman tick's hourly pass
 * (apps/edge/lib/receptionist/quiet-call-backs.ts), run over a database in memory.
 *
 * A call that reached no answer opens the thread's `callback` hold, and it stood for ever, folded at Needs you's foot as
 * "1 waiting over a week". A week after anything last happened to it, where the business does not talk with the caller
 * and no member said they are a person, it is resolved with no member named. A call back someone asked for in words,
 * one younger than a week, one from someone the business talks with, and one a member answered anyway are left alone.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { fakeDb } from "../_fake-db.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const at = (rel) => pathToFileURL(path.join(ROOT, rel)).href;
const { quietPassDue, sweepQuietCallBacks } = await import(at("apps/edge/lib/receptionist/quiet-call-backs.ts"));

const NOW = Date.parse("2026-11-17T09:03:00Z");
const DAY = 86_400_000;
const T = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const ago = (days) => new Date(NOW - days * DAY).toISOString();
const MISSED = "Missed call: it rang and never connected. Call them back.";
const HUNG_UP = "Hung up after 6 sec without a word. Call them back.";

/** A person, their thread and its open call back: `n` names all three. */
const held = (n, details, days, over = {}) => ({
  contact: { id: `k${n}`, tenant_id: T, acquired_via: "call", name_source: null, ...over.contact },
  thread: { id: `c${n}`, tenant_id: T, contact_id: `k${n}`, set_aside_at: null, set_aside_why: null, ...over.thread },
  hold: {
    // Ids in order, so a pass from any pivot is read both sides of it.
    id: `0000000${n}-0000-4000-8000-000000000000`,
    tenant_id: T,
    conversation_id: `c${n}`,
    reason: "callback",
    details,
    state: "open",
    created_at: ago(days),
    updated_at: ago(days),
    ...over.hold,
  },
});

function world(people, more = {}) {
  const tables = {
    contacts: people.map((p) => p.contact),
    conversations: people.map((p) => p.thread),
    escalations: people.map((p) => p.hold),
    messages: [],
    calls: [],
    decisions: [],
    ...more,
  };
  const lines = [];
  const say = (level) => (event, fields) => lines.push({ level, event, ...fields });
  const L = { info: say("info"), warn: say("warn"), error: say("error") };
  const run = (over = {}) =>
    sweepQuietCallBacks({
      db: fakeDb(tables),
      L,
      deadline: NOW + 20_000,
      now: () => NOW,
      pivot: "00000004-0000-4000-8000-000000000000",
      ...over,
    });
  const stateOf = (n) => tables.escalations.find((e) => e.conversation_id === `c${n}`).state;
  return { tables, lines, run, stateOf };
}

test("REGRESSION: a silent call's hold, a week quiet, from nobody the business talks with, is let go; one asked for in words never is", async () => {
  const w = world([
    held(1, MISSED, 39),
    held(2, HUNG_UP, 8),
    held(3, "Call Priya back about Saturday's colour.", 39),
    held(5, MISSED, 6),
    held(6, HUNG_UP, 30),
  ]);
  assert.deepEqual(await w.run(), { letGo: 3 });
  assert.equal(w.stateOf(1), "resolved", "the dial that never connected, five weeks on");
  assert.equal(w.stateOf(2), "resolved", "the one who hung up without a word, past its week");
  assert.equal(w.stateOf(6), "resolved", "and one the other side of where the pass began");
  assert.equal(w.stateOf(3), "open", "they asked for the call back: it is owed until someone makes it");
  assert.equal(w.stateOf(5), "open", "six days: still inside its week");
  assert.deepEqual(
    w.lines.filter((l) => l.event === "call_back_let_go").map((l) => l.conversation),
    ["c1", "c6", "c2"],
    "each said, by its thread: the missed calls, then the hang-ups from where the pass began and round to its start",
  );
  assert.deepEqual(await w.run(), { letGo: 0 }, "a second pass finds none open");
});

test("someone the business talks with, and someone a member answered anyway, keep their call back however old", async () => {
  const w = world(
    [
      held(1, MISSED, 39),
      held(2, MISSED, 39, { contact: { acquired_via: "calendar" } }),
      held(3, MISSED, 39, { contact: { name_source: "typed" } }),
      held(5, MISSED, 39),
      held(6, MISSED, 39),
    ],
    {
      // The business wrote to the first; it phoned the fifth; a member said Reply anyway on the sixth.
      messages: [{ id: "m1", tenant_id: T, conversation_id: "c1", direction: "outbound", sender: "human" }],
      calls: [{ id: "call1", tenant_id: T, contact_id: "k5", direction: "outbound" }],
      decisions: [
        {
          id: "d1",
          tenant_id: T,
          subject_type: "conversation",
          subject_id: "c6",
          verb: "reply_anyway",
          payload: {},
          created_at: ago(20),
        },
      ],
    },
  );
  assert.deepEqual(await w.run(), { letGo: 0 });
  for (const n of [1, 2, 3, 5, 6]) assert.equal(w.stateOf(n), "open", `c${n}`);
});

test("a call's own note in the thread is nobody's words: the caller is still a stranger", async () => {
  const w = world([held(1, MISSED, 39)], {
    messages: [
      { id: "note", tenant_id: T, conversation_id: "c1", direction: "inbound", sender: "system", type: "call_summary" },
    ],
  });
  assert.deepEqual(await w.run(), { letGo: 1 });
});

test("past its time the pass stops and leaves the rest for the next; it runs in one tick of each hour's six", async () => {
  const w = world([held(1, MISSED, 39), held(2, MISSED, 39)]);
  assert.deepEqual(await w.run({ deadline: NOW - 1 }), { letGo: 0 });
  assert.equal(w.stateOf(1), "open");
  const hour = Date.parse("2026-11-17T09:00:00Z");
  assert.deepEqual(
    [0, 9, 10, 20, 30, 40, 50, 59].map((min) => quietPassDue(hour + min * 60_000)),
    [true, true, false, false, false, false, false, false],
  );
});
