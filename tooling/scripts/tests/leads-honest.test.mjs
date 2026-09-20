/**
 * The Leads scope of People: the same page, its other scope.
 *
 * Drawn the way people-honest.test.mjs draws People -- window.ClientsA on a stub React that keys hooks by call
 * order -- with scope="leads" and the address's view. The surface (window.__LEADS) and the courier
 * (window.__leadX) are faked here: release B's Task 3 writes the real ones, and leads-bridge.test.mjs proves
 * them over a fake wire. What this file proves is the PAGE: its rail, its standing line, its view, its one
 * keyboard listener, its bulk bar, and the three classes' acts.
 *
 * The view models are contracts' own (4.1 and 4.6, already on this branch): the rows are DTOs put through
 * toLeadRowVM, and the rail and the standing line are leadRail and leadsStanding. The page's view IS the
 * address, so the route is read with the same parser the surface keys its reads by; a stand-in that derived a
 * word differently would prove nothing.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { ROLE_PERMS, roleGate } from "@chanlytics/contracts";
import { leadRail, leadsRoute, leadsStanding, parseLeadsRoute, toLeadRowVM } from "../../../packages/contracts/src/leads.ts";

/* ------------------------------------------------------------- the fixtures */

const SEARCH_A = "5e000000-0000-4000-8000-000000000001";
const SEARCH_B = "5e000000-0000-4000-8000-000000000002";
const COUNTS = { all: 322, ready: 272, nurture: 31, converted: 9, said_no: 6, not_a_fit: 4 };
/** The owner is in Austin; the clock below is theirs. */
const TZ = "America/Chicago";
const NOW = new Date("2026-09-18T19:20:00.000Z");
const minsAgo = (m) => new Date(NOW.getTime() - m * 60_000).toISOString();

/** The plan release A stores (LeadSearchPlanSchema): the area carries the center, and this one has none. */
const PLAN = {
  version: 1, card: "local_businesses", name: "personal trainers",
  asked: "personal trainers in Austin with a website, about 200",
  terms: ["personal trainer"],
  area: { kind: "city", label: "Austin, TX", state: "TX", center: null, radius_m: 25_000, query: "Austin, TX, USA" },
  count: 200, contact: "email",
  criteria: [{ key: "website", text: "With a website", standard: "likely", required: true }],
  exclusions: [{ key: "chain", text: "Chain gyms", origin: "claude" }],
};

/** A search with its latest round, the shape lead_searches_view answers (4.6's LeadSearchDto). */
const search = (over = {}) => ({
  id: SEARCH_A,
  name: "Personal trainers · Austin",
  asked: PLAN.asked,
  asked_on: "2026-09-18T15:00:00.000Z",
  plan: PLAN,
  plan_version: 1,
  round: { id: "r1", seq: 1, purpose: "main", state: "ended", ending: "target_reached", question: null, target: 200, counted: 161, qualified: 2, review: 1, excluded: 1, emails_checked: 88, with_phone: 72, ending_pending: false, waiting_since: null, cost_usd: 4.2, ended_at: "2026-09-18T16:00:00.000Z", undo_op_id: "op-1", undo_version: 3 },
  ...over,
});
const waiting = {
  ...search({ id: SEARCH_B, name: "Chiropractors · Round Rock" }),
  round: { ...search().round, id: "r2", state: "waiting_on_owner", ending: null, question: { sentence: "Most of the first 25 were chains. Keep leaving them out?", criterion_key: "chain" }, counted: 25, waiting_since: "2026-09-18T18:00:00.000Z", ended_at: null },
};

