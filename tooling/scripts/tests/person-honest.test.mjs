/**
 * One person: one set of words, and every mention opens its thing.
 *
 * - A People row in Needs you gave no reason and none of their words: the state's reason and the
 *   customer's last line were computed and never drawn (the wiring audit's B9).
 * - The receptionist's mode was worded four ways on one journey: Answer, Answer them; Never, Stay out,
 *   Paused; "Use the workspace setting", "Follow the workspace" (B15).
 * - A profile said the person's consent five times: a pill, a fact, an About row and both asks (B16).
 * - Only calls on the timeline opened anything, and nothing narrowed it (B17); a list chip was text (B18).
 * - "All clients", "All customers" and "Customer" on a page called People (B19).
 * - A visit on a row or a profile opened the profile, or nothing, instead of that day (B26).
 * Run against the contracts and the pages, the People surface over a fake wire, on a stub React.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import * as contracts from "@chanlytics/contracts";

// A namespace, not named imports: a word or a filter this slice adds is missing from the module until it
// lands, and a named import of it would fail the whole file rather than the test that needs it.
const { CONSENT_SOURCES, attentionRow, mayReceive, offersYesRefusal, stateOf, toPersonRowVM, toPersonVM } = contracts;
const filterTimeline = (items, id) => contracts.filterTimeline(items, id);

const TID = "t-salon";
const ZONE = "America/New_York";
const H = 3_600_000;
const D = 24 * H;
const NOW = Date.now();
const iso = (ms) => new Date(NOW - ms).toISOString();
const ahead = (ms) => new Date(NOW + ms).toISOString();

/** A person the People read returns, the shape people-vm.test.mjs pins (as people-honest.test.mjs copies it). */
const row = (over = {}) => ({
  id: "p1", display_name: "Daniela Reyes", wa_profile_name: null, phone_e164: "+17865550181",
  consent: "opted_in", consent_source: "in_person", consent_updated_at: iso(2 * D),
  marketing_consent: "unknown", marketing_consent_source: null, marketing_consent_updated_at: null,
  dnc: false, channels: ["whatsapp"], conversation_count: 1, escalation_count: 1, needs_human: true,
  open_escalation_reason: "human_token", open_escalation_since: iso(2 * H), latest_conversation_id: "cv1", latest_state: "open",
  latest_paused_until: null, latest_assignee_user_id: null, latest_snooze_until: null,
  latest_wa_inbound_at: iso(3 * H), last_message_at: iso(3 * H), last_message_direction: "inbound", last_message_sender: "customer",
  last_inbound_text: "Can I move Saturday to 11?", last_inbound_at: iso(3 * H), last_call_at: null, call_count: 0, call_seconds: 0,
  first_contact_at: iso(60 * D), earliest_row_at: iso(60 * D), has_backfill: false, has_chat: true, queued_reply_at: null,
  ...over,
});
/** A booking two days ahead, as the calendar match attaches it (calendar-people.test.mjs). */
const NEXT = { id: "b1:1", start: ahead(2 * D), end: ahead(2 * D + 2 * H), title: "Color", all_day: false, via: "phone" };
const VISITS = { timezone: ZONE, source: "Google Calendar", state: "ok", next: NEXT, last: null };
/** A profile's detail, as the contacts/[id] route returns it. */
const detail = (over = {}) => ({
  row: row({ visits: VISITS }),
  identities: [],
  conversations: [{
    id: "cv1", state: "open", paused_until: null, last_wa_inbound_at: iso(3 * H), last_message_at: iso(3 * H),
    contact: { id: "p1", display_name: "Daniela Reyes", wa_profile_name: null, phone_e164: "+17865550181", consent: "opted_in", dnc: false },
    messages: [{ id: "m1", conversation_id: "cv1", direction: "inbound", sender: "customer", type: "text", body: "Can I move Saturday to 11?", media: null, meta: null, status: "received", created_at: iso(3 * H) }],
  }],
  calls: [],
  escalations: [{ id: "e1", reason: "human_token", details: null, state: "open", created_at: iso(2 * H), conversation_id: "cv1" }],
  decisions: [],
  receptionist_mode: "ask",
  workspace_reply_mode: "auto",
  visits: { ...VISITS, all: [NEXT] },
  ...over,
});

/* ------------------------------- the words, in contracts ------------------------------- */

test("REGRESSION (B15): the receptionist's mode has one set of words, a word for following the workspace among them", () => {
  assert.deepEqual(contracts.PERSON_MODE_WORDS, { auto: "Answer", ask: "Ask me first", never: "Never", inherit: "Follow the workspace" });
  assert.equal(stateOf("mode", "inherit").label, "Follow the workspace", "the pill says it too");
  assert.equal(toPersonRowVM(row({ needs_human: false, open_escalation_reason: null, effective_reply_mode: "ask" }), ZONE, new Date(NOW)).receptionist.label, "Held for you, set to Ask me first", "REGRESSION: a state said Ask of a mode called Ask me first");
  const held = toPersonVM(detail({ row: row({ needs_human: false, open_escalation_reason: null, effective_reply_mode: "never" }), escalations: [], receptionist_mode: "never" }), ZONE, new Date(NOW));
  const tile = held.facts.find((f) => f.label === "Receptionist");
  assert.deepEqual([tile.value, tile.meta], ["Held for you", "set to Never"], "REGRESSION: the tile said Paused, and 'held for you, set to never' under it");
});

test("REGRESSION (B16): a profile's facts and About rail no longer repeat consent -- the asks say it, and say how it was given", () => {
  const vm = toPersonVM(detail(), ZONE, new Date(NOW));
  assert.ok(!vm.facts.some((f) => f.label === "Consent"), `facts: ${vm.facts.map((f) => f.label)}`);
  assert.ok(!vm.about.some((a) => a.k === "Consent"), `about: ${vm.about.map((a) => a.k)}`);
});

