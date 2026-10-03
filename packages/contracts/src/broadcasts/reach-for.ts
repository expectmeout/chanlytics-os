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
 * deployment's campaigns domain verified, the business's address on file, no pause). Over a channel's limit a person is
 * held on that channel, never moved to another: nobody gets an email because WhatsApp ran out for the day (decision 9).
 */
import type { AskedPurpose, SendPurpose } from "../consent/consent";
import { CONSENT_CHANNELS, type ConsentChannel } from "../consent/consent-channels";
import { type NotReceived, type ReceiveRow, whyNotReceive } from "../people/person-consent";
import { triggerOf } from "../playbooks/playbook-triggers";
import { type EmailOffers, emailOffersOpen, type OfferFacts, OFFERS_BY_EMAIL_WORDS } from "./email-offers";

/** Whether the workspace can send on a channel now, and if not the sentence that says why. */
export interface ChannelReady {
  ready: boolean;
  why: string | null;
  /**
   * Email's, where the read says: whether OFFERS by email can go (email-offers.ts), apart from whether email can send
   * at all. Absent on a read that did not ask (a page cached before it, the WhatsApp-alone reading): offers by email are
   * then closed, which is what a deployment without the campaigns domain says too.
   */
  offers?: EmailOffers;
}
export type ChannelsReady = Record<ConsentChannel, ChannelReady>;

