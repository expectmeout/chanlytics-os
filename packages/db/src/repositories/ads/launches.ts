/**
 * Turning an ad on, and its launch (00666; decision 0050, calls 3 to 6): the owner's press kept through its one door,
 * what the launch made, sent or left kept through its own, the launches of an account still on their way, and what an
 * account's read needs to fold an ad made here, three ads at the platform, into the one ad the owner made. Every write
 * is a door's, called as the service role. A database that has not run the migration answers `no_door`, where nothing
 * is written and nothing is wrong (either deploy order).
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { DbFailure, recordOrEmpty, type TenantId } from "@chanlytics/contracts";
import { isMissingDoor } from "../../shared/missing-door";
import { tenantDb } from "../../shared/tenant-db";
import type { Database, Json } from "../../types";

type Db = SupabaseClient<Database>;

/** What an owner's press came to at its door. */
export interface AdTurnOnKept {
  outcome: "kept" | "same" | "not_allowed" | "not_connected" | "stopped" | "busy" | "stale" | "no_door";
  adId: string | null;
  /** The approval the press was kept with (00710); null for any other outcome, or before that migration. */
  approvalId: string | null;
}

const TURN_ON_OUTCOMES = ["kept", "same", "not_allowed", "not_connected", "stopped", "busy", "stale"] as const;
const launchTextOf = (value: unknown): string | null => (typeof value === "string" && value !== "" ? value : null);

/**
 * An owner's Turn on (ad_turn_on, 00666, 00710): the kept draft, as the press judged it, becomes the ad, setting up, with
 * the decision, the event, its approval and the account's job, in one transaction.
 */
export async function keepTurnOn(
  db: Db,
  by: { tenantId: TenantId; userId: string },
  press: { key: string; draftAt: string; ad: Json },
): Promise<AdTurnOnKept> {
  const { data, error } = await db.rpc("ad_turn_on", {
    p_tenant_id: by.tenantId,
    p_actor: by.userId,
    p_key: press.key,
    p_draft_at: press.draftAt,
    p_ad: press.ad,
  });
  if (error) {
    if (isMissingDoor(error)) return { outcome: "no_door", adId: null, approvalId: null };
    throw new DbFailure(error, "ad_turn_on");
  }
  const answer = recordOrEmpty(data);
  const outcome = TURN_ON_OUTCOMES.find((one) => one === answer.outcome);
  if (!outcome) throw new Error("ad_turn_on answered no outcome");
  return { outcome, adId: launchTextOf(answer.ad_id), approvalId: launchTextOf(answer.approval_id) };
}

/** One part a launch made, sent or left, as its door keeps it. */
export type AdPartKept = {
  kind: "campaign" | "set" | "picture" | "ad";
  /** Which version of the words an ad is (1 to 3); 0 for the parts every version shares. */
  version: number;
  name: string;
  state: "sent" | "made" | "refused" | "removed" | "left";
  platform_id?: string | null;
};

/** What one step of a launch hands its door: a plain object, so it is sent as the door's jsonb as it is. */
export type AdLaunchStep = {
  objects?: AdPartKept[];
  /** Merged into the ad's launch: its step, when a write went unanswered, why it stopped, Meta's own words. */
  launch?: Record<string, Json>;
  /** Where it ends: made, with the platform's ids and word, or failed. */
  status?: "made" | "failed";
  campaign_id?: string;
  set_id?: string;
  platform_ad_id?: string;
  platform_state?: string | null;
};

/**
 * Where the ad stands once its door kept the step: a launch the owner's account let go of is not taken further, and one
 * its owner cancelled (or a yes taken back did, 00676) stops at its next step.
 */
export interface AdLaunchAfter {
  status: string;
  intent: string;
  cancelled: boolean;
}

/** Whether an ad's launch, as its row keeps it, holds a cancel (ad_launch_cancel, 00676). */
const launchCancelledOf = (launch: unknown): boolean => recordOrEmpty(launch).cancel != null;

