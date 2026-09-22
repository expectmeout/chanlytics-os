/**
 * One "nothing here", one "couldn't read".
 *
 * Thirteen classes said "nothing here", each with its own glyph and colour,
 * and one offered a next step. A read that failed was a Retry card on Setup,
 * a whole-page reload on Team, red text on Activity, silence on Conversations,
 * Today, Broadcasts and Playbooks -- and on Reports one failed read of two
 * failed the whole surface, so the page's own "could not be read" line could
 * never render (the audit's D9). Two primitives now (data-bits.jsx EmptyState
 * and FailedRead), a Retry that re-reads one surface through the runner, and
 * per-read catches in the overrides. Run here: the primitives mounted, the
 * view models' read flags, the Reports override executed against a fake wire
 * with its campaigns read failing, and two pages drawn with a failed part.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { stateOf, toTodayVM, toLiveVM, toReportVM, reportFacts } from "@chanlytics/contracts";

// The workspace's zone: every view model says its times by it (contracts clock.ts).
const ZONE = "America/New_York";

/* ------------------------------ the harness ------------------------------ */

let cells = [];
let seq = 0;
const fresh = () => { cells = []; seq = 0; };
const calls = { nav: [], refresh: [], flash: [] };
globalThis.Icon = "Icon";
globalThis.StatStrip = "StatStrip";
globalThis.StatCell = "StatCell";
globalThis.Sparkline = "Sparkline";
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
  useMemo: (fn) => { const k = seq++; if (!(k in cells)) cells[k] = fn(); return cells[k]; },
  useCallback: (fn) => fn,
  useEffect: (fn) => { const k = seq++; if (!(k in cells)) { cells[k] = true; fn(); } },
};
globalThis.ReactDOM = { createPortal: (node) => node };
globalThis.document = { body: {}, addEventListener() {}, createElement: () => ({ setAttribute() {}, style: {}, classList: { add() {}, remove() {} } }) };
const storage = () => { const m = new Map(); return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: (k) => m.delete(k) }; };
globalThis.localStorage = storage();
globalThis.sessionStorage = storage();
globalThis.window = {
  __chrome: { state: stateOf },
  __refreshSurface: async (key) => { calls.refresh.push(key); },
  CHANLY: { nav: (to) => calls.nav.push(to), R: {} },
  gate: () => ({ "data-gated": "" }),
  location: { pathname: "/w/harbor", hash: "", origin: "https://app.chanlytics.com", assign() {}, replace() {}, reload() {} },
  localStorage: globalThis.localStorage,
  sessionStorage: globalThis.sessionStorage,
  addEventListener() {},
  removeEventListener() {},
  dispatchEvent() {},
  setTimeout: () => 1,
  clearTimeout() {},
};
await import("../../../apps/dashboard/src/legacy/components/data-bits.jsx");
const { EmptyState, FailedRead, MoreMenu, StatePill } = globalThis.window;
Object.assign(globalThis, { EmptyState, FailedRead, MoreMenu, StatePill });
globalThis.window.usePPToast = () => [null, (m) => calls.flash.push(m)];

const walk = (n, fn) => { if (n == null || typeof n !== "object") return; fn(n); for (const k of n.props?.children ?? []) walk(k, fn); if (n.rendered) walk(n.rendered, fn); };
const textOf = (n) => { const out = []; walk(n, (x) => { for (const k of x.props?.children ?? []) if (typeof k === "string" || typeof k === "number") out.push(String(k)); }); return out.join(""); };
const byTestId = (tree, id) => { let hit = null; walk(tree, (n) => { if (!hit && n.props?.["data-testid"] === id) hit = n; }); return hit; };
const byClass = (tree, cls) => { let hit = null; walk(tree, (n) => { if (!hit && typeof n.props?.className === "string" && n.props.className.split(" ").includes(cls)) hit = n; }); return hit; };
const byType = (tree, type) => { let hit = null; walk(tree, (n) => { if (!hit && n.type === type) hit = n; }); return hit; };

/* ------------------------------ EmptyState ------------------------------- */

