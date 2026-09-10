/**
 * The public "say yes" page, as facts.
 *
 * Every carrier registration asks the same question — how does a customer agree
 * to hear from this business? — and wants a URL that answers it. This is that
 * URL, and it is not a new consent mechanism: it shows the ways the product
 * already records a yes, each of which is the customer's own message from their
 * own device. Nothing here collects a number, because a number typed into a form
 * is not proof that its owner agreed.
 *
 * TWO ASKS, NOT ONE, and this is the whole shape of the file.
 *
 * The first version asked once — "Text YES OFFERS … Sending it is your yes" —
 * and then described what that one yes covered: "You get offers, news AND
 * APPOINTMENT REMINDERS." One control, three purposes. The carriers refused the
 * campaign for it, in as many words:
 *
 *   30913 — "marketing consent was combined with other consents. Marketing
 *            consent must be collected separately."
 *
 * Twilio's own reference mockup for a mixed campaign shows the compliant shape:
 * separate, independently-given consent for transactional and for promotional
 * messages, neither pre-given, neither a condition of the other. Their remedy
 * text names three acceptable controls — "its own unchecked checkbox, signed
 * form section, or text-in keyword flow" — and this page is the third, which is
 * the honest one for a product whose whole opt-in is a message from the
 * customer's own handset.
 *
 * So: two asks, two keywords, two disclosure blocks. The transactional one is
 * primary because it is what most people came for; the promotional one is
 * plainly optional and says so.
 *
 * Each block carries what the carriers require of it, in their order:
 * what you get, how often, "Message and data rates may apply" (verbatim — the
 * word "standard" is refused, because it implies premium-rate messaging), how to
 * get help, and how to stop.
 *
 * Pure: the page feeds it the workspace's public facts, the tests feed it
 * fixtures.
 */
import { OFFERS_OPT_IN_PHRASES, optInLink } from "./enums";
import { formatPhoneDisplay } from "./phone";
import type { SendPurpose } from "./consent";

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

/**
 * One of the two questions, with its own ways to answer and its own disclosures.
 *
 * They are separate objects rather than a flag on one, because that separation
 * is the thing the carriers are asking to see: a reader must be able to give one
 * and not the other without hunting for how.
 */
export interface ConsentAsk {
  purpose: SendPurpose;
  title: string;
  /** What this yes is for, in one line. */
  lead: string;
  /** Said only on the optional one: that it is optional, and that nothing depends on it. */
  optional: string | null;
  ways: ConsentWay[];
  /** What the carriers require stated beside THIS ask. */
  terms: string[];
}

export interface ConsentPageVM {
  title: string;
  /** One line under the title: what this page is. */
  lead: string;
  /** The transactional ask first, then the promotional one. */
  asks: ConsentAsk[];
  /** The link the QR encodes — the OFFERS one, since that is what a QR at the desk is for; null when there is nothing to encode. */
  qrLink: string | null;
  /** What is true of both asks, said once at the foot. */
  terms: string[];
  /** True when this workspace has no way to say yes yet: the page says so rather than pretending. */
  empty: boolean;
}

/** The words the customer sends, so a page, a QR and a carrier filing can never disagree about them. */
export const CONSENT_PHRASE = OFFERS_OPT_IN_PHRASES.en;
export const CONSENT_PHRASE_ES = OFFERS_OPT_IN_PHRASES.es;
/**
 * The word for the OTHER yes.
 *
 * START is the carriers' own standard opt-in keyword, already declared to them
 * in the campaign's opt-in keywords and already honoured by the receptionist. A
 * bare "yes" is deliberately not used: that is how a person answers an ordinary
 * question, and reading it as consent is the mistake this whole change exists to
 * undo.
 */
export const CONVERSATION_PHRASE = "START";

function waysFor(f: ConsentPageFacts, phrase: string): ConsentWay[] {
  const ways: ConsentWay[] = [];
  const waLink = optInLink(f.whatsappE164, phrase);
  if (waLink) {
    ways.push({
      kind: "whatsapp",
      title: "On WhatsApp",
      sentence: `Tap to open WhatsApp with ${phrase} ready to send. Sending it is your yes.`,
      phrase,
      href: waLink,
      display: formatPhoneDisplay(f.whatsappE164),
    });
  }
  const smsDisplay = formatPhoneDisplay(f.smsE164);
  if (smsDisplay) {
    ways.push({
      kind: "sms",
      title: "By text",
      sentence: `Text ${phrase} to ${smsDisplay}. Sending it is your yes.`,
      phrase,
      href: `sms:${f.smsE164}?&body=${encodeURIComponent(phrase)}`,
      display: smsDisplay,
    });
  }
  return ways;
}

