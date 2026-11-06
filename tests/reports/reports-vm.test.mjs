/**
 * The report view model, EXECUTED.
 *
 * Pins the arithmetic the page renders: period split, totals, the share
 * answered by the receptionist, deltas that refuse to invent a percentage
 * against nothing, reply-time quantiles and buckets, reason labels, the
 * empty state, and the table twin every chart must have.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  toReportVM,
  deltaOf,
  quantile,
  fmtSeconds,
  fmtDay,
  REPORT_RANGES,
  REPORT_MIN_N,
  BOOKED_ENDED_META,
  bookedTileOf,
  toBookingReportVM,
} from "@chanlytics/contracts";

function day(d, over = {}) {
  return {
    day: d,
    messages_in: 0,
    conversations: 0,
    answered_ai: 0,
    answered_you: 0,
    unanswered: 0,
    out_ai: 0,
    out_you: 0,
    escalations: 0,
    calls: 0,
    call_seconds: 0,
    new_contacts: 0,
    ...over,
  };
}

/** Seven previous days (quiet) then seven current days (busy). */
function dto(over = {}) {
  const prev = ["2026-08-22", "2026-08-23", "2026-08-24", "2026-08-25", "2026-08-26", "2026-08-27", "2026-08-28"].map(
    (d) => day(d, { messages_in: 1, answered_ai: 1, conversations: 1 }),
  );
  const cur = [
    day("2026-08-29", {
      messages_in: 4,
      conversations: 2,
      answered_ai: 3,
      answered_you: 1,
      calls: 1,
      call_seconds: 90,
      new_contacts: 1,
    }),
    day("2026-08-30", { messages_in: 2, conversations: 1, answered_ai: 2 }),
    day("2026-08-31"),
    day("2026-09-01", {
      messages_in: 5,
      conversations: 3,
      answered_ai: 3,
      answered_you: 1,
      unanswered: 1,
      escalations: 2,
      calls: 2,
      call_seconds: 300,
    }),
    day("2026-09-02", { messages_in: 1, conversations: 1, answered_you: 1, new_contacts: 1 }),
    day("2026-09-03", { messages_in: 3, conversations: 2, answered_ai: 3, escalations: 1 }),
    day("2026-09-04", { messages_in: 2, conversations: 1, answered_ai: 2 }),
  ];
  return {
    timezone: "America/New_York",
    days: 7,
    span_days: 14,
    today: "2026-09-04",
    series: [...prev, ...cur],
    reasons: { human_token: 2, policy_block: 1 },
    reply_seconds: [4, 8, 12, 15, 40, 70, 400, 2000],
    sentiments: { Positive: 2, Neutral: 1 },
    voicemail: 1,
    ...over,
  };
}

test("the current period is the LAST n days and the previous period is the n before", () => {
  const vm = toReportVM(dto());
  assert.equal(vm.days, 7);
  assert.equal(vm.answered.points.length, 7);
  assert.equal(vm.answered.points[0].day, "2026-08-29");
  assert.equal(vm.since, fmtDay("2026-08-29"));
  assert.equal(vm.until, fmtDay("2026-09-04"));
  assert.equal(vm.rangeLabel, "7 days");
});

test("totals and the receptionist's share are counts over the period, and the deltas compare with the prior period", () => {
  const vm = toReportVM(dto());
  const by = Object.fromEntries(vm.tiles.map((t) => [t.id, t]));
  assert.equal(by.messages.value, "17");
  assert.equal(by.messages.delta.text, "+143% vs prior 7 days");
  assert.equal(by.messages.delta.tone, "pos");
  assert.deepEqual(vm.answered.totals, { in: 17, ai: 13, you: 3, none: 1 });
  assert.equal(by.answered.value, "76%", "13 of 17 answered first by the receptionist");
  assert.equal(by.needed.value, "3");
  assert.equal(by.needed.delta, null, "no escalations in the prior period: nothing to compare against, never +∞%");
  assert.equal(by.calls.value, "3");
  assert.match(by.calls.meta, /7 min on the phone · 1 to voicemail/);
  assert.equal(by.people.value, "2");
  assert.deepEqual(by.messages.spark, [4, 2, 0, 5, 1, 3, 2]);
});

