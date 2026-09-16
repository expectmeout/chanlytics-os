/**
 * A Business save keeps the booking rules it does not edit.
 *
 * The editor rebuilt booking_rules from an empty object with the six keys it
 * renders, so a rule set any other way -- the slot length today, a rule added
 * later -- was deleted by the next press of Save, and the calendar's slots fell
 * back to the default without anyone choosing that. The profile around it
 * already starts from what is stored; the rules now do too.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { stateOf } from "@chanlytics/contracts";

/* ------------------------------ the harness ------------------------------ */

let cells = [];
let seq = 0;
globalThis.Icon = "Icon";
globalThis.StatStrip = "StatStrip";
globalThis.StatCell = "StatCell";
globalThis.Sparkline = "Sparkline";
globalThis.React = {
  Fragment: "Fragment",
  createElement: (type, p, ...kids) => {
    const props = { ...(p || {}), children: kids.flat(Infinity) };
    const node = { type, props };
    if (typeof type === "function") node.rendered = type(props);
    return node;
  },
  useState: (init) => { const k = seq++; if (!(k in cells)) cells[k] = typeof init === "function" ? init() : init; return [cells[k], (v) => { cells[k] = typeof v === "function" ? v(cells[k]) : v; }]; },
  useReducer: (red, init) => { const k = seq++; if (!(k in cells)) cells[k] = init; return [cells[k], (a) => { cells[k] = red(cells[k], a); }]; },
  useRef: (init) => { const k = seq++; if (!(k in cells)) cells[k] = { current: init }; return cells[k]; },
  useMemo: (fn) => { const k = seq++; if (!(k in cells)) cells[k] = fn(); return cells[k]; },
  useCallback: (fn) => fn,
  useEffect: (fn) => { const k = seq++; if (!(k in cells)) { cells[k] = true; fn(); } },
};
globalThis.ReactDOM = { createPortal: (node) => node };
globalThis.document = { body: {}, addEventListener() {}, createElement: () => ({ setAttribute() {}, style: {}, classList: { add() {}, remove() {} } }) };
const storage = () => { const m = new Map(); return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: (k) => m.delete(k) }; };
globalThis.localStorage = storage();
globalThis.sessionStorage = storage();
globalThis.window = {
  __chrome: { state: stateOf },
  CHANLY: { nav() {}, R: {} },
  gate: () => ({}),
  location: { pathname: "/w/salon", hash: "", origin: "https://app.chanlytics.com", assign() {}, replace() {}, reload() {} },
  localStorage: globalThis.localStorage,
  sessionStorage: globalThis.sessionStorage,
  addEventListener() {},
  removeEventListener() {},
  dispatchEvent() {},
  setTimeout: () => 1,
  clearTimeout() {},
};
await import("../../../apps/dashboard/src/legacy/components/data-bits.jsx");
const { EmptyState, FailedRead, MoreMenu, StatePill } = globalThis.window;
Object.assign(globalThis, { EmptyState, FailedRead, MoreMenu, StatePill });
Object.assign(globalThis.window, { __ME: { email: "ruben@rjcapital.io", role: "owner" }, __SETTINGS: { role: "owner" } });
await import("../../../apps/dashboard/src/legacy/pages/settings.jsx");

/* ------------------------------- the rule ------------------------------- */

test("REGRESSION: a Business save keeps a booking rule the editor does not show -- the slot length was deleted on every save", () => {
  const kept = globalThis.window.settingsRulesKept;
  assert.equal(typeof kept, "function", "what a save keeps is one rule that can be run");
  assert.deepEqual(
    kept({ slot_min: 45, lead_hours: 2, buffer_min: 10, max_days_ahead: 14, party_max: 4, consult_first: ["balayage"], notes: ["no walk-ins"], a_rule_added_later: true }),
    { a_rule_added_later: true },
    "the seven keys the form edits, the slot length among them since it has a field, are the form's to write; the rest stays as stored",
  );
  assert.deepEqual(kept({ a_rule_added_later: true }), { a_rule_added_later: true });
  assert.deepEqual(kept(undefined), {});
  assert.deepEqual(kept(null), {});
});
