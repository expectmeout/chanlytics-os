/**
 * Measuring the stylesheets as CSS, for the ratchets that hold the interface kit's
 * rules (docs/plans/2026-09-28-the-interface-kit-and-its-looks.md, §3.7): a value
 * is a token, and a primitive is written once.
 *
 * Every count walks the syntax tree lightningcss builds, the parser the dashboard's
 * build compiles its CSS with, never the text: a comment that says `12px` is not a
 * font size, and a selector written in a comment is not a class. lightningcss types
 * what it understands (a `font-size` of 12px is a length) and keeps a declaration it
 * cannot type, most often one that reads a `var()`, as a list of tokens; the walk
 * below reads both the same way. A stylesheet the parser cannot read whole fails the
 * measure instead of being measured in part: a stray `}` drops every rule after it.
 *
 * Definitions, so a number here can be re-derived by hand:
 *   font     a `font-size`, or a `font` shorthand, that holds a length or a percentage
 *            other than zero (12px, 0.9em, 90%), instead of reading a token
 *   radius   a `border-radius`, or one corner's (logical corners included), that holds
 *            a length or a percentage other than zero; a radius of 0 is a reset, not a
 *            look
 *   shadow   a `box-shadow` or `text-shadow` that holds a length other than zero or a
 *            colour: `none` and one token alone (`var(--shadow-md)`) are not counted
 *   colour   each colour written as a value: a hex, rgb(), hsl(), oklch() and the rest,
 *            and a named colour (`white`), in a custom property too. Not `currentColor`,
 *            not `transparent` (black at no alpha, as the parser reads it), not a colour
 *            derived from a token (`oklch(from var(--ink) …)`, a `color-mix()` over
 *            tokens), which the parser keeps as a function of tokens. A side shorthand
 *            (`border-color`) counts each colour it names once, where the parser spells
 *            it out for four sides. A mask's colours are not counted: `mask-image` reads
 *            only their alpha, which no look sets
 *   blur     each blur() in a `filter` or `backdrop-filter`, prefixed or not, with a
 *            length other than zero. Where a rule means no blur it reads a role whose
 *            Classic value is `none`: the build drops a written `backdrop-filter: none`
 *            beside its prefixed twin (#929), and `blur(0)` is not `none`, since it
 *            makes its element a containing block and a stacking context
 * A literal a page writes as a token's fallback (`var(--radius-md, 8px)`) or beside
 * one (`calc(var(--radius-md) - 1px)`) is counted: it is a number a look cannot reach.
 * A length a page keeps in a custom property of its own (`--r: 6px`) is not seen as a
 * radius or a size: a custom property holds anything, and only its colours are read.
 * What prints is kept as written: a value under `@media print`, or in a rule of a
 * sheet drawn as paper on the screen too (PRINTED, the desk sign's), is counted apart in
 * `kept`, never among the values. Print is ink, not theme.
 *
 * A class draws a primitive when the kit's registry lists it (KIT_REGISTRY, the kit's
 * own names: decision 4), when one of the words its name is made of (split on "-")
 * names one (PRIMITIVE_WORDS), or when it is one of the house's own kit names by
 * prefix (KIT_PREFIXES: the record kit, the menu, the live dot). Three families are
 * homonyms and never count (NOT_PRIMITIVES): People's saved segments (`cl-seg-*`), a
 * saved search (`ld-search-*`) and the map's own controls (`maplibregl-*`). A row or a
 * list item is not counted: a row is most often a page's own layout. A class the
 * registry lists is a primitive whatever its words, so one declared in any stylesheet
 * but the kit's own is a primitive outside the kit.
 *
 * Not named *.test.mjs on purpose: the runner globs that pattern.
 */
import fs from "node:fs";
import path from "node:path";
import { transform } from "lightningcss";
import { ROOT } from "./_source.mjs";

/** The fields a stylesheet's literal style values are counted in. */
export const STYLE_VALUE_FIELDS = ["font", "radius", "shadow", "colour", "blur"];

