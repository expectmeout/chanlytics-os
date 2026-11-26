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
 * The sheets are read by lightningcss, the parser the dashboard's build compiles them with (the coordinator's call, 26
 * Nov 2026: the suite's one cascade, on the standard parser, never one of ours): its tree gives each rule's selectors,
 * its conditions and its declarations, each printed as the build prints it (`flex: 0 0 auto` is `none`), so a test
 * compares with `declared()`, which prints the same way, rather than with text it wrote. The cascade's own rules
 * (matching, specificity, order, inheritance, var()) are worked out here over that tree.
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

/* -- the build's parser -- */

/**
 * CSS as the build's parser reads it (lightningcss, the parser the dashboard's build compiles its stylesheets with): its
 * syntax tree. What it could not read whole throws, since a rule it dropped would be a rule this cascade never weighs.
 */
function parsedSheet(code, filename) {
  let tree = null;
  const { warnings } = transform({
    filename,
    code: Buffer.from(code),
    errorRecovery: true,
    visitor: {
      StyleSheet(s) {
        tree = s;
      },
    },
  });
  if (!tree || warnings.length > 0)
    throw new Error(`the cascade cannot read ${filename} whole:\n${warnings.map((w) => w.message).join("\n")}`);
  return tree;
}

/**
 * One declaration as the parser prints it alone (`grid-auto-columns: minmax(0, 1fr)`), so no two merge into a shorthand:
 * the value as the build writes it, which `declared()` prints the same way for a test to compare with. What the parser
 * hands out as null (a `var()`'s `from`, an absent fallback) it refuses back as null, so a null is left out.
 */
function printOne(parsed, important) {
  try {
    return printed(parsed, important, false);
  } catch (e) {
    // A whole number of 65536 or more is handed to the parser's printer as a 64-bit integer, which a field it keeps as a
    // 32-bit float refuses (`flex: 0 100000 auto`'s shrink). Handed over a hair off whole, the float rounds it back.
    if (!/expected a 32-bit floating point/.test(String(e?.message))) throw e;
    return printed(parsed, important, true);
  }
}

