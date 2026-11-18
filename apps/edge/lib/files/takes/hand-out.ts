/**
 * The takes' hand-out (00642 source_takes_hand_out; the review of 18 November, findings 5, 6 and 16): waiting items
 * are given their jobs while their workspace has fewer than a few in flight and the video platform is preparing fewer
 * than so many clips. It is asked for one workspace as a take of its ends, as the video platform's word settles a
 * clip, and (at the join with the sync) as a read ends with new files waiting; and for every workspace on the clock,
 * which is the floor under those. A paused kind is handed nothing.
 */
import type { TenantId } from "@chanlytics/contracts";
import { handOutSourceTakes } from "@chanlytics/db/files";
import type { Database } from "@chanlytics/db/types";
import type { SupabaseClient } from "@supabase/supabase-js";
import { logger } from "../../shared/log.js";
import { TAKE_HAND_OUT } from "./budgets.js";

type Db = SupabaseClient<Database>;

/** Jobs handed to one workspace's waiting items, or with none named to every workspace's. Answers how many. */
export async function handOutTakes(db: Db, tenantId: TenantId | null = null): Promise<number> {
  const handed = await handOutSourceTakes(db, { tenantId, ...TAKE_HAND_OUT });
  if (handed > 0) logger(tenantId ? { tenant_id: tenantId } : {}).info("source_take", { handed });
  return handed;
}
