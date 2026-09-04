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
import { toReportVM, deltaOf, quantile, fmtSeconds, fmtDay, REPORT_RANGES } from "@chanlytics/contracts";

function day(d, over = {}) {
  return { day: d, messages_in: 0, conversations: 0, answered_ai: 0, answered_you: 0, unanswered: 0, out_ai: 0, out_you: 0, escalations: 0, calls: 0, call_seconds: 0, new_contacts: 0, ...over };
}

/** Seven previous days (quiet) then seven current days (busy). */
function dto(over = {}) {
  const prev = ["2026-08-22", "2026-08-23", "2026-08-24", "2026-08-25", "2026-08-26", "2026-08-27", "2026-08-28"].map((d) => day(d, { messages_in: 1, answered_ai: 1, conversations: 1 }));
  const cur = [
    day("2026-08-29", { messages_in: 4, conversations: 2, answered_ai: 3, answered_you: 1, calls: 1, call_seconds: 90, new_contacts: 1 }),
    day("2026-08-30", { messages_in: 2, conversations: 1, answered_ai: 2 }),
    day("2026-08-31"),
    day("2026-09-01", { messages_in: 5, conversations: 3, answered_ai: 3, answered_you: 1, unanswered: 1, escalations: 2, calls: 2, call_seconds: 300 }),
    day("2026-09-02", { messages_in: 1, conversations: 1, answered_you: 1, new_contacts: 1 }),
    day("2026-09-03", { messages_in: 3, conversations: 2, answered_ai: 3, escalations: 1 }),
    day("2026-09-04", { messages_in: 2, conversations: 1, answered_ai: 2 }),
  ];
  return {
    timezone: "America/New_York", days: 7, span_days: 14, today: "2026-09-04",
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
  assert.deepEqual(deltaOf(12, 10, false, "7 days"), { text: "+20% vs prior 7 days", tone: "neg" }, "more escalations is not good news");
  assert.deepEqual(deltaOf(8, 10, false, "30 days"), { text: "-20% vs prior 30 days", tone: "pos" });
});

test("reply time: median and slowest tenth from the raw seconds, bucketed on fixed edges", () => {
  const vm = toReportVM(dto());
  assert.equal(vm.replyTime.count, 8);
  assert.equal(vm.replyTime.median, 27.5);
  assert.equal(vm.replyTime.medianLabel, "28s");
  assert.equal(Math.round(vm.replyTime.p90), 880);
  assert.equal(vm.replyTime.p90Label, "15m");
  assert.deepEqual(vm.replyTime.buckets.map((b) => [b.id, b.value]), [["lt15", 3], ["lt60", 2], ["lt300", 1], ["lt1800", 1], ["gte1800", 1]]);
  assert.equal(quantile([], 0.5), null);
  assert.equal(fmtSeconds(65), "1m 05s");
  assert.equal(fmtSeconds(3900), "1h 05m");
  assert.equal(fmtSeconds(null), "—");
});

test("escalation reasons are labelled in the owner's words, largest first", () => {
  const vm = toReportVM(dto());
  assert.deepEqual(vm.reasons.map((r) => [r.label, r.value, r.share]), [["Asked for a person", 2, 1], ["Needs your approval", 1, 0.5]]);
});

test("an empty period says so instead of drawing zero-height bars as if they meant something", () => {
  const quiet = dto({ series: dto().series.map((d) => day(d.day)), reasons: {}, reply_seconds: [], sentiments: {}, voicemail: 0 });
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
  assert.deepEqual(REPORT_RANGES.map((r) => r.days), [7, 30, 90]);
});
