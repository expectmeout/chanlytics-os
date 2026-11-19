/**
 * An owner's ad accounts (ad_accounts, 00648; decision 0049): the one place the table is typed. A member's page reads its
 * workspace's rows under its own row rules; every write is a door's (00649), called here as the service role, and an
 * account's token is reached through its three Vault functions and nothing else. A database that has not run a door's
 * migration answers `no_door`, where nothing is written and nothing is wrong (either deploy order).
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { DbFailure, isOneOf, recordOrEmpty, recordOrNull, type AdPlatform, type TenantId } from "@chanlytics/contracts";
import { isMissingDoor } from "../../shared/missing-door";
import { platformWide, tenantDb } from "../../shared/tenant-db";
import type { Database, Json } from "../../types";

type Db = SupabaseClient<Database>;

/** An ad account's row, every column: none of them is a token, and none says where one is kept. */
export type AdAccountRow = Database["public"]["Tables"]["ad_accounts"]["Row"];

/** The workspace's account on a platform that is not disconnected, or null: the one a page draws and a read works. */
export async function findLiveAdAccount(
  db: Db,
  tenantId: TenantId,
  platform: AdPlatform,
): Promise<AdAccountRow | null> {
  const { data, error } = await tenantDb(db, tenantId)
    .from("ad_accounts")
    .select("*")
    .eq("platform", platform)
    .neq("status", "disconnected")
    .maybeSingle();
  if (error) {
    // A database that has not run 00648 holds no account, which is what every page said before it.
    if (error.code === "42P01" || error.code === "PGRST205") return null;
    throw new DbFailure(error, "ad account");
  }
  return data ?? null;
}

/**
 * The workspace's account on a platform as a page draws it: the live one, else the one most lately disconnected, whose
 * ads stay listed as left at the platform. Null where the workspace never connected one.
 */
export async function findAdAccountForPage(
  db: Db,
  tenantId: TenantId,
  platform: AdPlatform,
): Promise<AdAccountRow | null> {
  const { data, error } = await tenantDb(db, tenantId)
    .from("ad_accounts")
    .select("*")
    .eq("platform", platform)
    .order("disconnected_at", { ascending: false, nullsFirst: true })
    .limit(1);
  if (error) {
    if (error.code === "42P01" || error.code === "PGRST205") return null;
    throw new DbFailure(error, "ad account for the page");
  }
  return data.at(0) ?? null;
}

/** One account of the workspace's, by id. */
export async function findAdAccount(db: Db, tenantId: TenantId, accountId: string): Promise<AdAccountRow | null> {
  const { data, error } = await tenantDb(db, tenantId)
    .from("ad_accounts")
    .select("*")
    .eq("id", accountId)
    .maybeSingle();
  if (error) throw new DbFailure(error, "ad account by id");
  return data ?? null;
}

/**
 * Every account, in any workspace, whose sign-in at the platform is this person's (config's user_id), still connected
 * or waiting to be chosen: what the platform names when it says a business removed Chanlytics. Platform-wide on
 * purpose: the platform names a person, never a workspace.
 */
export async function listAdAccountsOfPlatformUser(
  db: Db,
  platform: AdPlatform,
  platformUserId: string,
): Promise<{ id: string; tenant_id: TenantId }[]> {
  const { data, error } = await platformWide(db)
    .from("ad_accounts")
    .select("id, tenant_id")
    .eq("platform", platform)
    .in("status", ["connected", "choosing"])
    .eq("config->>user_id", platformUserId);
  if (error) throw new DbFailure(error, "ad accounts of a platform's person");
  return data.map((row) => ({ id: row.id, tenant_id: row.tenant_id as TenantId }));
}

/** What a connect came to. */
export type AdConnectOutcome = "connected" | "choosing" | "not_allowed" | "taken" | "another_connected" | "no_door";
const CONNECT_OUTCOMES = ["connected", "choosing", "not_allowed", "taken", "another_connected"] as const;

