/**
 * A chart in Ask's answer, on the contract itself (answer-text.ts answerChart): closed kinds, each a part of the chart kit
 * (the answer canvas, C3), up to three series of numbers read this turn, never a free-form spec. What the model writes is
 * read back here; a chart stored before it had series reads as one series.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  ASK_ANSWER_CAPS as C,
  ASK_ANSWER_FORMAT,
  answerCopy,
  answerWords,
  emptyReadSet,
  normalizeAnswer,
  noteRows,
  storedAnswer,
  v1FromAnswer,
} from "@chanlytics/contracts";

const REPORTS = { kind: "page", id: "reports", label: "Reports" };
const OPENED = { ...REPORTS, to: "reports", door: true };
const UNREAD = "44444444-4444-4444-8444-444444444444";
const NONE = { kind: "none", id: "", label: "" };

/** An answer with this chart, as the model writes it; none of its other parts say anything. */
const withChart = (chart) => ({
  say: { headline: "Reviews are up.", detail: "" },
  show: { figures: [], items: [], breakdown: null, chart, list: { style: "bullets", entries: [] } },
  do: { open: { source: NONE, label: "", now: false }, next: [] },
  language: "en",
});
/** The chart read back, in a turn that read Reports. */
const read = (chart) => {
  const set = emptyReadSet();
  noteRows(set, [{ kind: "page", id: "reports", route: "reports", label: "Reports" }]);
  const r = normalizeAnswer(JSON.stringify(withChart(chart)), set, "en");
  assert.equal(r.ok, true, r.error);
  return r.answer;
};
const chartOf = (chart) => read(chart).show.chart;

const WEEKS = [
  { label: "Sep 22", values: [3] },
  { label: "Sep 29", values: [5] },
  { label: "Oct 6", values: [4] },
];
const one = { label: "bookings a week", series: ["bookings"], points: WEEKS, source: REPORTS };
/** Three series of two days: who answered, as the report's by_day says it. */
const WHO = {
  kind: "columns",
  label: "messages a day",
  series: ["receptionist", "you", "unanswered"],
  points: [
    { label: "Oct 5", values: [6, 2, 1] },
    { label: "Oct 6", values: [4, 3, 0] },
  ],
  source: REPORTS,
};

test("a chart of one series comes back whole, its source grounded", () => {
  for (const kind of ["line", "columns", "bars"])
    assert.deepEqual(chartOf({ ...one, kind }), { ...one, kind, source: OPENED });
});

test("a chart of two or three series keeps each one's numbers, in the series' order", () => {
  assert.deepEqual(chartOf(WHO), { ...WHO, source: OPENED });
  assert.deepEqual(chartOf({ ...WHO, kind: "line" }), { ...WHO, kind: "line", source: OPENED });
});

test("three series at most: a fourth and its numbers go, and what stands is the first three", () => {
  const drawn = chartOf({
    ...WHO,
    series: ["a", "b", "c", "d"],
    points: [
      { label: "Oct 5", values: [1, 2, 3, 4] },
      { label: "Oct 6", values: [5, 6, 7, 8] },
    ],
  });
  assert.deepEqual(drawn.series, ["a", "b", "c"]);
  assert.deepEqual(
    drawn.points.map((p) => p.values),
    [
      [1, 2, 3],
      [5, 6, 7],
    ],
  );
});

test("a bar list draws one series, so bars of two or three are columns: no series is left out", () => {
  assert.equal(chartOf({ ...WHO, kind: "bars" }).kind, "columns");
  assert.equal(chartOf({ ...one, kind: "bars" }).kind, "bars");
});

test("a chart with no series named is its label's one count", () => {
  assert.deepEqual(chartOf({ ...one, kind: "line", series: [] }).series, ["bookings a week"]);
});

test("the kinds are closed: anything else is no chart", () => {
  for (const kind of ["pie", "radar", "vega", ""]) assert.equal(chartOf({ ...one, kind }), undefined, kind);
});

