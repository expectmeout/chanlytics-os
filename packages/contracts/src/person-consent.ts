/**
 * What a person said yes or no to, and who may send them what: the consent sources, the refusals, and the three
 * predicates a broadcast, a playbook and a list read (mayReceive, whyNotReceive, saidYesTo). Moved whole from
 * people.ts (Reach out Part 2.5), which re-exports it.
 */
import { type AskedPurpose, mayMessageFor } from "./consent";
import type { PersonRowVM } from "./people";

export interface PersonConsent {
  state: "unknown" | "opted_in" | "opted_out";
  dnc: boolean;
  label: string;
  /** The answer in its control's words: "Yes", "Not asked" or "No". */
  answerLabel: "Yes" | "Not asked" | "No";
  sub: string;
  /** How the answer was given, raw: in_person | phone | form | customer_message | operator | null. */
  source: string | null;
  /**
   * The OTHER answer: offers, specifically.
   *
   * Separate because the carriers require it separate (error 30913) and because
   * the two mean different things -- a person can want to hear about their own
   * appointment and not want to hear about a sale. An opt-out or a do-not-call
   * on the main answer overrides this one; the reverse does not.
   */
  marketing: "unknown" | "opted_in" | "opted_out";
  marketingSource: string | null;
  /** One line for the person's profile: what they said about offers, and when. */
  marketingSub: string;
  /** The offers answer in a word, as People's Offers column says it: Yes, No or Not asked. */
  marketingLabel: string;
}

/**
 * How a customer's answer about marketing messages was given. The ingest
 * writes 'customer_message' for STOP and START; a person at the desk picks
 * one of these four. 'operator' is the reset to "not asked" and is never
 * offered as a source.
 */
export const CONSENT_SOURCES: readonly { id: string; label: string }[] = [
  { id: "in_person", label: "In person" },
  { id: "phone", label: "On the phone" },
  { id: "form", label: "Sign-up form" },
  { id: "customer_message", label: "Their own message" },
];

export const CONSENT_RESET_SOURCE = "operator";

/**
 * The ways a yes to OFFERS may have been given: in writing, and only in writing.
 *
 * Promotional texts need the customer's express WRITTEN consent. The carriers
 * refuse a campaign whose opt-in "relies on verbal consent instead of written
 * consent" -- Twilio lists it among the causes of error 30913 -- and CTIA's
 * principles require written consent for marketing. So a yes to offers is a
 * sign-up form the customer signed, or their own message; a spoken yes, in person
 * or on the phone, is a yes to messages about their visit and nothing more.
 *
 * 00095 said this in its own comment ("both are express written consent") while
 * its check let a spoken yes through. 00100 closes that in the database; this is
 * the same rule for the route and the menus, so all three say one thing.
 *
 * Only the YES is narrowed. A "no more offers" is honoured however it is said.
 */
export const OFFERS_YES_SOURCES: readonly string[] = ["form", "customer_message"];

/** Why a yes to offers given this way cannot be recorded -- or null when it can. */
export function offersYesRefusal(source: string | null | undefined): string | null {
  if (source && OFFERS_YES_SOURCES.includes(source)) return null;
  return "A yes to offers has to be in writing: a sign-up form they signed, or their own message. A spoken yes covers messages about their visit, not offers.";
}

/**
 * "Their own message" names the message (00137).
 *
 * A desk could record an answer "in their own message" with nothing behind it:
 * both doors took the source from any signed-in member, and the ledger then
 * said a customer had written something nobody had looked for. When the
 * conversation is in Chanlytics the desk now names the message they sent, and
 * the door copies its id and words into the evidence. An answer given
 * somewhere Chanlytics does not see is a sign-up form, with a note saying where.
 *
 * The database says these sentences too, so a refusal reads the same whichever
 * of the two gives it; their-own-message.db.test.mjs holds the two equal.
 */
export const OWN_MESSAGE_REFUSALS = {
  /** Their own message, with no message named. */
  missing:
    "Choose the message where they said it. If they wrote to you somewhere Chanlytics doesn't see, record a sign-up form and say where in the note.",
  /** The message named is not one this person sent this workspace. */
  notTheirs: "That isn't a message this person sent you. Choose one of theirs.",
  /** The message named has nothing written in it. */
  wordless: "That message has no words in it to show their answer. Choose the one where they said it.",
  /** A message named beside another way of answering. */
  notOwnMessage: "Only an answer in their own message names a message.",
  /** Their own message, for many people at once: one message cannot be every person's. */
  batch:
    "Their own message is recorded one person at a time, on their page, where you choose the message. For signed slips, choose Sign-up form.",
} as const;

