/**
 * A next step (0007, amended; 00163): a note with a day. contracts steps.ts and the step's place in people.ts, executed:
 * the day as every page says it, the days a picker offers on each day of the week, whose steps Today shows, who a step
 * is for, a row's next step, a note's step once done, and the Steps due list.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  NOTE_REFUSALS,
  NOTE_WORDS,
  PEOPLE_LISTS,
  forWords,
  nextStepOf,
  personNotesVM,
  stepDayOf,
  stepDays,
  toPersonRowVM,
  todayStepsDue,
} from "@chanlytics/contracts";

const TZ = "America/New_York";
// Thursday 24 September 2026, 11:00 in New York.
const NOW = Date.parse("2026-09-24T15:00:00Z");

test("a step's day is said against the business's today: due, due today, overdue since; nothing for a day that is not one", () => {
  const said = (day, now = NOW, tz = TZ) => {
    const d = stepDayOf(day, tz, now);
    return d && [d.due, d.words];
  };
  assert.deepEqual(said("2026-09-24"), ["today", "Due today"]);
  assert.deepEqual(said("2026-09-25"), ["ahead", "Due tomorrow"]);
  assert.deepEqual(said("2026-09-29"), ["ahead", "Due Tue"]);
  assert.deepEqual(said("2026-10-05"), ["ahead", "Due Oct 5"]);
  assert.deepEqual(said("2026-09-23"), ["past", "Overdue since yesterday"]);
  assert.deepEqual(said("2026-09-21"), ["past", "Overdue since Mon"]);
  assert.deepEqual(said("2026-09-10"), ["past", "Overdue since Sep 10"]);
  for (const bad of ["2026-02-30", "", null, undefined, "Thursday"]) assert.equal(stepDayOf(bad, TZ, NOW), null, bad);
  // The business's calendar, not the server's: at 10 PM on the 24th in New York it is already the 25th in UTC.
  const late = Date.parse("2026-09-25T02:00:00Z");
  assert.deepEqual(said("2026-09-25", late), ["ahead", "Due tomorrow"]);
  assert.deepEqual(said("2026-09-25", late, "UTC"), ["today", "Due today"]);
});

test("the picker offers today, tomorrow, the weekdays to Friday, next week's Monday and any day, each once", () => {
  const on = (iso) => stepDays(Date.parse(iso), TZ).map((c) => c.label);
  assert.deepEqual(on("2026-09-21T15:00:00Z"), ["Today", "Tomorrow", "Wed", "Thu", "Fri", "Next week", "Pick a day"]);
  assert.deepEqual(on("2026-09-24T15:00:00Z"), ["Today", "Tomorrow", "Next week", "Pick a day"]);
  assert.deepEqual(on("2026-09-25T15:00:00Z"), ["Today", "Tomorrow", "Next week", "Pick a day"]);
  assert.deepEqual(on("2026-09-26T15:00:00Z"), ["Today", "Tomorrow", "Next week", "Pick a day"]);
  // On a Sunday, tomorrow is next week's Monday: offered once, as Tomorrow.
  assert.deepEqual(on("2026-09-27T15:00:00Z"), ["Today", "Tomorrow", "Pick a day"]);
  const monday = stepDays(Date.parse("2026-09-21T15:00:00Z"), TZ);
  assert.deepEqual(
    monday.map((c) => c.key),
    ["2026-09-21", "2026-09-22", "2026-09-23", "2026-09-24", "2026-09-25", "2026-09-28", "pick"],
  );
  assert.equal(monday[2].title, "Wednesday, Sep 23");
  assert.equal(stepDays(NOW, TZ).find((c) => c.label === "Next week").key, "2026-09-28");
});

test("who a step is for: you, a teammate by name, or anyone", () => {
  assert.equal(forWords(true, "u-1", "Maria"), "For you");
  assert.equal(forWords(false, "u-2", " Maria "), "For Maria");
  assert.equal(forWords(false, "u-2", null), null, "a teammate who has left is not named");
  assert.equal(forWords(false, null, null), null);
});

/** A People row as people_list hands it over, with a step where given. */
const row = (id, name, step = {}) => ({
  id,
  display_name: name,
  wa_profile_name: null,
  phone_e164: null,
  email: null,
  consent: "unknown",
  channels: [],
  conversation_count: 0,
  escalation_count: 0,
  needs_human: false,
  latest_conversation_id: null,
  last_message_at: null,
  last_inbound_at: null,
  has_chat: false,
  queued_reply_at: null,
  ...step,
});

