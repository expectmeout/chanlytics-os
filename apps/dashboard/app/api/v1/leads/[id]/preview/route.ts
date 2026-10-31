import { read, write, workspace } from "@/server/route";
import { requireUuid } from "@/server/request-guards";
import { leadPreviewFor, makeLeadPreviewFor } from "@/server/leads/lead-preview";

/**
 * GET /api/v1/leads/:id/preview — the lead's own receptionist as its sender sees it (decision 0079): its row's facts for
 * the lead sheet's line, and whether this workspace makes previews. Every member reads it.
 *
 * POST /api/v1/leads/:id/preview — Make their preview: the edge's door makes it and schedules its build (askPreview,
 * the sender's own way), only for a workspace of ours, and answers the line read again. An operator's, as a lead's other
 * presses are; it spends nothing of the business's (its receptionist is built on our own keys, and its calls are the
 * preview's own six minutes).
 */
export const GET = read({
  scope: workspace,
  handle: ({ ctx, member }) => leadPreviewFor(ctx, member.tenantId, requireUuid(ctx.params.id, "lead")),
});

export const POST = write({
  scope: workspace,
  role: "operator",
  rate: "lead_member",
  handle: ({ ctx, member }) => makeLeadPreviewFor(ctx, member.tenantId, requireUuid(ctx.params.id, "lead")),
});
