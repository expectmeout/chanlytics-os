/**
 * The kit's components (apps/dashboard/src/surfaces/kit/), drawn on the stub React the page tests use
 * (_legacy-react.mjs), as decision 0015 tests a surface that has left the shell, and imported through the kit's index,
 * as a surface imports them. Each is held to its family in the gallery (tooling/scripts/e2e-harness/kit-gallery.mjs):
 * every kit entry of the family is drawn by the component, and what the component draws for an entry has the entry's
 * skeleton: each element's tag, its classes, the attributes a stylesheet or a screen reader reads (READ, below) and the
 * elements it holds, in order. So the gallery cannot drift from the components: a class, an attribute or an element
 * changed on either side alone is red here, and so is an entry added to a family with no drawing of it, or a drawing of
 * an entry the family no longer has. What the skeleton leaves out, the words and the other attributes, each
 * component's own test holds where it matters: the attributes its element carries and no others, the ref, the page's
 * class last, a face's picture and its fallback, a meter's shares, a row's lines.
 *
 * The Sheet's family is not held: its component comes with the kit's other components with behaviour of their own,
 * built on Base UI (the plan's decision 15 and step 2.5). A family whose component is the house's JSX today is written
 * in TSX when its first surface moves (the plan's Phase 3), and joins this file then.
 *
 * Each check runs on fixtures too, where it must find what it looks for.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { FAMILIES } from "../../e2e-harness/kit-gallery.mjs";
import { fresh, installLegacyReact } from "../_legacy-react.mjs";
import {
  Button,
  Face,
  LinkButton,
  ListRow,
  Meter,
  Panel,
  cx,
} from "../../../../apps/dashboard/src/surfaces/kit/index.ts";

installLegacyReact();

/** An element, as the kit's JSX makes one on the stub: `h(Button, { variant: "primary" }, "Save")`. */
const h = (type, props, ...children) => globalThis.React.createElement(type, props, ...children);

/* ---- the skeleton: each element's tag, its classes, the attributes read, and the elements it holds ---- */

/**
 * The attributes a stylesheet or a screen reader reads, which the skeleton holds, each spelled one way whichever side
 * wrote it: for those in PRESENT, that the element has it; for the others, its value; a style as its declarations,
 * each property with its value, in order of property. The rest (a picture's address, a tip's words, a test id) are
 * words, which the skeleton leaves to each component's own test.
 */
const READ = ["type", "disabled", "hidden", "href", "role", "aria-hidden", "aria-label", "aria-disabled", "data-gated"];
const PRESENT = new Set(["disabled", "hidden", "href", "aria-label", "data-gated"]);
const VALUED = [...READ, "alt"];

/** A style's declarations, spelled `property:value` and sorted: from a style attribute's text. */
const declarationsOfText = (text) =>
  text
    .split(";")
    .map((d) => d.split(/:(.*)/s).map((part) => part?.trim() ?? ""))
    .filter(([property, value]) => property && value)
    .map(([property, value]) => `${property.toLowerCase()}:${value}`)
    .sort();

