/**
 * Which channel a campaign reaches each person on (One message, every channel, step 3; the campaigns-on-every-channel
 * spec, 4.2, 4.4, 4.5 and 4.8). A campaign — a broadcast, a playbook's run — ticks the channels it may go by
 * (`channels`, WhatsApp alone by default, so nothing made before changes), and each person is reached ONCE, on one of
 * them, picked at enrolment:
 *
 *   1. the channel they last wrote on, if the campaign ticks it, the workspace can send on it now, it carries this kind
 *      of message, and their yes covers it;
 *   2. else the first of WhatsApp, text and email that passes the same;
 *   3. else held, with the reason the strictest channel gave.
 *
 * What a channel never carries, whatever a person said: offers by text (the texting line is registered for replies and
 * appointment messages, deliver.ts), and offers by email until the workspace can send them (email-offers.ts: the
 * deployment's campaigns domain verified, the business's address on file, no pause). The business's own news by email
 * is an offer at the door (decision D2, consent.ts isOfferByEmail), so it waits for the same. Over a channel's limit a person is
 * held on that channel, never moved to another: nobody gets an email because WhatsApp ran out for the day (decision 9).
 */
import { isOfferByEmail, type AskedPurpose, type MessageAbout } from "../../consent/consent";
import { CONSENT_CHANNELS, type ConsentChannel } from "../../consent/channels";
import type { WrittenChannel } from "../../conversations/thread-channel";
import { type NotReceived, type ReceiveRow, whyNotReceive } from "../../people/person-consent";
import { type EmailOffers, emailOffersOpen, type OfferFacts, OFFERS_BY_EMAIL_WORDS } from "./email-offers";
import { whatsappOffersOpen } from "./whatsapp-offers";
import { keysOf } from "../../shared/unknown";

/**
 * The door that opens a closed channel, where the business has one: `connect`, the channel itself in Settings ›
 * Connections (a WhatsApp number, a texting line, a mailbox); `address`, the business's postal address, which every offer
 * by email names. A closed channel with none is closed by what nothing the business does opens: a rule (a text never
 * carries an offer, WhatsApp's pause on offers to US numbers, Chanlytics' own offers domain), a wait that ends by itself
 * (the carriers' approval, a number's quality, a gate's pause, a check that could not be made just now), or the message's
 * own (no version there). A page reads this to tell "connect this" from "nothing to press", never the sentence.
 */
type ChannelMend = "connect" | "address";

/** Whether the workspace can send on a channel now, and if not the sentence that says why. */
export interface ChannelReady {
  ready: boolean;
  why: string | null;
  /** The door that makes it ready, where it is not and the business has one (ChannelMend); absent on a read from before it. */
  mend?: ChannelMend;
  /**
   * Whether OFFERS can go by this channel, apart from whether it can send at all. Email's, where the read says
   * (email-offers.ts): absent on a read that did not ask (a page cached before it, the WhatsApp-alone reading), and offers
   * by email are then closed, which is what a deployment without the campaigns domain says too. WhatsApp's, where the read
   * knows the number (whatsapp-offers.ts: Meta's pause on marketing messages to US numbers): absent where it does not, and
   * offers on WhatsApp are then open, as every campaign went before.
   */
  offers?: EmailOffers;
  /**
   * True where whether it can send could not be asked just now (email: the edge did not answer about its wire): not a
   * no, and asked again in a moment, so a reader branches on this and never on `why`'s sentence. Absent where it was read.
   */
  unchecked?: true;
  /**
   * True where it is closed to this message only until WhatsApp says yes: WhatsApp is checking its WhatsApp version, or
   * holding it for a few hours, and it sends by itself after (campaign-message.ts readyForMessage). A send that waits
   * (reachFor's `wait`) places on it the people nothing else reaches, and they go once it opens.
   */
  waits?: true;
}
export type ChannelsReady = Record<ConsentChannel, ChannelReady> & {
  /**
   * The workspace is paused (tenants.status, billing): the send door refuses every message of a campaign (core deliver.ts
   * `paused`), whatever its channels can do. The composers say so (CAMPAIGNS_PAUSED_WORDS) where Send would be, the
   * route refuses a broadcast made under it, and the Campaigns home says it of every next run. Held apart from the
   * channels, which keep saying what each can do, so who can be reached (People's rows, an audience's count) is as it was.
   * Absent: not paused, or not known to be.
   */
  paused?: boolean;
};

