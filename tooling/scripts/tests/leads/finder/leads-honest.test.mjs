/**
 * The Leads scope of People: the same page, its other scope.
 *
 * Drawn the way people-honest.test.mjs draws People -- LeadsReal (surfaces/leads/page/leads-real.tsx, decision 0015 step 9:
 * People's other scope, TSX that imports) on a stub React that keeps each hook's state where its component sits, as React
 * does (_hook-frames.mjs) -- with the address's view as `leadsRoute`. Nothing is published on the window for it: People's
 * table, rail kit, hooks and words, the scope's parts, the peek, the strip and the plan panel are imported by the page
 * as the app imports them, and the kit's MoreMenu, Confirm, the peek, the strip and the plan panel are found in the drawn
 * tree by their type (recorded as they are drawn: `menus`, `confirms`, `peeks`, `strips`, `panels`).
 *
 * The WIRE is faked, never a courier: the real surface (surfaces/leads/surface.ts) reads over a fake `window.fetch`
 * that answers rows of the real shape (DTOs, with fictional values) and keeps every write as it went -- the route, the
 * body -- so a test says what the page SENT, not what a stand-in was told. leads-bridge.test.mjs proves the surface's
 * own rules (the keys, the patches, the offers) over the same kind of wire. What this file proves is the PAGE: its rail,
 * its standing line, its view, its one keyboard listener, its bulk bar, and the three classes' acts. The surface is loaded
 * for real in each test (`fresh`), because the acts change the rows the surface itself holds and the peek is drawn from
 * what it holds. The server the wire speaks for applies a write it accepts to the rows it keeps (a lead kept is qualified
 * on the next read), as the real door does, and every request is answered before the next test starts (`quiesce`): one the
 * test did not expect, or a recording or upload the page started by itself, fails the test that made it.
 *
 * The view models are contracts' own (4.1 and 4.6, already on this branch): the rows are DTOs put through
 * toLeadRowVM by the surface, and the rail and the standing line are leadRail and leadsStanding. The page's view IS the
 * address, so the route is read with the same parser the surface keys its reads by; a stand-in that derived a
 * word differently would prove nothing.
 */
import { test, afterEach } from "node:test";
import assert from "node:assert/strict";
import { legacyAddress } from "../../shell/address/_address.mjs";
import { installRoleStore, kitPages, useStubHooks } from "../../_legacy-react.mjs";
import { importSrc } from "../../_source.mjs";
import {
  LEAD_WORDS,
  ROLE_PERMS,
  leadPinTone,
  leadsRoute,
  roleGate,
  stateOf,
  toLeadRowVM,
  toPersonRowVM,
} from "@chanlytics/contracts";
import { hookFrames } from "../../_hook-frames.mjs";
import { keysDrawn } from "../../_keys.mjs";

// People's TSX, the Leads page and the surface it reads, loaded as the app's own modules are (one instance of the surface's value
// store and of its signal, which the page's hooks and this file share): the page, how many rows a table draws first, and the
// Leads surface itself -- its read of a view, its acts, and what it forgets between one test's wire and the next.
const { surfaceMoved } = await importSrc("apps/dashboard/src/legacy-bridge/surface-status.ts");
const { setSurfaceValue, surfaceValue } = await importSrc("apps/dashboard/src/surfaces/surface-values.ts");
const { PeopleReal } = await importSrc("apps/dashboard/src/surfaces/people/page/people-real.tsx");
const { PL_FIRST_ROWS } = await importSrc("apps/dashboard/src/surfaces/people/table/row-window.ts");
const { forgetLeadsViews, leadsOverride, leadsView } = await importSrc("apps/dashboard/src/surfaces/leads/surface.ts");

/** What a page reads the address through (data/constants.jsx), for the `CHANLY` this file makes up. */
const address = await legacyAddress();

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
  version: 1,
  card: "local_businesses",
  name: "personal trainers",
  asked: "personal trainers in Austin with a website, about 200",
  terms: ["personal trainer"],
  area: { kind: "city", label: "Austin, TX", state: "TX", center: null, radius_m: 25_000, query: "Austin, TX, USA" },
  count: 200,
  contact: "email",
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
  thread_id: null,
  round: {
    id: "r1",
    seq: 1,
    purpose: "main",
    state: "ended",
    ending: "target_reached",
    question: null,
    target: 200,
    counted: 161,
    qualified: 2,
    review: 1,
    excluded: 1,
    emails_checked: 88,
    with_phone: 72,
    ending_pending: false,
    waiting_since: null,
    cost_usd: 4.2,
    ended_at: "2026-09-18T16:00:00.000Z",
    undo_op_id: "op-1",
    undo_version: 3,
  },
  ...over,
});
/** The Ask thread the waiting search was planned in (00172): its answer is sent there. */
const PLANNED_THREAD = "eeeeeeee-0000-4000-8000-000000000001";
const waiting = {
  ...search({ id: SEARCH_B, name: "Chiropractors · Round Rock", thread_id: PLANNED_THREAD }),
  round: {
    ...search().round,
    id: "r2",
    state: "waiting_on_owner",
    ending: null,
    question: { sentence: "Most of the first 25 were chains. Keep leaving them out?", criterion_key: "chain" },
    counted: 25,
    waiting_since: "2026-09-18T18:00:00.000Z",
    ended_at: null,
  },
};

/** One row as `leads_page` answers it (4.6's LeadRowDto); every word the table draws is derived from it. */
const member = (over = {}) => ({
  class: "qualified",
  fit: "strong",
  reason: "Independent studio, one location, coaching only",
  excluded_by: null,
  distance_m: 1931,
  counted: true,
  checks: [],
  other_emails: [],
  ...over,
});
const leadRow = (over = {}) => ({
  id: "l1",
  search_id: SEARCH_A,
  search_name: "Personal trainers · Austin",
  place_id: "ChIJfixture0001",
  business_name: "Zilker Strength Lab",
  category: "Personal trainer",
  city: "Austin",
  state: "TX",
  street: "1200 Barton Springs Rd",
  postal_code: "78704",
  phone: "+15125550101",
  phone_agrees: true,
  phone_wrong: false,
  email: "hello@zilkerstrength.example",
  email_state: "ok",
  email_checked_at: minsAgo(5),
  website: "zilkerstrength.example",
  instagram: null,
  rating: 5,
  reviews: 16,
  stage: "ready",
  closed_reason: null,
  contact_id: null,
  last_outcome: null,
  last_note: null,
  contacted_at: null,
  converted_at: null,
  places: 1,
  found_at: minsAgo(6),
  exported_at: null,
  version: 1,
  member: member(),
  ...over,
});
// A lead's mark as the server hands it: the copy we keep, on our own storage (00161).
const MARK_KEPT = `https://project.supabase.co/storage/v1/object/public/lead-marks/${"a".repeat(64)}.png`;
const ROW_DTOS = [
  leadRow({ lat: 30.2672, lng: -97.7431, mark_url: MARK_KEPT }),
  leadRow({
    id: "l2",
    lat: 30.3122,
    lng: -97.7431,
    place_id: "ChIJfixture0002",
    business_name: "Barton Creek Coaching",
    email: "team@bartoncreekcoaching.example",
    email_state: "catch_all",
    phone: "+15125550102",
    phone_agrees: false,
    website: "bartoncreekcoaching.example",
    rating: 4.8,
    reviews: 61,
    found_at: minsAgo(12),
    member: member({ fit: "look", reason: "Coaching studio, one location" }),
  }),
  leadRow({
    id: "l3",
    lat: 30.2672,
    lng: -97.6912,
    place_id: "ChIJfixture0003",
    business_name: "Lamar Strength Co.",
    email: "info@lamarstrength.example",
    email_state: "unknown",
    phone: "+15125550103",
    phone_agrees: false,
    website: "lamarstrength.example",
    rating: 4.6,
    reviews: 22,
    found_at: minsAgo(20),
    member: member({ class: "review", fit: "look", reason: "Couldn't check the email", reasons: ["email:unknown"] }),
  }),
  leadRow({
    id: "l4",
    lat: 30.2272,
    lng: -97.7431,
    place_id: "ChIJfixture0004",
    business_name: "GigaFit Austin",
    email: null,
    email_state: "none",
    email_checked_at: null,
    phone: "+15125550104",
    phone_agrees: false,
    website: "gigafit.example",
    rating: 4.1,
    reviews: 903,
    found_at: minsAgo(22),
    member: member({ class: "excluded", fit: null, reason: "A chain with 40 locations", excluded_by: "chain" }),
  }),
  leadRow({
    id: "l5",
    lat: 30.44,
    lng: -97.62,
    place_id: "ChIJfixture0005",
    business_name: "Pflugerville Training",
    email: null,
    email_state: "none",
    email_checked_at: null,
    phone: "+15125550105",
    phone_agrees: false,
    website: null,
    rating: 4.4,
    reviews: 12,
    found_at: minsAgo(24),
    member: member({ class: "excluded", fit: null, reason: "A dog trainer", excluded_by: "wrong_kind" }),
  }),
];
const ROWS = ROW_DTOS.map((r) => toLeadRowVM(r, TZ, NOW));
/** n businesses the next read finds that the view does not hold. */
const found = (n) =>
  Array.from({ length: n }, (_, i) =>
    leadRow({ id: `n${i}`, place_id: `ChIJnew${String(i).padStart(4, "0")}`, business_name: `New Gym ${i}` }),
  );
/**
 * A page whose surface is holding back `n` leads a refresh found (`world`'s overrides, and the `view` it reads first, when it
 * is not all leads): a run commits a page and the live feed tells the surface (what refresh-map and Realtime call), so the
 * rows it finds are offered, never sorted in under the owner.
 */
const offering = async (view, n, leads = {}) => {
  const held = await fresh({ leads });
  if (view) await leadsView(view);
  held.rows = [...held.rows, ...found(n)];
  await leadsOverride.apply();
  return held;
};
/** Page two of a view that has one (the first page then carries a cursor, and Show more reads the rest). */
const PAGE_TWO = [leadRow({ id: "l6", place_id: "ChIJfixture0006", business_name: "Page Two Fitness" })];

// What the server wrote for this workspace from its own business line (4.4's suggestionsFor).
const SUGGESTIONS = {
  business_line: "a personal training studio in Denver",
  by_owner: false,
  made_at: "2026-09-16T10:00:00.000Z",
  items: [
    {
      words: "gyms in Denver",
      who_for: "owners who refer clients out",
      category_key: "gym",
      reach: "About 6 in 10 have an email",
    },
  ],
};

/**
 * What the server holds for this workspace, as the wire answers it (surface.ts reads lead-searches, leads and
 * lead-suggestions): a test gives only what differs. `rows` are the rows of the DTO shape every leads read answers, whatever
 * its view asks (a function of the read's query when a test needs the server to narrow it); `more` is page two of the view,
 * when it has one (the first page then carries a cursor); `one` answers GET leads/[id] by id, for a lead on no page loaded.
 */
const world = (over = {}) => ({
  searches: [search(), waiting],
  counts: COUNTS,
  rows: ROW_DTOS,
  more: null,
  one: {},
  suggestions: null,
  month: { used: 262, left: 238, renewsOn: "Oct 1" },
  ...over,
});

/* ------------------------------- the window ------------------------------- */

const listeners = {};
let overlayOpen = null;
const storage = () => {
  const m = new Map();
  return {
    getItem: (k) => (m.has(k) ? m.get(k) : null),
    setItem: (k, v) => m.set(k, String(v)),
    removeItem: (k) => m.delete(k),
  };
};
globalThis.localStorage = storage();
globalThis.sessionStorage = storage();
globalThis.document = {
  body: {},
  activeElement: null,
  addEventListener() {},
  removeEventListener() {},
  getElementById: () => null,
  querySelector: (sel) =>
    overlayOpen &&
    sel.split(",").some(
      (part) =>
        part.includes(`[role="${overlayOpen.role}"]`) &&
        (overlayOpen.inApp !== false || !part.includes(".app-root")) &&
        !String(overlayOpen.className || "")
          .split(/\s+/)
          .some((c) => c && part.includes(`:not(.${c})`)),
    )
      ? overlayOpen
      : null,
  createElement: () => ({ setAttribute() {}, style: {}, classList: { add() {}, remove() {} } }),
};
// The surface announces itself on the window (`surface:leads`), as the app's does.
globalThis.CustomEvent ??= class CustomEvent {
  constructor(type, init) {
    this.type = type;
    this.detail = init && init.detail;
  }
};
/** Where the page sent the browser with window.open (an export's link): [href, target]. */
const navigated = [];
globalThis.window = {
  document: globalThis.document,
  // On a workspace page, so the typed client names the workspace on every request the way it does in the browser.
  location: { pathname: "/w/salon", hash: "#/clients/leads", origin: "https://app.chanlytics.com", href: "" },
  open: (href, target) => navigated.push([href, target]),
  // The zone the surface says its times in, published the way the workspace surface publishes it: no extra read.
  __WORKSPACES: [{ id: "ws-salon", timezone: TZ }],
  __ACTIVE_WORKSPACE: "ws-salon",
  history: {
    replaceState: (_s, _t, hash) => {
      globalThis.window.location.hash = hash;
    },
  },
  localStorage: globalThis.localStorage,
  sessionStorage: globalThis.sessionStorage,
  addEventListener: (type, fn) => {
    (listeners[type] ||= new Set()).add(fn);
  },
  removeEventListener: (type, fn) => {
    listeners[type]?.delete(fn);
  },
  dispatchEvent: (ev) => {
    for (const fn of [...(listeners[ev.type] || [])]) fn(ev);
    return true;
  },
  setTimeout: (fn, ms) => setTimeout(fn, ms),
  clearTimeout: (h) => clearTimeout(h),
  matchMedia: (q) => ({ matches: /max-width: 900px/.test(q) ? globalThis.__phone === true : false }),
};

let cells = [];
let setters = [];
// Where each hook keeps its state: by the component that calls it, as React keeps it (_hook-frames.mjs).
const frames = hookFrames();
const flashes = [];
const went = [];
const opened = [];
// Menus and questions, the peek, the plan panel and the strip are the real components, imported by the page as the app
// imports them (below); what the page hands each is what these tests press, so every draw of one is recorded as its props,
// the way a test finds one by its type in the tree (`n.type === MoreMenu`), and `fresh` empties them.
const menus = [];
const confirms = [];
const panels = [];
const strips = [];
const peeks = [];
/** A component the page draws -> where its props are kept as it is drawn. Filled once the components are imported. */
const recorded = new Map();
globalThis.Icon = "Icon";
globalThis.React = {
  Fragment: "Fragment",
  createElement: (type, p, ...kids) => {
    const props = { ...(p || {}), children: kids.flat(Infinity) };
    const node = { type, props };
    const into = recorded.get(type);
    if (into) into.push(props);
    if (typeof type === "function") node.rendered = frames.render(type, props);
    return node;
  },
  cloneElement: (el, props) => ({ ...el, props: { ...el.props, ...props } }),
  // The setter is one function for the cell's life, as React's is: a memoised row is handed setters (surfaces/people/table).
  useState: (init) => {
    const k = frames.key();
    if (!(k in cells)) cells[k] = typeof init === "function" ? init() : init;
    setters[k] ||= (v) => {
      cells[k] = typeof v === "function" ? v(cells[k]) : v;
    };
    return [cells[k], setters[k]];
  },
  useReducer: (red, init) => {
    const k = frames.key();
    if (!(k in cells)) cells[k] = init;
    return [
      cells[k],
      (a) => {
        cells[k] = red(cells[k], a);
      },
    ];
  },
  useRef: (init) => {
    const k = frames.key();
    if (!(k in cells)) cells[k] = { current: init };
    return cells[k];
  },
  // Kept while its deps hold, as React's is: the page's stable objects (a cell context, the columns) are proved here.
  useMemo: (fn, deps) => {
    const k = frames.key();
    const prev = cells[k];
    if (
      prev &&
      deps &&
      prev.deps &&
      deps.length === prev.deps.length &&
      deps.every((d, i) => Object.is(d, prev.deps[i]))
    )
      return prev.value;
    cells[k] = { deps, value: fn() };
    return cells[k].value;
  },
  // Kept while its deps hold, as React's is, and a cell of its own: the page hands a memoised row one function.
  useCallback: (fn, deps) => {
    const k = frames.key();
    const prev = cells[k];
    if (
      prev &&
      deps &&
      prev.deps &&
      deps.length === prev.deps.length &&
      deps.every((d, i) => Object.is(d, prev.deps[i]))
    )
      return prev.value;
    cells[k] = { deps, value: fn };
    return fn;
  },
  useEffect: (fn, deps) => {
    const k = frames.key();
    const prev = cells[k];
    if (
      prev &&
      deps &&
      prev.deps &&
      deps.length === prev.deps.length &&
      deps.every((d, i) => Object.is(d, prev.deps[i]))
    )
      return;
    if (prev && typeof prev.cleanup === "function") prev.cleanup();
    cells[k] = { deps, cleanup: undefined };
    cells[k].cleanup = fn();
  },
  // An id that stays with its component across draws, as React's does.
  useId: () => {
    const k = frames.key();
    if (!(k in cells)) cells[k] = `:r${k}:`;
    return cells[k];
  },
  // A store outside React (the surface's, useSurface): heard while the component is drawn, its subscription made again
  // each draw and the old one let go, as React does when `subscribe` is a new function. `redraws` counts the notices: a
  // notice is what would make React draw the page again, so `drawsFrom` proves which surface moves the page.
  useSyncExternalStore: (subscribe, snapshot) => {
    const k = frames.key();
    if (cells[k] && typeof cells[k].cleanup === "function") cells[k].cleanup();
    const stop = subscribe(() => {
      redraws += 1;
    });
    const off = () => {
      if (typeof stop === "function") stop();
      heardNow.delete(off);
    };
    heardNow.add(off);
    cells[k] = { heard: true, cleanup: off };
    return snapshot();
  },
};
useStubHooks(globalThis.React);
let redraws = 0;
/** Every subscription a drawn component holds: a tree that is dropped (a test's new cells, a new test) lets go of them, as React does. */
const heardNow = new Set();
/** Whether the surface moving (its rows landed, or its status changed: surface-status.ts) would draw what is on screen again. */
const drawsFrom = (key) => {
  const before = redraws;
  surfaceMoved(key);
  return redraws > before;
};
globalThis.ReactDOM = { createPortal: (node) => node };
globalThis.window.React = globalThis.React;
// The tab's one store for what pages keep (the place in a view: the words in the box, the cursor), which People's hooks read
// through the bridge's own module, on this window's sessionStorage.
const { clearTabMemory, tabMemoryFor } = await import("../../../../../apps/dashboard/src/legacy-bridge/tab-memory.ts");
await import("../../../../../apps/dashboard/src/legacy/components/data-bits.jsx");
Object.assign(globalThis.window, kitPages);
installRoleStore();
// The Leads page (its JSX compiles to the stub React above), and People › Pipeline, the third view over the same table, in the
// order both lists load it: before the page that draws it.
const { LeadsReal } = await importSrc("apps/dashboard/src/surfaces/leads/page/leads-real.tsx");
const { PipelineScope } = await importSrc("apps/dashboard/src/surfaces/people/pipeline/scope.tsx");
// The components the page draws and these tests press, the real ones (the page imports them; a test finds each by its type, and
// the stub React keeps the props each was drawn with, `recorded`): the kit's menu, question and glyph, the peek (Task 12), the
// plan panel (spec F5) and the strip (Task 10). The first day (Task 17) is drawn for real as well, and so is every part of the
// scope: a stand-in of one is what let the Leads scope ship referencing a component nothing declared -- every test green, and
// "LeadsFirstDay is not defined" in the browser for every workspace that had not yet kept a search, which on the first day is
// all of them.
const { MoreMenu } = await importSrc("apps/dashboard/src/surfaces/kit/more-menu/more-menu.tsx");
const { Confirm } = await importSrc("apps/dashboard/src/surfaces/kit/confirm/confirm.tsx");
const { Icon } = await importSrc("apps/dashboard/src/surfaces/kit/icon/icon.tsx");
const { LeadPeek } = await importSrc("apps/dashboard/src/surfaces/leads/peek/peek.tsx");
const { LeadPlanPanel } = await importSrc("apps/dashboard/src/surfaces/leads/finder/plan-panel.tsx");
const { LeadStrip } = await importSrc("apps/dashboard/src/surfaces/leads/finder/strip-view.tsx");
const { LeadsPhoneBar, LeadPlanSheet } = await importSrc("apps/dashboard/src/surfaces/leads/scope/phone-bar.tsx");
const { LeadsRailRows } = await importSrc("apps/dashboard/src/surfaces/leads/scope/rail.tsx");
const { LEAD_COLUMNS, LEAD_PHONE_COLUMNS } = await importSrc("apps/dashboard/src/surfaces/leads/cells/columns.tsx");
const { ldPlacePop } = await importSrc("apps/dashboard/src/surfaces/leads/cells/hover.tsx");
recorded.set(MoreMenu, menus);
// Leads' menus are the kit's Menu (Base UI's) since 5 Oct 2026, read here as every menu in this file is read: its name as
// `title`, its control's test id, and its groups as one list, a heading where a group has one and a line between two.
const { Menu } = await importSrc("apps/dashboard/src/surfaces/kit/menu/menu.tsx");
const asMenuRecord = (p) => ({
  title: p.label,
  testid: p.trigger?.props?.["data-testid"] ?? null,
  // The control's glyph, where it draws one (Call's phone, the ⋯).
  icon: [p.trigger?.props?.children ?? []].flat(Infinity).find((c) => c?.props?.name)?.props.name,
  align: p.align,
  trigger: p.trigger,
  items: p.groups.flatMap((g, at) => [
    ...(at > 0 ? [{ divider: true }] : []),
    ...(g.header !== undefined ? [{ header: g.header }] : []),
    ...(g.items ?? []).map((it) => ({
      label: it.label,
      icon: it.glyph?.props?.name,
      meta: it.meta,
      hint: it.hint,
      title: it.title,
      gate: it.gate,
      danger: it.tone === "danger",
      onClick: it.onSelect,
      href: it.href,
    })),
  ]),
});
recorded.set(Menu, { push: (p) => menus.push(asMenuRecord(p)) });
recorded.set(Confirm, confirms);
recorded.set(LeadPeek, peeks);
recorded.set(LeadPlanPanel, panels);
recorded.set(LeadStrip, strips);
/** A kept search's menu, as the rail drew it. */
const menuOf = (name) => menus.find((m) => m.title === `More for ${name}`);
// Find leads is Ask's (spec F1, F7): every door on the page hands Ask a detail, and that detail is what is pinned.
const asks = [];
// Every way a page could record or upload, and Ask's own doors: each one a recorder, so "the page asks nothing
// and starts nothing by itself" is a fact this file can check rather than a sentence it repeats.
const uploads = [];
globalThis.window.navigator = {
  language: "en-US",
  mediaDevices: {
    getUserMedia: () => {
      uploads.push("getUserMedia");
      return Promise.reject(new Error("no"));
    },
  },
};
globalThis.window.MediaRecorder = function MediaRecorderSpy() {
  uploads.push("MediaRecorder");
};

/* ------------------------------------- the wire ------------------------------------- */

