/**
 * Conversations: the doors to a record and the words about who wrote what.
 *
 * - A WhatsApp transcript had no way into its Inbox thread: the view model carried no thread id, so
 *   "View thread in Inbox" never drew (the wiring audit's A7).
 * - "Answered by the receptionist" sat on threads a person or a broadcast answered, and on ones where
 *   the customer spoke last; the pill said "Receptionist replied" over all of them (A9).
 * - The bubbles did not say who wrote them, where the Inbox did -- and the Inbox said "by you" for
 *   every teammate's reply (A23).
 * - One failed recording read disabled Play for good, and the read was a bare fetch that named no
 *   workspace (A14).
 * - A new workspace said "No conversations match this channel" and "Pick one on the left" beside an
 *   empty list (A22).
 * - A link to a conversation not in view put its notice in a grid cell of its own (A26).
 * Run against the contracts and the pages on a stub React.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { toConversationVM, toInboxThreadVM, toCallVM, stateOf, memberWords } from "@chanlytics/contracts";

const ZONE = "America/New_York";
const NOW = new Date("2026-09-14T14:00:00Z");

const msg = (over = {}) => ({
  id: "m", direction: "inbound", sender: "customer", type: "text",
  body: "Do you have Friday?", media: null, meta: null, status: "received",
  created_at: "2026-09-14T13:00:00Z", ...over,
});
const ours = (over = {}) => msg({ id: "m2", direction: "outbound", sender: "ai", body: "Yes, 3pm works.", status: "sent", created_at: "2026-09-14T13:01:00Z", ...over });
const conv = (messages, over = {}) => ({
  id: "c1", state: "open", paused_until: null, snooze_until: null, assignee_user_id: null, assignee_is_me: false,
  last_wa_inbound_at: "2026-09-14T13:00:00Z", last_message_at: "2026-09-14T13:01:00Z",
  contact: { id: "k1", display_name: "Rosa Díaz", wa_profile_name: null, phone_e164: "+13475550101", consent: "opted_in", dnc: false },
  messages, ...over,
});
// A call as the calls route returns it (the-pages-say-only-what-is-true.test.mjs), with its audio stored.
const call = (over = {}) => ({
  id: "k7", retell_call_id: "r-k7", direction: "inbound", call_type: "phone_call", status: "ended",
  from_e164: "+19175550106", from_raw: null, to_e164: "+13083368109",
  started_at: "2026-09-14T13:00:00Z", ended_at: "2026-09-14T13:03:10Z", duration_ms: 190_000,
  disconnection_reason: "agent_hangup", sentiment: "Positive", call_successful: true, in_voicemail: false,
  summary: "The caller asked about a bridal trial.", transcript_object: null,
  recording: { fetch_state: "stored", mime: "audio/mpeg", bytes: 48_000 },
  conversation_id: "cv7", contact_id: "c7", message_id: "m7",
  contact: { display_name: "Emily Chen", wa_profile_name: null, phone_e164: "+19175550106" },
  wanted: "Wants to book a bridal trial on October 3", outcome: null, follow_up: null, caller_name: "Emily",
  ...over,
});

/* -------------------------------- the view model -------------------------------- */

test("REGRESSION (A7, A9, A23): a chat row opens its Inbox thread, each of our messages says who sent it, and the summary says who answered last", () => {
  const row = (...messages) => toConversationVM(conv(messages), ZONE, NOW);

  const ai = row(msg({ id: "m1" }), ours());
  assert.equal(ai.threadId, "th-c1", "REGRESSION: the row carried no thread id, so 'View thread in Inbox' never drew");
  assert.deepEqual(ai.messages.map((m) => m.by ?? null), [null, "the receptionist"], "the customer's own words are signed by nobody");
  assert.deepEqual([ai.answeredBy, ai.summary.bullets[1]], ["receptionist", "Answered by the receptionist"]);

  const team = row(msg({ id: "m1" }), ours({ sender: "human", body: "See you Friday!" }));
  assert.deepEqual([team.messages[1].by, team.answeredBy, team.summary.bullets[1]], ["your team", "team", "Answered by your team"], "REGRESSION: a person's reply read 'Answered by the receptionist'");

  const broadcast = row(msg({ id: "m1" }), ours({ sender: "human", body: "20% off this week", status: "delivered", meta: { source: "broadcast", broadcast_name: "Spring offer" } }));
  assert.deepEqual([broadcast.messages[1].by, broadcast.answeredBy, broadcast.summary.bullets[1]], ["a broadcast (Spring offer)", "broadcast", "Last message: a broadcast (Spring offer)"]);

  const playbook = row(msg({ id: "m1" }), ours({ sender: "human", body: "We miss you", status: "delivered", meta: { source: "broadcast", playbook_name: "Win-back" } }));
  assert.deepEqual([playbook.messages[1].by, playbook.answeredBy, playbook.summary.bullets[1]], ["the Win-back playbook", "playbook", "Last message: the Win-back playbook"]);

  const theirs = row(ours({ id: "m0", body: "Hi Rosa!", created_at: "2026-09-14T12:59:00Z" }), msg({ id: "m1" }));
  assert.deepEqual([theirs.answeredBy, theirs.summary.bullets[1]], [null, "They wrote last — no reply yet"], "REGRESSION: a customer waiting on a reply read 'Answered by the receptionist'");

  const paused = toConversationVM(conv([msg({ id: "m1" }), ours()], { state: "needs_human" }), ZONE, NOW);
  assert.equal(paused.summary.bullets[1], "Receptionist paused — a human has this thread", "a thread a person has keeps its sentence");
});

