/**
 * A run you can open: every door to one broadcast lands on it, and a playbook's card shows what it sends.
 *
 * - A playbook's runs were dead text, and "Its runs in Broadcasts" opened the page of every broadcast, which could
 *   name none of them (the wiring audit's C9); Today's run rows opened Playbooks or that same page (A21).
 * - The broadcast detail said "Couldn't be read right now." with nothing to press, never re-read while a send went
 *   out, and would have offered a Retry for a broadcast that is not in the workspace at all (C23).
 * - A card named its template and never showed the words its runs send (C10); Skip this run fired on one click,
 *   when Broadcasts asks first (C16); a visit reminder's card had no policy chip, its class (booking) being looked
 *   up as a row id (book) (C18); the composer's no-template hint named Messages as plain words (C19).
 * - Run now said "sending now" over a run the server had moved to nine o'clock (C7).
 * Run against the pages on a stub React, over the view models the bridge publishes.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  toBroadcastVM,
  toRunReportVM,
  REPLY_WINDOW_MS,
  toTodayVM,
  stateOf,
  fmtDay,
  PLAYBOOK_TRIGGERS,
  POLICY_CLASS_WORDS,
  POLICY_MODE_WORDS,
} from "@chanlytics/contracts";
import { hookFrames } from "./_hook-frames.mjs";

const TID = "t-studio";
const ZONE = "America/New_York";
const H = 3_600_000;
const D = 24 * H;
const NOW = Date.now();
/** An instant relative to now: negative is past. */
const iso = (ms) => new Date(NOW + ms).toISOString();

/** A broadcast as GET broadcasts returns it (contracts BroadcastDto), for the view model the surface publishes. */
const dto = (over = {}) => ({
  id: "b-sent",
  name: "Win-back · 2026-09-10",
  template_id: "tpl-1",
  template_name: "winback_offer",
  template_language: "en_US",
  params: [{ kind: "first_name" }],
  audience: { kind: "playbook", id: "pb-1", label: "Win-back" },
  state: "sent",
  scheduled_for: iso(-5 * D),
  started_at: iso(-5 * D),
  finished_at: iso(-5 * D + 60_000),
  recipient_count: 3,
  failure: null,
  created_at: iso(-5 * D),
  playbook_id: "pb-1",
  run_for: "2026-09-10",
  counts: { queued: 0, sent: 3, skipped: 0, failed: 0, delivered: 2, read: 1, replied: 1 },
  ...over,
});
/** One person on a broadcast, as GET broadcasts/[id] returns them (contracts BroadcastRecipientDto). */
const person = (over = {}) => ({
  contact_id: "k1",
  name: "Rosa Díaz",
  first_name: "Rosa",
  phone: "+16465550123",
  state: "sent",
  reason: null,
  sent_at: iso(-5 * D),
  message_status: "delivered",
  conversation_id: "cv1",
  replied: false,
  delivered_at: iso(-5 * D + 60_000),
  read_at: null,
  replied_at: null,
  consent_after: null,
  consent_at: null,
  consent_purpose: null,
  reply_words: null,
  answered_by: null,
  answered_at: null,
  waiting_on_you: false,
  ...over,
});
const detailOf = (broadcast, recipients = [person()]) => ({ broadcast, recipients });

