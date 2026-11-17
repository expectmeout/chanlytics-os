/**
 * The count of how call backs came to be and what became of them (tooling/scripts/ops/voice/call-backs-measure.mjs,
 * decision 0136): every hold once in each table, and the rule's own cell apart. The script's three reads were written
 * against PostgREST's own syntax; here its counting and its words are run.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { measureCallBacks, measureText } from "../../../tooling/scripts/ops/voice/call-backs-measure.mjs";

const NOW = Date.parse("2026-11-17T12:00:00Z");
const ago = (days) => new Date(NOW - days * 86_400_000).toISOString();
const hold = (n, details, over = {}) => ({
  id: `h${n}`,
  conversation_id: `c${n}`,
  details,
  state: "open",
  created_at: ago(2),
  updated_at: ago(2),
  resolved_by_user_id: null,
  ...over,
});
const MISSED = "Missed call: it rang and never connected. Call them back.";
const HUNG_UP = "Hung up after 6 sec without a word. Call them back.";
const thread = (n, over = {}) => [
  `c${n}`,
  { id: `c${n}`, contact_id: `k${n}`, set_aside_at: null, set_aside_why: null, ...over },
];
const person = (n, phone, over = {}) => [
  `k${n}`,
  { id: `k${n}`, phone_e164: phone, acquired_via: "call", name_source: null, ...over },
];

test("each hold is counted once by what asked for it, who rang, and how it ended; the rule's own cell is named apart", () => {
  const holds = [
    hold(1, MISSED, { created_at: ago(40), updated_at: ago(40) }),
    hold(2, HUNG_UP, { state: "resolved", resolved_by_user_id: "u1" }),
    hold(3, "Call Priya back about Saturday.", { state: "resolved" }),
    hold(4, MISSED),
    hold(5, MISSED),
    hold(6, HUNG_UP),
  ];
  const threads = new Map([
    thread(1),
    thread(2),
    thread(3),
    thread(4),
    thread(5, { set_aside_why: "pitch" }),
    thread(6, { contact_id: null }),
  ]);
  const people = new Map([
    person(1, "+18665550142"),
    person(2, "+18005550199"),
    person(3, "+16465550123", { name_source: "typed" }),
    person(4, "+16465550124", { acquired_via: "calendar" }),
    person(5, "+16465550125"),
  ]);
  const m = measureCallBacks(holds, threads, people, NOW);
  assert.equal(m.holds, 6);
  assert.deepEqual(m.asked_by, { silence: 5, words: 1 });
  assert.deepEqual(m.number, { toll_free: 2, other: 3, withheld: 1 });
  assert.deepEqual(m.who, { only_rang: 3, brought_or_named: 2, said_not_a_customer: 1 });
  assert.deepEqual(m.ending, { open_past_a_week: 1, closed_by_a_person: 1, closed_by_the_platform: 1, open: 3 });
  assert.deepEqual(m.silent_toll_free_stranger, { holds: 2, ending: { open_past_a_week: 1, closed_by_a_person: 1 } });
  assert.deepEqual(m.silent_stranger, { holds: 3, ending: { open_past_a_week: 1, closed_by_a_person: 1, open: 1 } });
  const said = measureText(m, 90);
  assert.match(said, /^Call backs opened in the last 90 days: 6$/m);
  assert.match(said, /^ {2}Asked by: silence 5, words 1$/m);
  assert.match(said, /only ever rang \(no hold from now on\): 2$/m);
  assert.doesNotMatch(said, /\+1|555/, "counts alone: never a number");
});

test("nothing to count says so, and a hold whose thread is gone is still counted", () => {
  const none = measureCallBacks([], new Map(), new Map(), NOW);
  assert.equal(none.holds, 0);
  assert.match(measureText(none, 30), /Asked by: none/);
  const gone = measureCallBacks([hold(9, MISSED)], new Map(), new Map(), NOW);
  assert.deepEqual([gone.holds, gone.number, gone.who], [1, { withheld: 1 }, { only_rang: 1 }]);
});
