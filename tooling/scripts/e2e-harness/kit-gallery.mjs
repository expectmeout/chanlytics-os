/**
 * The kit's gallery (docs/plans/2026-09-28-the-interface-kit-and-its-looks.md, §3.4 and step 2.3): one page that draws
 * every class of the kit in the app's own stylesheets, for e2e/kit/kit.spec.ts to check and for a person to review.
 *
 *   node tooling/scripts/e2e-harness/server.mjs 3210 kit        # http://localhost:3210/ ; t turns the theme
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
  "cl-bucket-link": "the quiet link button EmptyState and FailedRead draw, under People's name for it (components.css)",
  "confirm-danger": "Confirm's mark on a question that destroys, which no stylesheet names yet (kit/confirm)",
  "confirm-discard":
    "Confirm's mark on a question about what was typed and not saved, which no stylesheet names (kit/confirm)",
  "pp-toast-ok":
    "usePPToast's tone class on a confirmation, which no stylesheet names (data-bits.jsx, pp-toast-<tone>)",
  "stabs-inbox": "the Inbox's strip as ViewTabs marks each strip's (stabs-<name>), which no stylesheet names",
  "stabs-campaigns": "a second strip's own mark (ViewTabs, stabs-<name>), which no stylesheet names",
  "stabs-person": "a person's tabs' own mark (ViewTabs, stabs-<name>), which no stylesheet names",
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

/** What saving writes folded behind one line, as a sheet draws it (RecordSays' `folded`): closed, or open on its lines. */
const recSaysFolded = ({ open = false, mark = null } = {}) =>
  `<div class="rec-says" data-folded="true"><div class="rec-disclosure" data-open="${open}">` +
  `<button type="button" class="rec-disclosure-press" aria-expanded="${open}">` +
  `<span class="rec-disclosure-label">Preview what it's told</span>` +
  (mark ? `<span class="rec-disclosure-mark">${mark}</span>` : "") +
  `${icon("chevron", 12)}</button>` +
  `<div class="rec-disclosure-panel" role="region"><div class="rec-disclosure-inner">` +
  `<div class="rec-says-part" data-part="says"><pre><span class="rec-says-line">Open Monday to Friday, 9:30 to 6.</span>
` +
  `<span class="rec-says-line" data-changed="true">Closed on public holidays.</span></pre></div>` +
  `<div class="rec-says-part" data-part="gone"><span class="rec-says-eyebrow">No longer told</span>` +
  `<pre><span class="rec-says-line">Open on public holidays.</span></pre></div>` +
  `</div></div></div></div>`;

/**
 * A group of a page's rail folded with its summary (RecordDisclosure look="group", a person's Messages and receptionist):
 * closed on its one line, or open on its rows.
 */
const recDisclosureGroup = ({ open = false } = {}) =>
  `<div class="rec-disclosure" data-open="${open}" data-look="group">` +
  `<button type="button" class="rec-disclosure-press" aria-expanded="${open}">` +
  `<span class="rec-disclosure-label">Messages and receptionist</span>${icon("chevron", 12)}</button>` +
  `<p class="rec-disclosure-sum">Visit messages not asked · Offers &amp; news not asked · Answer</p>` +
  `<div class="rec-disclosure-panel" role="region"><div class="rec-disclosure-inner">` +
  `<p>Visit messages · Not asked</p><p>Offers &amp; news · Not asked</p>` +
  `</div></div></div>`;

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

/** A question that destroys, as a sheet's own foot asks it (a run's Skip): the red Yes, and the No a pair with it. */
const dangerAsk = () =>
  `<span class="confirm confirm-danger" role="group" aria-label="Skip this run?"><span class="confirm-words">` +
  `<span class="confirm-q">Skip this run?</span>` +
  `<span class="confirm-detail">Nothing sends, and the run closes.</span></span>` +
  `<span class="confirm-acts"><button type="button" class="btn btn-sm btn-danger">Yes, skip it</button>` +
  `<button type="button" class="btn btn-sm btn-ghost">No</button></span></span>`;

/**
 * A record sheet over its wash; `leaving` draws the still copies that play its leaving (data-bits leaving), and
 * `asking` a question that destroys in its foot.
 */
const recSheet = (leaving = false, asking = false, phone = false) =>
  `<div class="rec-sheet-backdrop" aria-hidden="true"${leaving ? ' data-leaving="true"' : ""}></div>` +
  `<section class="rec-sheet" role="dialog" aria-modal="true" aria-label="Services" tabindex="-1"` +
  `${leaving ? ' data-leaving="true"' : ""}${phone ? ' data-phone="true"' : ""}>` +
  recSheetHead("Services", "What you offer, and how long each takes.") +
  `<div class="rec-sheet-tools">${recCombo({ label: "Find a service", placeholder: "Find a service" })}` +
  `<span class="rec-sr" role="status" aria-live="polite">3 services</span></div>` +
  `<div class="rec-sheet-body">${SERVICE_ROWS}</div>` +
  (asking
    ? `<footer class="rec-sheet-foot" data-asking="true">${dangerAsk()}</footer></section>`
    : `<footer class="rec-sheet-foot">${recFoot({ note: "Saved for every line." })}</footer></section>`);

/** The question a discard asks (Confirm's `discard`): red words on no ground, and the No as the plain button beside it. */
const discardAsk = () =>
  `<span class="confirm confirm-discard" role="group" aria-label="Discard your changes?"><span class="confirm-words">` +
  `<span class="confirm-q">Discard your changes?</span>` +
  `<span class="confirm-detail">Nothing you changed here has been saved.</span></span>` +
  `<span class="confirm-acts"><button type="button" class="btn btn-sm btn-ghost danger">Yes, discard</button>` +
  `<button type="button" class="btn btn-sm">Keep editing</button></span></span>`;

/**
 * A fold drawn as a sheet (RecordFold's `frame`), its row behind it; `leaving` draws the copies that go, and `asking`
 * the question in its foot, in Save's and Cancel's place.
 */
const recFoldSheet = (leaving = false, asking = false, phone = false) =>
  (leaving
    ? ""
    : `<div class="rec-fold-behind" aria-hidden="true" inert><section class="rec-card">` +
      `<div class="rec-row" data-empty="false" data-act="true"><span class="rec-row-key">Hours</span>` +
      `<div class="rec-row-val"><span class="rec-row-value">Monday to Friday, 9:30 to 6</span></div>` +
      `${recAct("Change")}</div></section></div>`) +
  `<div class="rec-sheet-backdrop" data-fold="true" aria-hidden="true"${leaving ? ' data-leaving="true"' : ""}></div>` +
  `<section class="rec-sheet rec-fold-sheet" role="dialog" aria-modal="true" aria-label="Hours" data-open="true"` +
  `${leaving ? ' data-leaving="true"' : ""}${phone ? ' data-phone="true"' : ""}>` +
  recSheetHead("Hours", "When you are open, each day.") +
  `<div class="rec-sheet-body"><div class="rec-fold-inner">` +
  recField("Monday opens", "09:30") +
  recField("Monday closes", "18:00") +
  (phone ? recSaysFolded({ mark: "Changed" }) : "") +
  `</div></div>` +
  (asking
    ? `<footer class="rec-sheet-foot" data-asking="true">${discardAsk()}</footer></section>`
    : `<footer class="rec-sheet-foot">${recFoot()}</footer></section>`);

/** Rows in a card (the record's card). */
const recCard = (rows, head = "") => `<section class="rec-card">${head}${rows}</section>`;

/* ---- what step 2.2's primitives and their sources hold alike, so a twin and its source differ only in their own ---- */

/** A pane's words: a heading and a line. */
const PANE_WORDS = `<h3>Hours</h3><p>Open today until six.</p>`;
/** Rows edge to edge, as a flush panel holds them: the gallery's own rows, a hairline between them. */
const PANE_ROWS = ["Consultation", "Follow-up visit", "Full treatment"]
  .map((name) => `<div class="gx-panel-row">${name}</div>`)
  .join("");

/** A face's picture: a made-up one, drawn inline, so the page asks for nothing. */
const PHOTO =
  "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 32 32'%3E%3Crect width='32' height='32' " +
  "fill='%23a3a3a3'/%3E%3Ccircle cx='16' cy='13' r='6' fill='%23e5e5e5'/%3E%3Cpath d='M5 32a11 11 0 0 1 22 0' " +
  "fill='%23e5e5e5'/%3E%3C/svg%3E";

/**
 * A person's row on a phone, as the kit draws it, with a line of words said or not, a note under it or not, as a link to
 * their page or not, and a row whose first column is its kind (the kit's mark) instead of someone's face.
 */
const listRow = ({ said = true, note = false, door = false, mark = false, bare = false } = {}) =>
  (door ? `<a class="list-row" href="#kit">` : `<div class="list-row${bare ? " list-row-bare" : ""}">`) +
  (bare
    ? ""
    : mark
      ? `<span class="mark list-row-mark" aria-hidden="true">${icon("bell", 13)}</span>`
      : `<span class="face list-row-face" aria-hidden="true"><span>AR</span></span>`) +
  `<div class="list-row-name">Aisha Rahman</div><span class="pill pill-warn list-row-end">Needs you</span>` +
  (said ? `<div class="list-row-said">asked about Saturday</div>` : "") +
  `<div class="list-row-facts"><span>Sat · 10:00</span><span>2 h ago</span></div>` +
  (note ? `<div class="list-row-note">Next step: call back on Monday</div>` : "") +
  (door ? `</a>` : `</div>`);

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
/**
 * A phone's small job in the kit's sheet: a field, its one wide button, and a question it asks (Delete the list). Until
 * 5 Oct 2026 People's PhoneSheet drew it, and a twin held the two equal, frame, head and body, before PhoneSheet went.
 */
