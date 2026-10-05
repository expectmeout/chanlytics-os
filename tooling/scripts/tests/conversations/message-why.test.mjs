/**
 * Only the receptionist's own reply carries a why. Since 00287 a customer's inbound row carries an `intent` too (what
 * they were after, stamped when the receptionist read it): the Inbox, Conversations and Ask's thread tool must go on
 * saying nothing of reasoning beside a customer's words. The predicate is held here, and Conversations' view model runs
 * on it; Ask's thread tool, the one reader whose answer changed (it read the meta on its own), runs in
 * ask/ask-turn.test.mjs ("inbox.thread says nothing of reasoning beside a customer's words").
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { messageWhy, toConversationVM } from "@chanlytics/contracts";

const ZONE = "America/New_York";
const NOW = new Date("2026-10-03T15:00:00Z");
const brain = {
  intent: "pricing",
  confidence: 0.62,
  reason: "asked a price",
  facts_used: [],
  language: "en",
  model: "m",
};

test("a reply of the receptionist's has its why; a customer's message, a person's reply and a bare row have none", () => {
  const why = messageWhy({ sender: "ai", meta: brain });
  assert.equal(why.intent, "pricing");
  assert.equal(why.summary, "Pricing question · 62% sure");
  assert.equal(messageWhy({ sender: "customer", meta: { intent: "pricing", handled: "ai" } }), null);
  assert.equal(messageWhy({ sender: "human", meta: brain }), null);
  assert.equal(messageWhy({ sender: "ai", meta: null }), null);
});

test("Conversations draws a why beside the reply and none beside the customer's stamped message", () => {
  const msg = (over) => ({
    id: "m",
    direction: "inbound",
    sender: "customer",
    type: "text",
    body: "hi",
    media: null,
    meta: null,
    status: "received",
    created_at: "2026-10-03T12:00:00Z",
    ...over,
  });
  const vm = toConversationVM(
    {
      id: "c1",
      state: "open",
      paused_until: null,
      last_wa_inbound_at: "2026-10-03T12:00:00Z",
      last_message_at: "2026-10-03T12:00:41Z",
      contact: { id: "k1", display_name: null, wa_profile_name: null, phone_e164: "+15550139001" },
      messages: [
        msg({
          id: "m1",
          meta: { raw_type: "text", processed_at: "2026-10-03T12:00:40Z", handled: "ai", intent: "pricing" },
        }),
        msg({
          id: "m2",
          direction: "outbound",
          sender: "ai",
          body: "Gel refills are $40.",
          status: "sent",
          created_at: "2026-10-03T12:00:41Z",
          meta: brain,
        }),
      ],
    },
    ZONE,
    NOW,
  );
  assert.equal(vm.messages[0].why, undefined, "the customer's message");
  assert.equal(vm.messages[1].why.intent, "pricing", "the receptionist's reply");
});