/** One run on a card's history (server/playbooks.ts RunSummary). */
const runOf = (i, over = {}) => ({
  id: `b-run-${i}`,
  run_for: `2026-09-${String(14 - i).padStart(2, "0")}`,
  state: "sent",
  scheduled_for: iso(-(i + 1) * D),
  recipient_count: 3,
  sent: 3,
  held: 0,
  delivered: 2,
  replied: i === 0 ? 1 : 0,
  ...over,
});
/** A playbook as the Playbooks surface publishes it: the route's row, its words, its totals (surface-data.ts). */
const playbook = (over = {}) => ({
  id: "pb-1",
  name: "Win-back",
  trigger: "quiet_30",
  template_id: "tpl-1",
  template_name: "winback_offer",
  template_language: "en_US",
  params: [{ kind: "first_name" }, { kind: "business_name" }, { kind: "text", value: "10% off this week" }],
  policy_class: "reengage",
  state: "running",
  run_hour: 10,
  cap_per_run: 25,
  gap_days: 90,
  cadence_days: 30,
  last_run_for: "2026-09-14",
  last_run_at: iso(-D),
  created_at: iso(-30 * D),
  triggerLabel: "Quiet 30 days",
  triggerHint: "anyone quiet for a month",
  schedule: "daily at 10:00",
  next: "tomorrow 10:00",
  candidates: 4,
  held: 0,
  // Everyone its moment names, as the route counts them (server/playbooks.ts triggerPools); null only when it could not.
  named: { pool: 6, noYes: 2, stopped: 0, noNumber: 0, saidYes: 4 },
  totals: {
    runs: 2,
    sent: 6,
    delivered: 4,
    replied: 1,
    held: 0,
    lastRun: { id: "b-run-0", state: "sent", run_for: "2026-09-14", recipient_count: 3 },
    waiting: null,
    history: [runOf(0), runOf(1)],
  },
  ...over,
});
const TEMPLATE = {
  id: "tpl-1",
  name: "winback_offer",
  language: "en_US",
  channel: "whatsapp",
  meta_status: "approved",
  category: "MARKETING",
  purpose: "marketing",
  body_preview: "Hi {{1}}, it's been a while at {{2}}. Come back for {{3}}.",
  variables: [
    { position: 1, label: "First name" },
    { position: 2, label: "Business" },
    { position: 3, label: "Offer" },
  ],
};
const playbooksSurface = (over = {}) => ({
  rows: [playbook()],
  templates: [TEMPLATE],
  triggers: [
    {
      id: "quiet_30",
      label: "Quiet 30 days",
      hint: "anyone quiet for a month",
      cls: "reengage",
      list: "quiet_30",
      kind: "list",
      candidates: 4,
      held: 0,
      named: { pool: 6, noYes: 2, stopped: 0, noNumber: 0, saidYes: 4 },
    },
  ],
  timezone: ZONE,
  calendar: "none",
  number: { present: true, health: { canSend: true } },
  businessName: "Northside Studio",
  bookingLink: false,
  fetchedAt: NOW,
  ...over,
});
/** Two broadcasts the Broadcasts surface lists: one sending now, one sent. */
const SENDING = dto({
  id: "b-sending",
  name: "Offers · 2026-09-15",
  state: "sending",
  started_at: iso(-60_000),
  finished_at: null,
  counts: { queued: 2, sent: 1, skipped: 0, failed: 0, delivered: 1, read: 0, replied: 0 },
});
const broadcastsSurface = (over = {}) => ({
  audiences: [
    { kind: "everyone", id: null, label: "Everyone who said yes", counts: { marketing: 2, utility: 3 } },
    { kind: "saved", id: "s1", label: "Regulars", counts: { marketing: 1, utility: 1 } },
    { kind: "saved", id: "s2", label: "Walk-ins", counts: { marketing: 1, utility: 1 } },
  ],
  templates: [],
  rows: [toBroadcastVM(SENDING, ZONE), toBroadcastVM(dto(), ZONE)],
  more: false,
  heldReasons: {},
  number: null,
  optIn: null,
  listsRead: true,
  scheduleMaxDays: 30,
  businessName: "Northside Studio",
  bookingLink: false,
  ...over,
});
// The metrics read as today-doors.test.mjs copies it.
const metrics = {
  workspace: { name: "Northside Studio", timezone: ZONE, status: "active" },
  channels: [{ kind: "whatsapp", status: "active", number: "+1 305" }],
  window: {
    days: 1,
    since: "2026-09-06T04:00:00Z",
    since_local: "2026-09-06T00:00:00",
    now_local: "2026-09-06T10:00:00",
  },
  now: {
    escalations_open: 0,
    oldest_open_escalation_at: null,
    threads_needing_human: 0,
    threads_snoozed: 0,
    threads_awaiting_reply: 0,
    last_inbound_at: "2026-09-06T13:00:00Z",
    last_outbound_at: "2026-09-06T13:01:00Z",
  },
  period: {
    messages_in: 5,
    messages_out_ai: 5,
    messages_out_you: 0,
    conversations_active: 3,
    answered_by_ai: 5,
    answered_by_you: 0,
    unanswered_in_window: 0,
    median_reply_seconds_ai: 40,
    send_failures: 0,
    escalations_new: 0,
    escalation_reasons: {},
    calls: 0,
    call_seconds: 0,
    call_sentiments: {},
    calls_voicemail: 0,
    new_contacts: 0,
  },
};

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
    pathname: "/w/studio",
    hash: "#/broadcasts",
    origin: "https://app.chanlytics.com",
    assign() {},
    replace() {},
    reload() {},
  },
  history: { replaceState() {} },
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
const { installClock } = await import("../../../apps/dashboard/src/legacy-bridge/zone.ts");
installClock();

let cells = [];
// Where each hook keeps its state: by the component that calls it, as React keeps it (_hook-frames.mjs).
const frames = hookFrames();
const went = [];
const toasts = [];
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
await import("../../../apps/dashboard/src/legacy/components/data-bits.jsx");
await import("../../../apps/dashboard/src/legacy/components/record-fold.jsx");
await import("../../../apps/dashboard/src/legacy/components/message-preview.jsx");
await import("../../../apps/dashboard/src/legacy/components/template-chips.jsx");
await import("../../../apps/dashboard/src/legacy/components/campaign-bits.jsx");
for (const k of ["StatStrip", "StatCell", "EmptyState", "FailedRead", "StatePill", "PolicyChip", "Confirm"])
  globalThis[k] = globalThis.window[k];
const { installPolicyStore } = await import("../../../apps/dashboard/src/legacy-bridge/policy-store.ts");
installPolicyStore(globalThis.window);
globalThis.useHotkey = () => {};
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
await import("../../../apps/dashboard/src/legacy/pages/templates-real.jsx");
await import("../../../apps/dashboard/src/legacy/pages/attention-bits.jsx");
await import("../../../apps/dashboard/src/legacy/pages/dashboard-a-brief.jsx");
await import("../../../apps/dashboard/src/legacy/pages/dashboard-a-command.jsx");
const { TODAY_HELPERS } = await import("../../../apps/dashboard/src/legacy-bridge/today.ts");
globalThis.window.__today = TODAY_HELPERS;
await import("../../../apps/dashboard/src/legacy/pages/broadcasts-real.jsx");
await import("../../../apps/dashboard/src/legacy/pages/outbound-real.jsx");

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
  return textOf(n.props?.children);
};
const buttonsSaying = (tree, words) => all(tree, (n) => n.type === "button" && textOf(n).trim() === words);
const press = (node) => node.props.onClick({ stopPropagation() {}, preventDefault() {} });
const settle = () => new Promise((r) => setImmediate(r));
/** A fresh mount: nothing kept from the last page, no listener left behind by it. */
const fresh = () => {
  cells = [];
  frames.begin();
  went.length = 0;
  for (const k of Object.keys(listeners)) delete listeners[k];
};