const jobBody = () =>
  kitBox("Mobile number", "") +
  `<button type="button" class="btn btn-primary">Add</button>` +
  `<span class="confirm confirm-block" role="group" aria-label="Delete the list?">` +
  `<span class="confirm-words"><span class="confirm-q">Delete the list?</span>` +
  `<span class="confirm-detail">The people stay.</span></span>` +
  `<span class="confirm-acts"><button type="button" class="btn btn-sm btn-danger">Yes, delete</button>` +
  `<button type="button" class="btn btn-sm btn-ghost">No</button></span></span>`;
/** The kit's sheet in a job's shape (Sheet's `shape="job"`): a step's way back, its title and its word, the job under them. */
const jobSheet = (leaving = false) =>
  `<div class="sheet-backdrop" aria-hidden="true"${going(leaving)}></div>` +
  `<section class="sheet" role="dialog" aria-modal="true" aria-label="Not a fit" tabindex="-1"${going(leaving)}>` +
  `<div class="sheet-handle" aria-hidden="true"></div>` +
  `<header class="sheet-job-head">` +
  `<button type="button" class="sheet-job-back" aria-label="Back">${icon("chevron", 18)}</button>` +
  `<h2 class="sheet-job-title">Not a fit</h2><button type="button" class="sheet-job-close">Cancel</button></header>` +
  `<div class="sheet-job-body">${jobBody()}</div></section>`;
/** A toast raised while the sheet is open, which stands clear of its foot. */
const SHEET_TOAST =
  `<div class="pp-toast-stack"><div class="pp-toast pp-toast-ok" data-tone="ok" role="status">${icon("check", 13)}` +
  `<span class="pp-toast-msg"><b>Follow-up visit</b> is 45 minutes now</span>` +
  `<button type="button" class="pp-toast-cta">Undo</button>` +
  `<button type="button" class="pp-toast-x" aria-label="Dismiss">${icon("x", 11)}</button></div></div>`;
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

/** The kit's Sheet with a mark (`mark`): a business's tile before its name, the line under it muted, no rule under the head. */
const kitMarkSheet = () =>
  `<button type="button" class="btn">Open the business</button>` +
  `<div class="sheet-backdrop" role="presentation" aria-hidden="true"></div>` +
  `<section class="sheet" role="dialog" tabindex="-1">` +
  `<div class="sheet-handle" aria-hidden="true"></div>` +
  `<header class="rec-sheet-head" data-marked="true"><span class="sheet-mark"><span class="face face-lg" aria-hidden="true">HP</span></span>` +
  `<div class="rec-sheet-heading"><h2 class="rec-sheet-title">Hyde Park Personal Training</h2>` +
  `<p class="rec-sheet-sub">Personal trainer · Austin, TX</p></div>` +
  `<button type="button" tabindex="0" aria-label="Close" class="rec-sheet-close">${icon("x", 13)}</button></header>` +
  `<div class="rec-sheet-body">${KIT_ROWS}</div></section>`;

/**
 * The kit's Sheet with its title a kicker (`kicker`, kit-behaves.tsx's): the title a quiet line with its small Close at
 * its end and no rule under it, over one pane of rows that carry their own name, which the body's column gives way under
 * the cap, and a foot that closes it (`footCloses`: its Cancel), where on a phone the corner's Close steps out of sight.
 */
const kitKickerSheet = () =>
  `<button type="button" class="btn">Turn on Win-back</button>` +
  `<div class="sheet-backdrop" role="presentation" aria-hidden="true"></div>` +
  `<section class="sheet sheet-kicker" role="dialog" tabindex="-1" data-foot-closes="true">` +
  `<div class="sheet-handle" aria-hidden="true"></div>` +
  `<header class="rec-sheet-head"><div class="rec-sheet-heading"><h2 class="rec-sheet-title">Turn on</h2></div>` +
  `<button type="button" tabindex="0" aria-label="Close" class="rec-sheet-close">${icon("x", 13)}</button></header>` +
  `<div class="rec-sheet-body"><div>${KIT_ROWS}</div></div>` +
  `<footer class="rec-sheet-foot"><div data-foot-pair="">` +
  `<button type="button" class="btn btn-sm btn-ghost">Cancel</button>` +
  `<button type="button" class="btn btn-sm btn-primary">Start it</button></div></footer></section>`;

/**
 * The kit's Sheet in a phone's job's shape, open on its second step (kit-behaves.tsx's): the control that opened it,
 * the wash, and the dialog with its way back, its title and its word, and the step's one act.
 */
const kitJobSheet = () =>
  `<button type="button" class="btn">Work the 3 selected</button>` +
  `<div class="sheet-backdrop" role="presentation" aria-hidden="true"></div>` +
  `<section class="sheet" role="dialog" tabindex="-1">` +
  `<div class="sheet-handle" aria-hidden="true"></div>` +
  `<header class="sheet-job-head">` +
  `<button type="button" aria-label="Back" class="sheet-job-back">${icon("chevron", 18)}</button>` +
  `<h2 class="sheet-job-title">Not a fit</h2>` +
  `<button type="button" tabindex="0" class="sheet-job-close">Cancel</button></header>` +
  `<div class="sheet-job-body"><button type="button" class="btn btn-primary">Too far away</button></div></section>`;

/**
 * The kit's shared Menu, open from the second of its rows' controls (kit-behaves.tsx's): each control carries its row,
 * and the menu says the row that opened it under its number.
 */
const kitMenuShared = () =>
  `<button type="button" tabindex="0" aria-haspopup="menu" aria-expanded="false" class="btn btn-sm btn-ghost">` +
  `Call Sam's Gym</button>` +
  `<button type="button" tabindex="0" aria-haspopup="menu" aria-expanded="true" class="btn btn-sm btn-ghost">` +
  `Call Ortega Fitness</button>` +
  `<div class="more-backdrop" role="presentation" data-open="true"></div>` +
  `<div class="pop-place" role="presentation" ${placed("top: 56px; left: 16px;")}>` +
  `<div class="more-menu align-right" role="menu" tabindex="-1" aria-label="Call Ortega Fitness">` +
  `<div role="group"><div class="more-header" aria-hidden="true">(512) 555-0177</div>` +
  kitItem("phone", "Call from your phone") +
  `</div></div></div>`;

/** A menu item of the kit's: a button, with its glyph, its words and what follows them. */
const kitItem = (glyphName, label, { tone = "", after = "" } = {}) =>
  `<button type="button" aria-disabled="false" role="menuitem" tabindex="-1" class="more-item${tone}">` +
  `${icon(glyphName, 13)}<span class="more-item-label">${label}</span>${after}</button>`;

/** The kit's Menu, open under its control: a group under its heading, a line, a door and the danger item. */
const kitMenu = () =>
  `<button type="button" tabindex="0" aria-label="More" aria-haspopup="menu" aria-expanded="true" ` +
  `class="btn btn-icon btn-sm btn-ghost">${icon("more", 14)}</button>` +
  `<div class="more-backdrop" role="presentation" data-open="true"></div>` +
  `<div class="pop-place" role="presentation" ${placed("top: 56px; left: 16px;")}>` +
  `<div class="more-menu align-right" role="menu" tabindex="-1">` +
  `<div role="group"><div class="more-header" aria-hidden="true">Sam Ortega</div>` +
  kitItem("copy", "Copy number") +
  kitItem("calendar", "Send booking link", { after: `<span class="more-item-meta">By text</span>` }) +
  kitItem("pause", "Pause the receptionist", { after: `<span class="more-item-hint">until 10:00</span>` }) +
  kitItem("user", "Operator", {
    tone: " more-item-two",
    after: `<span class="more-item-meta">Answers and approves conversations, tunes autonomy</span>`,
  }) +
  `</div>` +
  `<div class="more-divider" role="separator" aria-orientation="horizontal"></div>` +
  `<a role="menuitem" tabindex="-1" href="#kit" class="more-item">${icon("user", 13)}` +
  `<span class="more-item-label">Open their page</span></a>` +
  kitItem("x", "Delete person…", { tone: " danger" }) +
  `</div></div>`;

/**
 * The kit's Menu with a group's caption: its sends drawn disabled, and why said once under them; the sends are tiles
 * (`tiles`), rows on a desk and one line on a phone.
 */
const kitMenuCaption = () =>
  `<button type="button" tabindex="0" aria-label="More" aria-haspopup="menu" aria-expanded="true" ` +
  `class="btn btn-icon btn-sm btn-ghost">${icon("more", 14)}</button>` +
  `<div class="more-backdrop" role="presentation" data-open="true"></div>` +
  `<div class="pop-place" role="presentation" ${placed("top: 56px; left: 16px;")}>` +
  `<div class="more-menu align-right" role="menu" tabindex="-1"><div class="more-tiles">` +
  `<button type="button" role="menuitem" tabindex="-1" aria-disabled="true" data-disabled="" class="more-item">` +
  `${icon("mail", 13)}<span class="more-item-label">Email them</span></button>` +
  `<button type="button" role="menuitem" tabindex="-1" aria-disabled="true" data-disabled="" class="more-item">` +
  `${icon("calendar", 13)}<span class="more-item-label">Send booking link</span></button></div>` +
  `<p class="more-cap">They asked to stop: nothing is sent to them.</p>` +
  `<div class="more-divider" role="separator" aria-orientation="horizontal"></div>` +
  kitItem("copy", "Copy the number") +
  `</div></div>`;

/**
 * The kit's Menu of switches, open (a table's columns): the tick drawn on each, seen beside each one on; one the page
 * keeps on (Person) in the dim ink, refused, its word at its end. As chips (`chips`): rows on a desk, a line of chips on a
 * phone.
 */
