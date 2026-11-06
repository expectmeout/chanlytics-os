// Who owes the next move on a thread (contracts thread-move.ts): every state a thread can be in, through the one rule. The
// Inbox review of 5 Nov 2026 ran these 31 through the real view model: 14 wore a green Handled and four were true.
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  MISSED_CALL_LINE,
  moveComesTo,
  moveWaits,
  stateOf,
  threadMoveNow,
  threadMoveOf,
  toConversationVM,
  toInboxThreadVM,
} from "@chanlytics/contracts";

const NOW = Date.parse("2026-11-05T20:00:00Z");
const MIN = 60_000;
const DAY = 24 * 60 * MIN;
const ago = (min) => new Date(NOW - min * MIN).toISOString();
const ahead = (min) => new Date(NOW + min * MIN).toISOString();
let seq = 0;
const m = (o) => ({
  id: `m${++seq}`,
  direction: "outbound",
  sender: "ai",
  channel: "whatsapp",
  type: "text",
  body: "words",
  media: null,
  meta: {},
  status: "delivered",
  created_at: ago(60),
  ...o,
});
const inb = (at, o = {}) =>
  m({ direction: "inbound", sender: "customer", status: "received", created_at: ago(at), ...o });
const callNote = (at) =>
  m({
    direction: "inbound",
    sender: "system",
    type: "call_summary",
    channel: "voice",
    status: "received",
    created_at: ago(at),
  });
const dto = (o) => ({
  id: "c1",
  state: "open",
  paused_until: null,
  assignee_user_id: null,
  last_message_at: ago(5),
  last_inbound_at: ago(5),
  last_wa_inbound_at: ago(120),
  contact: {
    id: "p1",
    display_name: "A Person",
    wa_profile_name: null,
    phone_e164: "+12125550101",
    email: "a@example.com",
    consent: "unknown",
  },
  messages: [],
  ...o,
});
const never = { last_inbound_at: null };
const esc = (reason, at = 30) => ({ id: "e1", reason, details: null, state: "open", created_at: ago(at) });
const closedHold = (at) => ({
  reason: "human_token",
  details: "They asked about a price.",
  created_at: ago(at),
  resolved_at: ago(at - 10),
});
const cold = { source: "reach_out" };
const mine = { paused_until: ahead(600), assignee_user_id: "me", assignee_is_me: true };

