/**
 * The range month's presses (surfaces/kit/datepicker/range-press.ts): what a pointer, a finger or a key does to a
 * range being picked, as a hand does it rather than as a test clicks. Ruben, 10 Oct 2026: "sometimes it doesn't select
 * the range I selected on first try and have to click around". In the browser, a press whose pointer slid a few
 * pixels past its day's edge before the release chose nothing at all, a drag from the first day to the last chose
 * nothing, the gap between two days' buttons was dead, and a first day pressed before a shortcut was still pressed
 * after it, so one more press made a range nobody asked for. Each is a case here.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  RANGE_SLOP_PX,
  dayIsOpen,
  rangePress,
  restingPress,
} from "../../../../apps/dashboard/src/surfaces/kit/datepicker/range-press.ts";

const RULES = { today: "2026-10-06", most: 90 };
const OF = "2026-09-07~2026-10-06";

/** Runs events over a resting press, and says what was chosen along the way. */
function run(events, { of = OF, rules = RULES, from } = {}) {
  let state = from ?? restingPress(of);
  const chose = [];
  for (const event of events) {
    const next = rangePress(state, event, rules);
    state = next.state;
    if (next.chose) chose.push(next.chose);
  }
  return { state, chose };
}

const down = (day, x = 100, y = 100, kind = "mouse") => ({ type: "down", day, kind, x, y });
const up = (day, x = 100, y = 100) => ({ type: "up", day, x, y });
const move = (x, y) => ({ type: "move", x, y });
const enter = (day) => ({ type: "enter", day });

test("a mouse press chooses on the press: a click, a click, and the range is chosen", () => {
  const { chose, state } = run([down("2026-10-01"), up("2026-10-01"), down("2026-10-05", 150), up("2026-10-05", 150)]);
  assert.deepEqual(chose, [{ from: "2026-10-01", to: "2026-10-05" }]);
  assert.equal(state.anchor, null, "and the month waits for a first day again");
});

test("a press whose pointer slid past its day's edge before the release is still that day's press", () => {
  // Pressed on October 2, let go 6px on, over October 3: a slip, not a drag.
  const first = run([down("2026-10-02", 140, 100), move(146, 100), up("2026-10-03", 146, 100)]);
  assert.equal(first.state.anchor, "2026-10-02", "the first day is pressed");
  assert.deepEqual(first.chose, [], "and nothing is chosen by a slip");
  // And the second press, slipping the same way, still chooses.
  const both = run([down("2026-10-05", 60, 140), move(64, 141), up(null, 64, 141)], { from: first.state });
  assert.deepEqual(both.chose, [{ from: "2026-10-02", to: "2026-10-05" }]);
});

test("a drag from the first day to the last chooses the range, the band following the pointer on the way", () => {
  let state = restingPress(OF);
  const step = (event) => {
    const next = rangePress(state, event, RULES);
    state = next.state;
    return next.chose;
  };
  step(down("2026-10-01", 100, 100));
  assert.equal(state.anchor, "2026-10-01");
  step(move(130, 100));
  step(enter("2026-10-03"));
  assert.equal(state.reach, "2026-10-03", "the band reaches where the pointer is");
  step(move(220, 140));
  step(enter("2026-10-05"));
  const chose = step(up("2026-10-05", 220, 140));
  assert.deepEqual(chose, { from: "2026-10-01", to: "2026-10-05" });
  assert.equal(state.anchor, null);
  // Backwards too: the range is in its order.
  const back = run([down("2026-10-05", 220, 140), move(100, 100), enter("2026-10-01"), up("2026-10-01", 100, 100)]);
  assert.deepEqual(back.chose, [{ from: "2026-10-01", to: "2026-10-05" }]);
});

test("a drag that comes back to its own day, or is let go off the month, leaves the first day pressed", () => {
  const home = run([
    down("2026-10-01", 100, 100),
    move(160, 100),
    enter("2026-10-03"),
    move(101, 100),
    up("2026-10-01", 101, 100),
  ]);
  assert.deepEqual(home.chose, []);
  assert.equal(home.state.anchor, "2026-10-01");
  const off = run([down("2026-10-01", 100, 100), move(400, 400), up(null, 400, 400)]);
  assert.deepEqual(off.chose, []);
  assert.equal(off.state.anchor, "2026-10-01");
  assert.equal(off.state.reach, "2026-10-01", "the band goes back to the day pressed");
});

