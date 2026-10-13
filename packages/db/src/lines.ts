/**
 * A workspace's own line, as the edge's doors that read its texts need it, and the business on record its filings read.
 *
 * The line a workspace was given (provisioned through a provider: Twilio, or the dry one on a preview) as the Connections
 * page's rows say it (the oldest that is not a number the business kept at its carrier), with what a read of its texts takes:
 * which line, its number, its provider and its subaccount. Nothing here reads the vault: the account's token is the edge's
 * own door (lineAccount, apps/edge/lib/sms/sms.ts). A read that fails throws.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "./database.types";

// No `type Db` alias here, as the repositories write one: the declaration bundler numbers every module's alias (`Db$x`), and a
// new one renumbers every alias after it, which is a diff of hundreds of lines in a committed file that says nothing new.

/** The workspace's own line that can have texts (not a carrier's, not one whose provisioning failed), or null. */
export async function ownLineOf(
  db: SupabaseClient<Database>,
  tenantId: string,
): Promise<Pick<
  Database["public"]["Tables"]["lines"]["Row"],
  "id" | "tenant_id" | "e164" | "provider" | "subaccount_sid" | "messaging_service_sid" | "sms_state" | "voice_state"
> | null> {
  const { data, error } = await db
    .from("lines")
    .select("id, tenant_id, e164, provider, subaccount_sid, messaging_service_sid, sms_state, voice_state")
    .eq("tenant_id", tenantId)
    .neq("provider", "carrier")
    .neq("voice_state", "failed")
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();
  if (error) throw new Error(`cannot read the workspace's own line: ${error.message}`);
  return data;
}

/**
 * The business on record, whole: what a carrier filing reads and what the save door compares a save against (the
 * wiring's second audit, X4-3). Null when nothing is on record. A read that fails throws.
 */
export async function businessOnRecordOf(
  db: SupabaseClient<Database>,
  tenantId: string,
): Promise<Database["public"]["Tables"]["business_records"]["Row"] | null> {
  const { data, error } = await db.from("business_records").select("*").eq("tenant_id", tenantId).maybeSingle();
  if (error) throw new Error(`cannot read the business on record: ${error.message}`);
  return data;
}