test("REGRESSION (B17): every message, escalation and visit on the timeline opens its thread or its day, and the timeline narrows by kind", () => {
  const vm = toPersonVM(detail(), ZONE, new Date(NOW));
  const day = toPersonRowVM(row({ visits: VISITS }), ZONE, new Date(NOW)).nextVisitDate;
  const of = (kind) => vm.timeline.find((i) => i.kind === kind);
  assert.equal(of("customer").link?.to, "inbox/th-cv1", "REGRESSION: only calls linked");
  assert.equal(of("escalation").link?.to, "inbox/th-cv1");
  assert.equal(of("visit").link?.to, `calendar/${day}`, "a visit opens its day on the Calendar");
  assert.deepEqual(contracts.TIMELINE_FILTERS?.map((f) => f.id), ["all", "messages", "calls", "visits", "consent"]);
  assert.deepEqual(filterTimeline(vm.timeline, "visits").map((i) => i.kind), ["visit"]);
  assert.deepEqual([...new Set(filterTimeline(vm.timeline, "messages").map((i) => i.kind))].sort(), ["customer", "escalation"]);
  assert.equal(filterTimeline(vm.timeline, "all").length, vm.timeline.length);
});

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
  location: { pathname: "/w/salon", hash: "#/clients", origin: "https://app.chanlytics.com", assign() {}, replace() {}, reload() {} },
  history: { replaceState: (_s, _t, hash) => { globalThis.window.location.hash = hash; } },
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

/** The People read over a fake wire: these people, a calendar that reads, one saved list. */
const wire = (people, lists = []) => {
  globalThis.window.fetch = async (url) => {
    const u = new URL(String(url), "https://app.chanlytics.com");
    if (u.pathname === "/api/v1/contacts") return json(200, { ok: true, data: { people, page: { q: null, offset: 0, limit: 1000, total: people.length, has_more: false }, calendar: { state: "ok", source: "Google Calendar" }, booking_link: null } });
    if (u.pathname === "/api/v1/segments") return json(200, { ok: true, data: { lists } });
    if (u.pathname === "/api/v1/views") return json(200, { ok: true, data: { views: {} } });
    return json(404, { ok: false, error: { code: "not_found", message: `no ${u.pathname}` } });
  };
};

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
// Menus and questions as their props, and hookless stand-ins, so the stub's hook order holds.
for (const k of ["MoreMenu", "Confirm", "ChannelGlyph", "TempBar", "ClientTag"]) globalThis[k] = () => null;
globalThis.useHotkey = () => {};
Object.assign(globalThis.window, {
  usePPToast: () => [null, () => {}],
  AttnRow: () => null,
  CHANLY: { nav: (to) => went.push(to), R: { thread: (id) => `inbox/${id}`, segment: (id) => `segments/${id}` } },
  __chrome: { state: stateOf },
  __ME: { role: "owner" },
  __consentSources: CONSENT_SOURCES,
  __offersYesSources: CONSENT_SOURCES.filter((s) => offersYesRefusal(s.id) === null),
  __mayReceive: mayReceive,
});
// The bridge's own globals for a profile, the timeline's filters among them; and no view saved over the wire.
const { installPeopleCourier } = await import("../../../apps/dashboard/src/legacy-bridge/people-detail.ts");
installPeopleCourier();
delete globalThis.window.__saveView;
await import("../../../apps/dashboard/src/legacy/pages/clients-a.jsx");
await import("../../../apps/dashboard/src/legacy/pages/client-profile.jsx");

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
const press = (node) => node.props.onClick({ stopPropagation() {}, preventDefault() {} });

/** The People page over the real surface. */
const peoplePage = async (people, lists = []) => {
  wire(people, lists);
  await quietly(() => peopleOverride.apply());
  cells = [];
  went.length = 0;
  for (const k of Object.keys(listeners)) delete listeners[k];
  return () => { seq = 0; return globalThis.window.ClientsA({ onOpenProfile: (id) => went.push(`profile:${id}`) }); };
};
/** A loaded profile: the load effect run, then drawn again. */
const profile = async (vm) => {
  globalThis.window.__personDetail = async () => vm;
  cells = [];
  went.length = 0;
  const draw = () => { seq = 0; return globalThis.window.ClientProfile({ id: vm.id, onBack: () => went.push("back") }); };
  draw();
  await settle();
  return draw;
};

/* ----------------------------------- the People page ----------------------------------- */

test("REGRESSION (B9): a row says why someone needs you, and their last words -- the reason and the words were computed and never drawn", async () => {
  const dto = row();
  const draw = await peoplePage([dto]);
  const tree = draw();
  const tr = find(tree, (n) => n.type === "tr" && n.props?.id === "person-p1");
  const vm = toPersonRowVM(dto, ZONE, new Date());
  const a = attentionRow(vm, ZONE, Date.now());
  assert.ok(vm.stateDetail, "the fixture needs you, for a reason");
  assert.ok(textOf(byTestId(tr, "row-state-detail")).includes(vm.stateDetail), `the reason beside the state: ${textOf(tr)}`);
  assert.equal(textOf(byTestId(tr, "row-words")), `“${a.sentence}”`, "their words, as the attention strip says them");
});

test("REGRESSION (B19): People's table is titled for everyone and its first column for a person -- it said All customers and Customer", async () => {
  const draw = await peoplePage([row()]);
  const tree = draw();
  assert.ok(all(tree, (n) => n.props?.className === "cl-section-title").some((n) => textOf(n) === "Everyone"), "REGRESSION: All customers");
  assert.equal(textOf(find(tree, (n) => n.type === "th" && n.props?.className?.includes("sortable"))).replace(/[▲▼]/g, ""), "Person", "REGRESSION: Customer");
});