/** The words that name a primitive, as a class spells them: a class with one of these among its words draws one. */
const PRIMITIVE_WORDS = new Set([
  // a button
  "btn",
  "button",
  "cta",
  // a pill, a chip, a badge, a count, a mark
  "chip",
  "chips",
  "pill",
  "pills",
  "badge",
  "tag",
  "tags",
  "tally",
  "mark",
  // a tab strip, a segmented control, a switch
  "tab",
  "tabs",
  "stabs",
  "seg",
  "segs",
  "segmented",
  "switch",
  "toggle",
  // a card, a tile, a panel
  "card",
  "cards",
  "fcard",
  "tile",
  "tiles",
  "panel",
  // a sheet, a modal, a popover, a menu, a peek, what dims behind them
  "sheet",
  "modal",
  "popover",
  "pop",
  "dialog",
  "drawer",
  "menu",
  "peek",
  "lightbox",
  "backdrop",
  // a field
  "field",
  "input",
  "select",
  "search",
  "textarea",
  "combo",
  "combobox",
  // a face
  "avatar",
  "face",
  "initials",
  // the rest of the kit
  "confirm",
  "empty",
  "meter",
  "tip",
  "tooltip",
  "toast",
]);

/** The house's kit names that are no word of the list: the record kit, the menu's parts, the live dot. */
const KIT_PREFIXES = ["rec-", "more-", "live-dot"];

/** Families whose words say primitive and whose job is not one. */
const NOT_PRIMITIVES = ["cl-seg-", "ld-search-", "maplibregl-"];

/** The kit's registry of its class names (docs/plans/2026-09-28-the-interface-kit-and-its-looks.md, §3.4). */
export const KIT_REGISTRY = "apps/dashboard/src/surfaces/kit/classes.json";
const KIT_CLASSES = new Set(JSON.parse(fs.readFileSync(path.join(ROOT, KIT_REGISTRY), "utf8")).classes);

/** Whether a class name draws a primitive, for a set of the kit's names: see the header. */
export const isPrimitiveClassFor = (kit) => (name) => {
  if (kit.has(name)) return true;
  if (NOT_PRIMITIVES.some((p) => name.startsWith(p))) return false;
  if (KIT_PREFIXES.some((p) => name === p || name.startsWith(p))) return true;
  return name.split("-").some((w) => PRIMITIVE_WORDS.has(w.toLowerCase()));
};

/** Whether a class name draws a primitive, the kit's registry read: what the measure counts. */
export const isPrimitiveClass = isPrimitiveClassFor(KIT_CLASSES);

const FONT = new Set(["font-size", "font"]);
const RADIUS = new Set([
  "border-radius",
  "border-top-left-radius",
  "border-top-right-radius",
  "border-bottom-right-radius",
  "border-bottom-left-radius",
  "border-start-start-radius",
  "border-start-end-radius",
  "border-end-start-radius",
  "border-end-end-radius",
]);
const SHADOW = new Set(["box-shadow", "text-shadow"]);
const FILTER = new Set(["filter", "backdrop-filter"]);
/** Shorthands the parser writes out side by side: a colour written once is counted once. */
const SIDED = new Set(["border-color", "border-block-color", "border-inline-color"]);
/** A mask reads only a colour's alpha: `mask`, `mask-image` and the rest, prefixed or not. */
const isMask = (property) => /^(-webkit-)?mask(-|$)/.test(property);

/** The colour spaces lightningcss types a written colour in; `currentcolor`, `system` and `light-dark` are not one. */
const COLOUR_TYPES = new Set([
  "rgb",
  "hsl",
  "hwb",
  "lab",
  "lch",
  "oklab",
  "oklch",
  "srgb",
  "srgb-linear",
  "display-p3",
  "a98-rgb",
  "prophoto-rgb",
  "rec2020",
  "xyz-d50",
  "xyz-d65",
]);

