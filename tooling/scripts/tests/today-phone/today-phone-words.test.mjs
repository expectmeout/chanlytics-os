/**
 * What Today says on a phone (the phone canvas, 28 Oct 2026; docs/superpowers/specs/2026-10-28-today-on-a-phone-design.md):
 * the ladder said as a head, in a few words with one line under them, never "Nothing needs you" over something that waits
 * (S7-1); the day as a bar over every visit that stands, with now on it, and the line over it; a call-back's row saying
 * what happened, its ask said once; and Change it with Ask on Ask's own draft, the draft door taking the member's words.
 * All of it pure, in contracts.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  REPLY_DRAFT_INSTRUCTION_MAX,
  ReplyDraftAskSchema,
  replyDraftAbout,
  todayDay,
  todayDayBar,
  todayDayNote,
  todayPhoneHead,
  toTodayVM,
  unansweredCallTodo,
} from "@chanlytics/contracts";
import { NOW, escalation, metrics, waiting } from "../today-record/_world.mjs";

/* ------------------------------------------------ the head */

const calm = (over = {}) => ({ also: [], traffic: null, handled_all: false, answered: null, ...over });
const calmHead = (c) => ({ headline: "Nothing needs you.", detail: null, tone: "calm", calm: c });

test("the needs rung: its headline as the title, without its full stop; who waited longest is the first card's, not a line", () => {
  const needs = {
    headline: "3 conversations need you.",
    detail: "The oldest has been waiting since 2:26 PM.",
    tone: "needs",
    calm: null,
  };
  // His look on a phone (29 Oct 2026): the oldest wait was said by the line, the card's wait and its state line at once.
  assert.deepEqual(todayPhoneHead(needs, 0), { title: "3 conversations need you", line: null });
  assert.equal(
    todayPhoneHead({ ...needs, headline: "One conversation needs you" }, 0).title,
    "One conversation needs you",
  );
});

test("the needs rung's line says only the runs waiting, which the badge counts and the headline does not", () => {
  const needs = {
    headline: "6 conversations need you.",
    detail: "The oldest has been waiting since Oct 19, 3:55 PM.",
    tone: "needs",
    calm: null,
  };
  assert.equal(todayPhoneHead(needs, 1).line, "A campaign run is waiting for your say.");
  assert.equal(todayPhoneHead(needs, 2).line, "2 campaign runs are waiting for your say.");
  assert.equal(todayPhoneHead(needs, 0).line, null, "no line at all with nothing to say");
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

test("a line that is down is said whole, with no line under it: the alert stands under the head", () => {
  const alert = { headline: "Check your connection before anything else.", detail: null, tone: "alert", calm: null };
  assert.deepEqual(todayPhoneHead(alert, 2), { title: "Check your connection before anything else", line: null });
});

test("a calm day with nothing waiting: Nothing needs you, and what came in and how it was answered is the line", () => {
  const c = calm({
    traffic: "9 messages from 6 people",
    handled_all: true,
    answered: "answered 9 of the 9 on its own, typically in about 20s.",
  });
  assert.deepEqual(todayPhoneHead(calmHead(c), 0), {
    title: "Nothing needs you",
    line: "The receptionist handled everything — 9 messages from 6 people today. It answered 9 of the 9 on its own, typically in about 20s.",
  });
  assert.deepEqual(todayPhoneHead(calmHead(calm()), 0), { title: "Nothing needs you", line: null }, "a quiet day");
  assert.equal(
    todayPhoneHead(calmHead(calm({ traffic: "2 messages", answered: "answered 1 of the 2 on its own." })), 0).line,
    "2 messages today. The receptionist answered 1 of the 2 on its own.",
    "the receptionist named where the line before it did not",
  );
});

test("REGRESSION (S7-1): never Nothing needs you over a run, a search or a closing window", () => {
  assert.deepEqual(todayPhoneHead(calmHead(calm()), 1), {
    title: "A campaign run is waiting for your say",
    line: null,
  });
  const also = calm({
    also: ["A search is waiting on your answer.", "One reply window is closing."],
    traffic: "4 messages",
  });
  assert.deepEqual(todayPhoneHead(calmHead(also), 0), {
    title: "A search is waiting on your answer",
    line: "One reply window is closing. 4 messages today.",
  });
  assert.equal(todayPhoneHead(calmHead(also), 2).title, "2 campaign runs are waiting for your say", "a run leads");
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

test("today's frame carries the bar over every visit that stands, the card's cap leaving none out of it", () => {
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
  assert.equal(tomorrow.bar, null, "tomorrow has none");
});

/* ------------------------------------------------ Change it with Ask */

test("the draft door takes the member's words for a draft written again, at most 280 characters", () => {
  assert.ok(ReplyDraftAskSchema.safeParse({ kind: "reply" }).success, "without, as before");
  assert.ok(ReplyDraftAskSchema.safeParse({ kind: "reply", instruction: "Shorter" }).success);
  assert.equal(REPLY_DRAFT_INSTRUCTION_MAX, 280);
  assert.ok(!ReplyDraftAskSchema.safeParse({ kind: "reply", instruction: "x".repeat(281) }).success, "past the most");
  assert.ok(!ReplyDraftAskSchema.safeParse({ kind: "reply", instruction: "   " }).success, "nothing said is no change");
});

test("Ask is asked to write its last draft again, the change in the member's words", () => {
  const about = replyDraftAbout(
    "reply",
    { reason: null, details: null },
    { was: "Hi Sofia, the trial is $120.", how: "Warmer" },
  );
  assert.ok(about.includes('It said: "Hi Sofia, the trial is $120."'), about);
  assert.ok(about.endsWith("Change it this way: Warmer"), about);
  assert.ok(
    !replyDraftAbout("reply", { reason: null, details: null }).includes("again"),
    "a first draft asks nothing of the kind",
  );
});
