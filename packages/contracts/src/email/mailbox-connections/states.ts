/** Mailbox connections: states. */

import type { Tone } from "../../shell/tone";
import { clockDate, clockNearWhen } from "../../shared/clock";
import type { MailboxHistory } from "../mailbox-connect";
import {
  CUSTOMER_DOMAIN_DAILY_MAX,
  MAILBOX_HOLDS,
  MAILBOX_RAMP,
  mailboxDailyCap,
  mailboxHoldFixWords,
  mailboxHoldWords,
  mailboxRampShare,
  type MailboxHold,
} from "../mailbox-standing";
import { isOneOf } from "../../shared/unknown";

/* ------------------------------------------------------------------------------------------------ the closed sets */

/** Whose mailbox it is (00423 mailbox_connections.provider). */
export const MAILBOX_PROVIDERS = ["google", "microsoft"] as const;

export type MailboxProvider = (typeof MAILBOX_PROVIDERS)[number];

/** Where a connected mailbox stands (00423 mailbox_connections.state): its column comment says each. */
export const MAILBOX_CONNECTION_STATES = ["connected", "reconnect", "paused", "held", "removed"] as const;

export type MailboxConnectionState = (typeof MAILBOX_CONNECTION_STATES)[number];

/** What DNS can say of one of a domain's records. A record DNS could not be read for is left out: never "missing". */
export type DnsRecordState = "found" | "missing";

/** The records a mailbox's domain is read for (the mailboxes clock, daily). */
const MAILBOX_DNS_RECORDS = ["spf", "dkim", "dmarc", "mx"] as const;

export type MailboxDnsRecord = (typeof MAILBOX_DNS_RECORDS)[number];

/* --------------------------------------------------------------------------------------------------- the limits */

/** The most live mailboxes a workspace writes from, and on one domain (00423's trigger says them too). */
export const MAILBOX_CONNECTIONS_MAX = 10;

export const MAILBOXES_PER_DOMAIN_MAX = 3;

/** Whether a mailbox sends now: connected, and not resting for its provider's own day. */
export function mailboxSendsNow(message: { state: string; resting_until: string | null }, nowMs: number): boolean {
  return message.state === "connected" && (!message.resting_until || Date.parse(message.resting_until) <= nowMs);
}

/** A mailbox still on the workspace, in whatever state: every one but one its owner removed. */
export const mailboxIsLive = (mailbox: { state: string }): boolean => mailbox.state !== "removed";

/**
 * Whether a reach-out's step writes from this mailbox (00424): one the step names, or any of the workspace's when it
 * names none, while it is not removed. The run's timetable, its replan and the chain's row share this one reading, so
 * a row never names a mailbox the run would not write from. Whether it sends today is the mailbox's day's to say.
 */
export function reachOutWritesFrom(message: { id: string; state: string }, named: readonly string[]): boolean {
  return mailboxIsLive(message) && (named.length === 0 || named.includes(message.id));
}

/* ------------------------------------------------------------------------------------------------- the page's row */

/** A connected mailbox as the pages are told of it (dashboard server/connections/mailbox-connections.ts). No token. */
export interface MailboxConnectionDto {
  id: string;
  history: MailboxHistory;
  provider: MailboxProvider;
  address: string;
  host: string;
  from_name: string;
  signature: string | null;
  state: MailboxConnectionState;
  held_why: MailboxHold | null;
  held_at: string | null;
  /** Its provider's own day used up: it sends again from then. */
  resting_until: string | null;
  daily_cap: number;
  customer_domain: boolean;
  /** The days it has sent on since it was clean (D15), as the clock last read them. */
  sent_days: number;
  dns: Partial<Record<MailboxDnsRecord, DnsRecordState>>;
  /** The SPF record its domain already publishes, as DNS read it; null when it has none or DNS was not read. */
  spf_record: string | null;
  /**
   * The DNS lookups of SPF's ten (RFC 7208 4.6.4) that record spends with the provider in it, counted through its
   * includes and the provider's own; null when they could not all be read.
   */
  spf_lookups: number | null;
  dns_checked_at: string | null;
  last_error: string | null;
  connected_at: string;
  sent_at: string | null;
  /** When its mail was last read (the mailboxes sweep, every five minutes, or a push); null before the first read. */
  synced_at: string | null;
  /** What it sent in the last day (mailbox_capacity), when the page's read could ask; null otherwise. */
  sent_today: number | null;
  /** What its emails came to since it was counted clean (mailbox_connection_counts), when read; null otherwise. */
  counts: MailboxCounts | null;
  /** The people whose email came in through it in the last day, when the page's read could ask; null otherwise. */
  came_in: number | null;
  /** What it signs its emails with (00487, mailboxSignsOf). */
  signs: MailboxSigns;
}

