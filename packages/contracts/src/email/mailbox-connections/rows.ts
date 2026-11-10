/** Mailbox connections: rows. */

import type { Tone } from "../../shell/tone";
import { clockNearWhen, clockTime } from "../../shared/clock";
import { MIN_MS } from "../../shared/time";
import { CUSTOMER_DOMAIN_DAILY_MAX, MAILBOX_RAMP, mailboxHoldWords } from "../mailbox-standing";
import {
  MAILBOX_CONNECTIONS_MAX,
  MAILBOX_PROVIDER_WORDS,
  SPF_RECORDS_JOIN,
  heldSince,
  mailboxIsLive,
  mailboxWords,
  type MailboxConnectionDto,
  type MailboxDnsRecord,
  type MailboxProvider,
} from "./states";

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

/** What its owner chooses it signs with, in Settings (00487): Gmail's (a Microsoft mailbox's name), their own words, or none. */
export type MailboxSignsChoice = "gmail" | "own" | "none";

/** The choice a mailbox stands on: none where it is off, their own where they wrote one, else Gmail's (or its name). */
export const mailboxSignsChoiceOf = (mailboxConnection: Pick<MailboxConnectionDto, "signs">): MailboxSignsChoice =>
  mailboxConnection.signs.from === "none" ? "none" : mailboxConnection.signs.from === "own" ? "own" : "gmail";

/** What Settings says of what a mailbox signs with, by choice (MailboxSettings in Connections). */
export const MAILBOX_SIGNATURE_WORDS = {
  label: "It signs its emails with",
  gmail: "From Gmail",
  name: "Its name",
  own: "Write one",
  none: "None",
  ownLabel: "Its signature",
  ownHint: "Under every email it sends.",
  ownEmpty: "Write the signature, or choose another.",
  none_says: "Nothing goes under its emails, not even its name.",
} as const;

/**
 * What the Gmail choice says it signs with: Gmail's signature as words, or, with none, the name that ends its emails;
 * and when Gmail's was read, by the workspace's clock, which a save reads again. A Microsoft mailbox signs with its name.
 */
export function mailboxGmailSignsWords(
  mailboxConnection: Pick<MailboxConnectionDto, "provider" | "from_name" | "signs">,
  tz: string,
  nowMs: number,
): {
  words: string;
  read: string;
} {
  const gmailWords = mailboxConnection.signs.gmail;
  if (mailboxConnection.provider !== "google")
    return { words: mailboxConnection.from_name, read: "Its emails end with the name it sends as." };
  const at = mailboxConnection.signs.gmail_read_at;
  const read = at
    ? `Read from Gmail ${clockNearWhen(Date.parse(at), tz, nowMs)}. Saving reads it again.`
    : "Saving reads it from Gmail now.";
  return gmailWords
    ? { words: gmailWords, read }
    : {
        words: mailboxConnection.from_name,
        read: `Gmail has none for this address, so its emails end with its name. ${read}`,
      };
}

/**
 * The Email card and its sheet (Settings › Connections, the mailbox canvas of 27 Oct 2026): facts in place of
 * sentences on the card, and the sheet's groups. What a fact says is the imports ledger's or the mailbox's own.
 */
export const MAILBOX_CARD_WORDS = {
  inbox: "Inbox",
  contacts: "Contacts",
  sends: "Sends",
  signsAs: "Signs as",
  sendsUpTo: (n: number) => `Up to ${n} a day`,
  noSignature: "No signature",
  add: "Add a mailbox",
  sending: "Sending",
  /** The switch's name in the Sending group, which says "Sending" once already. */
  sendsNow: "Sends now",
  sendingOn: (address: string) => `Replies, first emails and sequence steps leave from ${address}.`,
  sendingOff: (address: string) => `Paused: nothing leaves from ${address}. What people write still comes in.`,
  signature: "Signature",
  preview: "How it ends their email",
  previewEnd: "…\n\nTalk soon.",
  previewNone: "Nothing under it, not even its name.",
  previewWrite: "Write it above: it goes here.",
  backup: "Backup address",
  backupSays: (hosted: string, address: string) => `${hosted}: replies leave from it when ${address} can't send.`,
  changeName: "Change the name",
  removeSays: "Nothing more comes in or leaves from it. What it brought stays on each person.",
  remove: (address: string) => `Remove ${address}…`,
} as const;

