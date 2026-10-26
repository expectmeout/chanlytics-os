/**
 * A connected mailbox's six months (decision 0073, R19): the mail it holds from before it connected, read a page at a
 * time through its own grant, each message sorted as the intake sorts any email (channels classifyReceived). An email a
 * person wrote, and one the owner sent to one person, is kept in that person's thread as before Chanlytics (db
 * keepBefore, ingest_before: the person resolved as a client list's would be, the message once by its provider id, never
 * answered, never a yes, never today's); everything else (lists, receipts, notifications, automatic replies, mail to
 * many) is left where it is and counted as dropped. A booking tool's notice is dropped too: a mailbox hands over no proof
 * of who sent it (channels mailbox-read.ts), so it is never read as a booking; the calendar brings the visits.
 *
 * The window ends where the mailbox connected, and the live read (mailbox-sync.ts) starts there: nothing is read twice
 * and nothing between them is missed. The cursor (the ledger's job_cursor) is the window, the provider's page and how
 * far into it a part got, so a part that stops mid-page picks up at the next message.
 *
 * A message the mailbox refuses to hand over (mailbox-sync.ts readEmail) is counted unreadable and gone on without, so
 * one odd message never holds the rest back. A provider that cannot be asked now throws, after the part notes what it
 * brought and where it stood, and the job ledger tries it again from there (RETRY_WAITS_MS).
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  classifyReceived,
  gmailListSince,
  gmailSignedOut,
  graphListSince,
  graphSignedOut,
  messageIdsIn,
  type MailboxEmail,
  type MailWindow,
} from "../packages/channels.js";
import { DAY_MS, HISTORY_BACK_DAYS, IMPORT_STOPPED_WORDS, normalizeEmail } from "../packages/contracts.js";
import { EMAIL_BODY_MAX } from "../packages/core.js";
import {
  importCursorOf,
  keepBefore,
  mailboxConnectionOf,
  noteImport,
  type Database,
  type Json,
  type MailboxConnectionRow,
} from "../packages/db.js";
import { tokenFor } from "../email/mailbox/mailbox-credentials.js";
import { markSignedOut } from "../email/mailbox/mailbox-wire.js";
import { readEmail } from "../email/mailbox/mailbox-sync.js";
import type { Part, PartOutcome } from "./history-import.js";

type Db = SupabaseClient<Database>;

/**
 * How many messages in a row the mailbox may refuse before the part stops and is tried again: one odd message is gone
 * on without, counted and said; a run of them is the grant or the provider.
 */
const REFUSED_IN_A_ROW = 3;

/**
 * Where the read stands: the mailbox it reads (Try again finds it there), its window, the provider's page it is on (null
 * for the first), and how far into it.
 */
interface MailCursor {
  window: MailWindow;
  page: string | null;
  at: number;
}

function cursorOf(raw: Json | null): MailCursor | null {
  const c = raw && typeof raw === "object" && !Array.isArray(raw) ? (raw as Record<string, unknown>) : null;
  const w = c?.window as Record<string, unknown> | undefined;
  if (!w || typeof w.from !== "string" || typeof w.to !== "string") return null;
  return {
    window: { from: w.from, to: w.to },
    page: typeof c?.page === "string" ? c.page : null,
    at: typeof c?.at === "number" && c.at >= 0 ? c.at : 0,
  };
}

/** The first window: six months before the mailbox connected, up to the moment it did. */
function firstWindow(row: MailboxConnectionRow): MailWindow {
  const connected = Date.parse(row.connected_at);
  const to = Number.isFinite(connected) ? connected : Date.now();
  return { from: new Date(to - HISTORY_BACK_DAYS * DAY_MS).toISOString(), to: new Date(to).toISOString() };
}

/** Who a message is with: the person who wrote it, or the one person the owner wrote to; null for anything else. */
function mailPersonOf(e: MailboxEmail, own: string): { address: string; name: string | null; out: boolean } | null {
  const from = normalizeEmail(e.from?.address);
  if (!from) return null;
  if (from === own) {
    const to = [
      ...new Set([...e.to, ...e.cc].map((a) => normalizeEmail(a)).filter((a): a is string => !!a && a !== own)),
    ];
    const [only] = to;
    return to.length === 1 && only ? { address: only, name: null, out: true } : null;
  }
  return classifyReceived(e) === "person" ? { address: from, name: e.from?.name ?? null, out: false } : null;
}

/** What the row keeps of an email beside its words, as the intake keeps it: enough to thread under it and say who. */
function mailMetaOf(e: MailboxEmail, row: MailboxConnectionRow): Json {
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
    mailbox_id: row.id,
    thread_id: e.threadId,
  };
}

/** The mailbox's history stopped: said on its row, with Try again; nothing more is scheduled. */
async function mailStopped(db: Db, part: Part, error: string): Promise<PartOutcome> {
  // Added to, never set: what earlier parts brought stays counted.
  await noteImport(db, { tenantId: part.tenantId, source: "mailbox", state: "failed", error, add: true });
  return { more: false };
}

/** One part's read of the mailbox: what it reads through, and the window it reads. */
interface MailRead {
  db: Db;
  part: Part;
  row: MailboxConnectionRow;
  token: string;
  window: MailWindow;
}

/** What a part brought: its counts, and the oldest message it kept. */
interface MailTally {
  counts: { messages: number; people: number; dropped: number; unreadable?: number };
  oldest: number | null;
}

/**
 * Where a part stands, on its row: as it ends (its number among the parts done), and before it throws, so the next
 * part or try reads on from here.
 */
