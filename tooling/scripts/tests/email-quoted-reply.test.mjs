/**
 * An email replies by quoting the whole of what it answers, and the thread drew every line of it.
 *
 * Measured on app.chanlytics.com: ruben@rjcapital.io's "Got it, thanks!" rendered as six lines of
 * "On Thu, Sep 17, 2026 at 10:44 PM Melany's Beauty Salon <…> wrote: > testing back at you >" on a
 * 375px screen — the whole bubble, for two words of reply. The chain is kept (an operator may need
 * to see what the customer was answering) but it is not what the bubble says.
 *
 * The cut must not be eager: hiding a customer's own words is worse than a long bubble, so a
 * sentence that merely contains "wrote:" stays whole, and a reply that is ONLY a quote keeps it.
 *
 * Run against the contracts build, not read from it.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { splitQuotedReply, toInboxThreadVM, toConversationVM } from "@chanlytics/contracts";

/* ------------------------- the words, and the chain ------------------------- */

test("the body this was written against — flattened onto one line — splits at the attribution", () => {
  const body =
    "Got it, thanks! On Thu, Sep 17, 2026 at 10:44 PM Melany's Beauty Salon < " +
    "melanys-beauty-salon@mail.chanlytics.com> wrote: > testing back at you >";
  const { text, quoted } = splitQuotedReply(body);
  assert.equal(text, "Got it, thanks!");
  assert.ok(quoted.startsWith("On Thu, Sep 17, 2026"), `quoted began: ${quoted.slice(0, 40)}`);
  assert.ok(quoted.includes("testing back at you"), "the chain is kept, not dropped");
});

test("the ordinary shape — the attribution on its own line, then > quotes", () => {
  const body =
    "Sounds good, see you then.\n\nOn Thu, Sep 17, 2026 at 10:44 PM Foo <a@b.com> wrote:\n> Are you free Tuesday?\n> — Foo";
  const { text, quoted } = splitQuotedReply(body);
  assert.equal(text, "Sounds good, see you then.");
  assert.ok(quoted.includes("Are you free Tuesday?"));
});

test("Outlook's divider cuts too", () => {
  const { text, quoted } = splitQuotedReply("Yes please.\n\n-----Original Message-----\nFrom: a@b.com\nSent: Monday");
  assert.equal(text, "Yes please.");
  assert.ok(quoted.startsWith("-----Original Message-----"));
});

test("a reply with no chain is one whole message", () => {
  const { text, quoted } = splitQuotedReply("Can I move my appointment to Friday?");
  assert.equal(text, "Can I move my appointment to Friday?");
  assert.equal(quoted, null);
});

/* --------------- not eager: a customer's words are never hidden --------------- */

test("a sentence that merely says 'wrote:' is a sentence, and stays whole", () => {
  const body = "On Tuesday my friend wrote: your prices are the best in Brooklyn. Can I book?";
  const { text, quoted } = splitQuotedReply(body);
  assert.equal(quoted, null, "no newline and no > after it — nothing was quoted");
  assert.equal(text, body);
});

test("a reply that is ONLY the quote keeps its words rather than emptying the bubble", () => {
  const body = "> Are you free Tuesday?\n> — Foo";
  const { text, quoted } = splitQuotedReply(body);
  assert.equal(quoted, null);
  assert.equal(text, body);
});

/* ------------------------- and only on the mail wire ------------------------- */

const ZONE = "America/New_York";
const NOW = new Date("2026-09-18T14:00:00Z");
const ago = (min) => new Date(NOW.getTime() - min * 60_000).toISOString();
const threadOf = (channel, body) =>
  toInboxThreadVM(
    {
      id: "c1",
      state: "needs_human",
      paused_until: null,
      snooze_until: null,
      assignee_user_id: null,
      assignee_is_me: false,
      last_wa_inbound_at: ago(30),
      last_message_at: ago(30),
      contact: {
        id: "p1",
        display_name: "Ruben",
        wa_profile_name: null,
        phone_e164: "+16465550123",
        consent: "opted_in",
        dnc: false,
      },
      messages: [
        {
          id: "m1",
          direction: "inbound",
          sender: "customer",
          type: "text",
          body,
          media: null,
          meta: null,
          status: "received",
          channel,
          created_at: ago(30),
          channel_ts: ago(30),
        },
      ],
    },
    null,
    ZONE,
    NOW,
  );

