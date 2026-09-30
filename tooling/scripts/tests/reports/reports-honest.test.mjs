/**
 * Campaigns, honest: a playbook link opens its card and a deleted one says so (the wiring audit's C13), and the
 * reply window is one rule said one way (C25). The Reports page's own regressions (C13, C25 to C28) moved to
 * reports-page.test.mjs with the page's redesign. Run against the pages on a stub React, over the view models the
 * bridge publishes.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import * as contracts from "@chanlytics/contracts";
import { hookFrames } from "../_hook-frames.mjs";
import { kitHooks, kitPages } from "../_legacy-react.mjs";

const { toCampaignReportVM, stateOf } = contracts;
const TID = "t-studio";
const ZONE = "America/New_York";

/* ------------------------ the campaigns, as campaign-report pins them ------------------------ */

const cday = (d, over = {}) => ({
  day: d,
  sent: 0,
  delivered: 0,
  read: 0,
  replied: 0,
  opt_ins: 0,
  opt_outs: 0,
  ...over,
});
const campaignDto = () => ({
  timezone: ZONE,
  days: 7,
  span_days: 14,
  today: "2026-09-04",
  series: [
    ...["2026-08-22", "2026-08-23", "2026-08-24", "2026-08-25", "2026-08-26", "2026-08-27", "2026-08-28"].map((d, i) =>
      cday(d, i === 2 ? { sent: 4, delivered: 4, read: 2, replied: 2, opt_ins: 1 } : {}),
    ),
    cday("2026-08-29", { sent: 10, delivered: 9, read: 6, replied: 2, opt_ins: 2 }),
    cday("2026-08-30"),
    cday("2026-08-31", { opt_ins: 1, opt_outs: 1 }),
    cday("2026-09-01", { sent: 6, delivered: 3, read: 1, replied: 1 }),
    cday("2026-09-02"),
    cday("2026-09-03", { sent: 4, delivered: 4, read: 4, replied: 1, opt_outs: 1 }),
    cday("2026-09-04"),
  ],
  sources: [
    {
      id: "p1",
      kind: "playbook",
      name: "Win-back",
      template_name: "winback_offer",
      runs: 2,
      sent: 14,
      delivered: 12,
      read: 7,
      replied: 3,
      last_at: "2026-09-03T14:05:00Z",
    },
    {
      id: "b1",
      kind: "broadcast",
      name: "A quick note · Sep 1",
      template_name: "quick_note",
      runs: 1,
      sent: 6,
      delivered: 4,
      read: 4,
      replied: 1,
      last_at: "2026-09-01T15:00:00Z",
    },
  ],
});
const playbook = (over = {}) => ({
  id: "pb-1",
  name: "Win-back",
  trigger: "quiet_30",
  template_id: "tpl-1",
  template_name: "winback_offer",
  template_language: "en_US",
  params: [{ kind: "first_name" }],
  policy_class: "reengage",
  state: "running",
  run_hour: 10,
  cap_per_run: 25,
  gap_days: 90,
  cadence_days: 30,
  last_run_for: null,
  last_run_at: null,
  created_at: "2026-08-01T00:00:00Z",
  triggerLabel: "Quiet 30 days",
  triggerHint: "anyone quiet for a month",
  schedule: "daily at 10:00",
  next: "tomorrow 10:00",
  candidates: 4,
  held: 0,
  totals: { runs: 2, sent: 6, delivered: 4, replied: 1, held: 0, lastRun: null, waiting: null, history: [] },
  ...over,
});
const playbooksSurface = (over = {}) => ({
  rows: [playbook(), playbook({ id: "pb-2", name: "Welcome", trigger: "new_week", policy_class: "campaign" })],
  templates: [],
  triggers: [],
  timezone: ZONE,
  calendar: "none",
  number: { present: true, health: { canSend: true } },
  businessName: "Northside Studio",
  bookingLink: false,
  replyWindow: contracts.REPLY_WINDOW_WORDS,
  fetchedAt: 1,
  ...over,
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
globalThis.window = {
  location: {
    pathname: "/w/studio",
    hash: "#/reports",
    origin: "https://app.chanlytics.com",
    assign() {},
    replace() {},
    reload() {},
  },
  history: { replaceState() {} },
  innerHeight: 800,
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
  setInterval: () => 1,
  clearInterval() {},
  __WORKSPACES: [{ id: TID, slug: "studio", name: "Northside Studio", status: "active", timezone: ZONE }],
  __ACTIVE_WORKSPACE: TID,
};
const { installClock } = await import("../../../../apps/dashboard/src/legacy-bridge/zone.ts");
installClock();
const { installTemplates } = await import("../../../../apps/dashboard/src/legacy-bridge/templates.ts");
installTemplates();

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
await import("../../../../apps/dashboard/src/legacy/components/data-bits.jsx");
await import("../../../../apps/dashboard/src/legacy/components/record-fold.jsx");
await import("../../../../apps/dashboard/src/legacy/components/record-sheet.jsx");
await import("../../../../apps/dashboard/src/legacy/components/message-preview.jsx");
await import("../../../../apps/dashboard/src/legacy/components/template-chips.jsx");
await import("../../../../apps/dashboard/src/legacy/components/campaign-bits.jsx");
Object.assign(globalThis.window, kitPages);
kitHooks();
for (const k of ["StatStrip", "StatCell", "EmptyState", "FailedRead", "StatePill", "PolicyChip", "Confirm"])
  globalThis[k] = globalThis.window[k];
Object.assign(globalThis.window, {
  usePPToast: () => [null, () => {}],
  CHANLY: { nav: (to) => went.push(to), R: { admin: (pane) => `admin/${pane}` } },
  appNavigate: (to) => went.push(to),
  __chrome: { state: stateOf },
  __ME: { role: "owner" },
  canDo: () => true,
  gate: () => ({}),
  gateTitle: (perm, doing) => `Only an owner or operator can ${doing}.`,
  __surfaceState: () => "live",
  __DEMO_MODE: false,
});
await import("../../../../apps/dashboard/src/legacy/pages/templates-real.jsx");
await import("../../../../apps/dashboard/src/legacy/pages/broadcasts-run.jsx");
await import("../../../../apps/dashboard/src/legacy/pages/broadcasts-ledger.jsx");
await import("../../../../apps/dashboard/src/legacy/pages/broadcasts.jsx");
await import("../../../../apps/dashboard/src/legacy/pages/playbook-bits.jsx");
await import("../../../../apps/dashboard/src/legacy/pages/playbook-card.jsx");
await import("../../../../apps/dashboard/src/legacy/pages/playbook-composer.jsx");
await import("../../../../apps/dashboard/src/legacy/pages/outbound.jsx");

const walk = (n, fn) => {
  if (n == null || typeof n !== "object") return;
  if (Array.isArray(n)) {
    for (const k of n) walk(k, fn);
    return;
  }
  fn(n);
  walk(n.props?.children, fn);
  walk(n.rendered, fn);
};
// A drawn component is walked twice, as the children it was given and as what it rendered: each node counts once.
const all = (tree, pred) => {
  const out = [];
  const seen = new Set();
  walk(tree, (n) => {
    if (!seen.has(n) && pred(n)) {
      seen.add(n);
      out.push(n);
    }
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
  return textOf(n.props?.children);
};
const classes = (n) => String(n?.props?.className || "").split(" ");
const fresh = () => {
  cells = [];
  frames.begin();
  went.length = 0;
  for (const k of Object.keys(listeners)) delete listeners[k];
};

/* ------------------------------ doors ------------------------------ */

test("Playbooks shows every moment, not only the ones somebody made: an empty one says what it would do and who it would reach, and opens the composer on itself", () => {
  const trig = (id, label, hint, candidates) => ({
    id,
    label,
    hint,
    cls: "reengage",
    list: id,
    kind: "list",
    candidates,
    held: 0,
  });
  const moments = () => [
    trig("quiet_30", "Win-back", "anyone quiet for a month", 4),
    trig("new_week", "Welcome", "anyone new this week", 6),
    trig("phoned_only", "Save our number", "anyone who only ever phoned", 11),
    trig("visited", "After the visit", "the day after a visit", 0),
  ];
  // Two playbooks are made -- for quiet_30 and new_week -- so two moments are left.
  globalThis.window.__PLAYBOOKS = playbooksSurface({ triggers: moments() });
  fresh();
  let tree = globalThis.window.OutboundPage({});
  let slots = all(tree, (n) => n.props?.["data-testid"] === "pb-slot");
  assert.deepEqual(
    slots.map((s) => s.props["data-trigger"]),
    ["phoned_only", "visited"],
    "a moment a playbook already covers is not offered again",
  );
  assert.ok(textOf(slots[0]).includes("11 people today"), textOf(slots[0]));
  // A moment with nobody in it today is still a moment worth setting up; it says
  // so in words rather than showing a 0 that reads as broken.
  assert.ok(/nobody today/i.test(textOf(slots[1])), textOf(slots[1]));
  // Out of a fixed set, the number that matters is which moments are covered: the head's one line counts the
  // playbooks by how they stand and the rest as not set up. It was "The four moments… — two set up, two not yet"
  // over a tally of big figures that said it again (23 Sep, Campaigns made compact).
  const standing = textOf(byTestId(tree, "pb-standing"));
  assert.ok(/2running/.test(standing) && /2not set up/.test(standing), standing);
  assert.ok(!/set up, .* not yet/.test(standing), `said once: ${standing}`);

  // On a first day every moment is offered, and that is the empty state: the
  // generic "No playbook yet" card does not also appear.
  globalThis.window.__PLAYBOOKS = playbooksSurface({ triggers: moments(), rows: [] });
  fresh();
  tree = globalThis.window.OutboundPage({});
  slots = all(tree, (n) => n.props?.["data-testid"] === "pb-slot");
  assert.deepEqual(
    slots.map((s) => s.props["data-trigger"]),
    ["quiet_30", "new_week", "phoned_only", "visited"],
  );
  assert.equal(byTestId(tree, "pb-empty"), null, "the moments are the empty state");
  assert.ok(textOf(byTestId(tree, "pb-standing")).includes("none set up yet"), textOf(byTestId(tree, "pb-standing")));

  // Pressing the third opens the composer ON that moment, not on whichever trigger is first.
  find(slots[2], (n) => n.props?.["data-testid"] === "pb-slot-start").props.onClick();
  frames.begin();
  tree = globalThis.window.OutboundPage({});
  assert.ok(byTestId(tree, "pb-composer"), "the composer opens");
  const moment = textOf(byTestId(tree, "pb-moment"));
  assert.ok(
    moment.includes("Save our number") && moment.includes("anyone who only ever phoned"),
    `on the moment that was pressed: ${moment}`,
  );
  // It opens beside the page: nothing on the page stands down or moves under it.
  assert.deepEqual(
    all(tree, (n) => n.props?.["data-testid"] === "pb-slot").map((s) => s.props["data-trigger"]),
    ["quiet_30", "new_week", "phoned_only", "visited"],
    "REGRESSION: the slots stood down while it was open",
  );
});

test("A playbook is a card of the moment it does: its message and languages, who it will reach and who it holds back, when it runs next -- and it opens in place to its verbs", () => {
  // As the route counts a moment: who it reaches, who waits, and everyone it names (triggerPools).
  const trig = (id, label, hint, candidates, held = 0) => ({
    id,
    label,
    hint,
    cls: "reengage",
    list: id,
    kind: "list",
    candidates,
    held,
    named: { pool: candidates + held, noYes: 0, stopped: 0, noNumber: 0, saidYes: candidates + held },
  });
  globalThis.window.__PLAYBOOKS = playbooksSurface({
    rows: [
      playbook({
        id: "pb-1",
        name: "Win-back",
        trigger: "quiet_30",
        candidates: 24,
        held: 12,
        totals: {
          runs: 18,
          sent: 198,
          delivered: 180,
          replied: 36,
          held: 0,
          lastRun: null,
          waiting: null,
          history: [
            { id: "r1", run_for: "2026-09-19", state: "sent", sent: 12 },
            { id: "r2", run_for: "2026-09-18", state: "sent", sent: 9 },
          ],
        },
      }),
      playbook({
        id: "pb-2",
        name: "Save our number",
        trigger: "phoned_only",
        state: "paused",
        candidates: 0,
        held: 0,
        template_name: "save_our_number",
      }),
      playbook({
        id: "pb-3",
        name: "The month's offer",
        trigger: "everyone_monthly",
        candidates: 186,
        held: 32,
        totals: {
          runs: 9,
          sent: 99,
          delivered: 90,
          replied: 18,
          held: 0,
          lastRun: null,
          waiting: { id: "b-w", recipient_count: 186 },
          history: [],
        },
      }),
    ],
    triggers: [
      trig("quiet_30", "Win-back", "Nothing heard in 30 days", 24, 12),
      trig("phoned_only", "Save our number", "Only ever phoned", 41),
      trig("everyone_monthly", "The month's offer", "Everyone who said yes", 186, 32),
      trig("visited", "After the visit", "The day after a visit", 6),
    ],
  });
  fresh();
  let tree = globalThis.window.OutboundPage({});
  // The moments' own order, each with the playbook doing it or the card saying nothing is.
  const cards = all(tree, (n) => n.props?.["data-testid"] === "pb-card" || n.props?.["data-testid"] === "pb-slot");
  assert.deepEqual(
    cards.map((c) => c.props.id || `slot:${c.props["data-trigger"]}`),
    ["pb-pb-1", "pb-pb-2", "pb-pb-3", "slot:visited"],
  );
  const [winback, saved, offer] = cards;
  // Who it reaches, out of whom, and who it holds back -- named, not summed away.
  assert.ok(textOf(byTestId(winback, "pb-tile-reach")).includes("24of 36"), textOf(byTestId(winback, "pb-tile-reach")));
  assert.ok(textOf(winback).includes("12 heard from a playbook this week"));
  // No language on the row: a run sends one language to everyone on it, and the open row's caption says which
  // ("Win-back · English"). The card drew every language the message has ("EN ES") and named a missing one as though
  // it held somebody back; then a tag of the one language on every row, which said nothing an owner acts on (23 Sep,
  // Campaigns made compact).
  assert.equal(all(winback, (n) => n.props?.["data-testid"] === "pb-tile-lang").length, 0);
  assert.ok(
    !/never added/.test(textOf(winback)),
    "a language the message lacks holds nobody back from a run in another",
  );
  assert.ok(textOf(winback).includes("Next run tomorrow 10:00") && textOf(winback).includes("18 runs"));
  assert.ok(
    String(byTestId(winback, "pb-tile-runs").props["data-tip"]).includes("198 sent, 180 delivered, 36 wrote back"),
    "what its runs earned is a hover away",
  );
  // Paused counts nobody of its own: its moment's count is how many it is not reaching.
  assert.ok(textOf(byTestId(saved, "pb-tile-reach")).includes("0of 41"), textOf(byTestId(saved, "pb-tile-reach")));
  assert.ok(
    !/who said yes/.test(textOf(byTestId(saved, "pb-tile-reach"))),
    "REGRESSION: a reach worded as who said yes",
  );
  assert.ok(textOf(saved).includes("paused — nothing goes out"));
  // A run waiting on the owner: the card says what the press does, and the press opens it where Approve is.
  assert.ok(textOf(byTestId(offer, "pb-tile-approve")).includes("Approve it and it goes at 10:00"));
  assert.equal(byTestId(tree, "pb-approve"), null, "a closed card carries no verbs");
  byTestId(offer, "pb-tile-approve").props.onClick();
  frames.begin();
  tree = globalThis.window.OutboundPage({});
  const opened = all(tree, (n) => n.props?.["data-testid"] === "pb-card").find((c) => c.props.id === "pb-pb-3");
  assert.ok(classes(opened).includes("is-open"), "it opens in place, across the grid");
  assert.ok(byTestId(opened, "pb-approve") && byTestId(opened, "pb-skip"), "with Approve and Skip in it");
  // How the moments stand, at the right of the head, in the numbers the cards add up to.
  const tally = textOf(byTestId(tree, "pb-standing"));
  assert.ok(
    /1running/.test(tally) && /1waiting on you/.test(tally) && /1paused/.test(tally) && /1not set up/.test(tally),
    tally,
  );
  // And the three rules that shape every run, once, under the cards.
  assert.ok(textOf(byTestId(tree, "pb-always")).includes("One a week, per person"));
});

test("A card's bar is everyone its moment names -- green reaches, amber waits, grey never will -- and the one reason an owner can change opens where it is changed", () => {
  // As the playbooks bridge publishes them (legacy-bridge/playbooks.ts).
  Object.assign(globalThis.window, { __reachLines: contracts.reachLines, __poolWords: contracts.poolWords });
  const visitTrig = {
    id: "visit_tomorrow",
    label: "Visit tomorrow",
    hint: "a visit tomorrow",
    cls: "booking",
    list: null,
    kind: "visit",
    candidates: 30,
    held: 0,
    named: null,
  };
  globalThis.window.__PLAYBOOKS = playbooksSurface({
    rows: [
      playbook({
        id: "pb-1",
        name: "Win-back",
        candidates: 24,
        held: 6,
        named: { pool: 130, noYes: 94, stopped: 4, noNumber: 2 },
      }),
      playbook({
        id: "pb-2",
        name: "Save our number",
        trigger: "phoned_only",
        state: "paused",
        template_name: "save_our_number",
        candidates: 10,
        held: 2,
        named: { pool: 40, noYes: 28, stopped: 0, noNumber: 0 },
      }),
      playbook({
        id: "pb-3",
        name: "Visit reminder",
        trigger: "visit_tomorrow",
        policy_class: "booking",
        template_name: "visit_reminder",
        cap_per_run: 25,
        candidates: 30,
        held: 0,
        named: { pool: 31, noYes: 1, stopped: 0, noNumber: 0 },
      }),
    ],
    triggers: [visitTrig],
  });
  fresh();
  const tree = globalThis.window.OutboundPage({});
  const card = (id) => all(tree, (n) => n.props?.["data-testid"] === "pb-card").find((c) => c.props.id === `pb-${id}`);
  const reach = (id) => byTestId(card(id), "pb-tile-reach");
  const lines = (id) => all(reach(id), (n) => n.type === "li").map((li) => textOf(li));
  const parts = (id) =>
    all(reach(id), (n) => /^cm-reach-bar-/.test(String(n.props?.className || ""))).map((n) => [
      n.props.className,
      n.props.style ? n.props.style.width : null,
    ]);

  // Out of everyone on its list, not out of who said yes: the ninety-four who never
  // did were in no number on the card, and they are the part an owner can change.
  assert.ok(textOf(reach("pb-1")).includes("24of 130 on the list"), textOf(reach("pb-1")));
  assert.deepEqual(
    lines("pb-1"),
    ["94 never said yes to offersGet their yes", "6 heard from a playbook this week", "4 asked you to stop"],
    "the most first, three at most: a card is a glance",
  );
  assert.deepEqual(
    parts("pb-1"),
    [
      ["cm-reach-bar-will", "18%"],
      ["cm-reach-bar-held", "5%"],
      ["cm-reach-bar-rest", null],
    ],
    "green reaches, amber waits, the rest is grey",
  );
  byTestId(reach("pb-1"), "pb-tile-reach-door").props.onClick();
  assert.equal(went.at(-1), "broadcasts/get-yes", "and getting their yes is one press from the card");

  // Paused: everyone it could reach waits on the pause -- the amber is all of them -- and the grey still says who never will.
  assert.ok(textOf(reach("pb-2")).includes("0of 40 on the list"), textOf(reach("pb-2")));
  assert.deepEqual(lines("pb-2"), ["paused — nothing goes out", "28 never said yes to offersGet their yes"]);
  assert.deepEqual(parts("pb-2"), [
    ["cm-reach-bar-held", "30%"],
    ["cm-reach-bar-rest", null],
  ]);

  // A reminder is owed to every visit: no cap, and its yes is to hearing from you.
  assert.ok(textOf(reach("pb-3")).includes("30of 31 with a visit tomorrow"), textOf(reach("pb-3")));
  assert.deepEqual(lines("pb-3"), ["1 never said yes to hearing from youGet their yes"]);
});

test("REGRESSION (C13): Playbooks opened on a playbook marks its card and brings it into view, and a playbook since deleted says so", () => {
  globalThis.window.__PLAYBOOKS = playbooksSurface();
  const scrolled = [];
  const keep = globalThis.document.getElementById;
  globalThis.document.getElementById = (id) =>
    id === "pb-pb-2" ? { getBoundingClientRect: () => ({ top: 1400 }), scrollIntoView: () => scrolled.push(id) } : null;
  try {
    fresh();
    const tree = globalThis.window.OutboundPage({ initialPlaybook: "pb-2" });
    const cards = all(tree, (n) => n.props?.["data-testid"] === "pb-card");
    assert.deepEqual(
      cards.map((c) => [c.props.id, classes(c).includes("is-focus")]),
      [
        ["pb-pb-1", false],
        ["pb-pb-2", true],
      ],
    );
    assert.deepEqual(scrolled, ["pb-pb-2"], "brought into view");
    fresh();
    // Gone is said once the reach-outs were read too, and none is it (a link may name a chain: Part 4 PR 8).
    globalThis.window.__REACH_OUTS = [];
    const gone = globalThis.window.OutboundPage({ initialPlaybook: "pb-deleted" });
    assert.ok(
      textOf(byTestId(gone, "pb-gone")).includes("isn't here any more"),
      "a link to a deleted playbook says so, and the cards stay",
    );
    assert.equal(all(gone, (n) => n.props?.["data-testid"] === "pb-card").length, 2);
  } finally {
    globalThis.document.getElementById = keep;
    delete globalThis.window.__REACH_OUTS;
  }
});

/* ------------------------------ words ------------------------------ */

test("REGRESSION (C25): the reply window is one rule said one way -- three places said it three ways", () => {
  assert.equal(contracts.REPLY_WINDOW_MS, contracts.REPLY_WINDOW_HOURS * 3_600_000);
  assert.equal(contracts.REPLY_WINDOW_WORDS, "within 3 days", "72 hours, as the SQL series keeps it");
  const replied = toCampaignReportVM(campaignDto()).tiles.find((t) => t.id === "replied");
  assert.equal(replied.meta, `4 wrote back ${contracts.REPLY_WINDOW_WORDS}`);
  fresh();
  const stats = globalThis.window.BcHistoryStats({
    rows: [
      { id: "b1", open: false, state: "sent", counts: { sent: 2, delivered: 2, replied: 1, skipped: 0, failed: 0 } },
    ],
    more: false,
    replyWindow: "within 2 days",
  });
  assert.ok(
    find(stats, (n) => String(n.props?.["data-tip"]).includes("within 2 days of a broadcast")),
    "Broadcasts reads the published words",
  );
  globalThis.window.__PLAYBOOKS = playbooksSurface({ replyWindow: "within 2 days" });
  fresh();
  const page = globalThis.window.OutboundPage({});
  assert.ok(
    find(page, (n) => String(n.props?.["data-tip"]).includes("within 2 days of a run")),
    "REGRESSION: Playbooks said 'after a run'",
  );
  assert.ok(
    find(page, (n) => n.props?.["data-tip"] && String(n.props["data-tip"]).includes("within 2 days of a run")),
    "and so does each card",
  );
});