test("a finger chooses on its lift, and a finger that travelled was scrolling", () => {
  const tap = (day, x, y) => [down(day, x, y, "touch"), up(day, x, y)];
  const picked = run([...tap("2026-09-20", 50, 50), ...tap("2026-09-24", 180, 50)]);
  assert.deepEqual(picked.chose, [{ from: "2026-09-20", to: "2026-09-24" }]);
  // Nothing is pressed until the finger lifts: a scroll begun on a day presses nothing.
  const held = run([down("2026-09-20", 50, 50, "touch")]);
  assert.equal(held.state.anchor, null);
  const scrolled = run([
    down("2026-09-20", 50, 50, "touch"),
    move(50, 50 + RANGE_SLOP_PX + 20),
    up("2026-09-20", 50, 90),
  ]);
  assert.equal(scrolled.state.anchor, null, "a finger that moved past the slop pressed nothing");
  const cancelled = run([down("2026-09-20", 50, 50, "touch"), { type: "cancel" }, up("2026-09-20", 50, 50)]);
  assert.equal(cancelled.state.anchor, null, "the browser took the touch for a scroll");
  // A finger that wobbled within the slop is a tap.
  const wobble = run([down("2026-09-20", 50, 50, "touch"), move(53, 52), up("2026-09-20", 53, 52)]);
  assert.equal(wobble.state.anchor, "2026-09-20");
});

test("a key chooses as a press does", () => {
  const keys = run([
    { type: "key", day: "2026-09-10" },
    { type: "key", day: "2026-09-14" },
  ]);
  assert.deepEqual(keys.chose, [{ from: "2026-09-10", to: "2026-09-14" }]);
});

test("one day pressed twice is that day alone", () => {
  const { chose } = run([down("2026-10-01"), up("2026-10-01"), down("2026-10-01"), up("2026-10-01")]);
  assert.deepEqual(chose, [{ from: "2026-10-01", to: "2026-10-01" }]);
});

test("a day that cannot be chosen chooses nothing, and the month says why", () => {
  const toCome = run([down("2026-10-08"), up("2026-10-08")]);
  assert.equal(toCome.state.anchor, null);
  assert.deepEqual(toCome.state.refused, { day: "2026-10-08", why: "to-come" });
  const far = run([down("2026-06-01"), up("2026-06-01"), down("2026-09-20"), up("2026-09-20")], {
    rules: { today: "2026-10-06", most: 90 },
  });
  assert.equal(far.state.anchor, "2026-06-01", "June 1 is pressed: today is in reach of nothing yet");
  assert.deepEqual(far.state.refused, { day: "2026-09-20", why: "too-far" });
  assert.deepEqual(far.chose, []);
  // The next press that does something lets go of the words.
  const after = rangePress(far.state, down("2026-07-01"), RULES);
  assert.equal(after.state.refused, null);
  assert.deepEqual(after.chose, { from: "2026-06-01", to: "2026-07-01" });
});

test("dayIsOpen: no day to come, and with a first day pressed none too far to be the other end", () => {
  const rest = restingPress(OF);
  assert.equal(dayIsOpen(rest, "2026-10-06", RULES), true);
  assert.equal(dayIsOpen(rest, "2026-10-07", RULES), false);
  const pressed = run([down("2026-09-20"), up("2026-09-20")], { rules: { today: "2026-10-06", most: 14 } }).state;
  const rules = { today: "2026-10-06", most: 14 };
  assert.deepEqual(
    ["2026-09-07", "2026-09-06", "2026-10-03", "2026-10-04"].map((d) => dayIsOpen(pressed, d, rules)),
    [true, false, true, false],
    "thirteen days either side is the fourteenth day",
  );
});

test("Escape lets go of the first day, and is not the month's when none is pressed", () => {
  const pressed = run([down("2026-10-01"), up("2026-10-01")]).state;
  const esc = rangePress(pressed, { type: "escape" }, RULES);
  assert.equal(esc.handled, true);
  assert.equal(esc.state.anchor, null);
  assert.equal(rangePress(esc.state, { type: "escape" }, RULES).handled, false);
});

test("the pointer leaving the month takes the band back to the first day pressed", () => {
  const s = run([down("2026-10-01"), up("2026-10-01"), enter("2026-10-04"), { type: "leave" }]).state;
  assert.equal(s.reach, "2026-10-01");
});

test("a press is of one range: once the range changes from beside the month, a first day pressed before is let go", () => {
  const pressed = run([down("2026-09-02"), up("2026-09-02")]).state;
  assert.equal(pressed.anchor, "2026-09-02");
  // "Last week" pressed beside the month: the range it shows is another. The press held is not of it.
  const after = rangePress(pressed, down("2026-10-01"), RULES, "2026-09-28~2026-10-04");
  assert.deepEqual(
    after.chose,
    null,
    "one press after the shortcut is a first day, never the end of a range begun before it",
  );
  assert.equal(after.state.anchor, "2026-10-01");
  assert.equal(after.state.of, "2026-09-28~2026-10-04");
});
