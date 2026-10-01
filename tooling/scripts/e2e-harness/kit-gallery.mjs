/**
 * The kit's gallery (docs/plans/2026-09-28-the-interface-kit-and-its-looks.md, §3.4 and step 2.3): one page that draws
 * every class of the kit in the app's own stylesheets, for e2e/kit/kit.spec.ts to check and for a person to review.
 *
 *   node tooling/scripts/e2e-harness/server.mjs 3210 kit        # http://localhost:3210/ ; t turns the theme, l the look
 *   corepack pnpm e2e:local -- e2e/kit/kit.spec.ts --scenario=kit   # the gallery's checks
 *
 * The harness serves it as the `kit` record's page (scenarios.mjs), and production never does (decision 7). It is
 * static markup, built on every request as the mockup's document is read (server.mjs), so an edit to an entry or to a
 * stylesheet shows on the next load. No React, no Babel, no fixture: each entry is the markup a kit component renders,
 * written out. Where the component is written in TSX (the Button, the link button, the panel, the face, the list row
 * and the meter, apps/dashboard/src/surfaces/kit/), styles/kit-components.test.mjs holds each entry of its family to
 * what it draws, element for element: the tag, the classes, and the attributes a stylesheet or a screen reader reads
 * (a type, disabled, hidden, an address, a role, aria-hidden, aria-label, aria-disabled, the gate's mark, a picture's
 * alt, a style's declarations). So an entry or a component changed alone in any of those is red.
 *
 * An entry is `{ id, html }` and, where it needs them:
 *   twin    the id of a source entry that draws what this one must compute equal to (the spec's check 4);
 *   source  marks an entry drawn only to be compared, with the `file:line` of its rule;
 *   width   "desk" or "phone", for a form only one width draws: the page holds it only at that width, where the spec
 *           judges it, so a rule keyed to the whole page never meets it at the other (the page's script takes it out
 *           there as the page loads: reload after changing the width);
 *   stage   "sheet" (480px tall, and on a phone 90% of the screen, since the record sheet's phone form is 88%) or
 *           "pop" (320px), for what is fixed or placed over the page: a stage is the containing block of what is fixed
 *           inside it, so a sheet, a wash, a menu or the toasts stand in it, not over the page;
 *   except  the longhands a twin does not compare: the spec compares every longhand of every element and pseudo-element
 *           of the pair, so what a primitive draws differently on purpose is named here, each argued where the twin
 *           is written;
 *   boxes   the twin also compares each element's box, relative to its stage.
 * Every class in classes.json is drawn by a kit entry, with every state its rules name as a class or an attribute (a
 * press, :hover or :focus, the spec forces): styles/kit-gallery.test.mjs holds the classes in CI, and the spec holds
 * every selector of kit.css in a browser. The words are made up, as every fixture's are.
 *
 * A rule keyed to the whole document (`:root:has(…)`) holds for the whole page: the sheets this page draws place the
 * toast stack for every entry, beside a sheet on a desk and above its foot on a phone. The bell's list, a desk's
 * twin, is not in a phone's page, where it would put the stack at the foot as the bell's panel does (mobile.css,
 * :root:has(.tbn-pop)), over a sheet's Save.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { GLYPHS, SHEET_SERVICES } from "./kit-shared.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const LEGACY = path.resolve(HERE, "../../../apps/dashboard/src/legacy");

/**
 * The names the kit's markup carries that classes.json lists as neither a class nor a modifier. A kit entry names one
 * of those, a name here, or the gallery's own layout (`gx-*`): each name here is drawn by a component of the kit and
 * styled by no kit rule, by a page's rule, or by one that has not moved into kit.css. When a kit rule names one, it
 * joins the registry (kit-css.test.mjs asks it to) and leaves this list, which kit-gallery.test.mjs holds: a name both
 * here and there, or here and drawn by no entry, is a stale line.
 */
export const UNLISTED = {
  "cl-bucket-link":
    "the quiet link button Confirm, EmptyState and FailedRead draw, under People's name for it (components.css)",
  "confirm-danger": "Confirm's mark on a question that destroys, which no stylesheet names yet (data-bits.jsx Confirm)",
  "pp-toast-ok":
    "usePPToast's tone class on a confirmation, which no stylesheet names (data-bits.jsx, pp-toast-<tone>)",
  "stabs-inbox": "the Inbox's strip as SurfaceTabs marks each group's (stabs-<group>), which no stylesheet names",
  "stabs-badge": "the count on a tab (SurfaceTabs), which mobile.css hides on a phone's Inbox",
  "rec-seg-label": "an option's label beside its hint (RecordToggleGroup), which no stylesheet names",
  "rec-combo-label": "an option's words beside its meta (RecordCombobox), which no stylesheet names",
};

/** Icon's markup (surfaces/kit/icon/icon.tsx), its size written on the element as Icon writes it. A glyph not here throws. */
const icon = (name, size) => {
  if (!Object.hasOwn(GLYPHS, name))
    throw new Error(`kit-gallery.mjs draws no glyph "${name}": add its paths to GLYPHS`);
  return (
    `<svg width="${size}" height="${size}" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" ` +
    `stroke-linecap="round" stroke-linejoin="round" class="icon" style="width: ${size}px; height: ${size}px;">` +
    `${GLYPHS[name]}</svg>`
  );
};

/** What a role's gate puts on a control it refuses (data-bits gatedProps). */
const gated = (why) => `data-gated="" aria-disabled="true" aria-description="${why}" data-tip="${why}"`;

/* ---- the record kit's parts, as the kit (surfaces/kit/record: row, field, fold) renders them ---- */

/** A row's act (RecordRow): its words, an arrow for an act that goes to another page, and the phone's chevron. */
const recAct = (words, arrow = false) =>
  `<button type="button" class="rec-row-act"><span class="rec-row-act-words">${words}</span>` +
  (arrow ? `<span class="rec-row-act-icon" aria-hidden="true">${icon("arrow-right", 10)}</span>` : "") +
  `<span class="rec-row-chev" aria-hidden="true">${icon("chevron", 11)}</span></button>`;

/** Save and Cancel (RecordFoot), with the page's line or the keys that do the same. */
const recFoot = ({ note = null, keys = null, saving = false } = {}) =>
  `<div class="rec-foot">` +
  `<button type="button" class="btn btn-sm btn-primary"${saving ? ' aria-disabled="true" aria-busy="true"' : ""}>` +
  `${saving ? "Saving…" : "Save"}</button>` +
  `<button type="button" class="btn btn-sm btn-ghost"${saving ? ' aria-disabled="true"' : ""}>Cancel</button>` +
  (note ? `<span class="rec-foot-note">${note}</span>` : "") +
  (keys ? `<span class="rec-foot-keys">${keys}</span>` : "") +
  `</div>`;

/** What saving writes (RecordSays): the lines it adds, one just changed, and the lines it takes away. */
const recSays = ({ inline = false, note = null } = {}) =>
  `<div class="rec-says"${inline ? ' data-inline="true"' : ""}>` +
  (note ? `<p class="rec-says-note">${note}</p>` : "") +
  `<div class="rec-says-part" data-part="says"><span class="rec-says-eyebrow">It will be told</span>` +
  `<pre><span class="rec-says-line">Open Monday to Friday, 9:30 to 6.</span>\n` +
  `<span class="rec-says-line" data-changed="true">Closed on public holidays.</span></pre></div>` +
  (inline
    ? ""
    : `<div class="rec-says-part" data-part="gone"><span class="rec-says-eyebrow">It stops being told</span>` +
      `<pre><span class="rec-says-line">Open on public holidays.</span></pre></div>`) +
  `</div>`;

/** A field (RecordField): its label holding the box, and a hint under it. */
const recField = (label, value, hint = null) =>
  `<div class="rec-field"><label><span class="rec-field-label">${label}</span>` +
  `<input type="text" class="rec-input" value="${value}"></label>` +
  (hint ? `<span class="rec-hint">${hint}</span>` : "") +
  `</div>`;

/** The combobox (RecordCombobox), closed on an empty box with its placeholder, or open on its list. */
const recCombo = ({ open = false, label = "Languages", placeholder = "Add a language" } = {}) =>
  `<div class="rec-combo" data-open="${open ? "true" : "false"}">` +
  `<span class="rec-combo-field"><span class="rec-combo-glass" aria-hidden="true">${icon("search", 12)}</span>` +
  `<input type="text" class="rec-combo-input" role="combobox" aria-label="${label}" aria-expanded="${open}" ` +
  `aria-autocomplete="list" autocomplete="off" spellcheck="false" placeholder="${placeholder}" value="${open ? "Sp" : ""}">` +
  `</span>` +
  `<ul class="rec-combo-list" role="listbox" aria-label="${label}" tabindex="-1"${open ? "" : " hidden"}>` +
  (open
    ? `<li role="option" aria-selected="true" class="rec-combo-opt"><span class="rec-combo-label">Spanish</span><span class="rec-combo-meta">es</span></li>` +
      `<li role="option" aria-selected="false" class="rec-combo-opt" data-chosen="true"><span class="rec-combo-label">Spanish, Mexico</span>` +
      `<span class="rec-combo-meta">es-MX</span></li>` +
      `<li role="option" aria-selected="false" class="rec-combo-opt"><span class="rec-combo-label">Add “Sp”</span></li>`
    : "") +
  `</ul></div>`;

/** A switch (RecordSwitch). */
const recSwitch = (on, label, readOnly = false) =>
  `<button type="button" role="switch" class="rec-switch" aria-checked="${on}" aria-label="${label}"` +
  `${readOnly ? ' aria-disabled="true"' : ""}><span class="rec-knob" aria-hidden="true"></span></button>`;

/** A choice of a few (RecordToggleGroup): the chosen one, then the rest. */
const recSeg = (label, options, chosen) =>
  `<div class="rec-seg" role="radiogroup" aria-label="${label}">` +
  options
    .map(
      (o) =>
        `<button type="button" role="radio" class="rec-seg-btn" aria-checked="${o === chosen}" ` +
        `tabindex="${o === chosen ? 0 : -1}">${o}</button>`,
    )
    .join("") +
  `</div>`;

/** A sheet's head (RecordSheet and a fold's sheet): its title, its line, its Close. */
const recSheetHead = (title, sub) =>
  `<header class="rec-sheet-head"><div class="rec-sheet-heading"><h2 class="rec-sheet-title">${title}</h2>` +
  `<p class="rec-sheet-sub">${sub}</p></div>` +
  `<button type="button" class="rec-sheet-close" aria-label="Close">${icon("x", 13)}</button></header>`;

/** The rows of the services sheet: a name, how long it takes, and the act that changes it. */
const SERVICE_ROWS = [
  ["Consultation", "45 minutes"],
  ["Follow-up visit", "30 minutes"],
  ["Full treatment", "2 hours"],
]
  .map(
    ([name, long]) =>
      `<div class="rec-row" data-empty="false" data-act="true"><span class="rec-row-key">${name}</span>` +
      `<div class="rec-row-val"><span class="rec-row-value">${long}</span></div>${recAct("Change")}</div>`,
  )
  .join("");

/** A record sheet over its wash; `leaving` draws the still copies that play its leaving (data-bits leaving). */
const recSheet = (leaving = false) =>
  `<div class="rec-sheet-backdrop" aria-hidden="true"${leaving ? ' data-leaving="true"' : ""}></div>` +
  `<section class="rec-sheet" role="dialog" aria-modal="true" aria-label="Services" tabindex="-1"` +
  `${leaving ? ' data-leaving="true"' : ""}>` +
  recSheetHead("Services", "What you offer, and how long each takes.") +
  `<div class="rec-sheet-tools">${recCombo({ label: "Find a service", placeholder: "Find a service" })}` +
  `<span class="rec-sr" role="status" aria-live="polite">3 services</span></div>` +
  `<div class="rec-sheet-body">${SERVICE_ROWS}</div>` +
  `<footer class="rec-sheet-foot">${recFoot({ note: "Saved for every line." })}</footer></section>`;

