/**
 * The month's allowance of a workspace's campaigns by email and by text (the campaigns-on-every-channel spec, decision 8;
 * split out of reach-for.ts, which holds which channel carries a message and the pick of one for each person): what a
 * month holds, who of a send is past it, and what a composer and the Campaigns head say of it. Pure.
 */
import type { SendPurpose } from "../../consent/consent";
import { dayInZone } from "../../shared/zone/math";
import { wallClockAt } from "../../shared/clock";
import type { ConsentChannel } from "../../consent/channels";
import { triggerOf } from "../playbooks/triggers/notices";

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
 * playbook made before messages were checked against their moments may (playbooks/purpose.ts), is an offer like any other and
 * is metered. `purpose` is the run's own: what it enrols by (enrolPurpose), and at the wire the message's (purposeOfTemplate).
 * It is required, so no caller asks about a moment without saying what it sends.
 */
export function heldByAllowance(trigger: string | null, purpose: SendPurpose): boolean {
  const t = trigger ? triggerOf(trigger) : null;
  return !(t?.cls === "booking" && purpose === "conversational");
}

/**
 * The first instant of the calendar month after the one `atMs` falls in, by the workspace's clock: where one month's
 * allowance ends and the next begins, which the database counts a month by (campaign_month_sent, 00301). Epoch ms.
 */
export function nextMonthStart(tz: string, atMs: number): number {
  const { y, m } = dayInZone(tz, atMs);
  const [year, month] = m === 12 ? [y + 1, 1] : [y, m + 1];
  return wallClockAt(tz, `${year}-${String(month).padStart(2, "0")}-01`, 0, 0);
}

/** What a composer's read carries of the month: this month's count, and the next month's with the instant it begins. */
export interface MonthSentRead {
  /** What the workspace's campaigns have sent this calendar month; null where it could not be counted. */
  month_sent?: MonthSent | null;
  /**
   * The month after it, for a send scheduled past the month's end (a broadcast may be set up to thirty days ahead): where
   * it begins (`from`, epoch ms, nextMonthStart) and what has been sent in it (`sent`, null where it could not be counted).
   * Absent on a read from before it was carried: every send is then judged by this month's.
   */
  month_sent_next?: { from: number; sent: MonthSent | null } | null;
}

/**
 * The month's count a send is judged by, at the moment it is set to go: a send that goes in a later month counts against
 * THAT month, as the enrolment counts it (core campaigns/allowance.ts listPastTheMonth, at the run's opening moment), so the
 * composer says "held back" for room that is the new month's and not the old month's, and says nothing for a month it has no
 * count of (null: nothing is said that is not known).
 */
export function monthSentAt(read: MonthSentRead, at: number): MonthSent | null {
  const next = read.month_sent_next;
  if (next && at >= next.from) return next.sent;
  return read.month_sent ?? null;
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