// [what the thread is, the wire, its open hold, the move, the list it stands in]
const STATES = [
  [
    "the receptionist answered their question",
    dto({ messages: [inb(120), m({ created_at: ago(119) })] }),
    null,
    "answered",
    "done",
  ],
  [
    "your team answered, the pause over",
    dto({ messages: [inb(120), m({ sender: "human", created_at: ago(100) })] }),
    null,
    "answered",
    "done",
  ],
  ["a call the receptionist took", dto({ messages: [callNote(90)] }), null, "call", "done"],
  ["they just wrote, a reply being worked out", dto({ messages: [inb(1)] }), null, "replying", "waiting"],
  [
    "they wrote, a rule set it aside, nothing sent",
    dto({ messages: [inb(600, { meta: { handled: "blocked" } })] }),
    null,
    "unanswered",
    "escalated",
  ],
  [
    "they emailed, and no hold was opened",
    dto({ messages: [inb(600, { channel: "email" })] }),
    null,
    "unanswered",
    "escalated",
  ],
  [
    "an out-of-office came back after a cold email",
    dto({
      messages: [
        m({ channel: "email", sender: "human", meta: cold, created_at: ago(900) }),
        inb(800, { channel: "email", meta: { email: { claim: "auto_reply" } } }),
      ],
    }),
    null,
    "auto_reply",
    "waiting",
  ],
  [
    "a cold email went, they never wrote",
    dto({ ...never, messages: [m({ channel: "email", sender: "human", meta: cold, created_at: ago(4000) })] }),
    null,
    "no_reply",
    "waiting",
  ],
  [
    "you wrote first, they never wrote",
    dto({ ...never, messages: [m({ sender: "human", created_at: ago(4000) })] }),
    null,
    "no_reply",
    "waiting",
  ],
  [
    "a campaign went last, they wrote weeks ago",
    dto({
      messages: [
        inb(40000),
        m({ created_at: ago(39990) }),
        m({ sender: "human", meta: { source: "broadcast", playbook_name: "Win-back" }, created_at: ago(300) }),
      ],
    }),
    null,
    "sent",
    "waiting",
  ],
  ["no messages at all", dto({ ...never, messages: [] }), null, "nothing", "done"],
  ["a call that never connected", dto({ messages: [callNote(90)] }), null, "call", "done"],
  [
    "an open hold: they asked for a person",
    dto({ state: "needs_human", messages: [inb(40), m({ created_at: ago(39) })] }),
    esc("human_token", 38),
    "needs_you",
    "escalated",
  ],
  ["an open hold: owed a call back", dto({ messages: [callNote(90)] }), esc("callback", 89), "needs_you", "escalated"],
  [
    "the needs_human state with no hold row",
    dto({ state: "needs_human", messages: [inb(40)] }),
    null,
    "needs_you",
    "escalated",
  ],
  [
    "a draft counting down",
    dto({ messages: [inb(3), m({ status: "queued", created_at: ago(1), meta: { delay_ms: 180000 } })] }),
    null,
    "sending",
    "escalated",
  ],
  [
    "you have it, you answered",
    dto({ ...mine, messages: [inb(60), m({ sender: "human", created_at: ago(50) })] }),
    null,
    "yours",
    "waiting",
  ],
  [
    "you have it, they wrote again",
    dto({ ...mine, messages: [inb(60), m({ sender: "human", created_at: ago(50) }), inb(10)] }),
    esc("wrote_while_held", 10),
    "wrote_again",
    "escalated",
  ],
  [
    "you have it, your reply failed",
    dto({ ...mine, messages: [inb(60), m({ sender: "human", status: "failed", created_at: ago(50) })] }),
    esc("send_failed", 49),
    "failed",
    "escalated",
  ],
  [
    "paused, no hold, nobody assigned",
    dto({ paused_until: ahead(600), messages: [inb(60), m({ sender: "human", created_at: ago(50) })] }),
    null,
    "yours",
    "waiting",
  ],
  [
    "a teammate has it, a hold open",
    dto({ assignee_user_id: "other", assignee_is_me: false, messages: [inb(60)] }),
    esc("human_token", 59),
    "theirs",
    "waiting",
  ],
  [
    "a teammate's name left on a quiet thread",
    dto({ assignee_user_id: "other", assignee_is_me: false, messages: [inb(60), m({ created_at: ago(59) })] }),
    null,
    "answered",
    "done",
  ],
  [
    "a hold closed, nothing sent, they wrote last",
    dto({ messages: [inb(700)], last_hold: closedHold(690) }),
    null,
    "unanswered",
    "escalated",
  ],
  [
    "they wrote, our reply failed",
    dto({ messages: [inb(60), m({ status: "failed", created_at: ago(59) })] }),
    null,
    "failed",
    "escalated",
  ],
  [
    "we had answered, a later send failed",
    dto({
      messages: [inb(120), m({ created_at: ago(119) }), m({ sender: "human", status: "failed", created_at: ago(30) })],
    }),
    null,
    "failed",
    "escalated",
  ],
  [
    "the only thing we sent failed",
    dto({ ...never, messages: [m({ sender: "human", status: "failed", created_at: ago(30) })] }),
    null,
    "failed",
    "escalated",
  ],
  [
    "they asked to stop",
    dto({
      contact: { id: "p1", display_name: "A Person", phone_e164: "+12125550101", consent: "opted_out" },
      messages: [inb(60, { body: "STOP" })],
    }),
    esc("opt_out", 59),
    "stopped",
    "done",
  ],
  [
    "snoozed, nothing owed",
    dto({ state: "snoozed", snooze_until: ahead(900), messages: [inb(60), m({ created_at: ago(59) })] }),
    null,
    "snoozed",
    "snoozed",
  ],
  [
    "snoozed, a request still open",
    dto({ state: "snoozed", snooze_until: ahead(900), messages: [inb(60)] }),
    esc("human_token", 59),
    "snoozed",
    "snoozed",
  ],
  ["archived", dto({ state: "archived", messages: [inb(600), m({ created_at: ago(599) })] }), null, "archived", "out"],
  [
    "set aside as not a customer",
    dto({
      state: "archived",
      set_aside_at: ago(100),
      set_aside_why: "pitch",
      messages: [inb(600, { channel: "email" })],
    }),
    null,
    "aside",
    "aside",
  ],
];

test("all 31 states a thread can be in", () => assert.equal(STATES.length, 31));

