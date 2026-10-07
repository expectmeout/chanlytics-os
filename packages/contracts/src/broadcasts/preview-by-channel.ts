/**
 * What the campaign composers show of who a campaign reaches and how they read it (One message, every channel; the
 * Campaigns review's items 15, 17 and 18). A campaign goes by the channels it ticks and each person is reached once, on
 * one of them (reach-for.ts), so the preview is drawn for a person on their channel: WhatsApp's bubble from the
 * template, a text with the STOP line the sender adds, an email with its subject and the foot the sender adds
 * (templates/email-foot.ts: the one the send puts on the wire, in the version's language). The To line says the split
 * as one short clause, and the bar draws it. Pure: every sentence the composers say of this is here.
 */
import { CONSENT_CHANNELS, CONSENT_CHANNEL_WORDS, type ConsentChannel } from "../consent/consent-channels";
import { emailFoot } from "../templates/email-foot";
import {
  OWN_VERSION_CHANNELS,
  noVersionWords,
  renderOwnVersion,
  smsStopLine,
  versionWords,
  type OwnVersionChannel,
  type VersionWords,
} from "../templates/message-versions";
import { OFFERS_BY_EMAIL_WORDS } from "./email-offers";
import type { ReachSplit } from "./reach-for";

/** The words the composers say beside the preview, the To line and the bar. */
export const PREVIEW_WORDS = {
  /** The quiet link on the To line that opens who is held back and why. */
  heldBack: "Who's held back",
  /** A stand-in on a playbook's walk: how many people the run reaches on a channel. */
  people: (n: number): string => `${n.toLocaleString("en-US")} ${n === 1 ? "person" : "people"}`,
  /** What a held-back person's stand-in says of itself: they are drawn the message's words, and nothing goes to them. */
  notSent: "Not sent",
  /** Where an offer's foot puts the link, which is each person's own: the preview cannot make it. */
  unsubscribeLink: "(their own unsubscribe link)",
  /** The line under the business's name in the frame, as each channel's own app says it. */
  kind: { whatsapp: "Business account", sms: "Text message", email: "Email" },
  /** The two presses of the preview's stepper, to a screen reader: through the people a send reaches, or the channels a playbook does. */
  walk: {
    people: { before: "The person before this one", next: "The next person" },
    channels: { before: "The channel before this one", next: "The next channel" },
  },
} as const;

const capitalised = (s: string): string => s.charAt(0).toUpperCase() + s.slice(1);

/** Where a person reads the message, as a quiet label on its preview: "On WhatsApp", "By text", "By email". */
export const PREVIEW_CHANNEL_WORDS: Record<ConsentChannel, string> = {
  whatsapp: capitalised(CONSENT_CHANNEL_WORDS.whatsapp),
  sms: capitalised(CONSENT_CHANNEL_WORDS.sms),
  email: capitalised(CONSENT_CHANNEL_WORDS.email),
};

/** A message's email and text versions as a page holds their words (templates versionWords), by channel. */
export type PreviewVersions = Partial<Record<OwnVersionChannel, VersionWords>>;

/**
 * A message's email and text versions in a language, as the words a preview or a card draws, from the workspace's template
 * rows of its name and language (templates versionWords): a channel the message has no row on is left out. The one reading of
 * the rows: the composers' pages stamp it on each template they offer, and Ask's cards read the same rows through it.
 */
export function previewVersionsOf(
  rows: readonly {
    name: string;
    channel: string;
    language: string;
    components?: unknown;
    header?: string | null;
    body_preview?: string | null;
  }[],
  name: string,
  language: string,
): PreviewVersions {
  const out: PreviewVersions = {};
  for (const channel of OWN_VERSION_CHANNELS) {
    const row = rows.find((r) => r.channel === channel && r.name === name && r.language === language);
    if (row) out[channel] = versionWords(row);
  }
  return out;
}

/** What a person reads on the channel they are reached on, short of the slots, which the page fills for them. */
export interface PreviewOn {
  channel: ConsentChannel;
  /** The quiet label: "On WhatsApp", "By text", "By email". */
  label: string;
  /** The version's own words as written (slots still `{{n}}`); null on WhatsApp, whose words are the template's. */
  version: VersionWords | null;
  /** What the sender adds under it: an email's reason, its way out and address; a text's STOP line; none on WhatsApp. */
  foot: string | null;
  /**
   * Why a version cannot be drawn here (the page holds none for this channel, or an offer by email has no postal address
   * for its foot, which the send would hold everyone for); null when it can.
   */
  missing: string | null;
}

/**
 * A message as one channel carries it, or the sentence for a channel it has no version on (noVersionWords, messageWhyNot's).
 * An email's foot is the sender's (emailFoot), named for the business, the
 * address where the page has one, and the words the person's row kept (a visit's time, a proposal's link); a text's is
 * its STOP line, in the version's language. WhatsApp's words are the template's own, which the page draws.
 */
