/**
 * A time a customer asked for that the owner never answered (decision 0061, amended 22 Nov 2026): when it runs out, AI
 * tells the customer once, the conversation goes back to AI and the request closes as not confirmed in time; where the
 * message may not go, nothing is sent and the request is left for a person to reply to. Core's verb over fakes for its
 * ports, so what is proved is what is asked of the writer, what the door is handed, and that nothing is asked twice.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  BOOKING_REQUEST_WORDS,
  HOUR_MS,
  MIN_MS,
  REQUEST_LAPSE_WORDS,
  REQUEST_TOLD_WITHIN_MS,
  holdDraftInstruction,
  requestLapseInstruction,
} from "@chanlytics/contracts";
import { importSrc } from "../../_source.mjs";

const { settleLapsedRequest, lapseHoldOf } = await importSrc("packages/core/src/calendar/index.ts");

const T = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const ROW = "dddddddd-0000-4000-8000-00000000d001";
const CONV = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
const TZ = "America/New_York";
/** Asked Thursday 15 Oct at noon UTC for Saturday 17 Oct, 2 PM in New York: it runs out 23 hours on. */
const ASKED = Date.parse("2026-10-15T12:00:00.000Z");
const EXPIRES = ASKED + 23 * HOUR_MS;
const NOW = new Date(EXPIRES + 4 * MIN_MS);

const request = (over = {}) => ({
  id: ROW,
  source: "receptionist",
  status: "proposed",
  conversationId: CONV,
  contactId: "k1",
  startsAt: "2026-10-17T18:00:00.000Z",
  endsAt: "2026-10-17T20:00:00.000Z",
  service: "Balayage",
  timezone: TZ,
  expiresAt: new Date(EXPIRES).toISOString(),
  askedAt: new Date(ASKED).toISOString(),
  phone: "+13055550142",
  ...over,
});

const thread = (over = {}) => ({
  holdReason: "booking_request",
  wire: "whatsapp",
  clocks: { whatsapp: new Date(ASKED).toISOString(), instagram: null },
  optedOut: false,
  forMessageId: "m1",
  theirWords: "Saturday at 2 works",
  personSpoke: false,
  liveHold: false,
  ...over,
});

function world(over = {}) {
  const log = [];
  const ports = {
    request: async () => ("request" in over ? over.request : request()),
    thread: async (...args) => {
      log.push(["thread", ...args]);
      return "thread" in over ? over.thread : thread();
    },
    posture: async (...args) => {
      log.push(["posture", ...args]);
      return over.posture ?? { mode: "auto", delayMs: 0, paused: false };
    },
    write: async (tenantId, ask) => {
      log.push(["write", tenantId, ask]);
      if (over.write instanceof Error) throw over.write;
      return over.write ?? { text: "Lo siento, no pudimos confirmar el sábado a las 2.", subject: "", used: [] };
    },
    lapse: async (cmd) => {
      log.push(["lapse", cmd]);
      return over.lapse ?? (cmd.told ? { outcome: "told", messageId: "msg-1" } : { outcome: "reply" });
    },
  };
  const calls = (name) => log.filter(([n]) => n === name);
  return { ports, log, calls };
}
const run = (w, now = NOW) =>
  settleLapsedRequest(w.ports, { tenantId: T, appointmentId: ROW, now, deadline: now.getTime() + 30_000 });

test("nobody answered: AI is asked for the words once, and one message is queued with the request's close", async () => {
  const w = world();
  assert.equal(await run(w), "told");
  const [[, tenantId, ask]] = w.calls("write");
  assert.equal(tenantId, T);
  assert.equal(ask.conversationId, CONV);
  assert.equal(ask.wire, "whatsapp");
  assert.equal(ask.source, "hold");
  // What it is asked to say is the request's own time, on the business's clock, and nothing a member typed.
  assert.equal(ask.instruction, requestLapseInstruction("Sat, Oct 17, 2:00 PM", "Balayage"));
  assert.equal(ask.given, null);
  assert.equal(ask.deadline, NOW.getTime() + 30_000);
  assert.equal(w.calls("write").length, 1);
  const [[, cmd]] = w.calls("lapse");
  assert.equal(cmd.tenantId, T);
  assert.equal(cmd.appointmentId, ROW);
  assert.equal(cmd.replyWords, REQUEST_LAPSE_WORDS.reply("Sat, Oct 17, 2:00 PM", "Balayage"));
  assert.deepEqual(cmd.told, {
    conversationId: CONV,
    contactId: "k1",
    channel: "whatsapp",
    to: "+13055550142",
    body: "Lo siento, no pudimos confirmar el sábado a las 2.",
    dueAt: NOW,
    // It never leaves more than two hours after the request ran out, whatever held it.
    staleAfter: new Date(EXPIRES + REQUEST_TOLD_WITHIN_MS),
  });
  assert.equal(w.calls("lapse").length, 1);
});

