/**
 * A kept bell row closes when what it announced stops waiting (decision 0048, point 2; the wiring plan's task 5.2, finding NS-3;
 * the wiring's second audit, lane R2).
 *
 * Kept rows have been marks only since the bell's rows were made durable: a row was unread until the owner read it or it aged
 * out. So the bell's badge and Today's "While you were away" went on counting "Campaign X is ready: 40 people. Nothing is sent
 * until you do" after the owner had approved the run, "A booking email needs a look" after the email was dismissed, "New on
 * Google" after the review was answered, and "Ana needs a person" after a teammate had answered Ana.
 *
 * Two layers close a row. The server closes what ended for good, for every member and device and the phone's icon
 * (notifications.closed_at, 00421): a hold resolved, a lead question settled, an offers pause lifted, a warning mended by the news
 * that mends it (notice-mends.ts). And the surfaces the browser already holds say whether a subject still waits now: the Sent
 * surface its runs, the Calendar's read the booking emails held for a look, the Google read its reviews, the Inbox its threads
 * (a hold snoozed or a teammate's no longer waits on you), the Leads read its searches. A row whose subject no surface holds is
 * left as it was, since a subject nobody read is not a subject that stopped waiting.
 *
 * Every kind the edge keeps says how its row ends (NOTICE_ENDS): news is told once and read when the owner reads it; a wait is
 * judged by its source; a warning is closed by its mend. A kind added to the set must say which before the package compiles.
 *
 * Pure: the bridge feeds it what its surfaces hold, the tests feed it fixtures.
 */
import { RUN_GOING_STATES } from "../broadcasts/broadcasts";
import { NEW_REVIEW_NEWS, reviewNoticeIsAbout } from "../google/google";
import { parseLeadsRoute } from "../leads/lead-plan";
import {
  SERVER_KEY_PREFIX,
  serverNotificationRows,
  settledRow,
  type NotificationRow,
  type NotificationsDto,
  type ServerNotificationKind,
} from "../today/notifications";
import { runWaitsOnYou, type RunDays, type WaitingRun } from "./waits";

/**
 * What one surface holds of the subjects a waiting row is about, and when it read them. A surface read BEFORE a notice was kept
 * cannot say whether that notice's subject waits (it had not heard of it), so a row newer than `readAt` is not judged by it.
 */
interface Held<T> {
  /** When the surface was read (asked), epoch ms. */
  readAt: number;
  held: T;
}

/** A run as the Sent surface holds it: what the approve verb asks of it, and the emails the check holds in it. */
export interface HeldRun extends WaitingRun {
  /** A reach-out's going run: how many of its emails the check holds; absent where it was not counted. */
  held?: number | null;
}

/** What the surfaces hold of the subjects a waiting row is about; null where a surface has not been read, which settles nothing. */
export interface WhatWaits {
  /** The campaign runs the Sent surface holds, by id. */
  runs: Held<ReadonlyMap<string, HeldRun>> | null;
  /** The business's days the runs are judged by (contracts runDaysAt); null where they are not known. */
  days: RunDays | null;
  /** The booking emails held for a look, by id, only where the whole list is known (the card lists at most twenty). */
  heldEmails: Held<ReadonlySet<string>> | null;
  /** The reviews the Google read holds, newest first: the row, Google's own id for it, and whether it has a reply. */
  reviews: Held<ReadonlyArray<{ id: string; reviewId?: string | null; replied: boolean }>> | null;
  /** The threads the Inbox holds, by conversation id: whether each needs you now; only where every waiting hold was read. */
  holds: Held<ReadonlyMap<string, boolean>> | null;
  /** The searches the Leads read holds, by id: the newest round's id and state (a search holds only its newest round). */
  searches: Held<ReadonlyMap<string, { roundId: string | null; state: string | null }>> | null;
}

/** Nothing known of any subject: no row closes. */
export const NOTHING_WAITS_KNOWN: WhatWaits = {
  runs: null,
  days: null,
  heldEmails: null,
  reviews: null,
  holds: null,
  searches: null,
};

/** What a surface holds, for a row it had already heard of: null before it was read, or when the row is newer than the read. */
const heldFor = <T>(source: Held<T> | null, kept: number): T | null =>
  source && kept <= source.readAt ? source.held : null;

/** Where a row's wait is judged: which surface holds what it announced. */
export type WaitSource = "run" | "email" | "review" | "hold" | "search";

