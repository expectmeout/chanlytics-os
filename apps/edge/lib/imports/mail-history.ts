/**
 * A connected mailbox's six months (decision 0073, R19): the mail it holds from before it connected, read a page at a
 * time through its own grant, each message sorted as the live read sorts it (email/mailbox/mailbox-sorting.ts). An
 * email a person wrote, and one the owner sent to one person, is kept in that person's thread as before Chanlytics (db
 * keepBefore, ingest_before: the person resolved as a client list's would be, the message once by its provider id,
 * never answered, never a yes, never today's); everything else (lists, receipts, notifications, automatic replies, what
 * Gmail filed as promotions, social or forums, a notice from a stranger in Updates, what the workspace said is
 * automated, mail to many) is left where it is, counted as dropped and noted one line a sender. A booking tool's notice
 * is dropped too: a mailbox hands over no proof of who sent it (channels mailbox-read.ts), so it is never read as a
 * booking; the calendar brings the visits.
 *
 * The window ends where the mailbox connected, and the live read (mailbox-sync.ts) starts there: nothing is read twice
 * and nothing between them is missed. The cursor (the ledger's job_cursor) is the window, the provider's page and how
 * far into it a part got, so a part that stops mid-page picks up at the next message.
 *
 * A message the mailbox refuses to hand over (mailbox-sync.ts readEmail) is counted unreadable and gone on without, so
 * one odd message never holds the rest back. The mailbox's pace or quota of requests is no failure: the part notes
 * where it stood and ends, and the next part reads on after a rest (restAfterPace), never using up the ledger's tries.
 * A provider that cannot be asked now throws, after the part notes what it brought and where it stood, and the job
 * ledger tries it again from there (RETRY_WAITS_MS).
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  emailPlainText,
  gmailListSince,
  gmailSignedOut,
  graphListSince,
  graphSignedOut,
  type MailboxEmail,
  type MailWindow,
  type ReadVerdict,
} from "../packages/channels.js";
import {
  DAY_MS,
  HISTORY_BACK_DAYS,
  IMPORT_STOPPED_WORDS,
  MIN_MS,
  SECOND_MS,
  normalizeEmail,
} from "../packages/contracts.js";
import { EMAIL_BODY_MAX } from "../packages/core.js";
import {
  importCursorOf,
  keepBefore,
  knownThreads,
  mailboxConnectionOf,
  noteImport,
  type Database,
  type Json,
  type MailboxConnectionRow,
} from "../packages/db.js";
import { tokenFor } from "../email/mailbox/mailbox-credentials.js";
import { markSignedOut } from "../email/mailbox/mailbox-wire.js";
import { mailboxEmailMeta, readEmail } from "../email/mailbox/mailbox-sync.js";
import {
  leftWhy,
  mailSortingFor,
  noteLeft,
  type MailSorting,
  type SortedWhy,
} from "../email/mailbox/mailbox-sorting.js";
import type { Part, PartOutcome } from "./history-import.js";
import type { Logger } from "../log.js";

type Db = SupabaseClient<Database>;

/**
 * How many messages in a row the mailbox may refuse before the part stops and is tried again: one odd message is gone
 * on without, counted and said; a run of them is the grant or the provider.
 */
const REFUSED_IN_A_ROW = 3;

/** How long the next part waits after the mailbox paced the reads (restAfterPace): a minute; ten after a part read nothing. */
const PACE_REST_MS = MIN_MS;
const PACE_REST_IDLE_MS = 10 * MIN_MS;

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
  return { address: from, name: e.from?.name ?? null, out: false };
}

/** The reasons the mailbox leaves an email by where Gmail filed it: never a reply in a thread a reach-out started. */
const BY_GMAIL_TAB: ReadonlySet<SortedWhy> = new Set(["gmail_tab", "updates"]);

/**
 * Why the six months leave what someone else wrote (mailbox-sorting.ts leftWhy), or null to keep it. Where Gmail filed
 * it leaves nothing inside a thread a reach-out started: a reply there is a reply, whatever Gmail calls it. A mailbox
 * connected again reads back over its earlier connection's months, reach-outs among them; the threads are asked only
 * when a tab alone would leave one.
 */
async function leftByImport(r: MailRead, e: MailboxEmail): Promise<SortedWhy | null> {
  const why = await leftWhy(e, r.sorting);
  if (!why || !BY_GMAIL_TAB.has(why) || !e.threadId) return why;
  return (await knownThreads(r.db, r.part.tenantId, [e.threadId])).has(e.threadId) ? null : why;
}

/** The mailbox's history stopped: said on its row, with Try again; nothing more is scheduled. */
async function mailStopped(db: Db, part: Part, error: string): Promise<PartOutcome> {
  // Added to, never set: what earlier parts brought stays counted.
  await noteImport(db, { tenantId: part.tenantId, source: "mailbox", state: "failed", error, add: true });
  return { more: false };
}