/** The channels a campaign ticks when nobody picked any: WhatsApp alone, as every campaign went before. */
export const DEFAULT_CAMPAIGN_CHANNELS: readonly ConsentChannel[] = ["whatsapp"];

/**
 * Whether a new playbook opens on every channel it can go by, or on the first alone (decision 5 of the spec of 8 October
 * 2026, "A campaign says where it goes"): the one switch, read by the composer and by Ask's playbook proposal, so
 * turning it back is this line. Every channel, because a person is reached once, on their best channel (reachFor): a
 * tick widens who is reached and never doubles a message.
 */
export const NEW_PLAYBOOK_TICKS_EVERY_CHANNEL: boolean = true;

/**
 * The channels a new campaign goes by until its owner says otherwise. `open` is the channels a campaign of its kind
 * may go by now for the message in view (channelChoices over readyForMessage: the workspace can send on them, the
 * message holds a version there, its purpose is carried there), in the product's order; null where no message is in
 * view. A playbook takes every one of them (NEW_PLAYBOOK_TICKS_EVERY_CHANNEL); a broadcast the first alone, since it goes
 * now on what can send now. WhatsApp alone where there is none, or no message in view, as every campaign went before.
 */
export function newCampaignChannels(
  kind: "playbook" | "broadcast",
  open: readonly ConsentChannel[] | null,
): ConsentChannel[] {
  const [first] = open ?? [];
  if (!open || first === undefined) return [...DEFAULT_CAMPAIGN_CHANNELS];
  return kind === "playbook" && NEW_PLAYBOOK_TICKS_EVERY_CHANNEL ? [...open] : [first];
}

/** The words for a channel that cannot carry a message, or cannot be sent on here, as a tick's hover says them. */
export const CHANNEL_WORDS = {
  noOffersByText: "Texts carry no offers.",
  /**
   * What an offer by email says where the read carries no facts about offers (the WhatsApp-alone reading, a page cached before
   * them, Ask's own): the campaigns domain, which is what its absence is. A read that has them says the reason that is true.
   */
  noOffersByEmailYet: OFFERS_BY_EMAIL_WORDS.noCampaignsDomain,
  noWhatsApp: "Connect a WhatsApp number first.",
  noTextLine: "No texting line yet.",
  textLineMock: "Your texting line is a test filing: it sends nothing.",
  textLineNotActive: "Texting isn't approved for your number yet.",
  noMailbox: "Set up email in Settings › Connections first.",
  noEmailDomain: "Email is not switched on for this deployment yet.",
  /** What could not be asked of the edge just now: not offered, and not guessed to be ready either. */
  unchecked: "This couldn't be checked just now.",
} as const;

/**
 * Why a channel never carries a message of this purpose, whoever sends it and whoever it is for, or null when it may:
 * texts carry no offers (the line is registered with the carriers for replies and appointment messages). What a
 * playbook keeps ticked until it can send is judged by this alone; `channelRefuses` adds what the workspace cannot do yet.
 */
export function channelNeverCarries(channel: ConsentChannel, purpose: AskedPurpose): string | null {
  return purpose === "marketing" && channel === "sms" ? CHANNEL_WORDS.noOffersByText : null;
}

/**
 * Why a rule closes a channel to a message of this purpose, whatever the business sets up, or null where none does: what
 * the channel never carries (channelNeverCarries), and an offer on WhatsApp while Meta's pause holds for the workspace's
 * number (`whatsappOffers`, whatsapp-offers.ts: null or absent on a read that did not know the number, and the channel is
 * then open, as it was before the pause was read). THE writers' question (the clean list's G1): no version of a message
 * is written, filed or mentioned for a channel a rule closes to it, so a writer asks this and nothing of its own. An
 * offer by email that waits (Chanlytics' own offers domain, the business's address, a gate's pause) is no rule's: its
 * version is written, and goes the day they open.
 */
export function channelRuledOut(
  channel: ConsentChannel,
  purpose: AskedPurpose,
  whatsappOffers: Pick<EmailOffers, "ok" | "why"> | null | undefined,
): string | null {
  const never = channelNeverCarries(channel, purpose);
  if (never) return never;
  return channel === "whatsapp" && purpose === "marketing" && whatsappOffers && !whatsappOffers.ok
    ? whatsappOffers.why
    : null;
}