test("REGRESSION (B26): a row's visit opens that day on the Calendar -- a press on it opened the profile", async () => {
  const dto = row({ visits: VISITS });
  const draw = await peoplePage([dto]);
  const tree = draw();
  const open = byTestId(tree, "row-visit-open");
  assert.ok(open, "the visit is a door of its own");
  press(open);
  assert.deepEqual(went, [`calendar/${toPersonRowVM(dto, ZONE, new Date()).nextVisitDate}`]);
});

test("REGRESSION (B15): the bulk bar's receptionist menu uses the one set of words -- it said Answer them and Stay out", async () => {
  const draw = await peoplePage([row(), row({ id: "p2", display_name: "Ana Ruiz", phone_e164: "+17865550182", latest_conversation_id: "cv2" })]);
  globalThis.window.__setPersonReceptionistMany = async () => ({ ok: true, done: 2, failed: 0 });
  let tree = draw();
  byTestId(tree, "select-all").props.onChange();
  tree = draw();
  const menu = find(tree, (n) => n.props?.label === "Receptionist");
  assert.deepEqual(menu.props.items.filter((i) => !i.header).map((i) => i.label), ["Answer", "Ask me first", "Never", "Follow the workspace"]);
});

/* ------------------------------------- the profile ------------------------------------- */

test("REGRESSION (B19, B15): a profile goes back to People, and names following the workspace the way the menu does", async () => {
  const draw = await profile(toPersonVM(detail(), ZONE, new Date(NOW)));
  const tree = draw();
  assert.equal(textOf(find(tree, (n) => n.props?.className === "cl-prof-back")).trim(), "People", "REGRESSION: All clients");
  const mode = byTestId(tree, "receptionist-mode");
  assert.deepEqual(all(mode, (n) => n.props?.className?.includes("cl-prof-aut-seg")).map((b) => textOf(b)), ["Answer", "Ask me first", "Never"]);
  assert.ok(textOf(mode).includes("Follow the workspace"), `REGRESSION: "Use the workspace setting": ${textOf(mode)}`);
  const following = await profile(toPersonVM(detail({ receptionist_mode: null }), ZONE, new Date(NOW)));
  assert.ok(textOf(byTestId(following(), "receptionist-mode")).includes("Following the workspace (Answer)."), "a person on the workspace's setting says so in the same words");
});

test("REGRESSION (B16): the profile's facts and About rail draw no consent; the two asks do", async () => {
  const draw = await profile(toPersonVM(detail(), ZONE, new Date(NOW)));
  const tree = draw();
  assert.ok(!all(tree, (n) => n.type === globalThis.StatCell).some((c) => c.props.label === "Consent"), "no Consent tile");
  assert.ok(!all(tree, (n) => n.props?.className === "cl-prof-attr-key").some((k) => textOf(k) === "Consent"), "no Consent row in About");
  assert.ok(byTestId(tree, "consent-control") || find(tree, (n) => n.props?.testid === "consent-control"), "the ask about their visit is still there");
});

test("REGRESSION (B17): the timeline narrows by kind, and each linked item opens its thread or its day -- only calls opened anything", async () => {
  const vm = toPersonVM(detail(), ZONE, new Date(NOW));
  const draw = await profile(vm);
  let tree = draw();
  assert.ok(byTestId(tree, "timeline-filter-all") && byTestId(tree, "timeline-filter-messages") && byTestId(tree, "timeline-filter-visits"), "a filter for each kind the timeline holds");
  assert.equal(byTestId(tree, "timeline-filter-calls"), null, "and none for a kind it does not");
  for (const open of all(tree, (n) => n.props?.["data-testid"] === "timeline-open")) press(open);
  const day = toPersonRowVM(row({ visits: VISITS }), ZONE, new Date(NOW)).nextVisitDate;
  assert.ok(went.includes("inbox/th-cv1") && went.includes(`calendar/${day}`), `the doors: ${went}`);
  press(byTestId(tree, "timeline-filter-visits"));
  tree = draw();
  assert.equal(all(tree, (n) => String(n.props?.className || "").split(" ").includes("cl-tl-row")).length, 1, "only the visit is drawn");
  const timeline = find(tree, (n) => typeof n.type === "function" && n.type.name === "PersonTimeline");
  assert.deepEqual(filterTimeline(timeline.props.items, timeline.props.filter).map((i) => i.kind), ["visit"], "Visits shows the visits");
});

test("REGRESSION (B26): the profile's next visit opens that day on the Calendar -- the tile opened nothing", async () => {
  const draw = await profile(toPersonVM(detail(), ZONE, new Date(NOW)));
  const tree = draw();
  const open = byTestId(tree, "fact-next-visit");
  assert.ok(open, "the next visit is a door");
  press(open);
  assert.deepEqual(went, [`calendar/${toPersonRowVM(row({ visits: VISITS }), ZONE, new Date(NOW)).nextVisitDate}`]);
});

test("REGRESSION (B18): a list chip on a profile opens its list -- the name was text", async () => {
  await peoplePage([row()], [{ id: "s1", name: "Regulars", ids: ["p1"] }]);
  cells = []; seq = 0;
  const lists = globalThis.window.PersonLists({ personId: "p1", canEdit: true, first: "Daniela", flash: () => {} });
  const open = byTestId(lists, "person-list-open");
  assert.ok(open && textOf(open).includes("Regulars"), "the name is a door");
  press(open);
  assert.deepEqual(went, ["clients/list:s1"], "the list, picked, on People -- the Lists page folded into it");
});

