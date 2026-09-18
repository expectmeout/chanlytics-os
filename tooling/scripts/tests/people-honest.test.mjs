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
/** What is open over the page, as document.querySelector finds it: nothing, unless a test opens a menu ('[role="menu"]'). */
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
  querySelector: (sel) => (overlayOpen && sel.includes(overlayOpen) ? { overlay: overlayOpen } : null),
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

/** Everyone over pages of `per`, the saved lists (or their read failing), what a search answers, the calendar's state, the member's saved views and the booking link on file. */
const wire = ({ people, per = 1000, lists = [], listsFail = false, search = null, calendar = "none", views = {}, bookingLink = null } = {}) => {
  const seen = { offsets: [], queries: [] };
  const cal = { state: calendar, source: calendar === "ok" ? "Google Calendar" : "your calendar" };
  globalThis.window.fetch = async (url) => {
    const u = new URL(String(url), "https://app.chanlytics.com");
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

/** People published by the real surface over the wire, and a page with nothing drawn yet: no view remembered on this device and none saved over the wire, unless a test gives one. */
const freshPage = async ({ people, lists: saved = [], listsFail = false, calendar = "none", views = {}, bookingLink = null } = {}) => {
  wire({ people, lists: saved, listsFail, calendar, views, bookingLink });
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

/** The table's headings as a person reads them: the checkbox's and the actions' empty ones left out, the sort arrow off. */
const headings = (tree) => all(tree, (n) => n.type === "th").map((th) => textOf(th).replace(/[▲▼]/g, "").trim()).filter(Boolean);
/** A person's row, by their id. */
const rowOf = (tree, id) => find(tree, (n) => n.type === "tr" && n.props?.id === `person-${id}`);

test("the table's columns: Person, State, Last contact, the receptionist or, with a calendar, Visits, Offers, and Came from", async () => {
  // The headings a press sorts by, as the table marks them; and each body row's cells against the headings above them.
  const sorting = (tree) => all(tree, (n) => n.type === "th" && /\bsortable\b/.test(String(n.props?.className || ""))).map((th) => textOf(th).replace(/[▲▼]/g, "").trim());
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

test("REGRESSION: Esc while a menu is open is the menu's -- the Esc that closed a menu cleared the selection, and the rows walked behind it", async () => {
  await freshPage({ people: [person(1), person(2)] });
  byTestId(draw(), "select-all").props.onChange();
  draw();
  overlayOpen = '[role="menu"]';
  assert.equal(press("Escape"), false, "a menu closes itself; the page leaves its Esc alone");
  assert.equal(press("j"), false, "and walks nothing behind it");
  assert.equal(press("/"), false, "nor goes to the search");
  assert.match(textOf(byTestId(draw(), "bulk-bar")), /2 selected/, "REGRESSION: an Esc that closed a menu cleared the selection");
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