test("EmptyState: three kinds of the one shape -- a glyph, a title, a line of body, and the next thing to do", () => {
  const page = EmptyState({ kind: "page", glyph: "inbox", title: "Inbox zero", body: "The receptionist is handling everything.", action: { label: "See what it handled", to: "conversations" }, testid: "inbox-empty" });
  assert.equal(page.props.className, "empty empty-page");
  assert.equal(page.props["data-testid"], "inbox-empty");
  assert.equal(byType(page, "Icon").props.size, 24, "a page's glyph is large");
  assert.equal(textOf(byClass(page, "empty-title")), "Inbox zero");
  assert.equal(textOf(byClass(page, "empty-body")), "The receptionist is handling everything.");
  const act = byClass(page, "btn-primary");
  assert.ok(act, "a page's action is the primary button");
  act.props.onClick();
  assert.deepEqual(calls.nav, ["conversations"], "`to` navigates");
  const card = EmptyState({ kind: "card", glyph: "bolt", title: "No playbook yet", action: { label: "New playbook", onClick: () => calls.nav.push("composer"), gate: { "data-gated": "" } } });
  assert.equal(card.props.className, "empty empty-card");
  assert.equal(byType(card, "Icon").props.size, 16);
  const cardAct = byClass(card, "btn");
  assert.equal(cardAct.props["data-gated"], "", "the honesty gate's props ride on the action");
  cardAct.props.onClick();
  assert.equal(calls.nav.at(-1), "composer", "`onClick` runs");
  const line = EmptyState({ kind: "line", title: "Nothing in this period.", action: { label: "Clear filters", onClick() {} }, also: { label: "Later", onClick() {} } });
  assert.equal(line.props.className, "empty empty-line");
  assert.equal(byClass(line, "empty-glyph"), null, "no glyph unless asked");
  const links = []; walk(line, (n) => { if (n.props?.className === "cl-bucket-link") links.push(n); });
  assert.equal(links.length, 2, "a line's actions are links, the second quieter");
  assert.equal(EmptyState({ kind: "line", glyph: "check", tone: "ok", title: "All caught up" }).props.className, "empty empty-line empty-ok", "the green check of nothing to do");
  assert.equal(byClass(EmptyState({ title: "x" }), "empty-acts"), null, "no actions, no row for them");
});

/* ------------------------------ FailedRead ------------------------------- */

test("FailedRead: the alert, what could not be read, that the rest is current, and a Retry that re-reads the surface", () => {
  calls.refresh.length = 0;
  const card = FailedRead({ what: "the campaign numbers", surface: "reports", testid: "chart-campaigns" });
  assert.equal(card.props.className, "empty empty-card empty-failed");
  assert.equal(card.props.role, "status");
  assert.equal(card.props["data-testid"], "chart-campaigns");
  assert.equal(byType(card, "Icon").props.name, "alert");
  assert.equal(textOf(byClass(card, "empty-title")), "Couldn't read the campaign numbers");
  assert.ok(textOf(byClass(card, "empty-body")).includes("Everything else here is current"), textOf(card));
  const retry = byTestId(card, "chart-campaigns-retry");
  assert.ok(retry, "a Retry, named from the card");
  assert.equal(textOf(retry).trim(), "Retry");
  retry.props.onClick();
  assert.deepEqual(calls.refresh, ["reports"], "`surface` re-reads that surface through the runner");
  let own = 0;
  const mine = FailedRead({ what: "this person", why: "could not load this person", onRetry: () => own++, busy: true, testid: "person-failed", retryTestid: "person-retry" });
  assert.ok(textOf(byClass(mine, "empty-body")).startsWith("could not load this person. "), "the reason leads, with its full stop");
  const r2 = byTestId(mine, "person-retry");
  assert.equal(r2.props.disabled, true);
  assert.equal(textOf(r2).trim(), "Retrying…");
  r2.props.onClick();
  assert.equal(own, 1, "`onRetry` wins over the surface");
  assert.deepEqual(calls.refresh, ["reports"]);
  const none = FailedRead({ title: "This workspace's settings can't be read", body: "Chanlytics has to repair it." });
  assert.equal(byClass(none, "empty-acts"), null, "nothing to press when nobody can retry");
  assert.equal(textOf(byClass(none, "empty-title")), "This workspace's settings can't be read");
  const page = FailedRead({ kind: "page", title: "Can't reach your workspace", onRetry() {}, also: { label: "Back to Today", onClick() {} } });
  assert.equal(page.props.className, "empty empty-page empty-failed");
  assert.ok(byClass(page, "btn-primary"), "a page's Retry is primary");
  assert.ok(byClass(page, "btn-ghost"), "and the way out is quiet");
});