/**
 * Where a mailbox's signature comes from (00487, the email canvas's lane B): none, where its owner turned it off; their
 * own words, written in Settings; the signature they keep in Gmail; else the name it sends as, so an email never ends on
 * "Talk soon," and nothing under it.
 */
export type MailboxSignsFrom = "none" | "own" | "gmail" | "name";

/** What a mailbox signs with, as words (never markup: Gmail's HTML is sent, and drawn only as words), and when Gmail's was read. */
export interface MailboxSigns {
  from: MailboxSignsFrom;
  /** The signature as words; null where it signs with none. */
  words: string | null;
  /** When its Gmail signature was last read; null before the first read. */
  gmail_read_at: string | null;
  /** Gmail's signature as words, whatever it signs with now (Settings shows it beside the choice); null with none. */
  gmail: string | null;
}

/**
 * What a mailbox signs with, from its row and Gmail's signature as words (`gmailWords`: channels reads the HTML, which
 * this package cannot). The one rule: the edge sends by it, and Settings and Need you say it.
 */
export function mailboxSignsOf(
  row: { signature: string | null; signature_off?: boolean; from_name: string; gmail_signature_at?: string | null },
  gmailWords: string | null,
): MailboxSigns {
  const gmail_read_at = row.gmail_signature_at ?? null;
  const gmail = gmailWords?.trim() || null;
  if (row.signature_off === true) return { from: "none", words: null, gmail_read_at, gmail };
  const own = row.signature?.trim();
  if (own) return { from: "own", words: own, gmail_read_at, gmail };
  if (gmail) return { from: "gmail", words: gmail, gmail_read_at, gmail };
  return { from: "name", words: row.from_name.trim() || null, gmail_read_at, gmail };
}

/** The longest SPF text a row keeps, every record of the domain's together: a TXT answer is never longer. */
export const SPF_RECORD_MAX = 4096;

/** How a domain that publishes more than one SPF record is kept: every one, joined by this (none of them holds it). */
export const SPF_RECORDS_JOIN = " | ";

/** A mailbox_connections row, as either app reads it: the page's DTO, never its token's name. */
export function mailboxConnectionDtoOf(
  row: {
    id: string;
    provider: string;
    address: string;
    host: string;
    from_name: string;
    signature: string | null;
    state: string;
    held_why: string | null;
    held_at: string | null;
    resting_until: string | null;
    daily_cap: number;
    customer_domain: boolean;
    sent_days: number | null;
    dns: unknown;
    dns_checked_at: string | null;
    last_error: string | null;
    connected_at: string;
    sent_at: string | null;
    synced_at: string | null;
    signature_off?: boolean;
    gmail_signature_at?: string | null;
    history?: string | null; // absent where a read predates 00499: the six months, as every mailbox brought before it
  },
  day: Partial<Pick<MailboxConnectionDto, "sent_today" | "counts" | "came_in">> | null = null,
  /** Its Gmail signature as words (channels gmailSignatureWords); null where it has none or was not read. */
  gmailWords: string | null = null,
): MailboxConnectionDto {
  const dns: Partial<Record<MailboxDnsRecord, DnsRecordState>> = {};
  const raw = row.dns && typeof row.dns === "object" ? (row.dns as Record<string, unknown>) : {};
  for (const k of MAILBOX_DNS_RECORDS) {
    const v = raw[k];
    if (v === "found" || v === "missing") dns[k] = v;
  }
  const spfRecord =
    typeof raw.spf_record === "string" && raw.spf_record.trim() ? raw.spf_record.trim().slice(0, SPF_RECORD_MAX) : null;
  const lookups = Number(raw.spf_lookups);
  return {
    id: row.id,
    history: row.history === "from_now" ? "from_now" : "six_months",
    provider: row.provider === "microsoft" ? "microsoft" : "google",
    address: row.address,
    host: row.host,
    from_name: row.from_name,
    signature: row.signature,
    state: isOneOf(MAILBOX_CONNECTION_STATES, row.state) ? row.state : "removed",
    held_why: isOneOf(MAILBOX_HOLDS, row.held_why) ? row.held_why : null,
    held_at: row.held_at,
    resting_until: row.resting_until,
    daily_cap: row.daily_cap,
    customer_domain: row.customer_domain,
    sent_days: Math.max(0, Math.floor(Number(row.sent_days) || 0)),
    dns,
    spf_record: spfRecord,
    spf_lookups: Number.isInteger(lookups) && lookups >= 0 ? lookups : null,
    dns_checked_at: row.dns_checked_at,
    last_error: row.last_error,
    connected_at: row.connected_at,
    sent_at: row.sent_at,
    synced_at: row.synced_at,
    sent_today: day?.sent_today ?? null,
    counts: day?.counts ?? null,
    came_in: day?.came_in ?? null,
    signs: mailboxSignsOf(row, gmailWords),
  };
}