/** Why an answer given this way cannot be recorded with this message -- or null when it can. */
export function ownMessageRefusal(
  source: string | null | undefined,
  messageId: string | null | undefined,
): string | null {
  if (source === "customer_message") return messageId ? null : OWN_MESSAGE_REFUSALS.missing;
  return messageId ? OWN_MESSAGE_REFUSALS.notOwnMessage : null;
}

/** The words for a source; the reset has none, an unknown one is shown as itself. */
export function consentSourceLabel(source: string | null | undefined): string | null {
  if (!source) return null;
  const known = CONSENT_SOURCES.find((s) => s.id === source);
  if (known) return known.label;
  return source === CONSENT_RESET_SOURCE ? null : source;
}

/**
 * May a message of this purpose reach this person? A number to send to, and the
 * yes THIS message needs.
 *
 * IT LIVES HERE, beside `consentOf`, because it is a question about a person, and
 * because this module's own lists were answering it by hand. `offers_ok` and
 * `peopleListAction` each spelled "said yes to offers" as a bare
 * `consent.marketing === "opted_in"` -- no phone check -- while the broadcast route
 * enrolled with this. So a list could promise "4 said yes to offers -- a broadcast
 * reaches them" about people with no number the route would then leave out. It was
 * one rule in the commit message and three in the code.
 *
 * ONE RULE, NOT TWO. This used to restate `mayMessageFor`'s logic by hand,
 * because the two sides of one pipeline hold the person in two different shapes:
 * the route and the page hold a `PersonRowVM`, the send job holds the database
 * row. Two hand-written copies of a consent rule is the thing this file's own
 * header calls a defect, and it duly drifted -- the enrolment half asked for
 * marketing consent while the sending half asked what the template implied. So
 * the shape is adapted here and the QUESTION is answered in exactly one place.
 *
 * `proactive` is always true: a broadcast starts a conversation. Nobody wrote to
 * us to ask for it.
 *
 * THE PURPOSE IS REQUIRED, and that is the fix rather than a detail of it. It
 * used to default to marketing, described as "the safe answer for a caller that
 * has not thought about it" -- and every caller but one then failed to think
 * about it, so a utility message was refused to the very people migration 00095
 * exists to reach. A default cannot be audited; a required argument is checked
 * by the compiler at every call site, the way `businessRecordProblems` requires
 * its registration path.
 */
export function mayReceive(r: Pick<PersonRowVM, "consent" | "phone">, purpose: AskedPurpose): boolean {
  return whyNotReceive(r, purpose) === null;
}

/**
 * Why a broadcast may not reach this person, or null when it may: the same one
 * rule as `mayReceive`, with its answer kept. A run that leaves someone out can
 * then say which of three things it was -- no number to send to, a stop (asked
 * to, or on the do-not-contact list), or never having said yes -- instead of
 * one count that hides the one an owner can do something about.
 */
export type NotReceived = "no_number" | "stopped" | "no_yes";

export function whyNotReceive(r: Pick<PersonRowVM, "consent" | "phone">, purpose: AskedPurpose): NotReceived | null {
  // Every audience today leaves by WhatsApp or text, and both need a number. A
  // person with an address and none is reached when the email wire carries
  // reminders (docs/plans/2026-09-17-email-channel.md, §11), not before.
  if (!r.phone) return "no_number";
  const said = mayMessageFor(
    { consent: r.consent.state, dnc: r.consent.dnc, marketing_consent: r.consent.marketing },
    purpose,
    { proactive: true },
  );
  if (said.ok) return null;
  return said.reason === "opted_out" ? "stopped" : "no_yes";
}

/**
 * Whether this person's yes covers a message of this purpose, a number to send it to aside: the half of
 * `mayReceive` that is an answer they gave. When nobody on a list can be sent a thing and somebody on it said yes,
 * what is missing is a number, not an answer -- and asking them for their yes asks for one they already gave.
 */
export function saidYesTo(r: Pick<PersonRowVM, "consent">, purpose: AskedPurpose): boolean {
  return mayMessageFor(
    { consent: r.consent.state, dnc: r.consent.dnc, marketing_consent: r.consent.marketing },
    purpose,
    { proactive: true },
  ).ok;
}
