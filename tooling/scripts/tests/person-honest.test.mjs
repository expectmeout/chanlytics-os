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
import { hookFrames } from "./_hook-frames.mjs";

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
/** A booking two days ahead, as the calendar match attaches it (calendar-people.test.mjs). */
const NEXT = {
  id: "b1:1",
  start: ahead(2 * D),
  end: ahead(2 * D + 2 * H),
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
  body: {},
  activeElement: null,
  addEventListener() {},
  removeEventListener() {},
  getElementById: () => null,
  createElement: () => ({ setAttribute() {}, style: {}, classList: { add() {}, remove() {} } }),
};
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
    for (const fn of [...(listeners[ev.type] || [])]) fn(ev);
    return true;
  },
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
const { peopleOverride } = await quietly(() => import("../../../apps/dashboard/src/legacy-bridge/surface-data.ts"));
const { installClock } = await import("../../../apps/dashboard/src/legacy-bridge/zone.ts");
installClock();

/** The People read over a fake wire: these people, a calendar that reads, one saved list. */
const wire = (people, lists = []) => {
  globalThis.window.fetch = async (url) => {
    const u = new URL(String(url), "https://app.chanlytics.com");
    if (u.pathname === "/api/v1/contacts")
      return json(200, {
        ok: true,
        data: {
          people,
          page: { q: null, offset: 0, limit: 1000, total: people.length, has_more: false },
          calendar: { state: "ok", source: "Google Calendar" },
          booking_link: null,
        },
      });
    if (u.pathname === "/api/v1/segments") return json(200, { ok: true, data: { lists } });
    if (u.pathname === "/api/v1/views") return json(200, { ok: true, data: { views: {} } });
    return json(404, { ok: false, error: { code: "not_found", message: `no ${u.pathname}` } });
  };
};

let cells = [];
// Where each hook keeps its state: by the component that calls it, as React keeps it (_hook-frames.mjs).
const frames = hookFrames();
const went = [];
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
  // An effect runs when its inputs change, after its last cleanup, the way React runs it; with no inputs, on every draw.
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
};
globalThis.ReactDOM = { createPortal: (node) => node };
await import("../../../apps/dashboard/src/legacy/components/data-bits.jsx");
for (const k of ["StatStrip", "StatCell", "EmptyState", "FailedRead", "StatePill"])
  globalThis[k] = globalThis.window[k];