function printed(parsed, important, nudged) {
  const d = JSON.parse(
    JSON.stringify(parsed, (_, v) =>
      v === null ? undefined : nudged && Number.isInteger(v) && Math.abs(v) >= 65536 ? v + 2 ** -20 : v,
    ),
  );
  const { code } = transform({
    filename: "given.css",
    code: Buffer.from(""),
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
  const body = text
    .slice(text.indexOf("{") + 1, text.lastIndexOf("}"))
    .trim()
    .replace(/;$/, "");
  const colon = body.indexOf(":");
  const value = body
    .slice(colon + 1)
    .replace(/\s*!important$/, "")
    .trim();
  return [body.slice(0, colon).trim(), value];
}

/** The sides a typed box shorthand gives, each printed as its own longhand, so `margin-top` is read where it is written. */
const SIDES = {
  margin: ["margin-top", "margin-right", "margin-bottom", "margin-left"],
  padding: ["padding-top", "padding-right", "padding-bottom", "padding-left"],
  inset: ["top", "right", "bottom", "left"],
};
const SIDE_KEYS = ["top", "right", "bottom", "left"];

/** A block's declarations as the parser reads them, each `{ prop, value, important }`, a typed box shorthand's sides too. */
function declarationsIn(block) {
  const out = [];
  for (const [list, important] of [
    [block?.declarations ?? [], false],
    [block?.importantDeclarations ?? [], true],
  ]) {
    for (const d of list) {
      const [prop, value] = printOne(d, important);
      out.push({ prop, value, important });
      const sides = SIDES[d.property];
      if (sides && d.value && typeof d.value === "object" && "top" in d.value)
        sides.forEach((side, k) => {
          const [, sideValue] = printOne({ property: side, value: d.value[SIDE_KEYS[k]] }, important);
          out.push({ prop: side, value: sideValue, important });
        });
    }
  }
  return out;
}

/** One rule's body, read as a sheet's is (`flex: 0 0 auto; opacity: 1`), and printed as the cascade prints what it gives. */
export function declared(text) {
  const rule = parsedSheet(`.given { ${text} }`, "declared.css").rules[0];
  if (rule?.type !== "style") throw new Error(`not a rule's body: ${text}`);
  return Object.fromEntries(declarationsIn(rule.value.declarations).map((d) => [d.prop, d.value]));
}

/* -- selectors, as the parser reads them -- */

const COMBINATORS = { descendant: " ", child: ">", "next-sibling": "+", "later-sibling": "~" };
const OPERATORS = { equal: "=", includes: "~=", "dash-match": "|=", prefix: "^=", suffix: "$=", substring: "*=" };
const LISTS = new Set(["not", "is", "where", "has", "matches", "any"]);

/**
 * One selector of the parser's tree as its compounds, left to right, the subject last, each with the combinator that
 * joins it to the one before (none before the first). A relative selector (`:has(> x)`) is the parser's `:scope` and a
 * combinator: the scope is dropped and its combinator kept on the compound after it.
 */
function compoundsOf(components) {
  const compounds = [];
  let current = null;
  let combinator = null;
  const fresh = () => ({ tag: null, ids: [], classes: [], attrs: [], pseudos: [], element: null });
  const close = () => {
    if (current) compounds.push({ ...current, combinator });
    current = null;
  };
  for (const c of components) {
    if (c.type === "combinator") {
      if (!(c.value in COMBINATORS)) throw new Error(`a combinator this cascade does not model: ${c.value}`);
      const scopeOnly = current && current.pseudos.length === 1 && current.pseudos[0].name === "scope";
      if (scopeOnly && compounds.length === 0) current = null;
      else close();
      combinator = COMBINATORS[c.value];
      continue;
    }
    current ??= fresh();
    if (c.type === "type") current.tag = c.name.toLowerCase();
    else if (c.type === "universal") current.tag = "*";
    else if (c.type === "class") current.classes.push(c.name);
    else if (c.type === "id") current.ids.push(c.name);
    else if (c.type === "attribute") {
      const op = c.operation;
      if (op && !(op.operator in OPERATORS))
        throw new Error(`an attribute match this cascade does not model: ${op.operator}`);
      current.attrs.push({
        name: c.name,
        op: op ? OPERATORS[op.operator] : null,
        value: op ? op.value : null,
        fold: op?.caseSensitivity === "ascii-case-insensitive",
      });
    } else if (c.type === "pseudo-element") current.element = c.kind;
    else if (c.type === "pseudo-class") {
      if (LISTS.has(c.kind)) current.pseudos.push({ name: c.kind, args: null, list: c.selectors.map(compoundsOf) });
      else if (c.kind === "nth-child" || c.kind === "nth-of-type" || c.kind === "nth-last-child") {
        if (c.of) throw new Error(`:${c.kind}(… of …) is not modelled by this cascade`);
        current.pseudos.push({ name: c.kind, args: `${c.a}n+${c.b}`, list: null });
      } else if (c.kind === "lang" || c.kind === "dir") {
        current.pseudos.push({ name: c.kind, args: [].concat(c.languages ?? c.direction).join(","), list: null });
      } else current.pseudos.push({ name: c.kind, args: null, list: null });
    } else if (c.type === "nesting") throw new Error("a nested selector (&) is not modelled by this cascade");
    else throw new Error(`a selector part this cascade cannot read: ${JSON.stringify(c)}`);
  }
  close();
  return compounds;
}

/** A selector's compounds written back as text: what `rules()` names a rule by. */
function selectorText(compounds) {
  const one = (c) =>
    (c.tag && (c.tag !== "*" || !(c.ids.length || c.classes.length || c.attrs.length || c.pseudos.length))
      ? c.tag
      : "") +
    c.ids.map((i) => `#${i}`).join("") +
    c.classes.map((k) => `.${k}`).join("") +
    c.attrs.map((a) => `[${a.name}${a.op ? `${a.op}"${a.value}"${a.fold ? " i" : ""}` : ""}]`).join("") +
    c.pseudos
      .map((p) => `:${p.name}${p.list ? `(${p.list.map(selectorText).join(", ")})` : p.args ? `(${p.args})` : ""}`)
      .join("") +
    (c.element ? `::${c.element}` : "");
  return compounds
    .map(
      (c, k) =>
        (k === 0
          ? c.combinator && c.combinator !== " "
            ? `${c.combinator} `
            : ""
          : c.combinator === " "
            ? " "
            : ` ${c.combinator} `) + one(c),
    )
    .join("");
}

/** A selector a test writes (an element's part), read by the parser: one complex selector's compounds. */
function selectorOf(text) {
  const rule = parsedSheet(`${text} {}`, "selector.css").rules[0];
  if (rule?.type !== "style" || rule.value.selectors.length !== 1) throw new Error(`not one selector: ${text}`);
  return compoundsOf(rule.value.selectors[0]);
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
      const state = p.args === null ? p.name : `${p.name}(${p.args})`;
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

/* -- media and supports, as the parser reads them -- */

/** A length in a media query, in CSS pixels (an em or a rem is 16px); any other unit throws. */
function pxIn(value, where) {
  const v = value?.type === "length" ? value.value : null;
  const d = v?.type === "value" ? v.value : null;
  if (d && (d.unit === "px" || d.unit === "em" || d.unit === "rem")) return d.value * (d.unit === "px" ? 1 : 16);
  throw new Error(`a length this cascade cannot weigh: ${JSON.stringify(value)} (${where})`);
}

const COMPARE = {
  "less-than": (a, b) => a < b,
  "less-than-equal": (a, b) => a <= b,
  equal: (a, b) => a === b,
  "greater-than": (a, b) => a > b,
  "greater-than-equal": (a, b) => a >= b,
};

/** The screen's size a range asks of: its width, its height, or its aspect ratio. */
function sizeOf(name, ctx, value, where) {
  // A phone's browser fills its screen: the device's size is the viewport's unless the page says otherwise.
  if (name === "width") return [ctx.width, pxIn(value, where)];
  if (name === "height") return [ctx.height, pxIn(value, where)];
  if (name === "device-width") return [ctx.deviceWidth ?? ctx.width, pxIn(value, where)];
  if (name === "device-height") return [ctx.deviceHeight ?? ctx.height, pxIn(value, where)];
  if (name === "aspect-ratio") {
    const r = value?.type === "ratio" ? value.value : null;
    if (!r) throw new Error(`an aspect ratio this cascade cannot read (${where})`);
    return [ctx.width / ctx.height, r[0] / r[1]];
  }
  throw new Error(`a media range this cascade does not model: (${name}) (${where})`);
}

/** Whether one media feature holds where the page is drawn. One it does not model throws: no check passes on a guess. */
function featureHolds(f, ctx, where) {
  if (f.type === "range") {
    const [size, bound] = sizeOf(f.name, ctx, f.value, where);
    return COMPARE[f.operator](size, bound);
  }
  if (f.type === "interval") {
    const [size, start] = sizeOf(f.name, ctx, f.start, where);
    const [, end] = sizeOf(f.name, ctx, f.end, where);
    return COMPARE[f.startOperator](start, size) && COMPARE[f.endOperator](size, end);
  }
  const v = f.type === "plain" ? (f.value?.type === "ident" ? f.value.value : null) : undefined;
  switch (f.name) {
    case "prefers-reduced-motion":
      return v === undefined ? ctx.reducedMotion : (v === "reduce") === ctx.reducedMotion;
    case "prefers-reduced-transparency":
      return v === undefined ? ctx.reducedTransparency : (v === "reduce") === ctx.reducedTransparency;
    case "prefers-color-scheme":
      return v === ctx.colorScheme;
    case "pointer":
      return v === undefined ? ctx.pointer !== "none" : v === ctx.pointer;
    case "hover":
      return v === undefined ? ctx.hover === "hover" : v === ctx.hover;
    case "display-mode":
      return v === ctx.displayMode;
    case "orientation":
      return v === (ctx.width >= ctx.height ? "landscape" : "portrait");
    default:
      throw new Error(`a media feature this cascade does not model: (${f.name}) (${where})`);
  }
}

function conditionHolds(c, ctx, where) {
  if (!c) return true;
  if (c.type === "feature") return featureHolds(c.value, ctx, where);
  if (c.type === "not") return !conditionHolds(c.value, ctx, where);
  if (c.type === "operation") {
    // Asked in order, and no further than the answer: a browser never weighs the rest of an `and` once one part fails.
    const holds = (x) => conditionHolds(x, ctx, where);
    return c.operator === "and" ? c.conditions.every(holds) : c.conditions.some(holds);
  }
  throw new Error(`a media condition this cascade cannot read: ${c.type} (${where})`);
}

/** Whether a media query list holds where the page is drawn: any one of its queries, by its type and its condition. */
function mediaHolds(query, ctx, where) {
  return query.mediaQueries.some((q) => {
    const type = q.mediaType === "all" || q.mediaType === "screen" ? true : q.mediaType === "print" ? ctx.print : false;
    const holds = type && conditionHolds(q.condition, ctx, where);
    return q.qualifier === "not" ? !holds : holds;
  });
}

/**
 * Whether a supports condition holds: a declaration is supported unless where the page is drawn says its value is not
 * (`unsupported: ["dvh"]`); only an iPhone's browsers say -webkit-touch-callout.
 */
function supportsHolds(c, ctx) {
  switch (c.type) {
    case "not":
      return !supportsHolds(c.value, ctx);
    case "and":
      return c.value.every((x) => supportsHolds(x, ctx));
    case "or":
      return c.value.some((x) => supportsHolds(x, ctx));
    case "declaration": {
      const property = c.propertyId?.property ?? "";
      if (property === "-webkit-touch-callout" || property === "touch-callout") return ctx.ios;
      const said = `${property}: ${c.value}`;
      return !ctx.unsupported.some((u) => said.includes(u));
    }
    case "selector":
      return true;
    default:
      throw new Error(`a supports condition this cascade cannot read: ${c.type}`);
  }
}

/* -- the sheets -- */

const sheetTrees = new Map();

/** A repo-relative stylesheet's syntax tree, read once a process. */
function treeOf(file) {
  if (!sheetTrees.has(file)) sheetTrees.set(file, parsedSheet(fs.readFileSync(path.join(ROOT, file), "utf8"), file));
  return sheetTrees.get(file);
}

/** A keyframe's key as a sheet writes it: `from`, `to`, or a percentage. */
const keyOf = (s) => (s.type === "percentage" ? `${Math.round(s.value * 1000) / 10}%` : s.type);

/** A stylesheet's rules in the order they are written, each with the conditions it is drawn under. */
function rulesIn(rules, file, into, outer = { media: [], supports: [], apart: null }) {
  for (const r of rules) {
    const v = r.value;
    const where = `${file}:${(v?.loc?.line ?? 0) + 1}`;
    switch (r.type) {
      case "style":
        if (v.rules?.length) throw new Error(`a nested rule is not modelled by this cascade (${where})`);
        into.rules.push({
          file,
          selectors: v.selectors.map((s) => {
            const compounds = compoundsOf(s);
            return { text: selectorText(compounds), compounds };
          }),
          declarations: declarationsIn(v.declarations),
          ...outer,
          order: into.rules.length,
        });
        break;
      case "media":
        rulesIn(v.rules, file, into, { ...outer, media: [...outer.media, { query: v.query, where }] });
        break;
      case "supports":
        rulesIn(v.rules, file, into, { ...outer, supports: [...outer.supports, v.condition] });
        break;
      case "container":
      case "starting-style":
        rulesIn(v.rules, file, into, { ...outer, apart: `@${r.type} (${where})` });
        break;
      case "import": {
        const target = path.posix.join(path.posix.dirname(file), v.url);
        rulesIn(treeOf(target).rules, target, into, outer);
        break;
      }
      case "keyframes": {
        const frames = {};
        for (const k of v.keyframes)
          for (const s of k.selectors)
            frames[keyOf(s)] = {
              ...frames[keyOf(s)],
              ...Object.fromEntries(declarationsIn(k.declarations).map((d) => [d.prop, d.value])),
            };
        into.keyframes.push({ name: v.name.value, frames, ...outer, order: into.keyframes.length });
        break;
      }
      case "layer-block":
      case "layer-statement":
        throw new Error(`@layer is not modelled by this cascade (${where})`);
      default:
      // @font-face, @property, @page, @namespace and the rest draw no element.
    }
  }
}

/** The stylesheets every page of the frame links, in the cascade's order: the root layout's globals, then sheets.json's. */
export function frameSheets() {
  const listed = JSON.parse(fs.readFileSync(path.join(ROOT, "apps/dashboard/src/styles/sheets.json"), "utf8")).sheets;
  return [
    "apps/dashboard/app/globals.css",
    ...listed.filter((s) => typeof s === "string").map((s) => `apps/dashboard/src/${s}`),
  ];
}

/**
 * Where a page is drawn: a desk by default, at the width e2e/ opens the pages at; any other place is asked as a change to
 * it (`{ ...DESK, width: 800 }`, `{ reducedMotion: true }`), and a phone is PHONE.
 */
export const DESK = Object.freeze({
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
});

/** A phone in a browser's tab, as the frame's phone rules are written for it. */
export const PHONE = { width: 390, height: 844, pointer: "coarse", hover: "none" };

/** One element, from the document down, each part a compound selector (or `{ sel, holds }` for `:has()`). */
export function element(...parts) {
  const specs = parts.map((p) => (typeof p === "string" ? { sel: p } : p));
  const first = selectorOf(specs[0].sel)[0];
  if (first?.tag !== "html") specs.unshift({ sel: "html" }, { sel: "body" });
  else if (specs.length > 1 && selectorOf(specs[1].sel)[0]?.tag !== "body") specs.splice(1, 0, { sel: "body" });
  let parent = null;
  for (const spec of specs) {
    const el = partOf(spec.sel, parent);
    el.holds = (spec.holds ?? []).map((h) => partOf(h, el));
    parent = el;
  }
  return parent;
}

function partOf(sel, parent) {
  const compounds = selectorOf(sel);
  if (compounds.length !== 1) throw new Error(`one part at a time: ${sel}`);
  const c = compounds[0];
  const attrs = Object.fromEntries(c.attrs.map((a) => [a.name, a.value ?? ""]));
  const states = new Set(c.pseudos.map((p) => (p.args === null ? p.name : `${p.name}(${p.args})`)));
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

/** Where a bracket opened at `open` closes, in a value as the parser prints it; -1 when it never does. */
function closing(text, open) {
  let depth = 0;
  for (let i = open; i < text.length; i++) {
    if (text[i] === "(") depth++;
    else if (text[i] === ")" && --depth === 0) return i;
  }
  return -1;
}

/** A var() replaced by what `get` answers, its fallback where that is nothing; null when nothing stands for it. */
function substitute(value, get, seen = new Set()) {
  let out = value;
  for (let guard = 0; guard < 200; guard++) {
    const at = out.lastIndexOf("var(");
    if (at < 0) return out;
    const end = closing(out, at + 3);
    if (end < 0) throw new Error(`a var() that never closes: ${value}`);
    const inner = out.slice(at + 4, end);
    const comma = inner.indexOf(",");
    const name = (comma < 0 ? inner : inner.slice(0, comma)).trim();
    const fallback = comma < 0 ? null : inner.slice(comma + 1).trim();
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
 * custom properties too; `given(el)` each property's winning declaration as written, before var() and inheritance;
 * `rules(el)` the rules that reach it, in the cascade's order; `keyframes(name)` the frames an
 * animation of that name plays, as drawn there.
 */
export function cascadeOf(files, ctx = {}) {
  const where = { ...DESK, ...ctx };
  const sheet = { rules: [], keyframes: [] };
  // A sheet is a repo-relative file, or `{ css }`: a rule a test adds after the page's own, to change a token and see
  // who follows it.
  for (const file of files)
    if (typeof file === "string") rulesIn(treeOf(file).rules, file, sheet);
    else {
      const name = file.name ?? "the test's own sheet";
      rulesIn(parsedSheet(file.css, name).rules, name, sheet);
    }
  const drawn = (r) =>
    r.apart === null &&
    r.media.every((m) => mediaHolds(m.query, where, m.where)) &&
    r.supports.every((c) => supportsHolds(c, where));
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

  /** Each property's winner, as written: normal declarations in order, then the important ones over them. */
  const given = (el) => {
    const won = {};
    const hits = reaching(el);
    for (const important of [false, true])
      for (const { rule } of hits)
        for (const d of rule.declarations) if (d.important === important && understood(d)) won[d.prop] = d.value;
    return won;
  };

  const computed = new WeakMap();
  const style = (el) => {
    if (!el) return {};
    if (computed.has(el)) return computed.get(el);
    const parent = style(el.parent);
    const won = given(el);
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
    // What the element is given, before any var() is read or anything inherited: each property's winning declaration as
    // the build prints it, for a check that asks what a sheet says of an element (`declared()` prints the same way).
    given: (el) => (el ? given(el) : {}),
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
