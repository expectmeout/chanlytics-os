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
  contact_id: "k1", name: "Rosa Díaz", first_name: "Rosa", phone: "+16465550123", state: "sent", reason: null, sent_at: iso(-5 * D), message_status: "delivered",
  conversation_id: "cv1", replied: false, delivered_at: iso(-5 * D + 60_000), read_at: null, replied_at: null,
  consent_after: null, consent_at: null, consent_purpose: null, reply_words: null, answered_by: null, answered_at: null, waiting_on_you: false, ...over,
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
await import("../../../apps/dashboard/src/legacy/components/template-chips.jsx");
await import("../../../apps/dashboard/src/legacy/components/campaign-bits.jsx");
await import("../../../apps/dashboard/src/legacy/components/lang-picker.jsx");
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
  // The bridge's words for why a whole broadcast stopped, and a run's report (broadcast-verbs.ts), as the verbs publish them.
  failureWords: (code) => contracts.broadcastFailureWords(code),
  report: (d) => contracts.toRunReportVM(d, { windowMs: contracts.REPLY_WINDOW_MS, nowMs: Date.now(), clock: (iso) => (iso ? globalThis.window.__clock.stamp(Date.parse(iso)) : null) }),
  approval: (d, playbook, businessName) => {
    const clock = globalThis.window.__clock;
    const open = clock.nextOpen(Date.now());
    return contracts.toApprovalVM(d, { playbook, businessName, today: clock.dayKey(Date.now()), open: { time: clock.time(open.at), moved: open.moved }, day: (ymd) => clock.dayWords(ymd) });
  },
  detail: async (id) => {
    const queue = answers.get(id) || [];
    return (queue.length > 1 ? queue.shift() : queue[0]) || { ok: false, code: "not_found", status: 404, message: "Broadcast not found." };
  },
};
const page = (props) => { fresh(); return globalThis.window.BroadcastsPage(props); };
const again = (props) => { seq = 0; return globalThis.window.BroadcastsPage(props); };
/** The composer, opened the way a person opens it: New broadcast, on the ledger. */
const writing = (props) => { const tree = page(props); press(byTestId(tree, "bc-new")); return again(props); };
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
  Object.assign(globalThis.window, { __TEMPLATES_ALL: [], __TEMPLATE_USE: null, __TEMPLATE_SENT: null, __CHANNELS: [{ kind: "whatsapp" }], __SETTINGS: { config: { brain: { business_name: "Northside Studio" } } }, ...over });
  fresh();
  return globalThis.window.MessagesPage();
};
const messagesAgain = () => { seq = 0; return globalThis.window.MessagesPage(); };
/** Messages with one message OPEN: a row carries what it is, and the words and the verbs are inside it. */
const messagesOpen = (over = {}, which = "custom-row") => {
  const tree = messages(over);
  const row = byTestId(tree, which);
  press(find(row, (n) => n.props?.["data-testid"] === "template-open"));
  return messagesAgain();
};
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
  let tree = writing({ initialSegment: null, initialRun: null });
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
  const rows = all(page({ initialSegment: null, initialRun: null }), (n) => n.props?.["data-testid"] === "bc-history");
  // The card says it failed (its state) and why (its line), where the row said "· failed" and stopped.
  assert.ok(textOf(rows[0]).includes("Failed") && textOf(rows[0]).includes("WhatsApp no longer approves its template"), `REGRESSION: ${textOf(rows[0])}`);
  assert.ok(textOf(rows[1]).includes("no reason was recorded"), textOf(rows[1]));
  const props = { initialSegment: null, initialRun: "b-failed" };
  page(props);
  await settle();
  const tree = again(props);
  assert.equal(textOf(byTestId(tree, "bc-detail-failure")), "It stopped: WhatsApp no longer approves its template.");
  // And, opened, how to get past it -- never "something went wrong".
  assert.ok(textOf(byTestId(tree, "bc-stopped")).includes("Open it in Templates — it can be resubmitted."), textOf(byTestId(tree, "bc-stopped")));
});

test("an opened run is sent again from its own head: the send screen, filled with its template, its list and its values -- and no button when one of them cannot go", async () => {
  const note = { id: "tpl-note", channel: "whatsapp", name: "a_quick_note", language: "en_US", meta_status: "approved", category: "utility", purpose: "conversational", body_preview: "Hi {{1}}", variables: [{ position: 1, label: "First name", example: "Dani" }] };
  const offer = { id: "tpl-offer", channel: "whatsapp", name: "autumn_offer", language: "en_US", meta_status: "approved", category: "marketing", purpose: "marketing",
    body_preview: "Hi {{1}}, {{2}}", variables: [{ position: 1, label: "First name", example: "Dani" }, { position: 2, label: "The offer", example: "20% off" }] };
  const byHand = dto({ id: "b-hand", name: "Autumn colour", playbook_id: null, run_for: null, template_id: "tpl-offer", template_name: "autumn_offer",
    audience: { kind: "saved", id: "s1", label: "Regulars" }, params: [{ kind: "first_name" }, { kind: "text", value: "20% off colour" }] });
  globalThis.window.__BROADCASTS = broadcastsSurface({ templates: [note, offer], number: healthyNumber, rows: [byHand, dto()].map((b) => toBroadcastVM(b, ZONE)) });
  answers.set("b-hand", [{ ok: true, data: detailOf(byHand) }]);
  const props = { initialSegment: null, initialRun: "b-hand" };
  page(props);
  await settle();
  let tree = again(props);
  press(byTestId(tree, "bc-again"));
  assert.equal(went.at(-1), "broadcasts", "the run closes");
  again({ initialSegment: null, initialRun: null });
  tree = again({ initialSegment: null, initialRun: null });
  assert.ok(byTestId(tree, "bc-composer"), "onto the send screen");
  assert.ok(textOf(find(tree, (n) => n.props?.["data-testid"] === "bc-audience" && String(n.props.className).includes("active"))).startsWith("Regulars"), "its list");
  assert.ok(find(tree, (n) => n.props?.["data-testid"] === "bc-template" && n.props["aria-pressed"] === true && textOf(n).toLowerCase().includes("autumn")), "its template, not the one the screen opens on");
  assert.deepEqual(all(tree, (n) => n.props?.["data-testid"] === "bc-var-source").map((x) => x.props.value), ["first_name", "text"], "its values, by what fills them");
  assert.equal(all(byTestId(tree, "bc-vars"), (n) => n.type === "input")[1].props.value, "20% off colour", "and the words it said");

  // A playbook's run is sent again by its playbook, and a template WhatsApp no longer approves cannot go at all.
  answers.set("b-sent", [{ ok: true, data: detailOf(dto()) }]);
  page({ initialSegment: null, initialRun: "b-sent" });
  await settle();
  assert.equal(byTestId(again({ initialSegment: null, initialRun: "b-sent" }), "bc-again"), null, "a playbook's run is sent again by its playbook");
  globalThis.window.__BROADCASTS = broadcastsSurface({ templates: [note], number: healthyNumber, rows: [byHand].map((b) => toBroadcastVM(b, ZONE)) });
  page(props);
  await settle();
  assert.equal(byTestId(again(props), "bc-again"), null, "REGRESSION-IN-WAITING: a send screen quietly filled with another template");
});

