/**
 * The Inbox keeps your place, and says what changed.
 *
 * On a real workspace the Inbox is read again whenever anything moves -- a message, any verb,
 * a tab coming back into focus -- and each re-read reseeded the page in silence:
 * - when the open thread left its bucket (a teammate handed it back, it was archived or snoozed
 *   from another tab), the pane fell to the first thread in the list: another customer opened in
 *   its place, and a half-written reply went with the old pane;
 * - a failed read of the approved templates stored [], so every closed-window thread said "No
 *   approved template yet" when the truth was that the list could not be read (the wiring
 *   audit's A15);
 * - Archive existed only as a bulk action behind a hover checkbox, and an archived thread then
 *   read "Answered by the receptionist -- no one asked for you" (A11).
 * Run against the contracts, the bridge over a fake wire, and the pages on a stub React.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { toInboxThreadVM, stateOf, memberWords } from "@chanlytics/contracts";

const ZONE = "America/New_York";
const NOW = new Date("2026-09-14T14:00:00Z");
const ago = (min) => new Date(NOW.getTime() - min * 60_000).toISOString();
const rosa = { id: "p1", display_name: "Rosa Díaz", wa_profile_name: null, phone_e164: "+16465550123", consent: "opted_in", dnc: false };
const wrote = (id, body, min) => ({ id, direction: "inbound", sender: "customer", type: "text", body, media: null, meta: null, status: "received", created_at: ago(min), channel_ts: ago(min) });
const conv = (over = {}) => ({
  id: "c1", state: "needs_human", paused_until: null, snooze_until: null,
  assignee_user_id: null, assignee_is_me: false,
  last_wa_inbound_at: ago(40), last_message_at: ago(40),
  contact: rosa,
  messages: [wrote("m1", "Can I move my appointment to Friday?", 40)],
  ...over,
});
const asked = (over = {}) => ({ id: "e1", reason: "human_token", details: null, state: "open", created_at: ago(40), ...over });

/* -------------------------------- a browser -------------------------------- */

const listeners = {};
globalThis.window = {
  location: { pathname: "/w/melanys", hash: "", origin: "https://app.chanlytics.com", assign() {}, replace() {}, reload() {} },
  localStorage: globalThis.localStorage,
  sessionStorage: globalThis.sessionStorage,
  __WORKSPACES: [{ id: "t1", slug: "melanys", name: "Melany's Beauty Salon", status: "active", timezone: ZONE }],
  __ACTIVE_WORKSPACE: "t1",
  __chrome: { state: stateOf },
  __identity: { member: memberWords },
  CHANLY: { nav() {}, R: {}, IX_NOW: "12:04", CONF: { SAFE: 0.8, MED: 0.5 } },
  __surfaceState: () => "live",
  __DEMO_MODE: false,
  addEventListener: (type, fn) => { (listeners[type] ||= []).push(fn); },
  removeEventListener() {},
  dispatchEvent() {},
  setTimeout: () => 1,
  clearTimeout() {},
  setInterval: () => 1,
  clearInterval() {},
};
const json = (status, body) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
const quiet = async (fn) => { const e = console.error; console.error = () => {}; try { return await fn(); } finally { console.error = e; } };

/* ------------------- the templates read, and what it leaves ------------------- */

const { inboxOverride } = await quiet(() => import("../../../apps/dashboard/src/legacy-bridge/surface-data.ts"));

test("REGRESSION (A15): a templates read that fails leaves null -- 'could not read' -- where it left [], 'none approved'", async () => {
  globalThis.window.fetch = async (url) => {
    const path = new URL(String(url), "https://app.chanlytics.com").pathname;
    if (path === "/api/v1/templates") return json(500, { ok: false, error: { code: "internal", message: "down" } });
    if (path === "/api/v1/conversations") return json(200, { ok: true, data: { conversations: [conv()] } });
    if (path === "/api/v1/escalations") return json(200, { ok: true, data: { escalations: [] } });
    if (path === "/api/v1/workspaces") return json(200, { ok: true, data: { workspaces: globalThis.window.__WORKSPACES, activeWorkspaceId: "t1" } });
    return json(404, { ok: false, error: { code: "not_found", message: path } });
  };
  await quiet(() => inboxOverride.apply());
  assert.equal(globalThis.window.__TEMPLATES, null, "REGRESSION: a failed read stored [] and the page said no template was approved");
  assert.equal(globalThis.window.INBOX_DATA.THREADS.length, 1, "the Inbox itself still reads");
});

