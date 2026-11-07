/**
 * A workspace's plan as the spend rule reads it (decision 0111): its mode and its status. The answer is the database's as
 * it came; the caller decides what it means.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "../../database.types";

type Db = SupabaseClient<Database>;

/** The workspace's billing mode and status. */
export const findPlanStanding = (db: Db, tenantId: string) =>
  db.from("billing_accounts").select("mode, status").eq("tenant_id", tenantId).maybeSingle();