/** The detail's reads, answered in order per broadcast; the last answer repeats. */
const answers = new Map();
const asked = [];
globalThis.window.__broadcasts = {
  // The report the verbs publish (broadcast-verbs.ts): the contracts' own, stamped by the clock the page runs on.
  report: (d) =>
    toRunReportVM(d, {
      windowMs: REPLY_WINDOW_MS,
      nowMs: Date.now(),
      clock: (iso) => (iso ? globalThis.window.__clock.stamp(Date.parse(iso)) : null),
    }),
  detail: async (id) => {
    asked.push(id);
    const queue = answers.get(id) || [];
    return (
      (queue.length > 1 ? queue.shift() : queue[0]) || {
        ok: false,
        code: "not_found",
        status: 404,
        message: "Broadcast not found.",
      }
    );
  },
};
const page = (props) => {
  fresh();
  return globalThis.window.BroadcastsPage(props);
};
const again = (props) => {
  frames.begin();
  return globalThis.window.BroadcastsPage(props);
};
const card = (p) => {
  fresh();
  return globalThis.window.PlaybookCard({ p, canAct: true, onEdit() {}, flash: (t) => toasts.push(t) });
};
const redraw = (p) => {
  frames.begin();
  return globalThis.window.PlaybookCard({ p, canAct: true, onEdit() {}, flash: (t) => toasts.push(t) });
};

/* ------------------------------- a run's own door ------------------------------- */

test("REGRESSION (C9): each of a playbook's runs opens that run -- the runs were dead text, and the one door opened every broadcast", () => {
  globalThis.window.__PLAYBOOKS = playbooksSurface();
  const tree = card(playbook());
  const doors = all(tree, (n) => n.props?.["data-testid"] === "pb-run-open");
  assert.equal(doors.length, 2, "REGRESSION: a run was a line of text");
  assert.ok(
    doors.every((d) => d.type === "button"),
    "a door a keyboard reaches",
  );
  press(doors[1]);
  assert.deepEqual(went, ["broadcasts/run:b-run-1"]);
  assert.equal(
    all(tree, (n) => n.type === "button" && textOf(n).includes("Its runs in Broadcasts")).length,
    0,
    "REGRESSION: the door to every broadcast, which could name none of them",
  );
  assert.equal(byTestId(tree, "pb-history-more"), null, "every run is on the card");
  const busy = card(
    playbook({ totals: { ...playbook().totals, runs: 14, history: Array.from({ length: 10 }, (_, i) => runOf(i)) } }),
  );
  assert.equal(
    textOf(byTestId(busy, "pb-history-more")),
    "The newest 10 of 14 runs",
    "a card that lists some of its runs says so",
  );
});

test("REGRESSION (C9): a link to a run opens it on Broadcasts -- its report on a screen of its own, as the canvas draws it, whether the list holds it or not", async () => {
  globalThis.window.__BROADCASTS = broadcastsSurface();
  answers.set("b-sent", [{ ok: true, data: detailOf(dto()) }]);
  // The ledger's own doors: a card's name and its Open are links to the run.
  let tree = page({ initialSegment: null, initialRun: null });
  const card = find(tree, (n) => n.props?.id === "bc-run-b-sent");
  press(byTestId(card, "bc-open-who"));
  press(buttonsSaying(card, "Open")[0]);
  assert.deepEqual(
    went,
    ["broadcasts/run:b-sent", "broadcasts/run:b-sent"],
    "REGRESSION: nothing named one broadcast, so nothing opened one",
  );
  press(byTestId(tree, "bc-open-who"));
  assert.equal(went.at(-1), "broadcasts/run:b-sending", "a scheduled or sending broadcast opens by its link too");

  const listed = { initialSegment: null, initialRun: "b-sent" };
  page(listed);
  await settle();
  tree = again(listed);
  const details = all(tree, (n) => n.props?.["data-testid"] === "bc-detail");
  assert.equal(details.length, 1);
  assert.equal(
    byTestId(tree, "bc-run-solo").props.id,
    "bc-run-b-sent",
    "the screen a link lands on carries the run's anchor",
  );
  assert.equal(byTestId(tree, "bc-head"), null, "the report is its own screen: the ledger is not drawn under it");
  assert.equal(byTestId(tree, "bc-composer"), null);
  assert.equal(
    textOf(find(details[0], (n) => n.type === "h1")),
    "Win-back · 2026-09-10",
    "the run's name is the headline",
  );
  assert.ok(
    find(details[0], (n) => n.props?.["data-state"] === "sent"),
    "with its state beside it",
  );
  assert.ok(textOf(details[0]).includes("Rosa Díaz"), "and who got it");
  press(byTestId(details[0], "bc-detail-close"));
  assert.deepEqual(
    went.at(-1),
    "broadcasts",
    "closing is a link too, so the address never names a run that is not open",
  );

  answers.set("b-old", [{ ok: true, data: detailOf(dto({ id: "b-old", name: "Win-back · 2026-06-01" })) }]);
  const older = { initialSegment: null, initialRun: "b-old" };
  page(older);
  await settle();
  tree = again(older);
  const solo = byTestId(tree, "bc-run-solo");
  assert.ok(
    solo && textOf(solo).includes("Win-back · 2026-06-01"),
    "a run past the newest fifty is read by its id and shown the same way",
  );
  assert.ok(
    find(solo, (n) => n.props?.["data-state"] === "sent"),
    "with its state",
  );
});

