/**
 * The receptionist asks for the yes to offers, once (One message, every channel, step 2; the design canvas' board A5).
 *
 * Two halves, held together here: the RULE it is told (contracts config/workspace-config/offers-ask.ts, composed under
 * "Rules you must follow" for a workspace with a WhatsApp number) and the FACTS it reads of each person every turn
 * (describeLead in packages/db): their answer about offers, and whether they were ever asked. "Asked" is a fact the
 * database keeps (contacts.offers_asked_at); nothing here writes it.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  composeSystemPrompt,
  resolveSystemPrompt,
  offersFacts,
  OFFERS_OPT_IN_PHRASES,
  parseTenantConfigResult,
} from "@chanlytics/contracts";
import { describeLead } from "@chanlytics/db";

const NOW = new Date("2026-10-02T15:00:00Z");
const TZ = "America/Chicago";
const LINE = "+15550100145";
const BASE = { business_name: "Example Salon", phone_display: null, booking_link: "https://book.example.com/salon" };
const PROFILE = { tone: "Warm.", hours: { mon: { open: "09:00", close: "17:00" } } };
const STORED_PROMPT = "Answer as the front desk of Example Salon: brief and warm, and never guess a price.";

/** The ask's own line among the rules, or undefined. */
const askLine = (prompt) =>
  prompt.split("\n").find((l) => l.startsWith("- When a WhatsApp conversation the customer started"));
const compose = (base, channel = "whatsapp") => composeSystemPrompt(base, PROFILE, channel, TZ, NOW, null);

/* ------------------------------ the rule ---------------------------------- */

test("a workspace with a WhatsApp number is told to ask for the yes to offers, once, on WhatsApp; one without, and a call, are not", () => {
  const withNumber = compose({ ...BASE, whatsapp_line: LINE });
  const line = askLine(withNumber);
  assert.ok(line, "the line is among the rules");
  assert.ok(withNumber.indexOf("Rules you must follow:") < withNumber.indexOf(line), "under the rules heading");
  assert.match(line, /natural end/);
  assert.match(line, /a booking made or confirmed, or their question fully answered/);
  assert.match(line, /Never ask twice/);
  // Never in the cases the brief names, and never as a condition of anything.
  for (const never of [
    "a text or email conversation",
    "a complaint",
    "a cancellation",
    "after STOP",
    "said no to offers",
  ])
    assert.ok(line.includes(never), `never: ${never}`);
  assert.match(line, /never make it a condition of anything/);
  // The answer to a customer's own YES OFFERS is still told, beside it.
  assert.ok(withNumber.includes("If a message is only the words YES OFFERS or SI OFERTAS"));

  for (const none of [null, undefined]) {
    const without = compose({ ...BASE, whatsapp_line: none });
    assert.equal(askLine(without), undefined, `no WhatsApp number (${none}): no ask`);
    assert.ok(!without.includes("Want our offers and news here too?"));
    assert.ok(without.includes("If a message is only the words YES OFFERS or SI OFERTAS"), "the answer stays");
  }
  const call = compose({ ...BASE, whatsapp_line: LINE }, "voice");
  assert.equal(
    askLine(call),
    undefined,
    "the phone prompt is never told to ask: nobody can reply YES OFFERS on a call",
  );
  assert.ok(!call.includes("Want our offers and news here too?"));
});

test("the resolver says it from the WhatsApp number the platform provisioned, never from one typed, and never to a prompt nothing composed", () => {
  const parsed = parseTenantConfigResult({
    brain: {
      business_name: "Example Salon",
      booking_link: "https://book.example.com/salon",
      system_prompt: STORED_PROMPT,
      fallbacks: { greeting: "g", error: "e", non_text: "n" },
      profile: PROFILE,
    },
  });
  assert.ok(parsed.ok, parsed.ok ? "" : parsed.issues.join("; "));
  const brain = parsed.config.brain;
  const known = (channels) => ({ workspace: { name: "Example Salon", timezone: TZ }, channels, listing: null });
  const asks = (k) => !!askLine(resolveSystemPrompt(brain, "whatsapp", TZ, NOW, null, k));
  assert.equal(asks(known([{ kind: "whatsapp", number_e164: LINE, status: "active" }])), true);
  assert.equal(asks(known([{ kind: "whatsapp", number_e164: LINE }])), true, "a row with no status is active");
  assert.equal(asks(known([{ kind: "whatsapp", number_e164: LINE, status: "disabled" }])), false, "a line that is off");
  assert.equal(asks(known([{ kind: "voice", number_e164: LINE, status: "active" }])), false, "a voice line is not one");
  assert.equal(asks(known([{ kind: "whatsapp", number_e164: null, status: "active" }])), false, "a row with no number");
  assert.equal(asks(known([])), false, "no channel rows, or none that could be read");
  assert.equal(asks(null), false, "nothing known");
  assert.equal(asks(undefined), false);
  // A voice prompt over the same workspace is never told to ask.
  const voice = resolveSystemPrompt(brain, "voice", TZ, NOW, null, known([{ kind: "whatsapp", number_e164: LINE }]));
  assert.equal(askLine(voice), undefined);
  // A workspace with no fields is handed its own prompt back as it stands, and the rules after it are the standing ones.
  const stored = {
    business_name: "Example Salon",
    booking_link: "https://book.example.com/x",
    system_prompt: STORED_PROMPT,
  };
  const handedBack = resolveSystemPrompt(
    stored,
    "whatsapp",
    TZ,
    NOW,
    null,
    known([{ kind: "whatsapp", number_e164: LINE }]),
  );
  assert.equal(askLine(handedBack), undefined);
});

