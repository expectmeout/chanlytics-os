/**
 * How many emails each step sent (decision 0113): what How it reaches out counts beside a claim, as the emails whose
 * step's words carry it. Sent alone: a planned, held or skipped send never reached anyone. One read however many steps
 * (00567 sequence_sent_by_step), under the caller's row security; a step that sent nothing is not in the map.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "../../../types";
import type { TenantId } from "@chanlytics/contracts";
import { DbFailure } from "@chanlytics/contracts";

type Db = SupabaseClient<Database>;

export async function countSentByStep(
  db: Db,
  tenantId: TenantId,
  stepIds: readonly string[],
): Promise<Map<string, number>> {
  const ids = [...new Set(stepIds)];
  if (ids.length === 0) return new Map();
  const { data, error } = await db.rpc("sequence_sent_by_step", { p_tenant_id: tenantId, p_step_ids: ids });
  if (error) throw new DbFailure(error, "cannot count the steps' sent emails");
  return new Map(data.map((row) => [row.step_id, row.sent]));
}

/**
 * The emails held for want of a business address (sender/lanes.ts `no_business_address`): what the Cold email page says
 * before anything else is wrong with them. The lead sends' standing index holds a workspace's held sends.
 */
export async function countHeldForAddress(db: Db, tenantId: TenantId): Promise<number> {
  const { count, error } = await db
    .from("sequence_sends")
    .select("id", { count: "exact", head: true })
    .eq("tenant_id", tenantId)
    .eq("state", "held")
    .eq("reason", "no_business_address")
    .not("lead_id", "is", null);
  if (error) throw new DbFailure(error, "cannot count the emails held for an address");
  return count ?? 0;
}