const kitMenuSwitches = () =>
  `<button type="button" tabindex="0" aria-haspopup="menu" aria-expanded="true" class="btn btn-sm btn-ghost">` +
  `${icon("eye", 12)} Columns</button>` +
  `<div class="more-backdrop" role="presentation" data-open="true"></div>` +
  `<div class="pop-place" role="presentation" ${placed("top: 56px; left: 16px;")}>` +
  `<div class="more-menu align-right" role="menu" tabindex="-1" aria-label="Columns">` +
  `<div role="group"><div class="more-header" aria-hidden="true">Show on the table</div><div class="more-chips">` +
  [
    ["Person", true, "Always"],
    ["State", true, null],
    ["Email", false, null],
  ]
    .map(
      ([label, on, locked]) =>
        `<button type="button" aria-disabled="${locked ? "true" : "false"}" role="menuitemcheckbox" tabindex="-1" ` +
        `aria-checked="${on}" class="more-item">${icon("check", 13)}<span class="more-item-label">${label}</span>` +
        `${locked ? `<span class="more-item-meta">${locked}</span>` : ""}</button>`,
    )
    .join("") +
  `</div><p class="more-cap">A column off is still in the export.</p></div></div></div>`;

/** The kit's Menu of one of a set, open: the tick drawn on each option, seen beside the one chosen. */
const kitMenuSet = () =>
  `<button type="button" tabindex="0" aria-haspopup="menu" aria-expanded="true" class="btn btn-sm">Sort ` +
  `${icon("chevron-down", 10)}</button>` +
  `<div class="more-backdrop" role="presentation" data-open="true"></div>` +
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

/**
 * The kit's DatePicker, open under its control on October 2026 with the second chosen and today: Base UI's popover on
 * the panel's pop, the month's title over two arrows, the weekdays over six weeks of days (the grid's ARIA, one tab
 * stop on the chosen day) and Today at the foot.
 */
const kitDatePicker = () => {
  const weekdays = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
  const full = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];
  const week = (w) =>
    `<div role="row" class="date-pick-row">` +
    Array.from({ length: 7 }, (_, d) => {
      const day = new Date(Date.UTC(2026, 8, 28 + w * 7 + d));
      const inMonth = day.getUTCMonth() === 9;
      const chosen = inMonth && day.getUTCDate() === 2;
      return (
        `<div role="gridcell" aria-selected="${chosen}"><button type="button" class="date-pick-day" ` +
        `tabindex="${chosen ? 0 : -1}" aria-label="${full[d]}, ${day.getUTCDate()}"` +
        `${chosen ? ' aria-current="date"' : ""}${inMonth ? "" : ' data-outside="true"'}>` +
        `<span class="date-pick-num">${day.getUTCDate()}</span></button></div>`
      );
    }).join("") +
    `</div>`;
  return (
    `<button type="button" tabindex="0" aria-haspopup="dialog" aria-expanded="true" class="btn btn-sm">Go to a date</button>` +
    `<div class="pop-place" role="presentation" ${placed("top: 56px; left: 16px;")}>` +
    `<div class="panel panel-pop panel-sm date-pick" role="dialog" tabindex="-1" aria-label="Go to a date">` +
    `<div class="date-pick-head"><span class="date-pick-title" aria-live="polite">October 2026</span>` +
    `<span class="date-pick-nav">` +
    `<button type="button" class="btn btn-ghost btn-icon btn-sm" aria-label="Previous month"><span class="date-pick-back">${icon("chevron", 14)}</span></button>` +
    `<button type="button" class="btn btn-ghost btn-icon btn-sm" aria-label="Next month">${icon("chevron", 14)}</button>` +
    `</span></div>` +
    `<div role="grid" tabindex="-1" aria-label="October 2026" class="date-pick-grid">` +
    `<div role="row" class="date-pick-row">` +
    weekdays
      .map((w, d) => `<span role="columnheader" aria-label="${full[d]}" class="date-pick-dow">${w}</span>`)
      .join("") +
    `</div>` +
    Array.from({ length: 6 }, (_, w) => week(w)).join("") +
    `</div>` +
    `<div class="date-pick-foot"><button type="button" class="btn btn-ghost btn-sm">Today</button></div>` +
    `</div></div>`
  );
};

/**
 * The kit's DayRangePicker over a window of thirty days (September 7 to October 6, 2026, today the 6th, ninety days at
 * most): chosen, on October, the month it ends in, where the band runs from the weeks' start to its last day, no day
 * after today presses and the arrow to the month after stands down; and on September with a first day pressed (the
 * 14th) and the pointer on the 25th, where the band is what would be chosen, fourteen days at most here, so the days
 * too far to be the other end stand down. The date picker's head and weekdays over six weeks of days in the ARIA grid,
 * the range's two ends its selected cells, and what is chosen so far said under it.
 */
const kitDayRange = ({ month, first = null, reach = null, most = 90 }) => {
  const [from, to, today] = ["2026-09-07", "2026-10-06", "2026-10-06"];
  const weekdays = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
  const full = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];
  const months = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October"];
  const firstOf = new Date(Date.UTC(2026, month, 1));
  const start = new Date(Date.UTC(2026, month, 1 - ((firstOf.getUTCDay() + 6) % 7)));
  const key = (d) => d.toISOString().slice(0, 10);
  const apart = (a, b) => Math.abs(Date.parse(a) - Date.parse(b)) / 86_400_000;
  const band = first === null ? { from, to } : first <= reach ? { from: first, to: reach } : { from: reach, to: first };
  // The one tab stop: the range's last day, and, moved back a month by the arrow, the same day of the month before.
  const stop = month === 9 ? to : "2026-09-06";
  const cell = (d, w) => {
    const k = key(d);
    const inBand = k >= band.from && k <= band.to;
    const open = k <= today && (first === null || apart(first, k) < most);
    const marks = [
      inBand ? ' data-in="true"' : "",
      k === band.from ? ' data-start="true"' : "",
      k === band.to ? ' data-end="true"' : "",
      d.getUTCMonth() === month ? "" : ' data-outside="true"',
      k === today ? ' data-today="true"' : "",
    ].join("");
    const name = `${full[w]}, ${months[d.getUTCMonth()]} ${d.getUTCDate()}, 2026${inBand ? ", in the range" : ""}`;
    return (
      `<div role="gridcell" class="date-pick-cell" data-day="${k}" aria-selected="${k === band.from || k === band.to}"${marks}>` +
      `<button type="button" class="date-pick-day" tabindex="${k === stop ? 0 : -1}" aria-label="${name}"` +
      `${k === today ? ' aria-current="date"' : ""}${open ? "" : ' aria-disabled="true"'}>` +
      `<span class="date-pick-num">${d.getUTCDate()}</span></button></div>`
    );
  };
  const week = (w) =>
    `<div role="row" class="date-pick-row">` +
    Array.from({ length: 7 }, (_, d) => cell(new Date(start.getTime() + (w * 7 + d) * 86_400_000), d)).join("") +
    `</div>`;
  const hint =
    first === null ? "Press a first day, then a last. 90 days at most." : "Sep 14 – Sep 25, 12 days. Press to choose.";
  // Nothing after the month that holds today can be chosen: the arrow that goes there stands down.
  const last = month === 9;
  return (
    `<div class="date-pick-month"${first === null ? "" : ' data-pending="true"'}>` +
    `<div class="date-pick-head"><span class="date-pick-title" aria-live="polite">${months[month]} 2026</span>` +
    `<span class="date-pick-nav">` +
    `<button type="button" class="btn btn-ghost btn-icon btn-sm" aria-label="Previous month"><span class="date-pick-back">${icon("chevron", 14)}</span></button>` +
    `<button type="button" class="btn btn-ghost btn-icon btn-sm" aria-label="Next month"${last ? " disabled" : ""}>${icon("chevron", 14)}</button>` +
    `</span></div>` +
    `<div role="grid" tabindex="-1" aria-label="Days" aria-multiselectable="true" class="date-pick-grid">` +
    `<div role="row" class="date-pick-row">` +
    weekdays
      .map((w, d) => `<span role="columnheader" aria-label="${full[d]}" class="date-pick-dow">${w}</span>`)
      .join("") +
    `</div>` +
    Array.from({ length: 6 }, (_, w) => week(w)).join("") +
    `</div>` +
    `<p class="date-pick-hint" role="status">${hint}</p>` +
    `</div>`
  );
};

/** The kit's Tooltip, shown over its control. */
const kitTooltip = () =>
  `<button type="button" class="btn btn-sm">Export</button>` +
  `<div class="tip-place" role="presentation" ${placed("top: 56px; left: 16px;")}>` +
  `<div class="ui-tip show" tabindex="-1">Only an owner can export this workspace's people.</div></div>`;

/** The kit's Figure as its component draws it: a term and its definitions, in the page's list (`.gx-figs` is the gallery's). */
const figure = ({
  term = "Customer messages",
  value = "17",
  change = null,
  meta = "on 6 of 7 days",
  door = null,
  thin = null,
  tone = null,
  washed = false,
  tile = false,
} = {}) => {
  const said = washed ? `<span class="wash" data-wash="true">${value}</span>` : value;
  const number =
    door === "a"
      ? `<a class="figure-door" href="#">${said}</a>`
      : door === "button"
        ? `<button type="button" class="figure-door">${said}</button>`
        : said;
  return (
    `<dl class="gx-figs"><div class="figure${tile ? " figure-tile" : ""}${thin === null ? "" : " is-thin"}${tone === null ? "" : ` is-${tone}`}"><dt class="figure-label">${term}</dt>` +
    `<dd class="figure-value">${number}${change ? `<span class="figure-change">${change}</span>` : ""}</dd>` +
    `${meta ? `<dd class="figure-meta">${meta}</dd>` : ""}` +
    `${thin === null ? "" : `<dd class="figure-n">only ${thin}, too few to read</dd>`}</div></dl>`
  );
};

