/**
 * A workspace's connection to its Google Business Profile (google_connections), and its token in Vault (decision
 * 0111): read, saved, put back, synced and let go, and the connections due a sync, read across workspaces on purpose
 * (platformWide). Each answer is the database's as it came; the caller says a failure in its words.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database, Json } from "../../types";
import { platformWide, tenantDb } from "../../shared/tenant-db";
import type { TenantId } from "@chanlytics/contracts";

type Db = SupabaseClient<Database>;
type ConnectionInsert = Database["public"]["Tables"]["google_connections"]["Insert"];
type ConnectionUpdate = Database["public"]["Tables"]["google_connections"]["Update"];

/** The workspace's connection, whole, or none. */
export const findGoogleConnection = async (db: Db, tenantId: TenantId) =>
  db.from("google_connections").select("*").eq("tenant_id", tenantId).maybeSingle();

/** The workspace's connection read again after a write: `single()`, so a row gone is an error the caller says. */
export const rereadGoogleConnection = async (db: Db, tenantId: TenantId) =>
  db.from("google_connections").select("*").eq("tenant_id", tenantId).single();

/** The workspace's connection saved, one a workspace, and back whole. */
export const saveGoogleConnection = async (db: Db, tenantId: TenantId, row: ConnectionInsert) =>
  tenantDb(db, tenantId).from("google_connections").upsert(row, { onConflict: "tenant_id" }).select("*").single();

/** The workspace's connection changed. */
export const patchGoogleConnection = async (db: Db, tenantId: TenantId, set: ConnectionUpdate) =>
  db.from("google_connections").update(set).eq("tenant_id", tenantId);

/** The workspace's connection changed, and back whole: `single()`, so a row gone is an error the caller says. */
export const patchGoogleConnectionBack = async (db: Db, tenantId: TenantId, set: ConnectionUpdate) =>
  db.from("google_connections").update(set).eq("tenant_id", tenantId).select("*").single();

/** The workspace's connection deleted. */
export const deleteGoogleConnection = async (db: Db, tenantId: TenantId) =>
  db.from("google_connections").delete().eq("tenant_id", tenantId);

/** Connections bound to a place and not synced since `before` (never synced first), whichever workspace's: the sweep's page. */
export const listGoogleConnectionsDue = async (db: Db, before: string, limit: number) =>
  platformWide(db)
    .from("google_connections")
    .select("*")
    .not("location_name", "is", null)
    .or(`last_synced_at.is.null,last_synced_at.lt.${before}`)
    .order("last_synced_at", { ascending: true, nullsFirst: true })
    .limit(limit);

/**
 * The workspace's Google token kept in Vault (put_google_credentials). With `ifRefreshToken`, written only while the
 * stored token still carries it (00364): a reconnect's newer token stands.
 */
export const putGoogleCredentials = async (db: Db, tenantId: TenantId, secret: Json, ifRefreshToken?: string | null) =>
  db.rpc("put_google_credentials", {
    p_tenant_id: tenantId,
    p_secret: secret,
    ...(ifRefreshToken ? { p_if_refresh_token: ifRefreshToken } : {}),
  });

/** The workspace's Google token, out of Vault (get_google_credentials). */
export const getGoogleCredentials = async (db: Db, tenantId: TenantId) =>
  db.rpc("get_google_credentials", { p_tenant_id: tenantId });

/** The workspace's Google token dropped from Vault (drop_google_credentials). */
export const dropGoogleCredentials = async (db: Db, tenantId: TenantId) =>
  db.rpc("drop_google_credentials", { p_tenant_id: tenantId });

/** The workspace's connection as the Connections page shows it: who and when, never where the token is. */
export const findConnectionCard = async (db: Db, tenantId: TenantId) =>
  db
    .from("google_connections")
    .select("google_email, account_title, location_name, location_title, connected_at, last_synced_at, sync_error")
    .eq("tenant_id", tenantId)
    .maybeSingle();