function noteMail(
  r: MailRead,
  tally: MailTally,
  where: { page: string | null; at: number },
  end: { state: "running" | "done"; partsDone?: number },
): Promise<void> {
  return noteImport(r.db, {
    tenantId: r.part.tenantId,
    source: "mailbox",
    state: end.state,
    counts: tally.counts,
    add: true,
    ...(end.partsDone ? { partsDone: end.partsDone } : {}),
    oldest: tally.oldest === null ? null : new Date(tally.oldest).toISOString(),
    via: r.row.provider,
    cursor: { connection: r.row.id, window: { from: r.window.from, to: r.window.to }, ...where },
  });
}

/** A provider that could not be asked now: what came in is noted, and the job ledger tries the part again. */
async function askAgain(
  r: MailRead,
  tally: MailTally,
  where: { page: string | null; at: number },
  why: string,
): Promise<never> {
  await noteMail(r, tally, where, { state: "running" });
  throw new Error(why);
}

/**
 * One listed message: read, and kept in its person's thread as before Chanlytics, or left and counted. Refused when the
 * mailbox will not hand it over (said here; the part counts it). Throws when the provider could not be asked now.
 */
async function takeListed(r: MailRead, tally: MailTally, l: { id: string; from?: string | null }) {
  const { counts } = tally;
  // Graph names the sender before the message is read: a delivery report or the mailbox's own bulk is not read.
  if (l.from && /^(mailer-daemon|postmaster)@/.test(l.from)) {
    counts.dropped++;
    return "taken";
  }
  const read = await readEmail(r.row, r.token, l.id);
  if ("gone" in read) return "taken";
  if ("refused" in read) {
    r.part.log.warn("mailbox_message_unreadable", {
      mailbox: r.row.id,
      message: l.id,
      stage: "history",
      ...read.refused,
    });
    return "refused";
  }
  const e = read.email;
  const who = mailPersonOf(e, r.row.address.toLowerCase());
  if (!who) {
    counts.dropped++;
    return "taken";
  }
  const when = e.createdAt ?? r.window.to;
  const kept = await keepBefore(r.db, {
    tenantId: r.part.tenantId,
    channel: "email",
    external: who.address,
    phone: null,
    email: who.address,
    name: who.name,
    messageId: e.id,
    direction: who.out ? "outbound" : "inbound",
    body: e.text ? e.text.slice(0, EMAIL_BODY_MAX) : null,
    at: when,
    meta: mailMetaOf(e, r.row),
  });
  if (kept.erased) return "taken";
  if (kept.kept) counts.messages++;
  if (kept.newPerson) counts.people++;
  const ms = Date.parse(when);
  if (Number.isFinite(ms)) tally.oldest = tally.oldest === null ? ms : Math.min(tally.oldest, ms);
  return "taken";
}

export async function mailHistoryPart(db: Db, part: Part): Promise<PartOutcome> {
  if (!part.connectionId) return mailStopped(db, part, IMPORT_STOPPED_WORDS.removed);
  const row = await mailboxConnectionOf(db, part.tenantId, part.connectionId);
  if (!row || row.state === "removed") return mailStopped(db, part, IMPORT_STOPPED_WORDS.removed);
  const now = Date.now();
  const t = await tokenFor(db, row, now);
  if (!t.ok) {
    if (t.why === "signed_out") await markSignedOut(db, row, part.log, now);
    return mailStopped(db, part, IMPORT_STOPPED_WORDS.signedOut);
  }
  const cur = cursorOf(await importCursorOf(db, part.tenantId, "mailbox")) ?? {
    window: firstWindow(row),
    page: null,
    at: 0,
  };
  await noteImport(db, { tenantId: part.tenantId, source: "mailbox", state: "running", via: row.provider, add: true });

  const r: MailRead = { db, part, row, token: t.token, window: cur.window };
  const tally: MailTally = { counts: { messages: 0, people: 0, dropped: 0 }, oldest: null };
  let { page, at } = cur;
  let done = false;
  pages: while (Date.now() < part.until) {
    const listed =
      row.provider === "microsoft"
        ? await graphListSince(t.token, cur.window, page)
        : await gmailListSince(t.token, cur.window, page);
    if (!listed.ok) {
      const out = row.provider === "microsoft" ? graphSignedOut(listed.reply) : gmailSignedOut(listed.reply);
      if (out) {
        await markSignedOut(db, row, part.log, Date.now());
        return mailStopped(db, part, IMPORT_STOPPED_WORDS.signedOut);
      }
      return askAgain(r, tally, { page, at }, `the mailbox's past could not be listed: ${listed.reply.status}`);
    }
    let refusedInARow = 0;
    for (; at < listed.listed.length; at++) {
      if (Date.now() >= part.until) break pages;
      const l = listed.listed[at];
      if (!l) continue;
      let took: "taken" | "refused";
      try {
        took = await takeListed(r, tally, l);
      } catch (err) {
        return askAgain(r, tally, { page, at }, err instanceof Error ? err.message : String(err));
      }
      if (took === "taken") {
        refusedInARow = 0;
        continue;
      }
      if (++refusedInARow < REFUSED_IN_A_ROW) {
        tally.counts.unreadable = (tally.counts.unreadable ?? 0) + 1;
        continue;
      }
      // A run of them is the grant or the provider, not the messages: none is counted, and the next try reads the run.
      tally.counts.unreadable = (tally.counts.unreadable ?? 0) - (refusedInARow - 1);
      if (!tally.counts.unreadable) delete tally.counts.unreadable;
      return askAgain(
        r,
        tally,
        { page, at: at - (refusedInARow - 1) },
        `the mailbox refused ${refusedInARow} messages in a row`,
      );
    }
    page = listed.next;
    at = 0;
    if (!page) {
      done = true;
      break;
    }
  }
  await noteMail(r, tally, { page, at }, { state: done ? "done" : "running", partsDone: part.n });
  return { more: !done };
}
