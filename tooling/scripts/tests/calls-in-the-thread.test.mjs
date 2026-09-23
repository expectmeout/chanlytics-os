/**
 * Calls are in the thread (docs/plans/2026-09-21-one-thread.md, PR 2), and you can follow them
 * (docs/plans/2026-09-21-calls-you-can-follow.md).
 *
 * A call opened a second viewer in Conversations: a card of eight facts beside a Play button that played nothing. #775
 * put the call in its thread, as a 420px card with its transcript behind a tap. Ruben: "the transcript and everything
 * should be on the chat container to feel more seamless like the text style threads". So a call is part of the
 * conversation: a quiet line where it began, its lines as the thread's own bubbles, a quiet line where it ended; a
 * player floats while you listen, and the line being said is lit.
 *
 * Run against the contracts and the pages on a stub React, never read from them.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  toCallVM,
  toInboxThreadVM,
  stateOf,
  memberWords,
  frameWhisper,
  linkHost,
  proposalMessage,
  proposalLinkOf,
  RECORDING_RETENTION_DAYS,
} from "@chanlytics/contracts";
import { hookFrames } from "./_hook-frames.mjs";

const ZONE = "America/New_York";
const NOW = new Date("2026-09-21T14:00:00Z");
const at = (min) => new Date(NOW.getTime() - min * 60_000).toISOString();

// A call as the calls route returns it (the-pages-say-only-what-is-true.test.mjs's shape).
export const callDto = (over = {}) => ({
  id: "k7",
  retell_call_id: "r-k7",
  direction: "inbound",
  call_type: "phone_call",
  status: "ended",
  from_e164: "+19175550106",
  from_raw: null,
  to_e164: "+13083368109",
  started_at: at(1200),
  ended_at: at(1197),
  duration_ms: 190_000,
  disconnection_reason: "agent_hangup",
  sentiment: "Positive",
  call_successful: true,
  in_voicemail: false,
  summary: "The caller asked about a bridal trial.",
  transcript_object: [
    { role: "agent", content: "Thank you for calling Melany's Beauty Salon. How can I help?", words: [{ start: 0 }] },
    { role: "user", content: "Hi! I'd like to do a bridal trial on October third.", words: [{ start: 6 }] },
  ],
  recording: { fetch_state: "stored", mime: "audio/mpeg", bytes: 48_000 },
  conversation_id: "c700",
  contact_id: "k-emily",
  message_id: "e1",
  contact: { display_name: "Emily Chen", wa_profile_name: null, phone_e164: "+19175550106" },
  wanted: "Wants to book a bridal trial on October 3 for herself and two bridesmaids",
  outcome: "callback_needed",
  follow_up: "Call Emily back",
  caller_name: "Emily",
  ...over,
});

/* ------------------------- the call names its own note ------------------------- */

test("a call knows the note it left on its thread, and says its facts as facts -- not only inside sentences", () => {
  const call = toCallVM(callDto(), ZONE, NOW);
  assert.equal(call.threadId, "th-c700", "the thread it belongs to");
  assert.equal(
    call.messageId,
    "e1",
    "REGRESSION: the call could not be matched to its note, so the thread could not carry it",
  );
  assert.equal(call.direction, "inbound");
  assert.equal(call.missed, false);
  assert.equal(call.about, "Wants to book a bridal trial on October 3 for herself and two bridesmaids");
  assert.deepEqual(
    call.facts,
    ["Sounded positive", "Receptionist ended the call"],
    "how it went, a few words each -- it plays, so nothing is said of the recording",
  );

  const missed = toCallVM(
    callDto({ status: "not_connected", duration_ms: 0, disconnection_reason: "dial_no_answer", sentiment: null }),
    ZONE,
    NOW,
  );
  assert.equal(missed.missed, true);
  assert.equal(missed.about, null, "a call that never connected was about nothing");
  assert.deepEqual(missed.facts, ["No answer"], "and nothing is said of a recording it never had");

  // A voicemail says so in how it ended: "Reached voicemail." over "Reached voicemail" said it twice.
  const voicemail = toCallVM(
    callDto({
      direction: "outbound",
      wanted: null,
      summary: null,
      in_voicemail: true,
      disconnection_reason: "voicemail_reached",
      sentiment: "Neutral",
      recording: { fetch_state: "purged" },
    }),
    ZONE,
    NOW,
  );
  assert.equal(voicemail.about, null);
  assert.deepEqual(
    voicemail.facts,
    ["Reached voicemail", `Recording removed after ${RECORDING_RETENTION_DAYS} days`],
    "'Neutral' says nothing, so nothing is said",
  );
  assert.equal(toCallVM(callDto({ message_id: null }), ZONE, NOW).messageId, undefined, "no note, no id");
});

