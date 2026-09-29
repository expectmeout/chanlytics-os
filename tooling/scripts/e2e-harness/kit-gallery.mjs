/**
 * The kit's gallery (docs/plans/2026-09-28-the-interface-kit-and-its-looks.md, §3.4 and step 2.3): one page that draws
 * every class of the kit in the app's own stylesheets, for e2e/kit.spec.ts to check and for a person to review.
 *
 *   node tooling/scripts/e2e-harness/server.mjs 3210 kit        # http://localhost:3210/ ; t turns the theme, l the look
 *   corepack pnpm e2e:local -- e2e/kit.spec.ts --scenario=kit   # the gallery's checks
 *
 * The harness serves it as the `kit` record's page (scenarios.mjs), and production never does (decision 7). It is
 * static markup, built on every request as the mockup's document is read (server.mjs), so an edit to an entry or to a
 * stylesheet shows on the next load. No React, no Babel, no fixture: each entry is the markup a kit component renders,
 * written out.
 *
 * An entry is `{ id, html }` and, where it needs them:
 *   twin    the id of a source entry that draws what this one must compute equal to (the spec's check 4);
 *   source  marks an entry drawn only to be compared, with the `file:line` of its rule;
 *   width   "desk" or "phone", for a form only one width draws;
 *   stage   "sheet" (480px tall, and on a phone 90% of the screen, since the record sheet's phone form is 88%) or
 *           "pop" (320px), for what is fixed or placed over the page: a stage is the containing block of what is fixed
 *           inside it, so a sheet, a wash, a menu or the toasts stand in it, not over the page;
 *   except  the longhands a twin does not compare, each argued where the twin is written;
 *   boxes   the twin also compares each element's box, relative to its stage.
 * Every class in classes.json is drawn by a kit entry, with every state its rules name as a class, an attribute or a
 * pseudo-class that is not a press: styles/kit-gallery.test.mjs holds the classes in CI, and the spec holds the rules
 * of kit.css in a browser. The words are made up, as every fixture's are.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const LEGACY = path.resolve(HERE, "../../../apps/dashboard/src/legacy");

/**
 * The names the kit's markup carries that classes.json does not list yet. A kit entry names a class of the registry, a
 * name here, or the gallery's own layout (`gx-*`): each name here is drawn by a component of the kit and styled by a
 * rule that names it beside a kit class. When step 2.1 moves that rule into kit.css the name joins the registry
 * (kit-css.test.mjs asks it to) and leaves this list, which kit-gallery.test.mjs holds: a name both here and there, or
 * here and drawn by no entry, is a stale line.
 */
export const UNLISTED = {
  icon: "the glyph Icon draws (components/icons.jsx), which .btn .icon, .more-item .icon, .pp-toast > .icon and .field-error > .icon style",
  danger: "the quiet danger form of a button and of a menu item (.btn.danger, .more-item.danger)",
  "live-dot": "StatePill's dot in a live pill (components.css .live-dot)",
  "align-left": "MoreMenu's side, a menu hung from its trigger's left (.more-menu.align-left)",
  "align-right": "MoreMenu's side, from its trigger's right (.more-menu.align-right)",
  escape:
    "MoreMenu's menu placed against the window, so a pane that scrolls cannot cut it (.more-wrap > .more-menu.escape)",
  placed: "an escaping menu once moreFit has placed it (.more-menu.escape:not(.placed) is drawn unseen)",
  up: "an escaping menu that opens upward (.more-menu.escape.up)",
  show: "the tooltip while it is shown (.ui-tip.show)",
  active: "the picked tab (.stabs-tab.active)",
  "cl-bucket-link":
    "the quiet link button Confirm, EmptyState and FailedRead draw, under People's name for it (components.css)",
};