// The wire, as the bridge's client reaches it (window.fetch): the real Leads surface (surfaces/leads/surface.ts) and every
// act of the page go through it, so a test says what the page SENT. `server` is what the workspace holds (`world`), reset by
// `fresh`: a leads read answers its rows (the same whatever the view asks, unless `rows` is a function of the query), a write
// is answered as the route does (`answers`), or refused when the test sets `server.refuse`, or as `server.answer` gives. What is
// asked is kept as it was sent, before anything is awaited: every read as its path and query (`reads`), every write as its
// request line and its body (`writes`), the workspace's copy of a view as `viewSaves` (PUT /api/v1/views/<page>, which People's
// saveView sends: held for the test to land, or answered at once), and a request nobody expects as `unexpected`.
const reads = [];
const writes = [];
const unexpected = [];
const viewSaves = [];
let holdViewSaves = false;
/** Requests sent and not yet answered: what one test leaves in the air must not land in the next one's world. */
let inFlight = 0;
let server = null;
const reply = (status, body) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
const refusal = (status, code, message) => reply(status, { ok: false, error: { code, message } });
/** A write's answer, as its route gives it, by request line. */
const answers = [
  [/^POST \/api\/v1\/leads\/[^/]+\/keep$/, () => ({ op_id: "op-k", version: 4 })],
  [/^POST \/api\/v1\/leads\/[^/]+\/exclude$/, () => ({ op_id: "op-e", version: 5 })],
  [/^POST \/api\/v1\/leads\/[^/]+\/put-back$/, () => ({ op_id: "op-p", version: 6 })],
  [/^POST \/api\/v1\/lead-operations\/[^/]+\/undo$/, () => ({})],
  [/^DELETE \/api\/v1\/leads\/[^/]+$/, () => ({ erased: true, already: false })],
  [/^POST \/api\/v1\/leads\/bulk$/, () => ({ done: 2, op_id: "op-b", version: 7, toast: "Done." })],
  [
    /^POST \/api\/v1\/leads\/check-again$/,
    (b) => ({ scheduled: b.ids.length, skipped: 0, toast: `Checking ${b.ids.length} again.` }),
  ],
  [/^PATCH \/api\/v1\/lead-searches\/[^/]+$/, (b) => ({ name: b.name })],
  [/^DELETE \/api\/v1\/lead-searches\/[^/]+$/, () => ({ archived: 143, kept: 18 })],
  [/^POST \/api\/v1\/lead-searches\/[^/]+\/more$/, () => ({ round_id: "r9" })],
  [/^POST \/api\/v1\/lead-searches\/[^/]+\/stop$/, () => ({})],
  [/^POST \/api\/v1\/lead-searches\/[^/]+\/answer$/, () => ({})],
  [/^POST \/api\/v1\/lead-searches\/[^/]+\/undo$/, () => ({ removed: 160, credited: 160, op_id: "op-u", version: 2 })],
];
/**
 * What a write does to the rows the server holds, so the next read of a view says what the door did (a refresh patches rows
 * by id, and the server's say wins): a lead kept or put back is qualified and counts, one excluded is left out, a bulk act
 * moves the ids it names (or the whole view), an erased lead is gone. Rows are replaced, never changed in place: the fixtures
 * are shared.
 */
const kept = (r) => ({ ...r, member: { ...r.member, class: "qualified", counted: true } });
const leftOut = (r) => ({ ...r, member: { ...r.member, class: "excluded", counted: false } });
const BULK_EFFECTS = {
  keep: kept,
  exclude: leftOut,
  contacted: (r) => ({ ...r, stage: "nurture" }),
  not_a_fit: (r) => ({ ...r, stage: "archived", closed_reason: "not_a_fit" }),
};
const changeRows = (ids, patch) => {
  if (Array.isArray(server.rows))
    server.rows = server.rows.map((r) => (ids === "all" || ids.includes(r.id) ? patch(r) : r));
};
const takeEffect = (key, body) => {
  const lead = /^(POST|DELETE) \/api\/v1\/leads\/([^/]+)(?:\/(keep|put-back|exclude))?$/.exec(key);
  if (lead && lead[1] === "POST" && lead[3]) changeRows([lead[2]], lead[3] === "exclude" ? leftOut : kept);
  else if (lead && lead[1] === "DELETE" && Array.isArray(server.rows))
    server.rows = server.rows.filter((r) => r.id !== lead[2]);
  else if (key === "POST /api/v1/leads/bulk" && BULK_EFFECTS[body.action])
    changeRows(body.by === "ids" ? body.ids : "all", BULK_EFFECTS[body.action]);
};
/** A read of the workspace, as the server answers it. */
const serveRead = (path, query) => {
  if (path === "/api/v1/lead-searches")
    return reply(200, { ok: true, data: { searches: server.searches, counts: server.counts } });
  // Suggestions the server has not written (undefined) are a read that fails: the surface publishes none, and says so.
  if (path === "/api/v1/lead-suggestions")
    return server.suggestions === undefined
      ? refusal(500, "internal", "The suggestions could not be read.")
      : reply(200, { ok: true, data: server.suggestions });
  if (path === "/api/v1/leads") {
    if (query.after_key)
      return reply(200, { ok: true, data: { rows: server.more ?? [], next: null, counts: server.counts } });
    const rows = typeof server.rows === "function" ? server.rows(query) : server.rows;
    const next =
      server.more && server.more.length ? { key: "k-page-one", id: rows.length ? rows[rows.length - 1].id : "" } : null;
    return reply(200, {
      ok: true,
      data: { rows, next, counts: server.counts, ...(server.month ? { month: server.month } : {}) },
    });
  }
  const one = /^\/api\/v1\/leads\/([^/]+)$/.exec(path);
  if (one) {
    const got = typeof server.one === "function" ? server.one(one[1], query) : server.one[one[1]];
    return got
      ? reply(200, { ok: true, data: { row: got } })
      : refusal(404, "not_found", "That lead is not in your workspace.");
  }
  // An open search's reach-out, and a lead's story with it (Reach out Part 6): none is planned in this world, and none of the
  // search's leads is ready to write to, so its door (Part 4) draws nothing.
  if (path === "/api/v1/reach-outs/leads")
    return reply(200, { ok: true, data: { lines: null, chain: null, timeline: null } });
  if (path === "/api/v1/reach-outs/reach")
    return reply(200, { ok: true, data: { ready: 0, with_unconfirmed: 0, phone_only: 0, of: 0, chain: null } });
  // A person read ahead of a press (People's warmPeople, which the Pipeline's rows ask as they are rested on), who is not here.
  if (/^\/api\/v1\/contacts\/[^/]+$/.test(path)) return refusal(404, "not_found", `no ${path}`);
  unexpected.push(`GET ${path}`);
  return refusal(404, "not_found", `no ${path}`);
};
const serve = async (u, init) => {
  const url = new URL(String(u), "https://app.chanlytics.com");
  const method = init.method || "GET";
  const path = url.pathname;
  const sent = `${path}${url.search}`;
  const query = Object.fromEntries(url.searchParams);
  if (method === "GET") {
    reads.push(sent);
    if (server.gate) await server.gate(sent);
    return serveRead(path, query);
  }
  const body = init.body ? JSON.parse(init.body) : undefined;
  const key = `${method} ${path}`;
  writes.push({ key, ...(body !== undefined ? { body } : {}) });
  if (server.gate) await server.gate(sent);
  if (server.refuse) return refusal(server.refuse.status, server.refuse.code, server.refuse.message);
  const given = server.answer ? server.answer({ key, body }) : undefined;
  if (given !== undefined) return given instanceof Response ? given : reply(200, { ok: true, data: given });
  const hit = answers.find(([re]) => re.test(key));
  if (!hit) unexpected.push(key);
  takeEffect(key, body);
  return reply(200, { ok: true, data: hit ? hit[1](body) : { done: true } });
};
globalThis.window.fetch = async (u, init = {}) => {
  const saving = new URL(String(u), "https://app.chanlytics.com").pathname.match(/^\/api\/v1\/views\/([^/]+)$/);
  if (saving && init.method === "PUT") {
    const { view } = JSON.parse(init.body);
    if (!holdViewSaves) return reply(200, { ok: true, data: { views: { [saving[1]]: view } } });
    return new Promise((land) =>
      viewSaves.push({
        page: saving[1],
        view,
        land: (r) =>
          land(
            r.ok
              ? reply(200, { ok: true, data: { views: { [saving[1]]: view } } })
              : reply(500, { ok: false, error: { code: "internal", message: r.message } }),
          ),
      }),
    );
  }
  inFlight += 1;
  try {
    return await serve(u, init);
  } finally {
    inFlight -= 1;
  }
};
/** A new wire is a new world: what the tab held of the last one goes, as it does when the workspace is dropped. */
const resetWire = ({ refuse = null, ...given } = {}) => {
  forgetLeadsViews();
  reads.length = 0;
  writes.length = 0;
  unexpected.length = 0;
  server = { ...world(given), refuse, answer: null, gate: null };
  return server;
};
/** The lead reads (page one and the pages after it) the wire saw, as their queries: list, sort, dir, search, class, after_key. */
const pageReads = () =>
  reads
    .filter((r) => r.startsWith("/api/v1/leads?"))
    .map((r) => Object.fromEntries(new URL(r, "https://app.chanlytics.com").searchParams));
/** The writes the wire saw, as { key, body }: the request line, and what it carried. */
const wrote = (match = () => true) => writes.filter(match);
const lastWrite = () => writes.at(-1);

/** A tree walked once per node: a drawn component is its children as it was given them and what it rendered, and the two share nodes. */
const walk = (n, fn, seen = new Set()) => {
  if (n == null || typeof n !== "object" || seen.has(n)) return;
  seen.add(n);
  if (Array.isArray(n)) {
    for (const k of n) walk(k, fn, seen);
    return;
  }
  fn(n);
  for (const k of n.props?.children ?? []) walk(k, fn, seen);
  if (n.rendered) walk(n.rendered, fn, seen);
};
const all = (tree, pred) => {
  const out = [];
  walk(tree, (n) => {
    if (pred(n)) out.push(n);
  });
  return out;
};
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
const sortByHeading = (tree, label) =>
  click(
    find(
      tree,
      (n) =>
        n.type === "button" &&
        String(n.props?.className || "")
          .split(/\s+/)
          .includes("cl-th-sort") &&
        textOf(n).startsWith(label),
    ),
  );
const tick = () => new Promise((r) => setTimeout(r, 0));
const settle = async (n = 8) => {
  for (let i = 0; i < n; i += 1) await tick();
};
const press = (key, target = null, { focus = target, ...mods } = {}) => {
  globalThis.document.activeElement = focus;
  let taken = false;
  const ev = {
    key,
    target,
    metaKey: false,
    ctrlKey: false,
    altKey: false,
    shiftKey: false,
    repeat: false,
    defaultPrevented: false,
    ...mods,
    preventDefault() {
      taken = true;
      ev.defaultPrevented = true;
    },
  };
  for (const fn of [...(listeners.keydown || [])]) fn(ev);
  return taken;
};

/* -------------------------- the shell, as the page asks it -------------------------- */

const install = ({ role = "owner" } = {}) => {
  Object.assign(globalThis.window, {
    // The chrome bridge's state map, as shell.ts publishes it: StatePill takes its tone from here and nowhere else.
    __chrome: { state: stateOf },
    // The shell's doors to Ask, recorded: askAbout (dashboard-a-ask.jsx) with what the page hands it, and appAsk
    // (app-shell.jsx), the plain open ⌘K makes, which keeps what the owner left in the field. The page reaches them through
    // legacy-verbs.ts (askAbout, openAsk, askCalls).
    askAbout: (detail) => asks.push(detail),
    appAsk: () => asks.push("open"),
    __ask: {
      language: () => "en",
      send: async () => {
        uploads.push("ask.send");
      },
      commit: async () => {
        uploads.push("ask.commit");
        return { ok: false, message: "no" };
      },
    },
    __roleGate: roleGate,
    __ME: { role },
    ST_STORE: { myRole: () => role, can: (a) => !!(ROLE_PERMS[role] || {})[a] },
    usePPToast: () => [null, (t) => flashes.push(t)],
    CHANLY: { nav: (to) => went.push(to), address, R: { thread: (id) => `inbox/${id}` } },
    __clock: { dateYear: () => "Sep 18, 2026", time: () => "2:14 PM" },
  });
  // The bridge's reading of who is acting over this window's __ME (the pages ask mayAtLeast), beside the stub's own.
  installRoleStore();
};

/**
 * People's surface as the seam holds it (surfaces/surface-values.ts): what the TSX hooks read through useSurface. Nothing
 * landed is undefined.
 */
const publishPeople = (value) => setSurfaceValue("people", value);
const peopleWith = (views) => ({
  rows: [],
  lists: [],
  saved: [],
  groups: [],
  aggregates: { total: 0, needsYou: 0, reachedWeek: 0 },
  views,
  attention: {},
  savedRead: true,
  page: null,
  calendar: null,
});

/** The Leads surface as the page's own read publishes it: what the seam holds of it now. */
const L = () => surfaceValue("leads");

/**
 * Until every request the page sent has landed in the surface and the surface has sent what that moved: a read one test
 * leaves in the air must not land in the next one's world. (A save a test holds is not counted: it lands when the test says.)
 */
const quiesce = async () => {
  for (let calm = 0, spent = 0; calm < 4 && spent < 400; spent += 1) {
    await tick();
    calm = inFlight === 0 ? calm + 1 : 0;
  }
};
afterEach(async () => {
  await quiesce();
  assert.deepEqual(unexpected, [], "the page asked the wire for nothing it does not expect");
  assert.deepEqual(uploads, [], "and started no recording and no upload by itself");
});

/** The view the page opens on (decision 0015's address `clients/leads`): all leads, the strongest fit first. */
const ALL_LEADS = { searchId: null, list: "all", cls: null, chips: {}, sort: "fit", dir: "asc" };

/**
 * A page with the surface landed and nothing drawn yet. The wire holds `leads` (`world`'s overrides) and the REAL Leads surface
 * has read it, as it does when the page opens: its acts change the rows it holds and the peek is drawn from them, so a surface
 * a test published itself would prove nothing about either. What the wire saw while landing it is forgotten, so a test reads
 * only what the page does. Answers the server the wire speaks for, to change what it holds or how it answers.
 */
const fresh = async ({ leads = {}, views = {}, role = "owner", refuse = null, people = true } = {}) => {
  await quiesce();
  // The last tree is gone: what it heard of the surfaces goes with it, as React lets go of an unmounted component's.
  for (const off of [...heardNow]) off();
  redraws = 0;
  install({ role });
  const held = resetWire({ ...leads, refuse });
  publishPeople(people ? peopleWith(views) : undefined);
  cells = [];
  setters = [];
  flashes.length = 0;
  went.length = 0;
  opened.length = 0;
  navigated.length = 0;
  menus.length = 0;
  confirms.length = 0;
  panels.length = 0;
  strips.length = 0;
  peeks.length = 0;
  asks.length = 0;
  uploads.length = 0;
  for (const k of Object.keys(listeners)) delete listeners[k];
  globalThis.document.activeElement = null;
  overlayOpen = null;
  globalThis.__phone = false;
  globalThis.window.location.href = "";
  globalThis.localStorage.removeItem("chanlytics-people-view");
  globalThis.localStorage.removeItem("chanlytics-leads-view");
  clearTabMemory(globalThis.sessionStorage);
  viewSaves.length = 0;
  holdViewSaves = false;
  await leadsView(ALL_LEADS);
  reads.length = 0;
  writes.length = 0;
  return held;
};
/** The page of a scope, as the shell draws it: all three are TSX, People's, the Leads scope's and the Pipeline's. */
const draw = (props = {}) => {
  frames.begin();
  const page = {
    scope: "leads",
    leadsRoute: "leads",
    onNavigate: (to) => went.push(to),
    onOpenProfile: (id) => opened.push(id),
    ...props,
  };
  const Page = page.scope === "people" ? PeopleReal : page.scope === "pipeline" ? PipelineScope : LeadsReal;
  return globalThis.React.createElement(Page, page);
};
/** The plan panel, through a kept search's Search again, changed: the plan Claude wrote, with what was asked. */
const openPlanFrom = (name = "Personal trainers · Austin") => {
  draw();
  menuOf(name)
    .items.find((i) => i.label === "Search again, changed")
    .onClick();
  draw();
};

test("a fresh mount of Leads draws its first rows and the next draw every row", async () => {
  // The switch from People is a remount, and the table's rows were most of what it waited on (measured on the salon:
  // a 250 ms draw of 96 leads, 125 ms with the first 24).
  const rows = Array.from({ length: 40 }, (_, i) => ({ ...ROW_DTOS[0], id: `many-${i}`, place_id: `ChIJmany${i}` }));
  await fresh({ leads: { rows } });
  const rowsOf = (tree) => all(tree, (n) => n.type === "tr" && /^lead-many-/.test(String(n.props?.id || ""))).length;
  const first = draw();
  assert.ok(
    rowsOf(first) > 0 && rowsOf(first) <= PL_FIRST_ROWS,
    `the first draw carries the first rows only, saw ${rowsOf(first)}`,
  );
  assert.equal(rowsOf(draw()), 40, "the next draw carries every row");
});

test("Leads' rows swap in with the kit's rise as a view's rows land, as People's and the Inbox's lists do", async () => {
  // A rail pick came in at once while People's lists rose (5 Oct 2026): the page hands its table the swap's ref
  // (kit/motion/use-swap-motion.ts, keyed on the view the surface's rows are of).
  const { PeopleTable } = await import("../../../../../apps/dashboard/src/surfaces/people/table/table.tsx");
  await fresh();
  const table = find(draw(), (n) => n.type === PeopleTable);
  assert.ok(table, "the Leads scope draws People's table");
  assert.ok(table.props.swapRef && "current" in table.props.swapRef, "and hands it the swap's ref");
});

/* ---------------------------------- the rows ---------------------------------- */

const rowOf = (tree, id) => find(tree, (n) => n.type === "tr" && n.props?.id === `lead-${id}`);
const names = (tree) => all(tree, (n) => n.props?.["data-testid"] === "lead-name").map(textOf);
const headings = (tree) =>
  all(tree, (n) => n.type === "th" && !/\bpl-col-off\b/.test(String(n.props?.className || "")))
    .map((th) => textOf(th).replace(/[▲▼]/g, "").trim())
    .filter(Boolean);

test("the Leads scope draws the rows the surface read, in the order it read them, each email's state a word beside a shape", async () => {
  await fresh();
  const tree = draw();
  assert.deepEqual(
    names(tree),
    ["Zilker Strength Lab", "Barton Creek Coaching", "Lamar Strength Co.", "GigaFit Austin", "Pflugerville Training"],
    "the surface's order, strongest fit first; the page never re-sorts what it was given",
  );
  assert.deepEqual(
    headings(tree),
    ["Business", "Reach", "Rated", "Found"],
    "D5's three columns and when it was found; Fit, Why it fits, Stage, Distance, Source, Website and Search are the Columns menu's, off",
  );
  // D5: both contacts as two slots, phone then mailbox: the shape carries the state, the control's name carries the
  // word and the value, and the sentence behind the shape is a tip in the DOM the control names.
  const slot = (id, kind) => byTestId(rowOf(tree, id), `lead-slot-${kind}`);
  const labelOf = (n) => (find(n, (x) => x.props && x.props["aria-label"]) || { props: {} }).props["aria-label"];
  const tipOf = (n) => textOf(find(n, (x) => x.props?.role === "tooltip"));
  assert.match(labelOf(slot("l1", "mailbox")), /^Email: Checked, hello@/);
  assert.match(
    labelOf(slot("l2", "mailbox")),
    /^Email: Unconfirmed, /,
    "a catch-all server accepts anything, so the check cannot tell (S12)",
  );
  assert.match(labelOf(slot("l3", "mailbox")), /^Email: Unconfirmed, /);
  assert.match(
    tipOf(slot("l3", "mailbox")),
    /mail server wouldn't answer/,
    "the same shape as a catch-all, its own sentence in the tip",
  );
  assert.ok(
    find(slot("l2", "mailbox"), (n) => /\bld-slot-shape\b/.test(String(n.props?.className || ""))),
    "the state is a shape as well as a word, never colour alone",
  );
  assert.match(
    textOf(byTestId(rowOf(tree, "l4"), "lead-reach")),
    /Not checked/,
    "a left-out place's contacts were never checked, and the row says so",
  );
  assert.match(
    labelOf(slot("l1", "phone")),
    /^Phone: Checked, \+1/,
    "Maps and their website agree on the number: Checked",
  );
  assert.equal(
    byTestId(rowOf(tree, "l4"), "lead-stage"),
    null,
    "Stage is a column off by default (D5): a row wears its state as a tag instead, and on a desktop the cell is not built at all",
  );
  // The page asks the band once, at mount, and listens: a phone is a page opened on one.
  await fresh();
  globalThis.__phone = true;
  assert.equal(
    byTestId(rowOf(draw(), "l4"), "lead-stage"),
    null,
    "a phone draws one cell a lead, People's row (the phone pass): no column of the desktop's",
  );
  globalThis.__phone = false;
  assert.equal(
    textOf(find(tree, (n) => n.props?.className === "cl-table-foot")).startsWith("322 leads"),
    true,
    "the table calls its rows leads",
  );
  assert.equal(
    textOf(byTestId(rowOf(tree, "l4"), "lead-sub")),
    "Chain",
    "Excluded's one line is the criterion that left it out, in the owner's words",
  );
  assert.ok(byTestId(rowOf(tree, "l1"), "lead-photo"), "the tile is a button that expands the photo");
  // D6: the business own mark sits over the listing photo, so a mark that fails to load uncovers what is under it.
  const tile = byTestId(rowOf(tree, "l1"), "lead-photo");
  assert.deepEqual(
    all(tile, (n) => n.type === "img").map((n) => [n.props.className, n.props.src]),
    [["lg", MARK_KEPT]],
    "the mark, over the tint of its kind",
  );
  assert.equal(
    all(byTestId(rowOf(tree, "l2"), "lead-photo"), (n) => n.type === "img").length,
    0,
    "a lead with neither wears its initials, never a broken frame",
  );
  assert.ok(byTestId(rowOf(tree, "l1"), "lead-card-name"), "the name's card is in the DOM, shown on hover");
});

// The first day is what every workspace opens Leads on, and it is what nothing drew: the component this file
// used to stub did not exist, so the scope threw "LeadsFirstDay is not defined" for anyone without a search.
test("with no search kept the first day stands where the table would, and claims only what this tab has read", async () => {
  await fresh({ leads: { searches: [], rows: [], suggestions: SUGGESTIONS } });
  const tree = draw();
  const fd = byTestId(tree, "leads-first-day");
  assert.ok(fd, "the first day is drawn");
  assert.equal(
    find(tree, (n) => n.type === "table"),
    null,
    "and the table is not: there is nothing to put in it",
  );

  assert.deepEqual(
    all(fd, (n) => /^ld-way-[a-z]+$/.test(String(n.props?.["data-testid"] || ""))).map((n) => n.props["data-testid"]),
    ["ld-way-reach", "ld-way-calendar", "ld-way-yours"],
    "the three ways people arrive, People first",
  );
  assert.equal(
    byTestId(fd, "ld-way-status-reach"),
    null,
    "this tab never read the setup surface, so nothing says a number is live",
  );
  assert.equal(byTestId(fd, "ld-way-status-calendar"), null, "and nothing says a calendar is connected");
  assert.match(
    textOf(byTestId(fd, "ld-way-reach")),
    /Set up your number/,
    "what it says instead is the door to set one up",
  );

  assert.ok(byTestId(fd, "ld-sug-gym"), "the suggestion Claude wrote for this workspace is offered");
  assert.match(
    textOf(byTestId(fd, "ld-sug-gym")),
    /About 6 in 10 have an email/,
    "with how reachable that kind is, measured, never promised",
  );
  assert.match(
    textOf(byTestId(fd, "ld-line")),
    /a personal training studio in Denver/,
    "and what they were written from",
  );
  assert.ok(byTestId(fd, "ld-line-edit"), "with the one control that renews them");
  assert.match(
    textOf(byTestId(fd, "ld-first-day-foot")),
    /not people at home/,
    "the foot says what the finder does not do",
  );
});

