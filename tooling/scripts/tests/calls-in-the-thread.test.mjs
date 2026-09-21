/**
 * Calls are in the thread (docs/plans/2026-09-21-one-thread.md, PR 2).
 *
 * A call opened a second viewer in Conversations: its name broke onto two lines, a card listed eight facts --
 * "Inbound · 3 min 10 sec", "Ended: Receptionist ended the call", "Needs a call back", "Noted on Emily's thread in the
 * Inbox" -- most of them said again elsewhere, and a Play button stood beside "No recording for this call". In its
 * thread the same call was a dashed bubble reading "Phone · call note". Every one of the workspace's 34 calls already
 * belongs to a thread. So a call opens its thread, and its note there is the call: what it was about, how it went in a
 * few quiet words, the recording when there is one, the transcript on a tap.
 *
 * Run against the contracts and the pages on a stub React, never read from them.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { toCallVM, toInboxThreadVM, stateOf, memberWords, frameWhisper, RECORDING_RETENTION_DAYS } from "@chanlytics/contracts";

const ZONE = "America/New_York";
const NOW = new Date("2026-09-21T14:00:00Z");
const at = (min) => new Date(NOW.getTime() - min * 60_000).toISOString();

// A call as the calls route returns it (the-pages-say-only-what-is-true.test.mjs's shape).
export const callDto = (over = {}) => ({
  id: "k7", retell_call_id: "r-k7", direction: "inbound", call_type: "phone_call", status: "ended",
  from_e164: "+19175550106", from_raw: null, to_e164: "+13083368109",
  started_at: at(1200), ended_at: at(1197), duration_ms: 190_000,
  disconnection_reason: "agent_hangup", sentiment: "Positive", call_successful: true, in_voicemail: false,
  summary: "The caller asked about a bridal trial.", transcript_object: [
    { role: "agent", content: "Thank you for calling Melany's Beauty Salon. How can I help?", words: [{ start: 0 }] },
    { role: "user", content: "Hi! I'd like to do a bridal trial on October third.", words: [{ start: 6 }] },
  ],
  recording: { fetch_state: "stored", mime: "audio/mpeg", bytes: 48_000 },
  conversation_id: "c700", contact_id: "k-emily", message_id: "e1",
  contact: { display_name: "Emily Chen", wa_profile_name: null, phone_e164: "+19175550106" },
  wanted: "Wants to book a bridal trial on October 3 for herself and two bridesmaids", outcome: "callback_needed", follow_up: "Call Emily back", caller_name: "Emily",
  ...over,
});

/* ------------------------- the call names its own note ------------------------- */

test("a call knows the note it left on its thread, and says its facts as facts -- not only inside sentences", () => {
  const call = toCallVM(callDto(), ZONE, NOW);
  assert.equal(call.threadId, "th-c700", "the thread it belongs to");
  assert.equal(call.messageId, "e1", "REGRESSION: the call could not be matched to its note, so the thread could not carry it");
  assert.equal(call.direction, "inbound");
  assert.equal(call.missed, false);
  assert.equal(call.about, "Wants to book a bridal trial on October 3 for herself and two bridesmaids");
  assert.deepEqual(call.facts, ["Sounded positive", "Receptionist ended the call"], "how it went, a few words each -- it plays, so nothing is said of the recording");

  const missed = toCallVM(callDto({ status: "not_connected", duration_ms: 0, disconnection_reason: "dial_no_answer", sentiment: null }), ZONE, NOW);
  assert.equal(missed.missed, true);
  assert.equal(missed.about, null, "a call that never connected was about nothing");
  assert.deepEqual(missed.facts, ["No answer"], "and nothing is said of a recording it never had");

  // A voicemail says so in how it ended: "Reached voicemail." over "Reached voicemail" said it twice.
  const voicemail = toCallVM(callDto({ direction: "outbound", wanted: null, summary: null, in_voicemail: true, disconnection_reason: "voicemail_reached", sentiment: "Neutral", recording: { fetch_state: "purged" } }), ZONE, NOW);
  assert.equal(voicemail.about, null);
  assert.deepEqual(voicemail.facts, ["Reached voicemail", `Recording removed after ${RECORDING_RETENTION_DAYS} days`], "'Neutral' says nothing, so nothing is said");
  assert.equal(toCallVM(callDto({ message_id: null }), ZONE, NOW).messageId, undefined, "no note, no id");
});

