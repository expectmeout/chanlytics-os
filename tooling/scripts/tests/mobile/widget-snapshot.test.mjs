/**
 * The widget's snapshot (contracts/widget.ts): Today's figures, the waiting count and the first person, in the
 * page's words, from the Today view model; and what the shell trusts after the bridge.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { todayWidgetSnapshot, parseTodayWidgetSnapshot } from "../../../../packages/contracts/src/mobile/widget.ts";

const vm = {
  standing: {
    headline: "2 people need you",
    eyebrow: "",
    chips: [],
    lines: { text: "", down: false },
    alert: null,
    detail: null,
    tone: "needs",
  },
  needsYou: {
    count: 2,
    hint: "",
    empty: null,
    rows: [
      {
        who: "Maria",
        reason: "asked for a person",
        id: "a",
        conversationId: "c",
        escalationId: "e",
        waited: "4m",
        warn: false,
        quote: "",
        meta: "",
        windowNote: null,
        to: "inbox/th-c",
      },
    ],
  },
  figures: [
    { id: "messages", label: "messages", value: 12, meta: "", receipt: null },
    { id: "answered", label: "answered", value: 11, meta: "", receipt: null },
    { id: "calls", label: "calls", value: 3, meta: "", receipt: null },
    { id: "new", label: "new people", value: 1, meta: "", receipt: null },
  ],
  queue: { rows: [], more: 0, parts: [], empty: { headline: "", sub: "" }, waiting: 2 },
};

test("the snapshot is Today's own words and numbers, as of a moment", () => {
  const at = new Date("2026-09-26T15:00:00Z");
  assert.deepEqual(todayWidgetSnapshot(vm, at), {
    headline: "2 people need you",
    figures: [
      { label: "messages", value: 12 },
      { label: "answered", value: 11 },
      { label: "calls", value: 3 },
      { label: "new people", value: 1 },
    ],
    waiting: 2,
    first: { who: "Maria", reason: "asked for a person" },
    at: "2026-09-26T15:00:00.000Z",
  });
  const quiet = todayWidgetSnapshot({ ...vm, figures: null, needsYou: null, queue: { ...vm.queue, waiting: 0 } }, at);
  assert.deepEqual(quiet.figures, []);
  assert.equal(quiet.first, null);
  assert.equal(quiet.waiting, 0);
});

test("after the bridge the shell trusts the shapes and the sizes, nothing else", () => {
  const good = todayWidgetSnapshot(vm, new Date("2026-09-26T15:00:00Z"));
  assert.deepEqual(parseTodayWidgetSnapshot(JSON.parse(JSON.stringify(good))), good);
  assert.equal(parseTodayWidgetSnapshot({ ...good, waiting: -1 }), null);
  assert.equal(parseTodayWidgetSnapshot({ ...good, at: "yesterday" }), null);
  assert.equal(parseTodayWidgetSnapshot({ ...good, figures: [{ label: "x", value: "3" }] }), null);
  assert.equal(parseTodayWidgetSnapshot({ ...good, first: { who: "a" } }), null);
  assert.deepEqual(parseTodayWidgetSnapshot({ ...good, first: null })?.first, null);
  const long = parseTodayWidgetSnapshot({ ...good, headline: "h".repeat(200) });
  assert.equal(long?.headline.length, 80, "a headline is cut to the widget's width");
  assert.equal(
    parseTodayWidgetSnapshot({ ...good, figures: Array(6).fill({ label: "x", value: 1 }) })?.figures.length,
    4,
  );
  assert.equal(parseTodayWidgetSnapshot(null), null);
});
