import "server-only";

/**
 * A lead's own receptionist as its sender sees it (decision 0079, L5), for the lead sheet's line:
 *
 *   leadPreviewFor      GET leads/:id/preview: the lead's preview, read under the member's session (its workspace's row,
 *                       by RLS), and whether this workspace makes them (ours)
 *   makeLeadPreviewFor  POST leads/:id/preview, Make their preview: asked of the edge's door (askPreview, the sender's
 *                       own way, its switch with it), then the line read again
 */
import { AppError, type LeadPreviewDto } from "@chanlytics/contracts";
import { leadPreviewOf, makesPreviews, type LeadPreviewRow } from "@chanlytics/db";
import { callEdge, edgeRefusalWords } from "../edge";
import type { RouteContext } from "../with-route";

type Ctx = Pick<RouteContext, "supabase" | "userId">;

/** The row's facts the line says: never its chat. */
const factsOf = (r: LeadPreviewRow): NonNullable<LeadPreviewDto["preview"]> => ({
  state: r.state,
  token: r.token,
  failed_why: r.failed_why,
  ends_at: r.ends_at,
  first_sent_at: r.first_sent_at,
  opened_count: r.opened_count,
  asked_count: r.asked_count,
  call_count: r.call_count,
  call_seconds: r.call_seconds,
  tried_at: r.tried_at,
  claimed_at: r.claimed_at,
  not_right: r.not_right,
});

export async function leadPreviewFor(ctx: Ctx, tenantId: string, leadId: string): Promise<LeadPreviewDto> {
  const [row, makes] = await Promise.all([
    leadPreviewOf(ctx.supabase, tenantId, leadId),
    makesPreviews(ctx.supabase, tenantId),
  ]);
  return { preview: row ? factsOf(row) : null, makes };
}

/** The edge door's refusals, said in its words: none such, not a workspace of ours, or the door's own (switched off). */
const REFUSED: Record<number, { code: "not_found" | "forbidden" | "conflict"; status: number }> = {
  404: { code: "not_found", status: 404 },
  403: { code: "forbidden", status: 403 },
  409: { code: "conflict", status: 409 },
};

export async function makeLeadPreviewFor(ctx: Ctx, tenantId: string, leadId: string): Promise<LeadPreviewDto> {
  const r = await callEdge(
    "/api/admin/previews/make",
    { tenant_id: tenantId, lead_id: leadId },
    { workspace: tenantId, user: ctx.userId },
  );
  if (r.status !== 200) {
    const refused = REFUSED[r.status];
    const words = edgeRefusalWords(r.body) ?? "Their preview couldn't be made just now.";
    throw refused ? new AppError(refused.code, words, refused.status) : new AppError("internal", words, 503);
  }
  return leadPreviewFor(ctx, tenantId, leadId);
}
