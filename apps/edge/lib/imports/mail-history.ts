/**
 * A connected mailbox's six months (decision 0073, R19; decision 0080): the mail it holds from before it connected, read
 * a page at a time through its own grant, each message sorted as the live read sorts it (email/mailbox/mailbox-sorting.ts).
 * An email a person wrote, and one the owner sent to one person, is kept in that person's thread as before Chanlytics
 * (db keepBefore, ingest_before: the person resolved as a client list's would be, the message once by its provider id,
 * never answered, never a yes, never today's); everything else (lists, receipts, notifications, automatic replies, what
 * Gmail filed as promotions, social or forums, a notice from a stranger in Updates or through a mailing service, what the
 * workspace said is automated, a sender read as selling to the business or as a program, mail to many) is left where it
 * is, counted as dropped and noted one line a sender. A booking tool's notice is dropped too: a mailbox hands over no
 * proof of who sent it (channels mailbox-read.ts), so it is never read as a booking; the calendar brings the visits.
 *
 * Gmail's mailbox is read the way a person would read it (decision 0080): what the owner sent first, so whom they write
 * to is known before the mail written to them is judged, then the rest, drafts never; and each received message by its
 * headers first (format=metadata), so what the rules leave on them is never read whole. Graph's road reads everything at
 * once, every message whole, as it did (Microsoft is halted, 27 Oct 2026).
 *
 * The window ends where the mailbox connected, and the live read (mailbox-sync.ts) starts there: nothing is read twice
 * and nothing between them is missed. The cursor (the ledger's job_cursor) is the window, which of the mailbox's mail
 * the part reads, the provider's page and how far into it a part got, so a part that stops mid-page picks up at the next
 * message.
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
  senderLeftWhy,
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
  mailSortingFor,
  noteLeft,
  sortByRules,
  type MailSorting,
  type RulesSay,
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
 * Which of the mailbox's mail a part reads: what the owner sent, then the rest (Gmail's, decision 0080); or all of it at
 * once (Graph's, a sender brought in, and a run that began before the two were read apart).
 */
type MailPhase = "sent" | "received" | "all";

/** Where in the window a part stands: which mail, the provider's page it is on (null for the first), and how far into it. */
interface MailPlace {
  phase: MailPhase;
  page: string | null;
  at: number;
}

/** Where the read stands: the mailbox it reads (Try again finds it there), its window, and its place in it. */
interface MailCursor extends MailPlace {
  window: MailWindow;
}

