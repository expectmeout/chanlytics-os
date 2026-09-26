/**
 * Partners (decision 0011): the one place the two tables are typed. Reads run on the session client, so RLS
 * decides what comes back: a partner sees their own row and the workspaces they brought; an owner sees who
 * brought theirs. The writes are functions (partner_become, create_workspace) and the service role's.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "../database.types";

type Db = SupabaseClient<Database>;

export type PartnerRow = Database["public"]["Tables"]["partners"]["Row"];
export type PartnerTenantRow = Database["public"]["Tables"]["partner_tenants"]["Row"];

/** The columns the pane reads: never the payout facts, which are the platform's. */
const PARTNER_COLUMNS = "id, code, status, share_bp, terms_accepted_at, created_at";
export type PartnerPublicRow = Pick<
  PartnerRow,
  "id" | "code" | "status" | "share_bp" | "terms_accepted_at" | "created_at"
>;

/** The error a database 00190 has not reached answers a read of the table with. */
const noTable = (message: string): boolean =>
  /\bpartners\b/.test(message) && /does not exist|could not find|schema cache/i.test(message);

/**
 * The caller's own partner row, or null: none, or a database 00190 has not reached, which reads as none so the app
 * boots whichever deploys first. Any other failure is thrown.
 */
export async function getOwnPartner(db: Db): Promise<PartnerPublicRow | null> {
  const { data, error } = await db.from("partners").select(PARTNER_COLUMNS).maybeSingle();
  if (error) {
    if (noTable(error.message)) return null;
    throw new Error(`getOwnPartner: ${error.message}`);
  }
  return data;
}

/** The caller becomes a partner with this code: the function's own words come back as the error's message. */
export async function becomePartner(
  db: Db,
  code: string,
): Promise<{ ok: true; row: PartnerPublicRow } | { ok: false; code: string; message: string }> {
  const { data, error } = await db.rpc("partner_become", { p_code: code });
  if (error) return { ok: false, code: error.code ?? "", message: error.message };
  return { ok: true, row: data as unknown as PartnerPublicRow };
}
