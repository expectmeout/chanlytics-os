/**
 * The messages sent in the business's name when the receptionist cannot answer, with its details as they are now.
 *
 * The wiring audit's S5: the greeting, the holding message and the acknowledgement for a voice note or a photo were
 * written once, from what the form held that day, with the number and the booking link baked in. A workspace set up
 * before its line existed told customers "call us at ."; a changed link or a new line left them the old one; and no
 * page showed any of the three. A message may now name {business}, {booking link} and {phone}, and each is filled as
 * it goes out, from the facts the prompt already speaks (resolveFacts).
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  EARLIER_FALLBACK_DEFAULTS,
  FALLBACK_DEFAULTS,
  fallbackMessages,
  fallbacksWords,
  formatPhoneDisplay,
  isProductFallback,
} from "@chanlytics/contracts";

const LINE = "+13055550123";
const brain = (fallbacks, over = {}) => ({
  business_name: "Northside Studio",
  booking_link: "https://book.example/northside",
  system_prompt: "You answer for Northside Studio, warmly and briefly, always.",
  fallbacks: { greeting: "Hello.", error: "Sorry.", non_text: "Thanks.", ...fallbacks },
  ...over,
});
const answering = {
  workspace: { name: "Northside Studio", timezone: null },
  channels: [{ kind: "voice", number_e164: LINE, status: "active" }],
  listing: null,
};

test("a message that names no detail goes out exactly as written", () => {
  const written = {
    greeting:
      "Hi! Thanks for reaching out 💛\n\nBook anytime: https://book.example.com/en-us/4471902\n\nOr reply here.",
    error:
      "Thanks for reaching out! Book anytime: https://book.example.com/en-us/4471902 — or a member of our team will reply here soon.",
    non_text: "Thanks for your message!  For anything urgent, call us at (212) 555-0142.\n",
  };
  assert.deepEqual(fallbackMessages(brain(written), answering), written, "byte for byte, spacing and all");
});

test("{business}, {booking link} and {phone} are filled from the facts the prompt speaks", () => {
  const named = {
    greeting: "Hi!  Welcome back.\nThanks for reaching out to {business}.\n\nBook anytime: {booking link}",
    error: "Sorry — book at {booking link}.",
    non_text: "For anything urgent, call us at {phone}.",
  };
  const typed = fallbackMessages(brain(named, { phone_display: "(305) 555-0199" }), answering);
  assert.equal(
    typed.greeting,
    "Hi!  Welcome back.\nThanks for reaching out to Northside Studio.\n\nBook anytime: https://book.example/northside",
    "a line naming no detail keeps its own spacing",
  );
  assert.equal(typed.error, "Sorry — book at https://book.example/northside.");
  assert.equal(typed.non_text, "For anything urgent, call us at (305) 555-0199.", "a number the owner typed wins");
  assert.equal(
    fallbackMessages(brain(named), answering).non_text,
    `For anything urgent, call us at ${formatPhoneDisplay(LINE)}.`,
    "otherwise the line the receptionist answers, formatted for a person",
  );
});

test('REGRESSION (S5): a sentence naming a number the workspace does not have is left out -- a new workspace told customers "call us at ."', () => {
  const out = fallbackMessages(
    brain({
      non_text:
        "Thanks for your message! A member of our team will reply here soon. For anything urgent, call us at {phone}.",
    }),
    null,
  );
  assert.equal(out.non_text, "Thanks for your message! A member of our team will reply here soon.");
  const own = fallbackMessages(brain({ greeting: "Hi!\n\nCall us: {phone}\n\nOr reply here." }), null);
  assert.equal(own.greeting, "Hi!\n\nOr reply here.", "a line of its own goes, and the gap with it");
});

test("the names are read however they are typed, and a name that is not one of them stays as written", () => {
  const out = fallbackMessages(
    brain(
      { error: "Book at { Booking  Link } or call {PHONE}.", non_text: "See {bookinglink}." },
      { phone_display: "(305) 555-0199" },
    ),
    null,
  );
  assert.equal(out.error, "Book at https://book.example/northside or call (305) 555-0199.");
  assert.equal(out.non_text, "See {bookinglink}.", "nothing is guessed");
});

test("a message that would leave nothing to send says the default instead", () => {
  const out = fallbackMessages(brain({ non_text: "{phone}" }), null);
  assert.equal(
    out.non_text,
    "Thanks for your message! A member of our team will take a look and reply here soon.",
    "a customer is never sent nothing, and never a name",
  );
});

test("the product's wording reads right with no booking link and offers the link where there is one; the wording a workspace was set up with before is still the product's", () => {
  const quotes = {
    business_name: "Harbor Moving",
    system_prompt: "Answer as the front desk of Harbor Moving, which quotes each move before it is booked.",
    fallbacks: { ...FALLBACK_DEFAULTS },
  };
  const none = fallbackMessages(quotes, null);
  assert.equal(none.greeting, "Hi! Thanks for reaching out to Harbor Moving.\n\nReply here with any question.");
  assert.equal(none.error, "Thanks for reaching out to Harbor Moving! A member of our team will reply here soon.");
  const linked = fallbackMessages({ ...quotes, booking_link: "https://book.example/harbor" }, null);
  assert.equal(
    linked.greeting,
    "Hi! Thanks for reaching out to Harbor Moving.\n\nBook anytime: https://book.example/harbor\n\nReply here with any question.",
  );
  assert.equal(
    linked.error,
    "Thanks for reaching out to Harbor Moving! A member of our team will reply here soon. Book anytime: https://book.example/harbor",
  );
  for (const key of ["greeting", "error", "non_text"]) {
    assert.equal(isProductFallback(key, FALLBACK_DEFAULTS[key]), true, key);
    assert.equal(isProductFallback(key, EARLIER_FALLBACK_DEFAULTS[key]), true, `the earlier wording (${key})`);
    assert.equal(isProductFallback(key, "Thanks! We'll be in touch."), false, key);
  }
  assert.equal(
    fallbacksWords({ ...EARLIER_FALLBACK_DEFAULTS }).line,
    "3 messages, the product's wording",
    "never told it wrote its own",
  );
});
