/**
 * A mailbox a business connected to write from (decision 0056): its states, its health, its domain's records, and every
 * sentence Connections says about it. Its day (the cold ramp, its owner's cap, the customer domain's ceiling) and the
 * words for a hold are mailbox-standing.ts's, which the reach-out sheet, the bell and the Activity log read without
 * this. Pure; the edge (lib/email/mailbox/) reads the facts and writes the row (00423 mailbox_connections), the
 * dashboard tells the page (server/connections/mailbox-connections.ts).
 */
import type { Tone } from "../shell/tone";
import { MIN_MS, formatterOnUse } from "../shared/time";
import {
  CUSTOMER_DOMAIN_DAILY_MAX,
  MAILBOX_HOLDS,
  MAILBOX_RAMP,
  mailboxDailyCap,
  mailboxHoldFixWords,
  mailboxHoldWords,
  mailboxRampShare,
  type MailboxHold,
} from "./mailbox-standing";

/** "Oct 12": the day a hold began, as the domains' words said theirs. */
const DAY_FMT = formatterOnUse("en-US", { month: "short", day: "numeric" });

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
const MAILBOXES_PER_DOMAIN_MAX = 3;

/** Whether a mailbox sends now: connected, and not resting for its provider's own day. */
export function mailboxSendsNow(m: { state: string; resting_until: string | null }, nowMs: number): boolean {
  return m.state === "connected" && (!m.resting_until || Date.parse(m.resting_until) <= nowMs);
}

/**
 * Whether a reach-out's step writes from this mailbox (00424): one the step names, or any of the workspace's when it
 * names none, while it is not removed. The run's timetable, its replan and the chain's row share this one reading, so
 * a row never names a mailbox the run would not write from. Whether it sends today is the mailbox's day's to say.
 */
export function reachOutWritesFrom(m: { id: string; state: string }, named: readonly string[]): boolean {
  return m.state !== "removed" && (named.length === 0 || named.includes(m.id));
}

/* ------------------------------------------------------------------------------------------------- the page's row */

/** A connected mailbox as the pages are told of it (dashboard server/connections/mailbox-connections.ts). No token. */
export interface MailboxConnectionDto {
  id: string;
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
}

/** The longest SPF text a row keeps, every record of the domain's together: a TXT answer is never longer. */
export const SPF_RECORD_MAX = 4096;
/** How a domain that publishes more than one SPF record is kept: every one, joined by this (none of them holds it). */
export const SPF_RECORDS_JOIN = " | ";