/* --------------------------- the read flags ------------------------------ */

const NOW = new Date("2026-08-27T15:00:00Z");
const metrics = (over = {}) => ({
  workspace: { name: "Harbor Moving", timezone: "America/New_York", status: "active" },
  channels: [{ kind: "whatsapp", status: "active", number: "+19177724072" }, { kind: "voice", status: "active", number: "+13083368109" }],
  window: { days: 1, since: "2026-08-27T04:00:00+00:00", since_local: "2026-08-27T00:00:00", now_local: "2026-08-27T11:00:00" },
  now: { escalations_open: 0, oldest_open_escalation_at: null, threads_needing_human: 0, threads_snoozed: 0, threads_awaiting_reply: 0, last_inbound_at: null, last_outbound_at: null },
  period: { messages_in: 0, messages_out_ai: 0, messages_out_you: 0, conversations_active: 0, answered_by_ai: 0, answered_by_you: 0, unanswered_in_window: 0, median_reply_seconds_ai: null, send_failures: 0, escalations_new: 0, escalation_reasons: {}, calls: 0, call_seconds: 0, call_sentiments: {}, calls_voicemail: 0, new_contacts: 0, ...(over.period ?? {}) },
});

test("the view models say when a part could not be read: Today's calls and Live's line are null for 'unknown', never for 'none'", () => {
  assert.equal(toTodayVM(metrics(), [], [], null, NOW).callsRead, false, "the quiet day carries it");
  assert.equal(toTodayVM(metrics(), [], [], [], NOW).callsRead, true);
  const busy = metrics({ period: { messages_in: 3, answered_by_ai: 3, conversations_active: 2 } });
  assert.equal(toTodayVM(busy, [], [], null, NOW).callsRead, false, "and so does a day with traffic");
  assert.equal(toTodayVM(busy, [], [], [], NOW).callsRead, true);
  const unread = toLiveVM([], null, ZONE, NOW);
  const noLine = toLiveVM([], [], ZONE, NOW);
  assert.equal(unread.line, null);
  assert.equal(noLine.line, null, "both have no line to show...");
  assert.equal(unread.lineRead, false, "...but only one of them knows it");
  assert.equal(noLine.lineRead, true);
});

/* ------------------- D9: the Reports override, executed ------------------ */

const day = (d, over = {}) => ({ day: d, messages_in: 0, conversations: 0, answered_ai: 0, answered_you: 0, unanswered: 0, out_ai: 0, out_you: 0, escalations: 0, calls: 0, call_seconds: 0, new_contacts: 0, ...over });
const reportDto = () => ({
  timezone: "America/New_York", days: 7, span_days: 14, today: "2026-09-04",
  series: [...["2026-08-22", "2026-08-23", "2026-08-24", "2026-08-25", "2026-08-26", "2026-08-27", "2026-08-28"].map((d) => day(d, { messages_in: 1, answered_ai: 1, conversations: 1 })),
    day("2026-08-29", { messages_in: 4, conversations: 2, answered_ai: 3, answered_you: 1 }), day("2026-08-30"), day("2026-08-31"), day("2026-09-01"), day("2026-09-02"), day("2026-09-03"), day("2026-09-04")],
  reasons: {}, reply_seconds: [4, 8], sentiments: {}, voicemail: 0,
});
const campaignsDto = () => ({ days: 7, series: [], sources: [], totals: { sent: 0, delivered: 0, read: 0, replied: 0, opted_in: 0, opted_out: 0 } });
const json = (status, body) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
const errors = [];
const realConsoleError = console.error;
console.error = (...a) => { errors.push(a.map(String).join(" ")); };
const { reportsOverride } = await import("../../../apps/dashboard/src/legacy-bridge/surface-data.ts");
console.error = realConsoleError;