/* ------------------------------ the pages, drawn ------------------------------ */

let cells = [];
let seq = 0;
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
  useMemo: (fn) => { const k = seq++; if (!(k in cells)) cells[k] = fn(); return cells[k]; },
  useEffect: (fn) => { const k = seq++; if (!(k in cells)) { cells[k] = true; fn(); } },
  useCallback: (fn) => fn,
};
globalThis.ReactDOM = { createPortal: (node) => node };
globalThis.document = { body: { appendChild() {} }, addEventListener() {}, removeEventListener() {}, createElement: () => ({ setAttribute() {}, style: {}, classList: { add() {}, remove() {}, contains: () => false } }) };
await import("../../../apps/dashboard/src/legacy/components/data-bits.jsx");
for (const k of ["StatePill", "MoreMenu", "EmptyState", "PolicyChip", "TlMedia", "FailedRead", "Confirm", "usePPToast", "useHotkey"]) globalThis[k] = globalThis.window[k];
await import("../../../apps/dashboard/src/legacy/pages/inbox-list.jsx");
globalThis.ConfidenceDots = globalThis.window.ConfidenceDots;
await import("../../../apps/dashboard/src/legacy/pages/inbox-thread.jsx");
const { InboxThread, InboxComposer } = globalThis.window;
const RealInboxThread = InboxThread;
await import("../../../apps/dashboard/src/legacy/pages/inbox.jsx");

const walk = (n, fn) => {
  if (n == null || typeof n !== "object") return;
  if (Array.isArray(n)) { for (const k of n) walk(k, fn); return; }
  fn(n);
  walk(n.props?.children, fn);
  walk(n.rendered, fn);
};
const find = (tree, pred) => { let hit; walk(tree, (n) => { if (hit === undefined && pred(n)) hit = n; }); return hit; };
const byTestId = (id) => (n) => n.props?.["data-testid"] === id;
const textOf = (n) => {
  if (n == null || typeof n === "boolean") return "";
  if (typeof n === "string" || typeof n === "number") return String(n);
  if (Array.isArray(n)) return n.map(textOf).join("");
  return n.rendered !== undefined ? textOf(n.rendered) : textOf(n.props?.children);
};
const click = { stopPropagation() {}, preventDefault() {} };

test("what changed on the open thread while you had it open, in one line -- and nothing when nothing did", () => {
  const say = globalThis.window.ixRepaintNotice;
  assert.equal(typeof say, "function", "the words are one rule that can be run");
  const was = { id: "th-1", real: true, who: "Rosa Díaz", state: "escalated", takenOver: false, claimedByOther: false, archived: false, lastAtMs: 1000, timeline: [{ type: "msg", from: "client" }] };
  assert.equal(say(was, { ...was }), null);
  assert.equal(say(was, { ...was, lastAtMs: 2000, timeline: [...was.timeline, { type: "msg", from: "client" }] }), "Rosa Díaz wrote again");
  assert.equal(say(was, { ...was, lastAtMs: 2000, timeline: [...was.timeline, { type: "msg", from: "agent" }] }), "The receptionist replied");
  assert.equal(say(was, { ...was, state: "done" }), "Moved to Handled");
  assert.equal(say(was, { ...was, state: "done", archived: true }), "Archived");
  assert.equal(say(was, { ...was, state: "snoozed", wake: "Tue 10:00 AM" }), "Snoozed until Tue 10:00 AM");
  assert.equal(say({ ...was, state: "snoozed" }, { ...was }), "Back in Needs you");
  assert.equal(say(was, { ...was, claimedByOther: true }, "Ana García"), "Ana García took this conversation");
});