/** The figure whose label carries a definition, shown: the kit's Tooltip over the term. */
const figureDefined = () =>
  figure({ term: `<span class="figure-term" tabindex="0">Customer messages</span>` }) +
  `<div class="tip-place" role="presentation" ${placed("top: 64px; left: 16px;")}>` +
  `<div class="ui-tip show" tabindex="-1">What customers wrote or phoned in. Your replies and your campaigns are not counted.</div></div>`;

/** An option of the kit's select or combobox: its words and its word at the end, walked to, chosen, or neither. */
const kitOption = (label, meta, { chosen = false, walked = false, focus = null } = {}) =>
  `<div role="option" aria-selected="${chosen}"${focus === null ? "" : ` tabindex="${focus}"`} class="rec-combo-opt"` +
  `${chosen ? ' data-selected="" data-chosen="true"' : ""}${walked ? ' data-highlighted=""' : ""}>` +
  `<span class="rec-combo-label">${label}</span><span class="rec-combo-meta">${meta}</span></div>`;

/** The kit's Select in its Field, open: its box a button, its list over the page, the one chosen walked to. */
const kitSelect = () =>
  `<div class="rec-field"><label><span class="rec-field-label">Service</span></label>` +
  `<button type="button" tabindex="0" role="combobox" aria-expanded="true" aria-haspopup="listbox" ` +
  `class="rec-input rec-select" data-popup-open=""><span>Consultation</span><span aria-hidden="true">${icon("chevron-down", 12)}</span>` +
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

/** An option of the kit's Picker: its glyph, its words and the line under them, and a word at its end, as picker.tsx draws it. */
const pickOption = (label, { sub = null, meta = null, glyph = null, chosen = false, walked = false, id = null } = {}) =>
  `<div${chosen ? ' data-selected=""' : ""} role="option"${id ? ` id="${id}"` : ` tabindex="${walked ? 0 : -1}"`} ` +
  `aria-selected="${chosen}" ` +
  `class="rec-combo-opt"${chosen ? ' data-chosen="true"' : ""}${walked ? ' data-highlighted=""' : ""}>` +
  (glyph ? `<span class="rec-combo-glyph" aria-hidden="true">${icon(glyph, 13)}</span>` : "") +
  `<span class="rec-combo-words"><span class="rec-combo-label">${label}</span>` +
  (sub ? `<span class="rec-combo-sub">${sub}</span>` : "") +
  `</span>` +
  (meta ? `<span class="rec-combo-meta">${meta}</span>` : "") +
  `</div>`;

/** A group of the kit's Picker under its heading. */
const pickGroup = (label, options) =>
  `<div role="group" class="rec-combo-group"><div aria-hidden="true" class="rec-combo-group-label">${label}</div>` +
  options.join("") +
  `</div>`;

/**
 * The kit's Picker on a short list (Base UI's Select), open: its token in its sentence, pressed, and its list over the
 * page on the panel's pop -- two groups under their headings, the one chosen with a line under it, walked to, and the
 * note at the list's foot.
 */
const kitPicker = () =>
  `<span class="gx-pop-words">Every day at <button type="button" tabindex="0" role="combobox" aria-expanded="true" ` +
  `aria-haspopup="listbox" aria-label="The hour it runs: 10:00" class="token" data-popup-open="" data-pressed="">` +
  `<span class="token-face">10:00</span><span aria-hidden="true" class="token-caret" data-popup-open="">` +
  `${icon("chevron-down", 11)}</span></button></span>` +
  `<div class="pop-place" role="presentation" data-open="" ${placed("top: 60px; left: 16px;")}>` +
  `<div class="panel panel-pop panel-flush rec-combo-pop" role="presentation" tabindex="-1" data-open="">` +
  `<div role="listbox" class="rec-combo-list">` +
  pickGroup("Morning", [
    pickOption("09:00"),
    pickOption("10:00", { sub: "When most of them write back", chosen: true, walked: true }),
  ]) +
  pickGroup("Afternoon", [pickOption("14:00")]) +
  `</div><p class="rec-combo-note">Hours outside 9 to 21 are not offered.</p></div></div>`;

/**
 * The kit's Picker on a list to search (Base UI's Combobox, its input inside the popup), open: its token in its
 * sentence, and over the page the search at the list's top, what none matching says (nothing yet), and the moments in
 * their groups, each with its glyph and the line under its words, one with a count at its end.
 */
const kitPickerFind = () =>
  `<span class="gx-pop-words">Send it to <button type="button" tabindex="0" role="combobox" aria-expanded="true" ` +
  `aria-haspopup="dialog" aria-label="The moment it runs on: Win-back" class="token" data-popup-open="" ` +
  `data-pressed=""><span class="token-face">Win-back</span><span aria-hidden="true" class="token-caret">` +
  `${icon("chevron-down", 11)}</span></button></span>` +
  `<div class="pop-place" role="presentation" data-open="" ${placed("top: 60px; left: 16px;")}>` +
  `<div class="panel panel-pop panel-flush rec-combo-pop" role="dialog" aria-label="The moment it runs on" ` +
  `tabindex="-1" data-open=""><span class="rec-combo-field"><span class="rec-combo-glass" aria-hidden="true">` +
  `${icon("search", 12)}</span><input class="rec-combo-input" role="combobox" aria-expanded="true" ` +
  `aria-haspopup="listbox" aria-autocomplete="list" autocomplete="off" spellcheck="false" ` +
  `placeholder="Find a moment" aria-label="The moment it runs on" value=""></span>` +
  `<div role="status" aria-live="polite" aria-atomic="true" class="rec-combo-empty"></div>` +
  `<div role="listbox" tabindex="-1" class="rec-combo-list">` +
  pickGroup("Set up", [
    pickOption("Win-back", {
      sub: "Nothing heard in 30 days",
      glyph: "refresh",
      chosen: true,
      walked: true,
      id: "pk-0",
    }),
  ]) +
  pickGroup("Not set up", [
    pickOption("Save our number", { sub: "Only ever phoned, never texted", glyph: "phone", id: "pk-1" }),
    pickOption("Welcome", { sub: "First contact in the last 7 days", meta: "3 today", glyph: "user", id: "pk-2" }),
  ]) +
  `</div></div></div>`;

/**
 * The kit's Picker on a list to search, with words that match nothing: what none matching says, in the dim ink under
 * the search (`.rec-combo-empty:not(:empty)`), over a list with nothing in it.
 */
const kitPickerNone = () =>
  `<span class="gx-pop-words">Send it to <button type="button" tabindex="0" role="combobox" aria-expanded="true" ` +
  `aria-haspopup="dialog" aria-label="The moment it runs on: Win-back" class="token" data-popup-open="" ` +
  `data-pressed=""><span class="token-face">Win-back</span><span aria-hidden="true" class="token-caret">` +
  `${icon("chevron-down", 11)}</span></button></span>` +
  `<div class="pop-place" role="presentation" data-open="" ${placed("top: 60px; left: 16px;")}>` +
  `<div class="panel panel-pop panel-flush rec-combo-pop" role="dialog" aria-label="The moment it runs on" ` +
  `tabindex="-1" data-open=""><span class="rec-combo-field"><span class="rec-combo-glass" aria-hidden="true">` +
  `${icon("search", 12)}</span><input class="rec-combo-input" role="combobox" aria-expanded="true" ` +
  `aria-haspopup="listbox" aria-autocomplete="list" autocomplete="off" spellcheck="false" ` +
  `placeholder="Find a moment" aria-label="The moment it runs on" value="Birthday"></span>` +
  `<div role="status" aria-live="polite" aria-atomic="true" class="rec-combo-empty">No moment has those words.</div>` +
  `<div role="listbox" tabindex="-1" class="rec-combo-list"></div></div></div>`;

/** The kit's Picker read-only: its token in its sentence says what was chosen and opens nothing, so it is no press. */
const kitPickerReadOnly = () =>
  `<span class="gx-pop-words">Every day at <button type="button" tabindex="0" role="combobox" aria-expanded="false" ` +
  `aria-haspopup="listbox" aria-readonly="true" aria-label="The hour it runs: 10:00" class="token" data-readonly="">` +
  `<span class="token-face">10:00</span><span aria-hidden="true" class="token-caret">` +
  `${icon("chevron-down", 11)}</span></button></span>`;

/** The kit's Picker read as a word of its sentence (`inline`): no capsule, its words underlined, its chevron after. */
const kitPickerInline = () =>
  `<span class="gx-pop-words">Every day at <button type="button" tabindex="0" role="combobox" aria-expanded="false" ` +
  `aria-haspopup="listbox" aria-label="The hour it runs: 10:00" class="token token-inline">` +
  `<span class="token-face">10:00</span><span aria-hidden="true" class="token-caret">` +
  `${icon("chevron-down", 11)}</span></button>, up to 25 people a run.</span>`;

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

/** One sub-tab of the kit's, as Base UI's Tabs draws it: its word holding the room of its bold form, its figure after. */
const kitSubtab = (label, { on = false, count, tone, glyph = "", fresh } = {}) =>
  `<button type="button" role="tab" aria-selected="${on}" aria-disabled="false" tabindex="${on ? 0 : -1}" class="subtab"` +
  `${tone ? ` data-tone="${tone}"` : ""}>${glyph}<span class="subtab-label" data-text="${label}">${label}</span>` +
  `${count === undefined ? "" : `<span class="subtab-count">${count}</span>`}` +
  `${fresh ? `<span class="subtab-dot" role="img" aria-label="${fresh}"></span>` : ""}</button>`;

/** A strip of the kit's sub-tabs: Base UI's tablist, its tabs, and the indicator that is the bar under the picked one. */
const kitSubtabs = (name, tabs, { attrs = "", left = "18px", width = "78px", direction = "none" } = {}) =>
  `<div class="subtabs-stand"><div role="tablist" aria-label="${name}" class="subtabs"${attrs}>${tabs.join("")}` +
  `<span role="presentation" class="subtab-bar" data-activation-direction="${direction}" ` +
  `style="--active-tab-left: ${left}; --active-tab-width: ${width};"></span></div></div>`;

