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
 * Run against the contracts and the pages, the People surface over a fake wire, on a stub React. The person's page is the
 * TSX (surfaces/people/person): it reads the person and writes every answer through the profile's courier, so a person here
 * is the answer the wire gives (GET /api/v1/contacts/<id>) and what the page does is the request it makes; People's rows
 * are the typed seam's (surface-values.ts). The People list is still the shell's page, drawn from its scripts.
 */
import { test, afterEach } from "node:test";
import assert from "node:assert/strict";
import { legacyAddress } from "../shell/address/_address.mjs";
import { all, byTestId, find, installRoleStore, kitPages, press, textOf, useStubHooks } from "../_legacy-react.mjs";
import { importSrc } from "../_source.mjs";
import * as contracts from "@chanlytics/contracts";
import { hookFrames } from "../_hook-frames.mjs";

// A namespace, not named imports: a word or a filter this slice adds is missing from the module until it
// lands, and a named import of it would fail the whole file rather than the test that needs it.
const { CONSENT_SOURCES, attentionRow, mayReceive, offersYesRefusal, stateOf, toPersonRowVM } = contracts;
const filterTimeline = (items, id) => contracts.filterTimeline(items, id);
/**
 * A person as the contract maps them, remembering the detail it was made from: the page reads its person off the wire, so
 * `profile(vm)` answers the request for them with that detail, and the page maps it again as it does in the app.
 */
const details = new WeakMap();
const toPersonVM = (dto, ...rest) => {
  const vm = contracts.toPersonVM(dto, ...rest);
  details.set(vm, dto);
  return vm;
};

const TID = "t-salon";
const ZONE = "America/New_York";
const H = 3_600_000;
const D = 24 * H;
const NOW = Date.now();
const iso = (ms) => new Date(NOW - ms).toISOString();
const ahead = (ms) => new Date(NOW + ms).toISOString();

/** A person the People read returns, the shape people-vm.test.mjs pins (as people-honest.test.mjs copies it). */
const row = (over = {}) => ({
  id: "p1",
  display_name: "Daniela Reyes",
  wa_profile_name: null,
  phone_e164: "+17865550181",
  consent: "opted_in",
  consent_source: "in_person",
  consent_updated_at: iso(2 * D),
  marketing_consent: "unknown",
  marketing_consent_source: null,
  marketing_consent_updated_at: null,
  dnc: false,
  channels: ["whatsapp"],
  conversation_count: 1,
  escalation_count: 1,
  needs_human: true,
  open_escalation_reason: "human_token",
  open_escalation_since: iso(2 * H),
  latest_conversation_id: "cv1",
  latest_state: "open",
  latest_paused_until: null,
  latest_assignee_user_id: null,
  latest_snooze_until: null,
  latest_wa_inbound_at: iso(3 * H),
  last_message_at: iso(3 * H),
  last_message_direction: "inbound",
  last_message_sender: "customer",
  last_inbound_text: "Can I move Saturday to 11?",
  last_inbound_at: iso(3 * H),
  last_call_at: null,
  call_count: 0,
  call_seconds: 0,
  first_contact_at: iso(60 * D),
  earliest_row_at: iso(60 * D),
  has_backfill: false,
  has_chat: true,
  queued_reply_at: null,
  ...over,
});
/**
 * A booking ahead, as the calendar match attaches it (calendar-people.test.mjs): two days ahead on a weekday, so it
 * is still "this week" (Monday to Sunday, by the workspace's clock) -- from a Saturday two days ahead is next week,
 * and the suite failed every weekend. On Saturday it is tomorrow; on Sunday, later today.
 */
const WEEKDAY = new Date(NOW).toLocaleDateString("en-US", { timeZone: ZONE, weekday: "short" });
const AHEAD_MS = WEEKDAY === "Sat" ? D : WEEKDAY === "Sun" ? 2 * H : 2 * D;
const NEXT = {
  id: "b1:1",
  start: ahead(AHEAD_MS),
  end: ahead(AHEAD_MS + 2 * H),
  title: "Color",
  all_day: false,
  via: "phone",
};
const VISITS = { timezone: ZONE, source: "Google Calendar", state: "ok", next: NEXT, last: null };
/** A profile's detail, as the contacts/[id] route returns it. */
const detail = (over = {}) => ({
  row: row({ visits: VISITS }),
  identities: [],
  conversations: [
    {
      id: "cv1",
      state: "open",
      paused_until: null,
      last_wa_inbound_at: iso(3 * H),
      last_message_at: iso(3 * H),
      contact: {
        id: "p1",
        display_name: "Daniela Reyes",
        wa_profile_name: null,
        phone_e164: "+17865550181",
        consent: "opted_in",
        dnc: false,
      },
      messages: [
        {
          id: "m1",
          conversation_id: "cv1",
          direction: "inbound",
          sender: "customer",
          type: "text",
          body: "Can I move Saturday to 11?",
          media: null,
          meta: null,
          status: "received",
          created_at: iso(3 * H),
        },
      ],
    },
  ],
  calls: [],
  escalations: [
    { id: "e1", reason: "human_token", details: null, state: "open", created_at: iso(2 * H), conversation_id: "cv1" },
  ],
  decisions: [],
  receptionist_mode: "ask",
  workspace_reply_mode: "auto",
  visits: { ...VISITS, all: [NEXT] },
  ...over,
});

/* ------------------------------- the words, in contracts ------------------------------- */

test("REGRESSION (B15): the receptionist's mode has one set of words, a word for following the workspace among them", () => {
  assert.deepEqual(contracts.PERSON_MODE_WORDS, {
    auto: "Answer",
    ask: "Ask me first",
    never: "Never",
    inherit: "Follow the workspace",
  });
  assert.equal(stateOf("mode", "inherit").label, "Follow the workspace", "the pill says it too");
  assert.equal(
    toPersonRowVM(
      row({ needs_human: false, open_escalation_reason: null, effective_reply_mode: "ask" }),
      ZONE,
      new Date(NOW),
    ).receptionist.label,
    "Held for you, set to Ask me first",
    "REGRESSION: a state said Ask of a mode called Ask me first",
  );
  const held = toPersonVM(
    detail({
      row: row({ needs_human: false, open_escalation_reason: null, effective_reply_mode: "never" }),
      escalations: [],
      receptionist_mode: "never",
    }),
    ZONE,
    new Date(NOW),
  );
  const tile = held.facts.find((f) => f.label === "Receptionist");
  assert.deepEqual(
    [tile.value, tile.meta],
    ["Held for you", "set to Never"],
    "REGRESSION: the tile said Paused, and 'held for you, set to never' under it",
  );
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
  assert.deepEqual(
    contracts.TIMELINE_FILTERS?.map((f) => f.id),
    ["all", "messages", "calls", "visits", "consent", "deals"],
  );
  assert.deepEqual(
    filterTimeline(vm.timeline, "visits").map((i) => i.kind),
    ["visit"],
  );
  assert.deepEqual([...new Set(filterTimeline(vm.timeline, "messages").map((i) => i.kind))].sort(), [
    "customer",
    "escalation",
  ]);
  assert.equal(filterTimeline(vm.timeline, "all").length, vm.timeline.length);
});

/* ---------------------------------- the window ---------------------------------- */

const listeners = {};
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
  body: { appendChild() {} },
  activeElement: null,
  addEventListener() {},
  removeEventListener() {},
  getElementById: () => null,
  createElement: () => ({
    setAttribute() {},
    style: {},
    classList: { add() {}, remove() {} },
    click() {},
    remove() {},
  }),
};
/** Every event the window was told, in order: the page's own listeners come and go with its draws; what was said stays. */
const dispatched = [];
globalThis.window = {
  location: {
    pathname: "/w/salon",
    hash: "#/clients",
    origin: "https://app.chanlytics.com",
    assign() {},
    replace() {},
    reload() {},
  },
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
    dispatched.push(ev);
    for (const fn of [...(listeners[ev.type] || [])]) fn(ev);
    return true;
  },
  innerHeight: 800,
  setTimeout: (fn, ms) => setTimeout(fn, ms),
  clearTimeout: (h) => clearTimeout(h),
  __WORKSPACES: [{ id: TID, slug: "salon", name: "Salon", status: "active", timezone: ZONE }],
  __ACTIVE_WORKSPACE: TID,
};
const json = (status, body) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
const quietly = async (fn) => {
  const e = console.error;
  console.error = () => {};
  try {
    return await fn();
  } finally {
    console.error = e;
  }
};
const { peopleOverride } = await quietly(() => import("../../../../apps/dashboard/src/surfaces/people/surface.ts"));
const { installClock } = await import("../../../../apps/dashboard/src/legacy-bridge/zone.ts");
installClock();

/**
 * The wire, one for the People read and the person's own: what the profile's courier and the list verbs ask of the server.
 * `people` and `lists` answer the People read; a person's page is answered with the detail the test gave it (`serve`); an
 * `answers` entry ("PUT /api/v1/contacts/p1/details") answers a request itself, and the rest of a person's writes are
 * accepted. A read held (`holdRead`) waits for the test to let it go. Every request is kept, with its body.
 */
const world = {
  people: [],
  lists: [],
  details: new Map(),
  answers: {},
  seen: [],
  held: [],
  holding: new Set(),
  pending: 0,
};
const okBody = (data = {}) => json(200, { ok: true, data });
const refused = (status, message, code = "invalid") => json(status, { ok: false, error: { code, message } });
/** The person's page: what the detail route answers for them, or that they are not in the workspace. */
const personAnswer = (id) => {
  const dto = world.details.get(id);
  return dto ? okBody({ person: dto }) : refused(404, "This person is not in your workspace.", "not_found");
};
const CONTACT = /^\/api\/v1\/contacts\/([^/]+)(\/.*)?$/;
const handleRequest = async (url, init = {}) => {
  const u = new URL(String(url), "https://app.chanlytics.com");
  const method = init.method ?? "GET";
  world.seen.push({ method, path: u.pathname, body: init.body ? JSON.parse(init.body) : null });
  const answer = world.answers[`${method} ${u.pathname}`];
  if (answer) return answer(world.seen.at(-1).body);
  if (u.pathname === "/api/v1/contacts")
    return okBody({
      people: world.people,
      page: { q: null, offset: 0, limit: 1000, total: world.people.length, has_more: false },
      calendar: { state: "ok", source: "Google Calendar" },
      booking_link: null,
    });
  if (u.pathname === "/api/v1/segments") return okBody({ lists: world.lists });
  if (u.pathname === "/api/v1/views") return okBody({ views: {} });
  const one = CONTACT.exec(u.pathname);
  if (one && method === "GET" && !one[2]) {
    if (!world.holding.has(one[1])) return personAnswer(one[1]);
    // A request held is not out: the test lets it go, and it is out again until it is answered.
    world.pending -= 1;
    return new Promise((r) =>
      world.held.push(() => {
        world.pending += 1;
        r(personAnswer(one[1]));
      }),
    );
  }
  if (one && method !== "GET") return okBody();
  if (method === "PUT" && /^\/api\/v1\/segments\/[^/]+$/.test(u.pathname)) return okBody();
  return refused(404, `no ${u.pathname}`, "not_found");
};
globalThis.window.fetch = async (url, init) => {
  world.pending += 1;
  try {
    return await handleRequest(url, init);
  } finally {
    world.pending -= 1;
  }
};
/** The wire as this file installs it: a test that puts its own in front of it gives it back, or the next test reads nothing. */
const worldFetch = globalThis.window.fetch;
/** The People read over a fake wire: these people, a calendar that reads, one saved list. */
const wire = (people, lists = []) => {
  world.people = people;
  world.lists = lists;
};
/** The requests the wire took, of one method and path. */
const took = (method, path) => world.seen.filter((q) => q.method === method && q.path === path);
/** A person's page held on the wire until `release`, which lets every read held go: their page, or that they are not here. */
const holdRead = (id) => {
  world.holding.add(id);
  return {
    release: (dto = world.details.get(id)) => {
      world.holding.delete(id);
      if (dto === null) world.details.delete(id);
      else world.details.set(id, dto);
      for (const go of world.held.splice(0)) go();
    },
  };
};