/**
 * How a kind's row ends. `news` is told once and read when the owner reads it (`why` says why nothing closes it). `mended`:
 * some of its warnings close when the news that mends them is kept (notice-mends.ts NOTICE_MENDS); the rest are told once. A
 * wait is judged by its source, and the server closes it too where it ends for good (`server`, 00421).
 */
export type NoticeEnd =
  | { ends: "news"; why: string }
  | { ends: "mended" }
  | { ends: WaitSource; server?: "hold_resolved" | "question_settled" };

/** How every kind the edge keeps ends: a kind added to SERVER_NOTIFICATION_KINDS must say which before this compiles. */
export const NOTICE_ENDS: Record<ServerNotificationKind, NoticeEnd> = {
  handoff: { ends: "hold", server: "hold_resolved" },
  deadman: { ends: "hold", server: "hold_resolved" },
  call: { ends: "hold", server: "hold_resolved" },
  playbook: { ends: "run" },
  booking_notice: { ends: "email" },
  review: { ends: "review" },
  leads_question: { ends: "search", server: "question_settled" },
  // A number's flag, a sending domain held or the offers paused, a payment that did not go through, a message refused:
  // closed by their mend. A number given back, an account restricted, a connection removed are told once.
  number: { ends: "mended" },
  sweep: { ends: "mended" },
  billing: { ends: "mended" },
  template_blocked: { ends: "mended" },
  job_failed: {
    ends: "news",
    why: "A job that did not finish is told once; the next try is its own news, and nothing is left to answer here.",
  },
  broadcast_stopped: {
    ends: "news",
    why: "A run that stopped is told once; what is left to do is a new run, made on Sent.",
  },
  calendar_people: {
    ends: "news",
    why: "Who the calendar's visits are with is told once; the Calendar keeps the names to look at.",
  },
  alert: {
    ends: "news",
    why: "An alert is told once; what it asks is done where its door goes, and nothing here waits.",
  },
  template_ready: { ends: "news", why: "A message approved is good news, told once." },
  broadcast_sent: { ends: "news", why: "A run that finished is told once, with what it did." },
  leads_ready: { ends: "news", why: "A search that finished is told once; its places wait in Leads." },
  note_for_you: { ends: "news", why: "A note left for you is read when you open it." },
  reach_out_replied: { ends: "news", why: "A reply is told once per reading; its thread holds the rest." },
  reach_out_day: { ends: "news", why: "The day's reach-out numbers are a line, told once at six." },
  opted_out: { ends: "news", why: "A customer's stop is news, told once; there is nothing to answer." },
  booking: { ends: "news", why: "A booking that arrived is news; the Calendar holds the visit." },
  member_joined: { ends: "news", why: "A teammate who joined is news, told once." },
  member_left: { ends: "news", why: "A teammate who left is news, told once." },
};

/** The kinds whose rows a source judges (for the server's close and the hold rows: kindsEndedBy("hold")). */
export function kindsEndedBy(source: WaitSource): ServerNotificationKind[] {
  return (Object.keys(NOTICE_ENDS) as ServerNotificationKind[]).filter((k) => NOTICE_ENDS[k].ends === source);
}

/** The slice of a bell row the rule reads. */
type Row = Pick<NotificationRow, "kind" | "about" | "title" | "at" | "to">;

/**
 * The titles of a notice that a run waits for a word: core's `Campaign “X” is ready` (`Playbook “X” is ready` before decision
 * 19 of 9 Oct 2026, which the bell still keeps) and a reach-out's `A reach-out waits for you: X`.
 */
const RUN_WAITS_TITLE = /^(?:(?:Campaign|Playbook) “.*” is ready\b|A reach-out waits for you:)/u;
/** A run that goes unless it is stopped (contracts vetoRunNotice): it asks while it can still be stopped. */
const RUN_GOES_TITLE = /^(?:Campaign|Playbook) “.*” sends /u;
/** The check held some of a going reach-out run's emails for its owner's say (contracts heldNoticeWords). */
const RUN_HELD_TITLE = /^The check held \d+ emails? in /u;

const isGoing = (state: string): boolean => (RUN_GOING_STATES as readonly string[]).includes(state);

/**
 * A run's notice: one waiting for a word asks while an approval can still send it (the verb's own rule, by the days, where
 * they are known); one that goes unless stopped asks while it is scheduled; the check's held emails ask while the going run
 * holds some (a run no longer going holds none: reach_out_finishable does not finish a run with an email held).
 */
