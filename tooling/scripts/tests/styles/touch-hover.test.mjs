/**
 * A control's hover is a pointer's. A touch screen keeps `:hover` on the last thing tapped, so a round button whose
 * hover is the picked fill (Reports' period, reports.css `.rpt-when-open`; the Calendar's options, calendar.css
 * `.cal-options`) wore that fill after a second tap closed what it opens, until something else was tapped, and a
 * swipe across the page is no tap (Ruben, 7 Oct 2026: "the date picker highlight"). Each such rule stands under
 * `@media (hover: hover)`, where a pointer that hovers is the one reading it.
 *
 * Read from the sheet's syntax tree (lightningcss, the build's own parser), as page-light/drift.test.mjs reads.
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

/*
 * The exception, by name: a list's row a finger opens (the Inbox's, Conversations', Live's, People's, Leads' and the
 * Pipeline's, Messages', Sequences', Today's queue, Settings' sections, People's lists). On a phone the row last opened
 * stays lit until the next tap, the list's selection, which a button's stuck fill is not (Ruben, 19 Oct 2026: "i do not
 * see the hover over select color we had before"; #1718 had held them to a pointer with every button).
 */
const ROW_CLASSES = new Set([
  "ix-thread",
  "cv-row",
  "lm-row",
  "msg-row",
  "sq-row",
  "cl-attn-row",
  "set-nav-row",
  "cl-rail-row",
]);
/** The tables a hovered `tr` is a list row of: the kit's (`dtable`, decision 0083: People's, Leads' and the Pipeline's), and the
 * classes People hands it, under which its phone rows keep their own fill. */
const ROW_TABLES = new Set(["pl-table", "cl-table", "dtable"]);
const compoundsOf = (selector) => {
  let compound = [];
  const compounds = [compound];
  for (const c of selector) {
    if (c.type === "combinator") compounds.push((compound = []));
    else compound.push(c);
  }
  return compounds;
};
/** The list row a selector's hover is on: its row class, or the table a hovered `tr` is a row of; else null. */
const rowOf = (selector) => {
  const compounds = compoundsOf(selector);
  const at = compounds.findIndex((parts) => /"kind":"hover"/.test(JSON.stringify(parts)));
  if (at < 0) return null;
  const own = compounds[at].find((p) => p.type === "class" && ROW_CLASSES.has(p.name));
  if (own) return own.name;
  if (!compounds[at].some((p) => p.type === "type" && p.name === "tr")) return null;
  const table = compounds
    .slice(0, at)
    .flat()
    .find((p) => p.type === "class" && ROW_TABLES.has(p.name));
  return table ? table.name : null;
};
/** Every stylesheet of the dashboard's, by its path from the root. */
const allSheets = () => {
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
  return sheets;
};
/** Whether a rule only paints, and draws something (a fill, an ink): what a hover's lit state is. */
const paints = (r) => {
  const ds = [...(r.value.declarations.declarations ?? []), ...(r.value.declarations.importantDeclarations ?? [])];
  return ds.length > 0 && ds.every((d) => PAINTS.has(propertyOf(d))) && ds.some(draws);
};
/** Each style rule of a sheet, with whether it stands under a pointer's media query. */
const eachRule = (sheet, visit) => {
  const walk = (rules, guarded) => {
    for (const r of rules) {
      if (r.type === "media") walk(r.value.rules, guarded || asksForPointer(r.value.query));
      else if (r.type === "supports" || r.type === "container" || r.type === "layer-block")
        walk(r.value.rules, guarded);
      else if (r.type === "style") visit(r, guarded);
    }
  };
  walk(parse(sheet).rules, false);
};