let cells = [];
// Where each hook keeps its state: by the component that calls it, as React keeps it (_hook-frames.mjs).
const frames = hookFrames();
const went = [];
let ids = 0;
// An effect runs when its inputs change, after its last cleanup, the way React runs it; with no inputs, on every draw.
const effect = (fn, deps) => {
  const k = frames.key();
  const prev = cells[k];
  if (prev && deps && prev.deps && deps.length === prev.deps.length && deps.every((d, i) => Object.is(d, prev.deps[i])))
    return;
  if (prev && typeof prev.cleanup === "function") prev.cleanup();
  cells[k] = { deps, cleanup: undefined };
  cells[k].cleanup = fn();
};
globalThis.Icon = "Icon";
globalThis.React = {
  Fragment: "Fragment",
  createElement: (type, p, ...kids) => {
    const props = { ...(p || {}), children: kids.flat(Infinity) };
    const node = { type, props };
    if (typeof type === "function") node.rendered = frames.render(type, props);
    return node;
  },
  cloneElement: (el, props) => ({ ...el, props: { ...el.props, ...props } }),
  useState: (init) => {
    const k = frames.key();
    if (!(k in cells)) cells[k] = typeof init === "function" ? init() : init;
    return [
      cells[k],
      (v) => {
        cells[k] = typeof v === "function" ? v(cells[k]) : v;
      },
    ];
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
  useMemo: (fn) => fn(),
  useCallback: (fn) => fn,
  useEffect: effect,
  useLayoutEffect: effect,
  // An id that stays with its component across draws and is no other's.
  useId: () => {
    const k = frames.key();
    if (!(k in cells)) cells[k] = `:r${(ids++).toString(36)}:`;
    return cells[k];
  },
  // A store outside React (the typed seam's, surface-values.ts): what it holds as it is drawn. These tests draw when they
  // ask, so a notice to redraw has no one to tell; the redraw on the store moving is proved in shell/surfaces.
  useSyncExternalStore: (_subscribe, snapshot) => snapshot(),
};
globalThis.ReactDOM = { createPortal: (node) => node };
globalThis.useSurface = () => 0; // the bridge's hook the shell's pages call: these tests draw once, and the redraw is proved in shell/surfaces
await import("../../../../apps/dashboard/src/legacy/components/data-bits.jsx");
Object.assign(globalThis.window, kitPages);
for (const k of ["StatStrip", "StatCell", "EmptyState", "FailedRead", "StatePill", "mayAtLeast"])
  globalThis[k] = globalThis.window[k];
installRoleStore();
// Menus and questions as their props, drawn by hookless stand-ins, for the People list's scripts (the person's page draws the kit's own).
for (const k of ["MoreMenu", "Confirm", "ChannelGlyph", "TempBar", "ClientTag"]) globalThis[k] = () => null;
globalThis.useHotkey = () => {};
// Leads' peek seams (surfaces/leads/peek/seams.ts, which this file does not load), as no-ops that return their own cleanup.
globalThis.leadArmOnReturn = () => () => undefined;
globalThis.leadPeekFocus = () => () => undefined;
Object.assign(globalThis.window, {
  usePPToast: () => [null, () => {}],
  // The frame's own Back to People, which the person's page asks for (person-verbs.ts backToPeople).
  appBackToPeople: () => went.push("back"),
  AttnRow: () => null,
  CHANLY: {
    nav: (to) => went.push(to),
    address: await legacyAddress(),
    R: { thread: (id) => `inbox/${id}`, segment: (id) => `segments/${id}`, clientSeg: (id) => `clients/seg:${id}` },
  },
  __chrome: { state: stateOf },
  __ME: { role: "owner" },
  __consentSources: CONSENT_SOURCES,
  __offersYesSources: CONSENT_SOURCES.filter((s) => offersYesRefusal(s.id) === null),
  __mayReceive: mayReceive,
});
// The bridge's own globals for a profile.
const { installPeopleCourier } = await import("../../../../apps/dashboard/src/surfaces/people/people-detail.ts");
const { staleReadCaches } = await import("../../../../apps/dashboard/src/legacy-bridge/read-cache.ts");
installPeopleCourier();
// The kit's components and the hooks the TSX draws with: the stub's, on the react module the TSX imports them from.
useStubHooks();
// People's own list page (the tests that draw it beside the profile), the New list row and the kit's Icon the TSX draws.
const { PeopleReal } = await importSrc("apps/dashboard/src/surfaces/people/page/people-real.tsx");
const { NewListRow } = await importSrc("apps/dashboard/src/surfaces/people/rail/new-list.tsx");
const { Icon: KitIcon } = await importSrc("apps/dashboard/src/surfaces/kit/icon/icon.tsx");
// The person's page and what it draws, which are TSX (surfaces/people): imported as the app imports them, after the window
// they read is in place. Its parts are read off the same modules the page draws them from, so a node is found by its type.
const P = "../../../../apps/dashboard/src/surfaces/people";
const { ClientProfile } = await import(`${P}/person/person-real.tsx`);
const { PersonLists } = await import(`${P}/person/lists.tsx`);
const { PersonDealCard } = await import(`${P}/deal/person-deal.tsx`);
const { personDetail } = await import(`${P}/people-detail.ts`);
const { setSurfaceValue, surfaceValue } = await import("../../../../apps/dashboard/src/surfaces/surface-values.ts");
const { clearReadCaches } = await import("../../../../apps/dashboard/src/legacy-bridge/read-cache.ts");
const { recFolds } = await import("../../../../apps/dashboard/src/surfaces/kit/record/registry.ts");
const { setStatus } = await import("../../../../apps/dashboard/src/legacy-bridge/surface-status.ts");
// The write that lands moves the surfaces the refresh map names, through a module the loader hands over off the main
// thread: loaded before a test waits on a write, so it is not the wait.
await import("../../../../apps/dashboard/src/legacy-bridge/refresh-map.ts");
const { StatePill } = kitPages;
// The person's More is the kit's Menu (surfaces/kit/menu): its trigger is the page's Button, its items in groups.
const { Menu } = await import(`${P}/../kit/menu/menu.tsx`);
const { Picker } = await import(`${P}/../kit/picker/picker.tsx`);
const { Confirm: KitConfirm } = await import(`${P}/../kit/confirm/confirm.tsx`);
const { SubTabs } = await import(`${P}/../kit/sub-tabs/sub-tabs.tsx`);
// The page says its own head to the frame (kit/head/standing.ts): a null title, and its way back to People.
const { standingSaid } = await import(`${P}/../kit/head/standing.ts`);
const itemsIn = (menu) => menu.props.groups.flatMap((g) => g.items);
/** The kit Menu's items as the page built them: an item's act is `onSelect`, given here as `onClick` too. */
const actsIn = (menu) => itemsIn(menu).map((i) => ({ ...i, onClick: i.onSelect }));
/** The Menu of a drawn tree, and what a bar's menu says on its button (its trigger's words). */
const menuByWords = (tree, words) => find(tree, (n) => n.type === Menu && textOf(n.props.trigger).trim() === words);

const tick = () => new Promise((r) => setTimeout(r, 0));
/** Turns of the loop for what a press started to finish: and for every request out to be answered, and what follows it (a held one is not out). */
const settle = async (n = 8) => {
  for (let i = 0; i < n; i += 1) await tick();
  await idle();
};
/** Every request out answered, and a turn for what its answer started. */
const idle = async () => {
  for (let i = 0; i < 200 && world.pending > 0; i += 1) await tick();
  await tick();
};

/** The People page over the real surface. */
const peoplePage = async (people, lists = []) => {
  wire(people, lists);
  await quietly(() => peopleOverride.apply());
  cells = [];
  went.length = 0;
  for (const k of Object.keys(listeners)) delete listeners[k];
  return () => {
    frames.begin();
    return PeopleReal({ onOpenProfile: (id) => went.push(`profile:${id}`) });
  };
};
/**
 * A new tree for a person's page, as the app makes one: what the last one had out is answered first (its state is written
 * into the cells by key, so a late answer would land in this tree), and nothing of it is kept: its state, its listeners,
 * the people the tab held, the fold that was open.
 */
const newTree = async () => {
  await idle();
  cells = [];
  went.length = 0;
  for (const k of Object.keys(listeners)) delete listeners[k];
  clearReadCaches();
  recFolds.reset();
};
/** A person's page is the wire's answer for them: the detail the contract mapped this person from. */
const serve = (vm) => {
  const dto = details.get(vm);
  assert.ok(dto, "the person served is one this file mapped, so the wire has their detail");
  world.details.set(vm.id, dto);
};
/** The page for a person, as the shell draws it at their id, on the tab its address names (decision 0052, 13). */
const pageFor = (id, tab) => {
  frames.begin();
  return ClientProfile(tab ? { id, tab } : { id });
};
/** A loaded profile, on the tab asked for (the Overview when none is): the load effect run, then drawn again. */
const profile = async (vm, tab) => {
  await newTree();
  serve(vm);
  const draw = () => pageFor(vm.id, tab);
  draw();
  await settle(2);
  return draw;
};
/**
 * The tab's storage for a test that reads what a press carries to the thread's composer (a send opens the thread with its
 * words ready): the composer's slot alone is kept, since the tab keeps the people it read in the same storage (read-cache.ts).
 * Answers the way to put the tab's own back.
 */
const carryingCompose = (carried) => {
  const tab = globalThis.sessionStorage;
  globalThis.sessionStorage = {
    setItem: (k, v) => {
      if (k === "chanlytics-compose") carried.push([k, v]);
    },
    getItem: () => null,
    removeItem: () => {},
  };
  return () => {
    globalThis.sessionStorage = tab;
  };
};
// What a test held or answered on the wire, and told the window, is its own.
afterEach(async () => {
  for (const go of world.held.splice(0)) go();
  world.holding.clear();
  world.answers = {};
  world.details.clear();
  world.seen.length = 0;
  dispatched.length = 0;
  await idle();
});

/* ----------------------------------- the People page ----------------------------------- */

test("REGRESSION (B9): a row says why someone needs you, and their last words -- the reason and the words were computed and never drawn", async () => {
  const dto = row();
  const draw = await peoplePage([dto]);
  const tree = draw();
  const tr = find(tree, (n) => n.type === "tr" && n.props?.id === "person-p1");
  const vm = toPersonRowVM(dto, ZONE, new Date());
  const a = attentionRow(vm, ZONE, Date.now());
  assert.ok(vm.stateDetail, "the fixture needs you, for a reason");
  assert.ok(
    textOf(byTestId(tr, "row-state-detail")).includes(vm.stateDetail),
    `the reason beside the state: ${textOf(tr)}`,
  );
  assert.equal(textOf(byTestId(tr, "row-words")), `“${a.sentence}”`, "their words, as the attention strip says them");
});

test("REGRESSION (B19): People's table is titled for everyone and its first column for a person -- it said All customers and Customer", async () => {
  const draw = await peoplePage([row()]);
  const tree = draw();
  assert.ok(
    all(tree, (n) => n.props?.className === "cl-section-title").some((n) => textOf(n) === "Everyone"),
    "REGRESSION: All customers",
  );
  assert.equal(
    textOf(find(tree, (n) => n.type === "th" && n.props?.className?.includes("sortable"))).replace(/[▲▼↕]/g, ""),
    "Person",
    "REGRESSION: Customer",
  );
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

test("(A1, D1) a row's visit opens the visit itself when the record has a row for it, not only its day", async () => {
  const dto = row({ visits: { ...VISITS, next: { ...NEXT, record_id: "r-next" } } });
  const draw = await peoplePage([dto]);
  const tree = draw();
  press(byTestId(tree, "row-visit-open"));
  const day = toPersonRowVM(dto, ZONE, new Date()).nextVisitDate;
  assert.deepEqual(went, [`calendar/${day}:a-r-next`], "the Calendar opens the visit's panel on its day");
});

test("(D1-visit-mark) a row's visit says how it stands beside its day -- Past once it has ended and nobody has marked it, the member's word once said, nothing while it is ahead", async () => {
  const LAST = { id: "b0:1", start: iso(3 * D), end: iso(3 * D - 2 * H), title: "Color", all_day: false, via: "phone" };
  const stateOf = async (visits) => {
    const draw = await peoplePage([row({ visits })]);
    const state = byTestId(draw(), "row-visit-state");
    return state ? textOf(state) : null;
  };
  assert.equal(
    await stateOf({ ...VISITS, next: null, last: LAST }),
    "Past",
    "it ended and nobody said: where the cell said only its day",
  );
  assert.equal(
    await stateOf({ ...VISITS, next: null, last: { ...LAST, said: "kept", record_id: "r-last" } }),
    "Kept",
    "a member's word on it",
  );
  assert.equal(await stateOf(VISITS), null, "a visit ahead has no word yet");
});

test("REGRESSION (B15): the bulk bar's receptionist menu uses the one set of words -- it said Answer them and Stay out", async () => {
  const draw = await peoplePage([
    row(),
    row({ id: "p2", display_name: "Ana Ruiz", phone_e164: "+17865550182", latest_conversation_id: "cv2" }),
  ]);
  let tree = draw();
  byTestId(tree, "select-all").props.onChange();
  tree = draw();
  const menu = menuByWords(tree, "Receptionist");
  assert.deepEqual(
    itemsIn(menu).map((i) => i.label),
    ["Answer", "Ask me first", "Never", "Follow the workspace"],
  );
});

/* ------------------------------------- the profile ------------------------------------- */

test("REGRESSION (B19, B15): a profile goes back to People, and names following the workspace the way the menu does", async () => {
  const draw = await profile(toPersonVM(detail(), ZONE, new Date(NOW)));
  const tree = draw();
  // The way back is the frame's "‹ People" where the date stands (canvas A): the page says it, and draws no button of
  // its own for it.
  const said = standingSaid();
  assert.equal(said?.title, null, "the page is its own head");
  assert.equal(said?.back?.label, "People", "REGRESSION: All clients");
  // Back is the frame's own (the People view they came from, with its place), and People itself where the frame has none.
  said.back.go();
  assert.deepEqual(went, ["back"]);
  const frameBack = globalThis.window.appBackToPeople;
  delete globalThis.window.appBackToPeople;
  try {
    went.length = 0;
    draw();
    standingSaid().back.go();
    assert.deepEqual(went, ["clients"]);
  } finally {
    globalThis.window.appBackToPeople = frameBack;
  }
  const mode = byTestId(tree, "receptionist-mode");
  assert.deepEqual(
    all(mode, (n) => n.props?.className?.includes("cl-prof-aut-seg")).map((b) => textOf(b)),
    ["Answer", "Ask me first", "Never"],
  );
  assert.ok(textOf(mode).includes("Follow the workspace"), `REGRESSION: "Use the workspace setting": ${textOf(mode)}`);
  const following = await profile(toPersonVM(detail({ receptionist_mode: null }), ZONE, new Date(NOW)));
  assert.ok(
    textOf(byTestId(following(), "receptionist-mode")).includes("Following the workspace (Answer)."),
    "a person on the workspace's setting says so in the same words",
  );
});

test("REGRESSION (B16): the profile's facts and About rail draw no consent; the two asks do", async () => {
  const draw = await profile(toPersonVM(detail(), ZONE, new Date(NOW)));
  const tree = draw();
  assert.ok(
    !all(tree, (n) => n.type === globalThis.StatCell).some((c) => c.props.label === "Consent"),
    "no Consent tile",
  );
  assert.ok(
    !all(tree, (n) => n.props?.className === "cl-prof-attr-key").some((k) => textOf(k) === "Consent"),
    "no Consent row in About",
  );
  assert.ok(
    byTestId(tree, "consent-control") || find(tree, (n) => n.props?.testid === "consent-control"),
    "the ask about their visit is still there",
  );
});

test("REGRESSION (B17): the timeline narrows by kind, and each linked item opens its thread or its day -- only calls opened anything", async () => {
  // A visit that happened, and the fixture's one ahead.
  const PAST = { ...NEXT, id: "b0:1", start: iso(10 * D), end: iso(10 * D - 2 * H) };
  const vm = toPersonVM(detail({ visits: { ...VISITS, all: [PAST, NEXT] } }), ZONE, new Date(NOW));
  // The fixture's one visit has not happened: it is Coming up on the Overview, not History, and it is a door to its day.
  const ahead = all((await profile(vm))(), (n) => n.props?.["data-testid"] === "person-visit-ahead");
  assert.equal(ahead.length, 1, "the visit ahead is Coming up");
  press(ahead[0]);
  const doors = [...went];
  // History is its own tab (0052, 13).
  const draw = await profile(vm, "history");
  let tree = draw();
  // The filters are the kit's sub-tabs (beside the page's own tabs): one for each kind History holds, none for another.
  const filters = (t) =>
    find(t, (n) => n.type === SubTabs && n.props.tabs.some((x) => x.testid?.startsWith("timeline-filter-"))).props;
  assert.deepEqual(
    filters(tree).tabs.map((t) => t.testid),
    ["timeline-filter-all", "timeline-filter-messages", "timeline-filter-visits", "timeline-filter-notes"],
    "a filter for each kind History holds, and none for a kind it does not; their notes are History's last tab",
  );
  for (const open of all(tree, (n) => n.props?.["data-testid"] === "timeline-open")) press(open);
  doors.push(...went);
  const day = toPersonRowVM(row({ visits: VISITS }), ZONE, new Date(NOW)).nextVisitDate;
  assert.ok(doors.includes("inbox/th-cv1") && doors.includes(`calendar/${day}`), `the doors: ${doors}`);
  filters(tree).onSelect("visits");
  tree = draw();
  assert.equal(
    all(tree, (n) =>
      String(n.props?.className || "")
        .split(" ")
        .includes("cl-tl-row"),
    ).length,
    1,
    "only the visit that happened is drawn",
  );
  const timeline = find(tree, (n) => typeof n.type === "function" && n.type.name === "PersonTimeline");
  assert.ok(
    timeline.props.items.every((i) => !i.ahead),
    "History is what has happened: the visit ahead is not handed to it",
  );
  assert.deepEqual(
    filterTimeline(timeline.props.items, timeline.props.filter).map((i) => i.id),
    ["v-b0:1"],
    "Visits shows the visit that happened",
  );
});

test("a call's to-do and what the caller gave are on the person's page, under the call they came from -- the history said only what they wanted (audit of 2 Oct 2026, #8)", async () => {
  const call = (over) => ({
    id: "k1",
    retell_call_id: "r1",
    direction: "inbound",
    call_type: "phone_call",
    status: "ended",
    from_e164: "+17865550181",
    from_raw: null,
    to_e164: null,
    started_at: iso(2 * D),
    ended_at: iso(2 * D - 100_000),
    duration_ms: 100_000,
    disconnection_reason: "agent_hangup",
    sentiment: null,
    call_successful: true,
    in_voicemail: false,
    summary: "Asked about a bridal trial.",
    wanted: "Wants a bridal trial in August",
    outcome: "callback_needed",
    follow_up: "Call back to confirm the bridal trial",
    caller_name: "Daniela Reyes-Ortiz",
    caller_email: "daniela@example.com",
    transcript_object: null,
    recording: { fetch_state: "stored" },
    conversation_id: "cv1",
    contact_id: "p1",
    message_id: null,
    contact: null,
    ...over,
  });
  const vm = toPersonVM(
    detail({
      calls: [
        call({}),
        call({ id: "k2", started_at: iso(5 * D), follow_up: null, caller_name: null, caller_email: null }),
      ],
    }),
    ZONE,
    new Date(NOW),
  );
  const tree = (await profile(vm, "history"))();
  const rows = all(tree, (n) =>
    String(n.props?.className || "")
      .split(" ")
      .includes("cl-tl-row"),
  );
  const callRows = rows.filter((r) => /Inbound call/.test(textOf(r)));
  assert.equal(callRows.length, 2, "both calls are in the history");
  const said = (r) => all(r, (n) => n.props?.["data-testid"] === "timeline-note").map((n) => textOf(n));
  assert.deepEqual(
    said(callRows[0]),
    [
      "To do: Call back to confirm the bridal trial",
      "Gave their name as Daniela Reyes-Ortiz",
      "Gave their email as daniela@example.com",
    ],
    "REGRESSION: the call-back to-do was nowhere on the person's page",
  );
  assert.match(
    textOf(callRows[0]),
    /Wants a bridal trial in August/,
    "what they wanted still leads, and the lines follow it",
  );
  assert.deepEqual(said(callRows[1]), [], "a call that left nothing has no lines");
});

test("REGRESSION (B26): the profile's next visit opens that day on the Calendar -- the tile opened nothing", async () => {
  const draw = await profile(toPersonVM(detail(), ZONE, new Date(NOW)));
  const tree = draw();
  // The next visit is Coming up's tile (canvas A), a link to its day.
  const open = byTestId(tree, "person-visit-ahead");
  assert.ok(open, "the next visit is a door");
  assert.equal(open.type, "a", "a door is a link");
  press(open);
  assert.deepEqual(went, [`calendar/${toPersonRowVM(row({ visits: VISITS }), ZONE, new Date(NOW)).nextVisitDate}`]);
});

test("(A1, D1) the profile's next visit opens the visit itself when the record has a row for it, and says so", async () => {
  const next = { ...NEXT, record_id: "r-next" };
  const withRow = row({ visits: { ...VISITS, next } });
  const draw = await profile(
    toPersonVM(detail({ row: withRow, visits: { ...VISITS, next, all: [next] } }), ZONE, new Date(NOW)),
  );
  const open = byTestId(draw(), "person-visit-ahead");
  assert.ok(open, "the next visit is a door");
  assert.ok(open.props.href.endsWith(":a-r-next"), `its address is the visit itself: ${open.props.href}`);
  press(open);
  assert.deepEqual(went, [`calendar/${toPersonRowVM(withRow, ZONE, new Date(NOW)).nextVisitDate}:a-r-next`]);
});

test("REGRESSION (B18): a list chip on a profile opens its list -- the name was text", async () => {
  await peoplePage([row()], [{ id: "s1", name: "Regulars", ids: ["p1"] }]);
  cells = [];
  frames.begin();
  const lists = PersonLists({ personId: "p1", canEdit: true, first: "Daniela", flash: () => {} });
  const open = byTestId(lists, "person-list-open");
  assert.ok(open && textOf(open).includes("Regulars"), "the name is a door");
  press(open);
  assert.deepEqual(went, ["clients/list:s1"], "the list, picked, on People -- the Lists page folded into it");
});

test("REGRESSION: a profile's Add to a list opens over the card -- the card clipped it at its foot, under a header that said the button again", async () => {
  await peoplePage(
    [row()],
    [
      { id: "s1", name: "Regulars", ids: ["p1"] },
      { id: "s2", name: "Best buyers", ids: [] },
    ],
  );
  cells = [];
  frames.begin();
  const lists = PersonLists({ personId: "p1", canEdit: true, first: "Daniela", flash: () => {} });
  const add = find(lists, (n) => n.type === Menu);
  assert.equal(add.props.trigger.props["data-testid"], "person-list-add");
  assert.deepEqual(
    add.props.groups.flatMap((g) => [g.header, ...g.items.map((i) => i.label)]).filter(Boolean),
    ["Best buyers"],
    "the lists they are not on, and no header saying Add to under a link that says it",
  );
  assert.ok(
    add.props.trigger.props.className.split(" ").includes("is-plain"),
    "a quiet link under the chips, as Add an email is, not a button among them",
  );
});

test("REGRESSION: a person's page says who they are once -- the header held two buttons to one thread and two pills, a card quoted the timeline's first two messages, and six cells said the rail again", async () => {
  const vm = toPersonVM(detail({ booking_link: "https://book.example/salon" }), ZONE, new Date(NOW));
  const draw = await profile(vm);
  const tree = draw();
  const cls = (n) => String(n.props?.className || "");

  // Who they are: the name and the state; their number and where it came from are Reach them's (canvas A), said once.
  assert.equal(byTestId(tree, "person-id-line"), null, "no line of the number under the name");
  // Reach them's number is the press that opens its acts (the kit's Menu, its trigger the row).
  const reachMenu = find(
    tree,
    (n) => n.type === Menu && n.props.trigger?.props?.["data-testid"] === "person-reach-phone",
  );
  const reach = reachMenu?.props.trigger;
  assert.ok(
    reach && textOf(reach).includes(vm.phone) && /Phone · they wrote from it /.test(textOf(reach)),
    `Reach them says the number and where it came from: ${reach && textOf(reach)}`,
  );
  const id = find(tree, (n) => cls(n) === "cl-prof-id");
  assert.deepEqual(
    all(id, (n) => n.type === "button").map((b) => b.props["data-testid"]),
    ["person-rename"],
    "REGRESSION: between 901 and 1250px the header's buttons kept their width and the name's column went to zero",
  );
  assert.deepEqual(
    all(id, (n) => typeof n.type === "function" && n.type.name === "StatePill").map((s) => s.props.value),
    [vm.state],
    "REGRESSION: two pills in the header said Right now's state and the consent again; one word under the name now",
  );

  // One way to the thread, beside who they are, with the booking link beside it.
  const threadButtons = all(
    tree,
    (n) => n.type === "button" && /^(Open thread|Open in Inbox|Open the thread)$/.test(textOf(n).trim()),
  );
  assert.equal(
    threadButtons.length,
    1,
    "REGRESSION: Open thread in the header and Open in Inbox in Right now went to the same thread",
  );
  assert.equal(
    textOf(threadButtons[0]).trim(),
    "Open the thread",
    "one door, one label: the card said Open in Inbox and the header said Open thread",
  );
  const actions = find(tree, (n) => cls(n) === "cl-prof-queue-actions");
  const more = find(actions, (n) => n.type === Menu);
  assert.ok(
    byTestId(actions, "person-open-thread") &&
      more &&
      more.props.trigger.props["data-testid"] === "person-more" &&
      /^More/.test(textOf(more.props.trigger).trim()),
    "the thread beside who they are, and the rest behind More, in words: a ⋯ was too quiet to find",
  );
  assert.ok(
    itemsIn(more).some((i) => i.label === "Send booking link"),
    "REGRESSION: 'Send the booking-link template' was a button of its own beside a thread button to the same place",
  );

  assert.ok(
    !find(tree, (n) => cls(n) === "cl-prof-narr"),
    "REGRESSION: Last exchange quoted the two messages the timeline opens on",
  );
  assert.ok(!find(tree, (n) => cls(n).includes("cl-prof-money")), "REGRESSION: six cells said the rail's facts again");

  // The rail's groups say each fact once (canvas A): no About card of keys repeating the figures or the head.
  assert.equal(all(tree, (n) => n.props?.className === "cl-prof-attr-key").length, 0, "no About card of keys");
  assert.ok(textOf(tree).split(vm.phone).length - 1 <= 1, "their number is said once, in Reach them");
  assert.ok(byTestId(tree, "person-visit-ahead"), "the next visit still opens its day, from Coming up");

  assert.ok(
    !textOf(tree).includes("· receptionist"),
    "REGRESSION: every receptionist entry read Receptionist · receptionist",
  );
});

test("someone who said stop keeps their way into the thread, and is offered no booking link", async () => {
  const vm = toPersonVM(
    detail({
      row: row({
        visits: VISITS,
        consent: "opted_out",
        needs_human: false,
        open_escalation_reason: null,
        open_escalation_since: null,
        escalation_count: 0,
      }),
      escalations: [],
      receptionist_mode: null,
      booking_link: "https://book.example/salon",
    }),
    ZONE,
    new Date(NOW),
  );
  assert.equal(vm.rightNow.cta, null, "the silent case: Right now has no button of its own");
  assert.ok(vm.openThread, "and they do have a thread");
  const draw = await profile(vm);
  const tree = draw();
  const actions = find(tree, (n) => String(n.props?.className || "") === "cl-prof-queue-actions");
  const open = byTestId(actions, "person-open-thread");
  assert.equal(open && textOf(open).trim(), "Open the thread", "the header's Open thread was their only way in");
  press(open);
  assert.deepEqual(went, [vm.openThread]);
  assert.equal(
    byTestId(tree, "text-booking-link"),
    null,
    "REGRESSION: a booking link sat under 'Silent, they opted out'",
  );
});

/* ------------------------ the pass over the page: every row a door, said once ------------------------ */

test("the timeline's linked rows are the doors themselves -- a message's door hid in its time, a button that looked like a timestamp", async () => {
  const vm = toPersonVM(detail(), ZONE, new Date(NOW));
  // The bridge's window.__href is the API URL builder (inbox-verbs.ts): "GET contacts/export" in, a URL out, and a
  // route string in throws on its route table. The page once built its row hrefs through it and every person's
  // page fell over in production (the error surface: can't access property "path"). Installed here as it behaves.
  globalThis.window.__href = (key) => {
    const routes = {};
    return routes[key].path;
  };
  let tree;
  try {
    const draw = await profile(vm, "history");
    tree = draw();
  } finally {
    delete globalThis.window.__href;
  }
  const doors = all(tree, (n) => n.props?.["data-testid"] === "timeline-open");
  for (const d of doors)
    assert.match(d.props.href, /^#\/(inbox|calendar)\//, `a hash route, the app's own: ${d.props.href}`);
  assert.ok(doors.length >= 2, "the message and the escalation open somewhere");
  for (const d of doors) {
    assert.equal(d.type, "a", "a row that goes somewhere is a link, so it has a URL and a keyboard reaches it");
    assert.ok(d.props.href, "with an href");
    assert.ok(String(d.props.className).includes("cl-tl-row"), "and it is the row, not a control inside it");
    assert.equal(
      all(d, (n) => n.type === "button").length,
      0,
      "REGRESSION: a button inside the row, 44px tall on a touch screen",
    );
  }
  const heads = all(tree, (n) => n.props?.className === "cl-tl-day");
  assert.ok(heads.length >= 1, "the day sits above its rows");
  const rows = all(tree, (n) => String(n.props?.className || "").includes("cl-tl-row"));
  for (const r of rows)
    assert.equal(
      all(r, (n) => n.props?.className === "cl-tl-day").length,
      0,
      "the day is not inside a row, so the rail line stops under it",
    );
  went.length = 0;
  press(doors.find((d) => /inbox\//.test(d.props.href)));
  assert.deepEqual(went, ["inbox/th-cv1"], "a press opens the thread");
});

test("a long record folds past twenty rows, and a fold of three is not worth a press", async () => {
  const many = Array.from({ length: 30 }, (_, i) => ({
    id: `m${i}`,
    conversation_id: "cv1",
    direction: i % 2 ? "outbound" : "inbound",
    sender: i % 2 ? "assistant" : "customer",
    type: "text",
    body: `Message ${i}`,
    media: null,
    meta: null,
    status: i % 2 ? "sent" : "received",
    created_at: iso((3 + i) * H),
  }));
  const d = detail();
  const vm = toPersonVM({ ...d, conversations: [{ ...d.conversations[0], messages: many }] }, ZONE, new Date(NOW));
  assert.ok(vm.timeline.length > 23, `the fixture is long: ${vm.timeline.length}`);
  const draw = await profile(vm, "history");
  let tree = draw();
  const rowsOf = (t) =>
    all(t, (n) =>
      String(n.props?.className || "")
        .split(" ")
        .includes("cl-tl-row"),
    ).length;
  // History is what has happened: a visit still ahead is Coming up, above it.
  const past = vm.timeline.filter((i) => !i.ahead);
  assert.equal(rowsOf(tree), 20, "twenty newest rows, then the fold");
  const older = byTestId(tree, "timeline-older");
  assert.equal(textOf(older).trim(), `Show ${past.length - 20} older`, "the fold says how many wait behind it");
  press(older);
  tree = draw();
  assert.equal(rowsOf(tree), past.length, "one press shows the whole record");
  assert.equal(byTestId(tree, "timeline-older"), null);
  // Twenty-two rows: no fold for two.
  const few = toPersonVM(
    { ...d, conversations: [{ ...d.conversations[0], messages: many.slice(0, 22 - (vm.timeline.length - 30)) }] },
    ZONE,
    new Date(NOW),
  );
  const tree2 = (await profile(few, "history"))();
  const fewPast = few.timeline.filter((i) => !i.ahead).length;
  assert.equal(rowsOf(tree2), fewPast, `${fewPast} rows, all drawn`);
  assert.equal(byTestId(tree2, "timeline-older"), null, "a fold of three rows is not worth a press");
});

test("Right now says the state once: the pill wears the standing's word, the sentence gives the reason, and the receptionist is named once", async () => {
  const vm = toPersonVM(detail(), ZONE, new Date(NOW));
  assert.equal(vm.rightNow.tone, "escalated");
  // The operator's first sentence for the reason (contracts ESCALATION_SUMMARIES), after when it began: "Paused until
  // someone answers" was said for every reason, over a person who had asked to stop (the 2 Oct 2026 audit).
  assert.match(
    vm.rightNow.detail,
    /^Since .*\. They asked for a person\. A holding message went out — they're waiting on you\.$/,
    vm.rightNow.detail,
  );
  const draw = await profile(vm);
  const tree = draw();
  // The head says the person's one state, as People's row does (canvas A): Needs you, never the receptionist's standing,
  // which Messages and receptionist says.
  const card = byTestId(tree, "person-now");
  assert.equal(card.props["data-state"], vm.state, "the line says the state People's row says");
  assert.equal(vm.state, "needs_you", "an escalation is someone who needs you");
  assert.ok(
    !String(card.props.className).includes("approval"),
    "REGRESSION: an accent edge on a card whose pill is warn",
  );
  const pill = find(card, (n) => typeof n.type === "function" && n.type.name === "StatePill");
  assert.equal(pill.props.value, vm.state);
  assert.equal(
    pill.props.label,
    vm.stateLabel,
    "REGRESSION: the pill carried the whole title -- Escalated · asked for a person -- and spilled past the card between 901 and 990px: it says the state's word alone",
  );
  // The pill is the state's word; the sentence under the name gives the reason, and both are read together.
  const why = byTestId(tree, "person-now-why");
  assert.equal(textOf(why), vm.rightNow.detail, "the sentence gives the reason");
  const words = `${textOf(card)} ${textOf(why)}`;
  assert.ok((words.match(/eceptionist/g) || []).length <= 1, `the receptionist is named once at most: ${words}`);
  assert.ok(!words.includes("Escalated"), `the state is the pill's word, not said again in the sentence: ${words}`);
});

test("a viewer reads the role once, at the top of the rail -- it was said under every locked control", async () => {
  globalThis.window.__ME = { role: "viewer" };
  try {
    const vm = toPersonVM(detail(), ZONE, new Date(NOW));
    const tree = (await profile(vm))();
    assert.ok(byTestId(tree, "person-role-note"), "the note");
    const words = textOf(tree);
    assert.equal(
      (words.match(/owner or operator/g) || []).length,
      1,
      `once: ${words.match(/[^.]*owner or operator[^.]*\./g)}`,
    );
    assert.equal(
      all(tree, (n) => n.props?.className?.includes("cl-prof-aut-seg") && !n.props.disabled).length,
      0,
      "and every segment is locked",
    );
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
  assert.ok(
    !String(yes.props.className).includes("active") && yes.props["aria-pressed"] === false,
    "not asked yet: Yes is not the record",
  );
  press(yes);
  tree = draw();
  const armed = find(byTestId(tree, "consent-marketing"), (n) => n.type === "button" && textOf(n).trim() === "Yes");
  assert.ok(String(armed.props.className).includes("armed"), "armed");
  assert.ok(
    !String(armed.props.className).includes("active"),
    "REGRESSION: an armed pick was drawn as the answer on record before anything was written",
  );
  assert.equal(armed.props["aria-pressed"], false, "and the record, for a reader, is unchanged");
  const how = byTestId(tree, "consent-marketing-how");
  assert.deepEqual(
    all(how, (n) => n.props?.className === "cl-prof-how-chip").map((n) => textOf(n).trim()),
    ["Sign-up form", "Their own message"],
    "the written ways, as chips",
  );
  assert.equal(
    find(tree, (n) => n.props?.className === "cl-prof-autonomy" && byTestId(n, "consent-marketing-how")),
    null,
    "REGRESSION: the how sat as a fourth cell in the three-button grid",
  );
});

test("a frame with nobody to draw has no rail column; their calls are a figure; ten seconds on the phone is not one minute", async () => {
  // Nobody at this id: the wire says they are not in the workspace.
  await newTree();
  const frame = () => pageFor("p-none");
  frame();
  await settle();
  const missing = frame();
  assert.ok(
    String(find(missing, (n) => String(n.props?.className || "").includes("cl-profile")).props.className).includes(
      "cl-profile--solo",
    ),
    "REGRESSION: an empty 320px column beside 'This person is not in your workspace'",
  );
  assert.equal(all(missing, (n) => n.type === "button").length, 1, "one way back, not two");

  const vm = toPersonVM(detail({ row: row({ visits: VISITS, call_count: 1, call_seconds: 12 }) }), ZONE, new Date(NOW));
  const tree = (await profile(vm))();
  // Their calls are a figure at the top of the work (canvas A), with how long they ran: no About card says them again.
  const calls = find(tree, (n) => n.props?.["data-figure"] === "calls");
  assert.ok(calls, "the calls figure");
  assert.match(textOf(calls), /12 s/, textOf(calls));
});

test("each smart list on a profile says why it has them, in its rule's words (decision 0009)", async () => {
  const vm = toPersonVM(detail({ row: row({ visits: VISITS }) }), ZONE, new Date(NOW));
  assert.ok(vm.smartLists.length > 0, "the fixture is on one of People's lists");
  for (const l of vm.smartLists) assert.ok(typeof l.why === "string" && l.why.length > 0, `${l.label} says why`);
  // The workspace's own smart list, read as People reads it: a rule that holds for them (they reach the business by
  // WhatsApp), and the words the rule says it in are what the chip says it has them for.
  const saved = surfaceValue("people");
  await peoplePage(
    [row({ visits: VISITS })],
    [
      {
        id: "s2",
        name: "Texters",
        ids: [],
        rule: { all: [{ field: "channel", op: "is", channel: "whatsapp" }] },
      },
    ],
  );
  try {
    const tree = (await profile(vm))();
    const smart = all(tree, (n) => n.props?.["data-testid"] === "person-smart-chip");
    assert.ok(smart.length > 0);
    // A chip's name is a door to its list on People (a link: the kit's chip link), its rule's words its tip.
    for (const chip of smart) assert.match(find(chip, (n) => n.type === "a").props["data-tip"], /^Because: /);
    assert.equal(byTestId(tree, "person-list-open").props["data-tip"], "Because: Reaches you by WhatsApp");
  } finally {
    setSurfaceValue("people", saved);
  }
});

test("a profile opened before People is read says it is reading their lists -- it said there were none (decision 0009)", async () => {
  const vm = toPersonVM(detail({ row: row({ visits: VISITS }) }), ZONE, new Date(NOW));
  const saved = surfaceValue("people");
  // As the shell draws it in a real workspace, before People is read.
  setSurfaceValue("people", undefined);
  try {
    const draw = await profile(vm);
    const lists = byTestId(draw(), "person-lists");
    assert.ok(byTestId(lists, "person-lists-reading"), "Reading…, until People lands");
    assert.doesNotMatch(textOf(lists), /No lists/, "REGRESSION: a cold load said there were no lists");
    // And a read that failed says so, rather than reading for ever.
    setStatus("people", "seeded");
    const failed = byTestId(draw(), "person-lists");
    assert.ok(byTestId(failed, "person-lists-failed"));
    assert.equal(byTestId(failed, "person-lists-reading"), null);
  } finally {
    setStatus("people", "live");
    setSurfaceValue("people", saved);
  }
});

test("a person known by number is invited to name them; an empty Lists section is a door to Lists", async () => {
  const vm = toPersonVM(
    detail({ row: row({ visits: VISITS, display_name: null, wa_profile_name: null }) }),
    ZONE,
    new Date(NOW),
  );
  assert.equal(vm.givenName, null);
  const saved = surfaceValue("people");
  setSurfaceValue("people", { ...(saved || {}), saved: [], savedRead: true });
  try {
    const tree = (await profile(vm))();
    const rename = byTestId(tree, "person-rename");
    assert.equal(
      textOf(rename).trim(),
      "Name them",
      "REGRESSION: a pencil at opacity 0 until hover, which a phone never has",
    );
    assert.ok(String(rename.props.className).includes("is-plain"));
    const lists = byTestId(tree, "person-lists");
    // Smart lists hold for them (Booked), so what is missing is a list of the workspace's own: never "kept by hand",
    // which said nothing of a list with a rule.
    assert.match(textOf(lists), /No lists of your own yet\./);
    went.length = 0;
    press(byTestId(lists, "person-lists-make"));
    assert.deepEqual(
      went,
      ["clients/new-list"],
      "REGRESSION: 'make one on the People rail' -- a rail a phone does not have; the door says in the address that the box opens, never a timer",
    );
  } finally {
    setSurfaceValue("people", saved);
  }
});

/* ----------------------------------- the address (00125) ----------------------------------- */

/** What the wire answers for a write, as the door does: accepted, or refused with its code and words. */
const answerOf = (answer) =>
  answer.ok ? okBody(answer.data) : refused(answer.code === "conflict" ? 409 : 422, answer.message, answer.code);
/** A profile drawn over a wire whose save of the person's details records what it is sent and answers as told. */
const profileSaving = async (vm, answer = { ok: true, data: {} }) => {
  const sent = [];
  const door = `PUT /api/v1/contacts/${vm.id}/details`;
  world.answers[door] = (body) => {
    sent.push([vm.id, body]);
    return answerOf(answer);
  };
  const draw = await profile(vm);
  return { draw, sent, restore: () => delete world.answers[door] };
};
const type = (input, value) => input.props.onChange({ target: { value } });

test("a person's email address is said once, in Reach them, and added there: the row is its own control, and what is wrong with a typed address is said under the field before anything is sent", async () => {
  const vm = toPersonVM(detail({ row: row({ visits: VISITS, email: null }) }), ZONE, new Date(NOW));
  assert.equal(vm.email, null);
  const { draw, sent, restore } = await profileSaving(vm);
  try {
    let tree = draw();
    // Reach them holds the address (canvas A): someone who may change it gets the row while it is empty.
    const reach = find(tree, (n) => n.props?.["data-testid"] === "person-reach");
    assert.ok(reach, "Reach them");
    const add = byTestId(reach, "person-email-edit");
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
    assert.match(
      textOf(byTestId(tree, "person-email-problem")),
      /missing the @/,
      "which kind of not-an-address, under the field",
    );
    assert.deepEqual(sent, [], "and nothing went over the wire");
    type(byTestId(tree, "person-email-input"), "  Ana@Example.com ");
    tree = draw();
    assert.equal(byTestId(tree, "person-email-problem"), null, "typing clears what was said about the last attempt");
    press(byTestId(tree, "person-email-save"));
    await settle();
    assert.deepEqual(
      sent,
      [["p1", { email: "Ana@Example.com" }]],
      "the typed address, trimmed; the route and the door decide its stored spelling",
    );
  } finally {
    restore();
  }
});

test("an address that is there shows with a quiet pencil; the door's refusal is said under the field, in its own words; someone who may only read sees the address and no control, or no row at all", async () => {
  const vm = toPersonVM(detail({ row: row({ visits: VISITS, email: "ana@example.com" }) }), ZONE, new Date(NOW));
  assert.equal(vm.email, "ana@example.com");
  assert.ok(
    vm.about.some((a) => a.k === "Email" && a.v === "ana@example.com"),
    "About carries it from the contract",
  );
  const taken = "Another person here already has that address.";
  const { draw, sent, restore } = await profileSaving(vm, { ok: false, code: "conflict", message: taken });
  try {
    let tree = draw();
    assert.equal(textOf(find(tree, (n) => n.props?.className === "cl-prof-email-val")), "ana@example.com");
    const edit = byTestId(tree, "person-email-edit");
    assert.equal(textOf(edit).trim(), "", "a pencil, not an invitation");
    press(edit);
    tree = draw();
    assert.equal(
      byTestId(tree, "person-email-input").props.value,
      "ana@example.com",
      "the field opens on what is stored",
    );
    type(byTestId(tree, "person-email-input"), "bo@example.com");
    tree = draw();
    press(byTestId(tree, "person-email-save"));
    await settle();
    tree = draw();
    assert.deepEqual(sent, [["p1", { email: "bo@example.com" }]]);
    assert.equal(textOf(byTestId(tree, "person-email-problem")), taken);
    assert.ok(byTestId(tree, "person-email-input"), "and the field stays open on what was typed");
  } finally {
    restore();
  }

  const me = globalThis.window.__ME;
  globalThis.window.__ME = { role: "viewer" };
  try {
    const withOne = (await profile(vm))();
    assert.equal(textOf(byTestId(withOne, "person-email")), "ana@example.com");
    assert.equal(byTestId(withOne, "person-email-edit"), null, "a viewer reads it");
    const without = (
      await profile(toPersonVM(detail({ row: row({ visits: VISITS, email: null }) }), ZONE, new Date(NOW)))
    )();
    assert.equal(byTestId(without, "person-email"), null, "and with no address there is no empty row to read");
  } finally {
    globalThis.window.__ME = me;
  }
});

test("a person with an address and no number or name is called by the address everywhere, is invited to be named, and their thread's line says the address instead of 'no phone'", async () => {
  const dto = row({
    display_name: null,
    wa_profile_name: null,
    phone_e164: null,
    email: "ana@example.com",
    channels: [],
    has_chat: false,
    conversation_count: 0,
    escalation_count: 0,
    needs_human: false,
    open_escalation_reason: null,
    latest_conversation_id: null,
    last_inbound_text: null,
    last_message_at: null,
  });
  const vm = toPersonRowVM(dto, ZONE, new Date(NOW));
  assert.equal(vm.name, "ana@example.com", "REGRESSION: 'Unknown' for a person whose only identifier is an address");
  assert.equal(vm.phone, null);
  assert.equal(
    contracts.personName({ display_name: null, wa_profile_name: null, phone_e164: null }),
    "Unknown",
    "a person with nothing is still nobody",
  );
  assert.equal(contracts.isIdentifierName("ana@example.com"), true);
  assert.equal(contracts.isIdentifierName("+1 (786) 555-0181"), true);
  assert.equal(contracts.isIdentifierName("Ana Reyes"), false);

  const draw = await peoplePage([dto]);
  const tr = find(draw(), (n) => n.type === "tr" && n.props?.id === "person-p1");
  assert.ok(byTestId(tr, "row-name-them"), "named by an identifier: the row invites a name");
  assert.equal(
    find(tr, (n) => n.type === KitIcon && n.props?.name === "mail") !== null,
    true,
    "an envelope, not a handset",
  );

  const conv = {
    contact: { id: "p1", display_name: null, wa_profile_name: null, phone_e164: null, email: "ana@example.com" },
  };
  assert.equal(contracts.contactName(conv), "ana@example.com");
  assert.equal(
    contracts.contactMeta(conv),
    "WhatsApp · no name saved",
    "the identifier IS the name, so the line says that instead of repeating it",
  );
  assert.equal(
    contracts.contactMeta({ contact: { ...conv.contact, display_name: "Ana Reyes" } }),
    "WhatsApp · ana@example.com",
    "REGRESSION: 'no phone' under a person who has an address",
  );
  assert.equal(
    contracts.contactMeta({ contact: { ...conv.contact, display_name: "Ana Reyes", email: null } }),
    "WhatsApp · no phone",
  );
});

/* ------------------------------- their own message (00137) ------------------------------- */

/** A profile whose two consent doors record what they are sent and answer yes, in a real workspace whichever test ran first. */
const profileRecording = async (vm) => {
  if (!surfaceValue("people")) setSurfaceValue("people", { saved: [], savedRead: true });
  const sent = [];
  const doors = {
    visit: `PUT /api/v1/contacts/${vm.id}/consent`,
    offers: `PUT /api/v1/contacts/${vm.id}/marketing-consent`,
  };
  for (const [ask, door] of Object.entries(doors))
    world.answers[door] = (body) => {
      sent.push([ask, vm.id, body]);
      return okBody();
    };
  const draw = await profile(vm);
  return { draw, sent, restore: () => Object.values(doors).forEach((door) => delete world.answers[door]) };
};
const said = (id, hoursAgo, body, over = {}) => ({
  id,
  conversation_id: "cv1",
  direction: "inbound",
  sender: "customer",
  channel: "whatsapp",
  type: "text",
  body,
  media: null,
  meta: null,
  status: "received",
  created_at: iso(hoursAgo * H),
  ...over,
});
const reply = (id, hoursAgo, body) => said(id, hoursAgo, body, { direction: "outbound", sender: "ai", status: "sent" });
const withMessages = (messages) => {
  const d = detail();
  return toPersonVM({ ...d, conversations: [{ ...d.conversations[0], messages }] }, ZONE, new Date(NOW));
};
const segment = (tree, ask, word) => find(byTestId(tree, ask), (n) => n.type === "button" && textOf(n).trim() === word);
const way = (tree, ask, word) =>
  find(byTestId(tree, `${ask}-how`), (n) => n.type === "button" && textOf(n).trim() === word);
/** Press a choice of the kit's toggle group by its words (the notes composer's For and day). */
const chooseIn = (tree, group, word) =>
  press(find(byTestId(tree, group), (n) => n.props?.role === "radio" && textOf(n).trim() === word));

test("their own message is chosen from what they wrote: the way opens their recent messages, and the one pressed is the one recorded", async () => {
  const vm = withMessages([
    said("m1", 5, "Can I move Saturday to 11?"),
    reply("m2", 4, "Sure, 11 works."),
    said("m3", 1, "And yes, send me your offers", { channel: "sms" }),
  ]);
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
    assert.deepEqual(
      vm.ownMessages.map((m) => m.id),
      ["m3", "m1"],
      "what they wrote, newest first; not the reply",
    );
    assert.equal(choices.length, 2);
    vm.ownMessages.forEach((m, i) => {
      for (const part of [m.words, m.via, m.when])
        assert.ok(textOf(choices[i]).includes(part), `choice ${i} says ${part}: ${textOf(choices[i])}`);
      assert.equal(choices[i].type, "button", "a choice is pressed, not read");
    });
    press(choices[0]);
    await settle();
    assert.deepEqual(
      sent,
      [["offers", "p1", { consent: "opted_in", source: "customer_message", message_id: "m3" }]],
      "the message pressed is the message named",
    );
    assert.equal(byTestId(draw(), "consent-marketing-how"), null, "the ask closes once it lands");
  } finally {
    restore();
  }
});

test("a person opened from a People view steps to the one before and after (‹ 2 of 3 ›), the address replaced so Back still leaves the list, at every width: never for one opened from anywhere else (0052)", async () => {
  const { tabMemoryFor } = await importSrc("apps/dashboard/src/legacy-bridge/tab-memory.ts");
  const { keepWalk, leaveWalk, takeStep } = await importSrc("apps/dashboard/src/surfaces/people/walk.ts");
  const keep = {
    memory: globalThis.window.__tabMemory,
    nav: globalThis.window.CHANLY.nav,
    mq: globalThis.window.matchMedia,
  };
  const steps = [];
  globalThis.window.__tabMemory = tabMemoryFor(globalThis.window);
  globalThis.window.CHANLY.nav = (to, opts) => steps.push([to, opts]);
  try {
    const vm = toPersonVM(detail(), ZONE, new Date(NOW));
    // The list on screen as they are opened (its clean-up comes after the page is drawn).
    keepWalk("all", ["p-before", vm.id, "p-after"]);
    let draw = await profile(vm);
    let tree = draw();
    // The walk stands with "‹ People" where the date stands (the standing's `back.after`, canvas A): the frame draws it,
    // so it is drawn here from what the page said.
    const walkOf = () => {
      const after = standingSaid()?.back?.after;
      return after ? after.type(after.props) : null;
    };
    const walk = walkOf();
    assert.equal(textOf(walk).replace(/\s+/g, ""), "2of3");
    press(byTestId(walk, "person-walk-next"));
    assert.deepEqual(steps.at(-1), ["clients/p-after", { replace: true }], "the next person, the address replaced");
    assert.equal(takeStep("p-after"), "next", "and the page it lands on turns from the side it went");
    press(byTestId(walk, "person-walk-prev"));
    assert.deepEqual(steps.at(-1), ["clients/p-before", { replace: true }]);
    assert.equal(takeStep("p-before"), "prev");
    assert.equal(takeStep("p-before"), undefined, "taken once: a person opened any other way arrives unturned");
    assert.equal(byTestId(tree, "person-walk"), null, "the page itself draws no walk");
    // A person the view does not hold has no steps.
    keepWalk("all", ["p-before", "p-after"]);
    draw = await profile(vm);
    draw();
    assert.equal(walkOf(), null);
    // REGRESSION (13 Oct 2026): the list gone, a person opened from the Inbox or a link said the last list's "2 of 3".
    keepWalk("all", ["p-before", "p-other", "p-after"]);
    leaveWalk();
    draw = await profile(vm);
    draw();
    assert.equal(walkOf(), null, "REGRESSION: a person not opened from the list stood in it");
    // On a phone the same steps stand in the bell's place (components.css), and More holds none.
    keepWalk("all", ["p-before", vm.id, "p-after"]);
    globalThis.window.matchMedia = () => ({ matches: true, addEventListener() {}, removeEventListener() {} });
    draw = await profile(vm);
    tree = draw();
    assert.equal(textOf(walkOf()).replace(/\s+/g, ""), "2of3");
    const more = find(byTestId(tree, "person-acts"), (n) => n.type === Menu);
    const labels = more.props.groups.flatMap((g) => g.items.map((i) => i.label));
    assert.ok(!labels.includes("Next person") && !labels.includes("Previous person"), "More holds no steps");
    // The people either side are read ahead (useWalk): let those reads land here, not in the next test's count.
    await settle();
  } finally {
    globalThis.window.__tabMemory = keep.memory;
    globalThis.window.CHANLY.nav = keep.nav;
    globalThis.window.matchMedia = keep.mq;
  }
});

test("a person a lead names, or who works at one, has a Yes no member may press: disabled, with the doors' own sentence as its caption (0052)", async () => {
  const unasked = { consent: "unknown", consent_source: null, consent_updated_at: null };
  const atBusiness = toPersonVM(
    detail({
      row: row({ visits: VISITS, ...unasked, lead_id: "l1", lead_name: "Bloom & Vow Bridal", name_source: "typed" }),
    }),
    ZONE,
    new Date(NOW),
  );
  const theLeads = toPersonVM(
    detail({
      row: row({ visits: VISITS, ...unasked }),
      lead: { id: "l1", business_name: "Bloom & Vow Bridal", found_at: iso(9 * D), reach_out: null },
    }),
    ZONE,
    new Date(NOW),
  );
  assert.equal(atBusiness.yesLocked, contracts.LEAD_CONSENT_REFUSAL, "someone who works at a lead");
  assert.equal(theLeads.yesLocked, contracts.LEAD_CONSENT_REFUSAL, "the person a lead was found as");
  assert.equal(toPersonVM(detail(), ZONE, new Date(NOW)).yesLocked, null, "anyone else");
  const { draw, restore } = await profileRecording(atBusiness);
  try {
    const tree = draw();
    const yes = segment(tree, "consent-control", "Yes");
    assert.equal(yes.props.disabled, true, "the doors refuse it: the page does not offer it");
    assert.equal(yes.props["aria-describedby"], "consent-control-yes-locked", "its caption says why");
    assert.equal(textOf(byTestId(tree, "consent-control-yes-locked")), contracts.LEAD_CONSENT_REFUSAL);
    assert.equal(segment(tree, "consent-control", "No").props.disabled, false, "a no is recorded however it is said");
  } finally {
    restore();
  }
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
    assert.equal(
      all(tree, (n) => n.props?.["data-testid"] === "consent-control-message").length,
      0,
      "the messages give way to it",
    );
    assert.deepEqual(sent, [], "and nothing was recorded on the way");
  } finally {
    restore();
  }
});

test("a person who has written nothing here is offered no message, and is told the way that remains", async () => {
  const vm = withMessages([
    reply("m2", 4, "Sure, 11 works."),
    said("m4", 3, null, { type: "media", media: { mime_type: "image/jpeg" } }),
  ]);
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
  } finally {
    restore();
  }
});

test("a sign-up form is recorded with the note that attests it: nothing is sent until the note says which form, or where", async () => {
  const { draw, sent, restore } = await profileRecording(withMessages([said("m1", 2, "Hi there")]));
  try {
    let tree = draw();
    press(segment(tree, "consent-marketing", "Yes"));
    tree = draw();
    press(way(tree, "consent-marketing", "Sign-up form"));
    tree = draw();
    assert.deepEqual(
      sent,
      [],
      "REGRESSION: a form was recorded the moment its chip was pressed, with nothing to say which",
    );
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
    assert.deepEqual(sent, [
      ["offers", "p1", { consent: "opted_in", source: "form", note: "Slip 12, signed at the desk" }],
    ]);

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
  } finally {
    restore();
  }
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
  } finally {
    restore();
  }
});

/* --------------------------- the person is the hub: runs, lists, the lead --------------------------- */

const LEAD = "0f0f0f0f-0f0f-4f0f-8f0f-0f0f0f0f0f0f";
/** One of ours, as a run or a person sent it: the meta the send job writes (core messages/broadcast.ts). */
const ours = (id, at, meta, sender = "human") => ({
  id,
  conversation_id: "cv1",
  direction: "outbound",
  sender,
  type: "text",
  body: `words of ${id}`,
  media: null,
  meta,
  status: "delivered",
  created_at: at,
});
const theirs = (id, at) => ({
  id,
  conversation_id: "cv1",
  direction: "inbound",
  sender: "customer",
  type: "text",
  body: `reply ${id}`,
  media: null,
  meta: null,
  status: "received",
  created_at: at,
});
const run = (over) => ({
  broadcast_id: over.broadcast_id,
  name: "Run",
  playbook_id: null,
  playbook_name: null,
  state: "sent",
  reason: null,
  sent_at: null,
  scheduled_for: null,
  message_id: null,
  // The channel the run picked for them; null on a run made before runs had channels, which went by WhatsApp.
  channel: null,
  ...over,
});
/** Five runs, newest first, as the route hands them: one answered, one not, one held, one refused, one on its way. */
const withRuns = () => {
  const d = detail();
  d.conversations[0].messages = [
    ours("mb-win", iso(10 * D), {
      source: "broadcast",
      broadcast_id: "b-win",
      broadcast_name: "Win-back · Sep 1",
      playbook_id: "pb1",
      playbook_name: "Win-back",
    }),
    theirs("mr-win", iso(10 * D - 5 * H)),
    ours("mb-spring", iso(20 * D), { source: "broadcast", broadcast_id: "b-spring", broadcast_name: "Spring offer" }),
    // Four days after the offer: past the reply window, so the offer was not what they answered.
    theirs("mr-late", iso(16 * D)),
    ours("m-team", iso(30 * D), null),
    ...d.conversations[0].messages,
  ];
  d.campaigns = [
    run({ broadcast_id: "b-queued", name: "Autumn offer", state: "queued", scheduled_for: ahead(D), channel: "email" }),
    run({
      broadcast_id: "b-win",
      name: "Win-back · Sep 1",
      playbook_id: "pb1",
      playbook_name: "Win-back",
      sent_at: iso(10 * D),
      message_id: "mb-win",
      channel: "whatsapp",
    }),
    run({ broadcast_id: "b-spring", name: "Spring offer", sent_at: iso(20 * D), message_id: "mb-spring" }),
    run({
      broadcast_id: "b-held",
      name: "Summer offer",
      state: "skipped",
      reason: "no_marketing_consent",
      scheduled_for: iso(40 * D),
      channel: "sms",
    }),
    run({
      broadcast_id: "b-refused",
      name: "May offer",
      state: "failed",
      reason: "send_failed",
      scheduled_for: iso(50 * D),
    }),
  ];
  return d;
};

test("a person's page names the runs that reached them and what came of each -- it said nothing of what a playbook or a broadcast had sent them", () => {
  const vm = toPersonVM(withRuns(), ZONE, new Date(NOW));
  assert.deepEqual(
    vm.campaigns.map((c) => [c.id, c.title, c.line, c.tone, c.to]),
    [
      // Each says the wire it went by, or would have: a person on three channels knows where to look.
      ["b-queued", "Autumn offer", "Broadcast · Email · Waiting to send", "plain", "broadcasts/run:b-queued"],
      ["b-win", "Win-back", "Campaign · WhatsApp · Replied", "ok", "broadcasts/run:b-win"],
      // A run made before runs had channels went by WhatsApp, and says so.
      ["b-spring", "Spring offer", "Broadcast · WhatsApp · Sent", "plain", "broadcasts/run:b-spring"],
      ["b-held", "Summer offer", "Broadcast · Text · Held — no yes to offers", "warn", "broadcasts/run:b-held"],
      // The refusal's own words stay the provider's, never WhatsApp's by default: the wire is said beside them.
      [
        "b-refused",
        "May offer",
        "Broadcast · WhatsApp · Didn't send — the provider refused it",
        "warn",
        "broadcasts/run:b-refused",
      ],
    ],
    "newest first; a reply inside the window is a reply, one four days later is not",
  );
  assert.ok(
    vm.campaigns.every((c) => c.when && c.when !== "—"),
    "each is dated",
  );
});

test("a run's row on a person's page says Replied only for their own words: not a call's note, not their mailbox answering for them", () => {
  const d = withRuns();
  const [reply] = d.conversations[0].messages.filter((m) => m.id === "mr-win");
  const outcomeOf = (over) => {
    Object.assign(reply, { sender: "customer", type: "text", meta: null, ...over });
    return toPersonVM(d, ZONE, new Date(NOW)).campaigns.find((c) => c.id === "b-win").outcome;
  };
  assert.equal(outcomeOf({}), "Replied");
  assert.equal(outcomeOf({ sender: "system", type: "call_summary" }), "Sent", "a call's note is not a reply");
  assert.equal(outcomeOf({ meta: { email: { claim: "auto_reply" } } }), "Sent", "nor an out-of-office");
  assert.equal(outcomeOf({ meta: { email: { claim: "person" } } }), "Replied", "an email they wrote is");
});

test("REGRESSION: the timeline says who sent each of ours in the Inbox's words -- every one read 'You', a playbook's run among them", () => {
  const vm = toPersonVM(withRuns(), ZONE, new Date(NOW));
  const who = (id) => vm.timeline.find((i) => i.id === `m-${id}`)?.who;
  assert.equal(who("mb-win"), "The Win-back campaign");
  assert.equal(who("mb-spring"), "A broadcast (Spring offer)");
  assert.equal(who("m-team"), "Your team", "the row does not say which member sent it");
  assert.equal(who("m1"), "Daniela", "their own words are theirs");
  // A run's message that kept no meta is still the run's: its recipient row names it.
  const bare = withRuns();
  bare.conversations[0].messages = bare.conversations[0].messages.map((m) =>
    m.id === "mb-win" ? { ...m, meta: null } : m,
  );
  const again = toPersonVM(bare, ZONE, new Date(NOW));
  assert.equal(again.timeline.find((i) => i.id === "m-mb-win")?.who, "The Win-back campaign");
  // A playbook whose name has its own article keeps one, here and in the Inbox (messageAuthor).
  const offer = ours("mb-offer", iso(D), {
    source: "broadcast",
    broadcast_name: "x",
    playbook_name: "The month's offer",
  });
  assert.equal(
    contracts.messageAuthor(offer).words,
    "The month's offer campaign",
    "REGRESSION: the The month's offer campaign",
  );
});

test("a person's page names the lists that keep themselves current and have them on, by the rail's own tests -- and not the ones it already says", () => {
  // Booked this week is Monday to Sunday by the workspace clock, and the fixture books two days ahead of the real
  // one: run on a Saturday or a Sunday, the booking fell into next week and this failed (CI, 26 Sep 2026). So this
  // one reads at noon on the most recent Wednesday, with the booking two days on from THAT; the rest of the file
  // keeps the real clock, which the drawn pages read for themselves.
  const wed = new Date(NOW);
  wed.setUTCDate(wed.getUTCDate() - ((wed.getUTCDay() + 4) % 7));
  wed.setUTCHours(16, 0, 0, 0);
  const midweek = {
    ...NEXT,
    start: new Date(wed.getTime() + 2 * D).toISOString(),
    end: new Date(wed.getTime() + 2 * D + 2 * H).toISOString(),
  };
  const booked = toPersonVM(detail({ visits: { ...VISITS, next: midweek } }), ZONE, wed);
  assert.deepEqual(
    booked.smartLists.map((l) => l.id),
    ["booked_week", "booked"],
    "booked this week and booked; not Needs you, which Right now says, nor their yes, which the consent rows say",
  );
  const noCalendar = toPersonVM(detail({ row: row(), visits: undefined }), ZONE, new Date(NOW));
  assert.deepEqual(noCalendar.smartLists, [], "a calendar's lists only with a calendar");
});

test("a person found as a lead says so, with the way back to the lead -- About said they were added by hand", async () => {
  const d = detail({
    lead: { id: LEAD, business_name: "Glow Studio", found_at: iso(9 * D) },
    added: { at: iso(8 * D), source: "lead", title: null },
  });
  const vm = toPersonVM(d, ZONE, new Date(NOW));
  const added = vm.about.find((a) => a.k === "Added");
  assert.ok(added && added.v.endsWith("from a lead you found"), `REGRESSION: ${added && added.v}`);
  assert.deepEqual(vm.lead && [vm.lead.name, vm.lead.to], ["Glow Studio", `clients/leads:p-${LEAD}`]);
  const noEvent = toPersonVM(
    detail({ lead: { id: LEAD, business_name: "Glow Studio", found_at: iso(9 * D) } }),
    ZONE,
    new Date(NOW),
  );
  assert.ok(
    noEvent.about.some((a) => a.k === "Added" && a.v.endsWith("from a lead you found")),
    "found as a lead, with no row saying when they were added: the lead's day says it",
  );
  const draw = await profile(vm);
  const door = byTestId(draw(), "fact-lead");
  assert.ok(door, "the Added row is a door to the lead");
  press(door);
  assert.deepEqual(went, [`clients/leads:p-${LEAD}`]);
});

test("a person a reach-out found reads its emails, how their reply was read, where they were found, and where they stand (Part 6, H11)", () => {
  const out = {
    id: "m-out",
    conversation_id: "cv1",
    direction: "outbound",
    sender: "human",
    type: "text",
    body: "Saw your studio on the map.",
    media: null,
    meta: { source: "reach_out" },
    status: "delivered",
    created_at: iso(5 * D),
  };
  const base = detail();
  const d = {
    ...base,
    conversations: [{ ...base.conversations[0], messages: [out, ...base.conversations[0].messages] }],
    lead: {
      id: LEAD,
      business_name: "Glow Studio",
      found_at: iso(9 * D),
      reach_out: {
        lead_id: LEAD,
        business_name: "Glow Studio",
        stage: "converted",
        closed_reason: null,
        found_at: iso(9 * D),
        email_state: "ok",
        resume_at: null,
        booked_at: null,
        stopped_at: null,
        chain: { root_id: "r1", name: "Salons in Miami", state: "running" },
        search: { id: "s1", name: "Salons · Miami", asked: "salons in Miami", fit: "strong" },
        conversation_id: "cv1",
        sends: [
          {
            id: "s1",
            n: 0,
            hand: null,
            state: "sent",
            reason: null,
            send_at: iso(5 * D),
            sent_at: iso(5 * D),
            angle: "their reviews",
            host: "mail.example.com",
            message_id: "m-out",
            email_status: "delivered",
            bounced: false,
            left: true,
          },
        ],
        readings: [
          {
            message_id: "m1",
            read_at: iso(3 * H),
            intent: "question",
            claim: "person",
            summary: "Asks about Saturday",
            undone: false,
            until_at: null,
            stops: true,
            convert: true,
            said_no: false,
            can_undo: false,
          },
        ],
        can_stop: false,
      },
    },
  };
  const vm = toPersonVM(d, ZONE, new Date(NOW));
  const email = vm.timeline.find((t) => t.id === "m-m-out");
  assert.deepEqual(
    [email.who, email.sub],
    ["Reach out · Salons in Miami", "Your email · angle: their reviews · from mail.example.com · delivered"],
  );
  const reply = vm.timeline.find((t) => t.id === "m-m1");
  assert.equal(reply.sub, "Read as a question · the chain stopped · Talking");
  const found = vm.timeline.find((t) => t.id === "found");
  assert.deepEqual(
    [found.who, found.text, found.link && found.link.to],
    ["Leads", "Found on Google Maps by “salons in Miami” · strong fit · address checked", `clients/leads:p-${LEAD}`],
  );
  const about = vm.about.find((a) => a.k === "Reach out");
  assert.ok(about && about.v.startsWith("Salons in Miami · Talking · wrote back"), about && about.v);
  // A lead with no reach-out, or one whose story could not be read, adds none of it.
  const plain = toPersonVM(
    detail({ lead: { id: LEAD, business_name: "Glow Studio", found_at: iso(9 * D), reach_out: null } }),
    ZONE,
    new Date(NOW),
  );
  assert.equal(
    plain.timeline.find((t) => t.id === "found"),
    undefined,
  );
  assert.equal(
    plain.about.find((a) => a.k === "Reach out"),
    undefined,
  );
});

test("the profile's Campaigns rows open each run's report, and its Lists name the lists that keep themselves current, each opening on People", async () => {
  const vm = toPersonVM(withRuns(), ZONE, new Date(NOW));
  // On a desk Campaigns is its own tab (0052, 13).
  const draw = await profile(vm, "campaigns");
  const rows = all(draw(), (n) => n.props?.["data-testid"] === "person-campaign");
  assert.equal(rows.length, 5);
  assert.ok(
    textOf(rows[1]).includes("Win-back") && textOf(rows[1]).includes("Campaign · WhatsApp · Replied"),
    textOf(rows[1]),
  );
  press(rows[1]);
  assert.deepEqual(went, ["broadcasts/run:b-win"]);
  const quiet = await profile(toPersonVM(detail(), ZONE, new Date(NOW)), "campaigns");
  assert.equal(
    byTestId(quiet(), "person-campaigns"),
    null,
    "no runs, no section (and no tab: the Overview it falls to)",
  );

  await peoplePage([row()], [{ id: "s1", name: "Regulars", ids: ["p1"] }]);
  cells = [];
  frames.begin();
  const lists = PersonLists({
    personId: "p1",
    canEdit: true,
    first: "Daniela",
    flash: () => {},
    smart: [{ id: "booked", label: "Booked" }],
  });
  const chip = byTestId(lists, "person-smart-chip");
  assert.ok(chip && textOf(chip).includes("Booked"));
  // The chip's name is a door: a link to the list on People (the kit's chip link).
  press(find(chip, (n) => n.type === "a"));
  assert.deepEqual(went, ["clients/seg:booked"]);
});

test("clients/new-list opens People with the New list box open from the first draw -- the door fired segments:new on a 450ms timer and hoped", async () => {
  await peoplePage([row()], []);
  cells = [];
  frames.begin();
  PeopleReal({ onOpenProfile: () => {}, newList: true });
  frames.begin();
  const tree = PeopleReal({ onOpenProfile: () => {}, newList: true });
  assert.ok(byTestId(tree, "new-list-name"), "the box, open, waiting for a name");
});

/* ------------------------------ lists that keep themselves current (00155) ------------------------------ */

const SMART = {
  id: "s2",
  name: "WhatsApp people",
  ids: [],
  rule: { all: [{ field: "channel", op: "is", channel: "whatsapp" }] },
};

test("a smart list rides the rail with who its rule holds for, and says its rule; a profile shows it and never offers to put someone on it or take them off", async () => {
  const draw = await peoplePage([row()], [{ id: "s1", name: "Regulars", ids: [] }, SMART]);
  const tree = draw();
  const smartRow = byTestId(tree, "saved-smart");
  assert.ok(smartRow, "the smart list is on the rail, marked");
  assert.ok(textOf(smartRow).includes("WhatsApp people") && textOf(smartRow).includes("1"), textOf(smartRow));
  assert.equal(smartRow.props["data-tip"], "Keeps itself current: Reaches you by WhatsApp");
  const saved = globalThis.window.__PEOPLE.saved.find((s) => s.id === "s2");
  assert.deepEqual(
    [saved.ids, saved.rule],
    [["p1"], ["Reaches you by WhatsApp"]],
    "who its rule holds for, and its rule as chips",
  );

  cells = [];
  frames.begin();
  const lists = PersonLists({ personId: "p1", canEdit: true, first: "Daniela", flash: () => {} });
  const chips = all(lists, (n) => n.props?.["data-testid"] === "person-list-chip");
  assert.deepEqual(chips.map(textOf), ["WhatsApp people"], "on the smart list today");
  assert.equal(
    find(chips[0], (n) => String(n.props?.className ?? "").includes("cl-seg-filter-x")),
    null,
    "no cross on a rule",
  );
  const menu = find(lists, (n) => n.type === Menu);
  assert.deepEqual(
    itemsIn(menu).map((i) => i.label),
    ["Regulars"],
    "Add to offers only the lists kept by hand",
  );
});

test("a new list may be described: the assistant drafts a rule, the box shows its chips, who it holds for and what it left out, and Save makes the smart list", async () => {
  // The lists' verbs are the module's own (people-lists.ts), so the draft goes over the wire it would go over, and who the
  // rule holds for is counted by the real rule over the people the page has read: three of these four were last here
  // more than sixty days ago, on a calendar that reads.
  const lastHere = (i, daysAgo) =>
    row({
      id: `d${i}`,
      display_name: `Drifter ${i}`,
      phone_e164: `+1786555${2000 + i}`,
      visits: {
        ...VISITS,
        next: null,
        last: { ...NEXT, id: `d${i}:1`, start: iso(daysAgo * D), end: iso(daysAgo * D - 2 * H) },
      },
    });
  await peoplePage([lastHere(1, 90), lastHere(2, 75), lastHere(3, 61), lastHere(4, 10)]);
  const rule = { all: [{ field: "last_visit", op: "more_than", days: 60 }] };
  const drafted = [];
  const people = globalThis.window.fetch;
  globalThis.window.fetch = async (url, init = {}) => {
    const u = new URL(String(url), "https://app.chanlytics.com");
    if (u.pathname !== "/api/v1/segments/draft") return people(url, init);
    drafted.push([init.method, JSON.parse(init.body)]);
    return json(200, { ok: true, data: { name: "Drifting", rule, cannot: "who their stylist is" } });
  };
  const made = [];
  cells = [];
  const onCreate = async (name, made_rule) => {
    made.push([name, made_rule]);
    return { ok: true };
  };
  const draw = () => {
    frames.begin();
    return NewListRow({ onCreate });
  };
  press(byTestId(draw(), "new-list"));
  press(byTestId(draw(), "new-list-smart"));
  byTestId(draw(), "new-list-words").props.onChange({ target: { value: "regulars who stopped coming" } });
  await press(byTestId(draw(), "new-list-build"));
  await settle();
  const tree = draw();
  assert.deepEqual(drafted, [["POST", { words: "regulars who stopped coming" }]]);
  assert.deepEqual(all(tree, (n) => n.props?.["data-testid"] === "new-list-rule").map(textOf), [
    "Last visit more than 60 days ago",
  ]);
  assert.equal(textOf(byTestId(tree, "new-list-holds")), "3 people on it today, and it keeps itself current.");
  assert.equal(textOf(byTestId(tree, "new-list-cannot")), "Left out: who their stylist is");
  assert.equal(byTestId(tree, "new-list-name").props.value, "Drifting", "the draft's name, to change or keep");
  await press(byTestId(tree, "new-list-add"));
  assert.deepEqual(made, [["Drifting", rule]]);
});

test("REGRESSION: a reply counting down to send waits on you on People as in the Inbox -- the rule lived in inbox.jsx, and People counted that person as waiting on nobody", () => {
  const { replyWaitsOnYou } = contracts;
  assert.equal(replyWaitsOnYou({ endsAtMs: NOW + 20_000 }, NOW), true, "the Inbox: counting down");
  assert.equal(replyWaitsOnYou({ endsAtMs: NOW - 1 }, NOW), false, "sent: it is in your name now");
  assert.equal(replyWaitsOnYou({ endsAtMs: NOW + 20_000, held: true }, NOW), false, "held in this tab: stopped");
  assert.equal(replyWaitsOnYou({ queued: true }, NOW), true, "People: queued is exactly while it can be stopped");
  assert.equal(replyWaitsOnYou({}, NOW), false);
  const quiet = { needs_human: false, open_escalation_reason: null, open_escalation_since: null };
  const queued = toPersonRowVM(row({ ...quiet, queued_reply_at: iso(10_000) }), ZONE, new Date(NOW));
  assert.equal(queued.state, "needs_you", "REGRESSION: 'active' while the Inbox counted them in Needs you");
  assert.equal(queued.stateDetail, "a reply is about to send — you can still stop it");
  assert.equal(
    toPersonRowVM(row(quiet), ZONE, new Date(NOW)).state === "needs_you",
    false,
    "nothing queued, nothing waiting",
  );
});

test("a proposal's send sits beside the booking link in More, 'again' once it went out, nothing to press for a viewer, for someone who said stop, or where customers book; and About no longer says the link, the deal does (0008)", async () => {
  const url = "https://docs.example.com/p/dani";
  // The send is a deal's (0008): the workspace here says some customers get a proposal first. The last case is one
  // whose customers book. With no deal at all, the link left on the person (00154) is theirs, until it retires.
  const outbound = (at, status) => ({
    id: `m-${status}`,
    conversation_id: "cv1",
    direction: "outbound",
    sender: "human",
    type: "text",
    body: contracts.proposalMessage(url),
    media: null,
    meta: null,
    status,
    channel: "whatsapp",
    created_at: at,
  });
  const aboutKeys = (t) => all(t, (n) => String(n.props?.className || "") === "cl-prof-attr-key").map((k) => textOf(k));
  const vm = toPersonVM(
    detail({ proposal_url: url, booking_link: "https://book.example/salon", deals_on: true }),
    ZONE,
    new Date(NOW),
  );
  let tree = (await profile(vm))();
  assert.equal(byTestId(tree, "person-proposal"), null, "REGRESSION: the link was an About row of its own");
  assert.ok(!aboutKeys(tree).includes("Proposal"), `About says it no more: ${aboutKeys(tree)}`);
  // The sends are the More menu's first items, in plain words, each saying what it does under it.
  const moreOf = (t) => find(t, (n) => n.type === Menu);
  const labels = (t) => (moreOf(t) ? itemsIn(moreOf(t)).map((i) => i.label) : []);
  const items = itemsIn(moreOf(tree));
  // More's first group reaches them (canvas A): Text them, the booking link, then the proposal (Call is the head's).
  assert.deepEqual(
    items.slice(0, 3).map((i) => i.label),
    ["Text them", "Send booking link", "Send proposal"],
    "the booking link, then the proposal",
  );
  const proposal = items.find((i) => i.label === "Send proposal");
  assert.ok(
    /^Opens their thread with it ready to send/.test(proposal.title),
    `what it does, on hover: ${proposal.title}`,
  );
  const send = { props: { onClick: proposal.onSelect } };

  // The press carries the contract's words into the thread's composer and opens the thread; nothing is sent.
  const carried = [];
  const putBack = carryingCompose(carried);
  try {
    went.length = 0;
    press(send);
    assert.deepEqual(went, [vm.openThread], "it opens the thread");
    assert.equal(carried.length, 1);
    assert.equal(carried[0][0], "chanlytics-compose");
    assert.deepEqual(JSON.parse(carried[0][1]), {
      threadId: vm.openThread.replace(/^inbox\//, ""),
      text: contracts.proposalMessage(url),
    });
  } finally {
    putBack();
  }

  // Once the address went out the label says so; a message still in its cancel window does not count.
  const d = detail({ proposal_url: url, deals_on: true });
  d.conversations[0].messages.push(outbound(iso(2 * H), "queued"));
  tree = (await profile(toPersonVM(d, ZONE, new Date(NOW))))();
  assert.ok(labels(tree).includes("Send proposal"));
  d.conversations[0].messages.push(outbound(iso(H), "sent"));
  tree = (await profile(toPersonVM(d, ZONE, new Date(NOW))))();
  assert.ok(labels(tree).includes("Send proposal again"), labels(tree).join(", "));

  // None on file: no send, and no row inviting one: a proposal is started from the Deal section.
  tree = (await profile(toPersonVM(detail({ deals_on: true }), ZONE, new Date(NOW))))();
  assert.equal(byTestId(tree, "person-proposal"), null);
  assert.ok(!labels(tree).some((l) => /^Send proposal/.test(l)), "no proposal, no send");
  assert.ok(labels(tree).includes("Start a proposal"), "a proposal is started, in the sheet");

  // A viewer sends nothing, and may still call them from their own phone.
  globalThis.window.__ME = { role: "viewer" };
  try {
    tree = (await profile(vm))();
    assert.ok(!labels(tree).some((l) => /^Send/.test(l)), `a viewer sends nothing: ${labels(tree)}`);
    // A link on a phone; on a desk the press the call's popover hangs from (call.tsx), which the popover holds as its trigger.
    const call =
      byTestId(tree, "person-call") ?? find(tree, (n) => n.props?.trigger?.props?.["data-testid"] === "person-call");
    assert.ok(call, "the head's own Call, beside More (0052)");
  } finally {
    globalThis.window.__ME = { role: "owner" };
  }

  // Someone who said stop: never the send.
  const quiet = toPersonVM(
    detail({ row: row({ visits: VISITS, consent: "opted_out" }), proposal_url: url, deals_on: true }),
    ZONE,
    new Date(NOW),
  );
  tree = (await profile(quiet))();
  // Nothing is sent to someone who said stop: what would send is drawn, disabled, and says why (canvas A, More).
  const sends = itemsIn(moreOf(tree)).filter((i) => /^(Send|Text them|Email them)/.test(i.label));
  assert.ok(sends.length > 0, "the sends are drawn");
  assert.ok(
    sends.every((i) => i.disabled === true && /asked to stop/.test(i.title)),
    `nothing is sent to someone who said stop: ${sends.map((i) => `${i.label}:${i.disabled}`)}`,
  );

  // A workspace whose customers book: the booking link's send, and no proposal anywhere (0008).
  tree = (
    await profile(
      toPersonVM(
        detail({ proposal_url: url, booking_link: "https://book.example/salon", deals_on: false }),
        ZONE,
        new Date(NOW),
      ),
    )
  )();
  assert.ok(labels(tree).includes("Send booking link"));
  assert.ok(
    !labels(tree).some((l) => /proposal/.test(l)),
    `REGRESSION: a salon was offered a proposal: ${labels(tree)}`,
  );
  assert.equal(byTestId(tree, "person-deal"), null, "and no Deal section");
  assert.ok(!aboutKeys(tree).includes("Proposal"));
});

/* ----------------------------------- the Deal section (0004, 0008) ----------------------------------- */

/** A person's deal row, as the route lists it, and the row's columns for it, as people_list's lateral join picks it. */
const dealRow = (over = {}) => ({
  id: "d1",
  contact_id: "p1",
  service: "Ad management",
  stage: "proposed",
  proposed_at: iso(9 * D),
  decided_at: null,
  ended_at: null,
  amount_cents: 120_000,
  per: "once",
  currency: "USD",
  note: null,
  version: 1,
  created_at: iso(9 * D),
  proposal_url: null,
  valid_until: null,
  lost_reason: null,
  ...over,
});
const withDeals = (deals, over = {}, rowOver = {}) => {
  const d = contracts.pickCurrentDeal(deals);
  return toPersonVM(
    detail({
      deals_on: true,
      services: ["Ad management", "SEO"],
      deals,
      row: row({
        visits: VISITS,
        ...(d
          ? {
              deal_id: d.id,
              deal_stage: d.stage,
              deal_service: d.service,
              deal_proposed_at: d.proposed_at,
              deal_decided_at: d.decided_at,
              deal_ended_at: d.ended_at,
              deal_amount_cents: d.amount_cents,
              deal_per: d.per,
              deal_proposal_url: d.proposal_url,
              deal_valid_until: d.valid_until,
              deal_lost_reason: d.lost_reason,
            }
          : {}),
        ...rowOver,
      }),
      ...over,
    }),
    ZONE,
    new Date(NOW),
  );
};
/** The sheet's door, as the shell's host answers it: every ask the page makes of it. */
const sheetAsks = () => {
  const asked = [];
  globalThis.window.openDealSheet = (ask) => {
    asked.push(ask);
    return true;
  };
  return asked;
};
const cardOf = (t) => byTestId(t, "person-deal-card");
/**
 * The Deals tab with each deal's row folded open (canvas A: a deal is a row, its name the press that folds the rest
 * open under it), drawn again after the press.
 */
const openedRow = async (vm, tab = "deals") => {
  const draw = await profile(vm, tab);
  for (const title of all(draw(), (n) => n.props?.["data-testid"] === "person-deal-title")) press(title);
  return draw();
};

const movesOf = (t) => all(t, (n) => n.type === "button" && n.props?.["data-testid"] === "person-deal-move");

test("the Deal section stands on the Overview above Coming up, only where deals are on; with no deal it is one quiet line that starts a proposal in the sheet; the card's settings have no Deal row", async () => {
  recFolds.reset();
  const asked = sheetAsks();
  try {
    const off = (await profile(toPersonVM(detail({ deals_on: false, deals: [] }), ZONE, new Date(NOW))))();
    assert.equal(byTestId(off, "person-deal"), null, "a salon never sees it");

    const tree = (await profile(withDeals([])))();
    const section = byTestId(tree, "person-deal");
    assert.equal(textOf(find(section, (n) => n.type === "h2")), "Deal");
    // On the Overview (0052), its next act on Up next's rung, then Coming up (VISITS has a visit ahead).
    const overview = find(tree, (n) => typeof n.type === "function" && n.type.name === "Overview");
    const kids = overview.rendered.props.children.filter((k) => k && typeof k === "object");
    const at = kids.findIndex((k) => k.type === PersonDealCard);
    assert.ok(at >= 0 && kids[at].props.rung, "the deal, on the Overview, its next act Up next's");
    assert.equal(kids[at + 1].props["data-testid"], "person-coming-up", "then what is coming");
    // Nothing recorded: one line, and its act in quiet words.
    assert.equal(textOf(byTestId(tree, "person-deal-said")), "No proposal yet");
    assert.equal(byTestId(tree, "person-deal-card"), null);
    const start = byTestId(tree, "person-deal-start");
    assert.equal(textOf(start), "Start a proposal");
    assert.equal(start.props.className, "cl-prof-deal-act", "quiet: no consultation is waiting on it");
    press(start);
    assert.deepEqual(asked, [{ personId: "p1", mode: "propose", dealId: null }], "the one sheet, for a new proposal");
    // The card's settings are the three answers: the deal says itself once, in its own section.
    const cls = (n) => String(n.props?.className || "");
    assert.deepEqual(
      all(byTestId(tree, "person-settings"), (n) => cls(n).split(" ").includes("rec-row")).map((r) =>
        textOf(find(r, (n) => cls(n) === "rec-row-key")),
      ),
      ["Visit messages", "Offers & news", "Receptionist"],
      "REGRESSION: the deal was a row of the card and a fold under it (canvas A's order: the answers, then who answers)",
    );
    assert.equal(byTestId(tree, "rec-row-person-deal"), null);
    assert.ok(!all(tree, (n) => n.type === "h2").some((h) => textOf(h) === "Proposal"));
  } finally {
    delete globalThis.window.openDealSheet;
  }
});

test("a proposal out is a card: its service and value, its steps, its link and whether it went, its one next act as the outline button and the other moves as words, each opening the sheet or the thread", async () => {
  recFolds.reset();
  const asked = sheetAsks();
  const url = "https://quotes.example.com/p/dani";
  const carried = [];
  const putBack = carryingCompose(carried);
  try {
    // The person's own link (00154) stays theirs: the card says the deal's.
    const vm = withDeals([dealRow({ proposal_url: url })], { proposal_url: "https://docs.example.com/p/own" });
    let tree = await openedRow(vm);
    const card = cardOf(tree);
    assert.equal(textOf(byTestId(card, "person-deal-title")), "Ad management");
    assert.equal(textOf(byTestId(card, "person-deal-value")), "$1,200", "a proposal says its value (0008)");
    assert.deepEqual(
      all(card, (n) => n.props?.["data-testid"] === "person-deal-step").map((s) => [
        textOf(find(s, (n) => n.props?.className === "cl-prof-deal-step-label")),
        s.props["data-at"],
      ]),
      [
        ["Proposal out", "current"],
        ["Client", "ahead"],
      ],
      "no consultation, no Consultation step",
    );
    const link = byTestId(card, "person-deal-link");
    assert.deepEqual([link.props.href, link.props.target, link.props.rel], [url, "_blank", "noopener noreferrer"]);
    assert.equal(textOf(link), "quotes.example.com", "the deal's link, not the one left on the person");
    assert.deepEqual(all(card, (n) => n.props?.["data-testid"] === "person-deal-fact").map(textOf), ["Not sent yet"]);
    // Not sent, and it can go: the next act is the send, an outline button; the page's one filled button is the thread.
    const next = byTestId(card, "person-deal-next");
    assert.deepEqual([textOf(next), next.props.className], ["Send proposal", "btn btn-sm"]);
    assert.deepEqual(movesOf(card).map(textOf), ["Mark as client", "Mark as passed", "Edit proposal"]);
    // The card leads with the send, so the More menu does not say it again.
    const more = find(tree, (n) => n.type === Menu);
    assert.ok(
      !itemsIn(more).some((i) => /^Send proposal/i.test(i.label || "")),
      "REGRESSION: Send proposal on the card and again under More",
    );
    went.length = 0;
    press(next);
    assert.deepEqual(went, [vm.openThread], "the send opens their thread...");
    assert.deepEqual(JSON.parse(carried.at(-1)[1]), {
      threadId: vm.openThread.replace(/^inbox\//, ""),
      text: contracts.proposalMessage(url),
    });
    assert.equal(asked.length, 0, "...and never the sheet");
    press(movesOf(card)[0]);
    press(movesOf(card)[1]);
    assert.deepEqual(asked, [
      { personId: "p1", mode: "won", dealId: "d1" },
      { personId: "p1", mode: "lost", dealId: "d1" },
    ]);

    // Recorded without a link: said, and adding it is the next act.
    tree = await openedRow(withDeals([dealRow()]));
    assert.deepEqual(all(cardOf(tree), (n) => n.props?.["data-testid"] === "person-deal-fact").map(textOf), [
      "No link yet",
    ]);
    assert.equal(textOf(byTestId(tree, "person-deal-next")), "Edit proposal");
    assert.deepEqual(movesOf(tree).map(textOf), ["Mark as client", "Mark as passed"], "the edit is said once");
    assert.equal(byTestId(tree, "person-deal-flag"), null, "they wrote since: nothing waiting");
    // Nothing back in a week: a state in the warn tone, the house's one pill. A proposal recorded without a link went
    // some other way, so it waits as one whose link went.
    tree = await openedRow(withDeals([dealRow()], {}, { last_inbound_at: iso(12 * D) }));
    const flag = find(tree, (n) => n.type === StatePill && n.props.testid === "person-deal-flag");
    assert.deepEqual([flag.props.kind, flag.props.value, flag.props.label], ["tone", "warn", "Nothing back in 9 days"]);

    // A client: the steps say it; the one move is the end, in quiet words.
    tree = await openedRow(
      withDeals([
        dealRow({ stage: "won", decided_at: iso(2 * D), per: "month", amount_cents: 250_000, proposal_url: url }),
      ]),
    );
    assert.equal(textOf(byTestId(cardOf(tree), "person-deal-value")), "$2,500 a month");
    assert.equal(byTestId(tree, "person-deal-link"), null, "a client's proposal is history");
    assert.equal(byTestId(tree, "person-deal-next"), null);
    assert.deepEqual(movesOf(tree).map(textOf), ["End the engagement"]);
    const current = find(cardOf(tree), (n) => n.props?.["aria-current"] === "step");
    assert.deepEqual(
      [current.props["data-tone"], textOf(find(current, (n) => n.props?.className === "cl-prof-deal-step-label"))],
      ["ok", "Client"],
    );

    // Passed: no card, one line with the reason, and proposing again moves that row.
    asked.length = 0;
    tree = (
      await profile(withDeals([dealRow({ stage: "lost", decided_at: iso(2 * D), lost_reason: "price" })]), "deals")
    )();
    assert.equal(cardOf(tree), null);
    assert.match(textOf(byTestId(tree, "person-deal-said")), /^Ad management · Passed \w{3} \d+ · Price$/);
    press(byTestId(tree, "person-deal-start"));
    assert.deepEqual(asked, [{ personId: "p1", mode: "again", dealId: "d1" }]);

    // A viewer reads the card and presses nothing.
    globalThis.window.__ME = { role: "viewer" };
    try {
      tree = (await profile(vm, "deals"))();
      assert.ok(cardOf(tree));
      assert.equal(byTestId(tree, "person-deal-next"), null);
      assert.deepEqual(movesOf(tree), []);
    } finally {
      globalThis.window.__ME = { role: "owner" };
    }
  } finally {
    delete globalThis.window.openDealSheet;
    putBack();
  }
});

test("where only an approved message can reach them, the card's follow-up opens their thread with nothing written in it and says why on hover; someone who said stop is offered none", async () => {
  recFolds.reset();
  const url = "https://quotes.example.com/p/dani";
  const carried = [];
  const putBack = carryingCompose(carried);
  const said = (id, dir, body, ago) => ({
    id,
    conversation_id: "cv1",
    direction: dir,
    sender: dir === "inbound" ? "customer" : "human",
    type: "text",
    body,
    media: null,
    meta: null,
    status: dir === "inbound" ? "received" : "sent",
    channel: "whatsapp",
    created_at: iso(ago),
  });
  // Sent on WhatsApp eight days ago, and nothing from them in twelve: their window is shut.
  const quiet = (rowOver = {}) =>
    withDeals(
      [dealRow({ proposal_url: url })],
      {
        conversations: [
          {
            ...detail().conversations[0],
            last_wa_inbound_at: iso(12 * D),
            messages: [
              said("m1", "inbound", "Send it over", 12 * D),
              said("m2", "outbound", contracts.proposalMessage(url), 8 * D),
            ],
          },
        ],
      },
      { latest_wa_inbound_at: iso(12 * D), last_inbound_at: iso(12 * D), last_message_at: iso(8 * D), ...rowOver },
    );
  try {
    const vm = quiet();
    const tree = await openedRow(vm);
    const next = byTestId(tree, "person-deal-next");
    assert.deepEqual([textOf(next), next.props.title], ["Follow up", contracts.DEAL_ACT_HINTS.approved]);
    press(next);
    assert.deepEqual(went, [vm.openThread], "their thread, which offers the approved messages");
    assert.deepEqual(carried, [], "and nothing written for them: no free text can go");
    for (const rowOver of [{ consent: "opted_out" }, { dnc: true }]) {
      const stopped = await openedRow(quiet(rowOver));
      assert.equal(textOf(byTestId(stopped, "person-deal-next")), "Mark as client", JSON.stringify(rowOver));
    }
    // Where their People row says the proposal follow-up has them (0006): the day its run goes, and the card leads
    // with no nudge of its own.
    const keep = surfaceValue("people");
    try {
      const draw = await profile(quiet(), "deals");
      setSurfaceValue("people", {
        ...(keep || {}),
        rows: [{ id: vm.id, followUp: { kind: "will", atMs: NOW, asks: true } }],
      });
      for (const title of all(draw(), (n) => n.props?.["data-testid"] === "person-deal-title")) press(title);
      const inHand = draw();
      assert.equal(textOf(byTestId(inHand, "person-deal-next")), "Mark as client");
      const flag = find(inHand, (n) => n.type === StatePill && n.props.testid === "person-deal-flag");
      assert.deepEqual([flag.props.value, flag.props.label], ["info", "Follow-up to approve today"]);
    } finally {
      setSurfaceValue("people", keep);
    }
  } finally {
    putBack();
  }
});

test("the page reads the person again when People lands or changes, which a deal recorded in the sheet or a step saved is read with; the sheets' own events read nothing (0047)", async () => {
  const vm = withDeals([dealRow()]);
  const draw = await profile(vm);
  draw();
  await settle();
  // Counted from here: drawing the page is not what is being proved.
  const reads = () => took("GET", "/api/v1/contacts/p1").length;
  const drawn = reads();
  // The sheets say `deal:recorded` (the Pipeline's focus) and nothing of a note: neither reads the page, for anyone.
  globalThis.window.dispatchEvent({ type: "deal:recorded", detail: { personId: "p1" } });
  globalThis.window.dispatchEvent({ type: "note:saved", detail: { personId: "p1" } });
  await settle();
  assert.equal(reads() - drawn, 0, "REGRESSION: a window event the sheets once said read the page a second time");
  globalThis.window.dispatchEvent({ type: "surface:clients" });
  await settle();
  assert.equal(reads() - drawn, 1, "People landing or changing reads their page again, once");
});

test("the page reads the person again when the Inbox or Conversations shows a message or call of theirs newer than the page holds, and not for anyone else's (N1)", async () => {
  // People re-reads a message only while its own list is on screen (#1347), and a person's page is another route: a customer who
  // answered while their page was open changed nothing on it. The Inbox and Conversations are read for every message, so the page
  // hears them and reads its one person: never People's list.
  const vm = toPersonVM(detail(), ZONE, new Date(NOW));
  const held = vm.lastContact.ts;
  assert.ok(held, "the person was last heard from at a moment the page holds");
  const keep = [surfaceValue("inbox"), surfaceValue("conversations")];
  try {
    const draw = await profile(vm);
    draw();
    await settle();
    const reads = () => took("GET", "/api/v1/contacts/p1").length;
    const drawn = reads();
    const told = async (type) => {
      globalThis.window.dispatchEvent({ type, detail: {} });
      await settle();
    };
    setSurfaceValue("inbox", { THREADS: [{ clientId: "someone-else", lastAtMs: held + 60_000 }] });
    await told("surface:inbox");
    assert.equal(reads() - drawn, 0, "someone else wrote");
    setSurfaceValue("inbox", { THREADS: [{ clientId: "p1", lastAtMs: held }] });
    await told("surface:inbox");
    assert.equal(reads() - drawn, 0, "nothing newer than the page holds");
    setSurfaceValue("inbox", { THREADS: [{ clientId: "p1", lastAtMs: held + 60_000 }] });
    await told("surface:inbox");
    assert.equal(reads() - drawn, 1, "they wrote: their page is read again");
    await told("surface:inbox");
    await told("surface:conversations");
    assert.equal(reads() - drawn, 1, "and the same message, told by the next read, is not read twice");
    setSurfaceValue("conversations", { CONVERSATIONS: [{ clientId: "p1", ts: held + 120_000 }] });
    await told("surface:conversations");
    assert.equal(reads() - drawn, 2, "they phoned: read again");
    assert.equal(took("GET", "/api/v1/contacts").length, 0, "and People's list is not read for it");
  } finally {
    setSurfaceValue("inbox", keep[0]);
    setSurfaceValue("conversations", keep[1]);
  }
});

/* ------------------------------ the card's settings, one line each (canvas A, step 2) ------------------------------ */

test("the card's settings are one line each, and Change opens the editor under its row: the record kit's row and fold", async () => {
  recFolds.reset();
  const vm = toPersonVM(detail(), ZONE, new Date(NOW));
  const draw = await profile(vm);
  let tree = draw();
  const cls = (n) => String(n.props?.className || "");
  const settings = byTestId(tree, "person-settings");
  const rows = all(settings, (n) => cls(n).split(" ").includes("rec-row"));
  assert.deepEqual(
    rows.map((r) => textOf(find(r, (n) => cls(n) === "rec-row-key"))),
    ["Visit messages", "Offers & news", "Receptionist"],
    "REGRESSION: three stacked controls with a paragraph under each were 1,249px of rail (canvas A: the key over its answer)",
  );
  assert.ok(
    rows.every((r) => cls(r).split(" ").includes("rec-row-stacked")),
    "each row stacks its key over its answer: the rail's width squeezed them a letter a line",
  );
  assert.deepEqual(
    rows.slice(0, 2).map((r) => textOf(find(r, (n) => cls(n) === "rec-row-value"))),
    [vm.consent.answerLabel, vm.consent.marketingLabel],
    "each answer in its control's own words, from contracts",
  );
  // Closed, each editor is on the page and hidden, whole; Change opens it and the row gives it its place.
  assert.equal(byTestId(tree, "rec-fold-person-visit").props.hidden, true);
  press(byTestId(tree, "rec-row-act-person-visit"));
  tree = draw();
  const fold = byTestId(tree, "rec-fold-person-visit");
  assert.equal(fold.props["data-open"], "true", "Change opens the fold");
  assert.equal(byTestId(tree, "rec-row-person-visit"), null, "and the row gives it its place");
  assert.ok(byTestId(fold, "consent-control"), "the ask is inside it");
  assert.equal(byTestId(fold, "rec-fold-save-person-visit"), null, "an answer is recorded as it is chosen: no Save");
  press(byTestId(tree, "rec-fold-close-person-visit"));
  tree = draw();
  assert.ok(byTestId(tree, "rec-row-person-visit"), "Close puts the row back");

  // Someone who may only read sees the answers and no Change.
  const me = globalThis.window.__ME;
  globalThis.window.__ME = { role: "viewer" };
  try {
    tree = (await profile(vm))();
    assert.deepEqual(
      all(byTestId(tree, "person-settings"), (n) => /^rec-row-act-/.test(String(n.props?.["data-testid"] || ""))),
      [],
      "nothing to press for a viewer",
    );
  } finally {
    globalThis.window.__ME = me;
  }
});

test("REGRESSION: on a phone a row stays in the card behind its sheet -- taken out, the card was a row shorter under the wash, and everything under it moved up and back down", async () => {
  const vm = toPersonVM(detail(), ZONE, new Date(NOW));
  const mm = globalThis.window.matchMedia;
  // The record kit's phone (record.css, 760px and under): a fold is a sheet over the page.
  globalThis.window.matchMedia = (q) => ({ matches: /760px/.test(q), addEventListener() {}, removeEventListener() {} });
  try {
    const draw = await profile(vm);
    press(byTestId(draw(), "rec-row-act-person-visit"));
    const tree = draw();
    const sheet = byTestId(tree, "rec-fold-person-visit");
    assert.equal(sheet.props.role, "dialog", "on a phone the editor is a sheet");
    const behind = find(tree, (n) => n.props?.className === "rec-fold-behind");
    assert.ok(behind, "the row it opened from is drawn in the card behind it");
    assert.ok(byTestId(behind, "rec-row-person-visit"), "the same row, where it stood");
    assert.equal(behind.props["aria-hidden"], "true", "a picture of the row: nothing in it can be pressed or read out");
  } finally {
    globalThis.window.matchMedia = mm;
  }
});

test("REGRESSION: a History filter holds still -- on a phone a shorter list made the page shorter, and the strip jumped 328px down the screen under the thumb", async () => {
  const PAST = { ...NEXT, id: "b0:1", start: iso(10 * D), end: iso(10 * D - 2 * H) };
  const vm = toPersonVM(detail({ visits: { ...VISITS, all: [PAST, NEXT] } }), ZONE, new Date(NOW));
  const draw = await profile(vm, "history");
  const held = [];
  const hold = globalThis.window.holdStill;
  globalThis.window.holdStill = (control, change) => {
    held.push(control);
    change();
  };
  try {
    // History's filters, not the page's tabs beside them (0052).
    find(
      draw(),
      (n) => n.type === SubTabs && n.props.tabs.some((x) => x.testid === "timeline-filter-all"),
    ).props.onSelect("visits");
    assert.equal(held.length, 1, "the switch runs through holdStill, from the tab pressed");
    const timeline = find(draw(), (n) => typeof n.type === "function" && n.type.name === "PersonTimeline");
    assert.equal(timeline.props.filter, "visits", "and History shows the visits");
  } finally {
    globalThis.window.holdStill = hold;
  }
});

test("History names who added a person, by the door that did: the calendar, the lead finder, or you -- every one read Calendar, and a lead read Added by hand", async () => {
  const added = (source, title = null) =>
    toPersonVM(detail({ added: { at: iso(8 * D), source, title } }), ZONE, new Date(NOW));
  const entry = (vm) => {
    const e = vm.timeline.find((i) => i.id === "added");
    return e && [e.who, e.text];
  };
  assert.deepEqual(entry(added("calendar", "Balayage")), ["Calendar", "Added from your calendar (Balayage)"]);
  assert.deepEqual(entry(added("calendar")), ["Calendar", "Added from your calendar"]);
  assert.deepEqual(
    entry(added("lead")),
    ["Leads", "Added from a lead you found"],
    "REGRESSION: Calendar · Added by hand, for a lead the finder found",
  );
  assert.deepEqual(entry(added("manual")), ["You", "Added by hand"], "REGRESSION: Calendar · Added by hand");
  // Any other source POST contacts was given is a hand, as people_list's came_from reads it (00138).
  assert.deepEqual(entry(added("walk_in")), ["You", "Added by hand"]);
  // A client list the owner brought in is theirs, from a file: People's column says Imported, and so does this.
  assert.deepEqual(
    entry(added("import")),
    ["You", "Added from a spreadsheet"],
    "REGRESSION: Imported on People, Added by hand here",
  );
  // About says the same door in the same words.
  for (const [source, how] of [
    ["calendar", "from your calendar"],
    ["lead", "from a lead you found"],
    ["import", "from a spreadsheet"],
    ["manual", "by hand"],
  ])
    assert.ok(
      added(source)
        .about.find((a) => a.k === "Added")
        .v.endsWith(`· ${how}`),
      source,
    );
  // The page draws who above what: "You", then "Added by hand".
  const draw = await profile(added("manual"), "history");
  const row = find(
    draw(),
    (n) =>
      String(n.props?.className || "").includes("cl-tl-row") &&
      textOf(find(n, (m) => String(m.props?.className || "").startsWith("cl-tl-text"))) === "Added by hand",
  );
  assert.ok(row, "the added row is on the page");
  assert.equal(textOf(find(row, (m) => m.props?.className === "cl-tl-who")), "You", "REGRESSION: Calendar");
});

/* ------------------------------ opening a person is as quick as the tab can make it ------------------------------ */

/**
 * The wire's answer for each person a page reads (GET contacts/[id]), on top of the People read: the people read, in
 * order, by id. The courier the People page calls is people-detail.ts's own (warmPerson, warmPeople), so what these
 * two tests hold is what it sends, not a stub of it. The wire is put back when the test ends: the tests after them read
 * a person the world's own answers say.
 */
const personReads = (t) => {
  const reads = [];
  const people = globalThis.window.fetch;
  t.after(() => {
    globalThis.window.fetch = people;
  });
  globalThis.window.fetch = async (url, init) => {
    const u = new URL(String(url), "https://app.chanlytics.com");
    const at = u.pathname.match(/^\/api\/v1\/contacts\/([^/]+)$/);
    if (!at) return people(url, init);
    reads.push(at[1]);
    return json(200, { ok: true, data: { person: detail({ row: row({ id: at[1], visits: VISITS }) }) } });
  };
  return reads;
};

test("a People row reads its person as a pointer reaches it or the cursor lands on it, so the page opens on what the tab holds", async (t) => {
  // The courier to read ahead (people-detail.ts warmPerson) was called by the retired demo page's rows alone: every
  // open from People waited on the wire behind "Loading…". Two people, so a read that one arrival started is not
  // taken for the other's (the client shares an identical read in flight: warming twice costs one request). The tab
  // read both before and a write since has made those copies old: the page's own read ahead leaves what the tab holds
  // be, and a copy from before is read again as a pointer reaches it.
  const draw = await peoplePage([
    row({ id: "w1", display_name: "Wren One" }),
    row({ id: "w2", display_name: "Wren Two", phone_e164: "+17865550182" }),
  ]);
  const reads = personReads(t);
  await personDetail("w1");
  await personDetail("w2");
  staleReadCaches();
  reads.length = 0;
  const tree = draw();
  await settle();
  assert.deepEqual(reads, [], "the rows on screen are read ahead only where the tab holds nothing of them");
  find(tree, (n) => n.type === "tr" && n.props?.id === "person-w1").props.onPointerEnter();
  await settle();
  assert.deepEqual(reads, ["w1"], "a pointer arriving");
  find(tree, (n) => n.type === "tr" && n.props?.id === "person-w2").props.onFocus();
  await settle();
  assert.deepEqual(reads, ["w1", "w2"], "and the cursor landing");
});

test("People reads the people it shows ahead, so a press opens a page the tab already holds", async (t) => {
  const draw = await peoplePage([
    row({ id: "a1", display_name: "Ana One" }),
    row({ id: "a2", display_name: "Ana Two", phone_e164: "+17865550182" }),
  ]);
  const reads = personReads(t);
  draw();
  await settle();
  assert.deepEqual([...reads].sort(), ["a1", "a2"], "the rows on screen, read by the courier");
});

test("a person not read yet is nothing of theirs until their whole page is in: never the name first and the rest after", async () => {
  // Ruben, 24 Sep 2026: "the person name the header part still loads first for a split second". The page drew their
  // People row's name and number over Reading…, and the rest landed under it a moment later.
  await peoplePage([row()]);
  // Their page is on its way: the wire has it, and holds it until the test lets it go.
  const vm = toPersonVM(detail(), ZONE, new Date(NOW));
  await newTree();
  serve(vm);
  const hold = holdRead("p1");
  pageFor("p1");
  let tree = pageFor("p1");
  const reading = byTestId(tree, "person-reading");
  assert.ok(reading, "the pane any page on its way draws");
  assert.equal(reading.props["aria-busy"], "true");
  assert.ok(String(reading.props.className).includes("route-reading"), "Reading…, after the standard's beat");
  assert.equal(
    find(tree, (n) => n.type === "h1"),
    null,
    "REGRESSION: their name drawn before their page",
  );
  assert.ok(!textOf(tree).includes("Daniela Reyes"), "nothing of theirs at all");
  assert.ok(!textOf(tree).includes("Loading…"), "REGRESSION: a bare Loading… at once");

  // Their page lands whole: the head, where they stand and the Overview (0052) in the same draw.
  hold.release();
  await settle();
  tree = pageFor("p1");
  assert.ok(byTestId(tree, "person-now"), "where they stand");
  assert.ok(
    find(tree, (n) => n.type === "h1"),
    "their name",
  );
  assert.ok(
    find(tree, (n) => typeof n.type === "function" && n.type.name === "Overview"),
    "and their Overview, together",
  );
  assert.equal(byTestId(tree, "person-reading"), null);
});

test("a kept copy whose read again failed says so, quietly, and stays: never taken for now", async () => {
  const vm = toPersonVM(detail(), ZONE, new Date(NOW));
  // The tab read them earlier and keeps the copy; the read it makes now fails.
  await newTree();
  serve(vm);
  await personDetail(vm.id);
  world.answers[`GET /api/v1/contacts/${vm.id}`] = () => refused(500, "Could not be read right now", "internal");
  pageFor(vm.id);
  await settle();
  const tree = pageFor(vm.id);
  assert.ok(byTestId(tree, "person-now"), "the page they already had");
  const stale = byTestId(tree, "person-stale");
  assert.ok(stale, "REGRESSION: a copy from before the reload was shown as current, the failed read unsaid");
  assert.match(textOf(stale), /from earlier/);
});

test("a person this tab holds is the first draw, not the second, and is read again behind it", async () => {
  // The tab keeps the people it opened (people-detail.ts), so a reload has them before the first frame. Seeded in the
  // load effect, the page drew one frame of the head alone before the page it already had.
  const vm = toPersonVM(detail(), ZONE, new Date(NOW));
  await newTree();
  serve(vm);
  await personDetail(vm.id);
  const reads = () => took("GET", `/api/v1/contacts/${vm.id}`).length;
  const held = reads();
  const first = pageFor(vm.id);
  assert.ok(byTestId(first, "person-now"), "REGRESSION: the first frame was the head alone");
  assert.equal(byTestId(first, "person-known"), null, "and never the head over Reading…");
  await settle();
  assert.equal(reads() - held, 1, "what the tab held is read again behind the paint");
});

test("on a real workspace a person's page is read from the workspace before People's rows land: never the sample a demo draws", async () => {
  // A person's page no longer waits for the list (surface-registry.ts routeSurfaceFor): the workspace is real, and the
  // page reads its own person. Asked for a person the sample also has (c-aisha, the mockup's own id), it is the wire that
  // answers, and the wire says who is in the workspace.
  const keep = surfaceValue("people");
  setSurfaceValue("people", undefined);
  try {
    await newTree();
    const hold = holdRead("c-aisha");
    const tree = pageFor("c-aisha");
    assert.ok(byTestId(tree, "person-reading"), "the real page, reading their record, never the sample");
    assert.equal(took("GET", "/api/v1/contacts/c-aisha").length, 1, "and it asked the workspace for the person");
    hold.release(null);
    await settle();
    const gone = pageFor("c-aisha");
    assert.match(textOf(gone), /This person is not in your workspace/);
    assert.ok(!textOf(gone).includes("Aisha"), "nothing of the sample's person");
  } finally {
    setSurfaceValue("people", keep);
  }
});

test("a demo session draws a sample person's page and asks the workspace for no one; a person the sample does not have is not in the workspace", async () => {
  // A demo has no workspace to read (surfaces/people/sample.ts): the page is the one page there is, over made-up people,
  // by the mockup's own ids.
  globalThis.window.__DEMO_MODE = true;
  // What the demo asked the workspace for: People's list, or one of its own people. A read a test before it started can land
  // here on a busy machine (a real person's, by their id); it is not the demo's, and is not counted.
  const askedByDemo = () =>
    world.seen.filter((q) => q.path === "/api/v1/contacts" || q.path.startsWith("/api/v1/contacts/c-")).length;
  try {
    await newTree();
    world.seen.length = 0;
    pageFor("c-aisha");
    await settle();
    const tree = pageFor("c-aisha");
    assert.equal(textOf(find(tree, (n) => n.type === "h1")), "Aisha Khan", "the sample's person, by name");
    assert.ok(byTestId(tree, "person-now"), "where they stand");
    assert.ok(
      find(tree, (n) => typeof n.type === "function" && n.type.name === "Overview"),
      "and their Overview",
    );
    assert.equal(byTestId(tree, "person-reading"), null);
    assert.equal(askedByDemo(), 0, "no request went out");

    await newTree();
    pageFor("c-nobody");
    await settle();
    const gone = pageFor("c-nobody");
    assert.match(textOf(gone), /This person is not in your workspace/);
    assert.equal(
      find(gone, (n) => n.type === "h1"),
      null,
      "no one is drawn",
    );
    assert.equal(byTestId(gone, "person-now"), null);
    assert.equal(askedByDemo(), 0, "and still no request");
  } finally {
    delete globalThis.window.__DEMO_MODE;
  }
});

/* ----------------------------------- notes (0007) ----------------------------------- */

const noteDto = (id, body, hoursAgo, over = {}) => ({
  id,
  body,
  author_kind: "member",
  author_name: "Maria",
  mine: false,
  for_user_id: null,
  for_name: null,
  for_me: false,
  team_only: false,
  state: "kept",
  source: "page",
  version: 1,
  created_at: new Date(NOW - hoursAgo * 3_600_000).toISOString(),
  updated_at: new Date(NOW - hoursAgo * 3_600_000).toISOString(),
  ...over,
});
const NOTE_TEAM = [
  { id: "u-me", name: "Ruben", me: true },
  { id: "u-sam", name: "Sam", me: false },
];
const withNotes = () =>
  detail({
    person_notes: [
      noteDto("n-mine", "Allergic to ammonia.", 2, { author_name: "Ruben", mine: true, version: 2 }),
      noteDto("n-for-me", "Call her back about the bridal party.", 30, {
        for_user_id: "u-me",
        for_name: "Ruben",
        for_me: true,
        team_only: true,
      }),
      noteDto("n-sug", "Prefers early mornings.", 1, {
        author_kind: "receptionist",
        author_name: null,
        state: "suggested",
        source: "call",
      }),
      noteDto("n-gone", "Sees Sofia.", 400, { author_name: null }),
    ],
    note_team: NOTE_TEAM,
  });

test("a person's notes are a log (0007): the receptionist's suggestion first, then newest first, each signed and dated, who it is for and whether the receptionist reads it", () => {
  const vm = toPersonVM(withNotes(), ZONE, new Date(NOW));
  assert.deepEqual(
    vm.noteList.map((n) => [n.body, n.who, n.forWho, n.teamOnly, n.suggested, n.from]),
    [
      ["Prefers early mornings.", "The receptionist", null, false, true, "After a call"],
      ["Allergic to ammonia.", "You", null, false, false, null],
      ["Call her back about the bridal party.", "Maria", "For you", true, false, null],
      ["Sees Sofia.", "A former teammate", null, false, false, null],
    ],
  );
  assert.equal(vm.noteList[1].edited, true, "changed after it was written");
  assert.equal(vm.noteList[1].mine, true);
  assert.ok(
    vm.noteList.every((n) => n.when && n.whenFull),
    "every note says when",
  );
  assert.deepEqual(vm.noteTeam, NOTE_TEAM);
});

/**
 * The notes card's doors on the wire (POST contacts/<id>/notes, and /done, /remove, /decide), recording what the page asks of
 * them as [door, person, body] in the order it asks, and accepting each.
 */
/**
 * History's Notes tab (canvas A): every note with its acts, the suggestions and the composer, where the Overview keeps
 * the newest note alone. Answers the page's draw, on that tab.
 */
const notesTab = async (vm) => {
  const draw = await profile(vm, "history");
  const strip = find(
    draw(),
    (n) => n.type === SubTabs && n.props.tabs.some((x) => x.testid?.startsWith("timeline-filter-")),
  );
  strip.props.onSelect("notes");
  return draw;
};

const recordingNotes = (sent, id = "p1") => {
  for (const [door, name] of [
    ["", "write"],
    ["/done", "done"],
    ["/remove", "remove"],
    ["/decide", "decide"],
  ])
    world.answers[`POST /api/v1/contacts/${id}/notes${door}`] = (body) => {
      sent.push([name, id, body]);
      return okBody();
    };
};

test("REGRESSION: the notes card was one box the receptionist read whole, overwritten by every save -- now a note is added, kept or dismissed, and said with who wrote it and when", async () => {
  const vm = toPersonVM(withNotes(), ZONE, new Date(NOW));
  const sent = [];
  recordingNotes(sent);
  const draw = await notesTab(vm);
  let tree = draw();
  const card = byTestId(tree, "person-notes");
  assert.ok(card, "the card");
  const suggested = byTestId(card, "person-note-suggested");
  // Who suggested it, where it was heard and when, said on its eyebrow on every screen (a phone has no hover); the date
  // with its year is its hover.
  assert.match(textOf(suggested), /^Suggested by the receptionist · after a call · /);
  assert.match(String(find(suggested, (n) => typeof n.props?.title === "string")?.props.title), /, 20\d\d · /);
  const rows = all(card, (n) => n.props?.["data-testid"] === "person-note");
  assert.ok(
    rows.every((r) => !String(r.props.className).split(" ").includes("cl-prof-note")),
    "REGRESSION: the row wore .cl-prof-note, the consent form's class, whose align-items: center pushed every note off the card's edge",
  );
  assert.deepEqual(
    rows.map((r) => textOf(find(r, (n) => n.props?.className === "cl-prof-note-body"))),
    ["Allergic to ammonia.", "Call her back about the bridal party.", "Sees Sofia."],
  );
  assert.match(textOf(rows[1]), /Maria/);
  assert.match(textOf(rows[1]), /For you/);
  assert.match(textOf(rows[1]), /Team only/);
  assert.equal(byTestId(tree, "person-notes-save"), null, "nothing to add until something is written");

  press(byTestId(suggested, "person-note-keep"));
  await settle();
  assert.deepEqual(sent.at(-1), ["decide", vm.id, { note_id: "n-sug", keep: true }]);

  type(byTestId(draw(), "person-notes-input"), "  Likes tea.  ");
  tree = draw();
  // For is a choice under its word, Anyone first and you next (0052's composer).
  assert.deepEqual(
    all(byTestId(tree, "person-note-for"), (n) => n.props?.role === "radio").map((n) => textOf(n).trim()),
    ["Anyone", "Me", "Sam"],
  );
  chooseIn(tree, "person-note-for", "Sam");
  tree = draw();
  // Team only is the kit's switch (canvas A, the composer's foot).
  press(byTestId(tree, "person-note-team-only"));
  tree = draw();
  press(byTestId(tree, "person-notes-save"));
  await settle();
  assert.deepEqual(sent.at(-1), ["write", vm.id, { body: "Likes tea.", for_user_id: "u-sam", team_only: true }]);
  assert.equal(byTestId(draw(), "person-notes-input").props.value, "", "the box empties once the note is added");
});

test("who may do what to a note: its author changes it, an owner or its author deletes it, a viewer only reads", async () => {
  const vm = toPersonVM(withNotes(), ZONE, new Date(NOW));
  const me = globalThis.window.__ME;
  try {
    const actsOf = (tree) =>
      all(tree, (n) => n.props?.["data-testid"] === "person-note").map((r) => {
        const m = find(r, (n) => n.type === Menu);
        return m ? itemsIn(m).map((i) => i.label) : [];
      });
    globalThis.window.__ME = { role: "owner" };
    let draw = await notesTab(vm);
    assert.deepEqual(
      actsOf(draw()),
      [["Edit", "Delete"], ["Delete"], ["Delete"]],
      "an owner deletes any; edits only their own",
    );
    globalThis.window.__ME = { role: "operator" };
    draw = await notesTab(vm);
    assert.deepEqual(actsOf(draw()), [["Edit", "Delete"], [], []], "an operator only their own");
    globalThis.window.__ME = { role: "viewer" };
    draw = await notesTab(vm);
    const tree = draw();
    assert.equal(byTestId(tree, "person-notes-input"), null, "a viewer writes nothing");
    assert.deepEqual(actsOf(tree), [[], [], []]);
    assert.equal(byTestId(tree, "person-note-keep"), null, "nor keeps a suggestion");
    // REGRESSION: an owner previewing a viewer (View-as) is shown what a viewer is. The page read the signed-in role,
    // blind to the preview, and offered the owner's controls to the viewer they were previewing.
    globalThis.window.__ME = { role: "owner" };
    globalThis.window.ST_STORE.viewAsRole = "viewer";
    draw = await notesTab(vm);
    const previewed = draw();
    assert.equal(byTestId(previewed, "person-notes-input"), null, "an owner previewing a viewer writes nothing");
    assert.deepEqual(actsOf(previewed), [[], [], []], "and deletes nothing");
  } finally {
    globalThis.window.ST_STORE.viewAsRole = null;
    globalThis.window.__ME = me;
  }
});

/* ----------------------------------- steps (0007, amended; 00166) ----------------------------------- */

/** A day by the business's calendar, some days from now: far enough from a midnight that no zone moves it. */
const dayFrom = (days) => contracts.zoneDayKey(NOW + days * 86_400_000, ZONE);
const stepNotes = () => [
  noteDto("n-step", "Call about the timeline", 5, {
    due_on: dayFrom(3),
    deal_id: "d1",
    mine: true,
    author_name: "Ruben",
    team_only: true,
  }),
  noteDto("n-done", "Send the revised quote", 50, {
    due_on: dayFrom(-2),
    done_at: new Date(NOW - 3_600_000).toISOString(),
    done_by_name: "Sam",
    team_only: true,
  }),
  noteDto("n-plain", "Allergic to ammonia.", 60, { mine: true, author_name: "Ruben" }),
];

test("a note may have a day (0007, amended): a day makes it a step and holds Team only on; a step says its day, is ticked done by anyone who acts, says who did it and when, and offers the next one", async () => {
  const vm = toPersonVM(detail({ person_notes: stepNotes(), note_team: NOTE_TEAM }), ZONE, new Date(NOW));
  const sent = [];
  const flashes = [];
  // The step sheet is asked for by the event it hears (step-sheet.tsx openStepSheet): what the window was told.
  const asked = () => dispatched.filter((e) => e.type === "step:sheet").map((e) => e.detail);
  const keep = { toast: globalThis.window.usePPToast };
  recordingNotes(sent);
  globalThis.window.usePPToast = () => [null, (t) => flashes.push(t)];
  const W = contracts.NOTE_WORDS;
  try {
    const draw = await notesTab(vm);
    const rowsOf = (tree) => all(byTestId(tree, "person-notes"), (n) => n.props?.["data-testid"] === "person-note");
    let [step, done, plain] = rowsOf(draw());
    assert.match(String(step.props.className), /\bis-step\b/);
    assert.equal(textOf(byTestId(step, "person-note-due")), vm.noteList[0].step.words);
    assert.match(textOf(byTestId(step, "person-note-due")), /^Due /);
    assert.doesNotMatch(textOf(step), /Team only/, "a step is the team's by rule: its line does not say so again");
    assert.match(String(done.props.className), /\bis-done\b/);
    assert.match(textOf(byTestId(done, "person-note-due")), /^Done by Sam · /);
    assert.equal(byTestId(plain, "person-note-due"), null, "a note with no day says none");
    assert.equal(byTestId(plain, "person-note-done"), null);

    // Ticked by anyone who acts, with the version the page saw; done, the toast says it in bold with the step's words and
    // its Undo opens it again (canvas A, M5): a true inverse door, and no sheet asked for.
    byTestId(step, "person-note-done").props.onChange({ target: { checked: true } });
    await settle();
    assert.deepEqual(sent.at(-1), ["done", vm.id, { note_id: "n-step", done: true, version: 1 }]);
    assert.match(textOf(flashes.at(-1).msg), new RegExp(`^${W.stepDone} · Call about the timeline$`));
    assert.equal(flashes.at(-1).action, undefined, "no Set the next one");
    flashes.at(-1).undo();
    await settle();
    assert.deepEqual(sent.at(-1), ["done", vm.id, { note_id: "n-step", done: false }], "Undo opens the step again");
    assert.deepEqual(asked(), [], "and no sheet");
    // Ticked again, a done step is open again, and nothing is offered.
    [step, done, plain] = rowsOf(draw());
    byTestId(done, "person-note-done").props.onChange({ target: { checked: false } });
    await settle();
    assert.deepEqual(sent.at(-1), ["done", vm.id, { note_id: "n-done", done: false, version: 1 }]);
    assert.equal(flashes.at(-1).action, undefined);

    // The composer: its days are four (Today, Tomorrow, this week's Friday or next week, Pick a day: canvas A); a day
    // makes the note a step, holds Team only on whatever it was, and the button says what it makes.
    type(byTestId(draw(), "person-notes-input"), "Follow up on the logo");
    let tree = draw();
    assert.equal(textOf(byTestId(tree, "person-notes-save")).trim(), W.add);
    // By the workspace's clock, as the page counts them (pageClock): in UTC, from midnight there until midnight in New
    // York, "Tomorrow" was a day later than the page's (13 October 2026, 03:55 UTC).
    const days = contracts.composerDays(Date.now(), ZONE);
    assert.deepEqual(
      all(byTestId(tree, "person-note-day"), (n) => n.props?.role === "radio").map((n) => textOf(n).trim()),
      days.map((d) => d.label),
    );
    const tomorrow = days[1];
    assert.equal(tomorrow.label, "Tomorrow");
    chooseIn(tree, "person-note-day", "Tomorrow");
    tree = draw();
    const lock = byTestId(tree, "person-note-team-only");
    assert.deepEqual([lock.props["aria-checked"], lock.props["aria-disabled"]], [true, true]);
    assert.equal(textOf(byTestId(tree, "person-notes-save")).trim(), "Add step for Tomorrow");
    // A second press on the day chosen takes it away, and a first chooses it again.
    chooseIn(tree, "person-note-day", "Tomorrow");
    tree = draw();
    assert.equal(textOf(byTestId(tree, "person-notes-save")).trim(), W.add);
    chooseIn(tree, "person-note-day", "Tomorrow");
    tree = draw();
    press(byTestId(tree, "person-notes-save"));
    await settle();
    assert.deepEqual(sent.at(-1), [
      "write",
      vm.id,
      { body: "Follow up on the logo", for_user_id: null, team_only: true, due_on: tomorrow.key },
    ]);
    assert.equal(textOf(flashes.at(-1).msg), W.stepAdded);

    // Pick a day opens the date field, and Add waits for a day.
    type(byTestId(draw(), "person-notes-input"), "Call her back");
    tree = draw();
    chooseIn(tree, "person-note-day", "Pick a day");
    tree = draw();
    assert.equal(byTestId(tree, "person-notes-save").props.disabled, true, "no day picked yet");
    // Nor from the keyboard: Ctrl+Enter adds nothing until a day is picked (it was a plain note the receptionist read).
    const writes = sent.length;
    byTestId(tree, "person-notes-input").props.onKeyDown({ key: "Enter", ctrlKey: true, metaKey: false });
    await settle();
    assert.equal(sent.length, writes, "the keyboard waits for a day as the button does");
    byTestId(tree, "person-note-date").props.onChange({ target: { value: "2026-12-01" } });
    tree = draw();
    press(byTestId(tree, "person-notes-save"));
    await settle();
    assert.equal(sent.at(-1)[2].due_on, "2026-12-01");

    // Its author takes a day away: the change says so. A note that never had one says nothing of days.
    const editOf = (row) => actsIn(find(row, (n) => n.type === Menu)).find((i) => i.label === W.edit);
    [step, done, plain] = rowsOf(draw());
    editOf(step).onClick();
    tree = draw();
    // Its day is the one chosen (in the date field, under Pick a day, where it is none of the composer's three), and a
    // second press on it takes it away.
    const chosen = find(byTestId(tree, "person-note-day"), (n) => n.props?.role === "radio" && n.props["aria-checked"]);
    assert.ok(chosen, "the step's day is chosen");
    press(chosen);
    press(byTestId(draw(), "person-note-save"));
    await settle();
    assert.deepEqual(sent.at(-1), [
      "write",
      vm.id,
      {
        body: "Call about the timeline",
        for_user_id: null,
        team_only: true,
        note_id: "n-step",
        version: 1,
        clear_due: true,
      },
    ]);
    [step, done, plain] = rowsOf(draw());
    editOf(plain).onClick();
    press(byTestId(draw(), "person-note-save"));
    await settle();
    assert.deepEqual(sent.at(-1), [
      "write",
      vm.id,
      { body: "Allergic to ammonia.", for_user_id: null, team_only: false, note_id: "n-plain", version: 1 },
    ]);
  } finally {
    globalThis.window.usePPToast = keep.toast;
  }
});

test("a deal's card says its next step (0007, amended): Next, what, when, for whom, with Done and, for its author, Change; with none, Set a next step; a viewer only reads it", async () => {
  const sent = [];
  const asked = [];
  // What the window was told of a step: a done says nothing of its own when it lands (the write's refresh reads People behind it, and
  // the page follows People), and says People moved where the door refused it, as nothing is read for a write that was not made.
  const heard = (from) => dispatched.slice(from).filter((e) => e.type === "note:saved" || e.type === "surface:clients");
  const keep = { sheet: globalThis.window.openStepSheet, me: globalThis.window.__ME };
  recordingNotes(sent);
  // The card asks the shell's step sheet, which the frame draws once: here, a stand-in that says it was asked.
  globalThis.window.openStepSheet = (ask) => (asked.push(ask), true);
  const S = contracts.NOTE_WORDS;
  try {
    const notes = [
      noteDto("n-late", "Chase the signature", 3, { due_on: dayFrom(6), deal_id: "d1", team_only: true }),
      noteDto("n-soon", "Call about the timeline", 5, {
        due_on: dayFrom(2),
        deal_id: "d1",
        mine: true,
        author_name: "Ruben",
        for_user_id: "u-sam",
        for_name: "Sam",
        team_only: true,
      }),
      noteDto("n-person", "Ask about her sister", 7, { due_on: dayFrom(1), team_only: true }),
    ];
    let tree = await openedRow(withDeals([dealRow()], { person_notes: notes, note_team: NOTE_TEAM }), "overview");
    const card = byTestId(tree, "person-deal-card");
    const step = byTestId(card, "person-deal-nextstep");
    assert.ok(step, "the card says its next step");
    // The earliest open step that names the deal; the person's own step (no deal) is not the card's.
    assert.equal(textOf(byTestId(step, "person-deal-nextstep-words")), "Call about the timeline");
    assert.match(textOf(byTestId(step, "person-deal-nextstep-day")), /^Due /);
    assert.match(textOf(step), new RegExp(`^${S.next}`));
    assert.match(textOf(step), /For Sam/);
    // A second press while the first is on its way reaches the door once: the first answers for both.
    const told = dispatched.length;
    press(byTestId(step, "person-deal-nextstep-done"));
    press(byTestId(step, "person-deal-nextstep-done"));
    await settle();
    assert.deepEqual(
      sent.filter((x) => x[0] === "done"),
      [["done", "p1", { note_id: "n-soon", done: true, version: 1 }]],
      "one press, however many",
    );
    assert.deepEqual(
      heard(told),
      [],
      "a done the door took says nothing: People is read behind it and the page follows",
    );
    // A done the door refused (the step moved since the page read it): nothing was written, so nothing is read behind it, and the
    // page says People moved so that it is read again and the next press has the step as it now is.
    const taken = world.answers["POST /api/v1/contacts/p1/notes/done"];
    world.answers["POST /api/v1/contacts/p1/notes/done"] = () => refused(409, "Someone changed this step.", "conflict");
    const refusedAt = dispatched.length;
    press(byTestId(step, "person-deal-nextstep-done"));
    await settle();
    assert.deepEqual(
      heard(refusedAt).map((e) => e.type),
      ["surface:clients"],
      "a refused done reads the page again",
    );
    world.answers["POST /api/v1/contacts/p1/notes/done"] = taken;
    press(byTestId(step, "person-deal-nextstep-change"));
    assert.deepEqual(asked.at(-1), { personId: "p1", noteId: "n-soon" });

    // Someone else's step: Done, and no Change.
    tree = await openedRow(withDeals([dealRow()], { person_notes: [notes[0]], note_team: NOTE_TEAM }), "overview");
    assert.ok(byTestId(tree, "person-deal-nextstep-done"));
    assert.equal(byTestId(tree, "person-deal-nextstep-change"), null, "only its author changes it");

    // No step on the deal: Set a next step, which asks for the sheet on that deal.
    tree = await openedRow(withDeals([dealRow()], { person_notes: [notes[2]], note_team: NOTE_TEAM }), "overview");
    assert.equal(byTestId(tree, "person-deal-nextstep"), null);
    const set = byTestId(tree, "person-deal-set-nextstep");
    assert.equal(textOf(set), S.setNext);
    press(set);
    assert.deepEqual(asked.at(-1), { personId: "p1", dealId: "d1" });

    // A viewer reads the step and acts on none of it.
    globalThis.window.__ME = { role: "viewer" };
    tree = await openedRow(withDeals([dealRow()], { person_notes: notes, note_team: NOTE_TEAM }), "overview");
    assert.ok(byTestId(tree, "person-deal-nextstep"));
    assert.equal(byTestId(tree, "person-deal-nextstep-done"), null);
    assert.equal(byTestId(tree, "person-deal-nextstep-change"), null);
    tree = await openedRow(withDeals([dealRow()], { person_notes: [], note_team: NOTE_TEAM }), "overview");
    assert.equal(byTestId(tree, "person-deal-set-nextstep"), null);
  } finally {
    globalThis.window.openStepSheet = keep.sheet;
    globalThis.window.__ME = keep.me;
    globalThis.window.fetch = keep.fetch;
  }
});

/** The merge's typed question: the kit's Confirm in its sheet's foot, where the pick and what it does are the body. */
const mergeConfirm = (tree) =>
  find(find(tree, (n) => n.props?.testid === "person-merge-sheet")?.props.foot, (n) => n.type === KitConfirm);

test("Merge with another record (0028): the owner's act opens the picker over People and the typed confirmation, and the merge is the kept record's request", async () => {
  const { MERGE_WORDS } = contracts;
  const vm = toPersonVM(detail(), ZONE, new Date(NOW));
  const other = toPersonRowVM(
    row({
      id: "p2",
      display_name: "Daniela by email",
      phone_e164: null,
      email: "daniela@example.com",
      channels: ["email"],
    }),
    ZONE,
    new Date(NOW),
  );
  const saved = surfaceValue("people");
  const me = globalThis.window.__ME;
  globalThis.window.__ME = { role: "owner" };
  // People as the tab holds it: this person and the other record. The page offers every other row.
  setSurfaceValue("people", {
    ...(saved ?? {}),
    lists: saved?.lists ?? [],
    rows: [toPersonRowVM(row(), ZONE, new Date(NOW)), other],
  });
  try {
    globalThis.window.fetch = worldFetch;
    world.holding.clear();
    const draw = await profile(vm);
    await settle();
    const more = find(
      find(draw(), (n) => n.props?.className === "cl-prof-queue-actions"),
      (n) => n.type === Menu,
    );
    const act = actsIn(more).find((i) => i.label === MERGE_WORDS.act);
    assert.ok(act, "the owner's menu offers the merge");
    assert.equal(act.title, MERGE_WORDS.actHint);
    assert.equal(byTestId(draw(), "merge"), null, "nothing is drawn until the act is pressed");

    act.onSelect();
    const box = byTestId(draw(), "merge");
    assert.ok(box, "the merge box");
    const picker = find(box, (n) => n.type === Picker);
    assert.deepEqual(
      picker.props.groups.flatMap((g) => g.options).map((o) => [o.value, o.label, o.sub]),
      [["p2", "Daniela by email", "daniela@example.com"]],
      "the other records of People, this person left out",
    );
    assert.equal(picker.props.placeholder, MERGE_WORDS.pickNone);
    let confirm = mergeConfirm(draw());
    assert.equal(confirm.props.ready, false, "nothing chosen, nothing typed");
    assert.equal(textOf(confirm.props.question), MERGE_WORDS.question(vm.name, "the other record"));

    picker.props.onValueChange("p2");
    confirm = mergeConfirm(draw());
    assert.equal(textOf(confirm.props.question), MERGE_WORDS.question(vm.name, "Daniela by email"));
    assert.equal(confirm.props.ready, false, "chosen, but the kept name is not typed");
    // What it does is the sheet's body, under the pick, once (the question and its answers are the foot's).
    assert.ok(textOf(byTestId(draw(), "merge")).includes(MERGE_WORDS.detail(vm.name, "Daniela by email")));
    confirm.props.onType(vm.name);
    confirm = mergeConfirm(draw());
    assert.equal(confirm.props.ready, true);
    assert.equal(textOf(confirm.props.yes), MERGE_WORDS.yes);

    const before = world.seen.length;
    confirm.props.onYes();
    await settle();
    const sent = world.seen.slice(before).find((r) => r.method === "POST");
    assert.deepEqual(
      [sent?.path, sent?.body],
      ["/api/v1/contacts/p1/merge", { merge: "p2" }],
      "the kept record's route, the other in the body",
    );
    assert.ok(
      world.seen.slice(before).some((r) => r.method === "GET" && r.path === "/api/v1/contacts/p1"),
      "and the page is read again, whole",
    );
    // The merge asks in the kit's sheet (canvas A), which closes; it plays its way out with what it held.
    assert.equal(find(draw(), (n) => n.props?.testid === "person-merge-sheet")?.props.open, false, "the sheet closes");
  } finally {
    globalThis.window.__ME = me;
    setSurfaceValue("people", saved);
  }
});

test("Same person? (0034 step 4): each doubt the door raised is a row saying who else it could be; Merge opens 0028's box with that record chosen, read or not by People; Not the same settles the pair through its door and the page is read again; an operator may say not the same and not merge", async () => {
  const { DOUBT_WORDS, MERGE_WORDS, toPersonRowVM } = contracts;
  const dto = {
    ...detail(),
    doubts: [
      {
        id: "d1",
        seen: "email",
        created_at: iso(2 * H),
        other: {
          id: "p2",
          display_name: "Daniela by email",
          wa_profile_name: null,
          phone_e164: null,
          email: "daniela@example.com",
        },
      },
      {
        id: "d2",
        seen: "name",
        created_at: iso(H),
        other: { id: "p3", display_name: null, wa_profile_name: null, phone_e164: "+17865550182", email: null },
      },
    ],
  };
  const vm = toPersonVM(dto, ZONE, new Date(NOW));
  assert.deepEqual(
    vm.doubts.map((d) => [d.id, d.otherId, d.other, d.phone, d.email, d.sentence]),
    [
      ["d1", "p2", "Daniela by email", null, "daniela@example.com", DOUBT_WORDS.seen.email("Daniela by email")],
      ["d2", "p3", "+1 (786) 555-0182", "+1 (786) 555-0182", null, DOUBT_WORDS.seen.name("+1 (786) 555-0182")],
    ],
    "each doubt as the page says it: the other record as People names them, and the sentence for what was seen",
  );
  assert.deepEqual(toPersonVM(detail(), ZONE, new Date(NOW)).doubts, [], "none from a server before the table");
  const saved = surfaceValue("people");
  const me = globalThis.window.__ME;
  const rowsIn = (tree) => all(tree, (n) => n.props?.["data-testid"] === "doubt");
  try {
    globalThis.window.fetch = worldFetch;
    world.holding.clear();
    // People as the tab holds it: this person alone, so neither other record is among People's rows.
    globalThis.window.__ME = { role: "owner" };
    setSurfaceValue("people", {
      ...(saved ?? {}),
      lists: saved?.lists ?? [],
      rows: [toPersonRowVM(row(), ZONE, new Date(NOW))],
    });
    let draw = await profile(vm);
    await settle();
    let rows = rowsIn(draw());
    assert.equal(rows.length, 2, "a row per open doubt");
    assert.ok(textOf(rows[0]).includes(DOUBT_WORDS.seen.email("Daniela by email")), "the sentence");
    assert.equal(byTestId(draw(), "merge"), null, "nothing is drawn until a settlement is pressed");

    // Merge: 0028's box, the doubt's record chosen already, offered even though People does not list it.
    byTestId(rows[0], "doubt-merge").props.onClick();
    const box = byTestId(draw(), "merge");
    assert.ok(box, "the merge box");
    const picker = find(box, (n) => n.type === Picker);
    assert.equal(picker.props.value, "p2", "the doubt's record is the one chosen");
    assert.deepEqual(
      picker.props.groups.flatMap((g) => g.options).map((o) => [o.value, o.label, o.sub]),
      [
        ["p2", "Daniela by email", "daniela@example.com"],
        ["p3", "+1 (786) 555-0182", "+1 (786) 555-0182"],
      ],
      "the doubts' records, beside what People holds",
    );
    const confirm = mergeConfirm(draw());
    assert.equal(textOf(confirm.props.question), MERGE_WORDS.question(vm.name, "Daniela by email"));

    // Not the same: the pair's own door, then the page read again.
    const before = world.seen.length;
    byTestId(rows[1], "doubt-apart").props.onClick();
    await settle();
    const sent = world.seen.slice(before).find((r) => r.method === "POST");
    assert.deepEqual(
      [sent?.path, sent?.body],
      ["/api/v1/contacts/p1/doubts/dismiss", { doubt_id: "d2" }],
      "this person's route, the doubt in the body",
    );
    assert.ok(
      world.seen.slice(before).some((r) => r.method === "GET" && r.path === "/api/v1/contacts/p1"),
      "and the page is read again, whole",
    );

    // An operator: Not the same is theirs; the merge is the owner's.
    globalThis.window.__ME = { role: "operator" };
    draw = await profile(vm);
    await settle();
    rows = rowsIn(draw());
    assert.equal(rows.length, 2);
    assert.equal(byTestId(rows[0], "doubt-merge"), null, "no merge for an operator");
    assert.ok(byTestId(rows[0], "doubt-apart"), "not the same is any acting member's");
    // A viewer: the rows say it, and settle nothing.
    globalThis.window.__ME = { role: "viewer" };
    draw = await profile(vm);
    await settle();
    rows = rowsIn(draw());
    assert.equal(rows.length, 2);
    assert.equal(byTestId(rows[0], "doubt-merge"), null);
    assert.equal(byTestId(rows[0], "doubt-apart"), null);
  } finally {
    globalThis.window.__ME = me;
    setSurfaceValue("people", saved);
  }
});

test("the merge is the owner's: an operator's menu does not offer it; the picker leaves out a record the door would refuse, and says when People is not read", async () => {
  const { MERGE_WORDS } = contracts;
  const vm = toPersonVM(detail(), ZONE, new Date(NOW));
  const at = (over) => toPersonRowVM(row(over), ZONE, new Date(NOW));
  const saved = surfaceValue("people");
  const me = globalThis.window.__ME;
  const menuOf = (tree) =>
    find(
      find(tree, (n) => n.props?.className === "cl-prof-queue-actions"),
      (n) => n.type === Menu,
    );
  try {
    globalThis.window.fetch = worldFetch;
    world.holding.clear();
    // An operator: the act is not in their menu.
    globalThis.window.__ME = { role: "operator" };
    setSurfaceValue("people", { ...(saved ?? {}), lists: saved?.lists ?? [], rows: [at({})] });
    let draw = await profile(vm);
    await settle();
    assert.equal(
      actsIn(menuOf(draw())).some((i) => i.label === MERGE_WORDS.act),
      false,
      "an operator is not offered what the route would refuse them",
    );

    // An owner: every other record the door could take, and none it would refuse as two people.
    globalThis.window.__ME = { role: "owner" };
    setSurfaceValue("people", {
      ...(saved ?? {}),
      lists: saved?.lists ?? [],
      rows: [
        at({}),
        at({ id: "p2", display_name: "By email", phone_e164: null, email: "one@example.com", channels: ["email"] }),
        at({ id: "p3", display_name: "Another number", phone_e164: "+17865550199" }),
      ],
    });
    draw = await profile(vm);
    await settle();
    actsIn(menuOf(draw()))
      .find((i) => i.label === MERGE_WORDS.act)
      .onSelect();
    let picker = find(byTestId(draw(), "merge"), (n) => n.type === Picker);
    assert.deepEqual(
      picker.props.groups.flatMap((g) => g.options).map((o) => o.value),
      ["p2"],
      "a record with a different number is two people to the door, and is not offered",
    );
    assert.equal(picker.props.note, undefined);

    // People not read yet: nothing to choose from, and the picker says why.
    setSurfaceValue("people", undefined);
    picker = find(byTestId(draw(), "merge"), (n) => n.type === Picker);
    assert.deepEqual(
      picker.props.groups.flatMap((g) => g.options),
      [],
    );
    assert.equal(picker.props.note, MERGE_WORDS.pickReading);
  } finally {
    globalThis.window.__ME = me;
    setSurfaceValue("people", saved);
  }
});

test("a merge the door refuses says so in the box, in the door's sentence, and a second press while one is out sends nothing", async () => {
  const { MERGE_REFUSALS } = contracts;
  const vm = toPersonVM(detail(), ZONE, new Date(NOW));
  const other = toPersonRowVM(
    row({ id: "p2", display_name: "By email", phone_e164: null, email: "one@example.com", channels: ["email"] }),
    ZONE,
    new Date(NOW),
  );
  const saved = surfaceValue("people");
  const me = globalThis.window.__ME;
  globalThis.window.__ME = { role: "owner" };
  setSurfaceValue("people", {
    ...(saved ?? {}),
    lists: saved?.lists ?? [],
    rows: [toPersonRowVM(row(), ZONE, new Date(NOW)), other],
  });
  const key = "POST /api/v1/contacts/p1/merge";
  try {
    globalThis.window.fetch = worldFetch;
    world.holding.clear();
    world.answers[key] = () => refused(400, MERGE_REFUSALS.deals, "validation");
    const draw = await profile(vm);
    await settle();
    const menu = find(
      find(draw(), (n) => n.props?.className === "cl-prof-queue-actions"),
      (n) => n.type === Menu,
    );
    actsIn(menu)
      .find((i) => i.label === contracts.MERGE_WORDS.act)
      .onSelect();
    const confirmOf = () => mergeConfirm(draw());
    find(byTestId(draw(), "merge"), (n) => n.type === Picker).props.onValueChange("p2");
    confirmOf().props.onType(vm.name);
    const before = world.seen.length;
    // Two presses in one turn: the first is out, and the second finds it out and sends nothing.
    confirmOf().props.onYes();
    confirmOf().props.onYes();
    await settle();
    assert.equal(world.seen.slice(before).filter((r) => r.method === "POST").length, 1, "one request for two presses");
    const after = confirmOf();
    assert.ok(after, "the box stays open on a refusal");
    assert.equal(
      textOf(after.props.error),
      MERGE_REFUSALS.deals,
      "the door's own sentence, where the owner is looking",
    );
    assert.equal(after.props.busy, false);
    // Choosing again clears what the last try said.
    find(byTestId(draw(), "merge"), (n) => n.type === Picker).props.onValueChange("p2");
    assert.equal(confirmOf().props.error, null);
  } finally {
    delete world.answers[key];
    globalThis.window.__ME = me;
    setSurfaceValue("people", saved);
  }
});
