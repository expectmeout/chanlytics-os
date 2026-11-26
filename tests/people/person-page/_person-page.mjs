/**
 * The world a person's page is drawn in, shared by the tests of person-page/: the contracts' words, a window and a
 * stub React, the People surface over a fake wire. Split by behaviour from person-honest.test.mjs on 25 Nov 2026
 * (layer 14: a test file over 1,600 lines is two files); its header, as it was:
 *
 * Not named *.test.mjs on purpose: the runner globs that pattern.
 */
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
import { afterEach } from "node:test";
import assert from "node:assert/strict";
import { legacyAddress } from "../../shell/address/_address.mjs";
import { all, byTestId, find, installRoleStore, kitPages, press, textOf, useStubHooks } from "../../_stub-react.mjs";
import { until } from "../../shared/_until.mjs";
import { importSrc } from "../../_source.mjs";
import * as contracts from "@chanlytics/contracts";
import { hookFrames } from "../../_hook-frames.mjs";
import { bridgeHolds, holdFrameParts, provided } from "../../shell/_bridge-holds.mjs";

// A namespace, not named imports: a word or a filter this slice adds is missing from the module until it
// lands, and a named import of it would fail the whole file rather than the test that needs it.
export const { CONSENT_SOURCES, mayReceive, offersYesRefusal, stateOf, toPersonRowVM } = contracts;

export const filterTimeline = (items, id) => contracts.filterTimeline(items, id);

/**
 * A person as the contract maps them, remembering the detail it was made from: the page reads its person off the wire, so
 * `profile(vm)` answers the request for them with that detail, and the page maps it again as it does in the app.
 */
export const details = new WeakMap();

export const toPersonVM = (dto, ...rest) => {
  const vm = contracts.toPersonVM(dto, ...rest);
  details.set(vm, dto);
  return vm;
};

export const TID = "t-salon";

export const ZONE = "America/New_York";

export const H = 3_600_000;

export const D = 24 * H;

export const NOW = Date.now();

export const iso = (ms) => new Date(NOW - ms).toISOString();

export const ahead = (ms) => new Date(NOW + ms).toISOString();

