/**
 * The kit's components (apps/dashboard/src/surfaces/kit/), drawn on the stub React the page tests use
 * (_legacy-react.mjs), as decision 0015 tests a surface that has left the shell, each imported from its own module (the
 * index names the kit's Base UI components too, which this suite cannot load: below). Each is held to its family in the gallery (tooling/scripts/e2e-harness/kit-gallery.mjs):
 * every kit entry of the family is drawn by the component, and what the component draws for an entry has the entry's
 * skeleton: each element's tag, its classes, the attributes a stylesheet or a screen reader reads (READ, below) and the
 * elements it holds, in order. So the gallery cannot drift from the components: a class, an attribute or an element
 * changed on either side alone is red here, and so is an entry added to a family with no drawing of it, or a drawing of
 * an entry the family no longer has. What the skeleton leaves out, the words and the other attributes, each
 * component's own test holds where it matters: the attributes its element carries and no others, the ref, the page's
 * class last, a face's picture and its fallback, a meter's shares, a row's lines.
 *
 * The kit's components with behaviour of their own (the Sheet, the Menu, the Popover, the Select, the Combobox, the
 * Tooltip, the toast, the Switch, the Segmented control and the Field; the plan's decision 15 and step 2.5) are not held
 * here: they are Base UI's parts, whose hooks and contexts are React's own, which this stub does not have, and the React
 * this suite would import runs under the react-server condition, where a Base UI module cannot even load (it makes a
 * context as it loads). So they are held against their own families in the gallery (those "on Base UI") elsewhere: in
 * a browser, in every state a person brings them to (e2e/kit/kit-behaves.spec.ts), and in this suite as far as a server
 * draws them, with a React of their own bundled for it (kit-behaves.test.mjs). The Sheet family of step 2.2 (the frame,
 * beside the record sheet and the phone sheet it reproduces) is the kit's Sheet's CSS; what the component draws is its
 * family on Base UI. A family whose component is the house's JSX today is written in TSX when its first surface moves
 * (the plan's Phase 3), and joins this file then.
 *
 * Each check runs on fixtures too, where it must find what it looks for.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { isThinShare } from "@chanlytics/contracts";
import { FAMILIES } from "../../e2e-harness/kit-gallery.mjs";
import { again, fresh, installLegacyReact, press, textOf } from "../_legacy-react.mjs";
import { Button } from "../../../../apps/dashboard/src/surfaces/kit/button/button.tsx";
import { EmptyState, FailedRead } from "../../../../apps/dashboard/src/surfaces/kit/empty/empty.tsx";
import { Face } from "../../../../apps/dashboard/src/surfaces/kit/face/face.tsx";
import { Figure } from "../../../../apps/dashboard/src/surfaces/kit/figure/figure.tsx";
import { LinkButton } from "../../../../apps/dashboard/src/surfaces/kit/link-button/link-button.tsx";
import { ListRow } from "../../../../apps/dashboard/src/surfaces/kit/list-row/list-row.tsx";
import { Meter } from "../../../../apps/dashboard/src/surfaces/kit/meter/meter.tsx";
import { DayRangePicker } from "../../../../apps/dashboard/src/surfaces/kit/datepicker/day-range-picker.tsx";
import { Panel } from "../../../../apps/dashboard/src/surfaces/kit/panel/panel.tsx";
import { Search } from "../../../../apps/dashboard/src/surfaces/kit/search/search.tsx";
import { ViewTabs } from "../../../../apps/dashboard/src/surfaces/kit/view-tabs/view-tabs.tsx";
import { cx } from "../../../../apps/dashboard/src/surfaces/kit/variants.ts";

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
  "btn-lg": () => [
    h(Button, { size: "lg", variant: "primary" }, "Open the thread"),
    h(Button, { size: "lg" }, "More ", glyph()),
    h(Button, { iconOnly: true, size: "lg", "aria-label": "Clear the selection" }, glyph()),
  ],
  "btn-icon": () => [
    h(Button, { iconOnly: true, "aria-label": "More" }, glyph()),
    h(Button, { iconOnly: true, size: "sm", "aria-label": "Close" }, glyph()),
  ],
  "btn-text": () =>
    h(
      Button,
      { size: "text", variant: "quiet", "aria-pressed": false },
      "Visit reminder: 12 people, 3 campaigns, 2 on and 1 paused",
    ),
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
  "link-btn-inherit": () =>
    h(LinkButton, { size: "inherit", href: "#kit" }, "Win-back, for everyone quiet for 30 days with nothing booked"),
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
  "face-sm": () => [h(Face, { initials: "AR", size: "sm" }), h(Face, { initials: "AR", size: "sm", photo: PHOTO })],
  "face-lg": () => [h(Face, { initials: "AR", size: "lg" }), h(Face, { initials: "AR", size: "lg", photo: PHOTO })],
  "face-xl": () => [h(Face, { initials: "AR", size: "xl" }), h(Face, { initials: "AR", size: "xl", photo: PHOTO })],
  "face-mark": () => h(Face, { initials: "ZS", photo: PHOTO, mark: PHOTO }),
  "face-pick": () => [
    h(Face, { initials: "AR", pick: "choose" }),
    h(Face, { initials: "AR", pick: "chosen" }),
    h(Face, { initials: "AR", pick: "choose", photo: PHOTO }),
  ],
  "face-priority": () => h(Face, { initials: "AR", priority: "P1" }),
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
  // The initials are words in a span of their own, so a face that is a row's checkbox can hold them back.
  assert.deepEqual([initials.type, initials.props.children].flat(), ["span", "AR"]);
  assert.deepEqual(keysOf(picture), ["alt", "className", "decoding", "key", "loading", "onError", "src"]);
  assert.deepEqual(
    ["key", "src", "alt", "loading", "decoding"].map((p) => picture.props[p]),
    [PHOTO, PHOTO, "", "lazy", "async"],
    "keyed by its address, so a row that comes to hold someone else draws their picture afresh",
  );
  const img = { hidden: false };
  picture.props.onError({ currentTarget: img });
  assert.equal(img.hidden, true, "a picture that does not load stands aside, and the initials show again");
  assert.deepEqual(
    drawn(h(Face, { initials: "AR" })).props.children.map((k) => (k && k.props ? k.props.children : k)),
    [["AR"], null, null],
    "no picture, no mark, no image",
  );
  // A row's checkbox says where it stands, and a face outside a selection says nothing of it.
  assert.equal(drawn(h(Face, { initials: "AR", pick: "chosen" })).props["data-pick"], "chosen");
  assert.equal(drawn(h(Face, { initials: "AR" })).props["data-pick"], undefined);
  // A lead's own mark is a second picture, over the first, that stands aside as the first does.
  const marked = drawn(h(Face, { initials: "ZS", photo: PHOTO, mark: PHOTO }));
  assert.equal(marked.props.children[2].props.className, "face-photo face-mark");
  const known = drawn(h(Face, { glyph: glyph() }));
  assert.equal(known.props.className, "face face-glyph");
  assert.equal(known.props.children[0].type, "svg");
  assert.deepEqual(keysOf(known), ["aria-hidden", "className"]);
});

/**
 * A person's row, as the gallery draws it, with what was said or not, a note or not, an address or none, and a row's
 * kind as its mark instead of a face.
 */