test("REGRESSION: a re-read that moves the open thread out of its bucket keeps it open, says what happened, and opens nobody else in its place", () => {
  const drawn = [];
  let select = null;
  globalThis.InboxList = (p) => { select = p.onSelectThread; return null; };
  globalThis.InboxThread = (p) => { drawn.push({ id: p.thread ? p.thread.id : null, notice: p.notice ?? null }); return null; };
  globalThis.InboxAgentRail = () => null;
  globalThis.window.VW_UTIL = { seed() {}, remaining: () => null };
  const open = { id: "th-rosa", real: true, who: "Rosa Díaz", state: "escalated", needsYou: true, takenOver: false, claimedByOther: false, archived: false, tags: [], whoMeta: "", lastAtMs: 1000, timeline: [] };
  const other = { ...open, id: "th-nina", who: "Nina Park" };
  const fresh = () => {
    cells = [];
    drawn.length = 0;
    for (const k of Object.keys(listeners)) delete listeners[k];
    globalThis.window.INBOX_DATA = { INBOX_BUCKETS: [], INBOX_VIEWS: [], CHANNEL_LABELS: {}, INBOX_BASELINE: {}, THREADS: [other, open] };
  };
  const render = (initialThreadId = null) => { seq = 0; return globalThis.window.Inbox({ initialThreadId, showAgentRail: false }); };
  // A teammate handed Rosa back: the next read has her in Handled.
  const handBack = () => {
    globalThis.window.INBOX_DATA = { ...globalThis.window.INBOX_DATA, THREADS: [other, { ...open, state: "done", needsYou: false }] };
    for (const fn of listeners["surface:inbox"] ?? []) fn();
  };

  // Opened by a click.
  fresh();
  render();
  select("th-rosa");
  render();
  assert.equal(drawn.at(-1).id, "th-rosa", "Rosa is open");
  const before = drawn.length;
  handBack();
  render();
  assert.ok(drawn.length > before, "the pane is drawn again after the re-read");
  assert.equal(drawn.at(-1).id, "th-rosa", "REGRESSION: Nina Park's thread opened in Rosa's place, and the reply half-written to Rosa went with the old pane");
  assert.equal(drawn.at(-1).notice, "Moved to Handled", "and the pane says what happened");

  // Opened from a link: the same, not "isn't among the newest" over a thread the Inbox holds.
  fresh();
  render("th-rosa");
  assert.equal(drawn.at(-1).id, "th-rosa");
  const linkedBefore = drawn.length;
  handBack();
  const linked = render("th-rosa");
  assert.equal(find(linked, byTestId("inbox-missing-thread")), undefined, "REGRESSION: a thread the Inbox had just read said it was not among the newest");
  assert.ok(drawn.length > linkedBefore, "the pane is drawn again after the re-read");
  assert.equal(drawn.at(-1).id, "th-rosa");
  assert.equal(drawn.at(-1).notice, "Moved to Handled");
  globalThis.InboxThread = RealInboxThread;
});

test("your own act moves the open thread without a notice about it: its toast has already said so", async () => {
  const drawn = [];
  globalThis.InboxList = () => null;
  globalThis.InboxThread = (p) => { drawn.push({ id: p.thread ? p.thread.id : null, notice: p.notice ?? null, onArchive: p.onArchive }); return null; };
  globalThis.InboxAgentRail = () => null;
  globalThis.window.VW_UTIL = { seed() {}, remaining: () => null };
  const open = { id: "th-rosa", real: true, who: "Rosa Díaz", conversationId: "c1", state: "escalated", needsYou: true, takenOver: false, claimedByOther: false, archived: false, tags: [], whoMeta: "", lastAtMs: 1000, timeline: [] };
  const other = { ...open, id: "th-nina", who: "Nina Park", conversationId: "c2" };
  cells = [];
  for (const k of Object.keys(listeners)) delete listeners[k];
  globalThis.window.INBOX_DATA = { INBOX_BUCKETS: [], INBOX_VIEWS: [], CHANNEL_LABELS: {}, INBOX_BASELINE: {}, THREADS: [other, open] };
  const render = () => { seq = 0; return globalThis.window.Inbox({ initialThreadId: "th-rosa", showAgentRail: false }); };
  render();
  // The verb's own re-read lands before it answers, the way client/api.ts refreshes after a write.
  globalThis.window.__inboxVerb = async () => {
    globalThis.window.INBOX_DATA = { ...globalThis.window.INBOX_DATA, THREADS: [other, { ...open, state: "done", needsYou: false, archived: true }] };
    for (const fn of listeners["surface:inbox"] ?? []) fn();
    return { ok: true, data: {} };
  };
  try {
    drawn.at(-1).onArchive("th-rosa");
    await new Promise((r) => setTimeout(r, 0));
    render();
    assert.equal(drawn.at(-1).id, "th-rosa", "the thread you archived stays in front of you");
    assert.equal(drawn.at(-1).notice, null, "and the pane does not announce your own act to you");
  } finally {
    delete globalThis.window.__inboxVerb;
    globalThis.InboxThread = RealInboxThread;
  }
});

