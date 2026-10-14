/**
 * What the composers know of channels (One message, every channel, step 3; the campaigns-on-every-channel spec, 4.9): the
 * messages they offer and by which channels each is held, which channels a campaign may tick for the message in view, which
 * are on, why one cannot be, and how the reach splits across the ones that are. The rules are contracts' (campaign-message.ts:
 * campaignMessagesOf, messageHolds, messageWhyNot, readyForMessage; reach-for.ts: channelChoices, reachSplit, heldWords); the readiness is the
 * workspace's (server/campaigns/channels-ready.ts) with the message's own versions laid over it. Plain functions, nothing
 * here draws: the broadcast composer and the playbook composer read the same ones, and parts/send-by.tsx draws the row.
 */
import {
  CONSENT_CHANNELS,
  HELD_ON,
  VERSION_CHANNEL_WORDS,
  WHATSAPP_VERSION_ALONE,
  campaignMessagesOf,
  formatPhoneDisplay,
  numberHealth,
  whatsappLineOf,
  channelChoices,
  channelNeverCarries,
  channelsStandingParts,
  heldWords,
  messageHolds,
  newCampaignChannels,
  previewVersionsOf,
  reachByWords,
  reachSplitWords,
  readyOrWhatsApp,
  type AskedPurpose,
  type CampaignMessage,
  type ChannelDto,
  type NumberHealth,
  type ChannelStandingPart,
  type ChannelsReady,
  type ConsentChannel,
  type MessageAbout,
  type PreviewVersions,
  type ReachSplit,
} from "@chanlytics/contracts";
import { channelsOpenFor, openAmong } from "@/lib/campaign-channels";
import type { SettingsSurface } from "@/legacy-bridge/surfaces/settings";
import type { TemplateDto } from "@/surfaces/inbox/types";
import { offeredRows } from "@/surfaces/offered-templates";
import { RPT_CHANNEL_COLORS } from "@/surfaces/reports/series";

/** What the page says of the Send by row, beyond the reasons contracts words (CHANNEL_WORDS, messageWhyNot). */
/** What a playbook's kept channel that cannot send yet is promised. */
const ONCE_IT_CAN = "It sends once it can.";

export const CM_VIA_WORDS = {
  /** The row's word, and the group's name to a screen reader. */
  label: "Send by",
  /** The one channel on stays on: a campaign goes by at least one. */
  lastOne: "Keep at least one on.",
  /** Every ticked channel is closed to it: nobody is reached. */
  nowhere: "None of the channels ticked can carry this message yet.",
  /** A playbook keeps a channel that cannot send yet: its run holds those people until it can. */
  waits: (why: string): string => `${why} ${ONCE_IT_CAN}`,
  /** The same promise without the reason, under a line that has already said every channel's (send-by.tsx). */
  onceItCan: ONCE_IT_CAN,
} as const;

/**
 * Whether the workspace can send on each channel, as the page has it: the read's own, or, where it could not be read (or
 * a surface cached before it was published carries none), as the page counted before the channels were: WhatsApp goes,
 * which the page's own number banner and Send judge by the number, and the others are not checked, so not offered.
 */
export function cmReadyOf(read: ChannelsReady | null | undefined): ChannelsReady {
  return readyOrWhatsApp(read);
}

/**
 * Where the workspace can send on nothing at all, its standing in parts (contracts channelsStandingParts: "Nothing can send
 * yet", then each channel with its reason and the door that mends it), which the Send by row says once in place of three
 * closed switches' reasons. Null where any channel is open, and where the readiness was not read: the page then says what
 * it always said. Null too for a workspace paused for billing, whose standing is that one fact: each composer says the
 * pause where its Send would be (CAMPAIGNS_PAUSED_WORDS), and the row keeps its switches' own reasons.
 */
export function cmNothingOpen(read: ChannelsReady | null | undefined): ChannelStandingPart[] | null {
  if (!read || read.paused === true || CONSENT_CHANNELS.some((c) => read[c].ready)) return null;
  return channelsStandingParts(read);
}

/**
 * The message in view before one is picked, and for a template stamped before messages were kept: WhatsApp's version alone,
 * approved, as every campaign opened (contracts WHATSAPP_VERSION_ALONE, which the home's marks read too). What the pages
 * hand contracts' readyForMessage where they hold no message.
 */
export const CM_NO_MESSAGE_YET: Pick<CampaignMessage, "versions"> = WHATSAPP_VERSION_ALONE;

