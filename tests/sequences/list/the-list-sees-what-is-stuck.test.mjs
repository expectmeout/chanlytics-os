/**
 * The Sequences list sees what is stuck (decision 0128, stage 2; the canvas's call S4: a sequence that should be going
 * and isn't needs you).
 *
 * Three facts the list's read gains, and the line each gives:
 *  - `stuck`: leads on a running cold email's list that its first step refuses for a reason their owner can mend (their
 *    email came back "Couldn't check"), and since when: "3 leads couldn’t be checked · since Oct 29", in Needs you.
 *  - `last_run_off`, `last_run_for`: a customer's sequence that is on and whose last run did nothing, and why: "Didn’t
 *    run · no calendar is connected", in Needs you.
 *  - `between`: who is between two steps with a time to come: "Next tomorrow 9:30 AM · 9 people" in place of "18 in it".
 * A server before the read's change answers none of them, and every row says what it said.
 *
 * Run on rows as GET sequences answers them, in New York on Wednesday 11 Nov 2026 at 3:00 PM.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { byLongestWait, sequenceGroupOf, sequenceRowLine } from "@chanlytics/contracts";

const TZ = "America/New_York";
const NOW = Date.parse("2026-11-11T20:00:00Z");
const AT = { tz: TZ, nowMs: NOW, word: "meeting", twin: null };
const NONE = { waiting: 0, waiting_people: 0, held: 0, to_send: 0, replies: 0, oldest_at: null, batches: [] };
const FIRST = {
  id: "seq",
  kind: "moment",
  trigger: "visit_tomorrow",
  state: "running",
  policy_class: "reminder",
  run_hour: 9,
  list_id: null,
  list_key: null,
  list_name: null,
  search_id: null,
  search_name: null,
  source_search_id: null,
  source_name: null,
  owner_sends: false,
  until: null,
  words_ok_at: null,
  template_name: "meeting_reminder",
  template_language: "en_US",
};
const row = (over = {}) => ({
  id: "seq",
  name: "Meeting reminder",
  starts: "moment",
  state: "on",
  mode: "veto",
  created_at: "2026-11-03T14:03:51Z",
  first: FIRST,
  date: null,
  steps: 2,
  unwritten: 0,
  channels: ["whatsapp"],
  needs: NONE,
  next: null,
  last: null,
  in_it: 0,
  ...over,
});
const lead = (over = {}) =>
  row({
    name: "Brooklyn businesses",
    starts: "leads",
    first: { ...FIRST, kind: "reach_out", trigger: "lead_first", search_id: "s1", search_name: "Brooklyn" },
    channels: ["email"],
    ...over,
  });
const UNCHECKED = { leads: 3, since: "2026-10-29T15:10:00Z", reason: "unchecked" };
const line = (sequence) => sequenceRowLine(sequence, AT);

test("leads that could not be checked: the row says how many and since when, and it needs you", () => {
  const brooklyn = lead({ in_it: 3, stuck: UNCHECKED });
  assert.equal(line(brooklyn), "3 leads couldn’t be checked · since Oct 29");
  assert.equal(sequenceGroupOf(brooklyn), "needs");
  assert.equal(
    line(lead({ in_it: 1, stuck: { ...UNCHECKED, leads: 1 } })),
    "1 lead couldn’t be checked · since Oct 29",
  );
  // The widest it gets still fits a phone's row (44 characters, as stage 1's lines do).
  assert.ok(line(lead({ in_it: 999, stuck: { ...UNCHECKED, leads: 999 } })).length <= 44);
});

test("an address the clock still checks again asks nothing: the row says so, and it is no part of Needs you", () => {
  // Three on its list, none planned, each waiting on the clock's own second try (00622: `rechecking`, never `stuck`).
  const waiting = lead({ in_it: 0, rechecking: 3, last: null });
  assert.equal(line(waiting), "3 addresses being checked again");
  assert.notEqual(sequenceGroupOf(waiting), "needs");
  assert.equal(line(lead({ rechecking: 1 })), "1 address being checked again");
  // Once the tries are spent the database counts them as stuck, and the row asks for you as before.
  const spent = lead({ rechecking: 1, stuck: { ...UNCHECKED, leads: 2 } });
  assert.equal(line(spent), "2 leads couldn’t be checked · since Oct 29");
  assert.equal(sequenceGroupOf(spent), "needs");
  // What goes next is said first; a paused one, another kind of sequence, none, or a server before it say what they said.
  assert.match(line(lead({ rechecking: 3, next: { at: "2026-11-12T14:00:00Z", people: 6 } })), /^Next /);
  assert.equal(line(lead({ rechecking: 0, in_it: 4 })), "4 in it");
  assert.equal(line(lead({ in_it: 4 })), "4 in it");
  assert.equal(line(row({ rechecking: 3, in_it: 4 })), "4 in it");
  assert.equal(line(lead({ state: "paused", rechecking: 3 })), line(lead({ state: "paused" })));
  assert.ok(line(lead({ rechecking: 200 })).length <= 44);
});

test("what waits on you is said before what is stuck", () => {
  const both = lead({
    in_it: 4,
    stuck: UNCHECKED,
    needs: { ...NONE, held: 1, oldest_at: "2026-10-30T13:00:00Z" },
  });
  assert.equal(line(both), "1 email held for your look · since Oct 30");
  assert.equal(sequenceGroupOf(both), "needs");
});

test("stuck is a running cold email's: paused, ended or a draft says what it said", () => {
  const paused = lead({ state: "paused", in_it: 3, stuck: UNCHECKED });
  assert.equal(line(paused), "3 wait for it to turn on");
  assert.equal(sequenceGroupOf(paused), "off");
  assert.equal(sequenceGroupOf(lead({ state: "ended", stuck: UNCHECKED })), "ended");
  assert.equal(sequenceGroupOf(lead({ state: "draft", stuck: UNCHECKED })), "drafts");
});

test("a reason this build does not know, none stuck, or a server before it: the row says what it said", () => {
  for (const stuck of [{ ...UNCHECKED, reason: "something_new" }, { ...UNCHECKED, leads: 0 }, null, undefined]) {
    const quiet = lead({ in_it: 3, stuck });
    assert.equal(line(quiet), "3 in it");
    assert.equal(sequenceGroupOf(quiet), "leads");
  }
});

test("a customer's sequence whose last run did nothing says why, and needs you", () => {
  const off = (reason) => row({ last_run_off: reason, last_run_for: "2026-11-10" });
  const lines = {
    no_calendar: "Didn’t run · no calendar is connected",
    no_list: "Didn’t run · its list is gone",
    list_uncounted: "Didn’t run · its list couldn’t be counted",
    template_not_approved: "Didn’t run · WhatsApp hasn’t approved it",
    number_flagged: "Didn’t run · WhatsApp limited your number",
    ended: "Its last day has passed",
  };
  for (const [reason, words] of Object.entries(lines)) {
    assert.equal(line(off(reason)), words, reason);
    assert.ok(words.length <= 44, reason + " fits a phone's row");
    assert.equal(sequenceGroupOf(off(reason)), "needs", reason);
  }
});

test("a run that sent, found nobody, or was off for a reason the record does not say: the row says what it said", () => {
  for (const reason of [null, undefined, "nobody", "class_never"]) {
    const fine = row({ last_run_off: reason, last_run_for: "2026-11-10" });
    assert.equal(line(fine), "Sends the day before each meeting");
    assert.equal(sequenceGroupOf(fine), "customers");
  }
});

test("a run that did nothing is a sequence's that is on, and never a cold email's", () => {
  const paused = row({ state: "paused", last_run_off: "no_calendar", last_run_for: "2026-11-10" });
  assert.equal(sequenceGroupOf(paused), "off");
  assert.equal(line(paused), "Before a meeting · nobody waits on it");
  const cold = lead({ in_it: 2, last_run_off: "no_calendar", last_run_for: "2026-11-10" });
  assert.equal(sequenceGroupOf(cold), "leads");
  assert.equal(line(cold), "2 in it");
});

test("what waits on you is said before a run that did nothing", () => {
  const both = row({
    last_run_off: "no_calendar",
    last_run_for: "2026-11-10",
    needs: { ...NONE, replies: 2, oldest_at: "2026-11-09T13:00:00Z" },
  });
  assert.equal(line(both), "2 wrote back · answer them");
});

test("between steps, the row says when the next one is due and how many have a time to come", () => {
  const between = { at: "2026-11-12T14:30:00Z", people: 9 };
  assert.equal(line(row({ in_it: 18, between })), "Next tomorrow 9:30 AM · 9 people");
  assert.equal(line(lead({ in_it: 18, between })), "Next tomorrow 9:30 AM · 9 people");
  assert.equal(line(row({ in_it: 1, between: { ...between, people: 1 } })), "Next tomorrow 9:30 AM · 1 person");
});

test("a batch already made, and an occasion's own next person, are said before who is between steps", () => {
  const between = { at: "2026-11-13T14:30:00Z", people: 9 };
  const batch = { id: "b", at: "2026-11-12T14:00:00Z", people: 6, state: "scheduled", place: 1 };
  assert.equal(line(row({ in_it: 15, next: batch, between })), "Next tomorrow 9:00 AM · 6 people");
  const coming = { at: "2026-11-12T19:00:00Z", people: 5 };
  assert.equal(line(row({ in_it: 14, coming, between })), "Next tomorrow 2:00 PM · 5 people");
});

test("nobody between steps with a time to come, or a server before it: who is in it, as before", () => {
  for (const between of [{ at: "2026-11-12T14:30:00Z", people: 0 }, null, undefined])
    assert.equal(line(row({ in_it: 18, between })), "18 in it");
});

test("Needs you lists the longest wait first: stuck leads by since, a run that did nothing by its day", () => {
  const rows = [
    row({ id: "run", last_run_off: "no_calendar", last_run_for: "2026-11-10" }),
    lead({ id: "held", needs: { ...NONE, held: 1, oldest_at: "2026-10-30T13:00:00Z" } }),
    lead({ id: "stuck", in_it: 3, stuck: UNCHECKED }),
    row({ id: "run-no-day", last_run_off: "no_calendar" }),
  ];
  assert.deepEqual(
    [...rows].sort(byLongestWait).map((sequence) => sequence.id),
    ["stuck", "held", "run", "run-no-day"],
  );
});
