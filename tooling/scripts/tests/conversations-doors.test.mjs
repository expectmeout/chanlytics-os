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
  assert.match(textOf(tree), /by your team ·/);
  assert.doesNotMatch(textOf(tree), /by you ·/, "REGRESSION: every teammate's reply read 'by you'");
});

test("REGRESSION (A7, A9, A23): the Conversations viewer says who answered, signs our messages, and opens the thread in the Inbox", () => {
  const team = toConversationVM(conv([msg({ id: "m1" }), ours({ sender: "human", body: "See you Friday!" })]), ZONE, NOW);
  cells = []; seq = 0;
  assert.equal(textOf(OutcomePill({ outcome: team.outcome, channel: team.channel, answeredBy: team.answeredBy })), "Your team replied", "REGRESSION: 'Receptionist replied' over a person's reply");
  assert.equal(textOf(OutcomePill({ outcome: "handled", channel: "whatsapp", answeredBy: "receptionist" })), "Receptionist replied");
  assert.equal(textOf(OutcomePill({ outcome: "handled", channel: "phone" })), "Receptionist handled it", "a call keeps its own words");
  withRows([team]);
  cells = [];
  const tree = page();
  assert.match(textOf(tree), /by your team/, "REGRESSION: a bubble did not say who wrote it");
  const door = find(tree, (n) => n.type === "button" && textOf(n).includes("View thread in Inbox"));
  assert.ok(door, "REGRESSION: a chat had no way into its Inbox thread");
  door.props.onClick();
  assert.equal(went.at(-1), "inbox/th-c1");
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

test("REGRESSION (A26): a link to a conversation not in view says so inside the reading pane, not in a grid cell of its own", () => {
  withRows([toConversationVM(conv([msg({ id: "m1" }), ours()]), ZONE, NOW)]);
  cells = [];
  const tree = page({ initialId: "c-gone" });
  const kids = tree.props.children.filter((k) => k && typeof k === "object");
  assert.ok(!kids.some((k) => k.props?.className === "cv-missing"), "REGRESSION: the notice was a third child of a two-column grid");
  const viewer = kids.find((k) => k.rendered && k.rendered.props?.className === "cv-viewer");
  assert.ok(viewer, "the reading pane is the grid's second cell");
  assert.match(textOf(find(viewer, (n) => n.props?.className === "cv-missing")), /isn't among the newest 1 shown here — open the person in People to find it\./);
});

test("REGRESSION (A14): a recording that will not load says why, and Play tries again -- through the client, which names the workspace", async () => {
  const rec = toCallVM(call(), ZONE, NOW);
  assert.equal(rec.recordingState, "ready", "the fixture is a call with its audio stored");
  const asked = [];
  let answer = { ok: false, message: "No recording stored for this call yet." };
  globalThis.window.__recording = async (id) => { asked.push(id); return answer; };
  const fetched = [];
  const realFetch = globalThis.fetch;
  globalThis.fetch = async (url) => { fetched.push(String(url)); throw new Error("a bare fetch"); };
  try {
    withRows([rec]);
    cells = [];
    const audio = { src: "", played: 0, play() { this.played += 1; return Promise.resolve(); }, pause() {} };
    find(page(), (n) => n.type === "audio").props.ref.current = audio;
    const play = () => find(page(), (n) => n.props?.className === "cv-play");
    await play().props.onClick();
    assert.deepEqual(fetched, [], "REGRESSION: the recording was read by a bare fetch that named no workspace");
    assert.deepEqual(asked, [rec.callId]);
    const tree = page();
    assert.match(textOf(find(tree, (n) => String(n.props?.className || "").includes("cv-play-time"))), /No recording stored for this call yet\. Press play to try again\./);
    assert.equal(play().props.disabled, false, "REGRESSION: one failure disabled Play for good");
    answer = { ok: true, data: { url: "https://media.example/rec.mp3?sig=1" } };
    await play().props.onClick();
    assert.deepEqual([asked.length, audio.src, audio.played], [2, "https://media.example/rec.mp3?sig=1", 1], "the second press reads it again and plays");
  } finally {
    globalThis.fetch = realFetch;
    delete globalThis.window.__recording;
  }
});