/**
 * Why a channel cannot carry a message of this purpose for this workspace now, with what closes it: a rule
 * (channelRuledOut: `rule`, nothing to press, no version written), or an offer by email until the workspace can send one
 * (`ready.email.offers`, email-offers.ts: the campaigns domain, the business's address, no pause), with the door that
 * opens it where the business has one (`mend`). Null when it may.
 */
function channelRefusal(
  channel: ConsentChannel,
  purpose: AskedPurpose,
  about: MessageAbout,
  ready: ChannelsReady,
): { why: string; rule: boolean; mend: ChannelMend | null } | null {
  const ruled = channelRuledOut(channel, purpose, ready.whatsapp.offers);
  if (ruled) return { why: ruled, rule: true, mend: null };
  // A campaign always starts the conversation: it is proactive.
  if (!isOfferByEmail({ channel, purpose, proactive: true, about })) return null;
  const offers = ready.email.offers;
  return offers?.ok
    ? null
    : { why: offers?.why ?? CHANNEL_WORDS.noOffersByEmailYet, rule: false, mend: offers?.mend ?? null };
}

/**
 * Why a channel cannot carry a message of this purpose for this workspace now, whoever it is for, or null when it may:
 * what a rule closes it to (channelRuledOut: what it never carries, and an offer on WhatsApp while Meta's pause holds for
 * the workspace's number), and an offer by email until the workspace can send one (`ready.email.offers`,
 * email-offers.ts: the campaigns domain, the business's address, no pause). An offer by email is what the door says it is
 * (consent.ts isOfferByEmail, decision D2): an offer, and the business's own news, which `about` says; a message about
 * their visit or proposal goes by email whatever the workspace's offers are doing. The workspace's channels are required,
 * so no reader asks the question without the facts that answer it.
 */
export function channelRefuses(
  channel: ConsentChannel,
  purpose: AskedPurpose,
  about: MessageAbout,
  ready: ChannelsReady,
): string | null {
  return channelRefusal(channel, purpose, about, ready)?.why ?? null;
}

/**
 * Said once on the Broadcasts page, where an owner picks an offer to send: which channels carry offers, so a customer who
 * is absent from an offer's count reads as the rule it is and not as a bug. The refusal per customer is the wire's
 * (consent.ts PURPOSE_REFUSALS); this is the rule, for the page, and it follows the workspace, since it is the same
 * question the ticks ask (channelRefuses): WhatsApp unless Meta's pause holds for the workspace's number
 * (`ready.whatsapp.offers`, whatsapp-offers.ts: marketing messages to US numbers), email once the workspace can send offers
 * by it (`ready.email.offers`: the campaigns domain, the business's address, no pause), a text never. A workspace whose
 * offers by email are closed, for whatever reason, is told so, so the note is never false on the day the domain verifies.
 * The workspace's channels are required, as the ticks' are.
 */
export function offersNote(ready: ChannelsReady): string {
  const byWhatsApp = channelRefuses("whatsapp", "marketing", "ours", ready) === null;
  const byEmail = channelRefuses("email", "marketing", "ours", ready) === null;
  const noText = "Texting is approved for replies and appointment messages, so no offer goes by text";
  const paused = ready.whatsapp.offers?.why ?? "";
  if (byWhatsApp && byEmail)
    return `Offers and news go by WhatsApp and by email. ${noText} · someone who has only ever texted you hears about offers on WhatsApp once they say yes there, or by email if you have their address and they have not said no.`;
  if (byWhatsApp)
    return `Offers and news go by WhatsApp only. ${noText} · someone who has only ever texted you hears about offers once they say yes on WhatsApp.`;
  if (byEmail)
    return `Offers and news go by email only for now. ${paused} ${noText} · someone hears about offers by email if you have their address and they have not said no.`;
  // Why email carries none, in its own reason: Chanlytics' own ("Emails carry no offers or news for now.") or the business's.
  const byEmailWhy = channelRefuses("email", "marketing", "ours", ready) ?? "";
  return `Offers and news have no channel right now. ${paused} ${noText}. ${byEmailWhy}`;
}