test("REGRESSION: a person's page says who they are once -- the header held two buttons to one thread and two pills, a card quoted the timeline's first two messages, and six cells said the rail again", async () => {
  const vm = toPersonVM(detail({ booking_link: "https://book.example/salon" }), ZONE, new Date(NOW));
  const draw = await profile(vm);
  const tree = draw();
  const cls = (n) => String(n.props?.className || "");

  // Who they are: the name, then one line with the number and since when.
  const line = byTestId(tree, "person-id-line");
  assert.ok(line && textOf(line).includes(vm.phone) && textOf(line).includes("since "), `the line under the name: ${line && textOf(line)}`);
  const id = find(tree, (n) => cls(n) === "cl-prof-id");
  assert.deepEqual(
    all(id, (n) => n.type === "button").map((b) => b.props["data-testid"]),
    ["person-rename"],
    "REGRESSION: between 901 and 1250px the header's buttons kept their width and the name's column went to zero",
  );
  assert.equal(all(id, (n) => typeof n.type === "function" && n.type.name === "StatePill").length, 0, "REGRESSION: two pills Right now and the rail already say");

  // One way to the thread, in Right now, with the booking link beside it.
  const threadButtons = all(tree, (n) => n.type === "button" && /^(Open thread|Open in Inbox|Open the thread)$/.test(textOf(n).trim()));
  assert.equal(threadButtons.length, 1, "REGRESSION: Open thread in the header and Open in Inbox in Right now went to the same thread");
  assert.equal(textOf(threadButtons[0]).trim(), "Open the thread", "one door, one label: the card said Open in Inbox and the header said Open thread");
  const actions = find(tree, (n) => cls(n) === "cl-prof-queue-actions");
  assert.ok(byTestId(actions, "person-open-thread") && byTestId(actions, "text-booking-link"), "the action lives beside what needs doing");

  assert.ok(!find(tree, (n) => cls(n) === "cl-prof-narr"), "REGRESSION: Last exchange quoted the two messages the timeline opens on");
  assert.ok(!find(tree, (n) => cls(n).includes("cl-prof-money")), "REGRESSION: six cells said the rail's facts again");

  // About carries the strip's counts, and not what the line under the name says.
  const keys = all(tree, (n) => n.props?.className === "cl-prof-attr-key").map((k) => textOf(k));
  assert.ok(keys.includes("History"), `About: ${keys}`);
  for (const k of ["Phone", "Channels", "First contact"]) assert.ok(!keys.includes(k), `${k} is said under the name, not again in About: ${keys}`);
  assert.ok(byTestId(tree, "fact-next-visit"), "the next visit still opens its day, from About");

  assert.ok(!textOf(tree).includes("· receptionist"), "REGRESSION: every receptionist entry read Receptionist · receptionist");
});

test("someone who said stop keeps their way into the thread, and is offered no booking link", async () => {
  const vm = toPersonVM(detail({
    row: row({ visits: VISITS, consent: "opted_out", needs_human: false, open_escalation_reason: null, open_escalation_since: null, escalation_count: 0 }),
    escalations: [],
    receptionist_mode: null,
    booking_link: "https://book.example/salon",
  }), ZONE, new Date(NOW));
  assert.equal(vm.rightNow.cta, null, "the silent case: Right now has no button of its own");
  assert.ok(vm.openThread, "and they do have a thread");
  const draw = await profile(vm);
  const tree = draw();
  const actions = find(tree, (n) => String(n.props?.className || "") === "cl-prof-queue-actions");
  const open = byTestId(actions, "person-open-thread");
  assert.equal(open && textOf(open).trim(), "Open the thread", "the header's Open thread was their only way in");
  press(open);
  assert.deepEqual(went, [vm.openThread]);
  assert.equal(byTestId(tree, "text-booking-link"), null, "REGRESSION: a booking link sat under 'Silent, they opted out'");
});

/* ------------------------ the pass over the page: every row a door, said once ------------------------ */

