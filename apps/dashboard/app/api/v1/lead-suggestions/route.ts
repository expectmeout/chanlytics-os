import { BusinessLineSchema, ROLE_PERMS } from "@chanlytics/contracts";
import { read, workspace, write } from "@/server/route";
import { setBusinessLine, suggestionsFor } from "@/server/leads/leads";

/**
 * GET /api/v1/lead-suggestions — the ideas for a new search (§8.9, 00398): four
 * ready plans written from the business line and what the workspace's searches
 * found. Kept until a round ends, the line is saved or a month passes, so a
 * model is asked rarely; the bucket is here because a read that can reach a
 * model is not a free read. Only a member who may find has them written: any
 * other reads what was written.
 */
export const GET = read({
  scope: workspace,
  rate: "lead_suggest",
  handle: ({ ctx, member }) => suggestionsFor(ctx, member.tenantId, { write: ROLE_PERMS[member.role]?.find === true }),
});

/**
 * PUT /api/v1/lead-suggestions — the owner's own words for what their business
 * does. Saved with no suggestions, so the next read asks Claude again from the
 * line they wrote rather than from the workspace's name.
 */
export const PUT = write({
  scope: workspace,
  role: "partner",
  rate: "lead_suggest",
  input: BusinessLineSchema,
  handle: ({ ctx, member, input }) => setBusinessLine(ctx, member.tenantId, input.business_line),
});
