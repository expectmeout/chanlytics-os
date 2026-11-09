/**
 * A workspace's own line, as the edge's doors that read its texts need it, and the business on record its filings read.
 *
 * The line a workspace was given (provisioned through a provider: Twilio, or the dry one on a preview) as the Connections
 * page's rows say it (the oldest that is not a number the business kept at its carrier), with what a read of its texts takes:
 * which line, its number, its provider and its subaccount. Nothing here reads the vault: the account's token is the edge's
 * own door (findLineAccount, apps/edge/lib/lines/sms.ts). A read that fails throws.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { LINE_FILED_NAMES, recordOrEmpty, DbFailure } from "@chanlytics/contracts";
import type { Database } from "../../types";
import { tenantDb } from "../../shared/tenant-db";
import type { TenantId } from "@chanlytics/contracts";

// No `type Db` alias here, as the repositories write one: the declaration bundler numbers every module's alias (`Db$x`), and a
// new one renumbers every alias after it, which is a diff of hundreds of lines in a committed file that says nothing new.

/** The workspace's own line that can have texts (not a carrier's, not one whose provisioning failed), or null. */
export async function findOwnLine(
  db: SupabaseClient<Database>,
  tenantId: TenantId,
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
  if (error) throw new DbFailure(error, "cannot read the workspace's own line");
  return data;
}

/**
 * Every workspace's lines that can have texts, as ownLineOf reads one (not a number the business kept at its carrier, not
 * one whose provisioning failed, and one with a number): what the texts sweep reads each line's record of received texts
 * for (apps/edge/lib/sms/texts-sweep.ts). A read that fails throws.
 */
export async function linesThatText(
  db: SupabaseClient<Database>,
): Promise<
  Pick<
    Database["public"]["Tables"]["lines"]["Row"],
    "id" | "tenant_id" | "e164" | "provider" | "subaccount_sid" | "messaging_service_sid" | "sms_state" | "voice_state"
  >[]
> {
  const { data, error } = await db
    .from("lines")
    .select("id, tenant_id, e164, provider, subaccount_sid, messaging_service_sid, sms_state, voice_state")
    .neq("provider", "carrier")
    .neq("voice_state", "failed")
    .not("e164", "is", null)
    .order("created_at", { ascending: true });
  if (error) throw new DbFailure(error, "cannot read the lines that text");
  return data ?? [];
}

/**
 * The business on record, whole: what a carrier filing reads and what the save door compares a save against (the
 * wiring's second audit, X4-3). Null when nothing is on record. A read that fails throws.
 */
export async function findBusinessOnRecord(
  db: SupabaseClient<Database>,
  tenantId: TenantId,
): Promise<Database["public"]["Tables"]["business_records"]["Row"] | null> {
  const { data, error } = await db.from("business_records").select("*").eq("tenant_id", tenantId).maybeSingle();
  if (error) throw new DbFailure(error, "cannot read the business on record");
  return data;
}

/**
 * A line's token out of Vault, when the line is given back: nothing is left to open a subaccount nobody points at. A token
 * not there is as done. A call that fails throws, and the row, which is what would find it, stays.
 */
export async function dropLineCredentials(db: SupabaseClient<Database>, lineId: string): Promise<void> {
  const { error } = await db.rpc("drop_line_credentials", { p_line_id: lineId });
  if (error) throw new DbFailure(error, "dropping the line's token");
}

/**
 * The names a workspace's filings sent the carriers, off its lines' facts (contracts LINE_FILED_NAMES): the campaign's,
 * which the text confirming a START states, and the brand's, the business on record's. Null each where no filing kept one
 * (a filing before the name was kept, or none at all). For what a rename says the carriers still hold, and the
 * confirmation's name (the wiring's second audit, X4-5). A read that fails throws.
 */
export async function findFiledNames(
  db: SupabaseClient<Database>,
  tenantId: TenantId,
): Promise<{ campaign: string | null; brand: string | null }> {
  const { data, error } = await db
    .from("lines")
    .select("facts")
    .eq("tenant_id", tenantId)
    .neq("provider", "carrier")
    .order("created_at", { ascending: true });
  if (error) throw new DbFailure(error, "cannot read the names the workspace filed");
  const named = (key: string): string | null => {
    for (const row of data ?? []) {
      const value = recordOrEmpty(row.facts)[key];
      if (typeof value === "string" && value.trim()) return value.trim();
    }
    return null;
  };
  return { campaign: named(LINE_FILED_NAMES.campaign), brand: named(LINE_FILED_NAMES.brand) };
}

/** The business on record saved, one a workspace, and back whole. The answer is the database's as it came. */
export const saveBusinessOnRecord = async (
  db: SupabaseClient<Database>,
  tenantId: TenantId,
  row: Database["public"]["Tables"]["business_records"]["Insert"],
) => tenantDb(db, tenantId).from("business_records").upsert(row, { onConflict: "tenant_id" }).select("*").single();
