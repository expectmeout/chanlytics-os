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
 * The cascade at the end of this module runs the stylesheets for one element, as a browser decides what it draws with.
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

/* ---- The cascade, run: the value an element is drawn with (lane 4, area c, 26 Nov 2026) ---- */

/**
 * What a browser makes of the stylesheets a page links, for one element. A stylesheet does not run in node, so a test of
 * one used to slice its text ("mobile.css includes `.ix-back { display: none; }`"), which passes over a later rule that
 * overrides it, a media query it sits in or a class the page no longer draws. This is the part of a browser that decides
 * which value an element is drawn with, and nothing else: each rule whose selector matches the element, under the media
 * and supports conditions it is written in, ordered as the cascade orders them (importance, specificity, then the order
 * the sheets are linked and the rules written), each property's winner, inherited where CSS inherits it, every var()
 * replaced by what the element holds. So a test asks "on a phone, inside the app, what is the room under a page?" and
 * reads the answer a browser would draw.
 *
 * What it does not model is said, never guessed: layout, a container query and a first style (@starting-style) apply
 * nowhere here, and a media feature it does not know throws. An element is written as the selectors that would name it,
 * from the document down (`element("html.in-app", ".app-root", ".main-scroll")`: html and body are put in front when the
 * first part is not the document). A part may say what it holds, for `:has()` (`{ sel: ".pane", holds: [".ix-threads"] }`),
 * and a state is a pseudo-class on its part (`button:focus-visible`).
 */

const INHERITED = new Set([
  "color",
  "color-scheme",
  "cursor",
  "direction",
  "font",
  "font-family",
  "font-feature-settings",
  "font-size",
  "font-style",
  "font-variant",
  "font-variant-numeric",
  "font-weight",
  "hyphens",
  "letter-spacing",
  "line-height",
  "list-style",
  "list-style-type",
  "overflow-wrap",
  "tab-size",
  "text-align",
  "text-indent",
  "text-rendering",
  "text-transform",
  "visibility",
  "white-space",
  "word-break",
  "word-spacing",
  "-webkit-font-smoothing",
  "-webkit-text-size-adjust",
]);

/** The four sides a box shorthand spells out, in its own order. */
const SIDES = {
  margin: ["margin-top", "margin-right", "margin-bottom", "margin-left"],
  padding: ["padding-top", "padding-right", "padding-bottom", "padding-left"],
  inset: ["top", "right", "bottom", "left"],
};

/** A text's characters walked with comments, strings and brackets kept whole: each top-level character handed to `at`. */
function walkTop(text, at) {
  let depth = 0;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (c === "/" && text[i + 1] === "*") {
      const end = text.indexOf("*/", i + 2);
      if (end < 0) throw new Error("a comment that never closes");
      i = end + 1;
      continue;
    }
    if (c === '"' || c === "'") {
      let j = i + 1;
      while (j < text.length && text[j] !== c) j += text[j] === "\\" ? 2 : 1;
      i = j;
      continue;
    }
    if (c === "(" || c === "[") depth++;
    else if (c === ")" || c === "]") depth--;
    if (at(c, i, depth) === false) return;
  }
}

/** A list split on a character outside brackets and strings: selectors on commas, declarations on semicolons. */
function splitTop(text, on) {
  const out = [];
  let from = 0;
  walkTop(text, (c, i, depth) => {
    if (c === on && depth === 0) {
      out.push(text.slice(from, i));
      from = i + 1;
    }
  });
  out.push(text.slice(from));
  return out.map((s) => s.trim()).filter(Boolean);
}