/**
 * Whether the workspace can send on each channel, from the facts each one is judged by: WhatsApp by its number's health
 * (broadcasts/number.ts numberHealth; null without a number), a text by its line (active and not a test filing, as the
 * inbound door reads it), an email by the workspace's mailbox and whether the deployment's email wire can send (the
 * edge's answer, emailCanSend: a mail domain AND the provider's key). The dashboard holds no key, so it asks the edge
 * and reads `domain` null when it could not: email is then not offered, and says so, never guessed ready. Email also
 * learns whether OFFERS can go (`offers`: the edge's verdict on the campaigns domain, the business's address, the
 * mailbox's pause; email-offers.ts), so a tick and a route refuse an offer by email with the reason that is true.
 */
export function channelsReady(fields: {
  /**
   * The number's health, and the number itself where the read knows it (E.164): offers on WhatsApp are then judged by
   * Meta's pause on marketing messages to US numbers (whatsapp-offers.ts). A read without the number judges nothing of them.
   */
  whatsapp: { canSend: boolean; refusal: string | null; number?: string | null } | null;
  textLine: { sms_state: string | null; reg_mock: boolean | null } | null;
  email: { mailbox: boolean; domain: boolean | null; offers?: OfferFacts };
  /** The workspace is paused (tenants.status): carried as `paused`, and the channels are as they were. Absent: not paused. */
  paused?: boolean;
}): ChannelsReady {
  const waNow: ChannelReady = !fields.whatsapp
    ? { ready: false, why: CHANNEL_WORDS.noWhatsApp, mend: "connect" }
    : fields.whatsapp.canSend
      ? { ready: true, why: null }
      : { ready: false, why: fields.whatsapp.refusal ?? CHANNEL_WORDS.noWhatsApp };
  const wa: ChannelReady =
    fields.whatsapp && fields.whatsapp.number !== undefined
      ? { ...waNow, offers: whatsappOffersOpen(fields.whatsapp.number) }
      : waNow;
  const sms: ChannelReady = !fields.textLine
    ? { ready: false, why: CHANNEL_WORDS.noTextLine, mend: "connect" }
    : fields.textLine.reg_mock
      ? { ready: false, why: CHANNEL_WORDS.textLineMock }
      : fields.textLine.sms_state === "active"
        ? { ready: true, why: null }
        : { ready: false, why: CHANNEL_WORDS.textLineNotActive };
  const emailNow: ChannelReady =
    fields.email.domain === null
      ? { ready: false, why: CHANNEL_WORDS.unchecked, unchecked: true }
      : !fields.email.domain
        ? { ready: false, why: CHANNEL_WORDS.noEmailDomain }
        : fields.email.mailbox
          ? { ready: true, why: null }
          : { ready: false, why: CHANNEL_WORDS.noMailbox, mend: "connect" };
  const email: ChannelReady = fields.email.offers
    ? { ...emailNow, offers: emailOffersOpen(fields.email.offers, CHANNEL_WORDS.unchecked) }
    : emailNow;
  return { whatsapp: wa, sms, email, ...(fields.paused ? { paused: true } : {}) };
}

/**
 * How a channel stands for one kind of message in a workspace now: THE one answer a tick, a picker, a tab, a writer and
 * the send door read, so none says of a channel what another denies (the review of 15 Nov 2026: New asked whether the
 * channel was connected, the door asked this, and what New ticked the door refused).
 */
interface ChannelChoice {
  channel: ConsentChannel;
  ok: boolean;
  why: string | null;
  /**
   * A rule closes it to this kind of message, whatever the business sets up (channelRuledOut): no version of the message
   * is written for it, and nothing is to be pressed.
   */
  rule: boolean;
  /** The door that opens it, where it is closed and the business has one (ChannelMend); null where it is open or has none. */
  mend: ChannelMend | null;
}

/** The channels a campaign may tick for this kind of message, each with whether it can, why not and what opens it, in their order. */
export function channelChoices(ready: ChannelsReady, purpose: AskedPurpose, about: MessageAbout): ChannelChoice[] {
  return CONSENT_CHANNELS.map((channel) => {
    const refusal = channelRefusal(channel, purpose, about, ready);
    if (refusal) return { channel, ok: false, ...refusal };
    const now = ready[channel];
    return { channel, ok: now.ready, why: now.why, rule: false, mend: now.ready ? null : (now.mend ?? null) };
  });
}

