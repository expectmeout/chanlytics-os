/**
 * A connected mailbox read back (decision 0056, and 0073's R13: the business's email is its mailbox): what arrived in it
 * since its cursor, under any label or folder (a reply a rule filed away, or one taken for junk, is a reply all the
 * same). What sits in a thread a reach-out started (00424 mailbox_threads_known) is read whatever it is, a delivery
 * report is applied, and anything else is sorted (mailbox/sorting.ts: what the workspace said of its sender, what the
 * email claims to be, where Gmail filed it): an email a person wrote is taken in, as the hosted mailbox takes one in,
 * and the rest (lists, receipts, notifications, automatic replies) is left where it is, counted, and noted one line a
 * sender for the owner to see. Gmail's reports are found by who wrote them (a
 * report seldom joins the thread it is about); Graph names a message's sender before it is read, and its Junk Email is
 * asked since the last read, Graph keeping no delta of it.
 *
 *   a delivery report   applied by whose fault it is (channels bounceClassOf), as a receipt made of the report:
 *                       hard, the row fails and the address we wrote to is stopped and its lead marked; a server's
 *                       refusal of the sender (blocked), the row fails and is counted against the mailbox, the address
 *                       untouched; the sender's own quota (sender_limit), the row fails and the mailbox rests a day;
 *                       anything soft, the row fails and nothing else. A delay is nothing yet, and is left.
 *   anything else       handed to the intake as a job (email_ingest, source "mailbox"), once per message: the reply
 *                       is read there, as any email is (core email-ingest.ts), into the lead's thread.
 *
 * One sync at a time per mailbox (its lease), from where the last left off (its cursor): Gmail's history id, Graph's
 * delta link. A cursor Gmail no longer keeps starts again from now and reads back what arrived meanwhile (mailbox/gap.ts);
 * Graph's starts again from the last sync, a day back at most. Both are said in the log. A message that could not
 * be applied leaves the cursor where it was, so the next sync reads it again: both of its roads are idempotent (a job
 * once per message, a receipt that finds its row failed already). Called by the push doors and by the sweep.
 */
import {
  classifyReceived,
  deliveryReportOf,
  emailPlainText,
  gmailEmailOf,
  readGmailHead,
  gmailHeadOf,
  readGmailHistory,
  readGmailMessage,
  readGmailProfile,
  gmailReadVerdict,
  listGmailReports,
  readGraphDelta,
  graphEmailOf,
  listGraphJunkSince,
  readGraphMessage,
  graphReadVerdict,
  messageIdsIn,
  type EmailReceipt,
  type MailboxEmail,
  type ReadVerdict,
} from "@chanlytics/channels/email";
import { MIN_MS, DAY_MS, normalizeEmail, WAITING_REASONS, recordOrNull } from "@chanlytics/contracts";
import { EMAIL_BODY_MAX } from "@chanlytics/core";
import {
  endMailboxSync,
  keepOwnerEmail,
  getKnownThreads,
  patchMailboxConnection,
  findSentEmailIdByMessageId,
  findSentEmail,
  getSentEmailWithMessageId,
  takeMailboxSync,
  type MailboxConnectionRow,
} from "@chanlytics/db/email";
import type { Database, Json } from "@chanlytics/db/types";
import { scheduleJobOnce } from "@chanlytics/jobs";
import { applyEmailReceipt } from "../receipts.js";
import { getToken } from "./credentials.js";
import { filterGapMail, listGap, closeGap, stillLost, type MailGap } from "./gap.js";
import { markSignedOut } from "./wire.js";
import { findLeftWhy, mailSortingFor, noteLeft, type MailSorting } from "./sorting.js";
import { errField, type Logger } from "../../shared/log.js";
import type { SupabaseClient } from "@supabase/supabase-js";

type Db = SupabaseClient<Database>;

/** How long one sync holds its mailbox: longer than a sync takes, short enough that one that died is soon taken. */
const MAILBOX_SYNC_LEASE_MS = 4 * MIN_MS;
/** Pages of changes read in one sync (a page is a hundred, or fifty, ids alone): past it, the log says so. */
const PAGES_MAX = 30;