test("the page follows its link rather than starting again: opening a run keeps the audience chosen, and a link to a list picks it", () => {
  globalThis.window.__BROADCASTS = broadcastsSurface();
  const chosen = (tree) =>
    textOf(
      find(tree, (n) => n.props?.["data-testid"] === "bc-audience" && String(n.props.className).includes("active")),
    );
  let tree = page({ initialSegment: "s1", initialRun: null });
  assert.ok(chosen(tree).startsWith("Regulars"));
  again({ initialSegment: null, initialRun: "b-sent" });
  tree = again({ initialSegment: null, initialRun: "b-sent" });
  assert.equal(byTestId(tree, "bc-composer"), null, "a run opens on its own screen");
  again({ initialSegment: null, initialRun: null });
  tree = again({ initialSegment: null, initialRun: null });
  assert.ok(chosen(tree).startsWith("Regulars"), "and closing it leaves the send, and its audience, where they were");
  again({ initialSegment: "s2", initialRun: null });
  tree = again({ initialSegment: "s2", initialRun: null });
  assert.ok(chosen(tree).startsWith("Walk-ins"), "and a later link to another list picks that list");
  press(find(tree, (n) => n.props?.["data-testid"] === "bc-audience" && textOf(n).startsWith("Regulars")));
  globalThis.window.__BROADCASTS = broadcastsSurface();
  again({ initialSegment: "s2", initialRun: null });
  tree = again({ initialSegment: "s2", initialRun: null });
  assert.ok(
    chosen(tree).startsWith("Regulars"),
    "while the surface re-reading its lists does not undo a choice made on the page",
  );
});

test("a run opened before opens at once from what the tab holds, and is read again behind -- every open was a read first (~250ms of 'Reading who got it…', measured)", async () => {
  globalThis.window.__BROADCASTS = broadcastsSurface();
  answers.set("b-sent", [{ ok: true, data: detailOf(dto()) }]);
  answers.set("b-new", [{ ok: true, data: detailOf(dto({ id: "b-new", name: "Win-back · 2026-09-20" })) }]);
  // What the courier's read cache holds (broadcast-verbs.ts peekDetail): the last answer for a run this tab opened.
  globalThis.window.__broadcasts.peekDetail = (id) => (id === "b-sent" ? { ok: true, data: detailOf(dto()) } : null);
  asked.length = 0;
  try {
    const seen = byTestId(page({ initialSegment: null, initialRun: "b-sent" }), "bc-detail");
    assert.ok(
      !textOf(seen).includes("Reading who got it"),
      "REGRESSION: a run opened a moment ago was read before anything showed",
    );
    assert.equal(textOf(find(seen, (n) => n.type === "h1")), "Win-back · 2026-09-10", "its report, on the first paint");
    assert.deepEqual(asked, ["b-sent"], "and it is read again behind");
    const cold = byTestId(page({ initialSegment: null, initialRun: "b-new" }), "bc-detail");
    assert.ok(textOf(cold).includes("Reading who got it"), "a run never opened still says it is reading");
  } finally {
    delete globalThis.window.__broadcasts.peekDetail;
  }
});

test("REGRESSION (C23): a detail that could not be read says so with a Retry, and a link to a broadcast that is not here says that instead", async () => {
  globalThis.window.__BROADCASTS = broadcastsSurface();
  asked.length = 0;
  answers.set("b-sent", [
    { ok: false, code: "network", status: 0, message: "offline" },
    { ok: true, data: detailOf(dto()) },
  ]);
  const props = { initialSegment: null, initialRun: "b-sent" };
  page(props);
  await settle();
  let tree = again(props);
  assert.ok(byTestId(tree, "bc-detail-failed"), "REGRESSION: 'Couldn't be read right now.' and nothing to press");
  press(byTestId(tree, "bc-detail-failed-retry"));
  again(props);
  await settle();
  tree = again(props);
  assert.equal(asked.filter((id) => id === "b-sent").length, 2, "Retry reads it again");
  assert.ok(textOf(byTestId(tree, "bc-detail")).includes("Rosa Díaz"), "and draws what it read");

  answers.set("b-elsewhere", [{ ok: false, code: "not_found", status: 404, message: "Broadcast not found." }]);
  const gone = { initialSegment: null, initialRun: "b-elsewhere" };
  page(gone);
  await settle();
  tree = again(gone);
  assert.ok(byTestId(tree, "bc-detail-gone"), "a broadcast that is not in this workspace is said to be not here");
  assert.equal(byTestId(tree, "bc-detail-failed"), null, "not offered a Retry that can only fail again");
});