test("delta refuses to invent a percentage, and knows which direction is good", () => {
  assert.equal(deltaOf(5, 0, true, "7 days"), null);
  assert.deepEqual(deltaOf(10, 10, true, "7 days"), { text: "same as the prior 7 days", tone: "" });
  assert.deepEqual(deltaOf(12, 10, true, "7 days"), { text: "+20% vs prior 7 days", tone: "pos" });
  assert.deepEqual(
    deltaOf(12, 10, false, "7 days"),
    { text: "+20% vs prior 7 days", tone: "neg" },
    "more escalations is not good news",
  );
  assert.deepEqual(deltaOf(8, 10, false, "30 days"), { text: "-20% vs prior 30 days", tone: "pos" });
});

test("reply time: median and slowest tenth from the raw seconds, bucketed on fixed edges", () => {
  const vm = toReportVM(dto());
  assert.equal(vm.replyTime.count, 8);
  assert.equal(vm.replyTime.median, 27.5);
  assert.equal(vm.replyTime.medianLabel, "28s");
  assert.equal(Math.round(vm.replyTime.p90), 880);
  assert.equal(vm.replyTime.p90Label, "15m");
  assert.deepEqual(
    vm.replyTime.buckets.map((b) => [b.id, b.value]),
    [
      ["lt15", 3],
      ["lt60", 2],
      ["lt300", 1],
      ["lt1800", 1],
      ["gte1800", 1],
    ],
  );
  assert.equal(quantile([], 0.5), null);
  assert.equal(fmtSeconds(65), "1m 5s");
  assert.equal(fmtSeconds(3900), "1h 5m");
  assert.equal(fmtSeconds(null), "—");
});

test("escalation reasons are labelled in the owner's words, largest first", () => {
  const vm = toReportVM(dto());
  assert.deepEqual(
    vm.reasons.map((r) => [r.label, r.value, r.share]),
    [
      ["Asked for a person", 2, 1],
      ["Held by your reply setting", 1, 0.5],
    ],
  );
});

test("an empty period says so instead of drawing zero-height bars as if they meant something", () => {
  const quiet = dto({
    series: dto().series.map((d) => day(d.day)),
    reasons: {},
    reply_seconds: [],
    sentiments: {},
    voicemail: 0,
  });
  const vm = toReportVM(quiet);
  assert.equal(vm.empty, true);
  const by = Object.fromEntries(vm.tiles.map((t) => [t.id, t]));
  assert.equal(by.answered.value, "—");
  assert.equal(by.reply.value, "—");
  assert.equal(by.messages.delta, null);
});

test("every chart has a table twin with the same numbers", () => {
  const vm = toReportVM(dto());
  assert.equal(vm.table.columns.length, 8);
  assert.equal(vm.table.rows.length, 7);
  assert.deepEqual(vm.table.rows[3].slice(1), [5, 3, 1, 1, 2, 2, 0]);
  assert.deepEqual(
    REPORT_RANGES.map((r) => [r.id, r.days, r.label]),
    [
      ["7d", 7, "7 days"],
      ["30d", 30, "30 days"],
      ["90d", 90, "90 days"],
      ["month", null, "Month"],
    ],
    "one table, and Month has no days of its own",
  );
});

test("each tile names the figure it says where it is built, once: the report's six, in the order the view model lists them", () => {
  assert.deepEqual(
    toReportVM(dto(), { profile: null }).tiles.map((t) => [t.id, t.metric]),
    [
      ["messages", "customer_messages"],
      ["answered", "answered_share"],
      ["reply", "reply_median"],
      ["needed", "handovers"],
      ["calls", "calls"],
      ["people", "new_people"],
    ],
  );
});

