/**
 * The world the tests of pipeline/ share. Split by behaviour from pipeline.test.mjs on 25 Nov 2026 (layer 14: a test
 * file over 1,600 lines is two files); its header, as it was:
 *
 * Not named *.test.mjs on purpose: the runner globs that pattern.
 *
 */
/**
 * People › Pipeline (docs/decisions/0008-a-proposal-is-part-of-the-deal.md): People's rows by where their deal stands.
 *
 * The contracts first (pipeline.ts pipelineOf): who lands in which group, the order in each, the one chip a row says
 * and its tone, the time in stage and the value, and the line over the table, which says only the parts that have
 * something. The rows are People's own, made from the shape the database returns (toPersonRowVM over people_list's
 * row), so what is proved is what the page will be handed.
 *
 * Then the page (surfaces/people/pipeline/scope.tsx) through the stub React, over the real People surface on a fake
 * wire: the switch with its third tab, the line, the sections and their fold, a row that opens its person, the keys, the
 * search, the phone's bar and cards, and People in its place where deals are off. Executed, never read from source.
 */
import "../../shell/address/_address.mjs";
import { installRoleStore, useStubHooks } from "../../_stub-react.mjs";
import {
  CONSENT_SOURCES,
  csvCell,
  mayReceive,
  offersYesRefusal,
  stateOf,
  toPersonRowVM,
  zoneDayKey,
} from "@chanlytics/contracts";
import { hookFrames } from "../../_hook-frames.mjs";
import { bridgeHolds, holdFrameParts } from "../../shell/_bridge-holds.mjs";

export const TZ = "America/New_York";

export const H = 3_600_000;

export const DAY = 24 * H;

/** Wednesday, Sep 23, 2026, noon in New York. */
export const NOW = Date.parse("2026-09-23T16:00:00Z");

export const iso = (ms) => new Date(ms).toISOString();

/** A person as people_list returns them (the shape deals.test.mjs and people-vm.test.mjs pin), wrote 40 days ago. */
export const personRow = (now, id, name, over = {}) => ({
  id,
  display_name: name,
  wa_profile_name: null,
  phone_e164: `+1555000${String(1000 + id.length * 37 + name.length).slice(-4)}`,
  email: null,
  consent: "opted_in",
  consent_source: "in_person",
  consent_updated_at: iso(now - 60 * DAY),
  marketing_consent: null,
  marketing_consent_source: null,
  marketing_consent_updated_at: null,
  dnc: false,
  channels: ["whatsapp"],
  conversation_count: 1,
  escalation_count: 0,
  needs_human: false,
  open_escalation_reason: null,
  open_escalation_since: null,
  latest_conversation_id: `cv-${id}`,
  latest_state: "open",
  latest_paused_until: null,
  latest_assignee_user_id: null,
  latest_snooze_until: null,
  latest_wa_inbound_at: iso(now - 40 * DAY),
  last_message_at: iso(now - 40 * DAY),
  last_message_direction: "inbound",
  last_message_sender: "customer",
  last_inbound_text: "Thanks",
  last_inbound_at: iso(now - 40 * DAY),
  last_call_at: null,
  call_count: 0,
  call_seconds: 0,
  first_contact_at: iso(now - 90 * DAY),
  earliest_row_at: iso(now - 90 * DAY),
  has_backfill: false,
  has_chat: true,
  queued_reply_at: null,
  ...over,
});

/** A deal's columns on the row (people_list 00156 + 00160), dated in days before `now`. */
export const deal = (now, stage, o = {}) => ({
  deal_id: `d-${stage}-${o.proposed ?? 0}`,
  deal_stage: stage,
  deal_service: o.service === undefined ? "Color correction" : o.service,
  deal_proposed_at: iso(now - (o.proposed ?? 20) * DAY),
  deal_decided_at: o.decided === undefined ? null : iso(now - o.decided * DAY),
  deal_ended_at: o.ended === undefined ? null : iso(now - o.ended * DAY),
  deal_amount_cents: o.cents ?? null,
  deal_per: o.per ?? null,
  deal_proposal_url: o.url === undefined ? "https://docs.example.com/proposal" : o.url,
  deal_valid_until: o.validUntil ?? null,
  deal_lost_reason: o.reason ?? null,
});

