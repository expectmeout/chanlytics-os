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
import { LEAD_WORDS, ROLE_PERMS, roleGate } from "@chanlytics/contracts";
import { leadEndingLine, leadReviewGroups, leadBand, leadReviewCosts, leadAskedFor, LEAD_REVIEW_ACT_WORDS, LEAD_REVIEW_GROUP_WHY, leadMapPlot, leadMapAcross, leadMapNote, leadRail, leadsRoute, leadsStanding, leadsFirstDayWays, parseLeadsRoute, toLeadRowVM } from "../../../packages/contracts/src/leads.ts";
import { leadPinTone, stateOf } from "../../../packages/contracts/src/tone.ts";
import { planArea, planMinutes, planVersionOf, planWhere, planWho } from "../../../packages/contracts/src/lead-search.ts";

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
  leadRow({ lat: 30.2672, lng: -97.7431, logo_url: "https://zilkerstrength.example/mark.png" }),
  leadRow({ id: "l2", lat: 30.3122, lng: -97.7431, place_id: "ChIJfixture0002", business_name: "Barton Creek Coaching", email: "team@bartoncreekcoaching.example", email_state: "catch_all", phone: "+15125550102", phone_agrees: false, website: "bartoncreekcoaching.example", rating: 4.8, reviews: 61, found_at: minsAgo(12), member: member({ fit: "look", reason: "Coaching studio, one location" }) }),
  leadRow({ id: "l3", lat: 30.2672, lng: -97.6912, place_id: "ChIJfixture0003", business_name: "Lamar Strength Co.", email: "info@lamarstrength.example", email_state: "unknown", phone: "+15125550103", phone_agrees: false, website: "lamarstrength.example", rating: 4.6, reviews: 22, found_at: minsAgo(20), member: member({ class: "review", fit: "look", reason: "Couldn't check the email", reasons: ["email:unknown"] }) }),
  leadRow({ id: "l4", lat: 30.2272, lng: -97.7431, place_id: "ChIJfixture0004", business_name: "GigaFit Austin", email: null, email_state: "none", email_checked_at: null, phone: "+15125550104", phone_agrees: false, website: "gigafit.example", rating: 4.1, reviews: 903, found_at: minsAgo(22), member: member({ class: "excluded", fit: null, reason: "A chain with 40 locations", excluded_by: "chain" }) }),
  leadRow({ id: "l5", lat: 30.44, lng: -97.62, place_id: "ChIJfixture0005", business_name: "Pflugerville Training", email: null, email_state: "none", email_checked_at: null, phone: "+15125550105", phone_agrees: false, website: null, rating: 4.4, reviews: 12, found_at: minsAgo(24), member: member({ class: "excluded", fit: null, reason: "A dog trainer", excluded_by: "wrong_kind" }) }),
];
const ROWS = ROW_DTOS.map((r) => toLeadRowVM(r, TZ, NOW));

/** The Leads surface, as legacy-bridge/leads.ts publishes it (Task 3's LeadsSurface). */
// What the server wrote for this workspace from its own business line (4.4's suggestionsFor).
const SUGGESTIONS = {
  business_line: "a personal training studio in Denver",
  by_owner: false,
  made_at: "2026-09-16T10:00:00.000Z",
  items: [{ words: "gyms in Denver", who_for: "owners who refer clients out", category_key: "gym", reach: "About 6 in 10 have an email" }],
};