test("suggestions the page could not read say so, and Find leads is still offered", async () => {
  await fresh({ leads: { searches: [], rows: [], suggestions: undefined } });
  const fd = byTestId(draw(), "leads-first-day");
  assert.ok(fd, "the first day is still drawn");
  assert.equal(
    textOf(byTestId(fd, "ld-sugs-note")),
    LEAD_WORDS.suggestUnavailable,
    "the space where they go says why it is empty",
  );
  assert.equal(textOf(byTestId(fd, "ld-line")), "", "and nothing claims a business line that was never read");
  assert.ok(
    byTestId(fd, "leads-first-find"),
    "the door is drawn either way: the owner can still describe what they want",
  );
});

test("the first day offers Find leads, which opens Ask; a suggestion picked opens Ask with its words", async () => {
  await fresh({ leads: { searches: [], rows: [], suggestions: SUGGESTIONS } });
  const fd = byTestId(draw(), "leads-first-day");
  // The composer's slot is one button (spec F1): the page draws no composer of its own on the first day.
  assert.equal(panels.length, 0, "no composer is drawn: Ask is the finder");
  const door = byTestId(fd, "leads-first-find");
  assert.match(textOf(door), /Find leads/);
  assert.ok(
    find(door, (n) => n.type === Icon && n.props?.name === "three"),
    "wearing the three's still mark, Ask's face at rest",
  );
  click(door);
  assert.equal(asks.at(-1), "open", "Find leads opens Ask as ⌘K does, keeping what was left in the field");
  find(fd, (n) => n.type === "button" && n.props?.className === "q").props.onClick();
  assert.deepEqual(
    asks.at(-1),
    { mode: "compose", prompt: "gyms in Denver" },
    "a suggestion's words are in the field, ready to send",
  );
  assert.equal(panels.length, 0, "and still no composer");
  // The button is gated as the bar's square was: an operator sees it refuse in the gate's sentence.
  await fresh({ role: "operator", leads: { searches: [], rows: [], suggestions: SUGGESTIONS } });
  const gated = byTestId(byTestId(draw(), "leads-first-day"), "leads-first-find");
  assert.deepEqual(
    [gated.props["aria-disabled"], gated.props["aria-description"]],
    [true, "Only an owner can find businesses for you."],
  );
});

// D3: Needs review is a queue. Its head is one chip per thing that would resolve the leads in it; a chip selects
// them; the bar offers what resolves that selection and nothing else. Every resolver's door is the surface's own
// (bulkLeads, checkLeadsAgain), so the bench never offers what the door cannot do.
test("Needs review is a workbench: the pile in the order to work it, the group's own leads as cards, one press per group, and what each press costs", async () => {
  await fresh();
  let tree = draw({ leadsRoute: `leads:s-${SEARCH_A}:c-review` });
  const bench = byTestId(tree, "lead-bench");
  assert.ok(bench, "Needs review stops being a tab on a table");
  assert.equal(
    find(tree, (n) => n.type === "table"),
    null,
    "the table gives way to the bench: the pile is the work",
  );
  const queue = all(byTestId(bench, "lead-bench-queue"), (n) => n.props?.role === "tab");
  assert.deepEqual(
    queue.map((q) => textOf(q)),
    ["1Their mail server wouldn't answerCheck again · Keep · Exclude"],
    "one row per thing that would resolve a pile, with its count and its acts in words",
  );
  assert.equal(textOf(byTestId(bench, "bench-title")), "Their mail server wouldn't answer1");
  assert.match(
    textOf(byTestId(bench, "bench-why")),
    /^Their mail server did not answer the check/,
    "and a sentence saying what is true of every lead in it",
  );
  assert.deepEqual(
    all(bench, (n) => n.props?.["data-testid"] === "lead-bench-card").map((c) =>
      textOf(byTestId(c, "bench-card-name")),
    ),
    ["Lamar Strength Co."],
    "the group's own leads, as cards",
  );
  assert.ok(
    byTestId(bench, "bench-act-check_again") &&
      byTestId(bench, "bench-act-keep") &&
      byTestId(bench, "bench-act-exclude"),
    "Check again, Keep and Exclude resolve a mail server that would not answer: each has a door, so nothing on the bench is dead",
  );
  assert.match(
    textOf(byTestId(bench, "bench-cost-keep")),
    /count against this month\. 1 of your 238 left\./,
    "what a press costs is the surface's own month, never a number the page made up",
  );
  assert.match(
    textOf(byTestId(bench, "bench-asked")),
    /With a website/,
    "and what the search asked for, in the owner's own words",
  );
  // Check again draws on the bar with its count and its cost.
  assert.equal(textOf(byTestId(tree, "bench-act-check_again")), "Check again 1");
  assert.match(
    textOf(byTestId(tree, "bench-cost-check_again")),
    /About 1¢. Their answer lands here/,
    "the act, and what it costs, side by side",
  );
  byTestId(tree, "bench-act-check_again").props.onClick();
  await settle();
  assert.deepEqual(
    lastWrite(),
    { key: "POST /api/v1/leads/check-again", body: { ids: ["l3"] } },
    "the lead whose check did not answer, to the door that checks it again",
  );
  assert.equal(flashes.at(-1).msg, "Checking 1 again.");

  // A card's own Keep is the row's own door, one lead, as it is on a row.
  tree = draw({ leadsRoute: `leads:s-${SEARCH_A}:c-review` });
  byTestId(
    all(byTestId(tree, "lead-bench"), (n) => n.props?.["data-testid"] === "lead-bench-card")[0],
    "bench-card-keep",
  ).props.onClick({ stopPropagation() {} });
  await settle();
  assert.deepEqual(lastWrite(), { key: "POST /api/v1/leads/l3/keep", body: { search_id: SEARCH_A } });
  tree = draw({ leadsRoute: `leads:s-${SEARCH_A}:c-review` });
  assert.equal(byTestId(tree, "lead-bench"), null, "kept, the lead has left the pile on screen at once");

  // The group's Keep is the bulk door the bar presses.
  await fresh();
  tree = draw({ leadsRoute: `leads:s-${SEARCH_A}:c-review` });
  byTestId(tree, "bench-act-keep").props.onClick();
  await settle();
  assert.deepEqual(
    lastWrite(),
    { key: "POST /api/v1/leads/bulk", body: { by: "ids", action: "keep", ids: ["l3"], search_id: SEARCH_A } },
    "the bench's Keep is the same bulk door the bar presses",
  );
  assert.equal(flashes.at(-1).msg, "Done.", "the door's own sentence is the flash");

  await fresh({ leads: { rows: [] } }); // the server answered the review view with nothing
  tree = draw({ leadsRoute: `leads:s-${SEARCH_A}:c-review` });
  assert.equal(byTestId(tree, "lead-bench"), null, "no pile, no bench");
  assert.match(textOf(tree), /Nothing needs a look./, "an empty queue says so");
});

test("the rail counts what the lists hold, a waiting search wears a question mark, and the standing line says who needs you", async () => {
  await fresh();
  const tree = draw();
  const rows = all(byTestId(tree, "leads-lists"), (n) => n.type === "button").map((b) => [
    textOf(find(b, (x) => x.props?.className === "label")),
    textOf(find(b, (x) => x.props?.className === "count")),
  ]);
  assert.deepEqual(rows, [
    ["All leads", "322"],
    ["Ready", "272"],
    ["Contacted", "31"],
    ["Talking", "9"],
    ["Said no", "6"],
    ["Not a fit", "4"],
  ]);
  assert.ok(
    byTestId(tree, `leads-search-${SEARCH_A}`) && byTestId(tree, `leads-search-${SEARCH_B}`),
    "both searches are on the rail",
  );
  assert.ok(
    find(byTestId(tree, `leads-search-${SEARCH_B}`), (n) => n.props?.className === "rail-q"),
    "the one waiting on an answer wears a ? in the accent",
  );
  assert.equal(
    find(byTestId(tree, `leads-search-${SEARCH_A}`), (n) => n.props?.className === "rail-q"),
    null,
    "the one that ended does not",
  );
  assert.equal(textOf(byTestId(tree, "leads-standing")), "322 leads·272 ready·2 searches·1 search needs you");
  click(byTestId(tree, "leads-standing-needs"));
  assert.deepEqual(
    went,
    [`clients/leads:s-${SEARCH_B}:c-excluded`],
    "and it is the tap that opens the search waiting on you, on the places its question is about",
  );
});

// The rail picks the way People's does (railToggle, surfaces/people/rail/rail-kit.tsx). On production (21 Sep) a list
// pressed while a search was open kept the search in the address and only narrowed inside it: the rail lit neither
// row, and "All leads" changed nothing, which read as a link that went nowhere. A search picked kept the list, so it
// showed fewer leads than its count said.
test("the Leads rail picks one row at a time, as People's does: a list leaves an open search, a search shows all of itself, and the picked row pressed again goes back to all leads", async () => {
  await fresh();
  const pressed = (route, testid) => {
    went.length = 0;
    click(byTestId(draw({ leadsRoute: route }), testid));
    return went.at(-1);
  };
  assert.equal(
    pressed(`leads:s-${SEARCH_A}`, "leads-list-ready"),
    leadsRoute({ list: "ready" }),
    "a list leaves the search that was open",
  );
  assert.equal(
    pressed(`leads:s-${SEARCH_A}`, "leads-list-all"),
    leadsRoute({}),
    "All leads is all of them, from a search too",
  );
  assert.equal(
    pressed("leads:l-ready", `leads-search-${SEARCH_A}`),
    leadsRoute({ searchId: SEARCH_A }),
    "a search shows all of itself, not its Ready ones",
  );
  assert.equal(
    pressed(`leads:s-${SEARCH_B}:c-review`, `leads-search-${SEARCH_A}`),
    leadsRoute({ searchId: SEARCH_A }),
    "and starts on all of its classes",
  );
  assert.equal(
    pressed(`leads:s-${SEARCH_A}:c-review`, `leads-search-${SEARCH_B}`),
    leadsRoute({ searchId: SEARCH_B, cls: "excluded" }),
    "one waiting on its question starts on the places the question is about",
  );
  assert.equal(
    pressed(`leads:s-${SEARCH_A}`, `leads-search-${SEARCH_A}`),
    leadsRoute({}),
    "the open search pressed again: all leads",
  );
  assert.equal(pressed("leads:l-ready", "leads-list-ready"), leadsRoute({}), "the open list pressed again: all leads");
  // Whatever an old address combines, one row is picked, and a screen reader hears which. (The stub tree reaches a
  // row through its parent's children and its parent's drawing both, so rows are counted once each, by identity.)
  const picked = (route) =>
    [...new Set(all(draw({ leadsRoute: route }), (n) => n.props?.["aria-current"] === "true"))].map(
      (n) => n.props["data-testid"],
    );
  assert.deepEqual(picked(`leads:s-${SEARCH_A}:l-ready`), [`leads-search-${SEARCH_A}`]);
  assert.deepEqual(picked("leads:l-ready"), ["leads-list-ready"]);
  assert.deepEqual(picked("leads"), ["leads-list-all"]);
  // The list that is open is named over the table, as People names its list, with the way back to all leads.
  const head = (route) => byTestId(draw({ leadsRoute: route }), "leads-list-head");
  assert.equal(textOf(byTestId(head("leads"), "leads-list-title")), "All leads");
  assert.equal(byTestId(head("leads"), "leads-show-all"), null, "all of them has nowhere to go back to");
  assert.equal(textOf(byTestId(head("leads:l-ready"), "leads-list-title")), "Ready");
  went.length = 0;
  click(byTestId(head("leads:l-ready"), "leads-show-all"));
  assert.equal(went.at(-1), leadsRoute({}), "Show all leads goes back to all of them");
  assert.equal(head(`leads:s-${SEARCH_A}`), null, "a search that is open says itself in the strip instead");
  // A search's row is the kit's row with acts: its pick and its menu side by side, never a button in a button.
  const row = find(
    draw(),
    (n) =>
      n.type === "div" &&
      typeof n.props?.className === "string" &&
      n.props.className.split(" ").includes("ld-search-row"),
  );
  assert.ok(row && row.props.className.split(" ").includes("has-acts"), "the row carries its acts beside its pick");
  assert.equal(
    all(byTestId(row, `leads-search-${SEARCH_A}`), (n) => n.type === "button").length,
    1,
    "the pick holds no other button",
  );
  // A name cut off at the rail's width is read whole on hover, with when it was asked: the shared tip (data-tip).
  assert.equal(
    byTestId(row, `leads-search-${SEARCH_A}`).props["data-tip"],
    "You asked on Sep 18: “personal trainers in Austin with a website, about 200”. Leaving out Chain gyms.",
    "contracts' words for when it was asked and what: the row names the whole ask",
  );
});

test("a rail row under the pointer, or reached by Tab, warms the view its press would open, and the press itself warms nothing more", async () => {
  await fresh();
  const tree = draw();
  const rows = all(
    tree,
    (n) =>
      n.type === "button" &&
      String(n.props?.className || "")
        .split(/\s+/)
        .some((c) => c === "cl-rail-row" || c === "cl-rail-pick"),
  );
  const ready = rows.find((b) => b.props["data-testid"] === "leads-list-ready");
  const searchA = rows.find((b) => b.props["data-testid"] === `leads-search-${SEARCH_A}`);
  assert.ok(ready && searchA, "both kinds of row are drawn");
  // What the page itself reads as it opens is its own; what is warmed is what comes after.
  reads.length = 0;
  ready.props.onPointerEnter();
  searchA.props.onFocus();
  assert.deepEqual(
    pageReads().map((q) => [q.list, q.search ?? null]),
    [
      ["ready", null],
      ["all", SEARCH_A],
    ],
    "each reads the view its press goes to, ahead of the press",
  );
  const warmed = reads.length;
  click(ready);
  assert.deepEqual(went.at(-1), "clients/leads:l-ready", "the press goes there");
  assert.equal(reads.length, warmed, "and asks for no warm of its own");
  // The row that is already open warms the view its press shows: back to all leads. (The tab no longer holds it here, or
  // there would be nothing to read -- a view held is not read ahead again.)
  const tree2 = draw({ leadsRoute: "leads:l-ready" });
  const openRow = all(tree2, (n) => n.type === "button" && n.props?.["data-testid"] === "leads-list-ready")[0];
  await quiesce();
  forgetLeadsViews();
  reads.length = 0;
  openRow.props.onPointerEnter();
  assert.deepEqual(
    pageReads().map((q) => [q.list, q.search ?? null]),
    [["all", null]],
    "the row picked again shows all leads, so that is what is warmed",
  );
});

test("a view on its way says so: the rows on screen are the last view's, dimmed and marked busy, until the surface holds the one the address names", async () => {
  await fresh();
  const scopeOf = (tree) =>
    find(
      tree,
      (n) =>
        n.type === "div" &&
        String(n.props?.className || "")
          .split(" ")
          .includes("leads-scope"),
    );
  const tableOf = (tree) => find(tree, (n) => n.props?.["data-testid"] === "people-table-scroll");
  let tree = draw();
  assert.deepEqual(
    [scopeOf(tree).props["data-loading"], tableOf(tree).props["aria-busy"]],
    [undefined, undefined],
    "the view on screen is the one the address names: nothing is said",
  );
  // The address moved to a search the surface does not hold: its rows are still all leads.
  draw({ leadsRoute: `leads:s-${SEARCH_A}` });
  tree = draw({ leadsRoute: `leads:s-${SEARCH_A}` });
  assert.deepEqual(
    [scopeOf(tree).props["data-loading"], tableOf(tree).props["aria-busy"]],
    ["1", "true"],
    "REGRESSION: the old view's rows sat under the new title for up to a second, looking right and being wrong",
  );
  assert.equal(names(tree).length, 5, "and the rows are still drawn: nothing flashes empty");
  // The surface lands the view: the read the page made for it answers.
  await quiesce();
  assert.deepEqual(
    [L().route, L().view.searchId],
    [`clients/leads:s-${SEARCH_A}`, SEARCH_A],
    "the surface holds the view the address names",
  );
  tree = draw({ leadsRoute: `leads:s-${SEARCH_A}` });
  assert.deepEqual([scopeOf(tree).props["data-loading"], tableOf(tree).props["aria-busy"]], [undefined, undefined]);
});

test("a sort is a read too: the rows hold their order and say they are on their way, until the surface holds the view in that order", async () => {
  await fresh();
  const scopeOf = (tree) =>
    find(
      tree,
      (n) =>
        n.type === "div" &&
        String(n.props?.className || "")
          .split(" ")
          .includes("leads-scope"),
    );
  let tree = draw();
  assert.equal(scopeOf(tree).props["data-loading"], undefined);
  sortByHeading(tree, "Rated");
  tree = draw();
  assert.deepEqual(
    [scopeOf(tree).props["data-loading"], names(tree)[0]],
    ["1", "Zilker Strength Lab"],
    "the rows hold their order (a sort is the surface's to read, never the page's to re-order), and say so",
  );
  await quiesce();
  assert.deepEqual([L().view.sort, L().view.dir], ["rating", "desc"], "the surface holds the view in that order");
  tree = draw();
  assert.equal(scopeOf(tree).props["data-loading"], undefined, "landed in that order");
});

test("Show more says it is loading while the next page is on its way, takes no second press, and a Keep meanwhile does not make it say so", async () => {
  const held = await fresh({ leads: { more: PAGE_TWO } });
  let freeKeep;
  let freeMore;
  const keepWaits = new Promise((r) => {
    freeKeep = r;
  });
  const moreWaits = new Promise((r) => {
    freeMore = r;
  });
  held.gate = (sent) => (sent.includes("/keep") ? keepWaits : sent.includes("after_key") ? moreWaits : undefined);
  const more = (tree) => find(tree, (n) => n.type === "button" && n.props?.["data-testid"] === "leads-more-btn");
  const pages = () => pageReads().filter((q) => q.after_key).length;
  let tree = draw();
  assert.deepEqual([textOf(more(tree)).trim(), !!more(tree).props.disabled], ["Show more", false]);
  // A Keep in flight is not the next page.
  find(tree, (n) => n.props?.["data-testid"] === "lead-keep").props.onClick({
    stopPropagation() {},
    preventDefault() {},
  });
  tree = draw();
  assert.equal(wrote().length, 1, "the Keep is out");
  assert.equal(textOf(more(tree)).trim(), "Show more");
  freeKeep();
  await settle();
  tree = draw();
  click(more(tree));
  tree = draw();
  assert.deepEqual(
    [textOf(more(tree)).trim(), !!more(tree).props.disabled],
    ["Loading…", true],
    "REGRESSION: the button read Show more and stayed live while the page loaded, and read Loading… during an unrelated Keep",
  );
  click(more(tree));
  assert.equal(pages(), 1, "a second press while it loads asks for nothing");
  freeMore();
  await settle();
  assert.equal(L().rows.length, ROW_DTOS.length + PAGE_TWO.length, "the next page joined the rows");
  tree = draw();
  assert.equal(more(tree), null, "and that was the last: the line is gone");
});

test("leads a refresh found but did not sort in are offered on all leads too, in the list's head, with the same words and the same door as the strip's", async () => {
  await offering(null, 12);
  assert.equal(L().offered, 12, "the surface holds them back");
  let tree = draw();
  const pill = byTestId(tree, "leads-offered");
  assert.ok(
    pill,
    "REGRESSION: the count was computed and never shown outside an open search, so new leads never appeared on All leads under a fit sort",
  );
  assert.equal(textOf(pill).trim(), "12 new");
  await quiesce();
  reads.length = 0;
  click(pill);
  assert.deepEqual(
    pageReads().map((q) => [q.list, q.sort, q.dir]),
    [["all", "fit", "asc"]],
    "one press reads the view again in its order, as the strip's does",
  );
  await quiesce();
  assert.deepEqual(
    [L().offered, L().rows.length],
    [0, ROW_DTOS.length + 12],
    "and they are in the rows, in the order it read",
  );
  await offering(null, 0);
  assert.equal(byTestId(draw(), "leads-offered"), null, "nothing offered, nothing said");
  await offering({ searchId: SEARCH_A }, 3);
  assert.equal(L().offered, 3);
  tree = draw({ leadsRoute: `leads:s-${SEARCH_A}` });
  assert.equal(byTestId(tree, "leads-offered"), null, "an open search says it in its strip, once");
});

/** Whether anything in the tree is a strip of views: the frame's (SurfaceTabs) draws it from the page's chrome, no page does. */
const drawsAStrip = (tree) =>
  !!byTestId(tree, "people-scope") ||
  all(tree, (n) =>
    String(n.props?.className || "")
      .split(" ")
      .includes("stabs"),
  ).length > 0;

test("the People | Leads switch is the frame's strip of views, not the page's: neither scope draws one, deals on or off", async () => {
  // What the strip holds, which is picked and where a press goes are the chrome's (people/moments/people-views.test.mjs).
  await fresh();
  assert.equal(drawsAStrip(draw()), false, "Leads draws none of its own");
  assert.equal(drawsAStrip(draw({ scope: "people", leadsRoute: null })), false, "nor does the rail's page");
  surfaceValue("people").dealsOn = true;
  assert.equal(drawsAStrip(draw()), false, "and a third tab is the frame's to add, not the page's");
});

test("People and Leads are two components: each keeps its own state, and People listens for nothing of Leads'", async () => {
  // They were one component, every hook of both scopes declared in both in one order: the order the stub kept hooks
  // by. Each is its own now (PeopleReal, LeadsReal, over the same two hooks), and the shell mounts them apart.
  await fresh();
  const peopleBox = (tree) =>
    find(tree, (n) => n.type === "input" && n.props?.placeholder === "Search by name or phone…");
  const leadsBox = (tree) => find(tree, (n) => n.type === "input" && n.props?.placeholder === "Search leads");
  peopleBox(draw({ scope: "people", leadsRoute: null })).props.onChange({ target: { value: "zilker" } });
  assert.equal(peopleBox(draw({ scope: "people", leadsRoute: null })).props.value, "zilker");
  assert.equal(listeners["surface:leads"]?.size ?? 0, 0, "a Leads refresh does not draw People again");
  assert.ok(drawsFrom("people"), "People draws from People's surface");
  assert.ok(!drawsFrom("leads"), "and from People's surface alone: Leads' rows landing draw nothing of it");
  assert.equal(listeners.keydown?.size, 1, "one keyboard listener, People's");
  // Leads drawn over the same cells: its words are its own, and People's are where they were.
  assert.equal(leadsBox(draw()).props.value, "", "REGRESSION: one component, so one box for both scopes");
  assert.equal(peopleBox(draw({ scope: "people", leadsRoute: null })).props.value, "zilker");
  await fresh();
  draw();
  assert.ok(drawsFrom("leads"), 'Leads draws from its own surface (useSurface("leads"))');
  assert.ok(drawsFrom("people"), "and from People's, which carries the workspace's copy of its view");
  assert.equal(listeners.keydown?.size, 1, "one keyboard listener, Leads'");
});

