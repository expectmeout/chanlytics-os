/**
 * A connected mailbox read back (decision 0056, and 0073's R13: the business's email is its mailbox): what arrived in it
 * since its cursor, under any label or folder (a reply a rule filed away, or one taken for junk, is a reply all the
 * same). What sits in a thread a reach-out started (00424 mailbox_threads_known) is read whatever it is, a delivery
 * report is applied, and anything else is read for what it claims to be (channels classifyReceived, the intake's own
 * sorting): an email a person wrote is taken in, as the hosted mailbox takes one in, and the rest (lists, receipts,
 * notifications, automatic replies) is left where it is and counted. Gmail's reports are found by who wrote them (a
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
  gmailEmailOf,
  gmailHistory,
  gmailMessage,
  gmailProfile,
  gmailReadRefusal,
  gmailReports,
  graphDelta,
  graphEmailOf,
  graphJunkSince,
  graphMessage,
  graphReadRefusal,
  type EmailReceipt,
  type MailboxEmail,
  type ReadRefusal,
} from "../../packages/channels.js";
import { MIN_MS, DAY_MS } from "../../packages/contracts.js";
import {
  endMailboxSync,
  knownThreads,
  patchMailboxConnection,
  sentEmailIdByMessageId,
  sentEmailOf,
  takeMailboxSync,
  type Database,
  type MailboxConnectionRow,
} from "../../packages/db.js";
import { scheduleJobOnce } from "../../packages/jobs.js";
import { applyEmailReceipt } from "../email-receipts.js";
import { tokenFor } from "./mailbox-credentials.js";
import { markSignedOut } from "./mailbox-wire.js";
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
  /** The mailbox's own sending or drafting (Gmail's SENT or DRAFT): never read. */
  mine?: boolean;
}

/** Gmail's labels that say a message is spam or thrown away, and the ones that say it is the mailbox's own. */
const GMAIL_JUNK = new Set(["SPAM", "TRASH"]);
const GMAIL_MINE = new Set(["SENT", "DRAFT"]);

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
        mine: a.labels.some((l) => GMAIL_MINE.has(l)),
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
 * nothing an email can be read from); or refused,
 * when the provider will not hand over that one message (channels gmailReadRefusal, graphReadRefusal), which a reader
 * goes on without and says so. Anything else (the grant, a pace of requests, the provider's bad minute) throws, and the
 * read is asked again.
 */
type EmailRead = { email: MailboxEmail } | { gone: true } | { refused: ReadRefusal };

export async function readEmail(row: MailboxConnectionRow, token: string, id: string): Promise<EmailRead> {
  const microsoft = row.provider === "microsoft";
  const r = microsoft ? await graphMessage(token, id) : await gmailMessage(token, id);
  if (r.outcome === "ok") {
    const email = microsoft ? graphEmailOf(r.json) : gmailEmailOf(r.json);
    return email ? { email } : { gone: true };
  }
  if (r.status === 404) return { gone: true };
  const refused = microsoft ? graphReadRefusal(r) : gmailReadRefusal(r);
  if (refused) return { refused };
  throw new Error(`cannot read message ${id}: ${r.status}`);
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
 * What one arrival came to: gone, refused by the provider (gone on without), read and left, a report applied, left
 * where it is, or handed to the intake.
 */
type ArrivalTaken = "gone" | "unreadable" | "left" | "bounced" | "dropped" | "reply" | "person";

/** The count each arrival adds to, where it adds to one beyond `read`. */
const COUNTED: Partial<Record<ArrivalTaken, "bounced" | "dropped" | "replies" | "people">> = {
  bounced: "bounced",
  dropped: "dropped",
  reply: "replies",
  person: "people",
};

/**
 * One arrival, read in full and taken: the mailbox's own send and a report that names nothing of ours are left; a
 * report is applied as a receipt; inside a thread of ours anything is a reply; outside one, only what a person wrote is
 * taken in (R13), and a report, a list, a receipt, a notification or an automatic reply is left where it is, counted.
 * One the provider refuses to hand over is said and gone on without, so it never holds the cursor back.
 */
async function takeArrival(
  db: Db,
  p: { row: MailboxConnectionRow; token: string; ours: Set<string>; own: string; at: Date; now: number; log: Logger },
  a: Arrived,
): Promise<ArrivalTaken> {
  const { row, ours, own, at } = p;
  const read = await readEmail(row, p.token, a.id);
  if ("gone" in read) return "gone";
  if ("refused" in read) {
    p.log.warn("mailbox_message_unreadable", { mailbox: row.id, message: a.id, stage: "sync", ...read.refused });
    return "unreadable";
  }
  const e = read.email;
  if (e.from?.address.toLowerCase() === own) return "left";
  const receipt = await reportReceipt(db, row, e, p.now);
  if (receipt === "none") return "left";
  if (receipt) {
    await applyEmailReceipt(db, receipt, at.toISOString());
    return "bounced";
  }
  const inOurs = (!!a.threadId && ours.has(a.threadId)) || (!!e.threadId && ours.has(e.threadId));
  if (!inOurs && (a.report || (a.from !== null && REPORTER.test(a.from)) || classifyReceived(e) !== "person"))
    return "dropped";
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
    // Every arrival is read but the mailbox's own (its sends and drafts: Graph names the sender up front, Gmail labels
    // them) and spam outside a thread of ours: a thread of ours whatever it is, a report however it is threaded, and
    // anything else for what it claims to be (R13).
    const ours = await knownThreads(
      db,
      row.tenant_id,
      arrived.map((a) => a.threadId).filter((t): t is string => !!t),
    );
    const own = row.address.toLowerCase();
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
        const got = await takeArrival(db, { row, token: t.token, ours, own, at, now, log }, a);
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
