/**
 * A connected mailbox read back (decision 0056, and 0073's R13: the business's email is its mailbox): what arrived in it
 * since its cursor, under any label or folder (a reply a rule filed away, or one taken for junk, is a reply all the
 * same). What sits in a thread a reach-out started (00424 mailbox_threads_known) is read whatever it is, a delivery
 * report is applied, and anything else is sorted (mailbox-sorting.ts: what the workspace said of its sender, what the
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
 * delta link. A cursor the provider no longer keeps starts again from now, said in the log. A message that could not
 * be applied leaves the cursor where it was, so the next sync reads it again: both of its roads are idempotent (a job
 * once per message, a receipt that finds its row failed already). Called by the push doors and by the sweep.
 */
import {
  classifyReceived,
  deliveryReportOf,
  emailPlainText,
  gmailEmailOf,
  gmailHead,
  gmailHeadOf,
  gmailHistory,
  gmailMessage,
  gmailProfile,
  gmailReadVerdict,
  gmailReports,
  graphDelta,
  graphEmailOf,
  graphJunkSince,
  graphMessage,
  graphReadVerdict,
  messageIdsIn,
  type EmailReceipt,
  type MailboxEmail,
  type ReadVerdict,
} from "../../packages/channels.js";
import { MIN_MS, DAY_MS, normalizeEmail, WAITING_REASONS } from "../../packages/contracts.js";
import { EMAIL_BODY_MAX } from "../../packages/core.js";
import {
  endMailboxSync,
  keepOwnerEmail,
  knownThreads,
  patchMailboxConnection,
  sentEmailIdByMessageId,
  sentEmailOf,
  sentEmailWithMessageId,
  takeMailboxSync,
  type Database,
  type Json,
  type MailboxConnectionRow,
} from "../../packages/db.js";
import { scheduleJobOnce } from "../../packages/jobs.js";
import { applyEmailReceipt } from "../email-receipts.js";
import { tokenFor } from "./mailbox-credentials.js";
import { markSignedOut } from "./mailbox-wire.js";
import { leftWhy, mailSortingFor, noteLeft, type MailSorting } from "./mailbox-sorting.js";
import { errField, type Logger } from "../../log.js";
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
    const junk = await graphJunkSince(token, new Date(last - SIDE_OVERLAP_MS).toISOString());
    return [...arrived, ...junk.filter((j) => !have.has(j.id)).map((j) => ({ ...j, junk: true }))];
  }
  const reports = new Set((await gmailReports(token, (last - REPORTS_OVERLAP_MS) / 1000)).map((r) => r.id));
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

/** The changes since the cursor: the messages added, and the cursor after them. Null cursor: it starts from now. */
type Changes =
  { ok: true; arrived: Arrived[]; cursor: string; started: boolean } | { ok: false; status: number; why: string };

