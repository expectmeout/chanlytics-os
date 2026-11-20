/**
 * An arc (apps/dashboard/src/surfaces/kit/motion/arc.ts; Today, calm, 19 Nov 2026, D9): a thing carried from one box to another
 * along a curve, across on one element and up on the one inside it, each with its own easing, the boxes matched centre to
 * centre. Nothing plays under reduced motion.
 */
import { test } from "node:test";
import assert from "node:assert/strict";

const { moveAlongArc } = await import("../../../apps/dashboard/src/surfaces/kit/motion/arc.ts");

/** An element that keeps what it was asked to play. */
const part = () => {
  const played = [];
  return {
    played,
    animate: (keyframes, options) => {
      played.push({ keyframes, options });
      return { finished: Promise.resolve() };
    },
  };
};
const motion = (reduced) => {
  globalThis.matchMedia = (q) => ({ matches: reduced && q.includes("reduce") });
};
const FROM = { left: 320, top: 780, width: 40, height: 40 };
const TO = { left: 20, top: 430, width: 80, height: 80 };

test("rising, it goes up at once and across late: two movements, one for each way, on two elements", async () => {
  motion(false);
  const outer = part();
  const inner = part();
  await moveAlongArc({ outer, inner }, { from: FROM, to: TO }, { ms: 440, way: "rise" });
  assert.equal(outer.played.length, 1);
  assert.equal(inner.played.length, 1);
  // Centre to centre: 340 against 60 across, 800 against 470 down.
  assert.deepEqual(outer.played[0].keyframes, [{ transform: "translateX(280px)" }, { transform: "none" }]);
  assert.deepEqual(inner.played[0].keyframes, [{ transform: "translateY(330px) scale(0.5)" }, { transform: "none" }]);
  assert.equal(outer.played[0].options.duration, 440);
  assert.notEqual(
    outer.played[0].options.easing,
    inner.played[0].options.easing,
    "each way has its own curve: that is the arc",
  );
});

test("falling is the same path back: the curves change hands", async () => {
  motion(false);
  const up = [part(), part()];
  const down = [part(), part()];
  await moveAlongArc({ outer: up[0], inner: up[1] }, { from: FROM, to: TO }, { ms: 440, way: "rise" });
  await moveAlongArc({ outer: down[0], inner: down[1] }, { from: TO, to: FROM }, { ms: 360, way: "fall", scale: 2 });
  assert.equal(down[0].played[0].options.easing, up[1].played[0].options.easing);
  assert.equal(down[1].played[0].options.easing, up[0].played[0].options.easing);
  assert.match(
    down[1].played[0].keyframes[0].transform,
    /scale\(2\)$/,
    "the size it leaves at can be said by whoever knows it",
  );
});

test("under reduced motion nothing plays, and it has landed at once", async () => {
  motion(true);
  const outer = part();
  const inner = part();
  await moveAlongArc({ outer, inner }, { from: FROM, to: TO }, { ms: 440, way: "rise" });
  assert.deepEqual([outer.played.length, inner.played.length], [0, 0]);
  motion(false);
});
