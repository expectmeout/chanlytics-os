/**
 * A move reads what it holds once its motion is over (legacy-bridge/hearing/after-the-move.ts; the strips review, 18 Oct 2026).
 *
 * People's book was read again at the press of People's tab, and its answer landed under the slide: its parse and the page
 * drawn again held the frames of the move. A surface the tab has never read is read at the press, since its page waits on
 * it; one it holds is read once the deck's timeline is over, and a second move inside it adds its own to the one read.
 *
 * Run on the real hearing over a window held here, the clock by hand.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { importSrc } from "../../_source.mjs";

const { hearMoves } = await importSrc("apps/dashboard/src/legacy-bridge/hearing/after-the-move.ts");
const { setStatus } = await importSrc("apps/dashboard/src/legacy-bridge/surface-status.ts");

/** A window on Today whose address the test moves, as a popstate tells it. */
function windowOnToday(extra = {}) {
  const heard = new Set();
  const win = {
    ...extra,
    location: { pathname: "/w/acme", search: "", hash: "#/today" },
    addEventListener: (type, fn) => type === "popstate" && heard.add(fn),
    removeEventListener: (_type, fn) => heard.delete(fn),
  };
  const go = (route) => {
    win.location.hash = `#/${route}`;
    for (const fn of [...heard]) fn();
  };
  return { win, go };
}

setStatus("held-1", "live");
setStatus("held-2", "live");

test("a surface never read is read at the press, and one the tab holds once the move's motion is over", (t) => {
  t.mock.timers.enable({ apis: ["setTimeout"] });
  const { win, go } = windowOnToday();
  const reads = [];
  const stop = hearMoves(
    () => ["never", "held-1"],
    (keys) => reads.push(keys),
    win,
  );
  go("inbox");
  assert.deepEqual(reads, [["never"]], "what its page waits on, at once");
  t.mock.timers.tick(459);
  assert.equal(reads.length, 1, "nothing read under the slide");
  t.mock.timers.tick(1);
  assert.deepEqual(reads, [["never"], ["held-1"]], "what it holds, after the deck's timeline");
  stop();
});

test("a second move inside the motion adds its own, and one read takes them all", (t) => {
  t.mock.timers.enable({ apis: ["setTimeout"] });
  const { win, go } = windowOnToday();
  const reads = [];
  let due = ["held-1"];
  const stop = hearMoves(
    () => due,
    (keys) => reads.push(keys),
    win,
  );
  go("inbox");
  t.mock.timers.tick(200);
  due = ["held-2"];
  go("conversations");
  t.mock.timers.tick(260);
  assert.deepEqual(reads, [["held-1", "held-2"]], "both, once the first move's motion is over");
  t.mock.timers.tick(1000);
  assert.equal(reads.length, 1, "and only once");
  stop();
});

test("a stop drops what is still owed, and a window that says there is no motion reads at once", (t) => {
  t.mock.timers.enable({ apis: ["setTimeout"] });
  const reads = [];
  const moving = windowOnToday();
  const stop = hearMoves(
    () => ["held-1"],
    (keys) => reads.push(keys),
    moving.win,
  );
  moving.go("inbox");
  stop();
  t.mock.timers.tick(1000);
  assert.deepEqual(reads, [], "nothing read after the stop");
  const still = windowOnToday({ __afterTheMoveMs: 0 });
  const stopStill = hearMoves(
    () => ["held-1"],
    (keys) => reads.push(keys),
    still.win,
  );
  still.go("inbox");
  assert.deepEqual(reads, [["held-1"]], "a test's window, with no motion to wait out");
  stopStill();
});