const row = ({ said = true, note = false, href = undefined, mark = false } = {}) =>
  h(ListRow, {
    ...(mark ? { mark: glyph() } : { face: { initials: "AR" } }),
    name: "Aisha Rahman",
    end: (place) => h("span", { className: cx("pill pill-warn", place) }, "Needs you"),
    said: said ? "asked about Saturday" : undefined,
    facts: ["Sat · 10:00", "2 h ago"],
    note: note ? "Next step: call back on Monday" : undefined,
    href,
  });

/**
 * The gallery's List row family, entry by entry: the three shapes, a row with a page of its own, and a row whose first
 * column is its kind (a campaign on Campaigns' phone list).
 */
const LIST_ROWS = {
  "list-row": () => row(),
  "list-row-two": () => row({ said: false }),
  "list-row-note": () => row({ note: true }),
  "list-row-door": () => row({ note: true, href: "#kit" }),
  "list-row-mark": () => row({ said: false, mark: true }),
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
    "div.list-row.pl-row(span.face.list-row-face.pl-face[aria-hidden=true](span) div.list-row-name time.list-row-end " +
      "div.list-row-said.pl-card-lead div.list-row-facts(span span.pl-card-last))",
    "the page's elements stand where the row lays them out, its fact among the line's own; a fact of nothing is none",
  );
  const bare = drawn(
    h(ListRow, { face: { initials: "AR" }, name: "Aisha Rahman", said: "", facts: [null, false, ""] }),
  );
  assert.equal(
    spell(settle(drawnSkeleton(bare))),
    "div.list-row(span.face.list-row-face[aria-hidden=true](span) div.list-row-name)",
    "no words said, no facts and no note: none of their lines is drawn",
  );
  const door = drawn(h(ListRow, { face: { initials: "AR" }, name: "Aisha Rahman", href: "#/clients", ref: hold }));
  assert.equal(door.type, "a", "a door is a link");
  assert.equal(door.props.className, "list-row");
  assert.deepEqual(keysOf(door), ["className", "href", "ref"]);
  const kind = drawn(h(ListRow, { mark: glyph(), name: "Win-back", facts: ["Quiet or lapsed"] }));
  assert.equal(
    spell(settle(drawnSkeleton(kind))),
    "div.list-row(span.list-row-mark.mark[aria-hidden=true](svg.icon) div.list-row-name div.list-row-facts(span))",
    "a row's kind stands in the face's column as the kit's mark, neutral, hidden from a screen reader",
  );
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

