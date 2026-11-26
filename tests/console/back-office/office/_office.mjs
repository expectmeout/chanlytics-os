/**
 * The world the tests of office/ share. Split by behaviour from back-office.test.mjs on 25 Nov 2026 (layer 14: a test file
 * over 1,600 lines is two files); its header, as it was:
 *
 * Not named *.test.mjs on purpose: the runner globs that pattern.
 */
/**
 * The back office — the one surface that deliberately crosses tenant
 * boundaries.
 *
 * WHY IT EXISTS. `public.platform_admins` was created in migration 00001 and
 * nothing had ever read it. Meanwhile every support question — "why isn't my
 * receptionist answering?" — was answered by writing SQL by hand, once,
 * unrepeatably, by the one person who knows the schema.
 *
 * WHAT THESE PIN. Two different things, and the second is the one that would
 * hurt:
 *
 *   THE JUDGEMENT — ten verdicts over real fact combinations, because a list of
 *   states is not an answer and getting the ranking wrong means the workspace
 *   that needs a person is on page two.
 *
 *   THE BOUNDARY — that there is exactly one door to cross-tenant data and
 *   everything goes through it. This is the only place in the product where
 *   reading somebody else's customers is a feature rather than a breach, so
 *   "which code path could skip the check" has to be answerable by looking, and
 *   a test is what keeps it answerable.
 */
import {
  platformRows,
  platformSummary,
  platformNumber,
  PLATFORM_VERDICTS,
  PLATFORM_QUIET_DAYS,
  setupSteps,
  platformLineActions,
  platformActionWarning,
  platformHealthWords,
  platformQueue,
  activityWords,
  clockTime,
  clockDateYear,
  clockDayLabel,
  zoneDayKey,
  platformPartnerRows,
  platformPartnerSummary,
  platformPartnerStanding,
  pageVitalsWords,
} from "@chanlytics/contracts";
import { kitPages, useStubHooks } from "../../../_stub-react.mjs";
import { bridgeHolds } from "../../../shell/_bridge-holds.mjs";

export const clock = (sweep, healthy, detail = null) => ({
  sweep,
  healthy,
  detail,
  last_request_at: null,
  status_code: null,
  scheduled: true,
  alerted_at: null,
});

export const NOW = Date.parse("2026-09-09T18:00:00Z");

export const DAY = 86_400_000;

export const ago = (d) => new Date(NOW - d * DAY).toISOString();

/** A workspace that is entirely fine, so every case below differs by one fact. */
export const live = (over = {}) => ({
  tenant_id: "11111111-1111-1111-1111-111111111111",
  slug: "harbor-moving",
  name: "Harbor Moving",
  status: "active",
  timezone: "America/New_York",
  created_at: ago(90),
  members: 2,
  billing_mode: "stripe",
  billing_status: "active",
  trial_end: null,
  current_period_end: ago(-20),
  line_e164: "+19296566623",
  line_kind: "chanlytics",
  voice_state: "answering",
  sms_state: "active",
  reg_step: null,
  reg_mock: false,
  reg_sole_prop: false,
  line_error: null,
  whatsapp_number: "+13055550188",
  whatsapp_active: true,
  voice_number: "+19296566623",
  voice_active: true,
  last_inbound_at: ago(1),
  ...over,
});

export const only = (over) => platformRows([live(over)], NOW)[0];

/** A workspace's Setup facts, as /api/v1/setup assembles them. Enough for setupSteps to draw a real page. */
export const SETUP_FIXTURE = {
  business: {
    name: "Harbor Moving",
    hours: true,
    services: 3,
    booking_link: true,
    address: true,
    handoff: "+16465550123",
    broken: false,
  },
  conflicts: [],
  channels: {
    whatsapp: { present: true, active: true, number: "+13055550188", quality: "GREEN", last_inbound_at: ago(1) },
    voice: { present: true, active: true, number: "+19296566623", last_inbound_at: ago(2) },
  },
  templates: { approved: 5, pending: 0, starters_approved: 5 },
  calendar: { state: "ok" },
  team: { members: 2, invites_open: 0, alert_emails: 1 },
  consent: { yes: 12 },
  requests: { line: null },
  lines: {
    rows: [
      {
        id: "l1",
        e164: "+19296566623",
        kind: "chanlytics",
        provider: "twilio",
        area_code: 929,
        voice_state: "answering",
        sms_state: "rejected",
        reg_step: "brand",
        reg_mock: false,
        reg_sole_prop: false,
        whatsapp_state: "none",
        port_state: "none",
        forwarding_state: "none",
        step: null,
        last_error: "the carriers refused it",
        state_since: ago(3),
        created_at: ago(80),
      },
    ],
    ready: true,
    provider: "twilio",
    costs: { local_number_month_usd: 1.15 },
  },
  google: { ready: true, places: true, listing: null, connected: false },
  billing: {
    ready: true,
    mode: "stripe",
    status: "active",
    trial_end: null,
    current_period_end: ago(-20),
    trial_days: 14,
    cancel_at: null,
    cancel_at_period_end: false,
  },
};

