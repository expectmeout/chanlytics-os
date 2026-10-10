/**
 * A control's hover is a pointer's. A touch screen keeps `:hover` on the last thing tapped, so a round button whose
 * hover is the picked fill (Reports' period, reports.css `.rpt-when-open`; the Calendar's options, calendar.css
 * `.cal-options`) wore that fill after a second tap closed what it opens, until something else was tapped, and a
 * swipe across the page is no tap (Ruben, 7 Oct 2026: "the date picker highlight"). Each such rule stands under
 * `@media (hover: hover)`, where a pointer that hovers is the one reading it.
 *
 * Read from the sheet's syntax tree (lightningcss, the build's own parser), as page-light-drift.test.mjs reads.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { transform } from "lightningcss";
import { ROOT } from "../_source.mjs";

/** The touch controls whose hover is the picked fill, by sheet. */
const CONTROLS = [
  { sheet: "apps/dashboard/src/legacy/styles/reports.css", cls: "rpt-when-open" },
  { sheet: "apps/dashboard/src/legacy/styles/calendar.css", cls: "cal-options" },
];

function parse(sheet) {
  let parsed = null;
  const { warnings } = transform({
    filename: sheet,
    code: fs.readFileSync(path.join(ROOT, sheet)),
    errorRecovery: true,
    visitor: {
      StyleSheet(s) {
        parsed = s;
      },
    },
  });
  assert.deepEqual(warnings, [], `${sheet} is read whole`);
  assert.ok(parsed, "a stylesheet");
  return parsed;
}

/** Whether one selector names `cls` with `:hover` on that same compound. */
const hoversClass = (selector, cls) => {
  let compound = [];
  const compounds = [compound];
  for (const c of selector) {
    if (c.type === "combinator") compounds.push((compound = []));
    else compound.push(c);
  }
  return compounds.some(
    (parts) =>
      parts.some((p) => p.type === "class" && p.name === cls) &&
      parts.some((p) => p.type === "pseudo-class" && p.kind === "hover"),
  );
};

/** Whether a media query list asks for a pointer that hovers, plainly. */
const asksForHover = (query) =>
  query.mediaQueries.some((q) => {
    const c = q.condition;
    return (
      c &&
      c.type === "feature" &&
      c.value.type === "plain" &&
      c.value.name === "hover" &&
      c.value.value.value === "hover"
    );
  });

/** Every style rule hovering `cls`, with the media queries it stands inside. */
function hoverRulesOf(sheet, cls) {
  const found = [];
  const walk = (rules, media) => {
    for (const r of rules) {
      if (r.type === "media") walk(r.value.rules, [...media, r.value.query]);
      else if (r.type === "style" && r.value.selectors.some((s) => hoversClass(s, cls))) found.push({ media });
    }
  };
  walk(sheet.rules, []);
  return found;
}

// The other way round: what a variant promises is no hover style. The kit's inherit link takes its line's ink (a list
// row's name), and its `:hover` only undoes the quiet link's hover, which a touch keeps too; under a pointer alone, a
// tapped name wore the quiet link's hover ink on a phone.
test("the inherit link keeps its line's ink under a touch's hover too: its reset stands outside @media (hover: hover)", () => {
  const sheet = "apps/dashboard/src/surfaces/kit/kit.css";
  const rules = hoverRulesOf(parse(sheet), "link-btn-inherit");
  assert.ok(rules.length > 0, "the kit still resets the inherit link's hover: this test would otherwise prove nothing");
  for (const r of rules)
    assert.ok(!r.media.some(asksForHover), "the reset of .link-btn-inherit:hover stands inside @media (hover: hover)");
});

for (const { sheet, cls } of CONTROLS) {
  test(`${cls}'s hover is drawn only under a pointer that hovers (${path.basename(sheet)})`, () => {
    const rules = hoverRulesOf(parse(sheet), cls);
    assert.ok(rules.length > 0, `the sheet still draws a hover on .${cls}: this test would otherwise prove nothing`);
    for (const r of rules)
      assert.ok(r.media.some(asksForHover), `a :hover on .${cls} stands outside @media (hover: hover)`);
  });
}