/** A visit on the calendar, a consultation unless it says otherwise. */
export const visit = (startMs, { consultation = true, allDay = false, hours = 1 } = {}) => ({
  id: `v-${startMs}`,
  start: iso(startMs),
  end: iso(startMs + hours * H),
  title: "Consultation",
  all_day: allDay,
  via: "phone",
  consultation,
});

export const visits = (next, last) => ({ timezone: TZ, source: "your calendar", state: "ok", next, last });

/** Wall-clock moments in New York around NOW (EDT, UTC-4). */
export const ny = (day, hh, mm = 0) =>
  Date.parse(`2026-${day}T${String(hh + 4).padStart(2, "0")}:${String(mm).padStart(2, "0")}:00Z`);

/** Everyone the Pipeline has something to say about, and three it has nothing to say about. */
export const fixture = () =>
  [
    // Consultations held in the last week with no proposal since: the oldest first.
    personRow(NOW, "hana", "Hana", { visits: visits(null, visit(ny("09-21", 10))) }),
    personRow(NOW, "hugo", "Hugo", { visits: visits(null, visit(ny("09-18", 10))) }),
    // Passed on an old proposal, then came for a consultation: something new begins.
    personRow(NOW, "bea", "Bea", {
      ...deal(NOW, "lost", { proposed: 40, decided: 30, reason: "timing" }),
      visits: visits(null, visit(ny("09-20", 10))),
    }),
    // Consultations coming up: the soonest first.
    personRow(NOW, "sara", "Sara", { visits: visits(visit(ny("09-25", 14)), null) }),
    personRow(NOW, "theo", "Theo", { visits: visits(visit(ny("09-23", 15)), null) }),
    personRow(NOW, "ada", "Ada", { visits: visits(visit(ny("09-28", 0), { allDay: true, hours: 24 }), null) }),
    personRow(NOW, "finn", "Finn", { visits: visits(visit(ny("10-02", 10)), null) }),
    // Ended an engagement, and booked a consultation for a new one.
    personRow(NOW, "rae", "Rae", {
      ...deal(NOW, "ended", { proposed: 200, decided: 190, ended: 20 }),
      visits: visits(visit(ny("09-25", 16)), null),
    }),
    // Proposals out: the one waiting longest first.
    personRow(NOW, "wes", "Wes", deal(NOW, "proposed", { proposed: 11, cents: 120_000, per: "once" })),
    personRow(NOW, "nia", "Nia", deal(NOW, "proposed", { proposed: 9, cents: 305_000, per: "once", url: null })),
    personRow(NOW, "lars", "Lars", deal(NOW, "proposed", { proposed: 6, validUntil: "2026-09-20" })),
    personRow(NOW, "will", "Will", {
      ...deal(NOW, "proposed", { proposed: 5 }),
      last_inbound_at: iso(ny("09-21", 9)),
    }),
    // A proposal out with a consultation ahead is still a proposal out.
    personRow(NOW, "val", "Val", {
      ...deal(NOW, "proposed", { proposed: 2, validUntil: "2026-09-30" }),
      visits: visits(visit(ny("09-24", 11)), null),
    }),
    personRow(NOW, "fay", "Fay", deal(NOW, "proposed", { proposed: 1 })),
    // Clients: the newest first. A client with a consultation ahead is a client.
    personRow(NOW, "cat", "Cat", deal(NOW, "won", { proposed: 12, decided: 5, cents: 100_000, per: "month" })),
    personRow(NOW, "cy", "Cy", deal(NOW, "won", { proposed: 40, decided: 30, cents: 34_000, per: "month" })),
    personRow(NOW, "cleo", "Cleo", {
      ...deal(NOW, "won", { proposed: 70, decided: 60, service: null }),
      visits: visits(visit(ny("09-25", 9)), null),
    }),
    // Passed or ended: the newest first. Abe was consulted, then passed: nothing left to send.
    personRow(NOW, "ed", "Ed", deal(NOW, "ended", { proposed: 100, decided: 90, ended: 1 })),
    personRow(NOW, "abe", "Abe", {
      ...deal(NOW, "lost", { proposed: 4, decided: 2 }),
      visits: visits(null, visit(ny("09-20", 10))),
    }),
    personRow(NOW, "dan", "Dan", deal(NOW, "lost", { proposed: 8, decided: 3, reason: "price", cents: 90_000 })),
    personRow(NOW, "eve", "Eve", deal(NOW, "lost", { proposed: 12, decided: 10 })),
    // Nothing to follow: no deal and no consultation; a consultation past the week; a visit that is not one.
    personRow(NOW, "nobody", "Nobody"),
    personRow(NOW, "olga", "Olga", { visits: visits(null, visit(ny("09-12", 10))) }),
    personRow(NOW, "hal", "Hal", { visits: visits(visit(ny("09-25", 10), { consultation: false }), null) }),
  ].map((r) => toPersonRowVM(r, TZ, new Date(NOW)));