/** A message the provider says arrived: its id, its thread, (Graph says it) its sender, and whether it is a report. */
interface Arrived {
  id: string;
  threadId: string | null;
  from: string | null;
  /** Found among the delivery reports by who wrote them (Gmail's), whatever thread it sits in. */
  report?: boolean;
  /** Taken for spam or thrown away (Graph's Junk Email; Gmail's SPAM or TRASH): read only inside a thread of ours. */
  junk?: boolean;
  /** The mailbox's own drafting (Gmail's DRAFT): never read. */
  mine?: boolean;
  /**
   * The mailbox's own sending (Gmail's SENT): read for what the owner wrote from Gmail (ownerWrote). Graph names the
   * sender before a message is read, and its delta reads the inbox, so Outlook's Sent Items reach no sync yet.
   */
  sent?: boolean;
  /** Listed by the read-back after a lost cursor (mailbox/gap.ts): received mail, never the mailbox's own or spam. */
  gap?: boolean;
}

/** Gmail's labels that say a message is spam or thrown away, that it is a draft, and that the mailbox sent it. */
const GMAIL_JUNK = new Set(["SPAM", "TRASH"]);
const GMAIL_DRAFT = "DRAFT";
const GMAIL_SENT = "SENT";

/**
 * How far before the last read the reads a cursor cannot carry reach. Graph's Junk Email: half an hour, since each one
 * of ours found there is fetched again. Gmail's reports: a day, since the list is ids alone and only the ones the
 * history says arrived now are fetched, so a report that came while a sync could not ask is still found when the history
 * hands its arrival back.
 */
const SIDE_OVERLAP_MS = 30 * MIN_MS;
const REPORTS_OVERLAP_MS = DAY_MS;

/**
 * What a cursor does not carry, beside what it did: Gmail's delivery reports since the last read, each arrival among
 * them marked a report (all of them when the history started again, and says nothing of what came before); Graph's
 * Junk Email since the last read, added. Throws when the provider could not be asked.
 */
async function withSideArrivals(
  row: MailboxConnectionRow,
  token: string,
  arrived: Arrived[],
  started: boolean,
  now: number,
): Promise<Arrived[]> {
  const parsed = Date.parse(row.synced_at ?? row.connected_at);
  const last = Number.isFinite(parsed) ? Math.min(parsed, now) : now - DAY_MS;
  const have = new Set(arrived.map((a) => a.id));
  if (row.provider === "microsoft") {
    const junk = await listGraphJunkSince(token, new Date(last - SIDE_OVERLAP_MS).toISOString());
    return [...arrived, ...junk.filter((j) => !have.has(j.id)).map((j) => ({ ...j, junk: true }))];
  }
  const reports = new Set((await listGmailReports(token, (last - REPORTS_OVERLAP_MS) / 1000)).map((r) => r.id));
  const marked = arrived.map((a) => (reports.has(a.id) ? { ...a, report: true } : a));
  const before = started ? [...reports].filter((id) => !have.has(id)) : [];
  return [...marked, ...before.map((id) => ({ id, threadId: null, from: null, report: true }))];
}

/** What a sync did, for its caller's line. */
interface SyncOutcome {
  /** later: its line came before its first read, so it reads next time, its cursor where it was. */
  outcome: "synced" | "busy" | "no_token" | "started" | "restarted" | "failed" | "later";
  /** Messages fetched and read: everything but the mailbox's own and spam outside a thread of ours (R13). */
  read: number;
  /** Reports applied as bounces. */
  bounced: number;
  /** Replies handed to the intake. */
  replies: number;
  /** Emails a person wrote, outside a thread of ours, handed to the intake (R13). */
  people: number;
  /** Emails the owner sent from the mailbox to a person the workspace knows, kept in their thread (00482). */
  owner: number;
  /** Emails read and left where they are: a list, a receipt, a notification, an automatic reply. */
  dropped: number;
  /** Emails the provider refused to hand over, gone on without (readEmail). */
  unreadable: number;
}

const none = (outcome: SyncOutcome["outcome"]): SyncOutcome => ({
  outcome,
  read: 0,
  bounced: 0,
  replies: 0,
  people: 0,
  owner: 0,
  dropped: 0,
  unreadable: 0,
});

/** A sender that writes delivery reports: what Graph names as a message's sender, read before the message is. */
const REPORTER = /^(mailer-daemon|postmaster|microsoftexchange[0-9a-f]*)@/i;

