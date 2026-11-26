/**
 * A message that never reached the customer must not read as one that did.
 *
 * Found by looking at a real account's Conversations pane: the same sentence
 * appeared twice, at the same minute, in identical bubbles. It looked like the
 * receptionist had texted someone the same thing twice. It had not — one of the
 * two had been CANCELED before it left, and the Inbox knew that and said so.
 * Conversations did not, because toConversationVM dropped `status` on the floor
 * and the pane rendered channel, time and text.
 *
 * The conversations API filters nothing, so this covered three separate ways of
 * not being delivered: canceled, failed, and a draft still sitting in its veto
 * window. All three rendered as words a customer had read — on the one surface
 * whose entire job is "what is my receptionist saying to people".
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { messageStatusLabel, reachedCustomer, toInboxThreadVM } from "@chanlytics/contracts";
import { toConversationVM } from "../../apps/dashboard/src/surfaces/inbox/model/thread-vm.ts";
import { givenOn } from "../_css.mjs";

// The workspace's zone: every view model says its times by it (contracts clock.ts).
const ZONE = "America/New_York";

const msg = (status, body, over = {}) => ({
  id: `m-${status}`,
  sender: "ai",
  direction: "outbound",
  type: "text",
  body,
  status,
  created_at: "2026-08-27T07:22:00Z",
  channel_ts: null,
  media: null,
  meta: null,
  ...over,
});

const dto = (messages) => ({
  id: "c1",
  state: "done",
  paused_until: null,
  snooze_until: null,
  assignee_user_id: null,
  last_wa_inbound_at: null,
  last_message_at: "2026-08-27T07:22:00Z",
  contact: {
    id: "k",
    display_name: null,
    wa_profile_name: null,
    phone_e164: "+19175550137",
    consent: "opted_in",
    dnc: false,
  },
  messages,
});

test("the same words, canceled and delivered, do not render the same", () => {
  // The literal case from the live account.
  const text = "Hi! Thanks for calling Marisa's Beauty Salon.";
  const vm = toConversationVM(dto([msg("canceled", text), msg("delivered", text)]), null, ZONE);
  const [a, b] = vm.messages;
  assert.equal(a.text, b.text, "the fixture is only interesting if the text matches");
  assert.equal(a.reachedCustomer, false);
  assert.equal(b.reachedCustomer, true);
  assert.equal(a.statusLabel, "Canceled before sending");
  assert.equal(b.statusLabel, "Delivered");
});

test("every way of not arriving is marked as not arriving", () => {
  for (const status of ["canceled", "failed", "queued"]) {
    const vm = toConversationVM(dto([msg(status, "x")]), null, ZONE);
    assert.equal(vm.messages[0].reachedCustomer, false, status);
    assert.ok(vm.messages[0].statusLabel, `${status} must say what happened`);
  }
  for (const status of ["sent", "delivered", "read"]) {
    assert.equal(toConversationVM(dto([msg(status, "x")]), null, ZONE).messages[0].reachedCustomer, true, status);
  }
});

test("an email's delivered receipt says what it knows: their mail server took it, not that it is on their phone", () => {
  // Resend's `delivered` is the receiving server's acceptance. A text or a WhatsApp message is "Delivered" on a phone.
  assert.equal(messageStatusLabel("delivered", "email"), "Handed to their email");
  assert.equal(messageStatusLabel("delivered", "whatsapp"), "Delivered");
  assert.equal(messageStatusLabel("delivered", "sms"), "Delivered");
  assert.equal(messageStatusLabel("delivered"), "Delivered", "a row that names no wire keeps the word it always had");
  // Nothing else moves with the wire: the words for every other status are one vocabulary.
  for (const status of ["queued", "failed", "canceled", "read", "sent", undefined])
    assert.equal(messageStatusLabel(status, "email"), messageStatusLabel(status, "sms"), String(status));

  // Both panes draw it from the row's own channel (the Inbox's thread and Conversations).
  const email = toConversationVM(dto([msg("delivered", "Thanks", { channel: "email" })]), null, ZONE);
  assert.equal(email.messages[0].statusLabel, "Handed to their email");
  const text = toConversationVM(dto([msg("delivered", "Thanks", { channel: "sms" })]), null, ZONE);
  assert.equal(text.messages[0].statusLabel, "Delivered");
});

test("the Inbox's thread says the same words for an email as Conversations does", () => {
  const thread = toInboxThreadVM(dto([msg("delivered", "Thanks", { channel: "email" })]), null, ZONE);
  const bubble = thread.timeline.find((e) => e.type === "msg");
  assert.equal(bubble.statusLabel, "Handed to their email");
});

test("a customer's own message is never given a send status", () => {
  // Inventing one would be describing something that does not exist.
  const vm = toConversationVM(
    dto([msg("received", "hello", { sender: "customer", direction: "inbound" })]),
    null,
    ZONE,
  );
  assert.equal(vm.messages[0].statusLabel, undefined);
  assert.equal(vm.messages[0].reachedCustomer, undefined);
  assert.equal(vm.messages[0].from, "client");
});

test("an ordinary sent message says nothing rather than something reassuring", () => {
  assert.equal(messageStatusLabel("sent"), undefined);
  assert.equal(messageStatusLabel(undefined), undefined);
  assert.equal(reachedCustomer("sent"), true);
  assert.equal(reachedCustomer(undefined), true);
});

/* ------------------------ one vocabulary, one place ----------------------- */

// The thread keeps no private list of these words. The Inbox's ternary WAS the only home of this vocabulary, which is why
// the other pane had none; the thread draws the view model's label now (contracts messageStatusLabel, above): a reply
// that did not send says so in its corner in contracts' words, drawn in conversations/inbox/inbox-true.test.mjs, where
// timeline.tsx's text was read until 26 Nov 2026. Conversations draws the same thread (one-thread.test.mjs).

test("the thread visibly separates what was said from what was only drafted", () => {
  // The mark on the bubble is drawn and run in inbox-true.test.mjs ("the reply that didn't send says so").
  // On the words, not the bubble's frame, which stands as wide as the thread on a desk (#1841): asked of the parsed
  // sheet under any query (read as its text until 26 Nov 2026), dimmed and dashed.
  const words = givenOn("apps/dashboard/src/styles/conversations.css", ".tl-msg.undelivered .tl-msg-body", null);
  assert.equal(words.opacity, ".7", "and the mark must have a style");
  assert.match(words.border ?? "", /dashed/);
});