test("REGRESSION (C23): an open detail keeps up while its broadcast is sending, and stops asking once it has sent", async () => {
  globalThis.window.__BROADCASTS = broadcastsSurface();
  asked.length = 0;
  answers.set("b-sending", [
    {
      ok: true,
      data: detailOf(SENDING, [person({ state: "queued", message_status: null, sent_at: null, delivered_at: null })]),
    },
    { ok: true, data: detailOf(SENDING, [person()]) },
    { ok: false, code: "network", status: 0, message: "offline" },
    {
      ok: true,
      data: detailOf(dto({ id: "b-sending", name: "Offers · 2026-09-15", state: "sent" }), [
        person({ message_status: "read", read_at: iso(-1000) }),
      ]),
    },
  ]);
  const props = { initialSegment: null, initialRun: "b-sending" };
  const onSurfaceRead = async () => {
    globalThis.window.dispatchEvent({ type: "surface:broadcasts" });
    again(props);
    await settle();
    return again(props);
  };
  page(props);
  await settle();
  let tree = again(props);
  const pillOf = (t) => textOf(find(byTestId(t, "bc-person"), (n) => n.props?.className === "bc-person-pill"));
  const sentFigure = (t) =>
    textOf(find(byTestId(t, "bc-fig-sent"), (n) => String(n.props?.className).includes("bc-fig-v")));
  assert.deepEqual([pillOf(tree), sentFigure(tree)], ["Waiting", "0"], "one on its way");
  tree = await onSurfaceRead();
  assert.deepEqual(
    [pillOf(tree), sentFigure(tree)],
    ["Delivered", "1"],
    "REGRESSION: the detail never re-read while the send went out",
  );
  tree = await onSurfaceRead();
  assert.deepEqual(
    [pillOf(tree), sentFigure(tree)],
    ["Delivered", "1"],
    "a re-read that fails mid-send keeps what was read",
  );
  assert.equal(byTestId(tree, "bc-detail-failed"), null, "rather than a failure over it");
  await onSurfaceRead();
  const reads = asked.filter((id) => id === "b-sending").length;
  await onSurfaceRead();
  assert.equal(
    asked.filter((id) => id === "b-sending").length,
    reads,
    "sent, it has nothing left to change, and is not read again",
  );
});

test("REGRESSION (A21): Today's run rows open the run -- a run waiting for you opened Playbooks, and one about to send or sent today opened every broadcast", () => {
  const quiet = { queued: 3, sent: 0, skipped: 0, failed: 0, delivered: 0, read: 0, replied: 0 };
  const waiting = dto({
    id: "b-wait",
    name: "Win-back · 2026-09-15",
    state: "pending_approval",
    started_at: null,
    finished_at: null,
    scheduled_for: iso(-H),
    counts: quiet,
  });
  const soon = dto({
    id: "b-soon",
    name: "Offers · 2026-09-15",
    state: "scheduled",
    started_at: null,
    finished_at: null,
    scheduled_for: iso(20 * 60_000),
    audience: { kind: "playbook", id: "pb-2", label: "Offers" },
    playbook_id: "pb-2",
    counts: quiet,
  });
  const done = dto({ id: "b-done", name: "Save our number · 2026-09-15", state: "sent", started_at: iso(0) });
  globalThis.window.__BROADCASTS = { rows: [waiting, soon, done].map((b) => toBroadcastVM(b, ZONE)) };
  globalThis.window.TODAY_DATA = toTodayVM(metrics, [], [], [], new Date("2026-09-06T14:00:00Z"));
  try {
    fresh();
    const queue = globalThis.window.AgentCommand();
    const run = byTestId(queue, "brief-run-row");
    const who = buttonsSaying(run, "See who's on it")[0];
    assert.ok(who, "REGRESSION: the run's second door was Open Playbooks");
    press(who);
    run.props.onClick();
    const next = byTestId(queue, "brief-run-soon");
    press(buttonsSaying(next, "Open")[0]);
    next.props.onClick();
    assert.deepEqual(
      went,
      ["broadcasts/run:b-wait", "broadcasts/run:b-wait", "broadcasts/run:b-soon", "broadcasts/run:b-soon"],
      "REGRESSION: Playbooks, and the page of every broadcast",
    );
    fresh();
    // What ran today is a line of the day's card, under the work (TodayCard); it was a beat of the hero above it.
    const recap = globalThis.window.TodayCard();
    press(buttonsSaying(byTestId(recap, "brief-run-done"), "Open")[0]);
    assert.deepEqual(went, ["broadcasts/run:b-done"]);
  } finally {
    delete globalThis.window.TODAY_DATA;
  }
});

/* ------------------------------ what a card shows ------------------------------ */

test("REGRESSION (C10): a card shows the words its runs send -- it named the template and never showed the message", () => {
  globalThis.window.__PLAYBOOKS = playbooksSurface();
  let tree = card(playbook());
  const words = byTestId(tree, "pb-words");
  assert.ok(words, "REGRESSION: the template's name, and no words");
  assert.ok(
    textOf(words).includes("Hi Dani, it's been a while at Northside Studio. Come back for 10% off this week."),
    textOf(words),
  );
  // The whole message, with no press. It was two clamped lines behind a "Show the
  // whole message" toggle, under the trigger, the schedule, the audience, the
  // template's name and the next run -- the least prominent thing on a card whose
  // subject it is.
  assert.ok(byTestId(byTestId(tree, "pb-words"), "message-preview"), "the whole message, as the customer sees it");
  assert.equal(byTestId(tree, "pb-words-toggle"), null, "and nothing to press to see it");

  globalThis.window.__PLAYBOOKS = playbooksSurface({ templates: [] });
  tree = card(playbook());
  assert.equal(byTestId(tree, "pb-words"), null);
  assert.match(
    textOf(byTestId(tree, "pb-template-gone")),
    /no longer approved/,
    "a template WhatsApp no longer approves is said, since the runs skip it",
  );

  globalThis.window.__PLAYBOOKS = playbooksSurface({ templates: null });
  fresh();
  const failed = globalThis.window.OutboundPage({});
  assert.ok(byTestId(failed, "pb-cards-templates-failed"), "a templates read that failed is said once, over the cards");
  assert.equal(byTestId(failed, "pb-template-gone"), null, "and no card calls its template withdrawn");
});