test("REGRESSION (D9): a campaigns read that fails leaves the report standing with campaigns null -- it used to fail the whole surface, and the page went blank", async () => {
  const hits = [];
  globalThis.window.fetch = async (url) => {
    hits.push(url);
    if (url.includes("/reports/campaigns")) return json(500, { ok: false, error: { code: "internal", message: "boom" } });
    if (url.includes("/reports")) return json(200, { ok: true, data: { report: reportDto(), booking: { calendar: "none", days: 7, asked: 0, booked: 0 } } });
    return json(404, { ok: false, error: { code: "not_found", message: "no" } });
  };
  errors.length = 0;
  console.error = (...a) => { errors.push(a.map(String).join(" ")); };
  try {
    await reportsOverride.apply();
  } finally {
    console.error = realConsoleError;
  }
  const R = globalThis.window.__REPORTS;
  assert.ok(R && R.vm, "the receptionist's own numbers are published");
  assert.equal(R.campaigns, null, "the offers' numbers are their own state: unread");
  assert.ok(hits.some((u) => u.includes("/reports/campaigns")), "the campaigns read was made");
  assert.ok(errors.some((e) => e.includes("reports_campaigns_fetch_failed")), "and logged by name");
});

test("both reads good: the campaigns are published; the report read failing fails the surface, as it should", async () => {
  globalThis.window.fetch = async (url) => {
    if (url.includes("/reports/campaigns")) return json(200, { ok: true, data: { report: campaignsDto() } });
    if (url.includes("/reports")) return json(200, { ok: true, data: { report: reportDto(), booking: { calendar: "none", days: 7, asked: 0, booked: 0 } } });
    return json(404, { ok: false, error: { code: "not_found", message: "no" } });
  };
  await reportsOverride.apply();
  assert.ok(globalThis.window.__REPORTS.campaigns, "read, so published");
  globalThis.window.fetch = async (url) => {
    if (url.includes("/reports/campaigns")) return json(200, { ok: true, data: { report: campaignsDto() } });
    return json(500, { ok: false, error: { code: "internal", message: "down" } });
  };
  await assert.rejects(() => reportsOverride.apply(), (e) => e && e.code === "internal", "without the report there is no page to show; the shell says so");
});

test("Worth knowing is published beside the numbers it is drawn from, once, by the bridge", async () => {
  globalThis.window.fetch = async (url) => {
    if (url.includes("/reports/campaigns")) return json(200, { ok: true, data: { report: campaignsDto() } });
    if (url.includes("/reports")) return json(200, { ok: true, data: { report: reportDto(), booking: { calendar: "none", days: 7, asked: 0, booked: 0 } } });
    return json(404, { ok: false, error: { code: "not_found", message: "no" } });
  };
  await reportsOverride.apply();
  const R = globalThis.window.__REPORTS;
  assert.deepEqual(R.facts.map((f) => f.id), ["busiest"], "a Saturday of four messages: nothing unanswered, nobody handed over");
  assert.equal(R.facts[0].text, "Saturday was your busiest day");
  assert.deepEqual(R.facts, reportFacts(R.vm, R.campaigns), "contracts' facts, from the same two view models the page draws");
});

/* -------------------- Settings › Team, with a failed read ---------------- */

Object.assign(globalThis.window, {
  __ME: { email: "ruben@rjcapital.io", role: "owner" },
  __SETTINGS: { role: "owner" },
  __TEAM: null,
  __TEAM_INVITES: null,
  __identity: { member: ({ email, display_name }) => ({ name: display_name || email, sub: display_name ? email : null }), initials: (n, e) => String(n || e).slice(0, 2).toUpperCase() },
  __inviteState: () => ({ expired: false, words: "invite pending" }),
  __teamRemove: async () => ({ ok: true, data: {} }),
  __teamSetRole: async () => ({ ok: true }),
  __teamInvite: async () => ({ ok: true }),
});
await import("../../../apps/dashboard/src/legacy/pages/settings.jsx");
const TeamSection = globalThis.window.TeamSection;

