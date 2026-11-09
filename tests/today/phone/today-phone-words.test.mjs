/**
 * What Today says on a phone (the phone canvas, 28 Oct 2026; docs/superpowers/specs/2026-10-28-today-on-a-phone-design.md):
 * the head's one sentence under the greeting, on a desk and a phone alike since the redesign of 1 Nov 2026 (what leads,
 * then the rest; never "Nothing needs you" over something that waits, S7-1, is held by
 * today/record/one-count-of-what-needs-you.test.mjs); the day as a bar over every visit that stands, with now on it, and
 * the line over it; a call-back's row saying
 * what happened, its ask said once; and Change it with Ask on Ask's own draft, the draft door taking the member's words.
 * All of it pure, in contracts.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  REPLY_DRAFT_INSTRUCTION_MAX,
  ReplyDraftAskSchema,
  todayDay,
  todayDayBar,
  todayDayNote,
  todayHeadLine,
  toTodayVM,
  unansweredCallTodo,
} from "@chanlytics/contracts";
import { NOW, escalation, metrics, waiting } from "../record/_world.mjs";

/* ------------------------------------------------ the head */

const calm = (over = {}) => ({ also: [], traffic: null, handled_all: false, answered: null, ...over });
const calmHead = (c) => ({ headline: "Nothing needs you.", detail: null, tone: "calm", calm: c });

test("someone waits: how many lead, the one count, then what Ask prepared and what cannot wait; after closing, how today went", () => {
  const needs = {
    headline: "4 conversations need you.",
    detail: "The oldest has been waiting since 2:26 PM.",
    tone: "needs",
    calm: null,
  };
  // Today in three zones (2 Nov 2026): the one count (Need you's rows above To do), and the sentence follows the rows.
  assert.deepEqual(
    todayHeadLine(needs, 6, null),
    { lead: "6 need you.", rest: null },
    "nothing prepared, nothing closing",
  );
  assert.deepEqual(
    todayHeadLine(needs, 6, "Ask drafted 3 replies, and Dana's window closes at 11:52 AM."),
    { lead: "6 need you.", rest: "Ask drafted 3 replies, and Dana's window closes at 11:52 AM." },
    "what Ask prepared and the one thing that cannot wait",
  );
  assert.equal(todayHeadLine(needs, 1, null).lead, "1 needs you.");
  assert.deepEqual(
    todayHeadLine(needs, 1, "Ask drafted a reply.", null, "Today: 4 booked, 31 of 34 answered by the receptionist."),
    { lead: "1 needs you.", rest: "Today: 4 booked, 31 of 34 answered by the receptionist." },
    "after closing the day turned: how today went is the rest",
  );
});

test("runs are in the count like any row, and the rest is what the rows hold", () => {
  assert.deepEqual(todayHeadLine(calmHead(calm({ traffic: "4 messages" })), 2, null), {
    lead: "2 need you.",
    rest: null,
  });
  assert.deepEqual(todayHeadLine(calmHead(calm()), 1, "Ask drafted a reply"), {
    lead: "1 needs you.",
    rest: "Ask drafted a reply.",
  });
});
test("a call-back's sentence is what happened: its ask is the row's state line and its Call, said once", () => {
  const todo = unansweredCallTodo({
    direction: "inbound",
    status: "ended",
    duration_ms: 4_000,
    disconnection_reason: "user_hangup",
    in_voicemail: false,
    outcome: null,
  });
  assert.equal(todo, "Hung up after 4 sec without a word. Call them back.", "the hold's note keeps its ask");
  const held = { ...escalation(), reason: "callback", details: todo };
  const row = toTodayVM(metrics(), [waiting()], [held], [], NOW).queue.rows.find((r) => r.kind === "callback");
  assert.ok(row, "a call-back row");
  assert.equal(row.sentence, "Hung up after 4 sec without a word.");
  assert.equal(row.status[0], "Needs a call back");
  assert.ok(row.since && row.status.includes(row.since), "since when is a segment of its state line, named");
  const other = { ...held, details: "They want to move Thursday." };
  assert.equal(
    toTodayVM(metrics(), [waiting()], [other], [], NOW).queue.rows.find((r) => r.kind === "callback").sentence,
    "They want to move Thursday.",
    "a note that is not the call's own to-do is said whole",
  );
});