export function previewOn(
  channel: ConsentChannel,
  o: {
    versions: PreviewVersions;
    language: string;
    business: string;
    address?: string | null;
    facts?: Record<string, unknown>;
    /**
     * Why this person would get an OFFER by email (templates/email-foot.ts: "customer" or "asked"): given for a marketing
     * message, the email's foot is the offer's, with a stand-in where their own unsubscribe link goes. Absent, the foot of a
     * message about a visit.
     */
    offer?: "customer" | "asked";
  },
): PreviewOn {
  const label = PREVIEW_CHANNEL_WORDS[channel];
  if (channel === "whatsapp") return { channel, label, version: null, foot: null, missing: null };
  const version = o.versions[channel] ?? null;
  if (!version) return { channel, label, version: null, foot: null, missing: noVersionWords(channel) };
  // An offer's foot owes the business's postal address (emailFoot refuses to be built without it), and the send holds
  // everyone on it: the preview says so rather than draw a foot the send would never carry.
  if (channel === "email" && o.offer && !o.address?.trim())
    return { channel, label, version: null, foot: null, missing: OFFERS_BY_EMAIL_WORDS.noAddress };
  const foot =
    channel === "sms"
      ? smsStopLine(o.language)
      : emailFoot(
          o.business,
          o.address,
          o.offer
            ? { kind: "offer", why: o.offer, unsubscribeUrl: PREVIEW_WORDS.unsubscribeLink }
            : { kind: "visit", facts: o.facts ?? {} },
          o.language,
        );
  return { channel, label, version, foot, missing: null };
}

/** The fewest characters a card quotes of a message on one channel, however many channels share its room. */
const SAID_MIN = 60;

/**
 * What an approving surface quotes of a message, for the channels the campaign goes by: each channel's own words as the person
 * reached on it reads them, in the page's channel order, the slots filled with `values` --
 * "On WhatsApp: Hi Dani, …", "By email: “A note, Dani” — Hi Dani, …", "By text: Hi Dani, … Reply STOP to opt out". WhatsApp's are
 * the template's, which the caller has filled (`whatsapp`); an email's and a text's are their versions through the one fill a
 * send makes (templates renderOwnVersion), so the card quotes what goes. A channel whose version is not in hand is `missing`,
 * with the sentence for it, and the card is refused: never another channel's words under its name. `limit` is the room for
 * the words in all, shared between the channels, none cut under a line's worth.
 */
export function previewSays(
  channels: readonly ConsentChannel[],
  o: { whatsapp: string; versions: PreviewVersions; values: readonly string[]; language: string; limit: number },
): { says: string } | { missing: ConsentChannel; why: string } {
  const named = CONSENT_CHANNELS.filter((c) => channels.includes(c));
  const room = Math.max(SAID_MIN, Math.floor(o.limit / Math.max(1, named.length)));
  const clip = (words: string): string => {
    const one = words.replace(/\s+/g, " ").trim();
    return one.length > room ? `${one.slice(0, room).trimEnd()}…` : one;
  };
  const parts: string[] = [];
  for (const channel of named) {
    const label = PREVIEW_CHANNEL_WORDS[channel];
    if (channel === "whatsapp") {
      parts.push(`${label}: ${clip(o.whatsapp)}`);
      continue;
    }
    const words = o.versions[channel];
    if (!words) return { missing: channel, why: noVersionWords(channel) };
    const sent = renderOwnVersion(channel, words, o.values, o.language);
    parts.push(`${label}: ${sent.subject ? `“${sent.subject}” — ` : ""}${clip(sent.body)}`);
  }
  return { says: parts.join(" · ") };
}

/** One channel's part of who a campaign reaches: how many, and what that says. */
export interface ReachBarPart {
  channel: ConsentChannel;
  /** How many people are reached on it: the part's share of the bar. */
  share: number;
  /** "12 by email". */
  words: string;
}

/** The channels that reach anyone, in the page's order (WhatsApp, text, email), each with its people and its words. */
export function reachBarParts(split: ReachSplit): ReachBarPart[] {
  return CONSENT_CHANNELS.filter((c) => split.byChannel[c] > 0).map((channel) => ({
    channel,
    share: split.byChannel[channel],
    words: `${split.byChannel[channel].toLocaleString("en-US")} ${CONSENT_CHANNEL_WORDS[channel]}`,
  }));
}

/** The split as the To line says it after the count: "12 on WhatsApp, 12 by email"; empty where nobody is reached. */
export function reachByWords(split: ReachSplit): string {
  return reachBarParts(split)
    .map((p) => p.words)
    .join(", ");
}

/**
 * What the bar says to a screen reader, and in its tip: who it reaches, on which channel, with the people it holds left
 * out (the bar is the people reached; who is held is the line's and the fold's): "Reaches 24: 12 on WhatsApp, 12 by
 * email"; one channel says "Reaches 12 by email".
 */
export function reachBarWords(split: ReachSplit): string {
  const parts = reachBarParts(split);
  const [first] = parts;
  if (!first) return "Reaches nobody";
  if (parts.length === 1) return `Reaches ${first.words}`;
  return `Reaches ${split.reached.toLocaleString("en-US")}: ${parts.map((p) => p.words).join(", ")}`;
}
