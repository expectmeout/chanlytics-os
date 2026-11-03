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
  // A day that could read none of its counts (the four always stand since Today in three zones, 2 Nov 2026: a count not
  // read is a dash there) puts no figure on the widget, never a zero it does not know.
  const unread = vm.figures.map((f) => ({ ...f, value: null }));
  const quiet = todayWidgetSnapshot(
    { ...vm, figures: unread, needsYou: null, queue: { ...vm.queue, rows: [] } },
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

test("given the one count, the widget says the badge's number, the head's lead, and only someone the count holds", () => {
  const at = new Date("2026-09-26T15:00:00Z");
  const window = { kind: "window", who: "Eve", sentence: "her reply window closes in 2h", id: "q0", waitedMs: 600_000 };
  // A closing window counts on the badge (0048, amended 2 Nov 2026), but it is nobody who needs you by a hold.
  const lone = todayWidgetSnapshot({ ...vm, queue: { ...vm.queue, rows: [window] } }, at, needs({ holds: 0 }), 1);
  assert.equal(lone.waiting, 1, "the badge's number: the window counts");
  assert.equal(lone.first, null, "a window is never shown as the person who needs you");
  assert.equal(lone.headline, "1 needs you.", "the head's lead over the same count");
  // A hold past a week is Older: never counted, never named, and the widget says nothing needs you, as the head does.
  const older = { ...vm.queue.rows.find((r) => r.kind === "handoff"), waitedMs: 9 * 86_400_000 };
  const old = todayWidgetSnapshot({ ...vm, queue: { ...vm.queue, rows: [older] } }, at, needs({ holds: 1 }), 0);
  assert.equal(old.waiting, 0);
  assert.equal(old.first, null, "REGRESSION: a week-old hold was named beside a count of 0");
  assert.equal(old.headline, "Nothing needs you.");
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