test("each line says its moment in the call: where it starts and where it ends, a line with no time placed between its neighbours", () => {
  const call = toCallVM(
    callDto({
      transcript_object: [
        { role: "agent", content: "Thank you for calling.", start: 0.4, end: 5.1 },
        { role: "user", content: "Hi, a bridal trial please.", start: 6, end: 11.2 },
        { role: "user", content: "After two." },
        { role: "agent", content: "Noted.", start: 20, end: 21.5 },
        { role: "injected", content: frameWhisper("mention the bridal package") },
      ],
    }),
    ZONE,
    NOW,
  );
  assert.deepEqual(
    call.transcript.map((l) => [l.speaker, l.start, l.end]),
    [
      ["agent", 0.4, 5.1],
      ["client", 6, 11.2],
      ["client", 13, 20],
      ["agent", 20, 21.5],
      ["whisper", null, null],
    ],
    "REGRESSION: the view model kept only the string '0:06', so nothing could play from a line or light the one being said",
  );
  assert.equal(call.durationSec, 190, "the track's length before the audio says its own");
  assert.equal(toCallVM(callDto({ duration_ms: null }), ZONE, NOW).durationSec, null);
});

test("a connected call with no recording says so; a call that never connected says nothing of one", () => {
  assert.deepEqual(
    toCallVM(callDto({ recording: null }), ZONE, NOW).facts,
    ["Sounded positive", "Receptionist ended the call", "No recording"],
    "REGRESSION: it said nothing, so a call with no audio (Emily's is filler, never a real call) looked like a player that failed to draw",
  );
  assert.deepEqual(
    toCallVM(
      callDto({
        status: "not_connected",
        duration_ms: 0,
        disconnection_reason: "dial_no_answer",
        sentiment: null,
        recording: null,
      }),
      ZONE,
      NOW,
    ).facts,
    ["No answer"],
  );
});

/* ---------------------------------- a browser ---------------------------------- */

globalThis.window = {
  location: {
    pathname: "/w/melanys",
    hash: "",
    origin: "https://app.chanlytics.com",
    assign() {},
    replace() {},
    reload() {},
  },
  __WORKSPACES: [{ id: "t1", slug: "melanys", name: "Melany's Beauty Salon", status: "active", timezone: ZONE }],
  __ACTIVE_WORKSPACE: "t1",
  __chrome: { state: stateOf },
  __identity: { member: memberWords },
  CHANLY: {
    nav() {},
    R: { client: (id) => `clients/${id}`, thread: (id) => `inbox/${id}` },
    IX_NOW: "12:04",
    CONF: { SAFE: 0.8, MED: 0.5 },
  },
  __surfaceState: () => "live",
  __DEMO_MODE: false,
  __href: (route, p) => `${route}|${p.id}`,
  canDo: () => true,
  gate: () => ({}),
  addEventListener() {},
  removeEventListener() {},
  dispatchEvent() {
    return true;
  },
  setTimeout: () => 1,
  clearTimeout() {},
  setInterval: () => 1,
  clearInterval() {},
};
globalThis.document = {
  body: { appendChild() {} },
  addEventListener() {},
  removeEventListener() {},
  createElement: () => ({ setAttribute() {}, style: {}, classList: { add() {}, remove() {}, contains: () => false } }),
};

let cells = [];
// Where each hook keeps its state: by the component that calls it, as React keeps it (_hook-frames.mjs).
const frames = hookFrames();
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
  useEffect: (fn) => {
    const k = frames.key();
    if (!(k in cells)) {
      cells[k] = true;
      fn();
    }
  },
  useCallback: (fn) => fn,
};
globalThis.ReactDOM = { createPortal: (node) => node };
await import("../../../apps/dashboard/src/legacy/components/data-bits.jsx");
for (const k of [
  "StatePill",
  "MoreMenu",
  "EmptyState",
  "PolicyChip",
  "TlMedia",
  "FailedRead",
  "Confirm",
  "usePPToast",
  "useHotkey",
])
  globalThis[k] = globalThis.window[k];
