import { LeadExportQuerySchema } from "@chanlytics/contracts";
import { write, workspace } from "@/server/route";
import { exportLeads } from "@/server/leads/leads";

/**
 * POST /api/v1/leads/export — the view, as a CSV, for the business's own
 * records: `{ file, csv, rows }`, which the page saves. Owners only and on the
 * ledger, exactly as the people export is: this is a copy of a list leaving the
 * building. What it takes is marked, so the month is not charged twice for the
 * same lead (§0.2).
 *
 * A POST, not a link: the mark changes the month's count, and a GET changes
 * nothing (decision 0047, lane 6). The view rides in the body, the same keys
 * `POST leads/bulk` names a view by. The people, conversation, call and
 * all-data exports stay GETs, on the allow-list of reads that write their audit
 * row (tooling/scripts/tests/reads-never-write/).
 */
export const POST = write({
  scope: workspace,
  fresh: true,
  role: "owner",
  rate: "export",
  input: LeadExportQuerySchema,
  handle: ({ ctx, member, input }) => exportLeads(ctx, member.tenantId, input),
});