/**
 * The changes since the cursor: the messages added, and the cursor after them. Null cursor: it starts from now. `gap`,
 * where a lost cursor's gap was listed and its mail is among the arrivals (mailbox/gap.ts). `lost`, where the cursor is
 * lost and this read did not get past it: the moment of the last sync stands, since the gap is measured from it.
 */
type Changes =
  | { ok: true; arrived: Arrived[]; cursor: string; started: boolean; gap?: MailGap; lost?: boolean }
  | { ok: false; status: number; why: string; lost?: boolean };

async function gmailChanges(
  token: string,
  row: Pick<MailboxConnectionRow, "id" | "sync_cursor" | "synced_at" | "connected_at">,
  log: Logger,
  now: number,
  until: number,
): Promise<Changes> {
  const { id, sync_cursor: cursor } = row;
  const fromNow = async (): Promise<Changes> => {
    const p = await readGmailProfile(token);
    const historyId = recordOrNull(p.json)?.historyId;
    if (p.outcome !== "ok" || typeof historyId !== "string") return { ok: false, status: p.status, why: "profile" };
    return { ok: true, arrived: [], cursor: historyId, started: true };
  };
  if (!cursor) return fromNow();
  // A cursor Gmail no longer keeps: its newest first, which becomes the cursor, then what arrived since the last sync,
  // so nothing between the two is missed. A list the line cut short keeps the cursor, and is asked again.
  const afterTheGap = async (): Promise<Changes> => {
    if (Date.now() >= until) return { ok: true, arrived: [], cursor, started: false, lost: true };
    const fresh = await fromNow();
    if (!fresh.ok) return { ...fresh, lost: true };
    const listed = await listGap(token, row, now, until);
    if (!listed.ok) return { ok: false, status: listed.status, why: "gap", lost: true };
    if ("late" in listed) return { ok: true, arrived: [], cursor, started: false, lost: true };
    const arrived = listed.mail.map((m) => ({ id: m.id, threadId: m.threadId, from: null, gap: true }));
    return { ...fresh, arrived, gap: listed.gap };
  };
  const arrived: Arrived[] = [];
  let page: string | null = null;
  let next = cursor;
  for (let index = 0; index < PAGES_MAX && (index === 0 || Date.now() < until); index++) {
    const result = await readGmailHistory(token, cursor, page);
    if (!result.ok) {
      if (!result.expired) return { ok: false, status: result.reply.status, why: "history" };
      log.warn("mailbox_sync_restarted", { mailbox: id, provider: "google" });
      // Past the line, the profile and the gap wait for the next sync: its cursor is where it was, and is lost again then.
      return afterTheGap();
    }
    arrived.push(
      ...result.added.map((a) => ({
        id: a.id,
        threadId: a.threadId,
        from: null,
        junk: a.labels.some((l) => GMAIL_JUNK.has(l)),
        mine: a.labels.includes(GMAIL_DRAFT),
        sent: a.labels.includes(GMAIL_SENT),
      })),
    );
    if (result.next) next = result.next;
    page = result.nextPage;
    if (!page) break;
  }
  // Pages left unread: what was read is applied, and the cursor stays, since Gmail's history id is the mailbox's newest
  // and moving to it would pass the pages over. The next sync reads them again from here (each is applied once).
  if (page) {
    log.warn("mailbox_sync_truncated", { mailbox: id, provider: "google", read: arrived.length });
    return { ok: true, arrived, cursor, started: false };
  }
  return { ok: true, arrived, cursor: next, started: false };
}