const bubbleOf = (vm) => vm.timeline.find((e) => e.type === "msg");

test("an email's chain is split off; the same characters on WhatsApp are words", () => {
  const body = "Got it, thanks! On Thu, Sep 17, 2026 at 10:44 PM Foo <a@b.com> wrote: > testing back at you >";

  const mail = bubbleOf(threadOf("email", body));
  assert.equal(mail.body, "Got it, thanks!", "the bubble says what they wrote");
  assert.ok(mail.quoted && mail.quoted.includes("testing back at you"), "and carries the chain for a tap");

  const chat = bubbleOf(threadOf("whatsapp", body));
  assert.equal(chat.body, body, "WhatsApp does not quote — every character is theirs");
  assert.equal(chat.quoted, undefined);
});

/* ----------------- and the Conversations row says the same words ----------------- */

// Found on 21 September: the thread said "Got it, thanks!" and the Conversations list beside it previewed
// "Got it, thanks! On Thu, Sep 17, 2026 at 10:44 PM Melany's Beauty Salon < melanys-beauty-salon@mail…", because
// toConversationVM read messageText() and never the split. Two view models, one fix.
test("a Conversations row previews and is searched by what they wrote, not the chain they quoted", () => {
  const body = "Got it, thanks! On Thu, Sep 17, 2026 at 10:44 PM Foo <a@b.com> wrote: > testing back at you >";
  const dto = {
    id: "c1",
    state: "needs_human",
    paused_until: null,
    snooze_until: null,
    assignee_user_id: null,
    assignee_is_me: false,
    last_wa_inbound_at: ago(30),
    last_message_at: ago(30),
    contact: {
      id: "p1",
      display_name: "Ruben",
      wa_profile_name: null,
      phone_e164: "+16465550123",
      consent: "opted_in",
      dnc: false,
    },
    messages: [
      {
        id: "m1",
        direction: "inbound",
        sender: "customer",
        type: "text",
        body,
        media: null,
        meta: null,
        status: "received",
        channel: "email",
        created_at: ago(30),
        channel_ts: ago(30),
      },
    ],
  };
  const row = toConversationVM(dto, ZONE, NOW);
  assert.equal(row.snippet, "Got it, thanks!", "REGRESSION: the list previewed the quoted chain");
  assert.equal(row.summary.headline, "Got it, thanks!");
  assert.equal(row.messages[0].text, "Got it, thanks!", "search reads their words, not ours quoted back");

  // WhatsApp keeps every character, as it does in the thread.
  const wa = toConversationVM({ ...dto, messages: [{ ...dto.messages[0], channel: "whatsapp" }] }, ZONE, NOW);
  assert.equal(wa.snippet, body.slice(0, 110));
});

