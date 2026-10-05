/**
 * A person whose address stopped accepting mail is not told "Any time, by email".
 *
 * `people_list` says THAT their address stopped (email_suppressed_at, 00320: a permanent bounce, a complaint, or the
 * provider's own list), and the thread's reply box already says it (emailStoppedWords). Their page did not: the Replies
 * row read "Any time, by email" over the address the reply route then refuses, and the Email fact beside it was the
 * bare address. The row spelled the fact its own way too (`!!r.email_suppressed_at`) where the product has one
 * predicate (isEmailStopped). Run through the chain a page is drawn by: the row's flag, the About rail, and the
 * Pipeline peek's reach rows.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { isEmailStopped, pipelinePeekDetail, repliesWords, toPersonRowVM, toPersonVM } from "@chanlytics/contracts";
import { toConversationDto } from "../../../../../apps/dashboard/src/server/dto.ts";

const TZ = "America/New_York";
const NOW = new Date("2026-09-18T02:45:00Z");
const ADDRESS = "ana@example.com";
const STOPPED_REPLIES = "Email can't reach them: their address stopped accepting mail";

const ROW = {
  id: "p1",
  display_name: "Ana Reyes",
  wa_profile_name: null,
  phone_e164: null,
  email: ADDRESS,
  consent: "unknown",
  consent_source: null,
  consent_updated_at: null,
  dnc: false,
  channels: ["email"],
  message_channels: ["email"],
  conversation_count: 1,
  escalation_count: 0,
  needs_human: false,
  open_escalation_reason: null,
  open_escalation_since: null,
  latest_conversation_id: "c1",
  latest_state: "open",
  latest_paused_until: null,
  latest_assignee_user_id: null,
  latest_snooze_until: null,
  latest_wa_inbound_at: null,
  last_message_at: "2026-09-18T02:42:00Z",
  last_message_direction: "inbound",
  last_message_sender: "customer",
  last_inbound_text: "Can you move Saturday?",
  last_inbound_at: "2026-09-18T02:42:00Z",
  last_call_at: null,
  last_inbound_call_at: null,
  call_count: 0,
  call_seconds: 0,
  first_contact_at: "2026-09-18T02:05:16Z",
  earliest_row_at: "2026-09-18T02:05:16Z",
  has_backfill: false,
  has_chat: true,
  queued_reply_at: null,
};

const message = {
  id: "m1",
  direction: "inbound",
  sender: "customer",
  type: "text",
  channel: "email",
  body: "Can you move Saturday?",
  media: null,
  meta: null,
  status: "received",
  created_at: "2026-09-18T02:42:00Z",
  channel_ts: "2026-09-18T02:42:00Z",
};

const conversation = () =>
  toConversationDto(
    {
      id: "c1",
      state: "open",
      paused_until: null,
      snooze_until: null,
      assignee_user_id: null,
      last_wa_inbound_at: null,
      last_message_at: "2026-09-18T02:42:00Z",
      contacts: { id: "p1", display_name: "Ana Reyes", wa_profile_name: null, phone_e164: null, email: ADDRESS },
    },
    [message],
    "u1",
  );

/** The person's page for a row, as the contract maps it. */
const personFor = (over = {}) =>
  toPersonVM(
    {
      row: { ...ROW, ...over },
      identities: [],
      conversations: [conversation()],
      calls: [],
      escalations: [],
      decisions: [],
      receptionist_mode: null,
      workspace_reply_mode: "auto",
    },
    TZ,
    NOW,
  );

const about = (p, k) => p.about.find((a) => a.k === k)?.v;

test("Replies by email says email can't reach them where the address stopped, and keeps 'Any time' where it did not", () => {
  assert.equal(
    repliesWords("Email", null, { optedOut: false, who: "Ana", emailStopped: true }),
    STOPPED_REPLIES,
    "was 'Any time, by email', over an address the reply route refuses",
  );
  assert.equal(repliesWords("Email", null, { optedOut: false, who: "Ana", emailStopped: false }), "Any time, by email");
  assert.equal(
    repliesWords("Text", null, { optedOut: false, who: "Ana", emailStopped: true }),
    "Any time, by text",
    "a reply that goes by text is not held by an address",
  );
  assert.match(
    repliesWords("Email", null, { optedOut: true, who: "Ana", emailStopped: true }),
    /asked to stop/,
    "a stop is the first thing said, as before",
  );
});

test("their page says it twice, in its Replies row and on the address itself, and says nothing of an address that works", () => {
  const stopped = personFor({ email_suppressed_at: "2026-09-10T00:00:00Z" });
  assert.equal(stopped.emailSuppressed, true);
  assert.equal(about(stopped, "Replies"), STOPPED_REPLIES);
  assert.equal(about(stopped, "Email"), `${ADDRESS} · stopped accepting mail`);

  for (const fine of [{ email_suppressed_at: null }, {}]) {
    const p = personFor(fine);
    assert.equal(p.emailSuppressed, false, "null, or a row read before the column: not stopped");
    assert.equal(about(p, "Replies"), "Any time, by email");
    assert.equal(about(p, "Email"), ADDRESS);
  }
});

test("the Pipeline peek says the same of the same person: the address flagged, the copy still the bare address", () => {
  const reach = (p) => Object.fromEntries(pipelinePeekDetail(p).reach.map((r) => [r.id, r]));
  const stopped = reach(personFor({ email_suppressed_at: "2026-09-10T00:00:00Z" }));
  assert.equal(stopped.email.words, `${ADDRESS} · stopped accepting mail`);
  assert.equal(stopped.email.copy, ADDRESS, "what a copy puts on the clipboard is the address, never the tag");
  assert.equal(stopped.replies.words, STOPPED_REPLIES);
  const fine = reach(personFor());
  assert.equal(fine.email.words, ADDRESS);
  assert.equal(fine.replies.words, "Any time, by email");
});

test("the row's flag is the one predicate's answer, whatever the column holds", () => {
  for (const at of [undefined, null, "", "2026-09-10T00:00:00Z"]) {
    const row = { ...ROW, email_suppressed_at: at };
    assert.equal(toPersonRowVM(row, TZ, NOW, null, null).emailSuppressed, isEmailStopped(row), JSON.stringify(at));
  }
});