/** A fold drawn as a sheet (RecordFold's `frame`), its row behind it; `leaving` draws the copies that go. */
const recFoldSheet = (leaving = false) =>
  (leaving
    ? ""
    : `<div class="rec-fold-behind" aria-hidden="true" inert><section class="rec-card">` +
      `<div class="rec-row" data-empty="false" data-act="true"><span class="rec-row-key">Hours</span>` +
      `<div class="rec-row-val"><span class="rec-row-value">Monday to Friday, 9:30 to 6</span></div>` +
      `${recAct("Change")}</div></section></div>`) +
  `<div class="rec-sheet-backdrop" data-fold="true" aria-hidden="true"${leaving ? ' data-leaving="true"' : ""}></div>` +
  `<section class="rec-sheet rec-fold-sheet" role="dialog" aria-modal="true" aria-label="Hours" data-open="true"` +
  `${leaving ? ' data-leaving="true"' : ""}>` +
  recSheetHead("Hours", "When you are open, each day.") +
  `<div class="rec-sheet-body"><div class="rec-fold-inner">` +
  recField("Monday opens", "09:30") +
  recField("Monday closes", "18:00") +
  `</div></div>` +
  `<footer class="rec-sheet-foot">${recFoot()}</footer></section>`;

/** Rows in a card (the record's card). */
const recCard = (rows, head = "") => `<section class="rec-card">${head}${rows}</section>`;

/* ---- what step 2.2's primitives and their sources hold alike, so a twin and its source differ only in their own ---- */

/** A pane's words: a heading and a line. */
const PANE_WORDS = `<h3>Hours</h3><p>Open today until six.</p>`;
/** Rows edge to edge, as a flush panel holds them: the gallery's own rows, a hairline between them. */
const PANE_ROWS = ["Consultation", "Follow-up visit", "Full treatment"]
  .map((name) => `<div class="gx-panel-row">${name}</div>`)
  .join("");

/**
 * What a bare face's twin does not compare: where the row places its face (a grid row and column, and its alignment),
 * which is .list-row-face's and is compared in the row's twin; and its tag, a div in plRowCard, whose text direction a
 * block isolates, where the kit draws a span beside words. That it never shrinks is the face's own, as its source's.
 */
const FACE_APART = ["grid-column-start", "grid-row-start", "grid-row-end", "align-self", "unicode-bidi"];

/** A face's picture: a made-up one, drawn inline, so the page asks for nothing. */
const PHOTO =
  "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 32 32'%3E%3Crect width='32' height='32' " +
  "fill='%23a3a3a3'/%3E%3Ccircle cx='16' cy='13' r='6' fill='%23e5e5e5'/%3E%3Cpath d='M5 32a11 11 0 0 1 22 0' " +
  "fill='%23e5e5e5'/%3E%3C/svg%3E";

/**
 * A person's row on a phone, as the kit draws it, with a line of words said or not, a note under it or not, and as a
 * link to their page or not.
 */
const listRow = ({ said = true, note = false, door = false } = {}) =>
  (door ? `<a class="list-row" href="#kit">` : `<div class="list-row">`) +
  `<span class="face list-row-face" aria-hidden="true">AR</span>` +
  `<div class="list-row-name">Aisha Rahman</div><span class="pill pill-warn list-row-end">Needs you</span>` +
  (said ? `<div class="list-row-said">asked about Saturday</div>` : "") +
  `<div class="list-row-facts"><span>Sat · 10:00</span><span>2 h ago</span></div>` +
  (note ? `<div class="list-row-note">Next step: call back on Monday</div>` : "") +
  (door ? `</a>` : `</div>`);
/** The same row as People's plRowCard draws it (surfaces/people/cells/row-card.tsx), the classes it draws with and the same words. */
const plCard = ({ said = true, note = false } = {}) =>
  `<div class="pl-card"><div class="ix-thread-avatar pl-card-face" aria-hidden="true">AR</div>` +
  `<div class="pl-card-name">Aisha Rahman</div><span class="pill pill-warn">Needs you</span>` +
  (said ? `<div class="pl-card-lead">asked about Saturday</div>` : "") +
  `<div class="pl-card-facts"><span>Sat · 10:00</span><span>2 h ago</span></div>` +
  (note ? `<div class="pl-card-tail">Next step: call back on Monday</div>` : "") +
  `</div>`;

/** A chart's parts, as SegmentBar is given its rows: a name, a share and a series colour. */
const SERIES = [
  ["WhatsApp", 12, "--chart-cat-1"],
  ["text", 7, "--chart-cat-2"],
  ["email", 3, "--chart-cat-3"],
];
/** One part of a chart's, the one part a meter has. */
const ONE_PART = SERIES.slice(0, 1);
/** A meter's words for a screen reader, as SegmentBar says its parts. */
const partsLabel = (parts) => parts.map(([name, share]) => `${share} ${name}`).join(", ");
/** The parts, each its share and its colour inline, as SegmentBar writes them (surfaces/kit/charts/card.tsx). */
const partsHtml = (parts, tag, cls) =>
  parts
    .map(
      ([, share, colour]) =>
        `<${tag}${cls ? ` class="${cls}"` : ""} style="flex-grow: ${share}; background: var(${colour})"></${tag}>`,
    )
    .join("");
/** A meter of a chart's parts, as the kit draws it; `size` is "", " meter-lg" or " meter-sm". */
const meter = (size, parts = SERIES) =>
  `<div class="meter${size}" role="img" aria-label="${partsLabel(parts)}">${partsHtml(parts, "span", "meter-part")}</div>`;
/** The same parts as SegmentBar draws its bar: its classes, and an <i> for each part; `size` is "" or " small". */
const segbar = (size, parts = SERIES) =>
  `<div class="ck-segbar-bar${size}" role="img" aria-label="${partsLabel(parts)}">${partsHtml(parts, "i", null)}</div>`;

/** What 2.4's Sheet holds, the composer: the record sheet's head, its rows and its foot. */
const SHEET_PARTS =
  recSheetHead("Services", "What you offer, and how long each takes.") +
  `<div class="rec-sheet-body">${SERVICE_ROWS}</div>` +
  `<footer class="rec-sheet-foot">${recFoot({ note: "Saved for every line." })}</footer>`;
/** The one attribute the still copies that play a leaving carry (data-bits leaving). */
const going = (leaving) => (leaving ? ' data-leaving="true"' : "");
/**
 * The kit's sheet over its wash, the composer inside; `handle` draws the handle a phone shows (a desk hides it, and the
 * record sheet, a desk's twin, has none), `leaving` the still copies that play its leaving.
 */
const sheet = ({ handle = true, leaving = false } = {}) =>
  `<div class="sheet-backdrop" aria-hidden="true"${going(leaving)}></div>` +
  `<section class="sheet" role="dialog" aria-modal="true" aria-label="Services" tabindex="-1"${going(leaving)}>` +
  (handle ? `<div class="sheet-handle" aria-hidden="true"></div>` : "") +
  `${SHEET_PARTS}</section>`;
/** The same composer in RecordSheet's frame (surfaces/kit/record/sheet.tsx), a desk's twin. */
const recSheetFrame = (leaving = false) =>
  `<div class="rec-sheet-backdrop" aria-hidden="true"${going(leaving)}></div>` +
  `<section class="rec-sheet" role="dialog" aria-modal="true" aria-label="Services" tabindex="-1"${going(leaving)}>` +
  `${SHEET_PARTS}</section>`;
/** The same composer in PhoneSheet's frame and its handle (surfaces/people/sheets/phone-sheet.tsx), a phone's twin. */
const phoneSheetFrame = (leaving = false) =>
  `<div class="sb-sheet-backdrop"${going(leaving)}></div>` +
  `<div class="sb-sheet pl-sheet pp-sheet" role="dialog" aria-modal="true" aria-label="Services"${going(leaving)}>` +
  `<div class="pp-sheet-handle" aria-hidden="true"></div>${SHEET_PARTS}</div>`;
/** A toast raised while the sheet is open, which stands clear of its foot. */
const SHEET_TOAST =
  `<div class="pp-toast-stack"><div class="pp-toast pp-toast-ok" data-tone="ok" role="status">${icon("check", 13)}` +
  `<span class="pp-toast-msg"><b>Follow-up visit</b> is 45 minutes now</span>` +
  `<button type="button" class="pp-toast-cta">Undo</button>` +
  `<button type="button" class="pp-toast-x" aria-label="Dismiss">${icon("x", 11)}</button></div></div>`;
/**
 * What the phone's twin does not compare. The one difference on purpose (the plan's spec, 3.5): a column where
 * PhoneSheet is a block, so its display and direction, and the handle's shrinking, which a column reads and a block
 * never does; the twin compares every element's box instead, which a column that laid out otherwise would move. And
 * the ring a focus draws: PhoneSheet takes no focus (it has no tabindex), so the ring the browser draws on it under the
 * spec's forced focus is one no member sees, where the kit's sheet takes focus as it opens, so a screen reader names
 * it, and draws no ring, as the record sheet does (kit.css, .rec-sheet:focus; the desk's twin holds the two equal).
 */
const SHEET_APART = [
  ...["display", "flex-direction", "flex-shrink"],
  ...["outline-color", "outline-style", "outline-width"],
];

/* ---- the kit's components on Base UI, as they draw themselves (step 2.5; kit-behaves.tsx draws the same) ---- */

/** Where a popup stands in its stage: Base UI places its positioner against the window with a style of its own. */
const placed = (where) => `style="position: absolute; ${where}"`;

/** A field of the kit's (Base UI's Field): its label beside its box, and a hint under it or none. */
const kitBox = (label, value, hint = null) =>
  `<div class="rec-field"><label><span class="rec-field-label">${label}</span></label>` +
  `<input class="rec-input" type="text" value="${value}">` +
  (hint ? `<span class="rec-hint">${hint}</span>` : "") +
  `</div>`;

/** The rows the running page's sheet holds: a service each, and how long it takes (kit-shared.mjs). */
const KIT_ROWS = SHEET_SERVICES.map(
  ([name, long]) =>
    `<div class="rec-row" data-empty="false"><span class="rec-row-key">${name}</span>` +
    `<div class="rec-row-val"><span class="rec-row-value">${long}</span></div></div>`,
).join("");

/** The kit's Sheet, open: the control that opened it, the wash, and the dialog with the composer in it. */
const kitSheet = () =>
  `<button type="button" class="btn">Open the services</button>` +
  `<div class="sheet-backdrop" role="presentation" aria-hidden="true"></div>` +
  `<section class="sheet" role="dialog" tabindex="-1">` +
  `<div class="sheet-handle" aria-hidden="true"></div>` +
  `<header class="rec-sheet-head"><div class="rec-sheet-heading"><h2 class="rec-sheet-title">Services</h2>` +
  `<p class="rec-sheet-sub">What you offer, and how long each takes.</p></div>` +
  `<button type="button" tabindex="0" aria-label="Close" class="rec-sheet-close">${icon("x", 13)}</button></header>` +
  `<div class="rec-sheet-tools">${kitBox("Find a service", "")}</div>` +
  `<div class="rec-sheet-body">${KIT_ROWS}</div>` +
  `<footer class="rec-sheet-foot"><div class="rec-foot">` +
  `<button type="button" class="btn btn-sm btn-primary">Save</button>` +
  `<button type="button" class="btn btn-sm btn-ghost">Cancel</button>` +
  `<button type="button" tabindex="0" aria-label="More for the services" aria-haspopup="menu" aria-expanded="false" ` +
  `class="btn btn-icon btn-sm btn-ghost">${icon("more", 14)}</button></div></footer></section>`;

