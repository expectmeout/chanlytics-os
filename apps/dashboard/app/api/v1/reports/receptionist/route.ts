import { read, workspace } from "@/server/route";
import { load, readerContext } from "@/server/readers";
import { ReportQuery, receptionistReport, reportWindowFor } from "@/server/readers/report";

/**
 * GET /api/v1/reports/receptionist?period=7d|30d|90d|month — what the receptionist did, from what is stored.
 *
 * The twin of /api/v1/reports/reviews, over the same four periods and the days a member picked (`from` and `to`
 * together): the database's own read of the window (the held replies by what became of them, what customers asked about
 * and in which language, the calls and how they ended, how long a handover took, the calls nobody took, when people
 * write, the booking links sent and what is open now), which contracts' toReceptionistReportVM folds into the figures,
 * the cards and the sentence at the head. The people sent the link are counted against the calendar here, and who waits
 * on you by the one rule for standing; the hours the workspace keeps ride beside them. A database without the function
 * answers `series: null`, and the lens then draws its kept cards and none of its own parts; a function with no workspace is
 * this route's 404. The body is its reader's (readers/report.ts).
 */
export const GET = read({
  scope: workspace,
  rate: "aggregate",
  query: ReportQuery.pick({ period: true, from: true, to: true }),
  handle: async ({ ctx, member, input }) => {
    const rc = readerContext(ctx, member);
    return (await load(rc, receptionistReport, await reportWindowFor(rc, input))).data;
  },
});