async function graphChanges(
  token: string,
  cursor: string | null,
  log: Logger,
  row: Pick<MailboxConnectionRow, "id" | "synced_at">,
  now: number,
  until: number,
): Promise<Changes> {
  const arrived: Arrived[] = [];
  let link = cursor;
  // A link Graph no longer keeps: from the last sync (a day back at most), so what arrived meanwhile is still read.
  let since = new Date(now).toISOString();
  let started = !cursor;
  for (let index = 0; index < PAGES_MAX && (index === 0 || Date.now() < until); index++) {
    const result = await readGraphDelta(token, link, undefined, since);
    if (!result.ok) {
      if (!result.expired || !link || started) return { ok: false, status: result.reply.status, why: "delta" };
      log.warn("mailbox_sync_restarted", { mailbox: row.id, provider: "microsoft" });
      const last = row.synced_at ? Date.parse(row.synced_at) : now;
      since = new Date(Math.max(last - 5 * MIN_MS, now - DAY_MS)).toISOString();
      link = null;
      started = true;
      continue;
    }
    arrived.push(...result.added);
    if (result.deltaLink) return { ok: true, arrived, cursor: result.deltaLink, started };
    if (!result.nextLink) return { ok: false, status: 502, why: "delta_without_link" };
    link = result.nextLink;
  }
  // More pages than one sync reads: the link to the next page is the cursor, and the next sync reads on from it.
  log.warn("mailbox_sync_truncated", { mailbox: row.id, provider: "microsoft", read: arrived.length });
  return { ok: true, arrived, cursor: link ?? cursor ?? "", started };
}

/**
 * One message, in full, as the intake reads any email: the email; gone, when the provider has it no longer (or answered
 * nothing an email can be read from); refused, when the provider will not hand over that one message, which a reader
 * goes on without and says so; or paced, the provider's pace or quota of requests, which is no failure: a reader rests,
 * then reads it again (channels gmailReadVerdict, graphReadVerdict). Anything else (the grant, the provider's bad
 * minute) throws with the provider's reason, and the read is asked again.
 */
type EmailRead = { email: MailboxEmail } | { gone: true } | { refused: ReadVerdict } | { paced: ReadVerdict };

export async function readEmail(
  row: MailboxConnectionRow,
  token: string,
  id: string,
  how: "whole" | "head" = "whole",
): Promise<EmailRead> {
  const microsoft = row.provider === "microsoft";
  // By its headers alone (Gmail's metadata, its first words its snippet): what the six months judge most mail by before
  // reading it whole (decision 0080). Graph's road reads every message whole, as it did.
  const head = how === "head" && !microsoft;
  const item = microsoft
    ? await readGraphMessage(token, id)
    : head
      ? await readGmailHead(token, id)
      : await readGmailMessage(token, id);
  if (item.outcome === "ok") {
    const email = microsoft ? graphEmailOf(item.json) : head ? gmailHeadOf(item.json) : gmailEmailOf(item.json);
    return email ? { email } : { gone: true };
  }
  if (item.status === 404) return { gone: true };
  const value = microsoft ? graphReadVerdict(item) : gmailReadVerdict(item);
  if (value.verdict === "refused") return { refused: value };
  if (value.verdict === "paced") return { paced: value };
  const reason = value.reason ?? item.error;
  throw new Error(`cannot read message ${id}: ${item.status}${reason ? ` (${reason})` : ""}`);
}

/** How long a mailbox rests when a report says its own provider refused it for its quota: the provider's rolling day. */
const SENDER_LIMIT_REST_MS = DAY_MS;

/**
 * Whether a report came from the mailbox's own provider, which alone says its day is used up: Gmail's Mail Delivery
 * Subsystem, or Exchange's postmaster (or its MicrosoftExchange system address) on the mailbox's own domain or the
 * tenant's onmicrosoft.com one.
 */
function fromItsProvider(row: MailboxConnectionRow, e: MailboxEmail): boolean {
  const from = (e.from?.address ?? "").toLowerCase();
  const [local = "", host = ""] = from.split("@");
  if (row.provider !== "microsoft") return from === "mailer-daemon@googlemail.com";
  const ours = host === row.host.toLowerCase() || host.endsWith(".onmicrosoft.com");
  return ours && (local === "postmaster" || local.startsWith("microsoftexchange"));
}

/**
 * A delivery report about an email of ours, as the receipt it is: the row it is about (in the Message-ID we minted,
 * or found by the one it quotes), a bounce of the kind its class says (Permanent, Blocked, or Transient). The address
 * the receipt names is the one we wrote to, never the report's own Final-Recipient (which may be where that address
 * forwards to); a hard bounce for an address we did not write to is that forward's, and stops nothing of ours. A
 * report that the sender's own provider refused it for its quota rests the mailbox a day as well. Null when it is no
 * report; "none" when it names no email of this workspace's, or only says the email is delayed.
 */