test("no sheet paints on :hover outside a pointer's media query, so a finger's last tap keeps nothing lit", () => {
  const sheets = allSheets();
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
          const rowsAlone = r.value.selectors.filter(hoverOnly).every((x) => rowOf(x) !== null);
          if (ds.length && ds.every((d) => PAINTS.has(propertyOf(d))) && ds.some(draws) && !rowsAlone)
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
 * of its own stands clear of the lines either side of it. When #1718 held the rows' hover fill to a pointer and left the
 * lines hidden on any :hover, a finger's last row lost its lines with no fill beside it (Ruben, 19 Oct 2026: "it hides
 * the divider lines"); now both stand under a finger again. Each row's lines hide on :hover under the same kinds of
 * pointer its fill shows under, whichever that is.
 */
test("the lines beside a hovered row hide wherever the row's hover fill shows, and nowhere else", () => {
  const hides = (r) => {
    const ds = r.value.declarations.declarations ?? [];
    return ds.length > 0 && ds.every((d) => propertyOf(d) === "opacity" && JSON.stringify(d.value) === "0");
  };
  const fills = new Map();
  const lines = new Map();
  const add = (map, row, guarded) => map.set(row, new Set([...(map.get(row) ?? []), guarded]));
  for (const sheet of allSheets())
    eachRule(sheet, (r, guarded) => {
      for (const x of r.value.selectors.filter(hoverOnly)) {
        const row = rowOf(x);
        if (!row) continue;
        if (hides(r) && /"kind":"after"/.test(JSON.stringify(x))) add(lines, row, guarded);
        else if (paints(r)) add(fills, row, guarded);
      }
    });
  assert.ok(
    lines.size >= 4,
    "the lines beside a hovered row are still hidden: this test would otherwise prove nothing",
  );
  for (const [row, where] of lines)
    assert.deepEqual([...where].sort(), [...(fills.get(row) ?? [])].sort(), `.${row}: its lines and its fill disagree`);
});

test("a list's row keeps its hover fill under a finger: the row last opened is the list's selection", () => {
  const under = new Map();
  for (const sheet of allSheets())
    eachRule(sheet, (r, guarded) => {
      if (!paints(r)) return;
      for (const x of r.value.selectors.filter(hoverOnly)) {
        const row = rowOf(x);
        if (row && !guarded) under.set(row, true);
      }
    });
  for (const row of ["ix-thread", "cv-row", "lm-row", "pl-table", "dtable", "msg-row", "sq-row"])
    assert.ok(
      under.get(row),
      `.${row}'s hover fill stands under @media (hover: hover), so a phone's tapped row is not lit`,
    );
});

/*
 * A list under a person carried back to it is a still picture of it (kit/motion/held-list.ts, People's kept scopes), which
 * has no :hover and keeps no id (leaving.ts stillCopyOf). People's rows were styled by their id, so the picture's stood
 * edge to edge with a line across each and jumped in as the person went, and the row the finger opened lit only then
 * (Ruben, 20 Oct 2026, from his iPhone). A table's row is one by its data-index, and the opened row is marked data-hover:
 * every fill or line a finger's :hover moves on a table's row moves for the mark too.
 */
test("a table's rows look the same in a still picture of the list: never styled by id, and the opened row lit as hovered", () => {
  const byId = [];
  const unmarked = [];
  const hides = (r) => (r.value.declarations.declarations ?? []).every((d) => propertyOf(d) === "opacity");
  const marked = (compound) => /"name":"data-hover"/.test(JSON.stringify(compound));
  let lit = 0;
  for (const sheet of allSheets())
    eachRule(sheet, (r, guarded) => {
      for (const x of r.value.selectors) {
        const compounds = compoundsOf(x);
        const tableOf = (i) =>
          compounds
            .slice(0, i)
            .flat()
            .find((c) => c.type === "class" && ROW_TABLES.has(c.name));
        const rowAt = compounds.findIndex(
          (parts, i) => parts.some((c) => c.type === "type" && c.name === "tr") && !!tableOf(i),
        );
        if (rowAt < 0) continue;
        const rows = compounds.slice(rowAt).filter((parts) => parts.some((c) => c.type === "type" && c.name === "tr"));
        if (rows.some((parts) => /"name":"id"/.test(JSON.stringify(parts))))
          byId.push(`${sheet}: ${JSON.stringify(x)}`);
        // A phone's table (People's, Leads', the Pipeline's) is the one pictured; a desk's hover reveals are its own.
        if (tableOf(rowAt).name !== "pl-table" || guarded || !hoverOnly(x) || !(paints(r) || hides(r))) continue;
        lit += 1;
        const hovered = compounds.filter((parts) => /"kind":"hover"/.test(JSON.stringify(parts)));
        if (!hovered.every(marked)) unmarked.push(`${sheet}: ${JSON.stringify(x).slice(0, 160)}`);
      }
    });
  assert.ok(lit >= 3, "a table's row is still lit under a finger: this test would otherwise prove nothing");
  assert.deepEqual(byId, [], "a table's row is chosen by what a still picture keeps, never its id");
  assert.deepEqual(unmarked, [], "what lights a table's row under a finger lights the row a page was opened from");
});

/*
 * A press keeps a variant's own colour. The plain button's press is the grey (`.btn:active`); under a finger, where no
 * hover is drawn, a variant with no press of its own fell to it, and a pressed Save stood grey under its near-black words
 * (Ruben, 19 Oct 2026: "this ugly color"). Each filled or tinted variant presses in the colour its hover lights, outside
 * any pointer's media query.
 */
test("each button variant presses in its own colour under a finger, never the plain button's grey", () => {
  const sheet = "apps/dashboard/src/surfaces/kit/kit.css";
  const pressed = new Set();
  eachRule(sheet, (r, guarded) => {
    if (guarded) return;
    const ds = r.value.declarations.declarations ?? [];
    if (!ds.some((d) => /^background/.test(propertyOf(d)))) return;
    for (const x of r.value.selectors) {
      const parts = compoundsOf(x).at(-1);
      const kinds = JSON.stringify(parts);
      if (!/"kind":"active"/.test(kinds) || /"kind":"hover"/.test(kinds)) continue;
      const names = parts.filter((p) => p.type === "class").map((p) => p.name);
      if (names.includes("btn") && names.includes("danger")) pressed.add("btn.danger");
      for (const n of names) if (/^btn-(primary|ghost|danger|glass)$/.test(n)) pressed.add(n);
    }
  });
  for (const v of ["btn-primary", "btn-ghost", "btn-danger", "btn-glass", "btn.danger"])
    assert.ok(pressed.has(v), `.${v} has no press of its own: a finger's press shows the plain button's grey`);
});
