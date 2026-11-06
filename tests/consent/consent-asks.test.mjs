/**
 * What each channel asks of a person before it carries a message, said for the pages that state it (the Campaigns review,
 * finding 12): a composer's guardrails and an approval sheet's rules. The words are not a second copy of the consent rule:
 * what a channel asks is read from the one predicate (mayMessageFor), so this holds the two together cell by cell, and
 * pins the words of the cells no decision moves (WhatsApp and a text ask a yes; an offer by email asks a yes or a relationship).
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { CONSENT_CHANNELS, consentGuardWords, consentRuleWords, mayMessageFor, yesAsked } from "@chanlytics/contracts";

const PURPOSES = ["conversational", "marketing"];

/** Nobody has answered anything; the same person once they have dealt with the business; and one who said yes to everything. */
const BARE = {
  consent: "unknown",
  dnc: false,
  marketing_consent: "unknown",
  email_marketing: "unknown",
  has_relationship: false,
};
const DEALT = { ...BARE, has_relationship: true };
const YES = (channel) => ({
  consent: "opted_in",
  dnc: false,
  marketing_consent: "opted_in",
  consent_channels: [channel],
  marketing_channels: [channel],
  email_marketing: "opted_in",
  has_relationship: false,
});
const may = (person, purpose, channel) => mayMessageFor(person, purpose, { proactive: true, channel }).ok;

test("what a channel asks of a person is what the predicate says of one who answered nothing, and of one who only dealt with the business", () => {
  for (const channel of CONSENT_CHANNELS)
    for (const purpose of PURPOSES) {
      const ask = yesAsked(channel, purpose);
      const cell = `${channel} / ${purpose}`;
      // Whatever it asks, a person who gave the yes it asks is let through: the words never ask for more than the rule does.
      assert.equal(may(YES(channel), purpose, channel), true, `${cell}: a yes is enough`);
      assert.equal(may(BARE, purpose, channel), ask === "none", `${cell}: nothing said`);
      assert.equal(
        may(DEALT, purpose, channel),
        ask === "none" || ask === "yes_or_dealt",
        `${cell}: only dealt with you`,
      );
    }
});

test("the cells no decision moves: WhatsApp and a text ask a recorded yes; an offer by email asks a yes or a relationship on record", () => {
  for (const purpose of PURPOSES) {
    assert.equal(yesAsked("whatsapp", purpose), "yes");
    assert.equal(yesAsked("sms", purpose), "yes");
  }
  assert.equal(yesAsked("email", "marketing"), "yes_or_dealt");
});

test("the guardrails say who a campaign reaches for the channels it goes by: one line when they ask alike, one for each way they differ", () => {
  // WhatsApp and a text ask the same, so they are one line: a recorded yes and a phone number.
  assert.deepEqual(consentGuardWords(["whatsapp"], "marketing"), [
    "Only people with a recorded yes to offers and a phone number.",
  ]);
  assert.deepEqual(consentGuardWords(["whatsapp"], "conversational"), [
    "Only people with a recorded yes to hearing from you and a phone number.",
  ]);
  assert.deepEqual(consentGuardWords(["whatsapp", "sms"], "conversational"), [
    "Only people with a recorded yes to hearing from you and a phone number.",
  ]);
  // An offer by email is not a yes and a number: a yes to offers by email or a relationship on record, and an address that works.
  assert.deepEqual(consentGuardWords(["email"], "marketing"), [
    "Only people with a yes to offers by email or a relationship with you on record, and an email address that works.",
  ]);
  assert.deepEqual(consentGuardWords(["whatsapp", "email"], "marketing"), [
    "On WhatsApp: only people with a recorded yes to offers and a phone number.",
    "By email: only people with a yes to offers by email or a relationship with you on record, and an email address that works.",
  ]);
  // No number and no yes is said of email only where the predicate asks none: the words follow the rule, not a copy of it.
  const [mail] = consentGuardWords(["email"], "conversational");
  const ask = yesAsked("email", "conversational");
  assert.ok(
    ask === "none"
      ? mail === "Only people with an email address that works."
      : /^Only people with (a recorded yes|a yes) to hearing from you by email.*and an email address that works\.$/.test(
          mail,
        ),
    mail,
  );
  assert.equal(/phone number|a number/.test(mail), false, "an email never needs a number");
  // The order is the page's, whatever order the channels come in; none ticked says nothing.
  assert.deepEqual(
    consentGuardWords(["email", "whatsapp"], "marketing"),
    consentGuardWords(["whatsapp", "email"], "marketing"),
  );
  assert.deepEqual(consentGuardWords([], "marketing"), []);
});

test("an approval's rules say what each person it reaches was asked, from the channels it reaches them on: WhatsApp alone as every run before channels", () => {
  const by = (whatsapp, sms, email) => ({ whatsapp, sms, email });
  // No count kept, or nobody reached: WhatsApp's, which is what such a run asks.
  assert.deepEqual(consentRuleWords(null, "marketing"), ["each said yes to offers"]);
  assert.deepEqual(consentRuleWords(undefined, "conversational"), ["each said yes to hearing from you"]);
  assert.deepEqual(consentRuleWords(by(0, 0, 0), "marketing"), ["each said yes to offers"]);
  assert.deepEqual(consentRuleWords(by(5, 0, 0), "marketing"), ["each said yes to offers"]);
  // WhatsApp and a text ask the same: one line. An offer by email asks something else, so each is said apart.
  assert.deepEqual(consentRuleWords(by(3, 2, 0), "conversational"), ["each said yes to hearing from you"]);
  assert.deepEqual(consentRuleWords(by(0, 0, 4), "marketing"), [
    "each asked for offers by email, or has dealt with you",
  ]);
  assert.deepEqual(consentRuleWords(by(4, 0, 2), "marketing"), [
    "each reached on WhatsApp said yes to offers",
    "each reached by email asked for offers by email, or has dealt with you",
  ]);
  // A message about a visit by email: what the predicate asks of an email, and an address that works if it asks no yes.
  const visit = consentRuleWords(by(0, 0, 4), "conversational");
  assert.equal(visit.length, 1);
  assert.ok(
    yesAsked("email", "conversational") === "none"
      ? visit[0] === "each has an email address that works"
      : /^each said yes to hearing from you by email/.test(visit[0]),
    visit[0],
  );
});