/** CSS's named colours (CSS Color 4), which a list of tokens keeps as words; `transparent` and `currentcolor` are not. */
const NAMED_COLOURS = new Set(
  (
    "aliceblue antiquewhite aqua aquamarine azure beige bisque black blanchedalmond blue blueviolet brown burlywood " +
    "cadetblue chartreuse chocolate coral cornflowerblue cornsilk crimson cyan darkblue darkcyan darkgoldenrod darkgray " +
    "darkgreen darkgrey darkkhaki darkmagenta darkolivegreen darkorange darkorchid darkred darksalmon darkseagreen " +
    "darkslateblue darkslategray darkslategrey darkturquoise darkviolet deeppink deepskyblue dimgray dimgrey dodgerblue " +
    "firebrick floralwhite forestgreen fuchsia gainsboro ghostwhite gold goldenrod gray green greenyellow grey honeydew " +
    "hotpink indianred indigo ivory khaki lavender lavenderblush lawngreen lemonchiffon lightblue lightcoral lightcyan " +
    "lightgoldenrodyellow lightgray lightgreen lightgrey lightpink lightsalmon lightseagreen lightskyblue " +
    "lightslategray lightslategrey lightsteelblue lightyellow lime limegreen linen magenta maroon mediumaquamarine " +
    "mediumblue mediumorchid mediumpurple mediumseagreen mediumslateblue mediumspringgreen mediumturquoise " +
    "mediumvioletred midnightblue mintcream mistyrose moccasin navajowhite navy oldlace olive olivedrab orange " +
    "orangered orchid palegoldenrod palegreen paleturquoise palevioletred papayawhip peachpuff peru pink plum " +
    "powderblue purple rebeccapurple red rosybrown royalblue saddlebrown salmon sandybrown seagreen seashell sienna " +
    "silver skyblue slateblue slategray slategrey snow springgreen steelblue tan teal thistle tomato turquoise violet " +
    "wheat white whitesmoke yellow yellowgreen"
  ).split(" "),
);

const isObject = (n) => n !== null && typeof n === "object";

/** A colour written as a value; `transparent` is black at no alpha to the parser, and is no colour a look sets. */
function isColour(n) {
  if (!isObject(n)) return false;
  if (n.type === "token" && n.value?.type === "ident") return NAMED_COLOURS.has(String(n.value.value).toLowerCase());
  if (!COLOUR_TYPES.has(n.type)) return false;
  const channels = Object.values(n).filter((v) => typeof v === "number");
  if (channels.length === 0) return false;
  return !(n.type === "rgb" && n.alpha === 0 && n.r === 0 && n.g === 0 && n.b === 0);
}

/** A length or a percentage other than zero: `{ unit, value }` as the parser types it, or a percentage. */
function isLength(n) {
  if (!isObject(n) || typeof n.value !== "number" || n.value === 0) return false;
  return typeof n.unit === "string" || n.type === "percentage";
}

/** Every node under `n` for which `pick` is true, not looking inside a node it picked. */
function find(n, pick, out = []) {
  if (Array.isArray(n)) {
    for (const m of n) find(m, pick, out);
  } else if (isObject(n)) {
    if (pick(n)) out.push(n);
    else for (const v of Object.values(n)) find(v, pick, out);
  }
  return out;
}

/** A declaration's property as written, whether lightningcss typed it or kept it as tokens. */
function propertyOf(d) {
  if (d.property === "unparsed") return d.value.propertyId.property;
  if (d.property === "custom") return d.value.name;
  return d.property;
}

/** A blur() that holds a length other than zero, typed or kept as a function of tokens. */
const isBlur = (n) =>
  (n.type === "blur" && find(n.value, isLength).length > 0) ||
  (n.type === "function" && n.value?.name === "blur" && find(n.value.arguments, isLength).length > 0);

/** How many colours a declaration writes: each one, or each distinct one where the parser spells out the sides. */
function coloursIn(property, value) {
  if (isMask(property)) return 0;
  const found = find(value, isColour);
  return SIDED.has(property) ? new Set(found.map((c) => JSON.stringify(c))).size : found.length;
}

/**
 * What is printed is ink on paper, not the theme (the coordinator's call, 26 Nov 2026): a value written under
 * `@media print`, or in a rule of a sheet drawn as paper on the screen too, is kept as written. It is counted apart, in
 * `kept`, never among the values.
 */
export const KEPT_WHY = "print: ink, not theme";
/** A sheet drawn as paper on the screen too: the desk sign's (app/globals.css, src/yes/DeskSign.tsx), black on white
 *  whatever the theme, its words sized to the paper. Its bar and its Print press are the screen's, and are counted. */