/**
 * The words of each ask, said ONCE for the page and for its paper form. Two copies
 * of a disclosure are one that will be edited and one that will not -- and the
 * paper form is the version a customer signs, so it may not drift from the page a
 * reviewer reads.
 */
function askWords(name: string): Record<SendPurpose, { title: string; lead: string; optional: string | null; terms: string[] }> {
  return {
    conversational: {
      title: "Messages about your visit",
      lead: `Appointment reminders and confirmations from ${name}, and a reply when you write to them.`,
      optional: null,
      terms: [
        `You get appointment reminders and answers to what you ask ${name}. Message frequency varies.`,
        "Message and data rates may apply.",
        "Reply HELP for help. Reply STOP at any time to stop.",
      ],
    },
    marketing: {
      title: "Offers and news",
      lead: `Promotions and news from ${name}.`,
      optional: `Separate, and entirely optional — you can have the messages above without this one, and saying no changes nothing about your appointments or anything you buy from ${name}.`,
      terms: [
        `You get promotional offers and news from ${name}. A few messages a month, never daily.`,
        "Message and data rates may apply.",
        "Reply HELP for help. Reply STOP at any time to stop.",
      ],
    },
  };
}

/** What is true of both asks, said once at the foot of the page and of the form. */
function bothTerms(name: string): string[] {
  return [
    "No mobile information is shared with third parties or affiliates for marketing purposes.",
    `Consent is not a condition of any purchase from ${name}.`,
  ];
}

export function consentPageVM(f: ConsentPageFacts): ConsentPageVM {
  const name = f.businessName.trim() || "This business";
  const conversation = waysFor(f, CONVERSATION_PHRASE);
  const offers = waysFor(f, CONSENT_PHRASE);
  const empty = conversation.length === 0 && offers.length === 0;
  const words = askWords(name);

  const asks: ConsentAsk[] = empty ? [] : [
    { purpose: "conversational", ...words.conversational, ways: conversation },
    { purpose: "marketing", ...words.marketing, ways: offers },
  ];

  return {
    title: `Text messages from ${name}`,
    lead: empty
      ? `${name} is not set up to take sign-ups here yet.`
      : `Two separate things you can say yes to, in your own message from your own phone. ${name} never sells or shares your number.`,
    asks,
    qrLink: optInLink(f.whatsappE164, CONSENT_PHRASE),
    terms: bothTerms(name),
    empty,
  };
}

/**
 * One of the two questions on the paper form: its own box, its own disclosures,
 * its own signature.
 */
export interface ConsentFormSection {
  purpose: SendPurpose;
  title: string;
  lead: string;
  /** What ticking the box says, in the customer's own voice. Printed unticked: a box that arrives ticked is not a yes. */
  box: string;
  optional: string | null;
  terms: string[];
  /** The line signed for THIS box only. */
  sign: string;
}

export interface ConsentFormVM {
  title: string;
  lead: string;
  /** Filled in once, above both boxes. */
  fields: string[];
  sections: ConsentFormSection[];
  terms: string[];
  /** The line the business fills in when it records the sheet: its own audit trail. */
  office: string;
}

/**
 * The same two asks, on paper: `/yes/<slug>/form`.
 *
 * A yes to offers has to be WRITTEN -- the carriers refuse a campaign whose
 * marketing opt-in relies on a spoken yes (Twilio lists it among the causes of
 * error 30913) -- and a customer at the desk may not want to text anything.
 * Twilio names "a signed form section" as one of the three controls that qualify,
 * provided it is its own section. So each ask is its own box, printed unticked,
 * in the page's own words, with its own signature; the business records each
 * signed box as "Sign-up form" and keeps the sheet.
 *
 * It is also what a reviewer is shown. The filing names this URL as the paper way
 * to say yes, and a reviewer can only accept a form they can see.
 *
 * Unlike the page it needs no number: a business can take signed forms before its
 * line is approved for texting.
 */
export function consentFormVM(f: Pick<ConsentPageFacts, "businessName">): ConsentFormVM {
  const name = f.businessName.trim() || "This business";
  const words = askWords(name);
  return {
    title: `Text messages from ${name}`,
    lead: "Two separate boxes. Tick and sign only the ones you want: signing one does not sign you up for the other, and either one can be had without the other.",
    fields: ["Name", "Mobile number"],
    sections: [
      { purpose: "conversational", ...words.conversational, box: `Yes, text me about my appointments with ${name}.`, sign: "Signature for this box" },
      { purpose: "marketing", ...words.marketing, box: `Yes, text me offers and news from ${name}.`, sign: "Signature for this box" },
    ],
    terms: bothTerms(name),
    office: `For ${name}: record each signed box on the customer's profile, under its own answer, as “Sign-up form”, and keep this sheet. Recorded on __________ by __________`,
  };
}
