import { BusinessLineSchema } from "@chanlytics/contracts";
import { read, workspace, write } from "@/server/route";
import { setBusinessLine, suggestionsFor } from "@/server/leads/leads";

/**
 * GET /api/v1/lead-suggestions — the three or four kinds of business worth
 * reaching, on the first day (§8.9). Kept for a week, so this is one model
 * call a week per workspace; the bucket is here because a read that can reach
 * a model is not a free read.
 */
export const GET = read({
  scope: workspace,
  rate: "lead_suggest",
  handle: ({ ctx, member }) => suggestionsFor(ctx, member.tenantId),
});

/**
 * PUT /api/v1/lead-suggestions — the owner's own words for what their business
 * does. Saved with no suggestions, so the next read asks Claude again from the
 * line they wrote rather than from the workspace's name.
 */
export const PUT = write({
  scope: workspace,
  role: "owner",
  rate: "lead_suggest",
  input: BusinessLineSchema,
  handle: ({ ctx, member, input }) => setBusinessLine(ctx, member.tenantId, input.business_line),
});
