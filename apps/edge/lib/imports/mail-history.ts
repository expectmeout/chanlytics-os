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
import { fetchEmail } from "../email/mailbox/mailbox-sync.js";
import type { Part, PartOutcome } from "./history-import.js";

type Db = SupabaseClient<Database>;

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

  const own = row.address.toLowerCase();
  const counts = { messages: 0, people: 0, dropped: 0 };
  let oldest: number | null = null;
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
      // A provider that could not be asked now: the part is tried again (the job ledger), from the cursor it left.
      throw new Error(`the mailbox's past could not be listed: ${listed.reply.status}`);
    }
    for (; at < listed.listed.length; at++) {
      if (Date.now() >= part.until) break pages;
      const l = listed.listed[at];
      if (!l) continue;
      // Graph names the sender before the message is read: a delivery report or the mailbox's own bulk is not read.
      if (l.from && /^(mailer-daemon|postmaster)@/.test(l.from)) {
        counts.dropped++;
        continue;
      }
      const e = await fetchEmail(row, t.token, l.id);
      if (!e) continue;
      const who = mailPersonOf(e, own);
      if (!who) {
        counts.dropped++;
        continue;
      }
      const when = e.createdAt ?? cur.window.to;
      const kept = await keepBefore(db, {
        tenantId: part.tenantId,
        channel: "email",
        external: who.address,
        phone: null,
        email: who.address,
        name: who.name,
        messageId: e.id,
        direction: who.out ? "outbound" : "inbound",
        body: e.text ? e.text.slice(0, EMAIL_BODY_MAX) : null,
        at: when,
        meta: mailMetaOf(e, row),
      });
      if (kept.erased) continue;
      if (kept.kept) counts.messages++;
      if (kept.newPerson) counts.people++;
      const ms = Date.parse(when);
      if (Number.isFinite(ms)) oldest = oldest === null ? ms : Math.min(oldest, ms);
    }
    page = listed.next;
    at = 0;
    if (!page) {
      done = true;
      break;
    }
  }
  await noteImport(db, {
    tenantId: part.tenantId,
    source: "mailbox",
    state: done ? "done" : "running",
    counts,
    add: true,
    partsDone: part.n,
    oldest: oldest === null ? null : new Date(oldest).toISOString(),
    via: row.provider,
    cursor: { connection: row.id, window: { from: cur.window.from, to: cur.window.to }, page, at },
  });
  return { more: !done };
}