await import("../../../apps/dashboard/src/legacy/pages/inbox-list.jsx");
globalThis.ConfidenceDots = globalThis.window.ConfidenceDots;
await import("../../../apps/dashboard/src/legacy/pages/inbox-thread.jsx");
const { InboxThread } = globalThis.window;

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
  const hits = [];
  walk(tree, (n) => {
    if (pred(n)) hits.push(n);
  });
  return hits;
};
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
const m = (id, min, over = {}) => ({
  id,
  direction: "inbound",
  sender: "customer",
  type: "text",
  body: "Do you do bridal?",
  media: null,
  meta: null,
  status: "received",
  channel: "whatsapp",
  created_at: at(min),
  channel_ts: at(min),
  ...over,
});
const note = (over = {}) =>
  m("e1", 1200, {
    sender: "system",
    type: "call_summary",
    channel: "voice",
    body: "Inbound call · 3 min — Wants to book a bridal trial on October 3 for herself and two bridesmaids (needs a call back)",
    meta: {},
    ...over,
  });
const conv = (messages, over = {}) => ({
  id: "c700",
  state: "open",
  paused_until: null,
  snooze_until: null,
  assignee_user_id: null,
  assignee_is_me: false,
  last_wa_inbound_at: null,
  last_message_at: at(1197),
  contact: {
    id: "k-emily",
    display_name: "Emily Chen",
    wa_profile_name: null,
    phone_e164: "+19175550106",
    consent: "opted_in",
    dnc: false,
  },
  messages,
  ...over,
});
const labels = { whatsapp: "WhatsApp", phone: "Phone", sms: "Text", email: "Email" };
// The calls Conversations read, which the card finds its call among.
const calls = (...rows) => {
  globalThis.window.CONVERSATIONS_DATA = { CONVERSATIONS: rows, CV_CHANNELS: [], CALLS_READ: true };
};
const draw = (vm) => {
  cells = [];
  frames.begin();
  return InboxThread({ thread: vm, channelLabels: labels });
};
const again = (vm) => {
  frames.begin();
  return InboxThread({ thread: vm, channelLabels: labels });
};
const cardOf = (tree) => find(tree, byTestId("tl-call"));
const emily = () => toInboxThreadVM(conv([note()]), null, ZONE, NOW);

/* --------------------------------- the call, drawn --------------------------------- */

// An <audio> as the page drives it: what it was told, and what it was asked to do.
const audio = () => ({
  src: "",
  currentTime: 0,
  paused: true,
  playbackRate: 1,
  played: 0,
  paused_: 0,
  loaded: 0,
  play() {
    this.played += 1;
    this.paused = false;
    return Promise.resolve();
  },
  pause() {
    this.paused_ += 1;
    this.paused = true;
  },
  load() {
    this.loaded += 1;
  },
});
// Hand the page the <audio> it drew, as the browser would through its ref.
const wire = (tree, el) => {
  const node = find(tree, (n) => n.type === "audio");
  node.props.ref.current = el;
  return node;
};
const spoken = (tree) => all(tree, byTestId("tl-spoken"));
const words = (n) => textOf(find(n, hasClass("tl-msg-body")));