async function reportReceipt(
  db: Db,
  row: MailboxConnectionRow,
  mailboxEmail: MailboxEmail,
  now: number,
): Promise<EmailReceipt | "none" | null> {
  const report = deliveryReportOf(mailboxEmail);
  if (!report) return null;
  if (report.delayed) return "none";
  const rowId =
    report.rowId ??
    (report.originalMessageId ? await findSentEmailIdByMessageId(db, row.tenant_id, report.originalMessageId) : null);
  if (!rowId) return "none";
  const sent = await findSentEmail(db, { tenantId: row.tenant_id, messageId: rowId });
  if (!sent) return "none";
  const wrote = recordOrNull(sent.request)?.to;
  const ours = (Array.isArray(wrote) ? wrote : []).filter((a): a is string => typeof a === "string");
  const elsewhere = !!report.recipient && ours.length > 0 && !ours.some((a) => a.toLowerCase() === report.recipient);
  // Anyone can write a report, so a rest is taken only from the sending provider's own system, and only where none
  // stands: a forged "you hit your limit" from a recipient's own domain stops nothing.
  if (
    report.bounce === "sender_limit" &&
    fromItsProvider(row, mailboxEmail) &&
    !(row.resting_until && Date.parse(row.resting_until) > now)
  )
    await patchMailboxConnection(db, {
      tenantId: row.tenant_id,
      id: row.id,
      patch: { resting_until: new Date(now + SENDER_LIMIT_REST_MS).toISOString() },
    });
  const kind =
    report.bounce === "hard" && !elsewhere ? "Permanent" : report.bounce === "blocked" ? "Blocked" : "Transient";
  return {
    type: "bounced",
    providerId: mailboxEmail.id,
    rfcMessageId: report.originalMessageId,
    to: ours,
    messageId: rowId,
    tenantId: row.tenant_id,
    detail: { kind, subKind: report.status, message: report.diagnostic },
  };
}

/**
 * What one arrival came to: gone, refused by the provider (gone on without), the provider's pace (the sync stops and
 * the next reads on from the cursor), read and left, a report applied, left where it is, or handed to the intake.
 */
type ArrivalTaken = "gone" | "unreadable" | "paced" | "left" | "bounced" | "dropped" | "reply" | "person" | "owner";

/** The count each arrival adds to, where it adds to one beyond `read`. */
const COUNTED: Partial<Record<ArrivalTaken, "bounced" | "dropped" | "replies" | "people" | "owner">> = {
  bounced: "bounced",
  dropped: "dropped",
  reply: "replies",
  person: "people",
  owner: "owner",
};

/**
 * What a thread's row keeps of an email read from a mailbox beside its words, as the intake keeps one: enough to thread
 * under it and say who. The six months' (mail-history.ts) and the owner's sends from now on (ownerWrote) alike.
 */
export function mailboxEmailMeta(mailboxEmail: MailboxEmail, mailboxId: string) {
  return {
    email: {
      subject: mailboxEmail.subject,
      message_id: mailboxEmail.messageId,
      in_reply_to: mailboxEmail.headers["in-reply-to"] ?? null,
      references: messageIdsIn(mailboxEmail.headers.references).slice(-20),
      from: mailboxEmail.from?.address ?? null,
      from_name: mailboxEmail.from?.name ?? null,
      to: mailboxEmail.to,
      cc: mailboxEmail.cc,
      claim: "person",
      attachments: mailboxEmail.attachments.slice(0, 5),
      more_attachments: Math.max(0, mailboxEmail.attachments.length - 5),
      truncated: (mailboxEmail.text?.length ?? 0) > EMAIL_BODY_MAX,
    },
    source: "mailbox",
    mailbox_id: mailboxId,
    thread_id: mailboxEmail.threadId,
  } satisfies Json;
}

/**
 * An email the mailbox sent (00482). One Chanlytics sent is its own row already (by the Message-ID it went under, and
 * the door keeps a provider id once). One the owner wrote from Gmail to one person the workspace knows is kept in that
 * person's thread as their words, and answers the holds that waited on it there (contracts WAITING_REASONS), as a reply
 * typed in the WhatsApp Business app does: Need you stops asking, and nobody answers twice. Mail to many, to nobody but
 * the mailbox, an automatic one (a mail merge, a responder), or to someone the workspace does not know is the owner's
 * own, and is left.
 */
