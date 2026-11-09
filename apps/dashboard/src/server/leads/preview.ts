import "server-only";

/**
 * A lead's own receptionist as its sender sees it (decision 0079, L5), for the lead sheet's line:
 *
 *   getLeadPreview      GET leads/:id/preview: the lead's preview, read under the member's session (its workspace's row,
 *                       by RLS), and whether this workspace makes them (ours)
 *   makeLeadPreviewFor  POST leads/:id/preview, Make their preview: asked of the edge's door (askPreview, the sender's
 *                       own way, its switch with it), then the line read again
 */
import { AppError, type LeadPreviewDto } from "@chanlytics/contracts";
import { findLeadPreview, doesMakePreviews, type LeadPreviewRow } from "@chanlytics/db/campaigns";
import { callEdge, edgeRefusalWords } from "../shared/edge";
import type { RouteContext } from "../shared/with-route";
import type { TenantId } from "@chanlytics/contracts";

type Ctx = Pick<RouteContext, "supabase" | "userId">;

/** The row's facts the line says: never its chat. */
const previewFactsOf = (leadPreview: LeadPreviewRow): NonNullable<LeadPreviewDto["preview"]> => ({
  state: leadPreview.state,
  token: leadPreview.token,
  failed_why: leadPreview.failed_why,
  ends_at: leadPreview.ends_at,
  first_sent_at: leadPreview.first_sent_at,
  opened_count: leadPreview.opened_count,
  asked_count: leadPreview.asked_count,
  call_count: leadPreview.call_count,
  call_seconds: leadPreview.call_seconds,
  tried_at: leadPreview.tried_at,
  claimed_at: leadPreview.claimed_at,
  not_right: leadPreview.not_right,
});

export async function getLeadPreview(ctx: Ctx, tenantId: TenantId, leadId: string): Promise<LeadPreviewDto> {
  const [row, makes] = await Promise.all([
    findLeadPreview(ctx.supabase, tenantId, leadId),
    doesMakePreviews(ctx.supabase, tenantId),
  ]);
  return { preview: row ? previewFactsOf(row) : null, makes };
}

/** The edge door's refusals, said in its words: none such, not a workspace of ours, or the door's own (switched off). */
const MAKE_REFUSED: Record<number, { code: "not_found" | "forbidden" | "conflict"; status: number }> = {
  404: { code: "not_found", status: 404 },
  403: { code: "forbidden", status: 403 },
  409: { code: "conflict", status: 409 },
};

export async function makeLeadPreviewFor(ctx: Ctx, tenantId: TenantId, leadId: string): Promise<LeadPreviewDto> {
  const answer = await callEdge(
    "/api/admin/previews/make",
    { tenant_id: tenantId, lead_id: leadId },
    { workspace: tenantId, user: ctx.userId },
  );
  if (answer.status !== 200) {
    const refused = MAKE_REFUSED[answer.status];
    const words = edgeRefusalWords(answer.body) ?? "Their preview couldn't be made just now.";
    throw refused ? new AppError(refused.code, words, refused.status) : new AppError("unavailable", words);
  }
  return getLeadPreview(ctx, tenantId, leadId);
}