for (const [name, wire, hold, move, list] of STATES) {
  test(`${name}: ${move}, in ${list}`, () => {
    const got = threadMoveOf(wire, hold, NOW);
    assert.deepEqual([got.move, got.list], [move, list]);
    // The view model carries the one answer, and a pill can say each of them: nothing falls through to the value itself.
    assert.equal(toInboxThreadVM(wire, hold, "America/New_York", new Date(NOW)).move.move, move);
    assert.equal(
      toConversationVM(wire, hold, "America/New_York", new Date(NOW)).move.move,
      move,
      "Conversations says the same",
    );
    if (move !== "nothing") assert.notEqual(stateOf("thread", move).label, move, `${move} has words`);
  });
}

test("green is earned: a thread reads Handled only where something answered it", () => {
  const green = STATES.filter(([, wire, hold]) => stateOf("thread", threadMoveOf(wire, hold, NOW).move).tone === "ok");
  assert.deepEqual(
    green.map(([name]) => name),
    [
      "the receptionist answered their question",
      "your team answered, the pause over",
      "a call the receptionist took",
      "a call that never connected",
      "a teammate's name left on a quiet thread",
    ],
  );
});

test("each word wears one colour: Needs you amber, a countdown coral, a failure always red", () => {
  assert.equal(stateOf("thread", "needs_you").tone, "warn");
  assert.equal(stateOf("thread", "sending").tone, "accent");
  assert.equal(stateOf("thread", "failed").tone, "danger");
  assert.equal(stateOf("thread", "unanswered").tone, "warn");
  assert.equal(stateOf("thread", "stopped").tone, "plain");
  assert.equal(stateOf("thread", "archived").tone, "plain");
});

test("an answered thread says who answered it, in Conversations' words", () => {
  const [, ai] = STATES[0];
  const [, team] = STATES[1];
  assert.equal(threadMoveOf(ai, null, NOW).by, "the receptionist");
  assert.equal(threadMoveOf(team, null, NOW).by, "your team");
});

test("a reply being worked out ends by the clock: three minutes, then nobody has answered", () => {
  const wire = dto({ messages: [inb(1)] });
  const move = threadMoveOf(wire, null, NOW);
  assert.equal(threadMoveNow(move, NOW).move, "replying");
  assert.equal(threadMoveNow(move, NOW + MIN + 59_000).move, "replying");
  assert.equal(threadMoveNow(move, NOW + 2 * MIN).move, "unanswered");
  assert.equal(threadMoveNow(move, NOW + 2 * MIN).list, "escalated");
});

test("a message a rule set aside is answered by nobody, however new", () => {
  for (const handled of ["blocked", "held", "handoff"]) {
    const wire = dto({ messages: [inb(1, { meta: { handled } })] });
    assert.equal(threadMoveOf(wire, null, NOW).move, "unanswered", handled);
  }
  assert.equal(threadMoveOf(dto({ messages: [inb(1, { meta: { handled: "ai" } })] }), null, NOW).move, "replying");
});

test("a draft goes at zero, is on its way for the reply's three minutes, then stands as the thread does", () => {
  const wire = dto({ messages: [inb(3), m({ status: "queued", created_at: ago(1), meta: { delay_ms: 180000 } })] });
  const move = threadMoveOf(wire, null, NOW);
  const sends = move.until.atMs;
  assert.equal(threadMoveNow(move, sends - 1).move, "sending");
  assert.equal(threadMoveNow(move, sends).move, "replying");
  assert.equal(
    threadMoveNow(move, sends + 3 * MIN).move,
    "unanswered",
    "no read has said it sent, and nobody has answered",
  );
});

test("a draft this tab has held never sends: the thread stands as if there were none", () => {
  const wire = dto({ messages: [inb(10), m({ status: "queued", created_at: ago(1), meta: { delay_ms: 180000 } })] });
  assert.equal(threadMoveNow(threadMoveOf(wire, null, NOW), NOW, true).move, "unanswered");
});

test("a wait goes quiet after People's thirty days, and leaves the list that asks for a move", () => {
  const thirty = 30 * DAY;
  const cases = [
    [dto({ messages: [inb(600)] }), "unanswered"],
    [dto({ ...never, messages: [m({ sender: "human", created_at: ago(600) })] }), "no_reply"],
    [
      dto({
        messages: [
          inb(40000),
          m({ created_at: ago(39990) }),
          m({ sender: "human", meta: { source: "broadcast" }, created_at: ago(600) }),
        ],
      }),
      "sent",
    ],
    [dto({ messages: [inb(700), m({ status: "failed", created_at: ago(600) })] }), "failed"],
  ];
  for (const [wire, move] of cases) {
    const m0 = threadMoveOf(wire, null, NOW);
    assert.equal(m0.move, move);
    const later = threadMoveNow(m0, NOW + thirty);
    assert.deepEqual([later.move, later.list], ["went_quiet", "done"], move);
    // And as a read made then says it, with no clock to run.
    assert.equal(threadMoveOf(wire, null, NOW + thirty).move, "went_quiet", move);
  }
});