test("REGRESSION (A15): the template send says when the list could not be read, with a way to read it again -- not that none is approved", () => {
  const closed = { id: "th-1", real: true, who: "Rosa Díaz", primaryChannel: "whatsapp", hasChat: true, windowOpen: false, optedOut: false };
  const draw = () => { cells = []; seq = 0; return InboxComposer({ thread: closed, reply: "" }); };
  globalThis.window.__TEMPLATES = undefined;
  assert.match(textOf(draw()), /Checking which templates are approved…/, "still reading");
  globalThis.window.__TEMPLATES = null;
  const failed = draw();
  const line = find(failed, byTestId("ix-tpl-failed"));
  assert.ok(line, "REGRESSION: a failed read said no template was approved");
  assert.match(textOf(line), /Couldn't read your approved templates/);
  assert.ok(!textOf(failed).includes("No approved template yet"));
  globalThis.window.__TEMPLATES = [];
  assert.match(textOf(draw()), /No approved template yet/, "an empty list is still the empty answer");
});

test("REGRESSION (A11): an archived thread says it was archived, not that nobody asked for you", () => {
  const vm = toInboxThreadVM(conv({ state: "archived" }), null, ZONE, NOW);
  assert.deepEqual([vm.state, vm.archived], ["done", true]);
  cells = []; seq = 0;
  const tree = InboxThread({ thread: vm, channelLabels: { whatsapp: "WhatsApp", phone: "Phone" } });
  assert.match(textOf(find(tree, byTestId("ix-archived"))), /Archived — their request is closed\. If they write again, it comes back\./);
  assert.ok(!textOf(tree).includes("no one asked for you"));
  assert.equal(toInboxThreadVM(conv({ state: "open" }), null, ZONE, NOW).archived, false);
});

test("REGRESSION (A11): Archive is in the open thread's menu, asks first, and says what it does", () => {
  const vm = toInboxThreadVM(conv(), asked(), ZONE, NOW);
  let archived = null;
  const props = { thread: vm, channelLabels: { whatsapp: "WhatsApp", phone: "Phone" }, onArchive: (id) => { archived = id; } };
  cells = []; seq = 0;
  let tree = InboxThread(props);
  const trigger = find(tree, (n) => n.type === "button" && n.props?.["aria-haspopup"] === "menu");
  trigger.props.onClick(click);
  seq = 0; tree = InboxThread(props);
  const item = find(tree, (n) => n.props?.role === "menuitem" && textOf(n).includes("Archive"));
  assert.ok(item, "REGRESSION: Archive lived only in the bulk bar");
  item.props.onClick(click);
  seq = 0; tree = InboxThread(props);
  const ask = find(tree, byTestId("ix-archive-confirm"));
  assert.ok(ask, "it asks first: archiving closes the request");
  assert.match(textOf(ask), /Archive Rosa Díaz's conversation\?/);
  assert.match(textOf(ask), /It leaves the Inbox and their request is closed\. If they write again, it comes back\./);
  assert.equal(archived, null, "nothing is archived by opening the question");
  find(tree, byTestId("ix-archive-yes")).props.onClick(click);
  assert.equal(archived, vm.id);
});