/** One step of a launch kept (ad_launch_keep, 00666). */
export async function keepAdLaunch(
  db: Db,
  tenantId: TenantId,
  adId: string,
  step: AdLaunchStep,
): Promise<AdLaunchAfter> {
  const { data, error } = await db.rpc("ad_launch_keep", {
    p_tenant_id: tenantId,
    p_ad_id: adId,
    p_kept: step,
  });
  if (error) throw new DbFailure(error, "ad_launch_keep");
  const answer = recordOrEmpty(data);
  return {
    status: launchTextOf(answer.status) ?? "not_found",
    intent: launchTextOf(answer.intent) ?? "on",
    cancelled: launchCancelledOf(answer.launch),
  };
}

/** What a cancel came to at its door: kept, asked already, too late (made), over (stopped), or refused. */
export interface AdCancelKept {
  outcome: "asked" | "same" | "made" | "stopped" | "not_found" | "not_allowed" | "no_door";
  version: number | null;
}

const CANCEL_OUTCOMES = ["asked", "same", "made", "stopped", "not_found", "not_allowed"] as const;

/**
 * The owner cancels an ad while it is set up (ad_launch_cancel, 00676; the Ads plan's 4.7, point 8): kept on its launch,
 * with the decision, and its account's job brought within a minute, which stops it at its next step. Nothing is sent to
 * the platform here.
 */
export async function cancelAdLaunch(
  db: Db,
  by: { tenantId: TenantId; userId: string },
  adId: string,
): Promise<AdCancelKept> {
  const { data, error } = await db.rpc("ad_launch_cancel", {
    p_tenant_id: by.tenantId,
    p_actor: by.userId,
    p_ad_id: adId,
  });
  if (error) {
    if (isMissingDoor(error)) return { outcome: "no_door", version: null };
    throw new DbFailure(error, "ad_launch_cancel");
  }
  const answer = recordOrEmpty(data);
  const outcome = CANCEL_OUTCOMES.find((one) => one === answer.outcome);
  if (!outcome) throw new Error("ad_launch_cancel answered no outcome");
  return { outcome, version: typeof answer.version === "number" ? answer.version : null };
}

/** Whether a launch was cancelled since it was last read: asked fresh before every switch, never trusted from memory. */
export async function isAdLaunchCancelled(db: Db, tenantId: TenantId, adId: string): Promise<boolean> {
  const { data, error } = await tenantDb(db, tenantId).from("ads").select("launch").eq("id", adId).maybeSingle();
  if (error) throw new DbFailure(error, "whether a launch was cancelled");
  return launchCancelledOf(data?.launch);
}

/** One running ad's way in, as an account's read judged it, with the bell's words should it ring. */
export type AdWayInKept = { ad_id: string; way_in: string | null; title?: string; body?: string };

/**
 * What one read of an account learned of its running ads' ways in (ad_way_in_keep, 00676; decision 0050, call 11): kept
 * where they moved, the bell rung in the words handed where one closed (an unknown word only once it stood an hour), and
 * a row closed once its way in opened. A database before 00676 answers null, and nothing is kept.
 */
export async function keepAdWayIns(
  db: Db,
  tenantId: TenantId,
  accountId: string,
  ways: readonly AdWayInKept[],
): Promise<{ moved: number; rung: number; closed: number } | null> {
  const { data, error } = await db.rpc("ad_way_in_keep", {
    p_tenant_id: tenantId,
    p_account_id: accountId,
    p_ways: [...ways],
  });
  if (error) {
    if (isMissingDoor(error)) return null;
    throw new DbFailure(error, "ad_way_in_keep");
  }
  const answer = recordOrEmpty(data);
  const count = (value: unknown): number => (typeof value === "number" ? value : 0);
  return { moved: count(answer.moved), rung: count(answer.rung), closed: count(answer.closed) };
}

/** A launch still on its way: the ad, what was approved, where its launch stands, and what it has made so far. */
export interface AdLaunchRow {
  id: string;
  name: string;
  status: string;
  intent: string;
  approved: Json | null;
  launch: Json | null;
  objects: AdPartKept[];
}

/** The most launches one account's job takes up at once. */
const LAUNCHES_MAX = 5;

