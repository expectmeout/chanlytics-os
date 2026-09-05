import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@chanlytics/db";

/**
 * The two facts every export header needs: what the business is called and
 * which clock it keeps. Read under the caller's RLS; a member can read their
 * own tenant's row and nobody else's.
 */
export async function tenantFacts(
  supabase: SupabaseClient<Database>,
  tenantId: string,
): Promise<{ name: string; timezone: string }> {
  const { data, error } = await supabase.from("tenants").select("name, timezone").eq("id", tenantId).maybeSingle();
  if (error) throw new Error(error.message);
  return { name: data?.name ?? "Workspace", timezone: data?.timezone ?? "America/New_York" };
}