/** A menu item of the kit's: a button, with its glyph, its words and what follows them. */
const kitItem = (glyphName, label, { tone = "", after = "" } = {}) =>
  `<button type="button" aria-disabled="false" role="menuitem" tabindex="-1" class="more-item${tone}">` +
  `${icon(glyphName, 13)}<span class="more-item-label">${label}</span>${after}</button>`;

/** The kit's Menu, open under its control: a group under its heading, a line, a door and the danger item. */
const kitMenu = () =>
  `<button type="button" tabindex="0" aria-label="More" aria-haspopup="menu" aria-expanded="true" ` +
  `class="btn btn-icon btn-sm btn-ghost">${icon("more", 14)}</button>` +
  `<div class="pop-place" role="presentation" ${placed("top: 56px; left: 16px;")}>` +
  `<div class="more-menu align-right" role="menu" tabindex="-1">` +
  `<div role="group"><div class="more-header" aria-hidden="true">Sam Ortega</div>` +
  kitItem("copy", "Copy number") +
  kitItem("calendar", "Send booking link", { after: `<span class="more-item-meta">By text</span>` }) +
  kitItem("pause", "Pause the receptionist", { after: `<span class="more-item-hint">until 10:00</span>` }) +
  `</div>` +
  `<div class="more-divider" role="separator" aria-orientation="horizontal"></div>` +
  `<a role="menuitem" tabindex="-1" href="#kit" class="more-item">${icon("user", 13)}` +
  `<span class="more-item-label">Open their page</span></a>` +
  kitItem("x", "Delete person…", { tone: " danger" }) +
  `</div></div>`;

/** The kit's Menu of one of a set, open: the tick drawn on each option, seen beside the one chosen. */
const kitMenuSet = () =>
  `<button type="button" tabindex="0" aria-haspopup="menu" aria-expanded="true" class="btn btn-sm">Sort ` +
  `${icon("chevron-down", 10)}</button>` +
  `<div class="pop-place" role="presentation" ${placed("top: 56px; left: 16px;")}>` +
  `<div class="more-menu align-left" role="menu" tabindex="-1"><div role="group">` +
  [
    ["Newest first", true],
    ["Oldest first", false],
    ["By name", false],
  ]
    .map(
      ([label, on]) =>
        `<button type="button" aria-disabled="false" role="menuitemradio" tabindex="-1" aria-checked="${on}" ` +
        `class="more-item">${icon("check", 13)}<span class="more-item-label">${label}</span></button>`,
    )
    .join("") +
  `</div></div></div>`;

/** The kit's Popover, open under its control: Base UI's dialog on the panel's pop. */
const kitPopover = () =>
  `<button type="button" tabindex="0" aria-haspopup="dialog" aria-expanded="true" class="btn btn-sm">Hours</button>` +
  `<div class="pop-place" role="presentation" ${placed("top: 56px; left: 16px;")}>` +
  `<div class="panel panel-pop panel-sm" role="dialog" tabindex="-1" aria-label="Hours">` +
  `<p class="gx-pop-words">Open today until six.</p>` +
  `<button type="button" class="btn btn-sm">Change the hours</button></div></div>`;

/** The kit's Tooltip, shown over its control. */
const kitTooltip = () =>
  `<button type="button" class="btn btn-sm">Export</button>` +
  `<div class="tip-place" role="presentation" ${placed("top: 56px; left: 16px;")}>` +
  `<div class="ui-tip show" tabindex="-1">Only an owner can export this workspace's people.</div></div>`;

/** An option of the kit's select or combobox: its words and its word at the end, walked to, chosen, or neither. */
const kitOption = (label, meta, { chosen = false, walked = false, focus = null } = {}) =>
  `<div role="option" aria-selected="${chosen}"${focus === null ? "" : ` tabindex="${focus}"`} class="rec-combo-opt"` +
  `${chosen ? ' data-selected="" data-chosen="true"' : ""}${walked ? ' data-highlighted=""' : ""}>` +
  `<span class="rec-combo-label">${label}</span><span class="rec-combo-meta">${meta}</span></div>`;

/** The kit's Select in its Field, open: its box a button, its list over the page, the one chosen walked to. */
const kitSelect = () =>
  `<div class="rec-field"><label><span class="rec-field-label">Service</span></label>` +
  `<button type="button" tabindex="0" role="combobox" aria-expanded="true" aria-haspopup="listbox" ` +
  `class="rec-input rec-select"><span>Consultation</span><span aria-hidden="true">${icon("chevron-down", 12)}</span>` +
  `</button><span class="rec-hint">What the proposal is for.</span></div>` +
  `<div class="pop-place" role="presentation" ${placed("top: 88px; left: 16px; --anchor-width: 240px;")}>` +
  `<div class="panel panel-pop panel-flush rec-combo-pop" role="presentation" tabindex="-1">` +
  `<div class="rec-combo-list" role="listbox">` +
  kitOption("Consultation", "45m", { chosen: true, walked: true, focus: 0 }) +
  kitOption("Follow-up visit", "30m", { focus: -1 }) +
  kitOption("Full treatment", "2h", { focus: -1 }) +
  `</div></div></div>`;

/** The kit's Combobox, typed into: its box, and its matches over the page, the first walked to. */
const kitCombobox = () =>
  `<div class="rec-combo" role="group"><span class="rec-combo-field">` +
  `<span class="rec-combo-glass" aria-hidden="true">${icon("search", 12)}</span>` +
  `<input class="rec-combo-input" role="combobox" aria-label="Languages" aria-expanded="true" ` +
  `aria-haspopup="listbox" aria-autocomplete="list" autocomplete="off" spellcheck="false" ` +
  `placeholder="Add a language" value="Sp"></span></div>` +
  `<div class="pop-place" role="presentation" ${placed("top: 56px; left: 16px; --anchor-width: 240px;")}>` +
  `<div class="panel panel-pop panel-flush rec-combo-pop" role="presentation" tabindex="-1">` +
  `<div class="rec-combo-list" role="listbox" tabindex="-1" aria-label="Languages">` +
  kitOption("Spanish", "es", { walked: true }) +
  kitOption("Spanish, Mexico", "es-MX") +
  `</div></div></div>`;

/** The kit's toast, raised: Base UI's region wearing the house's stack, a confirmation with its Undo and its ×. */
const kitToast = () =>
  `<div class="pp-toast-stack" role="region" tabindex="-1" aria-live="polite" aria-label="Notifications">` +
  `<div class="pp-toast pp-toast-ok" data-tone="ok" role="dialog" tabindex="0" aria-modal="false">${icon("check", 13)}` +
  `<span class="pp-toast-msg">Saved for every line.</span>` +
  `<button type="button" tabindex="0" class="pp-toast-cta">Undo</button>` +
  `<button type="button" tabindex="0" aria-hidden="true" aria-label="Dismiss" class="pp-toast-x">${icon("x", 11)}` +
  `</button></div></div>`;

/** A switch of the kit's (Base UI's Switch): on or off, read-only or not. */
const kitSwitch = (on, label, readOnly = false) =>
  `<button type="button" tabindex="0" role="switch" aria-checked="${on}"${readOnly ? ' aria-readonly="true"' : ""} ` +
  `aria-label="${label}" class="rec-switch"><span aria-hidden="true" class="rec-knob"></span></button>`;

/** The kit's switches: off, on, read-only. */
const kitSwitches = () =>
  kitSwitch(false, "Send it now") + kitSwitch(true, "Remind them the day before") + kitSwitch(true, "Take calls", true);

/** The kit's segmented control: a radio group of three, the second chosen. */
const kitSegmented = () =>
  `<div role="radiogroup" aria-label="How often" class="rec-seg">` +
  [
    ["Once", false],
    ["Every week", true],
    ["Every month", false],
  ]
    .map(
      ([label, on]) =>
        `<button type="button" tabindex="${on ? 0 : -1}" role="radio" aria-checked="${on}" class="rec-seg-btn">` +
        `${label}</button>`,
    )
    .join("") +
  `</div>`;

/** The kit's segmented control with a sentence under each option. */
const kitSegmentedHints = () =>
  `<div role="radiogroup" aria-label="Who it answers" data-hints="true" class="rec-seg">` +
  [
    ["Everyone", "Every caller and every message.", true],
    ["People it knows", "A new number is handed to you.", false],
  ]
    .map(
      ([label, hint, on]) =>
        `<button type="button" tabindex="${on ? 0 : -1}" role="radio" aria-checked="${on}" class="rec-seg-btn">` +
        `<span class="rec-seg-label">${label}</span><span class="rec-seg-hint">${hint}</span></button>`,
    )
    .join("") +
  `</div>`;

/** The kit's fields: a hint under the box, and a unit beside it. */
const kitFields = () =>
  kitBox("Booking link", "https://example.com/book", "Sent instead of booking a visit itself.") +
  `<div class="rec-field"><label><span class="rec-field-label">Least notice</span></label>` +
  `<span class="rec-input-group"><input class="rec-input" type="text" value="24">` +
  `<span class="rec-input-unit">hours</span></span></div>`;

/** The kit's fields: what is wrong, marked on the box and said under it; and a box of sentences. */
const kitFieldsWrong = () =>
  `<div class="rec-field"><label><span class="rec-field-label">Website</span></label>` +
  `<input class="rec-input" type="text" aria-invalid="true" value="northside studio">` +
  `<span class="field-error" role="alert">${icon("alert", 11)}` +
  `<span class="field-error-words">A website starts with https://.</span></span></div>` +
  `<div class="rec-field"><label><span class="rec-field-label">What fits no field</span></label>` +
  `<textarea class="rec-input" rows="3">Parking is behind the building, through the gate.</textarea></div>`;

/* ---- the families ---- */