/**
 * The channel a broadcast ticks until the owner changes it: the first, in the product's order (WhatsApp, text, email), that
 * the workspace is ready on and the message holds, since a broadcast goes now on what can send now (contracts
 * newCampaignChannels). WhatsApp alone where there is none, or no message in view, as every campaign went before. A
 * workspace with no number composing a message written for email opens on Email. A new playbook's are its own reading's
 * (contracts playbookChannelsRead, "new": every channel it can go by, decision 5 of the spec of 8 October 2026).
 */
export function cmDefaultChannels(
  ready: ChannelsReady,
  message: Pick<CampaignMessage, "versions"> | null,
): ConsentChannel[] {
  const held = message === null ? null : messageHolds(message);
  return newCampaignChannels(
    "broadcast",
    held === null ? null : CONSENT_CHANNELS.filter((c) => ready[c].ready && held[c]),
  );
}

/**
 * A message the composers offer, in the shape their pages read: the row its words are drawn from (the WhatsApp version's
 * where the read holds it, else the first of its own), under the message's own id (its anchor's), title and category.
 * `channels` are those it holds now (contracts messageHolds), `message` the one reading of it (its WhatsApp version's
 * standing is where a tick's sentence comes from), `versions` the words of its email and text versions in its language, for a
 * preview to draw a person on those channels as they read it (contracts previewVersionsOf, which Ask's cards read the same
 * rows through: a channel the message has no row on is left out). `message` is absent on a template
 * stamped before messages were kept, which reads as WhatsApp's version alone. `channel` is the row the words are on.
 */
export type CmOffered = TemplateDto & {
  purpose: AskedPurpose;
  channels: ConsentChannel[];
  versions?: PreviewVersions;
  message?: CampaignMessage;
};

/**
 * The messages a composer offers, from the templates read: every message that is offered (not hidden, at least one channel
 * held: contracts campaignMessagesOf), made of the read's own `messages` where it carries them (they are made of EVERY row,
 * so a WhatsApp version still in review keeps its standing), else of its rows. A message whose WhatsApp version is approved
 * and cannot be put on the wire whole, and holds nothing else, is listed too, `blocked`, so the picker says why it is not
 * offered (contracts sendableTemplates); a message whose only version is one WhatsApp has not approved is not.
 */
export function cmOfferedMessages(read: { templates?: TemplateDto[]; messages?: CampaignMessage[] }): CmOffered[] {
  const rows = read.templates ?? [];
  return (read.messages ?? campaignMessagesOf(rows)).flatMap((m) => {
    const whatsapp = m.versions.whatsapp;
    const blockedAlone = !m.hidden && whatsapp !== null && whatsapp.status === "approved" && whatsapp.blocked !== null;
    const own = rows.filter((r) => r.name === m.name && r.language === m.language);
    const row =
      own.find((r) => r.id === m.anchor.id) ?? CONSENT_CHANNELS.flatMap((c) => own.filter((r) => r.channel === c))[0];
    if (!(m.offered || blockedAlone) || !row) return [];
    const held = messageHolds(m);
    return [
      {
        ...row,
        id: m.anchor.id,
        title: m.title,
        category: m.category,
        blocked: m.offered ? null : (whatsapp?.blocked ?? null),
        purpose: m.purpose,
        channels: CONSENT_CHANNELS.filter((c) => held[c]),
        versions: previewVersionsOf(rows, m.name, m.language),
        message: m,
      },
    ];
  });
}

/**
 * The messages a composer offers, made of the settings read (surfaces/offered-templates.ts), the one read of the templates:
 * undefined before it has landed (the composer says it is still reading), null where its templates read failed (it says it could
 * not read them), else cmOfferedMessages over the rows that may go and the messages made of every row.
 */
export function cmOfferedFrom(settings: SettingsSurface | undefined): CmOffered[] | null | undefined {
  const rows = offeredRows(settings);
  if (!rows) return rows;
  return cmOfferedMessages({ templates: rows, ...(settings?.messages ? { messages: settings.messages } : {}) });
}

/** The offered message of this name and language, whichever of its versions an id once named: null where none is offered. */
export function cmOfferedBy<T extends { name: string; language: string }>(
  offered: readonly T[],
  name: string,
  language: string,
): T | null {
  return offered.find((t) => t.name === name && t.language === language) ?? null;
}

/** The channel the words of an offered message are on: the one a person held back is drawn them as (cmPreviewBy's `standIn`). */
export function cmStandInOf(t: { channel: string }): ConsentChannel {
  return CONSENT_CHANNELS.find((c) => c === t.channel) ?? "whatsapp";
}

/** The business's postal address where its Business record holds one: what an email's foot names (contracts emailFoot). */
function cmAddressOf(brain: { profile?: { address?: unknown } | null } | null | undefined): string | null {
  const address = brain?.profile?.address;
  return typeof address === "string" ? address : null;
}