/** The gallery's Empty state and failed read family, entry by entry, as a surface draws it with the kit's components. */
const EMPTY_STATES = {
  "empty-page": () =>
    h(EmptyState, {
      kind: "page",
      glyph: "inbox",
      title: "Nothing waiting on you",
      body: "When a conversation needs a person, it lands here.",
      action: { label: "See what it handled", to: "conversations" },
      also: { label: "Open the settings", to: "admin" },
    }),
  "empty-card": () =>
    h(EmptyState, {
      kind: "card",
      glyph: "calendar",
      title: "No visits this week",
      body: "Booked visits show here with who is coming.",
      action: { label: "Share the booking link", to: "calendar" },
    }),
  "empty-line": () =>
    h(EmptyState, {
      kind: "line",
      title: "No notes yet.",
      body: "What the team writes about them stays here.",
      action: { label: "Write one", onClick },
    }),
  "empty-center": () =>
    h(EmptyState, { kind: "line", className: "empty-center", title: "Nobody matches.", body: "Try fewer words." }),
  "empty-ok": () =>
    h(EmptyState, {
      kind: "card",
      tone: "ok",
      glyph: "check",
      title: "Nothing left for today",
      body: "Every conversation is answered.",
    }),
  "empty-failed": () => h(FailedRead, { what: "your team", surface: "settings" }),
  "empty-failed-line": () => h(FailedRead, { kind: "line", what: "the calls", surface: "live" }),
};

test("EmptyState and FailedRead draw the gallery's Empty state and failed read family: a pane's, a card's, a line's, and a read that failed with its Retry", () => {
  // A Retry is drawn only where the runner can read the surface again: published by the shell, as the app's has it.
  globalThis.__refreshSurface = async () => undefined;
  try {
    assert.deepEqual(parting(FAMILIES, "Empty state and failed read", EMPTY_STATES), HELD);
  } finally {
    delete globalThis.__refreshSurface;
  }
  const failed = drawn(h(FailedRead, { what: "your team" }));
  assert.equal(failed.props.role, "status", "a failed read is announced");
  assert.equal(
    failed.props.children.flat().some((child) => child?.props?.className === "empty-acts"),
    false,
    "with nothing to press (no runner, no retry of its own) there is no Retry: a state support repairs",
  );
});

/** The gallery's Figure family, entry by entry, as a surface draws it with the kit's component. */
const FIGURES = {
  figure: () => h(Figure, { label: "Customer messages", value: "17", meta: "on 6 of 7 days" }),
  "figure-change": () =>
    h(Figure, { label: "Customer messages", value: "17", change: "up from 7", meta: "on 6 of 7 days" }),
  "figure-door": () =>
    h(Figure, {
      label: "Customer messages",
      value: "17",
      meta: "on 6 of 7 days",
      door: { href: "/w/harbor/inbox" },
    }),
  "figure-door-act": () =>
    h(Figure, { label: "Customer messages", value: "17", meta: "on 6 of 7 days", door: { onClick } }),
  "figure-thin": () => h(Figure, { label: "Customer messages", value: "62%", meta: "on 6 of 7 days", n: 3, minN: 5 }),
  "figure-warn": () => h(Figure, { label: "Customer messages", value: "17", meta: "on 6 of 7 days", tone: "warn" }),
  "figure-fail": () => h(Figure, { label: "Customer messages", value: "17", meta: "on 6 of 7 days", tone: "fail" }),
};