/** One row as `leads_page` answers it (4.6's LeadRowDto); every word the table draws is derived from it. */
const member = (over = {}) => ({ class: "qualified", fit: "strong", reason: "Independent studio, one location, coaching only", excluded_by: null, distance_m: 1931, counted: true, checks: [], other_emails: [], ...over });
const leadRow = (over = {}) => ({
  id: "l1", search_id: SEARCH_A, search_name: "Personal trainers · Austin", place_id: "ChIJfixture0001",
  business_name: "Zilker Strength Lab", category: "Personal trainer",
  city: "Austin", state: "TX", street: "1200 Barton Springs Rd", postal_code: "78704",
  phone: "+15125550101", phone_agrees: true, phone_wrong: false,
  email: "hello@zilkerstrength.example", email_state: "ok", email_checked_at: minsAgo(5),
  website: "zilkerstrength.example", instagram: null, rating: 5, reviews: 16,
  stage: "ready", closed_reason: null, contact_id: null,
  last_outcome: null, last_note: null, contacted_at: null, converted_at: null,
  places: 1, found_at: minsAgo(6), exported_at: null, version: 1,
  member: member(),
  ...over,
});
const ROW_DTOS = [
  leadRow(),
  leadRow({ id: "l2", place_id: "ChIJfixture0002", business_name: "Barton Creek Coaching", email: "team@bartoncreekcoaching.example", email_state: "catch_all", phone: "+15125550102", phone_agrees: false, website: "bartoncreekcoaching.example", rating: 4.8, reviews: 61, found_at: minsAgo(12), member: member({ fit: "look", reason: "Coaching studio, one location" }) }),
  leadRow({ id: "l3", place_id: "ChIJfixture0003", business_name: "Lamar Strength Co.", email: "info@lamarstrength.example", email_state: "unknown", phone: "+15125550103", phone_agrees: false, website: "lamarstrength.example", rating: 4.6, reviews: 22, found_at: minsAgo(20), member: member({ class: "review", fit: "look", reason: "Couldn't check the email" }) }),
  leadRow({ id: "l4", place_id: "ChIJfixture0004", business_name: "GigaFit Austin", email: null, email_state: "none", email_checked_at: null, phone: "+15125550104", phone_agrees: false, website: "gigafit.example", rating: 4.1, reviews: 903, found_at: minsAgo(22), member: member({ class: "excluded", fit: null, reason: "A chain with 40 locations", excluded_by: "chain" }) }),
  leadRow({ id: "l5", place_id: "ChIJfixture0005", business_name: "Pflugerville Training", email: null, email_state: "none", email_checked_at: null, phone: "+15125550105", phone_agrees: false, website: null, rating: 4.4, reviews: 12, found_at: minsAgo(24), member: member({ class: "excluded", fit: null, reason: "A dog trainer", excluded_by: "wrong_kind" }) }),
];
const ROWS = ROW_DTOS.map((r) => toLeadRowVM(r, TZ, NOW));

/** The Leads surface, as legacy-bridge/leads.ts publishes it (Task 3's LeadsSurface). */
const surface = (over = {}) => ({
  searches: [search(), waiting],
  counts: COUNTS,
  rows: ROWS,
  next: null,
  offered: 0,
  view: { searchId: null, list: "all", cls: null, chips: {}, sort: "fit", dir: "asc" },
  route: "clients/leads",
  suggestions: null,
  tz: TZ,
  readFailed: false,
  fetchedAt: NOW.getTime(),
  ...over,
});

/* ------------------------------- the window ------------------------------- */

const listeners = {};
let overlayOpen = null;
const storage = () => { const m = new Map(); return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: (k) => m.delete(k) }; };
globalThis.localStorage = storage();
globalThis.sessionStorage = storage();
globalThis.document = {
  body: {},
  activeElement: null,
  addEventListener() {},
  removeEventListener() {},
  getElementById: () => null,
  querySelector: (sel) => (overlayOpen && sel.split(",").some((part) => part.includes(`[role="${overlayOpen.role}"]`) && (overlayOpen.inApp !== false || !part.includes(".app-root")) && !String(overlayOpen.className || "").split(/\s+/).some((c) => c && part.includes(`:not(.${c})`))) ? overlayOpen : null),
  createElement: () => ({ setAttribute() {}, style: {}, classList: { add() {}, remove() {} } }),
};
globalThis.window = {
  location: { pathname: "/w/salon", hash: "#/clients/leads", origin: "https://app.chanlytics.com", href: "" },
  history: { replaceState: (_s, _t, hash) => { globalThis.window.location.hash = hash; } },
  localStorage: globalThis.localStorage,
  sessionStorage: globalThis.sessionStorage,
  addEventListener: (type, fn) => { (listeners[type] ||= new Set()).add(fn); },
  removeEventListener: (type, fn) => { listeners[type]?.delete(fn); },
  dispatchEvent: (ev) => { for (const fn of [...(listeners[ev.type] || [])]) fn(ev); return true; },
  setTimeout: (fn, ms) => setTimeout(fn, ms),
  clearTimeout: (h) => clearTimeout(h),
  matchMedia: (q) => ({ matches: /max-width: 900px/.test(q) ? globalThis.__phone === true : false }),
};