test("the Leads view is saved with its list, sort and columns every time, over the wire as PUT views/leads, one save at a time", async () => {
  await fresh({ views: { leads: { list: "all", sortBy: "fit", sortDir: "asc", columns: { website: true } } } });
  // What the page's saves send (People's saveView, over the bridge's client), each held until the test lands it.
  const held = viewSaves;
  holdViewSaves = true;
  let tree = draw();
  assert.ok(headings(tree).includes("Website"), "the member's own columns");
  assert.deepEqual(held, [], "the view it already holds is not saved again");
  click(byTestId(tree, "people-columns"));
  tree = draw();
  click(byTestId(tree, "column-source"));
  tree = draw();
  assert.equal(held.length, 1);
  assert.deepEqual(
    held[0],
    {
      page: "leads",
      view: { list: "all", sortBy: "fit", sortDir: "asc", columns: { website: true, source: true } },
      land: held[0].land,
    },
    "every key the page owns, the list included",
  );
  // A second change while the first is out waits for it: two in flight could land out of order.
  sortByHeading(tree, "Rated");
  draw();
  assert.equal(held.length, 1, "one save at a time");
  held[0].land({ ok: true });
  await settle();
  assert.equal(held.length, 2);
  assert.deepEqual(
    held[1].view,
    { list: "all", sortBy: "rating", sortDir: "desc", columns: { website: true, source: true } },
    "the latest view, whole",
  );
  held[1].land({ ok: true });
  await settle();
  assert.equal(held.length, 2, "and nothing after it");
});

test("REGRESSION: a cold open of Leads still takes the view the workspace remembers -- it rides with People, which lands after Leads, and the page had settled for this device's copy and never looked again", async () => {
  // The last read of a view the wire saw: the sort and the order the page asked for.
  const lastRead = () => pageReads().at(-1);
  await fresh({ people: false });
  const held = viewSaves;
  holdViewSaves = true;
  let tree = draw();
  // The view the page asks for is the one the boot read, held since with nothing changed: nothing is read again for it.
  assert.deepEqual(
    [L().view.sort, L().view.dir, pageReads().length, headings(tree).includes("Website")],
    ["fit", "asc", 0, false],
    "nothing to go on yet: the page's own defaults, as the boot read them",
  );
  // People lands, carrying what this member chose on another computer.
  publishPeople(peopleWith({ leads: { list: "all", sortBy: "rating", sortDir: "desc", columns: { website: true } } }));
  draw();
  tree = draw();
  assert.deepEqual([lastRead().sort, lastRead().dir], ["rating", "desc"], "the sort they chose is the one read");
  assert.ok(headings(tree).includes("Website"), "and their columns are the ones drawn");
  assert.deepEqual(held, [], "taking the workspace's view is not a change to save back to it");
  // Once they have chosen here, a copy that arrives late does not take the choice back.
  await fresh({ people: false });
  tree = draw();
  sortByHeading(tree, "Found");
  draw();
  publishPeople(peopleWith({ leads: { list: "all", sortBy: "rating", sortDir: "desc", columns: {} } }));
  draw();
  draw();
  assert.equal(lastRead().sort, "found", "what the owner just pressed stands");
});

test("a sort is the surface's to read, not the page's to re-order: the rows hold their order until the read lands", async () => {
  await fresh();
  let tree = draw();
  assert.deepEqual(
    pageReads().length,
    0,
    "nothing read for the view the address names: the boot read it, and nothing has changed since",
  );
  sortByHeading(tree, "Rated");
  tree = draw();
  const views = pageReads();
  assert.equal(views.length, 1, "the new sort is one read, keyed by the whole view");
  assert.deepEqual([views[0].sort, views[0].dir, views[0].list], ["rating", "desc", "all"]);
  assert.deepEqual(
    names(tree),
    ["Zilker Strength Lab", "Barton Creek Coaching", "Lamar Strength Co.", "GigaFit Austin", "Pflugerville Training"],
    "and nothing moved under the owner while it was out",
  );
});

test("REGRESSION: Call asks how, instead of ringing a business the moment a thumb lands on a row -- and the receptionist is not one of the ways, because it never rings a customer", async () => {
  await fresh();
  menus.length = 0;
  draw();
  const ways = menus.find((m) => m.title === `Call ${ROWS[0].name}` && m.testid === "lead-call");
  assert.ok(ways, "REGRESSION: it dialled on press; it opens the ways of calling now");
  assert.equal(ways.testid, "lead-call", "and its button is Call, where it was");
  assert.equal(ways.icon, "phone", "and still looks like calling -- a ⋯ would hide what the button is for");

  const W = LEAD_WORDS.callWays;
  assert.deepEqual(
    ways.items.map((i) => i.header ?? i.label),
    [ways.items[0].header, W.dial.label, W.copy.label, W.log.label],
    "the number you would dial, then the three ways -- the words are contracts'",
  );
  assert.match(String(ways.items[0].header), /512/, "the heading is the number itself");

  // The receptionist answers the line and never rings a customer (business-tab.ts CANNOT_ROWS, "outbound_call"),
  // which the Business page tells the owner in those words. No way here may promise otherwise.
  const said = ways.items.map((i) => `${i.label ?? ""} ${i.meta ?? ""} ${i.header ?? ""}`).join(" ");
  assert.equal(
    /receptionist|assistant|agent|for me|on my behalf|auto/i.test(said),
    false,
    "REGRESSION: a way that promises what the product says two pages away it cannot do",
  );

  // Nothing rang by drawing the menu, and each way does its own thing.
  assert.equal(globalThis.window.location.href, "", "drawing the ways dials nobody");
  const way = (label) => ways.items.find((i) => i.label === label);
  way(W.dial.label).onClick();
  draw();
  assert.match(globalThis.window.location.href, /^tel:/, "Call from your phone dials");
  assert.equal(peeks.at(-1).vm.id, "l1", "and opens the lead, where the six outcomes are asked");

  // A call made from a desk phone: the same sheet, nothing rung. There was no way to record one at all.
  await fresh();
  menus.length = 0;
  draw();
  const again = menus.find((m) => m.title === `Call ${ROWS[0].name}` && m.testid === "lead-call");
  again.items.find((i) => i.label === W.log.label).onClick();
  draw();
  assert.equal(globalThis.window.location.href, "", "REGRESSION: logging a call you already made rang them again");
  assert.equal(peeks.at(-1).vm.id, "l1", "it opens the lead on the same question");
});

test("a click on a lead's row peeks it, as Enter does", async () => {
  await fresh();
  const tree = draw();
  find(tree, (n) => n.type === "tr" && n.props?.id === "lead-l3").props.onClick();
  draw();
  assert.equal(peeks.at(-1).vm.id, "l3", "the row is the peek's way in; the name inside it is the other");
  assert.deepEqual(opened, [], "and a lead is never a profile");
});

test("the search box filters the leads loaded, by name, kind and area, and sends nothing", async () => {
  await fresh();
  let tree = draw();
  const box = find(tree, (n) => n.type === "input" && n.props?.placeholder === "Search leads");
  const before = reads.length + writes.length;
  box.props.onChange({ target: { value: "lamar" } });
  tree = draw();
  assert.deepEqual(names(tree), ["Lamar Strength Co."]);
  box.props.onChange({ target: { value: "78704" } });
  tree = draw();
  assert.deepEqual(names(tree).length, 5, "the area they are all in");
  box.props.onChange({ target: { value: "gigafit" } });
  tree = draw();
  assert.deepEqual(names(tree), ["GigaFit Austin"]);
  assert.equal(reads.length + writes.length, before, "nothing was asked of the server: words to chips is release C");
});

/* ------------------------------------ the keys ------------------------------------ */

const cursorRow = (tree) =>
  find(tree, (n) => n.type === "tr" && /\bfocused\b/.test(n.props?.className || ""))?.props.id ?? null;

test("the keys: J and K move, Enter peeks, x selects, C calls, F opens Ask; one listener before and after the scope draws", async () => {
  await fresh();
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
  assert.equal(
    globalThis.window.location.href,
    "tel:+15125550101",
    "C dials the lead under the cursor from the owner's own phone",
  );
  assert.equal(press("f"), true);
  assert.equal(asks.at(-1), "open", "F opens Ask as ⌘K does, the finder on this page (spec F7)");
  assert.equal(panels.length, 0, "and no panel of the page's own: nothing on it composes");
  // The button is the same door, wearing the three's mark; its click event is not words.
  const door = byTestId(draw(), "leads-find");
  assert.ok(
    find(door, (n) => n.type === Icon && n.props?.name === "three"),
    "the mark",
  );
  click(door);
  assert.equal(asks.at(-1), "open", "a click event is not words: the plain open, nothing seeded");
});

test("REGRESSION: Leads draws no key -- its search box drew a / and Find leads an F, beside the ? sheet that lists them", async () => {
  await fresh();
  const tree = draw();
  assert.equal(textOf(byTestId(tree, "leads-find")).trim(), "Find leads");
  assert.deepEqual(keysDrawn(tree), []);
  assert.equal(press("f"), true, "F still finds");
  assert.equal(asks.at(-1), "open");
});

test("Esc closes the peek, then the plan panel, then the Columns menu, then the selection -- one press each, in that order", async () => {
  await fresh();
  byTestId(draw(), "select-all").props.onChange();
  draw();
  press("j");
  draw();
  press("Enter", { tagName: "TR", isContentEditable: false, closest: () => null });
  draw();
  // The plan panel's door on the page: a kept search's Search again, changed (F is Ask's, spec F7).
  menuOf("Personal trainers · Austin")
    .items.find((i) => i.label === "Search again, changed")
    .onClick();
  draw();
  click(byTestId(draw(), "people-columns"));
  // Everything the page can have open at once, opened: the peek, the plan panel, the Columns menu and a selection.
  let tree = draw();
  const drawn = { peeks: peeks.length, panels: panels.length };
  assert.ok(byTestId(tree, "people-columns-menu"), "the menu is open");
  assert.equal(peeks.at(-1).vm.id, "l1", "so is the peek");
  assert.equal(panels.at(-1).open, true, "and the plan panel");
  assert.equal(press("j"), false, "the plan panel holds every key while it is open");
  assert.equal(press("Escape"), true);
  draw();
  assert.equal(peeks.length, drawn.peeks, "the peek went first: it is not drawn any more");
  assert.equal(panels.length, drawn.panels + 1, "and the plan panel is still open");
  assert.equal(press("Escape"), true);
  tree = draw();
  assert.equal(panels.length, drawn.panels + 1, "the plan panel went second");
  assert.ok(byTestId(tree, "people-columns-menu"), "the Columns menu is still open");
  assert.equal(press("Escape"), true);
  tree = draw();
  assert.equal(byTestId(tree, "people-columns-menu"), null, "the Columns menu went third");
  assert.match(textOf(byTestId(tree, "leads-bulk-bar")), /5 selected/, "and the selection is still there");
  assert.equal(press("Escape"), true);
  assert.equal(byTestId(draw(), "leads-bulk-bar"), null, "the selection goes last");
});