test("a call is part of its conversation: where it began, its lines as the thread's own bubbles, where it ended -- not a card", () => {
  calls(toCallVM(callDto(), ZONE, NOW));
  const tree = draw(emily());
  const call = cardOf(tree);
  assert.ok(call, "the call");
  assert.equal(all(tree, hasClass("tl-call-card")).length, 0, "REGRESSION: a card on the conversation, not part of it");
  const start = find(call, byTestId("tl-call-start"));
  assert.deepEqual(
    [textOf(find(start, hasClass("tl-call-kind"))), textOf(find(start, hasClass("tl-call-length")))],
    ["Inbound call", "3:10"],
  );
  const lines = spoken(call);
  assert.deepEqual(
    lines.map((l) => [hasClass("client")(l) ? "theirs" : "ours", words(l)]),
    [
      ["ours", "Thank you for calling Melany's Beauty Salon. How can I help?"],
      ["theirs", "Hi! I'd like to do a bridal trial on October third."],
    ],
    "the receptionist's words on our side, the caller's on theirs, as a written thread draws them",
  );
  assert.ok(
    lines.every((l) => hasClass("tl-msg")(l)),
    "the thread's own bubbles",
  );
  assert.equal(
    all(tree, (n) => hasClass("tl-msg")(n) && !hasClass("tl-spoken")(n)).length,
    0,
    "REGRESSION: the note was a dashed bubble of words nobody said",
  );
  assert.ok(!textOf(tree).includes("call note"), "REGRESSION: 'Phone · call note'");
  assert.equal(
    textOf(find(call, byTestId("tl-call-end"))),
    "Call ended · Sounded positive · Receptionist ended the call",
    "how it went, where it ended",
  );
  for (const gone of [
    "3 min 10 sec",
    "Ended:",
    "Noted on",
    "Recording saved",
    "What happened on this call",
    "the voice provider's own read",
    "Transcript",
  ]) {
    assert.ok(!textOf(call).includes(gone), `REGRESSION: "${gone}"`);
  }
});

test("a call the conversation moved on from folds to what it was about, and opens on a tap", () => {
  calls(toCallVM(callDto(), ZONE, NOW));
  const vm = toInboxThreadVM(
    conv([note(), m("m2", 60, { body: "Thanks for calling back!" })], { last_wa_inbound_at: at(60) }),
    null,
    ZONE,
    NOW,
  );
  let call = cardOf(draw(vm));
  assert.equal(spoken(call).length, 0, "folded: a newer message came after it");
  assert.equal(
    textOf(find(call, hasClass("tl-call-about"))),
    "Wants to book a bridal trial on October 3 for herself and two bridesmaids",
  );
  const more = find(call, byTestId("tl-call-open"));
  assert.equal(textOf(more), "Show the call · 2 lines");
  more.props.onClick();
  call = cardOf(again(vm));
  assert.equal(spoken(call).length, 2, "and open on a tap");
});

test("the call plays from where it began: the recording is the route's own link, and listening floats a player over the thread", () => {
  calls(toCallVM(callDto(), ZONE, NOW));
  const vm = emily();
  let tree = draw(vm);
  const node = find(tree, (n) => n.type === "audio");
  assert.equal(
    node.props.src,
    "GET calls/[id]/recording|k7",
    "REGRESSION: a link fetched once and signed for five minutes",
  );
  assert.equal(node.props.preload, "metadata");
  assert.equal(find(tree, byTestId("tl-listen")), undefined, "nothing floats until you listen");
  const el = audio();
  wire(tree, el);
  find(tree, byTestId("tl-call-play")).props.onClick();
  assert.equal(el.played, 1, "it plays");
  tree = again(vm);
  const bar = find(tree, byTestId("tl-listen"));
  assert.ok(bar, "the player, while you listen");
  assert.equal(find(tree, byTestId("tl-call-play")), undefined, "one play, not two");
  const track = find(bar, byTestId("tl-listen-track"));
  assert.equal(track.props.type, "range", "a track the keyboard moves");
  assert.equal(track.props.max, 190, "as long as the call, before the audio says its own");
  track.props.onChange({ target: { value: "95" } });
  assert.equal(el.currentTime, 95, "pressed or dragged, it seeks");
});

test("a line plays from itself, and the line being said is the one lit", () => {
  calls(toCallVM(callDto(), ZONE, NOW));
  const vm = emily();
  let tree = draw(vm);
  const el = audio();
  const node = wire(tree, el);
  const t = find(spoken(tree)[1], hasClass("tl-spoken-t"));
  assert.equal(t.props["aria-label"], "Play from 0:06");
  t.props.onClick({ stopPropagation() {} });
  assert.deepEqual([el.currentTime, el.played], [6, 1], "from the caller's line, playing");
  node.props.onTimeUpdate({ target: { currentTime: 7.5 } });
  tree = again(vm);
  assert.deepEqual(
    spoken(tree).map((l) => l.props["aria-current"] || null),
    [null, "true"],
    "the caller's line is being said",
  );
  node.props.onTimeUpdate({ target: { currentTime: 1 } });
  tree = again(vm);
  assert.deepEqual(
    spoken(tree).map((l) => l.props["aria-current"] || null),
    ["true", null],
  );
});