test("a run waiting on you opens as the sheet the canvas draws -- where it sits in the queue, who it reaches by the rules that made it, the words, and Approve alone at the foot -- and approving opens the next one", async () => {
  const today = globalThis.window.__clock.dayKey(Date.now());
  const offer = { id: "tpl-offer", channel: "whatsapp", name: "monthly_offer", language: "en_US", meta_status: "approved", category: "marketing", purpose: "marketing", body_preview: "Hi {{1}}, this month at {{2}}: a free gloss with any cut.", variables: [] };
  const waitingRun = (id, name, pb) => dto({ id, name, state: "pending_approval", started_at: null, finished_at: null, scheduled_for: iso(-H), counts: quiet, recipient_count: 2,
    playbook_id: pb, run_for: today, template_id: "tpl-offer", template_name: "monthly_offer", params: [{ kind: "first_name" }, { kind: "business_name" }], audience: { kind: "playbook", id: pb, label: name } });
  const first = waitingRun("b-wait", "The month's offer", "pb-offer");
  const second = waitingRun("b-wait-2", "Win-back", "pb-1");
  globalThis.window.__BROADCASTS = broadcastsSurface({ templates: [offer], rows: [first, second].map((b) => toBroadcastVM(b, ZONE)) });
  globalThis.window.__PLAYBOOKS = playbooksSurface({ rows: [playbook({ id: "pb-offer", name: "The month's offer", trigger: "everyone_monthly", policy_class: "campaign", cap_per_run: 250, cadence_days: 30, triggerHint: "Everyone who said yes, on a cadence" }), playbook()] });
  const people = [person({ contact_id: "k0", name: "+1 (917) 555-0142", first_name: null, state: "queued", sent_at: null, message_status: null, delivered_at: null }), person({ state: "queued", sent_at: null, message_status: null, delivered_at: null })];
  answers.set("b-wait", [{ ok: true, data: detailOf(first, people) }]);
  const approved = [];
  globalThis.window.__broadcasts.approve = async (id) => { approved.push(id); return { ok: true, data: { recipient_count: 2, scheduled_for: iso(0), moved_from: null } }; };
  try {
    const props = { initialSegment: null, initialRun: "b-wait" };
    page(props);
    await settle();
    let tree = again(props);
    const sheet = byTestId(tree, "bc-sheet");
    assert.ok(sheet, "a run waiting on you is its sheet, not a report of nothing sent");
    assert.equal(byTestId(tree, "bc-figures"), null);
    assert.equal(textOf(byTestId(sheet, "bc-sheet-pos")), "1 of 2 · Campaigns", "where it sits among the runs waiting");
    assert.equal(textOf(find(sheet, (n) => n.type === "h1")), "The month's offer");
    const reach = textOf(byTestId(sheet, "bc-sheet-reach"));
    assert.ok(reach.includes("2will get it") && reach.includes("each said yes to offers") && reach.includes("none heard from any playbook this week"), reach);
    assert.ok(!/ of \d/.test(reach), `REGRESSION-IN-WAITING: a pool the run never recorded -- ${reach}`);
    const words = textOf(byTestId(sheet, "bc-sheet-words"));
    assert.ok(words.includes("Hi Rosa, this month at Northside Studio") && words.includes("as Rosa Díaz reads it"), words);
    assert.equal(textOf(byTestId(sheet, "bc-sheet-hi")), "1 gets \u201cHi there\u201d \u2014 no name on file", "the case nobody is shown before a send, shown before this one");
    assert.ok(textOf(byTestId(sheet, "bc-sheet-approve")).includes("Approve \u2014 2 "), textOf(byTestId(sheet, "bc-sheet-approve")));
    // Who gets it, on asking.
    press(byTestId(sheet, "bc-sheet-see"));
    tree = again(props);
    assert.equal(all(byTestId(tree, "bc-sheet-people"), (n) => n.props?.["data-testid"] === "bc-person").length, 2);
    // Approved, the next run waiting opens.
    await press(byTestId(tree, "bc-sheet-approve"));
    assert.deepEqual(approved, ["b-wait"]);
    assert.equal(went.at(-1), "broadcasts/run:b-wait-2", "a queue of two is two presses");

    // Skip arms before it acts, as every stop on the page does (D13).
    const skipped = [];
    globalThis.window.__broadcasts.cancel = async (id) => { skipped.push(id); return { ok: true, data: { was: "pending_approval" } }; };
    page(props);
    await settle();
    tree = again(props);
    press(byTestId(tree, "bc-sheet-skip"));
    tree = again(props);
    assert.equal(skipped.length, 0, "one press does not skip");
    assert.equal(byTestId(tree, "bc-sheet-approve"), null, "the question stands alone");
    assert.ok(textOf(byTestId(tree, "bc-sheet-skip-confirm")).includes("Nothing sends, and the run closes."), "and it says what skipping does");
    await press(byTestId(tree, "bc-sheet-skip-yes"));
    assert.deepEqual(skipped, ["b-wait"]);
    assert.equal(went.at(-1), "broadcasts/run:b-wait-2");

    // A run whose day has passed is refused by approveRun: the sheet says why, and offers the skip.
    const stale = { ...first, run_for: "2020-01-01" };
    globalThis.window.__BROADCASTS = broadcastsSurface({ templates: [offer], rows: [toBroadcastVM(stale, ZONE)] });
    answers.set("b-wait", [{ ok: true, data: detailOf(stale, people) }]);
    page(props);
    await settle();
    tree = again(props);
    assert.equal(byTestId(tree, "bc-sheet-approve"), null, "REGRESSION-IN-WAITING: a button the server refuses");
    assert.ok(textOf(byTestId(tree, "bc-sheet-expired")).includes("that day has passed"));
    assert.equal(textOf(byTestId(tree, "bc-sheet-pos")), "Campaigns", "the only one waiting");
  } finally {
    delete globalThis.window.__broadcasts.approve;
    delete globalThis.window.__broadcasts.cancel;
  }
});

