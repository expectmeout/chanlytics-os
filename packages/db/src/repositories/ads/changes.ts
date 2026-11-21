/**
 * An owner's changes to a running ad made here (00670; decision 0050, Routes budget, end-date, end): what they asked,
 * kept through its one door with the decision; what telling the platform came to; and an account's changes still on
 * their way, or sent and never answered. Every write is a door's, called as the service role. A database that has not
 * run the migration answers `no_door`, where nothing is written and nothing is wrong (either deploy order).
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { DbFailure, nonBlankOrNull, recordOrEmpty, type TenantId } from "@chanlytics/contracts";
import { isMissingDoor } from "../../shared/missing-door";
import { tenantDb } from "../../shared/tenant-db";
import type { Database, Json } from "../../types";

type Db = SupabaseClient<Database>;

/** What a change came to at its door. */
export interface AdChangeKept {
  outcome:
    | "asked"
    | "same"
    | "took_back"
    | "stale"
    | "busy"
    | "amount_soon"
    | "unsure"
    | "over"
    | "not_here"
    | "not_allowed"
    | "not_connected"
    | "not_made"
    | "not_found"
    | "no_door";
  version: number | null;
  /** Whether the platform is to be told: false where it undid one on its way that was never told. */
  tell: boolean;
  /** `same`: whether it is still on its way to the platform. */
  pending: boolean;
  /** `amount_soon`: when the platform takes the next change of the amount. */
  nextAt: string | null;
  accountId: string | null;
  /** When the platform was last told of a change to this ad, before this press. */
  toldAt: string | null;
}

const CHANGE_OUTCOMES = [
  "asked",
  "same",
  "took_back",
  "stale",
  "busy",
  "amount_soon",
  "unsure",
  "over",
  "not_here",
  "not_allowed",
  "not_connected",
  "not_made",
  "not_found",
] as const;

/** An owner's change (ad_change_keep, 00670): kept with its decision, in one transaction. */
export async function keepAdChange(
  db: Db,
  by: { tenantId: TenantId; userId: string },
  press: { adId: string; version: number; change: Json },
): Promise<AdChangeKept> {
  const none = { version: null, tell: false, pending: false, nextAt: null, accountId: null, toldAt: null };
  const { data, error } = await db.rpc("ad_change_keep", {
    p_tenant_id: by.tenantId,
    p_actor: by.userId,
    p_ad_id: press.adId,
    p_version: press.version,
    p_change: press.change,
  });
  if (error) {
    if (isMissingDoor(error)) return { outcome: "no_door", ...none };
    throw new DbFailure(error, "ad_change_keep");
  }
  const answer = recordOrEmpty(data);
  const outcome = CHANGE_OUTCOMES.find((one) => one === answer.outcome);
  if (!outcome) throw new Error("ad_change_keep answered no outcome");
  return {
    outcome,
    version: typeof answer.version === "number" ? answer.version : null,
    tell: answer.tell === true,
    pending: answer.pending === true,
    nextAt: nonBlankOrNull(answer.next_at),
    accountId: nonBlankOrNull(answer.account_id),
    toldAt: nonBlankOrNull(answer.told_at),
  };
}

/** What telling the platform of a change came to (ad_change_told, 00670). */
export async function markAdChangeTold(
  db: Db,
  tenantId: TenantId,
  telling: { adId: string; outcome: "told" | "refused" | "unknown" | "not_taken"; said?: string | null },
): Promise<string> {
  const { data, error } = await db.rpc("ad_change_told", {
    p_tenant_id: tenantId,
    p_ad_id: telling.adId,
    p_outcome: telling.outcome,
    ...(telling.said ? { p_said: telling.said } : {}),
  });
  if (error) throw new DbFailure(error, "ad_change_told");
  return typeof data === "string" ? data : "not_found";
}

/** An ad with a change of its owner's on its way, or sent and never answered, with what telling it needs. */
export interface AdChangeRow {
  id: string;
  name: string;
  platform_set_id: string | null;
  platform_campaign_id: string | null;
  change: Json | null;
  approved: Json | null;
  told_at: string | null;
}

/** The most ads with a change of theirs that one look takes. */
const CHANGED_MAX = 200;

/** An account's ads made here with a change on its way, the oldest ask first (by when it was last told). */
export async function listAdChanges(db: Db, tenantId: TenantId, accountId: string): Promise<AdChangeRow[]> {
  const { data, error } = await tenantDb(db, tenantId)
    .from("ads")
    .select("id, name, platform_set_id, platform_campaign_id, change, approved, told_at")
    .eq("account_id", accountId)
    .eq("status", "made")
    .eq("origin", "chanlytics")
    .not("change", "is", null)
    .order("updated_at", { ascending: true })
    .limit(CHANGED_MAX);
  if (error) throw new DbFailure(error, "an account's changes on their way");
  return data;
}
