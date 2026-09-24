/**
 * The caller who rang, heard the receptionist start, and hung up.
 *
 * This product already spends the word "missed" on one thing: a dial that
 * never connected (`status === "not_connected"`). Today keeps those out of
 * the attention region deliberately — an attempt is not a call — and the
 * Ask assistant, the day's snapshot and the conversations page all read
 * `missed` that way.
 *
 * So the inbound caller who DID connect and left within seconds had no word
 * at all. The row was filed `handled`, because technically it was, and the
 * day's only lost customer with a phone number attached appeared nowhere but
 * the count of calls today. These pin the predicate's edges, the row Today
 * now draws, the note that has to beat the summary branches, and the queue
 * row that gives the owner somewhere to act.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { abandonedCall, ABANDONED_MS, spokenDuration, toTodayVM } from "@chanlytics/contracts";

const NOW = new Date("2026-09-04T15:00:00.000Z");
const ago = (ms) => new Date(NOW.getTime() - ms).toISOString();

/**
 * An inbound call that ended six seconds in, the customer hanging up.
 *
 * An hour ago, deliberately: past the ten-minute analysis grace, so the note
 * chain is judging a call the provider has finished with rather than one it
 * might still be writing up.
 */
const call = (over = {}) => ({
  id: "c-quick",
  retell_call_id: "call_quick1",
  direction: "inbound",
  call_type: "phone_call",
  status: "ended",
  from_e164: "+19175746416",
  from_raw: null,
  to_e164: "+13055550123",
  started_at: ago(3_600_000),
  ended_at: ago(3_594_000),
  duration_ms: 6_000,
  disconnection_reason: "user_hangup",
  sentiment: null,
  call_successful: null,
  in_voicemail: false,
  summary: null,
  wanted: null,
  outcome: null,
  follow_up: null,
  caller_name: null,
  transcript_object: null,
  recording: null,
  conversation_id: "cv1",
  contact_id: "k1",
  message_id: null,
  created_at: ago(600_000),
  updated_at: ago(594_000),
  contact: { display_name: "Daniela Ruiz", wa_profile_name: null, phone_e164: "+19175746416" },
  ...over,
});

const metrics = (over = {}) => ({
  workspace: { name: "Marisa's Beauty Salon", timezone: "America/New_York", status: "active" },
  channels: [{ kind: "voice", status: "active", number: "+13055550123" }],
  window: {
    days: 1,
    since: "2026-09-04T04:00:00+00:00",
    since_local: "2026-09-04T00:00:00",
    now_local: "2026-09-04T11:00:00",
  },
  now: {
    escalations_open: 0,
    oldest_open_escalation_at: null,
    threads_needing_human: 0,
    threads_snoozed: 0,
    threads_awaiting_reply: 0,
    last_inbound_at: null,
    last_outbound_at: null,
  },
  period: {
    messages_in: 0,
    messages_out_ai: 0,
    messages_out_you: 0,
    conversations_active: 0,
    answered_by_ai: 0,
    answered_by_you: 0,
    unanswered_in_window: 0,
    median_reply_seconds_ai: null,
    send_failures: 0,
    escalations_new: 0,
    escalation_reasons: {},
    calls: 1,
    call_seconds: 6,
    call_sentiments: {},
    calls_voicemail: 0,
    new_contacts: 0,
    ...over,
  },
});

const todayFor = (...calls) => toTodayVM(metrics(), [], [], calls, NOW);