/** A mailbox_connections row, as either app reads it: the page's DTO, never its token's name. */
export function mailboxConnectionDtoOf(
  r: {
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
  },
  day: Partial<Pick<MailboxConnectionDto, "sent_today" | "counts" | "came_in">> | null = null,
): MailboxConnectionDto {
  const dns: Partial<Record<MailboxDnsRecord, DnsRecordState>> = {};
  const raw = r.dns && typeof r.dns === "object" ? (r.dns as Record<string, unknown>) : {};
  for (const k of MAILBOX_DNS_RECORDS) {
    const v = raw[k];
    if (v === "found" || v === "missing") dns[k] = v;
  }
  const spfRecord =
    typeof raw.spf_record === "string" && raw.spf_record.trim() ? raw.spf_record.trim().slice(0, SPF_RECORD_MAX) : null;
  const lookups = Number(raw.spf_lookups);
  return {
    id: r.id,
    provider: r.provider === "microsoft" ? "microsoft" : "google",
    address: r.address,
    host: r.host,
    from_name: r.from_name,
    signature: r.signature,
    state: (MAILBOX_CONNECTION_STATES as readonly string[]).includes(r.state)
      ? (r.state as MailboxConnectionState)
      : "removed",
    held_why: (MAILBOX_HOLDS as readonly string[]).includes(r.held_why ?? "") ? (r.held_why as MailboxHold) : null,
    held_at: r.held_at,
    resting_until: r.resting_until,
    daily_cap: r.daily_cap,
    customer_domain: r.customer_domain,
    sent_days: Math.max(0, Math.floor(Number(r.sent_days) || 0)),
    dns,
    spf_record: spfRecord,
    spf_lookups: Number.isInteger(lookups) && lookups >= 0 ? lookups : null,
    dns_checked_at: r.dns_checked_at,
    last_error: r.last_error,
    connected_at: r.connected_at,
    sent_at: r.sent_at,
    synced_at: r.synced_at,
    sent_today: day?.sent_today ?? null,
    counts: day?.counts ?? null,
    came_in: day?.came_in ?? null,
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
export function mailboxHoldOf(c: MailboxCounts | null): MailboxHold | null {
  if (!c) return null;
  const of = Math.max(c.sent, COUNT_FLOOR);
  if (c.complained > 0) return "complaint";
  if ((c.bounced + c.blocked) * 100 > HOLD_PERCENT * of) return "bounces";
  if (c.unsubscribed * 100 > HOLD_PERCENT * of) return "unsubscribes";
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
export function mailboxHealthWords(c: MailboxCounts | null): string | null {
  if (!c || !c.sent) return null;
  const pct = Math.round((c.bounced / c.sent) * 1000) / 10;
  const parts = [
    `${pct}% bounced`,
    c.blocked ? `${c.blocked} refused by the server` : null,
    c.unsubscribed ? `${c.unsubscribed} unsubscribed` : null,
    c.said_no ? `${c.said_no} said no` : null,
    c.complained ? `${c.complained} marked as spam` : "none marked as spam",
  ];
  return parts.filter(Boolean).join(" · ");
}

/**
 * Where a mailbox stands, as Connections says it: `sentToday` is what it sent in the last day, when read (the row's own
 * reading by default), and its health is its counts since it was counted clean, once it has sent.
 */
export function mailboxWords(
  m: MailboxConnectionDto,
  nowMs: number,
  sentToday: number | null = m.sent_today ?? null,
): MailboxWords {
  const health = mailboxHealthWords(m.counts ?? null);
  const cap = mailboxDailyCap(m);
  const step = MAILBOX_RAMP.find((s) => s.perDay > mailboxRampShare(m.sent_days));
  const left = step ? step.days - m.sent_days : 0;
  const ceiling = m.customer_domain && cap >= CUSTOMER_DOMAIN_DAILY_MAX;
  const ramp = ceiling
    ? `Customer domain: kept to ${CUSTOMER_DOMAIN_DAILY_MAX} a day`
    : `${m.sent_days ? `Day ${m.sent_days + 1} of its ramp` : "New: its ramp starts today"} · ${cap} a day${
        step && cap < m.daily_cap ? `, ${step.perDay} after ${left} more day${left === 1 ? "" : "s"} of sending` : ""
      }`;
  if (m.state === "reconnect")
    return {
      pill: "Reconnect",
      tone: "danger",
      day: `${MAILBOX_PROVIDER_WORDS[m.provider]} signed it out, so nothing leaves from it.`,
      ramp: null,
      health: null,
      fix: "Connect it again: its emails wait for it.",
    };
  if (m.state === "paused")
    return {
      pill: "Paused",
      tone: "plain",
      day: "You paused it: nothing leaves from it.",
      ramp,
      health,
      fix: null,
    };
  if (m.state === "held") {
    const since = m.held_at ? DAY_FMT.format(new Date(m.held_at)) : null;
    return {
      pill: "Held",
      tone: "warn",
      day: `${since ? `Held since ${since}` : "Held"}: ${mailboxHoldWords(m.held_why)}.`,
      ramp: null,
      health,
      fix: mailboxHoldFixWords(m.held_why),
    };
  }
  if (m.state === "removed")
    return { pill: "Removed", tone: "plain", day: "Removed.", ramp: null, health: null, fix: null };
  if (m.resting_until && Date.parse(m.resting_until) > nowMs)
    return {
      pill: "Done for today",
      tone: "warn",
      day: `${MAILBOX_PROVIDER_WORDS[m.provider]}'s own daily limit: it sends again from ${clockOf(m.resting_until)}.`,
      ramp,
      health,
      fix: null,
    };
  const named = MAILBOX_DNS_RECORDS.filter((k) => k !== "mx");
  const missing = named.filter((k) => m.dns[k] === "missing");
  // An SPF record the domain has already is changed, never added beside: a second one breaks both (RFC 7208 3.2).
  const add = missing.filter((k) => !(k === "spf" && m.spf_record));
  const change = missing.includes("spf") && !!m.spf_record;
  const unread = named.some((k) => !m.dns[k]);
  const fix =
    [
      add.length ? `Add its ${add.map((k) => k.toUpperCase()).join(" and ")} record below.` : null,
      change ? "Change its SPF record below." : null,
      !missing.length && unread ? "Its records couldn't be read just now: Check reads them again." : null,
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

const CLOCK_FMT = formatterOnUse("en-US", { weekday: "short", hour: "numeric", minute: "2-digit" });
const clockOf = (iso: string): string => CLOCK_FMT.format(new Date(iso));
const TIME_FMT = formatterOnUse("en-US", { hour: "numeric", minute: "2-digit" });

/** Past this, a read is late (the sweep's own health wants one every 20 minutes, 00423), and the row says since when. */
const MAILBOX_READ_LATE_MS = 20 * MIN_MS;

/**
 * What a mailbox's row says on Connections: what came in through it, not what it sends (its day, its ramp and its health
 * are its Sending lines, mailboxSendingLines). Its pill is the mailbox's: Connected while it reads, whatever its day.
 */
export interface MailboxRowWords {
  pill: string;
  tone: Tone;
  /** "Read at 9:47 AM · 3 people wrote today": null where nothing is read from it (signed out). */
  cameIn: string | null;
  /** Why it is not doing all it does (signed out, its sending paused or held), or null. */
  standing: string | null;
  /** What to do, when there is something: reconnect, resume, a record to add. */
  fix: string | null;
}

/** "Read at 9:47 AM", or, past a late read, "Not read since Mon 9:47 PM"; "Not read yet" before the first. */
function mailboxReadWords(syncedAt: string | null, nowMs: number): string {
  if (!syncedAt) return "Not read yet";
  return nowMs - Date.parse(syncedAt) > MAILBOX_READ_LATE_MS
    ? `Not read since ${clockOf(syncedAt)}`
    : `Read at ${TIME_FMT.format(new Date(syncedAt))}`;
}

/** "3 people wrote today": the people whose email came in through it in the last day, as its `day` counts its sends. */
function mailboxWroteWords(people: number): string {
  if (people === 0) return "No one wrote today";
  return `${people} ${people === 1 ? "person" : "people"} wrote today`;
}

/** What a mailbox's row says (MailboxRowWords): its mail read, who wrote, and what keeps it from sending. */
export function mailboxRowWords(m: MailboxConnectionDto, nowMs: number): MailboxRowWords {
  const w = mailboxWords(m, nowMs);
  if (m.state === "reconnect" || m.state === "removed")
    return {
      pill: w.pill,
      tone: w.tone,
      cameIn: null,
      standing:
        m.state === "removed"
          ? w.day
          : `${MAILBOX_PROVIDER_WORDS[m.provider]} signed it out: nothing is read from it or sent until it's connected again.`,
      fix: w.fix,
    };
  const cameIn = [mailboxReadWords(m.synced_at ?? null, nowMs), m.came_in == null ? null : mailboxWroteWords(m.came_in)]
    .filter(Boolean)
    .join(" · ");
  if (m.state === "paused")
    return {
      pill: w.pill,
      tone: w.tone,
      cameIn,
      standing: "You paused its sending: what people write still comes in.",
      fix: null,
    };
  if (m.state === "held") {
    const since = m.held_at ? DAY_FMT.format(new Date(m.held_at)) : null;
    return {
      pill: w.pill,
      tone: w.tone,
      cameIn,
      standing: `Its sending is held${since ? ` since ${since}` : ""}: ${mailboxHoldWords(m.held_why)}.`,
      fix: w.fix,
    };
  }
  return { pill: "Connected", tone: "ok", cameIn, standing: null, fix: w.fix };
}

/**
 * What its sending stands at, a line each, under the row when asked for: its day (while it sends), its ramp, its
 * health, the customer domain's ceiling, and the ramp's rule. A paused or held mailbox's row says why already.
 */
export function mailboxSendingLines(m: MailboxConnectionDto, nowMs: number): string[] {
  const w = mailboxWords(m, nowMs);
  const top = Math.max(...MAILBOX_RAMP.map((s) => s.perDay));
  return [
    m.state === "connected" ? w.day : null,
    w.ramp,
    w.health,
    m.customer_domain && m.state === "connected" ? customerDomainWords(m.host) : null,
    `A new mailbox starts at ${MAILBOX_RAMP[0].perDay} a day and grows with the days it sends, to ${top}.`,
  ].filter((line): line is string => !!line);
}

/** What the page may do with a mailbox, from its state (the edge's doors hold the same rules). */
export function mailboxActs(m: Pick<MailboxConnectionDto, "state">): {
  reconnect: boolean;
  resume: boolean;
  pause: boolean;
  unpause: boolean;
  test: boolean;
  remove: boolean;
} {
  return {
    reconnect: m.state === "reconnect",
    resume: m.state === "held",
    pause: m.state === "connected",
    unpause: m.state === "paused",
    test: m.state === "connected" || m.state === "paused",
    remove: m.state !== "removed",
  };
}

/* ---------------------------------------------------------------------------------------------- the records */

/** Whether DNS has a record: found, missing, or not read (DNS did not answer: never taken for missing). */
type MailboxRecordState = "found" | "missing" | "unread";

/** One record as Connections shows it: what it is for, where it goes, what to put in it, and whether DNS has it. */
export interface MailboxRecordRow {
  key: MailboxDnsRecord;
  kind: string;
  type: string;
  /** "@" for the domain itself, "_dmarc", or the selector's name. */
  name: string;
  /** What to publish, or where the provider makes it when it is the provider's to make. */
  value: string;
  found: boolean;
  state: MailboxRecordState;
  /** What to do with the value when it is not simply added: a record the domain has already, changed. */
  note: string | null;
}

/** What we recommend when a domain has no DMARC: accepted by Gmail, Yahoo and Outlook, and harmless to other mail. */
export const DMARC_RECOMMENDED = "v=DMARC1; p=none;";

/**
 * Each provider's SPF include. A new record ends in ~all for both: -all (Microsoft's own advice) would fail every other
 * sender the business uses that the record does not name yet (its website's forms, its newsletter, its booking tool).
 */
const SPF_INCLUDE: Record<MailboxProvider, string> = {
  google: "include:_spf.google.com",
  microsoft: "include:spf.protection.outlook.com",
};
/** SPF's ceiling on the DNS lookups one check may spend (RFC 7208 4.6.4): past it, the record fails. */
export const SPF_LOOKUPS_MAX = 10;

const spfAll = (t: string): boolean => /^[+\-~?]?all$/i.test(t);

/**
 * The SPF record a mailbox's domain should publish: the one it has, with the provider's include put in before its
 * `all` (or its redirect), every sender it names kept and its own all left as it was; with two or more (none counts),
 * one record naming every sender they name, ending ~all; or, with none, a new one. Pure.
 */
function spfRecordWith(existing: string | null, provider: MailboxProvider): string {
  const include = SPF_INCLUDE[provider];
  const records = (existing ?? "")
    .split(SPF_RECORDS_JOIN)
    .map((r) => r.trim().split(/\s+/).filter(Boolean))
    .filter((terms) => /^v=spf1$/i.test(terms[0] ?? ""));
  const has = (terms: string[]) => terms.some((t) => t.replace(/^\+/, "").toLowerCase() === include);
  if (records.length > 1) {
    const named = [
      ...new Set(records.flatMap((terms) => terms.slice(1)).filter((t) => !spfAll(t) && !/^redirect=/i.test(t))),
    ];
    return ["v=spf1", ...named, ...(has(named) ? [] : [include]), "~all"].join(" ");
  }
  const terms = records[0];
  if (!terms) return `v=spf1 ${include} ~all`;
  if (has(terms)) return terms.join(" ");
  const at = terms.findIndex((t, i) => i > 0 && (spfAll(t) || /^redirect=/i.test(t)));
  if (at < 0) return [...terms, include].join(" ");
  return [...terms.slice(0, at), include, ...terms.slice(at)].join(" ");
}
const DKIM_WHERE: Record<MailboxProvider, { name: string; value: string }> = {
  google: {
    name: "google._domainkey",
    value: "Made in the Google Admin console: Apps › Google Workspace › Gmail › Authenticate email",
  },
  microsoft: {
    name: "selector1._domainkey",
    value: "Turned on in Microsoft Defender: Email authentication settings › DKIM",
  },
};

/** The words for SPF when the domain already has a record: change it (never add one beside it), and what it costs. */
function spfNote(m: Pick<MailboxConnectionDto, "provider" | "spf_record" | "spf_lookups">): string | null {
  if (!m.spf_record) return null;
  const who = MAILBOX_PROVIDER_WORDS[m.provider];
  const many = m.spf_record.split(SPF_RECORDS_JOIN).length;
  const change =
    many > 1
      ? `Your domain has ${many} SPF records, and with more than one none of them counts: replace them all with this one, which keeps every sender they name and adds ${who}.`
      : `Your domain has an SPF record already, and it may have only one: change it to this, which keeps every sender it names and adds ${who}.`;
  // The edge counted the record with the provider's include in it, the include's own lookups and all.
  const after = m.spf_lookups === null || many > 1 ? null : m.spf_lookups;
  return after !== null && after > SPF_LOOKUPS_MAX
    ? `${change} It would then spend ${after} of SPF's ${SPF_LOOKUPS_MAX} lookups and fail: ask whoever manages your DNS to shorten it first.`
    : change;
}

/** The records a mailbox's domain needs, as rows: SPF, DKIM, DMARC, each with whether DNS reads it now. */
export function mailboxRecordRows(
  m: Pick<MailboxConnectionDto, "provider" | "dns"> & Partial<Pick<MailboxConnectionDto, "spf_record" | "spf_lookups">>,
): MailboxRecordRow[] {
  const stateOf = (k: MailboxDnsRecord): MailboxRecordState => m.dns[k] ?? "unread";
  const spf = { provider: m.provider, spf_record: m.spf_record ?? null, spf_lookups: m.spf_lookups ?? null };
  const row = (
    key: MailboxDnsRecord,
    r: Omit<MailboxRecordRow, "key" | "found" | "state" | "note">,
    note: string | null,
  ) => ({
    key,
    ...r,
    found: stateOf(key) === "found",
    state: stateOf(key),
    note: stateOf(key) === "found" ? null : note,
  });
  return [
    row(
      "spf",
      { kind: "Sender (SPF)", type: "TXT", name: "@", value: spfRecordWith(spf.spf_record, m.provider) },
      spfNote(spf),
    ),
    row(
      "dkim",
      {
        kind: "Signing (DKIM)",
        type: m.provider === "microsoft" ? "CNAME" : "TXT",
        name: DKIM_WHERE[m.provider].name,
        value: DKIM_WHERE[m.provider].value,
      },
      null,
    ),
    row("dmarc", { kind: "Policy (DMARC)", type: "TXT", name: "_dmarc", value: DMARC_RECOMMENDED }, null),
  ];
}

/* ------------------------------------------------------------------------------------- connecting, in words */

/** Why a connect did not finish, by the code the edge answers with, as the owner reads it once back from the provider. */
const CONNECT_FAILED = "That didn't go through. Try again in a minute.";
export const MAILBOX_CONNECT_WORDS: Record<string, string> = {
  connected: "Connected: email from people comes into your Inbox, and its last six months are on their way.",
  reconnected: "Connected again: its emails go on where they waited.",
  declined: "Nothing was connected: the sign-in was cancelled.",
  scopes_missing: "Nothing was connected: send and read access are both needed. Connect again and leave both ticked.",
  no_refresh_token: "Nothing was connected: the provider gave no lasting access. Connect again.",
  taken: "Another workspace writes from this mailbox. Remove it there first.",
  too_many: `A workspace writes from ${MAILBOX_CONNECTIONS_MAX} mailboxes at most. Remove one to add another.`,
  too_many_on_domain: `A workspace writes from ${MAILBOXES_PER_DOMAIN_MAX} mailboxes on one domain at most.`,
  free_mail:
    "A free mailbox (Gmail.com, Outlook.com and the like) isn't for writing to businesses: connect one on your own domain.",
  not_available: "Connecting a mailbox isn't switched on here yet.",
  // The page's own gate says the same (contracts roleGate on `settings`), and so does the door's refusal.
  not_owner: "Only an owner can connect a mailbox.",
  no_address: "Nothing was connected: the provider didn't say which address the account sends from. Connect again.",
  unverified:
    "Nothing was connected: Google hasn't verified that account's address yet. Verify it, then connect again.",
  not_workspace:
    "Nothing was connected: that Google account isn't a Google Workspace mailbox. Connect the one your business writes from.",
  no_mailbox:
    "Nothing was connected: that account has no mailbox to send from (Gmail or Exchange isn't switched on for it). Ask whoever runs your email to switch it on.",
  wrong_account: "Nothing was connected: that's a different account. Sign in as the mailbox you're reconnecting.",
  admin_consent:
    "Your organisation's Microsoft 365 admin approves Chanlytics once. Copy the link for them, then connect again when they have.",
  admin_approved: "Approved for your organisation. Connect the mailbox now.",
  failed: CONNECT_FAILED,
};

/** The outcomes that are good news, said in the note's calm tone. */
const CONNECT_OK = new Set(["connected", "reconnected", "admin_approved"]);

/** Whether the word a connect came back with is good news. */
export function mailboxConnectOk(code: string | null | undefined): boolean {
  return !!code && CONNECT_OK.has(code);
}

export function mailboxConnectWords(code: string | null | undefined): string {
  return (code && MAILBOX_CONNECT_WORDS[code]) || CONNECT_FAILED;
}

/** The foot of the mailboxes block: what a mailbox does, before the first; then where its mail goes (its ramp is its Sending lines'). */
export function mailboxesFootWords(count: number): string {
  if (count >= MAILBOX_CONNECTIONS_MAX) return `${MAILBOX_CONNECTIONS_MAX} is the most. Remove one to add another.`;
  if (count === 0)
    return `Email people write to your mailbox comes into your Inbox, and sequences to leads write from it through Google or Microsoft, so every email is yours and every reply comes back to it. A mailbox on the domain your customers write to sends ${CUSTOMER_DOMAIN_DAILY_MAX} a day at most to leads; for more, use a second domain such as get<yourbusiness>.com.`;
  return "Email people write to it comes into your Inbox; sequences to leads write from it, and their replies come back here.";
}

/** The note shown once a mailbox on the customer domain is connected. */
export function customerDomainWords(host: string): string {
  return `Your customers write to ${host}, so this mailbox sends ${CUSTOMER_DOMAIN_DAILY_MAX} a day at most to keep their mail and bookings safe. For more, connect a mailbox on a second domain, such as get${host}.`;
}