/** The kit's families and their entries. Every class in classes.json is drawn by at least one entry. */
export const FAMILIES = [
  {
    family: "Button",
    about:
      "The button: secondary, primary, quiet and danger; small, and a glyph alone; a link drawn as one; off; refused by a role.",
    entries: [
      {
        id: "btn",
        html: `<button type="button" class="btn">Export</button> <button type="button" class="btn">${icon("plus", 13)}Add a person</button>`,
      },
      { id: "btn-primary", html: `<button type="button" class="btn btn-primary">${icon("check", 13)}Save</button>` },
      { id: "btn-ghost", html: `<button type="button" class="btn btn-ghost">Cancel</button>` },
      { id: "btn-danger", html: `<button type="button" class="btn btn-danger">${icon("x", 13)}Yes, delete</button>` },
      { id: "btn-danger-quiet", html: `<button type="button" class="btn danger">Delete…</button>` },
      {
        id: "btn-sm",
        html:
          `<button type="button" class="btn btn-sm">Retry</button> ` +
          `<button type="button" class="btn btn-sm btn-primary">Save</button> ` +
          `<button type="button" class="btn btn-sm btn-ghost">Cancel</button>`,
      },
      {
        id: "btn-icon",
        html:
          `<button type="button" class="btn btn-icon" aria-label="More">${icon("more", 14)}</button> ` +
          `<button type="button" class="btn btn-icon btn-sm" aria-label="Close">${icon("x", 12)}</button>`,
      },
      { id: "btn-link", html: `<a class="btn" href="#kit">${icon("copy", 13)}Download the QR code</a>` },
      {
        id: "btn-disabled",
        html:
          `<button type="button" class="btn" disabled>Export</button> ` +
          `<button type="button" class="btn btn-primary" disabled>Save</button> ` +
          `<button type="button" class="btn btn-ghost" disabled>Cancel</button> ` +
          `<button type="button" class="btn btn-sm btn-danger" disabled>Yes, delete</button>`,
      },
      {
        id: "btn-gated",
        html:
          `<button type="button" class="btn" ${gated("Only an owner can export.")}>Export</button> ` +
          `<button type="button" class="btn btn-primary" ${gated("Only an owner can save this.")}>Save</button> ` +
          `<button type="button" class="btn btn-ghost" ${gated("Only an owner can pause it.")}>Pause</button>`,
      },
    ],
  },
  {
    family: "Pill",
    about:
      "A state, as StatePill draws it: at rest its dot and its word (plain, ok); asking to be seen, its tone's ground " +
      "(warn, info, danger, the live accent, with its live dot); a glyph in place of the dot; a dot drawn by hand, " +
      "which the pill hides; and the live dot on its own.",
    entries: [
      { id: "pill", html: `<span class="pill" data-tone="plain">Draft</span>` },
      { id: "pill-ok", html: `<span class="pill pill-ok" data-tone="ok">Confirmed</span>` },
      { id: "pill-warn", html: `<span class="pill pill-warn" data-tone="warn">Needs you</span>` },
      { id: "pill-info", html: `<span class="pill pill-info" data-tone="info">Scheduled</span>` },
      { id: "pill-danger", html: `<span class="pill pill-danger" data-tone="danger">Failed</span>` },
      {
        id: "pill-accent",
        html: `<span class="pill pill-accent" data-tone="accent"><span class="live-dot" style="width: 5px; height: 5px;"></span>On a call</span>`,
      },
      { id: "pill-glyph", html: `<span class="pill pill-ok" data-tone="ok">${icon("check", 11)}Sent</span>` },
      { id: "pill-dot", html: `<span class="pill pill-ok" data-tone="ok"><span class="dot"></span>Confirmed</span>` },
      { id: "live-dot", html: `<div class="gx-row"><span class="live-dot"></span>On a call now</div>` },
    ],
  },
  {
    family: "Field",
    about:
      "The house's box outside the record kit: an input a page draws with .input on it, and the search box, its " +
      "glyph, its words and the key that finds it.",
    entries: [
      { id: "input", html: `<input class="input" value="Northside Studio" aria-label="Business name">` },
      {
        id: "input-search",
        html:
          `<div class="input">${icon("search", 14)}` +
          `<input placeholder="Search people" aria-label="Search people"><span class="kbd">/</span></div>`,
      },
    ],
  },
  {
    family: "Chip",
    about:
      "A name: a list, a person, a service. A hairline and no fill; one that opens is a button or a link; one that comes off carries its ×; one whose name outruns its column wraps.",
    entries: [
      { id: "chip", html: `<span class="chip">Regulars</span>` },
      { id: "chip-button", html: `<button type="button" class="chip">Walk-ins</button>` },
      { id: "chip-link", html: `<a class="chip" href="#kit">Consultation</a>` },
      {
        id: "chip-x",
        html:
          `<span class="chip"><button type="button">Regulars</button>` +
          `<button type="button" class="chip-x" aria-label="Take Sam Ortega off Regulars">${icon("x", 9)}</button></span>`,
      },
      {
        id: "chip-wrap",
        html: `<div class="gx-narrow"><span class="chip chip-wrap">Came in the last 90 days and booked twice or more</span></div>`,
      },
    ],
  },
  {
    family: "Tally",
    about: "A number riding on a tab, a nav row, a filter or an icon: grey for a total, amber for people who need you.",
    entries: [
      { id: "tally", html: `<span class="tally">12</span>` },
      { id: "tally-warn", html: `<span class="tally tally-warn">3</span>` },
      { id: "tally-icon", html: `${icon("bell", 16)} <span class="tally tally-icon">4</span>` },
      { id: "tally-icon-warn", html: `${icon("inbox", 16)} <span class="tally tally-icon tally-warn">2</span>` },
    ],
  },
  {
    family: "Mark",
    about: "What kind of row this is, on a notification or an agenda item: neutral always.",
    entries: [
      {
        id: "mark",
        html: `<span class="mark">${icon("phone", 13)}</span> <span class="mark">${icon("calendar", 13)}</span>`,
      },
    ],
  },
  {
    family: "Avatar",
    about: "The member's own face: initials on the muted ink, 24px, and 20, 32 and 44.",
    entries: [
      { id: "avatar", html: `<div class="avatar">EO</div>` },
      { id: "avatar-sm", html: `<div class="avatar avatar-sm">EO</div>` },
      { id: "avatar-lg", html: `<div class="avatar avatar-lg">EO</div>` },
      { id: "avatar-xl", html: `<div class="avatar avatar-xl">EO</div>` },
    ],
  },
  {
    family: "Empty state and failed read",
    about:
      "Nothing here and couldn't read, as EmptyState and FailedRead say them: a pane's, a card's and a line's; centred in a table; a day with nothing left; a read that failed.",
    entries: [
      {
        id: "empty-page",
        html:
          `<div class="empty empty-page"><div class="empty-glyph">${icon("inbox", 24)}</div>` +
          `<div class="empty-words"><div class="empty-title">Nothing waiting on you</div>` +
          `<div class="empty-body">When a conversation needs a person, it lands here.</div></div>` +
          `<div class="empty-acts"><button type="button" class="btn btn-primary btn-sm">See what it handled</button>` +
          `<button type="button" class="btn btn-ghost btn-sm">Open the settings</button></div></div>`,
      },
      {
        id: "empty-card",
        html:
          `<div class="empty empty-card"><div class="empty-glyph">${icon("calendar", 16)}</div>` +
          `<div class="empty-words"><div class="empty-title">No visits this week</div>` +
          `<div class="empty-body">Booked visits show here with who is coming.</div></div>` +
          `<div class="empty-acts"><button type="button" class="btn btn-sm">Share the booking link</button></div></div>`,
      },
      {
        id: "empty-line",
        html:
          `<div class="empty empty-line"><div class="empty-words"><div class="empty-title">No notes yet.</div>` +
          `<div class="empty-body">What the team writes about them stays here.</div></div>` +
          `<div class="empty-acts"><button type="button" class="cl-bucket-link">Write one${icon("arrow-right", 10)}</button></div></div>`,
      },
      {
        id: "empty-center",
        html:
          `<div class="empty empty-line empty-center"><div class="empty-words"><div class="empty-title">Nobody matches.</div>` +
          `<div class="empty-body">Try fewer words.</div></div></div>`,
      },
      {
        id: "empty-ok",
        html:
          `<div class="empty empty-card empty-ok"><div class="empty-glyph">${icon("check", 16)}</div>` +
          `<div class="empty-words"><div class="empty-title">Nothing left for today</div>` +
          `<div class="empty-body">Every conversation is answered.</div></div></div>`,
      },
      {
        id: "empty-failed",
        html:
          `<div class="empty empty-card empty-failed" role="status"><div class="empty-glyph">${icon("alert", 16)}</div>` +
          `<div class="empty-words"><div class="empty-title">Couldn't read your team</div>` +
          `<div class="empty-body">Everything else here is current, and the receptionist keeps working.</div></div>` +
          `<div class="empty-acts"><button type="button" class="btn btn-sm">${icon("refresh", 11)} Retry</button></div></div>`,
      },
      {
        id: "empty-failed-line",
        html:
          `<div class="empty empty-line empty-failed" role="status"><div class="empty-glyph">${icon("alert", 13)}</div>` +
          `<div class="empty-words"><div class="empty-title">Couldn't read the calls</div>` +
          `<div class="empty-body">Everything else here is current.</div></div>` +
          `<div class="empty-acts"><button type="button" class="cl-bucket-link">${icon("refresh", 11)} Retry</button></div></div>`,
      },
    ],
  },
  {
    family: "Menu",
    about:
      "The one action menu, MoreMenu, open: a heading, items with their glyph, a second word or one at the end, a line between groups, the danger item, one a role refuses; one of a set; a menu placed against the window, and one not placed yet.",
    entries: [
      {
        id: "more-menu",
        stage: "pop",
        html:
          `<div class="gx-end"><div class="more-wrap">` +
          `<button type="button" class="btn btn-ghost btn-icon btn-sm" aria-haspopup="menu" aria-expanded="true" aria-label="More">${icon("more", 14)}</button>` +
          `<div class="more-backdrop"></div>` +
          `<div class="more-menu align-right" role="menu">` +
          `<div class="more-header">Sam Ortega</div>` +
          `<button class="more-item" role="menuitem">${icon("copy", 13)}<span class="more-item-label">Copy number</span></button>` +
          `<button class="more-item" role="menuitem">${icon("calendar", 13)}<span class="more-item-label">Send booking link</span>` +
          `<span class="more-item-meta">By text</span></button>` +
          `<button class="more-item" role="menuitem">${icon("pause", 13)}<span class="more-item-label">Pause the receptionist</span>` +
          `<span class="more-item-hint">until 10:00</span></button>` +
          `<div class="more-divider"></div>` +
          `<button class="more-item" role="menuitem" ${gated("Only an owner can export.")}>${icon("mail", 13)}` +
          `<span class="more-item-label">Export their history</span></button>` +
          `<button class="more-item danger" role="menuitem">${icon("x", 13)}<span class="more-item-label">Delete person…</span></button>` +
          `</div></div></div>`,
      },
      {
        id: "more-menu-set",
        stage: "pop",
        html:
          `<div class="more-wrap"><button type="button" class="btn btn-sm" aria-haspopup="menu" aria-expanded="true">Sort ${icon("chevron-down", 10)}</button>` +
          `<div class="more-backdrop"></div>` +
          `<div class="more-menu align-left" role="menu">` +
          `<button class="more-item" role="menuitemradio" aria-checked="true">${icon("check", 13)}<span class="more-item-label">Newest first</span></button>` +
          `<button class="more-item" role="menuitemradio" aria-checked="false">${icon("check", 13)}<span class="more-item-label">Oldest first</span></button>` +
          `<button class="more-item" role="menuitemradio" aria-checked="false">${icon("check", 13)}<span class="more-item-label">By name</span></button>` +
          `</div></div>`,
      },
      {
        id: "more-menu-escape",
        stage: "pop",
        html:
          `<div class="more-wrap"><button type="button" class="btn btn-ghost btn-icon btn-sm" aria-haspopup="menu" aria-expanded="true" aria-label="More">${icon("more", 14)}</button>` +
          `<div class="more-backdrop"></div>` +
          `<div class="more-menu align-right escape placed up" role="menu" style="left: 16px; top: 48px;">` +
          `<button class="more-item" role="menuitem">${icon("edit", 13)}<span class="more-item-label">Rename the list</span></button>` +
          `<button class="more-item" role="menuitem">${icon("copy", 13)}<span class="more-item-label">Copy the week</span></button>` +
          `</div></div>`,
      },
      {
        id: "more-menu-unplaced",
        html:
          `<div class="more-wrap"><button type="button" class="btn btn-ghost btn-icon btn-sm" aria-haspopup="menu" aria-expanded="true" aria-label="More">${icon("more", 14)}</button>` +
          `<div class="more-menu align-left escape" role="menu">` +
          `<button class="more-item" role="menuitem">${icon("copy", 13)}<span class="more-item-label">Drawn unseen until it is placed</span></button>` +
          `</div></div>`,
      },
    ],
  },
  {
    family: "Confirm",
    about:
      "The one armed question, Confirm: a line where the control was, its Yes red when the act destroys; a panel under the row, with the name erasure asks to be typed and what went wrong.",
    entries: [
      {
        id: "confirm",
        html:
          `<span class="confirm" role="group" aria-label="Disconnect Google?"><span class="confirm-words">` +
          `<span class="confirm-q">Disconnect Google?</span>` +
          `<span class="confirm-detail">The public listing stays; replies and the history do not.</span></span>` +
          `<span class="confirm-acts"><button type="button" class="btn btn-sm">Yes, disconnect</button>` +
          `<button type="button" class="cl-bucket-link">No</button></span></span>`,
      },
      {
        id: "confirm-danger",
        html:
          `<span class="confirm confirm-danger" role="group" aria-label="Delete the list?"><span class="confirm-words">` +
          `<span class="confirm-q">Delete the list?</span>` +
          `<span class="confirm-detail">The people on it stay.</span></span>` +
          `<span class="confirm-acts"><button type="button" class="btn btn-sm btn-danger">Yes, delete</button>` +
          `<button type="button" class="cl-bucket-link">No</button></span></span>`,
      },
      {
        id: "confirm-block",
        html:
          `<span class="confirm confirm-block confirm-danger" role="group" aria-label="Erase Sam Ortega?">` +
          `<span class="confirm-words">` +
          `<span class="confirm-q">Erase Sam Ortega?</span>` +
          `<span class="confirm-detail">Their conversations, visits and notes go, and this cannot be undone.</span></span>` +
          `<input class="confirm-typed" value="" placeholder="Sam Ortega" aria-label="Type Sam Ortega to confirm">` +
          `<span class="confirm-error" role="alert">That didn't go through. Try again in a moment.</span>` +
          `<span class="confirm-acts"><button type="button" class="btn btn-sm btn-danger" disabled>Yes, erase</button>` +
          `<button type="button" class="cl-bucket-link">No</button></span></span>`,
      },
    ],
  },
  {
    family: "Field error",
    about:
      "The one sentence under a box that says what is wrong with it, FieldError: its glyph and its words, wrapped.",
    entries: [
      {
        id: "field-error",
        html:
          `<div class="gx-narrow"><span class="field-error" role="alert">${icon("alert", 11)}` +
          `<span class="field-error-words">A list needs a name of one to sixty characters.</span></span></div>`,
      },
    ],
  },
  {
    family: "Toast",
    about:
      "The one flash, usePPToast's stack: a confirmation with its Undo, a note with a link, a warning and a failure, " +
      "each with its ×. The stack stands where this page's sheets put it: beside a sheet on a desk, above its foot on " +
      "a phone (record.css and kit.css, :root:has(.rec-sheet) and :root:has(.sheet)). Its place with none open is " +
      "drawn by the style-equality recorder's toast scene, not here.",
    entries: [
      {
        id: "pp-toast",
        stage: "sheet",
        html:
          `<div class="pp-toast-stack">` +
          `<div class="pp-toast pp-toast-ok" data-tone="ok" role="status">${icon("check", 13)}` +
          `<span class="pp-toast-msg"><b>Sam Ortega</b> is off Regulars</span>` +
          `<button type="button" class="pp-toast-cta">Undo</button>` +
          `<button type="button" class="pp-toast-x" aria-label="Dismiss">${icon("x", 11)}</button></div>` +
          `<div class="pp-toast pp-toast-info" data-tone="info" role="status">${icon("info", 13)}` +
          `<span class="pp-toast-msg">Saved. <a class="pp-toast-link" href="#kit">See it on Today</a></span>` +
          `<button type="button" class="pp-toast-x" aria-label="Dismiss">${icon("x", 11)}</button></div>` +
          `<div class="pp-toast pp-toast-warn" data-tone="warn" role="status">${icon("alert", 13)}` +
          `<span class="pp-toast-msg">Sent to 11 of 12: one has no number.</span>` +
          `<button type="button" class="pp-toast-x" aria-label="Dismiss">${icon("x", 11)}</button></div>` +
          `<div class="pp-toast pp-toast-danger" data-tone="danger" role="status">${icon("alert", 13)}` +
          `<span class="pp-toast-msg"><b>Not stopped</b> — That didn't go through.</span>` +
          `<button type="button" class="pp-toast-cta">Try again</button>` +
          `<button type="button" class="pp-toast-x" aria-label="Dismiss">${icon("x", 11)}</button></div>` +
          `</div>`,
      },
    ],
  },
  {
    family: "Tooltip",
    about: "The one tooltip every [data-tip] draws, shown beside what it explains.",
    entries: [
      {
        id: "ui-tip",
        html:
          `<button type="button" class="btn btn-sm" data-tip="Only an owner can export this workspace's people.">Export</button>` +
          `<div class="ui-tip show" role="tooltip" style="left: 104px; top: 12px;">Only an owner can export this workspace's people.</div>`,
      },
    ],
  },
  {
    family: "Tab strip",
    about:
      "A surface's views, SurfaceTabs: the picked one in ink over the accent's underline, a count on a tab, Campaigns' strip, and the underline a thumb carries between two tabs.",
    entries: [
      {
        id: "stabs",
        html:
          `<nav class="stabs stabs-inbox" aria-label="Section views">` +
          `<button class="stabs-tab active">Needs you <span class="stabs-badge tally tally-warn" data-tone="warn">3</span></button>` +
          `<button class="stabs-tab">Conversations</button><button class="stabs-tab">Live</button></nav>`,
      },
      {
        id: "stabs-campaigns",
        html:
          `<nav class="stabs stabs-campaigns" aria-label="Section views"><button class="stabs-tab">Playbooks</button>` +
          `<button class="stabs-tab active">Broadcasts</button><button class="stabs-tab">Templates</button></nav>`,
      },
      {
        id: "stabs-glide",
        html:
          `<nav class="stabs stabs-inbox" aria-label="Section views" data-glide="ease" style="--glide-w: 98px; --glide-x: 110px;">` +
          `<button class="stabs-tab active">Needs you</button><button class="stabs-tab">Conversations</button>` +
          `<button class="stabs-tab">Live</button></nav>`,
      },
    ],
  },
  {
    family: "Record card and rows",
    about:
      "The record kit's card and its rows (RecordRow): a label, a value, where it came from, one act; empty, wrong, disputed, a row of chips, a value just saved.",
    entries: [
      {
        id: "rec-card",
        html: recCard(
          `<div class="rec-row" data-empty="false" data-act="true"><span class="rec-row-key">Business name</span>` +
            `<div class="rec-row-val"><span class="rec-row-value">Northside Studio</span></div>${recAct("Change")}</div>` +
            `<div class="rec-row rec-row-top" data-empty="false" data-act="true"><span class="rec-row-key">Address</span>` +
            `<div class="rec-row-val"><span class="rec-row-value">1200 Example Avenue</span>` +
            `<span class="rec-src" data-state="verified" data-tone="plain">From Google</span>` +
            `<span class="rec-row-hint">Said to a caller who asks where you are.</span></div>${recAct("Change")}</div>` +
            `<div class="rec-row rec-row-top" data-empty="true" data-act="true"><span class="rec-row-key">Booking link</span>` +
            `<div class="rec-row-val"><span class="rec-row-empty">Not set</span>` +
            `<span class="rec-row-hint">Sent instead of booking a visit itself.</span></div>${recAct("Add")}</div>` +
            `<div class="rec-row" data-empty="false" data-act="true"><span class="rec-row-key">Line</span>` +
            `<div class="rec-row-val"><span class="rec-row-value">+1 (555) 010-0142</span></div>${recAct("Open", true)}</div>`,
          `<div class="rec-card-head"><h2 class="rec-card-title">Your business</h2>` +
            `<span class="rec-card-sub">What the receptionist says about you</span></div>`,
        ),
      },
      {
        id: "rec-row-wrong",
        html: recCard(
          `<div class="rec-row rec-row-top" data-empty="true" data-state="warn" data-act="true"><span class="rec-row-key">Hours</span>` +
            `<div class="rec-row-val"><span class="rec-row-empty">Not set</span>` +
            `<span class="rec-row-wrong">Without hours it tells every caller you might be closed.</span>` +
            `<span class="rec-row-hint">When you are open, each day.</span></div>${recAct("Set")}</div>`,
        ),
      },
      {
        id: "rec-row-dispute",
        html: recCard(
          `<div class="rec-row rec-row-top" data-empty="false" data-state="warn" data-act="true"><span class="rec-row-key">Phone</span>` +
            `<div class="rec-row-val"><span class="rec-row-value">+1 (555) 010-0143</span>` +
            `<span class="rec-src" data-state="disputed" data-tone="warn">Two answers</span>` +
            `<div class="rec-row-dispute"><span class="rec-row-dispute-other">` +
            `<span class="rec-row-dispute-value">+1 (555) 010-0144</span>` +
            `<span class="rec-src" data-state="verified" data-tone="plain">From Google</span></span>` +
            `<span class="rec-row-dispute-acts"><button type="button" class="btn btn-sm">Use Google's</button>` +
            `<button type="button" class="btn btn-sm btn-ghost">Keep mine</button></span></div></div>${recAct("Change")}</div>`,
        ),
      },
      {
        id: "rec-row-chips",
        html: recCard(
          `<div class="rec-row rec-row-top" data-empty="false" data-act="true"><span class="rec-row-key">Services</span>` +
            `<div class="rec-row-val"><span class="rec-row-value">5 services</span><span class="rec-chips">` +
            `<span class="chip rec-chip">Consultation<span class="rec-chip-meta">45m</span></span>` +
            `<span class="chip rec-chip">Follow-up visit<span class="rec-chip-meta">30m</span></span>` +
            `<span class="chip rec-chip" data-more="true">+3 more</span></span></div>${recAct("Change")}</div>`,
        ),
      },
      {
        id: "rec-row-settled",
        html: recCard(
          `<div class="rec-row" data-empty="false" data-act="true" data-settled="true"><span class="rec-row-key">Tone</span>` +
            `<div class="rec-row-val"><span class="rec-row-value">Warm and unhurried</span></div>${recAct("Change")}</div>`,
        ),
      },
    ],
  },
  {
    family: "Record fields",
    about:
      "A field (RecordField) and a box in a row of a list (RecordBox): a label, the box, its unit, a hint or what is wrong with it; words that run to sentences; the small box.",
    entries: [
      {
        id: "rec-field",
        html: recField("Booking link", "https://example.com/book", "Sent instead of booking a visit itself."),
      },
      {
        id: "rec-field-unit",
        html:
          `<div class="rec-field"><label><span class="rec-field-label">Least notice</span>` +
          `<span class="rec-input-group"><input type="text" class="rec-input" value="24"><span class="rec-input-unit">hours</span></span>` +
          `</label><span class="rec-hint">Empty means no rule.</span></div>`,
      },
      {
        id: "rec-field-wrong",
        html:
          `<div class="rec-field"><label><span class="rec-field-label">Website</span>` +
          `<input type="text" class="rec-input" value="northside studio" aria-invalid="true"></label>` +
          `<span class="field-error" role="alert">${icon("alert", 11)}<span class="field-error-words">A website starts with https://.</span></span></div>` +
          `<div class="rec-field"><label><span class="rec-field-label">Longest visit</span>` +
          `<span class="rec-input-group" data-invalid="true"><input type="text" class="rec-input" value="0" aria-invalid="true">` +
          `<span class="rec-input-unit">minutes</span></span></label>` +
          `<span class="field-error" role="alert">${icon("alert", 11)}<span class="field-error-words">At least five minutes.</span></span></div>`,
      },
      {
        id: "rec-field-words",
        html:
          `<div class="rec-field"><label><span class="rec-field-label">What fits no field</span>` +
          `<textarea class="rec-input" rows="3">Parking is behind the building, through the gate.</textarea></label></div>`,
      },
      {
        id: "rec-box",
        html:
          `<span class="rec-box"><input type="text" class="rec-input" aria-label="Service, row 1" value="Consultation"></span>` +
          `<span class="rec-box" data-size="sm"><input type="time" class="rec-input" aria-label="Monday opens" value="09:30"></span>` +
          `<span class="rec-box" data-size="sm"><span class="rec-input-group"><input type="text" class="rec-input" aria-label="Consultation, how long" value="45">` +
          `<span class="rec-input-unit">min</span></span></span>`,
      },
    ],
  },
  {
    family: "Switch and choice",
    about:
      "A switch (RecordSwitch), off, on and read-only; a choice of a few drawn as a segmented control (RecordToggleGroup), and its options as cards with a sentence each.",
    entries: [
      {
        id: "rec-switch",
        html: `${recSwitch(false, "Send it now")} ${recSwitch(true, "Remind them the day before")} ${recSwitch(true, "Take calls", true)}`,
      },
      { id: "rec-seg", html: recSeg("How often", ["Once", "Every week", "Every month"], "Every week") },
      {
        id: "rec-seg-hints",
        html:
          `<div class="rec-seg" role="radiogroup" aria-label="Who it answers" data-hints="true">` +
          `<button type="button" role="radio" class="rec-seg-btn" aria-checked="true" tabindex="0">` +
          `<span class="rec-seg-label">Everyone</span><span class="rec-seg-hint">Every caller and every message.</span></button>` +
          `<button type="button" role="radio" class="rec-seg-btn" aria-checked="false" tabindex="-1">` +
          `<span class="rec-seg-label">People it knows</span><span class="rec-seg-hint">A new number is handed to you.</span></button></div>`,
      },
    ],
  },
  {
    family: "Combobox",
    about:
      "A box over a list that narrows as you type (RecordCombobox): empty with its placeholder, and open on its matches.",
    entries: [
      { id: "rec-combo", html: recCombo() },
      { id: "rec-combo-open", html: recCombo({ open: true }) },
    ],
  },
  {
    family: "Fold, inline editor, what saving writes",
    about:
      "The record kit's edits in place: a fold opened under its row with its fields, what saving writes and Save; a wide one; one closed; one saving; the inline editor in the row it edits, open, saving and closed.",
    entries: [
      {
        id: "rec-fold",
        html: recCard(
          `<div class="rec-fold" role="group" data-open="true">` +
            `<div class="rec-fold-head"><span class="rec-fold-label">Hours</span>` +
            `<span class="rec-fold-hint">When you are open, each day.</span>` +
            `<button type="button" class="rec-fold-close">Close</button></div>` +
            `<div class="rec-fold-body"><div class="rec-fold-inner">` +
            recField("Monday to Friday", "9:30 to 6") +
            recSays({ note: "Callers hear these hours before they ask." }) +
            recFoot({ keys: "Ctrl+Enter saves" }) +
            `</div></div></div>`,
        ),
      },
      {
        id: "rec-fold-wide",
        html: recCard(
          `<div class="rec-fold" role="group" data-open="true" data-wide="true">` +
            `<div class="rec-fold-head"><span class="rec-fold-label">The week</span>` +
            `<span class="rec-fold-hint">Each day's hours.</span>` +
            `<button type="button" class="rec-fold-close">Close</button></div>` +
            `<div class="rec-fold-body"><div class="rec-fold-inner">` +
            recField("Saturday", "10 to 5") +
            recSays() +
            recFoot({ note: "Saved for every line." }) +
            `</div></div></div>`,
        ),
      },
      {
        id: "rec-fold-closed",
        html: recCard(
          `<div class="rec-row" data-empty="false" data-act="true"><span class="rec-row-key">Languages</span>` +
            `<div class="rec-row-val"><span class="rec-row-value">English, Spanish</span></div>${recAct("Change")}</div>` +
            `<div class="rec-fold" role="group" data-open="false" hidden>` +
            `<div class="rec-fold-head"><span class="rec-fold-label">Languages</span>` +
            `<span class="rec-fold-hint">What it answers in.</span>` +
            `<button type="button" class="rec-fold-close">Close</button></div>` +
            `<div class="rec-fold-body"><div class="rec-fold-inner">${recCombo()}</div></div></div>`,
        ),
      },
      {
        id: "rec-fold-saving",
        html: recCard(
          `<div class="rec-fold" role="group" data-open="true" aria-busy="true">` +
            `<div class="rec-fold-head"><span class="rec-fold-label">Rules</span>` +
            `<span class="rec-fold-hint">How far ahead, and how soon.</span>` +
            `<button type="button" class="rec-fold-close" aria-disabled="true">Close</button></div>` +
            `<div class="rec-fold-body"><div class="rec-fold-inner">` +
            recField("Furthest ahead", "8 weeks") +
            `<div class="rec-field"><label><span class="rec-field-label">Least notice</span>` +
            `<span class="rec-input-group"><input type="text" class="rec-input" value="24"><span class="rec-input-unit">hours</span></span>` +
            `</label></div>` +
            recCombo() +
            `${recSwitch(true, "Take walk-ins")} ${recSeg("Deposit", ["None", "Some", "All"], "None")}` +
            recFoot({ saving: true }) +
            `</div></div></div>`,
        ),
      },
      {
        id: "rec-inline",
        html: recCard(
          `<div class="rec-inline" role="group" data-open="true"><span class="rec-inline-key">Transfer number</span>` +
            `<div class="rec-inline-body"><div class="rec-field"><label><span class="rec-field-label"></span>` +
            `<input type="text" class="rec-input" value="+1 (555) 010-0145"></label></div></div>` +
            `<div class="rec-inline-acts"><button type="button" class="rec-inline-act" data-act="save" aria-label="Save">${icon("check", 13)}</button>` +
            `<button type="button" class="rec-inline-act" data-act="cancel" aria-label="Cancel">${icon("x", 13)}</button></div>` +
            `<div class="rec-inline-more">${recSays({ inline: true })}</div></div>`,
        ),
      },
      {
        id: "rec-inline-saving",
        html: recCard(
          `<div class="rec-inline" role="group" data-open="true" aria-busy="true"><span class="rec-inline-key">Business name</span>` +
            `<div class="rec-inline-body"><div class="rec-field"><label><span class="rec-field-label"></span>` +
            `<input type="text" class="rec-input" value="Northside Studio"></label></div></div>` +
            `<div class="rec-inline-acts"><button type="button" class="rec-inline-act" data-act="save" aria-label="Saving…" aria-disabled="true" aria-busy="true">${icon("check", 13)}</button>` +
            `<button type="button" class="rec-inline-act" data-act="cancel" aria-label="Cancel" aria-disabled="true">${icon("x", 13)}</button></div></div>`,
        ),
      },
      {
        id: "rec-inline-closed",
        html: recCard(
          `<div class="rec-row" data-empty="false" data-act="true"><span class="rec-row-key">Business name</span>` +
            `<div class="rec-row-val"><span class="rec-row-value">Northside Studio</span></div>${recAct("Change")}</div>` +
            `<div class="rec-inline" role="group" data-open="false" hidden><span class="rec-inline-key">Business name</span>` +
            `<div class="rec-inline-body"><input type="text" class="rec-input" value="Northside Studio"></div>` +
            `<div class="rec-inline-acts"><button type="button" class="rec-inline-act" data-act="save" aria-label="Save">${icon("check", 13)}</button></div></div>`,
        ),
      },
    ],
  },
  {
    family: "Record sheet",
    about:
      "RecordSheet, beside the page over its wash: its head, tools, rows and foot; a fold drawn as a sheet with its row behind it; and the still copies that play each one's leaving.",
    entries: [
      { id: "rec-sheet", stage: "sheet", html: recSheet() },
      { id: "rec-sheet-leaving", stage: "sheet", html: recSheet(true) },
      { id: "rec-fold-sheet", stage: "sheet", html: recFoldSheet() },
      { id: "rec-fold-sheet-leaving", stage: "sheet", html: recFoldSheet(true) },
    ],
  },
  {
    family: "Tips",
    about:
      "The two tiers of tip: a mark whose words the tooltip says (RecordTip), and the card with something to press in it (RecordTipCard).",
    entries: [
      {
        id: "rec-tip",
        html:
          `<button type="button" class="rec-tip" data-tip="Said to a caller who asks where you are." aria-label="Address" ` +
          `aria-description="Said to a caller who asks where you are.">${icon("info", 12)}</button>`,
      },
      {
        id: "rec-card-tip",
        html:
          `<div class="rec-card-tip" role="group" aria-label="Link your listing"><span class="rec-card-tip-title">Link your listing</span>` +
          `<span class="rec-card-tip-body">Your hours and reviews come from Google once it is linked.</span>` +
          `<button type="button" class="rec-card-tip-act">Find it</button></div>`,
      },
    ],
  },
  {
    family: "Panel",
    about:
      "kit.css's panel (step 2.2): a pane of content, an inset inside one, what pops over the page; md padding, sm, or " +
      "none for rows edge to edge, which it clips. Each beside the rule it reproduces, which the spec holds it equal " +
      "to, but for what that rule sets of its own page's: a card's shrinking in a grid, Confirm's column and entrance, " +
      "the tip card's width, the bell's place and entrance.",
    entries: [
      {
        id: "panel",
        html: `<section class="panel">${PANE_WORDS}</section>`,
        twin: "src-fl-card",
        except: ["min-width"],
      },
      { id: "src-fl-card", source: "styles/fleet.css:170", html: `<section class="fl-card">${PANE_WORDS}</section>` },
      { id: "panel-flush", html: `<section class="panel panel-flush">${PANE_ROWS}</section>`, twin: "src-card" },
      { id: "src-card", source: "styles/components.css:437", html: `<section class="card">${PANE_ROWS}</section>` },
      {
        id: "panel-inset",
        html: `<div class="panel panel-inset panel-sm">Their conversations and notes go with them.</div>`,
        twin: "src-confirm-block",
        // Confirm's own: its column of words and acts, its place under the row, its measure and its entrance.
        except: [
          ...["display", "flex-direction", "align-items", "row-gap", "column-gap", "margin-top", "max-width"],
          ...["animation-name", "animation-duration", "animation-timing-function"],
        ],
      },
      {
        id: "src-confirm-block",
        source: "surfaces/kit/kit.css:643",
        html: `<div class="confirm-block">Their conversations and notes go with them.</div>`,
      },
      {
        id: "panel-pop",
        html: `<div class="panel panel-pop panel-sm">Your hours come from Google once it is linked.</div>`,
        twin: "src-rec-card-tip",
        // The tip card's own: a column of its title, words and act, 236px wide.
        except: ["display", "flex-direction", "row-gap", "column-gap", "width", "max-width"],
      },
      {
        id: "src-rec-card-tip",
        source: "surfaces/kit/kit.css:2154",
        html: `<div class="rec-card-tip">Your hours come from Google once it is linked.</div>`,
      },
      {
        id: "panel-pop-flush",
        stage: "pop",
        // On a phone the bell's list is a sheet from the bottom edge, no pop: the twin is a desk's.
        width: "desk",
        html: `<div class="gx-anchor"><section class="panel panel-pop panel-flush">${PANE_ROWS}</section></div>`,
        twin: "src-tbn-pop",
        // The bell's own: where it hangs from its button, how wide and tall it may be, its column, its layer and its
        // entrance. A panel sets no place: what opens a pop places it.
        except: [
          ...["position", "top", "right", "width", "max-width", "max-height", "display", "flex-direction", "z-index"],
          ...["animation-name", "animation-duration", "animation-timing-function"],
        ],
      },
      {
        id: "src-tbn-pop",
        stage: "pop",
        width: "desk",
        source: "styles/components.css:981",
        html: `<div class="gx-anchor"><section class="tbn-pop">${PANE_ROWS}</section></div>`,
      },
    ],
  },
  {
    family: "Link button",
    about:
      "kit.css's quiet link button (step 2.2): words that act with no ground, as Confirm's No and a line's acts draw " +
      "them, its danger form, and words that open a page, a link that keeps the browser's underline in the words' " +
      "colour, as the house's quiet links draw one. Each beside the rule it reproduces (.cl-bucket-link), which the " +
      "spec holds it equal to.",
    entries: [
      {
        id: "link-btn",
        html: `<button type="button" class="link-btn">Write one${icon("arrow-right", 10)}</button>`,
        twin: "src-cl-bucket-link",
      },
      {
        id: "src-cl-bucket-link",
        source: "styles/components.css:1882",
        html: `<button type="button" class="cl-bucket-link">Write one${icon("arrow-right", 10)}</button>`,
      },
      {
        id: "link-btn-danger",
        html: `<button type="button" class="link-btn link-btn-danger">Delete the list</button>`,
        twin: "src-cl-bucket-link-danger",
      },
      {
        id: "src-cl-bucket-link-danger",
        source: "styles/components.css:1892",
        html: `<button type="button" class="cl-bucket-link danger">Delete the list</button>`,
      },
      {
        id: "link-btn-door",
        html: `<a class="link-btn" href="#kit">Open the listing${icon("arrow-right", 10)}</a>`,
        twin: "src-cl-bucket-link-door",
      },
      {
        id: "src-cl-bucket-link-door",
        source: "styles/components.css:1882",
        html: `<a class="cl-bucket-link" href="#kit">Open the listing${icon("arrow-right", 10)}</a>`,
      },
    ],
  },
  {
    family: "Face",
    about:
      "kit.css's face (step 2.2): a person, a lead or a conversation as initials in a circle, a glyph for someone " +
      "known by a number or an address, and a picture over the initials. At a phone's width each beside the phone " +
      "row's face, which the spec holds it equal to.",
    entries: [
      {
        id: "face",
        html:
          `<div class="gx-row"><span class="face" aria-hidden="true">AR</span>` +
          `<span class="face" aria-hidden="true">SO</span></div>`,
      },
      { id: "face-glyph", html: `<span class="face face-glyph" aria-hidden="true">${icon("phone", 12)}</span>` },
      {
        id: "face-photo",
        html: `<span class="face" aria-hidden="true">AR<img class="face-photo" src="${PHOTO}" alt=""></span>`,
      },
      {
        id: "face-twin",
        width: "phone",
        html: `<span class="face" aria-hidden="true">AR</span>`,
        twin: "src-face",
        except: FACE_APART,
      },
      {
        id: "src-face",
        width: "phone",
        source: "styles/inbox.css:276, styles/clients.css:2466",
        html: `<div class="ix-thread-avatar pl-card-face" aria-hidden="true">AR</div>`,
      },
      {
        id: "face-glyph-twin",
        width: "phone",
        html: `<span class="face face-glyph" aria-hidden="true">${icon("phone", 12)}</span>`,
        twin: "src-face-glyph",
        except: FACE_APART,
      },
      {
        id: "src-face-glyph",
        width: "phone",
        source: "styles/inbox.css:276, styles/clients.css:2051",
        html: `<div class="ix-thread-avatar pl-card-face cl-row-avatar-glyph" aria-hidden="true">${icon("phone", 12)}</div>`,
      },
      {
        id: "face-photo-twin",
        width: "phone",
        html: `<span class="face" aria-hidden="true">AR<img class="face-photo" src="${PHOTO}" alt=""></span>`,
        twin: "src-face-photo",
        except: FACE_APART,
      },
      {
        id: "src-face-photo",
        width: "phone",
        source: "styles/inbox.css:276, styles/clients.css:2481",
        html: `<div class="ix-thread-avatar pl-card-face" aria-hidden="true">AR<img class="pl-card-photo" src="${PHOTO}" alt=""></div>`,
      },
    ],
  },
  {
    family: "List row",
    about:
      "kit.css's list row (step 2.2): a face, the lines beside it and what trails, on the row tokens every list on a " +
      "phone shares: three lines, two (nothing said, so the face spans two), a line of its own under the facts, and " +
      "a row with a page of its own, a link that keeps the row's colours with no underline. At a phone's width a row " +
      "of each shape beside People's phone row, which the spec holds it equal to.",
    entries: [
      { id: "list-row", html: listRow() },
      { id: "list-row-two", html: listRow({ said: false }) },
      { id: "list-row-note", html: listRow({ note: true }) },
      { id: "list-row-door", html: listRow({ note: true, door: true }) },
      {
        id: "list-row-twin",
        width: "phone",
        html: listRow({ note: true }),
        twin: "src-pl-card",
        except: ["unicode-bidi"],
      },
      {
        id: "src-pl-card",
        width: "phone",
        source: "styles/clients.css:2465, styles/inbox.css:276",
        html: plCard({ note: true }),
      },
      {
        id: "list-row-two-twin",
        width: "phone",
        html: listRow({ said: false }),
        twin: "src-pl-card-two",
        except: ["unicode-bidi"],
      },
      {
        id: "src-pl-card-two",
        width: "phone",
        source: "styles/clients.css:2467, styles/inbox.css:276",
        html: plCard({ said: false }),
      },
    ],
  },
  {
    family: "Meter",
    about:
      "kit.css's meter (step 2.2): a whole in its parts, each part's share its flex-grow and its colour a chart's " +
      "series or a tone: 8px, large and small; one part, rounded at both ends; the tones and a rest part, as the " +
      "reach bar draws them. Each size and the one part beside the charts kit's segment bar, which the spec holds it " +
      "equal to, but for the tag of a part: SegmentBar draws an &lt;i&gt;, which the browser sets in italic, and a " +
      "part has no words.",
    entries: [
      { id: "meter", html: meter(""), twin: "src-ck-segbar-small", except: ["font-style"] },
      { id: "src-ck-segbar-small", source: "styles/charts.css:151", html: segbar(" small") },
      { id: "meter-lg", html: meter(" meter-lg"), twin: "src-ck-segbar", except: ["font-style"] },
      { id: "src-ck-segbar", source: "styles/charts.css:150", html: segbar("") },
      { id: "meter-one", html: meter("", ONE_PART), twin: "src-ck-segbar-one", except: ["font-style"] },
      { id: "src-ck-segbar-one", source: "styles/charts.css:155", html: segbar(" small", ONE_PART) },
      {
        id: "meter-sm",
        html:
          `<div class="meter meter-sm" role="img" aria-label="12 will get it, 3 held back">` +
          `<span class="meter-part meter-ok" style="flex-grow: 12"></span>` +
          `<span class="meter-part meter-warn" style="flex-grow: 3"></span>` +
          `<span class="meter-part meter-rest"></span></div>`,
      },
    ],
  },
  {
    family: "Sheet",
    about:
      "kit.css's sheet (step 2.2): on a desk a side pane at the window's right edge, the page faded behind it; on a " +
      "phone from the bottom edge, as tall as what it holds, a handle over its head and the ink's wash behind it; a " +
      "column at both widths, so the composer's foot stays at its foot. A toast raised while it is open stands clear " +
      "of that foot, beside the sheet on a desk and above it on a phone, which the spec checks at both widths. At " +
      "each width beside the frame it reproduces, open and leaving, which the spec holds it equal to: the record " +
      "sheet on a desk, and on a phone People's phone sheet, but for a column where PhoneSheet is a block (the spec " +
      "compares every box instead) and the ring of a focus PhoneSheet never takes.",
    entries: [
      { id: "sheet", stage: "sheet", html: sheet() + SHEET_TOAST },
      { id: "sheet-leaving", stage: "sheet", html: sheet({ leaving: true }) },
      { id: "sheet-desk", stage: "sheet", width: "desk", html: sheet({ handle: false }), twin: "src-rec-sheet" },
      {
        id: "src-rec-sheet",
        stage: "sheet",
        width: "desk",
        source: "surfaces/kit/kit.css:1739",
        html: recSheetFrame(),
      },
      {
        id: "sheet-desk-leaving",
        stage: "sheet",
        width: "desk",
        html: sheet({ handle: false, leaving: true }),
        twin: "src-rec-sheet-leaving",
      },
      {
        id: "src-rec-sheet-leaving",
        stage: "sheet",
        width: "desk",
        source: "surfaces/kit/kit.css:1139, styles/components.css:3050",
        html: recSheetFrame(true),
      },
      {
        id: "sheet-phone",
        stage: "sheet",
        width: "phone",
        html: sheet(),
        twin: "src-phone-sheet",
        except: SHEET_APART,
        boxes: true,
      },
      {
        id: "src-phone-sheet",
        stage: "sheet",
        width: "phone",
        source: "styles/components.css:1863, styles/mobile.css:170, styles/clients.css:2406",
        html: phoneSheetFrame(),
      },
      {
        id: "sheet-phone-leaving",
        stage: "sheet",
        width: "phone",
        html: sheet({ leaving: true }),
        twin: "src-phone-sheet-leaving",
        except: SHEET_APART,
      },
      {
        id: "src-phone-sheet-leaving",
        stage: "sheet",
        width: "phone",
        source: "styles/components.css:3075, styles/mobile.css:170, styles/clients.css:2406",
        html: phoneSheetFrame(true),
      },
    ],
  },
  /* ---- the kit's components with behaviour of their own, on Base UI (step 2.5) ----
     Each entry is the markup a component draws in one state, on Base UI's parts: e2e/kit/kit-behaves.spec.ts drives
     the component there on the harness's running page (kit-behaves.tsx, at /behaves) and holds what it draws to the
     entry, element for element (the tag, the classes and the attributes a stylesheet or a screen reader reads, in
     order; a Base UI part's own elements that carry no class, its focus guards, hidden inputs and portals, give way
     to what they hold). A popup is drawn where Base UI portals it, after its control, and stood in a stage here. */
  {
    family: "Sheet, on Base UI",
    about:
      "The kit's Sheet (surfaces/kit/sheet/sheet.tsx), open over its wash: Base UI's modal dialog wearing the kit's " +
      "sheet, the record sheet's head, tools, rows and foot inside it, and the control that opened it.",
    entries: [{ id: "sheet-kit", stage: "sheet", html: kitSheet() }],
  },
  {
    family: "Menu, on Base UI",
    about:
      "The kit's Menu (surfaces/kit/menu/menu.tsx), open: Base UI's menu on its positioner (.pop-place), a group under " +
      "its heading, a line, a door and the danger item; and a set to choose one of, the tick beside the one chosen.",
    entries: [
      { id: "menu-kit", stage: "pop", html: kitMenu() },
      { id: "menu-kit-set", stage: "pop", html: kitMenuSet() },
    ],
  },
  {
    family: "Popover, on Base UI",
    about: "The kit's Popover (surfaces/kit/popover/popover.tsx), open: Base UI's popover on the panel's pop.",
    entries: [{ id: "popover-kit", stage: "pop", html: kitPopover() }],
  },
  {
    family: "Tooltip, on Base UI",
    about:
      "The kit's Tooltip (surfaces/kit/tooltip/tooltip.tsx), shown: the house's tip on Base UI's positioner (.tip-place).",
    entries: [{ id: "tooltip-kit", stage: "pop", html: kitTooltip() }],
  },
  {
    family: "Select, on Base UI",
    about:
      "The kit's Select (surfaces/kit/select/select.tsx) in its Field, open: the record kit's box as a button, and its " +
      "list over the page on the panel's pop (.rec-combo-pop), the one chosen walked to.",
    entries: [{ id: "select-kit", stage: "pop", html: kitSelect() }],
  },
  {
    family: "Combobox, on Base UI",
    about:
      "The kit's Combobox (surfaces/kit/combobox/combobox.tsx), typed into: the record kit's box, and its matches over " +
      "the page on the panel's pop (.rec-combo-pop), the first walked to.",
    entries: [{ id: "combobox-kit", stage: "pop", html: kitCombobox() }],
  },
  {
    family: "Toast, on Base UI",
    about:
      "The kit's toast (surfaces/kit/toast/toast.tsx, useToast): Base UI's region of toasts, wearing the house's stack, " +
      "a confirmation with its Undo and its ×.",
    entries: [{ id: "toast-kit", stage: "sheet", html: kitToast() }],
  },
  {
    family: "Switch, on Base UI",
    about: "The kit's Switch (surfaces/kit/switch/switch.tsx): off, on, and read-only, on Base UI's switch.",
    entries: [{ id: "switch-kit", html: kitSwitches() }],
  },
  {
    family: "Segmented, on Base UI",
    about:
      "The kit's Segmented (surfaces/kit/segmented/segmented.tsx): Base UI's radio group on the record kit's track, and " +
      "its options as cards with a sentence each.",
    entries: [
      { id: "segmented-kit", html: kitSegmented() },
      { id: "segmented-kit-hints", html: kitSegmentedHints() },
    ],
  },
  {
    family: "Field, on Base UI",
    about:
      "The kit's Field (surfaces/kit/field/field.tsx): Base UI's field wearing the record kit's, a hint and a unit; what " +
      "is wrong, in the one red a field wears; and a box of sentences.",
    entries: [
      { id: "field-kit", html: kitFields() },
      { id: "field-kit-wrong", html: kitFieldsWrong() },
    ],
  },
  {
    family: "Page head",
    about:
      "The kit's page head (surfaces/kit/head/page-head.tsx): the date and time in the mono face, the page's name light " +
      "and large, and beside it the one sentence that says where the page stands. A page draws it in Glass alone, " +
      "inside Glass; Classic's top bar carries the name.",
    entries: [
      {
        id: "page-head",
        html:
          `<header class="pg-head"><p class="pg-dateline">Friday, October 2 · 4:02 PM</p>` +
          `<div class="pg-line"><h1 class="pg-title">Inbox</h1>` +
          `<p class="pg-sentence">4 need you · the oldest since 2:26 PM</p></div></header>`,
      },
      {
        id: "page-head-stacked",
        html:
          `<header class="pg-head pg-head-stacked"><p class="pg-dateline">Friday, October 2 · 4:02 PM</p>` +
          `<div class="pg-line"><h1 class="pg-title">Good afternoon, Marisa</h1>` +
          `<p class="pg-sentence">2 conversations need you. The oldest has been waiting since 2:26 PM.</p></div></header>`,
      },
    ],
  },
];

