/**
 * One colour at the window's edges on a phone (apps/dashboard/src/legacy/styles/tokens.css, `--surface-page-list`;
 * mobile.css, the frame's top; components.css, the band a carried page takes over it): the paper, `--surface-page-fill`,
 * is the document's canvas, what the page's light is at the window's top and at its foot, and the plain colour of every
 * box fixed at an edge.
 *
 * Safari 26 paints its bar over the clock from the boxes fixed at the top edge: the background colour of each full-width
 * box in the stack there, the canvas where two disagree or one blurs, else a picture of the page; and it draws its
 * toolbar over the canvas alone, since nothing fixed is drawn under it (WebKit, LocalFrameView::fixedContainerEdges;
 * Page::updateFixedContainerEdges keeps the last colour read, and reads the top again only until the page is touched).
 * On 22 Oct 2026 the Inbox's and People's rows were given a whiter ground, and three fixes followed each other, each
 * moving one colour and leaving another behind: the canvas lightened for the toolbar, which lightened the bar over the
 * clock; the frame's top made the paper whole, on two pages; then every page given the ground with a lighter fill, which
 * left the frame's top and its own ground disagreeing and the carried page's band a third colour, so the bar flashed
 * white as pages arrived. One colour by every path is the fix, and this holds it.
 *
 * Read from the stylesheets' syntax trees (lightningcss, the build's own parser), never their text.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { transform } from "lightningcss";
import { ROOT } from "../_source.mjs";

const STYLES = "apps/dashboard/src";
const TOKENS = "apps/dashboard/src/legacy/styles/tokens.css";
const MOBILE = "apps/dashboard/src/legacy/styles/mobile.css";
const COMPONENTS = "apps/dashboard/src/legacy/styles/components.css";
/** The paper: the one colour. */
const PAPER = "--surface-page-fill";

function parse(file) {
  let parsed = null;
  const { warnings } = transform({
    filename: file,
    code: fs.readFileSync(path.join(ROOT, file)),
    errorRecovery: true,
    visitor: {
      StyleSheet(sheet) {
        parsed = sheet;
      },
    },
  });
  return { sheet: parsed, warnings };
}

/** Every style rule of a sheet, nested media and all. */
function styleRules(sheet) {
  const found = [];
  const walk = (rules) => {
    for (const r of rules) {
      if (r.type === "media" || r.type === "supports") walk(r.value.rules);
      else if (r.type === "style") found.push(r.value);
    }
  };
  walk(sheet.rules);
  return found;
}

/** A selector's compounds, split on its combinators. */
function compounds(selector) {
  const out = [[]];
  for (const c of selector) {
    if (c.type === "combinator") out.push([]);
    else out.at(-1).push(c);
  }
  return out;
}

/** Whether a selector's subject is the class alone (a pseudo-element after it allowed): `.frame-top`, `.frame-top::before`. */
const subjectIsClass = (selector, name) => {
  const subject = compounds(selector).at(-1);
  return (
    subject.some((c) => c.type === "class" && c.name === name) &&
    subject.every((c) => (c.type === "class" && c.name === name) || c.type === "pseudo-element")
  );
};

/** Whether a selector's subject is the document itself (`html`, `html:has(...)`). */
const subjectIsHtml = (selector) => {
  const parts = compounds(selector);
  return parts.length === 1 && parts[0][0]?.type === "type" && parts[0][0].name === "html";
};

/** What a background declaration paints as its colour: the token it reads, `transparent`, or something else. */
function backgroundColourOf(d) {
  if (d.property === "unparsed") {
    const id = d.value.propertyId.property;
    if (id !== "background-color" && id !== "background") return null;
    const tokens = d.value.value.filter((t) => !(t.type === "token" && t.value.type === "white-space"));
    if (tokens.length === 1 && tokens[0].type === "var") return `var(${tokens[0].value.name.ident})`;
    return "other";
  }
  if (d.property === "background-color") return d.value.type === "rgb" && d.value.alpha === 0 ? "transparent" : "other";
  if (d.property === "background")
    return d.value.every((b) => b.color.type === "rgb" && b.color.alpha === 0 && b.image.type === "none")
      ? "transparent"
      : "other";
  return null;
}

/** The custom properties a sheet declares, by name: each declaration's tokens with the selector it stands under. */
function customPropertiesOf(sheet) {
  const found = new Map();
  for (const rule of styleRules(sheet)) {
    for (const d of rule.declarations?.declarations ?? []) {
      if (d.property !== "custom") continue;
      const name = d.value.name;
      if (!found.has(name)) found.set(name, []);
      found.get(name).push({ selectors: rule.selectors, tokens: d.value.value });
    }
  }
  return found;
}

const notSpace = (t) => !(t.type === "token" && t.value.type === "white-space");