test("Figure draws the gallery's Figure family: a term and its definitions, the number a door where it opens something, the page's class last", () => {
  assert.deepEqual(parting(FAMILIES, "Figure", FIGURES), HELD);
  const defined = (node) => keysOf(node).filter((k) => node.props[k] !== undefined);
  const fig = drawn(
    h(Figure, { label: "Calls", value: "3", id: "calls", "data-testid": "fig", className: "rpt-cell" }),
  );
  assert.equal(fig.props.className, "figure rpt-cell", "the page's layout class comes last");
  assert.deepEqual(defined(fig), ["className", "data-figure", "data-testid"]);
  assert.equal(fig.props["data-figure"], "calls");
  assert.deepEqual(defined(drawn(h(Figure, { label: "Calls", value: "3" }))), ["className"], "no id, no attribute");
  const rows = (props) =>
    drawn(h(Figure, { label: "Calls", value: "3", ...props }))
      .props.children.filter(Boolean)
      .map((c) => c.props.className);
  assert.deepEqual(rows({}), ["figure-label", "figure-value"], "no line under it where there is nothing to say");
  assert.deepEqual(rows({ meta: "no calls" }), ["figure-label", "figure-value", "figure-meta"]);
  assert.deepEqual(rows({ meta: null, change: null }), ["figure-label", "figure-value"]);
  // The number is a link where the door has an address, and a button that acts where it has none.
  const numberOf = (door) => drawn(h(Figure, { label: "Calls", value: "3", door })).props.children[1].props.children[0];
  const link = numberOf({ href: "/w/harbor/inbox" }).rendered;
  assert.deepEqual([link.type, link.props.href, link.props.className], ["a", "/w/harbor/inbox", "figure-door"]);
  const act = numberOf({ onClick }).rendered;
  assert.deepEqual([act.type, act.props.type, act.props.className], ["button", "button", "figure-door"]);
  assert.equal(drawn(h(Figure, { label: "Calls", value: "3" })).props.children[1].props.children[0], "3");
  // A ratio of some, but too few, is greyed and says so (the reports lenses spec, D9): above none and under the minimum,
  // and only where both are named. Of none there is no ratio to grey.
  assert.equal(
    drawn(h(Figure, { label: "Calls", value: "3", n: 5, minN: 5 })).props.className,
    "figure",
    "at the minimum it is read",
  );
  assert.equal(drawn(h(Figure, { label: "Calls", value: "3", n: 4, minN: 5 })).props.className, "figure is-thin");
  assert.deepEqual(rows({ n: 4, minN: 5 }), ["figure-label", "figure-value", "figure-n"]);
  assert.deepEqual(rows({ n: 4 }), ["figure-label", "figure-value"], "no minimum named, none applies");
  assert.deepEqual(rows({ n: null, minN: 5 }), ["figure-label", "figure-value"], "no count, nothing to grey");
  assert.equal(
    drawn(h(Figure, { label: "Calls", value: "—", n: 0, minN: 5 })).props.className,
    "figure",
    "of none there is no ratio: its dash and its line say why, and nothing is greyed",
  );
  assert.deepEqual(rows({ n: 0, minN: 5 }), ["figure-label", "figure-value"], "and no line says it is of none");
  // The kit greys by contracts' one predicate (a bar of a rate and Ask's answer judge by it too): the two agree at 0, 4, 5 and beyond.
  for (const n of [0, 1, 4, 5, 6])
    assert.equal(
      drawn(h(Figure, { label: "Calls", value: "3", n, minN: 5 })).props.className === "figure is-thin",
      isThinShare(n, 5),
      `n ${n}`,
    );
  const thin = drawn(h(Figure, { label: "Calls", value: "3", n: 1, minN: 5 }))
    .props.children.filter(Boolean)
    .at(-1);
  assert.equal(thin.props.className, "figure-n");
  assert.equal(
    textOf(thin),
    "only 1, too few to read",
    "the words are the figure's own: how few, and that it is too few",
  );
  assert.equal(
    drawn(h(Figure, { label: "Calls", value: "3", n: 2, minN: 5, className: "rpt-cell" })).props.className,
    "figure is-thin rpt-cell",
    "the page's layout class stays last",
  );
  assert.deepEqual(
    rows({ meta: "no calls", n: 2, minN: 5 }),
    ["figure-label", "figure-value", "figure-meta", "figure-n"],
    "the count's line comes after the line under the number",
  );
  // A tone is for what needs you (warn) or what failed (fail), the reports lenses spec D10: the figure wears it, and the
  // stylesheet reads it on the number alone. It adds no row, and a thin figure keeps its state ahead of it.
  const tone = (props) => drawn(h(Figure, { label: "Steps overdue", value: "6", ...props }));
  assert.equal(tone({ tone: "warn" }).props.className, "figure is-warn");
  assert.equal(tone({ tone: "fail" }).props.className, "figure is-fail");
  assert.equal(tone({}).props.className, "figure", "no tone, no class");
  assert.equal(tone({ tone: undefined }).props.className, "figure", "an unset tone is none");
  assert.equal(
    tone({ n: 2, minN: 5, tone: "warn" }).props.className,
    "figure is-thin is-warn",
    "thin first, then the tone",
  );
  assert.equal(
    tone({ tone: "fail", className: "rpt-cell" }).props.className,
    "figure is-fail rpt-cell",
    "the page's layout class stays last",
  );
  assert.deepEqual(rows({ tone: "warn", change: "up from 2" }), ["figure-label", "figure-value"], "a tone adds no row");
});

/**
 * The gallery's Day range picker family: a window of thirty days (September 7 to October 6, 2026, today the 6th), and
 * what a person does to the month to bring it to each entry.
 */
const RANGE = { from: "2026-09-07", to: "2026-10-06", today: "2026-10-06" };
const rangeGlyphs = () => ({ previous: glyph(), next: glyph() });
/**
 * A month as a page draws one, on cells of its own (the stub keeps a component's state where it is drawn): `chose` holds
 * each range it was told of, `said` each thing it was asked to say under the grid.
 */
const monthOf = (over = {}) => {
  fresh();
  const chose = [];
  const said = [];
  const props = {
    ...RANGE,
    most: 90,
    label: "Days",
    hint: (at) => {
      said.push(at);
      return at.first === null ? "Press a first day, then a last." : `${at.band.from} to ${at.band.to}`;
    },
    onRangeChange: (range) => chose.push(range),
    glyphs: rangeGlyphs(),
    ...over,
  };
  const draw = () => h(DayRangePicker, props);
  return { chose, said, props, draw, root: () => again(draw).rendered };
};
/** The month's parts, of its root as the stub holds it: the stub hands an element its children flat. */
const headOf = (root) => root.props.children[0];
const gridOf = (root) => root.props.children[1];
const arrowsOf = (root) => headOf(root).props.children[1].props.children;
const cellsOf = (root) =>
  gridOf(root)
    .props.children.slice(1)
    .flatMap((row) => row.props.children);