/** What the card says a mailbox signs as: the first line of what it signs with, or that nothing goes. */
export function mailboxSignsAsWords(mailboxConnection: Pick<MailboxConnectionDto, "signs">): string {
  const first = (mailboxConnection.signs.words ?? "")
    .split("\n")
    .map((l) => l.trim())
    .find(Boolean);
  return first ?? MAILBOX_CARD_WORDS.noSignature;
}

/**
 * "Read at 9:47 AM", or, past a late read, "Not read since yesterday 9:47 PM" (or "Mon 9:47 PM", or past a week "Oct 2 ·
 * 9:47 PM"); "Not read yet" before the first. By the workspace's clock.
 */
function mailboxReadWords(syncedAt: string | null, nowMs: number, tz: string): string {
  if (!syncedAt) return "Not read yet";
  const at = Date.parse(syncedAt);
  return nowMs - at > MAILBOX_READ_LATE_MS
    ? `Not read since ${clockNearWhen(at, tz, nowMs)}`
    : `Read at ${clockTime(at, tz)}`;
}

/** "3 people wrote today": the people whose email came in through it in the last day, as its `day` counts its sends. */
function mailboxWroteWords(people: number): string {
  if (people === 0) return "No one wrote today";
  return `${people} ${people === 1 ? "person" : "people"} wrote today`;
}

/** What a mailbox's row says (MailboxRowWords): its mail read, who wrote, and what keeps it from sending. */
export function mailboxRowWords(mailboxConnection: MailboxConnectionDto, nowMs: number, tz: string): MailboxRowWords {
  const result = mailboxWords(mailboxConnection, nowMs, tz);
  if (mailboxConnection.state === "reconnect" || mailboxConnection.state === "removed")
    return {
      pill: result.pill,
      tone: result.tone,
      cameIn: null,
      standing:
        mailboxConnection.state === "removed"
          ? result.day
          : `${MAILBOX_PROVIDER_WORDS[mailboxConnection.provider]} signed it out: nothing is read from it or sent until it's connected again.`,
      fix: result.fix,
    };
  const cameIn = [
    mailboxReadWords(mailboxConnection.synced_at ?? null, nowMs, tz),
    mailboxConnection.came_in == null ? null : mailboxWroteWords(mailboxConnection.came_in),
  ]
    .filter(Boolean)
    .join(" · ");
  if (mailboxConnection.state === "paused")
    return {
      pill: result.pill,
      tone: result.tone,
      cameIn,
      standing: "You paused its sending: what people write still comes in.",
      fix: null,
    };
  if (mailboxConnection.state === "held") {
    const since = heldSince(mailboxConnection, tz, nowMs);
    return {
      pill: result.pill,
      tone: result.tone,
      cameIn,
      standing: `Its sending is held${since ? ` since ${since}` : ""}: ${mailboxHoldWords(mailboxConnection.held_why)}.`,
      fix: result.fix,
    };
  }
  return { pill: "Connected", tone: "ok", cameIn, standing: null, fix: result.fix };
}

/**
 * What its sending stands at, a line each, under the row when asked for: its day (while it sends), its ramp, its
 * health, the customer domain's ceiling, and the ramp's rule. A paused or held mailbox's row says why already.
 */
export function mailboxSendingLines(mailboxConnection: MailboxConnectionDto, nowMs: number, tz: string): string[] {
  const result = mailboxWords(mailboxConnection, nowMs, tz);
  const top = Math.max(...MAILBOX_RAMP.map((s) => s.perDay));
  return [
    mailboxConnection.state === "connected" ? result.day : null,
    result.ramp,
    result.health,
    mailboxConnection.customer_domain && mailboxConnection.state === "connected"
      ? customerDomainWords(mailboxConnection.host)
      : null,
    `A new mailbox starts at ${MAILBOX_RAMP[0].perDay} a day and grows with the days it sends, to ${top}.`,
  ].filter((line): line is string => !!line);
}

