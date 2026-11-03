/**
 * A foot docked at the screen's foot rests folded or open under a thumb, as a sheet's two rests do (kit sheet/rests.ts
 * dockSwipe): an open thread's reply box on a phone (Ruben, 3 Nov 2026: "it should also work like the drawer sheets that
 * allow users to motion up and down to close and expand"). A pull up from folded opens it; a pull down from open follows
 * the finger and folds it past its length or on a flick, and settles back short of it; a pull across, the other way, in
 * a field, or while it is no phone moves nothing; a touch the system takes settles back.
 *
 * Run against rests.ts itself, on an element that keeps the listener the gesture adds to it, as a browser's does.
 */
import { test } from "node:test";
import assert from "node:assert/strict";

const { dockSwipe } = await import("../../../../../apps/dashboard/src/surfaces/kit/sheet/rests.ts");

const wait = (ms) => new Promise((r) => setTimeout(r, ms));

/** The foot: its style, and the touchmove listener the gesture reads it with (not passive, so a pull can be refused). */
const foot = () => {
  const el = {
    style: {},
    moved: null,
    addEventListener(type, fn, opts) {
      if (type === "touchmove") el.moved = { fn, passive: opts?.passive };
    },
    removeEventListener(type, fn) {
      if (type === "touchmove" && el.moved?.fn === fn) el.moved = null;
    },
  };
  return el;
};
/** Something the thumb lands on inside the foot: a field (the reply's words) or not. */
const onIt = (field = false) => ({ closest: (sel) => (field && sel.includes("textarea") ? {} : null) });

/** A thumb from (x, y) through each step; `end` lets it go ("end"), the system takes it ("cancel"), or it stays down. */
const pull = (h, el, from, steps, end = "end", target = onIt()) => {
  h.onTouchStart({ touches: [{ clientX: from[0], clientY: from[1] }], currentTarget: el, target });
  const refused = [];
  for (const [x, y] of steps)
    el.moved?.fn({ touches: [{ clientX: x, clientY: y }], cancelable: true, preventDefault: () => refused.push(y) });
  if (end === "end") h.onTouchEnd({ currentTarget: el });
  if (end === "cancel") h.onTouchCancel({ currentTarget: el });
  return refused;
};

const world = (open, when = true) => {
  const asked = [];
  const h = dockSwipe({ open, onOpen: () => asked.push("open"), onFold: () => asked.push("fold"), when: () => when });
  return { h, asked };
};

test("folded, a pull up opens it once it has gone 16px, and the page under it does not scroll; less, or down, does nothing", () => {
  const { h, asked } = world(false);
  const el = foot();
  h.onTouchStart({ touches: [{ clientX: 200, clientY: 700 }], currentTarget: el, target: onIt() });
  assert.equal(el.moved?.passive, false, "read from the foot itself, not passively, so the pull can be the foot's");
  h.onTouchCancel({ currentTarget: el });
  assert.equal(el.moved, null, "and let go of with the touch");

  const short = pull(
    h,
    el,
    [200, 700],
    [
      [200, 694],
      [200, 690],
    ],
  );
  assert.deepEqual(asked, [], "10px up: not yet");
  assert.deepEqual(short, [694, 690], "but already the foot's, never the page's scroll");
  pull(
    h,
    el,
    [200, 700],
    [
      [200, 694],
      [200, 680],
    ],
  );
  assert.deepEqual(asked, ["open"], "20px up: open");
  assert.equal(el.style.transform, undefined, "it opens where it stands, its height gliding there: nothing is written");
  pull(
    h,
    foot(),
    [200, 700],
    [
      [200, 710],
      [200, 760],
    ],
  );
  assert.deepEqual(asked, ["open"], "a pull down from folded is nothing");
});

test("open, a pull down follows the finger; let go past 64px it folds, and short of it it settles back", async () => {
  const { h, asked } = world(true);
  const el = foot();
  pull(
    h,
    el,
    [200, 500],
    [
      [200, 504],
      [200, 540],
      [200, 600],
    ],
    "down",
  );
  assert.equal(el.style.transform, "translate3d(0, 100px, 0)", "as far as the finger took it");
  assert.equal(el.style.transition, "none", "while the finger holds it, it moves at once");
  h.onTouchEnd({ currentTarget: el });
  assert.deepEqual(asked, ["fold"]);
  assert.equal(el.style.transform, "", "let go to the foot's own rule, which eases it home");
  assert.equal(el.style.transition, "");

  const slow = foot();
  pull(
    h,
    slow,
    [200, 500],
    [
      [200, 510],
      [200, 530],
    ],
    "down",
  );
  await wait(120);
  h.onTouchEnd({ currentTarget: slow });
  assert.deepEqual(asked, ["fold"], "30px, slowly: back where it was, open");
  assert.equal(slow.style.transform, "");
});

test("a flick down folds it however short the pull", () => {
  const { h, asked } = world(true);
  pull(
    h,
    foot(),
    [200, 500],
    [
      [200, 510],
      [200, 540],
    ],
  );
  assert.deepEqual(asked, ["fold"], "40px at once is a flick");
});

test("a pull up on the open foot, one across the screen, one in the reply's words, and any while it is no phone move nothing", () => {
  const open = world(true);
  const up = foot();
  pull(
    open.h,
    up,
    [200, 500],
    [
      [200, 490],
      [200, 400],
    ],
    "down",
  );
  assert.equal(up.style.transform, undefined, "up from open: nothing to go to");
  open.h.onTouchEnd({ currentTarget: up });
  const across = foot();
  pull(
    open.h,
    across,
    [200, 500],
    [
      [230, 504],
      [300, 520],
    ],
    "down",
  );
  assert.equal(across.style.transform, undefined, "across: the thread's swipe back, never the foot's");
  open.h.onTouchEnd({ currentTarget: across });
  const field = foot();
  pull(
    open.h,
    field,
    [200, 500],
    [
      [200, 520],
      [200, 640],
    ],
    "end",
    onIt(true),
  );
  assert.equal(field.moved, null, "a touch in the words is theirs: nothing listens");
  assert.equal(field.style.transform, undefined);
  assert.deepEqual(open.asked, []);

  const desk = world(false, false);
  const el = foot();
  pull(
    desk.h,
    el,
    [200, 700],
    [
      [200, 690],
      [200, 600],
    ],
  );
  assert.equal(el.moved, null);
  assert.deepEqual(desk.asked, [], "no phone: nothing");
});

test("a touch the system takes settles back, never folds", () => {
  const { h, asked } = world(true);
  const el = foot();
  pull(
    h,
    el,
    [200, 500],
    [
      [200, 510],
      [200, 640],
    ],
    "cancel",
  );
  assert.deepEqual(asked, []);
  assert.equal(el.style.transform, "", "back to the foot's own rule");
});
