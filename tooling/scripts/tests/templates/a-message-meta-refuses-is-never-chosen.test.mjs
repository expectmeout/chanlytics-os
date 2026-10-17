/**
 * A message WhatsApp will refuse is never the one chosen (audit of 2 Oct 2026, #10, B6, C10 and B11's empty picker).
 *
 * `templateBlocked` says why this product cannot put an approved message on the wire whole: a picture for a heading, a
 * value in a heading, a button it cannot fill. The broadcast composers asked it; the receptionist's booking template
 * (`bookingTemplate`, which a call texts a caller with) and the Inbox's picker (`inboxTemplates`) did not, so "Promo with a
 * picture" was the Inbox's booking message on the Templates page, and a booking link from a call failed at Meta with
 * "HTTP 400". The sentences around them: what WhatsApp's refusal says (it lower-cased the first letter of Meta's own
 * sentence and doubled its full stop), and what an empty picker says (it said "none yet" over messages all waiting,
 * refused or paused). New exports are read at run time, so a missing one fails its own test and not the file.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import * as contracts from "@chanlytics/contracts";

// The starter's three slots (a name, the business, the link), and a workspace's own booking message with the link alone.
const SLOTS = [{ position: 1 }, { position: 2 }, { position: 3 }];
const row = (name, over = {}) => ({ name, language: "en_US", meta_status: "approved", variables: SLOTS, ...over });
const OWN = {
  variables: [{ position: 1, label: "Booking link", example: "https://booksy.example.com/x" }],
};
// Meta's components as the sync stores them: a picture over the words.
const PICTURE = [
  { type: "HEADER", format: "IMAGE", example: { header_handle: ["https://example.com/a.png"] } },
  { type: "BODY", text: "Book here: {{1}}" },
];
const PLAIN = [{ type: "BODY", text: "Book here: {{1}}" }];

test("the receptionist's booking template is never one WhatsApp refuses: judged by the components the edge reads, or by the answer the reader gives", () => {
  const { bookingTemplate } = contracts;
  const promo = row("promo_with_a_picture", { ...OWN, components: PICTURE });
  assert.equal(
    bookingTemplate([promo]),
    null,
    "REGRESSION: an approved message with a picture for a heading was the one a call texted a caller, and Meta answered 400",
  );
  assert.equal(
    bookingTemplate([row("promo_with_a_picture", { ...OWN, blocked: "a picture for a heading" })]),
    null,
    "the reader's own answer (the Templates page, Settings) says the same, with no components to judge",
  );
  assert.equal(
    bookingTemplate([row("call_text", { components: PICTURE }), row("reservar_ahora", { ...OWN, components: PLAIN })])
      ?.name,
    "reservar_ahora",
    "the starter's name does not outrank a message that can be sent: the next one is chosen",
  );
  assert.equal(
    bookingTemplate([
      row("call_text", { blocked: "a button that takes a value" }),
      row("booking_link", { blocked: null }),
    ])?.name,
    "booking_link",
    "a row the reader says is sendable (blocked null) is believed",
  );
  assert.equal(
    bookingTemplate([row("call_text", { components: PLAIN })])?.name,
    "call_text",
    "and a message of words alone is still the call's text",
  );
  // The send puts the body's values on the wire and nothing else (channels sendTemplate), so a part it has no values
  // for -- Meta's carousel of cards, a limited-time offer -- is refused for every recipient, whatever the body says.
  for (const type of ["CAROUSEL", "LIMITED_TIME_OFFER"]) {
    const parts = [...PLAIN, { type, cards: [] }];
    assert.equal(contracts.templateBlocked({ components: parts }), "a part Chanlytics cannot fill", type);
    assert.equal(
      bookingTemplate([row("call_text", { components: parts })]),
      null,
      `REGRESSION: a message with a ${type.toLowerCase()} was judged sendable`,
    );
  }
});

test("the Inbox picker leaves out a message WhatsApp refuses, and says why in the one sentence it already has for what it holds back", () => {
  const { inboxTemplates } = contracts;
  const to = { who: "Rosa Díaz", offersOk: false };
  const booking = {
    id: "t-booking",
    name: "booking_link",
    language: "en_US",
    category: "utility",
    variables: [
      { label: "Business name", example: "Luna Studio", position: 1 },
      { label: "Booking link", example: "book.example.com/luna", position: 2 },
    ],
    blocked: null,
  };
  const picture = { ...booking, id: "t-picture", name: "autumn_picture", blocked: "a picture for a heading" };
  const offered = inboxTemplates([booking, picture], to);
  assert.deepEqual(
    offered.sendable.map((s) => s.template.name),
    ["booking_link"],
    "REGRESSION: the picker offered it, and the send was refused by Meta for the person it was sent to",
  );
  assert.equal(offered.hidden, "Not offered: 1 that WhatsApp would refuse (a picture for a heading).");
  const { blocked: _answer, ...unjudged } = picture;
  assert.equal(
    inboxTemplates([booking, { ...unjudged, components: PICTURE }], to).hidden,
    "Not offered: 1 that WhatsApp would refuse (a picture for a heading).",
    "a row with its components and no answer is judged the same",
  );

  // Said with the other two reasons, in one sentence: "a, b and c", and two read as they always did.
  const promotion = { ...booking, id: "t-promo", name: "this_months_offer", category: "marketing" };
  // Two values of words to write: the reply box writes one (contracts inboxBlankOf).
  const words = {
    ...booking,
    id: "t-words",
    name: "mystery",
    variables: [
      { label: "Your message", position: 1 },
      { label: "Your sign-off", position: 2 },
    ],
  };
  assert.equal(
    inboxTemplates([booking, picture, promotion, words], to).hidden,
    "Not offered: 1 that WhatsApp would refuse (a picture for a heading), 1 promotion (Rosa Díaz hasn't said yes to offers) and 1 that needs words the Inbox doesn't ask for.",
  );
  assert.equal(
    inboxTemplates([booking, promotion, words], to).hidden,
    "Not offered: 1 promotion (Rosa Díaz hasn't said yes to offers) and 1 that needs words the Inbox doesn't ask for.",
  );
  assert.equal(
    inboxTemplates([booking, picture, { ...picture, id: "t-2", blocked: "a button that takes a value" }], to).hidden,
    "Not offered: 2 that WhatsApp would refuse (a picture for a heading, a button that takes a value).",
    "two reasons are both named, each once",
  );
});

test("WhatsApp's refusal keeps Meta's own sentence whole: its capital stays, its full stop is not doubled, and a code is said as words", () => {
  const { refusedWords } = contracts;
  const tail = "Change the words and send it back.";
  assert.equal(refusedWords("ABUSIVE_CONTENT"), `WhatsApp refused this one: abusive content. ${tail}`);
  assert.equal(refusedWords("TAG_CONTENT_MISMATCH"), `WhatsApp refused this one: tag content mismatch. ${tail}`);
  assert.equal(
    refusedWords("Variables can't be at the start or end of the template."),
    `WhatsApp refused this one: Variables can't be at the start or end of the template. ${tail}`,
    "REGRESSION: 'variables can't be ... template.. Change the words'",
  );
  assert.equal(refusedWords("  Too many variables!  "), `WhatsApp refused this one: Too many variables. ${tail}`);
  assert.equal(refusedWords(""), null, "no reason, no sentence");
  assert.equal(refusedWords("  "), null);
  assert.equal(refusedWords(null), null);
  assert.equal(refusedWords(undefined), null);
});

test("an empty picker says why: the messages left out are counted by their status, the sentence is the plain one when nothing is counted", () => {
  const { noTemplateWords, templateHolds } = contracts;
  const plain = "No approved template yet — nothing can be sent until one is.";
  for (const none of [undefined, null, {}, { pending: 0, rejected: 0, paused: 0, disabled: 0, hidden: 0 }]) {
    assert.equal(noTemplateWords(none), plain, `nothing counted: ${JSON.stringify(none)}`);
  }
  assert.equal(
    noTemplateWords({ pending: 2, rejected: 1, paused: 0, disabled: 0, hidden: 0 }),
    "No approved template yet (2 waiting for WhatsApp to review, 1 refused by WhatsApp) — nothing can be sent until one is.",
  );
  assert.equal(
    noTemplateWords({ paused: 1, disabled: 1, hidden: 3 }),
    "No approved template yet (1 paused by WhatsApp, 1 disabled by WhatsApp, 3 hidden by you) — nothing can be sent until one is.",
    "a partial count, in the one order",
  );

  const wa = (meta_status, over = {}) => ({ channel: "whatsapp", meta_status, ...over });
  assert.deepEqual(
    templateHolds([
      wa("pending"),
      wa("pending"),
      wa("rejected"),
      wa("paused"),
      wa("disabled"),
      // approved and left out of the composers' list: the workspace hid it
      wa("approved", { hidden_at: "2026-09-01T00:00:00Z" }),
      // a message the workspace wrote for email or text is not WhatsApp's to hold
      { channel: "email", meta_status: "approved" },
      { channel: "sms", meta_status: "pending" },
    ]),
    { pending: 2, rejected: 1, paused: 1, disabled: 1, hidden: 1 },
  );
  assert.deepEqual(templateHolds([]), { pending: 0, rejected: 0, paused: 0, disabled: 0, hidden: 0 });
});