/** What the page may do with a mailbox, from its state (the edge's doors hold the same rules). */
export function mailboxActs(mailboxConnection: Pick<MailboxConnectionDto, "state">): {
  reconnect: boolean;
  resume: boolean;
  pause: boolean;
  unpause: boolean;
  test: boolean;
  remove: boolean;
} {
  return {
    reconnect: mailboxConnection.state === "reconnect",
    resume: mailboxConnection.state === "held",
    pause: mailboxConnection.state === "connected",
    unpause: mailboxConnection.state === "paused",
    test: mailboxConnection.state === "connected" || mailboxConnection.state === "paused",
    remove: mailboxIsLive(mailboxConnection),
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
function spfNote(
  mailboxConnection: Pick<MailboxConnectionDto, "provider" | "spf_record" | "spf_lookups">,
): string | null {
  if (!mailboxConnection.spf_record) return null;
  const person = MAILBOX_PROVIDER_WORDS[mailboxConnection.provider];
  const many = mailboxConnection.spf_record.split(SPF_RECORDS_JOIN).length;
  const change =
    many > 1
      ? `Your domain has ${many} SPF records, and with more than one none of them counts: replace them all with this one, which keeps every sender they name and adds ${person}.`
      : `Your domain has an SPF record already, and it may have only one: change it to this, which keeps every sender it names and adds ${person}.`;
  // The edge counted the record with the provider's include in it, the include's own lookups and all.
  const after = mailboxConnection.spf_lookups === null || many > 1 ? null : mailboxConnection.spf_lookups;
  return after !== null && after > SPF_LOOKUPS_MAX
    ? `${change} It would then spend ${after} of SPF's ${SPF_LOOKUPS_MAX} lookups and fail: ask whoever manages your DNS to shorten it first.`
    : change;
}

/** The records a mailbox's domain needs, as rows: SPF, DKIM, DMARC, each with whether DNS reads it now. */
export function mailboxRecordRows(
  mailboxConnection: Pick<MailboxConnectionDto, "provider" | "dns"> &
    Partial<Pick<MailboxConnectionDto, "spf_record" | "spf_lookups">>,
): MailboxRecordRow[] {
  const stateOf = (k: MailboxDnsRecord): MailboxRecordState => mailboxConnection.dns[k] ?? "unread";
  const spf = {
    provider: mailboxConnection.provider,
    spf_record: mailboxConnection.spf_record ?? null,
    spf_lookups: mailboxConnection.spf_lookups ?? null,
  };
  const row = (
    key: MailboxDnsRecord,
    mailbox: Omit<MailboxRecordRow, "key" | "found" | "state" | "note">,
    note: string | null,
  ) => ({
    key,
    ...mailbox,
    found: stateOf(key) === "found",
    state: stateOf(key),
    note: stateOf(key) === "found" ? null : note,
  });
  return [
    row(
      "spf",
      {
        kind: "Sender (SPF)",
        type: "TXT",
        name: "@",
        value: spfRecordWith(spf.spf_record, mailboxConnection.provider),
      },
      spfNote(spf),
    ),
    row(
      "dkim",
      {
        kind: "Signing (DKIM)",
        type: mailboxConnection.provider === "microsoft" ? "CNAME" : "TXT",
        name: DKIM_WHERE[mailboxConnection.provider].name,
        value: DKIM_WHERE[mailboxConnection.provider].value,
      },
      null,
    ),
    row("dmarc", { kind: "Policy (DMARC)", type: "TXT", name: "_dmarc", value: DMARC_RECOMMENDED }, null),
  ];
}

/**
 * A mailbox's domain, as its line on the Email card and its DNS sheet say it (the mailbox canvas's D1, 28 Oct 2026):
 * its records, how many are found, and how many are still to add. A record not read yet is neither.
 */
export function mailboxDnsOf(
  mailboxConnection: Pick<MailboxConnectionDto, "provider" | "dns"> &
    Partial<Pick<MailboxConnectionDto, "spf_record" | "spf_lookups">>,
): { rows: MailboxRecordRow[]; found: number; missing: number; total: number } {
  const rows = mailboxRecordRows(mailboxConnection);
  return {
    rows,
    found: rows.filter((r) => r.found).length,
    missing: rows.filter((r) => r.state === "missing").length,
    total: rows.length,
  };
}

/** Where a provider's own DKIM record is made, as its help page links it: Google's is Gmail's settings, then Authenticate email. */
const DKIM_MADE_AT: Partial<Record<MailboxProvider, { label: string; href: string }>> = {
  google: { label: "Open Gmail in Google Admin", href: "https://admin.google.com/ac/appsettings/740348119625" },
};

/** The DNS sheet's words, and the line on the card that opens it. */
export const MAILBOX_DNS_WORDS = {
  act: "Set up DNS",
  need: (missing: number, found: number, total: number) =>
    `${missing} DNS record${missing === 1 ? "" : "s"} to add · ${found} of ${total} found`,
  title: (host: string) => `${host}'s DNS`,
  sub: (address: string) => `So mail from ${address} is trusted`,
  found: (found: number, total: number) => `${found} of ${total} found`,
  /** When its records were last read, by the workspace's clock: "Checked yesterday 9:47 PM". */
  checked: (at: string | null, tz: string, nowMs: number) =>
    at ? `Checked ${clockNearWhen(Date.parse(at), tz, nowMs)}` : "Not checked yet",
  where: (host: string) => `Add them where you manage ${host}'s DNS. A change can take up to an hour to show.`,
  state: { add: "Add this", change: "Change this", made: "Turn on", found: "Found", unread: "Not read yet" },
  host: "Host",
  value: "Value",
  copy: "Copy",
  copied: "Copied",
  copyFailed: "Couldn't copy. It's selected: copy it by hand",
  madeAt: (provider: MailboxProvider) => DKIM_MADE_AT[provider] ?? null,
  check: "Check again",
  checking: "Checking…",
  readAgain: (host: string) => `${host}'s records were read again.`,
  foot: "DNS has to show them before mail is trusted",
} as const;

/** What a record's state says beside its name: found, to add, to change (an SPF the domain has), to turn on (DKIM), unread. */
export function mailboxRecordStateWords(mailbox: Pick<MailboxRecordRow, "key" | "state" | "note">): string {
  const state = MAILBOX_DNS_WORDS.state;
  if (mailbox.state === "found") return state.found;
  if (mailbox.state === "unread") return state.unread;
  if (mailbox.key === "dkim") return state.made;
  return mailbox.key === "spf" && mailbox.note ? state.change : state.add;
}

/* ------------------------------------------------------------------------------------- the block, in words */

/** The foot of the mailboxes block: what a mailbox does, before the first; then where its mail goes (its ramp is its Sending lines'). */
export function mailboxesFootWords(count: number): string {
  if (count >= MAILBOX_CONNECTIONS_MAX) return `${MAILBOX_CONNECTIONS_MAX} is the most. Remove one to add another.`;
  if (count === 0)
    return `Email people write to your mailbox comes into your Inbox, and cold email goes from it through Google, so every email is yours and every reply comes back to it. A mailbox on the domain your customers write to sends ${CUSTOMER_DOMAIN_DAILY_MAX} a day at most to leads; for more, use a second domain such as get<yourbusiness>.com.`;
  return "Email people write to it comes into your Inbox; cold email goes from it, and its replies come back here.";
}

/** The note shown once a mailbox on the customer domain is connected. */
export function customerDomainWords(host: string): string {
  return `Your customers write to ${host}, so this mailbox sends ${CUSTOMER_DOMAIN_DAILY_MAX} a day at most to keep their mail and bookings safe. For more, connect a mailbox on a second domain, such as get${host}.`;
}
