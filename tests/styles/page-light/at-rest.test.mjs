/**
 * What a phone's page animates while nobody touches it (apps/dashboard/src/surfaces/ask/ask.css, the dot on the ✦'s rim).
 *
 * The dot breathed at opacity 0: `data-usage` says the day's usage, nothing sets it yet, and its animation stood on the dot
 * whatever it said. A running animation is a style pass on every frame, so a page nobody touched took 60 style passes a
 * second, the main thread 15.3% busy at 4x CPU and 4.2% without it (production, 6 Nov 2026). `ok` is a usage too, and draws
 * no dot: only `warned` and `over` breathe. Where less motion is asked they hold still, by selectors as specific, later in
 * the sheet: the plain `.ask-disc::before` that said so would lose to the rule that breathes.
 *
 * Read from the stylesheet's syntax tree (lightningcss, the build's own parser), as the page light's drift is.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { transform } from "lightningcss";
import { ROOT } from "../../_source.mjs";

const SHEET = "apps/dashboard/src/surfaces/ask/ask.css";

let parsed = null;
const { warnings } = transform({
  filename: SHEET,
  code: fs.readFileSync(path.join(ROOT, SHEET)),
  errorRecovery: true,
  visitor: {
    StyleSheet(sheet) {
      parsed = sheet;
    },
  },
});

const namesClass = (selector, name) => selector.some((part) => part.type === "class" && part.name === name);
const usageOf = (selector) => selector.find((part) => part.type === "attribute" && part.name === "data-usage");
const animationName = (d) => d.value.map((a) => (a.name.type === "none" ? "none" : a.name.value)).join();

/** Every selector of a rule on the disc's dot that sets an animation, in the sheet's order, and whether less motion was asked. */
function dotAnimations(sheet) {
  const found = [];
  const walk = (rules, stillOnly) => {
    for (const r of rules) {
      if (r.type === "media") {
        const asksStill = JSON.stringify(r.value.query).includes("prefers-reduced-motion");
        walk(r.value.rules, stillOnly || asksStill);
      } else if (r.type === "style") {
        const animates = (r.value.declarations?.declarations ?? []).filter((d) => d.property === "animation");
        for (const selector of r.value.selectors) {
          if (!namesClass(selector, "ask-disc")) continue;
          for (const d of animates) {
            found.push({
              at: found.length,
              stillOnly,
              usage: usageOf(selector)?.operation?.value ?? null,
              name: animationName(d),
            });
          }
        }
      }
    }
  };
  walk(sheet.rules, false);
  return found;
}

test("the sheet is read whole", () => {
  assert.deepEqual(warnings, []);
  assert.ok(parsed, "a stylesheet");
});

test("a phone's Ask dot animates only while a usage shows", () => {
  const moving = dotAnimations(parsed).filter((f) => !f.stillOnly);
  assert.deepEqual(
    moving.map((f) => f.usage).sort(),
    ["over", "warned"],
    "under `warned` and `over`, and no other selector",
  );
  assert.ok(
    moving.every((f) => f.name === "ask-dot-breathe"),
    "the dot's own breath",
  );
});

test("and holds still where less motion is asked, on selectors that win over the rule that breathes", () => {
  const found = dotAnimations(parsed);
  const still = found.filter((f) => f.stillOnly);
  assert.deepEqual(still.map((f) => f.usage).sort(), ["over", "warned"], "as specific as the rule they stop");
  assert.ok(
    still.every((f) => f.name === "none"),
    "they stop it",
  );
  const lastBreath = Math.max(...found.filter((f) => !f.stillOnly).map((f) => f.at));
  assert.ok(
    still.every((f) => f.at > lastBreath),
    "and come after it, so they win",
  );
});
