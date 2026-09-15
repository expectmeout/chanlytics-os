/**
 * People: the list holds everyone, and says what it has.
 *
 * - A list, a count and a search covered the first thousand people the read returns, and every refresh dropped
 *   the rows Show more had added (the wiring audit's B7); past that, a search's matches from the server
 *   replaced the loaded rows, so a loaded person found by their last words vanished (B6).
 * - One failed read of the saved lists took the whole surface down: People, every profile and Lists (B27).
 * - A yes recorded for more than fifty went for fifty, and the rest were dropped without a word (B4).
 * - A list made on the rail closed with no word (B22); adding people to a list counted everyone selected,
 *   the ones already on it included, and could not be undone.
 * - Enter on a focused button opened the profile under the arrow keys' cursor instead of pressing it (B14).
 * Run against the surface over a fake wire, and the pages on a stub React whose effects re-run when their
 * inputs change.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { CONSENT_SOURCES, mayReceive, offersYesRefusal, stateOf, toPersonRowVM } from "@chanlytics/contracts";

const TID = "t-salon";
const ZONE = "America/New_York";
const H = 3_600_000;
const D = 24 * H;
const NOW = Date.now();
const iso = (ms) => new Date(NOW - ms).toISOString();

/** A person the People read returns, the shape people-vm.test.mjs pins (copied from broadcast-counts-are-whole.test.mjs). */
const row = (over = {}) => ({
  id: "c1", display_name: "Daniela R.", wa_profile_name: "Dani", phone_e164: "+17865550181",
  consent: "opted_in", consent_source: "in_person", consent_updated_at: iso(D),
  marketing_consent: "opted_in", marketing_consent_source: "in_person", marketing_consent_updated_at: iso(D),
  dnc: false, channels: ["whatsapp"], conversation_count: 1, escalation_count: 0, needs_human: false,
  open_escalation_reason: null, open_escalation_since: null, latest_conversation_id: "cv1", latest_state: "open",
  latest_paused_until: null, latest_assignee_user_id: null, latest_snooze_until: null,
  latest_wa_inbound_at: iso(2 * H), last_message_at: iso(2 * H), last_message_direction: "inbound", last_message_sender: "customer",
  last_inbound_text: "Can I move Saturday to 11?", last_inbound_at: iso(2 * H), last_call_at: null, call_count: 0, call_seconds: 0,
  first_contact_at: iso(60 * D), earliest_row_at: iso(60 * D), has_backfill: false, has_chat: true, queued_reply_at: null,
  ...over,
});
const person = (i, over = {}) => row({ id: `p${i}`, display_name: `Person ${i}`, wa_profile_name: null, phone_e164: `+1786555${1000 + i}`, latest_conversation_id: `cv${i}`, ...over });

/* ------------------------------- the window ------------------------------- */

const listeners = {};
const storage = () => { const m = new Map(); return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: (k) => m.delete(k) }; };
globalThis.localStorage = storage();
globalThis.sessionStorage = storage();
globalThis.document = {
  body: {},
  activeElement: null,
  addEventListener() {},
  removeEventListener() {},
  getElementById: () => null,
  createElement: () => ({ setAttribute() {}, style: {}, classList: { add() {}, remove() {} } }),
};
globalThis.window = {
  location: { pathname: "/w/salon", hash: "#/clients", origin: "https://app.chanlytics.com", assign() {}, replace() {}, reload() {} },
  history: { replaceState: (_s, _t, hash) => { globalThis.window.location.hash = hash; } },
  localStorage: globalThis.localStorage,
  sessionStorage: globalThis.sessionStorage,
  addEventListener: (type, fn) => { (listeners[type] ||= new Set()).add(fn); },
  removeEventListener: (type, fn) => { listeners[type]?.delete(fn); },
  dispatchEvent: (ev) => { for (const fn of [...(listeners[ev.type] || [])]) fn(ev); return true; },
  setTimeout: (fn, ms) => setTimeout(fn, ms),
  clearTimeout: (h) => clearTimeout(h),
  // The workspace, as its own surface publishes it: the rows say their times by its clock (legacy-bridge/zone.ts).
  __WORKSPACES: [{ id: TID, slug: "salon", name: "Salon", status: "active", timezone: ZONE }],
  __ACTIVE_WORKSPACE: TID,
};