async function ownerWrote(
  db: Db,
  row: MailboxConnectionRow,
  own: string,
  mailboxEmail: MailboxEmail,
): Promise<ArrivalTaken> {
  if (classifyReceived(mailboxEmail) !== "person") return "left";
  if (mailboxEmail.messageId && (await getSentEmailWithMessageId(db, row.tenant_id, mailboxEmail.messageId)))
    return "left";
  const to = [
    ...new Set(
      [...mailboxEmail.to, ...mailboxEmail.cc]
        .map((a) => normalizeEmail(a))
        .filter((a): a is string => !!a && a !== own),
    ),
  ];
  const [only] = to;
  if (to.length !== 1 || !only) return "left";
  const kept = await keepOwnerEmail(db, {
    tenantId: row.tenant_id,
    address: only,
    externalId: mailboxEmail.id,
    body: emailPlainText(mailboxEmail)?.slice(0, EMAIL_BODY_MAX) ?? null,
    channelTs: mailboxEmail.createdAt ?? new Date().toISOString(),
    meta: { ...mailboxEmailMeta(mailboxEmail, row.id), owner_wrote: true },
    settles: WAITING_REASONS,
  });
  return kept.kept ? "owner" : "left";
}

/**
 * One arrival, read in full and taken: the mailbox's own send is the owner's (ownerWrote), and a report that names
 * nothing of ours is left; a report is applied as a receipt; inside a thread of ours anything is a reply, whatever tab
 * Gmail filed it under; outside one, only what a person wrote is taken in (R13), and the rest is sorted
 * (mailbox/sorting.ts), left where it is, counted and noted. One the provider refuses to hand over is said and gone on
 * without, so it never holds the cursor back.
 */
async function takeArrival(
  db: Db,
  params: {
    row: MailboxConnectionRow;
    token: string;
    ours: Set<string>;
    own: string;
    at: Date;
    now: number;
    log: Logger;
    sorting: MailSorting;
    /** The sync's line: a stranger's reading never runs past it (mailbox/reader.ts). */
    until: number;
  },
  arrived: Arrived,
): Promise<ArrivalTaken> {
  const { row, ours, own, at } = params;
  const read = await readEmail(row, params.token, arrived.id);
  if ("gone" in read) return "gone";
  if ("refused" in read) {
    params.log.warn("mailbox_message_unreadable", {
      mailbox: row.id,
      message: arrived.id,
      stage: "sync",
      ...read.refused,
    });
    return "unreadable";
  }
  if ("paced" in read) {
    const { status, reason } = read.paced;
    params.log.warn("mailbox_sync_failed", { mailbox: row.id, stage: "paced", message: arrived.id, status, reason });
    return "paced";
  }
  const email = read.email;
  if (email.from?.address.toLowerCase() === own) return ownerWrote(db, row, own, email);
  const receipt = await reportReceipt(db, row, email, params.now);
  if (receipt === "none") return "left";
  if (receipt) {
    await applyEmailReceipt(db, receipt, at.toISOString());
    return "bounced";
  }
  const inOurs = (!!arrived.threadId && ours.has(arrived.threadId)) || (!!email.threadId && ours.has(email.threadId));
  if (!inOurs && (arrived.report || (arrived.from !== null && REPORTER.test(arrived.from)))) return "dropped";
  const leftReason = inOurs ? null : await findLeftWhy(email, params.sorting, params.until);
  if (leftReason) {
    await noteLeft(db, row.tenant_id, email, leftReason);
    return "dropped";
  }
  await scheduleJobOnce(db, {
    tenantId: row.tenant_id,
    kind: "email_ingest",
    dueAt: at,
    payload: { source: "mailbox", mailbox_id: row.id, received_id: email.id },
  });
  return inOurs ? "reply" : "person";
}

/**
 * Read the mailbox back from its cursor, once, if no other sync holds it. No provider read starts after `until` (the
 * caller's line, so the one in flight still ends inside its function's limit): what is left waits for the next sync.
 */