test("each line says its moment in the call: where it starts and where it ends, a line with no time placed between its neighbours", () => {
  const call = toCallVM(callDto({ transcript_object: [
    { role: "agent", content: "Thank you for calling.", start: 0.4, end: 5.1 },
    { role: "user", content: "Hi, a bridal trial please.", start: 6, end: 11.2 },
    { role: "user", content: "After two." },
    { role: "agent", content: "Noted.", start: 20, end: 21.5 },
    { role: "injected", content: frameWhisper("mention the bridal package") },
  ] }), ZONE, NOW);
  assert.deepEqual(call.transcript.map((l) => [l.speaker, l.start, l.end]), [
    ["agent", 0.4, 5.1],
    ["client", 6, 11.2],
    ["client", 13, 20],
    ["agent", 20, 21.5],
    ["whisper", null, null],
  ], "REGRESSION: the view model kept only the string '0:06', so nothing could play from a line or light the one being said");
  assert.equal(call.durationSec, 190, "the track's length before the audio says its own");
  assert.equal(toCallVM(callDto({ duration_ms: null }), ZONE, NOW).durationSec, null);
});

test("a connected call with no recording says so; a call that never connected says nothing of one", () => {
  assert.deepEqual(toCallVM(callDto({ recording: null }), ZONE, NOW).facts, ["Sounded positive", "Receptionist ended the call", "No recording"],
    "REGRESSION: it said nothing, so a call with no audio (Emily's is filler, never a real call) looked like a player that failed to draw");
  assert.deepEqual(toCallVM(callDto({ status: "not_connected", duration_ms: 0, disconnection_reason: "dial_no_answer", sentiment: null, recording: null }), ZONE, NOW).facts, ["No answer"]);
});

/* ---------------------------------- a browser ---------------------------------- */

