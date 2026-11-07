/**
 * A lead's own receptionist asked for (decision 0079): by a send whose words name {{their preview}} for a lead with
 * none (the sender), or by a member's press on the lead (the dashboard). The one way one is made: its door
 * (preview_make: a workspace marked ours, a business's lead still open) under the name the lead is called by and its
 * state's zone, and its build scheduled once while it waits (previews/build.ts). With the switch off, none is made.
 * makePreviewFor is the member's press, behind its admin door.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { isUuid } from "@chanlytics/contracts";
import { leadAsListing, previewZoneOf } from "./lead-as-listing";
import { findLeadForPreview, makeLeadPreview, type PreviewDoor, type PreviewMade } from "@chanlytics/db/campaigns";
import { type Database } from "@chanlytics/db/types";
import { scheduleJobOnce } from "@chanlytics/jobs";
import { env } from "../shared/env.js";
import { json, refuse } from "../shared/http.js";
import { workspaceFor, type Admitted } from "../shared/admin-auth.js";
import { pg } from "../shared/pg.js";

type Db = SupabaseClient<Database>;

/** The lead's preview, made where there is none and its build scheduled while it is building; or why not. */
export async function askPreview(
  db: Db,
  params: { tenantId: string; leadId: string; by: string | null },
): Promise<PreviewDoor<PreviewMade>> {
  if (env.LEAD_PREVIEWS !== "on") return { ok: false, reason: "refused", message: "Previews are switched off." };
  const lead = await findLeadForPreview(db, params.tenantId, params.leadId);
  if (!lead) return { ok: false, reason: "not_found", message: "Lead not found." };
  const created = await makeLeadPreview(db, {
    tenantId: params.tenantId,
    leadId: params.leadId,
    name: leadAsListing(lead).name ?? lead.business_name,
    timezone: previewZoneOf(lead),
    by: params.by,
  });
  if (created.ok && created.value.state === "building")
    await scheduleJobOnce(db, {
      tenantId: params.tenantId,
      kind: "preview_build",
      dueAt: new Date(),
      payload: { preview_id: created.value.id },
    });
  return created;
}

/**
 * Make their preview, pressed on a lead (POST /api/admin/previews/make): askPreview for the token's workspace and its
 * person, answered as the preview's id, state and link's token; or its door's refusal in its own words. With the switch
 * off it is refused, and nothing is made.
 */
export async function makePreviewFor(auth: Admitted, body: Partial<{ tenant_id: string; lead_id: string }>) {
  const db = pg();
  if (!db) return refuse(503, "no_database");
  const ws = workspaceFor(auth, body.tenant_id);
  if (!ws.ok) return ws.response;
  const leadId = typeof body.lead_id === "string" ? body.lead_id.trim() : "";
  if (!ws.tenantId || !isUuid(leadId)) return refuse(400, "bad_request", "tenant_id and lead_id are required");
  const created = await askPreview(db, { tenantId: ws.tenantId, leadId, by: auth.user });
  if (created.ok)
    return json(200, { ok: true, id: created.value.id, state: created.value.state, token: created.value.token });
  if (created.reason === "not_found") return refuse(404, "not_found", created.message);
  if (created.reason === "not_ours") return refuse(403, "platform_only", created.message);
  return refuse(409, "preview_failed", created.message);
}