// Menus and questions as their props, drawn by hookless stand-ins.
for (const k of ["MoreMenu", "Confirm", "ChannelGlyph", "TempBar", "ClientTag"]) globalThis[k] = () => null;
globalThis.useHotkey = () => {};
// Leads' peek seams (leads-peek.jsx, which this file does not load), as no-ops that return their own cleanup.
globalThis.leadArmOnReturn = () => () => undefined;
globalThis.leadPeekFocus = () => () => undefined;
Object.assign(globalThis.window, {
  usePPToast: () => [null, () => {}],
  AttnRow: () => null,
  CHANLY: {
    nav: (to) => went.push(to),
    R: { thread: (id) => `inbox/${id}`, segment: (id) => `segments/${id}`, clientSeg: (id) => `clients/seg:${id}` },
  },
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
await import("../../../apps/dashboard/src/legacy/pages/people-table.jsx");
for (const k of [
  "PeopleTable",
  "PeopleColumnsMenu",
  "plLocked",
  "plShows",
  "plSortKeys",
  "plDrawnColumns",
  "plShownColumns",
  "plColumnChoices",
  "plColumnOptions",
  "PL_NO_SEL",
  "PL_FIRST_ROWS",
])
  globalThis[k] = globalThis.window[k];
await import("../../../apps/dashboard/src/legacy/pages/clients-a.jsx");
// The record kit, as both load lists put it before the pages: the profile's card draws its rows and folds.
for (const f of ["record-row", "record-field", "record-fold", "record-sheet"])
  await import(`../../../apps/dashboard/src/legacy/components/${f}.jsx`);
// A person's deal (0008), which the profile draws first in its column: before the profile, as both load lists put it.
await import("../../../apps/dashboard/src/legacy/pages/person-deal.jsx");
await import("../../../apps/dashboard/src/legacy/pages/client-profile.jsx");

const walk = (n, fn) => {
  if (n == null || typeof n !== "object") return;
  fn(n);
  for (const k of n.props?.children ?? []) walk(k, fn);
  if (n.rendered) walk(n.rendered, fn);
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
/** A node's words in reading order: what a drawn component rendered, else its children in turn. */
const textOf = (n) => {
  if (n == null || typeof n === "boolean") return "";
  if (typeof n === "string" || typeof n === "number") return String(n);
  if (Array.isArray(n)) return n.map(textOf).join("");
  if (n.rendered !== undefined) return textOf(n.rendered);
  return (n.props?.children ?? []).map(textOf).join("");
};
const tick = () => new Promise((r) => setTimeout(r, 0));
const settle = async (n = 8) => {
  for (let i = 0; i < n; i += 1) await tick();
};
const press = (node) => node.props.onClick({ stopPropagation() {}, preventDefault() {} });

/** The People page over the real surface. */
const peoplePage = async (people, lists = []) => {
  wire(people, lists);
  await quietly(() => peopleOverride.apply());
  cells = [];
  went.length = 0;
  for (const k of Object.keys(listeners)) delete listeners[k];
  return () => {
    frames.begin();
    return globalThis.window.ClientsA({ onOpenProfile: (id) => went.push(`profile:${id}`) });
  };
};
/** A loaded profile: the load effect run, then drawn again. */
const profile = async (vm) => {
  globalThis.window.__personDetail = async () => vm;
  cells = [];
  went.length = 0;
  const draw = () => {
    frames.begin();
    return globalThis.window.ClientProfile({ id: vm.id, onBack: () => went.push("back") });
  };
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
    textOf(find(tree, (n) => n.type === "th" && n.props?.className?.includes("sortable"))).replace(/[▲▼]/g, ""),
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

test("REGRESSION (B15): the bulk bar's receptionist menu uses the one set of words -- it said Answer them and Stay out", async () => {
  const draw = await peoplePage([
    row(),
    row({ id: "p2", display_name: "Ana Ruiz", phone_e164: "+17865550182", latest_conversation_id: "cv2" }),
  ]);
  globalThis.window.__setPersonReceptionistMany = async () => ({ ok: true, done: 2, failed: 0 });
  let tree = draw();
  byTestId(tree, "select-all").props.onChange();
  tree = draw();
  const menu = find(tree, (n) => n.props?.label === "Receptionist");
  assert.deepEqual(
    menu.props.items.filter((i) => !i.header).map((i) => i.label),
    ["Answer", "Ask me first", "Never", "Follow the workspace"],
  );
});

/* ------------------------------------- the profile ------------------------------------- */

test("REGRESSION (B19, B15): a profile goes back to People, and names following the workspace the way the menu does", async () => {
  const draw = await profile(toPersonVM(detail(), ZONE, new Date(NOW)));
  const tree = draw();
  assert.equal(
    textOf(find(tree, (n) => n.props?.className === "cl-prof-back")).trim(),
    "People",
    "REGRESSION: All clients",
  );
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
  const draw = await profile(vm);
  let tree = draw();
  // The fixture's one visit has not happened: it is Coming up, not History, and it is a door to its day.
  const ahead = all(tree, (n) => n.props?.["data-testid"] === "person-visit-ahead");
  assert.equal(ahead.length, 1, "the visit ahead is Coming up");
  assert.ok(
    byTestId(tree, "timeline-filter-all") &&
      byTestId(tree, "timeline-filter-messages") &&
      byTestId(tree, "timeline-filter-visits"),
    "a filter for each kind History holds",
  );
  assert.equal(byTestId(tree, "timeline-filter-calls"), null, "and none for a kind it does not");
  for (const open of all(tree, (n) => n.props?.["data-testid"] === "timeline-open")) press(open);
  press(ahead[0]);
  const day = toPersonRowVM(row({ visits: VISITS }), ZONE, new Date(NOW)).nextVisitDate;
  assert.ok(went.includes("inbox/th-cv1") && went.includes(`calendar/${day}`), `the doors: ${went}`);
  press(byTestId(tree, "timeline-filter-visits"));
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
  cells = [];
  frames.begin();
  const lists = globalThis.window.PersonLists({ personId: "p1", canEdit: true, first: "Daniela", flash: () => {} });
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
  const lists = globalThis.window.PersonLists({ personId: "p1", canEdit: true, first: "Daniela", flash: () => {} });
  const add = find(lists, (n) => n.type === globalThis.MoreMenu);
  assert.equal(add.props.testid, "person-list-add");
  assert.equal(add.props.escape, true, "placed against the window, so the card's rounded clip cannot cut it off");
  assert.deepEqual(
    add.props.items.map((i) => i.header || i.label),
    ["Best buyers"],
    "the lists they are not on, and no header saying Add to under a link that says it",
  );
  assert.ok(
    add.props.btnClass.split(" ").includes("is-plain"),
    "a quiet link under the chips, as Add an email is, not a button among them",
  );
});

test("REGRESSION: a person's page says who they are once -- the header held two buttons to one thread and two pills, a card quoted the timeline's first two messages, and six cells said the rail again", async () => {
  const vm = toPersonVM(detail({ booking_link: "https://book.example/salon" }), ZONE, new Date(NOW));
  const draw = await profile(vm);
  const tree = draw();
  const cls = (n) => String(n.props?.className || "");

  // Who they are: the name, then one line with the number and since when.
  const line = byTestId(tree, "person-id-line");
  assert.ok(
    line && textOf(line).includes(vm.phone) && textOf(line).includes("since "),
    `the line under the name: ${line && textOf(line)}`,
  );
  const id = find(tree, (n) => cls(n) === "cl-prof-id");
  assert.deepEqual(
    all(id, (n) => n.type === "button").map((b) => b.props["data-testid"]),
    ["person-rename"],
    "REGRESSION: between 901 and 1250px the header's buttons kept their width and the name's column went to zero",
  );
  assert.deepEqual(
    all(id, (n) => typeof n.type === "function" && n.type.name === "StatePill").map((s) => s.props.value),
    [vm.rightNow.tone],
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
  const more = find(actions, (n) => n.type === globalThis.MoreMenu && n.props.testid === "person-more");
  assert.ok(
    byTestId(actions, "person-open-thread") && more && more.props.label === "More",
    "the thread beside who they are, and the rest behind More, in words: a ⋯ was too quiet to find",
  );
  assert.ok(
    more.props.items.some((i) => i.label === "Send booking link"),
    "REGRESSION: 'Send the booking-link template' was a button of its own beside a thread button to the same place",
  );

  assert.ok(
    !find(tree, (n) => cls(n) === "cl-prof-narr"),
    "REGRESSION: Last exchange quoted the two messages the timeline opens on",
  );
  assert.ok(!find(tree, (n) => cls(n).includes("cl-prof-money")), "REGRESSION: six cells said the rail's facts again");

  // About carries the strip's counts, and not what the line under the name says.
  const keys = all(tree, (n) => n.props?.className === "cl-prof-attr-key").map((k) => textOf(k));
  assert.ok(keys.includes("History"), `About: ${keys}`);
  for (const k of ["Phone", "Channels", "First contact"])
    assert.ok(!keys.includes(k), `${k} is said under the name, not again in About: ${keys}`);
  assert.ok(byTestId(tree, "fact-next-visit"), "the next visit still opens its day, from About");

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
    const draw = await profile(vm);
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
  const draw = await profile(vm);
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
  const tree2 = (await profile(few))();
  const fewPast = few.timeline.filter((i) => !i.ahead).length;
  assert.equal(rowsOf(tree2), fewPast, `${fewPast} rows, all drawn`);
  assert.equal(byTestId(tree2, "timeline-older"), null, "a fold of three rows is not worth a press");
});

test("Right now says the state once: the pill wears the standing's word, the sentence gives the reason, and the receptionist is named once", async () => {
  const vm = toPersonVM(detail(), ZONE, new Date(NOW));
  assert.equal(vm.rightNow.tone, "escalated");
  assert.match(
    vm.rightNow.detail,
    /^Asked for a person · since .*\. Paused until someone answers\.$/,
    vm.rightNow.detail,
  );
  const draw = await profile(vm);
  const tree = draw();
  const card = byTestId(tree, "person-now");
  assert.equal(card.props["data-tone"], "escalated", "the line wears the tone the pill wears");
  assert.ok(
    !String(card.props.className).includes("approval"),
    "REGRESSION: an accent edge on a card whose pill is warn",
  );
  const pill = find(card, (n) => typeof n.type === "function" && n.type.name === "StatePill");
  assert.equal(pill.props.value, "escalated");
  assert.equal(
    pill.props.label,
    undefined,
    "REGRESSION: the pill carried the whole title -- Escalated · asked for a person -- and spilled past the card between 901 and 990px",
  );
  const words = textOf(card);
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

test("a frame with nobody to draw has no rail column; History leads About; ten seconds on the phone is not one minute", async () => {
  globalThis.window.__personDetail = async () => null;
  cells = [];
  const frame = () => {
    frames.begin();
    return globalThis.window.ClientProfile({ id: "p-none", onBack: () => went.push("back") });
  };
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
  const keys = all(tree, (n) => n.props?.className === "cl-prof-attr-key").map((k) => textOf(k));
  assert.equal(keys[0], "History", `History leads: ${keys}`);
  const history = find(
    tree,
    (n) =>
      n.props?.className === "cl-prof-attr" &&
      textOf(find(n, (k) => k.props?.className === "cl-prof-attr-key")) === "History",
  );
  assert.match(textOf(history), /1 call, 12 s/, textOf(history));
});

test("a person known by number is invited to name them; an empty Lists section is a door to Lists", async () => {
  const vm = toPersonVM(
    detail({ row: row({ visits: VISITS, display_name: null, wa_profile_name: null }) }),
    ZONE,
    new Date(NOW),
  );
  assert.equal(vm.givenName, null);
  const saved = globalThis.window.__PEOPLE;
  globalThis.window.__PEOPLE = { ...(saved || {}), saved: [], savedRead: true };
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
    assert.match(textOf(lists), /No lists kept by hand yet\./);
    went.length = 0;
    press(byTestId(lists, "person-lists-make"));
    assert.deepEqual(
      went,
      ["clients/new-list"],
      "REGRESSION: 'make one on the People rail' -- a rail a phone does not have; the door says in the address that the box opens, never a timer",
    );
  } finally {
    globalThis.window.__PEOPLE = saved;
  }
});

/* ----------------------------------- the address (00125) ----------------------------------- */

/** A profile drawn with the bridge's save replaced by a recorder that answers as told. */
const profileSaving = async (vm, answer = { ok: true, data: {} }) => {
  const sent = [];
  const saved = { details: globalThis.window.__setPersonDetails, why: globalThis.window.__whyNotAnEmail };
  globalThis.window.__setPersonDetails = async (id, body) => {
    sent.push([id, body]);
    return answer;
  };
  globalThis.window.__whyNotAnEmail = contracts.whyNotAnEmail;
  const draw = await profile(vm);
  const restore = () => {
    globalThis.window.__setPersonDetails = saved.details;
    globalThis.window.__whyNotAnEmail = saved.why;
  };
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
    assert.deepEqual(
      keys.slice(0, 2),
      ["History", "Email"],
      `someone who may change it gets the row while it is empty: ${keys}`,
    );
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
    find(tr, (n) => n.type === "Icon" && n.props?.name === "mail") !== null,
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

/** A profile whose two consent doors are recorders that answer yes, in a real workspace whichever test ran first. */
const profileRecording = async (vm) => {
  globalThis.window.__PEOPLE ??= { saved: [], savedRead: true };
  const sent = [];
  const saved = { visit: globalThis.window.__setPersonConsent, offers: globalThis.window.__setPersonMarketingConsent };
  globalThis.window.__setPersonConsent = async (id, body) => {
    sent.push(["visit", id, body]);
    return { ok: true, data: {} };
  };
  globalThis.window.__setPersonMarketingConsent = async (id, body) => {
    sent.push(["offers", id, body]);
    return { ok: true, data: {} };
  };
  const draw = await profile(vm);
  const restore = () => {
    globalThis.window.__setPersonConsent = saved.visit;
    globalThis.window.__setPersonMarketingConsent = saved.offers;
  };
  return { draw, sent, restore };
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
    run({ broadcast_id: "b-queued", name: "Autumn offer", state: "queued", scheduled_for: ahead(D) }),
    run({
      broadcast_id: "b-win",
      name: "Win-back · Sep 1",
      playbook_id: "pb1",
      playbook_name: "Win-back",
      sent_at: iso(10 * D),
      message_id: "mb-win",
    }),
    run({ broadcast_id: "b-spring", name: "Spring offer", sent_at: iso(20 * D), message_id: "mb-spring" }),
    run({
      broadcast_id: "b-held",
      name: "Summer offer",
      state: "skipped",
      reason: "no_marketing_consent",
      scheduled_for: iso(40 * D),
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
      ["b-queued", "Autumn offer", "Broadcast · Waiting to send", "plain", "broadcasts/run:b-queued"],
      ["b-win", "Win-back", "Playbook · Replied", "ok", "broadcasts/run:b-win"],
      ["b-spring", "Spring offer", "Broadcast · Sent", "plain", "broadcasts/run:b-spring"],
      ["b-held", "Summer offer", "Broadcast · Held — no yes to offers", "warn", "broadcasts/run:b-held"],
      ["b-refused", "May offer", "Broadcast · Didn't send — WhatsApp refused", "warn", "broadcasts/run:b-refused"],
    ],
    "newest first; a reply inside the window is a reply, one four days later is not",
  );
  assert.ok(
    vm.campaigns.every((c) => c.when && c.when !== "—"),
    "each is dated",
  );
});

test("REGRESSION: the timeline says who sent each of ours in the Inbox's words -- every one read 'You', a playbook's run among them", () => {
  const vm = toPersonVM(withRuns(), ZONE, new Date(NOW));
  const who = (id) => vm.timeline.find((i) => i.id === `m-${id}`)?.who;
  assert.equal(who("mb-win"), "The Win-back playbook");
  assert.equal(who("mb-spring"), "A broadcast (Spring offer)");
  assert.equal(who("m-team"), "Your team", "the row does not say which member sent it");
  assert.equal(who("m1"), "Daniela", "their own words are theirs");
  // A run's message that kept no meta is still the run's: its recipient row names it.
  const bare = withRuns();
  bare.conversations[0].messages = bare.conversations[0].messages.map((m) =>
    m.id === "mb-win" ? { ...m, meta: null } : m,
  );
  const again = toPersonVM(bare, ZONE, new Date(NOW));
  assert.equal(again.timeline.find((i) => i.id === "m-mb-win")?.who, "The Win-back playbook");
  // A playbook whose name has its own article keeps one, here and in the Inbox (messageAuthor).
  const offer = ours("mb-offer", iso(D), {
    source: "broadcast",
    broadcast_name: "x",
    playbook_name: "The month's offer",
  });
  assert.equal(
    contracts.messageAuthor(offer).words,
    "The month's offer playbook",
    "REGRESSION: the The month's offer playbook",
  );
});

test("a person's page names the lists that keep themselves current and have them on, by the rail's own tests -- and not the ones it already says", () => {
  const booked = toPersonVM(detail(), ZONE, new Date(NOW));
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

test("the profile's Campaigns rows open each run's report, and its Lists name the lists that keep themselves current, each opening on People", async () => {
  const vm = toPersonVM(withRuns(), ZONE, new Date(NOW));
  const draw = await profile(vm);
  const rows = all(draw(), (n) => n.props?.["data-testid"] === "person-campaign");
  assert.equal(rows.length, 5);
  assert.ok(textOf(rows[1]).includes("Win-back") && textOf(rows[1]).includes("Playbook · Replied"), textOf(rows[1]));
  press(rows[1]);
  assert.deepEqual(went, ["broadcasts/run:b-win"]);
  const quiet = await profile(toPersonVM(detail(), ZONE, new Date(NOW)));
  assert.equal(byTestId(quiet(), "person-campaigns"), null, "no runs, no section");

  await peoplePage([row()], [{ id: "s1", name: "Regulars", ids: ["p1"] }]);
  cells = [];
  frames.begin();
  const lists = globalThis.window.PersonLists({
    personId: "p1",
    canEdit: true,
    first: "Daniela",
    flash: () => {},
    smart: [{ id: "booked", label: "Booked" }],
  });
  const chip = byTestId(lists, "person-smart-chip");
  assert.ok(chip && textOf(chip).includes("Booked"));
  press(find(chip, (n) => n.type === "button"));
  assert.deepEqual(went, ["clients/seg:booked"]);
});

test("clients/new-list opens People with the New list box open from the first draw -- the door fired segments:new on a 450ms timer and hoped", async () => {
  await peoplePage([row()], []);
  const was = globalThis.window.__lists;
  globalThis.window.__lists = { create: async () => ({ ok: true, data: { id: "s9" } }) };
  try {
    cells = [];
    frames.begin();
    globalThis.window.ClientsA({ onOpenProfile: () => {}, newList: true });
    frames.begin();
    const tree = globalThis.window.ClientsA({ onOpenProfile: () => {}, newList: true });
    assert.ok(byTestId(tree, "new-list-name"), "the box, open, waiting for a name");
  } finally {
    globalThis.window.__lists = was;
  }
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
  const lists = globalThis.window.PersonLists({ personId: "p1", canEdit: true, first: "Daniela", flash: () => {} });
  const chips = all(lists, (n) => n.props?.["data-testid"] === "person-list-chip");
  assert.deepEqual(chips.map(textOf), ["WhatsApp people"], "on the smart list today");
  assert.equal(
    find(chips[0], (n) => String(n.props?.className ?? "").includes("cl-seg-filter-x")),
    null,
    "no cross on a rule",
  );
  const menu = find(lists, (n) => n.type === globalThis.MoreMenu);
  assert.deepEqual(
    menu.props.items.filter((i) => i.label).map((i) => i.label),
    ["Regulars"],
    "Add to offers only the lists kept by hand",
  );
});

test("a new list may be described: the assistant drafts a rule, the box shows its chips, who it holds for and what it left out, and Save makes the smart list", async () => {
  const made = [];
  const drafted = [];
  const was = globalThis.window.__lists;
  globalThis.window.__lists = {
    ...(was || {}),
    draft: async (words) => {
      drafted.push(words);
      return {
        ok: true,
        data: {
          name: "Drifting",
          rule: { all: [{ field: "last_visit", op: "more_than", days: 60 }] },
          cannot: "who their stylist is",
        },
      };
    },
    parts: (r) => contracts.listRuleParts(r),
    count: () => 3,
  };
  try {
    cells = [];
    const onCreate = async (name, rule) => {
      made.push([name, rule]);
      return { ok: true };
    };
    const draw = () => {
      frames.begin();
      return globalThis.window.NewListRow({ onCreate });
    };
    press(byTestId(draw(), "new-list"));
    press(byTestId(draw(), "new-list-smart"));
    byTestId(draw(), "new-list-words").props.onChange({ target: { value: "regulars who stopped coming" } });
    await press(byTestId(draw(), "new-list-build"));
    await new Promise((r) => setTimeout(r, 0));
    const tree = draw();
    assert.deepEqual(drafted, ["regulars who stopped coming"]);
    assert.deepEqual(all(tree, (n) => n.props?.["data-testid"] === "new-list-rule").map(textOf), [
      "Last visit more than 60 days ago",
    ]);
    assert.equal(textOf(byTestId(tree, "new-list-holds")), "3 people on it today, and it keeps itself current.");
    assert.equal(textOf(byTestId(tree, "new-list-cannot")), "Left out: who their stylist is");
    assert.equal(byTestId(tree, "new-list-name").props.value, "Drifting", "the draft's name, to change or keep");
    await press(byTestId(tree, "new-list-add"));
    assert.deepEqual(made, [["Drifting", { all: [{ field: "last_visit", op: "more_than", days: 60 }] }]]);
  } finally {
    globalThis.window.__lists = was;
  }
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
  const moreOf = (t) => find(t, (n) => n.type === globalThis.MoreMenu && n.props.testid === "person-more");
  const labels = (t) =>
    moreOf(t)
      ? moreOf(t)
          .props.items.filter((i) => i.label)
          .map((i) => i.label)
      : [];
  const items = moreOf(tree).props.items.filter((i) => i.label);
  assert.deepEqual(
    items.slice(0, 2).map((i) => i.label),
    ["Send booking link", "Send proposal"],
    "the booking link, then the proposal",
  );
  assert.ok(
    /^Opens their thread with it ready to send/.test(items[1].title),
    `what it does, on hover: ${items[1].title}`,
  );
  const send = { props: { onClick: items[1].onClick } };

  // The press carries the contract's words into the thread's composer and opens the thread; nothing is sent.
  const carried = [];
  globalThis.sessionStorage = { setItem: (k, v) => carried.push([k, v]), getItem: () => null, removeItem: () => {} };
  globalThis.window.__proposalMessage = contracts.proposalMessage;
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
    delete globalThis.sessionStorage;
    delete globalThis.window.__proposalMessage;
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
  assert.ok(!labels(tree).some((l) => /proposal/.test(l)), "no proposal, no send");

  // A viewer sends nothing, and may still call them from their own phone.
  globalThis.window.__ME = { role: "viewer" };
  try {
    tree = (await profile(vm))();
    assert.ok(!labels(tree).some((l) => /^Send/.test(l)), `a viewer sends nothing: ${labels(tree)}`);
    assert.ok(labels(tree).includes("Call"));
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
  assert.ok(!labels(tree).some((l) => /^Send/.test(l)), "nothing is sent to someone who said stop");

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
const movesOf = (t) => all(t, (n) => n.type === "button" && n.props?.["data-testid"] === "person-deal-move");

test("the Deal section stands first in the column, above Coming up, only where deals are on; with no deal it is one quiet line that starts a proposal in the sheet; the card's settings have no Deal row", async () => {
  globalThis.window.__recordFolds.reset();
  const asked = sheetAsks();
  try {
    const off = (await profile(toPersonVM(detail({ deals_on: false, deals: [] }), ZONE, new Date(NOW))))();
    assert.equal(byTestId(off, "person-deal"), null, "a salon never sees it");

    const tree = (await profile(withDeals([])))();
    const section = byTestId(tree, "person-deal");
    assert.equal(textOf(find(section, (n) => n.type === "h2")), "Deal");
    // First in the column: the body draws it, then Coming up (VISITS has a visit ahead).
    const body = find(tree, (n) => n.props?.className === "cl-prof-body");
    const kids = body.props.children.filter((k) => k && typeof k === "object");
    assert.equal(kids[0].type, globalThis.window.PersonDealCard, "the deal first");
    assert.equal(kids[1].props["data-testid"], "person-coming-up", "then what is coming");
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
      ["Receptionist", "Visit messages", "Offers & news"],
      "REGRESSION: the deal was a row of the card and a fold under it",
    );
    assert.equal(byTestId(tree, "rec-row-person-deal"), null);
    assert.ok(!all(tree, (n) => n.type === "h2").some((h) => textOf(h) === "Proposal"));
  } finally {
    delete globalThis.window.openDealSheet;
  }
});

test("a proposal out is a card: its service and value, its steps, its link and whether it went, its one next act as the outline button and the other moves as words, each opening the sheet or the thread", async () => {
  globalThis.window.__recordFolds.reset();
  const asked = sheetAsks();
  const url = "https://quotes.example.com/p/dani";
  const carried = [];
  globalThis.sessionStorage = { setItem: (k, v) => carried.push([k, v]), getItem: () => null, removeItem: () => {} };
  try {
    // The person's own link (00154) stays theirs: the card says the deal's.
    const vm = withDeals([dealRow({ proposal_url: url })], { proposal_url: "https://docs.example.com/p/own" });
    let tree = (await profile(vm))();
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
    const more = find(tree, (n) => n.props?.testid === "person-more");
    assert.ok(
      !more.props.items.some((i) => /proposal/i.test(i.label || "")),
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
    tree = (await profile(withDeals([dealRow()])))();
    assert.deepEqual(all(cardOf(tree), (n) => n.props?.["data-testid"] === "person-deal-fact").map(textOf), [
      "No link",
    ]);
    assert.equal(textOf(byTestId(tree, "person-deal-next")), "Edit proposal");
    assert.deepEqual(movesOf(tree).map(textOf), ["Mark as client", "Mark as passed"], "the edit is said once");
    assert.equal(byTestId(tree, "person-deal-flag"), null, "they wrote since: nothing waiting");
    // Nothing back in a week: a state in the warn tone, the house's one pill.
    tree = (await profile(withDeals([dealRow()], {}, { last_inbound_at: iso(12 * D) })))();
    const flag = find(tree, (n) => n.type === globalThis.window.StatePill && n.props.testid === "person-deal-flag");
    assert.deepEqual([flag.props.kind, flag.props.value, flag.props.label], ["tone", "warn", "Nothing back in 9 days"]);

    // A client: the steps say it; the one move is the end, in quiet words.
    tree = (
      await profile(
        withDeals([
          dealRow({ stage: "won", decided_at: iso(2 * D), per: "month", amount_cents: 250_000, proposal_url: url }),
        ]),
      )
    )();
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
    tree = (await profile(withDeals([dealRow({ stage: "lost", decided_at: iso(2 * D), lost_reason: "price" })])))();
    assert.equal(cardOf(tree), null);
    assert.match(textOf(byTestId(tree, "person-deal-said")), /^Ad management · Passed \w{3} \d+ · Price$/);
    press(byTestId(tree, "person-deal-start"));
    assert.deepEqual(asked, [{ personId: "p1", mode: "again", dealId: "d1" }]);

    // A viewer reads the card and presses nothing.
    globalThis.window.__ME = { role: "viewer" };
    try {
      tree = (await profile(vm))();
      assert.ok(cardOf(tree));
      assert.equal(byTestId(tree, "person-deal-next"), null);
      assert.deepEqual(movesOf(tree), []);
    } finally {
      globalThis.window.__ME = { role: "owner" };
    }
  } finally {
    delete globalThis.window.openDealSheet;
    delete globalThis.sessionStorage;
  }
});

test("where only an approved message can reach them, the card's follow-up opens their thread with nothing written in it and says why on hover; someone who said stop is offered none", async () => {
  globalThis.window.__recordFolds.reset();
  const url = "https://quotes.example.com/p/dani";
  const carried = [];
  globalThis.sessionStorage = { setItem: (k, v) => carried.push([k, v]), getItem: () => null, removeItem: () => {} };
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
    const tree = (await profile(vm))();
    const next = byTestId(tree, "person-deal-next");
    assert.deepEqual([textOf(next), next.props.title], ["Follow up", contracts.DEAL_ACT_HINTS.approved]);
    press(next);
    assert.deepEqual(went, [vm.openThread], "their thread, which offers the approved messages");
    assert.deepEqual(carried, [], "and nothing written for them: no free text can go");
    for (const rowOver of [{ consent: "opted_out" }, { dnc: true }]) {
      const stopped = (await profile(quiet(rowOver)))();
      assert.equal(textOf(byTestId(stopped, "person-deal-next")), "Mark as client", JSON.stringify(rowOver));
    }
    // Where their People row says the proposal follow-up has them (0006): the day its run goes, and the card leads
    // with no nudge of its own.
    const keep = globalThis.window.__PEOPLE;
    try {
      const draw = await profile(quiet());
      globalThis.window.__PEOPLE = {
        ...(keep || {}),
        rows: [{ id: vm.id, followUp: { kind: "will", atMs: NOW, asks: true } }],
      };
      const inHand = draw();
      assert.equal(textOf(byTestId(inHand, "person-deal-next")), "Mark as client");
      const flag = find(inHand, (n) => n.type === globalThis.window.StatePill && n.props.testid === "person-deal-flag");
      assert.deepEqual([flag.props.value, flag.props.label], ["info", "Follow-up to approve today"]);
    } finally {
      globalThis.window.__PEOPLE = keep;
    }
  } finally {
    delete globalThis.sessionStorage;
  }
});

test("the page reads the person again when a deal of theirs is recorded in the sheet, and not for anyone else's", async () => {
  const vm = withDeals([dealRow()]);
  // Only this page's listener: the pages the tests above drew were never taken off the stub's window.
  delete listeners["deal:recorded"];
  const draw = await profile(vm);
  draw();
  // Counted from here: drawing the page is not what is being proved.
  let reads = 0;
  globalThis.window.__personDetail = async () => {
    reads += 1;
    return vm;
  };
  globalThis.window.dispatchEvent({ type: "deal:recorded", detail: { personId: "someone-else" } });
  await settle();
  assert.equal(reads, 0);
  globalThis.window.dispatchEvent({ type: "deal:recorded", detail: { personId: "p1" } });
  await settle();
  assert.equal(reads, 1, "their page is read again");
});

/* ------------------------------ the card's settings, one line each (canvas A, step 2) ------------------------------ */

test("the card's settings are one line each, and Change opens the editor under its row: the record kit's row and fold", async () => {
  globalThis.window.__recordFolds.reset();
  const vm = toPersonVM(detail(), ZONE, new Date(NOW));
  const draw = await profile(vm);
  let tree = draw();
  const cls = (n) => String(n.props?.className || "");
  const settings = byTestId(tree, "person-settings");
  const rows = all(settings, (n) => cls(n).split(" ").includes("rec-row"));
  assert.deepEqual(
    rows.map((r) => textOf(find(r, (n) => cls(n) === "rec-row-key"))),
    ["Receptionist", "Visit messages", "Offers & news"],
    "REGRESSION: three stacked controls with a paragraph under each were 1,249px of rail",
  );
  assert.deepEqual(
    rows.slice(1).map((r) => textOf(find(r, (n) => cls(n) === "rec-row-value"))),
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
  const draw = await profile(vm);
  const held = [];
  const hold = globalThis.window.holdStill;
  globalThis.window.holdStill = (control, change) => {
    held.push(control);
    change();
  };
  try {
    const pressed = { tag: "the Visits button" };
    byTestId(draw(), "timeline-filter-visits").props.onClick({
      currentTarget: pressed,
      stopPropagation() {},
      preventDefault() {},
    });
    assert.deepEqual(held, [pressed], "the switch runs through holdStill, from the button pressed");
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
  // About says the same door in the same words.
  for (const [source, how] of [
    ["calendar", "from your calendar"],
    ["lead", "from a lead you found"],
    ["manual", "by hand"],
  ])
    assert.ok(
      added(source)
        .about.find((a) => a.k === "Added")
        .v.endsWith(`· ${how}`),
      source,
    );
  // The page draws who above what: "You", then "Added by hand".
  const draw = await profile(added("manual"));
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

test("a People row reads its person as a pointer reaches it or the cursor lands on it, so the page opens on what the tab holds", async () => {
  // The courier to read ahead (people-detail.ts warmPerson) was called by the retired demo page's rows alone: every
  // open from People waited on the wire behind "Loading…".
  const draw = await peoplePage([row()]);
  const warmed = [];
  const was = globalThis.window.__warmPerson;
  globalThis.window.__warmPerson = (id) => warmed.push(id);
  try {
    const tr = find(draw(), (n) => n.type === "tr" && n.props?.id === "person-p1");
    tr.props.onPointerEnter();
    tr.props.onFocus();
    assert.deepEqual(warmed, ["p1", "p1"], "a pointer arriving, and the cursor landing");
  } finally {
    globalThis.window.__warmPerson = was;
  }
});

test("People reads the people it shows ahead, so a press opens a page the tab already holds", async () => {
  const draw = await peoplePage([row(), row({ id: "p2", display_name: "Ana Ruiz" })]);
  const lists = [];
  const was = globalThis.window.__warmPeople;
  globalThis.window.__warmPeople = (ids) => lists.push(ids);
  try {
    draw();
    await settle();
    assert.ok(
      lists.some((ids) => ids.includes("p1") && ids.includes("p2")),
      `the rows on screen, handed to the courier: ${JSON.stringify(lists)}`,
    );
  } finally {
    globalThis.window.__warmPeople = was;
  }
});

test("a person not read yet is nothing of theirs until their whole page is in: never the name first and the rest after", async () => {
  // Ruben, 24 Sep 2026: "the person name the header part still loads first for a split second". The page drew their
  // People row's name and number over Reading…, and the rest landed under it a moment later.
  await peoplePage([row()]);
  let resolve = null;
  globalThis.window.__personDetail = () =>
    new Promise((r) => {
      resolve = r;
    });
  globalThis.window.__peekPerson = () => null;
  cells = [];
  frames.begin();
  let tree = globalThis.window.ClientProfile({ id: "p1", onBack: () => {} });
  frames.begin();
  tree = globalThis.window.ClientProfile({ id: "p1", onBack: () => {} });
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

  // Their page lands whole: the head, where they stand and the history in the same draw.
  const vm = toPersonVM(detail(), ZONE, new Date(NOW));
  resolve(vm);
  await settle();
  frames.begin();
  tree = globalThis.window.ClientProfile({ id: "p1", onBack: () => {} });
  assert.ok(byTestId(tree, "person-now"), "where they stand");
  assert.ok(
    find(tree, (n) => n.type === "h1"),
    "their name",
  );
  assert.ok(
    find(tree, (n) => String(n.props?.className || "").includes("cl-prof-history")),
    "and their history, together",
  );
  assert.equal(byTestId(tree, "person-reading"), null);
});

test("a kept copy whose read again failed says so, quietly, and stays: never taken for now", async () => {
  const vm = toPersonVM(detail(), ZONE, new Date(NOW));
  const wasPeek = globalThis.window.__peekPerson;
  globalThis.window.__peekPerson = (id) => (id === vm.id ? vm : null);
  globalThis.window.__personDetail = async () => {
    throw new Error("Could not be read right now");
  };
  try {
    cells = [];
    frames.begin();
    globalThis.window.ClientProfile({ id: vm.id, onBack: () => {} });
    await settle();
    frames.begin();
    const tree = globalThis.window.ClientProfile({ id: vm.id, onBack: () => {} });
    assert.ok(byTestId(tree, "person-now"), "the page they already had");
    const stale = byTestId(tree, "person-stale");
    assert.ok(stale, "REGRESSION: a copy from before the reload was shown as current, the failed read unsaid");
    assert.match(textOf(stale), /from earlier/);
  } finally {
    globalThis.window.__peekPerson = wasPeek;
  }
});

test("a person this tab holds is the first draw, not the second, and is read again behind it", async () => {
  // The tab keeps the people it opened (people-detail.ts), so a reload has them before the first frame. Seeded in the
  // load effect, the page drew one frame of the head alone before the page it already had.
  const vm = toPersonVM(detail(), ZONE, new Date(NOW));
  const wasPeek = globalThis.window.__peekPerson;
  let asked = 0;
  globalThis.window.__peekPerson = (id) => (id === vm.id ? vm : null);
  globalThis.window.__personDetail = async () => {
    asked += 1;
    return vm;
  };
  try {
    cells = [];
    frames.begin();
    const first = globalThis.window.ClientProfile({ id: vm.id, onBack: () => {} });
    assert.ok(byTestId(first, "person-now"), "REGRESSION: the first frame was the head alone");
    assert.equal(byTestId(first, "person-known"), null, "and never the head over Reading…");
    await settle();
    assert.equal(asked, 1, "what the tab held is read again behind the paint");
  } finally {
    globalThis.window.__peekPerson = wasPeek;
  }
});

test("on a real workspace a person's page is the real one before People's rows land: never the seeded profile", async () => {
  // A person's page no longer waits for the list (surface-registry.ts routeSurfaceFor): the shell says the workspace
  // is real, and the page reads its own person.
  const keep = globalThis.window.__PEOPLE;
  const wasPeek = globalThis.window.__peekPerson;
  delete globalThis.window.__PEOPLE;
  globalThis.window.__peekPerson = () => null;
  let resolve = null;
  globalThis.window.__personDetail = () =>
    new Promise((r) => {
      resolve = r;
    });
  try {
    cells = [];
    frames.begin();
    const tree = globalThis.window.ClientProfile({ id: "p1", onBack: () => {}, real: true });
    assert.ok(byTestId(tree, "person-reading"), "the real page, reading their record, never the seeded profile");
    assert.equal(resolve === null, false, "and it asked for the person");
    resolve(null);
    await settle();
  } finally {
    globalThis.window.__PEOPLE = keep;
    globalThis.window.__peekPerson = wasPeek;
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

test("REGRESSION: the notes card was one box the receptionist read whole, overwritten by every save -- now a note is added, kept or dismissed, and said with who wrote it and when", async () => {
  const vm = toPersonVM(withNotes(), ZONE, new Date(NOW));
  const sent = [];
  const saved = globalThis.window.__personNotes;
  const ok = { ok: true, data: {} };
  globalThis.window.__personNotes = {
    write: async (id, body) => (sent.push(["write", id, body]), ok),
    remove: async (id, noteId) => (sent.push(["remove", id, noteId]), ok),
    decide: async (id, body) => (sent.push(["decide", id, body]), ok),
    words: contracts.NOTE_WORDS,
    max: contracts.NOTE_MAX,
  };
  try {
    const draw = await profile(vm);
    let tree = draw();
    const card = byTestId(tree, "person-notes");
    assert.ok(card, "the card");
    const suggested = byTestId(card, "person-note-suggested");
    assert.match(textOf(suggested), /Suggested by the receptionist/);
    assert.match(textOf(suggested), /After a call/);
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
    byTestId(tree, "person-note-for").props.onChange({ target: { value: "u-sam" } });
    tree = draw();
    byTestId(tree, "person-note-team-only").props.onChange({ target: { checked: true } });
    tree = draw();
    press(byTestId(tree, "person-notes-save"));
    await settle();
    assert.deepEqual(sent.at(-1), ["write", vm.id, { body: "Likes tea.", for_user_id: "u-sam", team_only: true }]);
    assert.equal(byTestId(draw(), "person-notes-input").props.value, "", "the box empties once the note is added");
  } finally {
    globalThis.window.__personNotes = saved;
  }
});

test("who may do what to a note: its author changes it, an owner or its author deletes it, a viewer only reads", async () => {
  const vm = toPersonVM(withNotes(), ZONE, new Date(NOW));
  const saved = globalThis.window.__personNotes;
  globalThis.window.__personNotes = {
    write: async () => ({ ok: true }),
    remove: async () => ({ ok: true }),
    decide: async () => ({ ok: true }),
    words: contracts.NOTE_WORDS,
    max: contracts.NOTE_MAX,
  };
  const me = globalThis.window.__ME;
  try {
    const actsOf = (tree) =>
      all(tree, (n) => n.props?.["data-testid"] === "person-note").map((r) => {
        const m = find(r, (n) => n.type === globalThis.MoreMenu);
        return m ? m.props.items.map((i) => i.label) : [];
      });
    globalThis.window.__ME = { role: "owner" };
    let draw = await profile(vm);
    assert.deepEqual(
      actsOf(draw()),
      [["Edit", "Delete"], ["Delete"], ["Delete"]],
      "an owner deletes any; edits only their own",
    );
    globalThis.window.__ME = { role: "operator" };
    draw = await profile(vm);
    assert.deepEqual(actsOf(draw()), [["Edit", "Delete"], [], []], "an operator only their own");
    globalThis.window.__ME = { role: "viewer" };
    draw = await profile(vm);
    const tree = draw();
    assert.equal(byTestId(tree, "person-notes-input"), null, "a viewer writes nothing");
    assert.deepEqual(actsOf(tree), [[], [], []]);
    assert.equal(byTestId(tree, "person-note-keep"), null, "nor keeps a suggestion");
  } finally {
    globalThis.window.__ME = me;
    globalThis.window.__personNotes = saved;
  }
});

/* ----------------------------------- steps (0007, amended; 00166) ----------------------------------- */

/** A day by the business's calendar, some days from now: far enough from a midnight that no zone moves it. */
const dayFrom = (days) => contracts.zoneDayKey(NOW + days * 86_400_000, ZONE);
/** The notes card's courier, as the bridge publishes it, recording what the page asks of it. */
const stepCourier = (sent) => {
  const ok = { ok: true, data: {} };
  return {
    write: async (id, body) => (sent.push(["write", id, body]), ok),
    remove: async () => ok,
    decide: async () => ok,
    done: async (id, noteId, done, version) => (sent.push(["done", id, noteId, done, version]), ok),
    days: contracts.stepDays,
    dayOf: contracts.stepDayOf,
    words: contracts.NOTE_WORDS,
    max: contracts.NOTE_MAX,
  };
};
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
  const asked = [];
  const keep = {
    notes: globalThis.window.__personNotes,
    toast: globalThis.window.usePPToast,
    sheet: globalThis.window.openStepSheet,
  };
  globalThis.window.__personNotes = stepCourier(sent);
  globalThis.window.usePPToast = () => [null, (t) => flashes.push(t)];
  globalThis.window.openStepSheet = (ask) => (asked.push(ask), true);
  const W = contracts.NOTE_WORDS;
  try {
    const draw = await profile(vm);
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

    // Ticked by anyone who acts, with the version the page saw; done, the toast offers the next one, on its deal.
    byTestId(step, "person-note-done").props.onChange({ target: { checked: true } });
    await settle();
    assert.deepEqual(sent.at(-1), ["done", vm.id, "n-step", true, 1]);
    assert.equal(flashes.at(-1).action.label, W.setTheNext);
    flashes.at(-1).action.onClick();
    assert.deepEqual(asked.at(-1), { personId: vm.id, dealId: "d1" });
    // Ticked again, a done step is open again, and nothing is offered.
    [step, done, plain] = rowsOf(draw());
    byTestId(done, "person-note-done").props.onChange({ target: { checked: false } });
    await settle();
    assert.deepEqual(sent.at(-1), ["done", vm.id, "n-done", false, 1]);
    assert.equal(flashes.at(-1).action, undefined);

    // The composer: a day makes the note a step, and holds Team only on whatever it was.
    type(byTestId(draw(), "person-notes-input"), "Follow up on the logo");
    let tree = draw();
    const tomorrow = contracts.stepDays(Date.now(), "UTC")[1];
    assert.equal(tomorrow.label, "Tomorrow");
    byTestId(tree, "person-note-day").props.onChange({ target: { value: tomorrow.key } });
    tree = draw();
    const lock = byTestId(tree, "person-note-team-only");
    assert.deepEqual([lock.props.checked, lock.props.disabled], [true, true]);
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
    byTestId(tree, "person-note-day").props.onChange({ target: { value: "pick" } });
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
    const editOf = (row) =>
      find(row, (n) => n.type === globalThis.MoreMenu).props.items.find((i) => i.label === W.edit);
    [step, done, plain] = rowsOf(draw());
    editOf(step).onClick();
    tree = draw();
    byTestId(tree, "person-note-day").props.onChange({ target: { value: "" } });
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
    globalThis.window.__personNotes = keep.notes;
    globalThis.window.usePPToast = keep.toast;
    globalThis.window.openStepSheet = keep.sheet;
  }
});

test("a deal's card says its next step (0007, amended): Next, what, when, for whom, with Done and, for its author, Change; with none, Set a next step; a viewer only reads it", async () => {
  const sent = [];
  const asked = [];
  const heard = [];
  const keep = {
    notes: globalThis.window.__personNotes,
    sheet: globalThis.window.openStepSheet,
    me: globalThis.window.__ME,
  };
  globalThis.window.__personNotes = stepCourier(sent);
  globalThis.window.openStepSheet = (ask) => (asked.push(ask), true);
  const onSaved = (e) => heard.push(e.detail);
  globalThis.window.addEventListener("note:saved", onSaved);
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
    let tree = (await profile(withDeals([dealRow()], { person_notes: notes, note_team: NOTE_TEAM })))();
    const card = byTestId(tree, "person-deal-card");
    const step = byTestId(card, "person-deal-nextstep");
    assert.ok(step, "the card says its next step");
    // The earliest open step that names the deal; the person's own step (no deal) is not the card's.
    assert.equal(textOf(byTestId(step, "person-deal-nextstep-words")), "Call about the timeline");
    assert.match(textOf(byTestId(step, "person-deal-nextstep-day")), /^Due /);
    assert.match(textOf(step), new RegExp(`^${S.next}`));
    assert.match(textOf(step), /For Sam/);
    // A second press while the first is on its way reaches the door once: the first answers for both.
    press(byTestId(step, "person-deal-nextstep-done"));
    press(byTestId(step, "person-deal-nextstep-done"));
    await settle();
    assert.deepEqual(
      sent.filter((x) => x[0] === "done"),
      [["done", "p1", "n-soon", true, 1]],
      "one press, however many",
    );
    assert.deepEqual(heard.at(-1), { personId: "p1" }, "the page reads them again");
    press(byTestId(step, "person-deal-nextstep-change"));
    assert.deepEqual(asked.at(-1), { personId: "p1", noteId: "n-soon" });

    // Someone else's step: Done, and no Change.
    tree = (await profile(withDeals([dealRow()], { person_notes: [notes[0]], note_team: NOTE_TEAM })))();
    assert.ok(byTestId(tree, "person-deal-nextstep-done"));
    assert.equal(byTestId(tree, "person-deal-nextstep-change"), null, "only its author changes it");

    // No step on the deal: Set a next step, which asks for the sheet on that deal.
    tree = (await profile(withDeals([dealRow()], { person_notes: [notes[2]], note_team: NOTE_TEAM })))();
    assert.equal(byTestId(tree, "person-deal-nextstep"), null);
    const set = byTestId(tree, "person-deal-set-nextstep");
    assert.equal(textOf(set), S.setNext);
    press(set);
    assert.deepEqual(asked.at(-1), { personId: "p1", dealId: "d1" });

    // A viewer reads the step and acts on none of it.
    globalThis.window.__ME = { role: "viewer" };
    tree = (await profile(withDeals([dealRow()], { person_notes: notes, note_team: NOTE_TEAM })))();
    assert.ok(byTestId(tree, "person-deal-nextstep"));
    assert.equal(byTestId(tree, "person-deal-nextstep-done"), null);
    assert.equal(byTestId(tree, "person-deal-nextstep-change"), null);
    tree = (await profile(withDeals([dealRow()], { person_notes: [], note_team: NOTE_TEAM })))();
    assert.equal(byTestId(tree, "person-deal-set-nextstep"), null);
  } finally {
    globalThis.window.removeEventListener("note:saved", onSaved);
    globalThis.window.__personNotes = keep.notes;
    globalThis.window.openStepSheet = keep.sheet;
    globalThis.window.__ME = keep.me;
  }
});