test("none with fewer than two points, no label or a source this turn did not read", () => {
  assert.equal(chartOf({ ...one, kind: "line", points: WEEKS.slice(0, 1) }), undefined);
  assert.equal(chartOf({ ...one, kind: "line", label: "" }), undefined);
  const elsewhere = { kind: "thread", id: UNREAD, label: "?" };
  assert.equal(chartOf({ ...one, kind: "bars", source: elsewhere }), undefined);
  assert.equal(chartOf({ ...one, kind: "bars", source: NONE }), undefined, "no source, no chart");
});

test("a point goes whole: one missing a series' number, or holding one that is no count, is left out", () => {
  const drawn = chartOf({
    ...WHO,
    points: [
      { label: "Oct 4", values: [1, 2] },
      { label: "Oct 5", values: [6, -1, 1] },
      { label: "Oct 6", values: [4, 3, 0] },
      { label: "Oct 7", values: [2, 2, 2] },
    ],
  });
  assert.deepEqual(
    drawn.points.map((p) => p.label),
    ["Oct 6", "Oct 7"],
  );
});

test("a month by day fits: a series over time keeps its newest points, bars their first", () => {
  assert.equal(C.points, 31, "the days of the longest month, so a 30-day report draws whole");
  const many = Array.from({ length: 34 }, (_, i) => ({ label: `d${i + 1}`, values: [i] }));
  const days = (kind) => chartOf({ ...one, kind, points: many }).points;
  assert.equal(days("line").length, 31);
  assert.equal(days("line")[0].label, "d4", "the newest");
  assert.equal(days("columns")[0].label, "d4", "the newest");
  assert.equal(days("bars").at(-1).label, "d31", "the first");
});

test("the format says each limit and each kind, and nothing it says is free-form", () => {
  const chart = ASK_ANSWER_FORMAT.properties.show.properties.chart;
  assert.deepEqual(chart.properties.kind.enum, ["line", "columns", "bars"]);
  assert.match(chart.description, new RegExp(`\\b${C.points}\\b`));
  assert.match(chart.properties.series.description, new RegExp(`\\b${C.series}\\b`));
  assert.equal(chart.properties.points.items.properties.values.items.type, "number");
  assert.equal(chart.additionalProperties, false);
});

test("Copy, the answer's words and the citations carry every series", () => {
  const drawn = read(WHO);
  assert.ok(
    answerCopy(drawn).includes("messages a day (receptionist, you, unanswered): Oct 5 6 / 2 / 1, Oct 6 4 / 3 / 0"),
    answerCopy(drawn),
  );
  const said = answerWords(drawn);
  for (const word of ["receptionist", "unanswered", "Oct 5", "6", "3"]) assert.ok(said.includes(word), word);
  assert.ok(v1FromAnswer(drawn).citations.some((c) => c.kind === "page" && c.id === "reports"));
  const single = read({ ...one, kind: "line" });
  assert.ok(answerCopy(single).includes("bookings a week: Sep 22 3, Sep 29 5, Oct 6 4"), answerCopy(single));
});

test("an answer with no chart carries no key", () => {
  assert.equal("chart" in read(undefined).show, false);
});

test("a chart stored before series had one value to a point: it reads as one series, under its label", () => {
  const before = {
    ...read(undefined),
    show: {
      ...read(undefined).show,
      chart: {
        kind: "line",
        label: "bookings a week",
        points: [
          { label: "Sep 22", value: 3 },
          { label: "Sep 29", value: 5 },
        ],
        source: OPENED,
      },
    },
  };
  assert.deepEqual(storedAnswer(before).show.chart, {
    kind: "line",
    label: "bookings a week",
    series: ["bookings a week"],
    points: [
      { label: "Sep 22", values: [3] },
      { label: "Sep 29", values: [5] },
    ],
    source: OPENED,
  });
});

test("an answer already whole is handed back as it came", () => {
  const whole = read(WHO);
  assert.equal(storedAnswer(whole), whole);
});
