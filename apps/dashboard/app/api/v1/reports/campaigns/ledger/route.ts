import { read, workspace } from "@/server/route";
import { load, readerContext } from "@/server/readers";
import { campaignLedgerReport } from "@/server/readers/campaign-report";
import { ReportQuery, reportWindowFor } from "@/server/readers/report";

/**
 * GET /api/v1/reports/campaigns/ledger?period=7d|30d|90d|month — what the Campaigns lens reads beyond the sends' own report, and what is stuck.
 *
 * The twin of /api/v1/reports/people, over the same four periods and the days a member picked (`from` and `to`
 * together): the database's own read of the window (the people the runs reached and who wrote back, the runs that sent, what
 * was held back and why, the runs that stopped, why sends failed, each message's sends and replies, how soon the first reply
 * came and how long an approval waited), and beside it what is stuck as it stands now: the runs waiting for an OK and which
 * of them the verb that approves them would refuse, the runs that failed, the people who answered and wait on a person, the
 * templates Meta stopped, and the connected WhatsApp number's health. The stuck half is as of now, so it is read for days
 * that ended as well, and it is the workspace's: no member's own enters it. Counts only; a name of a person never leaves.
 * A database without campaign_ledger answers `series: null` and the lens draws what is stuck alone; one without
 * campaign_stuck, or whose read fails (`stuck_failed`), answers `stuck: null` and the lens draws the window alone; a function
 * with no workspace is this route's 404. The sends' own report is GET reports/campaigns. The body is its reader's
 * (readers/campaign-report.ts).
 */
export const GET = read({
  scope: workspace,
  rate: "aggregate",
  query: ReportQuery.pick({ period: true, from: true, to: true }),
  handle: async ({ ctx, member, input }) => {
    const rc = readerContext(ctx, member);
    return (await load(rc, campaignLedgerReport, await reportWindowFor(rc, input))).data;
  },
});
