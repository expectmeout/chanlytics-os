/**
 * What the composers know of channels (One message, every channel, step 3; the campaigns-on-every-channel spec, 4.9): which
 * channels a campaign may tick for the message in view, which are on, why one cannot be, and how the reach splits across
 * the ones that are. The rules are contracts' (reach-for.ts: channelChoices, reachSplit, heldWords); the readiness is the
 * workspace's (server/campaigns/channels-ready.ts) with the message's own versions laid over it. Plain functions, nothing
 * here draws: the broadcast composer and the playbook composer read the same ones, and parts/send-by.tsx draws the row.
 */
import {
  CONSENT_CHANNELS,
  DEFAULT_CAMPAIGN_CHANNELS,
  HELD_ON,
  VERSION_CHANNEL_WORDS,
  channelChoices,
  channelNeverCarries,
  heldWords,
  previewVersionsOf,
  reachByWords,
  reachSplitWords,
  readyOrWhatsApp,
  type AskedPurpose,
  type ChannelsReady,
  type ConsentChannel,
  type MessageAbout,
  type ReachSplit,
} from "@chanlytics/contracts";
import { channelsOpenFor, openAmong } from "@/lib/campaign-channels";
import { RPT_CHANNEL_COLORS } from "@/surfaces/reports/series";

/** What the page says of the Send by row, beyond the reasons contracts words (CHANNEL_WORDS). */
export const CM_VIA_WORDS = {
  /** The row's word, and the group's name to a screen reader. */
  label: "Send by",
  /** The one channel on stays on: a campaign goes by at least one. */
  lastOne: "A campaign goes by at least one channel.",
  /** A message with no version on a channel cannot go by it. */
  noVersion: (channel: ConsentChannel): string =>
    `This message has no ${VERSION_CHANNEL_WORDS[channel].toLowerCase()} version yet.`,
  /** Every ticked channel is closed to it: nobody is reached. */
  nowhere: "None of the channels ticked can carry this message yet.",
  /** A playbook keeps a channel that cannot send yet: its run holds those people until it can. */
  waits: (why: string): string => `${why} It goes by it once it can.`,
} as const;

/** The channels a campaign ticks until the owner changes them: WhatsApp alone, as every campaign went before. */
export const cmDefaultChannels = (): ConsentChannel[] => [...DEFAULT_CAMPAIGN_CHANNELS];

/**
 * Whether the workspace can send on each channel, as the page has it: the read's own, or, where it could not be read (or
 * a surface cached before it was published carries none), as the page counted before the channels were: WhatsApp goes,
 * which the page's own number banner and Send judge by the number, and the others are not checked, so not offered.
 */
export function cmReadyOf(read: ChannelsReady | null | undefined): ChannelsReady {
  return readyOrWhatsApp(read);
}

/**
 * The channels a message has a version on, in a language: its WhatsApp row is the message itself, and an email or a text
 * is a row of the same name and language beside it (contracts versionsOf). WhatsApp is always among them: a composer
 * offers only a message WhatsApp approved.
 */
export function cmChannelsOf(
  rows: readonly { name: string; channel: string; language: string }[],
  name: string,
  language: string,
): ConsentChannel[] {
  return CONSENT_CHANNELS.filter(
    (c) => c === "whatsapp" || rows.some((r) => r.channel === c && r.name === name && r.language === language),
  );
}

/**
 * A message's email and text versions as the words a preview draws, from the workspace's rows of its name and language
 * (contracts previewVersionsOf, which Ask's cards read the same rows through): a channel the message has no row on is left
 * out. The surfaces stamp this on each template they offer, beside `channels`, so the composers draw an email or a text as the
 * person reads it.
 */
export const cmVersionsOf = previewVersionsOf;

/** The business's postal address where its Business record holds one: what an email's foot names (contracts emailFoot). */
export function cmAddressOf(brain: { profile?: { address?: string | null } | null } | null | undefined): string | null {
  return brain?.profile?.address ?? null;
}

/**
 * The workspace's readiness with each channel the message has no version on closed, saying why. The workspace's pause is the
 * workspace's, not the message's, and rides through (`...ready`).
 */
export function cmReadyForMessage(ready: ChannelsReady, has: readonly ConsentChannel[]): ChannelsReady {
  // A channel closed for want of a version keeps what else it carries (email's `offers`: the reason it gives for an offer or
  // the business's news is the campaigns domain's, never "no version" over it, nor the domain's over "no version").
  const closed = (c: ConsentChannel) =>
    has.includes(c) ? ready[c] : { ...ready[c], ready: false, why: CM_VIA_WORDS.noVersion(c) };
  return { ...ready, whatsapp: closed("whatsapp"), sms: closed("sms"), email: closed("email") };
}