test("REGRESSION (C16): Skip this run asks first, as Broadcasts does -- it skipped on one click", async () => {
  const skipped = [];
  globalThis.window.__playbooks = {
    skipRun: async (id) => {
      skipped.push(id);
      return { ok: true, data: {} };
    },
  };
  globalThis.window.__PLAYBOOKS = playbooksSurface();
  const p = playbook({
    totals: { ...playbook().totals, waiting: { id: "b-wait", recipient_count: 3, name: "Win-back · 2026-09-15" } },
  });
  let tree = card(p);
  press(byTestId(tree, "pb-skip"));
  assert.deepEqual(skipped, [], "REGRESSION: one click skipped the run");
  tree = redraw(p);
  assert.ok(textOf(byTestId(tree, "pb-skip-confirm")).includes("Skip this run of Win-back?"));
  assert.equal(byTestId(tree, "pb-approve"), null, "while it asks, Approve steps aside");
  assert.equal(byTestId(tree, "pb-delete-confirm"), null, "and the delete's question stays its own");
  await press(byTestId(tree, "pb-skip-yes"));
  assert.deepEqual(skipped, ["b-wait"]);
});

test("REGRESSION (C18): a visit reminder's card shows its policy chip -- its class, booking, was looked up as a row id", () => {
  globalThis.window.__POLICIES = { role: "owner", rows: [{ class: "booking", mode: "auto", limits: {} }] };
  try {
    globalThis.window.__PLAYBOOKS = playbooksSurface();
    const tree = card(
      playbook({
        id: "pb-v",
        name: "Visit reminder",
        trigger: "visit_tomorrow",
        policy_class: "booking",
        triggerLabel: "Visit tomorrow",
      }),
    );
    const chip = find(tree, (n) => n.type === globalThis.PolicyChip);
    assert.ok(chip && chip.rendered, "REGRESSION: no chip at all");
    assert.equal(
      textOf(chip.rendered),
      `${POLICY_CLASS_WORDS.booking.short} · ${POLICY_MODE_WORDS.auto.chip}`,
      "the chip says what the mode does, not how it is filed",
    );
  } finally {
    delete globalThis.window.__POLICIES;
  }
});

test("REGRESSION (C19): with no approved template, the composer's hint opens Messages -- it named the page in plain words", () => {
  globalThis.window.__PLAYBOOKS = playbooksSurface({ rows: [], templates: [] });
  fresh();
  globalThis.window.OutboundPage({});
  globalThis.window.dispatchEvent({ type: "playbooks:new" });
  frames.begin();
  const tree = globalThis.window.OutboundPage({});
  const hint = byTestId(tree, "pb-no-template");
  assert.ok(hint, "the composer is open on a workspace with no template");
  const door = find(hint, (n) => n.type === "button");
  assert.ok(door, "REGRESSION: 'Campaigns › Messages' as words");
  press(door);
  assert.deepEqual(went, ["messages"]);
});

test("REGRESSION (C7): Run now says when the run really goes -- it said 'sending now' over a run the server moved to nine", async () => {
  globalThis.window.__PLAYBOOKS = playbooksSurface();
  globalThis.window.__playbooks = {
    runNow: async () => ({
      ok: true,
      data: {
        id: "pb-1",
        outcome: "sent",
        eligible: 3,
        broadcast_id: "b-new",
        name: "Win-back",
        scheduled_for: iso(10 * H),
        moved_from: iso(0),
      },
    }),
  };
  toasts.length = 0;
  await press(byTestId(card(playbook()), "pb-run-now"));
  let said = textOf(toasts.at(-1).msg);
  assert.ok(said.includes("scheduled for"), `REGRESSION: ${said}`);
  assert.ok(!said.includes("sending now"), said);

  // A dashboard deployed ahead of its edge gets no time back, and does not claim one.
  globalThis.window.__playbooks = {
    runNow: async () => ({
      ok: true,
      data: { id: "pb-1", outcome: "sent", eligible: 3, broadcast_id: "b-new", name: "Win-back" },
    }),
  };
  await press(byTestId(card(playbook()), "pb-run-now"));
  said = textOf(toasts.at(-1).msg);
  assert.ok(!/\bnow\b/.test(said), said);
});

test("A card says what its runs earned as one sentence, and nothing when it has not run", () => {
  globalThis.window.__PLAYBOOKS = playbooksSurface();
  // Five numbers with dots between them became a sentence, the way Today,
  // Reports and People say theirs; each run below still says its own.
  const words = textOf(byTestId(card(playbook()), "pb-results"))
    .replace(/\s+/g, " ")
    .trim();
  assert.equal(words, "2 runs so far: 6 sent, 4 delivered, 1 wrote back.");
  // A held-back count only when there is one to say.
  const held = textOf(byTestId(card(playbook({ totals: { ...playbook().totals, held: 3 } })), "pb-results"));
  assert.ok(held.includes("3 held back"), held);
  // And a playbook that has never run claims no numbers at all.
  assert.equal(byTestId(card(playbook({ totals: { ...playbook().totals, runs: 0 } })), "pb-results"), null);
});

test("A card leads with what it sends, not with how it is configured", () => {
  globalThis.window.__PLAYBOOKS = playbooksSurface();
  const tree = card(playbook());
  // The trigger, the schedule, the audience and the next run were five chips and
  // a meta line above the message; they are one sentence beside it now.
  const facts = textOf(find(tree, (n) => String(n.props?.className || "") === "ob-sentence")).replace(/\s+/g, " ");
  for (const part of ["on the list said yes", "Next run"]) assert.ok(facts.includes(part), facts);
  // The trigger's hint is a CONDITION -- contracts PLAYBOOK_TRIGGERS say "Nothing
  // heard in 30 days", "Only ever phoned, never texted" -- so it leads. "Goes to"
  // in front of one read as broken English on five of the six, in production.
  assert.ok(!facts.includes("Goes to"), facts);
  const hint = PLAYBOOK_TRIGGERS.find((t) => t.id === "quiet_30").hint;
  const real = textOf(
    find(card(playbook({ triggerHint: hint })), (n) => String(n.props?.className || "") === "ob-sentence"),
  ).replace(/\s+/g, " ");
  assert.ok(real.startsWith(`${hint} —`), real);
  assert.equal(
    find(tree, (n) => String(n.props?.className || "").includes("ob-audience")),
    null,
    "no chip row above the message",
  );
  // The audience is still a door to the people it means.
  press(byTestId(tree, "pb-audience"));
  assert.match(went.at(-1), /^clients\/seg:/);
});