/** A day's cell by its date, as a person finds it: by the day's own name, which every day's button says. */
const cellOf = (root, name) => {
  const cell = cellsOf(root).find((c) => c.props.children[0].props["aria-label"].startsWith(name));
  assert.ok(cell, `${name} is on the month`);
  return cell;
};
const dayOf = (root, name) => cellOf(root, name).props.children[0];
/** What the band says: how many days it holds, and the numbers of its first and its last where they are on the month. */
const bandOf = (root) => {
  const of = (n) =>
    cellsOf(root)
      .filter((c) => c.props[`data-${n}`] === "true")
      .map((c) => c.props.children[0].props.children[0].props.children[0]);
  return { in: of("in").length, start: of("start"), end: of("end"), today: of("today") };
};
const key = (name, over = {}) => {
  const event = { key: name, shiftKey: false, prevented: false, stopped: false, ...over };
  event.preventDefault = () => (event.prevented = true);
  event.stopPropagation = () => (event.stopped = true);
  return event;
};
/** A pointer's move, release or cancel, told to the window: a month hears the release there, not on the day pressed. */
const tell = (type, event) => globalThis.dispatchEvent({ type, pointerId: 1, ...event });
/** A pointer going down on a day. */
const down = (day, pointerType = "mouse", over = {}) =>
  day.props.onPointerDown({
    isPrimary: true,
    pointerType,
    button: 0,
    pointerId: 1,
    clientX: 100,
    clientY: 100,
    ...over,
  });
/** A pointer pressed on a day and let go where it was pressed, then the click a browser fires: a mouse's, or a tap. */
const tap = (day, pointerType = "mouse") => {
  down(day, pointerType);
  tell("pointerup", { target: null, clientX: 100, clientY: 100 });
  day.props.onClick({ detail: 1 });
};

const DAY_RANGES = {
  "day-range": () => monthOf().draw(),
  "day-range-first": () => {
    // Moved back a month by its own arrow, a first day pressed and the pointer on another, as a person does it; a
    // range may be fourteen days here, so the days too far to be the other end stand down.
    const month = monthOf({ most: 14 });
    press(arrowsOf(month.root())[0]);
    tap(dayOf(month.root(), "Monday, September 14"));
    dayOf(month.root(), "Friday, September 25").props.onPointerEnter();
    return again(month.draw);
  },
};

test("DayRangePicker draws the gallery's Day range picker family: a range on the month it ends in, and a first day pressed with the band following the pointer", () => {
  assert.deepEqual(parting(FAMILIES, "Day range picker", DAY_RANGES), HELD);
  const month = monthOf();
  const root = month.root();
  assert.deepEqual(
    bandOf(root),
    { in: 9, start: [], end: [6], today: [6] },
    "October holds the window's last nine days: the weeks' first three of September, and the six to today",
  );
  // The range's two ends are the grid's selected cells, as the date picker's one day is; a day between says so by name.
  assert.deepEqual(
    cellsOf(root)
      .filter((c) => c.props["aria-selected"] === true)
      .map((c) => c.props.children[0].props["aria-label"]),
    ["Tuesday, October 6, 2026, in the range"],
    "the last day is on the month, the first is a month back",
  );
  assert.equal(dayOf(root, "Thursday, October 1").props["aria-label"], "Thursday, October 1, 2026, in the range");
  assert.equal(dayOf(root, "Wednesday, October 7").props["aria-label"], "Wednesday, October 7, 2026");
  assert.deepEqual(
    [gridOf(root).props.role, gridOf(root).props["aria-label"], gridOf(root).props["aria-multiselectable"]],
    ["grid", "Days", "true"],
  );
  // One tab stop, on the range's last day; today says it is today; a day to come cannot be chosen, and says so.
  assert.deepEqual(
    cellsOf(root)
      .filter((c) => c.props.children[0].props.tabIndex === 0)
      .map((c) => c.props.children[0].props["aria-label"]),
    ["Tuesday, October 6, 2026, in the range"],
  );
  assert.equal(dayOf(root, "Tuesday, October 6").props["aria-current"], "date");
  assert.equal(dayOf(root, "Tuesday, October 6").props["aria-disabled"], undefined);
  assert.equal(dayOf(root, "Wednesday, October 7").props["aria-disabled"], "true");
  assert.equal(arrowsOf(root)[1].props.disabled, true, "nothing after the month that holds today can be chosen");
  assert.equal(arrowsOf(root)[0].props.disabled, undefined);
  // What it says under the grid is the page's, handed what is chosen so far.
  assert.deepEqual(month.said.at(-1), { first: null, band: { from: "2026-09-07", to: "2026-10-06" }, refused: null });
  assert.deepEqual(
    cellsOf(root)
      .slice(0, 2)
      .map((c) => c.props["data-day"]),
    ["2026-09-28", "2026-09-29"],
    "a cell says its day, for a pointer let go on it",
  );
  assert.equal(root.props.children[2].props.role, "status");
  const placed = drawn(h(DayRangePicker, { ...monthOf().props, className: "rpt-when-month" }));
  assert.equal(placed.props.className, "date-pick-month rpt-when-month", "the page's layout class comes last");
});