export const ids = (g) => g.rows.map((r) => r.id);

export const byKey = (vm) => Object.fromEntries(vm.groups.map((g) => [g.key, g]));

export const chipOf = (vm, id) => {
  for (const g of vm.groups) for (const r of g.rows) if (r.id === id) return r.chip;
  throw new Error(`${id} is in no group`);
};

export const rowOf = (vm, id) => vm.groups.flatMap((g) => g.rows).find((r) => r.id === id);

/* ------------------------------------------------------------------------ the next step (0007, amended) */

/** A next step's columns on the row (people_list v5, 00166): its day `d` days from `now` in the workspace's zone. */
export const stepCols = (now, id, d, o = {}) => ({
  step_id: `s-${id}`,
  step_body: o.body ?? `Call ${id} back`,
  step_due_on: zoneDayKey(now + d * DAY, TZ),
  step_for_user_id: null,
  step_deal_id: o.dealId ?? null,
});

export const stepFixture = (readAt = NOW) =>
  [
    personRow(NOW, "wes", "Wes", {
      ...deal(NOW, "proposed", { proposed: 11, cents: 120_000, per: "once" }),
      ...stepCols(NOW, "wes", -2),
    }),
    personRow(NOW, "nia", "Nia", { ...deal(NOW, "proposed", { proposed: 9 }), ...stepCols(NOW, "nia", 3) }),
    personRow(NOW, "fay", "Fay", deal(NOW, "proposed", { proposed: 1 })),
    personRow(NOW, "cat", "Cat", {
      ...deal(NOW, "won", { proposed: 12, decided: 5, cents: 100_000, per: "month" }),
      ...stepCols(NOW, "cat", 0),
    }),
    personRow(NOW, "cy", "Cy", deal(NOW, "won", { proposed: 40, decided: 30 })),
  ].map((r) => toPersonRowVM(r, TZ, new Date(readAt)));

/* ------------------------------------------------------------------------------------------------- the page */

export const TID = "t-studio";

export const ZONE = TZ;

export const listeners = {};

/** Back, as the page asked for it (the peek's close, after an open it pushed). */
export const backs = [];