test("a workspace that holds replies for a Stop: the message waits its window, like every reply", async () => {
  const w = world({ posture: { mode: "veto", delayMs: 3 * MIN_MS, paused: false } });
  assert.equal(await run(w), "told");
  assert.equal(w.calls("lapse")[0][1].told.dueAt.getTime(), NOW.getTime() + 3 * MIN_MS);
});

test("a text's request is told by text", async () => {
  const w = world({ thread: thread({ wire: "sms", clocks: { whatsapp: null, instagram: null } }) });
  assert.equal(await run(w), "told");
  assert.equal(w.calls("lapse")[0][1].told.channel, "sms");
});

/** Each of these sends nothing, asks no model, and leaves the request for a person to reply to. */
const HELD = [
  ["a person typed a reply since they asked", { thread: thread({ personSpoke: true }) }, "person_answered"],
  ["the customer asked to stop", { thread: thread({ optedOut: true }) }, "opted_out"],
  ["a person or a call holds the conversation", { thread: thread({ liveHold: true }) }, "person_has_it"],
  ["the workspace is paused", { posture: { mode: "auto", delayMs: 0, paused: true } }, "paused"],
  ["replies ask first", { posture: { mode: "ask", delayMs: 0, paused: false } }, "asks_first"],
  ["AI stays quiet", { posture: { mode: "never", delayMs: 0, paused: false } }, "asks_first"],
  [
    "WhatsApp's reply window closed",
    { thread: thread({ clocks: { whatsapp: new Date(ASKED - 2 * HOUR_MS).toISOString(), instagram: null } }) },
    "window_closed",
  ],
  ["they wrote on a wire it does not answer on", { thread: thread({ wire: "email" }) }, "no_wire"],
  ["the request kept no number", { request: request({ phone: null }) }, "no_wire"],
];
for (const [name, over, why] of HELD) {
  test(`${name}: nothing is sent, and the request waits on a reply`, async () => {
    const w = world(over);
    assert.equal(await run(w), "reply");
    assert.equal(w.calls("write").length, 0, "no model is asked for words that cannot go");
    const [[, cmd]] = w.calls("lapse");
    assert.equal(cmd.told, null);
    assert.equal(cmd.why, why);
    assert.equal(cmd.replyWords, REQUEST_LAPSE_WORDS.reply("Sat, Oct 17, 2:00 PM", "Balayage"));
  });
}

test("a tick more than two hours late sends nothing and leaves the reply", async () => {
  const w = world();
  assert.equal(await run(w, new Date(EXPIRES + REQUEST_TOLD_WITHIN_MS + MIN_MS)), "reply");
  assert.equal(w.calls("write").length, 0);
  assert.equal(w.calls("lapse")[0][1].why, "late");
});

test("a writer that refuses, or has no words, sends nothing and leaves the reply", async () => {
  const w = world({ write: { why: "budget" } });
  assert.equal(await run(w), "reply");
  assert.equal(w.calls("lapse")[0][1].told, null);
  assert.equal(w.calls("lapse")[0][1].why, "not_written");
});

test("a writer that throws is the job's to try again: nothing is closed and nothing is sent", async () => {
  const w = world({ write: new Error("the model timed out") });
  await assert.rejects(run(w), /timed out/);
  assert.equal(w.calls("lapse").length, 0);
});

test("a writer that still throws at the last moment it could be told leaves the reply", async () => {
  // By text, where no reply window closes an hour after the request ran out, as WhatsApp's does.
  const w = world({
    write: new Error("the model timed out"),
    thread: thread({ wire: "sms", clocks: { whatsapp: null, instagram: null } }),
  });
  const last = new Date(EXPIRES + REQUEST_TOLD_WITHIN_MS - MIN_MS);
  // The job says it is its last try: the request is not left open for a run that will never come.
  const out = await settleLapsedRequest(w.ports, {
    tenantId: T,
    appointmentId: ROW,
    now: last,
    deadline: last.getTime() + 30_000,
    lastTry: true,
  });
  assert.equal(out, "reply");
  assert.equal(w.calls("lapse")[0][1].why, "not_written");
});

