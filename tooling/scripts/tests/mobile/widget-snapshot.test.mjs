/**
 * The widget's snapshot (contracts mobile/today-widget.ts): Today's figures, the one count every surface says and the
 * first person who needs you, in the page's words, from the Today view model and the parts of what waits; and what the
 * shell trusts after the bridge (contracts mobile/widget.ts).
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { parseTodayWidgetSnapshot } from "../../../../packages/contracts/src/mobile/widget.ts";
import { todayWidgetSnapshot } from "../../../../packages/contracts/src/mobile/today-widget.ts";

const vm = {
  standing: {
    headline: "2 people need you",
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
  // The queue's first row is not the needs-you list's first: the page's Today draws the queue's.
  queue: {
    rows: [{ kind: "handoff", who: "Dana", sentence: "wants to move her booking", id: "q1" }],
    more: 0,
    parts: [],
    empty: { headline: "", sub: "" },
    windows: 0,
  },
};
/** The parts of what waits, as the badge counts them. */
const needs = (over = {}) => ({ holds: 2, sends: 0, runs: 0, ...over });

test("the snapshot is Today's own words and numbers, as of a moment", () => {
  const at = new Date("2026-09-26T15:00:00Z");
  assert.deepEqual(todayWidgetSnapshot(vm, at, needs()), {
    headline: "2 people need you",
    figures: [
      { label: "messages", value: 12 },
      { label: "answered", value: 11 },
      { label: "calls", value: 3 },
      { label: "new people", value: 1 },
    ],
    waiting: 2,
    first: { who: "Dana", reason: "wants to move her booking" },
    at: "2026-09-26T15:00:00.000Z",
  });
  const quiet = todayWidgetSnapshot(
    { ...vm, figures: null, needsYou: null, queue: { ...vm.queue, rows: [] } },
    at,
    needs({ holds: 0 }),
  );
  assert.deepEqual(quiet.figures, []);
  assert.equal(quiet.first, null);
  assert.equal(quiet.waiting, 0);
});

test("the widget says the badge's number and never a window as someone who needs you (S8-4)", () => {
  const at = new Date("2026-09-26T15:00:00Z");
  const window = { kind: "window", who: "Eve", sentence: "her reply window closes in 2h", id: "q0" };
  const first = todayWidgetSnapshot({ ...vm, queue: { ...vm.queue, rows: [window, ...vm.queue.rows] } }, at, needs());
  assert.deepEqual(first.first, { who: "Dana", reason: "wants to move her booking" }, "the first hold, not the window");
  const onlyWindow = todayWidgetSnapshot({ ...vm, queue: { ...vm.queue, rows: [window] } }, at, needs({ holds: 0 }));
  assert.equal(onlyWindow.first, null, "REGRESSION: a closing window was shown as the person who needs you");
  assert.equal(onlyWindow.waiting, 0);
  const runAndSend = todayWidgetSnapshot(vm, at, needs({ holds: 0, sends: 1, runs: 1 }));
  assert.equal(runAndSend.waiting, 2, "a reply counting down and a run waiting for a word, as the badge counts them");
  assert.equal(runAndSend.first, null, "neither is a person's row");
});

test("after the bridge the shell trusts the shapes and the sizes, nothing else", () => {
  const good = todayWidgetSnapshot(vm, new Date("2026-09-26T15:00:00Z"), needs());
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