const PRINTED = new Set([
  "sign-sheet",
  "sign-body",
  "sign-business",
  "sign-headline",
  "sign-how",
  "sign-byhand",
  "sign-fine",
  "sign-long",
  "sign-qr",
  "sign-addr",
]);

/** Whether a rule is printed: a media rule for print, or a style rule one of whose selectors names a printed class. */
function prints(rule) {
  if (rule.type === "media") {
    return rule.value.query.mediaQueries.some((q) => q.mediaType === "print" && q.qualifier !== "not");
  }
  if (rule.type === "style") {
    return find(rule.value.selectors, (n) => n.type === "class" && PRINTED.has(n.name)).length > 0;
  }
  return false;
}

/**
 * What one stylesheet writes: its literal style values by field, what of them it keeps as printed (`kept`), each
 * class its selectors name with how many selectors name it, and the parser's warnings. `text` is the stylesheet,
 * `filename` only names it in a warning.
 */
export function cssFacts(text, filename = "fixture.css") {
  const values = Object.fromEntries(STYLE_VALUE_FIELDS.map((f) => [f, 0]));
  const kept = Object.fromEntries(STYLE_VALUE_FIELDS.map((f) => [f, 0]));
  const classes = {};
  // The rules the walk is inside, each said printed or not; a declaration inside any printed one is kept.
  const inside = [];
  let printed = 0;
  const { warnings } = transform({
    filename,
    code: Buffer.from(text),
    errorRecovery: true,
    visitor: {
      Rule(rule) {
        const yes = prints(rule);
        inside.push(yes);
        if (yes) printed++;
      },
      RuleExit() {
        if (inside.pop()) printed--;
      },
      Declaration(d) {
        const property = propertyOf(d);
        const value = d.value;
        const into = printed > 0 ? kept : values;
        into.colour += coloursIn(property, value);
        if (FONT.has(property) && find(value, isLength).length > 0) into.font++;
        if (RADIUS.has(property) && find(value, isLength).length > 0) into.radius++;
        if (SHADOW.has(property) && find(value, (n) => isLength(n) || isColour(n)).length > 0) into.shadow++;
        if (FILTER.has(property)) into.blur += find(value, isBlur).length;
      },
      Selector(selector) {
        for (const c of find(selector, (n) => n.type === "class" && typeof n.name === "string")) {
          classes[c.name] = (classes[c.name] ?? 0) + 1;
        }
      },
    },
  });
  return { values, kept, classes, warnings: warnings.map((w) => `${filename}:${w.loc?.line ?? "?"}: ${w.message}`) };
}

/** cssFacts, refusing a stylesheet the parser could not read whole rather than measuring what was left of it. */
export function strictFacts(text, filename) {
  const facts = cssFacts(text, filename);
  if (facts.warnings.length > 0) {
    throw new Error(`the CSS measures cannot read ${filename} whole:\n${facts.warnings.join("\n")}`);
  }
  return facts;
}

const facts = new Map();

/** strictFacts of one repo-relative stylesheet, read once per process. */
export function cssOf(file) {
  const hit = facts.get(file);
  if (hit) return hit;
  const found = strictFacts(fs.readFileSync(path.join(ROOT, file), "utf8"), file);
  facts.set(file, found);
  return found;
}

/* ---- The cascade on a screen: what a selector is given, as the build's parser reads a stylesheet ---- */

/**
 * A screen a stylesheet is asked about: its width in CSS pixels, whether it can hover, its pointer, and whether its person
 * asked for less motion. A phone and a desk, at the widths e2e/ opens the pages at; any other is asked as
 * `{ ...DESK, width: 800 }`. Since 26 Nov 2026 (layer 14, round two), when the pages' tests stopped finding a rule's
 * text in a sheet's and asked the sheet what a selector is given instead: written another way, or moved to another
 * place in the sheet, a rule gives what it gave; under a query that no longer holds on a phone, it does not.
 */
export const PHONE = Object.freeze({ width: 390, hover: false, pointer: "coarse", reducedMotion: false });
export const DESK = Object.freeze({ width: 1440, hover: true, pointer: "fine", reducedMotion: false });

