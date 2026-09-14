/**
 * The Live view model, EXECUTED.
 *
 * Pins what the page may claim: which calls are "right now" (the heartbeat
 * rule, never the status flag), the order they are listed in, the clock's
 * source, the two honest waits ("checking with the provider", "summary on
 * its way"), the missed dial, and the line's own state.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  toLiveVM, toLiveCallVM, fmtClock,
  LIVE_STALE_MS, LIVE_OVERLONG_MS, ANALYSIS_GRACE_MS, RECENT_MAX, CALL_HEARTBEAT_MS,
} from "@chanlytics/contracts";

// The workspace's zone: every view model says its times by it (contracts clock.ts).
const ZONE = "America/New_York";

const NOW = new Date("2026-09-04T18:14:00.000Z");
const ago = (ms) => new Date(NOW.getTime() - ms).toISOString();

function call(id, over = {}) {
  return {
    id, retell_call_id: `r-${id}`, direction: "inbound", call_type: "phone_call",
    from_e164: "+17865550181", from_raw: "+17865550181", to_e164: "+13083368109",
    started_at: ago(161_000), ended_at: null, updated_at: ago(2_000), duration_ms: null,
    disconnection_reason: null, sentiment: null, call_successful: null, in_voicemail: null,
    summary: null, transcript_object: null, recording: null,
    conversation_id: null, contact_id: null, message_id: null, contact: null,
    status: "ongoing", ...over,
  };
}

const voice = { id: "ch1", kind: "voice", number_e164: "+13083368109", status: "active", created_at: ago(86_400_000), last_inbound_at: ago(161_000) };

test("right now = ongoing under the heartbeat rule; oldest first; recent newest first and capped", () => {
  const calls = [
    call("b", { started_at: ago(30_000), updated_at: ago(1_000) }),
    call("a", { started_at: ago(200_000), updated_at: ago(3_000) }),
    // ongoing on paper, silent for longer than the heartbeat: NOT live
    call("phantom", { started_at: ago(3_600_000), updated_at: ago(CALL_HEARTBEAT_MS + 1_000) }),
    ...Array.from({ length: RECENT_MAX + 3 }, (_, i) =>
      call(`e${i}`, { status: "ended", started_at: ago(600_000 + i * 60_000), ended_at: ago(500_000 + i * 60_000), duration_ms: 90_000, summary: "Booked." })),
  ];
  const vm = toLiveVM(calls, [voice], ZONE, NOW);
  assert.deepEqual(vm.now.map((c) => c.callId), ["a", "b"], "the caller who has waited longest leads");
  assert.ok(!vm.now.some((c) => c.callId === "phantom"), "a stale 'ongoing' row is never live");
  assert.equal(vm.recent.length, RECENT_MAX);
  assert.deepEqual(vm.recent.map((c) => c.callId), ["e0", "e1", "e2", "e3", "e4", "e5", "e6", "e7"], "newest first, capped — the hour-old phantom falls off the end");
  const uncapped = toLiveVM(calls.slice(0, 4), [voice], ZONE, NOW);
  assert.deepEqual(uncapped.recent.map((c) => c.callId), ["e0", "phantom"], "the phantom is listed with the finished calls, by its start time");
  assert.equal(vm.heartbeatMs, CALL_HEARTBEAT_MS);
  assert.equal(vm.fetchedAtMs, NOW.getTime());
});

test("a live call carries its real start for the page's clock and no invented duration", () => {
  const c = toLiveCallVM(call("a"), ZONE, NOW);
  assert.equal(c.live, true);
  assert.equal(c.startedAtMs, NOW.getTime() - 161_000);
  assert.equal(c.heartbeatAtMs, NOW.getTime() - 2_000);
  assert.equal(c.duration, null);
  assert.equal(c.summaryState, "pending");
  assert.equal(c.checking, false);
  assert.equal(fmtClock(161), "2:41");
  assert.equal(fmtClock(0), "0:00");
});

test("still marked live: a silent heartbeat, or a call past the long mark, says 'checking'", () => {
  const silent = toLiveCallVM(call("s", { updated_at: ago(LIVE_STALE_MS + 60_000) }), ZONE, NOW);
  assert.equal(silent.live, true, "inside the heartbeat window it is still live…");
  assert.equal(silent.checking, true, "…but the page says it is checking");
  assert.match(silent.checkingWhy, /no word from the phone provider for 6 minutes/);

  const long = toLiveCallVM(call("l", { started_at: ago(LIVE_OVERLONG_MS + 120_000), updated_at: ago(1_000) }), ZONE, NOW);
  assert.equal(long.checking, true);
  assert.match(long.checkingWhy, /live for over 32 minutes/);
});

test("a call that just ended waits for its summary; an old one without a summary says so", () => {
  const just = toLiveCallVM(call("j", { status: "ended", ended_at: ago(30_000), duration_ms: 112_000, disconnection_reason: "user_hangup" }), ZONE, NOW);
  assert.equal(just.live, false);
  assert.equal(just.summaryState, "pending");
  assert.equal(just.duration, "1:52");
  assert.equal(just.endedHow, "Customer hung up");
  const old = toLiveCallVM(call("o", { status: "ended", ended_at: ago(ANALYSIS_GRACE_MS + 1_000), duration_ms: 5_000 }), ZONE, NOW);
  assert.equal(old.summaryState, "none");
  const done = toLiveCallVM(call("d", { status: "ended", ended_at: ago(30_000), summary: "  Asked for Saturday.  ", sentiment: "Positive", recording: { fetch_state: "stored" } }), ZONE, NOW);
  assert.equal(done.summaryState, "ready");
  assert.equal(done.summary, "Asked for Saturday.");
  assert.equal(done.recordingState, "ready");
});

test("a dial that never connected is 'missed' with nothing to review", () => {
  const m = toLiveCallVM(call("m", { status: "not_connected", disconnection_reason: "dial_failed" }), ZONE, NOW);
  assert.equal(m.missed, true);
  assert.equal(m.live, false);
  assert.equal(m.summaryState, "missed");
  assert.equal(m.duration, null);
  assert.equal(m.endedHow, "Call couldn't connect");
});

test("the transcript keeps only spoken turns, with the provider's timings", () => {
  const c = toLiveCallVM(call("t", {
    transcript_object: [
      { role: "agent", content: "Melany's, how can I help?", words: [{ word: "Melany's", start: 0.4, end: 0.9 }] },
      { role: "tool_call_invocation", content: "" },
      { role: "user", content: "Saturday?", words: [{ word: "Saturday", start: 65.2, end: 65.9 }] },
    ],
  }), ZONE, NOW);
  assert.deepEqual(c.transcript, [
    { speaker: "agent", text: "Melany's, how can I help?", t: "0:00" },
    { speaker: "client", text: "Saturday?", t: "1:05" },
  ]);
});

test("who: a name, else the number, else 'withheld' — and a phone-like name is never split", () => {
  const named = toLiveCallVM(call("n", { contact: { display_name: "Daniela Ruiz", wa_profile_name: null, phone_e164: "+17865550181" } }), ZONE, NOW);
  assert.equal(named.who, "Daniela Ruiz");
  assert.equal(named.whoShort, "Daniela");
  assert.equal(named.initials, "DR");
  const numbered = toLiveCallVM(call("p"), ZONE, NOW);
  assert.equal(numbered.who, "+1 (786) 555-0181");
  assert.equal(numbered.whoShort, "the caller");
  assert.equal(numbered.number, "+1 (786) 555-0181");
  const withheld = toLiveCallVM(call("w", { from_e164: null, from_raw: null }), ZONE, NOW);
  assert.equal(withheld.who, "Caller ID withheld");
  assert.equal(withheld.number, null);
  assert.equal(withheld.initials, "–");
});

test("the line: number and switch from the voice channel; null when there is none", () => {
  const vm = toLiveVM([], [voice], ZONE, NOW);
  assert.deepEqual(vm.line, { number: "+1 (308) 336-8109", on: true, lastCallLabel: vm.line.lastCallLabel });
  assert.ok(vm.line.lastCallLabel);
  assert.equal(toLiveVM([], [{ ...voice, status: "disabled" }], ZONE, NOW).line.on, false);
  assert.equal(toLiveVM([], [{ ...voice, kind: "whatsapp" }], ZONE, NOW).line, null);
  assert.equal(toLiveVM([], null, ZONE, NOW).line, null);
  assert.deepEqual(vm.now, []);
  assert.deepEqual(vm.recent, []);
});