/** The phone's places, as the frame hands them to TabBar (app-shell.jsx PHONE_TABS): each word with its glyph. */
const TAB_BAR_PLACES = [
  ["Today", "home"],
  ["Inbox", "inbox"],
  ["Calendar", "calendar"],
  ["People", "users"],
];

/**
 * The tab bar as TabBar draws it, as wide as a phone's (the gallery's own layout): the four places and More, `lit` the
 * place lit and `page` the one the address names, a place's count over its glyph; `glide` the lozenge's place part way.
 */
const kitTabBar = (lit, counts = {}, { glide = null, page = lit } = {}) =>
  `<div class="gx-phone-bar"><nav class="tab-bar" aria-label="Main"${glide ? ' data-glide=""' : ""}>` +
  `<span class="tab-bar-pill" aria-hidden="true"${glide ? ` style="transform: ${glide};"` : ""}></span>` +
  TAB_BAR_PLACES.map(
    ([word, glyph]) =>
      `<a class="tab-bar-tab${word === lit ? " active" : ""}" href="#"${word === page ? ' aria-current="page"' : ""} draggable="false">` +
      `<span class="tab-bar-glyph">${icon(glyph, 18)}` +
      `${counts[word] ? `<span class="tab-bar-count tally tally-icon tally-warn">${counts[word]}</span>` : ""}</span>${word}</a>`,
  ).join("") +
  `<button type="button" class="tab-bar-tab" aria-label="Menu"><span class="tab-bar-glyph">${icon("menu", 18)}</span>More</button>` +
  `</nav></div>`;

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

/** The kit's field as a title said in place: no label drawn, the box named by its own words, a box only as it is touched. */
const kitFieldTitle = () =>
  `<div class="rec-field"><input class="rec-input rec-input-title" type="text" ` +
  `aria-label="The playbook's name" placeholder="Win-back" value="Win-back, for people who have not been in"></div>`;

/* ---- the families ---- */