/** The stops of the first linear-gradient among a value's tokens: each stop's colour token and its position token. */
function gradientStops(tokens) {
  const fn = tokens.find((t) => t.type === "function" && t.value.name === "linear-gradient");
  assert.ok(fn, "a linear-gradient");
  const stops = [[]];
  for (const t of fn.value.arguments) {
    if (t.type === "token" && t.value.type === "comma") stops.push([]);
    else if (notSpace(t)) stops.at(-1).push(t);
  }
  return stops.map((s) => ({ colour: s[0], position: s.length > 1 ? s.at(-1) : null }));
}

const isTransparent = (t) => t?.type === "token" && t.value.type === "ident" && t.value.value === "transparent";
const isVar = (t, name) => t?.type === "var" && t.value.name.ident === name;
const isWhole = (t) => t?.type === "token" && t.value.type === "percentage" && t.value.value === 1;

const tokens = parse(TOKENS);
const mobile = parse(MOBILE);
const components = parse(COMPONENTS);

test("the three sheets are read whole", () => {
  for (const [name, s] of [
    ["tokens", tokens],
    ["mobile", mobile],
    ["components", components],
  ]) {
    assert.deepEqual(s.warnings, [], `${name}.css`);
    assert.ok(s.sheet, `${name}.css parsed`);
  }
});

test("the page's light is the paper at both edges of the window", () => {
  const props = customPropertiesOf(tokens.sheet);
  // The wash over the pools: nothing over the paper at the top, nothing over it at the foot.
  const washes = props.get("--surface-page-list") ?? [];
  assert.ok(washes.length > 0, "the list's wash is declared");
  for (const { tokens: value } of washes) {
    const stops = gradientStops(value);
    assert.ok(isTransparent(stops[0].colour), "the wash begins transparent, so the paper shows over the frame's top");
    assert.ok(isTransparent(stops.at(-1).colour), "the wash ends transparent, so the paper shows at the window's foot");
    assert.ok(isWhole(stops.at(-1).position), "and ends at the foot itself, 100%");
  }
  // The ground under the pools: the paper at the top, the paper at the foot.
  const grounds = props.get("--surface-page-list-ground") ?? [];
  assert.ok(grounds.length > 0, "the ground under the pools is declared");
  for (const { tokens: value } of grounds) {
    const stops = gradientStops(value);
    assert.ok(isVar(stops[0].colour, PAPER), "the ground under the pools begins as the paper");
    assert.ok(isVar(stops.at(-1).colour, PAPER), "and ends as the paper");
    assert.ok(isWhole(stops.at(-1).position), "at the foot itself, 100%");
  }
  // The paper under the phone's own bar is the paper by name.
  const papers = props.get("--surface-page-paper") ?? [];
  assert.ok(papers.length > 0, "the page's top is declared");
  for (const { tokens: value } of papers)
    assert.ok(isVar(gradientStops(value)[0].colour, PAPER), "the page's top begins as the paper");
});

test("the canvas is the paper: the tokens alone declare it, and nothing paints the document another colour", () => {
  const sheets = fs
    .readdirSync(path.join(ROOT, STYLES), { recursive: true })
    .map(String)
    .filter((f) => f.endsWith(".css"))
    .map((f) => path.posix.join(STYLES, f.split(path.sep).join("/")));
  assert.ok(sheets.includes(TOKENS) && sheets.includes(MOBILE), "the sheets are found");
  for (const file of sheets) {
    const { sheet } =
      file === TOKENS ? tokens : file === MOBILE ? mobile : file === COMPONENTS ? components : parse(file);
    if (!sheet) continue;
    const declared = customPropertiesOf(sheet).get(PAPER) ?? [];
    if (file === TOKENS) assert.ok(declared.length > 0, "tokens.css declares the paper");
    else assert.equal(declared.length, 0, `${file} declares ${PAPER}: the paper is the tokens' to say`);
    for (const rule of styleRules(sheet)) {
      if (!rule.selectors.some(subjectIsHtml)) continue;
      for (const d of rule.declarations?.declarations ?? []) {
        const colour = backgroundColourOf(d);
        if (colour === null) continue;
        assert.equal(colour, `var(${PAPER})`, `${file} paints the document ${colour}: the canvas is the paper`);
      }
    }
  }
});

test("every box fixed at the top edge carries the paper whole", () => {
  const carries = (sheet, cls, file) => {
    let found = 0;
    for (const rule of styleRules(sheet)) {
      if (!rule.selectors.some((s) => subjectIsClass(s, cls))) continue;
      for (const d of rule.declarations?.declarations ?? []) {
        const colour = backgroundColourOf(d);
        if (colour === null) continue;
        found += 1;
        assert.equal(colour, `var(${PAPER})`, `${file} paints .${cls} ${colour}`);
      }
    }
    return found;
  };
  // The frame's top, and its own ground under it (::before, ::after): Safari reads each box in the stack, and two that
  // disagree lose the colour altogether.
  assert.ok(carries(mobile.sheet, "frame-top", MOBILE) >= 2, "the frame's top and its ground both carry the paper");
  // The band a carried page takes over the frame's top, drawn on the body (kit/motion/held-list.ts bandOver).
  assert.ok(carries(components.sheet, "held-band", COMPONENTS) >= 1, "the carried page's band carries the paper");
});
