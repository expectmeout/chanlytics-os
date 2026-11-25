/**
 * The world the tests of page/ share. Split by behaviour from leads-honest.test.mjs on 25 Nov 2026 (layer 14: a test
 * file over 1,600 lines is two files); its header, as it was:
 *
 * Not named *.test.mjs on purpose: the runner globs that pattern.
 *
 */
/**
 * The Leads scope of People: the same page, its other scope.
 *
 * Drawn the way people/people-page/ draws People -- LeadsReal (surfaces/leads/page/leads-real.tsx, decision 0015 step 9:
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
import { afterEach } from "node:test";
import assert from "node:assert/strict";
import { legacyAddress } from "../../../shell/address/_address.mjs";
import { installRoleStore, kitPages, useStubHooks } from "../../../_stub-react.mjs";
import { until } from "../../../shared/_until.mjs";
import { importSrc } from "../../../_source.mjs";
import { ROLE_PERMS, roleGate, stateOf, toLeadRowVM } from "@chanlytics/contracts";
import { hookFrames } from "../../../_hook-frames.mjs";
import { lineBox } from "../../../shared/_line.mjs";
import { bridgeHolds } from "../../../shell/_bridge-holds.mjs";

export const { askCalls, holdAsk } = await importSrc("apps/dashboard/src/surfaces/frame-verbs.ts");

// People's TSX, the Leads page and the surface it reads, loaded as the app's own modules are (one instance of the surface's value
// store and of its signal, which the page's hooks and this file share): the page, how many rows a table draws first, and the
// Leads surface itself -- its read of a view, its acts, and what it forgets between one test's wire and the next.
export const { surfaceMoved } = await importSrc("apps/dashboard/src/bridge/surface-status.ts");

export const { setSurfaceValue, surfaceValue } = await importSrc("apps/dashboard/src/surfaces/surface-values.ts");

export const { PeopleReal } = await importSrc("apps/dashboard/src/surfaces/people/page/people-real.tsx");

export const { forgetLeadsViews, leadsView } = await importSrc("apps/dashboard/src/surfaces/leads/surface.ts");

export const { leadsOverride } = await importSrc("apps/dashboard/src/surfaces/leads/override.ts");

/** What a page reads the address through (surfaces/frame/constants.ts), for the `CHANLY` this file makes up. */
export const address = await legacyAddress();

/* ------------------------------------------------------------- the fixtures */

export const SEARCH_A = "5e000000-0000-4000-8000-000000000001";

export const SEARCH_B = "5e000000-0000-4000-8000-000000000002";

export const COUNTS = { all: 322, ready: 272, nurture: 31, converted: 9, said_no: 6, not_a_fit: 4 };

/** The owner is in Austin; the clock below is theirs. */
export const TZ = "America/Chicago";

export const NOW = new Date("2026-09-18T19:20:00.000Z");

export const minsAgo = (m) => new Date(NOW.getTime() - m * 60_000).toISOString();