test("the speed goes 1×, 1.5×, 2× and round, on the recording itself", () => {
  calls(toCallVM(callDto(), ZONE, NOW));
  const vm = emily();
  let tree = draw(vm);
  const el = audio();
  wire(tree, el);
  find(tree, byTestId("tl-call-play")).props.onClick();
  const rates = [];
  for (let i = 0; i < 3; i++) {
    tree = again(vm);
    find(tree, byTestId("tl-listen-speed")).props.onClick();
    rates.push(el.playbackRate);
  }
  assert.deepEqual(rates, [1.5, 2, 1]);
});

test("one call at a time: playing one pauses the one that was playing", () => {
  const first = audio();
  const second = audio();
  calls(toCallVM(callDto(), ZONE, NOW));
  const one = wire(draw(emily()), first);
  one.props.onPlay({ target: first });
  calls(toCallVM(callDto({ id: "k8", message_id: "e2" }), ZONE, NOW));
  const two = wire(draw(toInboxThreadVM(conv([note({ id: "e2" })]), null, ZONE, NOW)), second);
  two.props.onPlay({ target: second });
  assert.equal(first.paused_, 1, "REGRESSION: two calls talking over each other");
  assert.equal(second.paused_, 0);
});

test("a recording that will not play says so where you listen, and play tries again with a newly signed link", () => {
  calls(toCallVM(callDto(), ZONE, NOW));
  const vm = emily();
  let tree = draw(vm);
  const el = audio();
  const node = wire(tree, el);
  find(tree, byTestId("tl-call-play")).props.onClick();
  node.props.onError();
  tree = again(vm);
  assert.equal(textOf(find(tree, byTestId("tl-listen-failed"))), "Couldn't play the recording.");
  find(tree, byTestId("tl-listen-play")).props.onClick();
  assert.deepEqual([el.loaded, el.played], [1, 2], "asked again: the route signs a new link for the new request");
});

test("no recording, no play -- and the call says why there is none", () => {
  calls(toCallVM(callDto({ recording: null }), ZONE, NOW));
  let call = cardOf(draw(emily()));
  assert.equal(
    find(call, byTestId("tl-call-play")),
    undefined,
    "REGRESSION: a Play button beside 'No recording for this call'",
  );
  assert.equal(
    find(call, (n) => n.type === "audio"),
    undefined,
  );
  // #775 said nothing of a call never recorded; Emily's (filler, never a call) then read as a player that failed to draw.
  assert.equal(
    textOf(find(call, byTestId("tl-call-end"))),
    "Call ended · Sounded positive · Receptionist ended the call · No recording",
  );
  assert.equal(spoken(call).length, 2, "the lines are there to read");
  assert.equal(find(spoken(call)[0], hasClass("tl-spoken-t")), undefined, "nothing to play them from");

  calls(toCallVM(callDto({ recording: { fetch_state: "pending" } }), ZONE, NOW));
  call = cardOf(draw(emily()));
  assert.match(textOf(find(call, byTestId("tl-call-end"))), / · Recording still processing$/);
  calls(toCallVM(callDto({ recording: { fetch_state: "purged" } }), ZONE, NOW));
  assert.match(
    textOf(find(cardOf(draw(emily())), byTestId("tl-call-end"))),
    new RegExp(` · Recording removed after ${RECORDING_RETENTION_DAYS} days$`),
  );
});

test("a call that never connected is the one line: what it was, how it ended, when", () => {
  calls(
    toCallVM(
      callDto({
        status: "not_connected",
        duration_ms: 0,
        disconnection_reason: "dial_no_answer",
        sentiment: null,
        recording: null,
        transcript_object: [],
      }),
      ZONE,
      NOW,
    ),
  );
  const call = cardOf(draw(emily()));
  const start = find(call, byTestId("tl-call-start"));
  assert.equal(textOf(find(start, hasClass("tl-call-kind"))), "Missed call");
  assert.equal(textOf(find(start, hasClass("tl-call-facts"))), "No answer");
  assert.equal(find(call, hasClass("tl-call-length")), undefined);
  assert.equal(spoken(call).length, 0);
  assert.equal(find(call, byTestId("tl-call-end")), undefined, "one line, not two");
});

