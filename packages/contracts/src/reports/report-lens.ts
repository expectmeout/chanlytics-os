/**
 * What Reports' lenses say that no other page does (10 Oct 2026): a page-only entry, `@chanlytics/contracts/report-lens`,
 * which only the Reports page imports. A value a page imports from the package root is in the route chunk every page
 * loads, so a word only Reports draws would be paid for by every page; here it loads with Reports and nowhere else.
 * The browser's generator leaves these modules out of its entry (PAGE_ONLY in
 * tooling/scripts/gen/contracts-browser-entry.mjs) while the barrels keep naming them, so the server and the tests read
 * them from the index as before. The Receptionist lens's own record (receptionist/receptionist-record.ts: the DTO, its guard
 * and its builder) is the server's, so it stays in the root barrel and a page imports only its types; its fold and its
 * words are this entry's. The People lens's record (people/people-record.ts, and the book's count in people/people-now.ts)
 * is the server's the same way; its fold, its words and the words of the two cards the frame keeps (the rhythm card's unit and
 * its empty, and the sentence of New people, adding up, where nobody new reached you) are this entry's.
 */
export { metricWordsOf } from "./report-metrics";
export { toReceptionistReportVM } from "./receptionist/receptionist-report";
export { toPeopleReportVM } from "./people/people-report";
export { FIRST_CAME_NOBODY, PEOPLE_RHYTHM_EMPTY, PEOPLE_RHYTHM_UNIT } from "./people/people-words";
export type { MixPartVM } from "./report-mix";
export type { ReceptionistFigureVM, ReceptionistReportVM } from "./receptionist/receptionist-report";
export type { PeopleFigureVM, PeopleReportVM } from "./people/people-report";