/** A person the People read returns, the shape people-vm.test.mjs pins (as people/people-page/ copies it). */
export const row = (over = {}) => ({
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
 * A booking ahead, as the calendar match attaches it (calendar/people/): two days ahead on a weekday, so it
 * is still "this week" (Monday to Sunday, by the workspace's clock) -- from a Saturday two days ahead is next week,
 * and the suite failed every weekend. On Saturday it is tomorrow; on Sunday, later today.
 */
export const WEEKDAY = new Date(NOW).toLocaleDateString("en-US", { timeZone: ZONE, weekday: "short" });

export const AHEAD_MS = WEEKDAY === "Sat" ? D : WEEKDAY === "Sun" ? 2 * H : 2 * D;

export const NEXT = {
  id: "b1:1",
  start: ahead(AHEAD_MS),
  end: ahead(AHEAD_MS + 2 * H),
  title: "Color",
  all_day: false,
  via: "phone",
};

export const VISITS = { timezone: ZONE, source: "Google Calendar", state: "ok", next: NEXT, last: null };

/** A profile's detail, as the contacts/[id] route returns it. */
export const detail = (over = {}) => ({
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

/* ---------------------------------- the window ---------------------------------- */

export const listeners = {};

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
export const dispatched = [];

bridgeHolds(
  {
    who: {
      workspaces: [{ id: TID, slug: "salon", name: "Salon", status: "active", timezone: ZONE }],
      activeWorkspaceId: TID,
    },
  },
  { fresh: true },
);
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
};

export const json = (status, body) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

export const quietly = async (fn) => {
  const e = console.error;
  console.error = () => {};
  try {
    return await fn();
  } finally {
    console.error = e;
  }
};

export const { peopleOverride } = await quietly(() => import("../../../apps/dashboard/src/surfaces/people/surface.ts"));

export const { installClock } = await import("../../../apps/dashboard/src/bridge/zone.ts");

installClock();

/**
 * The wire, one for the People read and the person's own: what the profile's courier and the list verbs ask of the server.
 * `people` and `lists` answer the People read; a person's page is answered with the detail the test gave it (`serve`); an
 * `answers` entry ("PUT /api/v1/contacts/p1/details") answers a request itself, and the rest of a person's writes are
 * accepted. A read held (`holdRead`) waits for the test to let it go. Every request is kept, with its body.
 */
export const world = {
  people: [],
  lists: [],
  details: new Map(),
  answers: {},
  seen: [],
  held: [],
  holding: new Set(),
  pending: 0,
};

export const okBody = (data = {}) => json(200, { ok: true, data });

export const refused = (status, message, code = "invalid") => json(status, { ok: false, error: { code, message } });

/** The person's page: what the detail route answers for them, or that they are not in the workspace. */
export const personAnswer = (id) => {
  const dto = world.details.get(id);
  return dto ? okBody({ person: dto }) : refused(404, "This person is not in your workspace.", "not_found");
};

export const CONTACT = /^\/api\/v1\/contacts\/([^/]+)(\/.*)?$/;

export const handleRequest = async (url, init = {}) => {
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
export const worldFetch = globalThis.window.fetch;

/** The People read over a fake wire: these people, a calendar that reads, one saved list. */
export const wire = (people, lists = []) => {
  world.people = people;
  world.lists = lists;
};

/** The requests the wire took, of one method and path. */
export const took = (method, path) => world.seen.filter((q) => q.method === method && q.path === path);

/** A person's page held on the wire until `release`, which lets every read held go: their page, or that they are not here. */
export const holdRead = (id) => {
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

export let cells = [];

// Where each hook keeps its state: by the component that calls it, as React keeps it (_hook-frames.mjs).
export const frames = hookFrames();

export const went = [];

export let ids = 0;

// An effect runs when its inputs change, after its last cleanup, the way React runs it; with no inputs, on every draw.
export const effect = (fn, deps) => {
  const k = frames.key();
  const prev = cells[k];
  if (prev && deps && prev.deps && deps.length === prev.deps.length && deps.every((d, i) => Object.is(d, prev.deps[i])))
    return;
  if (prev && typeof prev.cleanup === "function") prev.cleanup();
  cells[k] = { deps, cleanup: undefined };
  cells[k].cleanup = fn();
};

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
// the bridge's hook the shell's pages call: these tests draw once, and the redraw is proved in shell/surfaces
holdFrameParts();

for (const k of ["StatStrip", "StatCell", "EmptyState", "FailedRead", "StatePill", "mayAtLeast"])
  globalThis[k] = globalThis.window[k];

installRoleStore();

// Menus and questions as their props, drawn by hookless stand-ins, for the People list's scripts (the person's page draws the kit's own).
for (const k of ["MoreMenu", "Confirm", "ChannelGlyph", "TempBar", "ClientTag"]) globalThis[k] = () => null;

// Leads' peek seams (surfaces/leads/peek/seams.ts, which this file does not load), as no-ops that return their own cleanup.
globalThis.leadArmOnReturn = () => () => undefined;

globalThis.leadPeekFocus = () => () => undefined;

bridgeHolds({ who: { me: { role: "owner" } }, parts: { chrome: { state: stateOf } } });
Object.assign(globalThis.window, {
  // The frame's own Back to People, which the person's page asks for (person-verbs.ts backToPeople).
  appBackToPeople: () => went.push("back"),
  AttnRow: () => null,
  CHANLY: {
    nav: (to) => went.push(to),
    address: await legacyAddress(),
    R: { thread: (id) => `inbox/${id}`, segment: (id) => `segments/${id}`, clientSeg: (id) => `clients/seg:${id}` },
  },
  __consentSources: CONSENT_SOURCES,
  __offersYesSources: CONSENT_SOURCES.filter((s) => offersYesRefusal(s.id) === null),
  __mayReceive: mayReceive,
});
bridgeHolds({ parts: { toast: () => [null, () => {}] } });

// The bridge's own globals for a profile.
export const { installPeopleCourier } = await import("../../../apps/dashboard/src/surfaces/people/people-detail.ts");

export const { staleReadCaches } = await import("../../../apps/dashboard/src/bridge/read-cache.ts");

installPeopleCourier();

// The kit's components and the hooks the TSX draws with: the stub's, on the react module the TSX imports them from.
useStubHooks();

// People's own list page (the tests that draw it beside the profile), the New list row and the kit's Icon the TSX draws.
export const { PeopleReal } = await importSrc("apps/dashboard/src/surfaces/people/page/people-real.tsx");

export const { NewListRow } = await importSrc("apps/dashboard/src/surfaces/people/rail/new-list.tsx");

export const { Icon: KitIcon } = await importSrc("apps/dashboard/src/surfaces/kit/icon/icon.tsx");

// The person's page and what it draws, which are TSX (surfaces/people): imported as the app imports them, after the window
// they read is in place. Its parts are read off the same modules the page draws them from, so a node is found by its type.
export const P = "../../../apps/dashboard/src/surfaces/people";

export const { ClientProfile } = await import(`${P}/person/person-real.tsx`);

export const { PersonLists } = await import(`${P}/person/lists.tsx`);

export const { ListsSheet } = await import(`${P}/person/sheets/lists-sheet.tsx`);

export const { PersonDealCard } = await import(`${P}/deal/person-deal.tsx`);

export const { personDetail } = await import(`${P}/people-detail.ts`);

export const { setSurfaceValue, surfaceValue } = await import("../../../apps/dashboard/src/surfaces/surface-values.ts");

export const { clearReadCaches } = await import("../../../apps/dashboard/src/bridge/read-cache.ts");

export const { recFolds } = await import("../../../apps/dashboard/src/surfaces/kit/record/registry.ts");

export const { setStatus } = await import("../../../apps/dashboard/src/bridge/surface-status.ts");

// The write that lands moves the surfaces the refresh map names, through a module the loader hands over off the main
// thread: loaded before a test waits on a write, so it is not the wait.
await import("../../../apps/dashboard/src/bridge/refresh-map.ts");

export const { StatePill } = kitPages;

// The person's More is the kit's Menu (surfaces/kit/menu): its trigger is the page's Button, its items in groups.
export const { Menu } = await import(`${P}/../kit/menu/menu.tsx`);

export const { Picker } = await import(`${P}/../kit/picker/picker.tsx`);

export const { Confirm: KitConfirm } = await import(`${P}/../kit/confirm/confirm.tsx`);

export const { SubTabs } = await import(`${P}/../kit/sub-tabs/sub-tabs.tsx`);

// The page says its own head to the frame (kit/head/standing.ts): a null title, and its way back to People.
export const { standingSaid } = await import(`${P}/../kit/head/standing.ts`);

export const itemsIn = (menu) => menu.props.groups.flatMap((g) => g.items);

/** The kit Menu's items as the page built them: an item's act is `onSelect`, given here as `onClick` too. */
export const actsIn = (menu) => itemsIn(menu).map((i) => ({ ...i, onClick: i.onSelect }));

/** The Menu of a drawn tree, and what a bar's menu says on its button (its trigger's words). */
export const menuByWords = (tree, words) =>
  find(tree, (n) => n.type === Menu && textOf(n.props.trigger).trim() === words);

export const tick = () => new Promise((r) => setTimeout(r, 0));

/** Turns of the loop for what a press started to finish: and for every request out to be answered, and what follows it (a held one is not out). */
export const settle = async (n = 8) => {
  for (let i = 0; i < n; i += 1) await tick();
  await idle();
};

/** Every request out answered, and a turn for what its answer started. */
export const idle = async () => {
  for (let i = 0; i < 200 && world.pending > 0; i += 1) await tick();
  await tick();
};

/** The People page over the real surface. */
export const peoplePage = async (people, lists = []) => {
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
export const newTree = async () => {
  await idle();
  cells = [];
  went.length = 0;
  for (const k of Object.keys(listeners)) delete listeners[k];
  clearReadCaches();
  recFolds.reset();
};

/** A person's page is the wire's answer for them: the detail the contract mapped this person from. */
export const serve = (vm) => {
  const dto = details.get(vm);
  assert.ok(dto, "the person served is one this file mapped, so the wire has their detail");
  world.details.set(vm.id, dto);
};

/** The page for a person, as the shell draws it at their id, on the tab its address names (decision 0052, 13). */
export const pageFor = (id, tab) => {
  frames.begin();
  return ClientProfile(tab ? { id, tab } : { id });
};

/** A loaded profile at the address asked for (the page, else a view of its own): the load run, then drawn again. */
export const profile = async (vm, tab) => {
  await newTree();
  serve(vm);
  const draw = () => pageFor(vm.id, tab);
  await until(() => byTestId(draw(), "person-page"), "the person's page is drawn");
  await settle(2);
  return draw;
};

/**
 * The tab's storage for a test that reads what a press carries to the thread's composer (a send opens the thread with its
 * words ready): the composer's slot alone is kept, since the tab keeps the people it read in the same storage (read-cache.ts).
 * Answers the way to put the tab's own back.
 */
export const carryingCompose = (carried) => {
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

/* ----------------------------------- the address (00125) ----------------------------------- */

/** What the wire answers for a write, as the door does: accepted, or refused with its code and words. */
export const answerOf = (answer) =>
  answer.ok ? okBody(answer.data) : refused(answer.code === "conflict" ? 409 : 422, answer.message, answer.code);

/** A profile drawn over a wire whose save of the person's details records what it is sent and answers as told. */
export const profileSaving = async (vm, answer = { ok: true, data: {} }) => {
  const sent = [];
  const door = `PUT /api/v1/contacts/${vm.id}/details`;
  world.answers[door] = (body) => {
    sent.push([vm.id, body]);
    return answerOf(answer);
  };
  const draw = await profile(vm);
  return { draw, sent, restore: () => delete world.answers[door] };
};

export const type = (input, value) => input.props.onChange({ target: { value } });

// A value typed in place (kit/record/in-place.tsx) takes the keys, then its words, from the box's own events.
export const takeKeys = (box) => box.props.onFocus({ currentTarget: {} });

export const typeIn = (box, words) => box.props.onInput({ currentTarget: { textContent: words } });

/* ------------------------------- their own message (00137) ------------------------------- */

/** A profile whose two consent doors record what they are sent and answer yes, in a real workspace whichever test ran first. */
export const profileRecording = async (vm) => {
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

export const said = (id, hoursAgo, body, over = {}) => ({
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

export const reply = (id, hoursAgo, body) =>
  said(id, hoursAgo, body, { direction: "outbound", sender: "ai", status: "sent" });

export const withMessages = (messages) => {
  const d = detail();
  return toPersonVM({ ...d, conversations: [{ ...d.conversations[0], messages }] }, ZONE, new Date(NOW));
};

export const segment = (tree, ask, word) =>
  find(byTestId(tree, ask), (n) => n.type === "button" && textOf(n).trim() === word);

export const way = (tree, ask, word) =>
  find(byTestId(tree, `${ask}-how`), (n) => n.type === "button" && textOf(n).trim() === word);

/** Press a choice of the kit's toggle group by its words (the notes composer's For and day). */
export const chooseIn = (tree, group, word) =>
  press(find(byTestId(tree, group), (n) => n.props?.role === "radio" && textOf(n).trim() === word));

/* --------------------------- the person is the hub: runs, lists, the lead --------------------------- */

export const LEAD = "0f0f0f0f-0f0f-4f0f-8f0f-0f0f0f0f0f0f";

/** One of ours, as a run or a person sent it: the meta the send job writes (core messages/broadcast/batch.ts). */
export const ours = (id, at, meta, sender = "human") => ({
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

export const theirs = (id, at) => ({
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

export const run = (over) => ({
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
export const withRuns = () => {
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

/* ------------------------------ lists that keep themselves current (00155) ------------------------------ */

export const SMART = {
  id: "s2",
  name: "WhatsApp people",
  ids: [],
  rule: { all: [{ field: "channel", op: "is", channel: "whatsapp" }] },
};

/* ----------------------------------- the Deal section (0004, 0008) ----------------------------------- */

/** A person's deal row, as the route lists it, and the row's columns for it, as people_list's lateral join picks it. */
export const dealRow = (over = {}) => ({
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

export const withDeals = (deals, over = {}, rowOver = {}) => {
  const d = contracts.pickCurrentDeal(deals);
  return toPersonVM(
    detail({
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
export const sheetAsks = () => {
  const asked = [];
  bridgeHolds({
    parts: {
      sheets: {
        ...provided("sheets"),
        openDeal: (ask) => {
          asked.push(ask);
          return true;
        },
      },
    },
  });
  return asked;
};

export const cardOf = (t) => byTestId(t, "person-deal-card");

/**
 * The Deals tab with each deal's row folded open (canvas A: a deal is a row, its name the press that folds the rest
 * open under it), drawn again after the press.
 */
export const openedRow = async (vm, tab) => {
  const draw = await profile(vm, tab);
  for (const title of all(draw(), (n) => n.props?.["data-testid"] === "person-deal-title")) press(title);
  return draw();
};

/** A deal's next act where the one page draws it: Now's rung for the deal, else the card's own (the card keeps its other moves). */
export const nextActOf = (t) => {
  const rung = find(t, (n) => n.props?.["data-testid"] === "person-up-next-row" && n.props["data-kind"] === "deal");
  return rung ? byTestId(rung, "person-up-next-act") : byTestId(t, "person-deal-next");
};

export const movesOf = (t) => all(t, (n) => n.type === "button" && n.props?.["data-testid"] === "person-deal-move");

/* ------------------------------ opening a person is as quick as the tab can make it ------------------------------ */

/**
 * The wire's answer for each person a page reads (GET contacts/[id]), on top of the People read: the people read, in
 * order, by id. The courier the People page calls is people-detail.ts's own (warmPerson, warmPeople), so what these
 * two tests hold is what it sends, not a stub of it. The wire is put back when the test ends: the tests after them read
 * a person the world's own answers say.
 */
export const personReads = (t) => {
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

/* ----------------------------------- notes (0007) ----------------------------------- */

export const noteDto = (id, body, hoursAgo, over = {}) => ({
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

export const NOTE_TEAM = [
  { id: "u-me", name: "Ruben", me: true },
  { id: "u-sam", name: "Sam", me: false },
];

export const withNotes = () =>
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

/**
 * The notes card's doors on the wire (POST contacts/<id>/notes, and /done, /remove, /decide), recording what the page asks of
 * them as [door, person, body] in the order it asks, and accepting each.
 */
/**
 * History's Notes tab (canvas A): every note with its acts, the suggestions and the composer, where the Overview keeps
 * the newest note alone. Answers the page's draw, on that tab.
 */
export const notesTab = async (vm) => {
  const draw = await profile(vm, "history");
  const strip = () =>
    find(draw(), (n) => n.type === SubTabs && n.props.tabs.some((x) => x.testid?.startsWith("timeline-filter-")));
  await until(strip, "History's strip is drawn");
  strip().props.onSelect("notes");
  return draw;
};

export const recordingNotes = (sent, id = "p1") => {
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

/* ----------------------------------- steps (0007, amended; 00166) ----------------------------------- */

/** A day by the business's calendar, some days from now: far enough from a midnight that no zone moves it. */
export const dayFrom = (days) => contracts.zoneDayKey(NOW + days * 86_400_000, ZONE);

export const stepNotes = () => [
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

/** The merge's typed question: the kit's Confirm in its sheet's foot, where the pick and what it does are the body. */
export const mergeConfirm = (tree) =>
  find(find(tree, (n) => n.props?.testid === "person-merge-sheet")?.props.foot, (n) => n.type === KitConfirm);

/** Sets the world's `cells` for a test, as its assignment did: a module that imports a binding cannot assign it. */
export const setCells = (value) => (cells = value);
