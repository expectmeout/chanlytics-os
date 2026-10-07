/**
 * The receptionist's first replies (`first_replies`, 00303): the one rule for who answered and how fast, which `report_series` and
 * `metrics_summary` both read, asked for Today's day so its sentences about speed can say each reply against its hold. The one place
 * the function is called by name, in a module of its own beside the report functions (report-series.ts); the dashboard asks on the
 * session client, so RLS decides what a member reads (SECURITY INVOKER). A read that fails throws: "we could not read" is never "none".
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "../../database.types";

type Db = SupabaseClient<Database>;

/**
 * The receptionist's first replies asked since `since`, each as `report_series` lists them: the seconds it took and the seconds it
 * was held, whole as the SQL rounds them (`round(ai_seconds)`, `round(coalesce(ai_hold_s, 0))`), so a reply is the same class on
 * Reports and on Today at the slack's edge. Only the ones the receptionist answered; each keeps the moment it was asked, so a
 * caller can keep a window's own.
 */
export async function firstReplies(
  db: Db,
  tenantId: string,
  since: Date,
): Promise<{ asked_at: string; s: number; hold: number }[]> {
  const { data, error } = await db.rpc("first_replies", { p_tenant_id: tenantId, p_start: since.toISOString() });
  if (error) throw new Error(`first_replies: ${error.message}`);
  return (data ?? []).flatMap((r) =>
    Number.isFinite(r.ai_seconds)
      ? [
          {
            asked_at: r.asked_at,
            s: Math.round(r.ai_seconds),
            hold: Number.isFinite(r.ai_hold_s) ? Math.round(r.ai_hold_s) : 0,
          },
        ]
      : [],
  );
}
