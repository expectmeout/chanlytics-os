/**
 * What the owner is told on the bell from an event, whichever door wrote it (decisions 0043, 0048): the pure halves of
 * core's notice subscribers, a booking that arrived (visit_notice), a teammate who joined (team_notice) and a thread that
 * needs a person (hold_notice, hold-notice.ts). A customer's no is consent's (consent/opt-out-notice.ts).
 */
export { bookingArriving, feedAdditionIsBooking, visitNews, CATCH_UP_VISITS } from "./visit-news";
export type { BookedVisit, BookingVia } from "./visit-news";
export { memberJoinedBy, memberJoinedNotice } from "./member-news";
export type { MemberJoined } from "./member-news";
export { holdNotice } from "./hold-notice";
export type { HoldFacts } from "./hold-notice";