test("a call older than the calls read is drawn from the note it left: where it began, and what it was about", () => {
  calls();
  const call = cardOf(draw(emily()));
  assert.equal(textOf(find(call, hasClass("tl-call-kind"))), "Inbound call");
  assert.equal(textOf(find(call, hasClass("tl-call-length"))), "3 min");
  assert.equal(
    textOf(find(call, hasClass("tl-call-about"))),
    "Wants to book a bridal trial on October 3 for herself and two bridesmaids (needs a call back)",
  );
  assert.equal(find(call, byTestId("tl-call-play")), undefined);
  // A note written before the call's summary existed says there was none; the call says nothing instead.
  const bare = cardOf(
    draw(toInboxThreadVM(conv([note({ body: "Outbound call — No summary available." })]), null, ZONE, NOW)),
  );
  assert.equal(textOf(find(bare, hasClass("tl-call-kind"))), "Outbound call");
  assert.ok(hasClass("outbound")(bare), "ours");
  assert.equal(find(bare, hasClass("tl-call-about")), undefined);
  // A short call's note says its seconds: three of the salon's 34 read "· 23 s —", and the card printed them whole.
  const short = cardOf(
    draw(
      toInboxThreadVM(
        conv([note({ body: "Inbound call · 23 s — The caller asked whether the salon is open on Sunday." })]),
        null,
        ZONE,
        NOW,
      ),
    ),
  );
  assert.equal(textOf(find(short, hasClass("tl-call-length"))), "23 sec");
  assert.equal(
    textOf(find(short, hasClass("tl-call-about"))),
    "The caller asked whether the salon is open on Sunday.",
    "REGRESSION: the note's own head, again, as what the call was about",
  );
});

test("a whisper is the owner's own words, marked as theirs, with no moment in the recording; the call's file is a quiet link where it ended", () => {
  const whispered = [
    ...callDto().transcript_object,
    { role: "injected", content: frameWhisper("mention the bridal package") },
  ];
  calls(toCallVM(callDto({ transcript_object: whispered }), ZONE, NOW));
  const vm = emily();
  const call = cardOf(draw(vm));
  const whisper = spoken(call)[2];
  assert.ok(hasClass("whisper")(whisper) && hasClass("agent")(whisper), "on our side, marked");
  assert.match(textOf(whisper), /You whispered/);
  assert.equal(words(whisper), "mention the bridal package");
  assert.equal(
    find(whisper, hasClass("tl-spoken-t")),
    undefined,
    "not a sound in the recording, so nothing to play from",
  );
  assert.deepEqual(
    spoken(call).map((l) => textOf(find(l, hasClass("tl-spoken-who")))),
    ["Receptionist", "Emily", ""],
    "who spoke, for a screen reader: the side says it to the eye",
  );
  const file = find(call, (n) => n.type === "a" && hasClass("tl-call-file")(n));
  assert.equal(file.props.href, "GET calls/[id]/export|k7", "the call's own transcript, from the route that writes it");
  assert.ok("download" in file.props);
  globalThis.window.__DEMO_MODE = true;
  try {
    assert.equal(
      find(cardOf(again(vm)), hasClass("tl-call-file")),
      undefined,
      "no file in a demo, where there is no route to write it",
    );
  } finally {
    globalThis.window.__DEMO_MODE = false;
  }
});

test("a thread opens where a call began when a call is the newest thing said; at a message it was opened at; else at its newest", () => {
  const opensAt = globalThis.window.ixOpensAt;
  assert.equal(
    opensAt(emily()),
    "e1",
    "the call is the newest thing said: its lines are below it, and play is the next thing to press",
  );
  const moved = toInboxThreadVM(conv([note(), m("m2", 60)], { last_wa_inbound_at: at(60) }), null, ZONE, NOW);
  assert.equal(opensAt(moved), null, "a message came after it: the newest, as ever");
  assert.equal(opensAt(moved, "e1"), "e1", "opened at the call, from Conversations");
  // A flag after the call is not something said.
  const flagged = toInboxThreadVM(
    conv([note()], { state: "needs_human" }),
    { id: "x1", reason: "callback", details: "Call Emily back", state: "open", created_at: at(1190) },
    ZONE,
    NOW,
  );
  assert.equal(flagged.timeline.at(-1).type, "event");
  assert.equal(opensAt(flagged), "e1");
});

