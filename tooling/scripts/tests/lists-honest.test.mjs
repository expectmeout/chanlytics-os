/**
 * Lists: every list says what it leads to, and every person on it can be opened.
 *
 * - "Use in a broadcast" on a consent list opened the composer on Everyone: the same people, by the
 *   filter, but not the word the owner had clicked (the wiring audit's B2).
 * - A smart list's next step, which the People rail shows for the same list, was missing here; the
 *   people on a list opened only on a mouse's click; and an empty list's row spanned five columns
 *   under a table of four (B13).
 * - On a phone the rail, the only list picker, was hidden, and People's card grid placed the list's
 *   unmarked cells into its checkbox column, one letter wide (B8, L6).
 * Run against the People surface over a fake wire, and the page on a stub React.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { mayReceive, stateOf } from "@chanlytics/contracts";

const TID = "t-salon";
const ZONE = "America/New_York";
const H = 3_600_000;
const D = 24 * H;
const NOW = Date.now();
const iso = (ms) => new Date(NOW - ms).toISOString();

/** A person the People read returns, the shape people-vm.test.mjs pins (as people-honest.test.mjs copies it). */
const row = (over = {}) => ({
  id: "p2", display_name: "Ana Ruiz", wa_profile_name: null, phone_e164: "+17865550182",
  consent: "opted_in", consent_source: "in_person", consent_updated_at: iso(2 * D),
  marketing_consent: "unknown", marketing_consent_source: null, marketing_consent_updated_at: null,
  dnc: false, channels: ["whatsapp"], conversation_count: 1, escalation_count: 0, needs_human: false,
  open_escalation_reason: null, open_escalation_since: null, latest_conversation_id: "cv2", latest_state: "open",
  latest_paused_until: null, latest_assignee_user_id: null, latest_snooze_until: null,
  latest_wa_inbound_at: iso(3 * H), last_message_at: iso(3 * H), last_message_direction: "inbound", last_message_sender: "customer",
  last_inbound_text: "See you Friday", last_inbound_at: iso(3 * H), last_call_at: null, call_count: 0, call_seconds: 0,
  first_contact_at: iso(60 * D), earliest_row_at: iso(60 * D), has_backfill: false, has_chat: true, queued_reply_at: null,
  ...over,
});
/** Daniela needs you, and said yes to messages and, in writing, to offers; Ana said yes to messages only. */
const PEOPLE = [
  row({
    id: "p1", display_name: "Daniela Reyes", phone_e164: "+17865550181", latest_conversation_id: "cv1",
    marketing_consent: "opted_in", marketing_consent_source: "form", marketing_consent_updated_at: iso(D),
    escalation_count: 1, needs_human: true, open_escalation_reason: "human_token", open_escalation_since: iso(2 * H),
  }),
  row(),
];
const SAVED = [{ id: "s1", name: "Regulars", ids: ["p1"] }, { id: "s2", name: "Walk-ins", ids: [] }];

/* ---------------------------------- the window ---------------------------------- */

const listeners = {};
const storage = () => { const m = new Map(); return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: (k) => m.delete(k) }; };
globalThis.localStorage = storage();
globalThis.sessionStorage = storage();
globalThis.document = {
  body: {}, activeElement: null, addEventListener() {}, removeEventListener() {}, getElementById: () => null,
  createElement: () => ({ setAttribute() {}, style: {}, classList: { add() {}, remove() {} } }),
};
globalThis.window = {
  location: { pathname: "/w/salon", hash: "#/segments", origin: "https://app.chanlytics.com", assign() {}, replace() {}, reload() {} },
  history: { replaceState() {} },
  localStorage: globalThis.localStorage,
  sessionStorage: globalThis.sessionStorage,
  addEventListener: (type, fn) => { (listeners[type] ||= new Set()).add(fn); },
  removeEventListener: (type, fn) => { listeners[type]?.delete(fn); },
  dispatchEvent: (ev) => { for (const fn of [...(listeners[ev.type] || [])]) fn(ev); return true; },
  setTimeout: (fn, ms) => setTimeout(fn, ms),
  clearTimeout: (h) => clearTimeout(h),
  __WORKSPACES: [{ id: TID, slug: "salon", name: "Salon", status: "active", timezone: ZONE }],
  __ACTIVE_WORKSPACE: TID,
};
const json = (status, body) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
const quietly = async (fn) => { const e = console.error; console.error = () => {}; try { return await fn(); } finally { console.error = e; } };
const { peopleOverride } = await quietly(() => import("../../../apps/dashboard/src/legacy-bridge/surface-data.ts"));
const { installClock } = await import("../../../apps/dashboard/src/legacy-bridge/zone.ts");
installClock();
globalThis.window.fetch = async (url) => {
  const u = new URL(String(url), "https://app.chanlytics.com");
  if (u.pathname === "/api/v1/contacts") return json(200, { ok: true, data: { people: PEOPLE, page: { q: null, offset: 0, limit: 1000, total: PEOPLE.length, has_more: false }, calendar: { state: "none", source: "your calendar" }, booking_link: null } });
  if (u.pathname === "/api/v1/segments") return json(200, { ok: true, data: { lists: SAVED } });
  if (u.pathname === "/api/v1/views") return json(200, { ok: true, data: { views: {} } });
  return json(404, { ok: false, error: { code: "not_found", message: `no ${u.pathname}` } });
};
await quietly(() => peopleOverride.apply());