function cursorOf(raw: Json | null): MailCursor | null {
  const c = raw && typeof raw === "object" && !Array.isArray(raw) ? (raw as Record<string, unknown>) : null;
  const w = c?.window as Record<string, unknown> | undefined;
  if (!w || typeof w.from !== "string" || typeof w.to !== "string") return null;
  return {
    window: { from: w.from, to: w.to },
    phase: c?.phase === "sent" || c?.phase === "received" ? c.phase : "all",
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

/** Where a first run starts: Gmail with what the owner sent, Graph with everything. */
const firstPhase = (row: MailboxConnectionRow): MailPhase => (row.provider === "microsoft" ? "all" : "sent");

/** The window a phase lists: the mail it reads of the cursor's window. */
const listedIn = (window: MailWindow, phase: MailPhase): MailWindow =>
  phase === "all" ? window : { ...window, only: phase };

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

/**
 * The reasons a thread a reach-out started overrules: where Gmail filed an email, a mailing service, and what was read
 * or said of its sender. A reply there is a reply, whatever it looks like; what an email claims (a report, an automatic
 * reply) still stands.
 */
const OVERRULED_IN_A_REACH_OUT: ReadonlySet<SortedWhy> = new Set<SortedWhy>([
  "gmail_tab",
  "updates",
  "service",
  "pitch",
  "notice",
  "relayed",
  "others_said",
]);

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
  /** Which mail is being read now: a part that finishes what the owner sent reads on into the rest. */
  phase: MailPhase;
  began: MailPlace;
  /** What the workspace said of its senders, and what it knows of them, read once a part (mailbox-sorting.ts). */
  sorting: MailSorting;
  /** Whether a thread is one a reach-out started, asked once a thread a part. */
  reached: Map<string, boolean>;
}

/** What a part brought: its counts, and the oldest message it kept. */
interface MailTally {
  counts: { messages: number; people: number; dropped: number; unreadable?: number; asked?: number };
  oldest: number | null;
}

/**
 * Where a part stands, on its row: as it ends (its number among the parts done), and before it throws, so the next
 * part or try reads on from here.
 */
function noteMail(
  r: MailRead,
  tally: MailTally,
  where: MailPlace,
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
async function askAgain(r: MailRead, tally: MailTally, where: MailPlace, why: string): Promise<never> {
  await noteMail(r, tally, where, { state: "running" });
  throw new Error(why);
}

/**
 * The mailbox's pace or quota of requests, which is no failure: what the part brought is noted with the message it
 * stopped at, the part ends, and the next reads on from there after a rest: the provider's Retry-After when it said one,
 * else a minute, or ten when this part read nothing, so a quota that has run out is not asked every minute.
 */
async function restAfterPace(r: MailRead, tally: MailTally, where: MailPlace, v: ReadVerdict): Promise<PartOutcome> {
  const moved = where.phase !== r.began.phase || where.page !== r.began.page || where.at !== r.began.at;
  const restMs = Math.max(v.retryAfterMs ?? 0, moved ? PACE_REST_MS : PACE_REST_IDLE_MS);
  r.part.log.info("history_part_paced", { mailbox: r.row.id, status: v.status, reason: v.reason, rest_ms: restMs });
  await noteMail(r, tally, where, { state: "running", partsDone: r.part.n });
  return { more: true, restMs };
}

/** Whether an email sits in a thread a reach-out started, asked once a thread a part. */
async function inAReachOut(r: MailRead, e: MailboxEmail): Promise<boolean> {
  const t = e.threadId;
  if (!t) return false;
  const had = r.reached.get(t);
  if (had !== undefined) return had;
  const yes = (await knownThreads(r.db, r.part.tenantId, [t])).has(t);
  r.reached.set(t, yes);
  return yes;
}

/**
 * What the rules say of what someone else wrote (mailbox-sorting.ts sortByRules), a thread a reach-out started taking in
 * what only a tab, a mailing service or what was read of its sender would leave, and its stranger too: never read. A
 * mailbox connected again reads back over its earlier connection's months, reach-outs among them; the threads are asked
 * only when such a reason alone would leave an email.
 */
async function rulesOfImport(r: MailRead, e: MailboxEmail): Promise<RulesSay> {
  const say = await sortByRules(e, r.sorting);
  if (say === "in" || (say !== "stranger" && !OVERRULED_IN_A_REACH_OUT.has(say))) return say;
  return (await inAReachOut(r, e)) ? "in" : say;
}

/**
 * Why the six months leave what someone else wrote, or null to keep it: the rules, then a stranger's first email read
 * (mailbox-reader.ts), which counts one more who asked about the business's services where it reads them so.
 */
async function leftByImport(r: MailRead, tally: MailTally, e: MailboxEmail): Promise<SortedWhy | null> {
  const say = await rulesOfImport(r, e);
  if (say === "in") return null;
  if (say !== "stranger") return say;
  const read = await r.sorting.read(e, r.part.until);
  if (read?.kind === "inquiry") tally.counts.asked = (tally.counts.asked ?? 0) + 1;
  return read ? senderLeftWhy(read.kind) : null;
}

/** One message read, as a part goes on: the email, or what the part does with it (gone, refused, the provider's pace). */
type Listed = { email: MailboxEmail } | { done: "taken" | "refused" | ReadVerdict };

async function readListed(r: MailRead, id: string, how: "whole" | "head"): Promise<Listed> {
  const read = await readEmail(r.row, r.token, id, how);
  if ("gone" in read) return { done: "taken" };
  if ("refused" in read) {
    r.part.log.warn("mailbox_message_unreadable", {
      mailbox: r.row.id,
      message: id,
      stage: "history",
      ...read.refused,
    });
    return { done: "refused" };
  }
  if ("paced" in read) return { done: read.paced };
  return { email: read.email };
}

/**
 * Whether a message read by its headers alone is left on them, counted and noted: mail to many, or what someone else
 * wrote that the rules leave. What the owner wrote to one person, and what may come in, is read whole.
 */
async function leftOnItsHead(r: MailRead, tally: MailTally, head: MailboxEmail): Promise<boolean> {
  const who = mailPersonOf(head, r.row.address.toLowerCase());
  if (who?.out) return false;
  const say = who ? await rulesOfImport(r, head) : null;
  if (who && (say === "in" || say === "stranger")) return false;
  if (say && say !== "in" && say !== "stranger") await noteLeft(r.db, r.part.tenantId, head, say);
  tally.counts.dropped++;
  return true;
}

/** A message read whole: kept in its person's thread as before Chanlytics, or left and counted. */
async function keepOrLeave(r: MailRead, tally: MailTally, e: MailboxEmail): Promise<"taken"> {
  const { counts } = tally;
  const who = mailPersonOf(e, r.row.address.toLowerCase());
  const why = who && !who.out ? await leftByImport(r, tally, e) : null;
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

/**
 * One listed message: judged on its headers where the mailbox hands them over alone, then, where it may come in, read
 * whole and kept in its person's thread as before Chanlytics, or left and counted. Refused when the mailbox will not
 * hand it over (said here; the part counts it); the provider's verdict when it paces the reads. Throws when the provider
 * could not be asked now.
 */
async function takeListed(
  r: MailRead,
  tally: MailTally,
  l: { id: string; from?: string | null },
): Promise<"taken" | "refused" | ReadVerdict> {
  // Graph names the sender before the message is read: a delivery report or the mailbox's own bulk is not read.
  if (l.from && /^(mailer-daemon|postmaster)@/.test(l.from)) {
    tally.counts.dropped++;
    return "taken";
  }
  if (r.phase !== "all") {
    const head = await readListed(r, l.id, "head");
    if ("done" in head) return head.done;
    if (await leftOnItsHead(r, tally, head.email)) return "taken";
  }
  const read = await readListed(r, l.id, "whole");
  if ("done" in read) return read.done;
  return keepOrLeave(r, tally, read.email);
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
    phase: "all",
    began: { phase: "all", page: null, at: 0 },
    sorting: await mailSortingFor(p.db, p.row.tenant_id, p.log),
    reached: new Map(),
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
    phase: firstPhase(row),
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
    phase: cur.phase,
    began: { phase: cur.phase, page: cur.page, at: cur.at },
    sorting: await mailSortingFor(db, part.tenantId, part.log),
    reached: new Map(),
  };
  const tally: MailTally = { counts: { messages: 0, people: 0, dropped: 0 }, oldest: null };
  let { page, at } = cur;
  let done = false;
  pages: while (Date.now() < part.until) {
    const listed =
      row.provider === "microsoft"
        ? await graphListSince(t.token, cur.window, page)
        : await gmailListSince(t.token, listedIn(cur.window, r.phase), page);
    if (!listed.ok) {
      const out = row.provider === "microsoft" ? graphSignedOut(listed.reply) : gmailSignedOut(listed.reply);
      if (out) {
        await markSignedOut(db, row, part.log, Date.now());
        return mailStopped(db, part, IMPORT_STOPPED_WORDS.signedOut);
      }
      return askAgain(
        r,
        tally,
        { phase: r.phase, page, at },
        `the mailbox's past could not be listed: ${listed.reply.status}`,
      );
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
        return askAgain(r, tally, { phase: r.phase, page, at }, err instanceof Error ? err.message : String(err));
      }
      if (typeof took === "object") return restAfterPace(r, tally, { phase: r.phase, page, at }, took);
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
        { phase: r.phase, page, at: at - (refusedInARow - 1) },
        `the mailbox refused ${refusedInARow} messages in a row`,
      );
    }
    page = listed.next;
    at = 0;
    if (page) continue;
    // What the owner sent is read: the rest of the window now, whom they write to known.
    if (r.phase === "sent") {
      r.phase = "received";
      continue;
    }
    done = true;
    break;
  }
  await noteMail(r, tally, { phase: r.phase, page, at }, { state: done ? "done" : "running", partsDone: part.n });
  return { more: !done };
}