test("the line being said is kept in view without moving the thread under the reader: one under the player comes out just below it", () => {
  const followBy = globalThis.window.tlFollowBy;
  // A desk pane 744px tall, reading from 56px (the player's 44 and a gap) to its foot at 800.
  const view = { top: 56, bottom: 800, height: 744 };
  const line = (top, height = 40) => ({ top, bottom: top + height });
  assert.equal(followBy(line(200), view), 0, "in view: the thread holds still");
  // Measured on a real thread: ▶ put the player over the first line, which sat at 48, and a quarter of the pane moved
  // the call's lines 150px down a 567px pane.
  assert.equal(followBy(line(48), view), -8, "REGRESSION: under the player, it comes out just below it and no further");
  assert.equal(
    followBy(line(48), { top: 56, bottom: 567, height: 567 }),
    -8,
    "the real thread's pane: 8px, where it was 150",
  );
  assert.equal(followBy(line(-300), view), -356, "played from a line above the view: it lands just below the player");
  assert.equal(
    followBy(line(900), view),
    900 - 56 - 186,
    "below the fold: it comes up to a quarter of the way down, with what follows in view",
  );
  assert.equal(followBy(line(770), view), 770 - 56 - 186, "cut by the foot: the same");
  assert.equal(
    followBy(line(100, 900), view),
    0,
    "a line longer than the pane that starts in view is never pulled back up",
  );
});

/* ------------------------------- the rest of the thread ------------------------------- */

test("a thread's bubbles name their wire only when its words went by more than one: a call is not a second wire", () => {
  calls();
  const vm = toInboxThreadVM(
    conv([m("m1", 1300), note(), m("m2", 60, { body: "Thanks for calling back!" })], { last_wa_inbound_at: at(60) }),
    null,
    ZONE,
    NOW,
  );
  assert.deepEqual(vm.channels, ["whatsapp", "phone"]);
  const tree = draw(vm);
  const metas = all(tree, hasClass("tl-msg-meta")).map(textOf);
  assert.ok(metas.length > 0, "the bubbles have their times");
  assert.ok(
    metas.every((t) => !t.includes("WhatsApp")),
    `REGRESSION: "WhatsApp" over every bubble of a thread with one call: ${metas.join(" | ")}`,
  );
  assert.equal(textOf(find(tree, hasClass("ix-th-meta"))), "WhatsApp · Phone", "the header names both, once");
});

test("every message carries its own id on the page, the call's card too, so the thread can open at one", () => {
  calls();
  const tree = draw(
    toInboxThreadVM(conv([m("m1", 1300), note(), m("m2", 60)], { last_wa_inbound_at: at(60) }), null, ZONE, NOW),
  );
  assert.deepEqual(
    all(tree, hasClass("tl-msg")).map((b) => b.props["data-mid"]),
    ["m1", "m2"],
  );
  assert.equal(cardOf(tree).props["data-mid"], "e1");
});

/* ------------------------------ the proposal, from the header ------------------------------ */