test("REGRESSION: a playbook whose yes has no number says so and offers no QR -- its card said '0 people on the list said yes' and sent the owner for an answer they had", async () => {
  // The chain, run: the route's pools (server/playbooks.ts triggerPools), the surface the bridge builds from them,
  // the words and the door it publishes (installPlaybooks), and the card that draws them.
  const { installPlaybooks } = await import("../../../apps/dashboard/src/legacy-bridge/playbooks.ts");
  const { playbooksOverride } = await import("../../../apps/dashboard/src/legacy-bridge/surface-data.ts");
  const empty = { candidates: 0, held: 0, pool: 0, noYes: 0, stopped: 0, noNumber: 0, saidYes: 0 };
  const pools = {
    ...Object.fromEntries(PLAYBOOK_TRIGGERS.map((t) => [t.id, empty])),
    // One wrote by email and said yes to offers; the other has a number and never said it: nobody can be sent a run.
    quiet_30: { ...empty, pool: 2, noYes: 1, noNumber: 1, saidYes: 1 },
    // Two with numbers, and neither said yes to offers.
    new_week: { ...empty, pool: 2, noYes: 2 },
  };
  // The route's row: the fixture less what the surface adds to it (its words and its pools).
  const surfaceOnly = new Set(["triggerLabel", "triggerHint", "schedule", "next", "candidates", "held"]);
  const route = Object.fromEntries(Object.entries(playbook()).filter(([k]) => !surfaceOnly.has(k)));
  const rows = [
    { ...route, id: "pb-quiet", trigger: "quiet_30" },
    { ...route, id: "pb-new", name: "Welcome", trigger: "new_week", policy_class: "campaign" },
    // Nobody the moment names at all.
    { ...route, id: "pb-phoned", name: "Save our number", trigger: "phoned_only" },
  ];
  const answer = (data) =>
    new Response(JSON.stringify({ ok: true, data }), { status: 200, headers: { "content-type": "application/json" } });
  const kept = globalThis.window.fetch;
  globalThis.window.fetch = async (url) => {
    const path = new URL(String(url), "https://app.chanlytics.com").pathname;
    if (path === "/api/v1/playbooks") return answer({ playbooks: rows, pools, timezone: ZONE, calendar: "none" });
    if (path === "/api/v1/templates") return answer({ templates: [TEMPLATE] });
    if (path === "/api/v1/channels") return answer({ channels: [] });
    return answer({ config: { brain: { business_name: "Northside Studio" } }, version: 1 });
  };
  const installed = [
    "__playbooks",
    "__refreshPlaybooks",
    "__playbookReach",
    "__playbookReachWords",
    "__playbookReachDoor",
    "__playbookNoNumberWords",
    "__reachLines",
    "__poolWords",
    "__playbookName",
  ];
  installPlaybooks();
  try {
    await playbooksOverride.apply();
    const drawn = (id) => card(globalThis.window.__PLAYBOOKS.rows.find((p) => p.id === id));
    const sentence = (tree) =>
      textOf(find(tree, (n) => String(n.props?.className || "") === "ob-sentence")).replace(/\s+/g, " ");
    const hint = PLAYBOOK_TRIGGERS.find((t) => t.id === "quiet_30").hint;
    const noNumber = drawn("pb-quiet");
    assert.ok(
      sentence(noNumber).includes(`${hint} — 1 person on the list said yes to offers, with no number to send to.`),
      `REGRESSION: ${sentence(noNumber)}`,
    );
    assert.ok(/Next run .+ — nobody to send to\./.test(sentence(noNumber)), sentence(noNumber));
    assert.equal(byTestId(noNumber, "pb-reach-door"), null, "REGRESSION: the QR asked for an answer they had given");
    // Nobody on it said yes: its count is true, and the door to that yes stands.
    const noYes = drawn("pb-new");
    assert.ok(sentence(noYes).includes("— 0 people on the list said yes."), sentence(noYes));
    assert.equal(textOf(byTestId(noYes, "pb-reach-door")), "Get their yes");
    // Nobody on it at all: there is no yes to get.
    assert.equal(byTestId(drawn("pb-phoned"), "pb-reach-door"), null);
  } finally {
    for (const k of installed) delete globalThis.window[k];
    globalThis.window.fetch = kept;
  }
});

