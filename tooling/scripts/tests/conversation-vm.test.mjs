/** Conversations row rules. A call has its OWN row on this surface, so the chat
 *  row must summarise the MESSAGING thread only — otherwise one call renders
 *  twice and the row's pill lies about who owes a reply. */
import { test } from "node:test";
import assert from "node:assert/strict";
import { toConversationVM } from "@chanlytics/contracts";

const NOW = new Date("2026-08-27T15:00:00Z");

const msg = (over = {}) => ({
  id: "m", direction: "inbound", sender: "customer", type: "text",
  body: "hi", media: null, meta: null, status: "received",
  created_at: "2026-08-27T12:00:00Z", ...over,
});

const conv = (messages) => ({
  id: "c1", state: "open", paused_until: null,
  last_wa_inbound_at: "2026-08-27T12:00:00Z",
  last_message_at: "2026-08-27T12:00:00Z",
  contact: { id: "k1", display_name: null, wa_profile_name: null, phone_e164: "+13475550101" },
  messages,
});

test("a call note never becomes the chat row's preview", () => {
  const vm = toConversationVM(conv([
    msg({ id: "m1", body: "do you do gel refills?" }),
    msg({ id: "m2", direction: "outbound", sender: "ai", body: "Yes — Tuesdays work.", status: "sent", created_at: "2026-08-27T12:00:41Z" }),
    msg({ id: "m3", channel: "voice", sender: "system", type: "call_summary",
          body: "Inbound call · 1 min — asked about hours.", created_at: "2026-08-27T14:15:00Z" }),
  ]), NOW);
  assert.match(vm.snippet, /Yes — Tuesdays work\./);
  assert.doesNotMatch(vm.snippet, /Inbound call/);
});

test("a call note does not flip the pill to 'open'", () => {
  // The customer phoned and was handled. A call note is direction:"inbound",
  // so counting it made the row claim the customer spoke last and is waiting.
  const vm = toConversationVM(conv([
    msg({ id: "m1", body: "hi" }),
    msg({ id: "m2", direction: "outbound", sender: "ai", body: "Hello!", status: "sent", created_at: "2026-08-27T12:00:41Z" }),
    msg({ id: "m3", sender: "system", type: "call_summary", body: "Inbound call · 1 min", created_at: "2026-08-27T14:15:00Z" }),
  ]), NOW);
  assert.equal(vm.outcome, "handled");
});

test("the row's time comes from the message it is previewing", () => {
  // last_message_at ignored the imported call note, so the row read one time
  // beside a preview written at another.
  const vm = toConversationVM(conv([
    msg({ id: "m1", direction: "outbound", sender: "ai", body: "Booking link sent.", status: "sent", created_at: "2026-08-27T12:00:00Z" }),
    msg({ id: "m2", sender: "system", type: "call_summary", body: "Inbound call", created_at: "2026-08-27T14:15:00Z" }),
  ]), NOW);
  assert.match(vm.snippet, /Booking link sent\./);
  assert.equal(vm.at, "8:00 AM"); // 12:00Z, not the 14:15Z import
});

test("a caller who never messaged is not given an empty chat row", () => {
  const vm = toConversationVM(conv([
    msg({ id: "m1", sender: "system", type: "call_summary", body: "Inbound call · 1 min", created_at: "2026-08-27T14:15:00Z" }),
  ]), NOW);
  assert.equal(vm.hasChat, false, "their call rows already represent them");
});

test("a normal messaging thread still counts as chat", () => {
  const vm = toConversationVM(conv([msg({ id: "m1" })]), NOW);
  assert.equal(vm.hasChat, true);
});

test("the summary counts messages and calls separately", () => {
  const vm = toConversationVM(conv([
    msg({ id: "m1" }),
    msg({ id: "m2", sender: "system", type: "call_summary", body: "Inbound call", created_at: "2026-08-27T14:15:00Z" }),
  ]), NOW);
  assert.match(vm.summary.bullets[0], /^1 message · 1 call/);
});
