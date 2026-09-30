/**
 * What the kit's two galleries share (kit-gallery.mjs, the static page, and kit-behaves.tsx, the page that runs the
 * kit's components), with no import of node's, so the browser's bundle takes it as the server does: the glyphs, as
 * surfaces/kit/icon/icon.tsx draws them (a 16-unit box, a 1.5 stroke, the class `icon`), and the rows the running page's
 * sheet holds, enough that its body scrolls.
 */
export const GLYPHS = {
  alert: '<path d="M8 2L1.5 13h13L8 2z"/><path d="M8 6.5v3M8 11.5v.5"/>',
  "arrow-right": '<path d="M3 8h10M9 4l4 4-4 4"/>',
  bell: '<path d="M4 11V7a4 4 0 018 0v4l1 1H3l1-1z M6.5 13a1.5 1.5 0 003 0"/>',
  calendar: '<rect x="2" y="3.5" width="12" height="10" rx="1"/><path d="M2 6.5h12M5 2v3M11 2v3"/>',
  check: '<path d="M3 8.5l3.5 3L13 5"/>',
  chevron: '<path d="M6 4l4 4-4 4"/>',
  "chevron-down": '<path d="M4 6l4 4 4-4"/>',
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

/** The services the running page's sheet lists, a row each: more than a window holds, so the sheet's body scrolls. */
export const SHEET_SERVICES = [
  ["Consultation", "45m"],
  ["Follow-up visit", "30m"],
  ["Full treatment", "2h"],
  ["Second opinion", "45m"],
  ["Assessment", "1h"],
  ["Check-in call", "15m"],
  ["Planning session", "1h 30m"],
  ["Group session", "2h"],
  ["Home visit", "1h"],
  ["Video call", "30m"],
  ["Aftercare", "20m"],
  ["Intro call", "15m"],
  ["Quote visit", "45m"],
  ["Annual review", "1h"],
  ["Workshop", "3h"],
  ["Short visit", "10m"],
];

/**
 * What the hold of the kit's Base UI components reads of an element, beside its tag and its classes
 * (e2e/kit/kit-behaves.spec.ts in a browser, tooling/scripts/tests/styles/kit-behaves.test.mjs on a server): the
 * attributes a stylesheet or a screen reader reads, those in MARKUP_PRESENT as there or not, the rest by their value.
 * Not the words, nor an id that wires a label or a description to its control (the spec checks the wiring), nor a
 * style, which Base UI writes as it places a popup.
 */
export const MARKUP_READ = [
  "role",
  "type",
  "href",
  "disabled",
  "hidden",
  "tabindex",
  "aria-hidden",
  "aria-label",
  "aria-disabled",
  "aria-checked",
  "aria-selected",
  "aria-invalid",
  "aria-expanded",
  "aria-haspopup",
  "aria-readonly",
  "aria-modal",
  "aria-live",
  "aria-orientation",
  "data-gated",
  "data-leaving",
  "data-chosen",
  "data-selected",
  "data-highlighted",
  "data-hints",
  "data-tone",
];
export const MARKUP_PRESENT = [
  "disabled",
  "hidden",
  "href",
  "aria-label",
  "data-gated",
  "data-selected",
  "data-highlighted",
];