/** An account as a connect writes it: `external_id` null while one is to be chosen. */
export interface AdAccountToConnect {
  external_id: string | null;
  name: string | null;
  currency: string | null;
  timezone: string | null;
  standing: Json;
  config: Json;
  token_expires_at: string | null;
}

/**
 * An owner's ad account connected (ad_account_connect, 00649): its row, its token in Vault, the owner's decision and
 * the event, in one transaction. `chosen` is the owner's answer to which of two accounts is meant.
 */
export async function connectAdAccount(
  db: Db,
  by: { tenantId: TenantId; userId: string },
  platform: AdPlatform,
  toConnect: { account: AdAccountToConnect; secret: Json; chosen: boolean },
): Promise<{ outcome: AdConnectOutcome; accountId: string | null }> {
  const { data, error } = await db.rpc("ad_account_connect", {
    p_tenant_id: by.tenantId,
    p_actor: by.userId,
    p_platform: platform,
    p_account: { ...toConnect.account },
    p_secret: toConnect.secret,
    p_chosen: toConnect.chosen,
  });
  if (error) {
    if (isMissingDoor(error)) return { outcome: "no_door", accountId: null };
    throw new DbFailure(error, "ad_account_connect");
  }
  const answer = recordOrEmpty(data);
  const { outcome, account_id: accountId } = answer;
  if (!isOneOf(CONNECT_OUTCOMES, outcome)) throw new Error("ad_account_connect answered no outcome");
  return { outcome, accountId: typeof accountId === "string" ? accountId : null };
}

/** What a read of an account at its platform learned, as ad_account_read_keep takes it. */
export interface AdAccountReadKept {
  name?: string;
  timezone?: string;
  standing?: Json;
  /** Written key by key over what stood. */
  config?: Json;
  /** A read that failed: Chanlytics' own words for it. What stood, stands. */
  error?: string;
  usage_pct?: number;
  /** The moment before which the platform is not asked again; null where nothing holds a read back. */
  read_after?: string | null;
}

/** Keeps what a read of a connected account learned (ad_account_read_keep, 00649); `moved` where its standing did. */
export async function keepAdAccountRead(
  db: Db,
  tenantId: TenantId,
  accountId: string,
  read: AdAccountReadKept,
): Promise<"moved" | "kept" | "failed" | "not_connected"> {
  const { data, error } = await db.rpc("ad_account_read_keep", {
    p_tenant_id: tenantId,
    p_account_id: accountId,
    p_read: { ...read },
  });
  if (error) throw new DbFailure(error, "ad_account_read_keep");
  return data === "moved" || data === "kept" || data === "failed" ? data : "not_connected";
}

/** The platform took access back (ad_account_revoked, 00649). True where the account was connected. */
export async function markAdAccountRevoked(
  db: Db,
  tenantId: TenantId,
  accountId: string,
  how: "read" | "platform",
): Promise<boolean> {
  const { data, error } = await db.rpc("ad_account_revoked", {
    p_tenant_id: tenantId,
    p_account_id: accountId,
    p_how: how,
  });
  if (error) throw new DbFailure(error, "ad_account_revoked");
  return data === true;
}

/** An account's token from Vault, or null where none is kept. The service role's alone. */
export async function readAdSecret(db: Db, accountId: string): Promise<Record<string, unknown> | null> {
  const { data, error } = await db.rpc("ad_credentials_get", { p_account_id: accountId });
  if (error) throw new DbFailure(error, "ad_credentials_get");
  return recordOrNull(data);
}

/** Whether this person may run ads for the workspace (the `ads` permission, the owner's alone): asked before any call to a platform. */
export async function mayRunAds(db: Db, tenantId: TenantId, userId: string): Promise<boolean> {
  const { data, error } = await db.rpc("has_permission", {
    p_user: userId,
    p_tenant_id: tenantId,
    p_permission: "ads",
  });
  if (error) throw new DbFailure(error, "may run ads");
  return data === true;
}