test("DayRangePicker: two presses choose a range, in whichever order, and nothing is chosen until the second", () => {
  const month = monthOf();
  press(arrowsOf(month.root())[0]);
  tap(dayOf(month.root(), "Monday, September 14"));
  assert.deepEqual(month.chose, [], "a first press chooses nothing: a press on the wrong day costs nothing");
  let root = month.root();
  assert.equal(root.props["data-pending"], "true");
  assert.deepEqual(bandOf(root), { in: 1, start: [14], end: [14], today: [6] }, "the band is the day pressed");
  assert.deepEqual(month.said.at(-1), {
    first: "2026-09-14",
    band: { from: "2026-09-14", to: "2026-09-14" },
    refused: null,
  });
  // The pointer on a later day, then on an earlier one: the band is what a press there would choose, in its order.
  dayOf(root, "Friday, September 25").props.onPointerEnter();
  assert.deepEqual(bandOf(month.root()), { in: 12, start: [14], end: [25], today: [6] });
  dayOf(month.root(), "Thursday, September 10").props.onPointerEnter();
  assert.deepEqual(bandOf(month.root()), { in: 5, start: [10], end: [14], today: [6] });
  // The pointer leaves the grid: the band goes back to the day pressed, which is still pressed.
  gridOf(month.root()).props.onPointerLeave();
  assert.deepEqual(bandOf(month.root()), { in: 1, start: [14], end: [14], today: [6] });
  tap(dayOf(month.root(), "Thursday, September 10"));
  assert.deepEqual(month.chose, [{ from: "2026-09-10", to: "2026-09-14" }], "the last day pressed first, in order");
  root = month.root();
  assert.equal(root.props["data-pending"], undefined, "and the month waits for a first day again");
  // The same day twice is a range of that day.
  tap(dayOf(month.root(), "Tuesday, September 1"));
  tap(dayOf(month.root(), "Tuesday, September 1"));
  assert.deepEqual(month.chose.at(-1), { from: "2026-09-01", to: "2026-09-01" });
});

test("DayRangePicker: a mouse presses as it goes down, a finger as it lifts and only if it did not scroll, and a click no pointer made is a key's", () => {
  const month = monthOf();
  press(arrowsOf(month.root())[0]);
  // A mouse: the day is pressed as the button goes down, and a release that slipped off it leaves it pressed (the
  // click a browser fires only on the same button never comes, and is not waited for).
  down(dayOf(month.root(), "Monday, September 14"));
  assert.equal(month.root().props["data-pending"], "true", "pressed as it went down");
  tell("pointerup", { target: null, clientX: 105, clientY: 100 });
  assert.equal(month.root().props["data-pending"], "true", "and still pressed after a slip");
  // Another button than the main one presses nothing.
  down(dayOf(month.root(), "Friday, September 18"), "mouse", { button: 2 });
  assert.deepEqual(month.chose, []);
  // A pointer's own click is not read again: the second press chose, its click did nothing more.
  tap(dayOf(month.root(), "Friday, September 18"));
  assert.deepEqual(month.chose, [{ from: "2026-09-14", to: "2026-09-18" }]);
  // A finger: nothing until it lifts, and a finger that travelled was scrolling.
  down(dayOf(month.root(), "Monday, September 21"), "touch", { clientX: 50, clientY: 50 });
  assert.equal(month.root().props["data-pending"], undefined, "a finger down presses nothing yet");
  tell("pointermove", { clientX: 50, clientY: 90 });
  tell("pointerup", { target: null, clientX: 50, clientY: 90 });
  assert.equal(month.root().props["data-pending"], undefined, "a finger that travelled was a scroll");
  down(dayOf(month.root(), "Monday, September 21"), "touch");
  tell("pointercancel", {});
  assert.equal(month.root().props["data-pending"], undefined, "the browser took it for a scroll");
  tap(dayOf(month.root(), "Monday, September 21"), "touch");
  tap(dayOf(month.root(), "Wednesday, September 23"), "touch");
  assert.deepEqual(month.chose.at(-1), { from: "2026-09-21", to: "2026-09-23" }, "two taps, a range");
  // A click no pointer made (Enter, Space, a screen reader's): a press.
  dayOf(month.root(), "Thursday, September 24").props.onClick({ detail: 0 });
  dayOf(month.root(), "Friday, September 25").props.onClick({ detail: 0 });
  assert.deepEqual(month.chose.at(-1), { from: "2026-09-24", to: "2026-09-25" });
});

