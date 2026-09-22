/**
 * The People table, lifted out of clients-a.jsx and given its columns.
 *
 * Four of its helpers closed over People's own PL_COLUMNS, so the Leads scope could not draw the table with columns
 * of its own; every one of them now takes the column list, and the table says what it calls its rows (the foot's
 * count, the select-all label, and the row id the page's cursor effect looks up). Drawn on the people-honest
 * harness's stub React, over the real pages/people-table.jsx.
 */
import { test } from "node:test";
import assert from "node:assert/strict";

/* ------------------------------- the window ------------------------------- */

const storage = () => { const m = new Map(); return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: (k) => m.delete(k) }; };
globalThis.localStorage = storage();
globalThis.sessionStorage = storage();
globalThis.document = {
  body: {},
  activeElement: null,
  addEventListener() {},
  removeEventListener() {},
  getElementById: () => null,
  querySelector: () => null,
  createElement: () => ({ setAttribute() {}, style: {}, classList: { add() {}, remove() {} } }),
};
globalThis.window = {
  location: { pathname: "/w/salon", hash: "#/clients", origin: "https://app.chanlytics.com" },
  localStorage: globalThis.localStorage,
  sessionStorage: globalThis.sessionStorage,
  addEventListener() {},
  removeEventListener() {},
};

let cells = [];
let seq = 0;
globalThis.Icon = "Icon";
globalThis.React = {
  Fragment: "Fragment",
  createElement: (type, p, ...kids) => {
    const props = { ...(p || {}), children: kids.flat(Infinity) };
    const node = { type, props };
    if (typeof type === "function") node.rendered = type(props);
    return node;
  },
  cloneElement: (el, props) => ({ ...el, props: { ...el.props, ...props } }),
  useState: (init) => { const k = seq++; if (!(k in cells)) cells[k] = typeof init === "function" ? init() : init; return [cells[k], (v) => { cells[k] = typeof v === "function" ? v(cells[k]) : v; }]; },
  useRef: (init) => { const k = seq++; if (!(k in cells)) cells[k] = { current: init }; return cells[k]; },
  useMemo: (fn) => fn(),
  useCallback: (fn) => fn,
  useEffect: () => {},
};
globalThis.ReactDOM = { createPortal: (node) => node };
await import("../../../apps/dashboard/src/legacy/components/data-bits.jsx");
for (const k of ["StatStrip", "StatCell", "EmptyState", "FailedRead", "StatePill"]) globalThis[k] = globalThis.window[k];
// The `td` helper below builds its cell with T.React.createElement, and the harness sets only globalThis.React; the
// app seeds window.React the same way (legacy-bridge/seed-globals.ts).
globalThis.window.React = globalThis.React;
await import("../../../apps/dashboard/src/legacy/pages/people-table.jsx");
// A legacy file's Object.assign(window, …) writes to globalThis.window, a plain object here, while the page reads
// the nine names as bare globals.
for (const k of ["PeopleTable", "PeopleColumnsMenu", "plLocked", "plShows", "plSortKeys", "plDrawnColumns", "plShownColumns", "plColumnChoices", "plColumnOptions", "PL_NO_SEL"]) globalThis[k] = globalThis.window[k];

const walk = (n, fn) => { if (n == null || typeof n !== "object") return; fn(n); for (const k of n.props?.children ?? []) walk(k, fn); if (n.rendered) walk(n.rendered, fn); };
const all = (tree, pred) => { const out = []; walk(tree, (n) => { if (pred(n)) out.push(n); }); return out; };
const find = (tree, pred) => all(tree, pred)[0] ?? null;
const byTestId = (tree, id) => find(tree, (n) => n.props?.["data-testid"] === id);
/** A node's words in reading order: what a drawn component rendered, else its children in turn. */
const textOf = (n) => {
  if (n == null || typeof n === "boolean") return "";
  if (typeof n === "string" || typeof n === "number") return String(n);
  if (Array.isArray(n)) return n.map(textOf).join("");
  if (n.rendered !== undefined) return textOf(n.rendered);
  return (n.props?.children ?? []).map(textOf).join("");
};

/* --------------------------------- the table --------------------------------- */

