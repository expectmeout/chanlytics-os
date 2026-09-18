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
import { CONSENT_SOURCES, SHORTCUTS, mayReceive, offersYesRefusal, shortcutGroups, stateOf, toPersonRowVM } from "@chanlytics/contracts";

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
/**
 * What is open over the page, as document.querySelector finds it: nothing, unless a test opens a menu or a dialog
 * ({ role }) in the app, or one outside it ({ role, inApp: false }), as a browser extension can add and hide. With
 * `className`, it carries those classes, and a selector that says `:not(.x)` of one of them leaves it out.
 */
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
  // A selector's part finds the open element when it names its role, and, for one outside the app, asks for no
  // .app-root; unless the part leaves out a class the element carries.
  querySelector: (sel) => (overlayOpen && sel.split(",").some((part) => part.includes(`[role="${overlayOpen.role}"]`) && (overlayOpen.inApp !== false || !part.includes(".app-root")) && !String(overlayOpen.className || "").split(/\s+/).some((c) => c && part.includes(`:not(.${c})`))) ? overlayOpen : null),
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
// The bridge's own save, for a test that goes through it over the wire rather than a stand-in.
const { saveView } = await import("../../../apps/dashboard/src/legacy-bridge/people-detail.ts");

/** Everyone over pages of `per`, the saved lists (or their read failing), what a search answers, the calendar's state, the member's saved views and the booking link on file; a view saved lands in `viewSaves`. */
const wire = ({ people, per = 1000, lists = [], listsFail = false, search = null, calendar = "none", views = {}, bookingLink = null } = {}) => {
  const seen = { offsets: [], queries: [], viewSaves: [] };
  const cal = { state: calendar, source: calendar === "ok" ? "Google Calendar" : "your calendar" };
  globalThis.window.fetch = async (url, init = {}) => {
    const u = new URL(String(url), "https://app.chanlytics.com");
    const saving = u.pathname.match(/^\/api\/v1\/views\/([^/]+)$/);
    if (saving && init.method === "PUT") {
      const { view } = JSON.parse(init.body);
      seen.viewSaves.push({ page: saving[1], view });
      return json(200, { ok: true, data: { views: { ...views, [saving[1]]: view } } });
    }
    if (u.pathname === "/api/v1/contacts") {
      const q = u.searchParams.get("q");
      if (q !== null) {
        seen.queries.push(q);
        const found = search ? search(q) : { people: [], total: 0, has_more: false };
        return json(200, { ok: true, data: { people: found.people, page: { q, offset: 0, limit: 1000, total: found.total, has_more: found.has_more }, calendar: cal, booking_link: bookingLink } });
      }
      const offset = Number(u.searchParams.get("offset") || 0);
      seen.offsets.push(offset);
      return json(200, { ok: true, data: { people: people.slice(offset, offset + per), page: { q: null, offset, limit: per, total: people.length, has_more: offset + per < people.length }, calendar: cal, booking_link: bookingLink } });
    }
    if (u.pathname === "/api/v1/segments") {
      return listsFail
        ? json(500, { ok: false, error: { code: "internal", message: "The lists could not be read." } })
        : json(200, { ok: true, data: { lists } });
    }
    if (u.pathname === "/api/v1/views") return json(200, { ok: true, data: { views } });
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
  cloneElement: (el, props) => ({ ...el, props: { ...el.props, ...props } }),
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
// The shell's ? sheet, whose Esc is heard before People's.
await import("../../../apps/dashboard/src/legacy/components/shortcuts.jsx");

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

/** People published by the real surface over the wire, and a page with nothing drawn yet: no view remembered on this device and none saved over the wire, unless a test gives one. What the wire saw. */
const freshPage = async ({ people, lists: saved = [], listsFail = false, calendar = "none", views = {}, bookingLink = null } = {}) => {
  const seen = wire({ people, lists: saved, listsFail, calendar, views, bookingLink });
  await quietly(() => peopleOverride.apply());
  cells = [];
  flashes.length = 0;
  opened.length = 0;
  for (const k of Object.keys(listeners)) delete listeners[k];
  globalThis.document.activeElement = null;
  overlayOpen = null;
  globalThis.window.location.hash = "#/clients";
  globalThis.localStorage.removeItem("chanlytics-people-view");
  delete globalThis.window.__saveView;
  delete globalThis.window.__setPersonConsentMany;
  globalThis.window.__lists = lists();
  return seen;
};
const draw = (props = {}) => { seq = 0; return globalThis.window.ClientsA({ onOpenProfile: (id) => opened.push(id), ...props }); };
/**
 * A key as the window hears it: pressed in `target`, where focus is unless `focus` says where it went (a field's own
 * Esc can close the field, and focus with it, before the window hears the key), with `mods`: ctrlKey, metaKey, altKey,
 * repeat, or defaultPrevented when a listener before the page's took the key. Whether the page took it.
 */
const press = (key, target = null, { focus = target, ...mods } = {}) => {
  globalThis.document.activeElement = focus;
  let taken = false;
  const ev = { key, target, metaKey: false, ctrlKey: false, altKey: false, shiftKey: false, repeat: false, defaultPrevented: false, ...mods, preventDefault() { taken = true; ev.defaultPrevented = true; } };
  for (const fn of [...(listeners.keydown || [])]) fn(ev);
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

test("REGRESSION: People opens on the people -- one line, then the table; a title, two sentences, four stat cards and a five-tab strip stood in front of them", async () => {
  await freshPage({
    people: [
      person(1, { needs_human: true, open_escalation_reason: "human_token", open_escalation_since: iso(3 * H), latest_state: "needs_human" }),
      person(2, { needs_human: true, open_escalation_reason: "callback", open_escalation_since: iso(H), latest_state: "needs_human" }),
      person(3),
    ],
  });
  let tree = draw();
  const cls = (n) => String(n.props?.className || "");

  // The one line: the count, who needs a person, and the week.
  const standing = byTestId(tree, "people-standing");
  assert.ok(standing, "the page opens on its one line");
  assert.match(textOf(standing), /3 people/);
  assert.match(textOf(standing), /2 need you/);

  // What stood in front of the table.
  assert.ok(!byTestId(tree, "attention-strip"), "REGRESSION: five tabs, three rows and a footer above the table");
  assert.ok(!byTestId(tree, "attention-tab-needs_you"), "REGRESSION: a tab counting what the rail and the rows already count");
  assert.ok(!find(tree, (n) => cls(n).includes("cl-head-stats")), "REGRESSION: four stat cards");
  assert.ok(!find(tree, (n) => cls(n).includes("cl-page-title")), "REGRESSION: a page title under a top bar that says People");
  const said = textOf(tree);
  assert.ok(!said.includes("The receptionist handles the routine"), "REGRESSION: the page explained itself on every visit");
  assert.ok(!said.includes("the strip above"), "REGRESSION: the page explained its own furniture");

  // The two who need a person are in the table, once, with their state on the row.
  const rows = all(tree, (n) => n.props?.["data-testid"] === "row-select").map((n) => n.props["aria-label"]);
  assert.deepEqual(rows.length, 3, `everyone is in the table: ${rows}`);
  assert.equal(rows.filter((r) => r === "Select Person 1").length, 1, "REGRESSION: the strip drew the table's own first rows over again");
  assert.ok(all(tree, (n) => n.props?.["data-testid"] === "row-state-detail").length >= 2, "each row says its own state");

  // The count in the line is the tap that shows them, because a phone has no rail.
  byTestId(tree, "people-standing-needs").props.onClick();
  tree = draw();
  assert.deepEqual(
    all(tree, (n) => n.props?.["data-testid"] === "row-select").map((n) => n.props["aria-label"]),
    ["Select Person 1", "Select Person 2"],
    "tapping the count shows the people it counts",
  );
  assert.equal(byTestId(tree, "people-standing-needs").props["aria-pressed"], true, "and says it is on");
  byTestId(tree, "people-standing-needs").props.onClick();
  tree = draw();
  assert.equal(all(tree, (n) => n.props?.["data-testid"] === "row-select").length, 3, "tapping again shows everyone");
});

test("a day nobody needs you says the count and the week, and offers no tap", async () => {
  await freshPage({ people: [person(1), person(2)] });
  const standing = byTestId(draw(), "people-standing");
  assert.match(textOf(standing), /2 people/);
  assert.ok(!textOf(standing).includes("need you"), "nothing claims your attention when nothing does");
  assert.ok(!byTestId(draw(), "people-standing-needs"), "and there is no button to press");
});

/* ------------------------------ the lists, on People (#563) ------------------------------ */

// A click, as a mouse gives it: `press` above is the keyboard.
const click = (node) => node.props.onClick({ stopPropagation() {}, preventDefault() {} });

test("a list kept by hand is the page's title when open, with its rename, its delete and its one door -- the Lists page held them over a second table of the same people", async () => {
  // Person 1 said yes to offers (the fixture's default); person 2 was never asked.
  await freshPage({ people: [person(1), person(2, { marketing_consent: "unknown", marketing_consent_source: null, marketing_consent_updated_at: null })], lists: [{ id: "s1", name: "Regulars", ids: ["p1", "p2"] }] });
  const calls = [];
  globalThis.window.__lists = lists({
    rename: async (id, name) => { calls.push(["rename", id, name]); return { ok: true, data: {} }; },
    drop: async (id, ids) => { calls.push(["drop", id, ids]); return { ok: true, data: {} }; },
  });
  let tree = draw({ initialSaved: "s1" });
  const title = byTestId(tree, "saved-filter");
  assert.ok(title && textOf(title).includes("Regulars"), "the list is the title");
  assert.ok(!all(tree, (n) => n.props?.className === "cl-section-title").some((n) => textOf(n) === "Everyone"), "REGRESSION: Everyone, with the list as a chip beside it");
  const step = byTestId(tree, "list-action");
  assert.ok(step, "a kept list has its one door, as a smart list has its step");
  assert.match(textOf(step), /1 of 2 on this list said yes to offers/, textOf(step));
  const cta = find(step, (n) => n.type === "button");
  assert.equal(textOf(cta).trim(), "Use in a broadcast");
  went.length = 0;
  click(cta);
  assert.deepEqual(went, ["broadcasts/s1"], "and it opens the composer on this list");
  // Renamed where the name is.
  click(byTestId(tree, "list-rename"));
  tree = draw({ initialSaved: "s1" });
  byTestId(tree, "list-rename-name").props.onChange({ target: { value: "VIP regulars" } });
  await byTestId(draw({ initialSaved: "s1" }), "list-rename-save").props.onClick();
  assert.deepEqual(calls, [["rename", "s1", "VIP regulars"]]);
  assert.ok(flashes.some((f) => textOf(f.msg).includes("VIP regulars")), "said");
  // One person off, from the row, with Undo.
  tree = draw({ initialSaved: "s1" });
  const drop = byTestId(tree, "row-drop-list");
  assert.ok(drop, "each row can leave the list");
  await drop.props.onClick();
  assert.deepEqual(calls.at(-1), ["drop", "s1", ["p1"]]);
  assert.ok(flashes.at(-1).undo, "and Undo puts them back");
  assert.ok(byTestId(tree, "delete-list"), "the delete on the same line");
  click(byTestId(tree, "show-everyone"));
  tree = draw({ initialSaved: "s1" });
  assert.ok(all(tree, (n) => n.props?.className === "cl-section-title").some((n) => textOf(n) === "Everyone"), "Show everyone");
  assert.equal(byTestId(tree, "row-drop-list"), null, "and nobody can be taken off a list that is not open");
});

test("on a phone the rail's lists are behind one tap on the standing line, as a sheet; a pick closes it, and New list opens the box in it", async () => {
  await freshPage({ people: [person(1)], lists: [{ id: "s1", name: "Regulars", ids: ["p1"] }] });
  let tree = draw();
  assert.equal(byTestId(tree, "people-lists-sheet"), null, "closed until asked");
  const pick = byTestId(tree, "people-lists-pick");
  assert.ok(pick && textOf(pick).includes("Lists"), "the standing line's way to the lists");
  click(pick);
  tree = draw();
  const sheet = byTestId(tree, "people-lists-sheet");
  assert.ok(sheet, "the sheet");
  assert.ok(find(sheet, (n) => n.type === "aside" && n.props?.className === "cl-rail"), "the same rail, drawn in the sheet as well");
  click(find(sheet, (n) => n.type === "button" && textOf(n).includes("Regulars")));
  tree = draw();
  assert.equal(byTestId(tree, "people-lists-sheet"), null, "a pick closes it");
  assert.ok(textOf(byTestId(tree, "saved-filter")).includes("Regulars"), "with the list open");
  assert.ok(textOf(byTestId(tree, "people-lists-pick")).includes("Regulars"), "and the line names it");
  // The shell's and a profile's New list: on a phone the sheet comes up with the box open.
  globalThis.window.matchMedia = () => ({ matches: true });
  try {
    globalThis.window.dispatchEvent(new CustomEvent("segments:new"));
    tree = draw();
    tree = draw();
    assert.ok(byTestId(tree, "people-lists-sheet"), "the sheet");
    assert.ok(byTestId(byTestId(tree, "people-lists-sheet"), "new-list-name"), "with the New list box open");
  } finally {
    delete globalThis.window.matchMedia;
  }
});

test("a list's own route lands on People with that list picked -- Playbooks' list, an answer's jump and a kept address still arrive", async () => {
  await freshPage({ people: [person(1)], lists: [{ id: "s1", name: "Regulars", ids: ["p1"] }] });
  const route = globalThis.window.__listRoute;
  assert.equal(route("s1"), "clients/list:s1", "a list kept by hand");
  assert.equal(route("needs_you"), "clients/seg:needs_you", "a smart list");
  assert.equal(route("gone"), "clients", "a list that is not here: People itself");
  assert.equal(route(null), "clients");
});

test("REGRESSION: on a list, the Offers column shows the answer about offers -- the Lists page showed the yes to messages under the Offers heading", async () => {
  await freshPage({ people: [person(1, { marketing_consent: "unknown", marketing_consent_source: null, marketing_consent_updated_at: null }), person(2)] });
  const tree = draw({ initialSegment: "opted_in" });
  const offers = all(tree, (n) => n.props?.["data-testid"] === "row-offers").map((td) => textOf(td).trim()).sort();
  assert.deepEqual(offers, ["Not asked", "Yes"], `the cells: ${offers}`);
});

test("a selection's yes on a sign-up form is recorded with the note that says which slips, and their own message is not offered for many", async () => {
  await freshPage({ people: [person(1), person(2)] });
  const sent = [];
  globalThis.window.__setPersonConsentMany = async (ids, body) => { sent.push(["visit", [...ids].sort(), body]); return { ok: true, done: ids.length, failed: 0 }; };
  globalThis.window.__setPersonMarketingConsentMany = async (ids, body) => { sent.push(["offers", [...ids].sort(), body]); return { ok: true, done: ids.length, failed: 0 }; };
  try {
    let tree = draw();
    byTestId(tree, "select-all").props.onChange();
    const menu = () => find(draw(), (n) => n.props?.label === "Record a yes");
    assert.deepEqual(
      menu().props.items.map((i) => i.header || i.label),
      ["Yes to messages about their visit…", "In person", "On the phone", "Sign-up form", "Yes to offers and news…", "Sign-up form"],
      "their own message names one message, so a selection is not offered it",
    );
    await menu().props.items.find((i) => i.label === "Sign-up form").onClick();
    tree = draw();
    assert.deepEqual(sent, [], "REGRESSION: thirty slips were recorded with nothing to say which");
    const note = byTestId(tree, "bulk-form-note");
    assert.ok(note, "the form asks which slips");
    assert.equal(byTestId(tree, "bulk-form-save").props.disabled, true, "and will not record without saying");
    note.props.onChange({ target: { value: "  slips from Saturday " } });
    tree = draw();
    await byTestId(tree, "bulk-form-save").props.onClick();
    await settle();
    assert.deepEqual(sent, [["visit", ["p1", "p2"], { consent: "opted_in", source: "form", note: "slips from Saturday" }]]);
    tree = draw();
    assert.equal(byTestId(tree, "bulk-form-note"), null, "the step closes once it lands");

    // Offers, by Enter; and Escape leaves without a word sent.
    await menu().props.items.filter((i) => i.label === "Sign-up form")[1].onClick();
    tree = draw();
    byTestId(tree, "bulk-form-note").props.onChange({ target: { value: "offers slips" } });
    tree = draw();
    byTestId(tree, "bulk-form-note").props.onKeyDown({ key: "Enter" });
    await settle();
    assert.deepEqual(sent.at(-1), ["offers", ["p1", "p2"], { consent: "opted_in", source: "form", note: "offers slips" }]);
    await menu().props.items.find((i) => i.label === "Sign-up form").onClick();
    tree = draw();
    byTestId(tree, "bulk-form-note").props.onKeyDown({ key: "Escape" });
    assert.equal(byTestId(draw(), "bulk-form-note"), null, "Escape closes the step");
    assert.equal(sent.length, 2, "and sends nothing");

    // The spoken ways still record at once, with the source and nothing else.
    await menu().props.items.find((i) => i.label === "In person").onClick();
    await settle();
    assert.deepEqual(sent.at(-1)[2], { consent: "opted_in", source: "in_person" });
  } finally {
    delete globalThis.window.__setPersonMarketingConsentMany;
  }
});

/* ------------------------- the table, drawn from its columns (Phase 0) ------------------------- */

/** Whether a member turned a column off: drawn, with a mark that only a desktop hides (pl-col-off). */
const colOff = (n) => /\bpl-col-off\b/.test(String(n.props?.className || ""));
/** The table's headings as a desktop shows them: those a member turned off, the checkbox's and the actions' empty ones left out, the sort arrow off. */
const headings = (tree) => all(tree, (n) => n.type === "th" && !colOff(n)).map((th) => textOf(th).replace(/[▲▼]/g, "").trim()).filter(Boolean);
/** A person's row, by their id. */
const rowOf = (tree, id) => find(tree, (n) => n.type === "tr" && n.props?.id === `person-${id}`);

test("the table's columns: Person, State, Last contact, the receptionist or, with a calendar, Visits, Offers, and Came from", async () => {
  // The headings a press sorts by, as the table marks them; and each body row's cells against the headings above them.
  const sorting = (tree) => all(tree, (n) => n.type === "th" && !colOff(n) && /\bsortable\b/.test(String(n.props?.className || ""))).map((th) => textOf(th).replace(/[▲▼]/g, "").trim());
  const oneCellPerHeading = (tree, why) => {
    const heads = all(find(tree, (n) => n.type === "thead"), (n) => n.type === "th").length;
    const rows = all(find(tree, (n) => n.type === "tbody"), (n) => n.type === "tr");
    assert.equal(rows.length, 2, "both people are rows");
    for (const tr of rows) assert.equal(tr.props.children.filter((k) => k && k.type === "td").length, heads, `${tr.props.id}: one cell under each heading, ${why}`);
  };
  await freshPage({ people: [person(1), person(2)] });
  let tree = draw();
  assert.deepEqual(headings(tree), ["Person", "State", "Last contact", "Receptionist", "Offers", "Came from"]);
  assert.deepEqual(sorting(tree), ["Person", "State", "Last contact", "Offers"], "the receptionist and where they came from never sort");
  oneCellPerHeading(tree, "without a calendar");
  await freshPage({ people: [person(1), person(2)], calendar: "ok" });
  tree = draw();
  assert.deepEqual(headings(tree), ["Person", "State", "Last contact", "Visits", "Offers", "Came from"], "with a calendar the outcome takes the receptionist's column");
  assert.deepEqual(sorting(tree), ["Person", "State", "Last contact", "Visits", "Offers"], "the visit sorts; where they came from never does");
  oneCellPerHeading(tree, "with a calendar");
});

test("a row says where the person came from, in words, and nothing when nothing is known", async () => {
  await freshPage({ people: [person(1, { came_from: "calendar" }), person(2, { came_from: "sms" }), person(3, { came_from: null }), person(4)] });
  const tree = draw();
  const said = (id) => textOf(byTestId(rowOf(tree, id), "row-came-from")).trim();
  assert.deepEqual(["p1", "p2", "p3", "p4"].map(said), ["Your calendar", "Text", "", ""], "and a row read before the column existed says nothing either");
  for (const id of ["p3", "p4"]) assert.ok(byTestId(rowOf(tree, id), "row-came-from"), `${id}: the cell is drawn, empty, so the row's cells stay under their headings`);
});

test("a row with a thread offers the booking link on file; with none on file, only the thread", async () => {
  await freshPage({ people: [person(1)], bookingLink: "https://booksy.com/salon" });
  assert.ok(byTestId(draw(), "row-booking-link"), "the workspace's link reaches the row");
  await freshPage({ people: [person(1)] });
  const tree = draw();
  assert.ok(byTestId(tree, "row-open-thread"), "the thread is one press away");
  assert.equal(byTestId(tree, "row-booking-link"), null, "and there is no link to offer");
});

test("the receptionist's word is beside the state whether or not its column shows, marked when it does, so a card never loses it", async () => {
  // A reply is queued, so the receptionist is not simply answering: it has a word to say. Person 2's is simply answering.
  const queued = person(1, { queued_reply_at: iso(H) });
  const stateCell = (tree, id) => find(rowOf(tree, id), (n) => n.type === "td" && /\bcl-state-cell\b/.test(String(n.props?.className || "")));
  const isMark = (n) => /\bcl-row-recept-mark\b/.test(String(n.props?.className || ""));
  const markOf = (tree) => find(stateCell(tree, "p1"), isMark);
  const inColumn = (mark) => /\bis-in-column\b/.test(String(mark.props.className));
  await freshPage({ people: [queued, person(2)] });
  const tree = draw();
  let mark = markOf(tree);
  assert.equal(mark && textOf(mark), "reply queued", "without a calendar the Receptionist column shows, and the word is beside the state too");
  assert.equal(inColumn(mark), true, "marked as said in its column, which the stylesheet leaves to say it where that column is on screen");
  assert.ok(stateCell(tree, "p2") && !find(stateCell(tree, "p2"), isMark), "a receptionist simply answering has no word beside the state");
  await freshPage({ people: [queued], calendar: "ok" });
  mark = markOf(draw());
  assert.equal(mark && textOf(mark), "reply queued", "with a calendar the Receptionist column is hidden, and the word is beside the state");
  assert.equal(inColumn(mark), false, "unmarked: this is where it is said");
});

test("REGRESSION: the keyboard is one listener for the page's life, and it walks the rows shown now -- it was taken down and added again on every draw", async () => {
  const needs = (i) => person(i, { needs_human: true, open_escalation_reason: "human_token", open_escalation_since: iso(H), latest_state: "needs_human" });
  await freshPage({ people: [needs(1), person(2), needs(3)] });
  draw();
  assert.equal(listeners.keydown?.size, 1, "one listener");
  const [only] = listeners.keydown;
  draw();
  byTestId(draw(), "people-standing-needs").props.onClick();
  draw();
  assert.equal(listeners.keydown.size, 1);
  assert.ok(listeners.keydown.has(only), "REGRESSION: a draw put a new listener in its place");
  press("j");
  press("j");
  const focused = find(draw(), (n) => n.type === "tr" && /\bfocused\b/.test(n.props?.className || ""));
  assert.equal(focused?.props.id, "person-p3", "two steps down the people who need you: Person 2 is not among them");
});

test("the keyboard: J/K and the arrows move, x and Space select, Enter opens, / searches, Esc clears the selection", async () => {
  await freshPage({ people: [person(1), person(2), person(3)] });
  const cursorOn = () => find(draw(), (n) => n.type === "tr" && /\bfocused\b/.test(n.props?.className || ""))?.props.id ?? null;
  draw();
  assert.equal(press("j"), true, "J is the page's");
  assert.equal(cursorOn(), "person-p1");
  press("ArrowDown");
  assert.equal(cursorOn(), "person-p2");
  press("k");
  assert.equal(cursorOn(), "person-p1");
  press("ArrowUp");
  assert.equal(cursorOn(), "person-p1", "the first row holds");
  press("J");
  press("j");
  press("ArrowDown");
  assert.equal(cursorOn(), "person-p3", "and so does the last");
  assert.equal(press("x"), true);
  let tree = draw();
  assert.match(textOf(byTestId(tree, "bulk-bar")), /1 selected/, "x selects the row under the cursor");
  assert.equal(rowOf(tree, "p3").props["aria-selected"], true, "and the row says it is selected");
  press("k");
  draw();
  press(" ");
  assert.match(textOf(byTestId(draw(), "bulk-bar")), /2 selected/, "Space selects too");
  assert.equal(press("Escape"), true);
  assert.equal(byTestId(draw(), "bulk-bar"), null, "Esc clears the selection");
  assert.equal(press("Enter", { tagName: "TR", isContentEditable: false, closest: () => null }), true);
  assert.deepEqual(opened, ["p2"], "Enter opens the person under the cursor");
  const box = find(draw(), (n) => n.type === "input" && /Search/.test(n.props?.placeholder || ""));
  let focusedSearch = 0;
  box.props.ref.current = { focus: () => { focusedSearch += 1; } };
  assert.equal(press("/"), true);
  assert.equal(focusedSearch, 1, "/ puts you in the search box");
  assert.equal(press("j", { tagName: "INPUT", type: "text", isContentEditable: false, closest: () => null }), false, "and a J typed there is a letter");
  assert.equal(press("j", { tagName: "INPUT", type: "checkbox", isContentEditable: false, closest: () => ({}) }), true, "a row's checkbox is not a place to type: after a click on one, J still walks");
});

/* ------------------------- the keys: where they were pressed, and what is open ------------------------- */

/** An element as a key's target or focus: its tag, its type, and the selectors it matches or sits inside, for `closest`. */
const element = (tagName, { type = "", within = [] } = {}) => ({ nodeType: 1, tagName, type, isContentEditable: false, closest: (sel) => (within.some((s) => sel.includes(s)) ? {} : null) });
const BODY = element("BODY");
/** The row under the keyboard's cursor, by its id. */
const cursorRow = (tree) => find(tree, (n) => n.type === "tr" && /\bfocused\b/.test(n.props?.className || ""))?.props.id ?? null;
/** The table foot's line of keys, as it reads. */
const keysLine = (tree) => textOf(find(tree, (n) => n.props?.className === "cl-table-keys"));

test("REGRESSION: Esc in a field is the field's, even once the field has gone -- Esc in the bulk bar's list name cleared the whole selection", async () => {
  await freshPage({ people: [person(1), person(2)] });
  byTestId(draw(), "select-all").props.onChange();
  // New list… puts the name box in the bar. Its own Esc closes it (React hears the key before the window does), and
  // focus goes with it: by the time the page hears the key, focus is on the body.
  find(draw(), (n) => n.props?.label === "Add to list").props.items.find((i) => i.label === "New list…").onClick();
  byTestId(draw(), "bulk-list-name").props.onKeyDown({ key: "Escape" });
  const nameBox = element("INPUT", { type: "text", within: ["input", ".cl-bulk"] });
  assert.equal(press("Escape", nameBox, { focus: BODY }), false, "the page leaves an Esc pressed in a field to the field");
  const tree = draw();
  assert.equal(byTestId(tree, "bulk-list-name"), null, "the box closed");
  assert.match(textOf(byTestId(tree, "bulk-bar")), /2 selected/, "REGRESSION: and the selection went with it");
});

test("REGRESSION: Esc while a menu or a dialog is open is theirs -- the Esc that closed one cleared the selection, and the rows walked behind it", async () => {
  await freshPage({ people: [person(1), person(2)] });
  byTestId(draw(), "select-all").props.onChange();
  draw();
  // A menu, then a dialog (Ask, the notifications, the ? sheet, the phone's drawer): the page holds still behind each.
  for (const role of ["menu", "dialog"]) {
    overlayOpen = { role };
    assert.equal(press("Escape"), false, `a ${role} closes itself; the page leaves its Esc alone`);
    assert.equal(press("j"), false, `and walks nothing behind the ${role}`);
    assert.equal(press("/"), false, `nor goes to the search behind the ${role}`);
    assert.match(textOf(byTestId(draw(), "bulk-bar")), /2 selected/, `REGRESSION: an Esc that closed a ${role} cleared the selection`);
  }
  // A dialog outside the app, one a browser extension added and hid, is not the app's: the page keeps its keys.
  overlayOpen = { role: "dialog", inApp: false };
  assert.equal(press("j"), true, "a dialog outside the app does not silence the page");
  overlayOpen = null;
  assert.equal(press("Escape"), true, "with nothing open, Esc clears the selection");
  assert.equal(byTestId(draw(), "bulk-bar"), null);
});

test("REGRESSION: the ? sheet's Esc is its own -- open, Esc closes it and the selection stays; closed, the sheet lets People's Esc through", async () => {
  await freshPage({ people: [person(1), person(2)] });
  // The shell draws the sheet before any page, so its listener hears a key before People's does; by the time People's
  // hears it, the sheet has closed. Its hooks sit far past the page's in the stub's one call order.
  const chrome = globalThis.window.__chrome;
  globalThis.window.__chrome = { ...chrome, shortcuts: SHORTCUTS, shortcutGroups, typing: () => false };
  const sheet = () => { seq = 10_000; return globalThis.window.ShortcutsSheet(); };
  try {
    assert.equal(sheet(), null, "closed until asked");
    byTestId(draw(), "select-all").props.onChange();
    draw();
    globalThis.window.dispatchEvent(new CustomEvent("shortcuts:open"));
    assert.ok(byTestId(sheet(), "shortcuts-sheet"), "the sheet is open");
    assert.equal(press("Escape"), true, "the sheet takes the Esc that closes it");
    assert.equal(sheet(), null, "and closes");
    assert.match(textOf(byTestId(draw(), "bulk-bar")), /2 selected/, "REGRESSION: the Esc that closed the sheet cleared the selection behind it");
    assert.equal(press("Escape"), true, "with the sheet closed, Esc is People's");
    assert.equal(byTestId(draw(), "bulk-bar"), null, "and clears the selection");
  } finally {
    globalThis.window.__chrome = chrome;
  }
});

test("REGRESSION: Esc clears the selection with focus on a bulk-bar button -- after Export CSV, Take off or Add a note, the foot's esc did nothing", async () => {
  await freshPage({ people: [person(1), person(2)] });
  byTestId(draw(), "select-all").props.onChange();
  assert.match(textOf(byTestId(draw(), "bulk-bar")), /2 selected/);
  const exportCsv = element("BUTTON", { within: ["button", ".cl-bulk"] });
  assert.equal(press("Escape", exportCsv), true, "REGRESSION: the bar kept Esc from the page");
  assert.equal(byTestId(draw(), "bulk-bar"), null, "the selection is cleared");
});

test("a key with a modifier is not the page's: Ctrl-K is Ask's, and Ctrl-J, Ctrl-X, ⌘J and Alt-X move and select nothing", async () => {
  await freshPage({ people: [person(1), person(2), person(3)] });
  draw();
  press("j");
  draw();
  press("j");
  assert.equal(cursorRow(draw()), "person-p2");
  for (const [key, mod] of [["k", "ctrlKey"], ["j", "ctrlKey"], ["x", "ctrlKey"], ["j", "metaKey"], ["x", "altKey"]]) {
    assert.equal(press(key, null, { [mod]: true }), false, `${mod} with ${key} is not the page's`);
  }
  const tree = draw();
  assert.equal(cursorRow(tree), "person-p2", "the cursor stayed on Person 2");
  assert.equal(byTestId(tree, "bulk-bar"), null, "and nobody was selected");
});

test("Esc closes the phone's lists sheet first, and the selection stays; the next Esc clears it", async () => {
  await freshPage({ people: [person(1), person(2)], lists: [{ id: "s1", name: "Regulars", ids: ["p1"] }] });
  byTestId(draw(), "select-all").props.onChange();
  click(byTestId(draw(), "people-lists-pick"));
  assert.ok(byTestId(draw(), "people-lists-sheet"), "the sheet is open");
  press("Escape");
  let tree = draw();
  assert.equal(byTestId(tree, "people-lists-sheet"), null, "Esc closed the sheet");
  assert.match(textOf(byTestId(tree, "bulk-bar")), /2 selected/, "and left the selection alone");
  assert.equal(press("Escape"), true);
  tree = draw();
  assert.equal(byTestId(tree, "bulk-bar"), null, "the next Esc clears it");
});

test("x and Space select nobody for a member who can neither edit lists nor export, and the foot's keys say what the member's keys do", async () => {
  await freshPage({ people: [person(1), person(2)] });
  assert.equal(keysLine(draw()), "JK move · x selects · esc clears · ↵ opens · / searches", "an owner's foot names every key");
  await freshPage({ people: [person(1), person(2)] });
  const me = globalThis.window.__ME;
  globalThis.window.__ME = { role: "viewer" };
  try {
    draw();
    press("j");
    const tree = draw();
    assert.equal(cursorRow(tree), "person-p1", "a viewer walks the rows");
    assert.equal(press("x"), false, "x selects nobody");
    assert.equal(press(" "), false, "nor does Space");
    assert.equal(byTestId(draw(), "bulk-bar"), null);
    assert.equal(keysLine(tree), "JK move · ↵ opens · / searches", "and the foot does not offer them");
  } finally {
    globalThis.window.__ME = me;
  }
});

test("/ goes to the search on an empty table too", async () => {
  await freshPage({ people: [] });
  const box = find(draw(), (n) => n.type === "input" && /Search/.test(n.props?.placeholder || ""));
  let focused = 0;
  box.props.ref.current = { focus: () => { focused += 1; } };
  assert.equal(press("/"), true);
  assert.equal(focused, 1, "nobody to walk, and still somewhere to search");
});

test("a radio's arrow keys are the radio's; a held x, Space or Enter acts once, and a held J walks on", async () => {
  await freshPage({ people: [person(1), person(2), person(3)] });
  draw();
  const radio = element("INPUT", { type: "radio", within: ["input"] });
  assert.equal(press("ArrowDown", radio), false, "a radio group moves its own choice");
  assert.equal(cursorRow(draw()), null, "and not the page's cursor");
  press("j");
  draw();
  assert.equal(press("x"), true);
  draw();
  assert.equal(press("x", null, { repeat: true }), false, "a held x does not take the row off again");
  assert.equal(press(" ", null, { repeat: true }), false, "nor does a held Space");
  assert.equal(press("Enter", null, { repeat: true }), false, "and a held Enter opens nobody");
  assert.deepEqual(opened, []);
  assert.match(textOf(byTestId(draw(), "bulk-bar")), /1 selected/, "Person 1 stays selected");
  assert.equal(press("j", null, { repeat: true }), true, "a held J walks on");
  assert.equal(press("j", null, { repeat: true }), true);
  assert.equal(cursorRow(draw()), "person-p3");
});

/** The Columns menu's rows: which column, whether it shows, and whether it is Person's, which always does. */
const menuItems = (tree) => all(byTestId(tree, "people-columns-menu"), (n) => n.props?.role === "menuitemcheckbox")
  .map((n) => ({ key: n.props["data-testid"].replace(/^column-/, ""), on: n.props["aria-checked"], locked: n.props["aria-disabled"] === true }));

test("the Columns menu shows and hides columns and stays open while it does; Person always shows; Esc closes it", async () => {
  await freshPage({ people: [person(1, { came_from: "whatsapp" }), person(2)], lists: [{ id: "s1", name: "Regulars", ids: ["p1"] }] });
  let tree = draw();
  assert.equal(byTestId(tree, "people-columns-menu"), null, "closed until asked");
  click(byTestId(tree, "people-columns"));
  tree = draw();
  assert.deepEqual(menuItems(tree), [
    { key: "name", on: true, locked: true },
    { key: "state", on: true, locked: false },
    { key: "last", on: true, locked: false },
    { key: "receptionist", on: true, locked: false },
    { key: "offers", on: true, locked: false },
    { key: "came_from", on: true, locked: false },
    { key: "email", on: false, locked: false },
    { key: "lists", on: false, locked: false },
  ], "every column this workspace can show; Visits waits for a calendar");
  click(byTestId(tree, "column-came_from"));
  tree = draw();
  assert.ok(byTestId(tree, "people-columns-menu"), "it stays open: MoreMenu closes on every pick");
  assert.ok(!headings(tree).includes("Came from"), "hidden");
  click(byTestId(tree, "column-lists"));
  tree = draw();
  assert.deepEqual(headings(tree), ["Person", "State", "Last contact", "Receptionist", "Offers", "Lists"]);
  assert.equal(textOf(byTestId(rowOf(tree, "p1"), "row-lists")).trim(), "Regulars", "the lists kept by hand that they are on");
  click(byTestId(tree, "column-name"));
  assert.ok(headings(draw()).includes("Person"), "Person cannot be hidden");
  assert.equal(press("Escape"), true);
  assert.equal(byTestId(draw(), "people-columns-menu"), null, "Esc closes it");
});

test("a view keeps its columns with its sort, and every save sends every key -- member_view_set replaces the page's whole object", async () => {
  await freshPage({ people: [person(1)], views: { people: { sortBy: "name", sortDir: "asc", columns: { came_from: false, email: true } } } });
  const saves = [];
  globalThis.window.__saveView = async (page, view) => { saves.push([page, view]); return { ok: true, data: { views: { [page]: view } } }; };
  let tree = draw();
  assert.deepEqual(headings(tree), ["Person", "State", "Last contact", "Receptionist", "Offers", "Email"], "the member's own columns");
  assert.deepEqual(saves, [], "the view it already holds is not saved again");
  click(byTestId(tree, "people-columns"));
  tree = draw();
  click(byTestId(tree, "column-lists"));
  tree = draw();
  assert.deepEqual(saves.at(-1), ["people", { sortBy: "name", sortDir: "asc", columns: { came_from: false, email: true, lists: true } }], "a column change keeps the sort");
  click(find(tree, (n) => n.type === "th" && textOf(n).startsWith("State")));
  draw();
  // One save at a time: the new sort goes once the column's save has landed.
  await settle();
  assert.deepEqual(saves.at(-1), ["people", { sortBy: "state", sortDir: "desc", columns: { came_from: false, email: true, lists: true } }], "and a new sort keeps the columns");
});

test("with a calendar the receptionist's word sits beside the state until its own column is shown -- then a desktop says it there, once, and a card keeps it beside the state", async () => {
  await freshPage({ people: [person(1, { queued_reply_at: iso(H) })], calendar: "ok" });
  const stateCell = (t) => find(t, (n) => n.type === "td" && /\bcl-state-cell\b/.test(n.props?.className || ""));
  let tree = draw();
  assert.match(textOf(stateCell(tree)), /reply queued/, "beside the state");
  click(byTestId(tree, "people-columns"));
  tree = draw();
  click(byTestId(tree, "column-receptionist"));
  tree = draw();
  assert.ok(headings(tree).includes("Receptionist"), "in a column of its own");
  // Controller: after Task 3's review the mark always renders; a class hides it at 901px and up, where the column shows it,
  // so a phone card (which hides the Receptionist cell beside Visits) still says it.
  const mark = find(stateCell(tree), (n) => /cl-row-recept-mark/.test(n.props?.className || ""));
  assert.match(mark?.props?.className || "", /is-in-column/, "beside the state only where its column is off the screen: a card");
});

test("Esc closes the Columns menu first and puts focus back on its button, and the selection stays; the rows hold still behind it, and the next Esc clears the selection", async () => {
  await freshPage({ people: [person(1), person(2)] });
  byTestId(draw(), "select-all").props.onChange();
  click(byTestId(draw(), "people-columns"));
  let tree = draw();
  assert.ok(byTestId(tree, "people-columns-menu"), "the menu is open");
  let focused = 0;
  byTestId(tree, "people-columns").props.ref.current = { focus: () => { focused += 1; } };
  assert.equal(press("j"), false, "J walks nothing behind the menu");
  assert.equal(cursorRow(draw()), null);
  assert.equal(press("Escape"), true, "the menu is the page's own, so its Esc is the page's");
  tree = draw();
  assert.equal(byTestId(tree, "people-columns-menu"), null, "Esc closed the menu");
  assert.equal(focused, 1, "and focus is back on the Columns button, not lost to the page");
  assert.match(textOf(byTestId(tree, "bulk-bar")), /2 selected/, "and left the selection alone");
  assert.equal(press("Escape"), true);
  tree = draw();
  assert.equal(byTestId(tree, "bulk-bar"), null, "the next Esc clears it");
});

test("a saved view's columns are read with care -- only a true or false for a column a member may hide counts, and the next save drops the rest", async () => {
  // A view is the member's own JSON: an older page or another device may have written anything into it.
  await freshPage({ people: [person(1)], views: { people: { sortBy: "last", sortDir: "desc", columns: { name: false, actions: false, came_from: "no", email: true, bogus: true } } } });
  const saves = [];
  globalThis.window.__saveView = async (page, view) => { saves.push([page, view]); return { ok: true, data: { views: { [page]: view } } }; };
  const tree = draw();
  assert.deepEqual(headings(tree), ["Person", "State", "Last contact", "Receptionist", "Offers", "Came from", "Email"], "Person stays, and a word is not a false");
  assert.ok(find(rowOf(tree, "p1"), (n) => n.type === "td" && /\bcl-actions-cell\b/.test(n.props?.className || "")), "and so do the row's actions");
  assert.deepEqual(saves, [], "what it could read of the view is what it holds: nothing to save");
  click(byTestId(tree, "people-columns"));
  click(byTestId(draw(), "column-lists"));
  draw();
  assert.deepEqual(saves.at(-1), ["people", { sortBy: "last", sortDir: "desc", columns: { email: true, lists: true } }], "the next save keeps what it understood");
  for (const columns of [null, "email", ["email"], 7]) {
    await freshPage({ people: [person(1)], views: { people: { sortBy: "last", sortDir: "desc", columns } } });
    assert.deepEqual(headings(draw()), ["Person", "State", "Last contact", "Receptionist", "Offers", "Came from"], `${JSON.stringify(columns)} is no set of columns: the defaults`);
  }
});

/** Saves the test lands by hand: each call waits in the list, with the view it carried, until the test lands it. */
const heldSaves = () => {
  const calls = [];
  globalThis.window.__saveView = (page, view) => new Promise((land) => calls.push({ page, view: JSON.parse(JSON.stringify(view)), land }));
  return calls;
};

test("a view saves one at a time, and only the latest waits -- two in flight could land out of order and leave the older one on the member's row", async () => {
  await freshPage({ people: [person(1)], views: { people: { sortBy: "last", sortDir: "desc" } } });
  const calls = heldSaves();
  click(byTestId(draw(), "people-columns"));
  click(byTestId(draw(), "column-came_from"));
  draw();
  click(byTestId(draw(), "column-email"));
  draw();
  assert.equal(calls.length, 1, "two quick toggles: the first goes, and the second waits for it to land");
  assert.deepEqual(calls[0].view.columns, { came_from: false });
  click(byTestId(draw(), "column-lists"));
  draw();
  assert.equal(calls.length, 1, "a third takes the second's place: only the latest waits");
  calls[0].land({ ok: true, data: {} });
  await settle();
  assert.equal(calls.length, 2, "the first landed, and one more went");
  assert.equal(calls[1].page, "people");
  assert.deepEqual(calls[1].view, { sortBy: "last", sortDir: "desc", columns: { came_from: false, email: true, lists: true } }, "the latest view, whole");
  calls[1].land({ ok: true, data: {} });
  await settle();
  assert.equal(calls.length, 2, "and nothing after it");
});

test("a save that fails is tried once more, unless a newer view is waiting to go -- a timeout dropped the last change", async () => {
  await freshPage({ people: [person(1)], views: { people: { sortBy: "last", sortDir: "desc" } } });
  const calls = heldSaves();
  const errors = [];
  const error = console.error;
  console.error = (...a) => errors.push(a.join(" "));
  try {
    click(byTestId(draw(), "people-columns"));
    click(byTestId(draw(), "column-email"));
    draw();
    calls[0].land({ ok: false, message: "timed out" });
    await settle();
    assert.equal(calls.length, 2, "tried once more");
    assert.deepEqual(calls[1].view, calls[0].view, "the same view");
    assert.deepEqual(errors, [], "and nothing said yet");
    calls[1].land({ ok: false, message: "timed out" });
    await settle();
    assert.equal(calls.length, 2, "only once");
    assert.equal(errors.filter((m) => m.startsWith("people_view_not_saved")).length, 1, "then it says the view was not saved");
    // A newer view waiting goes instead of a second try: it carries every key, the failed one's too.
    click(byTestId(draw(), "column-lists"));
    draw();
    click(byTestId(draw(), "column-came_from"));
    draw();
    assert.equal(calls.length, 3, "one at a time");
    calls[2].land({ ok: false, message: "timed out" });
    await settle();
    assert.equal(calls.length, 4);
    assert.deepEqual(calls[3].view.columns, { email: true, lists: true, came_from: false }, "the newer view, not the failed one again");
    calls[3].land({ ok: true, data: {} });
    await settle();
    assert.equal(calls.length, 4, "and nothing after it");
    assert.equal(errors.length, 1, "a failed view a newer one replaced is no view lost");
  } finally {
    console.error = error;
  }
});

test("a Columns menu left open as the window narrows to a phone's lets go: the key is the page's, and the menu closes -- hidden by the stylesheet, it held every key but Esc", async () => {
  await freshPage({ people: [person(1), person(2)] });
  click(byTestId(draw(), "people-columns"));
  assert.ok(byTestId(draw(), "people-columns-menu"), "open on a desktop");
  // 900px and under, clients.css hides it; it is still on the page when the key comes, so the check for what is open
  // over the page must know it for the page's own.
  globalThis.window.matchMedia = (q) => ({ matches: q === "(max-width: 900px)" });
  overlayOpen = { role: "menu", className: "more-menu align-right pl-cols-menu" };
  try {
    assert.equal(press("j"), true, "J is the page's again");
    overlayOpen = null;
    const tree = draw();
    assert.equal(cursorRow(tree), "person-p1", "and walks the rows");
    assert.equal(byTestId(tree, "people-columns-menu"), null, "the menu nobody could see is closed");
  } finally {
    delete globalThis.window.matchMedia;
  }
});

test("a column put back the way its default has it is no choice any more -- the receptionist, turned off and on again, gives way to Visits once a calendar connects", async () => {
  await freshPage({ people: [person(1)], views: { people: { sortBy: "last", sortDir: "desc" } } });
  const saves = [];
  globalThis.window.__saveView = async (page, view) => { saves.push(view); return { ok: true, data: {} }; };
  click(byTestId(draw(), "people-columns"));
  click(byTestId(draw(), "column-receptionist"));
  draw();
  await settle();
  assert.deepEqual(saves.at(-1).columns, { receptionist: false }, "off: the member's choice");
  click(byTestId(draw(), "column-receptionist"));
  draw();
  await settle();
  assert.deepEqual(saves.at(-1).columns, {}, "on again, as it shows without a calendar: nothing left to keep");
  await freshPage({ people: [person(1)], calendar: "ok", views: { people: saves.at(-1) } });
  assert.deepEqual(headings(draw()), ["Person", "State", "Last contact", "Visits", "Offers", "Came from"], "a calendar connects, and Visits takes the receptionist's place, as it does for everyone");
});

test("the Columns button says whether its menu is open, and a second press or a press beside the menu closes it", async () => {
  await freshPage({ people: [person(1)] });
  const button = (t) => byTestId(t, "people-columns");
  let tree = draw();
  assert.equal(button(tree).props["aria-expanded"], false, "closed");
  click(button(tree));
  tree = draw();
  assert.ok(byTestId(tree, "people-columns-menu"));
  assert.equal(button(tree).props["aria-expanded"], true, "open, and it says so");
  click(button(tree));
  tree = draw();
  assert.equal(byTestId(tree, "people-columns-menu"), null, "a second press closes it");
  assert.equal(button(tree).props["aria-expanded"], false);
  click(button(tree));
  tree = draw();
  click(find(tree, (n) => n.props?.className === "more-backdrop"));
  tree = draw();
  assert.equal(byTestId(tree, "people-columns-menu"), null, "a press beside it closes it");
  assert.equal(button(tree).props["aria-expanded"], false);
});

test("with a calendar the menu offers Visits, shown, and the receptionist, hidden; a Visits hidden stays hidden through a calendar outage and rides in every save", async () => {
  let saves = [];
  const record = async (page, view) => { saves.push(view); return { ok: true, data: {} }; };
  await freshPage({ people: [person(1)], calendar: "ok", views: { people: { sortBy: "last", sortDir: "desc" } } });
  globalThis.window.__saveView = record;
  click(byTestId(draw(), "people-columns"));
  let tree = draw();
  assert.deepEqual(menuItems(tree).map((c) => [c.key, c.on]), [["name", true], ["state", true], ["last", true], ["visits", true], ["receptionist", false], ["offers", true], ["came_from", true], ["email", false], ["lists", false]], "the visit shows; the receptionist waits in the menu");
  click(byTestId(tree, "column-visits"));
  draw();
  await settle();
  const hidden = saves.at(-1);
  assert.deepEqual(hidden.columns, { visits: false });
  // The calendar stops answering: Visits cannot show and the menu does not offer it, but the choice is kept.
  await freshPage({ people: [person(1)], calendar: "unavailable", views: { people: hidden } });
  saves = [];
  globalThis.window.__saveView = record;
  click(byTestId(draw(), "people-columns"));
  tree = draw();
  assert.ok(!headings(tree).includes("Visits"));
  assert.ok(!menuItems(tree).some((c) => c.key === "visits"), "the menu offers what this workspace can show now");
  click(byTestId(tree, "column-email"));
  draw();
  await settle();
  assert.deepEqual(saves.at(-1).columns, { visits: false, email: true }, "a save while it is down keeps the hidden Visits");
  await freshPage({ people: [person(1)], calendar: "ok", views: { people: saves.at(-1) } });
  assert.deepEqual(headings(draw()), ["Person", "State", "Last contact", "Offers", "Came from", "Email"], "back up, and Visits is still hidden, as chosen");
});

test("REGRESSION: Back keeps the columns a member chose -- People mounted again read the surface's view from before the save, and the next save wrote the old columns to the server", async () => {
  // A member whose view this page has saved before, columns and all.
  const seen = await freshPage({ people: [person(1), person(2)], views: { people: { sortBy: "last", sortDir: "desc", columns: {} } } });
  // The bridge's own save over the wire, not a stand-in: the save itself keeps the surface's copy in step.
  globalThis.window.__saveView = saveView;
  click(byTestId(draw(), "people-columns"));
  click(byTestId(draw(), "column-came_from"));
  draw();
  await settle();
  assert.deepEqual(seen.viewSaves, [{ page: "people", view: { sortBy: "last", sortDir: "desc", columns: { came_from: false } } }], "the save landed");
  // A profile opens, so the list goes; Back mounts it again, and it reads the surface as it stands.
  cells = [];
  const tree = draw();
  assert.ok(!headings(tree).includes("Came from"), "REGRESSION: the column the member hid came back");
  assert.deepEqual(JSON.parse(globalThis.localStorage.getItem("chanlytics-people-view")).columns, { came_from: false }, "REGRESSION: and this device's copy was written over with the old columns");
  click(find(tree, (n) => n.type === "th" && textOf(n).startsWith("State")));
  draw();
  await settle();
  assert.deepEqual(seen.viewSaves.at(-1), { page: "people", view: { sortBy: "state", sortDir: "desc", columns: { came_from: false } } }, "REGRESSION: a sort afterwards sent the columns from before, and the server lost the choice");
});

test("REGRESSION: a save made while People is being read is not undone by the read -- the read brought the old view back, Back showed the column again, and the next sort saved the old columns", async () => {
  const seen = await freshPage({ people: [person(1), person(2)], views: { people: { sortBy: "last", sortDir: "desc", columns: {} } } });
  globalThis.window.__saveView = saveView;
  click(byTestId(draw(), "people-columns"));
  // A read of People goes out (a new message, the tab shown again, a load), and the server answers it with the view
  // it held before the save below.
  const reading = peopleOverride.apply();
  click(byTestId(draw(), "column-came_from"));
  draw();
  await reading;
  await settle();
  assert.deepEqual(seen.viewSaves.map((s) => s.view.columns), [{ came_from: false }], "the save went while the read was out");
  cells = [];
  const tree = draw();
  assert.ok(!headings(tree).includes("Came from"), "REGRESSION: the read put the column back");
  click(find(tree, (n) => n.type === "th" && textOf(n).startsWith("State")));
  draw();
  await settle();
  assert.deepEqual(seen.viewSaves.at(-1).view, { sortBy: "state", sortDir: "desc", columns: { came_from: false } }, "REGRESSION: and the next sort saved the old columns");
});

test("a read of People that overlapped no save takes the server's view -- another device's change shows", async () => {
  const people = [person(1), person(2)];
  await freshPage({ people, views: { people: { sortBy: "last", sortDir: "desc", columns: {} } } });
  globalThis.window.__saveView = saveView;
  click(byTestId(draw(), "people-columns"));
  click(byTestId(draw(), "column-came_from"));
  draw();
  await settle();
  // Later, on another device, the member shows Email and sorts by name; this tab reads People again.
  wire({ people, views: { people: { sortBy: "name", sortDir: "asc", columns: { email: true } } } });
  await peopleOverride.apply();
  cells = [];
  assert.deepEqual(headings(draw()), ["Person", "State", "Last contact", "Receptionist", "Offers", "Came from", "Email"], "the other device's columns, not this tab's last save");
});

/* ------------------------- the bulk bar, on the people shown (Phase 0) ------------------------- */

/**
 * The bar's Export, drawn and its file caught: the harness sets no `__href`, so Export was never drawn here. Each file it
 * makes lands in `blobs`, and `restore` puts the window back.
 */
const catchExports = () => {
  const blobs = [], was = { url: URL.createObjectURL, make: globalThis.document.createElement };
  URL.createObjectURL = (b) => { blobs.push(b); return was.url(b); };
  globalThis.document.createElement = () => ({ click() {}, remove() {} });
  globalThis.document.body.appendChild = () => {};
  globalThis.window.__href = () => "";
  return { blobs, restore: () => { URL.createObjectURL = was.url; globalThis.document.createElement = was.make; delete globalThis.document.body.appendChild; delete globalThis.window.__href; } };
};
/** Who is in a file the bar made: each row's first cell, the name, under the heading row. */
const exportedNames = async (blob) => (await blob.text()).split("\r\n").slice(1).map((line) => /^"([^"]*)"/.exec(line)[1]);

test("REGRESSION: the bulk bar acts on the people shown -- a person a refresh moved out of the view stayed counted, and was written to", async () => {
  const needs = (i) => person(i, { needs_human: true, open_escalation_reason: "human_token", open_escalation_since: iso(H), latest_state: "needs_human" });
  const kept = [{ id: "s1", name: "Regulars", ids: [] }];
  await freshPage({ people: [needs(1), needs(2), person(3)], lists: kept });
  const calls = [];
  globalThis.window.__lists = lists({ add: async (id, ids) => { calls.push(ids); return { ok: true, data: {} }; } });
  const yeses = [];
  globalThis.window.__setPersonConsentMany = async (ids) => { yeses.push(ids); return { ok: true, done: ids.length, failed: 0 }; };
  const { blobs, restore } = catchExports();
  try {
    let tree = draw({ initialState: "needs_you" });
    byTestId(tree, "select-all").props.onChange();
    tree = draw({ initialState: "needs_you" });
    assert.match(textOf(byTestId(tree, "bulk-bar")), /2 selected/);
    // A refresh: Person 2's escalation was resolved on another device, so they leave Needs you.
    wire({ people: [needs(1), person(2), person(3)], lists: kept });
    await quietly(() => peopleOverride.apply());
    tree = draw({ initialState: "needs_you" });
    assert.deepEqual(all(tree, (n) => n.props?.["data-testid"] === "row-select").map((n) => n.props["aria-label"]), ["Select Person 1"], "the view shows one");
    assert.match(textOf(byTestId(tree, "bulk-bar")), /1 selected/, "REGRESSION: the bar counted a person who is not on screen");
    await find(tree, (n) => n.props?.label === "Add to list").props.items.find((i) => i.label === "Regulars").onClick();
    await settle();
    assert.deepEqual(calls, [["p1"]], "REGRESSION: the add wrote to a person the view no longer shows");
    // The doors that take fifty at a time (a yes, the receptionist, a note, Take off) share one batch; a yes stands for them.
    await find(draw({ initialState: "needs_you" }), (n) => n.props?.label === "Record a yes").props.items.find((i) => i.label === "In person").onClick();
    await settle();
    assert.deepEqual(yeses, [["p1"]], "REGRESSION: the yes went to a person the view no longer shows");
    byTestId(draw({ initialState: "needs_you" }), "bulk-export").props.onClick();
    assert.equal(textOf(flashes.at(-1).msg), "1 exported as a CSV");
    assert.deepEqual(await exportedNames(blobs.at(-1)), ["Person 1"], "REGRESSION: the file held a person the view no longer shows");
  } finally {
    restore();
  }
});

test("REGRESSION: a search match past the people loaded is exported with the rest -- the bar counted it and wrote to it, and left it out of the file", async () => {
  // Past everyone loaded, the server finds Saturday Jones; Person 2 matches by their last words ("Can I move Saturday to 11?").
  await freshPage({ people: [person(1, { display_name: "Saturday Smith" }), person(2)], lists: [{ id: "s1", name: "Regulars", ids: [] }] });
  globalThis.window.__PEOPLE.page = { ...globalThis.window.__PEOPLE.page, total: 60000, has_more: true };
  const far = toPersonRowVM(person(99, { display_name: "Saturday Jones" }), ZONE, new Date());
  globalThis.window.__peopleSearch = async () => ({ rows: [far], more: false });
  const calls = [];
  globalThis.window.__lists = lists({ add: async (id, ids) => { calls.push(ids); return { ok: true, data: {} }; } });
  const { blobs, restore } = catchExports();
  try {
    find(draw(), (n) => n.type === "input" && /Search/.test(n.props?.placeholder || "")).props.onChange({ target: { value: "saturday" } });
    draw();
    await sleep(320);
    byTestId(draw(), "select-all").props.onChange();
    const tree = draw();
    assert.match(textOf(byTestId(tree, "bulk-bar")), /3 selected/, "the two loaded and the one found");
    byTestId(tree, "bulk-export").props.onClick();
    assert.equal(textOf(flashes.at(-1).msg), "3 exported as a CSV", "REGRESSION: the file counted only the people loaded");
    assert.deepEqual((await exportedNames(blobs.at(-1))).sort(), ["Person 2", "Saturday Jones", "Saturday Smith"], "REGRESSION: the person found past the loaded rows was left out of the file");
    await find(tree, (n) => n.props?.label === "Add to list").props.items.find((i) => i.label === "Regulars").onClick();
    await settle();
    assert.deepEqual(calls.map((ids) => [...ids].sort()), [["p1", "p2", "p99"]], "and written to with the rest");
  } finally {
    restore();
  }
});

test("the table is selecting only while a row it shows is selected -- a selection a refresh took off the screen shows no row's box, and draws no bar", async () => {
  const needs = (i) => person(i, { needs_human: true, open_escalation_reason: "human_token", open_escalation_since: iso(H), latest_state: "needs_human" });
  // `selecting` on the table's wrap is what shows every row's box (clients.css).
  const selecting = (tree) => /\bselecting\b/.test(String(find(tree, (n) => /\bpl-table-wrap\b/.test(String(n.props?.className || ""))).props.className));
  await freshPage({ people: [needs(1), needs(2), person(3)] });
  let tree = draw({ initialState: "needs_you" });
  assert.equal(selecting(tree), false, "nobody selected");
  byTestId(rowOf(tree, "p2"), "row-select").props.onChange();
  tree = draw({ initialState: "needs_you" });
  assert.equal(selecting(tree), true, "Person 2 is shown and selected");
  // A refresh: Person 2's escalation was resolved on another device, so they leave Needs you, and the one person
  // selected is not on screen.
  wire({ people: [needs(1), person(2), person(3)] });
  await quietly(() => peopleOverride.apply());
  tree = draw({ initialState: "needs_you" });
  assert.deepEqual(all(tree, (n) => n.props?.["data-testid"] === "row-select").map((n) => n.props["aria-label"]), ["Select Person 1"], "the view shows one");
  assert.equal(selecting(tree), false, "a selection nobody can see does not put the table in selecting mode");
  assert.equal(byTestId(tree, "bulk-bar"), null, "nor draws a bar with nobody on screen to act on");
  byTestId(rowOf(tree, "p1"), "row-select").props.onChange();
  tree = draw({ initialState: "needs_you" });
  assert.equal(selecting(tree), true, "a shown row selected: selecting again");
  assert.match(textOf(byTestId(tree, "bulk-bar")), /1 selected/, "and the bar counts the one shown");
});

test("on a desktop the table scrolls in its own box, Person pinned, and the hairline beside it shows once it has scrolled sideways", async () => {
  await freshPage({ people: [person(1)] });
  let tree = draw();
  assert.ok(find(tree, (n) => /\bcl-main-scroll\b/.test(n.props?.className || "") && /\bpl-main\b/.test(n.props.className)), "the page's column is the layout that gives the table its own box");
  const scroller = (t) => byTestId(t, "people-table-scroll");
  assert.doesNotMatch(scroller(tree).props.className, /\bscrolled\b/, "no hairline at rest");
  scroller(tree).props.onScroll({ currentTarget: { scrollLeft: 120 } });
  tree = draw();
  assert.match(scroller(tree).props.className, /\bscrolled\b/, "scrolled sideways: the hairline");
  scroller(tree).props.onScroll({ currentTarget: { scrollLeft: 0 } });
  tree = draw();
  assert.doesNotMatch(scroller(tree).props.className, /\bscrolled\b/, "back at the start: none");
  assert.match(find(tree, (n) => n.type === "th" && textOf(n).startsWith("Person")).props.className, /\bpl-pin\b/, "Person's heading is pinned");
  assert.match(find(rowOf(tree, "p1"), (n) => n.type === "td" && /\bcl-name-cell\b/.test(n.props?.className || "")).props.className, /\bpl-pin\b/, "and so are its cells");
});

test("Person is the cell right after the checkbox, in the header and in every row -- its pin sits at the checkbox's width, 28px, beside it", async () => {
  // clients.css pins Person with `.cl-sel + .pl-pin { left: 28px }`: that holds only while Person follows the checkbox.
  const cells = (tr) => tr.props.children.filter((k) => k && (k.type === "th" || k.type === "td"));
  const lines = (tree) => [find(find(tree, (n) => n.type === "thead"), (n) => n.type === "tr"), ...all(find(tree, (n) => n.type === "tbody"), (n) => n.type === "tr")].map(cells);
  const is = (cell, cls) => new RegExp(`\\b${cls}\\b`).test(String(cell.props.className || ""));
  for (const calendar of ["none", "ok"]) {
    await freshPage({ people: [person(1), person(2), person(3)], calendar });
    const drawn = lines(draw());
    assert.equal(drawn.length, 4, "the header and three rows");
    for (const line of drawn) {
      assert.ok(is(line[0], "cl-sel"), `the checkbox first (calendar ${calendar})`);
      assert.ok(is(line[1], "pl-pin"), `then Person, pinned beside it (calendar ${calendar})`);
      assert.equal(line.filter((c) => is(c, "pl-pin")).length, 1, "and nothing else pinned");
    }
  }
  // A member who can neither edit lists nor export has no checkbox: Person is the first cell, pinned at 0.
  await freshPage({ people: [person(1), person(2)] });
  const me = globalThis.window.__ME;
  globalThis.window.__ME = { role: "viewer" };
  try {
    for (const line of lines(draw())) {
      assert.ok(is(line[0], "pl-pin"), "Person first");
      assert.ok(!line.some((c) => is(c, "cl-sel")), "and no checkbox before it");
    }
  } finally {
    globalThis.window.__ME = me;
  }
});

test("REGRESSION: a member's columns are a desktop's, and a phone keeps its cards -- with State and Offers hidden, the cards lost the state and the answer to offers, and no phone can reach the Columns menu to put them back", async () => {
  const needsYou = person(1, { needs_human: true, open_escalation_reason: "human_token", open_escalation_since: iso(H), latest_state: "needs_human" });
  const people = [needsYou, person(2)];
  /** A row's cells as a card draws them: every cell drawn, whatever mark a desktop reads. */
  const cardCells = (tree, id) => rowOf(tree, id).props.children.filter((k) => k && k.type === "td").map((td) => String(td.props.className).replace(/\s*\bpl-col-off\b/g, "").trim());
  await freshPage({ people });
  let tree = draw();
  const byDefault = ["p1", "p2"].map((id) => cardCells(tree, id));
  await freshPage({ people, views: { people: { sortBy: "last", sortDir: "desc", columns: { state: false, offers: false } } } });
  tree = draw();
  assert.deepEqual(["p1", "p2"].map((id) => cardCells(tree, id)), byDefault, "REGRESSION: each row draws the cells it draws by default, whatever the member chose");
  assert.deepEqual(headings(tree), ["Person", "Last contact", "Receptionist", "Came from"], "and a desktop leaves State and Offers out");
  const state = find(rowOf(tree, "p1"), (n) => n.type === "td" && /\bcl-state-cell\b/.test(n.props?.className || ""));
  assert.ok(colOff(state) && colOff(byTestId(rowOf(tree, "p1"), "row-offers")), "the state and the answer to offers are drawn, marked for a desktop to hide");
  assert.match(textOf(state), /needs you/i, "and the card still says who needs a person");
  const offHeadings = all(find(tree, (n) => n.type === "thead"), (n) => n.type === "th" && colOff(n)).map((th) => textOf(th).replace(/[▲▼]/g, "").trim());
  assert.deepEqual(offHeadings, ["State", "Offers", "Email", "Lists"], "a heading carries the mark with its cells, so one cell sits under each heading");
});
