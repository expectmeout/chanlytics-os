/**
 * Where Glass's page light drifts (apps/dashboard/src/styles/components.css, `.pg-light` and `pg-pool-*`): on a
 * desk, by layers moved by a transform; never on a phone, and never where less motion is asked.
 *
 * The drift moved the three pools' centres, six registered properties every element inherits, on the app's root. So
 * while it ran every element of the page was styled again on every frame, on every page, for as long as the page was
 * open. Measured on production at a phone's size, 5 Oct 2026, nothing touched: the main thread 37% to 79% busy (the
 * more on the page, the more), 6% with the drift stilled, and iPhones were reloading the page under their owners; so a
 * phone's pools stand still. On a desk, the same day, at 4x CPU: 3.6 to 4.1 s of long tasks in every 5 s and 15 frames
 * a second, idle; 44 a second unthrottled. Each pool is now a layer of its own, moved by a transform, which the
 * compositor runs: nothing of the page is styled again.
 *
 * Asked of the frame's sheets as a browser draws them (tests/_css.mjs cascadeOf): at a width, with a motion preference,
 * what each element plays.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { PHONE, animationNamesOf, cascadeOf, element, frameSheets } from "../../_css.mjs";

/** The widest window the shell draws as a phone (mobile.css and every `max-width: 900px` block of the frame's sheets). */
const PHONE_MAX = 900;

/** The frame's sheets in a window of `width` px, its owner having asked for less motion or not. */
const at = (width, reducedMotion = false) =>
  cascadeOf(frameSheets(), width <= PHONE_MAX ? { ...PHONE, width, reducedMotion } : { width, reducedMotion });

/** What an element plays there, by name: none where it plays nothing. */
const plays = (cascade, el) => animationNamesOf(cascade.style(el).animation).filter((n) => n !== "none");

/** The page light's three pools, as the frame draws them (surfaces/frame/shell-chrome.tsx: three spans in .pg-light). */
const pools = [1, 2, 3].map((n) => element(".app-root", ".pg-light", `span:nth-child(${n})`));

test("the app's root never animates, at any width: its light's centres styled every element again on every frame", () => {
  for (const width of [320, 393, PHONE_MAX, PHONE_MAX + 1, 1440, 2560]) {
    for (const reducedMotion of [false, true]) {
      assert.deepEqual(plays(at(width, reducedMotion), element(".app-root")), [], `the app's root moves at ${width}px`);
    }
  }
});

test("no keyframes move a custom property: one every element inherits styles the page again on every frame", () => {
  // The page light's sheet's (components.css), where the drift lives.
  const sheet = at(1440)
    .allKeyframes()
    .filter((k) => k.file === "apps/dashboard/src/styles/components.css");
  assert.ok(sheet.length > 3, "the sheet's keyframes are read");
  for (const { name, frames } of sheet)
    for (const [step, given] of Object.entries(frames))
      assert.deepEqual(
        Object.keys(given).filter((p) => p.startsWith("--")),
        [],
        `@keyframes ${name} moves a custom property at ${step}`,
      );
});

test("on a desk the pools drift, each on a layer of its own, moved by a transform alone", () => {
  for (const width of [1440, PHONE_MAX + 1]) {
    const desk = at(width);
    const names = pools.map((p) => plays(desk, p));
    assert.ok(
      names.every((n) => n.length === 1),
      `at ${width}px every pool drifts`,
    );
    assert.equal(new Set(names.flat()).size, 3, "three pools, each its own drift");
    for (const n of names.flat())
      for (const [step, given] of Object.entries(desk.keyframes(n) ?? {}))
        assert.deepEqual(Object.keys(given), ["transform"], `@keyframes ${n} moves only a transform (${step})`);
  }
});

test("on a phone the pools stand still: a phone reloads a page that never rests", () => {
  for (const width of [320, 393, 430, PHONE_MAX])
    for (const p of pools) assert.deepEqual(plays(at(width), p), [], `at ${width}px`);
});

test("where less motion is asked the pools stand still at any width", () => {
  for (const width of [1440, 393]) for (const p of pools) assert.deepEqual(plays(at(width, true), p), []);
});