/** The plan release A stores (LeadSearchPlanSchema): the area carries the center, and this one has none. */
export const PLAN = {
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
export const search = (over = {}) => ({
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
export const PLANNED_THREAD = "eeeeeeee-0000-4000-8000-000000000001";

export const waiting = {
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
export const member = (over = {}) => ({
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

export const leadRow = (over = {}) => ({
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
export const MARK_KEPT = `https://project.supabase.co/storage/v1/object/public/lead-marks/${"a".repeat(64)}.png`;

export const ROW_DTOS = [
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

export const ROWS = ROW_DTOS.map((r) => toLeadRowVM(r, TZ, NOW));

/** n businesses the next read finds that the view does not hold. */
export const found = (n) =>
  Array.from({ length: n }, (_, i) =>
    leadRow({ id: `n${i}`, place_id: `ChIJnew${String(i).padStart(4, "0")}`, business_name: `New Gym ${i}` }),
  );

/**
 * A page whose surface is holding back `n` leads a refresh found (`world`'s overrides, and the `view` it reads first, when it
 * is not all leads): a run commits a page and the live feed tells the surface (what refresh-map and Realtime call), so the
 * rows it finds are offered, never sorted in under the owner.
 */
export const offering = async (view, n, leads = {}) => {
  const held = await fresh({ leads });
  if (view) await leadsView(view);
  held.rows = [...held.rows, ...found(n)];
  await leadsOverride.apply();
  return held;
};

/** Page two of a view that has one (the first page then carries a cursor, and Show more reads the rest). */
export const PAGE_TWO = [leadRow({ id: "l6", place_id: "ChIJfixture0006", business_name: "Page Two Fitness" })];

// What the server wrote for this workspace from its own business line (4.4's suggestionsFor).
export const SUGGESTIONS = {
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
export const world = (over = {}) => ({
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

export const listeners = {};

export let overlayOpen = null;

export const storage = () => {
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
export const navigated = [];

bridgeHolds(
  { who: { workspaces: [{ id: "ws-salon", timezone: TZ }], activeWorkspaceId: "ws-salon" } },
  { fresh: true },
);
globalThis.window = {
  document: globalThis.document,
  // On a workspace page, so the typed client names the workspace on every request the way it does in the browser.
  location: { pathname: "/w/salon", hash: "#/clients/leads", origin: "https://app.chanlytics.com", href: "" },
  open: (href, target) => navigated.push([href, target]),
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
    return !ev.defaultPrevented;
  },
  setTimeout: (fn, ms) => setTimeout(fn, ms),
  clearTimeout: (h) => clearTimeout(h),
  matchMedia: (q) => ({ matches: /max-width: 900px/.test(q) ? globalThis.__phone === true : false }),
};

export let cells = [];

export let setters = [];

// Where each hook keeps its state: by the component that calls it, as React keeps it (_hook-frames.mjs).
export const frames = hookFrames();

export const flashes = [];

export const went = [];

export const opened = [];

// Menus and questions, the peek, the plan panel and the strip are the real components, imported by the page as the app
// imports them (below); what the page hands each is what these tests press, so every draw of one is recorded as its props,
// the way a test finds one by its type in the tree (`n.type === MoreMenu`), and `fresh` empties them.
export const menus = [];

export const confirms = [];

export const panels = [];

export const strips = [];

export const peeks = [];

/** A component the page draws -> where its props are kept as it is drawn. Filled once the components are imported. */
export const recorded = new Map();

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

export let redraws = 0;

/** Every subscription a drawn component holds: a tree that is dropped (a test's new cells, a new test) lets go of them, as React does. */
export const heardNow = new Set();

/** Whether the surface moving (its rows landed, or its status changed: surface-status.ts) would draw what is on screen again. */
export const drawsFrom = (key) => {
  const before = redraws;
  surfaceMoved(key);
  return redraws > before;
};

globalThis.ReactDOM = { createPortal: (node) => node };

globalThis.window.React = globalThis.React;

// The tab's one store for what pages keep (the place in a view: the words in the box, the cursor), which People's hooks read
// through the bridge's own module, on this window's sessionStorage.
export const { clearTabMemory, tabMemoryFor } = await import("../../../../apps/dashboard/src/bridge/tab-memory.ts");

(await import("../../../../apps/dashboard/src/surfaces/frame/frame-globals.ts")).installFrameGlobals();

Object.assign(globalThis.window, kitPages);

installRoleStore();

// The Leads page (its JSX compiles to the stub React above), and People › Pipeline, the third view over the same table, in the
// order both lists load it: before the page that draws it.
export const { LeadsReal } = await importSrc("apps/dashboard/src/surfaces/leads/page/leads-real.tsx");

export const { PipelineScope } = await importSrc("apps/dashboard/src/surfaces/people/pipeline/scope.tsx");

// The components the page draws and these tests press, the real ones (the page imports them; a test finds each by its type, and
// the stub React keeps the props each was drawn with, `recorded`): the kit's menu, question and glyph, the peek (Task 12), the
// plan panel (spec F5) and the strip (Task 10). The first day (Task 17) is drawn for real as well, and so is every part of the
// scope: a stand-in of one is what let the Leads scope ship referencing a component nothing declared -- every test green, and
// "LeadsFirstDay is not defined" in the browser for every workspace that had not yet kept a search, which on the first day is
// all of them.
export const { MoreMenu } = await importSrc("apps/dashboard/src/surfaces/kit/more-menu/more-menu.tsx");

export const { Confirm } = await importSrc("apps/dashboard/src/surfaces/kit/confirm/confirm.tsx");

export const { Icon } = await importSrc("apps/dashboard/src/surfaces/kit/icon/icon.tsx");

export const { LeadSheet } = await importSrc("apps/dashboard/src/surfaces/leads/sheet/sheet.tsx");

export const { standingSaid } = await importSrc("apps/dashboard/src/surfaces/kit/head/standing.ts");

/**
 * What a person sees of the page on a desk: its tree, and what it said to the frame's head as its acts (an open search's
 * reach-out door, then Find leads), which the frame draws at the right of the strip over the list.
 */
export const seen = (tree) => ({ type: "Fragment", props: { children: [tree, standingSaid()?.act ?? null] } });

export const { LeadPlanPanel } = await importSrc("apps/dashboard/src/surfaces/leads/finder/plan-panel.tsx");

export const { LeadStrip } = await importSrc("apps/dashboard/src/surfaces/leads/finder/strip-view.tsx");

export const { LeadsPhoneBar, LeadPlanSheet } = await importSrc(
  "apps/dashboard/src/surfaces/leads/scope/phone-bar.tsx",
);

export const { LeadsRailRows } = await importSrc("apps/dashboard/src/surfaces/leads/scope/rail.tsx");

export const { LeadImportSheet } = await importSrc("apps/dashboard/src/surfaces/leads/reach-out/lists.tsx");

export const { RecordSheet } = await importSrc("apps/dashboard/src/surfaces/kit/record/sheet.tsx");

export const { LEAD_COLUMNS, LEAD_CARD } = await importSrc("apps/dashboard/src/surfaces/leads/cells/columns.tsx");

export const { LeadHover, ldPlacePop } = await importSrc("apps/dashboard/src/surfaces/leads/cells/hover.tsx");

recorded.set(MoreMenu, menus);

// Leads' menus are the kit's Menu (Base UI's) since 5 Oct 2026, read here as every menu in this file is read: its name as
// `title`, its control's test id, and its groups as one list, a heading where a group has one and a line between two.
export const { Menu, MenuTrigger, SharedMenu } = await importSrc("apps/dashboard/src/surfaces/kit/menu/menu.tsx");

export const { Sheet } = await importSrc("apps/dashboard/src/surfaces/kit/sheet/sheet.tsx");

export const asMenuRecord = (p) => ({
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
  // A group of switches (the Columns menu's), as the page hands it.
  toggles: p.groups.find((g) => g.toggles)?.toggles,
});

recorded.set(Menu, { push: (p) => menus.push(asMenuRecord(p)) });

// A menu its controls share (a row's Call, since 5 Oct 2026): each row draws its control with its lead, and the scope draws
// the menu once, after the rows. Read as the menu each control opens, so a row's Call is found as any menu is.
export const sharedTriggers = [];

recorded.set(MenuTrigger, sharedTriggers);

recorded.set(SharedMenu, {
  push: (p) => {
    for (const t of sharedTriggers.splice(0))
      menus.push(asMenuRecord({ ...p, label: p.label?.(t.payload), trigger: t.trigger, groups: p.groups(t.payload) }));
  },
});

/** A switch of the Columns menu (people/table/columns-menu.tsx) as last drawn, flipped as Base UI's checkbox item flips it. */
export const flipColumn = (key) => menus.findLast((m) => m.title === "Columns").toggles.onToggle(key);

recorded.set(Confirm, confirms);

// The lead's panel is the lead sheet (canvas B v2, sheet/sheet.tsx), handed the peek's state and its acts as `on`: read as
// the peek was, its acts beside its state, for each lead it draws (none at a pile's end).
recorded.set(LeadSheet, { push: (p) => (p.vm ? peeks.push({ ...p, ...(p.on ?? {}) }) : undefined) });

recorded.set(LeadPlanPanel, panels);

recorded.set(LeadStrip, strips);

/** A kept search's menu, as the rail drew it. */
export const menuOf = (name) => menus.find((m) => m.title === `More for ${name}`);

/** The Leads tree `draw` last made: what the person is looking at, for the controls a test presses without being handed it. */
export let lastDrawn = null;

/**
 * The desk's map switch: Map (or Table), a quiet button of its own beside Columns (leads/scope/controls.tsx), on the row of
 * views where the page's act stands, as the last draw said it (the phone's is its bar's, which this does not find: a desk
 * is drawn here).
 */
export const mapToggle = () => {
  const button = lastDrawn && byTestId(seen(lastDrawn), "leads-map-toggle");
  assert.ok(button, "the desk's controls offer the map");
  assert.ok(["Map", "Table"].includes(textOf(button)), `the map's button says Map or Table, not ${textOf(button)}`);
  return { props: { onClick: button.props.onClick } };
};

// Find leads is Ask's (spec F1, F7): every door on the page hands Ask a detail, and that detail is what is pinned.
export const asks = [];

// Every way a page could record or upload, and Ask's own doors: each one a recorder, so "the page asks nothing
// and starts nothing by itself" is a fact this file can check rather than a sentence it repeats.
export const uploads = [];

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
export const reads = [];

export const writes = [];

export const unexpected = [];

export const viewSaves = [];

export let holdViewSaves = false;

/** Requests sent and not yet answered: what one test leaves in the air must not land in the next one's world. */
export let inFlight = 0;

export let server = null;

export const reply = (status, body) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

export const refusal = (status, code, message) => reply(status, { ok: false, error: { code, message } });

/** A write's answer, as its route gives it, by request line. */
export const answers = [
  [/^POST \/api\/v1\/leads\/[^/]+\/keep$/, () => ({ op_id: "op-k", version: 4 })],
  [/^POST \/api\/v1\/leads\/[^/]+\/exclude$/, () => ({ op_id: "op-e", version: 5 })],
  [/^POST \/api\/v1\/leads\/[^/]+\/put-back$/, () => ({ op_id: "op-p", version: 6 })],
  [/^POST \/api\/v1\/lead-operations\/[^/]+\/undo$/, () => ({})],
  [/^DELETE \/api\/v1\/leads\/[^/]+$/, () => ({ erased: true, already: false })],
  [/^POST \/api\/v1\/leads\/bulk$/, () => ({ done: 2, op_id: "op-b", version: 7, toast: "Done." })],
  [
    /^POST \/api\/v1\/leads\/export$/,
    () => ({
      file: "leads-Salon-20260908.csv",
      csv: "Business,City\r\nTravis Heights Coaching Co.,Austin\r\n",
      rows: 161,
    }),
  ],
  [
    /^POST \/api\/v1\/leads\/check-again$/,
    (b) => ({ scheduled: b.ids.length, skipped: 0, toast: `Checking ${b.ids.length} again.` }),
  ],
  [/^PATCH \/api\/v1\/lead-searches\/[^/]+$/, (b) => ({ name: b.name })],
  [/^DELETE \/api\/v1\/lead-searches\/[^/]+$/, () => ({ archived: 143, kept: 18 })],
  [/^POST \/api\/v1\/lead-searches\/[^/]+\/more$/, (_, key) => ({ search_id: key.split("/").at(-2), round_id: "r9" })],
  // An idea pressed (POST ask/idea): the thread its card waits in, which the page opens Ask on.
  [/^POST \/api\/v1\/ask\/idea$/, (b) => ({ thread: { id: "t-idea", title: b.words } })],
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
export const kept = (r) => ({ ...r, member: { ...r.member, class: "qualified", counted: true } });

export const leftOut = (r) => ({ ...r, member: { ...r.member, class: "excluded", counted: false } });

export const BULK_EFFECTS = {
  keep: kept,
  exclude: leftOut,
  contacted: (r) => ({ ...r, stage: "nurture" }),
  not_a_fit: (r) => ({ ...r, stage: "archived", closed_reason: "not_a_fit" }),
};

export const changeRows = (ids, patch) => {
  if (Array.isArray(server.rows))
    server.rows = server.rows.map((r) => (ids === "all" || ids.includes(r.id) ? patch(r) : r));
};

export const takeEffect = (key, body) => {
  const lead = /^(POST|DELETE) \/api\/v1\/leads\/([^/]+)(?:\/(keep|put-back|exclude))?$/.exec(key);
  if (lead && lead[1] === "POST" && lead[3]) changeRows([lead[2]], lead[3] === "exclude" ? leftOut : kept);
  else if (lead && lead[1] === "DELETE" && Array.isArray(server.rows))
    server.rows = server.rows.filter((r) => r.id !== lead[2]);
  else if (key === "POST /api/v1/leads/bulk" && BULK_EFFECTS[body.action])
    changeRows(body.by === "ids" ? body.ids : "all", BULK_EFFECTS[body.action]);
};

/**
 * The read's filters as the server applies them (lead_view_rows, held to the goldens in lead-filters.db.test.mjs): the
 * box's words in the name, the kind or the area, the criterion that left a lead out, the fit, and each reach asked. With
 * them, what the view holds (lead_view_counts): its leads, those the filters keep, each criterion's over the view.
 */
export const narrowAsTheRead = (rows, query) => {
  const words = (query.q || "").trim().toLowerCase();
  const reach = (query.reach || "").split(",").filter(Boolean);
  const kept = rows.filter((r) => {
    const area = [r.postal_code ?? "", [r.city, r.state].filter(Boolean).join(", ")].filter(Boolean).join(" · ");
    if (words && ![r.business_name, r.category ?? "", area].some((w) => w.toLowerCase().includes(words))) return false;
    if (query.excluded_by && r.member.excluded_by !== query.excluded_by) return false;
    if (query.fit && r.member.fit !== query.fit) return false;
    if (reach.includes("email") && !(r.email && r.email_state === "ok")) return false;
    if (reach.includes("phone") && !(r.phone && !r.phone_wrong && r.phone_agrees)) return false;
    return true;
  });
  const excluded_by = {};
  for (const r of rows)
    if (r.member.excluded_by) excluded_by[r.member.excluded_by] = (excluded_by[r.member.excluded_by] ?? 0) + 1;
  return { rows: kept, view: { view: rows.length, matching: kept.length, excluded_by } };
};

/** Whether a read asks any of the page's filters. */
export const asksFilters = (query) => ["q", "excluded_by", "fit", "reach"].some((k) => query[k]);

/** A read of the workspace, as the server answers it. */
export const serveRead = (path, query) => {
  if (path === "/api/v1/lead-searches")
    return reply(200, { ok: true, data: { searches: server.searches, counts: server.counts } });
  // Suggestions the server has not written (undefined) are a read that fails: the surface publishes none, and says so.
  if (path === "/api/v1/lead-suggestions")
    return server.suggestions === undefined
      ? refusal(500, "internal", "The suggestions couldn't be read.")
      : reply(200, { ok: true, data: server.suggestions });
  if (path === "/api/v1/leads") {
    if (query.after_key)
      return reply(200, { ok: true, data: { rows: server.more ?? [], next: null, counts: server.counts } });
    const read =
      typeof server.rows === "function"
        ? { rows: server.rows(query), view: null }
        : narrowAsTheRead(server.rows, query);
    const { rows } = read;
    const next =
      server.more && server.more.length ? { key: "k-page-one", id: rows.length ? rows[rows.length - 1].id : "" } : null;
    return reply(200, {
      ok: true,
      data: {
        rows,
        next,
        counts: server.counts,
        ...(server.month ? { month: server.month } : {}),
        // A filtered view says what it holds; an unfiltered one keeps the rail's count, as this world's views are bigger
        // than the rows it holds.
        ...(read.view && asksFilters(query) && query.sort !== "pile" ? { view: read.view } : {}),
      },
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
  // The sequences Add can go to, and those to leads the pick and the picker offer (sheet/use-aim.ts, 00459): none here.
  if (path === "/api/v1/reach-outs") return reply(200, { ok: true, data: { chains: [] } });
  if (path === "/api/v1/sequences") return reply(200, { ok: true, data: { sequences: [] } });
  // A lead's place in a sequence (00459 sequence_place, the lead sheet's one reader): none of these leads is in one.
  if (/^\/api\/v1\/leads\/[^/]+\/place$/.test(path)) return reply(200, { ok: true, data: null });
  if (/^\/api\/v1\/leads\/[^/]+\/emails$/.test(path)) return reply(200, { ok: true, data: [] });
  if (/^\/api\/v1\/leads\/[^/]+\/words$/.test(path)) return reply(200, { ok: true, data: [] });
  // A lead's own preview (decision 0079, the sheet's Their receptionist): this workspace makes none, so the sheet draws nothing.
  if (/^\/api\/v1\/leads\/[^/]+\/preview$/.test(path))
    return reply(200, { ok: true, data: { preview: null, makes: false } });
  // A person read ahead of a press (People's warmPeople, which the Pipeline's rows ask as they are rested on), who is not here.
  if (/^\/api\/v1\/contacts\/[^/]+$/.test(path)) return refusal(404, "not_found", `no ${path}`);
  unexpected.push(`GET ${path}`);
  return refusal(404, "not_found", `no ${path}`);
};

export const serve = async (u, init) => {
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
  return reply(200, { ok: true, data: hit ? hit[1](body, key) : { done: true } });
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
export const resetWire = ({ refuse = null, ...given } = {}) => {
  forgetLeadsViews();
  reads.length = 0;
  writes.length = 0;
  unexpected.length = 0;
  server = { ...world(given), refuse, answer: null, gate: null };
  return server;
};

/** The lead reads (page one and the pages after it) the wire saw, as their queries: list, sort, dir, search, class, after_key. */
export const pageReads = () =>
  reads
    .filter((r) => r.startsWith("/api/v1/leads?"))
    .map((r) => Object.fromEntries(new URL(r, "https://app.chanlytics.com").searchParams));

/** The writes the wire saw, as { key, body }: the request line, and what it carried. */
export const wrote = (match = () => true) => writes.filter(match);

export const lastWrite = () => writes.at(-1);

/** A tree walked once per node: a drawn component is its children as it was given them and what it rendered, and the two share nodes. */
export const walk = (n, fn, seen = new Set()) => {
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

export const all = (tree, pred) => {
  const out = [];
  walk(tree, (n) => {
    if (pred(n)) out.push(n);
  });
  return out;
};

export const find = (tree, pred) => all(tree, pred)[0] ?? null;

/**
 * A sheet of the page's while it is open, by its test id: the kit's Sheet (kit/sheet/sheet.tsx), read by what the page
 * hands it; its Escape, wash and pull are Base UI's and the thumb reader's, each asking through `onClose`.
 */
export const openSheet = (tree, id) =>
  find(tree, (n) => n.type === Sheet && n.props.testid === id && n.props.open) ?? null;

export const byTestId = (tree, id) => find(tree, (n) => n.props?.["data-testid"] === id);

export const textOf = (n) => {
  if (n == null || typeof n === "boolean") return "";
  if (typeof n === "string" || typeof n === "number") return String(n);
  if (Array.isArray(n)) return n.map(textOf).join("");
  if (n.rendered !== undefined) return textOf(n.rendered);
  return (n.props?.children ?? []).map(textOf).join("");
};

export const click = (node) => node.props.onClick({ stopPropagation() {}, preventDefault() {}, currentTarget: {} });

export const sortByHeading = (tree, label) =>
  click(
    find(
      tree,
      (n) =>
        n.type === "button" &&
        String(n.props?.className || "")
          .split(/\s+/)
          .includes("dtable-sort") &&
        textOf(n).startsWith(label),
    ),
  );

/**
 * Until the surface holds the view read with these words (00500: the box's words are a read, once typing stops). The page's
 * read goes from an effect the next draw runs, so it draws while it waits, as a browser would.
 */
export const wordsRead = (q) =>
  until(() => {
    draw();
    return (surfaceValue("leads")?.view?.q ?? "") === q;
  }, `the read of "${q}"`);

export const tick = () => new Promise((r) => setTimeout(r, 0));

export const settle = async (n = 8) => {
  for (let i = 0; i < n; i += 1) await tick();
};

/** Until a flash past the `before`th is said: an act's answer reads a module first, off the main thread (shared/_until.mjs). */
export const flashSaid = (before) => until(() => flashes.length > before, "the act's toast");

/** An act run until its toast is up, and the toast: a press can hand back nothing to wait on. */
export const toastAfter = async (act, what) => {
  const from = flashes.length;
  await act();
  await until(() => flashes.length > from, `the toast: ${what}`);
  return flashes.at(-1);
};

/**
 * The files the kit offers the app's bridge (kit/download.ts: an `app:file` event the bridge takes and cancels): taken here, so a
 * test sees what would be saved and nothing is made in a document that has no body. `stop` lets go of the listener.
 */
export const takeFiles = () => {
  const files = [];
  const hear = (ev) => {
    files.push(ev.detail);
    ev.preventDefault();
  };
  globalThis.window.addEventListener("app:file", hear);
  return Object.assign(files, { stop: () => globalThis.window.removeEventListener("app:file", hear) });
};

export const press = (key, target = null, { focus = target, ...mods } = {}) => {
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

export const install = ({ role = "owner" } = {}) => {
  holdAsk({
    language: () => "en",
    send: async () => void uploads.push("ask.send"),
    commit: async () => {
      uploads.push("ask.commit");
      return { ok: false, message: "no" };
    },
  });
  bridgeHolds({
    who: { me: { role } },
    parts: {
      chrome: { state: stateOf },
      clock: { dateYear: () => "Sep 18, 2026", time: () => "2:14 PM", zone: () => TZ },
    },
  });
  Object.assign(globalThis.window, {
    // The shell's doors to Ask, recorded: askAbout (dashboard-a-ask.jsx) with what the page hands it, and appAsk
    // (surfaces/frame/app-shell.tsx), the plain open ⌘K makes, which keeps what the owner left in the field. The page reaches them through
    // frame-verbs.ts (askAbout, openAsk, askCalls).
    askAbout: (detail) => asks.push(detail),
    appAsk: () => asks.push("open"),
    ST_STORE: { myRole: () => role, can: (a) => !!(ROLE_PERMS[role] || {})[a] },
    usePPToast: () => [null, (t) => flashes.push(t)],
    CHANLY: { nav: (to) => went.push(to), address, R: { thread: (id) => `inbox/${id}` } },
  });
  // The bridge's reading of who is acting over this window's __ME (the pages ask mayAtLeast), beside the stub's own.
  installRoleStore();
};

/**
 * People's surface as the seam holds it (surfaces/surface-values.ts): what the TSX hooks read through useSurface. Nothing
 * landed is undefined.
 */
export const publishPeople = (value) => setSurfaceValue("people", value);

export const peopleWith = (views) => ({
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
export const L = () => surfaceValue("leads");

/**
 * Until every request the page sent has landed in the surface and the surface has sent what that moved: a read one test
 * leaves in the air must not land in the next one's world. (A save a test holds is not counted: it lands when the test says.)
 */
export const quiesce = async () => {
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

/** The view the page opens on (decision 0015's address `clients/leads`): all leads, what needs you first. */
export const ALL_LEADS = { searchId: null, list: "all", cls: null, chips: {}, sort: "stage", dir: "asc" };

/**
 * A page with the surface landed and nothing drawn yet. The wire holds `leads` (`world`'s overrides) and the REAL Leads surface
 * has read it, as it does when the page opens: its acts change the rows it holds and the peek is drawn from them, so a surface
 * a test published itself would prove nothing about either. What the wire saw while landing it is forgotten, so a test reads
 * only what the page does. Answers the server the wire speaks for, to change what it holds or how it answers.
 */
export const fresh = async ({ leads = {}, views = {}, role = "owner", refuse = null, people = true } = {}) => {
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
  lastDrawn = null;
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
export const draw = (props = {}) => {
  frames.begin();
  const page = {
    scope: "leads",
    leadsRoute: "leads",
    onNavigate: (to) => went.push(to),
    onOpenProfile: (id) => opened.push(id),
    ...props,
  };
  const Page = page.scope === "people" ? PeopleReal : page.scope === "pipeline" ? PipelineScope : LeadsReal;
  const tree = globalThis.React.createElement(Page, page);
  if (page.scope === "leads") lastDrawn = tree;
  return tree;
};

/** The plan panel, through a kept search's Search again, changed: the plan Claude wrote, with what was asked. */
export const openPlanFrom = (name = "Personal trainers · Austin") => {
  draw();
  menuOf(name)
    .items.find((i) => i.label === "Search again, changed")
    .onClick();
  draw();
};

/** What the open plan says of itself: a desk card's tag, and the flag a phone's sheet builds its title from. */
export const planChanged = (props) => {
  const tree = draw(props);
  return [!!byTestId(tree, "plan-changed"), find(tree, (n) => "finderChanged" in (n.props ?? {})).props.finderChanged];
};

/* ---------------------------------- the rows ---------------------------------- */

export const rowOf = (tree, id) => find(tree, (n) => n.type === "tr" && n.props?.id === `lead-${id}`);

export const names = (tree) => all(tree, (n) => n.props?.["data-testid"] === "lead-name").map(textOf);

// The words of every heading the table draws, less its arrow: a group's head is a row's, and a column turned off is not there.
export const headingCells = (tree) => all(tree, (n) => n.type === "th" && !n.props.colSpan);

export const headings = (tree) =>
  headingCells(tree)
    .map((th) => textOf(th).replace(/[▲▼↕]/g, "").trim())
    .filter(Boolean);

// The first day is what every workspace opens Leads on, and it is what nothing drew: the component this file
// used to stub did not exist, so the scope threw "LeadsFirstDay is not defined" for anyone without a search.
/** A workspace on its first day, as the wire answers it: no search kept and no lead held (the page's rule, page/props.tsx). */
export const FIRST_DAY = {
  searches: [],
  rows: [],
  counts: { all: 0, ready: 0, nurture: 0, converted: 0, said_no: 0, not_a_fit: 0 },
};

/** The field's submit, as the browser hands it: the form with its box, which a test fills. */
export const submitField = (form, words) => {
  const box = {
    value: words,
    focused: false,
    focus() {
      this.focused = true;
    },
    blur() {},
  };
  let reset = false;
  form.props.onSubmit({
    preventDefault() {},
    currentTarget: { elements: { namedItem: (n) => (n === "words" ? box : null) }, reset: () => (reset = true) },
  });
  return { box, reset: () => reset };
};

/** Whether anything in the tree is a strip of views: the frame's (SurfaceTabs) draws it from the page's chrome, no page does. */
export const drawsAStrip = (tree) =>
  !!byTestId(tree, "people-scope") ||
  all(tree, (n) =>
    String(n.props?.className || "")
      .split(" ")
      .includes("stabs"),
  ).length > 0;

/* ------------------------------------ the keys ------------------------------------ */

export const cursorRow = (tree) =>
  find(tree, (n) => n.type === "tr" && /\bfocused\b/.test(n.props?.className || ""))?.props.id ?? null;

/* ------------------------ the lead that is open, and the address ------------------------ */

// Leads whose ids are ids, as the door's are: the address admits nothing else after `p-` (contracts parseLeadsRoute).
export const UA = "1ead0000-0000-4000-8000-00000000000a";

export const UB = "1ead0000-0000-4000-8000-00000000000b";

export const UC = "1ead0000-0000-4000-8000-00000000000c";

export const ID_DTOS = [
  leadRow({ id: UA }),
  leadRow({ id: UB, place_id: "ChIJfixture000b", business_name: "Barton Creek Coaching" }),
  leadRow({ id: UC, place_id: "ChIJfixture000c", business_name: "Lamar Strength Co." }),
];

export const ID_ROWS = ID_DTOS.map((r) => toLeadRowVM(r, TZ, NOW));

export const ENTER_ON_ROW = { tagName: "TR", isContentEditable: false, closest: () => null };

/** A page over leads with real ids, drawn at an address the way the shell hands it over, its navigations kept. */
export const addressed = async (leads = {}) => {
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

/* ------------------------------ the page keeps your place ------------------------------ */

export const searchBox = () => lineBox();

/** The tab refreshed, or the owner went to the Inbox and came back: the page's state is gone, the tab's storage is not. */
export const comeBack = (props) => {
  cells = [];
  setters = [];
  for (const k of Object.keys(listeners)) delete listeners[k];
  draw(props);
  return draw(props);
};

/**
 * The page with a pane a browser could have given it. The pane's ref is found on a first draw and put in place before
 * the next first draw: React sets a ref before it runs an effect, and the stub runs an effect as it draws. The pane
 * keeps its scroll listeners with the phase each went up in (a removal takes down only one in that same phase) and its
 * attributes, and holds the table's own box. scrolls(box) is a scroll as a browser delivers it: it does not bubble, so
 * a box inside the pane reaches only the pane's capture listeners, and the pane's own scroll reaches them all.
 */
export const paned = async (table) => {
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

/** The table's rows as drawn (surfaces/kit/table/rows.tsx TableRowView, or its memo). */
export const tableRowsOf = (tree) =>
  all(
    tree,
    (n) => (n.type && n.type.name === "TableRowView") || (n.type && n.type.type && n.type.type.name === "TableRowView"),
  );

/** What a row is handed that is not its own: each the same object from one draw to the next, or every row draws again. */
export const ROW_HELD = ["columns", "ctx", "onToggle", "onCursor", "onOpen", "rowClass", "words"];

export const bar = (over = {}) => {
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
    ...over,
  });
};

/* ------------------------------- the strip's controls ------------------------------- */

export const running = (over = {}) => ({
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

/** Sets the world's `holdViewSaves` for a test, as its assignment did: a module that imports a binding cannot assign it. */
export const setHoldViewSaves = (value) => (holdViewSaves = value);

/** Sets the world's `overlayOpen` for a test, as its assignment did: a module that imports a binding cannot assign it. */
export const setOverlayOpen = (value) => (overlayOpen = value);

/** Sets the world's `cells` for a test, as its assignment did: a module that imports a binding cannot assign it. */
export const setCells = (value) => (cells = value);