const uncomment = (s) => s.replace(/\/\*[\s\S]*?\*\//g, " ");
const squash = (s) => uncomment(s).replace(/\s+/g, " ").trim();

/** A block's declarations, each `{ prop, value, important }`, a box shorthand spelled out to its sides as well. */
function declarationsOf(body) {
  const out = [];
  for (const raw of splitTop(body, ";")) {
    const d = squash(raw);
    if (!d) continue;
    const colon = d.indexOf(":");
    if (colon < 1) throw new Error(`not a declaration: ${d}`);
    const prop = d.slice(0, colon).trim();
    let value = d.slice(colon + 1).trim();
    const important = /!\s*important$/i.test(value);
    if (important) value = value.replace(/!\s*important$/i, "").trim();
    out.push({ prop: prop.startsWith("--") ? prop : prop.toLowerCase(), value, important });
    if (SIDES[prop]) {
      const parts = splitTop(value, " ").filter((p) => p);
      const [t, r = t, b = t, l = r] = parts;
      SIDES[prop].forEach((side, k) => out.push({ prop: side, value: [t, r, b, l][k], important }));
    }
  }
  return out;
}

/* -- selectors -- */

const IDENT = /^-?[_a-zA-Z -￿-][_a-zA-Z0-9 -￿-]*/;

/** One complex selector as its compounds, right to left, each with the combinator that joins it to the one before. */
function parseSelector(text) {
  const s = squash(text);
  const compounds = [];
  let i = 0;
  let combinator = null;
  let current = null;
  const fresh = () => ({ tag: null, ids: [], classes: [], attrs: [], pseudos: [], element: null });
  const close = () => {
    if (current) compounds.push({ ...current, combinator });
    current = null;
  };
  while (i < s.length) {
    const c = s[i];
    if (c === " " || c === ">" || c === "+" || c === "~") {
      // A combinator: whitespace alone is a descendant; > + ~ say their own.
      let j = i;
      let said = " ";
      while (j < s.length && " >+~".includes(s[j])) {
        if (s[j] !== " ") said = s[j];
        j++;
      }
      close();
      combinator = said;
      i = j;
      continue;
    }
    current ??= fresh();
    if (c === "*") {
      current.tag = "*";
      i++;
    } else if (c === "." || c === "#") {
      const m = IDENT.exec(s.slice(i + 1));
      if (!m) throw new Error(`a selector this cascade cannot read: ${s}`);
      (c === "." ? current.classes : current.ids).push(m[0]);
      i += 1 + m[0].length;
    } else if (c === "[") {
      let end = i;
      walkTop(s.slice(i), (ch, k, depth) => {
        if (ch === "]" && depth === 0) {
          end = i + k;
          return false;
        }
      });
      const inner = s.slice(i + 1, end).trim();
      const m = /^([-\w]+)\s*(?:([~|^$*]?=)\s*(?:"([^"]*)"|'([^']*)'|([^\s\]]+))\s*(i|s)?)?$/.exec(inner);
      if (!m) throw new Error(`an attribute this cascade cannot read: [${inner}]`);
      current.attrs.push({ name: m[1], op: m[2] ?? null, value: m[3] ?? m[4] ?? m[5] ?? null, fold: m[6] === "i" });
      i = end + 1;
    } else if (c === ":") {
      const isElement = s[i + 1] === ":";
      const from = i + (isElement ? 2 : 1);
      const m = IDENT.exec(s.slice(from));
      if (!m) throw new Error(`a pseudo-class this cascade cannot read: ${s}`);
      let j = from + m[0].length;
      let args = null;
      if (s[j] === "(") {
        let end = j;
        walkTop(s.slice(j), (ch, k, depth) => {
          if (ch === ")" && depth === 0) {
            end = j + k;
            return false;
          }
        });
        args = s.slice(j + 1, end);
        j = end + 1;
      }
      const name = m[0].toLowerCase();
      if (isElement || ["before", "after", "first-line", "first-letter"].includes(name)) current.element = name;
      else
        current.pseudos.push({
          name,
          args,
          list: ["not", "is", "where", "has", "matches"].includes(name)
            ? splitTop(args ?? "", ",").map(parseSelector)
            : null,
        });
      i = j;
    } else {
      const m = IDENT.exec(s.slice(i));
      if (!m) throw new Error(`a selector this cascade cannot read: ${s}`);
      current.tag = m[0].toLowerCase();
      i += m[0].length;
    }
  }
  close();
  // Left to right, the subject last. The first compound has no combinator before it; a relative selector (`:has(> x)`)
  // starts with one.
  return compounds;
}

/** [ids, classes, types] of a complex selector, as the cascade weighs it. */
function specificityOf(compounds) {
  const total = [0, 0, 0];
  const add = (s) => s.forEach((n, k) => (total[k] += n));
  for (const c of compounds) {
    total[0] += c.ids.length;
    total[1] += c.classes.length + c.attrs.length;
    if (c.tag && c.tag !== "*") total[2]++;
    if (c.element) total[2]++;
    for (const p of c.pseudos) {
      if (p.name === "where") continue;
      if (p.list) {
        const most = p.list.map(specificityOf).sort(bySpecificity).at(-1) ?? [0, 0, 0];
        add(most);
      } else total[1]++;
    }
  }
  return total;
}

const bySpecificity = (a, b) => a[0] - b[0] || a[1] - b[1] || a[2] - b[2];

function attrMatches(el, a) {
  const has = Object.hasOwn(el.attrs, a.name);
  if (!has) return false;
  if (!a.op) return true;
  const fold = (v) => (a.fold ? String(v).toLowerCase() : String(v));
  const v = fold(el.attrs[a.name]);
  const want = fold(a.value);
  switch (a.op) {
    case "=":
      return v === want;
    case "~=":
      return v.split(/\s+/).includes(want);
    case "|=":
      return v === want || v.startsWith(`${want}-`);
    case "^=":
      return want !== "" && v.startsWith(want);
    case "$=":
      return want !== "" && v.endsWith(want);
    case "*=":
      return want !== "" && v.includes(want);
    default:
      return false;
  }
}

function compoundMatches(el, c) {
  if (c.tag && c.tag !== "*" && c.tag !== el.tag) return false;
  if ((c.element ?? null) !== (el.pseudo ?? null)) return false;
  if (!c.ids.every((id) => el.id === id)) return false;
  if (!c.classes.every((k) => el.classes.has(k))) return false;
  if (!c.attrs.every((a) => attrMatches(el, a))) return false;
  for (const p of c.pseudos) {
    if (p.name === "root") {
      if (el.parent) return false;
    } else if (p.name === "not") {
      if (p.list.some((sel) => complexMatches({ ...el, pseudo: null }, sel))) return false;
    } else if (p.name === "is" || p.name === "where" || p.name === "matches") {
      if (!p.list.some((sel) => complexMatches({ ...el, pseudo: null }, sel))) return false;
    } else if (p.name === "has") {
      const held = el.holds ?? [];
      const relative = (sel) =>
        held.some((h) => {
          const first = sel[0];
          // `:has(> x)` asks a child; plain `:has(x)` any descendant, which is what a part's holds are.
          if (first.combinator === ">" && h.parent !== el) return false;
          return complexMatches(h, sel, el);
        });
      if (!p.list.some(relative)) return false;
    } else {
      const state = p.args === null ? p.name : `${p.name}(${squash(p.args)})`;
      if (!el.states.has(state)) return false;
    }
  }
  return true;
}

/** Whether `el` is what a complex selector names; `scope` stands for `:has()`'s subject, above which it never climbs. */
function complexMatches(el, compounds, scope = null, at = compounds.length - 1) {
  if (!el || el === scope) return false;
  const c = compounds[at];
  if (!compoundMatches(el, c)) return false;
  if (at === 0) return scope === null || isWithin(el, scope);
  const joined = compounds[at].combinator;
  if (joined === " " || joined === null) {
    for (let up = el.parent; up && up !== scope; up = up.parent)
      if (complexMatches(up, compounds, scope, at - 1)) return true;
    return false;
  }
  if (joined === ">") return complexMatches(el.parent, compounds, scope, at - 1);
  // A sibling is only what a part says stands before it (`before`); none is assumed.
  const before = el.before ?? [];
  if (joined === "+") return before.length > 0 && complexMatches(before.at(-1), compounds, scope, at - 1);
  if (joined === "~") return before.some((b) => complexMatches(b, compounds, scope, at - 1));
  return false;
}

const isWithin = (el, scope) => {
  for (let up = el.parent; up; up = up.parent) if (up === scope) return true;
  return false;
};

/* -- media and supports -- */

const px = (v) => {
  const m = /^(-?\d*\.?\d+)(px|em|rem)?$/.exec(v.trim());
  if (!m) throw new Error(`a length this cascade cannot weigh: ${v}`);
  return Number(m[1]) * (m[2] === "em" || m[2] === "rem" ? 16 : 1);
};

function featureHolds(feature, ctx) {
  const f = feature.trim();
  // A range: (width > 900px), (721px <= width <= 900px).
  const range =
    /^(?:([\d.]+(?:px|em|rem)?)\s*(<=|<|>=|>)\s*)?(width|height)\s*(<=|<|>=|>)\s*([\d.]+(?:px|em|rem)?)$/.exec(f);
  if (range) {
    const size = range[3] === "width" ? ctx.width : ctx.height;
    const cmp = (a, op, b) => (op === "<" ? a < b : op === "<=" ? a <= b : op === ">" ? a > b : a >= b);
    const lowOk = range[1] ? cmp(px(range[1]), range[2], size) : true;
    return lowOk && cmp(size, range[4], px(range[5]));
  }
  const reversed = /^([\d.]+(?:px|em|rem)?)\s*(<=|<|>=|>)\s*(width|height)$/.exec(f);
  if (reversed) {
    const size = reversed[3] === "width" ? ctx.width : ctx.height;
    const op = reversed[2];
    const n = px(reversed[1]);
    return op === "<" ? n < size : op === "<=" ? n <= size : op === ">" ? n > size : n >= size;
  }
  const m = /^([-\w]+)\s*(?::\s*(.+))?$/.exec(f);
  if (!m) throw new Error(`a media feature this cascade cannot read: (${f})`);
  const [, name, value] = m;
  const v = value?.trim();
  switch (name) {
    case "max-width":
      return ctx.width <= px(v);
    case "min-width":
      return ctx.width >= px(v);
    case "max-height":
      return ctx.height <= px(v);
    case "min-height":
      return ctx.height >= px(v);
    case "prefers-reduced-motion":
      return v === undefined ? ctx.reducedMotion : (v === "reduce") === ctx.reducedMotion;
    case "prefers-reduced-transparency":
      return v === undefined ? ctx.reducedTransparency : (v === "reduce") === ctx.reducedTransparency;
    case "prefers-color-scheme":
      return v === ctx.colorScheme;
    case "pointer":
      return v === ctx.pointer;
    case "hover":
      return v === undefined ? ctx.hover === "hover" : v === ctx.hover;
    case "display-mode":
      return v === ctx.displayMode;
    case "orientation":
      return v === (ctx.width >= ctx.height ? "landscape" : "portrait");
    case "min-aspect-ratio":
    case "max-aspect-ratio": {
      const [a, b] = v.split("/").map(Number);
      const r = ctx.width / ctx.height;
      return name === "min-aspect-ratio" ? r >= a / b : r <= a / b;
    }
    default:
      throw new Error(`a media feature this cascade does not model: (${f})`);
  }
}

function mediaHolds(query, ctx) {
  return splitTop(query, ",").some((q) => {
    let text = squash(q);
    let negate = false;
    if (/^not\s/i.test(text)) {
      negate = true;
      text = text.slice(4);
    }
    text = text.replace(/^only\s+/i, "");
    const parts = text.split(/\s+and\s+/i);
    const holds = parts.every((part) => {
      const p = part.trim();
      if (p === "screen" || p === "all") return true;
      if (p === "print") return ctx.print;
      if (p.startsWith("(") && p.endsWith(")")) return featureHolds(p.slice(1, -1), ctx);
      throw new Error(`a media query this cascade cannot read: ${q}`);
    });
    return negate ? !holds : holds;
  });
}

function supportsHolds(condition, ctx) {
  const c = squash(condition);
  if (/^not\s/i.test(c)) return !supportsHolds(c.slice(4), ctx);
  const ors = c.split(/\)\s+or\s+\(/i);
  if (ors.length > 1)
    return ors.some((o, k) => supportsHolds(`${k ? "(" : ""}${o}${k < ors.length - 1 ? ")" : ""}`, ctx));
  const ands = c.split(/\)\s+and\s+\(/i);
  if (ands.length > 1)
    return ands.every((o, k) => supportsHolds(`${k ? "(" : ""}${o}${k < ands.length - 1 ? ")" : ""}`, ctx));
  const inner = c.replace(/^\(|\)$/g, "").trim();
  if (inner.startsWith("(")) return supportsHolds(inner, ctx);
  // Only an iPhone's browsers say -webkit-touch-callout; anything else is supported unless the context says it is not.
  if (/-webkit-touch-callout/.test(inner)) return ctx.ios;
  return !ctx.unsupported.some((u) => inner.includes(u));
}

/* -- the sheets -- */

/** A stylesheet's top-level items in order, each its prelude and its block (null for a statement, `@import ...;`). */
function blocksIn(text, file) {
  const out = [];
  let i = 0;
  const n = text.length;
  while (i < n) {
    // The prelude: up to a `{` or a `;` outside brackets and strings.
    let stop = -1;
    let kind = null;
    walkTop(text.slice(i), (c, k, depth) => {
      if (depth === 0 && (c === "{" || c === ";" || c === "}")) {
        stop = i + k;
        kind = c;
        return false;
      }
    });
    if (stop < 0) {
      if (squash(text.slice(i)))
        throw new Error(`${file}: text after the last rule: ${squash(text.slice(i)).slice(0, 80)}`);
      return out;
    }
    const prelude = squash(text.slice(i, stop));
    if (kind === "}") throw new Error(`${file}: a } that closes nothing, after ${prelude.slice(0, 80)}`);
    if (kind === ";") {
      out.push({ prelude, body: null });
      i = stop + 1;
      continue;
    }
    // The block: to its matching `}`.
    let depth = 0;
    let end = -1;
    walkTop(text.slice(stop), (c, k, d) => {
      if (d !== 0) return;
      if (c === "{") depth++;
      else if (c === "}" && --depth === 0) {
        end = stop + k;
        return false;
      }
    });
    if (end < 0) throw new Error(`${file}: a { that never closes, at ${prelude.slice(0, 80)}`);
    out.push({ prelude, body: text.slice(stop + 1, end) });
    i = end + 1;
  }
  return out;
}

/** A stylesheet's rules in the order they are written, each with the conditions it is drawn under. */
function rulesIn(text, file, into, outer = { media: [], supports: [], apart: null }) {
  for (const { prelude, body } of blocksIn(text, file)) {
    if (body === null) {
      const imp = /^@import\s+(?:url\()?["']([^"']+)["']\)?/.exec(prelude);
      if (imp) {
        const target = path.posix.join(path.posix.dirname(file), imp[1]);
        rulesIn(readSheet(target), target, into, outer);
      }
      continue;
    }
    const at = /^@([-\w]+)\s*(.*)$/.exec(prelude);
    if (!at) {
      into.rules.push({
        file,
        selectors: splitTop(prelude, ",").map((s) => ({ text: s, compounds: parseSelector(s) })),
        declarations: declarationsOf(body),
        ...outer,
        order: into.rules.length,
      });
    } else {
      const [, name, rest] = at;
      if (name === "media") rulesIn(body, file, into, { ...outer, media: [...outer.media, rest] });
      else if (name === "supports") rulesIn(body, file, into, { ...outer, supports: [...outer.supports, rest] });
      else if (name === "container" || name === "starting-style")
        rulesIn(body, file, into, { ...outer, apart: `@${name} ${rest}`.trim() });
      else if (name === "keyframes" || name === "-webkit-keyframes") {
        const frames = {};
        for (const f of blocksIn(body, file))
          for (const key of splitTop(f.prelude, ","))
            frames[key] = {
              ...frames[key],
              ...Object.fromEntries(declarationsOf(f.body ?? "").map((d) => [d.prop, d.value])),
            };
        into.keyframes.push({ name: rest.trim(), frames, ...outer, order: into.keyframes.length });
      } else if (name === "layer") throw new Error(`${file}: @layer is not modelled by this cascade`);
      // @font-face, @property and @page draw no element.
    }
  }
}

const sheetText = new Map();
function readSheet(file) {
  if (!sheetText.has(file)) sheetText.set(file, fs.readFileSync(path.join(ROOT, file), "utf8"));
  return sheetText.get(file);
}

/** The stylesheets every page of the frame links, in the cascade's order: the root layout's globals, then sheets.json's. */
export function frameSheets() {
  const listed = JSON.parse(readSheet("apps/dashboard/src/styles/sheets.json")).sheets;
  return [
    "apps/dashboard/app/globals.css",
    ...listed.filter((s) => typeof s === "string").map((s) => `apps/dashboard/src/${s}`),
  ];
}

/** Where a page is drawn: a desk by default; a phone is `{ width: 390, pointer: "coarse", hover: "none" }`. */
const DESK = {
  width: 1440,
  height: 900,
  reducedMotion: false,
  reducedTransparency: false,
  colorScheme: "light",
  pointer: "fine",
  hover: "hover",
  displayMode: "browser",
  print: false,
  ios: false,
  unsupported: [],
};

/** A phone in a browser's tab, as the frame's phone rules are written for it. */
export const PHONE = { width: 390, height: 844, pointer: "coarse", hover: "none" };

/** One element, from the document down, each part a compound selector (or `{ sel, holds }` for `:has()`). */
export function element(...parts) {
  const specs = parts.map((p) => (typeof p === "string" ? { sel: p } : p));
  const first = parseSelector(specs[0].sel)[0];
  if (first?.tag !== "html") specs.unshift({ sel: "html" }, { sel: "body" });
  else if (specs.length > 1 && parseSelector(specs[1].sel)[0]?.tag !== "body") specs.splice(1, 0, { sel: "body" });
  let parent = null;
  for (const spec of specs) {
    const el = partOf(spec.sel, parent);
    el.holds = (spec.holds ?? []).map((h) => partOf(h, el));
    parent = el;
  }
  return parent;
}

function partOf(sel, parent) {
  const compounds = parseSelector(sel);
  if (compounds.length !== 1) throw new Error(`one part at a time: ${sel}`);
  const c = compounds[0];
  const attrs = Object.fromEntries(c.attrs.map((a) => [a.name, a.value ?? ""]));
  const states = new Set(c.pseudos.map((p) => (p.args === null ? p.name : `${p.name}(${squash(p.args)})`)));
  return {
    tag: c.tag && c.tag !== "*" ? c.tag : "div",
    id: c.ids[0] ?? null,
    classes: new Set(c.classes),
    attrs,
    states,
    pseudo: c.element,
    parent,
  };
}

/** A var() replaced by what `get` answers, its fallback where that is nothing; null when nothing stands for it. */
function substitute(value, get, seen = new Set()) {
  let out = value;
  for (let guard = 0; guard < 200; guard++) {
    const at = out.lastIndexOf("var(");
    if (at < 0) return out;
    let end = -1;
    walkTop(out.slice(at + 3), (c, k, depth) => {
      if (c === ")" && depth === 0) {
        end = at + 3 + k;
        return false;
      }
    });
    const inner = out.slice(at + 4, end);
    const comma = splitTop(inner, ",");
    const name = comma[0].trim();
    const fallback = inner.includes(",") ? inner.slice(inner.indexOf(",") + 1).trim() : null;
    const got = seen.has(name) ? null : get(name, seen);
    const put = got ?? fallback;
    if (put === null) return null;
    out = out.slice(0, at) + put + out.slice(end + 1);
  }
  throw new Error(`a var() that never settles: ${value}`);
}

/**
 * The cascade over `files` (repo-relative stylesheets, in the order a page links them, or `{ css }`), where a page is drawn (`ctx`,
 * over a desk: `{ ...PHONE, displayMode: "standalone" }`). `style(el)` answers each property the element is drawn with,
 * custom properties too; `rules(el)` the rules that reach it, in the cascade's order; `keyframes(name)` the frames an
 * animation of that name plays, as drawn there.
 */
export function cascadeOf(files, ctx = {}) {
  const where = { ...DESK, ...ctx };
  const sheet = { rules: [], keyframes: [] };
  // A sheet is a repo-relative file, or `{ css }`: a rule a test adds after the page's own, to change a token and see
  // who follows it.
  for (const file of files)
    if (typeof file === "string") rulesIn(readSheet(file), file, sheet);
    else rulesIn(file.css, file.name ?? "the test's own sheet", sheet);
  const drawn = (r) =>
    r.apart === null && r.media.every((q) => mediaHolds(q, where)) && r.supports.every((s) => supportsHolds(s, where));
  const live = sheet.rules.filter(drawn);
  const understood = (d) => !where.unsupported.some((u) => d.value.includes(u));

  const reaching = (el) =>
    live
      .map((r) => {
        const hits = r.selectors.filter((s) => complexMatches(el, s.compounds)).map((s) => specificityOf(s.compounds));
        return hits.length ? { rule: r, specificity: hits.sort(bySpecificity).at(-1) } : null;
      })
      .filter(Boolean)
      .sort((a, b) => bySpecificity(a.specificity, b.specificity) || a.rule.order - b.rule.order);

  const computed = new WeakMap();
  const style = (el) => {
    if (!el) return {};
    if (computed.has(el)) return computed.get(el);
    const parent = style(el.parent);
    // Each property's winner: normal declarations in order, then the important ones over them.
    const won = {};
    const hits = reaching(el);
    for (const important of [false, true])
      for (const { rule } of hits)
        for (const d of rule.declarations) if (d.important === important && understood(d)) won[d.prop] = d.value;
    const out = {};
    // Custom properties first, each read against the element's own (a cycle is nothing), inherited where unset.
    const own = (name, seen) => {
      if (Object.hasOwn(won, name)) {
        const raw = won[name];
        if (raw === "initial") return null;
        if (raw === "inherit" || raw === "unset") return parent[name] ?? null;
        return substitute(raw, own, new Set([...seen, name]));
      }
      return parent[name] ?? null;
    };
    for (const name of Object.keys(parent)) if (name.startsWith("--")) out[name] = parent[name];
    for (const name of Object.keys(won)) if (name.startsWith("--")) out[name] = own(name, new Set());
    const read = (name) => out[name] ?? null;
    for (const name of Object.keys(parent)) if (!name.startsWith("--") && INHERITED.has(name)) out[name] = parent[name];
    for (const [name, raw] of Object.entries(won)) {
      if (name.startsWith("--")) continue;
      const inherits = INHERITED.has(name);
      if (raw === "inherit" || (raw === "unset" && inherits)) out[name] = parent[name];
      else if (raw === "initial" || raw === "unset") delete out[name];
      else {
        const v = substitute(raw, read);
        // Invalid at computed-value time: as if unset.
        if (v === null) {
          if (inherits && parent[name] !== undefined) out[name] = parent[name];
          else delete out[name];
        } else out[name] = v;
      }
    }
    for (const k of Object.keys(out)) if (out[k] === null || out[k] === undefined) delete out[k];
    computed.set(el, out);
    return out;
  };

  return {
    style,
    rules: (el) =>
      reaching(el).map(({ rule, specificity }) => ({
        file: rule.file,
        selectors: rule.selectors.map((s) => s.text),
        specificity,
        declarations: rule.declarations,
      })),
    keyframes: (name) => {
      const found = sheet.keyframes.filter((k) => k.name === name && drawn(k));
      return found.at(-1)?.frames ?? null;
    },
    // Every rule the sheets hold, drawn here or not: what a sheet sets anywhere (a property of a family it never sets).
    every: () =>
      sheet.rules.map((r) => ({
        file: r.file,
        selectors: r.selectors.map((s) => s.text),
        declarations: r.declarations,
        media: r.media,
        supports: r.supports,
        apart: r.apart,
      })),
  };
}