export const storage = () => {
  const m = new Map();
  return {
    getItem: (k) => (m.has(k) ? m.get(k) : null),
    setItem: (k, v) => m.set(k, String(v)),
    removeItem: (k) => m.delete(k),
    keys: () => [...m.keys()],
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
  querySelector: () => null,
  createElement: () => ({ setAttribute() {}, style: {}, classList: { add() {}, remove() {} } }),
};

bridgeHolds(
  {
    who: {
      workspaces: [{ id: TID, slug: "studio", name: "Studio", status: "active", timezone: ZONE }],
      activeWorkspaceId: TID,
    },
  },
  { fresh: true },
);
globalThis.window = {
  location: {
    pathname: "/w/studio",
    hash: "#/clients/pipeline",
    origin: "https://app.chanlytics.com",
    assign() {},
    replace() {},
    reload() {},
  },
  // The browser's own rule: replaceState moves the address and fires nothing.
  history: {
    replaceState: (_s, _t, hash) => {
      globalThis.window.location.hash = hash;
    },
    back: () => {
      backs.push(globalThis.window.location.hash);
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

export const { api } = await import("../../../apps/dashboard/src/bridge/api.ts");

export const { installClock } = await import("../../../apps/dashboard/src/bridge/zone.ts");

installClock();

// The page's own reads: what the tab kept of a person, and the seam's typed value (the mirror is `window.__PEOPLE`).
export const { clearReadCaches } = await import("../../../apps/dashboard/src/bridge/read-cache.ts");

export const { setSurfaceValue, surfaceValue } = await import("../../../apps/dashboard/src/surfaces/surface-values.ts");

export const { personDetail } = await import("../../../apps/dashboard/src/surfaces/people/people-detail.ts");

/**
 * A person as GET contacts/<id> answers them, from their People row: the same columns, their deal as the route lists it,
 * and a thread they wrote in a few hours ago, so a free-text send can go. The profile's courier (people-detail.ts) reads
 * it through the wire and maps it, as the app does; a test that needs someone said differently gives the wire its own.
 */
export const detailOf = (raw, over = {}) => {
  const { visits, ...cols } = raw;
  const deals = raw.deal_id
    ? [
        {
          id: raw.deal_id,
          contact_id: raw.id,
          service: raw.deal_service,
          stage: raw.deal_stage,
          proposed_at: raw.deal_proposed_at,
          decided_at: raw.deal_decided_at,
          ended_at: raw.deal_ended_at,
          amount_cents: raw.deal_amount_cents,
          per: raw.deal_per,
          currency: "USD",
          note: null,
          version: 3,
          created_at: raw.deal_proposed_at,
          proposal_url: raw.deal_proposal_url,
          valid_until: raw.deal_valid_until,
          lost_reason: raw.deal_lost_reason,
        },
      ]
    : [];
  const heard = iso(Date.now() - 4 * H);
  return {
    row: { ...cols, latest_wa_inbound_at: heard },
    identities: [],
    conversations: [
      {
        id: raw.latest_conversation_id,
        state: "open",
        paused_until: null,
        last_wa_inbound_at: heard,
        last_message_at: raw.last_message_at,
        contact: {
          id: raw.id,
          display_name: raw.display_name,
          wa_profile_name: null,
          phone_e164: raw.phone_e164,
          consent: "opted_in",
          dnc: false,
        },
        messages: [],
      },
    ],
    calls: [],
    escalations: [],
    decisions: [],
    receptionist_mode: null,
    workspace_reply_mode: "auto",
    deals,
    services: ["Color correction", "Extensions"],
    visits,
    ...over,
  };
};

/**
 * People over the wire, as GET contacts answers: whether a deal was ever recorded here, and any view saved (which lands in
 * `viewSaves`). And what the page's verbs ask of the door beside it: a person read (`reads`, answered by `seen.person`), a
 * person added (`added`, answered by `seen.add`) and a deal recorded (`posted`).
 */
export const wire = ({
  people,
  hasDeals,
  total = people.length,
  hasMore = false,
  dealPace = null,
  followUp = null,
}) => {
  const seen = { viewSaves: [], reads: [], added: [], posted: [] };
  seen.rawOf = (id) => people.find((r) => r.id === id);
  seen.person = (id) => {
    const raw = seen.rawOf(id);
    return raw ? detailOf(raw) : null;
  };
  // A test holds the person's reads on their way (a promise), and lets them land when it says.
  seen.hold = null;
  seen.add = () => json(200, { ok: true, data: { contact_id: "new-1", existed: false } });
  globalThis.window.fetch = async (url, init = {}) => {
    const u = new URL(String(url), "https://app.chanlytics.com");
    const saving = u.pathname.match(/^\/api\/v1\/views\/([^/]+)$/);
    if (saving && init.method === "PUT") {
      seen.viewSaves.push({ page: saving[1], view: JSON.parse(init.body).view });
      return json(200, { ok: true, data: { views: {} } });
    }
    const one = u.pathname.match(/^\/api\/v1\/contacts\/([^/]+)$/);
    if (one && (init.method || "GET") === "GET") {
      seen.reads.push(one[1]);
      if (seen.hold) await seen.hold;
      const d = seen.person(one[1]);
      if (d instanceof Error) return json(500, { ok: false, error: { code: "boom", message: d.message } });
      return d
        ? json(200, { ok: true, data: { person: d } })
        : json(404, { ok: false, error: { code: "not_found", message: "gone" } });
    }
    if (u.pathname === "/api/v1/contacts" && init.method === "POST") {
      const body = JSON.parse(init.body);
      seen.added.push(body);
      return seen.add(body);
    }
    const dealPost = u.pathname.match(/^\/api\/v1\/contacts\/([^/]+)\/deal$/);
    if (dealPost && init.method === "POST") {
      seen.posted.push({ id: dealPost[1], body: JSON.parse(init.body) });
      return json(200, { ok: true, data: { deal: null, from: "proposed", decision_id: "dec-1", current: null } });
    }
    // More people than the surface reads (past its fifty pages): the first page is everyone it gets, and the next is
    // empty, which ends its reading with the server still saying more follow.
    if (u.pathname === "/api/v1/contacts")
      return json(200, {
        ok: true,
        data: {
          people: Number(u.searchParams.get("offset") || 0) === 0 ? people : [],
          page: { q: null, offset: 0, limit: 1000, total, has_more: hasMore },
          calendar: { state: "ok", source: "Google Calendar" },
          booking_link: null,
          has_deals: hasDeals,
          deal_pace: dealPace,
          follow_up: followUp,
        },
      });
    if (u.pathname === "/api/v1/segments") return json(200, { ok: true, data: { lists: [] } });
    if (u.pathname === "/api/v1/views") return json(200, { ok: true, data: { views: {} } });
    return json(404, { ok: false, error: { code: "not_found", message: `no ${u.pathname}` } });
  };
  return seen;
};

export let cells = [];

export const frames = hookFrames();

export const went = [];

/** The navigations the page asked to replace rather than push: the cursor walking an open peek. */
export const replaced = [];

export const opened = [];

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
  // The head's standing is said in a layout effect (kit/head/standing.ts useStanding): an effect, here as everywhere the
  // stub stands in for React.
  useLayoutEffect: (fn, deps) => globalThis.React.useEffect(fn, deps),
  // What the TSX page and the kit's parts take from React: the seam's hook (a store outside React, read as it stands:
  // these tests draw once, and the redraw is proved in shell/surfaces) and an id.
  useSyncExternalStore: (_subscribe, snapshot) => snapshot(),
  useId: () => ":r0:",
};
// the bridge's hook: these tests draw once, and the redraw is proved in shell/surfaces
holdFrameParts();

useStubHooks();

for (const k of ["StatStrip", "StatCell", "EmptyState", "FailedRead", "StatePill", "mayAtLeast"])
  globalThis[k] = globalThis.window[k];

installRoleStore();

globalThis.ChannelGlyph = () => null;

bridgeHolds({ who: { me: { role: "owner" } }, parts: { chrome: { state: stateOf } } });
Object.assign(globalThis.window, {
  AttnRow: () => null,
  __csvCell: csvCell,
  __consentSources: CONSENT_SOURCES,
  __offersYesSources: CONSENT_SOURCES.filter((s) => offersYesRefusal(s.id) === null),
  __mayReceive: mayReceive,
  // A frame is asked for and never comes: these tests draw once (a phone's deal sheet brings its row above it a frame
  // after it is laid out, which is the browser's to prove).
  requestAnimationFrame: () => 0,
  cancelAnimationFrame: () => {},
});
bridgeHolds({ doors: { navigate: (to) => went.push(to) } });
bridgeHolds({ parts: { toast: () => [null, () => {}] } });

// People's TSX, which the Pipeline draws by import (decision 0015), and the kit's table and Columns menu it draws with
// (decision 0083): the types the tree is found by below, and the page is the module itself; the parts the shell still
// draws by name are published as it does.
export const { PEOPLE_GLOBALS } = await import("../../../apps/dashboard/src/surfaces/people/people-globals.ts");

Object.assign(globalThis.window, PEOPLE_GLOBALS);

export const { DataTable } = await import("../../../apps/dashboard/src/surfaces/kit/table/data-table.tsx");

export const { TableColumnsMenu } = await import("../../../apps/dashboard/src/surfaces/kit/table/columns-menu.tsx");

export const { columnOptionsOf, orderedColumns } =
  await import("../../../apps/dashboard/src/surfaces/kit/table/columns.ts");

/** The Columns menu's rows as it draws them, from what it is handed: the table's state and the declared columns. */
export const menuOptions = (menu) =>
  columnOptionsOf(orderedColumns(menu.props.columns, menu.props.state.order), menu.props.state.visibility);

export const { plLoadedWords } = await import("../../../apps/dashboard/src/surfaces/people/words.ts");

export const { PipelineScope } = await import("../../../apps/dashboard/src/surfaces/people/pipeline/scope.tsx");

// The deal sheet is a chunk of its own (pipeline/peek-code.tsx), fetched once the list is idle: in before the first draw,
// as a pick finds it, so a row opens it in the same draw.
await (await import("../../../apps/dashboard/src/surfaces/people/pipeline/peek-code.tsx")).dealSheetCode();

// The kit's Menu, which a row and a card draw their acts with.
export const { Menu } = await import("../../../apps/dashboard/src/surfaces/kit/menu/menu.tsx");

export const { Sheet } = await import("../../../apps/dashboard/src/surfaces/kit/sheet/sheet.tsx");

export const { standingSaid } = await import("../../../apps/dashboard/src/surfaces/kit/head/standing.ts");

/** The page as a desk shows it: what it draws, and what it says to the head beside the strip (Columns, List and Board). */
export const withHead = (tree) => ({ type: "page", props: { children: [tree, standingSaid()?.act ?? null] } });

/** The page's one filled button: in the frame's head at every width (what the page says to it, standing.tsx). */
export const newOpen = (tree) =>
  byTestId(tree, "pipeline-new-open") ??
  find(standingSaid()?.act ?? null, (n) => n.props?.["data-testid"] === "pipeline-new-open");

/** A kit Menu's groups as the list the page built: a heading over its group, a divider between two, an act as `onClick`. */
export const listOf = (menu) =>
  menu.props.groups.flatMap((g, at) => [
    ...(at > 0 ? [{ divider: true }] : []),
    ...(g.header ? [{ header: g.header }] : []),
    ...g.items.map((i) => ({ ...i, onClick: i.onSelect })),
  ]);

export const { PeopleReal } = await import("../../../apps/dashboard/src/surfaces/people/page/people-real.tsx");

export const { PipelineRailRows } = await import("../../../apps/dashboard/src/surfaces/people/pipeline/rail.tsx");

export const walk = (n, fn) => {
  if (n == null || typeof n !== "object") return;
  fn(n);
  for (const k of n.props?.children ?? []) walk(k, fn);
  if (n.rendered) walk(n.rendered, fn);
};

export const all = (tree, pred) => {
  const out = [];
  walk(tree, (n) => {
    if (pred(n)) out.push(n);
  });
  return out;
};

export const find = (tree, pred) => all(tree, pred)[0] ?? null;

export const byTestId = (tree, id) => find(tree, (n) => n.props?.["data-testid"] === id);

export const byClass = (tree, cls) =>
  find(tree, (n) =>
    String(n.props?.className || "")
      .split(/\s+/)
      .includes(cls),
  );

export const textOf = (n) => {
  if (n == null || typeof n === "boolean") return "";
  if (typeof n === "string" || typeof n === "number") return String(n);
  if (Array.isArray(n)) return n.map(textOf).join("");
  if (n.rendered !== undefined) return textOf(n.rendered);
  return (n.props?.children ?? []).map(textOf).join("");
};

export const click = (node) => node.props.onClick({ stopPropagation() {}, preventDefault() {} });

/** A key as the window hears it, pressed in `target`. */
export const press = (key, target = { tagName: "TR", isContentEditable: false, closest: () => null }) => {
  const ev = {
    key,
    target,
    metaKey: false,
    ctrlKey: false,
    altKey: false,
    shiftKey: false,
    repeat: false,
    defaultPrevented: false,
    preventDefault() {
      ev.defaultPrevented = true;
    },
  };
  for (const fn of [...(listeners.keydown || [])]) fn(ev);
  return ev.defaultPrevented;
};

/** The same people as the view model's tests, dated from the real clock the surface reads with. */
export const peopleNow = () => {
  const now = Date.now();
  return [
    personRow(now, "hana", "Hana", { visits: visits(null, visit(now - 2 * DAY)) }),
    personRow(now, "sara", "Sara", { visits: visits(visit(now + 2 * DAY), null) }),
    personRow(now, "wes", "Wes", deal(now, "proposed", { proposed: 11, cents: 120_000, per: "once" })),
    personRow(now, "nia", "Nia", deal(now, "proposed", { proposed: 9, cents: 305_000, per: "once", url: null })),
    personRow(now, "cat", "Cat", deal(now, "won", { proposed: 12, decided: 5, cents: 100_000, per: "month" })),
    personRow(now, "dan", "Dan", deal(now, "lost", { proposed: 8, decided: 3, reason: "price" })),
    personRow(now, "ed", "Ed", deal(now, "ended", { proposed: 100, decided: 90, ended: 1 })),
    personRow(now, "nobody", "Nobody"),
  ];
};

/** People published by the real surface over the wire, and a page with nothing drawn yet. */
export const fresh = async ({
  people = peopleNow(),
  hasDeals = true,
  total,
  hasMore,
  dealPace = null,
  followUp = null,
} = {}) => {
  // The last test's reads still on their way land on its wire, never on this one's.
  await settled();
  // A page of its own: reads a test before it failed on purpose are no trouble of this one's (client/trouble.ts).
  api().standAgain();
  const seen = wire({ people, hasDeals, total, hasMore, dealPace, followUp });
  await quietly(() => peopleOverride.apply());
  cells = [];
  went.length = 0;
  replaced.length = 0;
  backs.length = 0;
  opened.length = 0;
  for (const k of Object.keys(listeners)) delete listeners[k];
  globalThis.localStorage.removeItem("chanlytics-people-view");
  globalThis.localStorage.removeItem("chanlytics-pipeline-view");
  globalThis.localStorage.removeItem("pipeline.view");
  // What the tab kept of each view's place (the words in the box, the cursor) belongs to the test that kept it.
  globalThis.sessionStorage.removeItem("chanlytics.place.v1");
  clearReadCaches();
  return seen;
};

export const tick = () => new Promise((r) => setTimeout(r, 0));

/** Every read the page has out, let land. */
export const settled = async () => {
  for (let i = 0; i < 40; i++) await tick();
};

export const draw = (props = {}) => {
  frames.begin();
  return PipelineScope({
    onNavigate: (to, opts) => {
      went.push(to);
      if (opts && opts.replace) replaced.push(to);
    },
    onOpenProfile: (id) => opened.push(id),
    ...props,
  });
};

/** People's own page, where an address of the Pipeline draws it (deals off): the route picks it, not the Pipeline's page. */
export const drawPeople = (props = {}) => {
  frames.begin();
  return PeopleReal({
    onNavigate: (to, opts) => {
      went.push(to);
      if (opts && opts.replace) replaced.push(to);
    },
    onOpenProfile: (id) => opened.push(id),
    ...props,
  });
};

export const onPhone = async (fn) => {
  globalThis.window.matchMedia = (q) => ({ matches: q === "(max-width: 900px)" });
  try {
    return await fn();
  } finally {
    delete globalThis.window.matchMedia;
  }
};

export const rowIds = (tree) =>
  all(tree, (n) => n.type === "tr" && n.props?.id).map((n) => n.props.id.replace(/^person-/, ""));

export const heads = (tree) =>
  all(tree, (n) => n.props?.["data-testid"] === "table-section").map((tr) => ({
    label: textOf(byClass(tr, "dtable-group-label")),
    count: textOf(byClass(tr, "tally")),
    meta: textOf(byTestId(tr, "table-section-meta")) || null,
    toggle: textOf(byTestId(tr, "table-section-toggle")) || null,
  }));

/** The line's parts in their order, words or presses alike. */
export const lineParts = (tree) =>
  all(byTestId(tree, "pipeline-summary"), (n) =>
    /^pl-standing-(total|reached|needs)( on)?$/.test(n.props?.className || ""),
  ).map(textOf);

/** Whether anything in the tree is a strip of views: the frame's (SurfaceTabs) draws it from the page's chrome, no page does. */
export const drawsAStrip = (tree) =>
  !!byTestId(tree, "people-scope") ||
  all(tree, (n) =>
    String(n.props?.className || "")
      .split(" ")
      .includes("stabs"),
  ).length > 0;

export const peekOf = (tree) => byTestId(tree, "pipeline-peek");

/** Whether a phone's open deal lights its row (scope-screen.tsx `has-deal` on the rows' frame). */
export const hasDeal = (tree) => !!find(tree, (n) => /\bhas-deal\b/.test(String(n.props?.className || "")));

/** A phone's deal sheet is the kit's Sheet: its Close asks the page through `onClose`, as the wash and a pull do. */
export const closePhoneSheet = (tree) =>
  find(tree, (n) => n.type === Sheet && n.props.testid === "pipeline-peek").props.onClose();

/* ------------------------------------------------------------------------------ the page: the row carries the deal */

export const rowNode = (tree, id) => find(tree, (n) => n.type === "tr" && n.props?.id === `person-${id}`);
