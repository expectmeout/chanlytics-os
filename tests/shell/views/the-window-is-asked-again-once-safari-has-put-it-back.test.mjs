/**
 * The window asked for a top, and asked again once Safari has put it back (apps/dashboard/src/surfaces/kit/motion/
 * page-scroll.ts `windowTo`, `windowAsked`).
 *
 * On an iPhone the window's scroll is Safari's. A page's own scroll to its top, made in the instant the address changes,
 * is thrown away inside Safari while it changes its chrome; the page believes it for a few frames, then Safari says where
 * the window still stands. Every page opened after a little scroll on People sat 22px down from its first frame (Ruben's
 * recording, 7 Nov 2026: the frame top's fade, drawn only while the page believes it is scrolled, blinked off for three
 * frames at each arrival and came back with the content never having moved). So the window is heard for a few frames
 * after it is asked: put back between the ask and where it stood, with no touch, wheel or key since, it is asked again,
 * at most twice (a Back on 23 Oct 2026 answered 40 for 4.5 seconds: never a loop); a scroll past either is the page's own;
 * a page's next ask replaces the last.
 *
 * Run against the module itself, on a window that answers what it asks of it: a scroll it is given, a scroll Safari makes
 * of its own, and frames that pass only as the test lets them.
 */
import { test } from "node:test";
import assert from "node:assert/strict";

const { windowTo, windowAsked } = await import("../../../apps/dashboard/src/surfaces/kit/motion/page-scroll.ts");

/** How many frames the window is heard after an ask (page-scroll.ts SAFARI_PUTS_BACK_FRAMES). */
const SAFARI_PUTS_BACK_FRAMES = 20;

/** A window: where it is scrolled to, what it was asked, what it hears, and frames the test lets pass. */
const aWindow = ({ at = 22 } = {}) => {
  const heard = {};
  const queued = new Map();
  let made = 0;
  const win = {
    scrollY: at,
    /** Every top the window was asked for, in order. */
    asked: [],
    scrollTo(x, y) {
      this.asked.push(y);
      this.scrollY = y;
    },
    addEventListener: (kind, fn) => (heard[kind] = fn),
    removeEventListener: (kind, fn) => heard[kind] === fn && delete heard[kind],
    requestAnimationFrame: (fn) => (queued.set(++made, fn), made),
    cancelAnimationFrame: (id) => queued.delete(id),
    /** Safari puts the window at `y` of its own, and the page hears of it. */
    safariPutsAt(y) {
      this.scrollY = y;
      heard.scroll?.();
    },
    /** The page's own scroll has landed where it asked, and the page hears of it. */
    ownScrollLands() {
      heard.scroll?.();
    },
    /** A hand on the window. */
    touched: (kind = "touchstart") => heard[kind]?.({}),
    /** `n` frames pass. */
    frames(n) {
      for (let i = 0; i < n; i += 1) {
        const due = [...queued.entries()];
        queued.clear();
        for (const [, fn] of due) fn();
      }
    },
    listening: () => Object.keys(heard),
  };
  return win;
};

test("asked for a top, the window is scrolled there", () => {
  const win = aWindow({ at: 22 });
  windowTo(0, win);
  assert.deepEqual(win.asked, [0]);
  assert.equal(win.scrollY, 0);
});

test("put back by Safari where it stood, with no hand on it, the window is asked again", () => {
  const win = aWindow({ at: 22 });
  windowTo(0, win);
  win.ownScrollLands();
  assert.deepEqual(win.asked, [0], "the page's own scroll landing where it asked is no put-back");
  win.safariPutsAt(22);
  assert.deepEqual(win.asked, [0, 0]);
  assert.equal(win.scrollY, 0);
});

test("put back as far as a shorter page allows, the window is asked again too", () => {
  const win = aWindow({ at: 600 });
  windowTo(0, win);
  win.safariPutsAt(22);
  assert.deepEqual(win.asked, [0, 0]);
});

test("a scroll past the ask, or past where it stood, is the page's own: not asked again", () => {
  const win = aWindow({ at: 22 });
  windowTo(0, win);
  win.safariPutsAt(500);
  assert.deepEqual(win.asked, [0], "a row brought into view, past the ask");
  const other = aWindow({ at: 0 });
  windowTo(600, other);
  other.safariPutsAt(900);
  assert.deepEqual(other.asked, [600], "past where it stood the other way");
  other.safariPutsAt(0);
  assert.deepEqual(other.asked, [600, 600], "put back where it stood: asked again");
});

test("asked again at most twice, then left where Safari has it", () => {
  const win = aWindow({ at: 22 });
  windowTo(0, win);
  win.safariPutsAt(22);
  win.safariPutsAt(22);
  win.safariPutsAt(22);
  win.safariPutsAt(22);
  assert.deepEqual(win.asked, [0, 0, 0]);
  assert.equal(win.scrollY, 22);
  assert.deepEqual(win.listening(), [], "nothing is heard any more");
});

test("a touch, a wheel or a key since the ask ends it: the window is the person's", () => {
  for (const kind of ["touchstart", "touchmove", "pointerdown", "wheel", "keydown"]) {
    const win = aWindow({ at: 22 });
    windowTo(0, win);
    win.touched(kind);
    win.safariPutsAt(22);
    assert.deepEqual(win.asked, [0], kind);
    assert.deepEqual(win.listening(), [], kind);
  }
});

test("once the frames have passed, a scroll is the person's", () => {
  const win = aWindow({ at: 22 });
  windowTo(0, win);
  win.frames(SAFARI_PUTS_BACK_FRAMES - 1);
  assert.deepEqual(win.listening().sort(), ["keydown", "pointerdown", "scroll", "touchmove", "touchstart", "wheel"]);
  win.frames(1);
  win.safariPutsAt(22);
  assert.deepEqual(win.asked, [0]);
  assert.deepEqual(win.listening(), []);
});

test("a page's next ask replaces the last: what is asked again is the newer top", () => {
  const win = aWindow({ at: 22 });
  windowTo(0, win);
  windowTo(500, win);
  win.safariPutsAt(22);
  assert.deepEqual(win.asked, [0, 500, 500]);
});

test("a window asked by its own hand is heard the same way", () => {
  const win = aWindow({ at: 22 });
  win.scrollY = 0;
  windowAsked(0, 22, win);
  win.safariPutsAt(22);
  assert.deepEqual(win.asked, [0]);
  assert.equal(win.scrollY, 0);
});

test("a window with no scrollTo (a test's stand-in) is left alone, as the deck left it before", () => {
  const win = { scrollY: undefined };
  windowTo(0, win);
  assert.equal(win.scrollY, undefined);
});

test("a window that cannot be heard is scrolled once and left", () => {
  const win = {
    scrollY: 22,
    asked: [],
    scrollTo(x, y) {
      this.asked.push(y);
      this.scrollY = y;
    },
  };
  windowTo(0, win);
  assert.deepEqual(win.asked, [0]);
});