test("a thread old on its own clock is quiet the moment it is read: an import's created_at is the import's", () => {
  const old = new Date(NOW - 90 * DAY).toISOString();
  const wire = dto({ messages: [inb(1, { channel_ts: old })] });
  assert.equal(threadMoveOf(wire, null, NOW).move, "went_quiet");
});

test("someone spoke to them after what they wrote: the call is the last word, and nobody is left unanswered", () => {
  const spoke = (at) =>
    m({
      direction: "inbound",
      sender: "system",
      type: "call_summary",
      channel: "voice",
      status: "received",
      body: "Inbound call · 2 min. Wanted a price.",
      created_at: ago(at),
    });
  const said = (over) => threadMoveOf(dto(over), null, NOW);
  // Thanked us on Monday, phoned on Wednesday.
  assert.deepEqual(
    [said({ messages: [inb(5000), spoke(2000)] }).move, said({ messages: [inb(5000), spoke(2000)] }).list],
    ["call", "done"],
  );
  assert.equal(said({ messages: [inb(1000), spoke(2000)] }).move, "unanswered", "they wrote after the call");
  // A campaign, then they rang and spoke to the receptionist.
  assert.equal(
    said({ messages: [m({ sender: "human", meta: { source: "broadcast" }, created_at: ago(3000) }), spoke(2000)] })
      .move,
    "call",
  );
});

test("a call that never connected is nobody speaking to them: what they wrote is still unanswered", () => {
  const missed = m({
    direction: "inbound",
    sender: "system",
    type: "call_summary",
    channel: "voice",
    status: "received",
    body: MISSED_CALL_LINE,
    created_at: ago(2000),
  });
  assert.equal(threadMoveOf(dto({ messages: [inb(5000), missed] }), null, NOW).move, "unanswered");
  // Only ever a missed call: nothing written, and nobody has words to answer.
  assert.equal(threadMoveOf(dto({ messages: [missed] }), null, NOW).move, "call");
});

test("a read says ahead of it what the clock brings: the dock is there the moment a reply being worked out runs out", () => {
  const coming = toInboxThreadVM(dto({ messages: [inb(1)] }), null, "America/New_York", new Date(NOW));
  assert.equal(coming.move.move, "replying");
  assert.ok(coming.unanswered, "its words, for when the clock brings it");
  assert.equal(coming.lastWord.text, "They wrote last — no reply yet.", "and not said yet");
  assert.ok(moveComesTo(coming.move, "unanswered"));
  const answered = threadMoveOf(dto({ messages: [inb(60), m({ created_at: ago(59) })] }), null, NOW);
  assert.equal(moveComesTo(answered, "unanswered"), false);
  const quiet = toInboxThreadVM(dto({ messages: [inb(60000)] }), null, "America/New_York", new Date(NOW));
  assert.equal(quiet.unanswered, null, "gone quiet: no dock, and nothing to come");
});

test("a campaign's send that failed asks nobody here: its run reports it, and a thousand of them fill no one's Needs you", () => {
  const wire = dto({
    ...never,
    messages: [m({ channel: "email", sender: "human", meta: cold, status: "failed", created_at: ago(30) })],
  });
  const got = threadMoveOf(wire, null, NOW);
  assert.deepEqual([got.move, got.list], ["failed", "done"]);
  assert.deepEqual(moveWaits(got), { needsYou: false, send: null });
});

test("a teammate answers for a failure on their own thread", () => {
  const wire = dto({
    assignee_user_id: "other",
    assignee_is_me: false,
    messages: [inb(60), m({ sender: "human", status: "failed", created_at: ago(50) })],
  });
  assert.equal(threadMoveOf(wire, esc("human_token", 59), NOW).move, "theirs");
});

test("a person who asked to stop and asked for a person is still asked for", () => {
  const stop = { id: "p1", display_name: "A Person", phone_e164: "+12125550101", consent: "opted_out" };
  const wire = dto({ contact: stop, messages: [inb(60)] });
  assert.equal(threadMoveOf(wire, esc("human_token", 59), NOW).move, "needs_you");
});

test("what waits on you is the list that says so: a hold, or a reply that can still be stopped", () => {
  for (const [name, wire, hold] of STATES) {
    const move = threadMoveOf(wire, hold, NOW);
    const w = moveWaits(move);
    assert.equal(!!(w.needsYou || w.send), move.list === "escalated", name);
  }
});