/** The channels a campaign ticks when nobody picked any: WhatsApp alone, as every campaign went before. */
export const DEFAULT_CAMPAIGN_CHANNELS: readonly ConsentChannel[] = ["whatsapp"];

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
  textLineNotActive: "Your texting line is not approved by the carriers yet.",
  noMailbox: "Set up email in Settings › Connections first.",
  noEmailDomain: "Email is not switched on for this deployment yet.",
  /** What could not be asked of the edge just now: not offered, and not guessed to be ready either. */
  unchecked: "This could not be checked just now.",
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
 * Why a channel cannot carry a message of this purpose for this workspace now, whoever it is for, or null when it may:
 * what it never carries (channelNeverCarries), and offers by email until the workspace can send them
 * (`ready.email.offers`, email-offers.ts: the campaigns domain, the business's address, no pause). The workspace's
 * channels are required, so no reader asks the question without the facts that answer it.
 */
export function channelRefuses(channel: ConsentChannel, purpose: AskedPurpose, ready: ChannelsReady): string | null {
  const never = channelNeverCarries(channel, purpose);
  if (never) return never;
  if (purpose !== "marketing") return null;
  if (channel === "email") {
    const offers = ready.email.offers;
    return offers?.ok ? null : (offers?.why ?? CHANNEL_WORDS.noOffersByEmailYet);
  }
  return null;
}

/**
 * Whether the workspace can send on each channel, from the facts each one is judged by: WhatsApp by its number's health
 * (broadcast-number.ts numberHealth; null without a number), a text by its line (active and not a test filing, as the
 * inbound door reads it), an email by the workspace's mailbox and whether the deployment's email wire can send (the
 * edge's answer, emailCanSend: a mail domain AND the provider's key). The dashboard holds no key, so it asks the edge
 * and reads `domain` null when it could not: email is then not offered, and says so, never guessed ready. Email also
 * learns whether OFFERS can go (`offers`: the edge's verdict on the campaigns domain, the business's address, the
 * mailbox's pause; email-offers.ts), so a tick and a route refuse an offer by email with the reason that is true.
 */
export function channelsReady(f: {
  whatsapp: { canSend: boolean; refusal: string | null } | null;
  textLine: { sms_state: string | null; reg_mock: boolean | null } | null;
  email: { mailbox: boolean; domain: boolean | null; offers?: OfferFacts };
}): ChannelsReady {
  const wa: ChannelReady = !f.whatsapp
    ? { ready: false, why: CHANNEL_WORDS.noWhatsApp }
    : f.whatsapp.canSend
      ? { ready: true, why: null }
      : { ready: false, why: f.whatsapp.refusal ?? CHANNEL_WORDS.noWhatsApp };
  const sms: ChannelReady = !f.textLine
    ? { ready: false, why: CHANNEL_WORDS.noTextLine }
    : f.textLine.reg_mock
      ? { ready: false, why: CHANNEL_WORDS.textLineMock }
      : f.textLine.sms_state === "active"
        ? { ready: true, why: null }
        : { ready: false, why: CHANNEL_WORDS.textLineNotActive };
  const emailNow: ChannelReady =
    f.email.domain === null
      ? { ready: false, why: CHANNEL_WORDS.unchecked }
      : !f.email.domain
        ? { ready: false, why: CHANNEL_WORDS.noEmailDomain }
        : f.email.mailbox
          ? { ready: true, why: null }
          : { ready: false, why: CHANNEL_WORDS.noMailbox };
  const email: ChannelReady = f.email.offers
    ? { ...emailNow, offers: emailOffersOpen(f.email.offers, CHANNEL_WORDS.unchecked) }
    : emailNow;
  return { whatsapp: wa, sms, email };
}

/** The channels a campaign may tick for this kind of message, each with whether it can and why not, in their order. */
export function channelChoices(
  ready: ChannelsReady,
  purpose: AskedPurpose,
): Array<{ channel: ConsentChannel; ok: boolean; why: string | null }> {
  return CONSENT_CHANNELS.map((channel) => {
    const refuses = channelRefuses(channel, purpose, ready);
    if (refuses) return { channel, ok: false, why: refuses };
    return { channel, ok: ready[channel].ready, why: ready[channel].why };
  });
}

/** Why a person is not reached: one of the receive refusals, or no ticked channel can carry the message here. */
export type HeldOn = NotReceived | "no_channel";

/** A person as the pick reads them: their answers, where to send, and the channel they last wrote on. */
export type ReachRow = ReceiveRow & { lastChannel?: ConsentChannel | null };

/** How far a refusal is from being the owner's to fix, first the one that ends everything, then the person's own no to email. */
const STRICTEST: readonly NotReceived[] = ["stopped", "unsubscribed", "no_yes", "no_number", "no_address"];

/**
 * The channel a campaign reaches this person on, or why it reaches them on none (the rules at the head of this file).
 * `channels` are the campaign's ticks; `ready` the workspace's channels now.
 */
export function reachFor(
  r: ReachRow,
  purpose: AskedPurpose,
  o: { channels: readonly string[]; ready: ChannelsReady },
): { channel: ConsentChannel; held: null } | { channel: null; held: HeldOn } {
  const usable = CONSENT_CHANNELS.filter(
    (c) => o.channels.includes(c) && o.ready[c].ready && channelRefuses(c, purpose, o.ready) === null,
  );
  if (usable.length === 0) return { channel: null, held: "no_channel" };
  const last = r.lastChannel ?? null;
  const order = last && usable.includes(last) ? [last, ...usable.filter((c) => c !== last)] : usable;
  const why: NotReceived[] = [];
  for (const c of order) {
    const w = whyNotReceive(r, purpose, c);
    if (w === null) return { channel: c, held: null };
    why.push(w);
  }
  return { channel: null, held: STRICTEST.find((w) => why.includes(w)) ?? why[0] ?? "no_channel" };
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
  o: { channels: readonly string[]; ready: ChannelsReady },
): ReachSplit {
  const out: ReachSplit = { reached: 0, byChannel: { whatsapp: 0, sms: 0, email: 0 }, held: 0, heldBy: {} };
  for (const r of rows) {
    const p = reachFor(r, purpose, o);
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
export function reachSplitWords(s: ReachSplit): string {
  const parts = CONSENT_CHANNELS.filter((c) => s.byChannel[c] > 0).map(
    (c) => `${s.byChannel[c]} ${SPLIT_CHANNEL_WORDS[c]}`,
  );
  const head =
    s.reached === 0
      ? "Reaches nobody"
      : parts.length === 1
        ? `Reaches ${parts[0]}`
        : `Reaches ${s.reached}: ${parts.join(", ")}`;
  return s.held > 0 ? `${head} · ${s.held} can't be reached` : head;
}

/**
 * The most a workspace sends in a calendar month by email and by text from its campaigns: Chanlytics pays for these,
 * so it meters them (the spec's decision 8). WhatsApp is the business's own account and Meta's tier is its limit.
 * Past a channel's allowance the people left on it are held, never moved to another channel. A booking moment's message
 * about a visit is the one exception (`heldByAllowance`).
 */
export const CAMPAIGN_MONTH_ALLOWANCE: Record<Exclude<ConsentChannel, "whatsapp">, number> = {
  email: 2000,
  sms: 500,
};

/** The two channels Chanlytics pays for, and so meters: what a workspace's campaigns have sent on each this month. */
export type MonthSent = Record<Exclude<ConsentChannel, "whatsapp">, number>;

/**
 * Whether the month's allowance may hold the people of a send: a broadcast (no moment, `null`) and every moment but a
 * booking one are held at it; a visit reminder and the after-visit check count toward the month and always go, since
 * holding one loses it (the visit passes before the month does). THE one place that says so: the enrolment, the send and
 * the composers' line before sending all ask it. `trigger` is the playbook moment the send is for.
 *
 * The exemption is for the MESSAGE, not the moment: only a booking moment whose purpose is conversational (a message about
 * their own visit, which is what a reminder is) goes whatever the month holds. A booking moment that sends an offer, which a
 * playbook made before messages were checked against their moments may (playbook-purpose.ts), is an offer like any other and
 * is metered. `purpose` is the run's own: what it enrols by (enrolPurpose), and at the wire the message's (purposeOfTemplate).
 * It is required, so no caller asks about a moment without saying what it sends.
 */
export function heldByAllowance(trigger: string | null, purpose: SendPurpose): boolean {
  const t = trigger ? triggerOf(trigger) : null;
  return !(t?.cls === "booking" && purpose === "conversational");
}

/** How many more of this channel the month holds once `sent` have gone: never below none. */
export function allowanceRoom(channel: keyof MonthSent, sent: number): number {
  return Math.max(0, CAMPAIGN_MONTH_ALLOWANCE[channel] - sent);
}

/**
 * Who of a send's people is past the month's room, in the order given (the first on a channel keep what room it has, the
 * rest are held there, never moved to another channel). Nobody for a booking moment's message about a visit
 * (`heldByAllowance`), and nobody on WhatsApp, which Meta's tier limits, not this. The enrolment holds exactly these.
 */
export function pastAllowance<T extends { channel: ConsentChannel }>(
  people: readonly T[],
  sent: MonthSent,
  trigger: string | null,
  purpose: SendPurpose,
): T[] {
  if (!heldByAllowance(trigger, purpose)) return [];
  const room: MonthSent = { email: allowanceRoom("email", sent.email), sms: allowanceRoom("sms", sent.sms) };
  const past: T[] = [];
  for (const p of people) {
    if (p.channel === "whatsapp") continue;
    if (room[p.channel] > 0) room[p.channel] -= 1;
    else past.push(p);
  }
  return past;
}

/** A count of what a channel sends, in its word: "1 email", "8 emails", "500 texts". */
function sends(channel: keyof MonthSent, n: number): string {
  const one = channel === "email" ? "email" : "text";
  return `${n.toLocaleString("en-US")} ${n === 1 ? one : `${one}s`}`;
}

/** A count of people: "1 person", "12 people". */
const peopleWord = (n: number): string => `${n.toLocaleString("en-US")} ${n === 1 ? "person" : "people"}`;

/**
 * What a composer says before a send goes, when the month cannot carry all of it: how many of the people on each
 * metered channel will be held back for want of room. Null while there is room, for a booking moment's message about a
 * visit (`heldByAllowance`, `trigger`: null for a broadcast, `purpose`: what the send is), and where the month's count
 * could not be read (`sent` null: nothing is said that is not known). `byChannel` is how many the send reaches on each
 * (reachSplit's). "Only 8 emails are left this month: 4 of these people will be held back." / "This month's 500 texts are
 * used up: 12 people will be held back."; both channels short say both.
 */
export function allowanceBeforeSend(
  byChannel: MonthSent,
  sent: MonthSent | null,
  trigger: string | null,
  purpose: SendPurpose,
): string | null {
  if (!sent || !heldByAllowance(trigger, purpose)) return null;
  const lines: string[] = [];
  for (const channel of ["email", "sms"] as const) {
    const room = allowanceRoom(channel, sent[channel]);
    const past = byChannel[channel] - room;
    if (past <= 0) continue;
    lines.push(
      room === 0
        ? `This month's ${sends(channel, CAMPAIGN_MONTH_ALLOWANCE[channel])} are used up: ${peopleWord(past)} will be held back.`
        : `Only ${sends(channel, room)} ${room === 1 ? "is" : "are"} left this month: ${past.toLocaleString("en-US")} of these people will be held back.`,
    );
  }
  return lines.length > 0 ? lines.join(" ") : null;
}

/**
 * The allowance in a line for the Campaigns head, once half of it is used and not before (a quiet page): "1,240 of 2,000
 * emails used this month". Null under half.
 */
export function allowanceLine(channel: keyof MonthSent, used: number): string | null {
  const of = CAMPAIGN_MONTH_ALLOWANCE[channel];
  if (used * 2 < of) return null;
  const noun = channel === "email" ? "emails" : "texts";
  return `${used.toLocaleString("en-US")} of ${of.toLocaleString("en-US")} ${noun} used this month`;
}

/** The Campaigns head's lines for the month, emails first: the ones at half or more of their allowance, none while both are under. */
export function allowanceLines(sent: MonthSent | null): string[] {
  if (!sent) return [];
  return (["email", "sms"] as const).flatMap((channel) => allowanceLine(channel, sent[channel]) ?? []);
}