/** The properties React writes a number into as it is; any other number takes px, as React writes it. */
const UNITLESS = new Set([
  "flex",
  "flex-grow",
  "flex-shrink",
  "opacity",
  "order",
  "z-index",
  "font-weight",
  "line-height",
]);
/** A style's declarations, spelled as above: from a style prop, as React writes it into the attribute. */
const declarationsOfProp = (style) =>
  Object.entries(style ?? {})
    .filter(([, value]) => value !== undefined && value !== null && value !== false && value !== "")
    .map(([key, value]) => {
      const property = key.replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`);
      return `${property}:${typeof value === "number" && !UNITLESS.has(property) ? `${value}px` : value}`;
    })
    .sort();

/** The attributes read, spelled: `has(name)` says whether the element carries it, `value(name)` its value. */
function spelledAttributes(has, value, declarations) {
  const out = [];
  for (const name of VALUED) {
    if (!has(name)) continue;
    out.push(PRESENT.has(name) ? name : `${name}=${value(name)}`);
  }
  if (declarations.length > 0) out.push(`style=${declarations.join(";")}`);
  return out.sort();
}

/** A class attribute's names, as a set: their order draws nothing. */
const classSet = (value) =>
  [
    ...new Set(
      String(value ?? "")
        .split(/\s+/)
        .filter(Boolean),
    ),
  ].sort();

/**
 * The elements a component draws, of a list of elements: the gallery's own layout (an element whose classes are all
 * gx-*) gives way to what it holds, and a glyph (an <svg>, the Icon's) is drawn without its attributes and its paths,
 * which are the Icon's and not the kit's.
 */
const settle = (nodes) =>
  nodes.flatMap((n) =>
    n.classes.length > 0 && n.classes.every((c) => c.startsWith("gx-"))
      ? settle(n.children)
      : [n.tag === "svg" ? { ...n, attributes: [], children: [] } : { ...n, children: settle(n.children) }],
  );

/** Elements that hold nothing, and so close themselves. */
const VOID = new Set(["img", "input", "br", "hr", "wbr", "source"]);
/** A tag, opening or closing, with its attributes: each a name alone, or a name and a value in double quotes. */
const TAG = /<(\/?)([a-zA-Z][a-zA-Z0-9-]*)((?:\s+[^\s"'=<>/]+(?:="[^"]*")?)*)\s*(\/?)>/g;
/** One attribute of a tag: its name, and its value, which a name alone does not have. */
const ATTRIBUTE = /\s([^\s"'=<>/]+)(?:="([^"]*)")?/g;

/** The skeleton of an entry's markup, which the gallery writes whole: every element it opens, it closes. */
function markupSkeleton(html) {
  const top = { tag: "#top", classes: [], attributes: [], children: [] };
  const open = [top];
  for (const [, closing, name, source, closed] of html.matchAll(TAG)) {
    const tag = name.toLowerCase();
    if (closing) {
      if (open.at(-1).tag !== tag) throw new Error(`</${tag}> closes <${open.at(-1).tag}>`);
      open.pop();
      continue;
    }
    const attributes = new Map([...source.matchAll(ATTRIBUTE)].map(([, n, v]) => [n.toLowerCase(), v ?? ""]));
    const node = {
      tag,
      classes: classSet(attributes.get("class")),
      attributes: spelledAttributes(
        (n) => attributes.has(n),
        (n) => attributes.get(n),
        declarationsOfText(attributes.get("style") ?? ""),
      ),
      children: [],
    };
    open.at(-1).children.push(node);
    if (!closed && !VOID.has(tag)) open.push(node);
  }
  if (open.length > 1) throw new Error(`<${open.at(-1).tag}> is never closed`);
  return settle(top.children);
}

/** Whether React writes a prop as an attribute: a boolean one only when true, any other when it has a value. */
const written = (props, name) => {
  const v = props[name];
  if (v === undefined || v === null) return false;
  return !["disabled", "hidden"].includes(name) || v === true;
};

/** The skeleton of what the stub drew: a component is what it rendered, and a fragment what it holds. */
function drawnSkeleton(node) {
  if (Array.isArray(node)) return node.flatMap(drawnSkeleton);
  if (node === null || typeof node !== "object") return [];
  if (typeof node.type === "function") return drawnSkeleton(node.rendered);
  if (node.type === "Fragment") return drawnSkeleton(node.props.children);
  const props = node.props;
  return [
    {
      tag: node.type,
      classes: classSet(props.className),
      attributes: spelledAttributes(
        (n) => written(props, n),
        (n) => String(props[n]),
        declarationsOfProp(props.style),
      ),
      children: drawnSkeleton(props.children),
    },
  ];
}

/** A skeleton in words, for a failure to show: `div.list-row(span.face.list-row-face[aria-hidden=true] …)`. */
const spell = (nodes) =>
  nodes
    .map(
      (n) =>
        `${n.tag}${n.classes.map((c) => `.${c}`).join("")}` +
        `${n.attributes.length > 0 ? `[${n.attributes.join(" ")}]` : ""}` +
        `${n.children.length > 0 ? `(${spell(n.children)})` : ""}`,
    )
    .join(" ");

/**
 * Where a family of the gallery and a component's drawings part: an entry of the family that nothing draws, a drawing
 * of an entry the family lacks, and an entry drawn otherwise, with both skeletons. `drawings` maps each kit entry's id
 * to a function that draws it, so each is drawn afresh; a source entry is a page's, which no component draws.
 */
function parting(families, family, drawings) {
  const entries = (families.find((f) => f.family === family)?.entries ?? []).filter((e) => !e.source);
  const ids = entries.map((e) => e.id);
  const apart = [];
  for (const entry of entries.filter((e) => Object.hasOwn(drawings, e.id))) {
    fresh();
    const gallery = spell(markupSkeleton(entry.html));
    const drawn = spell(settle(drawnSkeleton(drawings[entry.id]())));
    if (gallery !== drawn) apart.push(`${entry.id}: the gallery draws ${gallery}, the component ${drawn}`);
  }
  return {
    undrawn: ids.filter((id) => !Object.hasOwn(drawings, id)),
    unknown: Object.keys(drawings).filter((id) => !ids.includes(id)),
    apart,
  };
}
const HELD = { undrawn: [], unknown: [], apart: [] };

/** The element a component drew, as the stub holds it: its tag, and its props. */
function drawn(element) {
  fresh();
  let node = element;
  while (typeof node.type === "function") node = node.rendered;
  return node;
}
/**
 * The props an element was given, which React writes as its attributes or keeps for itself (a key, a ref): all but its
 * children, which the stub gives every element.
 */
const keysOf = (node) =>
  Object.keys(node.props)
    .filter((k) => k !== "children")
    .sort();

/** A glyph, as the Icon draws one: an <svg class="icon">. */
const glyph = () => h("svg", { className: "icon" });
const ref = () => ({ current: null });
const onClick = () => undefined;
/** A made-up picture, drawn inline, so nothing is asked for. */
const PHOTO = "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 32 32'/%3E";

test("a skeleton is each element's tag, classes, the attributes read and what it holds, spelled one way from the markup and from the stub", () => {
  assert.equal(
    spell(
      markupSkeleton(
        `<div class="gx-row"><span class="face" aria-hidden="true">AR</span> ` +
          `<span class="face face-glyph"><svg class="icon" width="12" aria-hidden="true"><path d="M3 8h10"/></svg></span></div>`,
      ),
    ),
    "span.face[aria-hidden=true] span.face.face-glyph(svg.icon)",
    "the gallery's layout gives way to what it holds, and a glyph is the Icon's, drawn whole",
  );
  assert.equal(
    spell(
      markupSkeleton(`<button type="button" class="btn btn-sm btn-primary" disabled data-tip="Soon">Save</button>`),
    ),
    "button.btn.btn-primary.btn-sm[disabled type=button]",
    "the classes in any order; a name alone is present; a tip's words are not read",
  );
  assert.equal(
    spell(markupSkeleton(`<span class="face">AR<img class="face-photo" src="${PHOTO}" alt=""></span>`)),
    "span.face(img.face-photo[alt=])",
    "an image holds nothing, and a value in quotes may hold what a tag does not",
  );
  assert.equal(
    spell(
      markupSkeleton(
        `<div class="meter" role="img" aria-label="12 by text"><span style="flex-grow: 12; background: var(--x)"></span></div>`,
      ),
    ),
    "div.meter[aria-label role=img](span[style=background:var(--x);flex-grow:12])",
    "a label is present, a role its value, and a style its declarations in order",
  );
  assert.throws(() => markupSkeleton(`<div class="panel"><p>Hours</div>`), /<\/div> closes <p>/);
  assert.throws(() => markupSkeleton(`<section class="panel">Hours`), /<section> is never closed/);
  // The stub's tree, spelled alike: a component is what it drew, a fragment what it holds, and a prop what React
  // writes of it: a boolean attribute only when true, a style's numbers as React spells them.
  const Name = () =>
    h(
      "Fragment",
      null,
      h("div", { className: "list-row-name", "aria-hidden": true, hidden: false, "data-testid": "row" }, "Aisha"),
      h("svg", { className: "icon", "aria-hidden": "true" }, h("path")),
    );
  fresh();
  assert.equal(
    spell(settle(drawnSkeleton([h(Name), "words", null, false]))),
    "div.list-row-name[aria-hidden=true] svg.icon",
  );
  fresh();
  assert.equal(
    spell(
      drawnSkeleton(
        h("button", { type: "button", disabled: true, style: { flexGrow: 12, width: 5, color: undefined } }),
      ),
    ),
    "button[disabled style=flex-grow:12;width:5px type=button]",
  );
});

test("a family and a component part where either changes alone, where an entry has no drawing, and where a drawing has no entry", () => {
  const family = (entries) => [{ family: "Fixture", about: "", entries }];
  const save = { id: "btn-primary", html: `<button type="button" class="btn btn-primary">Save</button>` };
  const source = { id: "src-save", source: "styles/components.css:427", html: `<button class="save">Save</button>` };
  const drawings = { "btn-primary": () => h(Button, { variant: "primary" }, "Save") };
  assert.deepEqual(parting(family([save, source]), "Fixture", drawings), HELD, "a source is a page's, no component's");
  const apart = (entry, draw) => parting(family([entry]), "Fixture", { "btn-primary": draw }).apart;
  assert.deepEqual(
    apart({ ...save, html: save.html.replace("btn-primary", "btn-ghost") }, drawings["btn-primary"]),
    [
      "btn-primary: the gallery draws button.btn.btn-ghost[type=button], the component button.btn.btn-primary[type=button]",
    ],
    "a class of the gallery's changed alone",
  );
  assert.deepEqual(
    apart(save, () => h(Button, { variant: "danger" }, "Save")),
    [
      "btn-primary: the gallery draws button.btn.btn-primary[type=button], the component button.btn.btn-danger[type=button]",
    ],
    "a class of the component's changed alone",
  );
  assert.deepEqual(
    apart({ ...save, html: save.html.replace('type="button"', 'type="button" disabled') }, drawings["btn-primary"]),
    [
      "btn-primary: the gallery draws button.btn.btn-primary[disabled type=button], the component button.btn.btn-primary[type=button]",
    ],
    "an attribute of the gallery's changed alone",
  );
  assert.deepEqual(
    apart(save, () => h(Button, { variant: "primary", "aria-disabled": "true" }, "Save")),
    [
      "btn-primary: the gallery draws button.btn.btn-primary[type=button], the component button.btn.btn-primary[aria-disabled=true type=button]",
    ],
    "an attribute of the component's changed alone",
  );
  assert.deepEqual(
    apart(save, () => h(Button, { variant: "primary" }, glyph(), "Save")),
    [
      "btn-primary: the gallery draws button.btn.btn-primary[type=button], the component button.btn.btn-primary[type=button](svg.icon)",
    ],
    "an element on one side alone",
  );
  const retry = { id: "btn-sm", html: `<button type="button" class="btn btn-sm">Retry</button>` };
  assert.deepEqual(parting(family([save, retry]), "Fixture", drawings).undrawn, ["btn-sm"], "an entry with no drawing");
  assert.deepEqual(
    parting(family([save]), "Fixture", { ...drawings, "btn-lg": () => h(Button, null, "Save") }).unknown,
    ["btn-lg"],
    "a drawing of an entry the family lacks",
  );
  assert.deepEqual(parting(family([save]), "Another", drawings).unknown, ["btn-primary"], "a family the gallery lacks");
});

/* ---- the components ---- */

/** What a role's gate puts on a control it refuses (data-bits gatedProps), as the gallery draws it. */
const gated = (why) => ({ "data-gated": "", "aria-disabled": "true", "aria-description": why, "data-tip": why });

/** The gallery's Button family, entry by entry, as a surface draws it with the kit's Button. */
const BUTTONS = {
  btn: () => [h(Button, null, "Export"), h(Button, null, glyph(), "Add a person")],
  "btn-primary": () => h(Button, { variant: "primary" }, glyph(), "Save"),
  "btn-ghost": () => h(Button, { variant: "quiet" }, "Cancel"),
  "btn-danger": () => h(Button, { variant: "danger" }, glyph(), "Yes, delete"),
  "btn-danger-quiet": () => h(Button, { tone: "danger" }, "Delete…"),
  "btn-sm": () => [
    h(Button, { size: "sm" }, "Retry"),
    h(Button, { size: "sm", variant: "primary" }, "Save"),
    h(Button, { size: "sm", variant: "quiet" }, "Cancel"),
  ],
  "btn-icon": () => [
    h(Button, { iconOnly: true, "aria-label": "More" }, glyph()),
    h(Button, { iconOnly: true, size: "sm", "aria-label": "Close" }, glyph()),
  ],
  "btn-link": () => h(Button, { href: "#kit" }, glyph(), "Download the QR code"),
  "btn-disabled": () => [
    h(Button, { disabled: true }, "Export"),
    h(Button, { variant: "primary", disabled: true }, "Save"),
    h(Button, { variant: "quiet", disabled: true }, "Cancel"),
    h(Button, { size: "sm", variant: "danger", disabled: true }, "Yes, delete"),
  ],
  "btn-gated": () => [
    h(Button, gated("Only an owner can export."), "Export"),
    h(Button, { variant: "primary", ...gated("Only an owner can save this.") }, "Save"),
    h(Button, { variant: "quiet", ...gated("Only an owner can pause it.") }, "Pause"),
  ],
};

test("Button draws the gallery's Button family, an act as a button of type button and a door as a link", () => {
  assert.deepEqual(parting(FAMILIES, "Button", BUTTONS), HELD);
  const hold = ref();
  const act = drawn(
    h(Button, { variant: "primary", tone: undefined, className: "pl-act", ref: hold, onClick }, "Save"),
  );
  assert.equal(act.type, "button");
  assert.equal(act.props.type, "button", "a button submits a form only when it is asked to");
  assert.equal(act.props.className, "btn btn-primary pl-act", "the page's layout class comes last");
  assert.equal(act.props.ref, hold, "the ref reaches the element");
  assert.equal(act.props.onClick, onClick);
  assert.deepEqual(keysOf(act), ["className", "onClick", "ref", "type"], "the kit's props stay off it");
  assert.equal(drawn(h(Button, { type: "submit" }, "Send")).props.type, "submit");
  const door = drawn(h(Button, { href: "/w/studio/#/clients", size: "sm", ref: hold }, "Open People"));
  assert.equal(door.type, "a", "a door is a link");
  assert.equal(door.props.className, "btn btn-sm");
  assert.deepEqual(keysOf(door), ["className", "href", "ref"], "a link takes no button's type");
  const more = drawn(h(Button, { iconOnly: true, "aria-label": "More" }, glyph()));
  assert.equal(more.props.className, "btn btn-icon");
  assert.deepEqual(keysOf(more), ["aria-label", "className", "type"], "a glyph alone says its name");
});

/** The gallery's Link button family, entry by entry. */
const LINK_BUTTONS = {
  "link-btn": () => h(LinkButton, null, "Write one", glyph()),
  "link-btn-danger": () => h(LinkButton, { tone: "danger" }, "Delete the list"),
  "link-btn-door": () => h(LinkButton, { href: "#kit" }, "Open the listing", glyph()),
};

test("LinkButton draws the gallery's Link button family: quiet words that act as a button of type button, and a door as a link", () => {
  assert.deepEqual(parting(FAMILIES, "Link button", LINK_BUTTONS), HELD);
  const hold = ref();
  const words = drawn(h(LinkButton, { tone: "danger", className: "pl-end", ref: hold, onClick }, "Delete the list"));
  assert.equal(words.type, "button");
  assert.equal(words.props.type, "button", "it submits a form only when it is asked to");
  assert.equal(words.props.className, "link-btn link-btn-danger pl-end", "the page's layout class comes last");
  assert.equal(words.props.ref, hold);
  assert.deepEqual(keysOf(words), ["className", "onClick", "ref", "type"], "its tone is a class");
  assert.equal(drawn(h(LinkButton, { type: "submit" }, "Send")).props.type, "submit");
  const door = drawn(h(LinkButton, { href: "https://example.com/listing", target: "_blank", ref: hold }, "Open"));
  assert.equal(door.type, "a", "a door is a link");
  assert.equal(door.props.className, "link-btn");
  assert.deepEqual(keysOf(door), ["className", "href", "ref", "target"]);
});

/** Rows edge to edge, as the gallery's flush panels hold them: its own layout, which the skeleton leaves out. */
const paneRows = () =>
  ["Consultation", "Follow-up visit", "Full treatment"].map((name) => h("div", { className: "gx-panel-row" }, name));

/** The gallery's Panel family, entry by entry. */
const PANELS = {
  panel: () => h(Panel, { as: "section" }, h("h3", null, "Hours"), h("p", null, "Open today until six.")),
  "panel-flush": () => h(Panel, { as: "section", size: "flush" }, ...paneRows()),
  "panel-inset": () => h(Panel, { variant: "inset", size: "sm" }, "Their conversations and notes go with them."),
  "panel-pop": () => h(Panel, { variant: "pop", size: "sm" }, "Your hours come from Google once it is linked."),
  "panel-pop-flush": () => h(Panel, { as: "section", variant: "pop", size: "flush" }, ...paneRows()),
};

test("Panel draws the gallery's Panel family, on the element its content is: a div unless it is another", () => {
  assert.deepEqual(parting(FAMILIES, "Panel", PANELS), HELD);
  const hold = ref();
  const pane = drawn(h(Panel, { className: "set-card", ref: hold }, "Hours"));
  assert.equal(pane.type, "div");
  assert.equal(pane.props.className, "panel set-card", "the page's layout class comes last");
  assert.equal(pane.props.ref, hold);
  assert.deepEqual(keysOf(pane), ["className", "ref"], "its look and its element are not its attributes");
  for (const as of ["section", "article", "aside", "ul", "ol", "li"]) {
    const on = drawn(h(Panel, { as, variant: "pop", size: "flush", ref: hold }, "Three services"));
    assert.equal(on.type, as);
    assert.equal(on.props.className, "panel panel-pop panel-flush");
    assert.deepEqual(keysOf(on), ["className", "ref"], as);
  }
});

/** The gallery's Face family, entry by entry: the faces, then their twins at a phone's width. */
const FACES = {
  face: () => [h(Face, { initials: "AR" }), h(Face, { initials: "SO" })],
  "face-glyph": () => h(Face, { glyph: glyph() }),
  "face-photo": () => h(Face, { initials: "AR", photo: PHOTO }),
  "face-twin": () => h(Face, { initials: "AR" }),
  "face-glyph-twin": () => h(Face, { glyph: glyph() }),
  "face-photo-twin": () => h(Face, { initials: "AR", photo: PHOTO }),
};

test("Face draws the gallery's Face family, hidden from a screen reader, its picture standing aside when it does not load", () => {
  assert.deepEqual(parting(FAMILIES, "Face", FACES), HELD);
  const hold = ref();
  // Handed aria-hidden false, as a JSX page's stray prop would be: a face is decoration whatever it is handed.
  const face = drawn(
    h(Face, { initials: "AR", photo: PHOTO, className: "pl-face", ref: hold, "aria-hidden": false, title: "Aisha" }),
  );
  assert.equal(face.type, "span");
  assert.equal(face.props["aria-hidden"], "true");
  assert.equal(face.props.className, "face pl-face", "the page's layout class comes last");
  assert.equal(face.props.ref, hold);
  assert.deepEqual(keysOf(face), ["aria-hidden", "className", "ref", "title"], "who it is stays off it");
  const [initials, picture] = face.props.children;
  assert.equal(initials, "AR");
  assert.deepEqual(keysOf(picture), ["alt", "className", "decoding", "key", "loading", "onError", "src"]);
  assert.deepEqual(
    ["key", "src", "alt", "loading", "decoding"].map((p) => picture.props[p]),
    [PHOTO, PHOTO, "", "lazy", "async"],
    "keyed by its address, so a row that comes to hold someone else draws their picture afresh",
  );
  const img = { hidden: false };
  picture.props.onError({ currentTarget: img });
  assert.equal(img.hidden, true, "a picture that does not load stands aside, and the initials show again");
  assert.deepEqual(drawn(h(Face, { initials: "AR" })).props.children, ["AR", null], "no picture, no image");
  const known = drawn(h(Face, { glyph: glyph() }));
  assert.equal(known.props.className, "face face-glyph");
  assert.equal(known.props.children[0].type, "svg");
  assert.deepEqual(keysOf(known), ["aria-hidden", "className"]);
});

/** A person's row, as the gallery draws it, with what was said or not, a note or not, and an address or none. */
const row = ({ said = true, note = false, href = undefined } = {}) =>
  h(ListRow, {
    face: { initials: "AR" },
    name: "Aisha Rahman",
    end: (place) => h("span", { className: cx("pill pill-warn", place) }, "Needs you"),
    said: said ? "asked about Saturday" : undefined,
    facts: ["Sat · 10:00", "2 h ago"],
    note: note ? "Next step: call back on Monday" : undefined,
    href,
  });

/**
 * The gallery's List row family, entry by entry: the three shapes and a row with a page of its own, then two of the
 * shapes again at a phone's width.
 */
const LIST_ROWS = {
  "list-row": () => row(),
  "list-row-two": () => row({ said: false }),
  "list-row-note": () => row({ note: true }),
  "list-row-door": () => row({ note: true, href: "#kit" }),
  "list-row-twin": () => row({ note: true }),
  "list-row-two-twin": () => row({ said: false }),
};

test("ListRow draws the gallery's List row family, and the page's own elements where the row takes them", () => {
  assert.deepEqual(parting(FAMILIES, "List row", LIST_ROWS), HELD);
  const hold = ref();
  const places = [];
  const lined = (place) => {
    places.push(place);
    return place;
  };
  const own = drawn(
    h(ListRow, {
      face: { initials: "AR", className: "pl-face" },
      name: "Aisha Rahman",
      end: (place) => h("time", { className: lined(place) }, "2 h ago"),
      said: (place) => h("div", { className: cx(lined(place), "pl-card-lead"), "data-testid": "row-words" }, "asked"),
      facts: [null, "Sat · 10:00", h("span", { key: "last", className: "pl-card-last" }, "2 h ago"), false, ""],
      note: null,
      className: "pl-row",
      ref: hold,
      "data-testid": "row",
    }),
  );
  assert.deepEqual(places, ["list-row-end", "list-row-said"], "each is drawn once, with the class that places it");
  assert.equal(own.props.className, "list-row pl-row", "the page's layout class comes last");
  assert.equal(own.props.ref, hold);
  assert.deepEqual(keysOf(own), ["className", "data-testid", "ref"], "its lines stay off it");
  assert.equal(
    spell(settle(drawnSkeleton(own))),
    "div.list-row.pl-row(span.face.list-row-face.pl-face[aria-hidden=true] div.list-row-name time.list-row-end " +
      "div.list-row-said.pl-card-lead div.list-row-facts(span span.pl-card-last))",
    "the page's elements stand where the row lays them out, its fact among the line's own; a fact of nothing is none",
  );
  const bare = drawn(
    h(ListRow, { face: { initials: "AR" }, name: "Aisha Rahman", said: "", facts: [null, false, ""] }),
  );
  assert.equal(
    spell(settle(drawnSkeleton(bare))),
    "div.list-row(span.face.list-row-face[aria-hidden=true] div.list-row-name)",
    "no words said, no facts and no note: none of their lines is drawn",
  );
  const door = drawn(h(ListRow, { face: { initials: "AR" }, name: "Aisha Rahman", href: "#/clients", ref: hold }));
  assert.equal(door.type, "a", "a door is a link");
  assert.equal(door.props.className, "list-row");
  assert.deepEqual(keysOf(door), ["className", "href", "ref"]);
});

/** A chart's parts, as SegmentBar is given its rows: a share, and a series colour. */
const SERIES = [
  { share: 12, color: "var(--chart-cat-1)" },
  { share: 7, color: "var(--chart-cat-2)" },
  { share: 3, color: "var(--chart-cat-3)" },
];

/** The gallery's Meter family, entry by entry. */
const METERS = {
  meter: () => h(Meter, { parts: SERIES, "aria-label": "12 WhatsApp, 7 text, 3 email" }),
  "meter-lg": () => h(Meter, { parts: SERIES, size: "lg", "aria-label": "12 WhatsApp, 7 text, 3 email" }),
  "meter-one": () => h(Meter, { parts: SERIES.slice(0, 1), "aria-label": "12 WhatsApp" }),
  "meter-sm": () =>
    h(Meter, {
      parts: [
        { share: 12, tone: "ok" },
        { share: 3, tone: "warn" },
      ],
      rest: true,
      size: "sm",
      "aria-label": "12 will get it, 3 held back",
    }),
};

test("Meter draws the gallery's Meter family: an image of its parts, each share its flex-grow, and no part of nothing", () => {
  assert.deepEqual(parting(FAMILIES, "Meter", METERS), HELD);
  const hold = ref();
  const meter = drawn(
    h(Meter, {
      parts: [
        { share: 12, tone: "ok" },
        { share: 0, tone: "warn" },
        { share: 3, color: "var(--color-sms)" },
      ],
      rest: true,
      size: "lg",
      "aria-label": "12 will get it, 3 by text",
      className: "cm-reach",
      ref: hold,
    }),
  );
  assert.equal(meter.props.role, "img");
  assert.equal(meter.props["aria-label"], "12 will get it, 3 by text", "what it says, since it draws no words");
  assert.equal(meter.props.className, "meter meter-lg cm-reach", "the page's layout class comes last");
  assert.equal(meter.props.ref, hold);
  assert.deepEqual(keysOf(meter), ["aria-label", "className", "ref", "role"], "its parts stay off it");
  assert.deepEqual(
    meter.props.children.filter(Boolean).map((part) => [part.props.className, part.props.style ?? null]),
    [
      ["meter-part meter-ok", { flexGrow: 12, background: undefined }],
      ["meter-part", { flexGrow: 3, background: "var(--color-sms)" }],
      ["meter-part meter-rest", null],
    ],
    "a part of nothing is not drawn; a share is its flex-grow, a chart's colour its ground, and the rest is the rest",
  );
  assert.deepEqual(
    drawn(h(Meter, { parts: [], "aria-label": "Nothing yet" })).props.children,
    [null],
    "no parts and no rest draw an empty whole",
  );
});