/** The platform's reads, and the guard they go through: the shared back office (server/shared/back-office.ts). */
export const GUARDED = [
  "apps/dashboard/src/server/console/platform.ts",
  "apps/dashboard/src/server/shared/back-office.ts",
];

/* ----------------------------- the boundary, executed ---------------------- *
 * Everything above this line is a pure function over a fixture, a regex over
 * SQL text, or a page with the fetch stubbed. All of it passed while the detail
 * route 500'd on every workspace, because none of it ever ran the server path.
 *
 * `fakeDb` throws on any RPC it has not been told about, which is exactly the
 * property this needs: the cross-tenant path has no session, so `auth.uid()` is
 * null, so it may not call a SECURITY DEFINER function that asks who is signed
 * in. Naming the RPCs it is allowed to use makes that a decision rather than an
 * accident.
 * -------------------------------------------------------------------------- */

export const TENANT = "6a4405d1-1e68-4fcd-bc55-eef0df8e689a";

/** Enough of a workspace for the Setup assembly to have real work to do. */
export const workspaceTables = () => ({
  tenant_config: [{ tenant_id: TENANT, config: { brain: { business_name: "Harbor Moving" } } }],
  tenant_channels: [{ tenant_id: TENANT, kind: "voice", status: "active", number_e164: "+19296566623", config: {} }],
  messages: [{ tenant_id: TENANT, direction: "inbound", channel: "whatsapp", channel_ts: ago(1), created_at: ago(1) }],
  calls: [{ tenant_id: TENANT, direction: "inbound", started_at: ago(2) }],
  templates: [
    { tenant_id: TENANT, channel: "whatsapp", name: "visit_reminder", meta_status: "approved", hidden_at: null },
  ],
  memberships: [
    // role is NOT NULL in the table (default owner): a row without one would be a row the database cannot hold.
    { id: "m1", tenant_id: TENANT, role: "owner" },
    { id: "m2", tenant_id: TENANT, role: "operator" },
  ],
  invitations: [
    {
      id: "i1",
      tenant_id: TENANT,
      email: "new@example.com",
      role: "operator",
      created_at: ago(1),
      expires_at: ago(-6),
      accepted_at: null,
      revoked_at: null,
    },
  ],
  contacts: [{ id: "c1", tenant_id: TENANT, consent: "opted_in", erased_at: null }],
  notifications: [],
  lines: [
    {
      id: "l1",
      tenant_id: TENANT,
      e164: "+19296566623",
      kind: "chanlytics",
      provider: "twilio",
      area_code: 929,
      voice_state: "answering",
      sms_state: "active",
      reg_step: null,
      reg_mock: false,
      reg_sole_prop: false,
      whatsapp_state: "none",
      port_state: "none",
      forwarding_state: "none",
      step: null,
      last_error: null,
      state_since: ago(3),
      created_at: ago(80),
      facts: {},
    },
  ],
  google_listings: [],
  google_connections: [],
  billing_accounts: [
    {
      tenant_id: TENANT,
      mode: "direct",
      status: "none",
      trial_end: null,
      current_period_end: null,
      cancel_at: null,
      cancel_at_period_end: false,
    },
  ],
});

/* ------------------------------- the ops door ------------------------------ *
 * The write half. Until now every one of these actions was performed by
 * importing the library into a local script and recovering four values from
 * Twilio and the database by hand, because `/api/admin/lines` is gated on
 * DIAG_KEY and Vercel holds that as a SENSITIVE variable -- write-only,
 * unreadable by anybody. Fine once; not an operations model, and refiling a
 * rejected campaign is the most common A2P support action there is.
 * -------------------------------------------------------------------------- */

