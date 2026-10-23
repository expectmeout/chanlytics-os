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
import { ROOT } from "../../_source.mjs";

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
/** The window's foot as a gradient stop: `100dvh`, the screen as the browser shows it, with its bar up or tucked away. */
const isFoot = (t) => t?.type === "length" && t.value.unit === "dvh" && t.value.value === 100;

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
    assert.ok(
      isFoot(stops.at(-1).position),
      "and ends at the window's foot itself, 100dvh, wherever the browser's bar is",
    );
  }
  // The ground under the pools: the paper at the top, the paper at the foot.
  const grounds = props.get("--surface-page-list-ground") ?? [];
  assert.ok(grounds.length > 0, "the ground under the pools is declared");
  for (const { tokens: value } of grounds) {
    const stops = gradientStops(value);
    assert.ok(isVar(stops[0].colour, PAPER), "the ground under the pools begins as the paper");
    assert.ok(isVar(stops.at(-1).colour, PAPER), "and ends as the paper");
    assert.ok(isFoot(stops.at(-1).position), "at the window's foot itself, 100dvh");
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
  // The sheet of ground a carried page slides over, fixed to the window (kit/motion/held-list.ts groundOver).
  assert.ok(carries(mobile.sheet, "carry-ground", MOBILE) >= 1, "the carry sheet carries the paper");
  assert.equal(carries(components.sheet, "carry-ground", COMPONENTS), 0, "and paints nothing of its own");
});

/** Every custom property a value reads, by name, however deep it is (in a calc, in a fallback). */
function varsIn(value) {
  const names = [];
  const walk = (list) => {
    for (const t of list ?? []) {
      if (t.type === "var") {
        names.push(t.value.name.ident);
        walk(t.value.fallback);
      } else if (t.type === "function") walk(t.value.arguments);
    }
  };
  walk(value);
  return names;
}

/** Every stylesheet of the app, parsed (the three read above as they were). */
function allSheets() {
  return fs
    .readdirSync(path.join(ROOT, STYLES), { recursive: true })
    .map(String)
    .filter((f) => f.endsWith(".css"))
    .map((f) => path.posix.join(STYLES, f.split(path.sep).join("/")))
    .map((file) => ({
      file,
      sheet: (file === TOKENS ? tokens : file === MOBILE ? mobile : file === COMPONENTS ? components : parse(file))
        .sheet,
    }));
}

// One ground for every page (Ruben, 22 Oct 2026: "when i open a thread and swipe back i see the background shift in
// color"): the light gave way under each page's own head as measured (--frame-top), which a thread has none of, so the
// wash ran from the screen's top there and put out the light over its head, and Back lit it again as it landed.
test("the light gives way at one line on the screen, whatever page stands on it", () => {
  const props = customPropertiesOf(tokens.sheet);
  const at = props.get("--list-wash-at") ?? [];
  assert.ok(at.length > 0, "where the wash begins is declared");
  for (const { tokens: value } of at) {
    const read = varsIn(value);
    assert.ok(read.includes("--list-wash-line"), "the wash begins at the one line");
    assert.ok(!read.includes("--frame-top"), "never at the head the page on the screen measures");
  }
  const lines = props.get("--list-wash-line") ?? [];
  assert.ok(lines.length > 0, "the line is declared");
  for (const { tokens: value } of lines)
    assert.deepEqual(
      value.map((t) => t.type),
      ["length"],
      "the line is a length, no measure of a page",
    );
  for (const { file, sheet } of allSheets()) {
    if (file === TOKENS || !sheet) continue;
    const own = customPropertiesOf(sheet);
    for (const name of ["--list-wash-at", "--list-wash-line"])
      assert.equal(
        (own.get(name) ?? []).length,
        0,
        `${file} declares ${name}: a page with its own line draws its own ground`,
      );
  }
});

