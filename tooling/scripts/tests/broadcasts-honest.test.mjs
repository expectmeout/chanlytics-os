/**
 * Broadcasts and Messages: each state said in words, and each word from where it is kept.
 *
 * - A broadcast's composer could pick a visit's time a broadcast does not have, a visit playbook's composer held a
 *   value its select had no option for, and a run's detail printed "visit_when" (the wiring audit's C6, C24).
 * - Deleting a message a running playbook sends went through, and its runs skipped from then on (C8).
 * - A failed broadcast read "· failed" with its reason on file (C12); a send in flight was prose with no bar, an
 *   Approve could be pressed twice, and "N queued" counted runs waiting for a person (C14).
 * - The sending hours and the pace were typed into the pages beside the constants they restate (C15).
 * - On Messages one busy flag relabelled every button (C20), and the quality WhatsApp rated a message was never
 *   drawn (C22).
 * - A run opened on a page already scrolled stayed out of sight, found on the live page after B4a.
 * Run against the pages on a stub React, over the view models and the starter library the bridge publishes.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import * as contracts from "@chanlytics/contracts";

const { toBroadcastVM, stateOf, numberHealth, POLICY_CLASS_WORDS } = contracts;
const TID = "t-studio";
const ZONE = "America/New_York";
const H = 3_600_000;
const D = 24 * H;
const NOW = Date.now();
/** An instant relative to now: negative is past. */
const iso = (ms) => new Date(NOW + ms).toISOString();
const quiet = { queued: 3, sent: 0, skipped: 0, failed: 0, delivered: 0, read: 0, replied: 0 };