async function gmailChanges(
  token: string,
  cursor: string | null,
  log: Logger,
  id: string,
  until: number,
): Promise<Changes> {
  const fromNow = async (): Promise<Changes> => {
    const p = await gmailProfile(token);
    const historyId = (p.json as { historyId?: unknown } | null)?.historyId;
    if (p.outcome !== "ok" || typeof historyId !== "string") return { ok: false, status: p.status, why: "profile" };
    return { ok: true, arrived: [], cursor: historyId, started: true };
  };
  if (!cursor) return fromNow();
  const arrived: Arrived[] = [];
  let page: string | null = null;
  let next = cursor;
  for (let i = 0; i < PAGES_MAX && (i === 0 || Date.now() < until); i++) {
    const h = await gmailHistory(token, cursor, page);
    if (!h.ok) {
      if (!h.expired) return { ok: false, status: h.reply.status, why: "history" };
      log.warn("mailbox_sync_restarted", { mailbox: id, provider: "google" });
      // Past the line, the profile waits for the next sync: its cursor is where it was, and expires again then.
      return Date.now() < until ? fromNow() : { ok: true, arrived, cursor, started: false };
    }
    arrived.push(
      ...h.added.map((a) => ({
        id: a.id,
        threadId: a.threadId,
        from: null,
        junk: a.labels.some((l) => GMAIL_JUNK.has(l)),
        mine: a.labels.includes(GMAIL_DRAFT),
        sent: a.labels.includes(GMAIL_SENT),
      })),
    );
    if (h.next) next = h.next;
    page = h.nextPage;
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
  for (let i = 0; i < PAGES_MAX && (i === 0 || Date.now() < until); i++) {
    const d = await graphDelta(token, link, undefined, since);
    if (!d.ok) {
      if (!d.expired || !link || started) return { ok: false, status: d.reply.status, why: "delta" };
      log.warn("mailbox_sync_restarted", { mailbox: row.id, provider: "microsoft" });
      const last = row.synced_at ? Date.parse(row.synced_at) : now;
      since = new Date(Math.max(last - 5 * MIN_MS, now - DAY_MS)).toISOString();
      link = null;
      started = true;
      continue;
    }
    arrived.push(...d.added);
    if (d.deltaLink) return { ok: true, arrived, cursor: d.deltaLink, started };
    if (!d.nextLink) return { ok: false, status: 502, why: "delta_without_link" };
    link = d.nextLink;
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
  const r = microsoft
    ? await graphMessage(token, id)
    : head
      ? await gmailHead(token, id)
      : await gmailMessage(token, id);
  if (r.outcome === "ok") {
    const email = microsoft ? graphEmailOf(r.json) : head ? gmailHeadOf(r.json) : gmailEmailOf(r.json);
    return email ? { email } : { gone: true };
  }
  if (r.status === 404) return { gone: true };
  const v = microsoft ? graphReadVerdict(r) : gmailReadVerdict(r);
  if (v.verdict === "refused") return { refused: v };
  if (v.verdict === "paced") return { paced: v };
  const why = v.reason ?? r.error;
  throw new Error(`cannot read message ${id}: ${r.status}${why ? ` (${why})` : ""}`);
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
  e: MailboxEmail,
  now: number,
): Promise<EmailReceipt | "none" | null> {
  const report = deliveryReportOf(e);
  if (!report) return null;
  if (report.delayed) return "none";
  const rowId =
    report.rowId ??
    (report.originalMessageId ? await sentEmailIdByMessageId(db, row.tenant_id, report.originalMessageId) : null);
  if (!rowId) return "none";
  const sent = await sentEmailOf(db, { tenantId: row.tenant_id, messageId: rowId });
  if (!sent) return "none";
  const wrote = (sent.request as { to?: unknown } | null)?.to;
  const ours = (Array.isArray(wrote) ? wrote : []).filter((a): a is string => typeof a === "string");
  const elsewhere = !!report.recipient && ours.length > 0 && !ours.some((a) => a.toLowerCase() === report.recipient);
  // Anyone can write a report, so a rest is taken only from the sending provider's own system, and only where none
  // stands: a forged "you hit your limit" from a recipient's own domain stops nothing.
  if (
    report.bounce === "sender_limit" &&
    fromItsProvider(row, e) &&
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
    providerId: e.id,
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
export function mailboxEmailMeta(e: MailboxEmail, mailboxId: string) {
  return {
    email: {
      subject: e.subject,
      message_id: e.messageId,
      in_reply_to: e.headers["in-reply-to"] ?? null,
      references: messageIdsIn(e.headers.references).slice(-20),
      from: e.from?.address ?? null,
      from_name: e.from?.name ?? null,
      to: e.to,
      cc: e.cc,
      claim: "person",
      attachments: e.attachments.slice(0, 5),
      more_attachments: Math.max(0, e.attachments.length - 5),
      truncated: (e.text?.length ?? 0) > EMAIL_BODY_MAX,
    },
    source: "mailbox",
    mailbox_id: mailboxId,
    thread_id: e.threadId,
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
async function ownerWrote(db: Db, row: MailboxConnectionRow, own: string, e: MailboxEmail): Promise<ArrivalTaken> {
  if (classifyReceived(e) !== "person") return "left";
  if (e.messageId && (await sentEmailWithMessageId(db, row.tenant_id, e.messageId))) return "left";
  const to = [
    ...new Set([...e.to, ...e.cc].map((a) => normalizeEmail(a)).filter((a): a is string => !!a && a !== own)),
  ];
  const [only] = to;
  if (to.length !== 1 || !only) return "left";
  const kept = await keepOwnerEmail(db, {
    tenantId: row.tenant_id,
    address: only,
    externalId: e.id,
    body: emailPlainText(e)?.slice(0, EMAIL_BODY_MAX) ?? null,
    channelTs: e.createdAt ?? new Date().toISOString(),
    meta: { ...mailboxEmailMeta(e, row.id), owner_wrote: true },
    settles: WAITING_REASONS,
  });
  return kept.kept ? "owner" : "left";
}

/**
 * One arrival, read in full and taken: the mailbox's own send is the owner's (ownerWrote), and a report that names
 * nothing of ours is left; a report is applied as a receipt; inside a thread of ours anything is a reply, whatever tab
 * Gmail filed it under; outside one, only what a person wrote is taken in (R13), and the rest is sorted
 * (mailbox-sorting.ts), left where it is, counted and noted. One the provider refuses to hand over is said and gone on
 * without, so it never holds the cursor back.
 */
async function takeArrival(
  db: Db,
  p: {
    row: MailboxConnectionRow;
    token: string;
    ours: Set<string>;
    own: string;
    at: Date;
    now: number;
    log: Logger;
    sorting: MailSorting;
    /** The sync's line: a stranger's reading never runs past it (mailbox-reader.ts). */
    until: number;
  },
  a: Arrived,
): Promise<ArrivalTaken> {
  const { row, ours, own, at } = p;
  const read = await readEmail(row, p.token, a.id);
  if ("gone" in read) return "gone";
  if ("refused" in read) {
    p.log.warn("mailbox_message_unreadable", { mailbox: row.id, message: a.id, stage: "sync", ...read.refused });
    return "unreadable";
  }
  if ("paced" in read) {
    const { status, reason } = read.paced;
    p.log.warn("mailbox_sync_failed", { mailbox: row.id, stage: "paced", message: a.id, status, reason });
    return "paced";
  }
  const e = read.email;
  if (e.from?.address.toLowerCase() === own) return ownerWrote(db, row, own, e);
  const receipt = await reportReceipt(db, row, e, p.now);
  if (receipt === "none") return "left";
  if (receipt) {
    await applyEmailReceipt(db, receipt, at.toISOString());
    return "bounced";
  }
  const inOurs = (!!a.threadId && ours.has(a.threadId)) || (!!e.threadId && ours.has(e.threadId));
  if (!inOurs && (a.report || (a.from !== null && REPORTER.test(a.from)))) return "dropped";
  const why = inOurs ? null : await leftWhy(e, p.sorting, p.until);
  if (why) {
    await noteLeft(db, row.tenant_id, e, why);
    return "dropped";
  }
  await scheduleJobOnce(db, {
    tenantId: row.tenant_id,
    kind: "email_ingest",
    dueAt: at,
    payload: { source: "mailbox", mailbox_id: row.id, received_id: e.id },
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
  const end = (cursor: string | null, error: string | null) =>
    endMailboxSync(db, { id: row.id, cursor, at, error }).catch((e: unknown) =>
      log.error("mailbox_sync_failed", { mailbox: row.id, stage: "end", error: errField(e) }),
    );
  try {
    const t = await tokenFor(db, row, now);
    if (!t.ok) {
      if (t.why === "signed_out") await markSignedOut(db, row, log, now);
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
        ? await graphChanges(t.token, row.sync_cursor, log, row, now, until)
        : await gmailChanges(t.token, row.sync_cursor, log, row.id, until);
    if (!changes.ok) {
      log.warn("mailbox_sync_failed", { mailbox: row.id, stage: changes.why, status: changes.status });
      await end(null, `Could not read the mailbox (${changes.status}).`);
      return none("failed");
    }

    // What the cursor does not carry: a read that fails, or that the line leaves no time for, keeps the cursor where it
    // was, and the next sync asks again.
    let behind = Date.now() >= until;
    const arrived = behind
      ? changes.arrived
      : await withSideArrivals(row, t.token, changes.arrived, changes.started, now).catch((err: unknown) => {
          behind = true;
          log.warn("mailbox_sync_failed", { mailbox: row.id, stage: "side", error: errField(err) });
          return changes.arrived;
        });
    // Every arrival is read but the mailbox's drafts, what Graph names as its own sender up front, and spam outside a
    // thread of ours: what the mailbox sent, for what the owner wrote from it (Gmail labels it SENT); a thread of ours
    // whatever it is; a report however it is threaded; and anything else, sorted (R13).
    const ours = await knownThreads(
      db,
      row.tenant_id,
      arrived.map((a) => a.threadId).filter((t): t is string => !!t),
    );
    const own = row.address.toLowerCase();
    const sorting = await mailSortingFor(db, row.tenant_id, log);
    const wanted = arrived.filter(
      (a) => !a.mine && a.from !== own && (!a.junk || (!!a.threadId && ours.has(a.threadId))),
    );
    const seen = new Set<string>();
    const result: SyncOutcome = {
      ...none(changes.started ? (row.sync_cursor ? "restarted" : "started") : "synced"),
    };
    for (const a of wanted) {
      if (Date.now() >= until) {
        behind = true;
        break;
      }
      if (seen.has(a.id)) continue;
      seen.add(a.id);
      try {
        const got = await takeArrival(db, { row, token: t.token, ours, own, at, now, log, sorting, until }, a);
        if (got === "paced") {
          // The provider's pace: what is left waits for the next sync, from the cursor where it was.
          behind = true;
          break;
        }
        if (got === "unreadable") result.unreadable++;
        else if (got !== "gone") result.read++;
        const counted = COUNTED[got];
        if (counted) result[counted]++;
      } catch (err) {
        behind = true;
        log.error("mailbox_sync_failed", { mailbox: row.id, stage: "message", message: a.id, error: errField(err) });
      }
    }
    // Everything read and applied moves the cursor on; a message left behind keeps it, and the next sync reads again.
    await end(behind ? null : changes.cursor, null);
    log.info("mailbox_synced", { mailbox: row.id, ...result, arrived: arrived.length, behind });
    return result;
  } catch (err) {
    log.error("mailbox_sync_failed", { mailbox: row.id, stage: "sync", error: errField(err) });
    await end(null, "Could not read the mailbox.");
    return none("failed");
  }
}