const json = (status, body) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
const quietly = async (fn) => { const e = console.error; console.error = () => {}; try { return await fn(); } finally { console.error = e; } };
const { peopleOverride } = await quietly(() => import("../../../apps/dashboard/src/legacy-bridge/surface-data.ts"));
const { installClock } = await import("../../../apps/dashboard/src/legacy-bridge/zone.ts");
installClock();

/** Everyone over pages of `per`, the saved lists (or their read failing), and what a search answers. */
const wire = ({ people, per = 1000, lists = [], listsFail = false, search = null } = {}) => {
  const seen = { offsets: [], queries: [] };
  globalThis.window.fetch = async (url) => {
    const u = new URL(String(url), "https://app.chanlytics.com");
    if (u.pathname === "/api/v1/contacts") {
      const q = u.searchParams.get("q");
      if (q !== null) {
        seen.queries.push(q);
        const found = search ? search(q) : { people: [], total: 0, has_more: false };
        return json(200, { ok: true, data: { people: found.people, page: { q, offset: 0, limit: 1000, total: found.total, has_more: found.has_more }, calendar: { state: "none", source: "your calendar" }, booking_link: null } });
      }
      const offset = Number(u.searchParams.get("offset") || 0);
      seen.offsets.push(offset);
      return json(200, { ok: true, data: { people: people.slice(offset, offset + per), page: { q: null, offset, limit: per, total: people.length, has_more: offset + per < people.length }, calendar: { state: "none", source: "your calendar" }, booking_link: null } });
    }
    if (u.pathname === "/api/v1/segments") {
      return listsFail
        ? json(500, { ok: false, error: { code: "internal", message: "The lists could not be read." } })
        : json(200, { ok: true, data: { lists } });
    }
    if (u.pathname === "/api/v1/views") return json(200, { ok: true, data: { views: {} } });
    return json(404, { ok: false, error: { code: "not_found", message: `no ${u.pathname}` } });
  };
  return seen;
};

/* --------------------------- the surface, every page --------------------------- */

test("REGRESSION (B7): People reads every page before it counts -- a list, a count and a search covered the first thousand", async () => {
  const seen = wire({ people: [person(1), person(2), person(3)], per: 2, lists: [{ id: "s1", name: "Regulars", ids: ["p1", "p3"] }] });
  await peopleOverride.apply();
  const P = globalThis.window.__PEOPLE;
  assert.deepEqual(seen.offsets, [0, 2], "the second page was read before anything was counted");
  assert.equal(P.rows.length, 3, "REGRESSION: the rows were the first page, and a refresh put them back to it");
  assert.equal(P.saved.find((s) => s.id === "s1").count, 2, "REGRESSION: a saved list counted only the people on the first page");
  assert.equal(P.lists.find((l) => l.id === "opted_in").count, 3, "a smart list counts everyone");
  assert.equal(P.page.has_more, false, "nothing left to show more of");
});

test("past fifty pages the surface stops and says more follow, and a search answers with whether the server holds more matches than it sent", async () => {
  const seen = wire({
    people: Array.from({ length: 60 }, (_, i) => person(i)),
    per: 1,
    search: () => ({ people: [person(99, { display_name: "Rosa Far" })], total: 1400, has_more: true }),
  });
  await peopleOverride.apply();
  assert.equal(seen.offsets.length, 50, "a chain of pages that never ends cannot hang the surface");
  assert.equal(globalThis.window.__PEOPLE.page.has_more, true);
  const r = await globalThis.window.__peopleSearch("rosa");
  assert.deepEqual(r.rows.map((p) => p.id), ["p99"]);
  assert.equal(r.more, true, "the first thousand matches, and the page can say so");
});