test("REGRESSION: counts that could not be read are said once, and nothing draws a zero it never counted -- a People read that failed drew '0 of 0', 'nobody to send to' and the QR on every card", async () => {
  const { installPlaybooks } = await import("../../../apps/dashboard/src/legacy-bridge/playbooks.ts");
  const { playbooksOverride } = await import("../../../apps/dashboard/src/legacy-bridge/surface-data.ts");
  // The route's answer when its People read failed (server/playbooks.ts triggerPools): no moment was counted.
  const pools = Object.fromEntries(PLAYBOOK_TRIGGERS.map((t) => [t.id, null]));
  const surfaceOnly = new Set(["triggerLabel", "triggerHint", "schedule", "next", "candidates", "held"]);
  const route = Object.fromEntries(Object.entries(playbook()).filter(([k]) => !surfaceOnly.has(k)));
  const answer = (data) =>
    new Response(JSON.stringify({ ok: true, data }), { status: 200, headers: { "content-type": "application/json" } });
  const kept = globalThis.window.fetch;
  globalThis.window.fetch = async (url) => {
    const path = new URL(String(url), "https://app.chanlytics.com").pathname;
    if (path === "/api/v1/playbooks") return answer({ playbooks: [route], pools, timezone: ZONE, calendar: "none" });
    if (path === "/api/v1/templates") return answer({ templates: [TEMPLATE] });
    if (path === "/api/v1/channels") return answer({ channels: [] });
    return answer({ config: { brain: { business_name: "Northside Studio" } }, version: 1 });
  };
  const installed = [
    "__playbooks",
    "__refreshPlaybooks",
    "__playbookReach",
    "__playbookReachWords",
    "__playbookReachDoor",
    "__playbookNoNumberWords",
    "__reachLines",
    "__poolWords",
    "__playbookName",
  ];
  installPlaybooks();
  try {
    await playbooksOverride.apply();
    fresh();
    let page = globalThis.window.OutboundPage({});
    assert.match(
      textOf(byTestId(page, "pb-counts-failed")),
      /Couldn't read who each moment reaches/,
      "said once, over the cards",
    );
    assert.ok(
      !/anyone to send to/.test(textOf(byTestId(page, "pb-standing"))),
      `REGRESSION: ${textOf(byTestId(page, "pb-standing"))}`,
    );
    assert.equal(byTestId(page, "pb-tile-reach"), null, "REGRESSION: the tile drew '0 of 0 who said yes'");
    const slots = all(page, (n) => n.props?.["data-testid"] === "pb-slot");
    assert.ok(slots.length > 0);
    for (const s of slots)
      assert.ok(!/nobody today|people today|person today/i.test(textOf(s)), `REGRESSION: ${textOf(s)}`);
    // The card says what it knows -- the moment, the clock, the next run -- and no count, no reach, no door.
    const opened = card(globalThis.window.__PLAYBOOKS.rows[0]);
    const said = textOf(find(opened, (n) => String(n.props?.className || "") === "ob-sentence")).replace(/\s+/g, " ");
    assert.ok(/Next run/.test(said), said);
    assert.ok(!said.includes("on the list said yes") && !said.includes("nobody to send to"), `REGRESSION: ${said}`);
    assert.equal(byTestId(opened, "pb-reach-door"), null);
    // Nor does the composer, where a moment is picked by who it reaches.
    fresh();
    page = globalThis.window.OutboundPage({});
    find(
      all(page, (n) => n.props?.["data-testid"] === "pb-slot")[0],
      (n) => n.props?.["data-testid"] === "pb-slot-start",
    ).props.onClick();
    frames.begin();
    page = globalThis.window.OutboundPage({});
    // Its "Who it's for" section (the sheet around it is record-sheet.jsx, not loaded here).
    const who = byTestId(page, "pb-who");
    assert.ok(who, "the composer opens");
    assert.equal(byTestId(who, "pb-reach"), null, "REGRESSION: the composer drew '0 of 0'");
    // And its moments, listed: none says how many it reaches today.
    find(
      who,
      (n) => String(n.props?.className || "").includes("pb-pick") && typeof n.props?.onClick === "function",
    ).props.onClick({});
    frames.begin();
    page = globalThis.window.OutboundPage({});
    const options = all(page, (n) => n.props?.role === "option");
    assert.ok(options.length > 0, "the moments are listed");
    for (const o of options) assert.ok(!/nobody today|\d+ today/i.test(textOf(o)), `REGRESSION: ${textOf(o)}`);
  } finally {
    for (const k of installed) delete globalThis.window[k];
    globalThis.window.fetch = kept;
  }
});

test("A paused playbook says it is paused, and a run's day is words", () => {
  globalThis.window.__PLAYBOOKS = playbooksSurface();
  // `nextRunLabel` returns the literal "paused" when it is, and the card read
  // "Next run paused" -- seen in production on the month's offer.
  const off = textOf(
    find(
      card(playbook({ state: "paused", next: "paused" })),
      (n) => String(n.props?.className || "") === "ob-sentence",
    ),
  ).replace(/\s+/g, " ");
  assert.ok(off.includes("Paused — nothing runs until you resume it."), off);
  assert.ok(!off.includes("Next run paused"), off);

  // A run's day is a calendar day, not an instant: it was printed as its raw key.
  const on = textOf(
    find(card(playbook({ last_run_for: "2026-08-25" })), (n) => String(n.props?.className || "") === "ob-sentence"),
  ).replace(/\s+/g, " ");
  assert.ok(on.includes(`Last ran ${fmtDay("2026-08-25")}.`), on);
  assert.ok(!on.includes("2026-08-25"), on);
  // And in every row of its history, which said the key too.
  const hist = textOf(byTestId(card(playbook()), "pb-history"));
  assert.ok(!/\d{4}-\d{2}-\d{2}/.test(hist), hist);

  // A list with people on it that offers nobody says why: one message per person
  // per week, across playbooks. A bare "0 people" read as broken.
  const held = textOf(
    find(card(playbook({ candidates: 0, held: 2 })), (n) => String(n.props?.className || "") === "ob-sentence"),
  ).replace(/\s+/g, " ");
  assert.ok(held.includes("0 people on the list said yes, and 2 people more heard from you this week and wait"), held);
});