/* ------------------------------------------------------------------------------------------------- its health */

/** What one mailbox's emails came to since it was counted clean (00424 mailbox_connection_counts, 00466). */
export interface MailboxCounts {
  sent: number;
  /** Hard bounces: an address that is not one to write to. */
  bounced: number;
  /** A receiving server refused the sender (spam, reputation, SPF, DKIM, DMARC, policy): the mailbox's own standing. */
  blocked: number;
  complained: number;
  unsubscribed: number;
  /** Who replied no and unsubscribed from none of its emails: told, never held on (a reply helps its standing). */
  said_no: number;
}

/** Below this many sent, the share is taken of this many: five bounces in a mailbox's first emails hold it. */
const COUNT_FLOOR = 150;

/** The share past which a mailbox holds itself: 3% of what it sent (decision 0056, 8). */
const HOLD_PERCENT = 3;

/**
 * The hold a mailbox's own mail earns it, or null (decision 0056, 8): any complaint, else hard bounces and servers'
 * refusals of the sender past 3% of what it sent (of 150 at least, so five unlucky bounces in its first emails hold it
 * and one does not), else the people who unsubscribed by the same measure. A reply that says no is never a hold: it is
 * a reply, and replies help a mailbox's standing. Postmaster Tools reports no reputation any more, so this, from our own
 * rows, is what a mailbox answers for.
 */
export function mailboxHoldOf(mailboxCounts: MailboxCounts | null): MailboxHold | null {
  if (!mailboxCounts) return null;
  const of = Math.max(mailboxCounts.sent, COUNT_FLOOR);
  if (mailboxCounts.complained > 0) return "complaint";
  if ((mailboxCounts.bounced + mailboxCounts.blocked) * 100 > HOLD_PERCENT * of) return "bounces";
  if (mailboxCounts.unsubscribed * 100 > HOLD_PERCENT * of) return "unsubscribes";
  return null;
}

/* ------------------------------------------------------------------------------------------------- the words */

export const MAILBOX_PROVIDER_WORDS: Record<MailboxProvider, string> = { google: "Google", microsoft: "Microsoft" };

export interface MailboxWords {
  pill: string;
  tone: Tone;
  /** "12 of 30 today": its day, or why it is not sending. */
  day: string;
  /** "Day 9 of its ramp · 20 a day, 30 after 5 more days of sending": where it stands on the ramp; null off it. */
  ramp: string | null;
  /** "0.4% bounced · 1 said no", once it has sent; null before. */
  health: string | null;
  /** What to do, when there is something: reconnect, resume, a record to add. */
  fix: string | null;
}

/** "0.4% bounced · 1 refused it · 2 unsubscribed · 1 said no · none marked as spam", once it has sent. */
export function mailboxHealthWords(mailboxCounts: MailboxCounts | null): string | null {
  if (!mailboxCounts || !mailboxCounts.sent) return null;
  const pct = Math.round((mailboxCounts.bounced / mailboxCounts.sent) * 1000) / 10;
  const parts = [
    `${pct}% bounced`,
    mailboxCounts.blocked ? `${mailboxCounts.blocked} refused by the server` : null,
    mailboxCounts.unsubscribed ? `${mailboxCounts.unsubscribed} unsubscribed` : null,
    mailboxCounts.said_no ? `${mailboxCounts.said_no} said no` : null,
    mailboxCounts.complained ? `${mailboxCounts.complained} marked as spam` : "none marked as spam",
  ];
  return parts.filter(Boolean).join(" · ");
}

/**
 * Where a mailbox stands, as Connections says it: `sentToday` is what it sent in the last day, when read (the row's own
 * reading by default), and its health is its counts since it was counted clean, once it has sent. A day or a time it
 * says is the workspace's, `tz` (contracts clock.ts): a hold from noon UTC on Oct 1 began on Oct 2 in Auckland.
 */