/** Why a person is not reached: one of the receive refusals, or no ticked channel can carry the message here. */
export type HeldOn = NotReceived | "no_channel";

/**
 * A person as the pick reads them: their answers, where to send, the channel they last wrote on (an Instagram DM among
 * them, which no campaign goes by: the pick then keeps its own order), and when they last wrote on WhatsApp, where the
 * read carries it (People's row does: `latest_wa_inbound_at`), which a reply in their open chat is judged by (InChat).
 */
export type ReachRow = ReceiveRow & { lastChannel?: WrittenChannel | null; waInboundAt?: string | null };

/**
 * A step whose reply may go in a person's open WhatsApp chat (decision 0135): a follow-up about their own request whose
 * message WhatsApp approved as an offer. `purpose` is the moment's own, the yes the open chat asks, where the message's
 * is the offer's; `open` says whether a person's chat is still open at the moment the send is for, as the run asks it
 * (core campaigns/paced.ts inChatOf, by replyWindow), so this pick, which every page that counts a run loads, carries
 * no clock of its own.
 */
export interface InChat {
  purpose: AskedPurpose;
  open: (reach: ReachRow) => boolean;
}

/**
 * How far each reason is from being the owner's to fix: first the one that ends everything, then the person's own no to
 * email, their missing yes, and last what the owner can mend on the person's page (a number, an address, one that stopped)
 * or in the workspace (no channel). A Record, so a reason added to HeldOn cannot be left out of the order.
 */
const HELD_ORDER: Record<HeldOn, number> = {
  stopped: 0,
  unsubscribed: 1,
  no_yes: 2,
  no_number: 3,
  no_address: 4,
  address_stopped: 5,
  no_channel: 6,
};

/** Every reason a person is held, in that order: the strictest of several is the one reachFor keeps, and a page lists them so. */
export const HELD_ON: readonly HeldOn[] = keysOf(HELD_ORDER).sort((a, b) => HELD_ORDER[a] - HELD_ORDER[b]);

/**
 * The channels a campaign ticks that can carry its message now, in the product's order: the workspace can send on each,
 * and it carries this kind of message (channelRefuses). The pick reads them (reachFor), and so does a new campaign's card
 * where it says how it goes (playbooks/schedule.ts campaignLine).
 */
export function usableChannels(
  purpose: AskedPurpose,
  options: { channels: readonly string[]; ready: ChannelsReady; about: MessageAbout },
): ConsentChannel[] {
  return CONSENT_CHANNELS.filter(
    (c) =>
      options.channels.includes(c) &&
      options.ready[c].ready &&
      channelRefuses(c, purpose, options.about, options.ready) === null,
  );
}

/**
 * Whether a step's reply goes in this person's open WhatsApp chat (decision 0135): null where it does. "closed" where
 * there is no chat to reply in, which holds nobody, and they are picked as they always were: the step does not go by
 * WhatsApp, the number cannot send, or their 24 hours since they last wrote there are over at the moment the send is for
 * (InChat `open`). Else the person's own reason under the moment's yes: a stop, no yes to messages,
 * no number. Meta's pause on offers to US numbers is not asked: words in an open chat are no saved message of Meta's.
 */
function inChatFor(
  reach: ReachRow,
  chat: InChat,
  options: Parameters<typeof usableChannels>[1],
): NotReceived | "closed" | null {
  if (!options.channels.includes("whatsapp") || !options.ready.whatsapp.ready) return "closed";
  if (!chat.open(reach)) return "closed";
  return whyNotReceive(reach, chat.purpose, "whatsapp", options.about);
}

/**
 * The channel a campaign reaches this person on, or why it reaches them on none (the rules at the head of this file).
 * `channels` are the campaign's ticks; `ready` the workspace's channels now; `about` what its message is about, which
 * by email decides whether a yes is asked (consent.ts MessageAbout).
 *
 * `wait`: the send waits for a channel that opens by itself (ChannelReady `waits`: WhatsApp checking the message, or
 * holding it). A person a channel that can go now reaches goes by it, at once; one only the waiting channel reaches is
 * placed on it, and the send holds them until it opens (core messages/broadcast/whatsapp-wait.ts). Without it they are
 * held, `no_channel`, as a run that cannot wait holds them.
 *
 * `inChat`: where the step says its reply may go in an open chat (decision 0135), that is asked first, and a person
 * picked so is marked (`inChat`): the send leaves the saved message's name off for them. Someone their own answers hold
 * there is held by the strictest reason of both askings. Unsaid, nobody is picked that way.
 */
