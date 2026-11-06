/**
 * Brought in's count glides as a read finds more (kit/motion/use-count-glide.ts; Ruben, 27 Oct 2026: "214 emails so far"
 * leapt by a hundred on each read). Drawn on the stub React over a clock the test holds: the first value as it is, a rise
 * counting up on the house's ease-out, a fall at once, a rise during a glide carrying on from where the count stands,
 * and nothing gliding under reduced motion or where there is no frame to ask for.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { importSrc } from "../_source.mjs";
import { again, fresh, installLegacyReact, textOf } from "../_legacy-react.mjs";

installLegacyReact();
const { useCountGlide } = await importSrc("apps/dashboard/src/surfaces/kit/motion/use-count-glide.ts");
const React = globalThis.React;

let clock = 0;
Object.defineProperty(globalThis.performance, "now", { value: () => clock, configurable: true, writable: true });
let reduced = false;
globalThis.matchMedia = (q) => ({ matches: q.includes("reduce") ? reduced : false });

const Count = ({ value }) => React.createElement("b", null, String(useCountGlide(value)));
/** The count drawn for `value`, over the cells the last draw left, at the clock's time. */
const draw = (value) => textOf(again(() => React.createElement(Count, { value })));

test("a rise counts up from what is shown, on the ease-out, and lands on the value; a fall is drawn at once", () => {
  globalThis.requestAnimationFrame = () => 1;
  globalThis.cancelAnimationFrame = () => {};
  reduced = false;
  fresh();
  clock = 0;
  assert.equal(draw(214), "214", "the first value is drawn as it is");
  clock = 1000;
  assert.equal(draw(298), "214", "a new value starts where the count stands, never drawn at its end first");
  clock = 1300;
  assert.equal(draw(298), String(Math.round(214 + 84 * (1 - 0.5 ** 3))), "half the time: most of the way, easing in");
  clock = 1600;
  assert.equal(draw(298), "298", "at the end of its time: the value");
  assert.equal(draw(100), "100", "a count that falls is drawn at once");
  clock = 2000;
  assert.equal(draw(298), "100");
  clock = 2300;
  const mid = Math.round(100 + 198 * (1 - 0.5 ** 3));
  assert.equal(draw(298), String(mid));
  assert.equal(draw(400), String(mid), "a rise during a glide carries on from where the count stands");
  clock = 2900;
  assert.equal(draw(400), "400");
});

test("nothing glides under reduced motion, or where there is no frame to ask for", () => {
  globalThis.requestAnimationFrame = () => 1;
  reduced = true;
  fresh();
  clock = 0;
  assert.equal(draw(10), "10");
  assert.equal(draw(500), "500", "reduced motion: the new value at once");
  reduced = false;
  delete globalThis.requestAnimationFrame;
  fresh();
  assert.equal(draw(10), "10");
  assert.equal(draw(500), "500", "no frames (a server's draw, a test's stub): the new value at once");
});