let cells = [];
let seq = 0;
const flashes = [];
const went = [];
const opened = [];
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
  useReducer: (red, init) => { const k = seq++; if (!(k in cells)) cells[k] = init; return [cells[k], (a) => { cells[k] = red(cells[k], a); }]; },
  useRef: (init) => { const k = seq++; if (!(k in cells)) cells[k] = { current: init }; return cells[k]; },
  useMemo: (fn) => fn(),
  useCallback: (fn) => fn,
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
globalThis.window.React = globalThis.React;
await import("../../../apps/dashboard/src/legacy/components/data-bits.jsx");
for (const k of ["StatStrip", "StatCell", "EmptyState", "FailedRead", "StatePill"]) globalThis[k] = globalThis.window[k];
// Menus and questions as their props, hookless, so the page's own hook order is all the stub counts.
const menus = [];
const confirms = [];
globalThis.MoreMenu = (p) => { menus.push(p); return null; };
globalThis.Confirm = (p) => { confirms.push(p); return null; };
globalThis.ChannelGlyph = () => null;
globalThis.useHotkey = () => {};
await import("../../../apps/dashboard/src/legacy/pages/people-table.jsx");
for (const k of ["PeopleTable", "PeopleColumnsMenu", "plLocked", "plShows", "plSortKeys", "plDrawnColumns", "plColumnChoices", "plColumnOptions", "PL_NO_SEL"]) globalThis[k] = globalThis.window[k];
await import("../../../apps/dashboard/src/legacy/pages/clients-a.jsx");
for (const k of ["PeopleRail", "PeopleStanding", "PeopleScopeTabs"]) globalThis[k] = globalThis.window[k];
// The boards this task does not write: the finder (Task 8), the strip (Task 10), the peek (Task 12) and the
// first day (Task 17). Drawn here as their props, so what THIS task hands them is what is pinned.
const finders = [];
const strips = [];
const peeks = [];
globalThis.LeadFinder = (p) => { finders.push(p); return null; };
globalThis.LeadStrip = (p) => { strips.push(p); return null; };
globalThis.LeadPeek = (p) => { peeks.push(p); return null; };
globalThis.LeadsFirstDay = () => null;
// The peek's two seams the page reads (Task 12's leads-peek.jsx): Esc backs out one step, and the peek follows
// the row cursor only while it is just showing the lead.
globalThis.leadPeekEscape = ({ mode, armed, setMode, setArmed, setPeekId }) => {
  if (armed && armed.asked) { setArmed(null); return "armed"; }
  if (mode && mode !== "info") { setMode("info"); return "mode"; }
  setPeekId(null);
  return "peek";
};
globalThis.leadPeekFollows = (mode, armed) => (!mode || mode === "info") && !armed;
await import("../../../apps/dashboard/src/legacy/pages/leads-scope.jsx");
for (const k of ["LeadsScope", "LEAD_COLUMNS", "LEAD_SORT_KEYS", "LeadShape"]) globalThis[k] = globalThis.window[k];

const walk = (n, fn) => { if (n == null || typeof n !== "object") return; fn(n); for (const k of n.props?.children ?? []) walk(k, fn); if (n.rendered) walk(n.rendered, fn); };
const all = (tree, pred) => { const out = []; walk(tree, (n) => { if (pred(n)) out.push(n); }); return out; };
const find = (tree, pred) => all(tree, pred)[0] ?? null;
const byTestId = (tree, id) => find(tree, (n) => n.props?.["data-testid"] === id);
const textOf = (n) => {
  if (n == null || typeof n === "boolean") return "";
  if (typeof n === "string" || typeof n === "number") return String(n);
  if (Array.isArray(n)) return n.map(textOf).join("");
  if (n.rendered !== undefined) return textOf(n.rendered);
  return (n.props?.children ?? []).map(textOf).join("");
};
const click = (node) => node.props.onClick({ stopPropagation() {}, preventDefault() {}, currentTarget: {} });
const sortByHeading = (tree, label) => click(find(tree, (n) => n.type === "button" && String(n.props?.className || "").split(/\s+/).includes("cl-th-sort") && textOf(n).startsWith(label)));
const tick = () => new Promise((r) => setTimeout(r, 0));
const settle = async (n = 8) => { for (let i = 0; i < n; i += 1) await tick(); };
const press = (key, target = null, { focus = target, ...mods } = {}) => {
  globalThis.document.activeElement = focus;
  let taken = false;
  const ev = { key, target, metaKey: false, ctrlKey: false, altKey: false, shiftKey: false, repeat: false, defaultPrevented: false, ...mods, preventDefault() { taken = true; ev.defaultPrevented = true; } };
  for (const fn of [...(listeners.keydown || [])]) fn(ev);
  return taken;
};

/* ------------------------- the surface and the courier, faked ------------------------- */

