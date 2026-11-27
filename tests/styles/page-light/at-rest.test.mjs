/**
 * What a phone's page animates while nobody touches it (apps/dashboard/src/surfaces/ask/ask.css, the dot on the ✦'s rim).
 *
 * The dot breathed at opacity 0: `data-usage` says the day's usage, nothing sets it yet, and its animation stood on the dot
 * whatever it said. A running animation is a style pass on every frame, so a page nobody touched took 60 style passes a
 * second, the main thread 15.3% busy at 4x CPU and 4.2% without it (production, 6 Nov 2026). `ok` is a usage too, and draws
 * no dot: only `warned` and `over` breathe. Where less motion is asked they hold still, by selectors as specific, later in
 * the sheet: the plain `.ask-disc::before` that said so would lose to the rule that breathes.
 *
 * Asked of the frame's sheets on a phone as a browser draws them (tests/_css.mjs cascadeOf).
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { PHONE, animationNamesOf, cascadeOf, element, frameSheets } from "../../_css.mjs";

/** The dot on the ✦'s rim, as AskDisc draws it, under a usage or none. */
const dot = (usage) => element(".phone-ask", `.ask-disc${usage ? `[data-usage="${usage}"]` : ""}::before`);
const plays = (cascade, usage) => animationNamesOf(cascade.style(dot(usage)).animation).filter((n) => n !== "none");

test("a phone's Ask dot animates only while a usage shows", () => {
  const phone = cascadeOf(frameSheets(), PHONE);
  for (const usage of [null, "ok"]) assert.deepEqual(plays(phone, usage), [], `${usage ?? "no usage"}: it holds still`);
  for (const usage of ["warned", "over"])
    assert.deepEqual(plays(phone, usage), ["ask-dot-breathe"], `${usage}: the dot's own breath`);
});

test("and holds still where less motion is asked: the rule that says so wins over the rule that breathes", () => {
  const still = cascadeOf(frameSheets(), { ...PHONE, reducedMotion: true });
  for (const usage of [null, "ok", "warned", "over"])
    assert.deepEqual(plays(still, usage), [], `${usage ?? "no usage"}`);
});
