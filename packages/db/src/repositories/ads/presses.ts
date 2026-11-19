/**
 * An owner's presses on an ad (00652; decision 0050, calls 1, 2 and 9): what they asked, kept through its one door
 * with the decision and the event; what telling the platform came to; a press the platform will take soon; and the
 * presses of an account still on their way. Every write is a door's, called as the service role. A database that has
 * not run the migration answers `no_door`, where nothing is written and nothing is wrong (either deploy order).
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { DbFailure, recordOrEmpty, type TenantId } from "@chanlytics/contracts";
import { isMissingDoor } from "../../shared/missing-door";
import { tenantDb } from "../../shared/tenant-db";
import type { Database } from "../../types";

type Db = SupabaseClient<Database>;

/** What an owner asks of an ad: that it runs, or that it is paused. */
export type AdIntent = "on" | "paused";

/** What a press came to at its door. */
export interface AdPressKept {
  outcome:
    "asked" | "same" | "stale" | "cant_resume" | "not_allowed" | "not_connected" | "not_made" | "not_found" | "no_door";
  version: number | null;
  /** Whether the platform is to be told: false where the press took back one it was never told of. */
  tell: boolean;
  /** `same`: whether what was asked is still on its way to the platform. */
  pending: boolean;
  accountId: string | null;
  platformAdId: string | null;
  /** When the platform was last told of a change to this ad, before this press. */
  toldAt: string | null;
}

const OUTCOMES = [
  "asked",
  "same",
  "stale",
  "cant_resume",
  "not_allowed",
  "not_connected",
  "not_made",
  "not_found",
] as const;
const text = (value: unknown): string | null => (typeof value === "string" && value !== "" ? value : null);

/** An owner's press (ad_set_intent, 00652): kept with its decision and its event, in one transaction. */
export async function setAdIntent(
  db: Db,
  by: { tenantId: TenantId; userId: string },
  press: { adId: string; version: number; intent: AdIntent },
): Promise<AdPressKept> {
  const none = { version: null, tell: false, pending: false, accountId: null, platformAdId: null, toldAt: null };
  const { data, error } = await db.rpc("ad_set_intent", {
    p_tenant_id: by.tenantId,
    p_actor: by.userId,
    p_ad_id: press.adId,
    p_version: press.version,
    p_intent: press.intent,
  });
  if (error) {
    if (isMissingDoor(error)) return { outcome: "no_door", ...none };
    throw new DbFailure(error, "ad_set_intent");
  }
  const answer = recordOrEmpty(data);
  const outcome = OUTCOMES.find((one) => one === answer.outcome);
  if (!outcome) throw new Error("ad_set_intent answered no outcome");
  return {
    outcome,
    version: typeof answer.version === "number" ? answer.version : null,
    tell: answer.tell === true,
    pending: answer.pending === true,
    accountId: text(answer.account_id),
    platformAdId: text(answer.platform_ad_id),
    toldAt: text(answer.told_at),
  };
}

/** What telling the platform of a press came to (ad_told, 00652). */
export async function markAdTold(
  db: Db,
  tenantId: TenantId,
  told: {
    adId: string;
    asked: AdIntent;
    outcome: "told" | "refused" | "unknown";
    platformState?: string | null;
    said?: string | null;
  },
): Promise<string> {
  const { data, error } = await db.rpc("ad_told", {
    p_tenant_id: tenantId,
    p_ad_id: told.adId,
    p_asked: told.asked,
    p_outcome: told.outcome,
    ...(told.platformState ? { p_platform_state: told.platformState } : {}),
    ...(told.said ? { p_said: told.said } : {}),
  });
  if (error) throw new DbFailure(error, "ad_told");
  return typeof data === "string" ? data : "not_found";
}

/** A press the platform will take soon (ad_tell_ask, 00652): its account's read is asked for at that moment. */
export async function askAdTell(db: Db, tenantId: TenantId, adId: string): Promise<number> {
  const { data, error } = await db.rpc("ad_tell_ask", { p_tenant_id: tenantId, p_ad_id: adId });
  if (error) {
    if (isMissingDoor(error)) return 0;
    throw new DbFailure(error, "ad_tell_ask");
  }
  return typeof data === "number" ? data : 0;
}

/** A press on its way: the ad, what was asked of it, and when the platform was last told of a change to it. */
export interface AdPendingRow {
  id: string;
  platform_ad_id: string;
  intent: AdIntent;
  /** When the owner asked: the oldest ask of a kind is sent first. */
  intent_at: string;
  told_at: string | null;
}

/** The most ads with a press of theirs that one look takes. */
const PRESSED_MAX = 200;

/**
 * The presses of an account's ads that the platform has not been told of yet: an ask newer than the telling. Read
 * newest ask first; the two moments are compared here, since a filter cannot compare two columns.
 */
export async function listPendingAds(db: Db, tenantId: TenantId, accountId: string): Promise<AdPendingRow[]> {
  const { data, error } = await tenantDb(db, tenantId)
    .from("ads")
    .select("id, platform_ad_id, intent, intent_at, told_at, status")
    .eq("account_id", accountId)
    .eq("status", "made")
    .not("intent_at", "is", null)
    .order("intent_at", { ascending: false })
    .limit(PRESSED_MAX);
  if (error) throw new DbFailure(error, "an account's pending presses");
  return data.flatMap((row) => {
    const pending = row.told_at === null || row.told_at < row.intent_at;
    const intent = row.intent === "on" || row.intent === "paused" ? row.intent : null;
    return pending && intent !== null && row.platform_ad_id !== null
      ? [{ id: row.id, platform_ad_id: row.platform_ad_id, intent, intent_at: row.intent_at, told_at: row.told_at }]
      : [];
  });
}

/** An ad its platform holds, with what its badge is read from: what a disconnect that pauses first looks through. */
export interface AdMadeRow {
  id: string;
  name: string;
  version: number;
  platform: string;
  status: string;
  intent: string;
  platform_state: string | null;
  ends_at: string | null;
  budget_kind: string | null;
  budget_minor: number | null;
  budget_left_minor: number | null;
}

/** The most ads of one account that are looked through: what a read adopts at most. */
const MADE_MAX = 500;

/**
 * An account's ads its platform holds, each with what its badge is read from. Which of them is left on is the badge's
 * to say (contracts adStateOfRow), not a filter's: the page that counts them and the edge that pauses them ask it.
 */
export async function listMadeAds(db: Db, tenantId: TenantId, accountId: string): Promise<AdMadeRow[]> {
  const { data, error } = await tenantDb(db, tenantId)
    .from("ads")
    .select(
      "id, name, version, platform, status, intent, platform_state, ends_at, budget_kind, budget_minor, budget_left_minor",
    )
    .eq("account_id", accountId)
    .eq("status", "made")
    .order("created_at", { ascending: false })
    .limit(MADE_MAX);
  if (error) throw new DbFailure(error, "an account's ads at its platform");
  return data;
}