export const line = (over = {}) => ({
  id: "l1",
  e164: "+19296566623",
  kind: "chanlytics",
  provider: "twilio",
  area_code: 929,
  voice_state: "answering",
  sms_state: "active",
  reg_step: null,
  reg_mock: false,
  reg_sole_prop: false,
  whatsapp_state: "none",
  port_state: "none",
  forwarding_state: "none",
  step: null,
  last_error: null,
  state_since: ago(1),
  created_at: ago(80),
  ...over,
});

/* -------------------------------------------------------------------------- *
 * The Console's screens and rows, rendered without a browser (decision 0066: the back office's pane moved into the
 * Console, its cards, lines and partner rows by git mv).
 *
 * Same harness as registration-path.test.mjs: no jsdom and no React, just the hooks these components use, so the
 * component bodies run for real and what comes back is the element tree. Which matters more here than usual — the
 * claim being tested is "support sees exactly what the customer sees", and that is a claim about what is on the screen.
 * -------------------------------------------------------------------------- */
globalThis.React = { Fragment: "Fragment" };

bridgeHolds({ who: { me: { email: "ruben@rjcapital.example", platform_admin: true } } }, { fresh: true });
globalThis.window = {
  canDo: () => true,
  // The shared toast, as frame-globals provides it: [node, flash].
  usePPToast: () => [null, () => {}],
  // The shell registers listeners on the window it is given.
  addEventListener() {},
  removeEventListener() {},
};

globalThis.Icon = () => null;

// The kit's attention row, which the screens import: the walker below reads the props each row was handed and does
// not expand it.
export const { AttnRow: ATTN } = await import("../../../../apps/dashboard/src/surfaces/kit/attention/attn-row.tsx");

globalThis.window.AttnRow = ATTN;

globalThis.document ??= {
  body: {},
  addEventListener() {},
  createElement: () => ({ setAttribute() {}, style: {}, classList: { add() {}, remove() {} } }),
};

globalThis.ReactDOM ??= { createPortal: (node) => node };

(await import("../../../../apps/dashboard/src/surfaces/frame/frame-globals.ts")).installFrameGlobals();

globalThis.Confirm = kitPages.Confirm;

Object.assign(globalThis.window, kitPages);

Object.assign(globalThis, { EmptyState: kitPages.EmptyState, FailedRead: kitPages.FailedRead });

globalThis.window.AttnRow = ATTN;

globalThis.window.usePPToast = () => [null, () => {}];

// The Console is TSX: its hooks come from "react", which under this runner has none, so each one is the stub's of the
// moment -- mount() below gives the stub new hooks for every mount.
useStubHooks(
  Object.fromEntries([
    ["Fragment", "Fragment"],
    ...["useState", "useMemo", "useCallback", "useEffect", "useRef"].map((h) => [
      h,
      (...a) => globalThis.React[h](...a),
    ]),
  ]),
);

export const S = "../../../../apps/dashboard/src/surfaces/console";

export const { PlatformLine, SetupAndLines } = await import(`${S}/lines.tsx`);

export const { WaitingRow: PlatformWaitingRow, PlatformQueueCard } = await import(`${S}/waiting.tsx`);

export const { PartnerRow: PlatformPartnerRow, PartnerStandingRow: PlatformPartnerStandingRow } = await import(
  `${S}/partner-rows.tsx`
);

export const { WorkspacesScreen } = await import(`${S}/workspaces.tsx`);

export const { WorkspaceScreen } = await import(`${S}/workspace.tsx`);

export const { PartnersScreen } = await import(`${S}/partners.tsx`);

export const { SpeedTab } = await import(`${S}/health/speed.tsx`);

/** The back office's words the App speed tab reads, as the bridge hands them (bridge/platform.ts). */
export const { pageSpeedWords, platformDaysWords } = await import("@chanlytics/contracts");

export const WORDS = { vitalsWords: pageVitalsWords, speedWords: pageSpeedWords, daysWords: platformDaysWords };

export const { WorkspaceRow } = await import(`${S}/rows.tsx`);