/** A selector written as its parts read: `html:has(.app-root)`, `.frame-top::before`, `.main-scroll.pane > .calendar > .cal-head::after`. */
function selectorText(selector) {
  return selector
    .map((c) => {
      if (c.type === "combinator") return c.value === "descendant" ? " " : ` ${c.value === "child" ? ">" : c.value} `;
      if (c.type === "type") return c.name;
      if (c.type === "class") return `.${c.name}`;
      if (c.type === "pseudo-element") return `::${c.kind}`;
      if (c.type === "pseudo-class") return `:${c.kind}(…)`;
      return `[${c.type}]`;
    })
    .join("");
}

// ONE PICTURE, EVERY PAINTER (Ruben, 22 Oct 2026: a thread pushed in opened without the aurora, which came in as it landed;
// the painters of the ground were six, each aligned to the window by its own means, one by a measure of the page taken a
// microtask too soon). The picture is declared once (tokens.css --surface-page-ground), painted by one rule whose
// subjects are every painter, a screen wide and the largest screen tall (100lvh) from the window's top, and no painter
// offsets it by a measure of a page.
test("the picture is painted by one rule, whose subjects are every painter, a screen wide and the largest screen tall", () => {
  const isScreen = (d) =>
    d.property === "background-size" &&
    d.value.length === 1 &&
    d.value[0].type === "explicit" &&
    d.value[0].width.value?.value?.unit === "vw" &&
    d.value[0].width.value.value.value === 100 &&
    d.value[0].height.value?.value?.unit === "lvh" &&
    d.value[0].height.value.value.value === 100;
  const pictures = customPropertiesOf(tokens.sheet).get("--surface-page-ground") ?? [];
  assert.equal(pictures.length, 1, "tokens.css declares the picture once");
  assert.deepEqual(
    varsIn(pictures[0].tokens),
    ["--surface-page-top", "--surface-page-light", "--surface-page-under"],
    "the paper over the pools, the pools, and what lies under them",
  );
  const painters = [];
  for (const { file, sheet } of allSheets()) {
    if (!sheet) continue;
    for (const rule of styleRules(sheet)) {
      const decls = rule.declarations?.declarations ?? [];
      const image = decls.find((d) => d.property === "unparsed" && d.value.propertyId.property === "background-image");
      const read = image ? varsIn(image.value.value) : [];
      if (!read.includes("--surface-page-ground") && !read.includes("--surface-page-under")) continue;
      painters.push({ file, rule, decls });
    }
  }
  assert.equal(painters.length, 1, `one rule paints the ground (${painters.map((p) => p.file).join(", ")})`);
  const [{ file, rule, decls }] = painters;
  assert.equal(file, MOBILE, "in the phone's sheet");
  assert.deepEqual(
    rule.selectors.map(selectorText),
    [
      "html:has(…)",
      ".pg-light",
      ".frame-top::before",
      ".frame-top::after",
      ".carry-ground",
      ".main-scroll.pane > .calendar > .cal-head::before",
      ".main-scroll.pane > .calendar > .cal-head::after",
    ],
    "its subjects: the document, the window's layer, the frame's top, the carry sheet, the Calendar's bar",
  );
  const sizes = decls.filter((d) => d.property === "background-size");
  assert.ok(sizes.length > 0 && isScreen(sizes.at(-1)), "laid 100vw by 100lvh: one picture, wherever it is drawn");
  assert.ok(
    !decls.some(
      (d) =>
        d.property === "background-position" ||
        (d.property === "unparsed" && d.value.propertyId.property === "background-position"),
    ),
    "from the window's top, with no offset",
  );
  // No sheet reads a measure of a page into the picture's place.
  for (const { file: f, sheet } of allSheets()) {
    if (!sheet) continue;
    for (const r of styleRules(sheet))
      for (const d of r.declarations?.declarations ?? [])
        if (d.property === "unparsed")
          assert.ok(!varsIn(d.value.value).includes("--going-at"), `${f} offsets the ground by --going-at`);
  }
});