/* ---- the document ---- */

/** Every <link> in the head of the mockup's document, as it stands: the fonts, then the tokens, the kit and the rest. */
function documentLinks() {
  const doc = fs.readFileSync(path.join(LEGACY, "Chanlytics.html"), "utf8");
  const head = doc.slice(doc.indexOf("<head>"), doc.indexOf("</head>"));
  return head.match(/<link\b[^>]*>/g) ?? [];
}

/** The app's own rules (legacy-bridge/legacy.css, less its @imports), served by the harness after every stylesheet. */
const APP_RULES = '<link rel="stylesheet" href="/_hx/app.css" />';

/**
 * The gallery's own layout, under gx-* and on tokens, so it reads in both themes. The shell holds the page to the
 * window with nothing to scroll (html.legacy-on, legacy.css); the gallery scrolls, so a full-page shot takes it all.
 * The faces are named as the harness's fixture names them on the mockup's page (fixture-src.ts, `fonts`), which the
 * gallery does not run: the app names them through next/font (app/layout.tsx), and --font-sans and --font-mono read it.
 */
const GALLERY_CSS = `
    :root { --font-geist: "Geist"; --font-geist-mono: "Geist Mono"; }
    html.legacy-on, html.legacy-on body { height: auto; overflow: visible; }
    html.legacy-on #root { height: auto; }
    .gx { max-width: var(--measure-wide); margin: 0 auto; padding: var(--space-8) var(--space-6) var(--space-16); display: flex; flex-direction: column; gap: var(--space-10); }
    .gx-head, .gx-family { display: flex; flex-direction: column; gap: var(--space-3); }
    .gx-title { margin: 0; font-size: var(--text-2xl); font-weight: var(--weight-semibold); color: var(--ink); }
    .gx-family-name { margin: 0; font-size: var(--text-lg); font-weight: var(--weight-semibold); color: var(--ink); }
    .gx-lede, .gx-about { margin: 0; max-width: var(--measure-prose); font-size: var(--text-sm); color: var(--ink-dim); }
    .gx-entries { display: grid; grid-template-columns: repeat(auto-fill, minmax(min(100%, 420px), 1fr)); gap: var(--space-4); }
    .gx-entry { margin: 0; min-width: 0; display: flex; flex-direction: column; gap: var(--space-2); }
    .gx-entry:has(> .gx-stage[data-stage]) { grid-column: 1 / -1; }
    .gx-stage { position: relative; contain: layout paint; min-height: var(--space-16); padding: var(--space-4); border: 1px dashed var(--line); border-radius: var(--radius-md); }
    .gx-stage[data-stage="sheet"] { height: 480px; padding: 0; }
    .gx-stage[data-stage="pop"] { height: 320px; }
    @media (max-width: 900px) { .gx-stage[data-stage="sheet"] { height: 90vh; } }
    .gx-caption { font-family: var(--font-mono); font-size: var(--text-xs); color: var(--ink-dim); }
    .gx-end { display: flex; justify-content: flex-end; }
    .gx-row { display: flex; align-items: center; gap: var(--space-2); }
    .gx-anchor { position: relative; }
    .gx-panel-row { padding: var(--space-2) var(--space-3); }
    .gx-panel-row + .gx-panel-row { border-top: 1px solid var(--line); }
    .gx-narrow { max-width: 220px; }
    .gx-pop-words { margin: 0; }
`;

