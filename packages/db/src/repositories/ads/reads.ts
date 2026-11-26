/**
 * An ad account's reads (00650; decision 0049, step P1): what one read learned, kept through its one door; the clock's
 * hand-out; a read asked for when the platform says something changed; and the ads a workspace holds for an account,
 * which a read asks the platform about by name. Every write is a door's, called as the service role. A database that
 * has not run the migration answers `no_door`, where nothing is written and nothing is wrong (either deploy order).
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { DbFailure, recordOrEmpty, type AdPlatform, type TenantId } from "@chanlytics/contracts";
import { isMissingDoor } from "../../shared/missing-door";
import { tenantDb } from "../../shared/tenant-db";
import type { Database, Json } from "../../types";
import type { AdAccountReadKept } from "./accounts";

type Db = SupabaseClient<Database>;

/** An ad as a read hands it to the door: the platform's facts, and the budget it sits under. */
export interface AdReadRow {
  platform_ad_id: string;
  name: string;
  door: string;
  platform_set_id: string | null;
  platform_campaign_id: string | null;
  budget_kind: "total" | "daily" | null;
  budget_minor: number | null;
  budget_left_minor: number | null;
  budget_at: "campaign" | "set" | null;
  budget_shared: boolean | null;
  starts_at: string | null;
  ends_at: string | null;
  platform_state: string;
  platform_issue: string | null;
  /** What the platform holds the ad set to: an adopted ad's intent follows it unless a press is on its way. */
  intent: "on" | "paused" | "ended";
  said: Json | null;
  /** Where it shows: the platforms its ad set names; null where the platform named none. */
  shown_on: string[] | null;
}

/** A platform's day for an ad, as a read hands it to the door. Money in the account's minor units. */
export interface AdDayReadRow {
  platform_ad_id: string;
  day: string;
  spend_minor: number;
  impressions: number;
  clicks: number;
  platform_results: number | null;
  /**
   * What the day did, as the platform counts it (00719): plays, engagement, comments, reactions, saves, shares. Left out
   * of a day it counted none of them on, which the door keeps as nothing.
   */
  engaged?: Partial<Record<"plays" | "engaged" | "comments" | "reactions" | "saves" | "shares", number>>;
}

/** Everything one read learned. */
export interface AdsReadKept {
  account: AdAccountReadKept;
  ads?: AdReadRow[];
  days?: AdDayReadRow[];
  /** The account's days before this one (YYYY-MM-DD) are settled: the look back has passed them. */
  settled_before?: string;
  next_read_at: string;
  settle_at?: string;
  /** Whether the platform's notices are subscribed for the account, as this read left it. */
  notices?: "subscribed" | "dropped";
}

/** What keeping a read came to. */
export interface AdsReadOutcome {
  outcome: "moved" | "kept" | "failed" | "not_connected" | "no_door";
  adopted: number;
  moved: number;
  days: number;
}

const count = (value: unknown): number => (typeof value === "number" ? value : 0);

/** Keeps what one read of a connected account learned (ads_read_keep, 00650), in one transaction. */
export async function keepAdsRead(
  db: Db,
  tenantId: TenantId,
  accountId: string,
  read: AdsReadKept,
): Promise<AdsReadOutcome> {
  const { data, error } = await db.rpc("ads_read_keep", {
    p_tenant_id: tenantId,
    p_account_id: accountId,
    p_read: JSON.parse(JSON.stringify(read)) as Json,
  });
  if (error) {
    if (isMissingDoor(error)) return { outcome: "no_door", adopted: 0, moved: 0, days: 0 };
    throw new DbFailure(error, "ads_read_keep");
  }
  const answer = recordOrEmpty(data);
  const { outcome } = answer;
  return {
    outcome: outcome === "moved" || outcome === "kept" || outcome === "failed" ? outcome : "not_connected",
    adopted: count(answer.adopted),
    moved: count(answer.moved),
    days: count(answer.days),
  };
}

/** The clock's one statement (ads_hand_out, 00650): a read for each connected account whose time has come. */
export async function handOutAdReads(db: Db, spreadSeconds: number): Promise<{ reads: number }> {
  const { data, error } = await db.rpc("ads_hand_out", { p_spread_seconds: spreadSeconds });
  if (error) {
    if (isMissingDoor(error)) return { reads: 0 };
    throw new DbFailure(error, "ads_hand_out");
  }
  return { reads: count(recordOrEmpty(data).reads) };
}

/**
 * A read asked for, soon (ads_read_ask, 00650): the platform said something changed in the account, or a connect just
 * finished. How many it asked for: 0 where one waits already or the account is not connected.
 */
export async function askAdRead(db: Db, platform: AdPlatform, externalId: string): Promise<number> {
  const { data, error } = await db.rpc("ads_read_ask", { p_platform: platform, p_external_id: externalId });
  if (error) {
    if (isMissingDoor(error)) return 0;
    throw new DbFailure(error, "ads_read_ask");
  }
  return count(data);
}

/** The most ads of one account a read asks the platform about by name. */
const HELD_MAX = 500;

/** The platform's words for an ad that is gone: it is not asked about again. */
const GONE: readonly string[] = ["ARCHIVED", "DELETED"];

/**
 * The platform's ids of the ads a workspace holds for an account that the platform had not said were gone, newest
 * read first: the ones a read asks about by name when the platform's own list no longer names them. An ad that is gone
 * is no longer read, so the ones still read come first and the bound falls on the oldest.
 */
export async function listHeldAdIds(db: Db, tenantId: TenantId, accountId: string): Promise<string[]> {
  const { data, error } = await tenantDb(db, tenantId)
    .from("ads")
    .select("platform_ad_id, platform_state")
    .eq("account_id", accountId)
    .not("platform_ad_id", "is", null)
    .order("read_at", { ascending: false, nullsFirst: false })
    .limit(HELD_MAX);
  if (error) throw new DbFailure(error, "ads held for an account");
  return data.flatMap((row) => (GONE.includes(row.platform_state ?? "") ? [] : row.platform_ad_id));
}