const calls = [];
const ok = (data = {}) => ({ ok: true, data });
const install = ({ role = "owner", refuse = null } = {}) => {
  calls.length = 0;
  Object.assign(globalThis.window, {
    __leadsRouteOf: leadsRoute,
    __leadsRouteParse: parseLeadsRoute,
    __leadRail: leadRail,
    __leadsStanding: leadsStanding,
    // The derivations bag (seed-globals.ts): Task 9 installs it, Task 10 puts `leadStrip` in it.
    __LEAD_VM: { leadStrip: (s) => ({ state: "ended", alert: false, title: `Found ${s.round.counted} personal trainers`, parts: [], progress: 1, actions: [] }) },
    __leadPeekVM: (id) => { const r = ROWS.find((x) => x.id === id); return r ? { id: r.id, name: r.name } : null; },
    __leadSearchWords: (s) => (s ? { askedLine: `You asked on Sep 18: “${s.asked}”.`, keepsLine: "Keeps the ones you contacted or are talking to." } : { askedLine: "", keepsLine: "" }),
    __leadsView: async (v) => { calls.push(["view", v]); },
    __leadsMore: async () => { calls.push(["more", null]); },
    __leadsTakeOffered: async () => { calls.push(["takeOffered", null]); },
    __leadKeep: async (s, id) => { calls.push(["keep", { search_id: s, id }]); return refuse || ok({ op_id: "op-k", version: 4 }); },
    __leadExclude: async (s, id) => { calls.push(["exclude", { search_id: s, id }]); return refuse || ok({ op_id: "op-e", version: 5 }); },
    __leadPutBack: async (s, id) => { calls.push(["putBack", { search_id: s, id }]); return refuse || ok({ op_id: "op-p", version: 6 }); },
    __leadUndo: async (op, version) => { calls.push(["undo", { op, version }]); return ok({}); },
    __leadsBulk: async (body) => { calls.push(["bulk", body]); return ok({ done: 2, op_id: "op-b", version: 7 }); },
    __leadSearchRename: async (id, name) => { calls.push(["rename", { id, name }]); return refuse || ok({ name }); },
    __leadSearchRemove: async (id) => { calls.push(["remove", { id }]); return refuse || ok({ archived: 143, kept: 18 }); },
    __leadSearchMore: async (id, purpose, plan) => { calls.push(["more_round", { id, purpose, plan }]); return ok({ round_id: "r9" }); },
    __href: (key, params, query) => `/api/v1/${key.split(" ")[1]}?${new URLSearchParams(Object.entries(query || {}).filter(([, v]) => v !== undefined)).toString()}`,
    __roleGate: roleGate,
    __ME: { role },
    ST_STORE: { myRole: () => role, can: (a) => !!(ROLE_PERMS[role] || {})[a] },
    usePPToast: () => [null, (t) => flashes.push(t)],
    CHANLY: { nav: (to) => went.push(to), R: { thread: (id) => `inbox/${id}` } },
    __clock: { dateYear: () => "Sep 18, 2026", time: () => "2:14 PM" },
    __csvCell: (s) => String(s ?? ""),
  });
};

/** A page with the surface landed and nothing drawn yet. */
const fresh = ({ leads = surface(), views = {}, role = "owner", refuse = null, people = true } = {}) => {
  install({ role, refuse });
  globalThis.window.__LEADS = leads;
  globalThis.window.__PEOPLE = people
    ? { rows: [], lists: [], saved: [], groups: [], aggregates: { total: 0, needsYou: 0, reachedWeek: 0 }, views, attention: {}, savedRead: true, page: null, calendar: null }
    : undefined;
  cells = [];
  flashes.length = 0;
  went.length = 0;
  opened.length = 0;
  menus.length = 0;
  confirms.length = 0;
  finders.length = 0;
  strips.length = 0;
  peeks.length = 0;
  for (const k of Object.keys(listeners)) delete listeners[k];
  globalThis.document.activeElement = null;
  overlayOpen = null;
  globalThis.__phone = false;
  globalThis.window.location.href = "";
  globalThis.localStorage.removeItem("chanlytics-people-view");
  globalThis.localStorage.removeItem("chanlytics-leads-view");
  delete globalThis.window.__saveView;
};
const draw = (props = {}) => { seq = 0; return globalThis.window.ClientsA({ scope: "leads", leadsRoute: "leads", onNavigate: (to) => went.push(to), onOpenProfile: (id) => opened.push(id), ...props }); };

/* ---------------------------------- the rows ---------------------------------- */

const rowOf = (tree, id) => find(tree, (n) => n.type === "tr" && n.props?.id === `lead-${id}`);
const names = (tree) => all(tree, (n) => n.props?.["data-testid"] === "lead-name").map(textOf);
const headings = (tree) => all(tree, (n) => n.type === "th" && !/\bpl-col-off\b/.test(String(n.props?.className || ""))).map((th) => textOf(th).replace(/[▲▼]/g, "").trim()).filter(Boolean);