/**
 * The theme and the look: from `?theme=light|dark&look=classic|glass` (dark and Classic otherwise); `t` turns the
 * theme, as the mockup's document does (style-equality.mjs presses it), and `l` turns the look. And an entry bound to
 * a width leaves the page at the other, as it loads, at the kit's one breakpoint.
 */
const GALLERY_SCRIPT = `
    (function () {
      var root = document.documentElement;
      var asked = new URLSearchParams(location.search);
      root.setAttribute("data-theme", asked.get("theme") === "light" ? "light" : "dark");
      root.setAttribute("data-look", asked.get("look") === "glass" ? "glass" : "classic");
      var phone = window.matchMedia("(max-width: 900px)").matches;
      document.querySelectorAll(".gx-entry[data-width]").forEach(function (entry) {
        if ((entry.getAttribute("data-width") === "phone") !== phone) entry.remove();
      });
      window.addEventListener("keydown", function (e) {
        var tag = ((e.target && e.target.tagName) || "").toLowerCase();
        if (e.metaKey || e.ctrlKey || e.altKey || tag === "input" || tag === "textarea") return;
        if (e.key === "t") root.setAttribute("data-theme", root.getAttribute("data-theme") === "dark" ? "light" : "dark");
        if (e.key === "l") root.setAttribute("data-look", root.getAttribute("data-look") === "glass" ? "classic" : "glass");
      });
    })();
`;

