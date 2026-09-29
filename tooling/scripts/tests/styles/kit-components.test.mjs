/**
 * The kit's components (apps/dashboard/src/surfaces/kit/), drawn on the stub React the page tests use
 * (_legacy-react.mjs), as decision 0015 tests a surface that has left the shell, and imported through the kit's index,
 * as a surface imports them. Each is held to its family in the gallery (tooling/scripts/e2e-harness/kit-gallery.mjs):
 * every kit entry of the family is drawn by the component, and what the component draws for an entry has the entry's
 * skeleton, each element's tag, its classes and the elements it holds, in order. So the gallery cannot drift from the
 * components: a class or an element changed on either side alone is red here, and so is an entry added to a family
 * with no drawing of it, or a drawing of an entry the family no longer has. What the skeleton leaves out, the words and
 * the other attributes, each component's own test holds where it matters: the type a button is, a door's address, the
 * ref, the page's class last, a face hidden from a screen reader, a meter's shares.
 *
 * The Sheet's family is not held: its component waits on Ruben's decision whether the kit builds its interactive
 * components on Base UI (the plan's step 2.4). A family whose component is the house's JSX today is written in TSX when
 * its first surface moves (the same step), and joins this file then.
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

/* ---- the skeleton: each element's tag, its classes as a set, and the elements it holds ---- */

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
 * gx-*) gives way to what it holds, and a glyph (an <svg>, the Icon's) is drawn without its paths, which are the
 * Icon's and not the kit's.
 */
const settle = (nodes) =>
  nodes.flatMap((n) =>
    n.classes.length > 0 && n.classes.every((c) => c.startsWith("gx-"))
      ? settle(n.children)
      : [{ ...n, children: n.tag === "svg" ? [] : settle(n.children) }],
  );

/** Elements that hold nothing, and so close themselves. */
const VOID = new Set(["img", "input", "br", "hr", "wbr", "source"]);
/** A tag, opening or closing, with its attributes: each a name alone, or a name and a value in double quotes. */
const TAG = /<(\/?)([a-zA-Z][a-zA-Z0-9-]*)((?:\s+[^\s"'=<>/]+(?:="[^"]*")?)*)\s*(\/?)>/g;

/** The skeleton of an entry's markup, which the gallery writes whole: every element it opens, it closes. */
function markupSkeleton(html) {
  const top = { tag: "#top", classes: [], children: [] };
  const open = [top];
  for (const [, closing, name, attributes, closed] of html.matchAll(TAG)) {
    const tag = name.toLowerCase();
    if (closing) {
      if (open.at(-1).tag !== tag) throw new Error(`</${tag}> closes <${open.at(-1).tag}>`);
      open.pop();
      continue;
    }
    const node = { tag, classes: classSet(/\sclass="([^"]*)"/.exec(attributes)?.[1]), children: [] };
    open.at(-1).children.push(node);
    if (!closed && !VOID.has(tag)) open.push(node);
  }
  if (open.length > 1) throw new Error(`<${open.at(-1).tag}> is never closed`);
  return settle(top.children);
}

/** The skeleton of what the stub drew: a component is what it rendered, and a fragment what it holds. */
function drawnSkeleton(node) {
  if (Array.isArray(node)) return node.flatMap(drawnSkeleton);
  if (node === null || typeof node !== "object") return [];
  if (typeof node.type === "function") return drawnSkeleton(node.rendered);
  if (node.type === "Fragment") return drawnSkeleton(node.props.children);
  return [{ tag: node.type, classes: classSet(node.props.className), children: drawnSkeleton(node.props.children) }];
}

/** A skeleton in words, for a failure to show: `div.list-row(span.face.list-row-face div.list-row-name …)`. */
const spell = (nodes) =>
  nodes
    .map(
      (n) =>
        `${n.tag}${n.classes.map((c) => `.${c}`).join("")}${n.children.length > 0 ? `(${spell(n.children)})` : ""}`,
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

/** A glyph, as the Icon draws one: an <svg class="icon">. */
const glyph = () => h("svg", { className: "icon" });
const ref = () => ({ current: null });
const onClick = () => undefined;
/** A made-up picture, drawn inline, so nothing is asked for. */
const PHOTO = "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 32 32'/%3E";

test("a skeleton is each element's tag, its classes as a set and what it holds, without the gallery's layout, a glyph's paths or the words", () => {
  assert.equal(
    spell(
      markupSkeleton(
        `<div class="gx-row"><span class="face" aria-hidden="true">AR</span> ` +
          `<span class="face face-glyph"><svg class="icon" width="12"><path d="M3 8h10"/></svg></span></div>`,
      ),
    ),
    "span.face span.face.face-glyph(svg.icon)",
  );
  assert.equal(
    spell(markupSkeleton(`<button type="button" class="btn btn-sm btn-primary">Save</button>`)),
    "button.btn.btn-primary.btn-sm",
    "the classes, in any order",
  );
  assert.equal(
    spell(markupSkeleton(`<span class="face">AR<img class="face-photo" src="${PHOTO}" alt=""></span>`)),
    "span.face(img.face-photo)",
    "an image holds nothing, and a value in quotes may hold what a tag does not",
  );
  assert.throws(() => markupSkeleton(`<div class="panel"><p>Hours</div>`), /<\/div> closes <p>/);
  assert.throws(() => markupSkeleton(`<section class="panel">Hours`), /<section> is never closed/);
  // The stub's tree, spelled alike: a component is what it drew, and a fragment what it holds.
  const Name = () =>
    h("Fragment", null, h("div", { className: "list-row-name" }, "Aisha"), h("svg", { className: "icon" }, h("path")));
  fresh();
  assert.equal(spell(settle(drawnSkeleton([h(Name), "words", null, false]))), "div.list-row-name svg.icon");
});

test("a family and a component part where either changes alone, where an entry has no drawing, and where a drawing has no entry", () => {
  const family = (entries) => [{ family: "Fixture", about: "", entries }];
  const save = { id: "btn-primary", html: `<button type="button" class="btn btn-primary">Save</button>` };
  const source = { id: "src-save", source: "styles/components.css:427", html: `<button class="save">Save</button>` };
  const drawings = { "btn-primary": () => h(Button, { variant: "primary" }, "Save") };
  assert.deepEqual(parting(family([save, source]), "Fixture", drawings), HELD, "a source is a page's, no component's");
  assert.deepEqual(
    parting(family([{ ...save, html: save.html.replace("btn-primary", "btn-ghost") }]), "Fixture", drawings).apart,
    ["btn-primary: the gallery draws button.btn.btn-ghost, the component button.btn.btn-primary"],
    "the gallery changed alone",
  );
  assert.deepEqual(
    parting(family([save]), "Fixture", { "btn-primary": () => h(Button, { variant: "danger" }, "Save") }).apart,
    ["btn-primary: the gallery draws button.btn.btn-primary, the component button.btn.btn-danger"],
    "the component changed alone",
  );
  assert.deepEqual(
    parting(family([save]), "Fixture", { "btn-primary": () => h(Button, { variant: "primary" }, glyph(), "Save") })
      .apart,
    ["btn-primary: the gallery draws button.btn.btn-primary, the component button.btn.btn-primary(svg.icon)"],
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
  const act = drawn(h(Button, { variant: "primary", className: "pl-act", ref: hold, onClick }, "Save"));
  assert.equal(act.type, "button");
  assert.equal(act.props.type, "button", "a button submits a form only when it is asked to");
  assert.equal(act.props.className, "btn btn-primary pl-act", "the page's layout class comes last");
  assert.equal(act.props.ref, hold, "the ref reaches the element");
  assert.equal(act.props.onClick, onClick);
  assert.deepEqual(
    ["variant", "tone", "iconOnly", "size", "href"].filter((p) => Object.hasOwn(act.props, p)),
    [],
    "the kit's props are not the element's attributes",
  );
  assert.equal(drawn(h(Button, { type: "submit" }, "Send")).props.type, "submit");
  const door = drawn(h(Button, { href: "/w/studio/#/clients", size: "sm", ref: hold }, "Open People"));
  assert.equal(door.type, "a", "a door is a link");
  assert.equal(door.props.href, "/w/studio/#/clients");
  assert.equal(door.props.className, "btn btn-sm");
  assert.equal(door.props.ref, hold);
  assert.equal(Object.hasOwn(door.props, "type"), false, "a link takes no button's type");
  const more = drawn(h(Button, { iconOnly: true, "aria-label": "More" }, glyph()));
  assert.equal(more.props["aria-label"], "More", "a glyph alone says its name");
  assert.equal(more.props.className, "btn btn-icon");
});

/** The gallery's Link button family, entry by entry. */
const LINK_BUTTONS = {
  "link-btn": () => h(LinkButton, null, "Write one", glyph()),
  "link-btn-danger": () => h(LinkButton, { tone: "danger" }, "Delete the list"),
};

test("LinkButton draws the gallery's Link button family, as a button of type button", () => {
  assert.deepEqual(parting(FAMILIES, "Link button", LINK_BUTTONS), HELD);
  const hold = ref();
  const words = drawn(h(LinkButton, { tone: "danger", className: "pl-end", ref: hold, onClick }, "Delete the list"));
  assert.equal(words.type, "button");
  assert.equal(words.props.type, "button", "it submits a form only when it is asked to");
  assert.equal(words.props.className, "link-btn link-btn-danger pl-end", "the page's layout class comes last");
  assert.equal(words.props.ref, hold);
  assert.equal(words.props.onClick, onClick);
  assert.equal(Object.hasOwn(words.props, "tone"), false, "its tone is a class, not an attribute");
  assert.equal(drawn(h(LinkButton, { type: "submit" }, "Send")).props.type, "submit");
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

test("Panel draws the gallery's Panel family, on a div unless it is a section", () => {
  assert.deepEqual(parting(FAMILIES, "Panel", PANELS), HELD);
  const hold = ref();
  const pane = drawn(h(Panel, { className: "set-card", ref: hold }, "Hours"));
  assert.equal(pane.type, "div");
  assert.equal(pane.props.className, "panel set-card", "the page's layout class comes last");
  assert.equal(pane.props.ref, hold);
  const pop = drawn(h(Panel, { as: "section", variant: "pop", size: "flush", ref: hold }, "Three services"));
  assert.equal(pop.type, "section");
  assert.equal(pop.props.className, "panel panel-pop panel-flush");
  assert.equal(pop.props.ref, hold);
  assert.deepEqual(
    ["as", "variant", "size"].filter((p) => Object.hasOwn(pop.props, p)),
    [],
    "the element it is drawn on and its look are not its attributes",
  );
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
  const face = drawn(h(Face, { initials: "AR", photo: PHOTO, className: "pl-face", ref: hold, "aria-hidden": false }));
  assert.equal(face.type, "span");
  assert.equal(face.props["aria-hidden"], "true");
  assert.equal(face.props.className, "face pl-face", "the page's layout class comes last");
  assert.equal(face.props.ref, hold);
  const [initials, picture] = face.props.children;
  assert.equal(initials, "AR");
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
});

/** A person's row, as the gallery draws it, with what was said or not and a note or not. */
const row = ({ said = true, note = false } = {}) =>
  h(ListRow, {
    face: { initials: "AR" },
    name: "Aisha Rahman",
    end: (place) => h("span", { className: cx("pill pill-warn", place) }, "Needs you"),
    said: said ? "asked about Saturday" : undefined,
    facts: ["Sat · 10:00", "2 h ago"],
    note: note ? "Next step: call back on Monday" : undefined,
  });

/** The gallery's List row family, entry by entry: the three shapes, then two of them again at a phone's width. */
const LIST_ROWS = {
  "list-row": () => row(),
  "list-row-two": () => row({ said: false }),
  "list-row-note": () => row({ note: true }),
  "list-row-twin": () => row({ note: true }),
  "list-row-two-twin": () => row({ said: false }),
};

test("ListRow draws the gallery's List row family, hands what trails its place, and draws no line of nothing", () => {
  assert.deepEqual(parting(FAMILIES, "List row", LIST_ROWS), HELD);
  const hold = ref();
  const places = [];
  const quiet = drawn(
    h(ListRow, {
      face: { initials: "AR", className: "pl-face" },
      name: "Aisha Rahman",
      end: (place) => {
        places.push(place);
        return h("time", { className: place }, "2 h ago");
      },
      said: "",
      facts: [null, "Sat · 10:00", false, ""],
      note: null,
      className: "pl-row",
      ref: hold,
    }),
  );
  assert.deepEqual(places, ["list-row-end"], "what trails is drawn once, with the class that stands it at the end");
  assert.equal(quiet.props.className, "list-row pl-row", "the page's layout class comes last");
  assert.equal(quiet.props.ref, hold);
  assert.equal(
    spell(settle(drawnSkeleton(quiet))),
    "div.list-row.pl-row(span.face.list-row-face.pl-face div.list-row-name time.list-row-end div.list-row-facts(span))",
    "no words said, no note and three facts of nothing draw nothing; the face keeps the page's class after the row's",
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
      "aria-label": "12 will get it, 3 by text",
      className: "cm-reach",
      ref: hold,
    }),
  );
  assert.equal(meter.props.role, "img");
  assert.equal(meter.props["aria-label"], "12 will get it, 3 by text", "what it says, since it draws no words");
  assert.equal(meter.props.className, "meter cm-reach", "the page's layout class comes last");
  assert.equal(meter.props.ref, hold);
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