export const { WhyAsk } = await import(`${S}/why.tsx`);

export const { consoleVerbs } = await import(`${S}/verbs.ts`);

export const { Segmented } = await import("../../../../apps/dashboard/src/surfaces/kit/segmented/segmented.tsx");

export const { Field } = await import("../../../../apps/dashboard/src/surfaces/kit/field/field.tsx");

export const { Search } = await import("../../../../apps/dashboard/src/surfaces/kit/search/search.tsx");

export const { SubTabs } = await import("../../../../apps/dashboard/src/surfaces/kit/sub-tabs/sub-tabs.tsx");

export const { RecordTip } = await import("../../../../apps/dashboard/src/surfaces/kit/record/field.tsx");

// The verbs the screens read, which a test stands in whole, as it once replaced window.__platform.
export const { backOffice } = await import("../../../../apps/dashboard/src/bridge/platform.ts");

/** Who is looking, as GET platform/me answers: an owner on the Console's staff. */
export const ME = { user_id: "u-admin", email: "ruben@rjcapital.example", name: "Ruben", role: "owner" };

/** Whether a dependency array differs from the one an effect or memo last saw. Undefined deps mean "every render", as in React. */
export const changed = (before, after) =>
  before === undefined ||
  after === undefined ||
  before.length !== after.length ||
  after.some((d, i) => !Object.is(d, before[i]));

/**
 * The reason ask keeps what is typed in it (decision 0066): a nested component with state of its own, which the walker
 * expands with a store of its own, kept by its test id across walks and redraws, so a choice made in it is there at the
 * next walk. Cleared at every mount.
 */
export const STATEFUL = new Set([WhyAsk]);

export let ownCells = new Map();

export function expand(n) {
  if (!STATEFUL.has(n.type)) return n.type(n.props);
  const key = `${n.type.name}:${n.props.testid}`;
  const cells = ownCells.get(key) ?? [];
  ownCells.set(key, cells);
  let seq = 0;
  const saved = { useState: globalThis.React.useState };
  globalThis.React.useState = (init) => {
    const k = seq++;
    if (!(k in cells)) cells[k] = { value: typeof init === "function" ? init() : init };
    return [
      cells[k].value,
      (v) => {
        cells[k] = { value: typeof v === "function" ? v(cells[k].value) : v };
      },
    ];
  };
  try {
    return n.type(n.props);
  } finally {
    Object.assign(globalThis.React, saved);
  }
}

export function mount(Component, props = {}) {
  ownCells = new Map();
  const cells = [];
  let seq = 0;
  /** What each effect slot last ran with, and its cleanup. */
  const effects = {};
  let pending = [];
  Object.assign(globalThis.React, {
    createElement: (type, p, ...kids) => ({ type, props: { ...(p || {}), children: kids.flat(Infinity) } }),
    // Dependency arrays are HONOURED: a harness that cannot tell working code from broken code is worse than none.
    useMemo: (fn, deps) => {
      const k = seq++;
      const cell = cells[k];
      if (!cell || changed(cell.deps, deps)) cells[k] = { value: fn(), deps };
      return cells[k].value;
    },
    useCallback: (fn, deps) => {
      const k = seq++;
      const cell = cells[k];
      if (!cell || changed(cell.deps, deps)) cells[k] = { value: fn, deps };
      return cells[k].value;
    },
    useState: (init) => {
      const k = seq++;
      if (!(k in cells)) cells[k] = { value: typeof init === "function" ? init() : init };
      return [
        cells[k].value,
        (v) => {
          cells[k] = { value: typeof v === "function" ? v(cells[k].value) : v };
        },
      ];
    },
    useRef: (init) => {
      const k = seq++;
      if (!(k in cells)) cells[k] = { value: { current: init } };
      return cells[k].value;
    },
    useEffect: (fn, deps) => {
      pending.push({ fn, deps, key: seq++ });
    },
  });
  const draw = () => {
    seq = 0;
    pending = [];
    return Component(props);
  };
  let tree = draw();
  /** Run the effects whose deps changed, then redraw, until nothing changes. */
  const settle = async () => {
    for (let pass = 0; pass < 12; pass++) {
      const due = pending.filter((e) => changed(effects[e.key]?.deps, e.deps));
      if (!due.length) return;
      for (const e of due) {
        const previous = effects[e.key];
        if (previous?.cleanup) previous.cleanup();
        const cleanup = e.fn();
        effects[e.key] = { deps: e.deps, cleanup: typeof cleanup === "function" ? cleanup : null };
      }
      await new Promise((r) => setImmediate(r));
      tree = draw();
    }
    throw new Error("the page never settled: an effect keeps re-firing");
  };
  return {
    get tree() {
      return tree;
    },
    settle,
    async act(node) {
      node.props.onClick();
      tree = draw();
      await new Promise((r) => setImmediate(r));
      tree = draw();
      await settle();
    },
    /** Press a handler a screen handed to a child component -- an attention row's cta, say. */
    async press(fn) {
      fn();
      tree = draw();
      await new Promise((r) => setImmediate(r));
      tree = draw();
      await settle();
    },
    /** Type into a kit field or search: the change handler its props were handed. */
    type(node, value) {
      (node.props.onValueChange ?? node.props.onChange)(value);
      tree = draw();
    },
    /** Choose an option of a kit segmented control. */
    choose(node, value) {
      node.props.onValueChange(value);
      tree = draw();
    },
  };
}

