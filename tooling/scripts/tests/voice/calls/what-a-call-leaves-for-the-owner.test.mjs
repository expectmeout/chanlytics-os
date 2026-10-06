/**
 * What a call leaves for the owner, and how it ended (audit of 2 Oct 2026, #8, A6 and A7).
 *
 * The post-call analysis writes `calls.follow_up` (a to-do), `caller_name` and `caller_email`; the call DTO carried all
 * three and contracts read none of them except as search text in a bullet, so Priya's call-back to-do was nowhere on her
 * page. They are said in one place (`callNotesOf`) and drawn by the call card, the person's history and Live. And how a
 * call ended is one ladder (`callOutcomeFor`): Live's pill had no word for a caller who hung up in seconds or asked for a
 * call back, and read "Ended" over a voicemail and a call the provider could not keep. New exports are read at run time,
 * so a missing one fails its own test and not the file.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import * as contracts from "@chanlytics/contracts";

const ZONE = "America/New_York";
const NOW = new Date("2026-09-21T14:00:00Z");
const at = (min) => new Date(NOW.getTime() - min * 60_000).toISOString();

// A call as the calls route returns it, ended and analysed.
const dto = (over = {}) => ({
  id: "k7",
  retell_call_id: "r-k7",
  direction: "inbound",
  call_type: "phone_call",
  status: "ended",
  from_e164: "+19175550106",
  from_raw: null,
  to_e164: "+13055550123",
  started_at: at(120),
  ended_at: at(117),
  updated_at: at(117),
  duration_ms: 190_000,
  disconnection_reason: "agent_hangup",
  sentiment: "Neutral",
  call_successful: true,
  in_voicemail: false,
  summary: "The caller asked about a bridal trial.",
  transcript_object: null,
  recording: null,
  conversation_id: "c700",
  contact_id: "k-priya",
  message_id: null,
  contact: { display_name: "Priya Shah", wa_profile_name: null, phone_e164: "+19175550106" },
  wanted: "Wants to book a bridal trial for August",
  outcome: "answered",
  follow_up: null,
  caller_name: null,
  ...over,
});

test("what the analysis left is said once, from the call's own row: the receptionist's to-do, then what the caller gave about themselves", () => {
  const { callNotesOf, callTodoWords, callNoteLines } = contracts;
  assert.equal(callTodoWords("Call back to confirm the bridal trial"), "To do: Call back to confirm the bridal trial");
  assert.equal(callTodoWords("  Call back  "), "To do: Call back", "trimmed, as the Live card has always said it");
  for (const none of [null, undefined, "", "   "]) assert.equal(callTodoWords(none), null, JSON.stringify(none));

  const all = callNotesOf({
    follow_up: "Call back to confirm the bridal trial",
    caller_name: " Priya Shah ",
    // Trimmed as the name is: the address said with the analysis's stray spaces read "as  priya@…".
    caller_email: " priya@example.com ",
  });
  assert.deepEqual(all, {
    todo: "To do: Call back to confirm the bridal trial",
    gave: ["Gave their name as Priya Shah", "Gave their email as priya@example.com"],
  });
  assert.deepEqual(callNoteLines(all), [
    "To do: Call back to confirm the bridal trial",
    "Gave their name as Priya Shah",
    "Gave their email as priya@example.com",
  ]);
  // Only what the row holds: a call analysed before the schema, or one with nothing to add, has no notes.
  assert.deepEqual(callNotesOf({}), { todo: null, gave: [] });
  assert.deepEqual(callNotesOf({ follow_up: "", caller_name: "  ", caller_email: null }), { todo: null, gave: [] });
  assert.deepEqual(callNoteLines(callNotesOf({ caller_email: "a@example.com" })), [
    "Gave their email as a@example.com",
  ]);
});

test("the call row carries them as notes, and its bullets say the same words in the same order", () => {
  const { toCallVM } = contracts;
  const vm = toCallVM(
    dto({
      outcome: "callback_needed",
      follow_up: "Call back to confirm the bridal trial",
      caller_name: "Priya Shah",
      caller_email: "priya@example.com",
    }),
    ZONE,
    NOW,
  );
  assert.deepEqual(
    vm.notes,
    {
      todo: "To do: Call back to confirm the bridal trial",
      gave: ["Gave their name as Priya Shah", "Gave their email as priya@example.com"],
    },
    "REGRESSION: the row held all three and the view model gave the card none of them",
  );
  const bullets = vm.summary.bullets;
  assert.deepEqual(
    bullets.slice(bullets.indexOf("Needs a call back") + 1, bullets.indexOf("Needs a call back") + 4),
    [
      "To do: Call back to confirm the bridal trial",
      "Gave their name as Priya Shah",
      "Gave their email as priya@example.com",
    ],
    "after how it ended, where the bullets always had them",
  );
  assert.deepEqual(toCallVM(dto(), ZONE, NOW).notes, { todo: null, gave: [] }, "nothing on the row, nothing said");
});

test("a person's history draws the call's notes under what they wanted, and a call the receptionist placed that never connected is not a missed call", () => {
  const { toPersonVM } = contracts;
  const row = {
    id: "p1",
    display_name: "Priya Shah",
    wa_profile_name: null,
    phone_e164: "+19175550106",
    consent: "opted_in",
    consent_source: "in_person",
    consent_updated_at: at(60 * 24),
    marketing_consent: "unknown",
    marketing_consent_source: null,
    marketing_consent_updated_at: null,
    dnc: false,
    channels: ["voice"],
    conversation_count: 0,
    escalation_count: 0,
    needs_human: false,
    open_escalation_reason: null,
    open_escalation_since: null,
    latest_conversation_id: null,
    latest_state: null,
    latest_paused_until: null,
    latest_assignee_user_id: null,
    latest_snooze_until: null,
    latest_wa_inbound_at: null,
    last_message_at: null,
    last_message_direction: null,
    last_message_sender: null,
    last_inbound_text: null,
    last_inbound_at: null,
    last_call_at: at(120),
    call_count: 1,
    call_seconds: 190,
    first_contact_at: at(120),
    earliest_row_at: at(120),
    has_backfill: false,
    has_chat: false,
    queued_reply_at: null,
  };
  const person = toPersonVM(
    {
      row,
      identities: [],
      conversations: [],
      calls: [
        dto({
          id: "k1",
          outcome: "callback_needed",
          follow_up: "Call back to confirm the bridal trial",
          caller_name: "Priya Shah",
          caller_email: "priya@example.com",
        }),
        dto({ id: "k2", started_at: at(300), follow_up: null, caller_name: null }),
        dto({
          id: "k3",
          direction: "outbound",
          status: "not_connected",
          started_at: at(500),
          duration_ms: 0,
          wanted: null,
          summary: null,
          outcome: null,
        }),
      ],
      escalations: [],
      decisions: [],
      receptionist_mode: "ask",
      workspace_reply_mode: "auto",
      visits: { timezone: ZONE, source: null, state: "off", next: null, last: null, all: [] },
    },
    ZONE,
    NOW,
  );
  const call = (id) => person.timeline.find((i) => i.id === `k-${id}`);
  assert.deepEqual(
    call("k1").notes,
    [
      "To do: Call back to confirm the bridal trial",
      "Gave their name as Priya Shah",
      "Gave their email as priya@example.com",
    ],
    "REGRESSION: Priya's call-back to-do was absent from her person page",
  );
  assert.equal(call("k1").text, "Wants to book a bridal trial for August", "what they wanted still leads");
  assert.equal(call("k2").notes, undefined, "a call with nothing to add has no lines");
  assert.equal(call("k3").who, "Call didn't connect", "a dial we placed: not a call anyone missed");
  assert.equal(call("k3").notes, undefined);
});

test("how a call ended is one ladder: Conversations and Live read the same word for every call, and Live has the endings it lacked", () => {
  const { toCallVM, toLiveCallVM } = contracts;
  const cases = [
    ["handled", dto()],
    ["voicemail", dto({ in_voicemail: true, disconnection_reason: "voicemail_reached", summary: null, wanted: null })],
    ["failed", dto({ status: "error", duration_ms: 0 })],
    ["missed", dto({ status: "not_connected", duration_ms: 0, wanted: null, summary: null })],
    ["abandoned", dto({ duration_ms: 6_000, disconnection_reason: "user_hangup", wanted: null, summary: null })],
    ["callback", dto({ outcome: "callback_needed" })],
    ["live", dto({ status: "ongoing", ended_at: null, duration_ms: null, started_at: at(1), updated_at: at(0) })],
  ];
  for (const [outcome, d] of cases) {
    assert.equal(toCallVM(d, ZONE, NOW).outcome, outcome, `Conversations: ${outcome}`);
    assert.equal(
      toLiveCallVM(d, ZONE, NOW).outcome,
      outcome,
      `REGRESSION: Live read "${outcome}" as ended, missed or live and nothing between`,
    );
  }
});

test("a voicemail is read by any of the three signals a call row carries, by every reader: the analysis flag can be missing", () => {
  const { toCallVM, toLiveCallVM, reachedVoicemail } = contracts;
  // The provider's analysis sets in_voicemail; when it did not run, the row still holds the ending the provider
  // recorded, or the outcome our own analysis gave. The ladder read the flag alone, so the pill said Handled beside
  // "Reached voicemail".
  const quiet = { in_voicemail: null, summary: null, wanted: null };
  for (const [why, d] of [
    ["the provider's ending", dto({ ...quiet, disconnection_reason: "voicemail_reached" })],
    ["our analysis's outcome", dto({ ...quiet, outcome: "voicemail" })],
    ["the provider's flag", dto({ ...quiet, in_voicemail: true })],
  ]) {
    assert.equal(reachedVoicemail(d), true, why);
    assert.equal(toCallVM(d, ZONE, NOW).outcome, "voicemail", `REGRESSION: Conversations said handled: ${why}`);
    assert.equal(toLiveCallVM(d, ZONE, NOW).outcome, "voicemail", `Live: ${why}`);
  }
  assert.equal(reachedVoicemail(dto()), false, "an answered call");
});
