/** What waits on a person: counted once, the bell's one row for a hold, and the bell's rows closing when what they announced is settled. */
export { threadWait, waitsOf, needsYouCount } from "./waits";
export type { WaitingThread } from "./waits";
export { bellFeed, holdMarksOf } from "./hold-rows";
export { closeSettledNotices, noticeStillWaits, NOTHING_WAITS_KNOWN } from "./notice-closes";
export type { WhatWaits } from "./notice-closes";