/**
 * The kit's parts with behaviour of their own (Base UI underneath, hooks inside), and the Console's own row that keeps a
 * claim's press: what a screen owes them is the props, which is what the assertions read, so the walker does not
 * expand them (their hooks would run outside the mount's cells).
 */
export const LEAVES = new Set([ATTN, Segmented, Field, Search, SubTabs, RecordTip, WorkspaceRow]);

/** Walk the element tree, expanding nested components as it goes, the leaves aside. */
export const walk = (n, fn) => {
  if (n == null || typeof n !== "object") return;
  fn(n);
  if (typeof n.type === "function" && !LEAVES.has(n.type)) walk(expand(n), fn);
  for (const k of n.props?.children ?? []) walk(k, fn);
};

export const byId = (root, id) => {
  let hit = null;
  walk(root, (n) => {
    if (!hit && (n.props?.["data-testid"] === id || (LEAVES.has(n.type) && n.props?.testid === id))) hit = n;
  });
  return hit;
};

/** Every attention row a screen drew, in order, as the props it handed the shared component. */
export const attnRows = (root) => {
  const out = [];
  walk(root, (n) => {
    if (n.type === ATTN) out.push(n);
  });
  return out;
};

/** The first segmented control under a node. */
export const segmentedIn = (root) => {
  let hit = null;
  walk(root, (n) => {
    if (!hit && n.type === Segmented) hit = n;
  });
  return hit;
};

/**
 * Every workspace row a screen drew, as the rows it was handed, each once: a section draws the rows it is handed as its
 * children, so the walk meets them inside it and as its children both.
 */
export const workspaceRows = (root) => {
  const seen = new Set();
  walk(root, (n) => {
    if (n.type === WorkspaceRow) seen.add(n);
  });
  return [...seen].map((n) => n.props.row);
};

/** Everything a reader would see, expanding nested components the same way walk does. */
export const textOf = (n) => {
  const out = [];
  const rec = (x) => {
    if (x == null || x === false || x === true) return;
    if (typeof x === "string" || typeof x === "number") {
      out.push(String(x));
      return;
    }
    if (Array.isArray(x)) {
      x.forEach(rec);
      return;
    }
    if (typeof x !== "object") return;
    if (typeof x.type === "function" && !LEAVES.has(x.type)) {
      rec(expand(x));
      return;
    }
    if (x.type === WorkspaceRow) out.push(x.props.row.name);
    rec(x.props?.children);
  };
  rec(n);
  return out.join(" ");
};

/** The reason an act carried, as the reason ask hands it over when nothing is chosen: found, no ticket, no note. */
export const FOUND = { kind: "found", ticket: null, note: null };