globalThis.window = {
  location: { pathname: "/w/melanys", hash: "", origin: "https://app.chanlytics.com", assign() {}, replace() {}, reload() {} },
  __WORKSPACES: [{ id: "t1", slug: "melanys", name: "Melany's Beauty Salon", status: "active", timezone: ZONE }],
  __ACTIVE_WORKSPACE: "t1",
  __chrome: { state: stateOf },
  __identity: { member: memberWords },
  CHANLY: { nav() {}, R: { client: (id) => `clients/${id}`, thread: (id) => `inbox/${id}` }, IX_NOW: "12:04", CONF: { SAFE: 0.8, MED: 0.5 } },
  __surfaceState: () => "live",
  __DEMO_MODE: false,
  __href: (route, p) => `${route}|${p.id}`,
  canDo: () => true,
  gate: () => ({}),
  addEventListener() {}, removeEventListener() {}, dispatchEvent() { return true; },
  setTimeout: () => 1, clearTimeout() {}, setInterval: () => 1, clearInterval() {},
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
const { InboxThread } = globalThis.window;

const walk = (n, fn) => {
  if (n == null || typeof n !== "object") return;
  if (Array.isArray(n)) { for (const k of n) walk(k, fn); return; }
  fn(n);
  walk(n.props?.children, fn);
  walk(n.rendered, fn);
};
const all = (tree, pred) => { const hits = []; walk(tree, (n) => { if (pred(n)) hits.push(n); }); return hits; };
const find = (tree, pred) => all(tree, pred)[0];
const hasClass = (c) => (n) => typeof n.props?.className === "string" && n.props.className.split(" ").includes(c);
const byTestId = (id) => (n) => n.props?.["data-testid"] === id;
const textOf = (n) => {
  if (n == null || typeof n === "boolean") return "";
  if (typeof n === "string" || typeof n === "number") return String(n);
  if (Array.isArray(n)) return n.map(textOf).join("");
  return n.rendered !== undefined ? textOf(n.rendered) : textOf(n.props?.children);
};

// Emily's thread: what she wrote, and the note her call left, as GET conversations returns them.
const m = (id, min, over = {}) => ({ id, direction: "inbound", sender: "customer", type: "text", body: "Do you do bridal?", media: null, meta: null, status: "received", channel: "whatsapp", created_at: at(min), channel_ts: at(min), ...over });
const note = (over = {}) => m("e1", 1200, { sender: "system", type: "call_summary", channel: "voice", body: "Inbound call · 3 min — Wants to book a bridal trial on October 3 for herself and two bridesmaids (needs a call back)", meta: {}, ...over });
const conv = (messages, over = {}) => ({
  id: "c700", state: "open", paused_until: null, snooze_until: null, assignee_user_id: null, assignee_is_me: false,
  last_wa_inbound_at: null, last_message_at: at(1197),
  contact: { id: "k-emily", display_name: "Emily Chen", wa_profile_name: null, phone_e164: "+19175550106", consent: "opted_in", dnc: false },
  messages,
  ...over,
});
const labels = { whatsapp: "WhatsApp", phone: "Phone", sms: "Text", email: "Email" };
// The calls Conversations read, which the card finds its call among.
const calls = (...rows) => { globalThis.window.CONVERSATIONS_DATA = { CONVERSATIONS: rows, CV_CHANNELS: [], CALLS_READ: true }; };
const draw = (vm) => { cells = []; seq = 0; return InboxThread({ thread: vm, channelLabels: labels }); };
const again = (vm) => { seq = 0; return InboxThread({ thread: vm, channelLabels: labels }); };
const cardOf = (tree) => find(tree, byTestId("tl-call"));
const emily = () => toInboxThreadVM(conv([note()]), null, ZONE, NOW);

/* ----------------------------------- the card ----------------------------------- */

test("in its thread a call is the call: what it was about, how it went, and its recording -- not a bubble of words nobody said", () => {
  calls(toCallVM(callDto(), ZONE, NOW));
  const tree = draw(emily());
  const card = cardOf(tree);
  assert.ok(card, "the call's card");
  assert.equal(all(tree, hasClass("tl-msg")).length, 0, "REGRESSION: the note was a dashed bubble");
  assert.ok(!textOf(tree).includes("call note"), "REGRESSION: 'Phone · call note'");
  assert.ok(hasClass("inbound")(card), "on the side it came from");
  assert.equal(textOf(find(card, hasClass("tl-call-kind"))), "Inbound call · 3:10");
  assert.equal(textOf(find(card, hasClass("tl-call-about"))), "Wants to book a bridal trial on October 3 for herself and two bridesmaids");
  assert.equal(textOf(find(card, hasClass("tl-call-facts"))), "Sounded positive · Receptionist ended the call", "one quiet line");
  assert.ok(find(card, byTestId("tl-call-play")), "its recording plays here");
  for (const gone of ["3 min 10 sec", "Ended:", "Noted on", "Recording saved", "What happened on this call", "the voice provider's own read"]) {
    assert.ok(!textOf(card).includes(gone), `REGRESSION: the card of eight facts said "${gone}"`);
  }
});

test("no recording, no Play -- and the call says why there is none", () => {
  calls(toCallVM(callDto({ recording: null }), ZONE, NOW));
  let card = cardOf(draw(emily()));
  assert.equal(find(card, byTestId("tl-call-play")), undefined, "REGRESSION: a Play button beside 'No recording for this call'");
  // #775 said nothing of a call never recorded; Emily's (filler, never a call) then read as a player that failed to draw.
  assert.equal(textOf(find(card, hasClass("tl-call-facts"))), "Sounded positive · Receptionist ended the call · No recording", "a call never recorded says so, once");

  calls(toCallVM(callDto({ recording: { fetch_state: "pending" } }), ZONE, NOW));
  card = cardOf(draw(emily()));
  assert.equal(find(card, byTestId("tl-call-play")), undefined);
  assert.match(textOf(find(card, hasClass("tl-call-facts"))), / · Recording still processing$/);

  calls(toCallVM(callDto({ recording: { fetch_state: "purged" } }), ZONE, NOW));
  assert.match(textOf(find(cardOf(draw(emily())), hasClass("tl-call-facts"))), new RegExp(` · Recording removed after ${RECORDING_RETENTION_DAYS} days$`));
});

test("a call that never connected says so in its head, and was about nothing", () => {
  calls(toCallVM(callDto({ status: "not_connected", duration_ms: 0, disconnection_reason: "dial_no_answer", sentiment: null, recording: null, transcript_object: [] }), ZONE, NOW));
  const card = cardOf(draw(emily()));
  assert.equal(textOf(find(card, hasClass("tl-call-kind"))), "Missed call");
  assert.equal(find(card, hasClass("tl-call-about")), undefined);
  assert.equal(textOf(find(card, hasClass("tl-call-facts"))), "No answer");
  assert.equal(find(card, byTestId("tl-call-open")), undefined, "no transcript to open");
});

test("a call older than the calls read is drawn from the note it left: its head and its words, nothing to play", () => {
  calls();
  const card = cardOf(draw(emily()));
  assert.equal(textOf(find(card, hasClass("tl-call-kind"))), "Inbound call · 3 min");
  assert.equal(textOf(find(card, hasClass("tl-call-about"))), "Wants to book a bridal trial on October 3 for herself and two bridesmaids (needs a call back)");
  assert.equal(find(card, byTestId("tl-call-play")), undefined);
  assert.equal(find(card, byTestId("tl-call-open")), undefined);
  // A note written before the call's summary existed says there was none; the card says nothing instead.
  const bare = cardOf(draw(toInboxThreadVM(conv([note({ body: "Outbound call — No summary available." })]), null, ZONE, NOW)));
  assert.equal(textOf(find(bare, hasClass("tl-call-kind"))), "Outbound call");
  assert.ok(hasClass("outbound")(bare), "ours, on our side");
  assert.equal(find(bare, hasClass("tl-call-about")), undefined);
  // A short call's note says its seconds: three of the salon's 34 read "· 23 s —", and the card printed them whole,
  // its own head included, under "Inbound call".
  const short = cardOf(draw(toInboxThreadVM(conv([note({ body: "Inbound call · 23 s — The caller asked whether the salon is open on Sunday." })]), null, ZONE, NOW)));
  assert.equal(textOf(find(short, hasClass("tl-call-kind"))), "Inbound call · 23 sec");
  assert.equal(textOf(find(short, hasClass("tl-call-about"))), "The caller asked whether the salon is open on Sunday.", "REGRESSION: the note's own head, again, as what the call was about");
});

test("the transcript opens on a tap: the receptionist, the caller by name, a whisper as the owner's own words -- and the call's own file", () => {
  const whispered = [...callDto().transcript_object, { role: "injected", content: frameWhisper("mention the bridal package") }];
  calls(toCallVM(callDto({ transcript_object: whispered }), ZONE, NOW));
  const vm = emily();
  let card = cardOf(draw(vm));
  const open = find(card, byTestId("tl-call-open"));
  assert.equal(open.props["aria-expanded"], false);
  assert.equal(find(card, byTestId("tl-call-lines")), undefined, "closed until asked for");
  open.props.onClick();
  card = cardOf(again(vm));
  assert.equal(find(card, byTestId("tl-call-open")).props["aria-expanded"], true);
  const lines = all(find(card, byTestId("tl-call-lines")), hasClass("tl-call-line")).map((l) => [textOf(find(l, hasClass("tl-call-who"))), textOf(find(l, hasClass("tl-call-said")))]);
  assert.deepEqual(lines, [
    ["Receptionist", "Thank you for calling Melany's Beauty Salon. How can I help?"],
    ["Emily", "Hi! I'd like to do a bridal trial on October third."],
    ["You whispered", "mention the bridal package"],
  ]);
  const file = find(card, (n) => n.type === "a" && hasClass("tl-call-file")(n));
  assert.equal(file.props.href, "GET calls/[id]/export|k7", "the call's own transcript, from the route that writes it");
  assert.ok("download" in file.props, "fetched as a file");

  globalThis.window.__DEMO_MODE = true;
  try {
    assert.equal(find(cardOf(again(vm)), (n) => hasClass("tl-call-file")(n)), undefined, "no file in a demo, where there is no route to write it");
  } finally {
    globalThis.window.__DEMO_MODE = false;
  }
});

/* ------------------------------- the rest of the thread ------------------------------- */

test("a thread's bubbles name their wire only when its words went by more than one: a call is not a second wire", () => {
  calls();
  const vm = toInboxThreadVM(conv([m("m1", 1300), note(), m("m2", 60, { body: "Thanks for calling back!" })], { last_wa_inbound_at: at(60) }), null, ZONE, NOW);
  assert.deepEqual(vm.channels, ["whatsapp", "phone"]);
  const tree = draw(vm);
  const metas = all(tree, hasClass("tl-msg-meta")).map(textOf);
  assert.ok(metas.length > 0, "the bubbles have their times");
  assert.ok(metas.every((t) => !t.includes("WhatsApp")), `REGRESSION: "WhatsApp" over every bubble of a thread with one call: ${metas.join(" | ")}`);
  assert.equal(textOf(find(tree, hasClass("ix-th-meta"))), "WhatsApp · Phone", "the header names both, once");
});

test("every message carries its own id on the page, the call's card too, so the thread can open at one", () => {
  calls();
  const tree = draw(toInboxThreadVM(conv([m("m1", 1300), note(), m("m2", 60)], { last_wa_inbound_at: at(60) }), null, ZONE, NOW));
  assert.deepEqual(all(tree, hasClass("tl-msg")).map((b) => b.props["data-mid"]), ["m1", "m2"]);
  assert.equal(cardOf(tree).props["data-mid"], "e1");
});