export function mailboxWords(
  mailboxConnection: MailboxConnectionDto,
  nowMs: number,
  tz: string,
  sentToday: number | null = mailboxConnection.sent_today ?? null,
): MailboxWords {
  const health = mailboxHealthWords(mailboxConnection.counts ?? null);
  const cap = mailboxDailyCap(mailboxConnection);
  const step = MAILBOX_RAMP.find((s) => s.perDay > mailboxRampShare(mailboxConnection.sent_days));
  const left = step ? step.days - mailboxConnection.sent_days : 0;
  const ceiling = mailboxConnection.customer_domain && cap >= CUSTOMER_DOMAIN_DAILY_MAX;
  const ramp = ceiling
    ? `Customer domain: kept to ${CUSTOMER_DOMAIN_DAILY_MAX} a day`
    : `${mailboxConnection.sent_days ? `Day ${mailboxConnection.sent_days + 1} of its ramp` : "New: its ramp starts today"} · ${cap} a day${
        step && cap < mailboxConnection.daily_cap
          ? `, ${step.perDay} after ${left} more day${left === 1 ? "" : "s"} of sending`
          : ""
      }`;
  if (mailboxConnection.state === "reconnect")
    return {
      pill: "Reconnect",
      tone: "danger",
      day: `${MAILBOX_PROVIDER_WORDS[mailboxConnection.provider]} signed it out, so nothing leaves from it.`,
      ramp: null,
      health: null,
      fix: "Connect it again: its emails wait for it.",
    };
  if (mailboxConnection.state === "paused")
    return {
      pill: "Paused",
      tone: "plain",
      day: "You paused it: nothing leaves from it.",
      ramp,
      health,
      fix: null,
    };
  if (mailboxConnection.state === "held") {
    const since = heldSince(mailboxConnection, tz, nowMs);
    return {
      pill: "Held",
      tone: "warn",
      day: `${since ? `Held since ${since}` : "Held"}: ${mailboxHoldWords(mailboxConnection.held_why)}.`,
      ramp: null,
      health,
      fix: mailboxHoldFixWords(mailboxConnection.held_why),
    };
  }
  if (mailboxConnection.state === "removed")
    return { pill: "Removed", tone: "plain", day: "Removed.", ramp: null, health: null, fix: null };
  if (mailboxConnection.resting_until && Date.parse(mailboxConnection.resting_until) > nowMs)
    return {
      pill: "Done for today",
      tone: "warn",
      day: `${MAILBOX_PROVIDER_WORDS[mailboxConnection.provider]}'s own daily limit: it sends again from ${clockNearWhen(Date.parse(mailboxConnection.resting_until), tz, nowMs)}.`,
      ramp,
      health,
      fix: null,
    };
  const named = MAILBOX_DNS_RECORDS.filter((k) => k !== "mx");
  const missing = named.filter((k) => mailboxConnection.dns[k] === "missing");
  // An SPF record the domain has already is changed, never added beside: a second one breaks both (RFC 7208 3.2).
  const add = missing.filter((k) => !(k === "spf" && mailboxConnection.spf_record));
  const change = missing.includes("spf") && !!mailboxConnection.spf_record;
  const unread = named.some((k) => !mailboxConnection.dns[k]);
  const fix =
    [
      add.length ? `Add its ${add.map((k) => k.toUpperCase()).join(" and ")} record in Set up DNS.` : null,
      change ? "Change its SPF record in Set up DNS." : null,
      !missing.length && unread ? "Its records couldn't be read just now: Set up DNS checks them again." : null,
    ]
      .filter(Boolean)
      .join(" ") || null;
  return {
    pill: sentToday !== null && sentToday >= cap ? "Done for today" : "Connected",
    tone: sentToday !== null && sentToday >= cap ? "warn" : "ok",
    day: sentToday === null ? `Up to ${cap} a day` : `${sentToday} of ${cap} today`,
    ramp,
    health,
    fix,
  };
}

/** "Oct 12": the day a hold began, by the workspace's calendar, or nothing when it has no moment. */
export function heldSince(m: Pick<MailboxConnectionDto, "held_at">, tz: string, nowMs: number): string | null {
  const at = m.held_at ? Date.parse(m.held_at) : NaN;
  return Number.isFinite(at) ? clockDate(at, tz, nowMs) : null;
}
