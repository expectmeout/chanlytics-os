/**
 * The report functions Reports reads (00251, 00304, 00241): the receptionist's series, the campaigns' and the reach-outs',
 * each over a period of days and the period before it. The one place they are called by name; the dashboard asks on the
 * session client, so RLS decides what a member reads (`report_series` and `campaign_series` are SECURITY INVOKER;
 * `reach_out_report` is a definer that checks the member again). A read that fails throws: "we could not read" is never "none".
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database, Json } from "../../database.types";

type Db = SupabaseClient<Database>;

/** The receptionist's numbers day by day for `days` and the same number before them (`report_series`, 00304). */
export async function reportSeries(db: Db, tenantId: string, days: number): Promise<Json> {
  const { data, error } = await db.rpc("report_series", { p_tenant_id: tenantId, p_days: days });
  if (error) throw new Error(`report_series: ${error.message}`);
  return data;
}

/** What the broadcasts and playbooks sent, day by day for `days` and the same number before, and the period by source (`campaign_series`, 00251). */
export async function campaignSeries(db: Db, tenantId: string, days: number): Promise<Json> {
  const { data, error } = await db.rpc("campaign_series", { p_tenant_id: tenantId, p_days: days });
  if (error) throw new Error(`campaign_series: ${error.message}`);
  return data;
}

/**
 * What the workspace's reach-outs wrote over `days`, and what came of it (`reach_out_report`, 00241). The function raises
 * contracts' own refusals with a code the door words (not found, not as it may be); they come back as they are, not thrown.
 */
export async function reachOutReport(
  db: Db,
  tenantId: string,
  days: number,
): Promise<{ ok: true; data: Json } | { ok: false; code: string; message: string }> {
  const { data, error } = await db.rpc("reach_out_report", { p_tenant_id: tenantId, p_days: days });
  if (error) return { ok: false, code: error.code ?? "", message: error.message };
  return { ok: true, data };
}
