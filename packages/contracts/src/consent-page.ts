/**
 * The public "say yes to offers" page, as facts.
 *
 * Every carrier registration asks the same question — how does a customer
 * agree to hear from this business? — and wants a URL that answers it. This
 * is that URL, and it is not a new consent mechanism: it shows the ways the
 * product already records a yes, each of which is the customer's own
 * message from their own device. Nothing here collects a number, because a
 * number typed into a form is not proof that its owner agreed.
 *
 * Pure: the page feeds it the workspace's public facts, the tests feed it
 * fixtures.
 */
import { OFFERS_OPT_IN_PHRASES, optInLink } from "./enums";
import { formatPhoneDisplay } from "./phone";

export interface ConsentPageFacts {
  businessName: string;
  /** The WhatsApp number customers already write to, E.164; null when there is none. */
  whatsappE164: string | null;
  /** The line that receives texts, E.164; null until one is approved for texting. */
  smsE164: string | null;
}

export type ConsentWayKind = "whatsapp" | "sms";

export interface ConsentWay {
  kind: ConsentWayKind;
  title: string;
  /** What the customer does, in their words. */
  sentence: string;
  /** The phrase they send. */
  phrase: string;
  /** Where the button goes; null for a way with nothing to tap (a number to text by hand). */
  href: string | null;
  /** The number, as a person reads it. */
  display: string | null;
}

export interface ConsentPageVM {
  title: string;
  /** One line under the title: what they are agreeing to. */
  lead: string;
  ways: ConsentWay[];
  /** The link the QR encodes; null when there is nothing to encode. */
  qrLink: string | null;
  /** Everything the carriers look for, in the order they ask it. */
  terms: string[];
  /** True when this workspace has no way to say yes yet: the page says so rather than pretending. */
  empty: boolean;
}

/** The words the customer sends, so a page and a QR can never disagree about them. */
export const CONSENT_PHRASE = OFFERS_OPT_IN_PHRASES.en;
export const CONSENT_PHRASE_ES = OFFERS_OPT_IN_PHRASES.es;

export function consentPageVM(f: ConsentPageFacts): ConsentPageVM {
  const name = f.businessName.trim() || "This business";
  const ways: ConsentWay[] = [];
  const waLink = optInLink(f.whatsappE164, CONSENT_PHRASE);
  if (waLink) {
    ways.push({
      kind: "whatsapp",
      title: "On WhatsApp",
      sentence: `Tap to open WhatsApp with ${CONSENT_PHRASE} ready to send. Sending it is your yes.`,
      phrase: CONSENT_PHRASE,
      href: waLink,
      display: formatPhoneDisplay(f.whatsappE164),
    });
  }
  const smsDisplay = formatPhoneDisplay(f.smsE164);
  if (smsDisplay) {
    ways.push({
      kind: "sms",
      title: "By text",
      sentence: `Text ${CONSENT_PHRASE} to ${smsDisplay}. Sending it is your yes.`,
      phrase: CONSENT_PHRASE,
      href: `sms:${f.smsE164}?&body=${encodeURIComponent(CONSENT_PHRASE)}`,
      display: smsDisplay,
    });
  }
  return {
    title: `Offers and news from ${name}`,
    lead: ways.length
      ? `Say yes in your own message, from your own phone. ${name} then sends you offers, news and reminders — and never sells or shares your number.`
      : `${name} is not set up to take sign-ups here yet.`,
    ways,
    qrLink: waLink,
    terms: [
      `You get offers, news and appointment reminders from ${name}. A few messages a month, never daily.`,
      "Message and data rates may apply. Message frequency varies.",
      `Reply STOP at any time to stop. Reply HELP for help.`,
      "No mobile information is shared with third parties or affiliates for marketing purposes.",
      `Consent is not a condition of any purchase from ${name}.`,
    ],
    empty: ways.length === 0,
  };
}
