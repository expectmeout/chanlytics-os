/**
 * How often the owner changes what the receptionist writes (decision 0063, 00448 held_drafts_by_intent): its drafts held
 * for the owner over the last days, by the intent the model stamped, with what became of each. Under the caller's RLS.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "../../types";
import type { TenantId } from "@chanlytics/contracts";
import { DbFailure } from "@chanlytics/contracts";

type Db = SupabaseClient<Database>;

/** One intent's held drafts: how many, and how many were sent as written, rewritten, stopped, or answered first. */
interface HeldDraftsRow {
  intent: string;
  held: number;
  sent: number;
  steered: number;
  canceled: number;
  person_first: number;
}

/** The workspace's held drafts of the last `days`, by intent. */
export async function listHeldDraftsByIntent(db: Db, tenantId: TenantId, days: number): Promise<HeldDraftsRow[]> {
  const { data, error } = await db.rpc("held_drafts_by_intent", { p_tenant_id: tenantId, p_days: days });
  if (error) throw new DbFailure(error, "held_drafts_by_intent");
  return data.map((r) => ({
    intent: r.intent,
    held: r.held,
    sent: r.sent,
    steered: r.steered,
    canceled: r.canceled,
    person_first: r.person_first,
  }));
}