test("the phrase in the rule is OFFERS_OPT_IN_PHRASES and nothing else: no second spelling of what a customer sends", () => {
  const { en, es } = OFFERS_OPT_IN_PHRASES;
  const line = askLine(compose({ ...BASE, whatsapp_line: LINE }));
  assert.ok(line.includes(`"Want our offers and news here too? Reply ${en}. You can stop any time."`), line);
  assert.ok(line.includes(`(in Spanish, ${es} in place of ${en})`), line);
  // Executed, not read: move the constants and the rule moves with them. A literal copy would not.
  const saved = { ...OFFERS_OPT_IN_PHRASES };
  try {
    OFFERS_OPT_IN_PHRASES.en = "YES PLEASE";
    OFFERS_OPT_IN_PHRASES.es = "SI GRACIAS";
    const moved = askLine(compose({ ...BASE, whatsapp_line: LINE }));
    assert.ok(moved.includes("Reply YES PLEASE. You can stop any time."), moved);
    assert.ok(moved.includes("(in Spanish, SI GRACIAS in place of YES PLEASE)"), moved);
    assert.ok(!/YES OFFERS|SI OFERTAS/.test(moved), "the line spells neither phrase itself");
  } finally {
    Object.assign(OFFERS_OPT_IN_PHRASES, saved);
  }
});

/* ------------------------------ the facts --------------------------------- */

const lead = (over = {}) => ({
  contactId: "k1",
  conversationId: "c1",
  name: "Ana",
  returning: true,
  lastSeenAt: null,
  history: [{ role: "user", content: "hi" }],
  optedOut: false,
  ...over,
});
const note = (over, channel = "whatsapp") => describeLead(lead(over), NOW, TZ, channel);

test("the facts say each of the four states: yes, no, asked and not yet said, never asked", () => {
  assert.match(note({ marketingConsent: "opted_in", offersAskedAt: null }), /Said yes to offers\./);
  assert.match(note({ marketingConsent: "opted_out", offersAskedAt: null }), /Said no to offers\./);
  // The date is the business's own day: 18:30 UTC on 28 September is the 28th in Chicago.
  assert.match(
    note({ marketingConsent: "unknown", offersAskedAt: "2026-09-28T18:30:00.000Z" }),
    /Asked for the yes to offers on Sep 28; has not said it\./,
  );
  assert.match(
    note({ marketingConsent: "unknown", offersAskedAt: null }),
    /Has not been asked for the yes to offers\./,
  );
  // An answer outranks having been asked: someone who asked and was answered is the answer.
  const answered = note({ marketingConsent: "opted_in", offersAskedAt: "2026-09-28T18:30:00.000Z" });
  assert.match(answered, /Said yes to offers\./);
  assert.doesNotMatch(answered, /Asked for the yes|Has not been asked/);
});