/** One attribute, or nothing where there is no value. */
const attr = (name, value) => (value === undefined || value === null ? "" : ` ${name}="${value}"`);

/** What a caption says of an entry: its id, and whose twin or which rule's source it is. */
const captionOf = (e) =>
  [
    e.id,
    e.twin && `twin of ${e.twin}`,
    e.source && `source: ${e.source}`,
    e.width && `at a ${e.width}'s width`,
    e.except && `except ${e.except.join(", ")}`,
  ]
    .filter(Boolean)
    .join(" · ");

const entryHtml = (e) =>
  `<figure class="gx-entry"${attr("data-entry", e.id)}${attr("data-twin", e.twin)}${attr("data-source", e.source)}` +
  `${attr("data-width", e.width)}${attr("data-except", e.except && e.except.join(" "))}${e.boxes ? ' data-boxes="true"' : ""}>` +
  `<div class="gx-stage"${attr("data-stage", e.stage)}>${e.html}</div>` +
  `<figcaption class="gx-caption">${captionOf(e)}</figcaption></figure>`;

const familyHtml = (f) =>
  `<section class="gx-family" data-family="${f.family}"><h2 class="gx-family-name">${f.family}</h2>` +
  `<p class="gx-about">${f.about}</p><div class="gx-entries">${f.entries.map(entryHtml).join("\n")}</div></section>`;

