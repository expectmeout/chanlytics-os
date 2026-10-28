/**
 * An email replies by quoting the whole of what it answers, and the thread drew every line of it.
 *
 * Measured on app.chanlytics.com: ruben@rjcapital.io's "Got it, thanks!" rendered as six lines of
 * "On Thu, Sep 17, 2026 at 10:44 PM Marisa's Beauty Salon <…> wrote: > testing back at you >" on a
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
import {
  emailPartsOf,
  emailPreviewOf,
  emailSignatureLine,
  emailSubjectsOf,
  messageWords,
  repairMojibake,
  splitQuotedReply,
  tidyEmailWords,
  toConversationVM,
  toInboxThreadVM,
} from "@chanlytics/contracts";

/* ------------------------- the words, and the chain ------------------------- */

test("the body this was written against — flattened onto one line — splits at the attribution", () => {
  const body =
    "Got it, thanks! On Thu, Sep 17, 2026 at 10:44 PM Marisa's Beauty Salon < " +
    "marisas-beauty-salon@mail.chanlytics.com> wrote: > testing back at you >";
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
// "Got it, thanks! On Thu, Sep 17, 2026 at 10:44 PM Marisa's Beauty Salon < marisas-beauty-salon@mail…", because
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
  const row = toConversationVM(dto, null, ZONE, NOW);
  assert.equal(row.snippet, "Got it, thanks!", "REGRESSION: the list previewed the quoted chain");
  assert.equal(row.summary.headline, "Got it, thanks!");
  assert.equal(row.messages[0].text, "Got it, thanks!", "search reads their words, not ours quoted back");

  // WhatsApp keeps every character, as it does in the thread.
  const wa = toConversationVM({ ...dto, messages: [{ ...dto.messages[0], channel: "whatsapp" }] }, null, ZONE, NOW);
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

/* =========================== an email in its parts =========================== */

/*
 * An email in its parts (the email canvas's lane A, 27 Oct 2026): what they wrote, the signature under it, and the chain
 * it quoted. On production Ruben's "needs you test" arrived as "needs you test Ruben Segura Founder, RJ Capital [image:
 * RJ Capital] <https://rjcapital.io> rjcapital.io | ruben@rjcapital.io 3495 US-1, Princeton, NJ 08540", one paragraph,
 * in the thread, in Need you and in Conversations: Gmail's plain text puts no "-- " before a signature, and every reader
 * took the whole of it as his words.
 *
 * The signature is found only where it plainly is one, since hiding a customer's words is worse than a long bubble: a
 * sign-off and their name stay words, and so does a form's "Phone: …". Run against the contracts build.
 */

const PRODUCTION =
  "needs you test\n\nRuben Segura\nFounder, RJ Capital\n[image: RJ Capital] <https://rjcapital.io>\n" +
  "rjcapital.io  |  ruben@rjcapital.io\n3495 US-1, Princeton, NJ 08540";

/* ------------------------------ the signature ------------------------------ */

test("the email that came in on production: his words, and his signature apart, with Gmail's picture stand-in gone", () => {
  const p = emailPartsOf(PRODUCTION, "Ruben Segura");
  assert.equal(p.said, "needs you test");
  assert.equal(
    p.signature,
    "Ruben Segura\nFounder, RJ Capital\nrjcapital.io  |  ruben@rjcapital.io\n3495 US-1, Princeton, NJ 08540",
  );
  assert.equal(p.quoted, null);
  assert.equal(emailSignatureLine(p.signature), "Ruben Segura · Founder, RJ Capital · rjcapital.io");
});

test("a sign-off and a first name are words, never a signature", () => {
  const p = emailPartsOf("Hi,\n\nCan I book Tuesday?\n\nThanks,\nAna", "Ana Lopez");
  assert.equal(p.signature, null);
  assert.equal(p.said, "Hi,\n\nCan I book Tuesday?\n\nThanks,\nAna");
});

test("a sign-off stays with the words, and the card under it is the signature", () => {
  const p = emailPartsOf(
    "Hi,\n\nCan I book Tuesday?\n\nBest,\nAna Lopez\nOwner, Lopez Salon\n(917) 555-0100",
    "Ana Lopez",
  );
  assert.equal(p.said, "Hi,\n\nCan I book Tuesday?\n\nBest,");
  assert.equal(p.signature, "Ana Lopez\nOwner, Lopez Salon\n(917) 555-0100");
});

test("a card is a signature by its shape even where the name the client gave is another", () => {
  const p = emailPartsOf("Quote attached.\n\nDana Reyes\nreyes-movers.example.com", "");
  assert.equal(p.said, "Quote attached.");
  assert.equal(p.signature, "Dana Reyes\nreyes-movers.example.com");
});

test("a form's lines are what it says: 'Phone: …' is never a signature", () => {
  const body = "New lead from the site\n\nName: Jen Park\nPhone: (917) 555-0142\nEmail: jen@example.com";
  const p = emailPartsOf(body, "Fixture Salon Website");
  assert.equal(p.signature, null);
  assert.equal(p.said, body);
});

test("a '-- ' line starts a signature, and a 'Sent from my iPhone' last line is one", () => {
  assert.deepEqual(emailPartsOf("Yes, Tuesday.\n-- \nAna\nLopez Salon", "Ana"), {
    said: "Yes, Tuesday.",
    signature: "Ana\nLopez Salon",
    quoted: null,
  });
  assert.deepEqual(emailPartsOf("Yes, Tuesday.\n\nSent from my iPhone", ""), {
    said: "Yes, Tuesday.",
    signature: "Sent from my iPhone",
    quoted: null,
  });
});

test("an email that is nothing but a signature keeps it as its words: a bubble is never empty", () => {
  const p = emailPartsOf("Ruben Segura\nFounder, RJ Capital\nrjcapital.io", "Ruben Segura");
  assert.equal(p.signature, null);
  assert.equal(p.said, "Ruben Segura\nFounder, RJ Capital\nrjcapital.io");
});

test("words of ours carry no signature in what was typed: 'Talk soon,' stays the end of the email", () => {
  assert.deepEqual(emailPartsOf("Hi Ruben,\n\nThanks.\n\nTalk soon,\nRuben Segura\nchanlytics.agency", null), {
    said: "Hi Ruben,\n\nThanks.\n\nTalk soon,\nRuben Segura\nchanlytics.agency",
    signature: null,
    quoted: null,
  });
});

test("a reply that quotes and signs: the words, the signature above the chain, and the chain", () => {
  const body =
    "Thursday at 2 works.\n\nRuben Segura\nFounder, RJ Capital\n\n" +
    "On Tue, Oct 27, 2026 at 1:55 PM Ruben Segura <hi@chanlytics.agency> wrote:\n> Hi Ruben,";
  const p = emailPartsOf(body, "Ruben Segura");
  assert.equal(p.said, "Thursday at 2 works.");
  assert.equal(p.signature, "Ruben Segura\nFounder, RJ Capital");
  assert.ok(p.quoted.startsWith("On Tue, Oct 27, 2026"), p.quoted);
});

/* ------------------------------- tidy words ------------------------------- */

test("one line ending, no run of blank lines, and a linked word said once", () => {
  assert.equal(tidyEmailWords("Line one\r\nLine two\r\n\r\n\r\n\r\nPara two  "), "Line one\nLine two\n\nPara two");
  assert.equal(tidyEmailWords("rjcapital.io <https://rjcapital.io/>"), "https://rjcapital.io/");
  assert.equal(tidyEmailWords("See our menu <https://example.com/menu>"), "See our menu https://example.com/menu");
  assert.equal(tidyEmailWords("Write to ana@example.com <mailto:ana@example.com>"), "Write to ana@example.com");
  assert.equal(tidyEmailWords("[image: Logo]\nTuesday?"), "Tuesday?", "a line that held only a picture is gone");
});

/* ------------------------- every reader says the same ------------------------- */

const email = (id, sender, body, subject, extra = {}) => ({
  id,
  conversation_id: "c1",
  channel: "email",
  direction: sender === "customer" ? "inbound" : "outbound",
  sender,
  type: "text",
  body,
  status: sender === "customer" ? "received" : "sent",
  created_at: extra.at ?? "2026-10-27T17:42:03Z",
  meta: { email: { subject, from: "ruben@rjcapital.io", from_name: sender === "customer" ? "Ruben Segura" : null } },
  ...extra,
});

test("what an email says, wherever it is shown, is the words without the signature (messageWords)", () => {
  assert.equal(messageWords(email("m1", "customer", PRODUCTION, "test need you")), "needs you test");
});

const conversation = (messages) => ({
  id: "c1",
  state: "escalated",
  contact: { id: "k1", email: "ruben@rjcapital.io", display_name: null, phone_e164: null },
  messages,
  last_wa_inbound_at: null,
});

test("the thread says the subject once, in its head, and on a bubble only where it changes; the signature rides the bubble", () => {
  const thread = toInboxThreadVM(
    conversation([
      email("m1", "customer", PRODUCTION, "test need you", { at: "2026-10-27T17:42:03Z" }),
      email("m2", "human", "Hi Ruben,\n\nThanks.\n\nTalk soon,", "Re: test need you", { at: "2026-10-27T17:55:42Z" }),
      email("m3", "customer", "New question.", "Pricing for March", { at: "2026-10-27T18:10:00Z" }),
    ]),
    null,
    "America/New_York",
    new Date("2026-10-27T18:20:00Z"),
  );
  assert.equal(thread.emailSubject, "test need you");
  const msgs = thread.timeline.filter((e) => e.type === "msg");
  assert.deepEqual(
    msgs.map((m) => m.subject ?? null),
    [null, null, "Pricing for March"],
  );
  assert.equal(msgs[0].body, "needs you test");
  assert.deepEqual(msgs[0].signature, {
    line: "Ruben Segura · Founder, RJ Capital · rjcapital.io",
    full: "Ruben Segura\nFounder, RJ Capital\nrjcapital.io  |  ruben@rjcapital.io\n3495 US-1, Princeton, NJ 08540",
  });
  assert.equal(
    msgs[1].body,
    "Hi Ruben,\n\nThanks.\n\nTalk soon,",
    "ours keeps its paragraphs, and no signature is found in it",
  );
  assert.equal(msgs[1].signature, undefined);
});

test("emailSubjectsOf: 'Re:' and 'Fwd:' are the same subject; a thread of no email has none", () => {
  const s = emailSubjectsOf([
    email("a", "customer", "x", "Quote"),
    email("b", "human", "y", "RE: quote"),
    email("c", "customer", "z", "Fwd: Re: Quote"),
  ]);
  assert.equal(s.thread, "Quote");
  assert.equal(s.changed.size, 0);
  assert.deepEqual(emailSubjectsOf([{ ...email("w", "customer", "hi", null), channel: "whatsapp" }]), {
    thread: null,
    changed: new Map(),
  });
});

test("our reply says what it was signed with, as it left (00487 meta.email.signature): one line, the whole on a tap", () => {
  const thread = toInboxThreadVM(
    conversation([
      email("m1", "customer", "needs you test", "test need you", { at: "2026-10-27T17:42:03Z" }),
      {
        ...email("m2", "human", "Hi Ruben,\n\nThanks.\n\nTalk soon,", "Re: test need you", {
          at: "2026-10-27T17:55:42Z",
        }),
        meta: {
          email: { subject: "Re: test need you", signature: "Ruben Segura\nFounder, Chanlytics\nchanlytics.agency" },
        },
      },
    ]),
    null,
    "America/New_York",
    new Date("2026-10-27T18:20:00Z"),
  );
  const ours = thread.timeline.filter((e) => e.type === "msg")[1];
  assert.equal(ours.body, "Hi Ruben,\n\nThanks.\n\nTalk soon,", "what was typed");
  assert.deepEqual(ours.signature, {
    line: "Ruben Segura · Founder, Chanlytics · chanlytics.agency",
    full: "Ruben Segura\nFounder, Chanlytics\nchanlytics.agency",
  });
});

/* ------------------- words read in the wrong charset, and a row's one line ------------------- */

test("UTF-8 read as Latin-1 or Windows-1252 gets its own characters back, and nothing else is touched", () => {
  assert.equal(repairMojibake("If youâ€™re still looking"), "If you’re still looking");
  assert.equal(repairMojibake("a naÃ¯ve â€œquoteâ€"), "a naïve “quote”", "Latin-1's control byte as well as 1252's");
  assert.equal(
    repairMojibake("café — youâ€™re in"),
    "café — you’re in",
    "a word truly in Latin-1 stays beside a repair",
  );
  assert.equal(repairMojibake("café, crème, señor"), "café, crème, señor");
  const plain = "Can I move Saturday to 11?";
  assert.equal(repairMojibake(plain), plain);
  // What the import kept before it repaired (a message's words never change once written) is said right where shown.
  assert.equal(emailPartsOf("Hi Dana, I hope youâ€™re doing well.", "").said, "Hi Dana, I hope you’re doing well.");
});

test("an email as a row's one line: its own words, without the chain, the signature, a list's links or a rule", () => {
  assert.equal(
    emailPreviewOf(
      "needs you test\n\nDana Example\nFounder, Example Co\n[image: Example Co] <https://example.com>\nexample.com | dana@example.com",
    ),
    "needs you test",
    "a card under a blank line is the signature, found by its shape with no sender's name",
  );
  assert.equal(
    emailPreviewOf("We updated our [Conditions of Use](https://www.example.com/help/terms?id=1). Read them here."),
    "We updated our Conditions of Use. Read them here.",
  );
  assert.equal(
    emailPreviewOf(
      "New promo-list signup from example.com\nEmail: a.person@example.com\nLanguage: English\nSource: cta-band",
    ),
    "New promo-list signup from example.com · Email: a.person@example.com · Language: English · Source: cta-band",
    "a form's lines each after a dot",
  );
  assert.equal(
    emailPreviewOf("Dear Dana,\n------------------------------\nThank you for your interest."),
    "Dear Dana, Thank you for your interest.",
    "a rule of dashes is no words",
  );
  assert.equal(
    emailPreviewOf(
      "Sounds good, see you then.\n\nOn Thu, Sep 17, 2026 at 10:44 PM Example Salon <hi@example.com> wrote:\n> Are you free?",
    ),
    "Sounds good, see you then.",
  );
  assert.equal(emailPreviewOf("Is Saturday open?\nI could come at 11."), "Is Saturday open? I could come at 11.");
  // An address with its scheme, and a phone's link in angle brackets, are no words to read in a line; a bare one stays.
  assert.equal(emailPreviewOf("Get Outlook for iOS<https://aka.example/o0u>"), "Get Outlook for iOS");
  assert.equal(emailPreviewOf("Call (888) 555-0100 <tel:+18885550100> today"), "Call (888) 555-0100 today");
  assert.equal(emailPreviewOf("See https://example.com/listing/9 or example.com"), "See or example.com");
});
