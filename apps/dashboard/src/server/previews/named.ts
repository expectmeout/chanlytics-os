import "server-only";

/**
 * A lead's preview under the lead's new name (00631 lead_named: its sender put the lead's name right). The door renames
 * the preview's workspace; its receptionist is settings, written through their schema, so the name is put there here,
 * with the service role, as its build wrote it. One made theirs is theirs to name. It never throws: the lead is right
 * already, and a record that could not be written is logged.
 */
import { heldTenantId, withPreviewNamed, type TenantId } from "@chanlytics/contracts";
import { findLeadPreview } from "@chanlytics/db/campaigns";
import { logAndGoOn } from "@chanlytics/log";
import { linkPageDb } from "../public/link-page";
import type { RouteContext } from "../shared/with-route";
import { changePreviewBrain } from "./theirs";

/** Their preview's receptionist, read and written under `name`, while it is still a preview. */
async function writePreviewName(
  ctx: Pick<RouteContext, "supabase">,
  tenantId: TenantId,
  leadId: string,
  name: string,
): Promise<void> {
  const preview = await findLeadPreview(ctx.supabase, tenantId, leadId);
  const db = linkPageDb();
  if (!preview?.preview_tenant_id || preview.state === "claimed" || !db) return;
  await changePreviewBrain(db, heldTenantId(preview.preview_tenant_id), (brain) => withPreviewNamed(brain, name));
}

/** The lead's preview takes the lead's new name, where it has one that is still a preview. */
export function namePreviewOf(
  ctx: Pick<RouteContext, "supabase">,
  tenantId: TenantId,
  leadId: string,
  name: string,
): Promise<void> {
  return writePreviewName(ctx, tenantId, leadId, name).catch(
    logAndGoOn("putting a lead's new name in its preview's own record", undefined),
  );
}