test("DayRangePicker: a first day pressed is let go once the range changes from beside the month", () => {
  const month = monthOf();
  press(arrowsOf(month.root())[0]);
  tap(dayOf(month.root(), "Wednesday, September 2"));
  assert.equal(month.root().props["data-pending"], "true");
  // "Last week" pressed beside the month: the page hands it another range.
  month.props.from = "2026-09-28";
  month.props.to = "2026-10-04";
  assert.equal(month.root().props["data-pending"], undefined, "the first day pressed is not of this range");
  tap(dayOf(month.root(), "Thursday, October 1"));
  assert.deepEqual(month.chose, [], "one press after it is a first day, never the end of a range begun before");
});

test("DayRangePicker: a day to come is never chosen, a range is no longer than the page says, and Escape lets go of the first day", () => {
  const month = monthOf({ most: 14 });
  // A day after today presses nothing, with or without a first day pressed.
  tap(dayOf(month.root(), "Wednesday, October 7"));
  assert.equal(month.root().props["data-pending"], undefined, "a day to come starts no range");
  assert.deepEqual(month.said.at(-1).refused, { day: "2026-10-07", why: "to-come" }, "and the month says why");
  press(arrowsOf(month.root())[0]);
  tap(dayOf(month.root(), "Friday, September 18"));
  month.root();
  assert.equal(month.said.at(-1).refused, null, "a press that acts lets go of the words");
  tap(dayOf(month.root(), "Wednesday, October 7"));
  assert.deepEqual(month.chose, [], "and ends none");
  // With the first day pressed, the days too far to be the other end stand down: fourteen days, the first included.
  let root = month.root();
  const closed = (name) => dayOf(root, name).props["aria-disabled"];
  assert.deepEqual(
    [closed("Saturday, September 5"), closed("Friday, September 4")],
    [undefined, "true"],
    "back: thirteen days before is the fourteenth day, and the day before it one too many",
  );
  assert.deepEqual(
    [closed("Thursday, October 1"), closed("Friday, October 2")],
    [undefined, "true"],
    "and forward the same",
  );
  tap(dayOf(root, "Friday, September 4"));
  assert.deepEqual(month.chose, [], "a day too far chooses nothing");
  month.root();
  assert.deepEqual(month.said.at(-1).refused, { day: "2026-09-04", why: "too-far" });
  assert.equal(month.root().props["data-pending"], "true", "and the first day stays pressed");
  dayOf(month.root(), "Friday, September 4").props.onPointerEnter();
  assert.deepEqual(bandOf(month.root()).start, [18], "nor does the band reach to it");
  // Escape lets go of the first day, and only that: whatever the month stands in does not hear it.
  const escape = key("Escape");
  gridOf(month.root()).props.onKeyDown(escape);
  assert.deepEqual([escape.prevented, escape.stopped], [true, true], "the popover it stands in stays open");
  root = month.root();
  assert.equal(root.props["data-pending"], undefined);
  assert.equal(closed("Friday, September 4"), undefined, "every day up to today is open again");
  assert.equal(closed("Wednesday, October 7"), "true", "and a day to come still is not");
  // With no day pressed, Escape is not the month's: what it stands in closes on it.
  const unheld = key("Escape");
  gridOf(month.root()).props.onKeyDown(unheld);
  assert.deepEqual([unheld.prevented, unheld.stopped], [false, false]);
});

test("DayRangePicker: the keys walk the days as the date picker's do, the band follows them once a first day is pressed, and a range that moves opens on its own month", () => {
  const month = monthOf();
  const title = () => textOf(headOf(month.root()).props.children[0]);
  const stops = () =>
    cellsOf(month.root())
      .filter((c) => c.props.children[0].props.tabIndex === 0)
      .map((c) => c.props.children[0].props["aria-label"].replace(", in the range", ""));
  const walk = (name, over) => {
    const event = key(name, over);
    gridOf(month.root()).props.onKeyDown(event);
    return event;
  };
  assert.deepEqual([title(), stops()], ["October 2026", ["Tuesday, October 6, 2026"]]);
  assert.equal(walk("ArrowLeft").prevented, true, "an arrow is the grid's own");
  assert.deepEqual(stops(), ["Monday, October 5, 2026"]);
  walk("ArrowUp");
  assert.deepEqual(
    [title(), stops()],
    ["September 2026", ["Monday, September 28, 2026"]],
    "a week up is a day of the month before: the month follows the day walked to",
  );
  walk("ArrowUp");
  assert.deepEqual(stops(), ["Monday, September 21, 2026"]);
  assert.equal(walk("a").prevented, false, "a key that walks nothing is left alone");
  // Enter is the button's own press, a click no pointer made: the day under the keys is the first day, and the band
  // follows the keys from it.
  dayOf(month.root(), "Monday, September 21").props.onClick({ detail: 0 });
  walk("ArrowRight");
  walk("ArrowRight");
  assert.deepEqual(bandOf(month.root()), { in: 3, start: [21], end: [23], today: [6] });
  dayOf(month.root(), "Wednesday, September 23").props.onClick({ detail: 0 });
  assert.deepEqual(month.chose, [{ from: "2026-09-21", to: "2026-09-23" }]);
  // A month by Page Up, a year with Shift.
  walk("PageUp");
  assert.equal(title(), "August 2026");
  walk("PageUp", { shiftKey: true });
  assert.equal(title(), "August 2025");
  // The page takes the range chosen: the month opens on that range's own last month, its tab stop on its last day.
  month.props.from = "2026-08-03";
  month.props.to = "2026-08-09";
  assert.deepEqual([title(), stops()], ["August 2026", ["Sunday, August 9, 2026"]]);
  assert.deepEqual(bandOf(month.root()), { in: 7, start: [3], end: [9], today: [] });
});

