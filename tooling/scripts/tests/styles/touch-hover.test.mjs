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

/*
 * Every sheet, every control (Ruben, 18 Oct 2026, after the toasts: a tapped button, a glass circle, a row stayed lit).
 * A rule that only paints on `:hover` (a fill, a border, a shadow, an ink, an underline) stands under a media query
 * that asks for a pointer, so a finger's last tap keeps nothing. Left as they are: a rule that also reveals or moves
 * something (opacity, display, a transform: a control a tap reaches today), a selector that names a press or focus
 * as well (`:is(:hover, :active)`), and a reset (transparent, none, inherit), which paints nothing.
 */
const PAINTS = new Set([
  "background",
  "background-color",
  "background-image",
  "border",
  "border-color",
  "border-top",
  "border-right",
  "border-bottom",
  "border-left",
  "border-top-color",
  "border-right-color",
  "border-bottom-color",
  "border-left-color",
  "box-shadow",
  "color",
  "text-decoration",
  "text-decoration-color",
  "text-decoration-line",
  "text-underline-offset",
  "outline",
  "outline-color",
  "outline-offset",
  "fill",
  "stroke",
  "filter",
  "backdrop-filter",
  "cursor",
  "transition",
  "transition-duration",
  "custom",
]);
const propertyOf = (d) => (d.property === "unparsed" ? d.value.propertyId.property : d.property);
/** A value that draws something: a token, or a colour that is not transparent. */
const draws = (d) => {
  const v = JSON.stringify(d.value);
  return (
    /"type":"var"/.test(v) || /"alpha":(0\.\d*[1-9]|1)\b/.test(v) || /"type":"(oklch|oklab|lab|lch|hsl|hwb)"/.test(v)
  );
};
const hoverOnly = (selector) => {
  const s = JSON.stringify(selector);
  return /"kind":"hover"/.test(s) && !/"kind":"(active|focus|focus-visible|focus-within)"/.test(s);
};
const asksForPointer = (query) => /"name":"(hover|pointer|any-hover|any-pointer)"/.test(JSON.stringify(query));

test("no sheet paints on :hover outside a pointer's media query, so a finger's last tap keeps nothing lit", () => {
  const sheets = [];
  const walkDir = (dir) => {
    for (const f of fs.readdirSync(path.join(ROOT, dir), { withFileTypes: true })) {
      const rel = `${dir}/${f.name}`;
      if (f.isDirectory()) walkDir(rel);
      else if (f.name.endsWith(".css")) sheets.push(rel);
    }
  };
  walkDir("apps/dashboard/src");
  walkDir("apps/dashboard/app");
  assert.ok(sheets.length > 20, "the sheets are read");
  const lit = [];
  for (const sheet of sheets) {
    const walk = (rules, guarded) => {
      for (const r of rules) {
        if (r.type === "media") walk(r.value.rules, guarded || asksForPointer(r.value.query));
        else if (r.type === "supports" || r.type === "container" || r.type === "layer-block")
          walk(r.value.rules, guarded);
        else if (r.type === "style" && !guarded && r.value.selectors.some(hoverOnly)) {
          const ds = [
            ...(r.value.declarations.declarations ?? []),
            ...(r.value.declarations.importantDeclarations ?? []),
          ];
          if (ds.length && ds.every((d) => PAINTS.has(propertyOf(d))) && ds.some(draws))
            lit.push(`${sheet}: ${ds.map(propertyOf).join(", ")}`);
        }
      }
    };
    walk(parse(sheet).rules, false);
  }
  assert.deepEqual(lit, [], "a :hover that paints stands under @media (hover: hover)");
});

for (const { sheet, cls } of CONTROLS) {
  test(`${cls}'s hover is drawn only under a pointer that hovers (${path.basename(sheet)})`, () => {
    const rules = hoverRulesOf(parse(sheet), cls);
    assert.ok(rules.length > 0, `the sheet still draws a hover on .${cls}: this test would otherwise prove nothing`);
    for (const r of rules)
      assert.ok(r.media.some(asksForHover), `a :hover on .${cls} stands outside @media (hover: hover)`);
  });
}

/*
 * What goes with a fill goes where the fill goes. On a phone a hairline parts two rows (mobile.css), and a row in a fill
 * of its own stands clear of the lines either side of it; the hover's fill stands under a pointer's media query (above),
 * so a line hidden on :hover outside one went with no fill beside it, on the row a finger last tapped (Ruben, 19 Oct
 * 2026: "it hides the divider lines").
 */
test("a line hidden beside a hovered row is hidden only where a pointer hovers, as the row's fill is", () => {
  const sheet = "apps/dashboard/src/legacy/styles/mobile.css";
  const hides = (r) => {
    const ds = r.value.declarations.declarations ?? [];
    return ds.length > 0 && ds.every((d) => propertyOf(d) === "opacity" && JSON.stringify(d.value) === "0");
  };
  const lines = (selector) => /"kind":"after"/.test(JSON.stringify(selector));
  const found = [];
  const walk = (rules, guarded) => {
    for (const r of rules) {
      if (r.type === "media") walk(r.value.rules, guarded || asksForPointer(r.value.query));
      else if (r.type === "style" && hides(r))
        for (const s of r.value.selectors.filter((x) => hoverOnly(x) && lines(x))) found.push({ guarded, s });
    }
  };
  walk(parse(sheet).rules, false);
  assert.ok(
    found.length >= 8,
    "the sheet still hides the lines beside a hovered row: this test would otherwise prove nothing",
  );
  assert.deepEqual(
    found.filter((f) => !f.guarded).length,
    0,
    "a hairline hidden on :hover stands under @media (hover: hover)",
  );
});