test("a line that is down leads, and how many need you as well is the rest", () => {
  const alert = { headline: "Check your connection before anything else.", detail: null, tone: "alert", calm: null };
  assert.deepEqual(todayHeadLine(alert, 2, "Ask drafted a reply."), {
    lead: "Check your connection before anything else.",
    rest: "2 need you as well.",
  });
  assert.deepEqual(todayHeadLine(alert, 0, null), {
    lead: "Check your connection before anything else.",
    rest: null,
  });
});

test("nobody waits: Nothing needs you, and that's everyone; a quiet day says what is listening; after closing, how it went", () => {
  const c = calm({
    traffic: "9 messages from 6 people",
    handled_all: true,
    answered: "answered 9 of the 9 on its own.",
  });
  assert.deepEqual(todayHeadLine(calmHead(c), 0, null), { lead: "Nothing needs you.", rest: "That's everyone." });
  assert.deepEqual(
    todayHeadLine(calmHead(calm()), 0, null, {
      headline: "Nothing needs you.",
      sub: "The receptionist is on. Last message Tuesday 4:12 PM, answered in 22s.",
    }),
    { lead: "Nothing needs you.", rest: "The receptionist is on. Last message Tuesday 4:12 PM, answered in 22s." },
    "a quiet day says what is listening",
  );
  assert.deepEqual(
    todayHeadLine(calmHead(calm()), 0, null, {
      headline: "Nothing can come in yet.",
      sub: "Connect a line and your receptionist starts answering.",
    }),
    { lead: "Nothing can come in yet.", rest: "Connect a line and your receptionist starts answering." },
    "a workspace with no line says so",
  );
  assert.deepEqual(
    todayHeadLine(calmHead(c), 0, null, null, "Today: 4 booked, 31 of 34 answered by the receptionist."),
    { lead: "Nothing needs you.", rest: "Today: 4 booked, 31 of 34 answered by the receptionist." },
  );
});
/* ------------------------------------------------ the day */

const item = (id, from, to, phase) => ({
  id,
  start: "",
  time: "",
  dur: "",
  title: "",
  service: "",
  person: null,
  allDay: false,
  phase,
  flag: null,
  said: null,
  to: "calendar",
  at: { from, to },
});
const sum = (bar) => bar.parts.reduce((n, p) => n + p.share, 0);

test("the bar: the visits in the day's order with the free time between them, each a share, and now on it", () => {
  const bar = todayDayBar(
    [item("a", 9, 10, "past"), item("b", 14, 15.5, "now"), item("c", 17, 18, "later")],
    { start: 8, end: 20 },
    14.5,
  );
  assert.deepEqual(
    bar.parts.map((p) => p.phase),
    ["gap", "past", "gap", "now", "gap", "later", "gap"],
  );
  assert.ok(Math.abs(sum(bar) - 1) < 1e-9, "the parts are the whole day");
  assert.equal(bar.parts[1].share, 1 / 12, "an hour of twelve");
  assert.equal(bar.now, 6.5 / 12, "half past two, six and a half hours into the span");
});

test("the bar's span holds every visit, overlapping ones are one stretch, and now outside it is no mark", () => {
  const bar = todayDayBar([item("a", 7, 8, "past"), item("b", 7.5, 9, "past")], { start: 8, end: 10 }, 22);
  assert.equal(bar.parts[0].phase, "past", "the span starts at the first visit, before the grid's hours");
  assert.ok(Math.abs(sum(bar) - 1) < 1e-9);
  assert.equal(bar.now, null, "ten at night is past the span");
  assert.equal(todayDayBar([], { start: 8, end: 20 }, 12), null, "no visit, no bar");
  assert.equal(
    todayDayBar([{ ...item("x", 0, 0, "later"), allDay: true, at: null }], null, 12),
    null,
    "all day takes no span",
  );
});