test("REGRESSION (B27): a saved-lists read that fails leaves People standing and says so -- it took People, every profile and Lists down", async () => {
  wire({ people: [person(1)], listsFail: true });
  await quietly(() => peopleOverride.apply());
  const P = globalThis.window.__PEOPLE;
  assert.equal(P.rows.length, 1, "the people are there");
  assert.equal(P.savedRead, false);
  assert.deepEqual(P.saved, []);
  wire({ people: [person(1)], lists: [] });
  await peopleOverride.apply();
  assert.equal(globalThis.window.__PEOPLE.savedRead, true, "a read that lands, even of no lists, is read");
});

test("a saved list keeps every member the server holds, for an Undo, and counts only the people still here", async () => {
  wire({ people: [person(1)], lists: [{ id: "s1", name: "Regulars", ids: ["p1", "p-erased"] }] });
  await peopleOverride.apply();
  const s1 = globalThis.window.__PEOPLE.saved[0];
  assert.deepEqual([s1.count, s1.ids], [1, ["p1"]], "an erased person never counts");
  assert.deepEqual(s1.members, ["p1", "p-erased"], "who is on it, as the server keeps it");
});

/* ----------------------------------- the pages ----------------------------------- */

let cells = [];
let seq = 0;
const flashes = [];
const opened = [];
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
// Menus and questions as their props: the items are what these tests press, and a hookless stand-in keeps the stub's hook order.
globalThis.MoreMenu = () => null;
globalThis.Confirm = () => null;
globalThis.ChannelGlyph = () => null;
globalThis.useHotkey = () => {};
Object.assign(globalThis.window, {
  usePPToast: () => [null, (t) => flashes.push(t)],
  AttnRow: () => null,
  CHANLY: { nav: (to) => went.push(to), R: { thread: (id) => `inbox/${id}`, segment: (id) => `segments/${id}` } },
  __chrome: { state: stateOf },
  __ME: { role: "owner" },
  __consentSources: CONSENT_SOURCES,
  __offersYesSources: CONSENT_SOURCES.filter((s) => offersYesRefusal(s.id) === null),
  __mayReceive: mayReceive,
});
await import("../../../apps/dashboard/src/legacy/pages/clients-a.jsx");
await import("../../../apps/dashboard/src/legacy/pages/client-profile.jsx");
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
const tick = () => new Promise((r) => setTimeout(r, 0));
const settle = async (n = 8) => { for (let i = 0; i < n; i += 1) await tick(); };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const lists = (over = {}) => ({ create: async () => ({ ok: false, message: "not here" }), rename: async () => ({ ok: true, data: {} }), remove: async () => ({ ok: true, data: {} }), add: async () => ({ ok: true, data: {} }), drop: async () => ({ ok: true, data: {} }), ...over });

/** People published by the real surface over the wire, and a page with nothing drawn yet. */
const freshPage = async ({ people, lists: saved = [], listsFail = false } = {}) => {
  wire({ people, lists: saved, listsFail });
  await quietly(() => peopleOverride.apply());
  cells = [];
  flashes.length = 0;
  opened.length = 0;
  for (const k of Object.keys(listeners)) delete listeners[k];
  globalThis.document.activeElement = null;
  globalThis.window.location.hash = "#/clients";
  delete globalThis.window.__setPersonConsentMany;
  globalThis.window.__lists = lists();
};
const draw = (props = {}) => { seq = 0; return globalThis.window.ClientsA({ onOpenProfile: (id) => opened.push(id), ...props }); };
/** A key as the window hears it, with focus on `target`; whether the page took it. */
const press = (key, target = null) => {
  globalThis.document.activeElement = target;
  let taken = false;
  for (const fn of [...(listeners.keydown || [])]) fn({ key, metaKey: false, ctrlKey: false, altKey: false, shiftKey: false, preventDefault() { taken = true; } });
  return taken;
};

