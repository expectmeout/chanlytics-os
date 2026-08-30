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
import { messageStatusLabel, reachedCustomer, toConversationVM } from "@chanlytics/contracts";
import { readCode } from "./_source.mjs";

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
    id: "k", display_name: null, wa_profile_name: null,
    phone_e164: "+19175746416", consent: "opted_in", dnc: false,
  },
  messages,
});

test("the same words, canceled and delivered, do not render the same", () => {
  // The literal case from the live account.
  const text = "Hi! Thanks for calling Melany's Beauty Salon.";
  const vm = toConversationVM(dto([msg("canceled", text), msg("delivered", text)]));
  const [a, b] = vm.messages;
  assert.equal(a.text, b.text, "the fixture is only interesting if the text matches");
  assert.equal(a.reachedCustomer, false);
  assert.equal(b.reachedCustomer, true);
  assert.equal(a.statusLabel, "Canceled before sending");
  assert.equal(b.statusLabel, "Delivered");
});

test("every way of not arriving is marked as not arriving", () => {
  for (const status of ["canceled", "failed", "queued"]) {
    const vm = toConversationVM(dto([msg(status, "x")]));
    assert.equal(vm.messages[0].reachedCustomer, false, status);
    assert.ok(vm.messages[0].statusLabel, `${status} must say what happened`);
  }
  for (const status of ["sent", "delivered", "read"]) {
    assert.equal(toConversationVM(dto([msg(status, "x")])).messages[0].reachedCustomer, true, status);
  }
});

test("a customer's own message is never given a send status", () => {
  // Inventing one would be describing something that does not exist.
  const vm = toConversationVM(dto([msg("received", "hello", { sender: "customer", direction: "inbound" })]));
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

test("neither pane keeps its own private list of these words", () => {
  const thread = readCode("apps/dashboard/src/legacy/pages/inbox-thread.jsx");
  const convo = readCode("apps/dashboard/src/legacy/pages/conversations.jsx");
  // The Inbox's ternary WAS the only home of this vocabulary, which is why the
  // other pane had none.
  assert.ok(
    !thread.includes('"Canceled before sending"') && !thread.includes("· Canceled before sending"),
    "the labels belong to the viewmodel now",
  );
  assert.ok(thread.includes("entry.statusLabel"), "the Inbox renders the shared label");
  assert.ok(convo.includes("m.statusLabel"), "so does Conversations");
});

test("Conversations visibly separates what was said from what was only drafted", () => {
  const convo = readCode("apps/dashboard/src/legacy/pages/conversations.jsx");
  assert.ok(
    convo.includes('m.reachedCustomer === false ? " undelivered" : ""'),
    "an undelivered bubble must be marked, not merely annotated",
  );
  const css = readCode("apps/dashboard/src/legacy/styles/conversations.css");
  assert.ok(css.includes(".tl-msg.undelivered .tl-msg-bubble"), "and the mark must have a style");
});