test("a request answered, replaced or gone meanwhile is nobody's: nothing is read, written or closed", async () => {
  for (const over of [
    { request: null },
    { request: request({ status: "booked" }) },
    { request: request({ status: "cancelled" }) },
  ]) {
    const w = world(over);
    assert.equal(await run(w), over.request ? "answered" : "gone");
    assert.equal(w.log.length, 0);
  }
});

test("a request that has not run out yet is left alone", async () => {
  const w = world();
  assert.equal(await run(w, new Date(EXPIRES - MIN_MS)), "early");
  assert.equal(w.log.length, 0);
});

test("a hold that is no longer the request's is left as it stands: the request closes, nothing is sent", async () => {
  const w = world({ thread: thread({ holdReason: "send_failed" }), lapse: { outcome: "closed" } });
  assert.equal(await run(w), "closed");
  assert.equal(w.calls("write").length, 0);
  assert.equal(w.calls("lapse")[0][1].told, null);
  assert.equal(w.calls("lapse")[0][1].why, "hold_moved");
});

test("a second run finds the request closed by the first, and the door's answer is the outcome", async () => {
  const w = world({ lapse: { outcome: "answered" } });
  assert.equal(await run(w), "answered");
});

test("the rule says why, in one order: late, then the person, then the workspace, then the wire", () => {
  const base = {
    nowMs: EXPIRES + MIN_MS,
    expiresAtMs: EXPIRES,
    holdReason: "booking_request",
    personSpoke: false,
    optedOut: false,
    liveHold: false,
    paused: false,
    mode: "auto",
    wire: "whatsapp",
    clocks: { whatsapp: new Date(ASKED).toISOString(), instagram: null },
    phone: "+13055550142",
  };
  assert.equal(lapseHoldOf(base), null);
  assert.equal(lapseHoldOf({ ...base, holdReason: null }), "hold_moved");
  assert.equal(lapseHoldOf({ ...base, nowMs: EXPIRES + REQUEST_TOLD_WITHIN_MS + 1, personSpoke: true }), "late");
  assert.equal(lapseHoldOf({ ...base, personSpoke: true, optedOut: true }), "person_answered");
  assert.equal(lapseHoldOf({ ...base, optedOut: true, paused: true }), "opted_out");
  assert.equal(lapseHoldOf({ ...base, paused: true, mode: "ask" }), "paused");
  assert.equal(lapseHoldOf({ ...base, mode: "ask", wire: "email" }), "asks_first");
  assert.equal(lapseHoldOf({ ...base, mode: "veto" }), null);
});

test("what AI is asked to write is the time, short enough for a text, with nothing confirmed or promised", () => {
  const asked = requestLapseInstruction("Sat, Oct 17, 2:00 PM", "Balayage");
  assert.match(asked, /They asked to book Sat, Oct 17, 2:00 PM for Balayage/);
  assert.match(asked, /two or three short sentences/);
  assert.match(asked, /Confirm no time yourself/);
  assert.match(asked, /nothing about when the team will answer/);
});

test("a reply about a time that isn't booked is drafted knowing the time: the card's own line, less its words to the owner", () => {
  // A request that ran out and could not be told: the draft the owner is handed says what AI would have said.
  const ranOut = holdDraftInstruction("booking_reply", REQUEST_LAPSE_WORDS.reply("Sat, Oct 17, 2:00 PM", "Balayage"));
  assert.match(ranOut, /Sat, Oct 17, 2:00 PM · Balayage wasn't confirmed in time/);
  assert.doesNotMatch(ranOut, /reply to them/);
  assert.match(ranOut, /two or three short sentences/);
  assert.match(ranOut, /Confirm no time yourself/);
  // The owner's own Can't leaves the same kind of card: its draft is told the same way.
  const cant = holdDraftInstruction("booking_reply", BOOKING_REQUEST_WORDS.cant("Sat, Oct 17, 2:00 PM", "Balayage"));
  assert.match(cant, /Couldn't book Sat, Oct 17, 2:00 PM · Balayage/);
  assert.doesNotMatch(cant, /reply to them/);
  // A card with no line of its own is still told what it is about; a line of any length is kept to one short line.
  assert.match(holdDraftInstruction("booking_reply", null), /it isn't booked\. Tell them/);
  const long = holdDraftInstruction("booking_reply", `${"x".repeat(400)}\nsecond line`);
  assert.ok(long.length < 800, "a long line is clipped");
  assert.doesNotMatch(long, /\n/);
});

test("any other card's draft is told nothing more than its reason", () => {
  for (const reason of ["booking_request", "policy_ask", "send_failed", "stale", null])
    assert.equal(holdDraftInstruction(reason, "Asked for Sat, Oct 17, 2:00 PM · Balayage"), null);
});