/**
 * The gallery's page, built afresh: the mockup's fonts and stylesheets in its order, the app's rules, the entries. Its
 * words say no count: a family added at the end moves nothing drawn above it, so a recording of the page before and
 * after (style-equality.mjs) differs only in what was added.
 */
export function galleryDocument(families = FAMILIES) {
  return `<!doctype html>
<html lang="en" data-theme="dark" data-look="classic" class="legacy-on">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width,initial-scale=1" />
  <title>Chanlytics · the kit</title>
  ${documentLinks().join("\n  ")}
  ${APP_RULES}
  <style>${GALLERY_CSS}  </style>
</head>
<body>
  <div id="root"><main class="gx">
    <header class="gx-head"><h1 class="gx-title">The kit</h1>
      <p class="gx-lede">Every class in apps/dashboard/src/surfaces/kit/classes.json, drawn by the app's own stylesheets in the
      app's order, a family at a time. Press t for the other theme and l for the other look.</p>
    </header>
${families.map(familyHtml).join("\n")}
  </main></div>
  <script>${GALLERY_SCRIPT}  </script>
</body>
</html>
`;
}

/** The running page's own layout: room under its entries, so the page is taller than the window and a modal can be seen to hold it still. */
const BEHAVES_CSS = `
    .gx-room { height: 150vh; }
`;

/**
 * The page that runs the kit's components (kit-behaves.tsx), in the gallery's stylesheets and layout: its bundle
 * (kit-behaves.mjs, served at `bundle`) draws the entries into #root, after the gallery's script has set the theme and
 * the look from the address, as the gallery sets them.
 */
export function behavesDocument(bundle = "/_hx/kit-behaves.js") {
  return `<!doctype html>
<html lang="en" data-theme="dark" data-look="classic" class="legacy-on">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width,initial-scale=1" />
  <title>Chanlytics · the kit, behaving</title>
  ${documentLinks().join("\n  ")}
  ${APP_RULES}
  <style>${GALLERY_CSS}${BEHAVES_CSS}  </style>
</head>
<body>
  <div id="root"></div>
  <script>${GALLERY_SCRIPT}  </script>
  <script src="${bundle}"></script>
</body>
</html>
`;
}
