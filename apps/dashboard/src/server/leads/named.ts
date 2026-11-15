import "server-only";

/**
 * A lead's name or city put right by its owner (00631 lead_named; decision 0079's sprint, step 8: a wrong value is fixed
 * once). The rule is SQL's, on the member's own session: the lead says it from then on in every email, each email of
 * theirs still waiting with a line written from the old record is written again, and their preview's workspace takes
 * the name. The one thing the door cannot reach is the preview's own receptionist, which is settings and is written
 * through their schema: the name is put there here, with the service role, as its build wrote it. That write failing
 * leaves the lead right, and is logged: the answer is the door's.
 */
import { AppError, heldTenantId, leadNamedRefusal, withPreviewNamed, type TenantId } from "@chanlytics/contracts";
import { findLeadPreview } from "@chanlytics/db/campaigns";
import { nameLead } from "@chanlytics/db/leads";
import { logAndGoOn } from "@chanlytics/log";
import { changePreviewBrain } from "../previews/theirs";
import { linkPageDb } from "../public/link-page";
import { dbRefusal, type RouteContext } from "../shared/with-route";

type Ctx = Pick<RouteContext, "supabase">;

/** The lead as it now says, and how many of its waiting emails are written again. */
export interface LeadNamedDto {
  lead_id: string;
  business_name: string;
  city: string | null;
  again: number;
  version: number;
}

/** Their preview's receptionist under the lead's new name, while it is still a preview: one made theirs is theirs to name. */
async function namePreviewOf(ctx: Ctx, tenantId: TenantId, leadId: string, name: string): Promise<void> {
  const preview = await findLeadPreview(ctx.supabase, tenantId, leadId);
  const db = linkPageDb();
  if (!preview?.preview_tenant_id || preview.state === "claimed" || !db) return;
  await changePreviewBrain(db, heldTenantId(preview.preview_tenant_id), (brain) => withPreviewNamed(brain, name));
}

/** The owner's own name or city for a lead: what it now says, or the door's refusal in contracts' words. */
export async function nameLeadFor(
  ctx: Ctx,
  tenantId: TenantId,
  leadId: string,
  input: { business_name?: string | undefined; city?: string | undefined },
): Promise<LeadNamedDto> {
  const { data, error } = await nameLead(ctx.supabase, {
    leadId,
    businessName: input.business_name ?? null,
    city: input.city ?? null,
  });
  if (error) throw dbRefusal(error);
  if (!data.ok) {
    if (data.error === "gone") throw new AppError("not_found", leadNamedRefusal(data.error), 404);
    if (data.error === "bad_name" || data.error === "bad_city")
      throw new AppError("validation", leadNamedRefusal(data.error));
    throw new AppError("conflict", leadNamedRefusal(data.error), 409);
  }
  if (input.business_name !== undefined)
    await namePreviewOf(ctx, tenantId, leadId, data.business_name).catch(
      logAndGoOn("putting a lead's new name in its preview's own record", undefined),
    );
  return {
    lead_id: leadId,
    business_name: data.business_name,
    city: data.city,
    again: data.again,
    version: data.version,
  };
}