/** A broadcast as GET broadcasts returns it (contracts BroadcastDto). */
const dto = (over = {}) => ({
  id: "b-sent", name: "Win-back · 2026-09-10", template_id: "tpl-1", template_name: "winback_offer", template_language: "en_US",
  params: [{ kind: "first_name" }], audience: { kind: "playbook", id: "pb-1", label: "Win-back" },
  state: "sent", scheduled_for: iso(-5 * D), started_at: iso(-5 * D), finished_at: iso(-5 * D + 60_000), recipient_count: 3, failure: null,
  created_at: iso(-5 * D), playbook_id: "pb-1", run_for: "2026-09-10",
  counts: { queued: 0, sent: 3, skipped: 0, failed: 0, delivered: 2, read: 1, replied: 1 },
  ...over,
});
const person = (over = {}) => ({
  contact_id: "k1", name: "Rosa Díaz", phone: "+16465550123", state: "sent", reason: null, sent_at: iso(-5 * D), message_status: "delivered",
  conversation_id: "cv1", replied: false, delivered_at: iso(-5 * D + 60_000), read_at: null, replied_at: null, ...over,
});
const detailOf = (broadcast, recipients = [person()]) => ({ broadcast, recipients });
const healthyNumber = { present: true, display: "+1 305-555-0100", health: numberHealth({ quality: "GREEN", event: null, limit: "TIER_1K" }) };
/** The Broadcasts surface as the bridge publishes it (surface-data.ts). */
const broadcastsSurface = (over = {}) => ({
  audiences: [
    { kind: "everyone", id: null, label: "Everyone who said yes", counts: { marketing: 2, conversational: 3 } },
    { kind: "saved", id: "s1", label: "Regulars", counts: { marketing: 1, conversational: 1 } },
  ],
  templates: [], rows: [toBroadcastVM(dto(), ZONE)], more: false, heldReasons: contracts.HELD_REASONS,
  chunk: contracts.BROADCAST_CHUNK, number: null, optIn: null, listsRead: true, scheduleMaxDays: 30, businessName: "Northside Studio", bookingLink: false, ...over,
});
const playbook = (over = {}) => ({
  id: "pb-1", name: "Win-back", trigger: "quiet_30", template_id: "tpl-1", template_name: "winback_offer", template_language: "en_US",
  params: [{ kind: "first_name" }], policy_class: "reengage", state: "running", run_hour: 10, cap_per_run: 25, gap_days: 90, cadence_days: 30,
  last_run_for: null, last_run_at: null, created_at: iso(-30 * D),
  triggerLabel: "Quiet 30 days", triggerHint: "anyone quiet for a month", schedule: "daily at 10:00", next: "tomorrow 10:00", candidates: 4, held: 0,
  totals: { runs: 0, sent: 0, delivered: 0, replied: 0, held: 0, lastRun: null, waiting: null, history: [] },
  ...over,
});
const playbooksSurface = (over = {}) => ({
  rows: [playbook()], templates: [],
  triggers: [{ id: "quiet_30", label: "Quiet 30 days", hint: "anyone quiet for a month", cls: "reengage", list: "quiet_30", kind: "list", candidates: 4, held: 0 }],
  classWords: POLICY_CLASS_WORDS, timezone: ZONE, calendar: "none", number: { present: true, health: { canSend: true } },
  businessName: "Northside Studio", bookingLink: false, fetchedAt: NOW, ...over,
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
  location: { pathname: "/w/studio", hash: "#/broadcasts", origin: "https://app.chanlytics.com", assign() {}, replace() {}, reload() {} },
  history: { replaceState() {} },
  innerHeight: 800,
  localStorage: globalThis.localStorage,
  sessionStorage: globalThis.sessionStorage,
  addEventListener: (type, fn) => { (listeners[type] ||= new Set()).add(fn); },
  removeEventListener: (type, fn) => { listeners[type]?.delete(fn); },
  dispatchEvent: (ev) => { for (const fn of [...(listeners[ev.type] || [])]) fn(ev); return true; },
  setTimeout: (fn, ms) => setTimeout(fn, ms),
  clearTimeout: (h) => clearTimeout(h),
  setInterval: () => 1,
  clearInterval() {},
  __WORKSPACES: [{ id: TID, slug: "studio", name: "Northside Studio", status: "active", timezone: ZONE }],
  __ACTIVE_WORKSPACE: TID,
};
const { installClock } = await import("../../../apps/dashboard/src/legacy-bridge/zone.ts");
installClock();
const { installTemplates } = await import("../../../apps/dashboard/src/legacy-bridge/templates.ts");
installTemplates();

let cells = [];
let seq = 0;
const went = [];
const toasts = [];
globalThis.Icon = "Icon";
globalThis.React = {
  Fragment: "Fragment",
  createElement: (type, p, ...kids) => {
    const props = { ...(p || {}), children: kids.flat(Infinity) };
    const node = { type, props };
    if (typeof type === "function") node.rendered = type(props);
    return node;
  },
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
for (const k of ["StatStrip", "StatCell", "EmptyState", "FailedRead", "StatePill", "PolicyChip", "Confirm"]) globalThis[k] = globalThis.window[k];
globalThis.useHotkey = () => {};
Object.assign(globalThis.window, {
  usePPToast: () => [null, (t) => toasts.push(t)],
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
await import("../../../apps/dashboard/src/legacy/components/message-preview.jsx");
await import("../../../apps/dashboard/src/legacy/pages/templates-real.jsx");
await import("../../../apps/dashboard/src/legacy/pages/broadcasts-real.jsx");
await import("../../../apps/dashboard/src/legacy/pages/outbound-real.jsx");
await import("../../../apps/dashboard/src/legacy/pages/messages.jsx");

const walk = (n, fn) => {
  if (n == null || typeof n !== "object") return;
  if (Array.isArray(n)) { for (const k of n) walk(k, fn); return; }
  fn(n);
  walk(n.props?.children, fn);
  walk(n.rendered, fn);
};
const all = (tree, pred) => { const out = []; walk(tree, (n) => { if (pred(n)) out.push(n); }); return out; };
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
const press = (node) => node.props.onClick({ stopPropagation() {}, preventDefault() {} });
const settle = () => new Promise((r) => setImmediate(r));
/** A fresh mount: nothing kept from the last page, no listener left behind by it. */
const fresh = () => { cells = []; seq = 0; went.length = 0; for (const k of Object.keys(listeners)) delete listeners[k]; };

/** The detail's reads, answered in order per broadcast; the last answer repeats. */
const answers = new Map();
globalThis.window.__broadcasts = {
  // The bridge's words for why a whole broadcast stopped (broadcast-verbs.ts), as the verbs publish them.
  failureWords: (code) => contracts.broadcastFailureWords(code),
  detail: async (id) => {
    const queue = answers.get(id) || [];
    return (queue.length > 1 ? queue.shift() : queue[0]) || { ok: false, code: "not_found", status: 404, message: "Broadcast not found." };
  },
};
const page = (props) => { fresh(); return globalThis.window.BroadcastsPage(props); };
const again = (props) => { seq = 0; return globalThis.window.BroadcastsPage(props); };
const composerOf = (surface) => {
  globalThis.window.__PLAYBOOKS = surface;
  fresh();
  globalThis.window.OutboundPage({});
  globalThis.window.dispatchEvent({ type: "playbooks:new" });
  seq = 0;
  return globalThis.window.OutboundPage({});
};
/** Messages on a workspace with a WhatsApp number, over the starter library the bridge installed. */
const messages = (over = {}) => {
  Object.assign(globalThis.window, { __TEMPLATES_ALL: [], __CHANNELS: [{ kind: "whatsapp" }], __SETTINGS: { config: { brain: { business_name: "Northside Studio" } } }, ...over });
  fresh();
  return globalThis.window.MessagesPage();
};
const messagesAgain = () => { seq = 0; return globalThis.window.MessagesPage(); };
const templateRow = (over = {}) => ({
  id: "t9", channel: "whatsapp", name: "offer", language: "en_US", meta_status: "approved", category: "marketing", source: "chanlytics", hidden_at: null,
  title: null, quality: null, rejected_reason: null, synced_at: null, body_preview: "Our fall offer is here.", variables: [], ...over,
});
/** The visit reminder as WhatsApp holds it, with the starter's own slots. */
const visitTemplate = () => {
  const S = globalThis.window.__starters;
  const starter = S.forTrigger("visit_tomorrow");
  const slots = S.text(starter, "en_US").slots;
  return {
    starter, slots,
    row: {
      id: "tpl-visit", name: starter.name, language: "en_US", channel: "whatsapp", meta_status: "approved", category: "utility", purpose: "conversational",
      body_preview: slots.map((_, i) => `{{${i + 1}}}`).join(" "), variables: slots.map((s, i) => ({ position: i + 1, label: s.label, example: s.example })),
    },
  };
};

/* ------------------------------ a slot's words ------------------------------ */

test("REGRESSION (C6): a broadcast offers no visit's words, and a run's values say what fills them -- a broadcast could name a visit it does not have, and the detail printed visit_when", async () => {
  const { row, slots } = visitTemplate();
  assert.ok(slots.some((s) => s.kind.startsWith("visit_")), "the fixture is the starter that names a visit");
  globalThis.window.__BROADCASTS = broadcastsSurface({ templates: [row], number: healthyNumber });
  let tree = page({ initialSegment: null, initialRun: null });
  const selects = all(tree, (n) => n.props?.["data-testid"] === "bc-var-source");
  assert.equal(selects.length, slots.length);
  for (const sel of selects) {
    const offered = all(sel, (n) => n.type === "option").map((o) => o.props.value);
    assert.ok(!offered.some((k) => k.startsWith("visit_")), `REGRESSION: a broadcast offered ${offered.join(", ")}`);
    assert.ok(offered.includes(sel.props.value), `the slot's value, ${sel.props.value}, is one it offers`);
  }

  answers.set("b-visit", [{ ok: true, data: detailOf(dto({ id: "b-visit", name: "Visit reminder · 2026-09-15", params: [{ kind: "visit_when" }, { kind: "first_name" }] })) }]);
  const props = { initialSegment: null, initialRun: "b-visit" };
  page(props);
  await settle();
  tree = again(props);
  const values = find(byTestId(tree, "bc-detail"), (n) => n.props?.className === "cl-prof-aut-hint" && textOf(n).startsWith("Values:"));
  assert.equal(textOf(values), "Values: their visit's time · their first name", "REGRESSION: visit_when");
});

test("REGRESSION (C6): a visit playbook's composer offers its visit's words -- the starter's slot held a value its select had no option for", () => {
  const { row, slots } = visitTemplate();
  const tree = composerOf(playbooksSurface({
    rows: [], templates: [row], calendar: "ok",
    triggers: [{ id: "visit_tomorrow", label: "Visit reminder", hint: "The day before an appointment on the calendar", cls: "booking", list: null, kind: "visit", candidates: 2, held: 0 }],
  }));
  const selects = all(tree, (n) => n.props?.["data-testid"] === "pb-var-source");
  assert.deepEqual(selects.map((s) => s.props.value), slots.map((s) => (s.kind === "booking_link" ? "text" : s.kind)), "the starter's own slots, a link the workspace lacks typed");
  for (const sel of selects) assert.ok(find(sel, (n) => n.type === "option" && n.props.value === sel.props.value), `REGRESSION: ${sel.props.value} had no option`);
  assert.equal(textOf(find(tree, (n) => n.type === "option" && n.props.value === "visit_when")), "Their visit's time");
});

/* ------------------------------ a broadcast's state ------------------------------ */

test("REGRESSION (C12): a failed broadcast says why, in its row and in its detail -- it read '· failed' with the reason on file", async () => {
  const failed = dto({ id: "b-failed", name: "September offer", state: "failed", failure: "template_not_approved" });
  const unexplained = dto({ id: "b-failed-2", name: "August offer", state: "failed", failure: null });
  globalThis.window.__BROADCASTS = broadcastsSurface({ rows: [failed, unexplained].map((b) => toBroadcastVM(b, ZONE)) });
  answers.set("b-failed", [{ ok: true, data: detailOf(failed, []) }]);
  const props = { initialSegment: null, initialRun: "b-failed" };
  page(props);
  await settle();
  const tree = again(props);
  const rows = all(tree, (n) => n.props?.["data-testid"] === "bc-history");
  assert.ok(textOf(rows[0]).includes("failed — WhatsApp no longer approves its template"), `REGRESSION: ${textOf(rows[0])}`);
  assert.ok(textOf(rows[1]).includes("failed — no reason was recorded"), textOf(rows[1]));
  assert.equal(textOf(byTestId(tree, "bc-detail-failure")), "It stopped: WhatsApp no longer approves its template.");
});

test("REGRESSION (C14): a send in flight draws its progress, Approve says it is approving and cannot approve twice, and Scheduled counts by state -- 'N queued' counted runs waiting for you", async () => {
  const sending = dto({ id: "b-sending", name: "Offers · 2026-09-15", state: "sending", started_at: iso(-60_000), finished_at: null, recipient_count: 10, counts: { queued: 6, sent: 3, skipped: 1, failed: 0, delivered: 2, read: 0, replied: 0 } });
  const waiting = dto({ id: "b-wait", name: "Win-back · 2026-09-15", state: "pending_approval", started_at: null, finished_at: null, scheduled_for: iso(-H), counts: quiet });
  globalThis.window.__BROADCASTS = broadcastsSurface({ rows: [sending, waiting, dto()].map((b) => toBroadcastVM(b, ZONE)), more: true });
  let release = () => {};
  const approvals = [];
  globalThis.window.__broadcasts.approve = (id) => { approvals.push(id); return new Promise((r) => { release = () => r({ ok: true, data: { recipient_count: 3, scheduled_for: iso(0), moved_from: null } }); }); };
  const props = { initialSegment: null, initialRun: null };
  let tree = page(props);
  const bar = find(tree, (n) => n.props?.role === "progressbar");
  assert.ok(bar, "REGRESSION: progress as prose, no bar");
  assert.equal(bar.props["aria-valuenow"], 40, "four of ten attempted");
  assert.equal(textOf(byTestId(tree, "bc-open-meta")), "1 sending · 1 waiting for you", "REGRESSION: '2 queued'");
  assert.match(textOf(byTestId(tree, "bc-history-meta")), /older broadcasts aren't listed/, "past fifty, the history says it is not all of them");

  const approve = byTestId(tree, "bc-approve");
  press(approve);
  press(approve);
  assert.deepEqual(approvals, ["b-wait"], "REGRESSION: a second press approved again, and the server refused it");
  tree = again(props);
  const busy = byTestId(tree, "bc-approve");
  assert.equal(textOf(busy).trim(), "Approving…");
  assert.equal(busy.props.disabled, true);
  release();
  await settle();
  tree = again(props);
  assert.equal(textOf(byTestId(tree, "bc-approve")).trim(), "Approve");
});

test("REGRESSION (C15): the sending hours and the pace are the published ones -- they were typed into the pages beside the constants", async () => {
  const realClock = globalThis.window.__clock;
  globalThis.window.__clock = { ...realClock, hours: { min: 8, max: 19, first: "8:00", range: "8:00–19:59", between: "between 8:00 and 19:59" } };
  try {
    let at = Date.now() + H;
    while (!realClock.nextOpen(at).moved) at += H;
    assert.ok(globalThis.window.bcWhenNote(at, 30).words.endsWith("sends wait for 8:00–19:59"), globalThis.window.bcWhenNote(at, 30).words);
    const receipt = globalThis.window.bcWhenWords({ scheduled_for: new Date(at + 12 * H).toISOString(), moved_from: new Date(at).toISOString() });
    assert.ok(receipt.includes("between 8:00 and 19:59"), receipt);

    const plain = templateRow({ id: "tpl-plain", name: "fall_offer", purpose: "marketing" });
    globalThis.window.__BROADCASTS = broadcastsSurface({ chunk: 10, templates: [plain], number: healthyNumber });
    globalThis.window.__broadcasts.send = async () => ({ ok: true, data: { id: "b-new", name: "Fall offer", recipient_count: 2, scheduled_for: new Date().toISOString(), moved_from: null } });
    const tree = page({ initialSegment: null, initialRun: null });
    assert.ok(textOf(find(tree, (n) => n.props?.className === "bc-meta")).includes("sent 10 at a time"), "REGRESSION: '25 at a time' in the page");
    toasts.length = 0;
    press(byTestId(tree, "bc-send"));
    await press(byTestId(again({ initialSegment: null, initialRun: null }), "bc-send-yes"));
    assert.ok(textOf(toasts.at(-1).msg).includes("sending now, 10 at a time"), textOf(toasts.at(-1).msg));

    globalThis.window.__PLAYBOOKS = playbooksSurface();
    fresh();
    const cardTree = globalThis.window.PlaybookCard({ p: playbook(), canAct: true, onEdit() {}, flash() {} });
    assert.ok(byTestId(cardTree, "pb-run-now").props["data-tip"].includes("outside 8:00–19:59 it goes at 8:00"), "REGRESSION: 'outside nine to twenty'");
    const composer = composerOf(playbooksSurface());
    assert.deepEqual(all(byTestId(composer, "pb-hour"), (n) => n.type === "option").map((o) => o.props.value), [8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19], "the hours a run may start at");
  } finally {
    globalThis.window.__clock = realClock;
  }
});

test("REGRESSION: a run opened on a page already scrolled is brought into view, and a row pressed in view stays put -- the landing scroll ran once, for listed runs only", () => {
  globalThis.window.__BROADCASTS = broadcastsSurface();
  const scrolled = [];
  const where = { "bc-run-b-sent": 200, "bc-run-b-old": -900 };
  const keep = globalThis.document.getElementById;
  globalThis.document.getElementById = (id) => (id in where ? { getBoundingClientRect: () => ({ top: where[id], bottom: where[id] + 40 }), scrollIntoView: () => scrolled.push(id) } : null);
  try {
    page({ initialSegment: null, initialRun: null });
    again({ initialSegment: null, initialRun: "b-sent" });
    assert.deepEqual(scrolled, [], "a row pressed in view stays where it is");
    const tree = again({ initialSegment: null, initialRun: "b-old" });
    assert.deepEqual(scrolled, ["bc-run-b-old"], "REGRESSION: a run opened first on a page scrolled past it stayed out of sight");
    assert.equal(byTestId(tree, "bc-run-solo").props.id, "bc-run-b-old", "the section a link lands on carries the run's anchor");
  } finally {
    globalThis.document.getElementById = keep;
  }
});

/* ------------------------------ Messages ------------------------------ */

test("REGRESSION (C20): on Messages only the pressed control says it is working, and every control waits -- one flag relabelled every Add while a sync ran", async () => {
  let finish = () => {};
  globalThis.window.__syncTemplates = () => new Promise((r) => { finish = () => r({ ok: true, data: { seen: 2, approved: 2, marketing: 1 } }); });
  let tree = messages();
  press(byTestId(tree, "sync-templates"));
  tree = messagesAgain();
  assert.equal(textOf(byTestId(tree, "sync-templates")).trim(), "Syncing…");
  const addAll = all(tree, (n) => n.props?.["data-testid"] === "starter-add-all");
  assert.ok(addAll.length > 0, "the fixture has starters to add");
  for (const b of addAll) {
    assert.ok(!textOf(b).includes("Adding"), `REGRESSION: ${textOf(b)} while a sync ran`);
    assert.equal(b.props.disabled, true, "and it waits for the sync");
  }
  assert.ok(all(tree, (n) => n.props?.["data-testid"] === "starter-add").every((b) => b.props.disabled === true && !textOf(b).includes("Adding")), "a card's Add waits in its own words");
  finish();
  await settle();
  tree = messagesAgain();
  assert.equal(textOf(byTestId(tree, "sync-templates")).trim(), "Sync from WhatsApp");
});

test("REGRESSION (C22): a message shows the quality WhatsApp rated it -- the rating was synced and never drawn", () => {
  let tree = messages({ __TEMPLATES_ALL: [templateRow({ name: "front_desk_note", source: "meta", quality: "YELLOW" })] });
  const q = byTestId(tree, "template-quality");
  assert.ok(q, "REGRESSION: no rating on the card");
  assert.equal(textOf(q).trim(), "Medium quality");
  tree = messages({ __TEMPLATES_ALL: [templateRow({ name: "front_desk_note", source: "meta", quality: "UNKNOWN" })] });
  assert.equal(textOf(byTestId(tree, "template-quality")).trim(), "Quality not rated yet", "a rating WhatsApp has not given is said so");
  tree = messages({ __TEMPLATES_ALL: [templateRow({ name: "front_desk_note", source: "meta", quality: null })] });
  assert.equal(byTestId(tree, "template-quality"), null, "nothing synced, nothing said");
});

test("REGRESSION (C8): deleting a message a playbook sends names the playbook -- a running one holds the delete back, a paused one is named in the question, and an unread list says so", () => {
  const armed = (playbooks) => {
    let tree = messages({ __TEMPLATES_ALL: [templateRow()], __PLAYBOOKS: playbooks });
    press(byTestId(tree, "template-menu"));
    tree = messagesAgain();
    press(byTestId(tree, "template-delete"));
    return messagesAgain();
  };
  let tree = armed({ rows: [playbook({ name: "Win-back", template_name: "offer", template_language: "en_US", state: "running" })] });
  assert.equal(byTestId(tree, "template-delete-yes"), null, "REGRESSION: a Yes, and the playbook's runs skipped from then on");
  const held = byTestId(tree, "template-delete-held");
  assert.ok(held && textOf(held).includes("“Win-back” still sends this message."), textOf(held));
  press(find(held, (n) => n.type === "button" && textOf(n).includes("Playbooks")));
  assert.equal(went.at(-1), "outbound", "and a door to the playbook");

  tree = armed({ rows: [
    playbook({ name: "Welcome", template_name: "offer", template_language: "en_US", state: "paused" }),
    playbook({ id: "pb-es", name: "Spanish offer", template_name: "offer", template_language: "es", state: "running" }),
  ] });
  assert.ok(byTestId(tree, "template-delete-yes"), "a paused playbook does not hold it back, nor one sending another language");
  assert.ok(textOf(byTestId(tree, "template-delete-confirm")).includes("“Welcome” is paused and sends it"), textOf(byTestId(tree, "template-delete-confirm")));

  tree = armed(undefined);
  assert.ok(textOf(byTestId(tree, "template-delete-confirm")).includes("couldn't check which playbooks send it"), "a playbooks read that has not landed is said");
});

test("Send now asks before it sends, and the question names the template, its language, the count and the list", async () => {
  const sent = [];
  const en = templateRow({ id: "tpl-en", name: "winback_offer", language: "en_US", purpose: "marketing", body_preview: "Hi {{1}}, come back to {{2}}." });
  const es = templateRow({ id: "tpl-es", name: "winback_offer", language: "es", purpose: "marketing", body_preview: "Hola {{1}}, vuelve a {{2}}." });
  globalThis.window.__BROADCASTS = broadcastsSurface({ templates: [en, es], number: healthyNumber });
  globalThis.window.__broadcasts.send = async (body) => { sent.push(body); return { ok: true, data: { id: "b-new", name: "Win-back", recipient_count: 2, scheduled_for: new Date().toISOString(), moved_from: null } }; };

  let tree = page({ initialSegment: null, initialRun: null });
  press(byTestId(tree, "bc-send"));
  tree = again({ initialSegment: null, initialRun: null });
  assert.equal(sent.length, 0, "one press sends nothing -- it was the only act here that could not be taken back and the only one that did not ask");
  const q = textOf(byTestId(tree, "bc-send-confirm"));
  // A workspace holding the starter set in both languages has two rows per name
  // and the chips read the same over each, so the question names the one it means.
  assert.ok(q.includes("(English)"), q);
  assert.ok(q.includes("Win-back"), q);
  assert.ok(/to \d+ (person|people) on/.test(q), q);
  assert.ok(q.includes("cannot be taken back"), q);

  toasts.length = 0;
  await press(byTestId(tree, "bc-send-yes"));
  assert.equal(sent.length, 1, "and the Yes sends it");
  // The receipt's one door out, in the verb the row itself uses: a message
  // already delivered stays delivered, so it is not offered as an Undo.
  assert.equal(toasts.at(-1).action.label, "Stop it");
  assert.equal(toasts.at(-1).links[0].to, "broadcasts/run:b-new");
});

test("The preview is the message as the customer receives it: the name in the chat header, what fills per person marked, a link drawn as one, and the hour it really goes", () => {
  const tpl = templateRow({ id: "tpl-1", name: "winback_offer", purpose: "marketing", body_preview: "Hi {{1}}, book at booksy.com/luna and we'll take it from there.", variables: [{ position: 1, label: "First name", example: "Dani" }] });
  globalThis.window.__BROADCASTS = broadcastsSurface({ templates: [tpl], number: healthyNumber, businessName: "Luna Studio" });
  const tree = page({ initialSegment: null, initialRun: null });
  const preview = byTestId(tree, "bc-preview");
  assert.ok(preview, "the composer draws one");

  // The business's name is the chat header. Inside the bubble it is WhatsApp's
  // GROUP-chat treatment, which a broadcast never is -- and it was drawn there
  // in --accent, the token reserved for a live agent.
  const head = find(preview, (n) => n.props?.className === "mp-head");
  assert.ok(textOf(head).includes("Luna Studio"), textOf(head));
  assert.ok(textOf(head).includes("Business account"), textOf(head));
  const bubble = find(preview, (n) => n.props?.className === "mp-bubble");
  assert.ok(!textOf(find(bubble, (n) => n.props?.className === "mp-body")).startsWith("Luna Studio"), "not a line inside the bubble");

  // What fills per person is marked, so the eye can see what varies. A string
  // cannot be marked, which is why the three local renderers could not do this.
  const slots = all(preview, (n) => n.props?.className === "mp-slot");
  assert.equal(slots.length, 1, "one slot, one mark");
  assert.equal(textOf(slots[0]), "Dani");

  // The booking link is the pixel the message exists for; it was drawn as prose.
  const link = find(preview, (n) => n.props?.className === "mp-link");
  assert.ok(link && textOf(link) === "booksy.com/luna", "the link is a link");

  // The stamp is the hour it really goes -- it was the literal word "now" on a
  // send that could be scheduled for Tuesday.
  const stamp = textOf(find(preview, (n) => n.props?.className === "mp-stamp"));
  assert.notEqual(stamp, "now");
  assert.equal(stamp, globalThis.window.__clock.time(globalThis.window.__clock.nextOpen(Date.now()).at), stamp);

  // A slot nobody has filled stays a hole rather than quietly reading as words.
  assert.deepEqual(globalThis.window.mpParts("Hi {{1}}.", []).map((p) => p.text), ["Hi ", "{{1}}", "."]);
});

test("Messages says what sends each message -- the card worked it out to refuse a delete and then showed it only there", () => {
  let tree = messages({
    __TEMPLATES_ALL: [templateRow({ name: "offer", language: "en_US" })],
    __PLAYBOOKS: { rows: [playbook({ id: "pb-1", name: "Win-back", template_name: "offer", template_language: "en_US", state: "running" })] },
  });
  const users = byTestId(tree, "template-users");
  assert.ok(textOf(users).includes("Win-back"), textOf(users));
  press(users);
  assert.equal(went.at(-1), "outbound/pb-1", "and it opens that playbook's card");

  tree = messages({ __TEMPLATES_ALL: [templateRow({ name: "offer", language: "en_US" })], __PLAYBOOKS: { rows: [] } });
  assert.equal(textOf(byTestId(tree, "template-users")).trim(), "No playbook sends it");

  // A playbooks read that has not landed is not "nothing sends it".
  tree = messages({ __TEMPLATES_ALL: [templateRow({ name: "offer", language: "en_US" })], __PLAYBOOKS: undefined });
  assert.equal(byTestId(tree, "template-users"), null, "an unread list makes no claim");
});

/**
 * A person as GET contacts returns them, through the same view model the bridge
 * builds audiences from -- not a shape invented here, because a made-up fixture
 * field is how a page passes a test while production stays wrong.
 */
const contact = (over = {}) => ({
  id: "c1", display_name: "Daniela R.", wa_profile_name: "Dani", phone_e164: "+17865550181",
  consent: "opted_in", consent_source: "reply", consent_updated_at: iso(-30 * D), dnc: false, marketing_consent: "opted_in", channels: ["whatsapp"],
  conversation_count: 1, escalation_count: 0, needs_human: false, open_escalation_reason: null, open_escalation_since: null,
  latest_conversation_id: "cv1", latest_state: "open", latest_paused_until: null, latest_assignee_user_id: null, latest_snooze_until: null,
  latest_wa_inbound_at: iso(-2 * H), last_message_at: iso(-2 * H), last_message_direction: "inbound", last_message_sender: "customer",
  last_inbound_text: "See you Saturday", last_inbound_at: iso(-2 * H),
  last_call_at: null, last_inbound_call_at: null, last_inbound_call_summary: null, call_count: 0, call_seconds: 0,
  first_contact_at: iso(-60 * D), earliest_row_at: iso(-60 * D), has_backfill: false, has_chat: true, queued_reply_at: null,
  effective_reply_mode: "auto", visits: null, ...over,
});

test("The composer shows one of the real people at a time, and the two nobody had ever been shown: the one with no name, and the one held back", () => {
  const rows = [
    contact({ id: "c1", display_name: "Daniela R.", wa_profile_name: "Dani" }),
    // Only a number on file. The wire greets them "Hi there" (resolveParams) and
    // the composer had no way to show it before the send went.
    contact({ id: "c2", display_name: null, wa_profile_name: null }),
    contact({ id: "c3", display_name: "Marco Ortiz", wa_profile_name: "Marco" }),
    // In the list, not in the send.
    contact({ id: "c4", display_name: "Tomás Ruiz", wa_profile_name: "Tomás", consent: "opted_out", marketing_consent: "opted_out" }),
  ].map((c) => contracts.toPersonRowVM(c, ZONE, new Date(NOW)));
  const pv = contracts.audiencePreview(rows, "everyone", null, null, "marketing");
  assert.equal(pv.sending, 3);
  assert.equal(pv.held, 1);
  // An ordinary person first, then the one with no name -- the case worth seeing.
  // The name a human typed wins over the WhatsApp profile name, as at the wire.
  assert.equal(pv.people[0].firstName, "Daniela");
  assert.equal(pv.people[1].firstName, null);
  assert.equal(pv.people.at(-1).refusal, contracts.PURPOSE_REFUSALS.opted_out, "the reason is the one the wire would give");

  const tpl = templateRow({ id: "tpl-1", name: "winback_offer", purpose: "marketing", body_preview: "Hi {{1}}, come back to us.", variables: [{ position: 1, label: "First name", example: "Dani" }] });
  globalThis.window.__BROADCASTS = broadcastsSurface({
    templates: [tpl], number: healthyNumber,
    audiences: [{ kind: "everyone", id: null, label: "Everyone who said yes", counts: { marketing: pv.sending, conversational: pv.sending }, preview: { marketing: pv, conversational: pv } }],
  });

  let tree = page({ initialSegment: null, initialRun: null });
  const step = byTestId(tree, "mp-step");
  assert.ok(step, "an audience chip showed a count and never a person");
  assert.ok(textOf(step).includes("Daniela R."), textOf(step));
  assert.ok(textOf(step).includes("1 of 3"), textOf(step));
  assert.ok(textOf(byTestId(tree, "bc-preview")).includes("Hi Daniela"), "the slot takes THEIR name");

  // The next one has no name on file: the message opens "Hi there", and the page
  // says why rather than leaving it to be discovered after the send.
  press(find(step, (n) => n.props?.["aria-label"] === "The next person"));
  tree = again({ initialSegment: null, initialRun: null });
  assert.ok(textOf(byTestId(tree, "bc-preview")).includes("Hi there"), textOf(byTestId(tree, "bc-preview")));
  assert.ok(textOf(byTestId(tree, "mp-note")).includes("Hi there"), textOf(byTestId(tree, "mp-note")));

  // And the last is in the list but held back: drawn as not sent, with the reason.
  // Two more steps: Daniela, the one with no name, Marco, then Tomás.
  for (let i = 0; i < 2; i += 1) {
    press(find(byTestId(tree, "mp-step"), (n) => n.props?.["aria-label"] === "The next person"));
    tree = again({ initialSegment: null, initialRun: null });
  }
  assert.ok(byTestId(tree, "mp-held"), "the bubble is marked Not sent");
  assert.ok(textOf(byTestId(tree, "mp-note")).includes("asked to stop"), textOf(byTestId(tree, "mp-note")));
  assert.equal(textOf(find(byTestId(tree, "mp-step"), (n) => String(n.props?.className || "").startsWith("mp-step-pos"))), "held back", "and its place in the walk says so rather than counting them into the send");
});
