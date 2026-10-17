/**
 * What came while the business was closed is counted by the workspace's own hours and closures (spec D16, A2),
 * each quarter hour asked the one question (openAt). Without hours, or from a report that has no arrivals, nothing is
 * said: never a guess at 8 to 8. 14 Sep 2026 is a Monday.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { closedOf, reportFacts, toReportVM } from "@chanlytics/contracts";

const profile = {
  hours: {
    mon: { open: "09:30", close: "18:00" },
    tue: { open: "09:30", close: "18:00" },
    wed: { open: "09:30", close: "18:00" },
    thu: { open: "09:30", close: "18:00" },
    fri: { open: "09:30", close: "19:00" },
    sat: { open: "09:30", close: "19:00" },
  },
  closures: [{ date: "2026-09-18" }],
};
const q = (h, m = 0) => h * 4 + Math.floor(m / 15);
const arrivals = [
  { d: "2026-09-14", q: q(9, 20), n: 1 }, // Monday 9:15-9:30, before opening: closed
  { d: "2026-09-14", q: q(9, 30), n: 2 }, // open
  { d: "2026-09-16", q: q(21), n: 7 }, // Wednesday evening: closed
  { d: "2026-09-18", q: q(12), n: 3 }, // Friday, a closure: closed
  { d: "2026-09-20", q: q(11), n: 1 }, // Sunday, no hours: closed
];

test("each quarter hour against the workspace's own hours and closures", () => {
  assert.equal(closedOf(arrivals, profile), 12);
});

test("no hours said, no profile, or no arrivals: nothing is counted", () => {
  assert.equal(closedOf(arrivals, { hours: {} }), null);
  assert.equal(closedOf(arrivals, null), null);
  assert.equal(closedOf(undefined, profile), null, "a report from before 00304");
});

const day = (d, over = {}) => ({
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
});
const days7 = ["2026-09-14", "2026-09-15", "2026-09-16", "2026-09-17", "2026-09-18", "2026-09-19", "2026-09-20"];
const hours = Array.from({ length: 7 }, () => Array(24).fill(0));
hours[2][21] = 7;
hours[0][9] = 3;
const dto = {
  timezone: "America/New_York",
  days: 7,
  span_days: 14,
  today: "2026-09-20",
  series: [
    ...days7.map((d) => day(d.replace("-09-", "-08-"))),
    ...days7.map((d, i) => day(d, i === 2 ? { messages_in: 10 } : {})),
  ],
  reasons: {},
  reply_seconds: [],
  sentiments: {},
  voicemail: 0,
  hours,
  arrivals,
};

test("the busiest day's line says what came while the business was closed, and nothing without hours", () => {
  const withHours = reportFacts(toReportVM(dto, { profile }), null).find((f) => f.id === "busiest");
  assert.match(withHours.sub, /12 while you were closed$/);
  const without = reportFacts(toReportVM(dto), null).find((f) => f.id === "busiest");
  assert.doesNotMatch(without.sub, /closed|8am/);
  assert.equal(toReportVM(dto).hours.closed, null);
});

const noHours = { hours: {} };
const FACT_HOURS = {
  id: "hours",
  tone: "",
  icon: "clock",
  text: "Set your business hours to see what came in while you were closed",
  sub: "",
  door: { label: "Open Settings", to: "admin/hours" },
};
const factIds = (vm) => reportFacts(vm, null).map((f) => f.id);

test("a workspace that has said no hours is told so, with the door to set them; an unread profile and an old report are told nothing", () => {
  for (const p of [noHours, {}, { closures: [{ date: "2026-09-18" }] }]) {
    const vm = toReportVM(dto, { profile: p });
    assert.equal(vm.hoursUnset, true, JSON.stringify(p));
    assert.equal(vm.hours.closed, null, "nothing is counted without hours");
    assert.deepEqual(
      reportFacts(vm, null).find((f) => f.id === "hours"),
      FACT_HOURS,
    );
  }
  const old = { ...dto, arrivals: undefined };
  for (const [what, vm] of [
    ["hours said", toReportVM(dto, { profile })],
    ["the profile could not be read", toReportVM(dto, { profile: null })],
    ["no profile given", toReportVM(dto)],
    ["a report from before 00304", toReportVM(old, { profile: noHours })],
  ]) {
    assert.equal(vm.hoursUnset, false, what);
    assert.ok(!factIds(vm).includes("hours"), `${what}: no door to set the hours`);
  }
});

test("with hours and no one busiest day, what came while closed is a line of its own, with the peak; a busiest day keeps it in its own line", () => {
  const tied = {
    ...dto,
    series: dto.series.map((d) => (d.day === "2026-09-18" ? { ...d, messages_in: 10 } : d)),
  };
  const tie = toReportVM(tied, { profile });
  assert.equal(tie.week.busiest, null, "Wednesday and Friday tie");
  assert.deepEqual(
    reportFacts(tie, null).find((f) => f.id === "closed"),
    {
      id: "closed",
      tone: "",
      icon: "clock",
      text: "12 came in while you were closed",
      sub: "peak 8pm to 10pm",
      door: null,
    },
  );
  assert.ok(!factIds(tie).includes("busiest"));
  // One busiest day: the count rides in its line, never said twice.
  const one = reportFacts(toReportVM(dto, { profile }), null);
  assert.ok(!one.some((f) => f.id === "closed"));
  assert.equal(one.find((f) => f.id === "busiest").sub, "peak 8pm to 10pm, 12 while you were closed");
  // Nothing came while closed, no hours said, or the profile unread: no such line.
  const alwaysOpen = {
    hours: Object.fromEntries(
      ["mon", "tue", "wed", "thu", "fri", "sat", "sun"].map((d) => [d, { open: "00:00", close: "23:59" }]),
    ),
  };
  for (const p of [alwaysOpen, noHours, null]) assert.ok(!factIds(toReportVM(tied, { profile: p })).includes("closed"));
});
