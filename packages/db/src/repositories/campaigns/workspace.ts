/**
 * What a campaign asks of the workspace itself: whether it is paused.
 *
 * A paused workspace (`tenants.status = 'paused'`: billing stopped it, or a person did) sends nothing: the wire holds every
 * person of a run, each for good. So a run is neither approved nor started by hand while it lasts (core approveRun, the
 * edge's run-now door), and the hourly sweep leaves its playbooks alone (00245 playbooks_due).
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "../../database.types";

type Db = SupabaseClient<Database>;

/**
 * Whether the workspace is paused (tenants.status, written by billing): THE one reading of it for a campaign, which the
 * dashboard's composers and routes (so the page says so where Send would be, and a broadcast made under it is refused),
 * the approval verb and the send job (so a run stops, core broadcast-stops.ts) all ask. A read that fails throws: "we could
 * not check" is not "it is not paused".
 */
export async function workspacePaused(db: Db, tenantId: string): Promise<boolean> {
  const { data, error } = await db.from("tenants").select("status").eq("id", tenantId).maybeSingle();
  if (error) throw new Error(`cannot read the workspace: ${error.message}`);
  return data?.status === "paused";
}