test("the timeline's linked rows are the doors themselves -- a message's door hid in its time, a button that looked like a timestamp", async () => {
  const vm = toPersonVM(detail(), ZONE, new Date(NOW));
  // The bridge's window.__href is the API URL builder (inbox-verbs.ts): "GET contacts/export" in, a URL out, and a
  // route string in throws on its route table. The page once built its row hrefs through it and every person's
  // page fell over in production (the error surface: can't access property "path"). Installed here as it behaves.
  globalThis.window.__href = (key) => { const routes = {}; return routes[key].path; };
  let tree;
  try {
    const draw = await profile(vm);
    tree = draw();
  } finally {
    delete globalThis.window.__href;
  }
  const doors = all(tree, (n) => n.props?.["data-testid"] === "timeline-open");
  for (const d of doors) assert.match(d.props.href, /^#\/(inbox|calendar)\//, `a hash route, the app's own: ${d.props.href}`);
  assert.ok(doors.length >= 2, "the message and the escalation open somewhere");
  for (const d of doors) {
    assert.equal(d.type, "a", "a row that goes somewhere is a link, so it has a URL and a keyboard reaches it");
    assert.ok(d.props.href, "with an href");
    assert.ok(String(d.props.className).includes("cl-tl-row"), "and it is the row, not a control inside it");
    assert.equal(all(d, (n) => n.type === "button").length, 0, "REGRESSION: a button inside the row, 44px tall on a touch screen");
  }
  const heads = all(tree, (n) => n.props?.className === "cl-tl-day");
  assert.ok(heads.length >= 1, "the day sits above its rows");
  const rows = all(tree, (n) => String(n.props?.className || "").includes("cl-tl-row"));
  for (const r of rows) assert.equal(all(r, (n) => n.props?.className === "cl-tl-day").length, 0, "the day is not inside a row, so the rail line stops under it");
  went.length = 0;
  press(doors.find((d) => /inbox\//.test(d.props.href)));
  assert.deepEqual(went, ["inbox/th-cv1"], "a press opens the thread");
});

test("a long record folds past twenty rows, and a fold of three is not worth a press", async () => {
  const many = Array.from({ length: 30 }, (_, i) => ({
    id: `m${i}`, conversation_id: "cv1", direction: i % 2 ? "outbound" : "inbound", sender: i % 2 ? "assistant" : "customer",
    type: "text", body: `Message ${i}`, media: null, meta: null, status: i % 2 ? "sent" : "received", created_at: iso((3 + i) * H),
  }));
  const d = detail();
  const vm = toPersonVM({ ...d, conversations: [{ ...d.conversations[0], messages: many }] }, ZONE, new Date(NOW));
  assert.ok(vm.timeline.length > 23, `the fixture is long: ${vm.timeline.length}`);
  const draw = await profile(vm);
  let tree = draw();
  const rowsOf = (t) => all(t, (n) => String(n.props?.className || "").split(" ").includes("cl-tl-row")).length;
  assert.equal(rowsOf(tree), 20, "twenty newest rows, then the fold");
  const older = byTestId(tree, "timeline-older");
  assert.equal(textOf(older).trim(), `Show ${vm.timeline.length - 20} older`, "the fold says how many wait behind it");
  press(older);
  tree = draw();
  assert.equal(rowsOf(tree), vm.timeline.length, "one press shows the whole record");
  assert.equal(byTestId(tree, "timeline-older"), null);
  // Twenty-two rows: no fold for two.
  const few = toPersonVM({ ...d, conversations: [{ ...d.conversations[0], messages: many.slice(0, 22 - (vm.timeline.length - 30)) }] }, ZONE, new Date(NOW));
  const tree2 = (await profile(few))();
  assert.equal(rowsOf(tree2), few.timeline.length, `${few.timeline.length} rows, all drawn`);
  assert.equal(byTestId(tree2, "timeline-older"), null, "a fold of three rows is not worth a press");
});

test("Right now says the state once: the pill wears the standing's word, the sentence gives the reason, and the receptionist is named once", async () => {
  const vm = toPersonVM(detail(), ZONE, new Date(NOW));
  assert.equal(vm.rightNow.tone, "escalated");
  assert.match(vm.rightNow.detail, /^Asked for a person · since .*\. Paused until someone answers\.$/, vm.rightNow.detail);
  const draw = await profile(vm);
  const tree = draw();
  const card = find(tree, (n) => String(n.props?.className || "").includes("cl-prof-now"));
  assert.equal(card.props["data-tone"], "escalated", "the card wears the tone the pill wears");
  assert.ok(!String(card.props.className).includes("approval"), "REGRESSION: an accent edge on a card whose pill is warn");
  const pill = find(card, (n) => typeof n.type === "function" && n.type.name === "StatePill");
  assert.equal(pill.props.value, "escalated");
  assert.equal(pill.props.label, undefined, "REGRESSION: the pill carried the whole title -- Escalated · asked for a person -- and spilled past the card between 901 and 990px");
  const words = textOf(card);
  assert.equal((words.match(/eceptionist/g) || []).length, 1, `the receptionist is named once on the card: ${words}`);
  assert.ok(!words.includes("Escalated"), `the state is the pill's word, not said again in the sentence: ${words}`);
});

test("a viewer reads the role once, at the top of the rail -- it was said under every locked control", async () => {
  globalThis.window.__ME = { role: "viewer" };
  try {
    const vm = toPersonVM(detail(), ZONE, new Date(NOW));
    const tree = (await profile(vm))();
    assert.ok(byTestId(tree, "person-role-note"), "the note");
    const words = textOf(tree);
    assert.equal((words.match(/owner or operator/g) || []).length, 1, `once: ${words.match(/[^.]*owner or operator[^.]*\./g)}`);
    assert.equal(all(tree, (n) => n.props?.className?.includes("cl-prof-aut-seg") && !n.props.disabled).length, 0, "and every segment is locked");
  } finally {
    globalThis.window.__ME = { role: "owner" };
  }
});

test("arming a consent answer does not draw it as the answer on record, and the how is a row of chips", async () => {
  const vm = toPersonVM(detail(), ZONE, new Date(NOW));
  const draw = await profile(vm);
  let tree = draw();
  const ask = byTestId(tree, "consent-marketing");
  const yes = find(ask, (n) => n.type === "button" && textOf(n).trim() === "Yes");
  assert.ok(!String(yes.props.className).includes("active") && yes.props["aria-pressed"] === false, "not asked yet: Yes is not the record");
  press(yes);
  tree = draw();
  const armed = find(byTestId(tree, "consent-marketing"), (n) => n.type === "button" && textOf(n).trim() === "Yes");
  assert.ok(String(armed.props.className).includes("armed"), "armed");
  assert.ok(!String(armed.props.className).includes("active"), "REGRESSION: an armed pick was drawn as the answer on record before anything was written");
  assert.equal(armed.props["aria-pressed"], false, "and the record, for a reader, is unchanged");
  const how = byTestId(tree, "consent-marketing-how");
  assert.deepEqual(all(how, (n) => n.props?.className === "cl-prof-how-chip").map((n) => textOf(n).trim()), ["Sign-up form", "Their own message"], "the written ways, as chips");
  assert.equal(find(tree, (n) => n.props?.className === "cl-prof-autonomy" && byTestId(n, "consent-marketing-how")), null, "REGRESSION: the how sat as a fourth cell in the three-button grid");
});

test("a frame with nobody to draw has no rail column; History leads About; ten seconds on the phone is not one minute", async () => {
  globalThis.window.__personDetail = async () => null;
  cells = [];
  const frame = () => { seq = 0; return globalThis.window.ClientProfile({ id: "p-none", onBack: () => went.push("back") }); };
  frame();
  await settle();
  const missing = frame();
  assert.ok(String(find(missing, (n) => String(n.props?.className || "").includes("cl-profile")).props.className).includes("cl-profile--solo"), "REGRESSION: an empty 320px column beside 'This person is not in your workspace'");
  assert.equal(all(missing, (n) => n.type === "button").length, 1, "one way back, not two");

  const vm = toPersonVM(detail({ row: row({ visits: VISITS, call_count: 1, call_seconds: 12 }) }), ZONE, new Date(NOW));
  const tree = (await profile(vm))();
  const keys = all(tree, (n) => n.props?.className === "cl-prof-attr-key").map((k) => textOf(k));
  assert.equal(keys[0], "History", `History leads: ${keys}`);
  const history = find(tree, (n) => n.props?.className === "cl-prof-attr" && textOf(find(n, (k) => k.props?.className === "cl-prof-attr-key")) === "History");
  assert.match(textOf(history), /1 call, 12 s/, textOf(history));
});

test("a person known by number is invited to name them; an empty Lists section is a door to Lists", async () => {
  const vm = toPersonVM(detail({ row: row({ visits: VISITS, display_name: null, wa_profile_name: null }) }), ZONE, new Date(NOW));
  assert.equal(vm.givenName, null);
  const saved = globalThis.window.__PEOPLE;
  globalThis.window.__PEOPLE = { ...(saved || {}), saved: [], savedRead: true };
  try {
    const tree = (await profile(vm))();
    const rename = byTestId(tree, "person-rename");
    assert.equal(textOf(rename).trim(), "Name them", "REGRESSION: a pencil at opacity 0 until hover, which a phone never has");
    assert.ok(String(rename.props.className).includes("is-plain"));
    const lists = byTestId(tree, "person-lists");
    assert.match(textOf(lists), /No lists yet\./);
    went.length = 0;
    press(byTestId(lists, "person-lists-make"));
    assert.deepEqual(went, ["clients"], "REGRESSION: 'make one on the People rail' -- a rail a phone does not have; the door lands on People with the box opening");
  } finally {
    globalThis.window.__PEOPLE = saved;
  }
});

/* ----------------------------------- the address (00125) ----------------------------------- */

/** A profile drawn with the bridge's save replaced by a recorder that answers as told. */
const profileSaving = async (vm, answer = { ok: true, data: {} }) => {
  const sent = [];
  const saved = { details: globalThis.window.__setPersonDetails, why: globalThis.window.__whyNotAnEmail };
  globalThis.window.__setPersonDetails = async (id, body) => { sent.push([id, body]); return answer; };
  globalThis.window.__whyNotAnEmail = contracts.whyNotAnEmail;
  const draw = await profile(vm);
  const restore = () => { globalThis.window.__setPersonDetails = saved.details; globalThis.window.__whyNotAnEmail = saved.why; };
  return { draw, sent, restore };
};
const type = (input, value) => input.props.onChange({ target: { value } });

test("a person's email address is said once, in About, and added there: the row is its own control, and what is wrong with a typed address is said under the field before anything is sent", async () => {
  const vm = toPersonVM(detail({ row: row({ visits: VISITS, email: null }) }), ZONE, new Date(NOW));
  assert.equal(vm.email, null);
  const { draw, sent, restore } = await profileSaving(vm);
  try {
    let tree = draw();
    const keys = all(tree, (n) => n.props?.className === "cl-prof-attr-key").map((k) => textOf(k));
    assert.deepEqual(keys.slice(0, 2), ["History", "Email"], `someone who may change it gets the row while it is empty: ${keys}`);
    const add = byTestId(tree, "person-email-edit");
    assert.equal(textOf(add).trim(), "Add an email", "an empty address is an invitation, not a bare pencil");
    press(add);
    tree = draw();
    const input = byTestId(tree, "person-email-input");
    assert.ok(input, "the row becomes the field");
    type(input, "ana.example.com");
    tree = draw();
    press(byTestId(tree, "person-email-save"));
    await settle();
    tree = draw();
    assert.match(textOf(byTestId(tree, "person-email-problem")), /missing the @/, "which kind of not-an-address, under the field");
    assert.deepEqual(sent, [], "and nothing went over the wire");
    type(byTestId(tree, "person-email-input"), "  Ana@Example.com ");
    tree = draw();
    assert.equal(byTestId(tree, "person-email-problem"), null, "typing clears what was said about the last attempt");
    press(byTestId(tree, "person-email-save"));
    await settle();
    assert.deepEqual(sent, [["p1", { email: "Ana@Example.com" }]], "the typed address, trimmed; the route and the door decide its stored spelling");
  } finally { restore(); }
});

test("an address that is there shows with a quiet pencil; the door's refusal is said under the field, in its own words; someone who may only read sees the address and no control, or no row at all", async () => {
  const vm = toPersonVM(detail({ row: row({ visits: VISITS, email: "ana@example.com" }) }), ZONE, new Date(NOW));
  assert.equal(vm.email, "ana@example.com");
  assert.ok(vm.about.some((a) => a.k === "Email" && a.v === "ana@example.com"), "About carries it from the contract");
  const taken = "Another person here already has that address.";
  const { draw, sent, restore } = await profileSaving(vm, { ok: false, code: "conflict", message: taken });
  try {
    let tree = draw();
    assert.equal(textOf(find(tree, (n) => n.props?.className === "cl-prof-email-val")), "ana@example.com");
    const edit = byTestId(tree, "person-email-edit");
    assert.equal(textOf(edit).trim(), "", "a pencil, not an invitation");
    press(edit);
    tree = draw();
    assert.equal(byTestId(tree, "person-email-input").props.value, "ana@example.com", "the field opens on what is stored");
    type(byTestId(tree, "person-email-input"), "bo@example.com");
    tree = draw();
    press(byTestId(tree, "person-email-save"));
    await settle();
    tree = draw();
    assert.deepEqual(sent, [["p1", { email: "bo@example.com" }]]);
    assert.equal(textOf(byTestId(tree, "person-email-problem")), taken);
    assert.ok(byTestId(tree, "person-email-input"), "and the field stays open on what was typed");
  } finally { restore(); }

  const me = globalThis.window.__ME;
  globalThis.window.__ME = { role: "viewer" };
  try {
    const withOne = (await profile(vm))();
    assert.equal(textOf(byTestId(withOne, "person-email")), "ana@example.com");
    assert.equal(byTestId(withOne, "person-email-edit"), null, "a viewer reads it");
    const without = (await profile(toPersonVM(detail({ row: row({ visits: VISITS, email: null }) }), ZONE, new Date(NOW))))();
    assert.equal(byTestId(without, "person-email"), null, "and with no address there is no empty row to read");
  } finally { globalThis.window.__ME = me; }
});

test("a person with an address and no number or name is called by the address everywhere, is invited to be named, and their thread's line says the address instead of 'no phone'", async () => {
  const dto = row({ display_name: null, wa_profile_name: null, phone_e164: null, email: "ana@example.com", channels: [], has_chat: false, conversation_count: 0, escalation_count: 0, needs_human: false, open_escalation_reason: null, latest_conversation_id: null, last_inbound_text: null, last_message_at: null });
  const vm = toPersonRowVM(dto, ZONE, new Date(NOW));
  assert.equal(vm.name, "ana@example.com", "REGRESSION: 'Unknown' for a person whose only identifier is an address");
  assert.equal(vm.phone, null);
  assert.equal(contracts.personName({ display_name: null, wa_profile_name: null, phone_e164: null }), "Unknown", "a person with nothing is still nobody");
  assert.equal(contracts.isIdentifierName("ana@example.com"), true);
  assert.equal(contracts.isIdentifierName("+1 (786) 555-0181"), true);
  assert.equal(contracts.isIdentifierName("Ana Reyes"), false);

  const draw = await peoplePage([dto]);
  const tr = find(draw(), (n) => n.type === "tr" && n.props?.id === "person-p1");
  assert.ok(byTestId(tr, "row-name-them"), "named by an identifier: the row invites a name");
  assert.equal(find(tr, (n) => n.type === "Icon" && n.props?.name === "mail") !== null, true, "an envelope, not a handset");

  const conv = { contact: { id: "p1", display_name: null, wa_profile_name: null, phone_e164: null, email: "ana@example.com" } };
  assert.equal(contracts.contactName(conv), "ana@example.com");
  assert.equal(contracts.contactMeta(conv), "WhatsApp · no name saved", "the identifier IS the name, so the line says that instead of repeating it");
  assert.equal(contracts.contactMeta({ contact: { ...conv.contact, display_name: "Ana Reyes" } }), "WhatsApp · ana@example.com", "REGRESSION: 'no phone' under a person who has an address");
  assert.equal(contracts.contactMeta({ contact: { ...conv.contact, display_name: "Ana Reyes", email: null } }), "WhatsApp · no phone");
});

/* ------------------------------- their own message (00137) ------------------------------- */

/** A profile whose two consent doors are recorders that answer yes, in a real workspace whichever test ran first. */
const profileRecording = async (vm) => {
  globalThis.window.__PEOPLE ??= { saved: [], savedRead: true };
  const sent = [];
  const saved = { visit: globalThis.window.__setPersonConsent, offers: globalThis.window.__setPersonMarketingConsent };
  globalThis.window.__setPersonConsent = async (id, body) => { sent.push(["visit", id, body]); return { ok: true, data: {} }; };
  globalThis.window.__setPersonMarketingConsent = async (id, body) => { sent.push(["offers", id, body]); return { ok: true, data: {} }; };
  const draw = await profile(vm);
  const restore = () => { globalThis.window.__setPersonConsent = saved.visit; globalThis.window.__setPersonMarketingConsent = saved.offers; };
  return { draw, sent, restore };
};
const said = (id, hoursAgo, body, over = {}) => ({ id, conversation_id: "cv1", direction: "inbound", sender: "customer", channel: "whatsapp", type: "text", body, media: null, meta: null, status: "received", created_at: iso(hoursAgo * H), ...over });
const reply = (id, hoursAgo, body) => said(id, hoursAgo, body, { direction: "outbound", sender: "ai", status: "sent" });
const withMessages = (messages) => { const d = detail(); return toPersonVM({ ...d, conversations: [{ ...d.conversations[0], messages }] }, ZONE, new Date(NOW)); };
const segment = (tree, ask, word) => find(byTestId(tree, ask), (n) => n.type === "button" && textOf(n).trim() === word);
const way = (tree, ask, word) => find(byTestId(tree, `${ask}-how`), (n) => n.type === "button" && textOf(n).trim() === word);

test("their own message is chosen from what they wrote: the way opens their recent messages, and the one pressed is the one recorded", async () => {
  const vm = withMessages([said("m1", 5, "Can I move Saturday to 11?"), reply("m2", 4, "Sure, 11 works."), said("m3", 1, "And yes, send me your offers", { channel: "sms" })]);
  const { draw, sent, restore } = await profileRecording(vm);
  try {
    let tree = draw();
    press(segment(tree, "consent-marketing", "Yes"));
    tree = draw();
    press(way(tree, "consent-marketing", "Their own message"));
    tree = draw();
    assert.deepEqual(sent, [], "choosing the way writes nothing");
    const how = byTestId(tree, "consent-marketing-how");
    assert.match(textOf(how), /Which message\? Choose the one where they said it\./);
    const choices = all(how, (n) => n.props?.["data-testid"] === "consent-marketing-message");
    assert.deepEqual(vm.ownMessages.map((m) => m.id), ["m3", "m1"], "what they wrote, newest first; not the reply");
    assert.equal(choices.length, 2);
    vm.ownMessages.forEach((m, i) => {
      for (const part of [m.words, m.via, m.when]) assert.ok(textOf(choices[i]).includes(part), `choice ${i} says ${part}: ${textOf(choices[i])}`);
      assert.equal(choices[i].type, "button", "a choice is pressed, not read");
    });
    press(choices[0]);
    await settle();
    assert.deepEqual(sent, [["offers", "p1", { consent: "opted_in", source: "customer_message", message_id: "m3" }]], "the message pressed is the message named");
    assert.equal(byTestId(draw(), "consent-marketing-how"), null, "the ask closes once it lands");
  } finally { restore(); }
});

test("an answer given somewhere Chanlytics does not see: the picker says to record a sign-up form with a note, and one press opens it", async () => {
  const { draw, sent, restore } = await profileRecording(withMessages([said("m1", 2, "Hi there")]));
  try {
    let tree = draw();
    press(segment(tree, "consent-control", "Yes"));
    tree = draw();
    press(way(tree, "consent-control", "Their own message"));
    tree = draw();
    const elsewhere = byTestId(tree, "consent-control-elsewhere");
    assert.match(textOf(elsewhere), /somewhere Chanlytics doesn't see/);
    assert.match(textOf(elsewhere), /Record a sign-up form/);
    assert.match(textOf(elsewhere), /say where in the note/);
    press(find(elsewhere, (n) => n.type === "button"));
    tree = draw();
    assert.ok(byTestId(tree, "consent-control-note"), "the form's note, one press away");
    assert.equal(all(tree, (n) => n.props?.["data-testid"] === "consent-control-message").length, 0, "the messages give way to it");
    assert.deepEqual(sent, [], "and nothing was recorded on the way");
  } finally { restore(); }
});

test("a person who has written nothing here is offered no message, and is told the way that remains", async () => {
  const vm = withMessages([reply("m2", 4, "Sure, 11 works."), said("m4", 3, null, { type: "media", media: { mime_type: "image/jpeg" } })]);
  assert.deepEqual(vm.ownMessages, [], "a reply is ours, and a photo with nothing written on it has no words to show");
  const { draw, restore } = await profileRecording(vm);
  try {
    let tree = draw();
    press(segment(tree, "consent-marketing", "Yes"));
    tree = draw();
    press(way(tree, "consent-marketing", "Their own message"));
    tree = draw();
    const how = byTestId(tree, "consent-marketing-how");
    assert.equal(all(how, (n) => n.props?.["data-testid"] === "consent-marketing-message").length, 0);
    assert.match(textOf(how), /Nothing they've written to you is here to choose\./);
    assert.ok(byTestId(tree, "consent-marketing-elsewhere"), "and the way that remains");
  } finally { restore(); }
});

test("a sign-up form is recorded with the note that attests it: nothing is sent until the note says which form, or where", async () => {
  const { draw, sent, restore } = await profileRecording(withMessages([said("m1", 2, "Hi there")]));
  try {
    let tree = draw();
    press(segment(tree, "consent-marketing", "Yes"));
    tree = draw();
    press(way(tree, "consent-marketing", "Sign-up form"));
    tree = draw();
    assert.deepEqual(sent, [], "REGRESSION: a form was recorded the moment its chip was pressed, with nothing to say which");
    const note = byTestId(tree, "consent-marketing-note");
    assert.ok(note, "the form asks for its note");
    assert.equal(note.props.maxLength, 200, "as long as the door keeps");
    assert.equal(byTestId(tree, "consent-marketing-note-save").props.disabled, true, "and will not record without one");
    type(note, "   ");
    tree = draw();
    assert.equal(byTestId(tree, "consent-marketing-note-save").props.disabled, true, "spaces say nothing");
    type(byTestId(tree, "consent-marketing-note"), "  Slip 12, signed at the desk ");
    tree = draw();
    press(byTestId(tree, "consent-marketing-note-save"));
    await settle();
    assert.deepEqual(sent, [["offers", "p1", { consent: "opted_in", source: "form", note: "Slip 12, signed at the desk" }]]);

    // A no on a form, by Enter: the same note, the same door.
    tree = draw();
    press(segment(tree, "consent-control", "No"));
    tree = draw();
    press(way(tree, "consent-control", "Sign-up form"));
    tree = draw();
    type(byTestId(tree, "consent-control-note"), "Opt-out slip");
    tree = draw();
    byTestId(tree, "consent-control-note").props.onKeyDown({ key: "Enter", preventDefault() {} });
    await settle();
    assert.deepEqual(sent.at(-1), ["visit", "p1", { consent: "opted_out", source: "form", note: "Opt-out slip" }]);
  } finally { restore(); }
});

test("the spoken ways still record at once, with the source and nothing else", async () => {
  const { draw, sent, restore } = await profileRecording(withMessages([said("m1", 2, "Hi there")]));
  try {
    let tree = draw();
    press(segment(tree, "consent-control", "Yes"));
    tree = draw();
    press(way(tree, "consent-control", "In person"));
    await settle();
    assert.deepEqual(sent, [["visit", "p1", { consent: "opted_in", source: "in_person" }]]);
  } finally { restore(); }
});