let cells = [];
let seq = 0;
const went = [];
globalThis.Icon = "Icon";
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
  useMemo: (fn) => fn(),
  useCallback: (fn) => fn,
  // An effect runs when its inputs change, after its last cleanup, the way React runs it; with no inputs, on every draw.
  useEffect: (fn, deps) => {
    const k = seq++;
    const prev = cells[k];
    if (prev && deps && prev.deps && deps.length === prev.deps.length && deps.every((d, i) => Object.is(d, prev.deps[i]))) return;
    if (prev && typeof prev.cleanup === "function") prev.cleanup();
    cells[k] = { deps, cleanup: undefined };
    cells[k].cleanup = fn();
  },
};
globalThis.ReactDOM = { createPortal: (node) => node };
await import("../../../apps/dashboard/src/legacy/components/data-bits.jsx");
for (const k of ["StatStrip", "StatCell", "EmptyState", "FailedRead", "StatePill"]) globalThis[k] = globalThis.window[k];
globalThis.Confirm = () => null;
Object.assign(globalThis.window, {
  usePPToast: () => [null, () => {}],
  CHANLY: { nav: (to) => went.push(to), R: { thread: (id) => `inbox/${id}`, segment: (id) => `segments/${id}` } },
  __chrome: { state: stateOf },
  __ME: { role: "owner" },
  __mayReceive: mayReceive,
});
await import("../../../apps/dashboard/src/legacy/pages/segments-real.jsx");

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
const press = (node) => node.props.onClick({ stopPropagation() {}, preventDefault() {} });
/** The Lists page opened on one list, freshly drawn. */
const lists = (initialId) => { cells = []; seq = 0; went.length = 0; return globalThis.window.SegmentsPage({ initialId }); };

test("REGRESSION (B2): a consent list's broadcast door says whom it opens on -- it said 'Use in a broadcast' and opened Everyone", () => {
  const offers = lists("offers_ok");
  assert.equal(byTestId(offers, "lists-use-in-broadcast"), null, "one door, not a second in the head");
  const step = byTestId(offers, "lists-action");
  assert.ok(step, "the list's own step is its door");
  const cta = find(step, (n) => n.type === "button");
  assert.equal(textOf(cta).trim(), "Broadcast to everyone who said yes", "REGRESSION: the word on the button was not the audience it opened");
  press(cta);
  assert.deepEqual(went, ["broadcasts"]);
  const kept = lists("s1");
  const door = byTestId(kept, "lists-use-in-broadcast");
  assert.ok(door && textOf(door).includes("Use in a broadcast"), "a kept list is an audience of its own");
  press(door);
  assert.deepEqual(went, ["broadcasts/s1"], "and its door opens on it");
});

test("REGRESSION (B13): a smart list shows its next step, as the People rail does -- Lists showed none", () => {
  const tree = lists("needs_you");
  const step = byTestId(tree, "lists-action");
  assert.ok(step && textOf(step).includes("Each of them is waiting for a person."), "REGRESSION: no next step");
  press(find(step, (n) => n.type === "button"));
  assert.deepEqual(went, ["inbox"]);
});

test("REGRESSION (B13): each person on a list opens by keyboard as well as by mouse -- only the row's click opened them", () => {
  const tree = lists("needs_you");
  const open = byTestId(tree, "lists-open-person");
  assert.ok(open && open.type === "button", "REGRESSION: a mouse-only row");
  press(open);
  assert.deepEqual(went, ["clients/p1"]);
  assert.ok(find(tree, (n) => n.type === "tr" && typeof n.props?.onClick === "function"), "the row keeps its click for a mouse");
});

test("REGRESSION (B13): an empty list's row spans the columns its table has -- five under four -- and a kept list says how people get on it", () => {
  const smart = lists("waiting_on_you");
  assert.equal(find(smart, (n) => n.type === "td" && n.props?.colSpan)?.props.colSpan, all(smart, (n) => n.type === "th").length, "REGRESSION: five columns under four");
  const kept = lists("s2");
  assert.equal(find(kept, (n) => n.type === "td" && n.props?.colSpan)?.props.colSpan, all(kept, (n) => n.type === "th").length, "a kept list an owner edits has a fifth column");
  assert.ok(textOf(kept).includes("Add to list"), "people join a kept list from People's selection too, not only their profile");
});

test("REGRESSION (B8, L6): Lists marks its page and its cells for a phone -- the rail hid there, and People's cards squeezed a list's names", () => {
  const tree = lists("needs_you");
  const root = byTestId(tree, "lists-real");
  assert.ok(String(root.props.className).split(" ").includes("lists-page"), "the page a phone rule can find");
  const tr = find(tree, (n) => n.type === "tr" && typeof n.props?.onClick === "function");
  const classes = tr.props.children.filter((c) => c && c.type === "td").map((td) => String(td.props.className || "").split(" "));
  for (const c of ["lists-name-cell", "lists-offers-cell", "lists-last-cell", "lists-state-cell"]) assert.ok(classes.some((k) => k.includes(c)), c);
});