function judgeRun(row: Row, about: { type: string; id: string }, waits: WhatWaits): boolean | null {
  if (about.type !== "broadcast") return null;
  const run = heldFor(waits.runs, row.at)?.get(about.id);
  if (run === undefined) return null;
  if (RUN_WAITS_TITLE.test(row.title))
    return waits.days ? runWaitsOnYou(run, waits.days) : run.state === "pending_approval";
  if (RUN_GOES_TITLE.test(row.title)) return run.state === "scheduled";
  if (RUN_HELD_TITLE.test(row.title)) {
    if (!isGoing(run.state)) return false;
    return typeof run.held === "number" ? run.held > 0 : null;
  }
  return null;
}

/** A booking email held for a look waits while the card holds it. */
function judgeEmail(row: Row, about: { type: string; id: string }, waits: WhatWaits): boolean | null {
  if (about.type !== "booking_notice") return null;
  const held = heldFor(waits.heldEmails, row.at);
  return held ? held.has(about.id) : null;
}

/** The notice of a new review waits for an answer; "Replied to …" tells of one. */
function judgeReview(row: Row, about: { type: string; id: string }, waits: WhatWaits): boolean | null {
  if (about.type !== "review" || !row.title.startsWith(NEW_REVIEW_NEWS)) return null;
  const review = heldFor(waits.reviews, row.at)?.find((r) => reviewNoticeIsAbout(about, r));
  return review ? !review.replied : null;
}

/**
 * A hold's notice waits while its thread needs you (a hold snoozed, a teammate's or yours no longer does). A call row about a
 * call is news; a thread the read does not hold, or a read from before the row, settles nothing.
 */
function judgeHold(row: Row, about: { type: string; id: string }, waits: WhatWaits): boolean | null {
  if (about.type !== "conversation") return null;
  const needsYou = heldFor(waits.holds, row.at)?.get(about.id);
  return needsYou === undefined ? null : needsYou;
}

/**
 * A search's question waits while its round, the search's newest, waits on its owner: a newer round means this question is
 * settled (a second round that asks keeps its own row); a search the read does not hold is unknown.
 */
function judgeSearch(row: Row, about: { type: string; id: string }, waits: WhatWaits): boolean | null {
  if (about.type !== "lead_round") return null;
  const searchId = row.to ? parseLeadsRoute(row.to)?.searchId : null;
  const s = searchId ? heldFor(waits.searches, row.at)?.get(searchId) : undefined;
  if (!s) return null;
  return s.roundId === about.id && s.state === "waiting_on_owner";
}

const JUDGES: Record<WaitSource, (row: Row, about: { type: string; id: string }, waits: WhatWaits) => boolean | null> =
  {
    run: judgeRun,
    email: judgeEmail,
    review: judgeReview,
    hold: judgeHold,
    search: judgeSearch,
  };

/**
 * Whether the thing a kept row announced still waits: true, false once it is settled, null where the row announces no wait or
 * the surface that would say is not read (nothing is then settled).
 */
export function noticeStillWaits(row: Row, waits: WhatWaits): boolean | null {
  const end = Object.hasOwn(NOTICE_ENDS, row.kind) ? NOTICE_ENDS[row.kind as ServerNotificationKind] : null;
  if (!row.about || !end || end.ends === "news" || end.ends === "mended") return null;
  return JUDGES[end.ends](row, row.about, waits);
}

/**
 * The bell's kept rows with the ones whose subject no longer waits read as read, and no longer toned as asking for a decision
 * (contracts settledRow). The row stays on the bell, under Earlier, as the record. Derived rows are not touched: they are
 * computed from the live pages, so they leave the feed when what they stand for does.
 */
export function closeSettledNotices<T extends NotificationRow>(rows: readonly T[], waits: WhatWaits): T[] {
  return rows.map((row) =>
    !row.key.startsWith(SERVER_KEY_PREFIX) || noticeStillWaits(row, waits) !== false ? row : settledRow(row),
  );
}

/**
 * The kept rows' ids the surfaces settle now (noticeStillWaits false), over the rows the bell itself builds from the same
 * answer (serverNotificationRows), so the phone's icon and the bell judge the same titles and doors.
 */
export function settledNoticeIds(dto: NotificationsDto | null | undefined, waits: WhatWaits): ReadonlySet<string> {
  return new Set(
    serverNotificationRows(dto)
      .filter((r) => noticeStillWaits(r, waits) === false)
      .map((r) => r.key.slice(SERVER_KEY_PREFIX.length)),
  );
}