test("a proposal on file (00154, 0008): the header's Actions put its words in the box -- only where deals are on, the deal's link over the person's, none for someone who passed or a client, only on a real thread with an open window, never for someone who said stop", () => {
  const url = "https://www.docs.example.com/p/emily";
  const dealUrl = "https://quotes.example.com/p/emily-deal";
  globalThis.window.__proposalMessage = proposalMessage;
  globalThis.window.__linkHost = linkHost;
  globalThis.window.__proposalLinkOf = proposalLinkOf;
  const peopleWas = globalThis.window.__PEOPLE;
  // People's row for the person behind the thread, as the surface publishes it: their deal as the row carries it.
  const people = (dealsOn, deal = null, id = "k-emily") => {
    globalThis.window.__PEOPLE = { rows: [{ id, deal }], dealsOn };
  };
  people(true);
  const events = [];
  const dispatched = globalThis.window.dispatchEvent;
  globalThis.window.dispatchEvent = (e) => {
    events.push(e);
    return true;
  };
  try {
    const withLink = (contactOver = {}, convOver = {}) =>
      toInboxThreadVM(
        conv([m("m1", 60)], {
          last_wa_inbound_at: at(60),
          contact: { ...conv([]).contact, proposal_url: url, ...contactOver },
          ...convOver,
        }),
        null,
        ZONE,
        NOW,
      );
    const vm = withLink();
    assert.equal(vm.proposalUrl, url, "the view model carries it");
    assert.equal(vm.windowOpen, true);
    const menuOf = (tree) => find(tree, (n) => n.props?.label === "Actions" && Array.isArray(n.props?.items));
    const menu = menuOf(draw(vm));
    assert.ok(menu, "the header's Actions menu");
    const item = menu.props.items.find((i) => i.label === "Send the proposal");
    assert.ok(item, `the item is there: ${menu.props.items.map((i) => i.label)}`);
    assert.equal(item.hint, "docs.example.com", "the hint says where the link lives");
    item.onClick();
    assert.equal(events.length, 1, "one event");
    assert.equal(events[0].type, "inbox:compose");
    assert.deepEqual(events[0].detail, { text: proposalMessage(url), link: url });

    const labels = (vm2) => menuOf(draw(vm2)).props.items.map((i) => i.label);
    assert.ok(
      !labels(toInboxThreadVM(conv([m("m1", 60)], { last_wa_inbound_at: at(60) }), null, ZONE, NOW)).includes(
        "Send the proposal",
      ),
      "none on file: no item",
    );
    assert.ok(!labels(withLink({ consent: "opted_out" })).includes("Send the proposal"), "said stop: no item");
    const shut = withLink({}, { last_wa_inbound_at: at(1500) });
    assert.equal(shut.windowOpen, false, "a day and an hour since they wrote");
    assert.ok(!labels(shut).includes("Send the proposal"), "a shut window: no item, the box offers the template");
    assert.equal(
      toInboxThreadVM(conv([m("m1", 60)], { contact: { ...conv([]).contact, proposal_url: "  " } }), null, ZONE, NOW)
        .proposalUrl,
      null,
      "blank is none",
    );

    // The link is the deal's (0008, proposalLinkOf over People's row): a proposal out sends its own link...
    const itemFor = () => menuOf(draw(vm)).props.items.find((i) => i.label === "Send the proposal");
    people(true, { stage: "proposed", proposal: { url: dealUrl, host: "quotes.example.com" } });
    assert.equal(itemFor().hint, "quotes.example.com", "the deal's link, not the one left on the person");
    events.length = 0;
    itemFor().onClick();
    assert.deepEqual(events[0].detail, { text: proposalMessage(dealUrl), link: dealUrl });
    // ...a proposal recorded without one sends nothing, and neither does a pass or a client, whatever the person holds.
    for (const deal of [
      { stage: "proposed", proposal: null },
      { stage: "lost", proposal: { url: dealUrl, host: "quotes.example.com" } },
      { stage: "won", proposal: { url: dealUrl, host: "quotes.example.com" } },
      { stage: "ended", proposal: null },
    ]) {
      people(true, deal);
      assert.equal(itemFor(), undefined, `${deal.stage}: no item`);
    }
    // Someone People has not read (or who has no row) keeps the thread's own link, as someone with no deal does.
    people(true, null, "k-someone-else");
    assert.equal(itemFor().hint, "docs.example.com");
    // Where deals are off there is no proposal to send, and before People says whether they are on, no item either.
    people(false);
    assert.equal(itemFor(), undefined, "REGRESSION: a workspace whose customers book was offered a proposal");
    delete globalThis.window.__PEOPLE;
    assert.equal(itemFor(), undefined, "People not read yet: no item");
  } finally {
    globalThis.window.dispatchEvent = dispatched;
    globalThis.window.__PEOPLE = peopleWas;
    delete globalThis.window.__proposalMessage;
    delete globalThis.window.__linkHost;
    delete globalThis.window.__proposalLinkOf;
  }
});