test("a team that could not be read draws the one FailedRead, and its Retry re-reads the settings surface -- not the whole page", () => {
  fresh();
  calls.refresh.length = 0;
  const tree = TeamSection({ flash: (m) => calls.flash.push(m) });
  const card = byTestId(tree, "team-failed");
  assert.ok(card, "REGRESSION: the card that offered a page reload");
  assert.equal(textOf(byClass(card, "empty-title")), "Couldn't read your team");
  assert.ok(textOf(card).includes("only the member list failed to load"));
  assert.equal(byType(tree, MoreMenu), null, "no seeded strangers with menus");
  byTestId(tree, "team-failed-retry").props.onClick();
  assert.deepEqual(calls.refresh, ["settings"]);
});

test("a period the page has read paints at once when picked again and is read again behind; an answer for a period left is dropped", async () => {
  // The loading standard's held views on Reports: the page held one period, so going back to one it had shown was a
  // read of its own, and the old period stayed dimmed under the new tab until it landed.
  const { startSurfaces } = await import("../../../apps/dashboard/src/legacy-bridge/surface-runner.ts");
  const { setReportRange } = await import("../../../apps/dashboard/src/legacy-bridge/inbox-verbs.ts");
  const parked = [];
  const asked = [];
  globalThis.window.fetch = async (url) => {
    const u = new URL(String(url), "https://app.chanlytics.com");
    asked.push(`${u.pathname.replace("/api/v1/", "")} ${u.searchParams.get("days")}`);
    await new Promise((r) => parked.push({ days: u.searchParams.get("days"), r }));
    if (u.pathname.endsWith("/reports/campaigns")) return json(200, { ok: true, data: { report: campaignsDto() } });
    return json(200, { ok: true, data: { report: reportDto(), booking: { calendar: "none", days: 7, asked: 0, booked: 0 } } });
  };
  const keepDoc = globalThis.document;
  globalThis.document = { visibilityState: "hidden", addEventListener() {}, removeEventListener() {} };
  const pause = () => new Promise((r) => setTimeout(r, 5));
  // Let parked answers go -- only those for `days` when named -- so a test can say which lands first.
  const release = async (days = null) => {
    for (let i = 0; i < 40; i += 1) {
      for (const p of [...parked]) if (days === null || p.days === days) { parked.splice(parked.indexOf(p), 1); p.r(); }
      await pause();
    }
  };
  const shown = () => globalThis.window.__REPORTS?.days;
  // A runner to refresh through (setReportRange reads the real surface through it); this one joins no live feed.
  const stop = startSurfaces([{ ...reportsOverride, refreshOnMessageInserts: false }]);
  try {
    await release();
    assert.equal(shown(), 30, "the saved period, read at boot");
    const to7 = setReportRange(7);
    await release();
    assert.equal(await to7, true);
    assert.equal(shown(), 7);
    // Back to 30: held, painted before any read lands, and read again behind.
    asked.length = 0;
    let back = null;
    setReportRange(30).then((ok) => { back = ok; });
    await pause();
    assert.equal(shown(), 30, "REGRESSION: the period the page had shown waited on a read of its own");
    assert.equal(back, true, "the pick answered at once");
    assert.ok(asked.includes("reports 30"), "and 30 is read again behind");
    // A pick while that read is out: 90 lands first, then 30's refresh -- a late answer for a period left, which must
    // never land on the new one.
    const to90 = setReportRange(90);
    await release("90");
    await to90;
    assert.equal(shown(), 90);
    await release("30");
    assert.equal(shown(), 90, "REGRESSION: 30's refresh landed last and put the old period back over 90");
  } finally {
    stop();
    await release();
    globalThis.document = keepDoc;
  }
});