/* ------------------------------ the pages, drawn ------------------------------ */

const went = [];
globalThis.window = {
  location: { pathname: "/w/melanys", hash: "", origin: "https://app.chanlytics.com", assign() {}, replace() {}, reload() {} },
  __WORKSPACES: [{ id: "t1", slug: "melanys", name: "Melany's Beauty Salon", status: "active", timezone: ZONE }],
  __ACTIVE_WORKSPACE: "t1",
  __chrome: { state: stateOf },
  __identity: { member: memberWords },
  CHANLY: { nav: (to) => went.push(to), R: { client: (id) => `clients/${id}`, thread: (id) => `inbox/${id}` }, IX_NOW: "12:04", CONF: { SAFE: 0.8, MED: 0.5 } },
  __surfaceState: () => "live",
  __DEMO_MODE: false,
  addEventListener() {},
  removeEventListener() {},
  dispatchEvent() { return true; },
  setTimeout: () => 1,
  clearTimeout() {},
  setInterval: () => 1,
  clearInterval() {},
};
globalThis.document = { body: { appendChild() {} }, addEventListener() {}, removeEventListener() {}, createElement: () => ({ setAttribute() {}, style: {}, classList: { add() {}, remove() {}, contains: () => false } }) };

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
  // Worked out again on every draw: the page filters its list in a memo keyed on the search.
  useMemo: (fn) => fn(),
  useEffect: (fn) => { const k = seq++; if (!(k in cells)) { cells[k] = true; fn(); } },
  useCallback: (fn) => fn,
};
globalThis.ReactDOM = { createPortal: (node) => node };
await import("../../../apps/dashboard/src/legacy/components/data-bits.jsx");
for (const k of ["StatePill", "MoreMenu", "EmptyState", "PolicyChip", "TlMedia", "FailedRead", "Confirm", "usePPToast", "useHotkey"]) globalThis[k] = globalThis.window[k];
await import("../../../apps/dashboard/src/legacy/pages/inbox-list.jsx");
globalThis.ConfidenceDots = globalThis.window.ConfidenceDots;
await import("../../../apps/dashboard/src/legacy/pages/inbox-thread.jsx");
// The one thread, which Conversations mounts for a conversation row (thread-pane.jsx).
await import("../../../apps/dashboard/src/legacy/pages/thread-pane.jsx");
globalThis.InboxThread = globalThis.window.InboxThread;
globalThis.ThreadPane = globalThis.window.ThreadPane;
globalThis.ThreadCall = globalThis.window.ThreadCall;
await import("../../../apps/dashboard/src/legacy/pages/conversations.jsx");
const { InboxThread, ConversationsPage, OutcomePill } = globalThis.window;

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
const withRows = (rows) => { globalThis.window.CONVERSATIONS_DATA = { CONVERSATIONS: rows, CV_CHANNELS: [{ id: "all", label: "All" }], CALLS_READ: true }; };
const page = (props = {}) => { seq = 0; return ConversationsPage({ channel: "all", initialId: null, ...props }); };

test("REGRESSION (A23): the Inbox says the same author as Conversations -- a person's reply is your team's, not 'you' for every teammate", () => {
  const vm = toInboxThreadVM(conv([msg({ id: "m1" }), ours({ sender: "human", body: "See you Friday!" })]), null, ZONE, NOW);
  cells = []; seq = 0;
  const tree = InboxThread({ thread: vm, channelLabels: { whatsapp: "WhatsApp", phone: "Phone" } });
  // The author, not the punctuation after it: the separator used to lead into a repeat of the
  // time that already sits over the bubble, and no longer exists. "by you" must still not match
  // "by your team", so the boundary is explicit.
  assert.match(textOf(tree), /by your team/);
  assert.doesNotMatch(textOf(tree), /by you(?!r)/, "REGRESSION: every teammate's reply read 'by you'");
});

