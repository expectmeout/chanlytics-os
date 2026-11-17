/**
 * An escalation as the member signed in can see it: read under row-level security, so one in another workspace is none.
 * And the call backs nothing has happened to in a week (decision 0136): the deadman tick's read, on the service role;
 * the platform's close of one is reads.ts letHoldGo, beside the other writes of a hold.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { DbFailure, type TenantId } from "@chanlytics/contracts";
import { platformWide } from "../../shared/tenant-db";
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
  quiet: { lead: string; beforeIso: string; pivot: string; limit: number },
): Promise<QuietCallBack[]> {
  const page = (from: "after" | "upTo", limit: number) => {
    const q = platformWide(db)
      .from("escalations")
      .select("id, tenant_id, conversation_id, details")
      .eq("state", "open")
      .eq("reason", "callback")
      .like("details", `${quiet.lead}%`)
      .lt("updated_at", quiet.beforeIso);
    return (from === "after" ? q.gt("id", quiet.pivot) : q.lte("id", quiet.pivot)).order("id").limit(limit);
  };
  const after = await page("after", quiet.limit);
  if (after.error) throw new DbFailure(after.error, "reading the call backs gone quiet");
  if (after.data.length >= quiet.limit) return after.data;
  const wrapped = await page("upTo", quiet.limit - after.data.length);
  if (wrapped.error) throw new DbFailure(wrapped.error, "reading the call backs gone quiet");
  return [...after.data, ...wrapped.data];
}