/** A strip's views, as a page hands them: an address each. */
const viewsOf = (...labels) => labels.map((label) => ({ id: label.toLowerCase(), label, href: "#kit" }));

/** The gallery's Tab strip family, entry by entry. */
const VIEW_TABS = {
  stabs: () =>
    h(ViewTabs, {
      name: "inbox",
      label: "Section views",
      picked: "needs you",
      onPick() {},
      tabs: [
        { id: "needs you", label: "Needs you", href: "#kit", count: 3, tone: "warn" },
        { id: "conversations", label: "Conversations", href: "#kit" },
        { id: "live", label: "Live", href: "#kit", live: true },
      ],
    }),
  "stabs-campaigns": () =>
    h(ViewTabs, {
      name: "campaigns",
      label: "Section views",
      picked: "broadcasts",
      onPick() {},
      tabs: viewsOf("Playbooks", "Broadcasts", "Templates"),
    }),
};

test("ViewTabs draws the gallery's Tab strip family: links on one capsule, the highlight before them, a count and a dot beside the words", () => {
  assert.deepEqual(parting(FAMILIES, "Tab strip", VIEW_TABS), HELD);
  const strip = drawn(
    h(ViewTabs, {
      name: "reports",
      label: "Which report",
      testid: "reports-lenses",
      className: "rpt-strip",
      picked: "overview",
      onPick() {},
      tabs: viewsOf("Overview", "People"),
    }),
  );
  assert.equal(strip.type, "nav");
  assert.equal(strip.props.className, "stabs stabs-reports rpt-strip", "the page's layout class comes last");
  assert.deepEqual(keysOf(strip), ["aria-label", "className", "data-testid", "ref"]);
  const [pill, ...tabs] = strip.props.children.flat().filter(Boolean);
  assert.equal(pill.props.className, "stabs-pill");
  assert.deepEqual(
    tabs.map((t) => [t.type, t.props.className, t.props["aria-current"]]),
    [
      ["a", "stabs-tab active", "page"],
      ["a", "stabs-tab", undefined],
    ],
    "a view has an address: a tab is a link, never a button",
  );
});

/** A search, as a page hands it: what it finds, its words, and whether it is open. */
const searchOf = (props) =>
  h(Search, {
    label: "Search names, numbers and emails",
    value: "",
    onChange() {},
    open: false,
    onOpen() {},
    testid: "people-phone-search",
    ...props,
  });

/** The gallery's Search family, entry by entry. */
const SEARCHES = {
  search: () => searchOf({ rests: true }),
  "search-open": () => searchOf({ rests: true, open: true, value: "Sam" }),
  "search-desk": () => searchOf({ rests: false, label: "Search by name or message", testid: "inbox-search" }),
};

test("Search draws the gallery's Search family: the capsule at rest, the field with its clear and Cancel, the desk's field", () => {
  assert.deepEqual(parting(FAMILIES, "Search", SEARCHES), HELD);
  const rest = drawn(searchOf({ rests: true, className: "pp-lookup" }));
  assert.equal(rest.props.className, "search pp-lookup", "the page's layout class comes last");
  const [button] = rest.props.children.flat().filter(Boolean);
  assert.equal(button.props["data-testid"], "people-phone-search-open");
  fresh();
  let opened = false;
  const pressed = drawn(searchOf({ rests: true, onOpen: (o) => (opened = o) }));
  press(pressed.props.children.flat().filter(Boolean)[0]);
  assert.equal(opened, true, "a press on the capsule asks for the field");
  let words = "x";
  let shut = null;
  const open = drawn(
    searchOf({ rests: true, open: true, value: "Sam", onChange: (q) => (words = q), onOpen: (o) => (shut = o) }),
  );
  const cancel = open.props.children.flat().filter(Boolean).at(-1);
  assert.equal(cancel.props["data-testid"], "people-phone-search-cancel");
  press(cancel);
  assert.deepEqual([words, shut], ["", false], "Cancel empties the field and rests it");
  const desk = drawn(searchOf({ rests: false, value: "Sam" }));
  assert.equal(
    desk.props.children.flat().filter(Boolean).length,
    1,
    "on a desk the field stands alone, with no Cancel",
  );
});