test("REGRESSION (B14): Enter or Space on a focused button presses that button -- it opened the profile under the cursor instead", async () => {
  await freshPage({ people: [person(1), person(2)] });
  draw();
  press("ArrowDown");
  draw();
  const button = { tagName: "BUTTON", isContentEditable: false, closest: (sel) => (/\bbutton\b/.test(sel) ? {} : null) };
  assert.equal(press("Enter", button), false, "the button keeps its Enter");
  assert.deepEqual(opened, [], "REGRESSION: Enter on a focused button opened a profile");
  press(" ", button);
  assert.equal(byTestId(draw(), "bulk-bar"), null, "and Space on it selects nobody");
  const onRow = { tagName: "TR", isContentEditable: false, closest: () => null };
  assert.equal(press("Enter", onRow), true);
  assert.equal(opened.length, 1, "away from a button, Enter still opens the person under the cursor");
});

test("REGRESSION (B22): a list made on the rail says so and is the one shown -- the rail closed with no word", async () => {
  await freshPage({ people: [person(1)] });
  globalThis.window.__lists = lists({ create: async (name) => ({ ok: true, data: { id: "s9", name, ids: [] } }) });
  let tree = draw();
  const rail = find(tree, (n) => typeof n.props?.onCreateList === "function");
  const r = await rail.props.onCreateList("Regulars");
  assert.equal(r.ok, true, "the rail still hears the answer, to show a refusal where the name was typed");
  assert.ok(flashes.some((f) => textOf(f.msg).includes("Regulars")), `REGRESSION: nothing said the list was made: ${JSON.stringify(flashes.map((f) => textOf(f.msg)))}`);
  // The surface re-reads after the write; here the list arrives as the server keeps it.
  globalThis.window.__PEOPLE.saved = [{ id: "s9", name: "Regulars", count: 0, ids: [], members: [] }];
  tree = draw();
  const chip = byTestId(tree, "saved-filter");
  assert.ok(chip && textOf(chip).includes("Regulars"), "the new list is the one shown");
});

test("REGRESSION: adding people to a list counts who was added, and Undo takes only them off -- it counted everyone selected and could not be undone", async () => {
  await freshPage({ people: [person(1), person(2), person(3)], lists: [{ id: "s1", name: "Regulars", ids: ["p1"] }] });
  const calls = [];
  globalThis.window.__lists = lists({
    add: async (id, ids) => { calls.push(["add", id, ids]); return { ok: true, data: {} }; },
    drop: async (id, ids) => { calls.push(["drop", id, ids]); return { ok: true, data: {} }; },
  });
  let tree = draw();
  byTestId(tree, "select-all").props.onChange();
  tree = draw();
  const regulars = find(tree, (n) => n.props?.label === "Add to list").props.items.find((i) => i.label === "Regulars");
  await regulars.onClick();
  await settle();
  const toast = flashes.at(-1);
  assert.match(textOf(toast.msg), /^2 added to Regulars/, `REGRESSION: the count took in the person already on it: ${textOf(toast.msg)}`);
  assert.deepEqual(calls[0], ["add", "s1", ["p2", "p3"]]);
  assert.equal(typeof toast.undo, "function", "the add can be undone");
  await toast.undo();
  assert.deepEqual(calls[1], ["drop", "s1", ["p2", "p3"]], "Undo takes off only the people this added");
});