/** What the slots that name the business may fill, as a composer says them. */
interface CmBusiness {
  businessName: string;
  businessAddress: string | null;
  bookingLink: boolean;
  /** Whether the Google listing keeps a review link: what may fill a review-link slot. */
  reviewLink: boolean;
}

/**
 * What the slots that name the business may fill, from the settings read (the wiring's second audit, S10-9: each composer read
 * GET settings again for it, beside the settings surface's own read): its name, the postal address an offer by email names,
 * whether a booking link is on file, and whether the listing keeps a review link. A read not in yet, one that failed and a broken
 * config say nothing of the listing and the link: none. The composers follow the settings read, so it is current as it lands.
 */
export function cmBusinessOf(settings: SettingsSurface | undefined): CmBusiness {
  const record = settings?.settings ?? null;
  const brain = record?.config?.brain ?? null;
  return {
    businessName: brain?.business_name || "the business",
    businessAddress: cmAddressOf(brain),
    bookingLink: !!brain?.booking_link,
    reviewLink: !!record && !record.broken && record.reviewLink,
  };
}

/** Whether two sayings of the business are the same: what a surface holds (its address unread before its first read) and what Settings says. */
export function cmSameBusiness(
  a: Omit<CmBusiness, "businessAddress"> & { businessAddress?: string | null },
  b: CmBusiness,
): boolean {
  return (
    a.businessName === b.businessName &&
    a.businessAddress === b.businessAddress &&
    a.bookingLink === b.bookingLink &&
    a.reviewLink === b.reviewLink
  );
}

/** The number a composer's WhatsApp goes out on, as it says it: whether there is one, how it reads, and its health. */
interface CmNumber {
  present: boolean;
  display: string | null;
  health: NumberHealth;
}

/**
 * The workspace's WhatsApp line in the channels read (contracts whatsappLineOf) and its health as WhatsApp last said it (the
 * wiring's second audit, S10-9: each composer read GET channels again for it). Undefined or null rows (not read yet, or a read
 * that failed) are no line, which the number's banner judges.
 */
export function cmNumberOf(rows: readonly ChannelDto[] | null | undefined): CmNumber & { e164: string | null } {
  const wa = whatsappLineOf(rows);
  return {
    present: !!wa,
    display: wa?.number_e164 ? formatPhoneDisplay(wa.number_e164) : null,
    health: numberHealth({
      quality: wa?.quality ?? null,
      event: wa?.quality_event ?? null,
      limit: wa?.messaging_limit ?? null,
    }),
    e164: wa?.number_e164 ?? null,
  };
}

/** Whether two sayings of the number are the same. */
export function cmSameNumber(a: CmNumber, b: CmNumber): boolean {
  return a.present === b.present && a.display === b.display && JSON.stringify(a.health) === JSON.stringify(b.health);
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
 * so a channel closed now cannot be ticked. A campaign goes by at least one channel: the one open channel that is on
 * stays on, and so does a waiting one where it is all a playbook keeps (turning it off would leave it none, and a save
 * that names none keeps what it had, so the switch would have said one thing and the playbook another).
 */
export function cmViaTicks(
  ticks: readonly string[],
  ready: ChannelsReady,
  message: { purpose: AskedPurpose; about: MessageAbout },
  keep: boolean,
): CmViaTick[] {
  const { purpose, about } = message;
  const on = cmChannelsOn(ticks, ready, purpose, about);
  const kept = keep ? cmChannelsKept(ticks, purpose) : on;
  return channelChoices(ready, purpose, about).map((c) => {
    const isOn = on.includes(c.channel);
    const last = isOn && on.length === 1;
    const waiting = keep && !c.ok && kept.includes(c.channel);
    const lastKept = waiting && kept.length === 1;
    const waits = waiting ? CM_VIA_WORDS.waits(c.why ?? "") : null;
    return {
      channel: c.channel,
      word: VERSION_CHANNEL_WORDS[c.channel],
      on: isOn || waiting,
      why: waits
        ? lastKept
          ? `${waits} ${CM_VIA_WORDS.lastOne}`
          : waits
        : c.ok
          ? last
            ? CM_VIA_WORDS.lastOne
            : null
          : c.why,
      fixed: waiting ? lastKept : !c.ok || last,
      waiting,
    };
  });
}

/**
 * The channels a playbook keeps: every one it ticks that its kind of message may go by, open now or not (cmViaTicks'
 * `keep`). Its run reaches people on the open ones and holds the rest until theirs opens.
 */
function cmChannelsKept(ticks: readonly string[], purpose: AskedPurpose): ConsentChannel[] {
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