// Found on 21 September by drawing the one thread before it shipped: on a desktop the status band's "They wrote"
// printed the whole chain, because the escalation's ask read messageText() while the bubble above it read the split.
test("what the status band says they wrote is their words too, not the chain", () => {
  const body = "Got it, thanks! On Thu, Sep 17, 2026 at 10:44 PM Foo <a@b.com> wrote: > testing back at you >";
  const dto = {
    id: "c1",
    state: "needs_human",
    paused_until: null,
    snooze_until: null,
    assignee_user_id: null,
    assignee_is_me: false,
    last_wa_inbound_at: ago(30),
    last_message_at: ago(30),
    contact: {
      id: "p1",
      display_name: "Ruben",
      wa_profile_name: null,
      phone_e164: "+16465550123",
      consent: "opted_in",
      dnc: false,
    },
    messages: [
      {
        id: "m1",
        direction: "inbound",
        sender: "customer",
        type: "text",
        body,
        media: null,
        meta: null,
        status: "received",
        channel: "email",
        created_at: ago(30),
        channel_ts: ago(30),
      },
    ],
  };
  const vm = toInboxThreadVM(
    dto,
    { id: "e1", reason: "human_token", details: null, state: "open", created_at: ago(30) },
    ZONE,
    NOW,
  );
  assert.ok(vm.ask, "an open escalation says what they asked");
  assert.equal(vm.ask.text, "Got it, thanks!", 'REGRESSION: "They wrote" printed the quoted chain on a desktop');
});

test("the Inbox list and a person's page say the same words the thread does", async () => {
  const { toPersonVM, messageWords } = await import("@chanlytics/contracts");
  const body = "Got it, thanks! On Thu, Sep 17, 2026 at 10:44 PM Foo <a@b.com> wrote: > testing back at you >";
  const email = {
    id: "m1",
    direction: "inbound",
    sender: "customer",
    type: "text",
    body,
    media: null,
    meta: null,
    status: "received",
    channel: "email",
    created_at: ago(30),
    channel_ts: ago(30),
  };
  assert.equal(messageWords(email), "Got it, thanks!", "one function says a message's words, wherever they are shown");
  assert.equal(messageWords({ ...email, channel: "whatsapp" }), body, "and only an email has a chain to drop");

  const dto = {
    id: "c1",
    state: "needs_human",
    paused_until: null,
    snooze_until: null,
    assignee_user_id: null,
    assignee_is_me: false,
    last_wa_inbound_at: ago(30),
    last_message_at: ago(30),
    contact: {
      id: "p1",
      display_name: "Ruben",
      wa_profile_name: null,
      phone_e164: null,
      consent: "opted_in",
      dnc: false,
    },
    messages: [email],
  };
  assert.equal(
    toInboxThreadVM(dto, null, ZONE, NOW).preview,
    "Got it, thanks!",
    "REGRESSION: the Inbox row previewed the chain",
  );

  const row = {
    id: "p1",
    display_name: "Ruben",
    wa_profile_name: null,
    phone_e164: null,
    consent: "opted_in",
    consent_source: "customer_message",
    consent_updated_at: ago(60),
    marketing_consent: "unknown",
    marketing_consent_source: null,
    marketing_consent_updated_at: null,
    dnc: false,
    channels: ["email"],
    conversation_count: 1,
    escalation_count: 0,
    needs_human: false,
    open_escalation_reason: null,
    open_escalation_since: null,
    latest_conversation_id: "c1",
    latest_state: "needs_human",
    latest_paused_until: null,
    latest_assignee_user_id: null,
    latest_snooze_until: null,
    latest_wa_inbound_at: null,
    last_message_at: ago(30),
    last_message_direction: "inbound",
    last_message_sender: "customer",
    last_inbound_text: body,
    last_inbound_at: ago(30),
    last_call_at: null,
    last_inbound_call_at: null,
    call_count: 0,
    call_seconds: 0,
    first_contact_at: ago(60),
    earliest_row_at: null,
    has_backfill: false,
    has_chat: true,
    queued_reply_at: null,
  };
  const person = toPersonVM(
    {
      row,
      identities: [],
      conversations: [dto],
      calls: [],
      escalations: [],
      decisions: [],
      receptionist_mode: null,
      workspace_reply_mode: "auto",
    },
    ZONE,
    NOW,
  );
  const said = person.timeline.find((i) => i.id === "m-m1");
  assert.ok(said, "their email is on their page");
  assert.equal(said.text, "Got it, thanks!", "REGRESSION: a person's page printed the chain");
});