/** One part's read of the mailbox: what it reads through, the window it reads, and where in it the part began. */
interface MailRead {
  db: Db;
  part: Part;
  row: MailboxConnectionRow;
  token: string;
  window: MailWindow;
  began: { page: string | null; at: number };
  /** What the workspace said of its senders, read once a part (mailbox-sorting.ts). */
  sorting: MailSorting;
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
 * The mailbox's pace or quota of requests, which is no failure: what the part brought is noted with the message it
 * stopped at, the part ends, and the next reads on from there after a rest: the provider's Retry-After when it said one,
 * else a minute, or ten when this part read nothing, so a quota that has run out is not asked every minute.
 */
async function restAfterPace(
  r: MailRead,
  tally: MailTally,
  where: { page: string | null; at: number },
  v: ReadVerdict,
): Promise<PartOutcome> {
  const moved = where.page !== r.began.page || where.at !== r.began.at;
  const restMs = Math.max(v.retryAfterMs ?? 0, moved ? PACE_REST_MS : PACE_REST_IDLE_MS);
  r.part.log.info("history_part_paced", { mailbox: r.row.id, status: v.status, reason: v.reason, rest_ms: restMs });
  await noteMail(r, tally, where, { state: "running", partsDone: r.part.n });
  return { more: true, restMs };
}

/**
 * One listed message: read, and kept in its person's thread as before Chanlytics, or left and counted. Refused when the
 * mailbox will not hand it over (said here; the part counts it); the provider's verdict when it paces the reads. Throws
 * when the provider could not be asked now.
 */
async function takeListed(
  r: MailRead,
  tally: MailTally,
  l: { id: string; from?: string | null },
): Promise<"taken" | "refused" | ReadVerdict> {
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
  if ("paced" in read) return read.paced;
  const e = read.email;
  const who = mailPersonOf(e, r.row.address.toLowerCase());
  const why = who && !who.out ? await leftByImport(r, e) : null;
  if (why) await noteLeft(r.db, r.part.tenantId, e, why);
  if (!who || why) {
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
    // Its words as the live read keeps them: an email with only HTML (a bank's alert, a form) is made plain text. It had
    // been kept with none, and its person read "Not heard from" beside "They wrote" (27 Oct 2026).
    body: emailPlainText(e)?.slice(0, EMAIL_BODY_MAX) ?? null,
    at: when,
    meta: mailboxEmailMeta(e, r.row.id),
  });
  if (kept.erased) return "taken";
  if (kept.kept) counts.messages++;
  if (kept.newPerson) counts.people++;
  const ms = Date.parse(when);
  if (Number.isFinite(ms)) tally.oldest = tally.oldest === null ? ms : Math.min(tally.oldest, ms);
  return "taken";
}

/** How many of a sender's emails one bring-in reads: a press's worth, inside one request. */
const BRING_IN_MAX = 50;
const BRING_IN_MS = 40 * SECOND_MS;

/**
 * A sender the owner said is a person, brought in (00483): their mail from six months before the mailbox connected up to
 * now, read as the six months read any (takeListed, whose sorting now finds them a person), at most BRING_IN_MAX in
 * one press, each kept as before Chanlytics in their thread. Answers how many were kept; throws when the mailbox could
 * not be listed. The provider's pace ends it early: what came in stands.
 */
export async function bringInSender(p: {
  db: Db;
  row: MailboxConnectionRow;
  token: string;
  address: string;
  log: Logger;
}): Promise<number> {
  const connected = Date.parse(p.row.connected_at);
  const back = (Number.isFinite(connected) ? connected : Date.now()) - HISTORY_BACK_DAYS * DAY_MS;
  const window: MailWindow = { from: new Date(back).toISOString(), to: new Date().toISOString(), sender: p.address };
  const listed =
    p.row.provider === "microsoft"
      ? await graphListSince(p.token, window, null)
      : await gmailListSince(p.token, window, null);
  if (!listed.ok) throw new Error(`the sender's mail could not be listed: ${listed.reply.status}`);
  const part: Part = {
    tenantId: p.row.tenant_id,
    connectionId: p.row.id,
    n: 0,
    until: Date.now() + BRING_IN_MS,
    log: p.log,
  };
  const r: MailRead = {
    db: p.db,
    part,
    row: p.row,
    token: p.token,
    window,
    began: { page: null, at: 0 },
    sorting: await mailSortingFor(p.db, p.row.tenant_id),
  };
  const tally: MailTally = { counts: { messages: 0, people: 0, dropped: 0 }, oldest: null };
  for (const l of listed.listed.slice(0, BRING_IN_MAX)) {
    if (Date.now() >= part.until) break;
    if (typeof (await takeListed(r, tally, l)) === "object") break;
  }
  return tally.counts.messages;
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

  const r: MailRead = {
    db,
    part,
    row,
    token: t.token,
    window: cur.window,
    began: { page: cur.page, at: cur.at },
    sorting: await mailSortingFor(db, part.tenantId),
  };
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
      let took: "taken" | "refused" | ReadVerdict;
      try {
        took = await takeListed(r, tally, l);
      } catch (err) {
        return askAgain(r, tally, { page, at }, err instanceof Error ? err.message : String(err));
      }
      if (typeof took === "object") return restAfterPace(r, tally, { page, at }, took);
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