test("REGRESSION (B4): a yes recorded for more than fifty goes for fifty, says so, and keeps the rest selected -- the rest were dropped without a word", async () => {
  await freshPage({ people: Array.from({ length: 60 }, (_, i) => person(i)) });
  const sent = [];
  globalThis.window.__setPersonConsentMany = async (ids) => { sent.push(ids); return { ok: true, done: ids.length, failed: 0 }; };
  let tree = draw();
  byTestId(tree, "select-all").props.onChange();
  tree = draw();
  const way = find(tree, (n) => n.props?.label === "Record a yes").props.items.find((i) => i.label && !i.header);
  await way.onClick();
  await settle();
  assert.equal(sent[0].length, 50, "fifty went: the batch door takes fifty at a time");
  const said = textOf(flashes.at(-1).msg);
  assert.ok(said.includes("10 more still selected"), `REGRESSION: the ten past fifty were dropped without a word: ${said}`);
  tree = draw();
  assert.ok(textOf(byTestId(tree, "bulk-bar")).includes("10 selected"), "the ten stay selected, one press from the next fifty");
});

test("REGRESSION (B27): lists that could not be read say so on the rail, the profile and Lists, and the people stay", async () => {
  await freshPage({ people: [person(1)], listsFail: true });
  let tree = draw();
  assert.ok(byTestId(tree, "people-lists-failed"), "the rail's Saved section says the lists could not be read");
  assert.equal(all(tree, (n) => n.props?.["data-testid"] === "row-select").length, 1, "the people are drawn");
  byTestId(tree, "select-all").props.onChange();
  tree = draw();
  assert.deepEqual(
    find(tree, (n) => n.props?.label === "Add to list").props.items.map((i) => i.header || i.label),
    ["Your saved lists couldn't be read", "New list…"],
    "no list is offered that could not be read",
  );
  assert.equal(typeof globalThis.window.PersonLists, "function", "the profile's lists can be drawn on their own");
  cells = []; seq = 0;
  const onProfile = globalThis.window.PersonLists({ personId: "p1", canEdit: true, first: "Person", flash: () => {} });
  assert.ok(byTestId(onProfile, "person-lists-failed"), "the profile says so, instead of \"No lists yet\"");
  cells = []; seq = 0;
  const onLists = globalThis.window.SegmentsPage({});
  assert.ok(byTestId(onLists, "lists-saved-failed"), "and so does Lists");
});

test("REGRESSION (B6): past everyone loaded, a search keeps the loaded people its words match and says what it searched -- the server's matches replaced them", async () => {
  await freshPage({ people: [person(1, { last_inbound_text: "Can I book a trim on Saturday?" }), person(2, { last_inbound_text: "Thanks, see you then" })] });
  globalThis.window.__PEOPLE.page = { ...globalThis.window.__PEOPLE.page, total: 60000, has_more: true };
  const far = toPersonRowVM(person(99, { display_name: "Saturday Jones" }), ZONE, new Date());
  globalThis.window.__peopleSearch = async () => ({ rows: [far], more: false });
  let tree = draw();
  find(tree, (n) => n.type === "input" && /Search/.test(n.props?.placeholder || "")).props.onChange({ target: { value: "saturday" } });
  draw();
  await sleep(320);
  tree = draw();
  const names = all(tree, (n) => n.props?.["data-testid"] === "row-select").map((n) => n.props["aria-label"]);
  assert.ok(names.includes("Select Saturday Jones"), `the server's match is shown: ${names}`);
  assert.ok(names.includes("Select Person 1"), `REGRESSION: a loaded person matched by their last words vanished: ${names}`);
  assert.match(textOf(byTestId(tree, "people-more")), /names and numbers searched across everyone/);
  assert.ok(textOf(tree).includes("Showing 2 of 60000"), "the foot counts against everyone, not the rows in hand");

  globalThis.window.__peopleSearch = async () => { throw new Error("That search is too long."); };
  find(tree, (n) => n.type === "input" && /Search/.test(n.props?.placeholder || "")).props.onChange({ target: { value: "saturday!" } });
  draw();
  await sleep(320);
  tree = draw();
  assert.match(textOf(byTestId(tree, "people-more")), /couldn't search past/, "a search that could not ask the server says so");
});