test("Broadcasts is one ledger: the runs waiting on you said at the head, a band bar whose legend filters the runs, the week ahead, and the composer its own screen", () => {
  const sent = (i) => dto({ id: `b-s${i}`, name: `Sent ${i}`, state: "sent", scheduled_for: iso(-(i + 1) * D), counts: { queued: 0, sent: 3, skipped: 0, failed: 0, delivered: 3, read: 1, replied: 1 } });
  const waiting = dto({ id: "b-wait", name: "The month's offer", state: "pending_approval", started_at: null, finished_at: null, scheduled_for: iso(2 * H), playbook_id: "pb-1", counts: quiet });
  const soon = dto({ id: "b-soon", name: "Autumn colour", state: "scheduled", started_at: null, finished_at: null, scheduled_for: iso(20 * 60_000), playbook_id: null, audience: { kind: "saved", id: "s1", label: "Regulars" }, counts: quiet });
  const going = dto({ id: "b-going", name: "Offers", state: "sending", started_at: iso(-60_000), finished_at: null, counts: { queued: 6, sent: 3, skipped: 1, failed: 0, delivered: 2, read: 0, replied: 0 } });
  globalThis.window.__BROADCASTS = broadcastsSurface({ rows: [soon, going, waiting, ...Array.from({ length: 7 }, (_, i) => sent(i))].map((b) => toBroadcastVM(b, ZONE)) });
  globalThis.window.__PLAYBOOKS = playbooksSurface({ rows: [playbook({ id: "pb-9", name: "Welcome", trigger: "new_week", state: "running", run_hour: 10, last_run_for: null })] });
  const props = { initialSegment: null, initialRun: null };
  let tree = page(props);
  // The head says what waits on you, and the page's act is beside it.
  assert.equal(textOf(byTestId(tree, "bc-waiting")).trim(), "1 waiting on you");
  assert.ok(byTestId(tree, "bc-new"), "New broadcast");
  assert.equal(byTestId(tree, "bc-composer"), null, "the composer is its own screen, not the top of the ledger");
  // Everything open, what waits on you first, then what is going out, then what is to come; then the latest five gone.
  const cards = () => all(tree, (n) => ["bc-open", "bc-history"].includes(n.props?.["data-testid"])).map((n) => n.props.id);
  assert.deepEqual(cards(), ["bc-run-b-wait", "bc-run-b-going", "bc-run-b-soon", "bc-run-b-s0", "bc-run-b-s1", "bc-run-b-s2", "bc-run-b-s3", "bc-run-b-s4"]);
  const urgent = find(tree, (n) => n.props?.id === "bc-run-b-wait");
  assert.ok(String(urgent.props.className).includes("is-urgent"), "a run waiting on you carries the urgency edge (legacy/CLAUDE.md)");
  assert.ok(byTestId(urgent, "bc-approve"), "and Approve");
  assert.match(textOf(byTestId(find(tree, (n) => n.props?.id === "bc-run-b-soon"), "bc-soon")), /^\d+:\d\d$/, "a run under an hour away counts down");
  assert.ok(textOf(byTestId(tree, "bc-runs-more")).includes("All 7 sent"), "and the way to the rest of what went");
  // The legend is the list's filter: press a band, the runs are that band's; press it again, all of them.
  press(byTestId(tree, "bc-band-sent"));
  tree = again(props);
  assert.equal(cards().length, 7, "the seven sent");
  assert.equal(byTestId(tree, "bc-band-sent").props["aria-pressed"], true);
  press(byTestId(tree, "bc-band-sent"));
  tree = again(props);
  assert.equal(cards().length, 8);
  // The week ahead: seven days from today, a mark per run at its hour, and a running playbook's runs to come.
  const days = all(tree, (n) => n.props?.["data-testid"] === "bc-week-day");
  assert.equal(days.length, 7);
  assert.ok(textOf(days[0]).startsWith("Today"), textOf(days[0]));
  assert.ok(all(days[1], (n) => String(n.props?.className || "").includes("is-projected")).length === 1, "the Welcome playbook's run tomorrow, at its hour");
  // New broadcast opens the composer; Cancel goes back to the ledger.
  press(byTestId(tree, "bc-new"));
  tree = again(props);
  assert.ok(byTestId(tree, "bc-composer"), "the composer, on its own screen");
  assert.equal(byTestId(tree, "bc-band"), null, "with the ledger out of the way");
  press(byTestId(tree, "bc-compose-close"));
  tree = again(props);
  assert.equal(byTestId(tree, "bc-composer"), null);
  // A link that names a list is asking to write one: it opens the composer on that list.
  tree = page({ initialSegment: "s1", initialRun: null });
  assert.ok(byTestId(tree, "bc-composer"), "People's 'broadcast to this list' lands on the composer");
  globalThis.window.__PLAYBOOKS = undefined;
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
  // The band counts by state -- one sending, one waiting on you -- where a line said "2 queued".
  assert.equal(textOf(byTestId(tree, "bc-band-sending")).trim(), "1 sending", "REGRESSION: '2 queued'");
  assert.equal(textOf(byTestId(tree, "bc-band-pending_approval")).trim(), "1 waiting on you");
  assert.match(textOf(byTestId(tree, "bc-standing")), /the latest 50 broadcasts/, "past fifty, the ledger says its numbers are not all of them");

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
  assert.equal(textOf(byTestId(tree, "bc-approve")).trim(), "Approve the run");
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
    const tree = writing({ initialSegment: null, initialRun: null });
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

test("the page counts templates: `message` is what a customer gets, and the word meant three things across one nav", () => {
  // With rows on file, so the line reaches its plural: an empty workspace says
  // "No template on file yet" whatever the word for a full one is.
  const tree = messages({ __TEMPLATES_ALL: [templateRow(), templateRow({ id: "t8", name: "welcome" })] });
  const line = textOf(byTestId(tree, "messages-standing"));
  assert.match(line, /(No template on file yet|\d+ templates?\b)/, `REGRESSION: it counted "messages" under a tab beside the Inbox — ${line}`);
  assert.ok(!/\bmessages?\b/i.test(line), `nothing on the line calls a template a message — ${line}`);
  assert.equal(textOf(byTestId(tree, "template-new")).trim(), "New template", "and the act that makes one says so");
});


test("REGRESSION (C20): on Messages only the pressed control says it is working, and every control waits -- one flag relabelled every Add while a sync ran", async () => {
  let finish = () => {};
  globalThis.window.__syncTemplates = () => new Promise((r) => { finish = () => r({ ok: true, data: { seen: 2, approved: 2, marketing: 1 } }); });
  // With a starter open, so its own Add is drawn and the assertion below is a
  // reading rather than a loop over nothing.
  let tree = messagesOpen({}, "starter-row");
  press(byTestId(tree, "sync-templates"));
  tree = messagesAgain();
  // The control is the freshness state now -- a dot, when it last looked, and a
  // press to look again -- so its working words are its own: it still says it is
  // working, and it is still the only one that does.
  assert.match(textOf(byTestId(tree, "sync-templates")), /Checking WhatsApp/, "the pressed control says it is working");
  const addAll = all(tree, (n) => n.props?.["data-testid"] === "starter-add-all");
  assert.equal(addAll.length, 1, "one press adds what the starter set is missing, in every language at once");
  for (const b of addAll) {
    assert.ok(!textOf(b).includes("Adding"), `REGRESSION: ${textOf(b)} while a sync ran`);
    assert.equal(b.props.disabled, true, "and it waits for the sync");
  }
  const adds = all(tree, (n) => n.props?.["data-testid"] === "starter-add");
  assert.equal(adds.length, 1, "the open starter offers the one language it is missing");
  assert.ok(adds.every((b) => b.props.disabled === true && !textOf(b).includes("Adding")), "a message's own Add waits in its own words");
  finish();
  await settle();
  tree = messagesAgain();
  assert.match(textOf(byTestId(tree, "sync-templates")), /In step with WhatsApp|Never checked with WhatsApp/, "and afterwards it says when it last looked, not what to press");
});

test("A message is a row you scan, and the words open under it: what it is, every language's state, and what sends it -- without opening anything", () => {
  const en = templateRow({ id: "t-en", name: "offer", language: "en_US", meta_status: "approved", body_preview: "Hi {{1}},\n  20% off\tthis week." });
  let tree = messages({ __TEMPLATES_ALL: [en], __TEMPLATE_USE: { offer: { words: "Win-back", unused: false, playbook: "pb-1" } } });
  const row = byTestId(tree, "custom-row");
  // A line of the words rides the row, on one line whatever the message does with
  // newlines and tabs, in quotes and with its slots NAMED rather than numbered --
  // so a row IS the message, and shows what varies per person. A slot nothing
  // names on file is "value 1": never Meta's "{{1}}".
  assert.ok(textOf(row).includes("“Hi {value 1}, 20% off this week.”"), textOf(row));
  assert.ok(textOf(row).includes("offer"), "and the name WhatsApp knows it by");
  assert.ok(textOf(byTestId(row, "template-users")).includes("Win-back"), "and what sends it, closed");
  assert.equal(byTestId(row, "template-open-body"), null, "the whole message is not drawn until it is asked for");

  // Its language is ONE control naming the language in view -- a slot per language
  // drew Meta's storage (a row per language), not the message.
  const control = byTestId(row, "template-lang");
  assert.equal(all(row, (n) => n.props?.["data-testid"] === "template-lang").length, 1);
  assert.equal(textOf(control).trim(), "EN");
  // Opened, it offers the one language a message the workspace wrote has: nobody can
  // "add Spanish" to words nobody has written -- only write it, in any language WhatsApp takes.
  press(control);
  tree = messagesAgain();
  const mine = byTestId(tree, "custom-row");
  assert.deepEqual(all(mine, (n) => n.props?.["data-testid"] === "template-lang-option").map((o) => o.props["data-lang"]), ["en_US"]);
  assert.ok(all(mine, (n) => n.props?.["data-testid"] === "template-lang-write").length >= 60, "and every other language WhatsApp takes, to write it in");

  // A STARTER's control draws the language in view, approved; its popover also
  // offers the language the library has written and the workspace has not added --
  // the hole the toolbar's arithmetic ("Add the 3 in English") was describing.
  tree = messages({ __TEMPLATES_ALL: [en, templateRow({ id: "t-w", name: "winback_offer", language: "en_US", meta_status: "approved" })] });
  const starterControl = byTestId(all(tree, (n) => n.props?.["data-testid"] === "starter-row")[0], "template-lang");
  assert.equal(textOf(starterControl).trim(), "EN");
  assert.equal(starterControl.props["data-tone"], "ok", "approved, drawn");
  press(starterControl);
  tree = messagesAgain();
  const offered = all(all(tree, (n) => n.props?.["data-testid"] === "starter-row")[0], (n) => n.props?.["data-testid"] === "template-lang-option");
  assert.deepEqual(offered.map((o) => o.props["data-lang"]), ["en_US", "es"]);
  assert.ok(textOf(offered[1]).includes("Not added yet"), "and one WhatsApp has never seen, said so");

  // Choosing it puts that language in view and opens the message, where the words
  // WhatsApp would review are, and the Add beside them.
  press(offered[1]);
  tree = messagesAgain();
  const open = all(tree, (n) => n.props?.["data-testid"] === "starter-row")[0];
  assert.ok(byTestId(open, "template-open-body"), "the message opens on the language that was pressed");
  assert.ok(textOf(open).includes("Not on WhatsApp in Spanish yet"), textOf(open));
  assert.ok(byTestId(open, "starter-add"), "and the Add for that language is beside its words");

  // One at a time: opening another message closes this one, because two messages'
  // words side by side is the wall this page stopped being.
  press(find(byTestId(tree, "custom-row"), (n) => n.props?.["data-testid"] === "template-open"));
  tree = messagesAgain();
  assert.equal(byTestId(all(tree, (n) => n.props?.["data-testid"] === "starter-row")[0], "template-open-body"), null, "the one that was open is closed");
  assert.ok(byTestId(byTestId(tree, "custom-row"), "template-open-body"), "and the one that was pressed is open");
});

test("A message says whether it may be sent to everyone, on the row: marketing is a rule about who it can reach, not a label", () => {
  // Meta's own category on the workspace's row, and the library's purpose on a
  // starter not yet added -- the same mark either way, because the rule is the same.
  const tree = messages({ __TEMPLATES_ALL: [
    templateRow({ id: "t-o", name: "offer", language: "en_US", category: "MARKETING" }),
    templateRow({ id: "t-n", name: "front_desk_note", language: "en_US", category: "UTILITY" }),
  ] });
  const marks = all(tree, (n) => String(n.props?.className || "") === "msg-row-mark").map((m) => m.props["data-kind"]);
  assert.ok(marks.includes("offer") && marks.includes("note"), marks.join(","));
  const offer = all(tree, (n) => n.props?.["data-kind"] === "offer")[0];
  assert.ok(String(offer.props["data-tip"]).includes("said yes to offers"), offer.props["data-tip"]);
});

test("REGRESSION (C22): a message shows the quality WhatsApp rated it -- the rating was synced and never drawn", () => {
  // The rating is about the message, so it is in the message: the row says what
  // the message is, and opening it says everything WhatsApp knows about it.
  let tree = messagesOpen({ __TEMPLATES_ALL: [templateRow({ name: "front_desk_note", source: "meta", quality: "YELLOW" })] });
  const q = byTestId(tree, "template-quality");
  assert.ok(q, "REGRESSION: no rating on the message");
  assert.equal(textOf(q).trim(), "Medium quality");
  tree = messagesOpen({ __TEMPLATES_ALL: [templateRow({ name: "front_desk_note", source: "meta", quality: "UNKNOWN" })] });
  assert.equal(textOf(byTestId(tree, "template-quality")).trim(), "Quality not rated yet", "a rating WhatsApp has not given is said so");
  tree = messagesOpen({ __TEMPLATES_ALL: [templateRow({ name: "front_desk_note", source: "meta", quality: null })] });
  assert.equal(byTestId(tree, "template-quality"), null, "nothing synced, nothing said");
});

test("REGRESSION (C8): deleting a message a playbook sends names the playbook -- a running one holds the delete back, a paused one is named in the question, and an unread list says so", () => {
  const armed = (playbooks) => {
    let tree = messagesOpen({ __TEMPLATES_ALL: [templateRow()], __PLAYBOOKS: playbooks });
    press(byTestId(tree, "template-menu"));
    tree = messagesAgain();
    press(byTestId(tree, "template-delete"));
    return messagesAgain();
  };
  let tree = armed({ rows: [playbook({ name: "Win-back", template_name: "offer", template_language: "en_US", state: "running" })] });
  assert.equal(byTestId(tree, "template-delete-yes"), null, "REGRESSION: a Yes, and the playbook's runs skipped from then on");
  const held = byTestId(tree, "template-delete-held");
  assert.ok(held && textOf(held).includes("“Win-back” still uses this template."), textOf(held));
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

  let tree = writing({ initialSegment: null, initialRun: null });
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
  const tree = writing({ initialSegment: null, initialRun: null });
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

test("Messages says what sends each message -- every source, so 'nothing sends it' is a reading and not a guess about the two it could not see", () => {
  const offer = [templateRow({ name: "offer", language: "en_US" })];
  let tree = messages({
    __TEMPLATES_ALL: offer,
    __TEMPLATE_USE: { offer: { words: "Win-back and 2 broadcasts", unused: false, playbook: "pb-1" } },
  });
  const users = byTestId(tree, "template-users");
  assert.ok(textOf(users).includes("Win-back and 2 broadcasts"), textOf(users));
  press(users);
  assert.equal(went.at(-1), "outbound/pb-1", "and it opens that playbook's card");

  // The answer the page could not give while it read the playbooks alone: a
  // message two broadcasts had gone out with read the same as a dead one.
  tree = messages({ __TEMPLATES_ALL: offer, __TEMPLATE_USE: { offer: { words: "Nothing sends it", unused: true, playbook: null } } });
  assert.equal(textOf(byTestId(tree, "template-users")).trim(), "Nothing sends it");

  // More than one playbook: the line still says them, and opens the list.
  tree = messages({ __TEMPLATES_ALL: offer, __TEMPLATE_USE: { offer: { words: "Win-back and Welcome", unused: false, playbook: null } } });
  press(byTestId(tree, "template-users"));
  assert.equal(went.at(-1), "outbound", "no single playbook to open, so the list");

  // A usage read that has not landed is not "nothing sends it".
  tree = messages({ __TEMPLATES_ALL: offer, __TEMPLATE_USE: undefined });
  assert.equal(byTestId(tree, "template-users"), null, "an unread map makes no claim");
});

test("Messages says how many of each went out and when the last one did -- and a message that never went out says so in words, not 0", () => {
  const offer = [templateRow({ name: "offer", language: "en_US" })];
  let tree = messages({ __TEMPLATES_ALL: offer, __TEMPLATE_SENT: { offer: { count: "1,204", when: "2d ago" } } });
  const head = find(tree, (n) => n.props?.className === "msg-list-head");
  assert.ok(textOf(head).includes("Sent"), `the column is named once, above the rows -- ${textOf(head)}`);
  let cell = byTestId(byTestId(tree, "custom-row"), "template-sent");
  assert.ok(cell, "the row carries the cell");
  assert.match(textOf(cell), /1,204 sent/, "the count, and the word a stacked row and a screen reader need without the heading");
  assert.ok(textOf(cell).includes("2d ago"), textOf(cell));

  tree = messages({ __TEMPLATES_ALL: offer, __TEMPLATE_SENT: { offer: { count: null, when: "Never sent" } } });
  cell = byTestId(byTestId(tree, "custom-row"), "template-sent");
  // A dash where the number would be (aria-hidden: a screen reader hears the words), then the words.
  assert.equal(textOf(cell).replace("—", "").trim(), "Never sent");
  assert.ok(!/\b0\b/.test(textOf(cell)), "never a 0 in a column of counts");

  // A roll-up that was not read makes no claim.
  tree = messages({ __TEMPLATES_ALL: offer, __TEMPLATE_SENT: null });
  assert.equal(textOf(byTestId(byTestId(tree, "custom-row"), "template-sent")).trim(), "", "not read is not never sent");
  // A starter not on file has nothing to count, and says why: it was never added.
  // Not "Never sent", which would say a template exists that nothing sent.
  tree = messages({ __TEMPLATES_ALL: offer, __TEMPLATE_SENT: { offer: { count: "3", when: "just now" } } });
  const starter = all(tree, (n) => n.props?.["data-testid"] === "starter-row")[0];
  assert.ok(starter, "the fixture draws a starter the workspace has not added");
  assert.equal(textOf(byTestId(starter, "template-sent")).replace("—", "").trim(), "Not added");
  assert.ok(!/\b0\b|Never sent/.test(textOf(byTestId(starter, "template-sent"))), "neither a 0 nor a send that never happened");
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

  let tree = writing({ initialSegment: null, initialRun: null });
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

test("One chip per message, its languages inside it -- the starter set in two drew seven pairs of identical chips", () => {
  const S = globalThis.window.__starters;
  const starters = S.list.slice(0, 3);
  // As the rows come back: both languages, in no useful order.
  const rows = [];
  for (const lang of ["es", "en_US"]) {
    for (const s of starters) {
      const t = S.text(s, lang);
      rows.push(templateRow({ id: `${s.name}:${lang}`, name: s.name, language: lang, category: s.category, purpose: s.category === "utility" ? "conversational" : "marketing", body_preview: t.body }));
    }
  }
  globalThis.window.__BROADCASTS = broadcastsSurface({ templates: rows, number: healthyNumber });
  let tree = writing({ initialSegment: null, initialRun: null });

  const chips = all(tree, (n) => n.props?.["data-testid"] === "bc-template");
  assert.equal(chips.length, starters.length, `one chip per MESSAGE, not per row: ${chips.map(textOf).join(" | ")}`);
  const titles = chips.map((c) => textOf(c).trim());
  assert.equal(new Set(titles).size, titles.length, `REGRESSION: two chips read alike -- ${titles.join(" | ")}`);

  // Each chip carries ONE control for its language -- a toggle per language drew the
  // rows Meta keeps -- and its popover names every language the message goes in.
  const langs = all(tree, (n) => n.props?.["data-testid"] === "bc-template-lang");
  assert.equal(langs.length, starters.length, "one per message");
  press(langs[0]);
  tree = again({ initialSegment: null, initialRun: null });
  const inOne = all(tree, (n) => n.props?.["data-testid"] === "bc-template-lang-option");
  assert.deepEqual(inOne.map((o) => textOf(find(o, (n) => n.props?.className === "lang-opt-name")).trim()), ["English", "Spanish"]);
  // A message in one language still says which, and can be written in another.
  globalThis.window.__BROADCASTS = broadcastsSurface({ templates: [rows[rows.length - 1]], number: healthyNumber });
  const single = all(writing({ initialSegment: null, initialRun: null }), (n) => n.props?.["data-testid"] === "bc-template-lang");
  assert.equal(single.length, 1);
  assert.equal(textOf(single[0]).trim(), "EN");

  // Picking a language picks THAT row, and the armed send names it.
  globalThis.window.__BROADCASTS = broadcastsSurface({ templates: rows, number: healthyNumber });
  tree = writing({ initialSegment: null, initialRun: null });
  const firstChip = find(tree, (n) => String(n.props?.className || "").includes("tpl-chip") && byTestId(n, "bc-template") === find(tree, (m) => m.props?.["data-testid"] === "bc-template"));
  press(byTestId(firstChip, "bc-template"));
  tree = again({ initialSegment: null, initialRun: null });
  press(find(tree, (n) => n.props?.["data-testid"] === "bc-template-lang"));
  tree = again({ initialSegment: null, initialRun: null });
  const spanish = all(tree, (n) => n.props?.["data-testid"] === "bc-template-lang-option").find((n) => n.props["data-lang"] === "es");
  press(spanish);
  tree = again({ initialSegment: null, initialRun: null });
  press(byTestId(tree, "bc-send"));
  tree = again({ initialSegment: null, initialRun: null });
  assert.ok(textOf(byTestId(tree, "bc-send-confirm")).includes("(Spanish)"), textOf(byTestId(tree, "bc-send-confirm")));

  // And the composer opens on the same row however the rows arrive: `defaultTemplate`
  // used to `find` on the list as given, so a reload could open on the other language.
  const opened = (list) => {
    globalThis.window.__BROADCASTS = broadcastsSurface({ templates: list, number: healthyNumber });
    const t = writing({ initialSegment: null, initialRun: null });
    const active = find(t, (n) => String(n.props?.className || "").includes("tpl-chip") && String(n.props.className).includes("active"));
    return active ? textOf(byTestId(active, "bc-template-lang")).trim() : null;
  };
  assert.equal(opened(rows), opened(rows.slice().reverse()), "the picker opens on the same language either way");
});

test("A playbook's card says which message it sends AND in which language -- the language was in a data-tip, which no finger reaches", () => {
  // The card draws the message it sends, so its template has to be among the
  // approved ones the surface carries -- an empty list is "no longer approved".
  const es = templateRow({ id: "tpl-1", name: "winback_offer", language: "es", body_preview: "Hola {{1}}." });
  globalThis.window.__PLAYBOOKS = playbooksSurface({ templates: [es] });
  fresh();
  const card = globalThis.window.PlaybookCard({ p: playbook({ template_id: "tpl-1", template_language: "es" }), canAct: true, onEdit() {}, flash() {} });
  const caption = byTestId(card, "pb-template-name");
  assert.ok(caption, "the message is captioned with the message it is");
  assert.ok(textOf(caption).includes("Spanish"), textOf(caption));
  assert.equal(caption.props["data-tip"], undefined, "and not only on hover");
  press(caption);
  assert.equal(went.at(-1), "messages", "and it opens where that message is kept");
});

test("The template a composer opens on does not depend on the order the rows arrived in", () => {
  // The page sorts before it asks, so the rendered picker is steady either way --
  // but `defaultTemplate` is what a caller that does NOT sort gets, and it used
  // to `find` on the list as given. Held here, where the fix is.
  const row = (name, language) => ({ id: `${name}:${language}`, name, language, category: "marketing", source: "chanlytics", title: null });
  const list = [row("welcome_new", "es"), row("winback_offer", "es"), row("welcome_new", "en_US"), row("winback_offer", "en_US")];
  const pick = (l) => contracts.defaultTemplate(l, "quiet_30").id;
  assert.equal(pick(list), pick(list.slice().reverse()));
  assert.equal(pick(list), "winback_offer:en_US", "the trigger's starter, in the first language of the total order");
  // And the order IS total: two rows of one name never compare equal.
  assert.notEqual(contracts.compareTemplates(row("winback_offer", "en_US"), row("winback_offer", "es")), 0);
});

test("a message's language finds any language WhatsApp takes -- by its name or its own -- and writing one opens the writer on the message's own name, which translates it", async () => {
  const en = templateRow({ id: "t-en", name: "offer", language: "en_US", meta_status: "approved", body_preview: "Hi {{1}}, 20% off this week.", variables: [{ position: 1, label: "First name", example: "Dani" }] });
  let tree = messages({ __TEMPLATES_ALL: [en] });
  press(byTestId(byTestId(tree, "custom-row"), "template-lang"));
  tree = messagesAgain();
  byTestId(byTestId(tree, "custom-row"), "template-lang-search").props.onChange({ target: { value: "deutsch" } });
  tree = messagesAgain();
  const written = all(byTestId(tree, "custom-row"), (n) => n.props?.["data-testid"] === "template-lang-write");
  assert.equal(written[0].props["data-lang"], "de", "German, found by what Germans call it");
  assert.equal(all(byTestId(tree, "custom-row"), (n) => n.props?.["data-testid"] === "template-lang-option").length, 0, "and the message's own English stands down: it does not match");
  byTestId(byTestId(tree, "custom-row"), "template-lang-search").props.onChange({ target: { value: "klingon" } });
  tree = messagesAgain();
  assert.ok(byTestId(byTestId(tree, "custom-row"), "template-lang-none"), "nothing made up for a language WhatsApp does not take");
  byTestId(byTestId(tree, "custom-row"), "template-lang-search").props.onChange({ target: { value: "deutsch" } });
  tree = messagesAgain();
  press(find(byTestId(tree, "custom-row"), (n) => n.props?.["data-testid"] === "template-lang-write"));
  tree = messagesAgain();
  assert.ok(byTestId(tree, "messages-composer"), "the writer opens");
  const preset = find(tree, (n) => n.type === globalThis.window.TemplateComposer).props.preset;
  assert.deepEqual([preset.name, preset.language, preset.from.language], ["offer", "de", "en_US"], "on the message's own name: WhatsApp keeps one message per name per language");
  // The writer, drawn on that preset.
  const draw = () => { seq = 0; return globalThis.window.TemplateComposer({ preset, businessName: "Northside Studio", onDone() {}, onCancel() {} }); };
  fresh();
  let writer = draw();
  assert.equal(byTestId(writer, "tpl-name").props.value, "offer");
  assert.equal(byTestId(writer, "tpl-name").props.readOnly, true, "the name is the message: it does not change here");
  assert.ok(textOf(byTestId(writer, "tpl-source")).includes("Hi first name, 20% off this week."), `with the words it has, its slots by what fills them -- never {{1}}: ${textOf(byTestId(writer, "tpl-source"))}`);
  assert.equal(textOf(byTestId(writer, "tpl-language")).trim(), "German");
  // Translated on a press -- and the draft keeps the message's name, whatever the draft calls it.
  const asked = [];
  const keep = globalThis.window.__templates;
  globalThis.window.__templates = { ...keep, draft: async (b) => { asked.push(b); return { ok: true, data: { draft: { name: "rabatt_angebot", body: "Hallo {{1}}, 20 % Rabatt diese Woche.", footer: null, examples: ["Dani"], variables: [{ label: "Vorname" }], warnings: [] } } }; } };
  try {
    await press(byTestId(writer, "tpl-translate"));
    writer = draw();
    assert.equal(asked[0].language, "de");
    assert.ok(asked[0].brief.includes("Hi {{1}}, 20% off this week.") && asked[0].brief.includes("German"), asked[0].brief);
    assert.equal(byTestId(writer, "tpl-name").props.value, "offer", "REGRESSION-IN-WAITING: a translation filed as a new message");
    assert.equal(byTestId(writer, "tpl-body").props.value, "Hallo {{1}}, 20 % Rabatt diese Woche.");
  } finally {
    globalThis.window.__templates = keep;
  }
});

test("a link to write a message in a language -- messages/write:<name>:<language>, from a composer's popover -- opens the writer on it", () => {
  Object.assign(globalThis.window, {
    __TEMPLATES_ALL: [templateRow({ id: "t-en", name: "offer", language: "en_US", meta_status: "approved", body_preview: "Hi {{1}}, 20% off this week." })],
    __TEMPLATE_USE: null, __TEMPLATE_SENT: null, __CHANNELS: [{ kind: "whatsapp" }], __SETTINGS: { config: { brain: { business_name: "Northside Studio" } } },
  });
  fresh();
  const props = { write: { name: "offer", language: "fr" } };
  globalThis.window.MessagesPage(props);
  seq = 0;
  const tree = globalThis.window.MessagesPage(props);
  assert.ok(byTestId(tree, "messages-composer"), "the link opens the writer");
  const preset = find(tree, (n) => n.type === globalThis.window.TemplateComposer).props.preset;
  assert.deepEqual([preset.name, preset.language, preset.from.body], ["offer", "fr", "Hi {{1}}, 20% off this week."], "on the message, in the language, with the words it has");
});

test("in a composer, a message's language adds a starter's missing language in place, and sends any other to be written on Templates", async () => {
  const S = globalThis.window.__starters;
  const s = S.list[0];
  const enRow = templateRow({ id: `${s.name}:en_US`, name: s.name, language: "en_US", category: s.category, purpose: s.category === "utility" ? "conversational" : "marketing", body_preview: S.text(s, "en_US").body });
  globalThis.window.__BROADCASTS = broadcastsSurface({ templates: [enRow], number: healthyNumber });
  globalThis.window.__TEMPLATES_ALL = [enRow];
  const added = [];
  const keep = globalThis.window.__templates;
  globalThis.window.__templates = { ...keep, addStarters: async (b) => { added.push(b); return { ok: true, data: { submitted: 1 } }; } };
  try {
    const props = { initialSegment: null, initialRun: null };
    // The popover, open: the composer mounts after the ledger in one stub session, and the stub's hook tape is linear,
    // so the picker's first cell can hold what the ledger left there. Pressed until it shows, twice at most.
    const withPop = (t) => { for (let i = 0; i < 2 && !byTestId(t, "bc-template-lang-pop"); i++) { press(find(t, (n) => n.props?.["data-testid"] === "bc-template-lang")); t = again(props); } return t; };
    let tree = withPop(writing(props));
    const es = all(tree, (n) => n.props?.["data-testid"] === "bc-template-lang-option").find((o) => o.props["data-lang"] === "es");
    assert.ok(es && textOf(es).includes("Add from the starter set"), "the library has it written");
    press(es);
    await settle();
    tree = again(props);
    assert.deepEqual(added, [{ keys: [s.key], languages: ["es"] }]);
    assert.ok(textOf(byTestId(tree, "bc-template-lang-note")).includes("is with WhatsApp"), textOf(byTestId(tree, "bc-template-lang-note")));
    tree = withPop(tree);
    press(all(tree, (n) => n.props?.["data-testid"] === "bc-template-lang-write").find((o) => o.props["data-lang"] === "fr"));
    assert.equal(went.at(-1), `messages/write:${s.name}:fr`, "any other language is written where the words are");
  } finally {
    globalThis.window.__templates = keep;
    globalThis.window.__TEMPLATES_ALL = [];
  }
});

test("A message says its state once, and a refusal is a line rather than a hover", () => {
  // The language button switched the language AND carried that language's status
  // as a dot plus words, so the control you press to read the Spanish version was
  // the only place its approval was written -- and a rejection's reason was a
  // `title=`, which a touch screen has no way to show at all.
  let tree = messages({ __TEMPLATES_ALL: [
    templateRow({ id: "t-en", name: "offer", language: "en_US", meta_status: "approved" }),
    templateRow({ id: "t-es", name: "offer", language: "es", meta_status: "pending" }),
  ] });
  // One control, for the language in view: it DRAWS that language's state and says
  // the language -- and "+1" for the other on file -- never the state in words.
  const control = byTestId(byTestId(tree, "custom-row"), "template-lang");
  assert.equal(textOf(control).trim(), "EN+1");
  assert.ok(!/approved|review/i.test(textOf(control)), `a language control says a language, not a state: ${textOf(control)}`);
  assert.equal(control.props["data-tone"], "ok");
  // Opened, each language's state is said in words, where there is room for them.
  press(control);
  tree = messagesAgain();
  const langs = all(byTestId(tree, "custom-row"), (n) => n.props?.["data-testid"] === "template-lang-option");
  assert.deepEqual(langs.map((l) => textOf(find(l, (n) => n.props?.className === "lang-opt-note")).trim()), ["Approved", "In review"]);
  // Words once per MESSAGE, beside the title, for the language that is not simply
  // approved -- whichever language is in view. It was the state of the language in
  // view, so a message half in review read as fine until Spanish was pressed.
  assert.equal(textOf(byTestId(tree, "template-status")).trim(), "Spanish in review", "the language that is not approved, in words, beside the title");
  press(langs[1]);
  tree = messagesAgain();
  assert.equal(byTestId(byTestId(tree, "custom-row"), "template-lang").props["data-tone"], "info", "the control draws the language now in view");
  assert.equal(textOf(byTestId(tree, "template-status")).trim(), "Spanish in review", "and the same words with the other language in view");
  // A message whose every language is approved has nothing to say: a green
  // "Approved" on every row is the state said twice, beside the slot that drew it.
  tree = messages({ __TEMPLATES_ALL: [templateRow({ id: "t-en", name: "offer", language: "en_US", meta_status: "approved" })] });
  assert.equal(byTestId(byTestId(tree, "custom-row"), "template-status"), null, "nothing to say about an approved message");

  tree = messages({ __TEMPLATES_ALL: [templateRow({ name: "offer", language: "en_US", meta_status: "rejected", rejected_reason: "ABUSIVE_CONTENT" })] });
  const said = textOf(byTestId(tree, "template-rejected"));
  assert.ok(said.includes("abusive content"), said);
  assert.ok(said.includes("send it back"), "and what to do about it");
});

test("A template written here keeps its footer everywhere, not only while it is being drafted", () => {
  // The components as the CREATE path files them with Meta, built by contracts --
  // not a shape invented here.
  const written = contracts.templateComponents({
    name: "spring_offer", language: "en_US", category: "marketing",
    body: "Hi {{1}}, 20% off any service this week.", footer: "Reply STOP to opt out", examples: ["Dani"],
  });
  // And as the SYNC stores them, which is Meta's own array.
  const fromManager = [{ type: "BODY", text: "Hi {{1}}, your table is ready." }, { type: "FOOTER", text: "Not now? Reply STOP" }];

  const mine = templateRow({ id: "t-mine", name: "spring_offer", purpose: "marketing", body_preview: "Hi {{1}}, 20% off any service this week.", variables: [{ position: 1, label: "First name", example: "Dani" }], footer: contracts.footerOf(written) });
  const theirs = templateRow({ id: "t-theirs", name: "front_desk_note", source: "meta", purpose: "marketing", body_preview: "Hi {{1}}, your table is ready.", variables: [{ position: 1, label: "First name", example: "Dani" }], footer: contracts.footerOf(fromManager) });

  globalThis.window.__BROADCASTS = broadcastsSurface({ templates: [mine, theirs], number: healthyNumber });
  let tree = writing({ initialSegment: null, initialRun: null });
  assert.ok(textOf(byTestId(tree, "bc-preview")).includes("Reply STOP to opt out"), textOf(byTestId(tree, "bc-preview")));

  // The other one, picked: a template synced from WhatsApp Manager keeps ITS words.
  const chips = all(tree, (n) => n.props?.["data-testid"] === "bc-template");
  press(chips[chips.length - 1]);
  tree = again({ initialSegment: null, initialRun: null });
  assert.ok(textOf(byTestId(tree, "bc-preview")).includes("Not now? Reply STOP"), textOf(byTestId(tree, "bc-preview")));

  // On Messages too, where it said a starter's footer or nothing at all.
  // Scoped to the workspace's OWN row: the starter cards on the same page draw the
  // library's footer, so reading the whole section would pass either way.
  const msgTree = messagesOpen({ __TEMPLATES_ALL: [mine] });
  const own = byTestId(msgTree, "custom-row");
  assert.ok(own, "the workspace's own message has a row");
  assert.ok(textOf(own).includes("Reply STOP to opt out"), textOf(own));

  // A row with no footer on file invents none -- and a STARTER still knows its own.
  const bare = templateRow({ id: "t-bare", name: "front_desk_note", footer: null, body_preview: "No footer here." });
  assert.equal(globalThis.window.__starters.footer(bare), null);
  const s = globalThis.window.__starters.list[0];
  assert.equal(globalThis.window.__starters.footer({ name: s.name, language: "es", footer: null }), s.texts.es.footer);
});

test("A template this product cannot send is not offered, and its card says why", () => {
  // `sendTemplate` (packages/channels) puts ONE component on the wire -- the body --
  // and `variablesOf` counts only the BODY's slots. So a template whose heading is a
  // picture, or which takes a value in a heading or a button, passed the composer's
  // "every slot filled" check, enrolled its recipients, and was then refused BY META
  // for every one of them. The owner saw a broadcast that delivered to nobody.
  const parts = (components) => ({ ...contracts.templateParts(components), blocked: contracts.templateBlocked({ components }) });
  const plain = templateRow({ id: "t-ok", name: "offer", purpose: "marketing", body_preview: "Hi {{1}}.", variables: [{ position: 1, label: "First name", example: "Dani" }], ...parts([{ type: "BODY", text: "Hi {{1}}." }]) });
  const picture = templateRow({ id: "t-img", name: "spring_poster", source: "meta", purpose: "marketing", body_preview: "Hi {{1}}.", variables: [{ position: 1, label: "First name", example: "Dani" }], ...parts([{ type: "HEADER", format: "IMAGE" }, { type: "BODY", text: "Hi {{1}}." }]) });

  globalThis.window.__BROADCASTS = broadcastsSurface({ templates: [plain, picture], number: healthyNumber });
  const tree = writing({ initialSegment: null, initialRun: null });
  const chips = all(tree, (n) => n.props?.["data-testid"] === "bc-template");
  assert.equal(chips.length, 1, `only what can go on the wire: ${chips.map(textOf).join(" | ")}`);
  const why = textOf(byTestId(tree, "bc-blocked"));
  assert.ok(why.includes("a picture for a heading"), why);
  assert.ok(why.includes("WhatsApp Manager"), "and where it does still work");

  // Playbooks refuses the same one.
  globalThis.window.__PLAYBOOKS = playbooksSurface({ templates: [plain, picture] });
  fresh();
  globalThis.window.OutboundPage({});
  globalThis.window.dispatchEvent({ type: "playbooks:new" });
  seq = 0;
  const pb = globalThis.window.OutboundPage({});
  assert.equal(all(pb, (n) => n.props?.["data-testid"] === "pb-template").length, 1);
  assert.ok(textOf(byTestId(pb, "pb-blocked")).includes("a picture for a heading"));

  // And the library says why rather than leaving it looking available.
  const card = messages({ __TEMPLATES_ALL: [picture] });
  assert.ok(textOf(byTestId(card, "template-blocked")).includes("a picture for a heading"), textOf(byTestId(card, "template-blocked")));

  // Every shape the wire cannot carry, each named. The page above proves one of
  // them reaches the picker; these prove the rule itself, one case at a time.
  const blocked = (components) => contracts.templateBlocked({ components });
  assert.equal(blocked([{ type: "HEADER", format: "IMAGE" }, { type: "BODY", text: "Hi." }]), "a picture for a heading");
  assert.equal(blocked([{ type: "HEADER", format: "VIDEO" }, { type: "BODY", text: "Hi." }]), "a video for a heading");
  assert.equal(blocked([{ type: "HEADER", format: "TEXT", text: "{{1}} is back" }, { type: "BODY", text: "Hi." }]), "a heading that takes a value");
  assert.equal(blocked([{ type: "BODY", text: "Hi." }, { type: "BUTTONS", buttons: [{ type: "URL", text: "Book", url: "https://x.example/{{1}}" }] }]), "a button that takes a value");
  assert.equal(blocked([{ type: "BODY", text: "Hi." }, { type: "BUTTONS", buttons: [{ type: "COPY_CODE", text: "Copy" }] }]), "a button Chanlytics cannot fill");
  // And every shape it CAN: a static heading, a static link, a quick reply, a call.
  assert.equal(blocked([{ type: "HEADER", format: "TEXT", text: "This week" }, { type: "BODY", text: "Hi." }]), null);
  assert.equal(blocked([{ type: "BODY", text: "Hi." }, { type: "BUTTONS", buttons: [{ type: "URL", text: "Book", url: "https://x.example/book" }, { type: "QUICK_REPLY", text: "No" }, { type: "PHONE_NUMBER", text: "Call" }] }]), null);
  assert.equal(blocked([{ type: "BODY", text: "Hi." }]), null);
  assert.equal(blocked(null), null, "a row with no components on file makes no claim");
});

test("The preview draws the heading and the buttons, which are the message too", () => {
  // For an appointment business the "Book now" button IS the message, and it was
  // the one part of it the operator could not see: `body_preview` is the BODY
  // component alone, so a heading and a button were drawn as nothing at all.
  const components = [
    { type: "HEADER", format: "TEXT", text: "This week at Luna Studio" },
    { type: "BODY", text: "Hi {{1}}, 20% off any colour service." },
    { type: "FOOTER", text: "Reply STOP to opt out" },
    { type: "BUTTONS", buttons: [{ type: "URL", text: "Book now", url: "https://booksy.com/luna" }, { type: "QUICK_REPLY", text: "Not now" }] },
  ];
  const tpl = templateRow({ id: "t-rich", name: "offer", purpose: "marketing", body_preview: "Hi {{1}}, 20% off any colour service.", variables: [{ position: 1, label: "First name", example: "Dani" }], ...contracts.templateParts(components), blocked: contracts.templateBlocked({ components }) });
  assert.equal(tpl.blocked, null, "static heading and static buttons carry no parameter, so this one sends");

  globalThis.window.__BROADCASTS = broadcastsSurface({ templates: [tpl], number: healthyNumber });
  const preview = byTestId(writing({ initialSegment: null, initialRun: null }), "bc-preview");
  assert.ok(textOf(find(preview, (n) => n.props?.className === "mp-header")).includes("This week at Luna Studio"));
  const buttons = byTestId(preview, "mp-buttons");
  assert.ok(buttons, "the buttons are drawn");
  assert.equal(all(buttons, (n) => n.props?.className === "mp-button").length, 2);
  assert.ok(textOf(buttons).includes("Book now") && textOf(buttons).includes("Not now"), textOf(buttons));
  // A screen reader hears the whole message, not the words alone.
  const said = String(find(preview, (n) => n.props?.className === "mp-bubble").props["aria-label"]);
  assert.ok(said.includes("This week at Luna Studio") && said.includes("Book now"), said);
});

test("History says whether a playbook or a person sent each broadcast, and the split filters it", () => {
  // `broadcasts.playbook_id` is on every row and nothing drew it, so a playbook's
  // automatic run sat beside a hand-sent blast with no way to tell them apart --
  // while Playbooks summed the same runs again on its own tab.
  const run = (over = {}) => toBroadcastVM(dto({ id: "b-run", name: "Win-back · 2026-09-10", playbook_id: "pb-1", audience: { kind: "playbook", id: "pb-1", label: "Win-back" }, ...over }), ZONE);
  const byHand = toBroadcastVM(dto({ id: "b-hand", name: "Spring offer", playbook_id: null, audience: { kind: "list", id: "quiet", label: "Lapsed 60+ days" } }), ZONE);
  globalThis.window.__BROADCASTS = broadcastsSurface({ rows: [run(), byHand] });
  let tree = page({ initialSegment: null, initialRun: null });

  const rowWords = () => all(tree, (n) => n.props?.["data-testid"] === "bc-history").map((n) => textOf(n).replace(/\s+/g, " "));
  let words = rowWords();
  assert.equal(words.length, 2);
  // Each card says which kind sent it, first on its line: a playbook's run, or a broadcast a person sent.
  assert.ok(words.some((w) => w.includes("Playbook · Win-back")), words.join(" || "));
  assert.ok(words.some((w) => w.includes("Broadcast · Lapsed 60+ days")), words.join(" || "));
  // The playbook's name is said ONCE: it is the audience cell, and that cell opens it.
  const run0 = all(tree, (n) => n.props?.["data-testid"] === "bc-history")[0];
  assert.equal(textOf(run0).match(/Win-back/g).length, 2, "the run's own name, and the audience — not a third time in the origin");
  press(byTestId(run0, "bc-history-playbook"));
  assert.equal(went.at(-1), "outbound/pb-1", "and it opens the playbook that made it");

  // The line splits them, and each count is its own filter.
  const line = byTestId(tree, "bc-standing");
  assert.ok(textOf(line).includes("by a playbook") && textOf(line).includes("by hand"), textOf(line));
  press(byTestId(line, "bc-origin-hand"));
  tree = again({ initialSegment: null, initialRun: null });
  words = rowWords();
  assert.equal(words.length, 1, words.join(" || "));
  assert.ok(words[0].includes("Spring offer"), words[0]);
  // Pressing the one in force clears it, as the Playbooks line's taps do.
  press(byTestId(byTestId(tree, "bc-standing"), "bc-origin-hand"));
  tree = again({ initialSegment: null, initialRun: null });
  assert.equal(rowWords().length, 2);

  // One kind only: nothing to split, so no taps.
  globalThis.window.__BROADCASTS = broadcastsSurface({ rows: [byHand] });
  assert.equal(byTestId(page({ initialSegment: null, initialRun: null }), "bc-origin-playbook"), null);
});

test("A message written here can carry a Book now button, and it is the one kind that sends", () => {
  // For an appointment business the button IS the conversion, and until now one
  // could only arrive by syncing from WhatsApp Manager -- where it could just as
  // easily arrive in a shape that cannot be sent at all.
  const settings = { config: { brain: { business_name: "Luna Studio", booking_link: "https://booksy.com/luna-studio" } } };
  Object.assign(globalThis.window, { __SETTINGS: settings, __CHANNELS: [{ kind: "whatsapp" }], __TEMPLATES_ALL: [] });
  const made = [];
  const keep = globalThis.window.__templates;
  globalThis.window.__templates = { ...keep, create: async (b) => { made.push(b); return { ok: true, data: { name: b.name } }; } };
  try {
    fresh();
    let tree = globalThis.window.TemplateComposer({ businessName: "Luna Studio", onDone() {}, onCancel() {} });
    const set = (id, v) => { byTestId(tree, id).props.onChange({ target: { value: v } }); };
    set("tpl-name", "spring_offer");
    set("tpl-body", "Hi {{1}}, 20% off any colour service this week.");
    seq = 0;
    tree = globalThis.window.TemplateComposer({ businessName: "Luna Studio", onDone() {}, onCancel() {} });
    // The address is the workspace's own, and it is shown rather than typed.
    assert.ok(textOf(byTestId(tree, "tpl-button")).includes("booksy.com/luna-studio"), textOf(byTestId(tree, "tpl-button")));
    byTestId(tree, "tpl-button-text").props.onChange({ target: { value: "Book now" } });
    all(tree, (n) => n.props?.["data-testid"] === "tpl-examples").length;
    const ex = find(tree, (n) => n.type === "input" && String(n.props?.placeholder || "").includes("what a real value"));
    if (ex) ex.props.onChange({ target: { value: "Dani" } });
    seq = 0;
    tree = globalThis.window.TemplateComposer({ businessName: "Luna Studio", onDone() {}, onCancel() {} });

    // It is drawn where the customer will see it, before anything is filed.
    assert.ok(textOf(byTestId(tree, "mp-buttons")).includes("Book now"), "the composer draws its own button");

    return press(byTestId(tree, "tpl-submit")).then(() => {
      assert.equal(made.length, 1, "it was filed");
      assert.deepEqual(made[0].button, { text: "Book now", url: "https://booksy.com/luna-studio" });
      // And what is filed is a template that SENDS: a static button carries no
      // parameter, so templateBlocked passes it (unlike every shape #646 refuses).
      const check = contracts.validateTemplateDraft({ name: "spring_offer", language: "en_US", category: "marketing", body: "Hi {{1}}.", examples: ["Dani"], button: made[0].button });
      assert.ok(check.ok, check.error);
      const components = contracts.templateComponents(check.value);
      assert.equal(contracts.templateBlocked({ components }), null, "a static button is sendable");
      assert.deepEqual(contracts.templateParts(components).buttons, [{ text: "Book now", kind: "url" }], "and it reads back as itself");
    });
  } finally {
    globalThis.window.__templates = keep;
  }
});

test("A button cannot take a value, and needs somewhere to go", () => {
  const base = { name: "offer", language: "en_US", category: "marketing", body: "Hi {{1}}.", examples: ["Dani"] };
  const err = (button) => contracts.validateTemplateDraft({ ...base, button }).error;
  // The whole point: a button whose URL takes a value needs a parameter that
  // `sendTemplate` never sends, so Meta refuses every recipient.
  assert.match(err({ text: "Book", url: "https://x.example/{{1}}" }), /cannot take a value/);
  assert.match(err({ text: "Book {{1}}", url: "https://x.example" }), /cannot take a value/);
  assert.match(err({ text: "", url: "https://x.example" }), /Give the button its words/);
  assert.match(err({ text: "Book an appointment with us today", url: "https://x.example" }), /under 25 characters/);
  assert.match(err({ text: "Book", url: "booksy.com/luna" }), /starting with https/);
  assert.equal(contracts.validateTemplateDraft({ ...base, button: null }).ok, true, "and no button at all is fine");

  // With no booking link on file the composer offers no button, and says why.
  Object.assign(globalThis.window, { __SETTINGS: { config: { brain: { business_name: "Luna Studio", booking_link: "" } } }, __CHANNELS: [{ kind: "whatsapp" }] });
  fresh();
  const tree = globalThis.window.TemplateComposer({ businessName: "Luna Studio", onDone() {}, onCancel() {} });
  assert.equal(byTestId(tree, "tpl-button-text"), null);
  assert.ok(textOf(byTestId(tree, "tpl-button-none")).includes("booking link"), textOf(byTestId(tree, "tpl-button-none")));
});