const T = globalThis.window;
const td = (key, text) => (p) => T.React.createElement("td", { key }, text(p));
const COLS = [
  { key: "name", label: "Person", sortable: true, pinned: true, cell: td("name", (p) => p.name) },
  { key: "state", label: "State", sortable: true, cell: td("state", (p) => p.state) },
  { key: "visits", label: "Visits", sortable: true, needs: (x) => x.withCalendar, cell: td("visits", () => "") },
  { key: "receptionist", label: "Receptionist", sortable: false, on: (x) => !x.withCalendar, cell: td("receptionist", () => "") },
  { key: "email", label: "Email", sortable: false, on: false, cell: td("email", (p) => p.email || "") },
  { key: "actions", label: "", sortable: false, fixed: true, cell: td("actions", () => "") },
];
const ROWS = [{ id: "a1", name: "Ada Example", state: "new" }, { id: "b2", name: "Bo Example", state: "quiet" }];
const table = ({ phone = false, ...over } = {}) => { seq = 0; cells = []; return T.PeopleTable({ columns: T.plShownColumns(T.plDrawnColumns(COLS, {}, { withCalendar: false }), phone), ctx: {}, rows: ROWS, total: 2, sortBy: "name", sortDir: "asc", onSort() {}, onOpen() {}, filtered: false, onClearFilters() {}, ...over }); };

test("the helpers take the column list: sort keys, drawn columns, choices and options come from it", () => {
  assert.deepEqual(T.plSortKeys(COLS), ["name", "state", "visits"]);
  assert.deepEqual(T.plDrawnColumns(COLS, {}, { withCalendar: false }).map((c) => [c.key, !!c.off]), [["name", false], ["state", false], ["receptionist", false], ["email", true], ["actions", false]]);
  assert.deepEqual(T.plDrawnColumns(COLS, { email: true }, { withCalendar: true }).map((c) => [c.key, !!c.off]), [["name", false], ["state", false], ["visits", false], ["receptionist", true], ["email", false], ["actions", false]]);
  assert.deepEqual(T.plColumnChoices(COLS, { name: false, actions: false, email: true, state: "yes", junk: 1 }), { email: true }, "only the columns a member may hide, and only booleans");
  assert.deepEqual(T.plColumnOptions(COLS, {}, { withCalendar: true }).map((o) => [o.key, o.on, o.locked]), [["name", true, true], ["state", true, false], ["visits", true, false], ["receptionist", false, false], ["email", false, false]], "the fixed column is not offered; the pinned one is locked");
});

test("the table says its noun: the foot, the select-all label and the row ids follow it", () => {
  const leads = table({ selectable: true, noun: "lead" });
  assert.equal(textOf(find(leads, (n) => n.props?.className === "cl-table-foot")).startsWith("2 leads"), true);
  assert.equal(byTestId(leads, "select-all").props["aria-label"], "Select every lead shown");
  assert.deepEqual(all(leads, (n) => n.type === "tr" && n.props?.id).map((n) => n.props.id), ["lead-a1", "lead-b2"]);
  const one = table({ rows: [ROWS[0]], total: 1 });
  assert.equal(textOf(find(one, (n) => n.props?.className === "cl-table-foot")).startsWith("1 person"), true, "person is the default");
  assert.deepEqual(all(one, (n) => n.type === "tr" && n.props?.id).map((n) => n.props.id), ["person-a1"]);
});

test("a heading that sorts is a button with aria-sort on its th; a column turned off is not built at all on a desktop, and on a phone it is drawn with pl-col-off for the cards", () => {
  const t = table({ sortBy: "state", sortDir: "desc" });
  const ths = all(t, (n) => n.type === "th");
  assert.equal(ths.find((n) => textOf(n).startsWith("State")).props["aria-sort"], "descending");
  assert.equal(all(t, (n) => n.props?.className === "cl-th-sort").length, 2, "Person and State sort; Visits is not drawn without a calendar");
  // A desktop hides an off column with CSS, so every cell of it was built, cloned and inserted for nothing: seven of
  // twelve Leads columns, on every row, on every draw.
  assert.equal(all(t, (n) => /pl-col-off/.test(n.props?.className || "")).length, 0, "REGRESSION: the Email heading and its two cells were built and hidden");
  assert.deepEqual(ths.map(textOf).map((x) => x.replace(/[▲▼]/g, "").trim()), ["Person", "State", "Receptionist", ""], "the columns shown, and only those");
  assert.equal(all(t, (n) => n.type === "td").length, 4 * ROWS.length, "four cells a row");
  // A phone draws every column: its cards keep the facts they draw by default (#789), and pl-col-off is how the
  // card rules tell one the member turned off.
  const ph = table({ sortBy: "state", sortDir: "desc", phone: true });
  assert.equal(all(ph, (n) => /pl-col-off/.test(n.props?.className || "")).length, 1 + ROWS.length, "on a phone: the Email heading and its two cells, marked");
  assert.equal(all(ph, (n) => n.type === "td").length, 5 * ROWS.length);
});
