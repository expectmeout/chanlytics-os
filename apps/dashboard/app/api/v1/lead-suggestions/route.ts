import { BusinessLineSchema } from "@chanlytics/contracts";
import { read, workspace, write } from "@/server/route";
import { lineForMe, newIdeas, setBusinessLine, suggestionsKept, suggestionsWritten } from "@/server/leads/leads";

/**
 * GET /api/v1/lead-suggestions — the ideas for a new search (§8.9, 00398): three
 * ready plans written from the business line and what the workspace's searches
 * found, as they were written, and whether they are due to be written again
 * (`due`). It writes nothing and asks no model (the wiring's second audit, S11-8:
 * it wrote them, a page's read keeping a row, asking a model and writing an event).
 */
export const GET = read({
  scope: workspace,
  // Its own: a read asks no model, so it never spends the ten an hour a write does.
  rate: "lead_ideas_read",
  handle: ({ ctx, member }) => suggestionsKept(ctx, member.tenantId),
});

/**
 * POST /api/v1/lead-suggestions — the ideas written, where they are due: kept until
 * a round ends, the line is saved or a month passes, so a model is asked rarely.
 * With { again: true }, New ideas (decision 0070): the same line written again now,
 * what was shown passed on, so the three that come back are new ones. With
 * { ours: true }, Write it for me: the owner's saved line let go, and the line
 * written from the whole picture with three new ideas, kept as ours.
 * For a member who may find (the owner and the partner), as a search is.
 */
export const POST = write({
  scope: workspace,
  role: "partner",
  rate: "lead_suggest",
  handle: async ({ ctx, req, member }) => {
    const body = (await req.json().catch(() => null)) as { again?: unknown; ours?: unknown } | null;
    if (body?.ours === true) return lineForMe(ctx, member.tenantId);
    return body?.again === true ? newIdeas(ctx, member.tenantId) : suggestionsWritten(ctx, member.tenantId);
  },
});

/**
 * PUT /api/v1/lead-suggestions — the owner's own words for what their business
 * does. Saved with no suggestions, so the next read asks Claude again from the
 * line they wrote rather than from the workspace's name.
 */
export const PUT = write({
  scope: workspace,
  role: "partner",
  rate: "lead_line",
  input: BusinessLineSchema,
  handle: ({ ctx, member, input }) => setBusinessLine(ctx, member.tenantId, input.business_line),
});
