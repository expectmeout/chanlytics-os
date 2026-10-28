/**
 * What the owner is told on the bell from an event, whichever door wrote it (decisions 0043, 0048): the pure halves of
 * core's notice subscribers, a booking that arrived (visit_notice), a teammate who joined (team_notice) and a thread that
 * needs a person (hold_notice, hold-notice.ts). A customer's no is consent's (consent/opt-out-notice.ts). A connection that
 * stopped working (the Business Profile's sync, the calendar's link) is told by the edge's sweeps (connection-news.ts).
 */
export {
  bookingArriving,
  bookingChanged,
  feedAdditionIsBooking,
  visitChangeNews,
  visitNews,
  CATCH_UP_VISITS,
  VISIT_CHANGES_TOLD,
} from "./visit-news";
export type { BookedVisit, BookingVia, VisitChange } from "./visit-news";
export { memberJoinedBy, memberJoinedNotice, memberLeftBy, memberLeftNotice } from "./member-news";
export type { MemberJoined } from "./member-news";
export { holdNotice } from "./hold-notice";
export {
  GOOGLE_SYNC_TOLD_AFTER_MS,
  GOOGLE_SYNC_NOTICE_WORDS,
  CALENDAR_UNREADABLE_TOLD_AFTER_MS,
  CALENDAR_UNREADABLE_WORDS,
} from "./connection-news";
export type { HoldFacts } from "./hold-notice";
export { noticeMailHtml } from "./notice-mail";
export type { NoticeMail } from "./notice-mail";
