/**
 * Which channels a yes covers (One message, every channel, step 2; the campaigns-on-every-channel spec, 4.1 and
 * decision 6). A yes is given somewhere, and it covers the channel it was given for: a START sent on WhatsApp is not a
 * text opt-in under the registered texting flow, and a yes to offers is to offers on WhatsApp, the only channel the
 * sign-up page offers them on (consent-page.ts).
 *
 * The rule, by how the yes was given (the `source` every consent event records, and the channel of the message it came
 * in, where it came in one):
 *
 * | How                                  | Messages about a visit | Offers                                                   |
 * | ------------------------------------ | ---------------------- | -------------------------------------------------------- |
 * | their own message, on WhatsApp       | WhatsApp               | WhatsApp                                                 |
 * | their own message, by text           | text                   | WhatsApp, and text (a text's is refused at send)         |
 * | their own message, by email          | email                  | (not here: see below)                                    |
 * | their own message, by Instagram DM   | (none; lifts a stop)   | (none)                                                   |
 * | the sign-up page or the signed form  | WhatsApp and text      | WhatsApp                                                 |
 * | the phone, by the spoken script      | WhatsApp and text      | (never: a yes to offers is in writing)                   |
 * | in person, or set by the team        | WhatsApp               | (never)                                                  |
 * | a yes with no channel on record      | WhatsApp               | WhatsApp                                                 |
 *
 * A YES OFFERS in their own message by text covers WhatsApp too: offers go by WhatsApp alone, and the confirmation the
 * customer is sent says so. (Listed first, in the house order: WhatsApp, text, email.)
 *
 * A YES OFFERS by EMAIL is not this table's. It is the person's own answer about offers by email (`contacts.email_marketing`,
 * 00174 and 00299's set_email_offers_yes): a ledger event of purpose `email_marketing`, which keeps no channel list, and it
 * covers email alone, never WhatsApp. No door writes a `marketing` event on the email channel, so the (offers, their own
 * message, email) case below is reached by nothing: the function answers it as the database's `consent_channels_of`
 * (00297) does, because a test holds the two equal case by case, and says no more of an input nobody sends.
 *
 * The last row is every yes recorded before the channels were (and any row a write reaches without its event): it
 * keeps exactly the reach it had, which was WhatsApp, since no message that starts a conversation has ever gone out by
 * text. The database keeps `contacts.consent_channels` and `marketing_channels` by this table from each
 * `contact.consent_changed` event as it is written (the migration's `consent_channels_of`, which a test holds to this
 * function case by case), so the predicate reads a column and never replays a ledger.
 */

/** The channels a yes may cover: the ones a business writes to a person on. */
export const CONSENT_CHANNELS = ["whatsapp", "sms", "email"] as const;
export type ConsentChannel = (typeof CONSENT_CHANNELS)[number];

/** How each channel is said in a sentence about a yes: "on WhatsApp", "by text", "by email". */
export const CONSENT_CHANNEL_WORDS: Record<ConsentChannel, string> = {
  whatsapp: "on WhatsApp",
  sms: "by text",
  email: "by email",
};

function isConsentChannel(c: string | null | undefined): c is ConsentChannel {
  return !!c && (CONSENT_CHANNELS as readonly string[]).includes(c);
}

/**
 * The channels one yes covers, by the table above. `purpose` is which answer it is; `source` how it was given; `channel`
 * the channel of the message it came in, where it came in one.
 */
export function channelsOfYes(
  purpose: "conversational" | "marketing",
  source: string | null | undefined,
  channel: string | null | undefined,
): ConsentChannel[] {
  // Their own yes in an Instagram DM covers no wire a conversation is started on (00486): Instagram lets a business start
  // none, and a DM is no yes for a wire it did not come on. It lifts their stop all the same: that is the consent's.
  if (source === "customer_message" && channel === "instagram") return [];
  // Their own YES OFFERS by text: offers go by WhatsApp alone, so it covers WhatsApp too, WhatsApp first. (The same
  // answer for the email channel, which the database's table gives and no door asks: the header says why.)
  if (purpose === "marketing" && source === "customer_message" && (channel === "sms" || channel === "email"))
    return ["whatsapp", channel];
  if (source === "customer_message" && isConsentChannel(channel)) return [channel];
  if (purpose === "marketing") return source === "form" || source === "customer_message" ? ["whatsapp"] : [];
  if (source === "form" || source === "phone") return ["whatsapp", "sms"];
  return ["whatsapp"];
}

/**
 * Whether a yes covers a channel, from the channels the row keeps. A row that keeps none (`null`: a yes recorded before
 * the channels were, or a row read without the column) covers WhatsApp alone, which is the reach every such yes had.
 */
export function yesCovers(channels: readonly string[] | null | undefined, channel: string): boolean {
  return channels == null ? channel === "whatsapp" : channels.includes(channel);
}

/** The channels a row's yes covers, as a page says them: the kept ones, or WhatsApp where none are kept. */
export function coveredChannels(channels: readonly string[] | null | undefined): ConsentChannel[] {
  return channels == null ? ["whatsapp"] : CONSENT_CHANNELS.filter((c) => channels.includes(c));
}

/**
 * A count for each channel in a line's words ("30 on WhatsApp, 6 by text"), where more than one channel has any; null
 * otherwise, since a line that names one channel says nothing its number did not. What a run sent by each channel
 * (broadcasts.ts sentByWords), what a period sent, and who a message reaches by each.
 */
export function countsByChannelWords(by: Partial<Record<ConsentChannel, number>> | null | undefined): string | null {
  if (!by) return null;
  const went = CONSENT_CHANNELS.filter((c) => (by[c] ?? 0) > 0);
  return went.length > 1 ? went.map((c) => `${by[c]} ${CONSENT_CHANNEL_WORDS[c]}`).join(", ") : null;
}

/** The channels in a sentence: "on WhatsApp", "on WhatsApp and by text", "on WhatsApp, by text and by email". */
export function channelsWords(channels: readonly ConsentChannel[]): string {
  const words = channels.map((c) => CONSENT_CHANNEL_WORDS[c]);
  if (words.length <= 1) return words[0] ?? "";
  return `${words.slice(0, -1).join(", ")} and ${words[words.length - 1]}`;
}
