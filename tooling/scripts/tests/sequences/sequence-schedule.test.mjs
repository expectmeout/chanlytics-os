/**
 * A sequence's Steps as a schedule (contracts sequence-schedule.ts, the Steps redesign of 17 Oct 2026), executed on rows and
 * steps as the record reads them: each step's day, the line over the rail, where it starts and stops, the wait between two
 * steps, and what each step is doing now, amber where it needs you and quiet where it is only coming, then its sheet's rows.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  scheduleChannels,
  scheduleDays,
  scheduleEnd,
  scheduleInLine,
  scheduleSpan,
  scheduleStart,
  scheduleStepFacts,
  scheduleStepState,
  scheduleStepSub,
  scheduleWait,
} from "@chanlytics/contracts";

const TZ = "America/New_York";
const NOW = Date.parse("2026-10-17T14:00:00Z");
const NONE = { waiting: 0, waiting_people: 0, held: 0, to_send: 0, replies: 0, oldest_at: null, batches: [] };
const FIRST = {
  id: "s1",
  kind: "moment",
  trigger: "visit_tomorrow",
  state: "running",
  policy_class: "booking",
  run_hour: 10,
  list_id: null,
  list_key: null,
  list_name: null,
  search_id: null,
  search_name: null,
  owner_sends: false,
  until: null,
  trial_until: null,
  template_name: "spring_offer",
  template_language: "en_US",
};
const row = (over = {}) => ({
  id: "p1",
  name: "VIP color clients",
  starts: "list",
  state: "on",
  created_at: "2026-09-18T12:00:00Z",
  first: { ...FIRST, kind: "list", trigger: "list", list_id: "l1", list_name: "VIP regulars" },
  date: null,
  steps: 2,
  channels: ["whatsapp", "email"],
  needs: NONE,
  next: null,
  last: null,
  in_it: 4,
  ...over,
});
const step = (place, over = {}) => ({
  id: `s${place}`,
  place,
  name: place === 1 ? "Spring offer" : "Win-back",
  kind: "moment",
  trigger: "list",
  state: "running",
  after_days: place === 1 ? null : 14,
  only_if: place === 1 ? [] : ["no_booking"],
  channels: ["whatsapp", "email"],
  template_id: `t${place}`,
  template_name: place === 1 ? "spring_offer" : "win_back",
  template_language: "en_US",
  params: [],
  hand: null,
  next_words: null,
  sent: 0,
  replied: 0,
  ...over,
});
const STEPS = [step(1, { sent: 8, replied: 3 }), step(2, { sent: 5, replied: 1 })];
const person = (group, place, at = null) => ({
  group,
  contact_id: "c",
  lead_id: null,
  enrollment_id: null,
  send_id: null,
  batch_id: null,
  name: "Dani",
  place,
  at,
  why: null,
  hold_detail: null,
});
const ctx = (over = {}) => ({ tz: TZ, nowMs: NOW, lastRunFor: "2026-10-17", people: null, gone: false, ...over });

test("each step stands on its day: the first on day 1, each after on the day its wait lands", () => {
  assert.deepEqual(
    [...scheduleDays([step(2), step(1), step(3, { after_days: 7 })])],
    [
      [1, 1],
      [2, 15],
      [3, 22],
    ],
  );
  assert.deepEqual(scheduleSpan(row(), STEPS), { count: "2 messages", over: "over 14 days" });
  assert.deepEqual(scheduleSpan(row(), [step(1)]), { count: "One message", over: null });
  assert.deepEqual(scheduleSpan(row({ starts: "leads" }), [...STEPS, step(3, { after_days: 4 })]).count, "3 steps");
  const oneOff = row({
    starts: "date",
    date: { batch_id: "b1", state: "scheduled", at: "2026-11-24T15:00:00Z", people: 186 },
  });
  assert.deepEqual(scheduleSpan(oneOff, []), { count: "One message", over: "to 186 people" });
});

test("where it starts names what it starts on apart, so the page makes it a door; a one-off's day says how it stands", () => {
  assert.deepEqual(scheduleStart(row(), "visit", { tz: TZ, nowMs: NOW }), {
    lead: "When someone joins ",
    name: "VIP regulars",
    sub: "Sends at 10:00 AM",
  });
  const leads = row({ starts: "leads", first: { ...FIRST, kind: "reach_out", search_name: "Florists · Park Slope" } });
  assert.deepEqual(scheduleStart(leads, "visit", { tz: TZ, nowMs: NOW }), {
    lead: "When a lead joins ",
    name: "Florists · Park Slope",
    sub: "Each one is checked before it goes",
  });
  const oneOff = row({
    starts: "date",
    date: { batch_id: "b1", state: "scheduled", at: "2026-11-24T15:00:00Z", people: 186 },
  });
  const start = scheduleStart(oneOff, "visit", { tz: TZ, nowMs: NOW });
  assert.deepEqual([start.lead, start.name, start.sub], ["Nov 24 · 10:00 AM", null, "Goes on its own, to 186 people"]);
});

test("the wait between two steps says who it keeps going; a lead's step goes on to those who haven't written back", () => {
  assert.deepEqual(scheduleWait(step(2)), { wait: "Waits 14 days", only: "Then only to those who haven’t booked" });
  assert.deepEqual(scheduleWait(step(2, { only_if: [] })), { wait: "Waits 14 days", only: null });
  assert.equal(
    scheduleWait(step(2, { kind: "reach_out", only_if: [], after_days: 3 })).only,
    "Then only to those who haven’t written back",
  );
  assert.equal(scheduleWait(step(2, { after_days: 1 })).wait, "Waits 1 day");
});

test("where it stops: a booking, a reply or the last step, never anyone who said stop; a one-off has nothing to stop", () => {
  assert.deepEqual(scheduleEnd(row(), STEPS), {
    head: "Stops when they book",
    sub: "or after the last step · never to anyone who said stop",
  });
  assert.deepEqual(scheduleEnd(row(), [step(1)]), {
    head: "After this one message",
    sub: "never to anyone who said stop",
  });
  assert.equal(scheduleEnd(row({ starts: "leads" }), STEPS).head, "Stops when they write back");
  assert.equal(scheduleEnd(row({ starts: "date" }), []), null);
  assert.equal(scheduleChannels(["whatsapp", "email"]), "WhatsApp, else email");
  assert.equal(scheduleChannels(["email"]), "email");
});

test("what a step is doing now: a batch waiting for your OK, a message gone and new words turned down need you", () => {
  const waits = row({
    needs: {
      ...NONE,
      waiting: 1,
      waiting_people: 6,
      batches: [
        {
          id: "b1",
          step_id: "s1",
          run_for: "2026-10-17",
          at: "2026-10-17T14:05:00Z",
          people: 6,
          audience: { kind: "playbook", trigger: "list" },
        },
      ],
    },
  });
  // Its `at` is when it was made: an OK sends it at once, and a customer's waits only until its day is gone.
  assert.deepEqual(scheduleStepState(waits, STEPS[0], ctx()), {
    tone: "need",
    words: "6 wait for your OK · until tonight",
  });
  const toLeads = row({
    starts: "leads",
    needs: { ...waits.needs, batches: [{ ...waits.needs.batches[0], audience: { kind: "reach_out", trigger: null } }] },
  });
  assert.deepEqual(
    scheduleStepState(toLeads, step(1, { kind: "reach_out" }), ctx()),
    { tone: "need", words: "6 wait for your OK" },
    "a sequence to leads' batch has no day to pass",
  );
  assert.deepEqual(scheduleStepState(row(), STEPS[0], ctx({ gone: true })), {
    tone: "need",
    words: "Pick a message for it",
  });
  const refused = step(2, {
    next_words: { template_id: null, name: "promo", language: "en_US", status: "rejected", rejected_reason: null },
  });
  assert.deepEqual(scheduleStepState(row(), refused, ctx()), {
    tone: "need",
    words: "New words turned down · it keeps sending these",
  });
  const review = step(2, {
    next_words: { template_id: null, name: "promo", language: "en_US", status: "pending", rejected_reason: null },
  });
  assert.equal(scheduleStepState(row(), review, ctx()).tone, "next");
});

test("what is only coming is quiet: the first step's next run, and who is in line for a later one", () => {
  const first = scheduleStepState(row(), STEPS[0], ctx());
  assert.equal(first.tone, "next");
  assert.match(first.words, /^Next tomorrow 10:00 AM/);
  const people = { counts: { in: 4 }, rows: [1, 2, 3, 4].map((d) => person("in", 1, `2026-10-${19 + d}T14:00:00Z`)) };
  assert.deepEqual(scheduleInLine(people, 2), { count: 4, first: "2026-10-20T14:00:00Z" });
  assert.deepEqual(scheduleStepState(row(), STEPS[1], ctx({ people })), {
    tone: "next",
    words: "4 in line · the first on Oct 20",
  });
  // Where the read holds only a group's first rows, nobody is counted that the page cannot see.
  assert.equal(scheduleInLine({ ...people, counts: { in: 60 } }, 2).count, null);
  assert.equal(
    scheduleStepState(row(), STEPS[1], ctx({ people: { ...people, counts: { in: 60 } } })).words,
    "In line · the first on Oct 20",
  );
  assert.equal(scheduleInLine(people, 1), null, "nobody waits for the first step");
  // Someone whose wait is over and who is still in line (the step could not reach them yet) is due now, never a day past.
  const overdue = {
    counts: { in: 2 },
    rows: [person("in", 1, "2026-10-12T14:00:00Z"), person("in", 1, "2026-10-21T14:00:00Z")],
  };
  assert.equal(scheduleStepState(row(), STEPS[1], ctx({ people: overdue })).words, "2 in line · due now");
});

test("a sequence to leads: what the check held of a step and when the rest go, else gone to everyone in it", () => {
  const leads = row({
    starts: "leads",
    needs: { ...NONE, held: 2 },
    next: { id: "b2", at: "2026-10-18T13:00:00Z", people: 9, state: "scheduled", place: 2 },
  });
  const sent = [step(1, { kind: "reach_out", sent: 18, replied: 2 }), step(2, { kind: "reach_out", sent: 4 })];
  assert.deepEqual(scheduleStepState(leads, sent[1], ctx()), {
    tone: "need",
    words: "2 held by the check · 9 go tomorrow 9:00 AM",
  });
  assert.deepEqual(scheduleStepState(leads, sent[0], ctx()), { tone: "done", words: "Gone to everyone in it so far" });
});

test("a step's sheet: its place, day and hour; when it goes, who it keeps going, how, what it is doing and did", () => {
  assert.equal(scheduleStepSub(row(), STEPS[1], 15), "Step 2 · Day 15 · 10:00 AM");
  const facts = scheduleStepFacts(row(), STEPS[1], "visit", ctx());
  assert.deepEqual(
    facts.map((f) => [f.label, f.value]),
    [
      ["Goes", "14 days after step 1, at 10:00 AM"],
      ["Only to", "Those who haven’t booked"],
      ["By", "WhatsApp or email, one each"],
      ["Last 30 days", "5 sent · 1 replied"],
    ],
  );
  const gone = scheduleStepFacts(row(), STEPS[0], "visit", ctx({ gone: true }));
  assert.deepEqual(
    gone.find((f) => f.label === "Now"),
    { label: "Now", value: "Pick a message for it", tone: "warn" },
  );
  const call = scheduleStepFacts(
    row({ starts: "leads" }),
    step(3, { hand: { kind: "call", words: "Call them" } }),
    "visit",
    ctx(),
  );
  assert.deepEqual(call.find((f) => f.label === "By").value, "A task for you, on Today");
  assert.equal(
    call.find((f) => f.label === "Last 30 days"),
    undefined,
    "a call sends nothing to count",
  );
});