test("the Leads scope draws the rows the surface read, in the order it read them, each email's state a word beside a shape", () => {
  fresh();
  const tree = draw();
  assert.deepEqual(names(tree), ["Zilker Strength Lab", "Barton Creek Coaching", "Lamar Strength Co.", "GigaFit Austin", "Pflugerville Training"], "the surface's order, strongest fit first; the page never re-sorts what it was given");
  assert.deepEqual(headings(tree), ["Business", "Fit", "Email", "Phone", "Why it fits", "Rating", "Stage", "Found"], "PRD 6.2's Leads columns; Distance waits for a search with a center, and Source, Website and Search are off");
  const email = (id) => byTestId(rowOf(tree, id), "lead-email");
  assert.equal(email("l1").props.title, "Checked");
  assert.equal(email("l2").props.title, "Unconfirmed", "a catch-all server accepts anything, so the check cannot tell (S12)");
  assert.equal(email("l3").props.title, "Couldn't check");
  assert.ok(find(email("l2"), (n) => /\bld-shape\b/.test(String(n.props?.className || ""))), "the state is a shape as well as a word, never colour alone");
  assert.match(textOf(email("l4")), /Not checked/, "a left-out place's email was never checked, and the row says so");
  assert.equal(textOf(byTestId(rowOf(tree, "l4"), "lead-stage")).trim(), "", "an excluded place has no stage: the class is not a stage");
  assert.ok(find(rowOf(tree, "l1"), (n) => n.props?.className === "ld-tick2"), "Maps and their website agree on the number");
  assert.equal(textOf(find(tree, (n) => n.props?.className === "cl-table-foot")).startsWith("322 leads"), true, "the table calls its rows leads");
  assert.equal(textOf(byTestId(rowOf(tree, "l4"), "lead-fit")), "Chain", "Excluded wears the criterion that left it out, in the owner's words");
});

test("the rail counts what the lists hold, a waiting search wears a question mark, and the standing line says who needs you", () => {
  fresh();
  const tree = draw();
  const rows = all(byTestId(tree, "leads-lists"), (n) => n.type === "button").map((b) => [textOf(find(b, (x) => x.props?.className === "label")), textOf(find(b, (x) => x.props?.className === "count"))]);
  assert.deepEqual(rows, [["All leads", "322"], ["Ready", "272"], ["Contacted", "31"], ["Talking", "9"], ["Said no", "6"], ["Not a fit", "4"]]);
  assert.ok(byTestId(tree, `leads-search-${SEARCH_A}`) && byTestId(tree, `leads-search-${SEARCH_B}`), "both searches are on the rail");
  assert.ok(find(byTestId(tree, `leads-search-${SEARCH_B}`), (n) => n.props?.className === "rail-q"), "the one waiting on an answer wears a ? in the accent");
  assert.equal(find(byTestId(tree, `leads-search-${SEARCH_A}`), (n) => n.props?.className === "rail-q"), null, "the one that ended does not");
  assert.equal(textOf(byTestId(tree, "leads-standing")), "322 leads·272 ready·2 searches·1 search needs you");
  click(byTestId(tree, "leads-standing-needs"));
  assert.deepEqual(went, [`clients/leads:s-${SEARCH_B}`], "and it is the tap that opens the search waiting on you");
});

test("the People | Leads switch is a tablist in both scopes, and picking the other one navigates to it", () => {
  fresh();
  let tree = draw();
  const tabs = byTestId(tree, "people-scope");
  assert.equal(tabs.props.role, "tablist");
  assert.deepEqual(all(tabs, (n) => n.props?.role === "tab").map((n) => [textOf(n), n.props["aria-selected"]]), [["People", false], ["Leads", true]]);
  click(byTestId(tree, "scope-people"));
  assert.deepEqual(went, ["clients"]);
  went.length = 0;
  cells = [];
  tree = draw({ scope: "people", leadsRoute: null });
  assert.deepEqual(all(byTestId(tree, "people-scope"), (n) => n.props?.role === "tab").map((n) => n.props["aria-selected"]), [true, false], "and People's rail carries the same switch");
  click(byTestId(tree, "scope-leads"));
  assert.deepEqual(went, ["clients/leads"]);
});

test("drawing People then Leads keeps the page's hook order: every hook the Leads scope needs is declared in both", () => {
  fresh();
  draw({ scope: "people", leadsRoute: null });
  const asPeople = seq;
  cells = [];
  draw();
  assert.equal(seq, asPeople, "one call order, whichever scope is drawn");
  assert.ok(asPeople > 20, `and it is the page's own hooks that were counted (${asPeople})`);
});

