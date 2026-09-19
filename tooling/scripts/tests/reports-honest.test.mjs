/**
 * Campaigns, honest: a playbook link opens its card and a deleted one says so (the wiring audit's C13), and the
 * reply window is one rule said one way (C25). The Reports page's own regressions (C13, C25 to C28) moved to
 * reports-page.test.mjs with the page's redesign. Run against the pages on a stub React, over the view models the
 * bridge publishes.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import * as contracts from "@chanlytics/contracts";

const { toCampaignReportVM, stateOf, POLICY_CLASS_WORDS } = contracts;
const TID = "t-studio";
const ZONE = "America/New_York";

/* ------------------------ the campaigns, as campaign-report pins them ------------------------ */

const cday = (d, over = {}) => ({ day: d, sent: 0, delivered: 0, read: 0, replied: 0, opt_ins: 0, opt_outs: 0, ...over });
const campaignDto = () => ({
  timezone: ZONE, days: 7, span_days: 14, today: "2026-09-04",
  series: [
    ...["2026-08-22", "2026-08-23", "2026-08-24", "2026-08-25", "2026-08-26", "2026-08-27", "2026-08-28"].map((d, i) => cday(d, i === 2 ? { sent: 4, delivered: 4, read: 2, replied: 2, opt_ins: 1 } : {})),
    cday("2026-08-29", { sent: 10, delivered: 9, read: 6, replied: 2, opt_ins: 2 }),
    cday("2026-08-30"),
    cday("2026-08-31", { opt_ins: 1, opt_outs: 1 }),
    cday("2026-09-01", { sent: 6, delivered: 3, read: 1, replied: 1 }),
    cday("2026-09-02"),
    cday("2026-09-03", { sent: 4, delivered: 4, read: 4, replied: 1, opt_outs: 1 }),
    cday("2026-09-04"),
  ],
  sources: [
    { id: "p1", kind: "playbook", name: "Win-back", template_name: "winback_offer", runs: 2, sent: 14, delivered: 12, read: 7, replied: 3, last_at: "2026-09-03T14:05:00Z" },
    { id: "b1", kind: "broadcast", name: "A quick note · Sep 1", template_name: "quick_note", runs: 1, sent: 6, delivered: 4, read: 4, replied: 1, last_at: "2026-09-01T15:00:00Z" },
  ],
});
const playbook = (over = {}) => ({
  id: "pb-1", name: "Win-back", trigger: "quiet_30", template_id: "tpl-1", template_name: "winback_offer", template_language: "en_US",
  params: [{ kind: "first_name" }], policy_class: "reengage", state: "running", run_hour: 10, cap_per_run: 25, gap_days: 90, cadence_days: 30,
  last_run_for: null, last_run_at: null, created_at: "2026-08-01T00:00:00Z",
  triggerLabel: "Quiet 30 days", triggerHint: "anyone quiet for a month", schedule: "daily at 10:00", next: "tomorrow 10:00", candidates: 4, held: 0,
  totals: { runs: 2, sent: 6, delivered: 4, replied: 1, held: 0, lastRun: null, waiting: null, history: [] },
  ...over,
});
const playbooksSurface = (over = {}) => ({
  rows: [playbook(), playbook({ id: "pb-2", name: "Welcome", trigger: "new_week", policy_class: "campaign" })], templates: [],
  triggers: [], classWords: POLICY_CLASS_WORDS, timezone: ZONE, calendar: "none", number: { present: true, health: { canSend: true } },
  businessName: "Northside Studio", bookingLink: false, replyWindow: contracts.REPLY_WINDOW_WORDS, fetchedAt: 1, ...over,
});

/* ---------------------------------- the window ---------------------------------- */