test("a ratio's tile carries what it is of and the fewest that say anything; a count's tile that opens a work page names it; the rest say neither", () => {
  const by = Object.fromEntries(toReportVM(dto(), { profile: null }).tiles.map((t) => [t.id, t]));
  assert.equal(REPORT_MIN_N, 5, "one minimum, for every ratio the lenses draw (the lenses spec, D9)");
  assert.equal(by.answered.n, 17, "the share is of the 17 customer messages that had an answer or none");
  assert.equal(by.answered.minN, REPORT_MIN_N);
  assert.equal(by.reply.n, 8, "the median is of the 8 replies it was counted over");
  assert.equal(by.reply.minN, REPORT_MIN_N);
  assert.equal(by.messages.door, "conversations");
  assert.equal(by.needed.door, "inbox");
  for (const id of ["messages", "needed"]) {
    assert.ok(!("n" in by[id]) && !("minN" in by[id]), `${id} is a count, not a ratio`);
  }
  for (const id of ["answered", "reply"]) assert.ok(!("door" in by[id]), `${id} opens nothing`);
  for (const id of ["calls", "people"]) {
    assert.ok(!("door" in by[id]) && !("n" in by[id]) && !("minN" in by[id]), `${id} is what it was`);
  }
  // A quiet period has no replies and nothing to answer: the counts are zero, which is nothing to count, never absent
  // (the kit's figure then greys nothing: of none there is no ratio).
  const quietDto = dto({
    series: dto().series.map((d) => day(d.day)),
    reply_seconds: [],
    sentiments: {},
    voicemail: 0,
  });
  const quietBy = Object.fromEntries(toReportVM(quietDto, { profile: null }).tiles.map((t) => [t.id, t]));
  assert.deepEqual([quietBy.answered.n, quietBy.reply.n], [0, 0]);
});

test("Booked is a tile of contracts', with its figure: a count where the calendar was read, and why there is none where not", () => {
  assert.deepEqual(bookedTileOf(toBookingReportVM({ calendar: "ok", days: 7, asked: 8, booked: 3 })), {
    id: "booked",
    metric: "booked",
    label: "Booked",
    value: "3",
    meta: "of 8 who asked",
    compare: null,
  });
  const why = (b) => {
    const t = bookedTileOf(b);
    return [t.value, t.meta];
  };
  assert.deepEqual(why(toBookingReportVM({ calendar: "unavailable", days: 7, asked: 4, booked: 0 })), [
    "—",
    "the calendar could not be read",
  ]);
  assert.deepEqual(why(toBookingReportVM({ calendar: "none", days: 7, asked: 0, booked: 0 })), [
    "—",
    "no calendar link",
  ]);
  assert.deepEqual(why(null), ["—", "no calendar link"]);
  // Days that ended before today: the line is not counted at all, and says that instead of "no calendar link", which
  // would send a member with a calendar to connect one.
  assert.deepEqual(bookedTileOf(toBookingReportVM({ calendar: "ended", days: 7, asked: 0, booked: 0 })), {
    id: "booked",
    metric: "booked",
    label: "Booked",
    value: "—",
    meta: BOOKED_ENDED_META,
    compare: null,
  });
  assert.equal(
    BOOKED_ENDED_META,
    "not counted for days that have ended: it follows people as they stand today",
    "booking-report's reason (BOOKED_NEEDS_TODAY), in the workspace's words: never \"visit\" written in",
  );
});

test("a one-day period says one day: Month on the first of the month is read over one", () => {
  const vm = toReportVM(
    dto({
      days: 1,
      span_days: 2,
      today: "2026-09-04",
      series: [day("2026-09-03"), day("2026-09-04", { messages_in: 1, answered_ai: 1, conversations: 1 })],
    }),
    { profile: null },
  );
  assert.equal(vm.rangeLabel, "1 day");
  assert.equal(vm.tiles[0].meta, "on 1 of 1 day", "and every line that counts the days says it so");
});