export async function syncMailbox(
  db: Db,
  row: MailboxConnectionRow,
  log: Logger,
  now = Date.now(),
  until = Number.POSITIVE_INFINITY,
): Promise<SyncOutcome> {
  if (row.state === "removed" || row.state === "reconnect") return none("no_token");
  const at = new Date(now);
  if (!(await takeMailboxSync(db, row.id, at, MAILBOX_SYNC_LEASE_MS))) return none("busy");
  const end = (cursor: string | null, error: string | null, unread = false) =>
    endMailboxSync(db, { id: row.id, cursor, at, error, unread }).catch((e: unknown) =>
      log.error("mailbox_sync_failed", { mailbox: row.id, stage: "end", error: errField(e) }),
    );
  try {
    const token = await getToken(db, row, now);
    if (!token.ok) {
      if (token.why === "signed_out") await markSignedOut(db, row, log, now);
      await end(null, null);
      return none("no_token");
    }
    // The token may have been a read of its own: past the line, the changes wait for the next sync.
    if (Date.now() >= until) {
      await end(null, null);
      return none("later");
    }
    const changes =
      row.provider === "microsoft"
        ? await graphChanges(token.token, row.sync_cursor, log, row, now, until)
        : await gmailChanges(token.token, row, log, now, until);
    if (!changes.ok) {
      log.warn("mailbox_sync_failed", { mailbox: row.id, stage: changes.why, status: changes.status });
      await end(null, `Could not read the mailbox (${changes.status}).`, changes.lost);
      return none("failed");
    }

    // What the cursor does not carry: a read that fails, or that the line leaves no time for, keeps the cursor where it
    // was, and the next sync asks again.
    let behind = Date.now() >= until;
    const arrived = behind
      ? changes.arrived
      : await withSideArrivals(row, token.token, changes.arrived, changes.started, now).catch((err: unknown) => {
          behind = true;
          log.warn("mailbox_sync_failed", { mailbox: row.id, stage: "side", error: errField(err) });
          return changes.arrived;
        });
    // Every arrival is read but the mailbox's drafts, what Graph names as its own sender up front, and spam outside a
    // thread of ours: what the mailbox sent, for what the owner wrote from it (Gmail labels it SENT); a thread of ours
    // whatever it is; a report however it is threaded; and anything else, sorted (R13).
    const ours = await getKnownThreads(
      db,
      row.tenant_id,
      arrived.map((a) => a.threadId).filter((t): t is string => !!t),
    );
    const own = row.address.toLowerCase();
    const sorting = await mailSortingFor(db, row.tenant_id, log);
    const ofTheGap = await filterGapMail(db, row.tenant_id, changes.gap, arrived, ours);
    const wanted = arrived
      .filter((a) => !a.mine && a.from !== own && (!a.junk || (!!a.threadId && ours.has(a.threadId))))
      .filter(ofTheGap);
    const seen = new Set<string>();
    const result: SyncOutcome = {
      ...none(changes.started ? (row.sync_cursor ? "restarted" : "started") : "synced"),
    };
    for (const first of wanted) {
      if (Date.now() >= until) {
        behind = true;
        break;
      }
      if (seen.has(first.id)) continue;
      seen.add(first.id);
      try {
        const arrival = await takeArrival(
          db,
          { row, token: token.token, ours, own, at, now, log, sorting, until },
          first,
        );
        if (arrival === "paced") {
          // The provider's pace: what is left waits for the next sync, from the cursor where it was.
          behind = true;
          break;
        }
        if (arrival === "unreadable") result.unreadable++;
        else if (arrival !== "gone") result.read++;
        const counted = COUNTED[arrival];
        if (counted) result[counted]++;
      } catch (err) {
        behind = true;
        log.error("mailbox_sync_failed", {
          mailbox: row.id,
          stage: "message",
          message: first.id,
          error: errField(err),
        });
      }
    }
    // Everything read and applied moves the cursor on; a message left behind keeps it, and the next sync reads again.
    // A lost cursor's gap not yet read through leaves the last sync's moment too: the next sync lists from it again.
    await end(behind ? null : changes.cursor, null, stillLost(changes, behind));
    const gap = await closeGap(db, row, changes.gap, behind, log);
    log.info("mailbox_synced", { mailbox: row.id, ...result, arrived: arrived.length, behind, ...gap });
    return result;
  } catch (err) {
    log.error("mailbox_sync_failed", { mailbox: row.id, stage: "sync", error: errField(err) });
    await end(null, "Could not read the mailbox.");
    return none("failed");
  }
}
