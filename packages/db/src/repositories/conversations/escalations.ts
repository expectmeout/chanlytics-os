/**
 * An escalation as the member signed in can see it: read under row-level security, so one in another workspace is none.
 * And the call backs nothing has happened to in a week, with the platform's own close of one (decision 0136): the
 * deadman tick's, on the service role.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { DbFailure, type TenantId } from "@chanlytics/contracts";
import { platformWide, tenantDb } from "../../shared/tenant-db";
import type { Database } from "../../types";

type Db = SupabaseClient<Database>;

/** The escalation's id, workspace and state, or null where the member cannot see it; the read's error beside it. */
export const findEscalationState = async (db: Db, id: string) =>
  db.from("escalations").select("id, tenant_id, state").eq("id", id).maybeSingle();

/** A call back still open, as the let-go reads it: whose it is, its thread, and what asked for it. */
export interface QuietCallBack {
  id: string;
  tenant_id: TenantId;
  conversation_id: string;
  details: string | null;
}

/**
 * The open call backs whose details begin with `lead` and that nothing has touched since `beforeIso`, in the order of
 * their ids from `pivot` on and then from the start, at most `limit`, across workspaces. From a pivot the caller picks
 * anew each time, because some are left standing for good (someone the business talks with): read oldest first, those
 * would hold the head of the list for ever, and the ones behind them would never be reached. A read that fails throws.
 */
export async function listCallBacksGoneQuiet(
  db: Db,
  asked: { lead: string; beforeIso: string; pivot: string; limit: number },
): Promise<QuietCallBack[]> {
  const page = (from: "after" | "upTo", limit: number) => {
    const q = platformWide(db)
      .from("escalations")
      .select("id, tenant_id, conversation_id, details")
      .eq("state", "open")
      .eq("reason", "callback")
      .like("details", `${asked.lead}%`)
      .lt("updated_at", asked.beforeIso);
    return (from === "after" ? q.gt("id", asked.pivot) : q.lte("id", asked.pivot)).order("id").limit(limit);
  };
  const after = await page("after", asked.limit);
  if (after.error) throw new DbFailure(after.error, "reading the call backs gone quiet");
  if (after.data.length >= asked.limit) return after.data;
  const wrapped = await page("upTo", asked.limit - after.data.length);
  if (wrapped.error) throw new DbFailure(wrapped.error, "reading the call backs gone quiet");
  return [...after.data, ...wrapped.data];
}

/**
 * A hold let go by the platform: resolved with no member named and no decision, as a thread set aside resolves its own
 * (00539 conversation_set_aside). True when it was still open, so two ticks let one hold go once. Its notices close with
 * it (escalation_closes_its_notices), and the thread is left as it stands: a call that reached no answer paused nothing.
 */
export async function letHoldGo(db: Db, tenantId: TenantId, escalationId: string): Promise<boolean> {
  const { data, error } = await tenantDb(db, tenantId)
    .from("escalations")
    .update({ state: "resolved" })
    .eq("id", escalationId)
    .eq("state", "open")
    .select("id");
  if (error) throw new DbFailure(error, "letting a call back go");
  return data.length > 0;
}