test("the predicate: an inbound caller who hung up inside the window, and nothing else", () => {
  assert.equal(abandonedCall(call()), true, "six seconds in, gone");
  assert.equal(abandonedCall(call({ duration_ms: 1 })), true, "the shortest connected call there is");
  assert.equal(abandonedCall(call({ duration_ms: ABANDONED_MS - 1 })), true, "the last millisecond that counts");

  // The greeting alone — a recording notice and the AI disclosure — takes most
  // of ten seconds. Past fifteen somebody heard something and chose to leave.
  assert.equal(abandonedCall(call({ duration_ms: ABANDONED_MS })), false, "the boundary belongs to the ordinary call");
  assert.equal(
    abandonedCall(call({ duration_ms: 200_000 })),
    false,
    "REGRESSION: every normal call ends with the customer hanging up",
  );

  assert.equal(abandonedCall(call({ direction: "outbound" })), false, "we rang them; a short one is ours to explain");
  assert.equal(
    abandonedCall(call({ status: "not_connected", duration_ms: 0 })),
    false,
    "that is a missed call, which already has a word",
  );
  assert.equal(
    abandonedCall(call({ in_voicemail: true })),
    false,
    "a voicemail is already worth an ear on its own row",
  );
  assert.equal(
    abandonedCall(call({ duration_ms: null })),
    false,
    "a call whose length was never recorded is not evidence",
  );
  assert.equal(abandonedCall(call({ duration_ms: 0 })), false);

  // The reason has to be the CUSTOMER leaving. Every other ending is one
  // somebody chose, and the owner has nothing to win back.
  for (const reason of ["agent_hangup", "call_transfer", "max_duration_reached", "dial_failed", null]) {
    assert.equal(abandonedCall(call({ disconnection_reason: reason })), false, `ended by ${reason}`);
  }
});

test("Today draws the row, and its note beats the summary branches that used to bury it", () => {
  const vm = todayFor(call());
  const row = vm.calls.rows.find((r) => r.id === "c-quick");
  assert.ok(row, "REGRESSION: the day's one lost customer was invisible");
  // The chain below this branch would have said "No summary from the voice
  // provider": true, useless, and it hides the only fact worth acting on.
  assert.equal(row.note, "Hung up after 6 sec — they left with nothing");
  assert.equal(row.to, "conversations/cv-c-quick", "and it opens where the number is");
  assert.equal(spokenDuration(6_000), "6 sec", "the note says a length the way the rest of the product says it");

  // The two ways it used to go wrong, both measured before this branch.
  // One: the provider did write a summary, so nothing about the row asked for
  // an ear and Today dropped it entirely.
  const summarised = todayFor(call({ summary: "The user called and ended the call." }));
  const kept = summarised.calls.rows.find((r) => r.id === "c-quick");
  assert.ok(kept, "REGRESSION: a summarised six-second call was not on the page at all");
  assert.equal(kept.note, "Hung up after 6 sec — they left with nothing");

  // Two: no summary and it ended moments ago, so the row said the provider
  // was still working on it. It was not; there is nothing to work on.
  const fresh = todayFor(call({ started_at: ago(36_000), ended_at: ago(30_000) }));
  assert.equal(
    fresh.calls.rows[0].note,
    "Hung up after 6 sec — they left with nothing",
    "REGRESSION: read as 'Summary on its way from the voice provider'",
  );

  const vmLong = todayFor(call({ duration_ms: 200_000, summary: "Asked about Saturday." }));
  assert.equal(vmLong.calls.rows.length, 0, "an ordinary call with a summary is not worth interrupting the day for");
});

test("it reaches the queue as something to do, not just something to read", () => {
  const vm = todayFor(call());
  const row = vm.queue.rows.find((r) => r.id === "q-c-c-quick");
  assert.ok(row, "REGRESSION: no row means no door");
  assert.equal(row.kind, "call");
  assert.match(row.who, /Daniela/);
  assert.equal(
    row.sentence,
    "Hung up after 6 sec — they left with nothing",
    "they asked for nothing, so the note is the sentence",
  );
  assert.deepEqual(row.cta, { label: "Open the call", to: "conversations/cv-c-quick" });
});

test("a dial that never connected stays out of Today, as it always has", () => {
  const vm = todayFor(call({ status: "not_connected", duration_ms: 0, disconnection_reason: "dial_no_answer" }));
  assert.deepEqual(
    vm.calls.rows.map((r) => r.id),
    [],
    "an attempt is not a call worth an ear",
  );
});
