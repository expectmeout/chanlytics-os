/**
 * A kept bell row closes when what it announced stops waiting (decision 0048, point 2; the wiring plan's task 5.2, finding NS-3).
 *
 * Kept rows have been marks only since the bell's rows were made durable: a row was unread until the owner read it or it aged
 * out. So the bell's badge and Today's "While you were away" went on counting "Campaign X is ready: 40 people. Nothing is sent
 * until you do" after the owner had approved the run, "A booking email needs a look" after the email was dismissed, and "New on
 * Google" after the review was answered. Opening a thread or a person reads the notes about them (surfaces/seen.ts); nothing read
 * the rows about a run, a held email or a review.
 *
 * The rows say what they are about (`about`), and the surfaces the browser already holds say whether that subject still waits:
 * the Sent surface its runs and their state, the Calendar's read the booking emails held for a look, the Google read its
 * reviews and which have a reply. No migration and no write: the row is read as read from those, on every device, and a row whose
 * subject no surface holds is left as it was, since a subject nobody read is not a subject that stopped waiting.
 *
 * Only a row that ANNOUNCES A WAIT closes this way. A run that finished is news (`broadcast_sent`), "Replied to Rosa's review" is
 * news, and a teammate who joined is news: news does not wait, and is read when the owner reads it. An invitation accepted closes
 * the bell's derived "Invitation pending" row instead (hold-rows.ts bellFeed), which is no kept row.
 *
 * Pure: the bridge feeds it what its surfaces hold, the tests feed it fixtures.
 */
import { NEW_REVIEW_NEWS, reviewNoticeIsAbout } from "../google/google";
import { SERVER_KEY_PREFIX, type NotificationRow } from "../today/notifications";

/**
 * What one surface holds of the subjects a waiting row is about, and when it read them. A surface read BEFORE a notice was kept
 * cannot say whether that notice's subject waits (it had not heard of it), so a row newer than `readAt` is not judged by it.
 */
interface Held<T> {
  /** When the surface was read, epoch ms. */
  readAt: number;
  held: T;
}

/** What the surfaces hold of the subjects a waiting row is about; null where a surface has not been read, which settles nothing. */
export interface WhatWaits {
  /** The campaign runs the Sent surface holds, by id, with the state each is in (BROADCAST_STATES). */
  runs: Held<ReadonlyMap<string, string>> | null;
  /** The booking emails held for a look, by id, only where the whole list is known (the card lists at most twenty). */
  heldEmails: Held<ReadonlySet<string>> | null;
  /** The reviews the Google read holds, newest first: the row, Google's own id for it, and whether it has a reply. */
  reviews: Held<ReadonlyArray<{ id: string; reviewId?: string | null; replied: boolean }>> | null;
}

/** Nothing known of any subject: no row closes. */
export const NOTHING_WAITS_KNOWN: WhatWaits = { runs: null, heldEmails: null, reviews: null };

/** What a surface holds, for a row it had already heard of: null before it was read, or when the row is newer than the read. */
const heldFor = <T>(source: Held<T> | null, kept: number): T | null =>
  source && kept <= source.readAt ? source.held : null;

/** A run waits for the owner's word while it is in this state (waits.ts runWaitsOnYou says it for the count). */
const RUN_WAITING = "pending_approval";

/**
 * The titles of a notice that a run waits for a word: core's `Campaign “X” is ready` (`Playbook “X” is ready` before decision
 * 19 of 9 Oct 2026, which the bell still keeps) and a reach-out's `A reach-out waits for you: X`. Not the notice that the check
 * held some emails of a run that is going, which is the run's own, nor the one that a run goes unless it is stopped.
 */
const RUN_WAITS_TITLE = /^(?:(?:Campaign|Playbook) “.*” is ready\b|A reach-out waits for you:)/u;

/** The slice of a bell row the rule reads. */
type Row = Pick<NotificationRow, "kind" | "about" | "title" | "at">;

/**
 * Whether the thing a kept row announced still waits: true, false once it is settled, null where the row announces no wait or
 * the surface that would say is not read (nothing is then settled).
 */
export function noticeStillWaits(row: Row, waits: WhatWaits): boolean | null {
  const about = row.about;
  if (!about) return null;
  switch (row.kind) {
    case "playbook": {
      if (about.type !== "broadcast" || !RUN_WAITS_TITLE.test(row.title)) return null;
      const state = heldFor(waits.runs, row.at)?.get(about.id);
      return state === undefined ? null : state === RUN_WAITING;
    }
    case "booking_notice": {
      if (about.type !== "booking_notice") return null;
      const held = heldFor(waits.heldEmails, row.at);
      return held ? held.has(about.id) : null;
    }
    case "review": {
      // The notice of a new review waits for an answer; "Replied to …" tells of one.
      if (about.type !== "review" || !row.title.startsWith(NEW_REVIEW_NEWS)) return null;
      const review = heldFor(waits.reviews, row.at)?.find((r) => reviewNoticeIsAbout(about, r));
      return review ? !review.replied : null;
    }
    default:
      return null;
  }
}

/**
 * The bell's kept rows with the ones whose subject no longer waits read as read, and no longer toned as asking for a decision
 * (a warning over a settled run is the one thing it must not wear). The row stays on the bell, under Earlier, as the record.
 * Derived rows are not touched: they are computed from the live pages, so they leave the feed when what they stand for does.
 */
export function closeSettledNotices<T extends NotificationRow>(rows: readonly T[], waits: WhatWaits): T[] {
  return rows.map((row) => {
    if (!row.key.startsWith(SERVER_KEY_PREFIX) || noticeStillWaits(row, waits) !== false) return row;
    return { ...row, unread: false, tone: row.tone === "warn" ? "" : row.tone };
  });
}
