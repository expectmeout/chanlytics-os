/**
 * A reply the receptionist wrote that could not leave says why in the owner's words (core inbound/dispatch.ts sendNow),
 * the words a queued reply's failure says it in (core messages/send.ts causeOf): a workspace whose number has no
 * credentials reads that the number is not connected, never "HTTP 503", and a text's line is named as a line.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { text, world } from "./_world.mjs";

const meta = { intent: "hours", confidence: 0.9, reason: "", facts_used: [], language: "en", model: "m" };
const answers = (words) => ({
  brain: async () => ({
    generateReply: async () => ({ text: words, escalate: false, meta, usage: { input_tokens: 40 } }),
  }),
});
/** The send door's answer for a wire with no credentials (core wire-senders.ts: status 503). */
const unconnected = {
  outcome: "failed",
  reason: "no_credentials",
  status: 503,
  errorBody: "no_credentials",
  messageId: null,
};
const line = {
  channel: "sms",
  send: async () => ({ ok: true, wamid: "SM1", status: 201 }),
  body: (t) => t,
  held: null,
};

test("a WhatsApp number with no credentials is said to be not connected, never an HTTP status", async () => {
  const w = world({ env: { modelKey: "k" }, delivered: unconnected });
  await w.run(text("when do you open?"), answers("We open at 9."));
  assert.deepEqual(
    w.seen.escalations.map((e) => e.reason),
    ["send_failed"],
    "a person is asked",
  );
  const [{ details }] = w.seen.escalations;
  assert.match(details, /the WhatsApp number is not connected/);
  assert.doesNotMatch(details, /HTTP/, "an owner is never sent looking for a provider outage");
});

test("on a texting line the same failure names the line", async () => {
  const w = world({ env: { modelKey: "k" }, delivered: unconnected, carrier: line });
  await w.run(text("when do you open?", "SM-in-1"), answers("We open at 9."));
  assert.match(w.seen.escalations[0].details, /the texting line is not connected/);
});

test("a provider that refused says its status, as a queued reply's failure does", async () => {
  const w = world({
    env: { modelKey: "k" },
    delivered: { outcome: "failed", reason: "provider", status: 500, errorBody: null, messageId: null },
  });
  await w.run(text("when do you open?", "wamid.500"), answers("We open at 9."));
  assert.match(w.seen.escalations[0].details, /\(HTTP 500\)/);
});