/** The kit's families and their entries. Every class in classes.json is drawn by at least one entry. */
export const FAMILIES = [
  {
    family: "Button",
    about:
      "The button: secondary, primary, quiet, plain and danger; small, and a glyph alone; the size of the words it holds, in their own type; a link drawn as one; off; refused by a role.",
    entries: [
      {
        id: "btn",
        html: `<button type="button" class="btn">Export</button> <button type="button" class="btn">${icon("plus", 13)}Add a person</button>`,
      },
      { id: "btn-primary", html: `<button type="button" class="btn btn-primary">${icon("check", 13)}Save</button>` },
      { id: "btn-ghost", html: `<button type="button" class="btn btn-ghost">Cancel</button>` },
      {
        id: "btn-plain",
        html:
          `<button type="button" class="btn btn-sm btn-plain">Select</button>` +
          `<button type="button" class="btn btn-sm btn-plain" aria-haspopup="menu" aria-expanded="true">Sort</button>` +
          `<button type="button" class="btn btn-sm btn-plain">Export</button>`,
      },
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
        id: "btn-lg",
        html:
          `<button type="button" class="btn btn-lg btn-primary">Open the thread</button> ` +
          `<button type="button" class="btn btn-lg">More ${icon("chevron-down", 10)}</button> ` +
          `<button type="button" class="btn btn-icon btn-lg" aria-label="Clear the selection">${icon("x", 14)}</button>`,
      },
      {
        id: "btn-icon",
        html:
          `<button type="button" class="btn btn-icon" aria-label="More">${icon("more", 14)}</button> ` +
          `<button type="button" class="btn btn-icon btn-sm" aria-label="Close">${icon("x", 12)}</button>`,
      },
      {
        id: "btn-touch-glass",
        html:
          `<button type="button" class="btn btn-touch btn-primary">Open the thread</button> ` +
          `<button type="button" class="btn btn-icon btn-touch btn-glass" aria-label="Call">${icon("phone", 16)}</button> ` +
          `<button type="button" class="btn btn-icon btn-touch btn-glass" aria-label="Note">${icon("note", 16)}</button> ` +
          `<button type="button" class="btn btn-icon btn-touch btn-glass" aria-label="More">${icon("more", 18)}</button>`,
      },
      {
        id: "btn-touch-quiet",
        html:
          `<button type="button" class="btn btn-icon btn-touch btn-ghost" aria-label="Call">${icon("phone", 16)}</button> ` +
          `<button type="button" class="btn btn-icon btn-touch btn-ghost" aria-label="More">${icon("more", 18)}</button>`,
      },
      {
        // A left chevron is the right one turned (kit.css .icon-turned): a walk's ‹ › between two people.
        id: "btn-icon-turned",
        html:
          `<button type="button" class="btn btn-icon btn-sm btn-ghost" aria-label="Previous person">` +
          `${icon("chevron", 12).replace('class="icon"', 'class="icon icon-turned"')}</button> ` +
          `<button type="button" class="btn btn-icon btn-sm btn-ghost" aria-label="Next person">${icon("chevron", 12)}</button>`,
      },
      {
        id: "btn-text",
        html: `<button type="button" class="btn btn-text btn-ghost" aria-pressed="false">Visit reminder: 12 people, 3 campaigns, 2 on and 1 paused</button>`,
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
    family: "Search",
    about:
      "The capsule a list is searched from, Search (surfaces/kit/search/search.tsx), People's, the Inbox's and " +
      "Conversations': the field, always, the capsule its label, so a press anywhere on it is in the field (typed at 16px " +
      "on a phone, drawn at the page's size), and the clear in its end from the first word.",
    entries: [
      {
        id: "search",
        html:
          `<div class="search"><label class="search-box">${icon("search", 15)}` +
          `<span class="search-field"><input type="search" inputmode="search" enterkeyhint="search" autocomplete="off" ` +
          `value="" placeholder="Search names, numbers and emails" aria-label="Search names, numbers and emails"></span>` +
          `</label></div>`,
      },
      {
        id: "search-words",
        html:
          `<div class="search"><label class="search-box">${icon("search", 15)}` +
          `<span class="search-field"><input type="search" inputmode="search" enterkeyhint="search" autocomplete="off" ` +
          `value="Sam" placeholder="Search names, numbers and emails" aria-label="Search names, numbers and emails"></span>` +
          `<button type="button" class="search-clear" aria-label="Clear the search">${icon("x", 12)}</button></label></div>`,
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
        id: "chip-x-link",
        html:
          `<span class="chip"><a href="#kit">Bridal party</a>` +
          `<button type="button" class="chip-x" aria-label="Take Emily Chen off Bridal party">${icon("x", 9)}</button></span>`,
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
        id: "more-menu-select",
        stage: "pop",
        html:
          `<div class="more-wrap"><button type="button" class="rec-input rec-select" aria-haspopup="menu" aria-expanded="true">All activity ${icon("chevron-down", 10)}</button>` +
          `<div class="more-backdrop"></div>` +
          `<div class="more-menu align-left" role="menu">` +
          `<button class="more-item" role="menuitemradio" aria-checked="true">${icon("check", 13)}<span class="more-item-label">All activity</span></button>` +
          `<button class="more-item" role="menuitemradio" aria-checked="false">${icon("check", 13)}<span class="more-item-label">What went wrong or was stopped</span></button>` +
          `<button class="more-item" role="menuitemradio" aria-checked="false">${icon("check", 13)}<span class="more-item-label">Conversations</span></button>` +
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
      // A phone's menu (data-sheet, held in its entry here rather than at the screen's foot): a choice with what it does
      // under its words, as a sentence beside them goes under on a phone (the fitted sheets, 14 Oct 2026).
      {
        id: "more-menu-sheet-two",
        stage: "pop",
        html:
          `<div class="more-wrap"><button type="button" class="btn btn-sm btn-ghost" aria-haspopup="menu" aria-expanded="true">Asks you ${icon("chevron-down", 10)}</button>` +
          `<div class="more-menu align-right" role="menu" data-sheet="" style="position: static;">` +
          `<div class="more-header">Google reviews</div>` +
          `<button class="more-item more-item-two" role="menuitemradio" aria-checked="true">${icon("check", 13)}<span class="more-item-label">Sends it</span>` +
          `<span class="more-item-meta">Answers each new review within the hour, in the business's name.</span></button>` +
          `<button class="more-item more-item-two" role="menuitemradio" aria-checked="false">${icon("check", 13)}<span class="more-item-label">Asks you</span>` +
          `<span class="more-item-meta">Writes a draft when you open a reply; you send it.</span></button>` +
          `</div></div>`,
      },
      // A set of short values on a phone (MoreMenu `grid`: a day's times): chips four across under their headings, the one
      // held lit, how long the day runs under a closing's chip, and the night's hours folded behind their heading.
      {
        id: "more-menu-grid",
        stage: "pop",
        html:
          `<div class="more-wrap"><button type="button" class="rec-input rec-select" aria-haspopup="menu" aria-expanded="true">5 PM ${icon("chevron-down", 10)}</button>` +
          `<div class="more-menu align-left more-menu-grid" role="menu" data-sheet="" style="position: static;">` +
          `<div class="more-header">Afternoon</div>` +
          [
            ["4 PM", "7 h", false],
            ["4:30 PM", "7 h 30 min", false],
            ["5 PM", "8 h", true],
            ["5:30 PM", "8 h 30 min", false],
          ]
            .map(
              ([label, hint, on]) =>
                `<button class="more-item" role="menuitemradio" aria-checked="${on}">${icon("check", 13)}` +
                `<span class="more-item-label">${label}</span><span class="more-item-hint">${hint}</span></button>`,
            )
            .join("") +
          `<div class="more-divider"></div>` +
          `<button type="button" class="more-header more-header-fold">Night ${icon("chevron-down", 10)}</button>` +
          `</div></div>`,
      },
    ],
  },
  {
    family: "Confirm",
    about:
      "The one armed question, Confirm: a line where the control was, its Yes red when the act destroys and red words alone when it discards what was typed; a panel under the row, with the name erasure asks to be typed and what went wrong. Its two answers are buttons, side by side, each half the width in a panel, in a sheet's foot and on a phone.",
    entries: [
      {
        id: "confirm",
        html:
          `<span class="confirm" role="group" aria-label="Disconnect Google?"><span class="confirm-words">` +
          `<span class="confirm-q">Disconnect Google?</span>` +
          `<span class="confirm-detail">The public listing stays; replies and the history do not.</span></span>` +
          `<span class="confirm-acts"><button type="button" class="btn btn-sm">Yes, disconnect</button>` +
          `<button type="button" class="btn btn-sm btn-ghost">No</button></span></span>`,
      },
      {
        id: "confirm-danger",
        html:
          `<span class="confirm confirm-danger" role="group" aria-label="Delete the list?"><span class="confirm-words">` +
          `<span class="confirm-q">Delete the list?</span>` +
          `<span class="confirm-detail">The people on it stay.</span></span>` +
          `<span class="confirm-acts"><button type="button" class="btn btn-sm btn-danger">Yes, delete</button>` +
          `<button type="button" class="btn btn-sm btn-ghost">No</button></span></span>`,
      },
      { id: "confirm-discard", html: discardAsk() },
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
          `<button type="button" class="btn btn-sm btn-ghost">No</button></span></span>`,
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
      "A page's views, ViewTabs (surfaces/kit/view-tabs/view-tabs.tsx): links on one capsule, the picked one the lozenge in ink, a count beside a word that has one, the dot on a view with something on now, and a second strip wearing its own name. The highlight a change of view carries is in each, unseen at rest.",
    entries: [
      {
        id: "stabs",
        html:
          `<nav class="stabs stabs-inbox" aria-label="Section views"><span class="stabs-pill" aria-hidden="true"></span>` +
          `<a class="stabs-tab active" href="#" aria-current="page">Needs you <span class="stabs-badge tally tally-warn" data-tone="warn">3</span></a>` +
          `<a class="stabs-tab" href="#">Conversations</a>` +
          `<a class="stabs-tab" href="#">Live <span class="live-dot"></span></a></nav>`,
      },
      {
        id: "stabs-campaigns",
        html:
          `<nav class="stabs stabs-campaigns" aria-label="Section views"><span class="stabs-pill" aria-hidden="true"></span>` +
          `<a class="stabs-tab" href="#">Playbooks</a>` +
          `<a class="stabs-tab active" href="#" aria-current="page">Broadcasts</a><a class="stabs-tab" href="#">Templates</a></nav>`,
      },
      {
        id: "stabs-fill",
        html:
          `<nav class="stabs stabs-person" aria-label="Their page" data-fill="true"><span class="stabs-pill" aria-hidden="true"></span>` +
          `<a class="stabs-tab active" href="#" aria-current="page">Overview</a><a class="stabs-tab" href="#">History</a>` +
          `<a class="stabs-tab" href="#">Visits</a><a class="stabs-tab" href="#">About</a></nav>`,
      },
    ],
  },
  {
    family: "Tab strip, as a view changes",
    about:
      "The highlight a change of view carries from the tab lit to the tab picked (surfaces/kit/view-tabs/glide.ts): one element, placed by transform on the page's own timeline while the strip says it glides, the picked tab's own fill clear meanwhile. Here it is half way from Needs you to Conversations, which is lit before the address has moved.",
    entries: [
      {
        id: "stabs-glide",
        html:
          `<nav class="stabs stabs-inbox" aria-label="Section views" data-glide="">` +
          `<span class="stabs-pill" aria-hidden="true" style="transform: translate3d(48px, 0, 0) scaleX(1);"></span>` +
          `<a class="stabs-tab" href="#" aria-current="page">Needs you</a><a class="stabs-tab active" href="#">Conversations</a>` +
          `<a class="stabs-tab" href="#">Live</a></nav>`,
      },
    ],
  },
  {
    family: "Tab bar",
    about:
      "The places a thumb goes on a phone, TabBar (surfaces/kit/tab-bar/tab-bar.tsx): links on one capsule of glass, each a glyph over its word, the place on screen the lozenge in the tab's coral, the count over a glyph that has one, and More, which is no place, as a button after them. The lozenge a change of place carries is in it, unseen at rest. A page places the bar (mobile.css): here it stands as wide as a phone's.",
    entries: [
      {
        id: "tab-bar",
        html: kitTabBar("Today", { Inbox: 3 }),
      },
    ],
  },
  {
    family: "Tab bar, as a place changes",
    about:
      "The lozenge a change of place carries from the place lit to the one pressed (surfaces/kit/view-tabs/glide.ts, on a timeline of its own: motion/view-deck.ts alone): one element, placed by transform while the bar says it glides, the lit place's own fill clear meanwhile. Here it is half way from Today to the Inbox, which is lit as the finger lands, before the address has moved.",
    entries: [
      {
        id: "tab-bar-glide",
        html: kitTabBar("Inbox", {}, { glide: "translate3d(34px, 0, 0) scaleX(0.56)", page: "Today" }),
      },
    ],
  },
  {
    family: "Sub-tabs, on Base UI",
    about:
      "A page's own sub-menu, SubTabs (surfaces/kit/sub-tabs/sub-tabs.tsx): Base UI's tabs as small text tabs on a line under the strip of views, the picked one in ink with a bar that is the Tabs' indicator, a plain figure beside a word that has one; a strip that is quiet on a phone, which keeps only the warn tab's figure; a dense one for a desk pane with more tabs than room; a dot after the words where something there is new to the reader; and a glyph before the words.",
    entries: [
      {
        id: "subtabs",
        html: kitSubtabs("Conversations by status", [
          kitSubtab("Needs you", { on: true, count: 27 }),
          kitSubtab("Handled"),
          kitSubtab("Snoozed", { count: 3 }),
        ]),
      },
      {
        id: "subtabs-quiet",
        html: kitSubtabs(
          "Conversations by status",
          [
            kitSubtab("Needs you", { on: true, count: 27, tone: "warn" }),
            kitSubtab("Handled", { count: 112 }),
            kitSubtab("Snoozed", { count: 3 }),
          ],
          { attrs: ' data-quiet="true"' },
        ),
      },
      {
        id: "subtabs-dense",
        html: kitSubtabs(
          "Conversations by channel",
          [
            kitSubtab("All", { on: true, count: 64 }),
            kitSubtab("Calls", { count: 13 }),
            kitSubtab("WhatsApp", { count: 35 }),
            kitSubtab("Text", { count: 6 }),
            kitSubtab("Email", { count: 10 }),
          ],
          { attrs: ' data-dense="true"', left: "14px", width: "38px" },
        ),
      },
      {
        id: "subtabs-fresh",
        html: kitSubtabs(
          "Their record",
          [
            kitSubtab("Overview", { on: true }),
            kitSubtab("History", { count: 14, fresh: "New since you last looked" }),
            kitSubtab("Visits", { count: 2 }),
          ],
          { width: "70px" },
        ),
      },
      {
        id: "subtabs-glyph",
        html: kitSubtabs(
          "Conversations by channel",
          [
            kitSubtab("All", { on: true, count: 64, glyph: icon("inbox", 13) }),
            kitSubtab("Calls", { count: 12, glyph: icon("phone", 13) }),
            kitSubtab("Email", { glyph: icon("mail", 13) }),
          ],
          { left: "18px", width: "74px", direction: "right" },
        ),
      },
    ],
  },
  {
    family: "Capsule",
    about:
      "The control layer's glass as a bar, where a page takes a phone's screen over: a thread's header with a face, a name over its line, and a button; a field with its round button, as the whisper has it; and a bar docked at the foot (data-dock), as a selection's is.",
    entries: [
      {
        id: "capsule",
        html:
          `<div data-takeover="true"><div class="capsule" style="display: flex; align-items: center; gap: 8px; padding: 8px 10px;">` +
          `<span class="face face-lg" aria-hidden="true"><span>AR</span></span>` +
          `<span style="flex: 1">Aisha Rahman</span>` +
          `<button type="button" class="btn btn-ghost btn-sm">Actions</button></div></div>`,
      },
      {
        id: "capsule-dock",
        html:
          `<div class="capsule" data-dock="true" style="position: relative; display: flex; align-items: center; gap: 6px; height: 52px; padding: 0 8px;">` +
          `<button type="button" class="btn btn-icon btn-lg" aria-label="Clear the selection">${icon("x", 16)}</button>` +
          `<span style="flex: 1"><b>2</b> selected</span>` +
          `<button type="button" class="btn btn-lg">Add to list ${icon("chevron-down", 10)}</button>` +
          `<button type="button" class="btn btn-icon btn-lg" aria-label="More for the 2 selected">${icon("more", 16)}</button></div>`,
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
      {
        // A narrow rail's rows (canvas A's Messages and receptionist): the key over its answer, the act beside both.
        id: "rec-row-stacked",
        html: recCard(
          `<div class="rec-row rec-row-stacked" data-empty="false" data-act="true"><span class="rec-row-key">Visit messages</span>` +
            `<div class="rec-row-val"><span class="rec-row-value">Not asked</span></div>${recAct("Record a yes")}</div>` +
            `<div class="rec-row rec-row-stacked" data-empty="false"><span class="rec-row-key">Offers by email</span>` +
            `<div class="rec-row-val"><span class="rec-row-value">Not asked · read only</span></div></div>`,
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
        // The browser's own select in the box (kit.css, select.rec-input): for a form that can import no part of the kit.
        id: "rec-field-native-select",
        html:
          `<div class="rec-field"><label><span class="rec-field-label">Carrier</span>` +
          `<select class="rec-input"><option>Verizon</option><option>AT&amp;T</option>` +
          `<option>Another carrier or a landline</option></select></label></div>`,
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
      "A switch (RecordSwitch), off, on and read-only; a choice of a few drawn as a segmented control (RecordToggleGroup), its options as cards with a sentence each, and more options than one row holds, wrapping (a call's outcomes).",
    entries: [
      {
        id: "rec-switch",
        html: `${recSwitch(false, "Send it now")} ${recSwitch(true, "Remind them the day before")} ${recSwitch(true, "Take calls", true)}`,
      },
      { id: "rec-seg", html: recSeg("How often", ["Once", "Every week", "Every month"], "Every week") },
      {
        id: "rec-seg-wrap",
        html:
          `<div style="max-width: 320px">` +
          recSeg(
            "How did the call go?",
            [
              "Spoke",
              "Interested",
              "Not interested",
              "Call back later",
              "Left a voicemail",
              "No answer",
              "Wrong number",
            ],
            "Call back later",
          ).replace('class="rec-seg"', 'class="rec-seg" data-wrap="true"') +
          `</div>`,
      },
      {
        id: "rec-seg-chips",
        html: recSeg(
          "How did the call go?",
          ["Spoke", "Call back later", "Left a voicemail", "No answer", "Wrong number"],
          "Call back later",
        ).replace('class="rec-seg"', 'class="rec-seg" data-look="chips"'),
      },
      {
        id: "rec-seg-chips-sm",
        html: recSeg("Day", ["Today", "Tomorrow", "Fri", "Pick a day"], "Tomorrow").replace(
          'class="rec-seg"',
          'class="rec-seg" data-look="chips-sm"',
        ),
      },
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
      "The record kit's edits in place: a fold opened under its row with its fields, what saving writes and Save; a wide one; one closed; one saving; what saving writes folded behind one line, as a sheet draws it (RecordDisclosure), closed and open; the inline editor in the row it edits, open, saving and closed.",
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
      { id: "rec-says-folded", html: recCard(recSaysFolded({ mark: "Changed" })) },
      { id: "rec-says-folded-open", html: recCard(recSaysFolded({ open: true, mark: "Changed" })) },
      { id: "rec-disclosure-group", html: recCard(recDisclosureGroup()) },
      { id: "rec-disclosure-group-open", html: recCard(recDisclosureGroup({ open: true })) },
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
      "RecordSheet, beside the page over its wash: its head, tools, rows and foot; a fold drawn as a sheet with its row behind it, and with the question a discard asks in its foot; the still copies that play each one's leaving; and each as a phone draws it from the bottom (data-phone: its grabber, its Close out of sight beside a foot that closes, the list fitted to what it holds).",
    entries: [
      { id: "rec-sheet", stage: "sheet", html: recSheet() },
      { id: "rec-sheet-leaving", stage: "sheet", html: recSheet(true) },
      { id: "rec-sheet-asking", stage: "sheet", html: recSheet(false, true) },
      { id: "rec-fold-sheet", stage: "sheet", html: recFoldSheet() },
      { id: "rec-fold-sheet-asking", stage: "sheet", html: recFoldSheet(false, true) },
      { id: "rec-fold-sheet-leaving", stage: "sheet", html: recFoldSheet(true) },
      { id: "rec-sheet-phone", stage: "sheet", html: recSheet(false, false, true) },
      { id: "rec-fold-sheet-phone", stage: "sheet", html: recFoldSheet(false, false, true) },
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
    family: "Notice",
    about:
      "kit/notice/notice.tsx (canvas A, one suggestion grammar): a fact the page noticed in an inset where it lives, its " +
      "subject in bold and its source dim after it, its one act and the × that puts it away; the line form puts the act " +
      "beside the fact.",
    entries: [
      {
        id: "notice",
        html:
          `<div class="notice" role="group" aria-label="Gave their name as Dana Ruiz">` +
          `<p class="notice-fact">Gave their name as <b>Dana Ruiz</b><span class="notice-src"> · on the call Oct 2</span></p>` +
          `<div class="notice-acts"><button type="button" class="btn btn-sm">Use this name</button>` +
          `<button type="button" class="btn btn-icon btn-sm btn-ghost notice-x" aria-label="Not theirs" title="Not theirs">` +
          `${icon("x", 11)}</button></div></div>`,
      },
      {
        id: "notice-line",
        html:
          `<div class="notice notice-line" role="group" aria-label="A draft answer is waiting in the thread">` +
          `<p class="notice-fact">A draft answer is waiting in the thread</p>` +
          `<div class="notice-acts"><button type="button" class="btn btn-sm">Review the draft</button></div></div>`,
      },
    ],
  },
  {
    family: "Copy",
    about:
      "kit/copy-button/copy-button.tsx (canvas A, M5): quiet words that copy and say so in place, a check and Copied in " +
      "the ok ink for two seconds, never a toast; in a menu the item says it and the menu stays open.",
    entries: [
      {
        id: "copy-button",
        html: `<button type="button" class="btn btn-sm btn-ghost copy-btn" aria-live="polite">Copy the link</button>`,
      },
      {
        id: "copy-button-copied",
        html:
          `<button type="button" class="btn btn-sm btn-ghost copy-btn" aria-live="polite" data-copied="true">` +
          `${icon("check", 12)} Copied</button>`,
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
      "spec holds it equal to. And a line's door: a list row's name in the line's own size, weight and ink, cut with " +
      "an ellipsis.",
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
      {
        id: "link-btn-inherit",
        html: `<a class="link-btn link-btn-inherit" href="#kit">Win-back, for everyone quiet for 30 days with nothing booked</a>`,
      },
    ],
  },
  {
    family: "Face",
    about:
      "kit.css's face (step 2.2): a person, a lead or a conversation as initials in a circle, a glyph for someone " +
      "known by a number or an address, a picture over the initials, a lead's own mark over that, the four sizes " +
      "(the phone row's, a desk row's, a header's and a page's head), a thread's priority and a row's checkbox: a " +
      "selection under way and this one in it.",
    entries: [
      {
        id: "face",
        html:
          `<div class="gx-row"><span class="face" aria-hidden="true"><span>AR</span></span>` +
          `<span class="face" aria-hidden="true"><span>SO</span></span></div>`,
      },
      { id: "face-glyph", html: `<span class="face face-glyph" aria-hidden="true">${icon("phone", 12)}</span>` },
      {
        id: "face-photo",
        html: `<span class="face" aria-hidden="true"><span>AR</span><img class="face-photo" src="${PHOTO}" alt=""></span>`,
      },
      {
        id: "face-lg",
        html: `<div class="gx-row"><span class="face face-lg" aria-hidden="true"><span>AR</span></span><span class="face face-lg" aria-hidden="true"><span>AR</span><img class="face-photo" src="${PHOTO}" alt=""></span></div>`,
      },
      {
        id: "face-sm",
        html: `<div class="gx-row"><span class="face face-sm" aria-hidden="true"><span>AR</span></span><span class="face face-sm" aria-hidden="true"><span>AR</span><img class="face-photo" src="${PHOTO}" alt=""></span></div>`,
      },
      {
        id: "face-xl",
        html: `<div class="gx-row"><span class="face face-xl" aria-hidden="true"><span>AR</span></span><span class="face face-xl" aria-hidden="true"><span>AR</span><img class="face-photo" src="${PHOTO}" alt=""></span></div>`,
      },
      {
        id: "face-mark",
        html: `<span class="face" aria-hidden="true"><span>ZS</span><img class="face-photo" src="${PHOTO}" alt=""><img class="face-photo face-mark" src="${PHOTO}" alt=""></span>`,
      },
      {
        id: "face-pick",
        html:
          `<div class="gx-row"><span class="face" data-pick="choose" aria-hidden="true"><span>AR</span></span>` +
          `<span class="face" data-pick="chosen" aria-hidden="true"><span>AR</span></span>` +
          `<span class="face" data-pick="choose" aria-hidden="true"><span>AR</span><img class="face-photo" src="${PHOTO}" alt=""></span></div>`,
      },
      { id: "face-priority", html: `<span class="face" data-priority="P1" aria-hidden="true"><span>AR</span></span>` },
    ],
  },
  {
    family: "List row",
    about:
      "kit.css's list row (step 2.2): a face, the lines beside it and what trails, on the row tokens every list on a " +
      "phone shares: three lines, two (nothing said, so the face spans two), a line of its own under the facts, and " +
      "a row with a page of its own, a link that keeps the row's colours with no underline. People's and Leads' phone " +
      "rows draw it (surfaces/people/cells/row-card.tsx); and a row whose first column is its kind, the kit's mark in " +
      "the face's place; and a row with nothing in its first column, its lines from its start, where what the rows " +
      "are is said around them (Campaigns' phone list, each row on its moment's line: " +
      "surfaces/campaigns/home/ledger/ledger-phone.tsx).",
    entries: [
      { id: "list-row", html: listRow() },
      { id: "list-row-two", html: listRow({ said: false }) },
      { id: "list-row-note", html: listRow({ note: true }) },
      { id: "list-row-door", html: listRow({ note: true, door: true }) },
      { id: "list-row-mark", html: listRow({ said: false, mark: true }) },
      { id: "list-row-bare", html: listRow({ bare: true }) },
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
    family: "Figure",
    about:
      "The kit's figure (surfaces/kit/figure/figure.tsx): a term and its definitions in the page's list -- what it counts, " +
      "the number at the large step, the period before beside it in plain ink, one line under it. The number a link where " +
      "it has an address and a button where it acts. A ratio of some, but too few (its count above none and under the " +
      "minimum) is greyed and says how few, under the line under it; of none there is no ratio, and nothing is greyed. " +
      "A tone is on the number alone: amber for what needs you, red for what failed, never green, and never the period " +
      "before beside it, which stays in plain ink. Reports' strip is drawn with it. A number someone else changed while " +
      "the page is open is washed (motion/wash.tsx): a fill under it that fades over 1.6 s, and nothing moves.",
    entries: [
      { id: "figure", html: figure() },
      { id: "figure-washed", html: figure({ value: "Today", washed: true }) },
      { id: "figure-change", html: figure({ change: "up from 7" }) },
      { id: "figure-door", html: figure({ door: "a" }) },
      { id: "figure-door-act", html: figure({ door: "button" }) },
      { id: "figure-thin", html: figure({ value: "62%", thin: 3 }) },
      { id: "figure-warn", html: figure({ tone: "warn" }) },
      { id: "figure-fail", html: figure({ tone: "fail" }) },
      { id: "figure-tile", html: figure({ term: "Last contact", value: "Sep 24", meta: "You replied", tile: true }) },
    ],
  },
  {
    family: "Sheet",
    about:
      "kit.css's sheet (step 2.2): on a desk a side pane at the window's right edge, the page faded behind it; on a " +
      "phone from the bottom edge, as tall as what it holds, a handle over its head and the ink's wash behind it; a " +
      "column at both widths, so the composer's foot stays at its foot. A toast raised while it is open stands clear " +
      "of that foot, beside the sheet on a desk and above it on a phone, which the spec checks at both widths. At " +
      "a desk's width beside the record sheet it reproduces, open and leaving, which the spec holds it equal to. On " +
      "a phone also in a small job's shape: a step's way back, the title and a word to close it, then the job. " +
      "People's phone sheet drew those until 5 Oct 2026, when twins held the kit's equal to it before it went.",
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
      { id: "sheet-phone", stage: "sheet", width: "phone", html: sheet() },
      { id: "sheet-phone-leaving", stage: "sheet", width: "phone", html: sheet({ leaving: true }) },
      { id: "sheet-job", stage: "sheet", width: "phone", html: jobSheet() },
      { id: "sheet-job-leaving", stage: "sheet", width: "phone", html: jobSheet(true) },
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
      "sheet, the record sheet's head, tools, rows and foot inside it, and the control that opened it; and in a " +
      "phone's small job's shape, on a step with its way back, its title, its word and the step's one act.",
    entries: [
      { id: "sheet-kit", stage: "sheet", html: kitSheet() },
      { id: "sheet-kit-mark", stage: "sheet", html: kitMarkSheet() },
      { id: "sheet-kit-job", stage: "sheet", html: kitJobSheet() },
      { id: "sheet-kit-kicker", stage: "sheet", html: kitKickerSheet() },
    ],
  },
  {
    family: "Menu, on Base UI",
    about:
      "The kit's Menu (surfaces/kit/menu/menu.tsx), open: Base UI's menu on its positioner (.pop-place), a group under " +
      "its heading, a line, a door and the danger item; a set to choose one of, the tick beside the one chosen; and a " +
      "set of switches it stays open over, ticked while on, one kept on by the page and refused; and one menu its " +
      "rows' controls share, which says the row that opened it.",
    entries: [
      { id: "menu-kit", stage: "pop", html: kitMenu() },
      { id: "menu-kit-caption", stage: "pop", html: kitMenuCaption() },
      { id: "menu-kit-set", stage: "pop", html: kitMenuSet() },
      { id: "menu-kit-switches", stage: "pop", html: kitMenuSwitches() },
      { id: "menu-kit-shared", stage: "pop", html: kitMenuShared() },
    ],
  },
  {
    family: "Popover, on Base UI",
    about: "The kit's Popover (surfaces/kit/popover/popover.tsx), open: Base UI's popover on the panel's pop.",
    entries: [{ id: "popover-kit", stage: "pop", html: kitPopover() }],
  },
  {
    family: "Date picker, on Base UI",
    about:
      "The kit's DatePicker (surfaces/kit/datepicker/datepicker.tsx), open: Base UI's popover on the panel's pop, a month " +
      "of days in the ARIA grid with the day chosen and its arrows over it, and Today at the foot.",
    entries: [{ id: "datepicker-kit", stage: "pop", html: kitDatePicker() }],
  },
  {
    family: "Day range picker",
    about:
      "The kit's DayRangePicker (surfaces/kit/datepicker/day-range-picker.tsx): a month to choose a range of days from. " +
      "The days chosen are one band from the first to the last, its ends the picked lozenge and today the accent's ink; " +
      "two presses choose, a first day and a last, and while the last is still to be pressed the band follows the " +
      "pointer and the days that cannot be the other end stand down, as every day to come does. Reports' date range " +
      "draws it.",
    entries: [
      { id: "day-range", html: kitDayRange({ month: 9 }) },
      { id: "day-range-first", html: kitDayRange({ month: 8, first: "2026-09-14", reach: "2026-09-25", most: 14 }) },
    ],
  },
  {
    family: "Tooltip, on Base UI",
    about:
      "The kit's Tooltip (surfaces/kit/tooltip/tooltip.tsx), shown: the house's tip on Base UI's positioner (.tip-place).",
    entries: [{ id: "tooltip-kit", stage: "pop", html: kitTooltip() }],
  },
  {
    family: "Figure, on Base UI",
    about:
      "The kit's Figure (surfaces/kit/figure/figure.tsx) with a definition on its label: the label is a stop for the kit's " +
      "Tooltip, shown over the term, never a native title.",
    entries: [{ id: "figure-defined", stage: "pop", html: figureDefined() }],
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
    family: "Picker, on Base UI",
    about:
      "The kit's Picker (surfaces/kit/picker/picker.tsx): a choice inside a sentence. Its token, pressed, opens the " +
      "options over the page on the panel's pop (.rec-combo-pop): in groups under their headings, each with its glyph, " +
      "the line under its words and a word at its end, the note under them; a short list is Base UI's Select, a list to " +
      "search its Combobox with the search at the list's top, and what none matching says. Read-only, it opens nothing.",
    entries: [
      { id: "picker-kit", stage: "pop", html: kitPicker() },
      { id: "picker-kit-find", stage: "pop", html: kitPickerFind() },
      { id: "picker-kit-none", stage: "pop", html: kitPickerNone() },
      { id: "picker-kit-readonly", html: kitPickerReadOnly() },
      { id: "picker-kit-inline", html: kitPickerInline() },
    ],
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
      "is wrong, in the one red a field wears; a box of sentences; and a title said in place.",
    entries: [
      { id: "field-kit", html: kitFields() },
      { id: "field-kit-wrong", html: kitFieldsWrong() },
      { id: "field-kit-title", html: kitFieldTitle() },
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
          `<header class="pg-head"><p class="pg-dateline">Friday, October 2<span class="pg-dateline-time"> · 4:02 PM</span></p>` +
          `<div class="pg-line"><h1 class="pg-title">Inbox</h1>` +
          `<p class="pg-sentence">4 need you · the oldest since 2:26 PM</p></div></header>`,
      },
      {
        id: "page-head-stacked",
        html:
          `<header class="pg-head pg-head-stacked"><p class="pg-dateline">Friday, October 2<span class="pg-dateline-time"> · 4:02 PM</span></p>` +
          `<div class="pg-line"><h1 class="pg-title">Good afternoon, Marisa</h1>` +
          `<p class="pg-sentence">2 conversations need you. The oldest has been waiting since 2:26 PM.</p></div></header>`,
      },
      {
        id: "page-bartitle",
        html:
          `<div class="gx-bar"><div class="pg-bartitle" data-shown="true" aria-hidden="true">` +
          `<span class="pg-bartitle-name">Emily Chen</span><span class="pg-bartitle-dot" data-tone="warn"></span></div></div>`,
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
    .gx-phone-bar { width: 290px; }
    .gx-anchor { position: relative; }
    .gx-panel-row { padding: var(--space-2) var(--space-3); }
    .gx-panel-row + .gx-panel-row { border-top: 1px solid var(--line); }
    .gx-narrow { max-width: 220px; }
    .gx-figs { margin: 0; max-width: 240px; }
    .gx-pop-words { margin: 0; }
`;

/**
 * The theme from `?theme=light|dark` (dark otherwise), and the look stamped as the app stamps it (Glass, the one look
 * since Classic retired: contracts LOOK_OPTIONS); `t` turns the theme, as the mockup's document does
 * (style-equality.mjs presses it). And an entry bound to
 * a width leaves the page at the other, as it loads, at the kit's one breakpoint.
 */
const GALLERY_SCRIPT = `
    (function () {
      var root = document.documentElement;
      var asked = new URLSearchParams(location.search);
      root.setAttribute("data-theme", asked.get("theme") === "light" ? "light" : "dark");
      root.setAttribute("data-look", "glass");
      var phone = window.matchMedia("(max-width: 900px)").matches;
      document.querySelectorAll(".gx-entry[data-width]").forEach(function (entry) {
        if ((entry.getAttribute("data-width") === "phone") !== phone) entry.remove();
      });
      window.addEventListener("keydown", function (e) {
        var tag = ((e.target && e.target.tagName) || "").toLowerCase();
        if (e.metaKey || e.ctrlKey || e.altKey || tag === "input" || tag === "textarea") return;
        if (e.key === "t") root.setAttribute("data-theme", root.getAttribute("data-theme") === "dark" ? "light" : "dark");
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
<html lang="en" data-theme="dark" data-look="glass" class="legacy-on">
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
      app's order, a family at a time. Press t for the other theme.</p>
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
<html lang="en" data-theme="dark" data-look="glass" class="legacy-on">
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
