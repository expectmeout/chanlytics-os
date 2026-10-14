/**
 * A connection that stopped working, told to its owner once (the wiring's second audit, R11 S11-4): the Business
 * Profile's sync and the calendar's link. Each failed as state on a row and a line in the log, and the owner found out by
 * noticing what stopped arriving: new reviews, the open times the receptionist states, the visits on the Calendar. Each
 * is told once its failure is lasting, under a key of that breakage (the edge's notifyOnce), with the bell's door where
 * it is mended, and the notice closes on the first read that works again, or when the connection is removed
 * (waits/notice-mends.ts).
 */
import { DAY_MS, agoWords } from "../shared/time";

/**
 * A profile that has not synced for this long is told of whatever the cause: it is synced once a day and tried again
 * every hour while it fails, so a passing outage has cleared well before. A cause only the owner can mend (Google
 * refused the grant, the account lost the location) is told at the first failure.
 */
export const GOOGLE_SYNC_TOLD_AFTER_MS = 2 * DAY_MS;

/** The Business Profile's notice. The title is what its mend matches, so it is said here once. */
export const GOOGLE_SYNC_NOTICE_WORDS = {
  title: "Google Business Profile stopped syncing",
  body: (f: { lasting: boolean; lastSyncedMs: number | null; nowMs: number }): string =>
    (f.lasting
      ? "Google stopped letting Chanlytics read your Business Profile, so new reviews no longer arrive here."
      : `Your Business Profile ${f.lastSyncedMs === null ? "has not synced since it was connected" : `last synced ${agoWords(f.lastSyncedMs, f.nowMs)}`}, and every try since has failed, so new reviews no longer arrive here.`) +
    " Connections says what Google answered. Reconnecting it there, under Google, mends most causes.",
} as const;

/**
 * A calendar link that has failed every read for this long is told of. One read failing is routine (a slow feed, the
 * read's own bound, a failure kept for five minutes); a day of them is a link that has stopped working.
 */
export const CALENDAR_UNREADABLE_TOLD_AFTER_MS = DAY_MS;

/** The calendar link's notice. The title is what its mend matches, so it is said here once. */
export const CALENDAR_UNREADABLE_WORDS = {
  title: "Your calendar link stopped answering",
  body: (f: { sinceMs: number; nowMs: number }): string =>
    `Your calendar link stopped answering ${agoWords(f.sinceMs, f.nowMs)}. Until it answers again, the receptionist ` +
    "does not say which times are open, and new visits do not reach the Calendar. Check the link in Settings, under " +
    "Business.",
} as const;