const frame = (over = {}) => ({
  key: "2026-09-18",
  label: "Today · Friday, September 18",
  today: true,
  past: false,
  closed: { yes: false, note: null },
  items: [item("a", 9, 10, "past"), item("b", 14, 15, "now")],
  summary: null,
  missed: 0,
  open: [],
  more: 0,
  moreLine: null,
  bar: null,
  ...over,
});

test("the line beside the date: closed and why, booked through with the next opening, how many and what is open", () => {
  assert.equal(
    todayDayNote(frame({ closed: { yes: true, note: "Staff training" } }), null, "appointment"),
    "Closed today · Staff training",
  );
  assert.equal(todayDayNote(frame(), "Mon 9:30 AM", "appointment"), "Fully booked · next opening Mon 9:30 AM");
  assert.equal(
    todayDayNote(frame({ open: ["2:30 – 4 PM"] }), "Mon 9:30 AM", "appointment"),
    "2 appointments · open 2:30 – 4 PM",
  );
  assert.equal(
    todayDayNote(frame({ more: 3, missed: 1 }), null, "visit"),
    "4 visits",
    "the cap's rest counted, a missed one not",
  );
  assert.equal(
    todayDayNote(frame({ items: [], open: ["9 AM – 12 PM"] }), null, "appointment"),
    "No appointments · open 9 AM – 12 PM",
  );
});

test("each frame carries the bar over every visit that stands, the card's cap leaving none out of it, now only on today's", () => {
  const block = (id, t) => ({ id, t, dur: 60, time: `${t}:00`, title: "Gloss", service: "Gloss", person: null });
  const day = (today, blocks) => ({
    key: today ? "2026-09-18" : "2026-09-19",
    long: today ? "Friday, September 18" : "Saturday, September 19",
    today,
    past: false,
    closed: { yes: false, note: null },
    blocks,
    allDay: [],
    windows: [],
  });
  const vm = todayDay(
    {
      days: [
        day(
          true,
          [9, 10, 11, 12, 13, 15, 17].map((t) => block(`b${t}`, t)),
        ),
        day(false, [block("t1", 10)]),
      ],
      now: 14,
      feed: { state: "ok" },
      stats: { next: "Mon 9:30 AM" },
      hours: { start: 8, end: 20 },
    },
    null,
  );
  const [today, tomorrow] = vm.frames;
  assert.equal(today.items.length, 5, "the card's cap");
  assert.equal(today.bar.parts.filter((p) => p.phase !== "gap").length, 7, "every visit, past the card's five");
  assert.equal(today.bar.now, 6 / 12);
  assert.deepEqual(today.items.at(-1).at, { from: 17, to: 18 }, "a visit's place in hours");
  // Tomorrow carries its bar too, which the day draws once it has turned (the canvas's evening), with no now on it.
  assert.equal(tomorrow.bar.now, null, "no now on tomorrow");
  assert.equal(tomorrow.bar.parts.filter((p) => p.phase !== "gap").length, 1, "its one visit");
});

/* ------------------------------------------------ Change it with Ask */

test("the draft door takes the member's words for a draft written again, long enough to be said aloud", () => {
  assert.ok(ReplyDraftAskSchema.safeParse({ kind: "reply" }).success, "without, as before");
  assert.ok(ReplyDraftAskSchema.safeParse({ kind: "reply", instruction: "Shorter" }).success);
  assert.equal(REPLY_DRAFT_INSTRUCTION_MAX, 1000);
  assert.ok(!ReplyDraftAskSchema.safeParse({ kind: "reply", instruction: "x".repeat(1001) }).success, "past the most");
  assert.ok(
    ReplyDraftAskSchema.safeParse({ kind: "reply", instruction: "Shorter", given: "The words on the screen" }).success,
    "with the words on the screen, which a change is asked of",
  );
  assert.ok(!ReplyDraftAskSchema.safeParse({ kind: "reply", instruction: "   " }).success, "nothing said is no change");
});