export function reachFor(
  reach: ReachRow,
  purpose: AskedPurpose,
  options: {
    channels: readonly string[];
    ready: ChannelsReady;
    about: MessageAbout;
    wait?: boolean;
    inChat?: InChat | null;
  },
): { channel: ConsentChannel; held: null; inChat?: true } | { channel: null; held: HeldOn } {
  const chat = options.inChat ? inChatFor(reach, options.inChat, options) : "closed";
  if (chat === null) return { channel: "whatsapp", held: null, inChat: true };
  const heldOn: HeldOn[] = chat === "closed" ? [] : [chat];
  const strictest = (): HeldOn => HELD_ON.find((w) => heldOn.includes(w)) ?? "no_channel";
  const usable = usableChannels(purpose, options);
  const last = usable.find((c) => c === reach.lastChannel) ?? null;
  const order = last ? [last, ...usable.filter((c) => c !== last)] : usable;
  for (const c of [...order, ...(options.wait ? waitingChannels(purpose, options) : [])]) {
    const w = whyNotReceive(reach, purpose, c, options.about);
    if (w === null) return { channel: c, held: null };
    heldOn.push(w);
  }
  return { channel: null, held: strictest() };
}

/**
 * The channels a campaign ticks that cannot carry its message now and will by themselves (ChannelReady `waits`), where no
 * rule closes them to this kind of message: asked after the usable ones, by a send that waits (reachFor).
 */
function waitingChannels(
  purpose: AskedPurpose,
  options: { channels: readonly string[]; ready: ChannelsReady; about: MessageAbout },
): ConsentChannel[] {
  return CONSENT_CHANNELS.filter(
    (c) =>
      options.channels.includes(c) &&
      options.ready[c].waits === true &&
      channelRefuses(c, purpose, options.about, options.ready) === null,
  );
}

/** How a campaign's people split: how many on each channel, and how many held, by why. */
export interface ReachSplit {
  reached: number;
  byChannel: Record<ConsentChannel, number>;
  held: number;
  heldBy: Partial<Record<HeldOn, number>>;
}

/** The split of a set of people for a campaign, each picked as reachFor picks them. */
export function reachSplit(
  rows: readonly ReachRow[],
  purpose: AskedPurpose,
  options: { channels: readonly string[]; ready: ChannelsReady; about: MessageAbout },
): ReachSplit {
  const out: ReachSplit = { reached: 0, byChannel: { whatsapp: 0, sms: 0, email: 0 }, held: 0, heldBy: {} };
  for (const r of rows) {
    const p = reachFor(r, purpose, options);
    if (p.channel) {
      out.reached += 1;
      out.byChannel[p.channel] += 1;
    } else {
      out.held += 1;
      out.heldBy[p.held] = (out.heldBy[p.held] ?? 0) + 1;
    }
  }
  return out;
}

const SPLIT_CHANNEL_WORDS: Record<ConsentChannel, string> = {
  whatsapp: "on WhatsApp",
  sms: "by text",
  email: "by email",
};

/**
 * The split in one line, as a composer says it: "Reaches 84: 52 on WhatsApp, 32 by email · 12 can't be reached". One
 * channel says its number alone ("Reaches 52 on WhatsApp"); nobody held says nothing of the held.
 */
export function reachSplitWords(reachSplit: ReachSplit): string {
  const parts = CONSENT_CHANNELS.filter((c) => reachSplit.byChannel[c] > 0).map(
    (c) => `${reachSplit.byChannel[c]} ${SPLIT_CHANNEL_WORDS[c]}`,
  );
  const head =
    reachSplit.reached === 0
      ? "Reaches nobody"
      : parts.length === 1
        ? `Reaches ${parts[0]}`
        : `Reaches ${reachSplit.reached}: ${parts.join(", ")}`;
  return reachSplit.held > 0 ? `${head} · ${reachSplit.held} can't be reached` : head;
}