/** An account's ads made here whose launch is still on its way, oldest first, each with what it has made so far. */
export async function listAdLaunches(db: Db, tenantId: TenantId, accountId: string): Promise<AdLaunchRow[]> {
  const { data, error } = await tenantDb(db, tenantId)
    .from("ads")
    .select("id, name, status, intent, approved, launch")
    .eq("account_id", accountId)
    .eq("origin", "chanlytics")
    .eq("status", "sending")
    .order("created_at", { ascending: true })
    .limit(LAUNCHES_MAX);
  if (error) throw new DbFailure(error, "an account's launches");
  if (data.length === 0) return [];
  const parts = await listAdParts(
    db,
    tenantId,
    data.map((row) => row.id),
  );
  return data.map((row) => ({ ...row, objects: parts.get(row.id) ?? [] }));
}

/** What a list of ads made here holds at the platform, by ad. */
async function listAdParts(db: Db, tenantId: TenantId, adIds: readonly string[]): Promise<Map<string, AdPartKept[]>> {
  const { data, error } = await tenantDb(db, tenantId)
    .from("ad_objects")
    .select("ad_id, kind, version, name, state, platform_id")
    .in("ad_id", [...adIds]);
  if (error) throw new DbFailure(error, "what an ad made here holds at the platform");
  const byAd = new Map<string, AdPartKept[]>();
  for (const row of data) {
    const kind = row.kind === "campaign" || row.kind === "set" || row.kind === "picture" ? row.kind : "ad";
    const state =
      row.state === "made" || row.state === "refused" || row.state === "removed" || row.state === "left"
        ? row.state
        : "sent";
    const part: AdPartKept = { kind, version: row.version, name: row.name, state, platform_id: row.platform_id };
    byAd.set(row.ad_id, [...(byAd.get(row.ad_id) ?? []), part]);
  }
  return byAd;
}

/**
 * An ad made here, as an account's read folds the platform's ads into it: its own id, whether it is made (and then its
 * platform id, which its versions fold into) or still on its way or stopped (and then what it made is its launch's,
 * never adopted), and the platform ids of every ad it made, one a version.
 */
export interface AdMadeHereRow {
  id: string;
  status: string;
  platform_ad_id: string | null;
  versions: string[];
}

/** The most ads made here of one account that a read folds: what a read adopts at most. */
const MADE_HERE_MAX = 500;

/** Every ad made here of one account, with the platform ids of its versions. */
export async function listAdsMadeHere(db: Db, tenantId: TenantId, accountId: string): Promise<AdMadeHereRow[]> {
  const { data, error } = await tenantDb(db, tenantId)
    .from("ads")
    .select("id, status, platform_ad_id")
    .eq("account_id", accountId)
    .eq("origin", "chanlytics")
    .order("created_at", { ascending: false })
    .limit(MADE_HERE_MAX);
  if (error) throw new DbFailure(error, "an account's ads made here");
  if (data.length === 0) return [];
  const parts = await listAdParts(
    db,
    tenantId,
    data.map((row) => row.id),
  );
  return data.map((row) => ({
    ...row,
    versions: (parts.get(row.id) ?? []).flatMap((part) =>
      part.kind === "ad" && part.platform_id ? [part.platform_id] : [],
    ),
  }));
}

/**
 * What the launches of some ads made here left at the platform when they stopped, named and paused there: by ad, the
 * kinds of part left (campaign, ad set, ad), each once. A member's read, under their own row rules.
 */
export async function listAdsLeftParts(
  db: Db,
  tenantId: TenantId,
  adIds: readonly string[],
): Promise<Map<string, AdPartKept["kind"][]>> {
  const left = new Map<string, AdPartKept["kind"][]>();
  if (adIds.length === 0) return left;
  for (const [adId, parts] of await listAdParts(db, tenantId, adIds)) {
    const kinds = parts.filter((part) => part.state === "left" && part.kind !== "picture").map((part) => part.kind);
    if (kinds.length > 0) left.set(adId, [...new Set(kinds)]);
  }
  return left;
}
