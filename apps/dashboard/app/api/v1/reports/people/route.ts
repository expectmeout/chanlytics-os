import { read, workspace } from "@/server/route";
import { load, readerContext } from "@/server/readers";
import { ReportQuery, peopleReport, reportWindowFor } from "@/server/readers/report";

/**
 * GET /api/v1/reports/people?period=7d|30d|90d|month — who reached the business and who is in the book, from what is stored.
 *
 * The twin of /api/v1/reports/receptionist, over the same four periods and the days a member picked (`from` and `to`
 * together): the database's own read of the window (the people who reached the business in it and in the days before, by the
 * wire they used, how the new ones first came, the yeses and stops they gave, the addresses that stopped working and the
 * steps the team finished on time), and beside it the book as it stands now, counted over the people People holds by People's
 * own rules (how long since they were heard, the lists, the steps due, the ways they reach you). Contracts' toPeopleReportVM
 * folds the two into the figures, the cards and the sentence at the head. The book is as of now, so it is read for days that
 * ended as well, and it is the workspace's: no member's own enters it. Counts only; a name never leaves. A database without
 * the function answers `series: null` and the lens draws the book alone; a book that cannot be counted is `now: null` and the
 * lens draws the window alone; a function with no workspace is this route's 404. The body is its reader's (readers/report.ts).
 */
export const GET = read({
  scope: workspace,
  rate: "aggregate",
  query: ReportQuery.pick({ period: true, from: true, to: true }),
  handle: async ({ ctx, member, input }) => {
    const rc = readerContext(ctx, member);
    return (await load(rc, peopleReport, await reportWindowFor(rc, input))).data;
  },
});