/** One tick of the Send by row as it is drawn. */
export interface CmViaTick {
  channel: ConsentChannel;
  /** The channel's name on a page: WhatsApp, Text, Email. */
  word: string;
  on: boolean;
  /** Why it cannot be turned on, or why it stays on; null where nothing needs saying. */
  why: string | null;
  /** It does not change when pressed: it cannot be turned on, or it is the one that is on. */
  fixed: boolean;
  /**
   * A playbook keeps it ticked though it cannot send yet: on, and live (a press turns it off), where a channel that
   * cannot be turned on is `fixed` and off. The two read differently, so the row draws them differently.
   */
  waiting: boolean;
}

/**
 * The channels that are on: ticked, and open to this message. In the page's order; may be none. `about` is what the message is
 * about (a broadcast's is ours; a moment's is messageAboutOfTrigger of it), which by email says whether it waits for the
 * workspace's offers (contracts isOfferByEmail, decision D2).
 */
export function cmChannelsOn(
  ticks: readonly string[],
  ready: ChannelsReady,
  purpose: AskedPurpose,
  about: MessageAbout,
): ConsentChannel[] {
  return openAmong(ticks, channelsOpenFor(ready, purpose, about));
}

/**
 * The row's ticks: every channel, on or off, with the reason one is closed to this message, or must stay on. `message` is
 * what it is (cmChannelsOn's `purpose` and `about`). `keep` is a playbook's: a channel it ticks that cannot send now (no
 * line yet, no version yet) stays ticked, saying so, since its run holds those people until it can; a broadcast goes now,
 * so a channel closed now cannot be ticked.
 */
export function cmViaTicks(
  ticks: readonly string[],
  ready: ChannelsReady,
  message: { purpose: AskedPurpose; about: MessageAbout },
  keep: boolean,
): CmViaTick[] {
  const { purpose, about } = message;
  const on = cmChannelsOn(ticks, ready, purpose, about);
  return channelChoices(ready, purpose, about).map((c) => {
    const isOn = on.includes(c.channel);
    const last = isOn && on.length === 1;
    const waiting = keep && !c.ok && ticks.includes(c.channel) && channelNeverCarries(c.channel, purpose) === null;
    return {
      channel: c.channel,
      word: VERSION_CHANNEL_WORDS[c.channel],
      on: isOn || waiting,
      why: waiting ? CM_VIA_WORDS.waits(c.why ?? "") : c.ok ? (last ? CM_VIA_WORDS.lastOne : null) : c.why,
      fixed: waiting ? false : !c.ok || last,
      waiting,
    };
  });
}

/**
 * The channels a playbook keeps: every one it ticks that its kind of message may go by, open now or not (cmViaTicks'
 * `keep`). Its run reaches people on the open ones and holds the rest until theirs opens.
 */
export function cmChannelsKept(ticks: readonly string[], purpose: AskedPurpose): ConsentChannel[] {
  return CONSENT_CHANNELS.filter((c) => ticks.includes(c) && channelNeverCarries(c, purpose) === null);
}

/** The ticks after one is pressed, in the page's order. */
export function cmTick(ticks: readonly string[], channel: ConsentChannel, on: boolean): ConsentChannel[] {
  return CONSENT_CHANNELS.filter((c) => (c === channel ? on : ticks.includes(c)));
}

/**
 * The reach split in one line, where the campaign goes by anything but WhatsApp alone ("Reaches 84: 52 on WhatsApp, 32 by
 * email · 12 can't be reached"); null for WhatsApp alone, whose reach the page has always said by its number.
 */
export function cmSplitWords(split: ReachSplit | null | undefined, on: readonly ConsentChannel[]): string | null {
  return split && on.some((c) => c !== "whatsapp") ? reachSplitWords(split) : null;
}

/**
 * The To line's clause for who it reaches on which channel ("12 on WhatsApp, 12 by email"), where the campaign goes by
 * anything but WhatsApp alone; null for WhatsApp alone, whose line is what it always was.
 */
export function cmReachBy(split: ReachSplit | null | undefined, on: readonly ConsentChannel[]): string | null {
  return split && on.some((c) => c !== "whatsapp") ? reachByWords(split) : null;
}

/** A channel's colour on the split bar: the chart palette's, as Reports draws the channel. */
export const cmChannelColour = (channel: ConsentChannel): string => RPT_CHANNEL_COLORS[channel];

/** Who is held and why, by reason, the most first: "7 · No email address on file, so nothing can be sent." */
export function cmHeldLines(
  split: ReachSplit | null | undefined,
  purpose: AskedPurpose,
): { n: number; words: string }[] {
  return HELD_ON.flatMap((why) => {
    const n = split?.heldBy[why] ?? 0;
    return n > 0 ? [{ n, words: heldWords(why, purpose) }] : [];
  }).sort((a, b) => b.n - a.n);
}