test("a yes counts where it covers WhatsApp: one kept for text alone is asked for again on WhatsApp, as no answer yet", () => {
  const YES = { marketingConsent: "opted_in" };
  const asked = "2026-09-28T18:30:00.000Z";
  // Never asked, a yes by text alone: the receptionist is told it has not been asked, and may ask on WhatsApp.
  const byText = note({ ...YES, marketingChannels: ["sms"], offersAskedAt: null });
  assert.match(byText, /Has not been asked for the yes to offers\./);
  assert.doesNotMatch(byText, /Said yes/);
  // Asked already: the date, not another ask.
  const askedBefore = note({ ...YES, marketingChannels: ["sms"], offersAskedAt: asked });
  assert.match(askedBefore, /Asked for the yes to offers on Sep 28; has not said it\./);
  assert.doesNotMatch(askedBefore, /Said yes|Has not been asked/);
  // A yes for email alone is not a yes on WhatsApp either; and on a text the ask's sentence is still not said.
  assert.match(note({ ...YES, marketingChannels: ["email"], offersAskedAt: null }), /Has not been asked/);
  assert.doesNotMatch(note({ ...YES, marketingChannels: ["sms"], offersAskedAt: null }, "sms"), /Has not been asked/);
  assert.doesNotMatch(
    note({ ...YES, marketingChannels: ["sms"], offersAskedAt: undefined }),
    /offers/i,
    "unread: silence",
  );
  // The yes that covers WhatsApp, with others or alone, and the yes recorded before the channels were (none kept).
  for (const marketingChannels of [["whatsapp"], ["whatsapp", "sms"], null, undefined])
    assert.match(
      note({ ...YES, marketingChannels, offersAskedAt: null }),
      /Said yes to offers\./,
      String(marketingChannels),
    );
  // A no is a no, whatever channels were kept beside it.
  assert.match(
    note({ marketingConsent: "opted_out", marketingChannels: ["sms"], offersAskedAt: null }),
    /Said no to offers\./,
  );
  assert.deepEqual(offersFacts({ ...YES, marketingChannels: ["sms"], offersAskedAt: null }, "whatsapp", NOW, TZ), [
    "Has not been asked for the yes to offers.",
  ]);
});

test("the sentence the rule asks on is the one the facts say, word for word", () => {
  const said = note({ marketingConsent: "unknown", offersAskedAt: null }).match(
    /Has not been asked for the yes to offers\./,
  );
  assert.ok(said, "the facts say it");
  const line = askLine(compose({ ...BASE, whatsapp_line: LINE }));
  assert.ok(line.includes(`say "${said[0]}"`), "the rule names it, from the same words");
});

test("the receptionist is told nothing that lets it ask when the facts cannot say, on a text, on a call, or after STOP", () => {
  const unknown = { marketingConsent: "unknown", offersAskedAt: null };
  // A reader that never learned them, or whose database has no offers_asked_at (undefined, never null): silence.
  for (const never of [{}, { marketingConsent: "unknown" }, { marketingConsent: null, offersAskedAt: null }])
    assert.doesNotMatch(note(never), /offers/i, JSON.stringify(never));
  // Not on a call, a text, or a conversation that names no channel: asking is WhatsApp's alone.
  assert.doesNotMatch(note(unknown, "voice"), /offers/i);
  assert.doesNotMatch(
    describeLead(lead(unknown), NOW, TZ),
    /offers/i,
    "a caller that names no channel is told nothing",
  );
  const text = note(unknown, "sms");
  assert.match(text, /This conversation is by text message, not WhatsApp\./, "a text is said to be one");
  assert.doesNotMatch(text, /Has not been asked/);
  // STOP: they asked not to be messaged, and the ask is never composed for them.
  const stopped = note({ ...unknown, optedOut: true });
  assert.match(stopped, /asked not to receive messages/);
  assert.doesNotMatch(stopped, /Has not been asked/);
  // What they answered, and when they were asked, are facts on every channel; only the ask's own sentence is gated.
  assert.match(note({ marketingConsent: "opted_in", offersAskedAt: null }, "sms"), /Said yes to offers\./);
  assert.match(note({ marketingConsent: "opted_out", offersAskedAt: null }, "voice"), /Said no to offers\./);
  assert.match(
    note({ marketingConsent: "unknown", offersAskedAt: "2026-09-28T18:30:00.000Z" }, "sms"),
    /Asked for the yes to offers on Sep 28; has not said it\./,
  );
  // A person we know nothing about is the new-contact line, whatever the channel.
  assert.equal(
    describeLead({ contactId: null, history: [] }, NOW, TZ, "whatsapp"),
    "New contact — no prior history on record.",
  );
});

test("offersFacts: the text line comes first, then the one about offers, and an unreadable date is still never-said", () => {
  assert.deepEqual(offersFacts({ marketingConsent: "opted_in", offersAskedAt: null }, "sms", NOW, TZ), [
    "This conversation is by text message, not WhatsApp.",
    "Said yes to offers.",
  ]);
  assert.deepEqual(offersFacts({ marketingConsent: "unknown", offersAskedAt: "not a date" }, "whatsapp", NOW, TZ), [
    "Asked for the yes to offers; has not said it.",
  ]);
  assert.deepEqual(offersFacts({ marketingConsent: "something new", offersAskedAt: null }, "whatsapp", NOW, TZ), []);
});