test("the Leads view is saved with its list, sort and columns every time, through __saveView('leads', …), one save at a time", async () => {
  fresh({ views: { leads: { list: "all", sortBy: "fit", sortDir: "asc", columns: { website: true } } } });
  const held = [];
  globalThis.window.__saveView = (page, view) => new Promise((land) => held.push({ page, view: JSON.parse(JSON.stringify(view)), land }));
  let tree = draw();
  assert.ok(headings(tree).includes("Website"), "the member's own columns");
  assert.deepEqual(held, [], "the view it already holds is not saved again");
  click(byTestId(tree, "people-columns"));
  tree = draw();
  click(byTestId(tree, "column-source"));
  tree = draw();
  assert.equal(held.length, 1);
  assert.deepEqual(held[0], { page: "leads", view: { list: "all", sortBy: "fit", sortDir: "asc", columns: { website: true, source: true } }, land: held[0].land }, "every key the page owns, the list included");
  // A second change while the first is out waits for it: two in flight could land out of order.
  sortByHeading(tree, "Rating");
  draw();
  assert.equal(held.length, 1, "one save at a time");
  held[0].land({ ok: true, data: {} });
  await settle();
  assert.equal(held.length, 2);
  assert.deepEqual(held[1].view, { list: "all", sortBy: "rating", sortDir: "desc", columns: { website: true, source: true } }, "the latest view, whole");
  held[1].land({ ok: true, data: {} });
  await settle();
  assert.equal(held.length, 2, "and nothing after it");
});

test("a sort is the surface's to read, not the page's to re-order: the rows hold their order until the read lands", () => {
  fresh();
  let tree = draw();
  assert.deepEqual(calls.filter((c) => c[0] === "view").length, 1, "one read for the view the address names");
  sortByHeading(tree, "Rating");
  tree = draw();
  const views = calls.filter((c) => c[0] === "view");
  assert.equal(views.length, 2, "the new sort is one more read, keyed by the whole view");
  assert.deepEqual([views[1][1].sort, views[1][1].dir, views[1][1].list], ["rating", "desc", "all"]);
  assert.deepEqual(names(tree), ["Zilker Strength Lab", "Barton Creek Coaching", "Lamar Strength Co.", "GigaFit Austin", "Pflugerville Training"], "and nothing moved under the owner while it was out");
});

test("a click on a lead's row peeks it, as Enter does", () => {
  fresh();
  const tree = draw();
  find(tree, (n) => n.type === "tr" && n.props?.id === "lead-l3").props.onClick();
  draw();
  assert.equal(peeks.at(-1).vm.id, "l3", "the row is the peek's way in; the name inside it is the other");
  assert.deepEqual(opened, [], "and a lead is never a profile");
});

test("the search box filters the leads loaded, by name, kind and area, and sends nothing", () => {
  fresh();
  let tree = draw();
  const box = find(tree, (n) => n.type === "input" && n.props?.placeholder === "Search leads");
  const before = calls.length;
  box.props.onChange({ target: { value: "lamar" } });
  tree = draw();
  assert.deepEqual(names(tree), ["Lamar Strength Co."]);
  box.props.onChange({ target: { value: "78704" } });
  tree = draw();
  assert.deepEqual(names(tree).length, 5, "the area they are all in");
  box.props.onChange({ target: { value: "gigafit" } });
  tree = draw();
  assert.deepEqual(names(tree), ["GigaFit Austin"]);
  assert.equal(calls.length, before, "nothing was asked of the server: words to chips is release C");
});

/* ------------------------------------ the keys ------------------------------------ */

const cursorRow = (tree) => find(tree, (n) => n.type === "tr" && /\bfocused\b/.test(n.props?.className || ""))?.props.id ?? null;

test("the keys: J and K move, Enter peeks, x selects, C calls, F finds; one listener before and after the scope draws", () => {
  fresh();
  draw();
  assert.equal(listeners.keydown?.size, 1, "one listener for the page's life");
  const [only] = listeners.keydown;
  draw();
  draw();
  assert.equal(listeners.keydown.size, 1);
  assert.ok(listeners.keydown.has(only), "a draw does not put a new listener in its place");
  press("j");
  assert.equal(cursorRow(draw()), "lead-l1");
  press("j");
  assert.equal(cursorRow(draw()), "lead-l2");
  press("k");
  assert.equal(cursorRow(draw()), "lead-l1");
  assert.equal(press("x"), true);
  assert.match(textOf(byTestId(draw(), "leads-bulk-bar")), /1 selected/, "x selects the lead under the cursor");
  assert.equal(press("Enter", { tagName: "TR", isContentEditable: false, closest: () => null }), true);
  assert.ok(byTestId(draw(), "leads-bulk-bar"), "the selection is still there");
  assert.equal(peeks.at(-1).vm.id, "l1", "Enter peeks the lead under the cursor, and never opens a profile");
  assert.deepEqual(opened, []);
  assert.equal(press("c"), true);
  assert.equal(globalThis.window.location.href, "tel:+15125550101", "C dials the lead under the cursor from the owner's own phone");
  assert.equal(press("f"), true);
  assert.equal(draw() && finders.at(-1).open, true, "F opens the finder");
});