const RANGE = {
  "less-than": (a, b) => a < b,
  "less-than-equal": (a, b) => a <= b,
  equal: (a, b) => a === b,
  "greater-than": (a, b) => a > b,
  "greater-than-equal": (a, b) => a >= b,
};

/** A media feature's width in px; any other unit throws, as a query the cascade cannot answer. */
function pxOf(value, where) {
  const v = value?.type === "length" ? value.value : null;
  if (v?.type === "value" && v.value.unit === "px") return v.value.value;
  throw new Error(`the cascade reads a width in px, not ${JSON.stringify(value)} (${where})`);
}

/** Whether one media feature holds on `screen`. One it cannot answer throws, so no check passes on a guess. */
function featureHolds(f, screen, where) {
  const ident = f.value?.type === "ident" ? f.value.value : null;
  if (f.type === "range" && f.name === "width") return RANGE[f.operator](screen.width, pxOf(f.value, where));
  if (f.type === "plain" && f.name === "hover") return ident === (screen.hover ? "hover" : "none");
  if (f.type === "plain" && f.name === "pointer") return ident === screen.pointer;
  if (f.type === "plain" && f.name === "prefers-reduced-motion") {
    return ident === (screen.reducedMotion ? "reduce" : "no-preference");
  }
  throw new Error(`the cascade cannot say whether (${f.name}) holds on a screen (${where})`);
}

function conditionHolds(c, screen, where) {
  if (!c) return true;
  if (c.type === "feature") return featureHolds(c.value, screen, where);
  if (c.type === "not") return !conditionHolds(c.value, screen, where);
  if (c.type === "operation") {
    const each = c.conditions.map((x) => conditionHolds(x, screen, where));
    return c.operator === "and" ? each.every(Boolean) : each.some(Boolean);
  }
  throw new Error(`the cascade cannot read a media condition of type ${c.type} (${where})`);
}

/** Whether a media query list holds on `screen`: any one of its queries, by its type and its condition. */
const queryHolds = (query, screen, where) =>
  query.mediaQueries.some((q) => {
    const holds = (q.mediaType === "all" || q.mediaType === "screen") && conditionHolds(q.condition, screen, where);
    return q.qualifier === "not" ? !holds : holds;
  });

const trees = new Map();

/** One stylesheet's syntax tree, as the build's parser reads it, once per process; a sheet it cannot read whole throws. */
function treeOf(file) {
  const hit = trees.get(file);
  if (hit) return hit;
  let tree = null;
  const { warnings } = transform({
    filename: file,
    code: fs.readFileSync(path.join(ROOT, file)),
    errorRecovery: true,
    visitor: {
      StyleSheet(s) {
        tree = s;
      },
    },
  });
  if (!tree || warnings.length > 0) {
    throw new Error(`the cascade cannot read ${file} whole:\n${warnings.map((w) => w.message).join("\n")}`);
  }
  trees.set(file, tree);
  return tree;
}

/**
 * Every rule of a sheet, in its order, each with whether it holds on `screen` (null: every rule, whatever the screen).
 * A container query's rules hold by a box's size, not the screen's, and are left out; a rule nested in a style rule
 * throws, since no sheet the pages link nests one yet and its selector is its parent's.
 */
function* rulesOf(file, screen) {
  function* walk(rules) {
    for (const r of rules) {
      if (r.type === "media") {
        if (screen === null || queryHolds(r.value.query, screen, `${file}:${r.value.loc.line}`))
          yield* walk(r.value.rules);
      } else if (r.type === "supports" || r.type === "layer-block") {
        yield* walk(r.value.rules);
      } else {
        if (r.type === "style" && r.value.rules?.length > 0) {
          throw new Error(`the cascade does not read a nested rule (${file}:${r.value.loc.line})`);
        }
        yield r;
      }
    }
  }
  yield* walk(treeOf(file).rules);
}

/**
 * One declaration as the parser prints it alone, minified (`animation:none`), so two never merge into a shorthand. What
 * the parser hands out as null (a `var()`'s `from`, its absent fallback) it refuses back as null, so a null is left out.
 */