const surface = (over = {}) => ({
  searches: [search(), waiting],
  counts: COUNTS,
  rows: ROWS,
  next: null,
  offered: 0,
  view: { searchId: null, list: "all", cls: null, chips: {}, sort: "fit", dir: "asc" },
  route: "clients/leads",
  suggestions: null,
  month: { used: 262, left: 238, renewsOn: "Oct 1" },
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
  document: globalThis.document,
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
// The boards this task does not write: the finder (Task 8), the strip (Task 10) and the peek (Task 12). Drawn
// here as their props, so what THIS task hands them is what is pinned. The first day is NOT among them: it is
// Task 17's own component, loaded below with leads-finder.jsx, because a stub of it is what let the Leads scope
// ship referencing a component nothing declared -- every test here green, and "LeadsFirstDay is not defined"
// in the browser for every workspace that had not yet kept a search, which on the first day is all of them.
const finders = [];
const strips = [];
const peeks = [];
globalThis.LeadFinder = (p) => { finders.push(p); return null; };
globalThis.LeadStrip = (p) => { strips.push(p); return null; };
globalThis.LeadPeek = (p) => { peeks.push(p); return null; };
// The peek's own file (Task 12's leads-peek.jsx), for real: its acts (LeadPeekActions) are what the page must
// build and hand over, and its four seams are what the page reads -- Esc backing out one step, the peek following
// the row cursor, the focus rule, and the watcher that asks once the owner is back at the tab. Only the DRAWING is
// a recorder (globalThis.LeadPeek, above); a hand-written stub of the acts would pin the page against a shape of
// this file's own making, which is how every control in the peek came to be undefined on the page with 18 green
// unit tests behind it.
// Hold to talk is Ask's own hook and Ask's own words (ask-hooks.jsx, ask-text.jsx), loaded before this page in
// both lists (manifest.ts:52, Chanlytics.html:90); the finder is handed its answer, so the page is drawn here the
// way it is served. leads-finder.jsx is imported for the STRIP'S OWN FILE -- its component and its view model are
// published on `window`, which is what leads-scope.jsx draws and what the page reads, so a strip that nothing
// declares fails here rather than at an owner's first open search.
await import("../../../apps/dashboard/src/legacy/pages/ask-text.jsx");
await import("../../../apps/dashboard/src/legacy/pages/ask-hooks.jsx");
await import("../../../apps/dashboard/src/legacy/pages/leads-finder.jsx");
// The browser's own recogniser, and every way a page could record or upload: each one a recorder, so
// "hold to talk sends nothing" is a fact this file can check rather than a sentence it repeats.
const recs = [];
const uploads = [];
class FakeRecognition {
  constructor() { this.started = 0; this.stopped = 0; recs.push(this); }
  start() { this.started += 1; }
  stop() { this.stopped += 1; }
}
globalThis.window.SpeechRecognition = FakeRecognition;
globalThis.window.navigator = { language: "en-US", mediaDevices: { getUserMedia: () => { uploads.push("getUserMedia"); return Promise.reject(new Error("no")); } } };
globalThis.window.fetch = (u) => { uploads.push(`fetch ${u}`); return Promise.reject(new Error("no")); };
globalThis.window.MediaRecorder = function MediaRecorderSpy() { uploads.push("MediaRecorder"); };
await import("../../../apps/dashboard/src/legacy/pages/leads-peek.jsx");
for (const k of ["LeadPeekActions", "LeadNotFitWhy", "leadPeekEscape", "leadPeekFollows", "leadPeekFocus", "leadArmOnReturn"]) globalThis[k] = globalThis.window[k];
await import("../../../apps/dashboard/src/legacy/pages/leads-scope.jsx");
for (const k of ["LeadsScope", "LEAD_COLUMNS", "LEAD_SORT_KEYS", "LeadShape", "LeadSlotShape"]) globalThis[k] = globalThis.window[k];
for (const k of ["LeadsFirstDay", "LeadSuggestion", "LeadWayCard"]) globalThis[k] = globalThis.window[k];

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
    // The chrome bridge's state map, as shell.ts publishes it: StatePill takes its tone from here and nowhere else.
    __chrome: { state: stateOf },
    // The derivations bag seed-globals.ts publishes. Every word in it is contracts' own -- including
    // `leadEndingLine`, which is where all nine of the strip's ending sentences come from.
    __LEAD_VM: { leadEndingLine, planArea, planMinutes, planVersionOf, planWhere, planWho, leadStrip: globalThis.window.leadStrip , leadReviewGroups, leadBand, leadReviewCosts, leadAskedFor, LEAD_REVIEW_ACT_WORDS, LEAD_REVIEW_GROUP_WHY, leadMapPlot, leadMapAcross, leadMapNote, leadPinTone },
    __ask: { language: () => "en", send: async () => { uploads.push("ask.send"); }, commit: async () => { uploads.push("ask.commit"); return { ok: false, message: "no" }; } },
    __leadPeekVM: (id) => { const r = ROWS.find((x) => x.id === id); return r ? { id: r.id, name: r.name } : null; },
    __leadSearchWords: (s) => (s ? { askedLine: `You asked on Sep 18: “${s.asked}”.`, keepsLine: "Keeps the ones you contacted or are talking to." } : { askedLine: "", keepsLine: "" }),
    __leadsView: async (v) => { calls.push(["view", v]); },
    __leadsMore: async () => { calls.push(["more", null]); },
    __leadsTakeOffered: async () => { calls.push(["takeOffered", null]); },
    __leadKeep: async (s, id) => { calls.push(["keep", { search_id: s, id }]); return refuse || ok({ op_id: "op-k", version: 4 }); },
    __leadExclude: async (s, id) => { calls.push(["exclude", { search_id: s, id }]); return refuse || ok({ op_id: "op-e", version: 5 }); },
    __leadPutBack: async (s, id) => { calls.push(["putBack", { search_id: s, id }]); return refuse || ok({ op_id: "op-p", version: 6 }); },
    __leadUndo: async (op, version) => { calls.push(["undo", { op, version }]); return ok({}); },
    __leadsBulk: async (body) => { calls.push(["bulk", body]); return ok({ done: 2, op_id: "op-b", version: 7, toast: "Done." }); },
    __leadSearchRename: async (id, name) => { calls.push(["rename", { id, name }]); return refuse || ok({ name }); },
    __leadSearchRemove: async (id) => { calls.push(["remove", { id }]); return refuse || ok({ archived: 143, kept: 18 }); },
    __leadSearchMore: async (id, purpose, plan) => { calls.push(["more_round", { id, purpose, plan }]); return ok({ round_id: "r9" }); },
    __leadSearchStop: async (id) => { calls.push(["stop_search", { id }]); return refuse || ok({}); },
    __leadSearchAnswer: async (id, answer, plan) => { calls.push(["answer", { id, answer, ...(plan ? { plan } : {}) }]); return refuse || ok({}); },
    __leadSearchUndo: async (id) => { calls.push(["search_undo", { id }]); return refuse || ok({ removed: 160, credited: 160, op_id: "op-u", version: 2 }); },
    __href: (key, params, query) => `/api/v1/${key.split(" ")[1]}?${new URLSearchParams(Object.entries(query || {}).filter(([, v]) => v !== undefined)).toString()}`,
    // Every word the Leads scope says, from contracts (seed-globals.ts): the five whys the bulk bar and the
    // peek both draw are read off it, so neither spells them.
    __LEAD_WORDS: LEAD_WORDS,
    __leadWays: leadsFirstDayWays,
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
  recs.length = 0;
  uploads.length = 0;
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
  assert.deepEqual(headings(tree), ["Business", "Reach", "Rated", "Found"], "D5's three columns and when it was found; Fit, Why it fits, Stage, Distance, Source, Website and Search are the Columns menu's, off");
  // D5: both contacts as two slots, phone then mailbox: the shape carries the state, the control's name carries the
  // word and the value, and the sentence behind the shape is a tip in the DOM the control names.
  const slot = (id, kind) => byTestId(rowOf(tree, id), `lead-slot-${kind}`);
  const labelOf = (n) => (find(n, (x) => x.props && x.props["aria-label"]) || { props: {} }).props["aria-label"];
  const tipOf = (n) => textOf(find(n, (x) => x.props?.role === "tooltip"));
  assert.match(labelOf(slot("l1", "mailbox")), /^Email: Checked, hello@/);
  assert.match(labelOf(slot("l2", "mailbox")), /^Email: Unconfirmed, /, "a catch-all server accepts anything, so the check cannot tell (S12)");
  assert.match(labelOf(slot("l3", "mailbox")), /^Email: Unconfirmed, /);
  assert.match(tipOf(slot("l3", "mailbox")), /mail server wouldn't answer/, "the same shape as a catch-all, its own sentence in the tip");
  assert.ok(find(slot("l2", "mailbox"), (n) => /\bld-slot-shape\b/.test(String(n.props?.className || ""))), "the state is a shape as well as a word, never colour alone");
  assert.match(textOf(byTestId(rowOf(tree, "l4"), "lead-reach")), /Not checked/, "a left-out place's contacts were never checked, and the row says so");
  assert.match(labelOf(slot("l1", "phone")), /^Phone: Checked, \+1/, "Maps and their website agree on the number: Checked");
  assert.match(String(byTestId(rowOf(tree, "l4"), "lead-stage").props.className), /pl-col-off/, "Stage is a column off by default (D5): a row wears its state as a tag instead");
  assert.equal(textOf(find(tree, (n) => n.props?.className === "cl-table-foot")).startsWith("322 leads"), true, "the table calls its rows leads");
  assert.equal(textOf(byTestId(rowOf(tree, "l4"), "lead-sub")), "Chain", "Excluded's one line is the criterion that left it out, in the owner's words");
  assert.ok(byTestId(rowOf(tree, "l1"), "lead-photo"), "the tile is a button that expands the photo");
  // D6: the business own mark sits over the listing photo, so a mark that fails to load uncovers what is under it.
  const tile = byTestId(rowOf(tree, "l1"), "lead-photo");
  assert.deepEqual(all(tile, (n) => n.type === "img").map((n) => [n.props.className, n.props.src]), [["lg", "https://zilkerstrength.example/mark.png"]], "the mark, over the tint of its kind");
  assert.equal(all(byTestId(rowOf(tree, "l2"), "lead-photo"), (n) => n.type === "img").length, 0, "a lead with neither wears its initials, never a broken frame");
  assert.ok(byTestId(rowOf(tree, "l1"), "lead-card-name"), "the name's card is in the DOM, shown on hover");
});

// The first day is what every workspace opens Leads on, and it is what nothing drew: the component this file
// used to stub did not exist, so the scope threw "LeadsFirstDay is not defined" for anyone without a search.
test("with no search kept the first day stands where the table would, and claims only what this tab has read", () => {
  fresh({ leads: surface({ searches: [], rows: [], suggestions: SUGGESTIONS }) });
  const tree = draw();
  const fd = byTestId(tree, "leads-first-day");
  assert.ok(fd, "the first day is drawn");
  assert.equal(find(tree, (n) => n.type === "table"), null, "and the table is not: there is nothing to put in it");

  assert.deepEqual(
    all(fd, (n) => /^ld-way-[a-z]+$/.test(String(n.props?.["data-testid"] || ""))).map((n) => n.props["data-testid"]),
    ["ld-way-reach", "ld-way-calendar", "ld-way-yours"],
    "the three ways people arrive, People first",
  );
  assert.equal(byTestId(fd, "ld-way-status-reach"), null, "this tab never read the setup surface, so nothing says a number is live");
  assert.equal(byTestId(fd, "ld-way-status-calendar"), null, "and nothing says a calendar is connected");
  assert.match(textOf(byTestId(fd, "ld-way-reach")), /Set up your number/, "what it says instead is the door to set one up");

  assert.ok(byTestId(fd, "ld-sug-gym"), "the suggestion Claude wrote for this workspace is offered");
  assert.match(textOf(byTestId(fd, "ld-sug-gym")), /About 6 in 10 have an email/, "with how reachable that kind is, measured, never promised");
  assert.match(textOf(byTestId(fd, "ld-line")), /a personal training studio in Denver/, "and what they were written from");
  assert.ok(byTestId(fd, "ld-line-edit"), "with the one control that renews them");
  assert.match(textOf(byTestId(fd, "ld-first-day-foot")), /not people at home/, "the foot says what the finder does not do");
});

test("suggestions the page could not read say so, and the composer still works", () => {
  fresh({ leads: surface({ searches: [], rows: [], suggestions: null }) });
  const fd = byTestId(draw(), "leads-first-day");
  assert.ok(fd, "the first day is still drawn");
  assert.equal(textOf(byTestId(fd, "ld-sugs-note")), LEAD_WORDS.suggestUnavailable, "the space where they go says why it is empty");
  assert.equal(textOf(byTestId(fd, "ld-line")), "", "and nothing claims a business line that was never read");
  assert.equal(finders.length, 1, "the composer is drawn either way: the owner can still describe what they want");
});

test("a suggestion picked on the first day fills the composer, and the composer is inside the first day", () => {
  fresh({ leads: surface({ searches: [], rows: [], suggestions: SUGGESTIONS }) });
  let tree = draw();
  // The composer is a recorder here (globalThis.LeadFinder), so what this pins is that it is drawn once with
  // nobody having opened it -- on the first day it is part of the page, not a fold-out over an empty table.
  assert.equal(finders.length, 1, "the composer is drawn without the owner opening anything");
  find(byTestId(tree, "leads-first-day"), (n) => n.type === "button" && n.props?.className === "q").props.onClick();
  tree = draw();
  assert.equal(finders[finders.length - 1].words, "gyms in Denver", "the words land in the composer the owner then edits");
});

// D3: Needs review is a queue. Its head is one chip per thing that would resolve the leads in it; a chip selects
// them; the bar offers what resolves that selection and nothing else; a resolver whose courier is not installed
// is not drawn, so the bar never offers what the door cannot do.
test("Needs review is a workbench: the pile in the order to work it, the group's own leads as cards, one press per group, and what each press costs", async () => {
  fresh();
  let tree = draw({ leadsRoute: `leads:s-${SEARCH_A}:c-review` });
  const bench = byTestId(tree, "lead-bench");
  assert.ok(bench, "Needs review stops being a tab on a table");
  assert.equal(find(tree, (n) => n.type === "table"), null, "the table gives way to the bench: the pile is the work");
  const queue = all(byTestId(bench, "lead-bench-queue"), (n) => n.props?.role === "tab");
  assert.deepEqual(queue.map((q) => textOf(q)), ["1Their mail server wouldn't answerCheck again · Keep · Exclude"], "one row per thing that would resolve a pile, with its count and its acts in words");
  assert.equal(textOf(byTestId(bench, "bench-title")), "Their mail server wouldn't answer1");
  assert.match(textOf(byTestId(bench, "bench-why")), /^Their mail server did not answer the check/, "and a sentence saying what is true of every lead in it");
  assert.deepEqual(all(bench, (n) => n.props?.["data-testid"] === "lead-bench-card").map((c) => textOf(byTestId(c, "bench-card-name"))), ["Lamar Strength Co."], "the group's own leads, as cards");
  assert.equal(byTestId(bench, "bench-act-check_again"), null, "Check again waits for its courier (00145): nothing on the bench is a dead control");
  assert.ok(byTestId(bench, "bench-act-keep") && byTestId(bench, "bench-act-exclude"), "Keep and Exclude resolve a mail server that would not answer");
  assert.match(textOf(byTestId(bench, "bench-cost-keep")), /count against this month\. 1 of your 238 left\./, "what a press costs is the surface's own month, never a number the page made up");
  assert.match(textOf(byTestId(bench, "bench-asked")), /With a website/, "and what the search asked for, in the owner's own words");
  byTestId(bench, "bench-act-keep").props.onClick();
  await settle();
  assert.deepEqual(calls.at(-1), ["bulk", { by: "ids", action: "keep", ids: ["l3"], search_id: SEARCH_A }], "the bench's Keep is the same bulk door the bar presses");
  assert.equal(flashes.at(-1).msg, "Done.", "the door's own sentence is the flash");

  // With its courier, Check again draws on the bar with its count and its cost.
  globalThis.window.__leadCheckAgain = async (ids) => { calls.push(["check_again", ids]); return ok({ scheduled: ids.length, skipped: 0, toast: "Checking 1 again." }); };
  tree = draw({ leadsRoute: `leads:s-${SEARCH_A}:c-review` });
  assert.equal(textOf(byTestId(tree, "bench-act-check_again")), "Check again 1");
  assert.match(textOf(byTestId(tree, "bench-cost-check_again")), /About 1¢. Their answer lands here/, "the act, and what it costs, side by side");
  byTestId(tree, "bench-act-check_again").props.onClick();
  await settle();
  assert.deepEqual(calls.at(-1), ["check_again", ["l3"]]);
  assert.equal(flashes.at(-1).msg, "Checking 1 again.");
  delete globalThis.window.__leadCheckAgain;

  // A card's own Keep is the row's own door, one lead, as it is on a row.
  tree = draw({ leadsRoute: `leads:s-${SEARCH_A}:c-review` });
  byTestId(all(byTestId(tree, "lead-bench"), (n) => n.props?.["data-testid"] === "lead-bench-card")[0], "bench-card-keep").props.onClick({ stopPropagation() {} });
  await settle();
  assert.deepEqual(calls.at(-1), ["keep", { search_id: SEARCH_A, id: "l3" }]);

  fresh({ leads: surface({ rows: [] }) }); // the server answered the review view with nothing
  tree = draw({ leadsRoute: `leads:s-${SEARCH_A}:c-review` });
  assert.equal(byTestId(tree, "lead-bench"), null, "no pile, no bench");
  assert.match(textOf(tree), /Nothing needs a look./, "an empty queue says so");
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
  sortByHeading(tree, "Rated");
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
  sortByHeading(tree, "Rated");
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
  // A question or a draft holds it on its own lead (leadPeekFollows, Task 12). The question is armed the way the
  // owner arms it -- C dials the lead under the cursor from their own phone -- and asked when the tab is theirs
  // again (leadArmOnReturn, Task 13), never while they are away.
  press("c");
  draw();
  assert.equal(globalThis.window.location.href, "tel:+15125550102", "C dialled the lead the peek is showing");
  globalThis.window.dispatchEvent({ type: "focus" });
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

test("the peek is handed acts, not setters: every control it draws has a function behind it, and each one moves the page's own state", () => {
  fresh();
  draw();
  press("j");
  draw();
  press("Enter", { tagName: "TR", isContentEditable: false, closest: () => null });
  draw();
  const peek = peeks.at(-1);
  assert.equal(peek.vm.id, "l1", "the peek is open on the lead under the cursor");
  // What leads-peek.jsx reads off its props as `on.<name>`: the stage, Not a fit, Draft and its tones, Open in
  // your email, Copy, the two answers to "Did you send it?", the way back and the way out. Handed the page's raw
  // setters instead, every one of them is undefined -- a pane of dead controls that the peek's own unit tests
  // never see, because those build the acts themselves and this page did not.
  const dead = ["onStage", "onNotAFit", "onWhy", "onDraft", "onTone", "onOpenMail", "onCopyDraft", "onSaidSent", "onNotYet", "onOutcome", "onNote", "onSaveCall", "onCancelCall", "onBack", "onClose", "onKeep", "onExclude", "onPutBack", "onCopy", "onCall"]
    .filter((k) => typeof peek[k] !== "function");
  assert.deepEqual(dead, [], "every act the peek draws a control for");
  // And they are built from the page's own state, not from any function that would do: Not a fit turns the
  // peek's pane, and the way back brings it home.
  peek.onNotAFit();
  draw();
  assert.equal(peeks.at(-1).mode, "why", "an act writes the page's own peekMode");
  peeks.at(-1).onBack();
  draw();
  assert.equal(peeks.at(-1).mode, "info");
  // The setters are what the acts were built from; the peek is not handed them.
  assert.deepEqual(["onMode", "onArmed", "onDraftState", "onPeekId"].filter((k) => peek[k] !== undefined), [], "the acts, not the setters");
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
  tree = draw();
  assert.equal(byTestId(tree, "peek-why").props.role, "menu", "the same five whys the peek asks, asked once for the whole selection");
  click(byTestId(tree, "peek-why-chain"));
  await settle();
  assert.deepEqual(calls.at(-1), ["bulk", { by: "view", action: "not_a_fit", view: { list: "all", sort: "fit", dir: "asc" } }], "the view's filters go to the server, never 1,240 ids");
  assert.equal(byTestId(draw(), "peek-why"), null, "the list closes on the pick");
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
  assert.deepEqual(all(byTestId(tree, "lead-classes"), (n) => n.props?.role === "tab").map((n) => [textOf(n).trim(), n.props["aria-selected"]]), [["2 qualified", false], ["1 needs a look", false], ["1 left out", true]], "the three classes, each a view of the search");
});

/* --------------------------------- a search, kept --------------------------------- */

const menuOf = (name) => menus.find((m) => m.title === `What ${name} asked for`);

test("a kept search's menu says what was asked and when, and offers Rename, Find new ones, Search again, Export and Remove", async () => {
  fresh();
  draw();
  const m = menuOf("Personal trainers · Austin");
  assert.ok(m, "every search on the rail has its menu");
  assert.deepEqual(m.items.map((i) => i.header || i.label || "—"), [
    "You asked on Sep 18: “personal trainers in Austin with a website, about 200”.",
    "Rename",
    "Find new ones",
    "Search again, changed",
    "Export these 161",
    "—",
    "Remove this search",
  ]);
  assert.equal(m.items.find((i) => i.label === "Find new ones").meta, "Only places not already in your leads count");
  assert.equal(m.items.find((i) => i.label === "Remove this search").meta, "Keeps the ones you contacted or are talking to.");
  m.items.find((i) => i.label === "Find new ones").onClick();
  await settle();
  assert.deepEqual(calls.at(-1), ["more_round", { id: SEARCH_A, purpose: "renew", plan: search().plan }], "the same plan, a new round");
  assert.match(textOf(flashes.at(-1).msg), /Only places not already in your leads count/);
});

test("Search again, changed opens the plan with what was asked; Rename renames through its route; Remove is asked first, keeps the worked leads, and says so", async () => {
  fresh();
  draw();
  menuOf("Personal trainers · Austin").items.find((i) => i.label === "Search again, changed").onClick();
  draw();
  assert.deepEqual([finders.at(-1).stage, finders.at(-1).words, finders.at(-1).proposal.purpose], ["plan", "personal trainers in Austin with a website, about 200", "renew"]);
  // Rename happens where the search is: the rail's row becomes the box.
  fresh();
  draw();
  menuOf("Personal trainers · Austin").items.find((i) => i.label === "Rename").onClick();
  let tree = draw();
  byTestId(tree, "leads-rename-name").props.onKeyDown({ key: "Enter", target: { value: "Trainers, Austin" } });
  await settle();
  assert.deepEqual(calls.at(-1), ["rename", { id: SEARCH_A, name: "Trainers, Austin" }]);
  assert.equal(textOf(flashes.at(-1).msg), "Renamed to Trainers, Austin");
  // Remove asks once, where the search is.
  fresh();
  draw();
  menuOf("Personal trainers · Austin").items.find((i) => i.label === "Remove this search").onClick();
  draw();
  const asked = confirms.at(-1);
  assert.equal(asked.question, "Remove “Personal trainers · Austin”?");
  assert.equal(asked.detail, "Keeps the ones you contacted or are talking to.");
  await asked.onYes();
  assert.deepEqual(calls.at(-1), ["remove", { id: SEARCH_A }]);
  assert.equal(textOf(flashes.at(-1).msg), "Removed. The 18 you contacted or are talking to are kept.");
  assert.deepEqual(went.at(-1), "clients/leads", "the rail lost that row, so the view is every lead again");
});

test("Export these N is a link to the search's own view of the export route", () => {
  fresh();
  const m = menuOf("Personal trainers · Austin") || (draw(), menuOf("Personal trainers · Austin"));
  const href = globalThis.window.__href("GET leads/export", undefined, { search: SEARCH_A, list: "all", sort: "fit", dir: "asc" });
  assert.equal(href, `/api/v1/leads/export?search=${SEARCH_A}&list=all&sort=fit&dir=asc`);
  assert.ok(m.items.some((i) => i.label === "Export these 161"));
});

/* ------------------------------------- the phone ------------------------------------- */

const bar = (over = {}) => {
  cells = []; seq = 0;
  return globalThis.window.LeadsPhoneBar({
    scope: "leads", onScope() {}, listLabel: "All leads · 322", onLists() {}, listsOpen: false,
    q: "", onQ() {}, searchRef: { current: null }, onFind() {}, canFind: true, ...over,
  });
};

test("on a phone the switch, search and Find are one bar, and the switch is a tablist with Leads chosen", () => {
  fresh();
  const t = bar();
  const tabs = all(t, (n) => n.props?.role === "tab");
  assert.deepEqual(tabs.map((n) => [textOf(n), n.props["aria-selected"]]), [["People", false], ["Leads", true]]);
  assert.equal(byTestId(t, "leads-phone-search").props["aria-label"], "Search leads");
  assert.equal(byTestId(t, "leads-phone-find").props["aria-label"], "Find leads");
  assert.equal(textOf(byTestId(t, "leads-phone-lists")), "All leads · 322");
  assert.equal(all(t, (n) => n.props?.["data-testid"] === "leads-phone-bar").length, 1, "one bar, not a row of controls");
});

test("Find on a phone is the gate's for anyone who may not find", () => {
  fresh({ role: "operator" });
  const t = bar({ canFind: false });
  assert.equal(byTestId(t, "leads-phone-find").props["aria-disabled"], true);
  assert.equal(byTestId(t, "leads-phone-find").props["aria-description"], "Only an owner can find businesses for you.");
});

test("the finder's sheet is the page's own dialog and registers no listener of its own", () => {
  fresh();
  cells = []; seq = 0;
  const before = seq;
  const t = globalThis.window.LeadFinderSheet({ onClose() {}, children: globalThis.React.createElement("div", { "data-testid": "hold-to-talk" }, "Hold to talk, or type") });
  assert.equal(seq, before, "hookless: the page's listener owns Esc, and a second one would take the key twice");
  const sheet = byTestId(t, "leads-finder-sheet");
  assert.equal(sheet.props.role, "dialog");
  assert.ok(sheet.props.className.includes("pl-finder"), "PL_OVERLAY names .pl-finder as the page's own");
  assert.ok(byTestId(t, "hold-to-talk"), "the first control in the sheet is the one the page put first");
});

test("at a phone's width the page draws the bar instead of the rail and the controls, and nothing else above the rows", () => {
  fresh();
  globalThis.__phone = true;
  const t = draw({ leadsRoute: `leads:s-${SEARCH_A}` });
  assert.ok(byTestId(t, "leads-phone-bar"), "one bar");
  assert.equal(all(t, (n) => n.props?.className === "cl-controls").length, 0, "no controls row above the rows");
  assert.equal(all(t, (n) => n.props?.className === "cl-rail").length, 0, "no rail");
  assert.equal(all(t, (n) => n.props?.["data-testid"] === "leads-standing").length, 0, "and no standing line: a phone shows the work first");
  const above = all(t, (n) => n.props?.["data-testid"] === "leads-phone-bar" || n.type === globalThis.LeadStrip || /\bpl-table-wrap\b/.test(String(n.props?.className || "")));
  assert.deepEqual(above.map((n) => n.props["data-testid"] || (n.type === globalThis.LeadStrip ? "lead-strip" : "table")), ["leads-phone-bar", "lead-strip", "table"], "the bar, the strip, the work");
  globalThis.__phone = false;
});

/* ------------------------------- the strip's controls ------------------------------- */

const running = (over = {}) => ({ ...search(), round: { ...search().round, state: "running", ending: null, ended_at: null, undo_op_id: null, undo_version: null, counted: 12, question: null, ...over } });

test("the strip above the table is a component that exists, with a view model behind it and one seam back to the page", () => {
  fresh();
  assert.equal(typeof globalThis.window.LeadStrip, "function", "leads-scope.jsx draws <LeadStrip/>: a name nothing declares throws the moment a search is opened");
  assert.equal(typeof globalThis.window.leadStrip, "function", "and what it says is a view model, never words the page spells");
  draw({ leadsRoute: `leads:s-${SEARCH_A}` });
  const s = strips.at(-1);
  assert.equal(s.vm.title, "Found 161 personal trainers", "the ended round's own sentence, from contracts");
  assert.deepEqual(s.vm.parts, ["88 you can email", "72 by phone", "1 left out"]);
  assert.equal(typeof s.onAction, "function", "one onAction, and it is the page's");
});

test("the running strip's Stop reaches the stop route, and the question's Yes and Stop here reach the answer route carrying no plan", async () => {
  fresh({ leads: surface({ searches: [running(), waiting] }) });
  draw({ leadsRoute: `leads:s-${SEARCH_A}` });
  const strip = strips.at(-1);
  assert.deepEqual(strip.vm.actions.map((a) => a.id), ["stop"], "a running round offers one thing to press");
  await strip.onAction("stop");
  await settle();
  assert.deepEqual(calls.at(-1), ["stop_search", { id: SEARCH_A }], "POST lead-searches/[id]/stop, and nothing else rides with it");
  assert.match(textOf(flashes.at(-1).msg), /still being checked/, "and the page says what is still happening, not that it is done");
  fresh();
  draw({ leadsRoute: `leads:s-${SEARCH_B}` });
  const q = strips.at(-1);
  assert.deepEqual(q.vm.actions.map((a) => a.id), ["keep", "include", "stop_here"]);
  await q.onAction("keep");
  await settle();
  assert.deepEqual(calls.at(-1), ["answer", { id: SEARCH_B, answer: "keep" }], "Keep carries no plan (PRD 7.2)");
  fresh();
  draw({ leadsRoute: `leads:s-${SEARCH_B}` });
  await strips.at(-1).onAction("stop_here");
  await settle();
  assert.deepEqual(calls.at(-1), ["answer", { id: SEARCH_B, answer: "stop" }]);
});

// The commit answers with the search it started (commit.ts, undo.search_id). The page used to leave the owner on All
// leads with a live dot in the rail and no strip: the receipt said "Leads shows it", and Leads did not.
test("approving a new plan lands on the search it started, where the strip is; a top-up stays where it is", async () => {
  fresh();
  const NEW = "3d1d5c1e-0000-4000-8000-00000000c0de";
  globalThis.window.__ask.commit = async () => ({ ok: true, receipt: "Finding 50 gyms.", undo: { search_id: NEW } });
  draw();
  press("f");
  draw();
  const f = finders.at(-1);
  assert.equal(f.open, true);
  // Ask answers the turn with a card, as the real loop does; the finder then approves it through the commit.
  const card = { id: "p-new", kind: "lead_search", needs: "owner", title: "Find 50 gyms", summary: "", payload: { plan: PLAN, view: { title: "Find 50 gyms" }, facts: null }, undo: "Stop the search" };
  globalThis.window.__ask.send = async (_req, on) => { on({ t: "final", message: { text: "", proposals: [card] } }); };
  await f.onPlan("50 gyms in Austin");
  await settle();
  draw();
  assert.equal(finders.at(-1).stage, "plan", "the card is up");
  await finders.at(-1).onApprove({ ...PLAN, count: 50 });
  await settle();
  assert.equal(went.at(-1), `clients/leads:s-${NEW}`, "straight to the new search, its strip and its classes");
  went.length = 0;
  draw({ leadsRoute: `leads:s-${SEARCH_B}` });
  strips.at(-1).onAction("include", "chain");
  draw({ leadsRoute: `leads:s-${SEARCH_B}` });
  await finders.at(-1).onApprove(finders.at(-1).plan);
  await settle();
  assert.ok(!went.some((w) => w.includes("clients/leads:s-")), "an answer on an open search does not move the owner off it");
});

test("Include opens the plan with that exclusion taken back and starts nothing; approving it answers with the version the owner saw", async () => {
  fresh();
  draw({ leadsRoute: `leads:s-${SEARCH_B}` });
  strips.at(-1).onAction("include", "chain");
  draw({ leadsRoute: `leads:s-${SEARCH_B}` });
  assert.deepEqual(calls.filter((c) => c[0] !== "view"), [], "a press starts nothing that costs: the owner approves the plan first");
  const f = finders.at(-1);
  assert.equal(f.stage, "plan");
  assert.deepEqual(f.plan.exclusions, [], "the thing it asked about is taken out of the plan");
  assert.equal(f.plan.version, 2, "which is a new version, and that is the one the route is given");
  await f.onApprove(f.plan);
  await settle();
  assert.deepEqual(calls.at(-1), ["answer", { id: SEARCH_B, answer: "include", plan: f.plan }]);
});

test("an ending's one next step opens the plan and starts nothing until it is approved; Sort by fit and the new ones go to the surface", async () => {
  const justNow = new Date(Date.now() - 60_000).toISOString();
  const done = { ...search(), round: { ...search().round, state: "ended", ending: "stopped", counted: 61, ended_at: justNow, undo_op_id: null, undo_version: null } };
  fresh({ leads: surface({ searches: [done, waiting] }) });
  draw({ leadsRoute: `leads:s-${SEARCH_A}` });
  const s = strips.at(-1);
  assert.deepEqual(s.vm.actions.map((a) => a.id), ["carry_on", "review", "excluded"], "one next step, and the piles the ending's numbers open");
  s.onAction("carry_on", s.vm.actions[0].arg);
  draw({ leadsRoute: `leads:s-${SEARCH_A}` });
  assert.deepEqual(calls.filter((c) => c[0] !== "view"), [], "Carry on opens the plan; nothing runs until it is approved");
  assert.equal(finders.at(-1).stage, "plan");
  await finders.at(-1).onApprove(finders.at(-1).plan);
  await settle();
  assert.deepEqual(calls.at(-1), ["more_round", { id: SEARCH_A, purpose: "topup", plan: search().plan }], "and then it is POST lead-searches/[id]/more");
  fresh({ leads: surface({ searches: [done, waiting], offered: 12 }) });
  draw({ leadsRoute: `leads:s-${SEARCH_A}` });
  const off = strips.at(-1);
  assert.equal(off.vm.actions[0].label, "12 new", "what a refresh found is offered, never sorted in");
  await off.onAction("take_offered");
  await settle();
  assert.deepEqual(calls.at(-1), ["takeOffered", null], "the new ones are taken in the order they were read, on the owner's press");
  off.onAction("sort_fit");
  draw({ leadsRoute: `leads:s-${SEARCH_A}` });
  await settle();
  const view = calls.filter((c) => c[0] === "view").at(-1);
  assert.deepEqual([view[1].sort, view[1].dir], ["fit", "asc"], "Sort by fit is a new read of the same view, never a re-order of the rows on the page");
});

test("the search menu removes the untouched leads and credits the month, named for what it does, and its toast puts them back", async () => {
  const justNow = new Date(Date.now() - 60_000).toISOString();
  const done = { ...search(), round: { ...search().round, ended_at: justNow, undo_op_id: null, undo_version: null } };
  fresh({ leads: surface({ searches: [done, waiting] }) });
  draw({ leadsRoute: `leads:s-${SEARCH_A}` });
  // Not on the strip: an "Undo" beside "the 61 found are yours" read as deleting what was just paid for.
  assert.ok(!strips.at(-1).vm.actions.some((a) => a.id === "undo"), "the strip carries the ending and its next step, never a control that removes leads");
  const menu = menus.find((m) => m.title === `What ${done.name} asked for`);
  const item = menu.items.find((i) => i.label === "Remove the ones you haven't touched");
  assert.ok(item, "the menu names what it removes");
  assert.match(item.meta, /given back this month/);
  const waitingMenu = menus.find((m) => m.title === `What ${waiting.name} asked for`);
  assert.ok(!waitingMenu.items.some((i) => i.label === "Remove the ones you haven't touched"), "a round still running has nothing to remove yet");
  item.onClick();
  await settle();
  assert.deepEqual(calls.at(-1), ["search_undo", { id: SEARCH_A }]);
  assert.equal(textOf(flashes.at(-1).msg), "Removed 160 · 160 given back");
  await flashes.at(-1).undo();
  assert.deepEqual(calls.at(-1), ["undo", { op: "op-u", version: 2 }], "the toast's own Undo names the operation and the version it saw");
});

/* ------------------------------------ hold to talk ------------------------------------ */

test("the composer's mic is held to talk: it fills the input with what the browser heard, and uploads nothing", () => {
  fresh();
  draw();
  press("f");
  draw();
  const talk = finders.at(-1).talk;
  assert.ok(talk && talk.canTalk, "a browser with a recogniser is offered the mic; `talk: null` offers nothing");
  talk.start({ preventDefault() {} });
  draw();
  assert.equal(recs.length, 1, "press starts the browser's own recogniser");
  assert.deepEqual([recs[0].interimResults, recs[0].continuous, recs[0].started], [true, true, 1]);
  recs[0].onresult({ results: [{ isFinal: false, 0: { transcript: "wedding planners" } }] });
  draw();
  assert.equal(finders.at(-1).words, "wedding planners", "interim words land in the input as they come");
  recs[0].onresult({ results: [{ isFinal: true, 0: { transcript: "wedding planners around Austin" } }] });
  talk.stop();
  assert.equal(recs[0].stopped, 1, "release stops the recogniser; nothing is left listening");
  recs[0].onend();
  draw();
  assert.equal(finders.at(-1).words, "wedding planners around Austin", "and what was finally heard is what stays there");
  assert.equal(finders.at(-1).stage, "compose", "releasing the mic plans nothing and starts nothing: the owner still presses Plan it");
  assert.deepEqual(uploads, [], "nothing recorded and nothing sent: no fetch, no getUserMedia, no MediaRecorder, no Ask turn");
  assert.deepEqual(calls.filter((c) => c[0] !== "view"), [], "and no route was called: holding the mic asks nothing and starts nothing");
});

test("with no recogniser there is no mic, and a page drawn without Ask's hooks keeps one hook order", () => {
  fresh();
  draw();
  press("f");
  draw();
  const SR = globalThis.window.SpeechRecognition;
  const H = globalThis.window.AskHooks;
  try {
    delete globalThis.window.SpeechRecognition;
    fresh();
    draw();
    press("f");
    draw();
    assert.equal(finders.at(-1).talk.canTalk, false, "a browser that cannot hear is offered nothing");
    fresh();
    draw();
    const withHooks = seq;
    delete globalThis.window.AskHooks;
    fresh();
    const tree = draw();
    assert.equal(seq, withHooks, "the stand-in declares the same hooks, so the page's one call order does not move");
    assert.ok(byTestId(tree, "leads-standing"), "and the page still draws");
  } finally {
    globalThis.window.SpeechRecognition = SR;
    globalThis.window.AskHooks = H;
  }
});

// D5: every fact on this page is about a place, so the leads can be looked at as places. The picture is made from
// what the search already found -- no tile, and no request to anybody.
test("D5: the same leads, on the ground — a pin per lead the source placed, the pile beside it, and a wider search one press away", async () => {
  fresh();
  const at = () => draw({ leadsRoute: `leads:s-${SEARCH_A}` });
  let tree = at();
  assert.equal(byTestId(tree, "lead-map"), null, "a page opens on the rows");
  click(byTestId(tree, "leads-map-toggle"));
  tree = at();
  const map = byTestId(tree, "lead-map");
  assert.ok(map, "the map stands where the table stood");
  assert.equal(find(tree, (n) => n.type === "table"), null);
  const pins = all(map, (n) => /^lead-pin-/.test(String(n.props?.["data-testid"] || "")));
  assert.deepEqual(pins.map((p) => p.props["data-testid"]), ["lead-pin-l1", "lead-pin-l2", "lead-pin-l3", "lead-pin-l4", "lead-pin-l5"], "one pin per lead the source placed");
  assert.equal(textOf(byTestId(map, "lead-map-count")), "5 on the map");
  assert.match(textOf(byTestId(map, "lead-map-scale")), /mi across$/, "how wide the square is, in the owner's own unit");
  assert.equal(byTestId(map, "lead-map-ring"), null, "this search named a city and no centre yet, so no area is drawn");
  // One search is open and its plan never measured a centre, so there is no ring: the line says that, instead of
  // "these searches", which was the wording for a mixed list and read as though several were on screen.
  assert.equal(textOf(byTestId(map, "lead-map-note")), "Where this search's leads are. It never measured a centre, so there is no area to draw.");
  assert.equal(byTestId(map, "lead-map-toowide"), null, "one city's leads are one place, so the square is drawn");
  assert.equal(all(map, (n) => n.props?.["data-testid"] === "lead-map-row").length, 5, "the same leads beside it, nearest the middle first");
  assert.match(pins[0].props["aria-label"], /^Zilker Strength Lab — /, "a pin says who it is and what it is");
  assert.match(String(pins[0].props.className), /tone-ok/, "coloured by fit, to start: a strong fit is a good outcome, in the registry's own tone");
  assert.doesNotMatch(String(pins[0].props.className), /is-out/, "a qualified lead stands at full strength");
  assert.match(String(pins[4].props.className), /is-out/, "a lead that was left out steps back, as its row does");

  pins[0].props.onMouseEnter();
  tree = at();
  assert.match(textOf(byTestId(tree, "lead-map-card")), /Zilker Strength Lab/, "the pin under the pointer names itself");
  click(byTestId(tree, "map-by-reach"));
  tree = at();
  assert.match(String(byTestId(tree, "lead-pin-l1").props.className), /tone-ok/, "coloured by reach: a checked mailbox and a number two sources agree on");
  assert.match(String(byTestId(tree, "lead-pin-l5").props.className), /tone-warn/, "and one with only a number is part-way there, which is worth a look");
  // It is still left out. Stepping back used to ride a word only two of the three colourings used (`out`), so an
  // excluded lead came back to full strength the moment the map was coloured by reach. It follows the row now.
  assert.match(String(byTestId(tree, "lead-pin-l5").props.className), /is-out/, "left out in every colouring, not in whichever uses the word");

  click(byTestId(tree, "lead-pin-l1"));
  tree = at();
  assert.equal(peeks.at(-1).vm.id, "l1", "a pin opens its lead, as a row does");

  click(byTestId(tree, "map-widen"));
  tree = at();
  assert.deepEqual([finders.at(-1).stage, finders.at(-1).plan.area.radius_m], ["plan", 50000], "Search wider opens the plan with twice the ground, and starts nothing until it is approved");
  click(byTestId(tree, "leads-map-toggle"));
  tree = at();
  assert.equal(byTestId(tree, "lead-map"), null, "and the rows come back");
});

// The row's two tags and its Stage column are the app's one StatePill, on the registry's tones. They were a
// hand-styled family of their own (.ld-state-tag, .ld-fit-tag, .ld-dot), and a Contacted tag drew grey while its
// dot, its pin and tone.ts all said info. No test ever drew a fit tag: the fixture search publishes no fits, so
// leadBand never called them mixed. Here a real row in every state is drawn through the whole page.
test("a lead's state and fit are the one StatePill, in the registry's tones -- and Contacted is info, as its dot and its pin are", () => {
  const vm = (over) => toLeadRowVM(leadRow(over), TZ, NOW);
  const rows = [
    vm({ id: "p1", place_id: "ChIJpill1", business_name: "Ready Gym" }),
    vm({ id: "p2", place_id: "ChIJpill2", business_name: "Contacted Gym", stage: "nurture", contacted_at: minsAgo(120) }),
    vm({ id: "p3", place_id: "ChIJpill3", business_name: "Talking Gym", stage: "converted" }),
    vm({ id: "p4", place_id: "ChIJpill4", business_name: "Review Gym", member: member({ class: "review", fit: "look", reason: "Couldn't check the email" }) }),
    vm({ id: "p5", place_id: "ChIJpill5", business_name: "Said No Gym", stage: "archived", closed_reason: "said_no" }),
    vm({ id: "p6", place_id: "ChIJpill6", business_name: "Chain Gym", member: member({ class: "excluded", fit: null, reason: "A chain with 40 locations", excluded_by: "chain" }) }),
    vm({ id: "p7", place_id: "ChIJpill7", business_name: "Maybe Gym", member: member({ fit: "look", reason: "Might be a franchise" }) }),
  ];
  // A search whose fits differ, which is the only time a row wears its fit at all (leadBand's `mixed`).
  const open = { ...search(), round: { ...search().round, fits: { strong: 5, look: 2, long: 0 } } };
  fresh({ leads: surface({ searches: [open], rows }) });
  const tree = draw({ leadsRoute: `leads:s-${SEARCH_A}` });
  const cls = (n) => String(n?.props?.className || "");
  const tagOf = (id, testid) => byTestId(rowOf(tree, id), testid);

  assert.equal(tagOf("p1", "lead-state-tag"), null, "Ready is the silent default and wears no tag");
  for (const [id, tone] of [["p2", "info"], ["p3", "ok"], ["p4", "warn"]]) {
    const tag = tagOf(id, "lead-state-tag");
    assert.equal(cls(tag), `pill pill-${tone}`, `${id}: the shared pill, in the registry's tone`);
    assert.equal(textOf(tag), rows.find((r) => r.id === id).stateTag, `${id}: saying the row's own words`);
  }
  assert.match(textOf(tagOf("p2", "lead-state-tag")), /^Contacted · /, "and Contacted still says how long ago");
  for (const id of ["p5", "p6"]) assert.equal(cls(tagOf(id, "lead-state-tag")), "pill", `${id}: out is plain, so its pill carries no tone`);

  assert.equal(cls(tagOf("p1", "lead-fit-tag")), "pill pill-ok", "a strong fit is a good outcome, not an urgent one");
  assert.equal(cls(tagOf("p7", "lead-fit-tag")), "pill", "a look is plain");
  assert.equal(textOf(tagOf("p7", "lead-fit-tag")), rows.find((r) => r.id === "p7").fitLabel);

  // The Stage column, off by default but drawn: People's State column is this same pill.
  const stage = (id) => find(tagOf(id, "lead-stage"), (n) => cls(n).split(" ").includes("pill"));
  assert.deepEqual(["p1", "p2", "p3", "p5"].map((id) => cls(stage(id))), ["pill", "pill pill-info", "pill pill-ok", "pill"], "ready, contacted, talking, said no");
  assert.equal(stage("p6"), null, "a left-out lead has no stage to show");

  // And nothing of the private family is left to disagree with it.
  assert.equal(find(tree, (n) => cls(n).split(" ").some((c) => c === "ld-state-tag" || c === "ld-fit-tag" || c === "ld-dot")), null);
});

// What opens over the table must be seen whole. Three ways it was not, found on the live page (21 Sep):
//   the name card opened inside the pinned cell, and a pinned cell is sticky, so it is its own stacking context --
//   the next row's pinned cell painted straight over the card (clients.css raises the hovered one);
//   a card on the last row in view hung below the pane's bottom edge and lost 173px of itself;
//   and a search's menu in the rail opened rightward, past the rail's edge, and showed 51px of 194.
// CSS is verified against the real stylesheet over production; what is pinned here is the page's own part of it.
test("a pop hangs above its row when the room is there, every hover asks where it is, and a search's menu opens into the rail", () => {
  fresh();
  const tree = draw();
  const place = globalThis.window.ldPlacePop;
  assert.equal(typeof place, "function");

  // Every hover on a row asks, on the pointer arriving and on focus arriving alike.
  const row = rowOf(tree, "l1");
  const hovers = [
    byTestId(row, "lead-slot-phone"),
    byTestId(row, "lead-slot-mailbox"),
    find(row, (n) => /\bcl-row-name-block\b/.test(String(n.props?.className || ""))),
    byTestId(row, "lead-rated"),
    byTestId(row, "lead-found"),
  ];
  for (const h of hovers) {
    assert.ok(h, "each hover is drawn");
    assert.match(String(h.props.className), /\bld-hover\b/);
    assert.equal(h.props.onMouseEnter, place, `${h.props["data-testid"] || h.props.className}: asks on the pointer`);
    assert.equal(h.props.onFocus, place, "and on focus, so a keyboard gets the same placement");
  }

  // The arithmetic, on elements that answer the questions a browser's would. The pane runs 100..700 with a 39px
  // header stuck to its top; a card needs 250px below its row and a tip 56.
  const el = ({ top, bottom, card }) => {
    const classes = new Set();
    const pane = { getBoundingClientRect: () => ({ top: 100, bottom: 700 }), classList: { contains: (c) => c === "pl-table-scroll" }, querySelector: (s) => (s === "thead" ? { offsetHeight: 39 } : null) };
    return {
      getBoundingClientRect: () => ({ top, bottom }),
      closest: (s) => (s === ".pl-table-scroll" ? pane : null),
      querySelector: (s) => (card && s === ":scope > .ld-card" ? {} : null),
      classList: { toggle: (c, on) => (on ? classes.add(c) : classes.delete(c)), has: (c) => classes.has(c) },
    };
  };
  const up = (spec) => { const target = el(spec); place({ currentTarget: target }); return target.classList.has("ld-up"); };
  assert.equal(up({ top: 150, bottom: 212, card: true }), false, "a card near the top has its room below");
  assert.equal(up({ top: 600, bottom: 662, card: true }), true, "a card on the last row in view hangs above it instead of being cut off");
  assert.equal(up({ top: 520, bottom: 582, card: true }), true, "118px below is not room for a card");
  assert.equal(up({ top: 520, bottom: 582, card: false }), false, "but it is room for a tip");
  assert.equal(up({ top: 140, bottom: 202, card: true }), false, "a row right under the header keeps its card below, where the room is");
  // A pop outside any pane, or an element that cannot be measured, is left where it hangs.
  const loose = { getBoundingClientRect: () => ({ top: 0, bottom: 10 }), closest: () => null, querySelector: () => null, classList: { toggle: () => { throw new Error("no pane, no change"); } } };
  place({ currentTarget: loose });
  place({ currentTarget: {} });
  place(null);

  // A search's menu escapes the rail it lives in (MoreMenu `escape`, placed against the window by moreFit): held
  // inside the rail it was 196px and broke its words onto three to six lines. It opens rightward, over the table.
  const menu = menus.find((m) => /^What .+ asked for$/.test(m.title || ""));
  assert.ok(menu, "a kept search has its menu");
  assert.equal(menu.escape, true, "it escapes the rail, so the rail's edge cannot cut it off or squeeze it");
  assert.equal(menu.align, "left", "hung from its trigger's left edge, so it opens over the table");
});
