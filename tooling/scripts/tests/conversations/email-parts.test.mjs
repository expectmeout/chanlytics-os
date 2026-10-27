/**
 * An email in its parts (the email canvas's lane A, 27 Oct 2026): what they wrote, the signature under it, and the chain
 * it quoted. On production Ruben's "needs you test" arrived as "needs you test Ruben Segura Founder, RJ Capital [image:
 * RJ Capital] <https://rjcapital.io> rjcapital.io | ruben@rjcapital.io 3495 US-1, Princeton, NJ 08540", one paragraph,
 * in the thread, in Need you and in Conversations: Gmail's plain text puts no "-- " before a signature, and every reader
 * took the whole of it as his words.
 *
 * The signature is found only where it plainly is one, since hiding a customer's words is worse than a long bubble: a
 * sign-off and their name stay words, and so does a form's "Phone: …". Run against the contracts build.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  emailPartsOf,
  emailSignatureLine,
  emailSubjectsOf,
  messageWords,
  tidyEmailWords,
  toInboxThreadVM,
} from "@chanlytics/contracts";

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