test("REGRESSION (A7, A9, A23): Conversations says who answered, signs our messages, and IS the Inbox's thread -- not a door to it", () => {
  const team = toConversationVM(conv([msg({ id: "m1" }), ours({ sender: "human", body: "See you Friday!" })]), ZONE, NOW);
  cells = []; seq = 0;
  assert.equal(textOf(OutcomePill({ outcome: team.outcome, channel: team.channel, answeredBy: team.answeredBy })), "Your team replied", "REGRESSION: 'Receptionist replied' over a person's reply");
  assert.equal(textOf(OutcomePill({ outcome: "handled", channel: "whatsapp", answeredBy: "receptionist" })), "Receptionist replied");
  assert.equal(textOf(OutcomePill({ outcome: "handled", channel: "phone" })), "Receptionist handled it", "a call keeps its own words");
  // A chat's way into its Inbox thread (A7) is now that it is that thread: the pane beside the list is the one thread
  // (thread-pane.jsx), which answers, takes over and hands back here. The door to a second screen is gone with it.
  globalThis.window.INBOX_DATA = { THREADS: [toInboxThreadVM(conv([msg({ id: "m1" }), ours({ sender: "human", body: "See you Friday!" })]), null, ZONE, NOW)], CHANNEL_LABELS: { whatsapp: "WhatsApp" } };
  try {
    withRows([team]);
    cells = [];
    const tree = page();
    assert.match(textOf(tree), /by your team/, "REGRESSION: a bubble did not say who wrote it");
    const thread = find(tree, (n) => n.type === InboxThread);
    assert.ok(thread, "REGRESSION: a chat had no way into its Inbox thread");
    assert.equal(thread.props.thread.id, "th-c1", "the row's own thread");
    assert.equal(find(tree, (n) => n.type === "button" && textOf(n).includes("View thread in Inbox")), undefined, "one thread, not a door to a second screen");
  } finally {
    delete globalThis.window.INBOX_DATA;
  }
});

test("REGRESSION (A22): a new workspace's Conversations says there are none yet -- not that nothing matches a channel, nor to pick one on the left of an empty list", () => {
  withRows([]);
  cells = [];
  const none = page();
  assert.ok(!textOf(none).includes("No conversations match"), "REGRESSION: an empty workspace read as a filter with no match");
  assert.ok(!textOf(none).includes("Pick one on the left"), "REGRESSION: it pointed at a list with nothing in it");
  assert.match(textOf(find(none, byTestId("cv-none"))), /No conversations yet\./);
  const pane = find(none, byTestId("cv-none-pane"));
  assert.match(textOf(pane), /Every WhatsApp chat and phone call with a customer lands here/);
  const setup = find(pane, (n) => n.type === "button" && textOf(n).includes("Open Setup"));
  setup.props.onClick();
  assert.equal(went.at(-1), "admin/setup");

  withRows([toConversationVM(conv([msg({ id: "m1" }), ours()]), ZONE, NOW)]);
  cells = [];
  find(page(), (n) => n.type === "input" && String(n.props?.placeholder || "").startsWith("Search names")).props.onChange({ target: { value: "zzz" } });
  const searched = page();
  assert.ok(!textOf(searched).includes("Pick one on the left"));
  assert.match(textOf(searched), /Nothing matches your search/);
});

test("REGRESSION (A26): a link to a conversation not in view says so inside the reading pane, not in a grid cell of its own -- and opens nobody else's", () => {
  withRows([toConversationVM(conv([msg({ id: "m1" }), ours()]), ZONE, NOW)]);
  cells = [];
  const tree = page({ initialId: "c-gone" });
  const kids = tree.props.children.filter((k) => k && typeof k === "object");
  assert.equal(kids.length, 2, "REGRESSION: the notice was a third child of a two-column grid");
  const pane = kids[1];
  assert.equal(pane.props.testid, "cv-missing-thread", "the reading pane, the grid's second cell, is the notice");
  assert.match(textOf(pane), /Conversations shows the newest 1\. Open the person in People to find this one/);
  // The first row used to open beside the notice, read-only; with the one thread it would be another customer's reply box.
  assert.equal(find(tree, (n) => n.type === InboxThread), undefined, "REGRESSION: someone else's conversation opened in its place");
});

