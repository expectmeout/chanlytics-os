/**
 * The first run's Try it (docs/superpowers/plans/2026-09-24-first-run-5-try-live.md, 5a): listening, nothing yet, the
 * call as it happens, and after it where a caller who asks for a person goes. The view model, over made-up Setup reads
 * and the Live page's own calls.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  setupSteps,
  firstRunTryOf,
  FIRST_RUN_TRY_WORDS as W,
  TRY_QUIET_AFTER_MS,
  FIRST_RUN_HELPERS,
  HANDOFF_FORWARDS_BACK,
} from "@chanlytics/contracts";

const NOW = Date.parse("2026-09-24T15:00:00Z");
const SINCE = NOW - 60_000;
const VOICE = "+13055550142";
const KEPT = "+13055550100";
const CELL = "+17865550199";

const dtoOf = (over = {}) => ({
  business: {
    name: "Harbor Moving",
    hours: true,
    services: 2,
    bookingLink: true,
    address: true,
    handoff: null,
    broken: false,
    receptionist: "set",
  },
  channels: {
    whatsapp: { present: false, active: false, number: null, quality: null, lastInboundAt: null },
    voice: { present: true, active: true, number: VOICE, lastInboundAt: null },
  },
  templates: { approved: 0, pending: 0, startersApproved: 0 },
  calendar: { state: "none" },
  team: { members: 1, invitesOpen: 0, alertEmails: 1 },
  consent: { yes: 0, offers: 0, offersSaidYes: 0 },
  requests: { line: null },
  lines: { rows: [], ready: true, provider: "twilio", costs: { local_number_month_usd: 1.15 } },
  ...over,
});
const keptLine = (state = "instructed", facts = {}) => ({
  id: "fw-1",
  e164: KEPT,
  kind: "forwarded",
  provider: "carrier",
  area_code: 305,
  voice_state: "none",
  sms_state: "none",
  whatsapp_state: "none",
  port_state: "none",
  forwarding_state: state,
  step: null,
  last_error: null,
  state_since: "2026-09-24T14:50:00Z",
  created_at: "2026-09-24T14:50:00Z",
  forwarding: {
    carrier: "verizon",
    mode: "unanswered",
    destination_e164: VOICE,
    test_from: null,
    test_until: null,
    verified_at: null,
    ...facts,
  },
});
const forwarded = (state, facts) => dtoOf({ lines: { ...dtoOf().lines, rows: [keptLine(state, facts)] } });
const callOf = (over = {}) => ({
  callId: "c1",
  cvId: "cv-c1",
  clientId: null,
  who: "(786) 555-0199",
  whoShort: "(786) 555-0199",
  initials: "7",
  number: "+1 (786) 555-0199",
  from: CELL,
  direction: "inbound",
  status: "ongoing",
  live: true,
  missed: false,
  stale: false,
  checking: false,
  checkingWhy: null,
  startedAtMs: NOW - 20_000,
  heartbeatAtMs: NOW - 2_000,
  startedLabel: "2:59 PM",
  duration: null,
  lengthWords: null,
  transcript: [
    { speaker: "agent", text: "Thank you for calling Harbor Moving!", t: "0:01" },
    { speaker: "client", text: "Are you open on Sunday?", t: "0:05" },
    { speaker: "platform", text: "handed over", t: "0:06" },
  ],
  ...over,
});
const tryOf = (dto, calls = [], since = SINCE, nowMs = NOW) =>
  firstRunTryOf({ dto, vm: setupSteps(dto, nowMs), calls, since, nowMs });

test("published for the page", () => {
  assert.equal(FIRST_RUN_HELPERS.tryIt, firstRunTryOf);
  assert.equal(FIRST_RUN_HELPERS.tryWords, W);
  assert.equal(TRY_QUIET_AFTER_MS, 180_000);
});

test("listening (canvas R6): a kept number is called and not picked up, with its route and the test window's minutes", () => {
  const vm = tryOf(forwarded("instructed", { test_until: new Date(NOW + 24 * 60_000).toISOString() }));
  assert.equal(vm.stage, "listen");
  assert.equal(vm.heading, "Call your number from your cell. Don't pick up.");
  assert.deepEqual([vm.number, vm.forwarded], ["+1 (305) 555-0100", true]);
  assert.deepEqual(vm.listening, {
    sentence: "Listening for your call",
    detail: "This page changes the moment it picks up. Open for 24 more minutes.",
    route: "Your cell calls +1 (305) 555-0100 → nobody picks up → your receptionist answers",
  });
  assert.equal(vm.help, "Ask Chanlytics for help", "a person can set a kept number's forwarding up with them");
  assert.equal(vm.openTest, null, "a window is open: nothing to open");
  assert.equal(tryOf(forwarded("instructed")).openTest, "fw-1", "no window yet: the page opens one");
  assert.equal(tryOf(forwarded("verified")).openTest, null, "proven: nothing to open");
  const own = tryOf(dtoOf());
  assert.deepEqual(
    [own.heading, own.number, own.listening.route, own.listening.detail, own.help],
    [
      "Call your receptionist from your cell.",
      "+1 (305) 555-0142",
      null,
      "This page changes the moment it picks up.",
      null,
    ],
  );
});

test("nothing came through (canvas V7): after three minutes, the causes of a missed call", () => {
  const late = SINCE + TRY_QUIET_AFTER_MS;
  const vm = tryOf(forwarded("instructed"), [], SINCE, late);
  assert.equal(vm.stage, "quiet");
  assert.equal(vm.heading, "No call has reached your receptionist yet");
  assert.equal(vm.listening.sentence, "Still listening");
  assert.equal(vm.causes.length, 3);
  assert.match(vm.causes[1].question, /answering machine or voicemail/);
  const own = tryOf(dtoOf(), [], SINCE, late);
  assert.deepEqual(own.causes, [
    { question: "Did you call +1 (305) 555-0142?", answer: "That's the number your receptionist answers." },
  ]);
});

test("it picked up (canvas R7, P6): forwarding works, on the call now, the turns a moment behind", () => {
  const vm = tryOf(forwarded("verified"), [callOf()]);
  assert.equal(vm.stage, "call");
  assert.equal(vm.heading, "It picked up.");
  assert.deepEqual(
    [vm.call.line, vm.call.behind, vm.call.test, vm.call.to],
    [
      "Forwarding works · on the call now · 0:20",
      "Words arrive a moment behind the call.",
      true,
      "conversations/cv-c1",
    ],
  );
  assert.deepEqual(
    vm.call.turns.map((t) => [t.who, t.text]),
    [
      ["Receptionist", "Thank you for calling Harbor Moving!"],
      ["You", "Are you open on Sunday?"],
    ],
    "the two voices only: what Chanlytics told the agent is not the call",
  );
  assert.equal(tryOf(dtoOf(), [callOf()]).call.line, "Your receptionist answered · on the call now · 0:20");
  assert.match(
    tryOf(forwarded("instructed"), [callOf()]).call.line,
    /^Your receptionist answered/,
    "forwarding is said to work only once a call proved it: this one may have dialed the receptionist itself",
  );
  assert.equal(
    tryOf(dtoOf(), [callOf({ startedAtMs: SINCE - 5 * 60_000 })]).stage,
    "listen",
    "a call from before the screen opened is not the test",
  );
  assert.equal(tryOf(dtoOf(), [callOf({ direction: "outbound" })]).stage, "listen");
});

test("after the call (canvas R8, P7): the call said, and the phone it came from offered as the transfer, never the kept number", () => {
  const ended = callOf({ live: false, status: "ended", duration: "0:48" });
  const vm = tryOf(forwarded("verified"), [ended]);
  assert.equal(vm.stage, "done");
  assert.equal(vm.heading, "That's your receptionist.");
  assert.equal(vm.call.line, "0:48 · from +1 (786) 555-0199 · through +1 (305) 555-0100 · 2:59 PM");
  assert.equal(
    tryOf(forwarded("instructed"), [ended]).call.line,
    "0:48 · from +1 (786) 555-0199 · 2:59 PM",
    "not proven: not said to have come through the kept number",
  );
  assert.deepEqual(
    vm.transfer.options.map((o) => [o.key, o.label, o.to]),
    [
      ["caller", "Put them through to +1 (786) 555-0199", CELL],
      ["message", "Take a message and email me", null],
    ],
  );
  assert.equal(vm.transfer.value, "message", "nothing on record: a message");
  assert.equal(vm.transfer.note, "Not +1 (305) 555-0100: while it forwards, that call would ring straight back here.");
  // Called from the kept number itself: it cannot be the transfer (HANDOFF_FORWARDS_BACK's rule).
  assert.ok(HANDOFF_FORWARDS_BACK);
  const fromKept = tryOf(forwarded("verified"), [callOf({ live: false, from: KEPT })]);
  assert.deepEqual(
    fromKept.transfer.options.map((o) => o.key),
    ["message"],
  );
  // A number on record already: kept as a choice, and chosen.
  const onRecord = tryOf(
    dtoOf({ ...forwarded("verified"), business: { ...dtoOf().business, handoff: "+12125550143" } }),
    [ended],
  );
  assert.deepEqual(
    onRecord.transfer.options.map((o) => o.key),
    ["caller", "current", "message"],
  );
  assert.equal(onRecord.transfer.value, "current");
  const same = tryOf(dtoOf({ business: { ...dtoOf().business, handoff: CELL } }), [ended]);
  assert.equal(same.transfer.value, "caller");
  assert.equal(same.transfer.note, null, "a number it answers itself forwards nothing");
});

test("a call that came in before: shown again, once one has reached the receptionist", () => {
  const before = callOf({ live: false, startedAtMs: SINCE - 3_600_000 });
  const tried = dtoOf({
    channels: { ...dtoOf().channels, voice: { ...dtoOf().channels.voice, lastInboundAt: "2026-09-24T14:00:00Z" } },
  });
  const shown = tryOf(tried, [before]);
  assert.equal(shown.stage, "done");
  assert.equal(shown.call.test, false, "it may be a customer's");
  assert.deepEqual(
    shown.call.turns.map((t) => t.who),
    ["Receptionist", "Caller", "Receptionist"].slice(0, shown.call.turns.length),
    "never called You",
  );
  assert.deepEqual(
    shown.transfer.options.map((o) => o.key),
    ["message"],
    "a caller who may be a customer is never offered as the transfer",
  );
});

test("no line that answers: Setup's rows", () => {
  const off = dtoOf({
    channels: { ...dtoOf().channels, voice: { present: false, active: false, number: null, lastInboundAt: null } },
  });
  assert.equal(tryOf(off).stage, "rows");
});
