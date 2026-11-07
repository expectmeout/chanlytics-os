/** Message versions: channels. */

import { senderWords } from "../sender-words";

/** The channels a message has versions on, in the order a page offers them. */
export const VERSION_CHANNELS = ["whatsapp", "email", "sms"] as const;

export type VersionChannel = (typeof VERSION_CHANNELS)[number];

/** A version written here rather than at Meta: an email's or a text's. */
export type OwnVersionChannel = Exclude<VersionChannel, "whatsapp">;

export const OWN_VERSION_CHANNELS: readonly OwnVersionChannel[] = ["email", "sms"];

/** What each channel is called on a page. */
export const VERSION_CHANNEL_WORDS: Record<VersionChannel, string> = {
  whatsapp: "WhatsApp",
  email: "Email",
  sms: "Text",
};

/**
 * A channel as a sentence about a message's version names it, mid-sentence: "WhatsApp", "email", "text" (its page word,
 * lower case but for WhatsApp's own name). The one spelling: "its email version", "for WhatsApp and email".
 */
export function versionWord(channel: VersionChannel): string {
  return channel === "whatsapp" ? VERSION_CHANNEL_WORDS.whatsapp : VERSION_CHANNEL_WORDS[channel].toLowerCase();
}

/**
 * The sentence for a channel a message has no version on at all: the one spelling of it, which messageWhyNot says
 * (campaign-message.ts), and the previews and Ask's cards say where they hold words by channel and no message.
 */
export function noVersionWords(channel: VersionChannel): string {
  return channel === "whatsapp"
    ? "This message has no WhatsApp version."
    : `This message has no ${versionWord(channel)} version yet.`;
}

/** The longest subject: Meta's limit for a heading, which an email's subject is stored as. */
export const EMAIL_SUBJECT_MAX = 60;

/** The longest email body a version may be. */
export const EMAIL_BODY_MAX = 2000;

/** The most segments a text version may take, with its STOP line: four is 612 plain characters, 268 with accents. */
export const SMS_SEGMENTS_MAX = 4;

/** Past this many segments a text version warns: each segment is billed. */
export const SMS_SEGMENTS_WARN = 2;

/** The line the sender puts under every text, in the version's language (sender-words.ts: the words an email's foot shares). */
export function smsStopLine(language: string): string {
  return senderWords(language).textStop;
}

// The GSM-7 basic set and its extension table (the form feed and ^ { } \ [ ~ ] | €): a text made only of these goes 160
// septets to a segment, 153 when it takes several. An extension character is an escape and the character, so it costs
// two septets, and the pair never splits across two segments. Anything else (an emoji, a curly quote, most accents)
// sends the whole text as UCS-2: 70 to a segment, 67 when several.
const GSM7 = /^[@£$¥èéùìòÇ\nØø\r\fÅåΔ_ΦΓΛΩΠΨΣΘΞÆæßÉ !"#¤%&'()*+,\-./0-9:;<=>?¡A-ZÄÖÑÜ§¿a-zäöñüà^{}\\[~\]|€]*$/;

const GSM7_EXTENSION = /^[\f^{}\\[~\]|€]$/;

/** The septets of a GSM-7 text (an extension character is two) and the segments they fill, an escape pair never split. */
function gsm7Segments(text: string): { septets: number; segments: number } {
  const costs = [...text].map((c) => (GSM7_EXTENSION.test(c) ? 2 : 1));
  const septets = costs.reduce((sum, n) => sum + n, 0);
  if (septets <= 160) return { septets, segments: septets === 0 ? 0 : 1 };
  let segments = 1;
  let room = 153;
  for (const n of costs) {
    if (n > room) {
      segments += 1;
      room = 153;
    }
    room -= n;
  }
  return { septets, segments };
}

/**
 * How many segments a text takes on the wire: what the carriers bill, and the counter a page shows. `chars` is the
 * length the carrier counts: a GSM-7 text's septets (an extension character, `{ } [ ] \ ^ ~ | €`, is two), else its
 * characters.
 */
export function smsSegments(text: string): { segments: number; chars: number; perSegment: number; unicode: boolean } {
  const unicode = !GSM7.test(text);
  if (!unicode) {
    const { septets, segments } = gsm7Segments(text);
    return { segments, chars: septets, perSegment: segments > 1 ? 153 : 160, unicode };
  }
  const chars = [...text].length;
  const segments = chars === 0 ? 0 : chars <= 70 ? 1 : Math.ceil(chars / 67);
  return { segments, chars, perSegment: segments > 1 ? 67 : 70, unicode };
}

/**
 * What a text version comes to on the wire, the STOP line the sender adds included: the counter a page shows and the
 * check a version must pass. A slot counts as long as it is written, in plain characters: what fills it is not known
 * until it goes, and its braces, which GSM-7 counts double, never go at all.
 */
export function smsVersionSegments(body: string, language: string): ReturnType<typeof smsSegments> {
  const slotsPlain = body.replace(/\{\{\d+\}\}/g, (slot) => "x".repeat(slot.length));
  return smsSegments(`${slotsPlain}\n${smsStopLine(language)}`);
}