test("REGRESSION: a search that stops matching the open conversation keeps it open -- never the first match, another customer's", () => {
  // The pane was `visible.find(open) || visible[0]`: typing a word Rosa's conversation does not hold opened Nina's
  // thread beside the box, with its reply composer, and said nothing.
  const rosa = conv([msg({ id: "m1" }), ours()]);
  const nina = conv([msg({ id: "m3", body: "Do you do gel nails?" })], { id: "c2", contact: { id: "k2", display_name: "Nina Park", wa_profile_name: null, phone_e164: "+13475550102", consent: "opted_in", dnc: false } });
  globalThis.window.INBOX_DATA = { THREADS: [nina, rosa].map((c) => toInboxThreadVM(c, null, ZONE, NOW)), CHANNEL_LABELS: { whatsapp: "WhatsApp" } };
  // The pane's own drawing is the one thread's (one-thread.test.mjs); here only which thread it was handed. The stub
  // React keys hooks by call order, and a list that shrinks under the real composer would shift its cells.
  const opened = [];
  globalThis.InboxThread = (p) => { opened.push(p.thread ? p.thread.id : null); return null; };
  try {
    withRows([toConversationVM(nina, ZONE, NOW), toConversationVM(rosa, ZONE, NOW)]);
    cells = [];
    const open = () => opened.at(-1);
    const row = (tree, who) => find(tree, (n) => n.props?.onSelect && n.props?.c?.who === who);
    const first = page();
    assert.equal(open(), "th-c2", "the first row opens first");
    row(first, "Rosa Díaz").props.onSelect(row(first, "Rosa Díaz").props.c.id);
    const chosen = page();
    assert.equal(open(), "th-c1", "Rosa is open");
    find(chosen, (n) => n.type === "input" && String(n.props?.placeholder || "").startsWith("Search names")).props.onChange({ target: { value: "gel" } });
    const searched = page();
    assert.equal(row(searched, "Rosa Díaz"), undefined, "the words hide her row");
    assert.equal(open(), "th-c1", "REGRESSION: Nina Park's thread opened in Rosa's place, reply box and all");
    assert.equal(find(searched, byTestId("cv-missing-thread")), undefined, "and it is no link that went missing");
  } finally {
    globalThis.InboxThread = InboxThread;
    delete globalThis.window.INBOX_DATA;
  }
});

test("REGRESSION (A14): a recording that will not play says why where you listen, and play tries again -- from the route's own address, which names the workspace", () => {
  const rec = toCallVM(call(), ZONE, NOW);
  assert.equal(rec.recordingState, "ready", "the fixture is a call with its audio stored");
  // The call opens its thread at the call, and the call plays there (calls-in-the-thread.test.mjs).
  const note = msg({ id: "m7", sender: "system", type: "call_summary", channel: "voice", body: "Inbound call · 3 min — Wants to book a bridal trial on October 3" });
  globalThis.window.INBOX_DATA = { THREADS: [toInboxThreadVM(conv([note], { id: "cv7" }), null, ZONE, NOW)], CHANNEL_LABELS: { whatsapp: "WhatsApp", phone: "Phone" } };
  // The route's address as the client builds it, with the workspace named (inbox-verbs.ts window.__href).
  globalThis.window.__href = (route, p) => `${route}|${p.id}|workspace=melanys`;
  try {
    withRows([rec]);
    cells = [];
    const el = { src: "", played: 0, loaded: 0, paused: true, play() { this.played += 1; this.paused = false; return Promise.resolve(); }, pause() { this.paused = true; }, load() { this.loaded += 1; } };
    const opened = page();
    assert.equal(find(opened, (n) => n.type === InboxThread).props.thread.id, "th-cv7", "the call's own thread");
    const node = find(opened, (n) => n.type === "audio");
    // It was a bare fetch that named no workspace, then a link read once and signed for five minutes.
    assert.equal(node.props.src, `GET calls/[id]/recording|${rec.callId}|workspace=melanys`, "REGRESSION: the recording was not the route's own address");
    node.props.ref.current = el;
    find(page(), byTestId("tl-call-play")).props.onClick();
    node.props.onError();
    assert.equal(textOf(find(page(), byTestId("tl-listen-failed"))), "Couldn't play the recording.");
    const again = find(page(), byTestId("tl-listen-play"));
    assert.equal(again.props.disabled, undefined, "REGRESSION: one failure disabled Play for good");
    assert.equal(again.props["aria-label"], "Try the recording again");
    again.props.onClick();
    assert.deepEqual([el.loaded, el.played], [1, 2], "the second press asks the route again, and plays");
  } finally {
    delete globalThis.window.__href;
    delete globalThis.window.INBOX_DATA;
  }
});