function printOne(parsed, important) {
  const d = JSON.parse(JSON.stringify(parsed, (_, v) => (v === null ? undefined : v)));
  const { code } = transform({
    filename: "given.css",
    code: Buffer.from(""),
    minify: true,
    visitor: {
      StyleSheet: (s) => ({
        ...s,
        rules: [
          {
            type: "style",
            value: {
              selectors: [[{ type: "class", name: "given" }]],
              declarations: important
                ? { declarations: [], importantDeclarations: [d] }
                : { declarations: [d], importantDeclarations: [] },
              rules: [],
              loc: { source_index: 0, line: 1, column: 1 },
            },
          },
        ],
      }),
    },
  });
  const text = code.toString();
  const body = text.slice(text.indexOf("{") + 1, text.lastIndexOf("}"));
  const colon = body.indexOf(":");
  return [body.slice(0, colon), body.slice(colon + 1)];
}

/** What a block of declarations gives, by property, a later one winning and an important one beating any other. */
function giveInto(given, important, block) {
  for (const d of block?.declarations ?? []) {
    const [property, value] = printOne(d, false);
    if (!important.has(property)) given[property] = value;
  }
  for (const d of block?.importantDeclarations ?? []) {
    const [property, value] = printOne(d, true);
    given[property] = value;
    important.add(property);
  }
}

/** One rule's body, read as a sheet's is (`animation: none; opacity: 1`), and printed as givenOn prints what it says. */
export function declared(text) {
  let tree = null;
  transform({
    filename: "declared.css",
    code: Buffer.from(`.given { ${text} }`),
    visitor: {
      StyleSheet(s) {
        tree = s;
      },
    },
  });
  const rule = tree?.rules[0];
  if (rule?.type !== "style") throw new Error(`not a rule's body: ${text}`);
  const given = {};
  giveInto(given, new Set(), rule.value.declarations);
  return given;
}

/** A selector as the parser reads it: `.a>.b` and `.a > .b` are one selector. */
function selectorOf(text) {
  let tree = null;
  transform({
    filename: "selector.css",
    code: Buffer.from(`${text} {}`),
    visitor: {
      StyleSheet(s) {
        tree = s;
      },
    },
  });
  const rule = tree?.rules[0];
  if (rule?.type !== "style" || rule.value.selectors.length !== 1) throw new Error(`not one selector: ${text}`);
  return JSON.stringify(rule.value.selectors[0]);
}

/**
 * What `selector` is given by one repo-relative stylesheet on `screen`: each declaration of every style rule that lists
 * the selector, under media queries that hold there, by property as the parser prints it (`{ animation: "none" }`), a
 * later rule winning and an important declaration beating the rest. The rules that list it have its specificity, so
 * their order decides; a rule naming another selector the same element matches is not weighed.
 */
export function givenOn(file, selector, screen) {
  const want = selectorOf(selector);
  const given = {};
  const important = new Set();
  for (const r of rulesOf(file, screen)) {
    if (r.type === "style" && r.value.selectors.some((s) => JSON.stringify(s) === want)) {
      giveInto(given, important, r.value.declarations);
    }
  }
  return given;
}

/** Every property one stylesheet sets, in any rule under any query: what a check that it sets none asks. */
export function propertiesIn(file) {
  const out = new Set();
  for (const r of rulesOf(file, null)) {
    if (r.type !== "style") continue;
    const block = r.value.declarations;
    for (const d of [...(block?.declarations ?? []), ...(block?.importantDeclarations ?? [])]) out.add(propertyOf(d));
  }
  return out;
}

/** One stylesheet's `@keyframes <name>`, each step (`from`, `50%`, `to`) with what it gives, or null where none is. */
export function keyframesOf(file, name) {
  const found = [...rulesOf(file, null)].filter((r) => r.type === "keyframes" && r.value.name.value === name);
  if (found.length > 1) throw new Error(`${file} declares @keyframes ${name} ${found.length} times`);
  if (found.length === 0) return null;
  const steps = {};
  for (const k of found[0].value.keyframes) {
    for (const s of k.selectors) {
      const at = s.type === "percentage" ? `${Math.round(s.value * 1000) / 10}%` : s.type;
      const given = {};
      giveInto(given, new Set(), k.declarations);
      steps[at] = given;
    }
  }
  return steps;
}