test("the peek is the page's own overlay: J and K keep walking the rows behind it, and a menu over the page still silences them", async () => {
  await fresh();
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

/* ------------------------ the lead that is open, and the address ------------------------ */

// Leads whose ids are ids, as the door's are: the address admits nothing else after `p-` (contracts parseLeadsRoute).
const UA = "1ead0000-0000-4000-8000-00000000000a";
const UB = "1ead0000-0000-4000-8000-00000000000b";
const UC = "1ead0000-0000-4000-8000-00000000000c";
const ID_DTOS = [
  leadRow({ id: UA }),
  leadRow({ id: UB, place_id: "ChIJfixture000b", business_name: "Barton Creek Coaching" }),
  leadRow({ id: UC, place_id: "ChIJfixture000c", business_name: "Lamar Strength Co." }),
];
const ID_ROWS = ID_DTOS.map((r) => toLeadRowVM(r, TZ, NOW));
const ENTER_ON_ROW = { tagName: "TR", isContentEditable: false, closest: () => null };

/** A page over leads with real ids, drawn at an address the way the shell hands it over, its navigations kept. */
const addressed = async (leads = {}) => {
  const held = await fresh({ leads: { rows: ID_DTOS, ...leads } });
  const navs = [];
  const backs = [];
  globalThis.window.history.back = () => {
    backs.push(1);
  };
  const at = (route) =>
    draw({
      leadsRoute: route,
      onNavigate: (to, opts) => {
        navs.push([to, opts && opts.replace ? "replace" : "push"]);
      },
    });
  const openPeek = () => (peeks.length ? peeks.at(-1) : null);
  return { navs, backs, at, openPeek, held };
};

// PR 9: the peek drew only a lead on a page loaded, so a link to a lead further down -- or one Ask named -- opened on
// nothing. The surface reads it on its own now (leads-bridge.test.mjs); the page draws what it answers, keeps the
// address, and its acts find the lead where the surface holds it (`peeked`).
test("a lead the address names that is on no page loaded opens once the bridge has read it, keeps its address, and its acts act on it", async () => {
  const FAR = "1ead0000-0000-4000-8000-0000000000ff";
  const far = leadRow({
    id: FAR,
    search_id: SEARCH_B,
    place_id: "ChIJfixture00ff",
    business_name: "Far Down The List",
  });
  // GET leads/[id] answers it: the surface reads it on its own, since no page loaded holds it.
  const { navs, at, openPeek } = await addressed({ one: { [FAR]: far } });
  at(`leads:p-${FAR}`);
  at(`leads:p-${FAR}`);
  assert.equal(openPeek(), null, "nothing drawn while its read is out, and never another lead in its place");
  assert.deepEqual(
    reads.filter((r) => r.startsWith(`/api/v1/leads/${FAR}`)),
    [`/api/v1/leads/${FAR}?workspace=salon`],
    "asked once, however many draws pass before it answers",
  );
  await quiesce();
  at(`leads:p-${FAR}`);
  assert.equal(openPeek().vm.id, FAR, "drawn once it lands");
  assert.deepEqual(navs, [], "the address is left as the link said it");
  openPeek().onKeep(FAR);
  await settle();
  assert.deepEqual(
    lastWrite(),
    { key: `POST /api/v1/leads/${FAR}/keep`, body: { search_id: SEARCH_B } },
    "Keep from its peek names its own search: the page found the lead beside the rows",
  );
});

test("the page hands the peek its ⋯ as contracts says for the member: Erase for the owner, which closes the lead through the one door; nothing for an operator (PR 9)", async () => {
  const { at, openPeek } = await addressed();
  at(`leads:p-${UA}`);
  at(`leads:p-${UA}`);
  assert.deepEqual(
    openPeek().menu.map((m) => [m.id, m.label]),
    [["erase", LEAD_WORDS.erase.act]],
    "the owner's peek offers Erase",
  );
  openPeek().onEraseAsk();
  at(`leads:p-${UA}`);
  assert.equal(openPeek().mode, "erase", "asked in the peek first");
  await openPeek().onErase();
  at(`leads:p-${UA}`);
  assert.deepEqual(lastWrite(), { key: `DELETE /api/v1/leads/${UA}` });
  assert.equal(flashes.at(-1).msg, LEAD_WORDS.erase.done(ID_ROWS[0].name), "a toast says it is gone");
  await fresh({ leads: { rows: ID_DTOS }, role: "operator" });
  draw({ leadsRoute: `leads:p-${UA}` });
  draw({ leadsRoute: `leads:p-${UA}` });
  assert.deepEqual(peeks.at(-1).menu, [], "an operator's peek is offered no ⋯: the door is the owner's");
});

test("the lead that is open is in the address: opening pushes it, the cursor walking the peek on replaces it, and closing goes back to the entry the opening made", async () => {
  const { navs, backs, at } = await addressed();
  at("leads");
  press("j");
  at("leads");
  press("Enter", ENTER_ON_ROW);
  at("leads");
  assert.deepEqual(
    navs,
    [[`clients/leads:p-${UA}`, "push"]],
    "an entry of its own, so Back closes the lead instead of leaving Leads",
  );
  at("leads");
  assert.equal(navs.length, 1, "said once, however many draws pass before the address answers");
  at(`leads:p-${UA}`);
  assert.equal(navs.length, 1, "and the address answering is not news");
  press("j");
  at(`leads:p-${UA}`);
  at(`leads:p-${UA}`);
  assert.deepEqual(
    navs.at(-1),
    [`clients/leads:p-${UB}`, "replace"],
    "walking on is the same place said more exactly: Back must not replay every lead passed",
  );
  at(`leads:p-${UB}`);
  const drawn = peeks.length;
  assert.equal(press("Escape"), true);
  at(`leads:p-${UB}`);
  assert.deepEqual(
    [backs.length, navs.length],
    [1, 2],
    "closing goes back to the entry the opening made, and writes nothing over it",
  );
  at("leads");
  at("leads");
  assert.deepEqual(
    [backs.length, navs.length, peeks.length > drawn + 1],
    [1, 2, false],
    "and the address answering that is not news either",
  );
});

test("the address opens the lead: a refresh, a link or Forward draws the peek, Back closes it, and a lead that came with the address closes by replacing", async () => {
  const { navs, backs, at, openPeek } = await addressed();
  at(`leads:p-${UB}`);
  at(`leads:p-${UB}`);
  assert.equal(openPeek().vm.id, UB, "the lead the address names is open, with nothing pressed");
  assert.deepEqual(navs, [], "and the page says nothing the address already says");
  // The draw that hears the address still holds the lead it had; the one after it is the page having followed.
  at("leads");
  const drawn = peeks.length;
  at("leads");
  assert.equal(peeks.length, drawn, "Back took the lead off the address, and the peek went with it");
  at(`leads:p-${UC}`);
  at(`leads:p-${UC}`);
  assert.equal(openPeek().vm.id, UC, "Forward, or another link, opens that one");
  assert.equal(press("Escape"), true);
  at(`leads:p-${UC}`);
  assert.deepEqual(
    [navs, backs.length],
    [[["clients/leads", "replace"]], 0],
    "no entry of the page's own to go back to: going back would leave Leads",
  );
});

test("a lead opened over a view is not a new view: nothing is read again, the selection stays, and a rail pick closes the lead rather than carrying it along", async () => {
  const { navs, at } = await addressed();
  byTestId(at("leads"), "select-all").props.onChange();
  at("leads");
  press("j");
  at("leads");
  press("Enter", ENTER_ON_ROW);
  at("leads");
  at(`leads:p-${UA}`);
  const tree = at(`leads:p-${UA}`);
  assert.equal(
    pageReads().length,
    0,
    "nothing read for the view (held since the last change), however many leads are opened over it",
  );
  assert.match(textOf(byTestId(tree, "leads-bulk-bar")), /3 selected/, "and the selection is still there");
  const said = navs.length;
  at(`leads:s-${SEARCH_A}`);
  const drawn = peeks.length;
  at(`leads:s-${SEARCH_A}`);
  assert.equal(peeks.length, drawn, "the view changed under the lead, so the lead is closed");
  assert.equal(
    byTestId(draw({ leadsRoute: `leads:s-${SEARCH_A}` }), "leads-bulk-bar"),
    null,
    "and a selection never outlives its view",
  );
  assert.equal(navs.length, said, "and the old view's lead is not written onto the new view's address");
  assert.equal(pageReads().length, 1, "the new view is read, once");
});

/* ------------------------------ the page keeps your place ------------------------------ */

const searchBox = (tree) => find(tree, (n) => n.type === "input" && n.props?.placeholder === "Search leads");
/** The tab refreshed, or the owner went to the Inbox and came back: the page's state is gone, the tab's storage is not. */
const comeBack = (props) => {
  cells = [];
  setters = [];
  for (const k of Object.keys(listeners)) delete listeners[k];
  draw(props);
  return draw(props);
};

test("the search box's words, the row the cursor was on and the map come back with the view: after a refresh, and after leaving and coming back", async () => {
  await fresh();
  let tree = draw();
  searchBox(tree).props.onChange({ target: { value: "strength" } });
  draw();
  press("j");
  draw();
  press("j");
  tree = draw();
  assert.deepEqual([names(tree), cursorRow(tree)], [["Zilker Strength Lab", "Lamar Strength Co."], "lead-l3"]);
  tree = comeBack();
  assert.equal(searchBox(tree).props.value, "strength", "the words are in the box again");
  assert.deepEqual(names(tree), ["Zilker Strength Lab", "Lamar Strength Co."], "and the rows are the ones they found");
  assert.equal(cursorRow(tree), "lead-l3", "the cursor is on the row it was on");
  // The map stands where the table stood, so it is its own trip: left open, it is open on the way back.
  click(byTestId(tree, "leads-map-toggle"));
  draw();
  tree = comeBack();
  assert.ok(byTestId(tree, "lead-map"), "the map is open, as it was left");
  assert.equal(searchBox(tree).props.value, "strength", "with the words still in the box");
});

test("REGRESSION: the list is put back only once the rows on screen are the ones the view's own words leave -- put back a draw sooner, over every row, the browser re-anchored it as the words shrank the list (500 became 122 on production)", async () => {
  let drawing = 0;
  const putBack = [];
  const table = {
    scrollHeight: 6000,
    clientHeight: 600,
    top: 0,
    get scrollTop() {
      return this.top;
    },
    set scrollTop(v) {
      this.top = v;
      putBack.push({ to: v, duringDraw: drawing });
    },
  };
  // The shared pane (paned, below the place's tests): a scroll reaches every capture listener the pane has, as a
  // browser delivers it. This test picked "the" listener by its place in a list, and the pane has two.
  const { mount, scrolls } = await paned(table);
  const mounted = () => {
    putBack.length = 0;
    return mount(undefined, (n) => {
      drawing = n;
    });
  };
  const settled = () => new Promise((r) => setTimeout(r, 260));
  let tree = mounted();
  searchBox(tree).props.onChange({ target: { value: "strength" } });
  draw();
  table.top = 500;
  scrolls(table);
  await settled();
  tree = mounted();
  assert.equal(searchBox(tree).props.value, "strength");
  assert.deepEqual(
    putBack,
    [{ to: 500, duringDraw: 2 }],
    "after the draw that put the words back, not during the one that still drew every row",
  );
  // A view with no words of its own has nothing to wait for.
  searchBox(tree).props.onChange({ target: { value: "" } });
  draw();
  table.top = 300;
  scrolls(table);
  await settled();
  mounted();
  assert.deepEqual(putBack, [{ to: 300, duringDraw: 1 }]);
});

test("a cursor that came back with the view marks its row and takes nothing: not the focus, and not the scroll the list was just put back to", async () => {
  await fresh();
  const took = [];
  const row = { focus: () => took.push("focus"), scrollIntoView: () => took.push("scroll"), contains: () => false };
  const keep = globalThis.document.getElementById;
  globalThis.document.getElementById = (id) => (/^lead-/.test(id) ? row : null);
  try {
    draw();
    press("j");
    draw();
    assert.deepEqual(
      took,
      ["focus", "scroll"],
      "a key that moves the cursor takes focus to its row and keeps it in sight, as ever",
    );
    took.length = 0;
    const tree = comeBack();
    assert.equal(cursorRow(tree), "lead-l1", "the row is marked");
    assert.deepEqual(
      took,
      [],
      "REGRESSION: the row's scrollIntoView ran after the list was put back, and moved it 37px on (seen in a browser)",
    );
    press("j");
    draw();
    assert.deepEqual(took, ["focus", "scroll"], "and the next key moves on from it");
  } finally {
    globalThis.document.getElementById = keep;
  }
});

test("each view keeps its own place: what was typed over one search is not the next one's, and is there again on the way back", async () => {
  await fresh();
  const at = (route) => {
    draw({ leadsRoute: route });
    return draw({ leadsRoute: route });
  };
  searchBox(at("leads")).props.onChange({ target: { value: "lamar" } });
  at("leads");
  let tree = at(`leads:s-${SEARCH_A}`);
  assert.equal(
    searchBox(tree).props.value,
    "",
    "a search opened from the rail starts with an empty box: the page stayed, its words did not follow",
  );
  assert.equal(names(tree).length, 5);
  searchBox(tree).props.onChange({ target: { value: "zilker" } });
  at(`leads:s-${SEARCH_A}`);
  assert.equal(searchBox(at("leads")).props.value, "lamar", "back on all leads, with what was typed there");
  assert.equal(searchBox(at(`leads:s-${SEARCH_A}`)).props.value, "zilker", "and the search has its own");
});

test("a view starts clean of the view before it: its fit filter and its open map do not follow the owner down the rail", async () => {
  await fresh();
  // The surface holds the search's view already: the page opens on it.
  await leadsView({ searchId: SEARCH_A });
  const at = (route) => {
    draw({ leadsRoute: route });
    return draw({ leadsRoute: route });
  };
  let tree = at(`leads:s-${SEARCH_A}`);
  click(byTestId(tree, "leads-map-toggle"));
  tree = at(`leads:s-${SEARCH_A}`);
  assert.ok(byTestId(tree, "lead-map"));
  tree = at("leads:l-ready");
  assert.equal(byTestId(tree, "lead-map"), null, "the list picked next draws its table");
  assert.equal(searchBox(tree).props.value, "");
});

/**
 * The page with a pane a browser could have given it. The pane's ref is found on a first draw and put in place before
 * the next first draw: React sets a ref before it runs an effect, and the stub runs an effect as it draws. The pane
 * keeps its scroll listeners with the phase each went up in (a removal takes down only one in that same phase) and its
 * attributes, and holds the table's own box. scrolls(box) is a scroll as a browser delivers it: it does not bubble, so
 * a box inside the pane reaches only the pane's capture listeners, and the pane's own scroll reaches them all.
 */
const paned = async (table) => {
  await fresh();
  const paneRef = find(draw(), (n) =>
    String(n.props?.className || "")
      .split(/\s+/)
      .includes("cl-main-scroll"),
  ).props.ref;
  // The cell the ref lives in, by the key its component keeps it under (_hook-frames.mjs).
  const at = Object.keys(cells).find((k) => cells[k] === paneRef);
  assert.ok(at !== undefined, "the pane's ref is one of the page's cells");
  const heard = [];
  const attrs = {};
  const capture = (opts) => opts === true || !!(opts && opts.capture);
  const pane = {
    scrollTop: 0,
    scrollHeight: 600,
    clientHeight: 600,
    addEventListener: (type, fn, opts) => {
      if (type === "scroll") heard.push({ fn, capture: capture(opts) });
    },
    removeEventListener: (type, fn, opts) => {
      const i = heard.findIndex((h) => type === "scroll" && h.fn === fn && h.capture === capture(opts));
      if (i >= 0) heard.splice(i, 1);
    },
    setAttribute: (k, v) => {
      attrs[k] = String(v);
    },
    removeAttribute: (k) => {
      delete attrs[k];
    },
    querySelector: (sel) => (sel === ".pl-table-scroll" ? table : null),
  };
  // `onDraw` hears which draw is under way (1, 2, then 0 for none): what a test of ORDER needs, and nothing else does.
  const mount = (props, onDraw = () => {}) => {
    cells = [];
    setters = [];
    cells[at] = { current: pane };
    for (const k of Object.keys(listeners)) delete listeners[k];
    heard.length = 0;
    onDraw(1);
    draw(props);
    onDraw(2);
    const tree = draw(props);
    onDraw(0);
    return tree;
  };
  const scrolls = (target) => {
    for (const h of [...heard]) if (h.capture || target === pane) h.fn({ target });
  };
  return { pane, heard, attrs, mount, scrolls };
};

test("the list is scrolled back to where it was once the view's rows are the ones on screen -- never over the rows of the view before", async () => {
  // A desktop: the rows overflow the table's own box inside the pane, and that is the box that scrolls.
  const table = { scrollTop: 0, scrollHeight: 6000, clientHeight: 600 };
  const { mount: mountWithPane, scrolls } = await paned(table);
  mountWithPane();
  table.scrollTop = 1380;
  scrolls(table);
  await new Promise((r) => setTimeout(r, 260));
  table.scrollTop = 0;
  mountWithPane();
  assert.equal(table.scrollTop, 1380, "a refresh puts the list back where it was");
  // The address names a search whose rows have not landed: the surface still holds all leads.
  table.scrollTop = 0;
  mountWithPane({ leadsRoute: "leads" });
  table.scrollTop = 700;
  draw({ leadsRoute: `leads:s-${SEARCH_A}` });
  draw({ leadsRoute: `leads:s-${SEARCH_A}` });
  assert.equal(table.scrollTop, 700, "the old view's rows are not scrolled for the new view");
  // The read the page made for the search lands: the surface holds the view the address names.
  await quiesce();
  draw({ leadsRoute: `leads:s-${SEARCH_A}` });
  assert.equal(table.scrollTop, 0, "the new view's rows start at their top");
});

test("a list that is moving shows no hover, on a desktop too: the pane is marked while the table's own box scrolls, for that box alone, and its listener comes down with the page", async () => {
  const table = { scrollTop: 0, scrollHeight: 6000, clientHeight: 600 };
  const { pane, heard, attrs, mount, scrolls } = await paned(table);
  const still = () => new Promise((r) => setTimeout(r, 200));
  mount();
  // A desktop: the rows overflow the table's own box, and that is the box that moves.
  scrolls(table);
  assert.equal(
    attrs["data-scrolling"],
    "1",
    "REGRESSION: the pane listened for its own scroll only, and on a desktop it never scrolls -- the cards stayed up over a moving list (seen in a browser)",
  );
  scrolls(table);
  await still();
  assert.equal(attrs["data-scrolling"], undefined, "still again: they may show");
  // Some other box inside the pane (a menu's list, a card's text) is not the list moving.
  scrolls({ scrollTop: 40, scrollHeight: 900, clientHeight: 300 });
  assert.equal(attrs["data-scrolling"], undefined, "a box that is not the list's marks nothing");
  // A phone: the table's box holds every row, and the pane is what scrolls.
  table.scrollHeight = 600;
  scrolls(table);
  assert.equal(attrs["data-scrolling"], undefined, "the table's box is not the scroller when nothing overflows it");
  scrolls(pane);
  assert.equal(attrs["data-scrolling"], "1", "on a phone the pane moves, and is marked as it always was");
  await still();
  assert.equal(attrs["data-scrolling"], undefined);
  // The page turns to People: what it put on the pane for Leads comes down in the phase it went up in (a browser
  // removes a capture listener only when told it is one), and the one a moving list needs goes up again.
  assert.deepEqual(
    heard.map((h) => h.capture),
    [true, true],
    "on Leads: this listener, and the one that keeps the place",
  );
  draw({ scope: "people", leadsRoute: null });
  assert.deepEqual(
    heard.map((h) => h.capture),
    [true, true],
    "on People too: the moving-list listener, and the one that keeps the place -- People keeps its place as Leads does (the loading standard's F)",
  );
});

test("typing in the box keeps the selection: leads the words hide are still selected when the box is cleared, and the bar says how many it is not showing", async () => {
  await fresh();
  let tree = draw();
  byTestId(tree, "select-all").props.onChange();
  tree = draw();
  assert.match(textOf(byTestId(tree, "leads-bulk-bar")), /5 selected/);
  searchBox(tree).props.onChange({ target: { value: "lamar" } });
  draw();
  tree = draw();
  const bar = byTestId(tree, "leads-bulk-bar");
  assert.ok(bar, "REGRESSION: one letter in the box dropped everything selected");
  assert.match(textOf(bar), /1 selected/, "the bar still counts, and acts on, only what it shows");
  assert.match(textOf(byTestId(bar, "leads-bulk-hidden")), /4 more not shown/, "and says the rest are there");
  searchBox(tree).props.onChange({ target: { value: "" } });
  draw();
  tree = draw();
  assert.match(textOf(byTestId(tree, "leads-bulk-bar")), /5 selected/, "the box cleared, they are all back");
  assert.equal(byTestId(tree, "leads-bulk-hidden"), null, "with nothing hidden, nothing is said about it");
});

/** The table's rows as drawn (surfaces/people/table/table.tsx PeopleRow, or its memo). */
const tableRowsOf = (tree) =>
  all(
    tree,
    (n) => (n.type && n.type.name === "PeopleRow") || (n.type && n.type.type && n.type.type.name === "PeopleRow"),
  );
/** What a row is handed that is not its own: each the same object from one draw to the next, or every row draws again. */
const ROW_HELD = ["columns", "ctx", "onToggle", "onCursor", "onOpen", "rowClass", "words"];

test("a row is drawn from what is its own, so a draw that changed nothing of a row can leave it alone: every prop is a primitive or the same object as last time", async () => {
  await fresh();
  const rowsOf = tableRowsOf;
  // A page that opens reads its view again behind the rows it holds, and the surface publishes them anew as it does (a view
  // held paints at once and is patched, surface.ts readView): the draw after that is the one that holds still.
  draw();
  let tree = draw();
  const a = rowsOf(tree);
  assert.ok(a.length >= 5, "the table draws its rows as PeopleRow");
  tree = draw();
  const b = rowsOf(tree);
  const stable = ROW_HELD;
  for (const k of stable)
    assert.ok(Object.is(a[0].props[k], b[0].props[k]), `${k} is the same object on a draw that changed nothing`);
  for (const k of ["selected", "focused", "tabStop", "selectable"])
    assert.equal(typeof a[0].props[k], "boolean", `${k} is a boolean, never the whole selection or the cursor`);
  assert.ok(
    Object.is(a[0].props.p, b[0].props.p),
    "and the row's own view model, which the surface rebuilds only when it publishes",
  );
  // What a press changes is the pressed row's alone.
  press("j");
  tree = draw();
  const c = rowsOf(tree);
  assert.deepEqual(
    c.map((r) => r.props.focused),
    [true, false, false, false, false],
  );
  for (const k of stable) assert.ok(Object.is(c[1].props[k], b[1].props[k]), `${k} held through a key`);
  press("x");
  tree = draw();
  const d = rowsOf(tree);
  assert.deepEqual(
    d.map((r) => r.props.selected),
    [true, false, false, false, false],
  );
  for (const k of stable) assert.ok(Object.is(d[1].props[k], b[1].props[k]), `${k} held through a tick`);
});

test("REGRESSION: the Pipeline's rows too -- a draw that changed nothing of a row hands it the same objects, the table's own default for a door the page does not pass among them", async () => {
  // The Pipeline selects nobody, so it passes no onToggle, and the table's default was written in its parameter list:
  // a new function on every draw, which every memoised row compared and drew again for, on each key, fold and toast.
  await fresh();
  const day = 86_400_000;
  const at = (days) => new Date(NOW.getTime() - days * day).toISOString();
  const person = (id, name, deal) => ({
    id,
    display_name: name,
    phone_e164: `+1512555${id.length}${name.length}00`,
    consent: "opted_in",
    channels: ["whatsapp"],
    conversation_count: 1,
    latest_conversation_id: `cv-${id}`,
    last_message_at: at(30),
    last_inbound_at: at(30),
    first_contact_at: at(60),
    has_chat: true,
    ...deal,
  });
  const proposed = (days) => ({ deal_id: `d${days}`, deal_stage: "proposed", deal_proposed_at: at(days) });
  const rows = [
    person("k1", "Ana", proposed(9)),
    person("k2", "Ben", proposed(3)),
    person("k3", "Cy", proposed(1)),
  ].map((r) => toPersonRowVM(r, TZ, NOW));
  // What the Pipeline reads through the seam (useSurface("people")): the rows over the surface this world holds.
  setSurfaceValue("people", { ...surfaceValue("people"), rows, dealsOn: true, fetchedAt: NOW.getTime() });
  const drawPipeline = () => {
    frames.begin();
    return PipelineScope({ onNavigate: (to) => went.push(to), onOpenProfile: (id) => opened.push(id) });
  };
  try {
    const a = tableRowsOf(drawPipeline());
    assert.deepEqual(
      a.map((r) => r.props.p.name),
      ["Ana", "Ben", "Cy"],
      "the Pipeline draws People's table",
    );
    const b = tableRowsOf(drawPipeline());
    for (const k of ROW_HELD)
      assert.ok(Object.is(a[0].props[k], b[0].props[k]), `${k} is the same object on a draw that changed nothing`);
    assert.ok(Object.is(a[0].props.p, b[0].props.p), "and the row's own view model: one clock, the surface's");
    press("j");
    const c = tableRowsOf(drawPipeline());
    assert.deepEqual(
      c.map((r) => r.props.focused),
      [true, false, false],
    );
    for (const k of ROW_HELD) assert.ok(Object.is(c[1].props[k], b[1].props[k]), `${k} held through a key`);
    assert.ok(Object.is(c[1].props.p, b[1].props.p), "a row the key did not touch keeps its view model");
  } finally {
    setSurfaceValue("people", undefined);
  }
});

test("the peek is handed acts, not setters: every control it draws has a function behind it, and each one moves the page's own state", async () => {
  await fresh();
  draw();
  press("j");
  draw();
  press("Enter", { tagName: "TR", isContentEditable: false, closest: () => null });
  draw();
  const peek = peeks.at(-1);
  assert.equal(peek.vm.id, "l1", "the peek is open on the lead under the cursor");
  // What the peek (surfaces/leads/peek) reads off its props as `on.<name>`: the stage, Not a fit, Draft and its tones, Open in
  // your email, Copy, the two answers to "Did you send it?", the way back and the way out. Handed the page's raw
  // setters instead, every one of them is undefined -- a pane of dead controls that the peek's own unit tests
  // never see, because those build the acts themselves and this page did not.
  const dead = [
    "onStage",
    "onNotAFit",
    "onWhy",
    "onDraft",
    "onTone",
    "onOpenMail",
    "onCopyDraft",
    "onSaidSent",
    "onNotYet",
    "onOutcome",
    "onNote",
    "onSaveCall",
    "onCancelCall",
    "onBack",
    "onClose",
    "onKeep",
    "onExclude",
    "onPutBack",
    "onCopy",
    "onCall",
  ].filter((k) => typeof peek[k] !== "function");
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
  assert.deepEqual(
    ["onMode", "onArmed", "onDraftState", "onPeekId"].filter((k) => peek[k] !== undefined),
    [],
    "the acts, not the setters",
  );
});

/* ------------------------------------ the bulk bar ------------------------------------ */

test("the bulk bar acts on the leads loaded and selected; Select all N that match hands the view to the server", async () => {
  await fresh();
  byTestId(draw(), "select-all").props.onChange();
  let tree = draw();
  assert.match(textOf(byTestId(tree, "leads-bulk-bar")), /5 selected/);
  click(byTestId(tree, "leads-bulk-contacted"));
  await settle();
  assert.deepEqual(lastWrite(), {
    key: "POST /api/v1/leads/bulk",
    body: { by: "ids", action: "contacted", ids: ["l1", "l2", "l3", "l4", "l5"] },
  });
  assert.equal(textOf(flashes.at(-1).msg), "Marked contacted.");
  await flashes.at(-1).undo();
  assert.deepEqual(
    lastWrite(),
    { key: "POST /api/v1/lead-operations/op-b/undo", body: { version: 7 } },
    "one operation for the lot, undone as one",
  );
  click(byTestId(draw(), "leads-select-matching"));
  tree = draw();
  assert.match(textOf(byTestId(tree, "leads-bulk-bar")), /322 selected/, "every lead the view matches, not every id");
  click(byTestId(tree, "leads-bulk-not-a-fit"));
  tree = draw();
  assert.equal(
    byTestId(tree, "peek-why").props.role,
    "menu",
    "the same five whys the peek asks, asked once for the whole selection",
  );
  click(byTestId(tree, "peek-why-chain"));
  await settle();
  assert.deepEqual(
    lastWrite(),
    {
      key: "POST /api/v1/leads/bulk",
      body: { by: "view", action: "not_a_fit", view: { list: "all", sort: "fit", dir: "asc" } },
    },
    "the view's filters go to the server, never 1,240 ids",
  );
  assert.equal(byTestId(draw(), "peek-why"), null, "the list closes on the pick");
  click(byTestId(draw(), "leads-bulk-copy"));
  assert.equal(
    textOf(flashes.at(-1).msg),
    "Copied 3 emails; 2 had none you can use",
    "what was copied, and what could not be",
  );
});

test("REGRESSION: Esc after Select all N that match lets go of the view too -- the next lead selected was counted, and acted on, as the whole view", async () => {
  await fresh();
  byTestId(draw(), "select-all").props.onChange();
  click(byTestId(draw(), "leads-select-matching"));
  assert.match(textOf(byTestId(draw(), "leads-bulk-bar")), /322 selected/);
  assert.equal(press("Escape"), true);
  assert.equal(byTestId(draw(), "leads-bulk-bar"), null, "Esc cleared the selection");
  press("j");
  draw();
  assert.equal(press("x"), true, "x selects the lead under the cursor");
  const bar = byTestId(draw(), "leads-bulk-bar");
  assert.match(textOf(bar), /^1 selected/, "REGRESSION: 322 selected -- the view Esc should have let go of");
});

test("REGRESSION: the bulk bar draws Check N again for a lead to check again, with its cost -- it read V, which nothing in its scope defines, and the page threw", async () => {
  await fresh();
  byTestId(rowOf(draw(), "l3"), "row-select").props.onChange();
  const tree = draw();
  const again = byTestId(tree, "leads-bulk-check-again");
  assert.ok(again, "Check again, for the lead whose mail server would not answer");
  assert.match(textOf(again), /Check 1 again · about 1¢/, "with what it costs");
  click(again);
  await settle();
  assert.deepEqual(
    lastWrite(),
    { key: "POST /api/v1/leads/check-again", body: { ids: ["l3"] } },
    "and the press asks the door that checks it again",
  );
});

// Find an email had no door (Reach out Part 4, PR 9): its buttons waited on a courier nothing installed, but the bench's
// pile still named it beside Keep and Exclude and priced it in its column. Nothing on the page says it now.
test("a pile of leads with no address, or one that bounces, is offered Keep and Exclude, and nothing on the bench, the bar or a phone offers to find an email", async () => {
  const noAddress = (id, state, reason) =>
    leadRow({
      id,
      place_id: `ChIJfixture0${id}`,
      email: state === "none" ? null : `hi@${id}.example`,
      email_state: state,
      member: member({ class: "review", fit: "look", reason: "An address to look at", reasons: [reason] }),
    });
  const rows = [noAddress("b1", "invalid", "email:invalid"), noAddress("n1", "none", "email:none")];
  await fresh({ leads: { rows } });
  try {
    const route = `leads:s-${SEARCH_A}:c-review`;
    let tree = draw({ leadsRoute: route });
    const bench = byTestId(tree, "lead-bench");
    assert.deepEqual(
      all(byTestId(bench, "lead-bench-queue"), (n) => n.props?.role === "tab").map((q) => textOf(q)),
      ["1Their email bouncesKeep · Exclude", "1No email on their siteKeep · Exclude"],
      "each pile's acts in words, and finding an email is not one",
    );
    assert.doesNotMatch(
      textOf(bench),
      /[Ff]ind (an|\d+) emails?|reads their pages again/,
      "nor a press, nor its price",
    );
    for (const id of ["b1", "n1"]) byTestId(rowOf(draw({ leadsRoute: route }), id), "row-select")?.props.onChange();
    tree = draw({ leadsRoute: route });
    assert.equal(byTestId(tree, "leads-bulk-find-email"), null, "the bar offers no such act");
    globalThis.__phone = true;
    tree = draw({ leadsRoute: route });
    assert.doesNotMatch(textOf(tree), /[Ff]ind (an|\d+) emails?/, "nor does a phone's pile");
  } finally {
    globalThis.__phone = false;
  }
});

test("REGRESSION: on a phone Leads' selection is one row -- ✕, the count, Mark contacted, ⋯ -- and Not a fit asks its five whys in the sheet; the why list was the peek's, drawn full screen", async () => {
  await fresh();
  globalThis.__phone = true;
  try {
    byTestId(draw(), "select-all").props.onChange();
    let tree = draw();
    const bar = byTestId(tree, "leads-bulk-bar");
    assert.ok(String(bar.props.className).split(/\s+/).includes("pp-bulk"), "the phone's row");
    assert.deepEqual(
      bar.props.children.filter(Boolean).map((k) => k.props?.["data-testid"] || k.props?.className),
      ["leads-bulk-clear", "cl-bulk-count", "leads-bulk-contacted", "leads-bulk-more"],
      "four things, in one row",
    );
    assert.equal(byTestId(bar, "leads-bulk-copy"), null, "the rest are the sheet's");
    click(byTestId(tree, "leads-bulk-more"));
    tree = draw();
    const sheet = byTestId(tree, "leads-bulk-sheet");
    assert.equal(sheet.props["aria-label"], "5 selected");
    const rows = all(
      sheet,
      (n) =>
        (n.type === "button" || n.type === "a") &&
        String(n.props?.className || "")
          .split(/\s+/)
          .includes("pp-sheet-row"),
    ).map((n) => n.props["data-testid"]);
    // Write to them (Reach out Part 7, lists.tsx) stands beside Copy emails: the page imports it, so the sheet draws it.
    assert.deepEqual(rows, [
      "leads-select-matching",
      "leads-bulk-copy",
      "leads-bulk-write",
      "leads-bulk-not-a-fit",
      "leads-bulk-export",
    ]);
    click(byTestId(sheet, "leads-bulk-not-a-fit"));
    tree = draw();
    assert.equal(byTestId(tree, "peek-why"), null, "REGRESSION: the peek's own list, which a phone draws full screen");
    const whys = byTestId(tree, "leads-bulk-why");
    assert.ok(whys, "the five whys, as the sheet's step");
    assert.ok(byTestId(whys, "leads-bulk-why-back"), "with a way back to the list");
    click(byTestId(whys, "leads-bulk-why-chain"));
    await settle();
    // bulkNotAFit sends LeadsBulkSchema's body, which carries no reason: the ids shown and selected.
    assert.deepEqual(lastWrite(), {
      key: "POST /api/v1/leads/bulk",
      body: { by: "ids", action: "not_a_fit", ids: ["l1", "l2", "l3", "l4", "l5"] },
    });
    assert.equal(byTestId(draw(), "leads-bulk-why"), null, "the sheet shuts on the pick");
    // Esc shuts the sheet and keeps the selection; the next Esc clears it.
    click(byTestId(draw(), "leads-bulk-more"));
    assert.ok(byTestId(draw(), "leads-bulk-sheet"));
    assert.equal(press("Escape"), true);
    tree = draw();
    assert.equal(byTestId(tree, "leads-bulk-sheet"), null);
    assert.ok(byTestId(tree, "leads-bulk-bar"), "the selection stays");
  } finally {
    globalThis.__phone = false;
  }
});

/* ------------------------------------ the words ------------------------------------ */

test("no word the Leads scope says names the vendor, and no number on it is a dollar amount", async () => {
  await fresh();
  const said = [];
  for (const route of ["leads", `leads:s-${SEARCH_A}`, `leads:s-${SEARCH_A}:c-excluded`, "leads:l-ready"]) {
    cells = [];
    walk(draw({ leadsRoute: route }), (n) => {
      for (const kid of n.props?.children ?? []) if (typeof kid === "string") said.push(kid);
      for (const key of ["title", "aria-label", "placeholder", "aria-description", "data-tip"])
        if (typeof n.props?.[key] === "string") said.push(n.props[key]);
    });
    for (const m of menus) for (const i of m.items || []) said.push(i.header || "", i.label || "", i.meta || "");
  }
  const bad = said.filter((s) => /apify|compass|bounceverify|\$\d/i.test(s));
  assert.deepEqual(bad, [], "the owner sees Claude finding businesses, and one unit: leads");
});

/* ---------------------------- the classes, and their acts ---------------------------- */

test("a Needs review row offers Keep and Exclude, an Excluded row offers Put back, and each toasts with Undo through its operation", async () => {
  await fresh();
  let tree = draw();
  // The page opens and reads its view behind the rows it holds; the owner presses once that has landed.
  await quiesce();
  const review = rowOf(tree, "l3");
  assert.ok(byTestId(review, "lead-keep") && byTestId(review, "lead-exclude"), "Keep counts it; Exclude is free");
  assert.equal(byTestId(review, "lead-put-back"), null);
  const excluded = rowOf(tree, "l4");
  assert.ok(byTestId(excluded, "lead-put-back"), "Put back is the owner's override");
  assert.equal(byTestId(excluded, "lead-keep"), null);
  click(byTestId(review, "lead-keep"));
  await settle();
  assert.deepEqual(
    lastWrite(),
    { key: "POST /api/v1/leads/l3/keep", body: { search_id: SEARCH_A } },
    "the lead names the search whose class it is in",
  );
  assert.equal(textOf(flashes.at(-1).msg), "Kept. It counts as a lead this month.");
  assert.equal(
    byTestId(rowOf(draw(), "l3"), "lead-keep"),
    null,
    "and the row shows it at once: it is kept, no longer a lead to decide",
  );
  await flashes.at(-1).undo();
  assert.deepEqual(
    lastWrite(),
    { key: "POST /api/v1/lead-operations/op-k/undo", body: { version: 4 } },
    "Undo names the operation and the version it saw, never rows",
  );
  click(byTestId(rowOf(draw(), "l4"), "lead-put-back"));
  await settle();
  assert.deepEqual(lastWrite(), { key: "POST /api/v1/leads/l4/put-back", body: { search_id: SEARCH_A } });
  assert.equal(textOf(flashes.at(-1).msg), "Put back. It counts as a lead now.");
  // Exclude is the other thing a lead to decide takes (one already kept is no longer one): a page of its own.
  await fresh();
  click(byTestId(rowOf(draw(), "l3"), "lead-exclude"));
  await settle();
  assert.deepEqual(lastWrite(), { key: "POST /api/v1/leads/l3/exclude", body: { search_id: SEARCH_A } });
  assert.equal(textOf(flashes.at(-1).msg), "Excluded. Nothing counted.");
});

test("a refused Keep is the route's sentence, and nothing says it was kept", async () => {
  await fresh({
    refuse: {
      status: 409,
      code: "conflict",
      message: "This place is hidden: it is already a customer, or was erased.",
    },
  });
  click(byTestId(rowOf(draw(), "l3"), "lead-keep"));
  await settle();
  assert.equal(writes.length, 1, "the door was asked");
  assert.equal(flashes.at(-1).tone, "danger");
  assert.match(textOf(flashes.at(-1).msg), /already a customer/);
  assert.ok(
    byTestId(rowOf(draw(), "l3"), "lead-keep"),
    "and the row is as it was: the surface took back what it had shown, so nothing says it was kept",
  );
});

test("an operator sees Find leads, Keep, Exclude and Put back refusing in the gate's sentence, and F does nothing for them", async () => {
  await fresh({ role: "operator" });
  const tree = draw();
  const gated = (n) => [n.props["aria-disabled"], n.props["aria-description"]];
  assert.deepEqual(gated(byTestId(tree, "leads-find")), [true, "Only an owner can find leads."]);
  assert.deepEqual(gated(byTestId(rowOf(tree, "l3"), "lead-keep")), [true, "Only an owner can keep this lead."]);
  assert.deepEqual(gated(byTestId(rowOf(tree, "l3"), "lead-exclude")), [true, "Only an owner can exclude this lead."]);
  assert.deepEqual(gated(byTestId(rowOf(tree, "l4"), "lead-put-back")), [
    true,
    "Only an owner can put this lead back.",
  ]);
  assert.equal(press("f"), false, "and the key is not theirs either");
  assert.equal(panels.length, 0);
  assert.equal(asks.length, 0, "Ask is not opened for them");
});

test("the Excluded view's chips count by criterion, and each narrows the rows", async () => {
  await fresh();
  let tree = draw({ leadsRoute: `leads:s-${SEARCH_A}:c-excluded` });
  const chips = all(byTestId(tree, "lead-excluded-chips"), (n) =>
    n.props?.["data-testid"]?.startsWith("lead-chip-"),
  ).map((n) => textOf(n).trim());
  assert.deepEqual(chips, ["Chain 1", "Wrong kind 1"]);
  click(byTestId(tree, "lead-chip-Chain"));
  tree = draw({ leadsRoute: `leads:s-${SEARCH_A}:c-excluded` });
  assert.deepEqual(names(tree), ["GigaFit Austin"]);
  assert.deepEqual(
    all(byTestId(tree, "lead-classes"), (n) => n.props?.role === "tab").map((n) => [
      textOf(n).trim(),
      n.props["aria-selected"],
    ]),
    [
      ["2 qualified", false],
      ["1 needs a look", false],
      ["1 left out", true],
    ],
    "the three classes, each a view of the search",
  );
});

/* --------------------------------- a search, kept --------------------------------- */

test("a kept search's menu says what was asked and when, and offers Rename, Find new ones, Search again, Export and Remove", async () => {
  await fresh();
  draw();
  const m = menuOf("Personal trainers · Austin");
  assert.ok(m, "every search on the rail has its menu");
  assert.deepEqual(
    m.items.map((i) => i.header || i.label || "—"),
    [
      "You asked on Sep 18: “personal trainers in Austin with a website, about 200”. Leaving out Chain gyms.",
      "Rename",
      "Find new ones",
      "Search again, changed",
      "Export these 161",
      "—",
      "Remove this search",
    ],
  );
  assert.equal(m.items.find((i) => i.label === "Find new ones").meta, "Only places not already in your leads count");
  assert.equal(
    m.items.find((i) => i.label === "Remove this search").meta,
    "Keeps the ones you contacted or are talking to.",
  );
  m.items.find((i) => i.label === "Find new ones").onClick();
  await settle();
  assert.deepEqual(
    lastWrite(),
    { key: `POST /api/v1/lead-searches/${SEARCH_A}/more`, body: { purpose: "renew", plan: search().plan } },
    "the same plan, a new round",
  );
  assert.match(textOf(flashes.at(-1).msg), /Only places not already in your leads count/);
});

test("Search again, changed opens the plan with what was asked; Rename renames through its route; Remove is asked first, keeps the worked leads, and says so", async () => {
  await fresh();
  draw();
  menuOf("Personal trainers · Austin")
    .items.find((i) => i.label === "Search again, changed")
    .onClick();
  draw();
  assert.deepEqual(
    [panels.at(-1).stage, panels.at(-1).words, panels.at(-1).proposal.purpose],
    ["plan", "personal trainers in Austin with a website, about 200", "renew"],
  );
  assert.equal(
    panels.at(-1).plan,
    panels.at(-1).proposal.plan,
    "the card draws this search's plan, not an earlier one's",
  );
  // Rename happens where the search is: the rail's row becomes the box.
  await fresh();
  draw();
  menuOf("Personal trainers · Austin")
    .items.find((i) => i.label === "Rename")
    .onClick();
  let tree = draw();
  byTestId(tree, "leads-rename-name").props.onKeyDown({ key: "Enter", target: { value: "Trainers, Austin" } });
  await settle();
  assert.deepEqual(lastWrite(), {
    key: `PATCH /api/v1/lead-searches/${SEARCH_A}`,
    body: { name: "Trainers, Austin" },
  });
  assert.equal(textOf(flashes.at(-1).msg), "Renamed to Trainers, Austin");
  // Remove asks once, where the search is.
  await fresh();
  draw();
  menuOf("Personal trainers · Austin")
    .items.find((i) => i.label === "Remove this search")
    .onClick();
  draw();
  const asked = confirms.at(-1);
  assert.equal(asked.question, "Remove “Personal trainers · Austin”?");
  assert.equal(asked.detail, "Keeps the ones you contacted or are talking to.");
  await asked.onYes();
  assert.deepEqual(lastWrite(), { key: `DELETE /api/v1/lead-searches/${SEARCH_A}` });
  assert.equal(textOf(flashes.at(-1).msg), "Removed. The 18 you contacted or are talking to are kept.");
  assert.deepEqual(went.at(-1), "clients/leads", "the rail lost that row, so the view is every lead again");
});

test("Export these N is a link to the search's own view of the export route", async () => {
  await fresh();
  const m = menuOf("Personal trainers · Austin") || (draw(), menuOf("Personal trainers · Austin"));
  const exportIt = m.items.find((i) => i.label === "Export these 161");
  assert.ok(exportIt, "the menu offers the search's leads as a file");
  exportIt.onClick();
  assert.deepEqual(
    navigated,
    [[`/api/v1/leads/export?search=${SEARCH_A}&list=all&sort=fit&dir=asc&workspace=salon`, "_self"]],
    "the browser is sent to the export route, for this search, all of it, in the order the table has by default",
  );
});

/* ------------------------------------- the phone ------------------------------------- */

test("REGRESSION: on a phone a lead's row is People's row -- one cell of the face, the name and its state; where it is, what it waits on or what left it out; its reach, its rating and when it was found. Leads' cards were their own: a 40px tile, three columns and a 44px Call", async () => {
  await fresh();
  globalThis.__phone = true;
  try {
    let tree = draw();
    const clsOf = (k) => String((k && (k.rendered || k).props?.className) || "");
    const cardOf = (id) => find(rowOf(tree, id), (n) => /\blist-row pl-card\b/.test(String(n.props?.className || "")));
    const tr = rowOf(tree, "l1");
    assert.ok(String(tr.props.className).split(/\s+/).includes("pl-card-row"), "the row People's rows wear");
    assert.deepEqual(
      all(tr, (n) => n.type === "td").map((td) => String(td.props.className)),
      ["cl-sel", "pl-card-cell"],
      "one cell beside the face's box, as a person's row",
    );
    const card = cardOf("l1");
    // The row is the kit's list row, the one People's is: its face, name, what trails the name, what was said, the facts.
    for (const part of ["list-row-face", "list-row-name", "list-row-end", "list-row-said", "list-row-facts"])
      assert.ok(
        find(card, (n) =>
          String(n.props?.className || "")
            .split(/\s+/)
            .includes(part),
        ),
        `a person's row, part for part: ${part}`,
      );
    const faceOf = (id) => find(cardOf(id), (n) => /\bface\b/.test(String(n.props?.className || "")));
    assert.equal(textOf(faceOf("l1")), ROWS[0].tile.initials, "the face: its initials, under the mark");
    // D6: the mark is the face on a phone too, on its own plate over the photo -- never the photo's circle crop.
    const faceImgs = (id) => all(faceOf(id), (n) => n.type === "img").map((n) => [n.props.className, n.props.src]);
    assert.deepEqual(faceImgs("l1"), [["face-photo face-mark", MARK_KEPT]], "the mark, contained on its plate");
    assert.deepEqual(faceImgs("l2"), [], "and a lead with neither keeps its initials");
    assert.equal(textOf(find(card, (n) => n.props?.className === "list-row-name")), "Zilker Strength Lab");
    assert.equal(textOf(byTestId(card, "lead-state")), "Ready", "its state, as a person's row says theirs");
    assert.equal(textOf(byTestId(card, "lead-sub")), L().rows[0].sub, "where it is");
    const facts = find(card, (n) => n.props?.className === "list-row-facts");
    assert.equal(
      all(facts, (n) => /\bld-slot-shape\b/.test(String(n.props?.className || ""))).length,
      2,
      "whether the phone and the mailbox reach them, as shapes",
    );
    assert.match(textOf(byTestId(facts, "lead-rated")), /5\.0 · 16/, "how it is rated");
    assert.equal(textOf(byTestId(facts, "lead-found")), L().rows[0].foundLine, "and when it was found, in words");
    assert.equal(
      byTestId(tr, "lead-call"),
      null,
      "REGRESSION: a 44px Call on every card; it is the lead's own page's first button now",
    );
    assert.equal(
      find(tr, (n) => /\bcl-actions-cell\b/.test(String(n.props?.className || ""))),
      null,
      "and no column of the desktop's",
    );
    // A lead that waits says on what, in the warn tone; a left-out one says what left it out, and was never checked.
    assert.equal(textOf(byTestId(cardOf("l3"), "lead-sub")), L().rows[2].waitsOn);
    assert.equal(clsOf(byTestId(cardOf("l3"), "lead-state")), "pill pill-warn");
    assert.equal(textOf(byTestId(cardOf("l4"), "lead-sub")), "Chain");
    assert.equal(textOf(byTestId(cardOf("l4"), "lead-state")), L().rows[3].stateTag);
    assert.equal(byTestId(cardOf("l4"), "lead-reach"), null, "nothing about a left-out place was checked");
    // The face is the checkbox, and while anyone is selected a tap on a row selects it rather than opening it.
    byTestId(rowOf(tree, "l1"), "row-select").props.onChange();
    tree = draw();
    const before = peeks.length;
    rowOf(tree, "l2").props.onClick();
    tree = draw();
    assert.equal(peeks.length, before, "a tap while selecting does not open the lead");
    assert.match(textOf(byTestId(tree, "leads-bulk-bar")), /2 selected/, "it selects it");
  } finally {
    globalThis.__phone = false;
  }
});

const bar = (over = {}) => {
  cells = [];
  frames.begin();
  return LeadsPhoneBar({
    scope: "leads",
    onScope() {},
    listLabel: "All leads",
    listCount: 322,
    onLists() {},
    listsOpen: false,
    q: "",
    onQ() {},
    searchRef: { current: null },
    searchOpen: false,
    onSearchOpen() {},
    ...over,
  });
};

test("on a phone the list and search are one bar under the frame's strip; Find leads is its last control, the three's mark, a door to Ask; search is a button that opens the bar into the field", async () => {
  await fresh();
  const opened = [];
  const t = bar({ onFind: () => opened.push("find"), canFind: true });
  assert.equal(
    all(t, (n) => n.props?.role === "tab").length,
    0,
    "the switch is the frame's strip over the bar, not in it",
  );
  assert.equal(byTestId(t, "leads-phone-search-open").props["aria-label"], "Search leads");
  assert.equal(byTestId(t, "leads-phone-search"), null, "REGRESSION: the box was 64px wide on a phone and said 'Sear'");
  // The mark is a door to Ask, drawn for the widths where the shell has no ✦ (721-900px; leads.css hides it under
  // 720px, where the ✦ is the door, spec F1). It calls the page's one door with no words, never with its event.
  const door = byTestId(t, "leads-bar-find");
  assert.ok(
    find(door, (n) => n.type === Icon && n.props?.name === "three"),
    "the three's still mark",
  );
  door.props.onClick({ type: "click" });
  assert.deepEqual(opened, ["find"], "Find leads opens Ask");
  assert.equal(byTestId(t, "leads-phone-find"), null, "the old coral square is gone");
  // The gate reads the role, as every gate does (data-bits gate): an operator meets it at the door.
  await fresh({ role: "operator" });
  const gatedDoor = byTestId(bar({ canFind: false }), "leads-bar-find");
  assert.deepEqual(
    [gatedDoor.props["aria-disabled"], gatedDoor.props["aria-description"]],
    [true, "Only an owner can find businesses for you."],
    "an operator is told at the door, as at the desktop's button",
  );
  // The name gives way before the count: "All leads · 96" was one string, and a 375px phone drew it "All leads · …".
  const pick = byTestId(t, "leads-phone-lists");
  assert.equal(textOf(find(pick, (n) => n.props?.className === "pp-bar-pick-words")), "All leads");
  assert.equal(
    textOf(byTestId(pick, "leads-phone-lists-count")),
    "322",
    "REGRESSION: the count was the part an ellipsis took",
  );
  assert.equal(
    textOf(byTestId(bar({ listCount: 1240 }), "leads-phone-lists-count")),
    "1,240",
    "a count reads as a number",
  );
  assert.equal(
    all(t, (n) => n.props?.["data-testid"] === "leads-phone-bar").length,
    1,
    "one bar, not a row of controls",
  );
  const open = bar({ searchOpen: true });
  const field = byTestId(open, "leads-phone-search");
  assert.equal(field.props["aria-label"], "Search leads");
  assert.equal(field.props.autoFocus, true, "pressed, the field takes focus, so the keyboard comes up");
  assert.ok(
    byTestId(open, "leads-phone-lists"),
    "and the list stays over it, as the Inbox's buckets stay over its search",
  );
  assert.equal(byTestId(open, "leads-phone-search-open"), null, "the capsule at rest is the field now");
  const kept = byTestId(bar({ q: "pilates" }), "leads-phone-search");
  assert.equal(kept.props.value, "pilates", "a view's own words keep the field open");
  assert.notEqual(kept.props.autoFocus, true, "without taking focus: a view coming back must not pull up the keyboard");
});

test("where deals are on, a phone's bar still holds no switch (the frame's strip adds the Pipeline), and Leads keeps its list and its count", async () => {
  await fresh();
  const t = bar({ dealsOn: true });
  assert.equal(all(t, (n) => n.props?.role === "tab").length, 0);
  assert.equal(textOf(byTestId(byTestId(t, "leads-phone-lists"), "leads-phone-lists-count")), "322");
  assert.ok(byTestId(t, "leads-bar-find"), "and the door to Ask is still the bar's last control");
});

test("the plan panel's sheet is the page's own dialog and registers no listener of its own", async () => {
  await fresh();
  cells = [];
  frames.begin();
  const before = frames.called();
  const t = LeadPlanSheet({
    onClose() {},
    children: globalThis.React.createElement("div", { "data-testid": "the-plan" }, "The plan"),
  });
  assert.equal(
    frames.called(),
    before,
    "hookless: the page's listener owns Esc, and a second one would take the key twice",
  );
  const sheet = byTestId(t, "lead-plan-sheet");
  assert.equal(sheet.props.role, "dialog");
  assert.ok(sheet.props.className.includes("pl-plan"), "PL_OVERLAY names .pl-plan as the page's own");
  assert.ok(byTestId(t, "the-plan"), "the panel the page put in it is drawn under its handle");
});

test("at a phone's width the page draws the bar instead of the rail and the controls, and nothing else above the rows", async () => {
  await fresh();
  globalThis.__phone = true;
  const t = draw({ leadsRoute: `leads:s-${SEARCH_A}` });
  assert.ok(byTestId(t, "leads-phone-bar"), "one bar");
  const scroller = find(t, (n) =>
    String(n.props?.className || "")
      .split(" ")
      .includes("cl-main-scroll"),
  );
  assert.ok(scroller, "the page's scroller");
  assert.equal(
    byTestId(scroller, "leads-phone-bar"),
    null,
    "the bar stands over what scrolls, as the Inbox's strip does",
  );
  const pick = byTestId(t, "leads-phone-lists");
  assert.equal(
    textOf(find(pick, (n) => n.props?.className === "pp-bar-pick-words")),
    "Personal trainers · Austin",
    "the search that is open, by its name",
  );
  assert.equal(textOf(byTestId(pick, "leads-phone-lists-count")), "161", "and its count apart, which never gives way");
  assert.equal(all(t, (n) => n.props?.className === "cl-controls").length, 0, "no controls row above the rows");
  assert.equal(all(t, (n) => n.props?.className === "cl-rail").length, 0, "no rail");
  assert.equal(
    all(t, (n) => n.props?.["data-testid"] === "leads-standing").length,
    0,
    "and no standing line: a phone shows the work first",
  );
  const above = all(
    t,
    (n) =>
      n.props?.["data-testid"] === "leads-phone-bar" ||
      n.type === LeadStrip ||
      /\bpl-table-wrap\b/.test(String(n.props?.className || "")),
  );
  assert.deepEqual(
    above.map((n) => n.props["data-testid"] || (n.type === LeadStrip ? "lead-strip" : "table")),
    ["leads-phone-bar", "lead-strip", "table"],
    "the bar, the strip, the work",
  );
  globalThis.__phone = false;
});

test("REGRESSION: past a page of leads, the line under them stands in the scope's gutter on a desktop and on a phone -- its own padding put its words at the pane's edge", async () => {
  for (const phone of [false, true]) {
    await fresh({ leads: { more: PAGE_TWO } });
    globalThis.__phone = phone;
    const tree = draw();
    const more = byTestId(tree, "leads-more");
    assert.ok(more, `more leads than a page: the line is drawn (${phone ? "phone" : "desktop"})`);
    assert.equal(textOf(more), `${ROWS.length} of 322 loaded Show more`, "the count, then the one button");
    assert.equal(more.props.children.at(-1), byTestId(more, "leads-more-btn"), "the button ends the line");
    // The gutter is the scope's (.ld-more reads --gutter-page: 28px, and 16px at 900px and under), and nothing on
    // the line says otherwise.
    assert.ok(String(more.props.className).split(/\s+/).includes("ld-more"), "the line takes the scope's gutter");
    assert.equal(
      more.props.style,
      undefined,
      "REGRESSION: an inline padding of 8px 0 16px set the sides to 0, 28px left of the table on a desktop and 16px on a phone",
    );
  }
  globalThis.__phone = false;
});

/* ------------------------------- the strip's controls ------------------------------- */

const running = (over = {}) => ({
  ...search(),
  round: {
    ...search().round,
    state: "running",
    ending: null,
    ended_at: null,
    undo_op_id: null,
    undo_version: null,
    counted: 12,
    question: null,
    ...over,
  },
});

test("the strip above the table is a component that exists, with a view model behind it and one seam back to the page", async () => {
  await fresh();
  draw({ leadsRoute: `leads:s-${SEARCH_A}` });
  const s = strips.at(-1);
  assert.ok(
    s,
    "opening a search draws its strip (LeadStrip, imported by the scope): a name nothing declares would throw here",
  );
  assert.equal(s.vm.title, "Found 161 personal trainers", "the ended round's own sentence, from contracts");
  assert.deepEqual(s.vm.parts, ["88 you can email", "72 by phone", "1 left out"]);
  assert.equal(typeof s.onAction, "function", "one onAction, and it is the page's");
});

// The phone's sheet is compact (People's RailEmpty): a list with no lead in it is said in a line, not drawn; all leads
// and the one picked always are, and every search is drawn -- each is a thing kept, with its own menu.
test("Leads' rows, compact in a phone's sheet: an empty list is said in a line, all leads, the picked one and every search stay", async () => {
  await fresh();
  const rail = {
    lists: [
      { id: "all", label: "All leads", count: 12 },
      { id: "ready", label: "Ready", count: 12 },
      { id: "nurture", label: "Contacted", count: 0 },
      { id: "converted", label: "Talking", count: 0 },
      { id: "not_a_fit", label: "Not a fit", count: 0 },
    ],
    searches: [{ id: SEARCH_B, name: "Chiropractors · Round Rock", count: 0, mark: "question", undoable: false }],
  };
  const props = {
    rail,
    list: "not_a_fit",
    searchId: null,
    canFind: true,
    wordsFor: () => ({ askedLine: "", keepsLine: "" }),
    onPickList: () => {},
    onPickSearch: () => {},
    hrefFor: () => null,
    onNew: () => {},
  };
  const lists = (tree) =>
    [...new Set(all(tree, (n) => String(n.props?.["data-testid"] || "").startsWith("leads-list-")))].map(
      (n) => n.props["data-testid"],
    );
  frames.begin();
  const compact = LeadsRailRows({ ...props, compact: true });
  assert.deepEqual(lists(compact), ["leads-list-all", "leads-list-ready", "leads-list-not_a_fit"]);
  assert.equal(textOf(byTestId(compact, "leads-lists-empty")), "Empty now: Contacted · Talking");
  assert.ok(byTestId(compact, `leads-search-${SEARCH_B}`), "a search with nothing counted yet is still drawn");
  frames.begin();
  const desk = LeadsRailRows(props);
  assert.equal(lists(desk).length, 5, "a desktop's rail draws every list");
  assert.equal(byTestId(desk, "leads-lists-empty"), null);
});

test("the running strip's Stop reaches the stop route, and the question's Yes and Stop here reach the answer route carrying no plan", async () => {
  await fresh({ leads: { searches: [running(), waiting] } });
  draw({ leadsRoute: `leads:s-${SEARCH_A}` });
  const strip = strips.at(-1);
  assert.deepEqual(
    strip.vm.actions.map((a) => a.id),
    ["stop"],
    "a running round offers one thing to press",
  );
  await strip.onAction("stop");
  await settle();
  assert.deepEqual(
    lastWrite(),
    { key: `POST /api/v1/lead-searches/${SEARCH_A}/stop` },
    "POST lead-searches/[id]/stop, and nothing else rides with it",
  );
  assert.match(
    textOf(flashes.at(-1).msg),
    /still being checked/,
    "and the page says what is still happening, not that it is done",
  );
  await fresh();
  draw({ leadsRoute: `leads:s-${SEARCH_B}` });
  const q = strips.at(-1);
  assert.deepEqual(
    q.vm.actions.map((a) => a.id),
    ["keep", "include", "change", "stop_here"],
  );
  await q.onAction("keep");
  await settle();
  assert.deepEqual(
    lastWrite(),
    { key: `POST /api/v1/lead-searches/${SEARCH_B}/answer`, body: { answer: "keep" } },
    "Keep carries no plan (PRD 7.2)",
  );
  await fresh();
  draw({ leadsRoute: `leads:s-${SEARCH_B}` });
  await strips.at(-1).onAction("stop_here");
  await settle();
  assert.deepEqual(lastWrite(), { key: `POST /api/v1/lead-searches/${SEARCH_B}/answer`, body: { answer: "stop" } });
});

// The commit answers with the search it started (commit.ts, undo.search_id). The page used to leave the owner on All
// leads with a live dot in the rail and no strip: the receipt said "Leads shows it", and Leads did not.
test("approving a new plan lands on the search it started, where the strip is; a top-up stays where it is", async () => {
  await fresh();
  const NEW = "3d1d5c1e-0000-4000-8000-00000000c0de";
  globalThis.window.__ask.commit = async () => ({ ok: true, receipt: "Finding 50 gyms.", undo: { search_id: NEW } });
  // A new search from the page: a kept search's Search again, changed opens the plan Claude wrote, and approving
  // it goes through Ask's commit door as a fresh Find from the Line does (leadFinderApprove).
  openPlanFrom();
  const f = panels.at(-1);
  assert.deepEqual([f.open, f.stage], [true, "plan"], "the card is up");
  await f.onApprove({ ...PLAN, count: 50 });
  await settle();
  assert.equal(went.at(-1), `clients/leads:s-${NEW}`, "straight to the new search, its strip and its classes");
  went.length = 0;
  draw({ leadsRoute: `leads:s-${SEARCH_B}` });
  strips.at(-1).onAction("include", "chain");
  draw({ leadsRoute: `leads:s-${SEARCH_B}` });
  await panels.at(-1).onApprove(panels.at(-1).plan);
  await settle();
  assert.ok(
    !went.some((w) => w.includes("clients/leads:s-")),
    "an answer on an open search does not move the owner off it",
  );
});

test("Include opens the plan with that exclusion taken back and starts nothing; approving it answers with the version the owner saw", async () => {
  await fresh();
  draw({ leadsRoute: `leads:s-${SEARCH_B}` });
  strips.at(-1).onAction("include", "chain");
  draw({ leadsRoute: `leads:s-${SEARCH_B}` });
  assert.deepEqual(writes, [], "a press starts nothing that costs: the owner approves the plan first");
  const f = panels.at(-1);
  assert.equal(f.stage, "plan");
  assert.deepEqual(f.plan.exclusions, [], "the thing it asked about is taken out of the plan");
  assert.equal(f.plan.version, 2, "which is a new version, and that is the one the route is given");
  assert.equal(f.words, "", "the answer row under it starts empty: the owner's answer, not what they first asked");
  await f.onApprove(f.plan);
  await settle();
  assert.deepEqual(lastWrite(), {
    key: `POST /api/v1/lead-searches/${SEARCH_B}/answer`,
    body: { answer: "include", plan: f.plan },
  });
});

// "What if the answer is no, but I want it to update the search?" Change what I asked opens the plan panel's answer
// row under the question, empty; the turn names the search's id, so Ask's card comes back carrying `amends` at the
// version and count the server set, and approving it commits that card through Ask's door, which answers the
// waiting round (commit.ts, spec G4/G5). A card without `amends` would start a second search while the first waited
// a day and died, so the panel refuses it.
test("Change what I asked opens the answer row under the question, and approving commits the amending card, not a new search", async () => {
  await fresh();
  draw({ leadsRoute: `leads:s-${SEARCH_B}` });
  strips.at(-1).onAction("change");
  draw({ leadsRoute: `leads:s-${SEARCH_B}` });
  const f = panels.at(-1);
  assert.deepEqual(
    [
      f.stage,
      f.words,
      f.answering && f.answering.question,
      f.answering && f.answering.searchId,
      f.answering && f.answering.name,
      f.answering && "baseVersion" in f.answering,
    ],
    ["compose", "", waiting.round.question.sentence, SEARCH_B, waiting.name, false],
    "empty, under the question, naming the search; the version and count are the route's",
  );
  assert.deepEqual(writes, [], "nothing is asked or spent by opening it");
  const amends = { search_id: SEARCH_B, name: waiting.name, question: waiting.round.question.sentence };
  const card = {
    id: "p-amend",
    kind: "lead_search",
    needs: "owner",
    title: "Find 200 personal trainers",
    summary: "",
    payload: {
      plan: { ...PLAN, exclusions: [], version: 2, count: 200 },
      view: { title: "Find 200 personal trainers" },
      facts: null,
      amends,
    },
    undo: "Stop the search",
  };
  const sent = [];
  globalThis.window.__ask.send = async (req, on) => {
    sent.push(req);
    on({ t: "final", message: { text: "", proposals: [card] } });
  };
  const committed = [];
  globalThis.window.__ask.commit = async (p) => {
    committed.push(p);
    return { ok: true, receipt: `Answered. ${waiting.name} carries on with your answer; Leads shows it.`, undo: null };
  };
  await f.onAnswer("include the chains too");
  await settle();
  draw({ leadsRoute: `leads:s-${SEARCH_B}` });
  assert.deepEqual(
    [sent[0].text, sent[0].threadId, sent[0].answering],
    ["include the chains too", PLANNED_THREAD, { searchId: SEARCH_B }],
    "the owner's words, in the thread the search was planned in, naming the search for the route to read",
  );
  assert.equal(sent[0].surface, "leads", "the amend turn is on the Leads surface (spec F5)");
  const shown = panels.at(-1);
  assert.deepEqual([shown.stage, shown.plan.version, shown.plan.count], ["plan", 2, 200], "the card's own plan");
  await shown.onApprove(shown.plan);
  await settle();
  assert.equal(committed.length, 1, "the card commits through Ask's door");
  assert.deepEqual(
    [committed[0].id, committed[0].payload.amends, committed[0].payload.plan],
    ["p-amend", amends, shown.plan],
    "as the card it is, with the plan the owner approved",
  );
  assert.deepEqual(writes, [], "the page posts no answer of its own: the answer went through Ask's door");
  assert.equal(textOf(flashes.at(-1).msg), "Carrying on with your change.");
  assert.ok(
    !went.some((w) => w.includes("clients/leads:s-")),
    "an answer is on the search already open, so the owner stays",
  );
});

test("a fresh Find after an abandoned answer is Ask's, and a plan opened after it is not an answer", async () => {
  await fresh();
  draw({ leadsRoute: `leads:s-${SEARCH_B}` });
  strips.at(-1).onAction("change");
  draw({ leadsRoute: `leads:s-${SEARCH_B}` });
  assert.ok(panels.at(-1).answering, "answering");
  // Left half-done: Esc closes the panel and lets the answer go, then F is Ask's (spec F7): it opens no panel, so
  // nothing of the answer can ride on it.
  press("Escape");
  let drawn = panels.length;
  draw({ leadsRoute: `leads:s-${SEARCH_B}` });
  assert.equal(panels.length, drawn, "closed: the panel is not drawn any more");
  press("f");
  drawn = panels.length;
  draw({ leadsRoute: `leads:s-${SEARCH_B}` });
  assert.equal(asks.at(-1), "open", "F opens Ask, not a panel");
  assert.equal(panels.length, drawn);
  menuOf("Chiropractors · Round Rock")
    .items.find((i) => i.label === "Search again, changed")
    .onClick();
  draw({ leadsRoute: `leads:s-${SEARCH_B}` });
  assert.equal(panels.at(-1).stage, "plan");
  assert.equal(panels.at(-1).answering, null, "Search again opens a plan that is not answering anything");
  // Change what I asked on that plan is Ask's too, with what the search asked for in the field: the panel
  // composes nothing (spec F5), so the words go where a fresh Find is written.
  panels.at(-1).onBack();
  drawn = panels.length;
  draw({ leadsRoute: `leads:s-${SEARCH_B}` });
  assert.equal(panels.length, drawn, "the panel closed");
  assert.deepEqual(asks.at(-1), { mode: "compose", prompt: waiting.asked }, "and Ask opened with the words");
});

// The question is only ever about places left out, and while it waits nothing is counted (under an email standard
// nothing counts until the checks): the search's own view was an empty table saying "Describe the businesses you
// want", with the evidence a tab away.
test("a waiting search opens on the places its question is about, and its counted view says it is waiting", async () => {
  await fresh();
  const tree = draw();
  click(byTestId(tree, `leads-search-${SEARCH_B}`));
  assert.equal(went.at(-1), `clients/leads:s-${SEARCH_B}:c-excluded`, "the waiting search opens on its left-out pile");
  click(byTestId(draw(), `leads-search-${SEARCH_A}`));
  assert.equal(went.at(-1), `clients/leads:s-${SEARCH_A}`, "a search that is not waiting opens as it did");
  await fresh({ leads: { rows: [] } });
  const counted = draw({ leadsRoute: `leads:s-${SEARCH_B}` });
  assert.match(textOf(counted), /Nothing is counted yet\./);
  assert.match(textOf(counted), /It is waiting for your answer above\./);
  assert.doesNotMatch(textOf(counted), /Describe the businesses you want/);
});

test("an ending's one next step opens the plan and starts nothing until it is approved; Sort by fit and the new ones go to the surface", async () => {
  const justNow = new Date(Date.now() - 60_000).toISOString();
  const done = {
    ...search(),
    round: {
      ...search().round,
      state: "ended",
      ending: "stopped",
      counted: 61,
      ended_at: justNow,
      undo_op_id: null,
      undo_version: null,
    },
  };
  await fresh({ leads: { searches: [done, waiting] } });
  draw({ leadsRoute: `leads:s-${SEARCH_A}` });
  const s = strips.at(-1);
  assert.deepEqual(
    s.vm.actions.map((a) => a.id),
    ["carry_on", "review", "excluded"],
    "one next step, and the piles the ending's numbers open",
  );
  s.onAction("carry_on", s.vm.actions[0].arg);
  draw({ leadsRoute: `leads:s-${SEARCH_A}` });
  assert.deepEqual(writes, [], "Carry on opens the plan; nothing runs until it is approved");
  assert.equal(panels.at(-1).stage, "plan");
  await panels.at(-1).onApprove(panels.at(-1).plan);
  await settle();
  assert.deepEqual(
    lastWrite(),
    { key: `POST /api/v1/lead-searches/${SEARCH_A}/more`, body: { purpose: "topup", plan: search().plan } },
    "and then it is POST lead-searches/[id]/more",
  );
  // A refresh found twelve the view is not showing: offered, never sorted in. The open search holds them.
  await offering({ searchId: SEARCH_A }, 12, { searches: [done, waiting] });
  draw({ leadsRoute: `leads:s-${SEARCH_A}` });
  await quiesce();
  const off = strips.at(-1);
  assert.equal(off.vm.actions[0].label, "12 new", "what a refresh found is offered, never sorted in");
  reads.length = 0;
  await off.onAction("take_offered");
  await settle();
  assert.deepEqual(
    pageReads().map((q) => [q.search, q.list, q.sort, q.dir]),
    [[SEARCH_A, "all", "fit", "asc"]],
    "the new ones are taken in the order they were read, on the owner's press",
  );
  assert.deepEqual([L().offered, L().rows.length], [0, ROW_DTOS.length + 12], "and they are the rows now");
  // Sort by fit is a new read of the same view, never a re-order of the rows on the page: from another order, it asks.
  sortByHeading(draw({ leadsRoute: `leads:s-${SEARCH_A}` }), "Rated");
  draw({ leadsRoute: `leads:s-${SEARCH_A}` });
  await quiesce();
  assert.equal(pageReads().at(-1).sort, "rating", "the sort the owner chose was read");
  reads.length = 0;
  off.onAction("sort_fit");
  draw({ leadsRoute: `leads:s-${SEARCH_A}` });
  await quiesce();
  // The surface's, never a re-order on the page: the fit order it read a moment ago, held, with nothing changed since.
  assert.deepEqual(pageReads(), [], "the fit view read since the last change paints as it was read");
  assert.deepEqual([L().view.sort, L().view.dir], ["fit", "asc"], "Sort by fit is the surface's view of fit");
});

test("the search menu removes the untouched leads and credits the month, named for what it does, and its toast puts them back", async () => {
  const justNow = new Date(Date.now() - 60_000).toISOString();
  const done = { ...search(), round: { ...search().round, ended_at: justNow, undo_op_id: null, undo_version: null } };
  await fresh({ leads: { searches: [done, waiting] } });
  draw({ leadsRoute: `leads:s-${SEARCH_A}` });
  // Not on the strip: an "Undo" beside "the 61 found are yours" read as deleting what was just paid for.
  assert.ok(
    !strips.at(-1).vm.actions.some((a) => a.id === "undo"),
    "the strip carries the ending and its next step, never a control that removes leads",
  );
  const menu = menus.find((m) => m.title === `More for ${done.name}`);
  const item = menu.items.find((i) => i.label === "Remove the ones you haven't touched");
  assert.ok(item, "the menu names what it removes");
  assert.match(item.meta, /given back this month/);
  const waitingMenu = menus.find((m) => m.title === `More for ${waiting.name}`);
  assert.ok(
    !waitingMenu.items.some((i) => i.label === "Remove the ones you haven't touched"),
    "a round still running has nothing to remove yet",
  );
  item.onClick();
  await settle();
  assert.deepEqual(lastWrite(), { key: `POST /api/v1/lead-searches/${SEARCH_A}/undo` });
  assert.equal(textOf(flashes.at(-1).msg), "Removed 160 · 160 given back");
  await flashes.at(-1).undo();
  assert.deepEqual(
    lastWrite(),
    { key: "POST /api/v1/lead-operations/op-u/undo", body: { version: 2 } },
    "the toast's own Undo names the operation and the version it saw",
  );
});

// D5: every fact on this page is about a place, so the leads can be looked at as places. The picture is made from
// what the search already found -- no tile, and no request to anybody.
test("D5: the same leads, on the ground — a pin per lead the source placed, the pile beside it, and a wider search one press away", async () => {
  await fresh();
  const at = () => draw({ leadsRoute: `leads:s-${SEARCH_A}` });
  let tree = at();
  assert.equal(byTestId(tree, "lead-map"), null, "a page opens on the rows");
  click(byTestId(tree, "leads-map-toggle"));
  tree = at();
  const map = byTestId(tree, "lead-map");
  assert.ok(map, "the map stands where the table stood");
  assert.equal(
    find(tree, (n) => n.type === "table"),
    null,
  );
  const pins = all(map, (n) => /^lead-pin-/.test(String(n.props?.["data-testid"] || "")));
  assert.deepEqual(
    pins.map((p) => p.props["data-testid"]),
    ["lead-pin-l1", "lead-pin-l2", "lead-pin-l3", "lead-pin-l4", "lead-pin-l5"],
    "one pin per lead the source placed",
  );
  assert.equal(textOf(byTestId(map, "lead-map-count")), "5 on the map");
  assert.match(
    textOf(byTestId(map, "lead-map-scale")),
    /mi across$/,
    "how wide the square is, in the owner's own unit",
  );
  assert.equal(byTestId(map, "lead-map-ring"), null, "this search named a city and no centre yet, so no area is drawn");
  // One search is open and its plan never measured a centre, so there is no ring: the line says that, instead of
  // "these searches", which was the wording for a mixed list and read as though several were on screen.
  assert.equal(
    textOf(byTestId(map, "lead-map-note")),
    "Where this search's leads are. It never measured a centre, so there is no area to draw.",
  );
  assert.equal(byTestId(map, "lead-map-toowide"), null, "one city's leads are one place, so the square is drawn");
  assert.equal(
    all(map, (n) => n.props?.["data-testid"] === "lead-map-row").length,
    5,
    "the same leads beside it, nearest the middle first",
  );
  assert.match(pins[0].props["aria-label"], /^Zilker Strength Lab — /, "a pin says who it is and what it is");
  assert.match(
    String(pins[0].props.className),
    /tone-plain/,
    "a pin wears its row's state: a lead ready to call is the quiet default, as its row is",
  );
  assert.doesNotMatch(String(pins[0].props.className), /is-out/, "a qualified lead stands at full strength");
  assert.match(String(pins[4].props.className), /is-out/, "a lead that was left out steps back, as its row does");

  pins[0].props.onMouseEnter();
  tree = at();
  assert.match(
    textOf(byTestId(tree, "lead-map-card")),
    /Zilker Strength Lab/,
    "the pin under the pointer names itself",
  );
  // One meaning, said under the map (25 Sep): a pin wears its row's state, and the legend names each state a pin on
  // the map wears, in the row's own words. There is no switch of colourings any more: it had no key, and two of its
  // three repeated the rows.
  assert.equal(all(tree, (n) => /^map-by-/.test(String(n.props?.["data-testid"] || ""))).length, 0, "no colour switch");
  const keys = all(byTestId(tree, "lead-map-legend"), (n) =>
    /^lead-map-key-/.test(String(n.props?.["data-testid"] || "")),
  );
  assert.ok(keys.length > 0, "a legend under the map");
  for (const k of keys) {
    const state = k.props["data-testid"].slice("lead-map-key-".length);
    const dot = find(k, (n) => String(n.props?.className || "").includes("ld-pin-dot"));
    assert.match(
      String(dot.props.className),
      new RegExp(`tone-${leadPinTone({ state })}`),
      `${state}: the pin's own tone`,
    );
  }
  assert.match(
    textOf(byTestId(tree, "lead-map-key-out")),
    /Closed or left out/,
    "the row's own words for a lead that left",
  );
  // Left out steps back, as its row does.
  assert.match(String(byTestId(tree, "lead-pin-l5").props.className), /is-out/);

  click(byTestId(tree, "lead-pin-l1"));
  tree = at();
  assert.equal(peeks.at(-1).vm.id, "l1", "a pin opens its lead, as a row does");

  click(byTestId(tree, "map-widen"));
  tree = at();
  assert.deepEqual(
    [panels.at(-1).stage, panels.at(-1).plan.area.radius_m],
    ["plan", 50000],
    "Search wider opens the plan with twice the ground, and starts nothing until it is approved",
  );
  click(byTestId(tree, "leads-map-toggle"));
  tree = at();
  assert.equal(byTestId(tree, "lead-map"), null, "and the rows come back");
});

// The row's two tags and its Stage column are the app's one StatePill, on the registry's tones. They were a
// hand-styled family of their own (.ld-state-tag, .ld-fit-tag, .ld-dot), and a Contacted tag drew grey while its
// dot, its pin and tone.ts all said info. No test ever drew a fit tag: the fixture search publishes no fits, so
// leadBand never called them mixed. Here a real row in every state is drawn through the whole page.
test("a lead's state and fit are the one StatePill, in the registry's tones -- and Contacted is info, as its dot and its pin are", async () => {
  const dtos = [
    leadRow({ id: "p1", place_id: "ChIJpill1", business_name: "Ready Gym" }),
    leadRow({
      id: "p2",
      place_id: "ChIJpill2",
      business_name: "Contacted Gym",
      stage: "nurture",
      contacted_at: minsAgo(120),
    }),
    leadRow({ id: "p3", place_id: "ChIJpill3", business_name: "Talking Gym", stage: "converted" }),
    leadRow({
      id: "p4",
      place_id: "ChIJpill4",
      business_name: "Review Gym",
      member: member({ class: "review", fit: "look", reason: "Couldn't check the email" }),
    }),
    leadRow({
      id: "p5",
      place_id: "ChIJpill5",
      business_name: "Said No Gym",
      stage: "archived",
      closed_reason: "said_no",
    }),
    leadRow({
      id: "p6",
      place_id: "ChIJpill6",
      business_name: "Chain Gym",
      member: member({ class: "excluded", fit: null, reason: "A chain with 40 locations", excluded_by: "chain" }),
    }),
    leadRow({
      id: "p7",
      place_id: "ChIJpill7",
      business_name: "Maybe Gym",
      member: member({ fit: "look", reason: "Might be a franchise" }),
    }),
  ];
  // A search whose fits differ, which is the only time a row wears its fit at all (leadBand's `mixed`).
  const open = { ...search(), round: { ...search().round, fits: { strong: 5, look: 2, long: 0 } } };
  await fresh({ leads: { searches: [open], rows: dtos } });
  // The rows the surface published for them: the page's own view of each (contracts' toLeadRowVM, the search beside it).
  const rows = L().rows;
  const tree = draw({ leadsRoute: `leads:s-${SEARCH_A}` });
  const cls = (n) => String(n?.props?.className || "");
  const tagOf = (id, testid) => byTestId(rowOf(tree, id), testid);

  assert.equal(tagOf("p1", "lead-state-tag"), null, "Ready is the silent default and wears no tag");
  for (const [id, tone] of [
    ["p2", "info"],
    ["p3", "ok"],
    ["p4", "warn"],
  ]) {
    const tag = tagOf(id, "lead-state-tag");
    assert.equal(cls(tag), `pill pill-${tone}`, `${id}: the shared pill, in the registry's tone`);
    assert.equal(textOf(tag), rows.find((r) => r.id === id).stateTag, `${id}: saying the row's own words`);
  }
  assert.match(textOf(tagOf("p2", "lead-state-tag")), /^Contacted · /, "and Contacted still says how long ago");
  for (const id of ["p5", "p6"])
    assert.equal(cls(tagOf(id, "lead-state-tag")), "pill", `${id}: out is plain, so its pill carries no tone`);

  assert.equal(cls(tagOf("p1", "lead-fit-tag")), "pill pill-ok", "a strong fit is a good outcome, not an urgent one");
  assert.equal(cls(tagOf("p7", "lead-fit-tag")), "pill", "a look is plain");
  assert.equal(textOf(tagOf("p7", "lead-fit-tag")), rows.find((r) => r.id === "p7").fitLabel);

  // Said once: while the Stage column shows a lead's state, the name's tag does not say it again.
  const rowNode = find(
    tree,
    (n) => n.type && (n.type.name === "PeopleRow" || (n.type.type && n.type.type.name === "PeopleRow")),
  );
  const business = LEAD_COLUMNS.find((c) => c.key === "business");
  const tagIn = (td) => find(td, (n) => n.props?.testid === "lead-state-tag");
  const out = rows.find((r) => r.id === "p5");
  assert.ok(
    tagIn(business.cell(out, { ...rowNode.props.ctx, stageShown: false })),
    "without the column, the name wears it",
  );
  assert.equal(
    tagIn(business.cell(out, { ...rowNode.props.ctx, stageShown: true })),
    null,
    "with the column, only the column says it",
  );
  // It gives way only where the column says the same thing. Needs review is not a stage, a left-out lead's Stage cell is
  // empty, and Contacted says how long ago: those keep their tag with the column on.
  for (const id of ["p2", "p4", "p6"]) {
    const l = rows.find((r) => r.id === id);
    assert.ok(
      tagIn(business.cell(l, { ...rowNode.props.ctx, stageShown: true })),
      `${id} keeps its tag: the column does not say it`,
    );
  }
  assert.equal(
    tagIn(
      business.cell(
        rows.find((r) => r.id === "p3"),
        { ...rowNode.props.ctx, stageShown: true },
      ),
    ),
    null,
    "Talking is said by the column once",
  );

  // On a phone the row is People's (the phone pass), and its pill is the row's state -- Ready too, as a person's row
  // always says theirs -- in the same registry tones.
  await fresh({ leads: { searches: [open], rows: dtos } });
  globalThis.__phone = true;
  const ph = draw({ leadsRoute: `leads:s-${SEARCH_A}` });
  globalThis.__phone = false;
  const pillOf = (id) => byTestId(rowOf(ph, id), "lead-state");
  assert.deepEqual(
    ["p1", "p2", "p3", "p4", "p5", "p6"].map((id) => cls((pillOf(id) || {}).rendered || pillOf(id))),
    ["pill", "pill pill-info", "pill pill-ok", "pill pill-warn", "pill", "pill"],
    "ready, contacted, talking, needs review, said no, left out",
  );
  assert.deepEqual(
    ["p1", "p4", "p5", "p6"].map((id) => textOf(pillOf(id))),
    ["Ready", rows[3].stateTag, "Said no", rows[5].stateTag],
    "in the row's own words",
  );

  // And nothing of the private family is left to disagree with it.
  assert.equal(
    find(tree, (n) =>
      cls(n)
        .split(" ")
        .some((c) => c === "ld-state-tag" || c === "ld-fit-tag" || c === "ld-dot"),
    ),
    null,
  );
});

// What opens over the table must be seen whole. Three ways it was not, found on the live page (21 Sep):
//   the name card opened inside the pinned cell, and a pinned cell is sticky, so it is its own stacking context --
//   the next row's pinned cell painted straight over the card (clients.css raises the hovered one);
//   a card on the last row in view hung below the pane's bottom edge and lost 173px of itself;
//   and a search's menu in the rail opened rightward, past the rail's edge, and showed 51px of 194.
// CSS is verified against the real stylesheet over production; what is pinned here is the page's own part of it.
test("a pop hangs above its row when the room is there, every hover asks where it is, and a search's menu opens into the rail", async () => {
  await fresh();
  const tree = draw();
  const place = ldPlacePop;
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
    const pane = {
      getBoundingClientRect: () => ({ top: 100, bottom: 700 }),
      classList: { contains: (c) => c === "pl-table-scroll" },
      querySelector: (s) => (s === "thead" ? { offsetHeight: 39 } : null),
    };
    return {
      getBoundingClientRect: () => ({ top, bottom }),
      closest: (s) => (s === ".pl-table-scroll" ? pane : null),
      querySelector: (s) => (card && s === ":scope > .ld-card" ? {} : null),
      classList: { toggle: (c, on) => (on ? classes.add(c) : classes.delete(c)), has: (c) => classes.has(c) },
    };
  };
  const up = (spec) => {
    const target = el(spec);
    place({ currentTarget: target });
    return target.classList.has("ld-up");
  };
  assert.equal(up({ top: 150, bottom: 212, card: true }), false, "a card near the top has its room below");
  assert.equal(
    up({ top: 600, bottom: 662, card: true }),
    true,
    "a card on the last row in view hangs above it instead of being cut off",
  );
  assert.equal(up({ top: 520, bottom: 582, card: true }), true, "118px below is not room for a card");
  assert.equal(up({ top: 520, bottom: 582, card: false }), false, "but it is room for a tip");
  assert.equal(
    up({ top: 140, bottom: 202, card: true }),
    false,
    "a row right under the header keeps its card below, where the room is",
  );
  // A pop outside any pane, or an element that cannot be measured, is left where it hangs.
  const loose = {
    getBoundingClientRect: () => ({ top: 0, bottom: 10 }),
    closest: () => null,
    querySelector: () => null,
    classList: {
      toggle: () => {
        throw new Error("no pane, no change");
      },
    },
  };
  place({ currentTarget: loose });
  place({ currentTarget: {} });
  place(null);

  // A search's menu escapes the rail it lives in: held inside the rail it was 196px and broke its words onto three to six
  // lines. It is the kit's Menu (Base UI's), drawn on the body and placed against the window, which the rail's edge cannot
  // cut off or squeeze; it opens rightward, over the table.
  const menu = menus.find((m) => /^More for .+$/.test(m.title || ""));
  assert.ok(menu, "a kept search has its menu");
  assert.ok(menu.trigger, "the kit's Menu, opened by its control, drawn on the body");
  assert.equal(menu.align, "start", "hung from its trigger's start, so it opens over the table");
});

/* ------------------------------ a lead that became a client ------------------------------ */

test("a converted lead whose person became a client reads Client, on the desktop's row and on a phone's card; a proposal out or no deal keeps Converted", async () => {
  // Nothing stored on the lead (0004): the row reads People's row for the person it converted into, and only a deal
  // won says Client, in the deal pill's own tone. A proposal still out, or no deal at all, is the lead's own word.
  const dtos = [
    leadRow({ id: "c1", place_id: "ChIJclient1", business_name: "Client Gym", stage: "converted", contact_id: "k1" }),
    leadRow({ id: "c2", place_id: "ChIJclient2", business_name: "Proposal Gym", stage: "converted", contact_id: "k2" }),
    leadRow({ id: "c3", place_id: "ChIJclient3", business_name: "Nobody Gym", stage: "converted", contact_id: null }),
  ];
  const people = [
    { id: "k1", deal: { stage: "won", brief: "Client · Ad management" } },
    { id: "k2", deal: { stage: "proposed", brief: "Proposal out · 3 d" } },
  ];
  const cls = (n) => String(n?.props?.className || "");
  await fresh({ leads: { searches: [search()], rows: dtos } });
  // The rows the surface published for them: the page's own view of each (contracts' toLeadRowVM, the search beside it).
  const rows = L().rows;
  surfaceValue("people").rows = people;
  let tree = draw({ leadsRoute: `leads:s-${SEARCH_A}` });
  const tagOf = (id) => byTestId(rowOf(tree, id), "lead-state-tag");
  assert.equal(textOf(tagOf("c1")), "Client", "the stage word of the deal, never a word for a person");
  assert.equal(cls(tagOf("c1")), "pill pill-ok", "the deal pill's own tone");
  assert.equal(textOf(tagOf("c2")), rows[1].stateTag, "a proposal still out is not a client: the lead's own word");
  assert.equal(textOf(tagOf("c3")), rows[2].stateTag, "no person, no deal: the lead's own word");
  // The rows reach the cell through its context, not the global. The page's rows are memoised (React.memo, which
  // this stub React lacks, so every row is drawn each time here) and the context is what they compare: on a cold
  // load of Leads the rows paint before the people land, and a cell that read window.__PEOPLE kept saying Converted
  // until a sort or a search drew it again. So: the page hands People's rows to the context, and the cell reads them
  // from there -- with the global emptied, a context carrying the rows still says Client, and one without them does not.
  const rowNode = find(
    tree,
    (n) => n.type && (n.type.name === "PeopleRow" || (n.type.type && n.type.type.name === "PeopleRow")),
  );
  assert.ok(rowNode, "the table draws its rows as PeopleRow");
  assert.equal(rowNode.props.ctx.peopleRows, people, "REGRESSION: the cell context carried nothing from People");
  const business = LEAD_COLUMNS.find((c) => c.key === "business");
  const pillOf = (td, testid) => find(td, (n) => n.props?.testid === testid);
  surfaceValue("people").rows = [];
  const withRows = pillOf(business.cell(rows[0], { ...rowNode.props.ctx, peopleRows: people }), "lead-state-tag");
  assert.deepEqual([withRows.props.kind, withRows.props.value], ["deal", "won"], "the context's rows say Client");
  const withCard = pillOf(
    LEAD_PHONE_COLUMNS[0].cell(rows[0], { ...rowNode.props.ctx, peopleRows: people }),
    "lead-state",
  );
  assert.deepEqual([withCard.props.kind, withCard.props.value], ["deal", "won"], "and so does the phone's card");
  surfaceValue("people").rows = people;
  const without = pillOf(business.cell(rows[0], { ...rowNode.props.ctx, peopleRows: [] }), "lead-state-tag");
  assert.equal(
    without.props.kind,
    "lead_row_state",
    "REGRESSION: the cell read the global, so a context without the rows said Client",
  );

  await fresh({ leads: { searches: [search()], rows: dtos } });
  surfaceValue("people").rows = people;
  globalThis.__phone = true;
  try {
    tree = draw({ leadsRoute: `leads:s-${SEARCH_A}` });
    const cardOf = (id) => find(rowOf(tree, id), (n) => n.props?.className === "pl-card");
    assert.equal(textOf(byTestId(cardOf("c1"), "lead-state")), "Client");
    assert.equal(cls(byTestId(cardOf("c1"), "lead-state")), "pill pill-ok");
    assert.equal(textOf(byTestId(cardOf("c2"), "lead-state")), rows[1].stateTag);
  } finally {
    globalThis.__phone = false;
  }
});

test("a lead a link names stays open where this tab kept a cursor in that view: the address's lead takes the cursor", async () => {
  const { navs, at, openPeek } = await addressed();
  // The tab's place for Leads (usePlPlace): the cursor was left on the first lead, in the view the link opens over.
  tabMemoryFor(globalThis.window).keepPlace("leads", leadsRoute({ searchId: null, list: "all", cls: null }), {
    q: "",
    cursor: UA,
    top: 0,
  });
  for (let i = 0; i < 4; i += 1) at(`leads:p-${UB}`);
  assert.equal(openPeek().vm.id, UB, "the link's lead, not the kept cursor's");
  assert.deepEqual(navs, [], "and the address is left as the link said it");
});

/* ------------------------------ a phone's search view, quieter (Ruben, 25 Sep) ------------------------------ */
// Needs review on a phone was the desktop's workbench squeezed in: a card restating the group's reason, its two
// buttons, then each row again with the reason a third time and a Keep and an Exclude of its own -- one group cost
// 430px before its second row. Now it is rows in groups, each group's acts on its line, and a row slides over Keep
// and Exclude; and the map, whose toggle stood in a controls row a phone never draws, opens from the bar's pin.

test("at a phone's width Needs review is rows in groups: the group's acts on its line, the reason on the row, a slide for its own act, and no bench", async () => {
  await fresh();
  globalThis.__phone = true;
  try {
    const tree = draw({ leadsRoute: `leads:s-${SEARCH_A}:c-review` });
    assert.equal(byTestId(tree, "lead-bench"), null, "no bench on a phone");
    assert.equal(all(tree, (n) => n.props?.["data-testid"] === "bench-card-keep").length, 0, "and no buttons on rows");
    const heads = all(tree, (n) => n.props?.["data-testid"] === "table-section");
    assert.ok(heads.length >= 1, "the groups, as the table's sections");
    const keepAll = byTestId(heads[0], "review-sec-keep");
    assert.ok(keepAll, "the group's Keep on its line");
    assert.equal(textOf(keepAll), "Keep all");
    const rows = all(tree, (n) => /\bpl-card-row\b/.test(String(n.props?.className || "")));
    assert.ok(rows.length >= 1, "the same cards as every other list");
    const first = rows[0];
    const id = String(first.props.id).replace(/^lead-/, "");
    assert.equal(id, "l3", "the review pile's one row");
    assert.equal(
      textOf(heads[0]),
      "Their mail server wouldn't answer1·Check againKeep allExclude all",
      "the group's words, its count, its acts (Check again has its door: the surface's own)",
    );
    assert.equal(
      textOf(byTestId(first, "lead-sub")),
      L().rows[2].sub,
      "the reason is said once, on the group's line; the row says where it is",
    );
    const card = find(first, (n) => n.props?.className === "pl-card");
    assert.equal(typeof card.props.onTouchStart, "function", "a thumb has the row");
    // The row takes its own touch, so a slide on it never walks the strip of views over the page as well: a slide right
    // kept the lead and moved to People in one stroke (5 Oct 2026; surface-tabs.jsx ST_OWN_TOUCH).
    assert.equal(
      find(first, (n) => n.props?.className === "pl-card-cell").props["data-own-drag"],
      "",
      "the sliding row is marked as taking its own touch",
    );
    assert.deepEqual(
      all(first, (n) => /pl-card-ground/.test(String(n.props?.className || ""))).map(textOf),
      ["Keep", "Exclude"],
      "over the act's word on either side",
    );
    click(keepAll);
    await settle();
    assert.deepEqual(
      lastWrite(),
      { key: "POST /api/v1/leads/bulk", body: { by: "ids", action: "keep", ids: ["l3"], search_id: SEARCH_A } },
      "the line's Keep is the bulk door the bench and the bar press",
    );
    // A slide right past a third keeps the row: the kit leaves it and then presses the row's own door.
    const el = {
      style: {},
      offsetWidth: 343,
      offsetHeight: 84,
      scrollHeight: 84,
      clientHeight: 84,
      scrollWidth: 343,
      clientWidth: 343,
      scrollTop: 0,
      parentElement: null,
      isConnected: true,
      getClientRects: () => [1],
      matches: () => false,
    };
    card.props.onTouchStart({ touches: [{ clientX: 100, clientY: 300 }], currentTarget: el, target: el });
    card.props.onTouchMove({ touches: [{ clientX: 180, clientY: 302 }], currentTarget: el });
    card.props.onTouchEnd({ changedTouches: [{ clientX: 260, clientY: 304 }], currentTarget: el });
    assert.equal(el.style.transform, "translate3d(100%, 0, 0)", "180px of 343: gone right");
    // The kit leaves (180ms), presses the door, then settles the still-drawn row (60ms on) and clears its inline
    // styles once settled (240ms more): watched for, never read at a fixed moment, since a Linux timer lands these to
    // the millisecond and a Windows one ~15ms late.
    const until = async (f) => {
      for (const t0 = Date.now(); !f();) {
        if (Date.now() - t0 > 2000) return false;
        await new Promise((r) => setTimeout(r, 20));
      }
      return true;
    };
    assert.ok(
      await until(() => lastWrite()?.key === `POST /api/v1/leads/${id}/keep`),
      "slid right past a third: the row's own Keep",
    );
    assert.deepEqual(lastWrite(), { key: `POST /api/v1/leads/${id}/keep`, body: { search_id: SEARCH_A } });
    assert.ok(
      await until(() => el.style.transform === "" || el.style.transform === "translate3d(0, 0, 0)"),
      "and the row, still in the pile until the surface says, settles back",
    );
    await settle();
  } finally {
    globalThis.__phone = false;
  }
});

test("at a phone's width the bar's switch says list or map, and the leads under the map are the list's own rows", async () => {
  // 25 Sep: the pin read as a hammer and said neither which view this was nor what it opened; under the map stood a
  // boxed list of its own (numbered rows, square tiles) that looked like no other list.
  await fresh();
  globalThis.__phone = true;
  try {
    let tree = draw({ leadsRoute: `leads:s-${SEARCH_A}` });
    const bar = byTestId(tree, "leads-phone-bar");
    assert.equal(byTestId(bar, "leads-list-toggle").props["aria-pressed"], true, "the list is the view shown");
    assert.equal(byTestId(bar, "leads-map-toggle").props["aria-pressed"], false);
    click(byTestId(bar, "leads-map-toggle"));
    tree = draw({ leadsRoute: `leads:s-${SEARCH_A}` });
    const map = byTestId(tree, "lead-map");
    assert.ok(map);
    assert.equal(all(map, (n) => n.props?.["data-testid"] === "lead-map-row").length, 0, "no list of the map's own");
    assert.equal(all(map, (n) => n.props?.className === "ld-map-side").length, 0);
    assert.ok(
      all(tree, (n) => n.type === "tr" && String(n.props?.className || "").includes("pl-card-row")).length > 0,
      "the list's rows under it",
    );
    assert.ok(byTestId(map, "lead-map-count"), "how many are on it, in a line under the map");
    assert.equal(byTestId(byTestId(tree, "leads-phone-bar"), "leads-map-toggle").props["aria-pressed"], true);
    click(byTestId(byTestId(tree, "leads-phone-bar"), "leads-list-toggle"));
    tree = draw({ leadsRoute: `leads:s-${SEARCH_A}` });
    assert.equal(byTestId(tree, "lead-map"), null, "and the list again");
  } finally {
    globalThis.__phone = false;
  }
});

test("at a phone's width a list picked in the Lists sheet opens and the sheet closes; picked again it stays open", async () => {
  // 25 Sep: the sheet stood open over the page it had opened, and a second press on the same row went back to all
  // leads, so an owner could not tell what their press had done.
  await fresh();
  globalThis.__phone = true;
  try {
    let tree = draw({ leadsRoute: "leads" });
    click(byTestId(tree, "leads-phone-lists"));
    tree = draw({ leadsRoute: "leads" });
    assert.ok(byTestId(tree, "people-lists-sheet"), "the sheet is open");
    click(byTestId(byTestId(tree, "people-lists-sheet"), "leads-list-ready"));
    assert.equal(went.at(-1), leadsRoute({ list: "ready" }), "the list opens");
    tree = draw({ leadsRoute: "leads:l-ready" });
    assert.equal(byTestId(tree, "people-lists-sheet"), null, "and the sheet has closed on it");
    click(byTestId(tree, "leads-phone-lists"));
    tree = draw({ leadsRoute: "leads:l-ready" });
    click(byTestId(byTestId(tree, "people-lists-sheet"), "leads-list-ready"));
    assert.equal(went.at(-1), leadsRoute({ list: "ready" }), "pressed again, it stays that list, never all leads");
  } finally {
    globalThis.__phone = false;
  }
});

test("at a phone's width the bar has the map's pin where the rows have places, and it opens the map where the rows were", async () => {
  await fresh();
  globalThis.__phone = true;
  try {
    let tree = draw({ leadsRoute: `leads:s-${SEARCH_A}` });
    const pin = byTestId(byTestId(tree, "leads-phone-bar"), "leads-map-toggle");
    assert.ok(pin, "the pin in the bar");
    assert.equal(pin.props["aria-pressed"], false);
    assert.equal(byTestId(tree, "lead-map"), null, "the rows first");
    click(pin);
    tree = draw({ leadsRoute: `leads:s-${SEARCH_A}` });
    assert.ok(byTestId(tree, "lead-map"), "the map where the rows were");
    assert.equal(byTestId(byTestId(tree, "leads-phone-bar"), "leads-map-toggle").props["aria-pressed"], true);
    assert.equal(all(tree, (n) => n.props?.className === "cl-controls").length, 0, "still no controls row");
  } finally {
    globalThis.__phone = false;
  }
});

// A list of your own (Reach out Part 7, J8): a search with no round and a plan with no area, drawn where the bridge's
// lists are not (the finder's strip is never asked for it), and its menu offering nothing that searches again.
test("a list of your own draws with no round and no area, reaches no finder strip, and its menu never searches again", async () => {
  const LIST = "5e000000-0000-4000-8000-000000000071";
  const list = search({
    id: LIST,
    name: "Expo gyms",
    asked: "gyms I met at the expo",
    via: "import",
    plan: {
      version: 1,
      card: "local_businesses",
      list: "import",
      name: "Expo gyms",
      asked: "gyms I met at the expo",
      terms: [],
      count: 3,
      contact: "email",
      criteria: [],
      exclusions: [],
    },
    round: null,
  });
  await fresh({ leads: { searches: [list, search()] } });
  draw({ leadsRoute: `leads:s-${LIST}` });
  assert.ok(
    strips.length > 0 &&
      strips.every((s) => s.vm.title === "0 of 0 on your list are ready" && s.vm.actions.length === 0),
    "the strip is the list's own (J8), never the finder's: a list has no round to narrate, and nothing on it searches again",
  );
  // No map: a list has no area to draw or to widen, though its leads were placed.
  const tree = draw({ leadsRoute: `leads:s-${LIST}` });
  click(byTestId(tree, "leads-map-toggle"));
  assert.equal(byTestId(draw({ leadsRoute: `leads:s-${LIST}` }), "lead-map"), null);
  const items = menuOf("Expo gyms")
    .items.filter((i) => i.label)
    .map((i) => i.label);
  assert.deepEqual(items, ["Rename", "Export these 0", "Remove this search"]);
  const found = menuOf("Personal trainers · Austin")
    .items.filter((i) => i.label)
    .map((i) => i.label);
  assert.ok(found.includes("Find new ones") && found.includes("Search again, changed"), "a found search keeps both");
});