test("Esc closes the peek, then the finder, then the Columns menu, then the selection -- one press each, in that order", () => {
  fresh();
  byTestId(draw(), "select-all").props.onChange();
  draw();
  press("j");
  draw();
  press("Enter", { tagName: "TR", isContentEditable: false, closest: () => null });
  draw();
  press("f");
  draw();
  click(byTestId(draw(), "people-columns"));
  // Everything the page can have open at once, opened: the peek, the finder, the Columns menu and a selection.
  let tree = draw();
  const drawn = { peeks: peeks.length, finders: finders.length };
  assert.ok(byTestId(tree, "people-columns-menu"), "the menu is open");
  assert.equal(peeks.at(-1).vm.id, "l1", "so is the peek");
  assert.equal(finders.at(-1).open, true, "and the finder");
  assert.equal(press("j"), false, "the finder holds every key while it is open");
  assert.equal(press("Escape"), true);
  tree = draw();
  assert.equal(peeks.length, drawn.peeks, "the peek went first: it is not drawn any more");
  assert.equal(finders.length, drawn.finders + 1, "and the finder is still open");
  assert.equal(press("Escape"), true);
  tree = draw();
  assert.equal(finders.length, drawn.finders + 1, "the finder went second");
  assert.ok(byTestId(tree, "people-columns-menu"), "the Columns menu is still open");
  assert.equal(press("Escape"), true);
  tree = draw();
  assert.equal(byTestId(tree, "people-columns-menu"), null, "the Columns menu went third");
  assert.match(textOf(byTestId(tree, "leads-bulk-bar")), /5 selected/, "and the selection is still there");
  assert.equal(press("Escape"), true);
  assert.equal(byTestId(draw(), "leads-bulk-bar"), null, "the selection goes last");
});

test("the peek is the page's own overlay: J and K keep walking the rows behind it, and a menu over the page still silences them", () => {
  fresh();
  draw();
  press("j");
  draw();
  press("Enter", { tagName: "TR", isContentEditable: false, closest: () => null });
  draw();
  // The peek is a dialog with .pl-peek, which PL_OVERLAY leaves out.
  overlayOpen = { role: "dialog", className: "pl-peek" };
  assert.equal(press("j"), true, "the rows walk on under the peek");
  assert.equal(cursorRow(draw()), "lead-l2");
  draw();
  assert.equal(peeks.at(-1).vm.id, "l2", "and the peek follows the cursor while it is just showing the lead");
  // A question or a draft holds it on its own lead (leadPeekFollows, Task 12).
  peeks.at(-1).onArmed({ kind: "call", leadId: "l2", asked: true });
  draw();
  press("j");
  draw();
  assert.equal(peeks.at(-1).vm.id, "l2", "the peek asked something, so it stays on the lead it asked about");
  assert.equal(press("Escape"), true);
  draw();
  assert.equal(peeks.at(-1).armed, null, "and Esc backs out the question first, not the peek");
  overlayOpen = { role: "menu" };
  assert.equal(press("j"), false, "anything else open over the page has the keys");
});

/* ------------------------------------ the bulk bar ------------------------------------ */

test("the bulk bar acts on the leads loaded and selected; Select all N that match hands the view to the server", async () => {
  fresh();
  byTestId(draw(), "select-all").props.onChange();
  let tree = draw();
  assert.match(textOf(byTestId(tree, "leads-bulk-bar")), /5 selected/);
  click(byTestId(tree, "leads-bulk-contacted"));
  await settle();
  assert.deepEqual(calls.at(-1), ["bulk", { by: "ids", action: "contacted", ids: ["l1", "l2", "l3", "l4", "l5"] }]);
  assert.equal(textOf(flashes.at(-1).msg), "Marked contacted.");
  await flashes.at(-1).undo();
  assert.deepEqual(calls.at(-1), ["undo", { op: "op-b", version: 7 }], "one operation for the lot, undone as one");
  click(byTestId(draw(), "leads-select-matching"));
  tree = draw();
  assert.match(textOf(byTestId(tree, "leads-bulk-bar")), /322 selected/, "every lead the view matches, not every id");
  click(byTestId(tree, "leads-bulk-not-a-fit"));
  await settle();
  assert.deepEqual(calls.at(-1), ["bulk", { by: "view", action: "not_a_fit", view: { list: "all", sort: "fit", dir: "asc" } }], "the view's filters go to the server, never 1,240 ids");
  click(byTestId(draw(), "leads-bulk-copy"));
  assert.equal(textOf(flashes.at(-1).msg), "Copied 3 emails; 2 had none you can use", "what was copied, and what could not be");
});

/* ------------------------------------ the words ------------------------------------ */