const listeners = {};
const storage = () => { const m = new Map(); return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: (k) => m.delete(k) }; };
globalThis.localStorage = storage();
globalThis.sessionStorage = storage();
globalThis.document = {
  body: { appendChild() {} }, activeElement: null, addEventListener() {}, removeEventListener() {}, getElementById: () => null,
  createElement: () => ({ setAttribute() {}, style: {}, classList: { add() {}, remove() {} }, click() {}, remove() {} }),
};
globalThis.window = {
  location: { pathname: "/w/studio", hash: "#/reports", origin: "https://app.chanlytics.com", assign() {}, replace() {}, reload() {} },
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
await import("../../../apps/dashboard/src/legacy/components/message-preview.jsx");
await import("../../../apps/dashboard/src/legacy/components/template-chips.jsx");
for (const k of ["StatStrip", "StatCell", "EmptyState", "FailedRead", "StatePill", "PolicyChip", "Confirm"]) globalThis[k] = globalThis.window[k];
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
await import("../../../apps/dashboard/src/legacy/pages/broadcasts-real.jsx");
await import("../../../apps/dashboard/src/legacy/pages/outbound-real.jsx");

const walk = (n, fn) => {
  if (n == null || typeof n !== "object") return;
  if (Array.isArray(n)) { for (const k of n) walk(k, fn); return; }
  fn(n);
  walk(n.props?.children, fn);
  walk(n.rendered, fn);
};
// A drawn component is walked twice, as the children it was given and as what it rendered: each node counts once.
const all = (tree, pred) => { const out = []; const seen = new Set(); walk(tree, (n) => { if (!seen.has(n) && pred(n)) { seen.add(n); out.push(n); } }); return out; };
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
const fresh = () => { cells = []; seq = 0; went.length = 0; for (const k of Object.keys(listeners)) delete listeners[k]; };

/* ------------------------------ doors ------------------------------ */

test("REGRESSION (C13): Playbooks opened on a playbook marks its card and brings it into view, and a playbook since deleted says so", () => {
  globalThis.window.__PLAYBOOKS = playbooksSurface();
  const scrolled = [];
  const keep = globalThis.document.getElementById;
  globalThis.document.getElementById = (id) => (id === "pb-pb-2" ? { getBoundingClientRect: () => ({ top: 1400 }), scrollIntoView: () => scrolled.push(id) } : null);
  try {
    fresh();
    const tree = globalThis.window.OutboundPage({ initialPlaybook: "pb-2" });
    const cards = all(tree, (n) => n.props?.["data-testid"] === "pb-card");
    assert.deepEqual(cards.map((c) => [c.props.id, classes(c).includes("is-focus")]), [["pb-pb-1", false], ["pb-pb-2", true]]);
    assert.deepEqual(scrolled, ["pb-pb-2"], "brought into view");
    fresh();
    const gone = globalThis.window.OutboundPage({ initialPlaybook: "pb-deleted" });
    assert.ok(textOf(byTestId(gone, "pb-gone")).includes("isn't here any more"), "a link to a deleted playbook says so, and the cards stay");
    assert.equal(all(gone, (n) => n.props?.["data-testid"] === "pb-card").length, 2);
  } finally {
    globalThis.document.getElementById = keep;
  }
});

/* ------------------------------ words ------------------------------ */

test("REGRESSION (C25): the reply window is one rule said one way -- three places said it three ways", () => {
  assert.equal(contracts.REPLY_WINDOW_MS, contracts.REPLY_WINDOW_HOURS * 3_600_000);
  assert.equal(contracts.REPLY_WINDOW_WORDS, "within 3 days", "72 hours, as the SQL series keeps it");
  const replied = toCampaignReportVM(campaignDto()).tiles.find((t) => t.id === "replied");
  assert.equal(replied.meta, `4 wrote back ${contracts.REPLY_WINDOW_WORDS}`);
  fresh();
  const stats = globalThis.window.BcHistoryStats({ rows: [{ id: "b1", open: false, state: "sent", counts: { sent: 2, delivered: 2, replied: 1, skipped: 0, failed: 0 } }], more: false, replyWindow: "within 2 days" });
  assert.ok(find(stats, (n) => String(n.props?.["data-tip"]).includes("within 2 days of a broadcast")), "Broadcasts reads the published words");
  globalThis.window.__PLAYBOOKS = playbooksSurface({ replyWindow: "within 2 days" });
  fresh();
  const page = globalThis.window.OutboundPage({});
  assert.ok(find(page, (n) => String(n.props?.["data-tip"]).includes("within 2 days of a run")), "REGRESSION: Playbooks said 'after a run'");
  assert.ok(find(page, (n) => n.props?.["data-tip"] && String(n.props["data-tip"]).includes("within 2 days of a run")), "and so does each card");
});
