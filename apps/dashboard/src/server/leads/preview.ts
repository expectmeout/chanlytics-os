import "server-only";

/**
 * A lead's own receptionist as its sender sees it (decision 0079, L5), for the lead sheet's line:
 *
 *   getLeadPreview      GET leads/:id/preview: the lead's preview, read under the member's session (its workspace's row,
 *                       by RLS), whether this workspace makes them (ours), and, where it does and none is made, why
 *                       this lead can get none (previewCannotOf), so the sheet promises nothing its door would refuse
 *   makeLeadPreviewFor  POST leads/:id/preview, Make their preview: asked of the edge's door (askPreview, the sender's
 *                       own way, its switch with it), then the line read again
 */
import { AppError, PREVIEW_LIMITS, SECOND_MS, leadCalledByOf, type LeadPreviewDto } from "@chanlytics/contracts";
import {
  countLeadPreviewsSince,
  findLeadForPreview,
  findLeadPreview,
  doesMakePreviews,
  type LeadPreviewRow,
} from "@chanlytics/db/campaigns";
import { logAndGoOn } from "@chanlytics/log";
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
  made_at: leadPreview.created_at,
});

type LeadForPreview = NonNullable<Awaited<ReturnType<typeof findLeadForPreview>>>;

/**
 * Why its door would refuse this lead a preview, in the door's own order (00497 preview_make): not a business that takes
 * bookings, a lead that is closed, no name to set it up under (the name the edge gives it: what the lead is called by,
 * else its listing's own). Null where nothing stands in the way. The door is the rule and still decides; this says its
 * answer before the email that would ask it goes.
 */
function previewCannotOf(
  lead: Pick<LeadForPreview, "kind" | "stage" | "business_name" | "city" | "facts">,
): NonNullable<LeadPreviewDto["cannot"]> | null {
  if (lead.kind !== "place") return "not_a_business";
  if (lead.stage !== "ready" && lead.stage !== "nurture") return "closed";
  const name = leadCalledByOf(lead) ?? lead.business_name;
  return name.trim().length < 2 ? "no_name" : null;
}

/** How long the edge's standing door is waited for: the sheet's line is not held up by a slow answer about a switch. */
const STANDING_WAIT_MS = 2 * SECOND_MS;

/**
 * Whether none is being made for anyone just now, as the edge's standing door says its switch. Only a plain "off" is
 * believed: an older edge with no such door, one that could not be reached, or an answer that says nothing of it claims
 * nothing, and the line reads as it did before.
 */
async function arePreviewsPaused(ctx: Ctx, tenantId: TenantId): Promise<boolean> {
  const answer = await callEdge("/api/admin/previews/standing", null, {
    workspace: tenantId,
    user: ctx.userId,
    method: "GET",
    timeoutMs: STANDING_WAIT_MS,
  });
  return answer.status === 200 && answer.body?.on === false;
}

/**
 * Whether this workspace's day of previews is all made (contracts PREVIEW_LIMITS.aDay), over the UTC day now is in, as
 * the edge counts it (its previewDayFull): so the card says the email waits for tomorrow before it does. A count that
 * cannot be read claims nothing.
 */
async function isPreviewDayFull(ctx: Ctx, tenantId: TenantId): Promise<boolean> {
  const now = new Date();
  const day = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  const made = await countLeadPreviewsSince(ctx.supabase, tenantId, day.toISOString()).catch(
    logAndGoOn("counting the day's previews for a lead's card", 0),
  );
  return made >= PREVIEW_LIMITS.aDay;
}

export async function getLeadPreview(ctx: Ctx, tenantId: TenantId, leadId: string): Promise<LeadPreviewDto> {
  const [row, makes] = await Promise.all([
    findLeadPreview(ctx.supabase, tenantId, leadId),
    doesMakePreviews(ctx.supabase, tenantId),
  ]);
  // The lead is read only where one would be made for it: a workspace that makes them, and none made yet.
  const lead = !row && makes ? await findLeadForPreview(ctx.supabase, tenantId, leadId) : null;
  const cannot = lead ? previewCannotOf(lead) : null;
  // The switch is asked only where its answer changes what is said: a lead that would otherwise get one.
  const paused = lead && !cannot ? await arePreviewsPaused(ctx, tenantId) : false;
  // The day's limit likewise: counted only for a lead that would get one today.
  const full = lead && !cannot && !paused ? await isPreviewDayFull(ctx, tenantId) : false;
  return { preview: row ? previewFactsOf(row) : null, makes, cannot, paused, full };
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
