/**
 * The bell leaves the way it came, at every width. A popover React lets go of is put back as a still copy and played
 * out (data-bits leaveOverlay, `[data-leaving]`); the bell's popover had a leaving rule only under a phone's width, so
 * on any wider screen the copy kept the popover's own entrance, `route-in`, and came in again from nothing as the
 * popover went: the bell closed, came back for 180ms, and went (Ruben, 9 Oct 2026, seen frame by frame). Its leaving
 * is one rule outside every media query, which plays what the popover says it leaves by (`--tbn-out`): route-out, the
 * entrance's mirror, and on a phone sheet-out.
 *
 * Read from the sheet's syntax tree (lightningcss, the build's own parser), as touch-hover.test.mjs reads.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { transform } from "lightningcss";
import { ROOT } from "../_source.mjs";

const SHEET = "apps/dashboard/src/legacy/styles/components.css";

/** Every style rule, with whether it stands under a media query. */
function rules(sheet) {
  let parsed = null;
  transform({
    filename: SHEET,
    code: fs.readFileSync(path.join(ROOT, sheet)),
    errorRecovery: true,
    visitor: {
      StyleSheet(s) {
        parsed = s;
      },
    },
  });
  assert.ok(parsed, "a stylesheet");
  const out = [];
  const walk = (list, inMedia) => {
    for (const r of list) {
      if (r.type === "media") walk(r.value.rules, true);
      else if (r.type === "style") out.push({ rule: r.value, inMedia });
    }
  };
  walk(parsed.rules, false);
  return out;
}

/** Whether a selector is `.cls[data-leaving]`: the class and the attribute on one compound. */
const leavingOf = (selector, cls) =>
  selector.some((c) => c.type === "class" && c.name === cls) &&
  selector.some((c) => c.type === "attribute" && c.name === "data-leaving");

/** The value a rule gives a custom property, as the words in it, or null where it gives none. */
function customOf(rule, name) {
  for (const d of rule.declarations?.declarations ?? []) {
    if (d.property === "custom" && d.value.name === name)
      return d.value.value
        .filter((t) => t.type === "token" && t.value.type === "ident")
        .map((t) => t.value.value)
        .join(" ");
  }
  return null;
}

/** What a rule's `animation` shorthand reads: its tokens, `var(--name)` shown as the name. */
function animationReads(rule) {
  for (const d of rule.declarations?.declarations ?? []) {
    if (d.property === "unparsed" && d.value.propertyId.property === "animation")
      return d.value.value.map((t) => (t.type === "var" ? t.value.name.ident : (t.value?.value ?? ""))).filter(Boolean);
  }
  return [];
}

const namesTbnPop = (rule) => rule.selectors.some((s) => s.some((c) => c.type === "class" && c.name === "tbn-pop"));

test("the bell's popover leaves by one rule at every width: the entrance's mirror, a phone's sheet where it is a sheet", () => {
  const all = rules(SHEET);
  const base = all.find(({ rule, inMedia }) => !inMedia && namesTbnPop(rule) && animationReads(rule)[0] === "route-in");
  assert.ok(base, "the popover comes in by route-in");
  assert.equal(
    customOf(base.rule, "--tbn-out"),
    "route-out",
    "and by default it goes by route-out, the same fade the other way",
  );
  const leaving = all.filter(({ rule }) => rule.selectors.some((s) => leavingOf(s, "tbn-pop")));
  assert.equal(leaving.length, 1, "one leaving rule, so a width cannot be left with the entrance as its leaving");
  assert.equal(leaving[0].inMedia, false, "and it stands outside every media query");
  assert.ok(animationReads(leaving[0].rule).includes("--tbn-out"), "playing what the popover says it leaves by");
  const sheet = all.find(
    ({ rule, inMedia }) => inMedia && namesTbnPop(rule) && customOf(rule, "--tbn-out") === "sheet-out",
  );
  assert.ok(sheet, "a phone's sheet still goes down as it came up");
  const keyframes = new Set();
  transform({
    filename: SHEET,
    code: fs.readFileSync(path.join(ROOT, SHEET)),
    errorRecovery: true,
    visitor: {
      Rule: {
        keyframes(k) {
          keyframes.add(k.value.name.value);
        },
      },
    },
  });
  for (const k of ["route-in", "route-out"]) assert.ok(keyframes.has(k), `${k} is defined`);
});

test("the bell held open wears the pressed look, which the wash over the page would otherwise keep from it", () => {
  const held = rules(SHEET).find(({ rule }) =>
    rule.selectors.some((s) => {
      const text = JSON.stringify(s);
      return text.includes('"tb-bell"') && text.includes('"aria-expanded"');
    }),
  );
  assert.ok(held, "a rule names .tb-bell[aria-expanded]");
});