test("no word the Leads scope says names the vendor, and no number on it is a dollar amount", () => {
  fresh();
  const said = [];
  for (const route of ["leads", `leads:s-${SEARCH_A}`, `leads:s-${SEARCH_A}:c-excluded`, "leads:l-ready"]) {
    cells = [];
    walk(draw({ leadsRoute: route }), (n) => {
      for (const kid of n.props?.children ?? []) if (typeof kid === "string") said.push(kid);
      for (const key of ["title", "aria-label", "placeholder", "aria-description", "data-tip"]) if (typeof n.props?.[key] === "string") said.push(n.props[key]);
    });
    for (const m of menus) for (const i of m.items || []) said.push(i.header || "", i.label || "", i.meta || "");
  }
  const bad = said.filter((s) => /apify|compass|bounceverify|\$\d/i.test(s));
  assert.deepEqual(bad, [], "the owner sees Claude finding businesses, and one unit: leads");
});

/* ---------------------------- the classes, and their acts ---------------------------- */

test("a Needs review row offers Keep and Exclude, an Excluded row offers Put back, and each toasts with Undo through its operation", async () => {
  fresh();
  let tree = draw();
  const review = rowOf(tree, "l3");
  assert.ok(byTestId(review, "lead-keep") && byTestId(review, "lead-exclude"), "Keep counts it; Exclude is free");
  assert.equal(byTestId(review, "lead-put-back"), null);
  const excluded = rowOf(tree, "l4");
  assert.ok(byTestId(excluded, "lead-put-back"), "Put back is the owner's override");
  assert.equal(byTestId(excluded, "lead-keep"), null);
  click(byTestId(review, "lead-keep"));
  await settle();
  assert.deepEqual(calls.at(-1), ["keep", { search_id: SEARCH_A, id: "l3" }], "the lead names the search whose class it is in");
  assert.equal(textOf(flashes.at(-1).msg), "Kept. It counts as a lead this month.");
  await flashes.at(-1).undo();
  assert.deepEqual(calls.at(-1), ["undo", { op: "op-k", version: 4 }], "Undo names the operation and the version it saw, never rows");
  click(byTestId(rowOf(draw(), "l4"), "lead-put-back"));
  await settle();
  assert.deepEqual(calls.at(-1), ["putBack", { search_id: SEARCH_A, id: "l4" }]);
  assert.equal(textOf(flashes.at(-1).msg), "Put back. It counts as a lead now.");
  click(byTestId(rowOf(draw(), "l3"), "lead-exclude"));
  await settle();
  assert.deepEqual(calls.at(-1), ["exclude", { search_id: SEARCH_A, id: "l3" }]);
  assert.equal(textOf(flashes.at(-1).msg), "Excluded. Nothing counted.");
});

test("a refused Keep is the route's sentence, and nothing says it was kept", async () => {
  fresh({ refuse: { ok: false, status: 409, code: "conflict", message: "This place is hidden: it is already a customer, or was erased." } });
  click(byTestId(rowOf(draw(), "l3"), "lead-keep"));
  await settle();
  assert.equal(flashes.at(-1).tone, "danger");
  assert.match(textOf(flashes.at(-1).msg), /already a customer/);
});

test("an operator sees Find leads, Keep, Exclude and Put back refusing in the gate's sentence, and F does nothing for them", () => {
  fresh({ role: "operator" });
  const tree = draw();
  const gated = (n) => [n.props["aria-disabled"], n.props["aria-description"]];
  assert.deepEqual(gated(byTestId(tree, "leads-find")), [true, "Only an owner can find leads."]);
  assert.deepEqual(gated(byTestId(rowOf(tree, "l3"), "lead-keep")), [true, "Only an owner can keep this lead."]);
  assert.deepEqual(gated(byTestId(rowOf(tree, "l3"), "lead-exclude")), [true, "Only an owner can exclude this lead."]);
  assert.deepEqual(gated(byTestId(rowOf(tree, "l4"), "lead-put-back")), [true, "Only an owner can put this lead back."]);
  assert.equal(press("f"), false, "and the key is not theirs either");
  assert.equal(finders.length, 0);
});

test("the Excluded view's chips count by criterion, and each narrows the rows", () => {
  fresh();
  let tree = draw({ leadsRoute: `leads:s-${SEARCH_A}:c-excluded` });
  const chips = all(byTestId(tree, "lead-excluded-chips"), (n) => n.props?.["data-testid"]?.startsWith("lead-chip-")).map((n) => textOf(n).trim());
  assert.deepEqual(chips, ["Chain 1", "Wrong kind 1"]);
  click(byTestId(tree, "lead-chip-Chain"));
  tree = draw({ leadsRoute: `leads:s-${SEARCH_A}:c-excluded` });
  assert.deepEqual(names(tree), ["GigaFit Austin"]);
  assert.deepEqual(all(byTestId(tree, "lead-classes"), (n) => n.props?.role === "tab").map((n) => [textOf(n).trim(), n.props["aria-selected"]]), [["Qualified 2", false], ["Needs review 1", false], ["Excluded 1", true]], "the three classes, each a view of the search");
});