/* The glyphs the entries draw, as components/icons.jsx draws them: a 16-unit box, a 1.5 stroke, the class `icon`. */
const GLYPHS = {
  alert: '<path d="M8 2L1.5 13h13L8 2z"/><path d="M8 6.5v3M8 11.5v.5"/>',
  "arrow-right": '<path d="M3 8h10M9 4l4 4-4 4"/>',
  bell: '<path d="M4 11V7a4 4 0 018 0v4l1 1H3l1-1z M6.5 13a1.5 1.5 0 003 0"/>',
  calendar: '<rect x="2" y="3.5" width="12" height="10" rx="1"/><path d="M2 6.5h12M5 2v3M11 2v3"/>',
  check: '<path d="M3 8.5l3.5 3L13 5"/>',
  chevron: '<path d="M6 4l4 4-4 4"/>',
  copy: '<rect x="5.5" y="5.5" width="8" height="8" rx="1.5"/><path d="M10.5 5.5v-2a1 1 0 00-1-1h-6a1 1 0 00-1 1v6a1 1 0 001 1h2"/>',
  edit: '<path d="M3 13h2.5l7-7-2.5-2.5-7 7V13z"/><path d="M11 4l1 1"/>',
  inbox:
    '<path d="M2 9l1.5-5.5A1 1 0 014.5 3h7a1 1 0 011 .5L14 9"/><path d="M2 9v3.5a1 1 0 001 1h10a1 1 0 001-1V9"/><path d="M2 9h3.5l1 2h3l1-2H14"/>',
  info: '<circle cx="8" cy="8" r="5.5"/><path d="M8 7.5v3.5M8 5.25v.5"/>',
  mail: '<rect x="2" y="3.5" width="12" height="9" rx="1"/><path d="M2.5 5l5.5 4 5.5-4"/>',
  more: '<circle cx="3.5" cy="8" r="0.8" fill="currentColor"/><circle cx="8" cy="8" r="0.8" fill="currentColor"/><circle cx="12.5" cy="8" r="0.8" fill="currentColor"/>',
  pause:
    '<rect x="4.5" y="3" width="2.5" height="10" fill="currentColor"/><rect x="9" y="3" width="2.5" height="10" fill="currentColor"/>',
  phone: '<path d="M3 3.5l2.5-.5 1.5 3-1.5 1c.7 1.5 1.7 2.5 3 3.2L9.5 9l3 1.5-.5 2.5c-4.5.3-9-4.2-9-9.5z"/>',
  plus: '<path d="M8 3v10M3 8h10"/>',
  refresh: '<path d="M2 8a6 6 0 0110-4.5L13 5M14 8a6 6 0 01-10 4.5L3 11"/><path d="M13 2v3h-3M3 14v-3h3"/>',
  search: '<circle cx="7" cy="7" r="4.5"/><path d="M10.5 10.5l3 3"/>',
  user: '<circle cx="8" cy="5.5" r="2.5"/><path d="M2.5 14a5.5 5.5 0 0111 0"/>',
  x: '<path d="M4 4l8 8M12 4l-8 8"/>',
};

/** Icon's markup (components/icons.jsx), its size written on the element as Icon writes it. */
const icon = (name, size) =>
  `<svg width="${size}" height="${size}" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" ` +
  `stroke-linecap="round" stroke-linejoin="round" class="icon" style="width: ${size}px; height: ${size}px;">` +
  `${GLYPHS[name]}</svg>`;

/** What a role's gate puts on a control it refuses (data-bits gatedProps). */
const gated = (why) => `data-gated="" aria-disabled="true" aria-description="${why}" data-tip="${why}"`;

