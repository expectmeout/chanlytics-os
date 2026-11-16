/**
 * A follow-up WhatsApp approved as an offer goes in the open chat (decision 0135): the send.
 *
 * A person the run reached in their open WhatsApp chat is marked on their row (`in_chat`, contracts IN_CHAT_FACT). At the
 * send their chat is asked again, at the moment it goes, from their thread's own clock: still open, the reply goes as the
 * message's words with its values filled, naming no saved message, under the moment's own yes (to messages); closed by
 * then, nothing goes in the chat, and the row says why (`chat_closed`). A person not marked goes as every send does.
 * Over fakes that log their calls, as the batch's own tests (core messages/broadcast/batch.ts sendBroadcastBatch).
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { HELD_REASONS } from "@chanlytics/contracts";
import { importSrc } from "../../_source.mjs";

const { sendBroadcastBatch } = await importSrc("packages/core/src/messages/broadcast/batch.ts");

/** Monday 16 November 2026, 3:00 PM UTC (10:00 AM in New York): the follow-up's batch goes. */
const NOW = Date.parse("2026-11-16T15:00:00Z");
const HOUR = 3_600_000;
const WRITES = new Set(["startSending", "mark", "deliver", "finish", "alert"]);
const WORDS = "Hi {{1}}, it's {{2}}. Still want to book? Here's the link again: {{3}}. Or reply here and we'll help.";

/** The follow-up's batch as the job reads it: an occasion's, on the ask's moment, the booking follow-up's words. */
const batchRow = {
  id: "b1",
  state: "scheduled",
  name: "Customer · Asked, didn't book",
  template_name: "booking_follow_up",
  template_language: "en_US",
  params: [{ kind: "first_name" }, { kind: "business_name" }, { kind: "booking_link" }],
  recipient_count: 1,
  playbook_id: "p1",
  audience: { kind: "playbook", id: "p1", trigger: "asked_no_booking" },
};
const ASK = "ask:b2b2b2b2-b2b2-4b2b-8b2b-b2b2b2b2b2b2";

function fakes({ inChat = true, wroteHoursAgo = 20 } = {}) {
  const log = [];
  const answers = {
    broadcast: batchRow,
    workspacePaused: false,
    facts: { businessName: "Marisa's", bookingLink: "https://book.example/m", timezone: "America/New_York" },
    batch: [{ contact_id: "k1", channel: "whatsapp", facts: { occasion: ASK, ...(inChat ? { in_chat: "yes" } : {}) } }],
    wireUnavailable: null,
    startSending: true,
    // WhatsApp's version, approved by WhatsApp as an offer (15 Nov 2026).
    message: (name, language) => [
      {
        id: "whatsapp-booking_follow_up",
        channel: "whatsapp",
        name,
        language,
        meta_status: "approved",
        category: "marketing",
        variables: ["1", "2", "3"],
        hidden_at: null,
        title: null,
        source: "chanlytics",
        components: [],
        body_preview: WORDS,
        rejected_reason: null,
      },
    ],
    byOtherChannels: false,
    offersClosed: null,
    offersUnread: null,
    contacts: () =>
      new Map([
        [
          "k1",
          { id: "k1", phone_e164: "+13475550101", erased_at: null, display_name: "Ada Park", wa_profile_name: null },
        ],
      ]),
    // Their thread, and when they last wrote on WhatsApp in it.
    target: () => ({ conversationId: "c-01", waInboundAt: new Date(NOW - wroteHoursAgo * HOUR).toISOString() }),
    alreadySent: () => new Map(),
    mark: true,
    deliver: (d) => ({ outcome: "sent", messageId: `m-${d.contactId}`, externalId: "wamid" }),
    remaining: 0,
    state: "sending",
    tally: { sent: 1, held: 0 },
    heldFor: [],
    finish: undefined,
    alert: undefined,
  };
  const ports = { now: () => NOW, random: () => 0, sleep: async () => undefined };
  for (const [name, answer] of Object.entries(answers))
    ports[name] = async (...args) => {
      if (WRITES.has(name)) log.push([name, ...args]);
      return typeof answer === "function" ? answer(...args) : answer;
    };
  return { ports, of: (name) => log.filter((l) => l[0] === name) };
}
const cmd = { tenantId: "t1", broadcastId: "b1", deadline: NOW + 60_000 };

test("a person reached in their open chat gets the message's words as a reply in it, naming no saved message, under their yes to messages", async () => {
  const f = fakes();
  await sendBroadcastBatch(f.ports, cmd);
  const sent = f.of("deliver");
  assert.equal(sent.length, 1, "REGRESSION (15 Nov 2026): the follow-up reached nobody from a US number");
  const [, delivery] = sent[0];
  assert.deepEqual(
    [delivery.channel, delivery.template, delivery.purpose, delivery.conversationId],
    ["whatsapp", undefined, "conversational", "c-01"],
  );
  assert.equal(
    delivery.body,
    "Hi Ada, it's Marisa's. Still want to book? Here's the link again: https://book.example/m. Or reply here and we'll help.",
  );
});

test("a chat closed by the time it goes gets nothing in it, and the row says why", async () => {
  const f = fakes({ wroteHoursAgo: 25 });
  await sendBroadcastBatch(f.ports, cmd);
  assert.equal(f.of("deliver").length, 0);
  const marks = f.of("mark").map(([, , , patch]) => patch);
  assert.deepEqual(marks, [{ state: "skipped", reason: "chat_closed" }]);
  assert.equal(HELD_REASONS.chat_closed, "their WhatsApp chat had closed");
});

test("a person not marked for the chat goes as every send does: the saved message, judged as an offer", async () => {
  const f = fakes({ inChat: false });
  await sendBroadcastBatch(f.ports, cmd);
  const [, delivery] = f.of("deliver")[0];
  assert.deepEqual([delivery.template?.name, delivery.purpose], ["booking_follow_up", "marketing"]);
});
