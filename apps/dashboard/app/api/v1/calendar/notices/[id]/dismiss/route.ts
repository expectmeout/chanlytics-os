import { z } from "zod";
import { write, workspace } from "@/server/route";
import { dismissNotice } from "@/server/calendar/notices";

/**
 * POST /api/v1/calendar/notices/:id/dismiss — {}
 *
 * A person let a held booking email go (docs/plans/2026-10-07-bookings-arrive-by-email.md, refinement C): the row
 * stays on the ledger as dismissed, with why it was held. A notice that is not this workspace's is not found; one
 * already read is refused.
 */
export const POST = write({
  scope: workspace,
  role: "operator",
  rate: "settings",
  input: z.object({}).strict(),
  handle: ({ ctx, member }) => dismissNotice(ctx, member.tenantId, String(ctx.params.id ?? "")),
});