/* ---- the record kit's parts, as record-row.jsx, record-field.jsx and record-fold.jsx render them ---- */

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
    ? `<li role="option" aria-selected="true" class="rec-combo-opt"><span>Spanish</span><span class="rec-combo-meta">es</span></li>` +
      `<li role="option" aria-selected="false" class="rec-combo-opt" data-chosen="true"><span>Spanish, Mexico</span>` +
      `<span class="rec-combo-meta">es-MX</span></li>` +
      `<li role="option" aria-selected="false" class="rec-combo-opt"><span>Add “Sp”</span></li>`
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
      "A state, as StatePill draws it: at rest its dot and its word (plain, ok); asking to be seen, its tone's ground (warn, info, danger, the live accent); a glyph in place of the dot.",
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
          `<button type="button" class="btn btn-icon btn-sm" aria-haspopup="menu" aria-expanded="true" aria-label="More">${icon("more", 14)}</button>` +
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
          `<div class="more-wrap"><button type="button" class="btn btn-icon btn-sm" aria-haspopup="menu" aria-expanded="true" aria-label="More">${icon("more", 14)}</button>` +
          `<div class="more-backdrop"></div>` +
          `<div class="more-menu align-right escape placed up" role="menu" style="left: 16px; top: 48px;">` +
          `<button class="more-item" role="menuitem">${icon("edit", 13)}<span class="more-item-label">Rename the list</span></button>` +
          `<button class="more-item" role="menuitem">${icon("copy", 13)}<span class="more-item-label">Copy the week</span></button>` +
          `</div></div>`,
      },
      {
        id: "more-menu-unplaced",
        html:
          `<div class="more-wrap"><button type="button" class="btn btn-icon btn-sm" aria-haspopup="menu" aria-expanded="true" aria-label="More">${icon("more", 14)}</button>` +
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
          `<span class="confirm" role="group" aria-label="Delete the list?"><span class="confirm-words">` +
          `<span class="confirm-q">Delete the list?</span>` +
          `<span class="confirm-detail">The people on it stay.</span></span>` +
          `<span class="confirm-acts"><button type="button" class="btn btn-sm btn-danger">Yes, delete</button>` +
          `<button type="button" class="cl-bucket-link">No</button></span></span>`,
      },
      {
        id: "confirm-block",
        html:
          `<span class="confirm confirm-block" role="group" aria-label="Erase Sam Ortega?"><span class="confirm-words">` +
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
      "The one flash, usePPToast's stack: a confirmation with its Undo, a note with a link, a warning and a failure, each with its ×.",
    entries: [
      {
        id: "pp-toast",
        stage: "sheet",
        html:
          `<div class="pp-toast-stack">` +
          `<div class="pp-toast" data-tone="ok" role="status">${icon("check", 13)}` +
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
          `<nav class="stabs" aria-label="Section views">` +
          `<button class="stabs-tab active">Needs you <span class="tally tally-warn" data-tone="warn">3</span></button>` +
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
          `<nav class="stabs" aria-label="Section views" data-glide="ease" style="--glide-w: 98px; --glide-x: 110px;">` +
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
          `<span>Everyone</span><span class="rec-seg-hint">Every caller and every message.</span></button>` +
          `<button type="button" role="radio" class="rec-seg-btn" aria-checked="false" tabindex="-1">` +
          `<span>People it knows</span><span class="rec-seg-hint">A new number is handed to you.</span></button></div>`,
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
    .gx-narrow { max-width: 220px; }
`;

/**
 * The theme and the look: from `?theme=light|dark&look=classic|glass` (dark and Classic otherwise); `t` turns the
 * theme, as the mockup's document does (style-equality.mjs presses it), and `l` turns the look.
 */
const GALLERY_SCRIPT = `
    (function () {
      var root = document.documentElement;
      var asked = new URLSearchParams(location.search);
      root.setAttribute("data-theme", asked.get("theme") === "light" ? "light" : "dark");
      root.setAttribute("data-look", asked.get("look") === "glass" ? "glass" : "classic");
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

/** The gallery's page, built afresh: the mockup's fonts and stylesheets in its order, the app's rules, the entries. */
export function galleryDocument(families = FAMILIES) {
  const entries = families.reduce((n, f) => n + f.entries.length, 0);
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
      app's order: ${families.length} families, ${entries} entries. Press t for the other theme and l for the other look.</p>
    </header>
${families.map(familyHtml).join("\n")}
  </main></div>
  <script>${GALLERY_SCRIPT}  </script>
</body>
</html>
`;
}
