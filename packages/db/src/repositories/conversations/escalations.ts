/**
 * An escalation as the member signed in can see it: read under row-level security, so one in another workspace is none.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "../../database.types";

type Db = SupabaseClient<Database>;

/** The escalation's id, workspace and state, or null where the member cannot see it; the read's error beside it. */
export const findEscalationState = (db: Db, id: string) =>
  db.from("escalations").select("id, tenant_id, state").eq("id", id).maybeSingle();