test("a row carries its next step, as people_list's step columns say it, with who it is for", () => {
  const r = row("p1", "Tove", {
    step_id: "n1",
    step_body: " Call about the timeline ",
    step_due_on: "2026-09-23",
    step_for_user_id: "u-2",
    step_for_name: "Sam",
    step_for_me: false,
    step_deal_id: "d1",
  });
  const s = toPersonRowVM(r, TZ, new Date(NOW)).nextStep;
  assert.deepEqual(
    { id: s.id, words: s.words, due: s.due, said: s.day.words, forWho: s.forWho, dealId: s.dealId },
    {
      id: "n1",
      words: "Call about the timeline",
      due: "past",
      said: "Overdue since yesterday",
      forWho: "For Sam",
      dealId: "d1",
    },
  );
  assert.equal(nextStepOf({ ...r, step_for_me: true }, TZ, NOW).forWho, "For you");
  // No step, or a row read before the columns existed: nothing to say.
  assert.equal(toPersonRowVM(row("p2", "Ivo"), TZ, new Date(NOW)).nextStep, null);
  assert.equal(nextStepOf({ step_id: "n2", step_body: "  ", step_due_on: "2026-09-24" }, TZ, NOW), null);
  assert.equal(nextStepOf({ step_id: "n3", step_body: "x", step_due_on: "soon" }, TZ, NOW), null);
});

test("Today shows the steps due, today or before: the oldest day first, three at most, and how many more", () => {
  const rows = [
    ["a", "Ada", "2026-09-24"],
    ["b", "Ben", "2026-09-21"],
    ["c", "Cy", "2026-09-30"],
    ["d", "Dee", "2026-09-22"],
    ["e", "Eli", null],
    ["f", "Fay", "2026-09-22"],
  ].map(([id, name, day]) =>
    toPersonRowVM(
      row(id, name, day ? { step_id: `n-${id}`, step_body: "Call", step_due_on: day } : {}),
      TZ,
      new Date(NOW),
    ),
  );
  const due = todayStepsDue(rows, NOW, TZ);
  assert.deepEqual(
    due.rows.map((x) => x.row.name),
    ["Ben", "Dee", "Fay"],
  );
  assert.deepEqual([due.count, due.more], [4, "and 1 more"]);
  assert.deepEqual(todayStepsDue(rows, NOW, TZ, 5).more, null);
  // Judged again when asked: Cy's step, ahead when the rows were read, is due once its day comes.
  const later = Date.parse("2026-09-30T15:00:00Z");
  const then = todayStepsDue(rows, later, TZ, 10);
  assert.ok(then.rows.some((x) => x.row.name === "Cy" && x.step.due === "today"));
  assert.equal(then.rows.find((x) => x.row.name === "Cy").step.day.words, "Due today");
});

test("a note with a day is a step on the page: its day, and once done, who did it and when", () => {
  const note = (over) => ({
    id: "n",
    body: "Send the revised quote",
    author_kind: "member",
    author_name: "Maria",
    mine: false,
    for_user_id: null,
    for_name: null,
    for_me: false,
    team_only: true,
    state: "kept",
    source: "page",
    version: 1,
    created_at: "2026-09-20T14:00:00Z",
    updated_at: "2026-09-20T14:00:00Z",
    ...over,
  });
  const vm = (over) => personNotesVM([note(over)], TZ, NOW)[0];
  assert.equal(vm({}).step, null, "a note without a day is a note");
  assert.equal(vm({}).dealId, null);
  const open = vm({ due_on: "2026-09-25", deal_id: "d1" });
  assert.deepEqual(open.step, {
    day: { day: "2026-09-25", due: "ahead", near: "tomorrow", words: "Due tomorrow" },
    due: "ahead",
    words: "Due tomorrow",
    done: false,
    doneWords: null,
  });
  assert.equal(open.dealId, "d1");
  const doneAt = "2026-09-24T14:15:00Z";
  assert.equal(
    vm({ due_on: "2026-09-23", done_at: doneAt, done_by_me: true }).step.doneWords,
    "Done by you · 10:15 AM",
  );
  assert.equal(
    vm({ due_on: "2026-09-23", done_at: "2026-09-22T14:15:00Z", done_by_name: "Sam" }).step.doneWords,
    "Done by Sam · Sep 22",
  );
  const gone = vm({ due_on: "2026-09-23", done_at: doneAt, done_by_name: null });
  assert.deepEqual(
    [gone.step.words, gone.step.done, gone.step.doneWords],
    [NOTE_WORDS.done, true, "Done by a former teammate · 10:15 AM"],
  );
  // The notes card's words for a step, and the doors' refusals, are contracts'.
  assert.equal(NOTE_WORDS.stepTeamOnly, "A step is for the team only");
  assert.equal(NOTE_WORDS.andMore(2), "and 2 more");
  assert.ok(NOTE_REFUSALS.bad_deal && NOTE_REFUSALS.not_a_step);
});

test("Steps due holds everyone whose next step's day has come, in every workspace, and never on their own page", () => {
  const list = PEOPLE_LISTS.find((l) => l.id === "steps_due");
  assert.equal(list.label, "Steps due");
  assert.equal(list.group, "attention");
  assert.deepEqual(
    [list.needsCalendar, list.needsDeals, list.needsConsultFirst, list.onProfile],
    [undefined, undefined, undefined, false],
  );
  const vm = (day) =>
    toPersonRowVM(row("p", "Pat", day ? { step_id: "n", step_body: "Call", step_due_on: day } : {}), TZ, new Date(NOW));
  assert.deepEqual(
    ["2026-09-20", "2026-09-24", "2026-09-25", null].map((d) => list.test(vm(d))),
    [true, true, false, false],
  );
});
