/**
 * What a campaign asks of the workspace itself: whether it is paused, and the link its review slot is filled with.
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

/**
 * The link a customer leaves the business a review at, as its Google listing keeps it (google_listings.new_review_uri,
 * 00408: the bound Business Profile location's), or null: no listing, none bound, or a database 00408 has not reached
 * (Postgres's 42703 on that column, and only that), so either app may deploy first. THE one reading of it for a
 * message's review_link slot: the dashboard's template-values port, on the member's session (refused in words where it
 * is null), and the send job. Any other failed read throws: "we could not read it" is not "there is none".
 */
export async function reviewLinkOf(db: Db, tenantId: string): Promise<string | null> {
  const { data, error } = await db
    .from("google_listings")
    .select("new_review_uri")
    .eq("tenant_id", tenantId)
    .maybeSingle();
  if (error && error.code === "42703" && error.message.includes("new_review_uri")) return null;
  if (error) throw new Error(`cannot read the workspace's review link: ${error.message}`);
  return data?.new_review_uri?.trim() || null;
}
