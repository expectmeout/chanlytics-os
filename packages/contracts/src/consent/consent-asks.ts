/**
 * What each channel asks of a person before it carries a message (the Campaigns review, finding 12), said for the pages
 * that state it: a composer's guardrails before anything is sent, and the rules an approval sheet lists for the run it holds.
 * Those lines read "a recorded yes and a number", which was true of WhatsApp and a text and false of an email: a message
 * about a visit by email needs no yes at all, and an offer by email may go on a relationship on record (consent.ts).
 *
 * THE RULE IS NOT RESTATED HERE. What a channel asks is read from the one predicate (`mayMessageFor`) by putting to it two
 * people, one who has answered nothing and one who has only dealt with the business, so these words follow the rule when
 * the rule moves and can never say a yes is needed where it is not, or the reverse. What a channel needs to reach someone
 * at all, a number or an address, is the channel's own.
 */
import { type AskedPurpose, mayMessageFor, type MessageAbout, type PurposeBearing } from "./consent";
import { CONSENT_CHANNELS, type ConsentChannel, channelsWords } from "./consent-channels";

/** What a channel asks of a person's answers: nothing, a yes, or a yes or a relationship on record. */
export type YesAsk = "none" | "yes" | "yes_or_dealt";

/** A person who has answered nothing and has never dealt with the business. */
const UNASKED: PurposeBearing = {
  consent: "unknown",
  dnc: false,
  marketing_consent: "unknown",
  email_marketing: "unknown",
  has_relationship: false,
};

/** The same person once they have dealt with the business (they wrote, called, or have a deal), still having answered nothing. */
const DEALT: PurposeBearing = { ...UNASKED, has_relationship: true };

/**
 * What the predicate asks of a person for a message of this purpose on this channel, read from the predicate itself.
 * `about` is what the message is about (consent.ts MessageAbout): by email a visit's asks nothing, the business's news a
 * yes or a relationship (decision D1).
 */
export function yesAsked(channel: ConsentChannel, purpose: AskedPurpose, about: MessageAbout): YesAsk {
  const may = (c: PurposeBearing) => mayMessageFor(c, purpose, { proactive: true, channel, about }).ok;
  if (may(UNASKED)) return "none";
  return may(DEALT) ? "yes_or_dealt" : "yes";
}

/** What a channel needs to reach a person at all: a number carries a WhatsApp message and a text, an address an email. */
const WAY_TO_REACH: Record<ConsentChannel, { noun: string; has: string }> = {
  whatsapp: { noun: "a phone number", has: "has a phone number" },
  sms: { noun: "a phone number", has: "has a phone number" },
  email: { noun: "an email address that works", has: "has an email address that works" },
};

/** What the yes is to, in the sheet's voice, on a channel: "offers", "offers by email", "hearing from you". */
function yesTo(channel: ConsentChannel, purpose: AskedPurpose): string {
  const by = channel === "email" ? " by email" : "";
  return purpose === "marketing" ? `offers${by}` : `hearing from you${by}`;
}

/** What a person needs for this channel to carry this kind of message to them: "a recorded yes to offers and a phone number". */
function needs(channel: ConsentChannel, purpose: AskedPurpose, about: MessageAbout): string {
  const ask = yesAsked(channel, purpose, about);
  const way = WAY_TO_REACH[channel].noun;
  const to = yesTo(channel, purpose);
  if (ask === "yes") return `a recorded yes to ${to} and ${way}`;
  if (ask === "yes_or_dealt") return `a yes to ${to} or a relationship with you on record, and ${way}`;
  return way;
}

/** What each person must have said or done for the channel to carry this to them, as the rule's clause after "each": "said yes to offers". */
function clause(channel: ConsentChannel, purpose: AskedPurpose, about: MessageAbout): string {
  const ask = yesAsked(channel, purpose, about);
  const to = yesTo(channel, purpose);
  if (ask === "yes") return `said yes to ${to}`;
  if (ask === "yes_or_dealt")
    return purpose === "marketing"
      ? `asked for ${to}, or has dealt with you`
      : `said yes to ${to}, or has dealt with you`;
  return WAY_TO_REACH[channel].has;
}

/** The channels grouped by what they say, in the page's order: those that ask the same are said once. */
function groupedBy(
  channels: readonly ConsentChannel[],
  words: (channel: ConsentChannel) => string,
): Array<{ channels: ConsentChannel[]; words: string }> {
  const groups: Array<{ channels: ConsentChannel[]; words: string }> = [];
  for (const channel of CONSENT_CHANNELS.filter((c) => channels.includes(c))) {
    const said = words(channel);
    const same = groups.find((g) => g.words === said);
    if (same) same.channels.push(channel);
    else groups.push({ channels: [channel], words: said });
  }
  return groups;
}

const capitalised = (s: string): string => s.charAt(0).toUpperCase() + s.slice(1);

/**
 * What a campaign's guardrails say of who it reaches, for the channels it goes by: "Only people with a recorded yes to
 * offers and a phone number." One line when every channel asks the same; one for each group of channels that ask
 * differently, led by the channels ("By email: only people with ..."). No channels, no lines. A composer draws these where
 * its owner reads them, and its tooltip repeats them.
 */
export function consentGuardWords(
  channels: readonly ConsentChannel[],
  purpose: AskedPurpose,
  about: MessageAbout,
): string[] {
  const groups = groupedBy(channels, (c) => needs(c, purpose, about));
  return groups.map((g) =>
    groups.length === 1
      ? `Only people with ${g.words}.`
      : `${capitalised(channelsWords(g.channels))}: only people with ${g.words}.`,
  );
}

/**
 * The rule an approval sheet lists for a run, in what it asks of each person it reaches, from the channels it reaches them
 * on (`byChannel`, the run's own count; none kept reads WhatsApp, which every run before channels went by): "each said yes
 * to offers". One line when every channel it reaches asks the same, else one for each group ("each reached by email asked
 * for offers by email, or has dealt with you"). A run that reaches nobody says WhatsApp's, which is what it would ask.
 */
export function consentRuleWords(
  byChannel: Readonly<Record<ConsentChannel, number>> | null | undefined,
  purpose: AskedPurpose,
  about: MessageAbout,
): string[] {
  const reached = byChannel ? CONSENT_CHANNELS.filter((c) => byChannel[c] > 0) : [];
  const groups = groupedBy(reached.length > 0 ? reached : ["whatsapp"], (c) => clause(c, purpose, about));
  return groups.map((g) =>
    groups.length === 1 ? `each ${g.words}` : `each reached ${channelsWords(g.channels)} ${g.words}`,
  );
}