/** The back office's verbs, network stubbed, every judgement the real contract's, at the fixtures' NOW. */
export function api(tenants, calls = []) {
  return {
    list: async () => {
      calls.push("list");
      return { ok: true, tenants, health: null, queue: null, partners: null, message: "" };
    },
    rows: (tenants) => platformRows(tenants, NOW),
    summary: platformSummary,
    verdicts: PLATFORM_VERDICTS,
    quietDays: PLATFORM_QUIET_DAYS,
    number: platformNumber,
    steps: setupSteps,
    actions: platformLineActions,
    warning: platformActionWarning,
    words: activityWords,
    vitalsWords: pageVitalsWords,
    healthWords: platformHealthWords,
    clock: {
      time: clockTime,
      dateYear: clockDateYear,
      dayLabel: (ms, tz) => clockDayLabel(ms, tz, NOW),
      dayKey: zoneDayKey,
    },
    act: async (action, tenantId, lineId, why) => {
      calls.push(`act:${action}:${tenantId}:${lineId}:${why.kind}`);
      return { ok: true, message: "Done." };
    },
    queue: (q) => platformQueue(q, NOW),
    markInvited: async (id, why) => {
      calls.push(`invited:${id}:${why.kind}`);
      return { ok: true, message: "Marked. They are off the list." };
    },
  };
}

/** Home's read, as the Console's Workspaces asks it (GET platform/home), with the tenants given. */
export const homeOf = (tenants) => ({
  me: ME,
  tenants,
  numbers: null,
  claims: [],
  reports: [],
  asks: [],
  requests: [],
  partners: null,
  queue: { waiting: [], total: 0 },
  spend: null,
});

/* -------------------------------------------------------------------------- *
 * The people who are not workspaces yet.
 *
 * `public.waitlist` (00088) had a writer and no reader anywhere in the product — which is how it went unnoticed that
 * the writer did not work either. These people have no workspace, so the Console is the only surface they can appear
 * on at all. waitlist.db.test.mjs proves the writing; this proves what is made of it.
 * -------------------------------------------------------------------------- */

export const waiting = (over = {}) => ({
  id: "w1",
  email: "ana@example.com",
  business: "Marisa's Beauty Salon",
  source: "https://chanlytics.com/pricing?utm_source=x",
  created_at: ago(3),
  ...over,
});

/* ------------------------------------------------------------------------ how fast the pages are (00255) */

/** One row of page_vitals_p75(): a metric over every page (null) or over one. */
export const p75 = (metric, page, samples, value) => ({ metric, page, samples, p75: value });

/* ------------------------------------------------------------------------ partners (decision 0012, P5) */

export const P1 = "10000000-0000-4000-8000-000000000001";

/** One partner's line of platform_partner_balances(). */
export const balance = (over = {}) => ({
  partner_id: P1,
  code: "ada-co",
  email: "ada@example.com",
  status: "active",
  share_bp: 2500,
  joined_at: "2026-08-01T00:00:00Z",
  workspaces: 2,
  under_review: 1,
  currency: "usd",
  held_cents: 5000,
  payable_cents: 12500,
  paid_cents: 0,
  last_paid_at: null,
  ...over,
});

/** One line of platform_partner_workspaces(). */
export const brought = (over = {}) => ({
  tenant_id: "b",
  partner_id: P1,
  code: "ada-co",
  attributed_at: "2026-08-01T00:00:00Z",
  standing: "review",
  standing_why: "The card that pays for it also pays for a workspace the partner owns.",
  standing_at: "2026-08-09T00:00:00Z",
  decided_by: "sweep",
  checks: { same_card: true, same_listing: false },
  ...over,
});

/** The back office's verbs with the partners' half, network stubbed, the words the real contract's. */
export function partnerApi(tenants, partners, calls = []) {
  return {
    ...api(tenants, calls),
    list: async () => ({ ok: true, tenants, health: null, queue: null, partners, message: "" }),
    partnerRows: platformPartnerRows,
    partnerSummary: platformPartnerSummary,
    partnerStanding: platformPartnerStanding,
    markPaid: async (partnerId, code, currency, reference, expected, why) => {
      calls.push(`paid:${partnerId}:${code}:${currency}:${reference}:${expected}:${why.kind}`);
      return { ok: true, message: "Recorded." };
    },
    setStatus: async (partnerId, code, status, why) => {
      calls.push(`status:${partnerId}:${code}:${status}:${why.note}`);
      return { ok: true, message: "Done." };
    },
    setStanding: async (tenantId, standing, why) => {
      calls.push(`standing:${tenantId}:${standing}:${why.note}`);
      return { ok: true, message: "Done." };
    },
  };
}
