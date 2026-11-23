/**
 * Footage sources (00639, 00641): the provider accounts a workspace connected so its footage is read where it already
 * lives, and the folders it has watched. The one place `source_connections` and `media_sources` are typed; what a
 * source holds is `source-items.ts`. Members read their workspace's rows on their own client (RLS); the edge writes,
 * as the service role, through these. A read or a write that fails throws: "could not check" is not "yes".
 *
 * Every write of a watched folder that another writer could race is guarded by what it read: a change of state names
 * the states it may leave, the place in the provider's changes moves only from the place it was read at, and a walk
 * begins only as the run after the newest.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database, Json } from "../../types";

import { DbFailure, type SchemaSet, type SourceDoor, type TenantId } from "@chanlytics/contracts";
import { z } from "zod";
import { readAnswer } from "../../shared/read-json";
import { platformWide } from "../../shared/tenant-db";

type Db = SupabaseClient<Database>;
export type SourceConnectionRow = Database["public"]["Tables"]["source_connections"]["Row"];
export type MediaSourceRow = Database["public"]["Tables"]["media_sources"]["Row"];

/**
 * The account a workspace's folders are read through: one that reads, never the word that one could not (a blocked
 * Workspace). One rule for every screen and press (the review of 20 Nov, finding 8).
 */
export const readingAccountOf = (accounts: readonly SourceConnectionRow[]): SourceConnectionRow | null =>
  accounts.find((account) => account.health !== "blocked_by_admin") ?? null;

/** The folder a workspace watches (one a workspace): any not stopped. One rule for every screen and press. */
export const watchedFolderOf = (sources: readonly MediaSourceRow[]): MediaSourceRow | null =>
  sources.find((source) => source.state !== "stopped") ?? null;
type ConnectionPatch = Database["public"]["Tables"]["source_connections"]["Update"];
type SourcePatch = Database["public"]["Tables"]["media_sources"]["Update"];
type SourceState = SchemaSet<"media_sources.state">;

/* ------------------------------------------------------------------------------------------------ the accounts */

/**
 * A footage connection made with this Google account (its `sub`), whichever workspace's, but the one named: its id, or
 * null. Read across workspaces on purpose: a grant given back to Google ends every connection the account made. One
 * its organisation blocked names no account and is never found here; one that needs a reconnect still is, since its
 * grant comes back with a sign-in and a revoke would end the account's other connections all the same.
 */
export async function findGoogleSourceConnectionOfAccount(
  db: Db,
  account: string,
  exceptId: string | null,
): Promise<{ id: string } | null> {
  const ofAccount = platformWide(db)
    .from("source_connections")
    .select("id")
    .eq("provider", "google")
    .eq("provider_account", account);
  const { data, error } = await (exceptId ? ofAccount.neq("id", exceptId) : ofAccount).limit(1).maybeSingle();
  if (error) throw new DbFailure(error, "cannot read the Google account's footage connections");
  return data;
}

/**
 * A workspace's connected accounts for one door, oldest first (00686): the accounts its folders are watched through,
 * or the ones whose narrow key chooses and saves. A screen about one door never lists the other's.
 */
export async function listSourceConnectionsOf(
  db: Db,
  tenantId: TenantId,
  door: SourceDoor,
): Promise<SourceConnectionRow[]> {
  const { data, error } = await db
    .from("source_connections")
    .select("*")
    .eq("tenant_id", tenantId)
    .eq("door", door)
    .order("connected_at", { ascending: true });
  if (error) throw new DbFailure(error, "cannot read the workspace's footage accounts");
  return data;
}

/** One of a workspace's connected accounts; null when it is not this workspace's. */
export async function findSourceConnection(
  db: Db,
  tenantId: TenantId,
  id: string,
): Promise<SourceConnectionRow | null> {
  const { data, error } = await db
    .from("source_connections")
    .select("*")
    .eq("tenant_id", tenantId)
    .eq("id", id)
    .maybeSingle();
  if (error) throw new DbFailure(error, "cannot read the footage account");
  return data;
}

/**
 * A connected account written: one row an account and a door in a workspace (source_connections_one_account_a_door,
 * 00686), so a reconnect of a door writes over its own row, keeps its id, its folders and their items, and touches no
 * other door's.
 */
export async function saveSourceConnection(
  db: Db,
  row: {
    tenant_id: TenantId;
    provider_account: string;
    email: string;
    scopes: string[];
    door: SourceDoor;
    connected_by: string | null;
    connected_at: string;
  },
): Promise<SourceConnectionRow> {
  const { data, error } = await db
    .from("source_connections")
    .upsert({ ...row, provider: "google", health: "ok" }, { onConflict: "tenant_id,provider,provider_account,door" })
    .select("*")
    .single();
  if (error) throw new DbFailure(error, "cannot keep the footage account");
  return data;
}

/**
 * An account its organisation would not let be read, said: one row a workspace that names no account (the provider
 * gives none), found again by the next refusal rather than written twice. It is a watched folder's word: the row's door
 * is `watch`, the column's own default.
 */
export async function saveBlockedSourceConnection(
  db: Db,
  params: { tenantId: TenantId; by: string | null; at: string },
): Promise<SourceConnectionRow> {
  const found = await db
    .from("source_connections")
    .select("*")
    .eq("tenant_id", params.tenantId)
    .eq("provider", "google")
    .eq("health", "blocked_by_admin")
    .eq("door", "watch")
    .is("provider_account", null)
    .limit(1)
    .maybeSingle();
  if (found.error) throw new DbFailure(found.error, "cannot read the footage account");
  if (found.data) return found.data;
  const { data, error } = await db
    .from("source_connections")
    .insert({
      tenant_id: params.tenantId,
      provider: "google",
      health: "blocked_by_admin",
      door: "watch",
      connected_by: params.by,
      connected_at: params.at,
    })
    .select("*")
    .single();
  if (error) throw new DbFailure(error, "cannot keep the footage account");
  return data;
}

/** A change to one account's row: the row as it now is, or null when it is not this workspace's. */
export async function patchSourceConnection(
  db: Db,
  params: { tenantId: TenantId; id: string; patch: ConnectionPatch },
): Promise<SourceConnectionRow | null> {
  const { data, error } = await db
    .from("source_connections")
    .update(params.patch)
    .eq("tenant_id", params.tenantId)
    .eq("id", params.id)
    .select("*");
  if (error) throw new DbFailure(error, "cannot change the footage account");
  return data[0] ?? null;
}

/** An account's row removed, and with it its folders and their items (00639's keys); the Library's files stay. */
export async function deleteSourceConnection(db: Db, tenantId: TenantId, id: string): Promise<void> {
  const { error } = await db.from("source_connections").delete().eq("tenant_id", tenantId).eq("id", id);
  if (error) throw new DbFailure(error, "cannot remove the footage account");
}

/** Whether a person is still one of a workspace's members: an account is read only while whoever connected it is. */
export async function isStillMember(db: Db, tenantId: TenantId, userId: string): Promise<boolean> {
  const { data, error } = await db
    .from("memberships")
    .select("id")
    .eq("tenant_id", tenantId)
    .eq("user_id", userId)
    .limit(1)
    .maybeSingle();
  if (error) throw new DbFailure(error, "cannot read the workspace's members");
  return data !== null;
}

/* -------------------------------------------------------------------------------------------------- the token */

/** The token, in Vault: a connect writes whatever is there; a refresh names the refresh token it read (00641). */
export async function putSourceCredentials(
  db: Db,
  params: { id: string; secret: Json; ifRefreshToken: string | null },
): Promise<"stored" | "changed"> {
  const { error } = await db.rpc("source_credentials_put", {
    p_connection_id: params.id,
    p_secret: params.secret,
    ...(params.ifRefreshToken ? { p_if_refresh_token: params.ifRefreshToken } : {}),
  });
  if (error) {
    // The token changed since it was read (a reconnect stored meanwhile): that one is kept.
    if (error.code === "40001") return "changed";
    throw new DbFailure(error, "cannot store the footage account's token");
  }
  return "stored";
}

export async function getSourceCredentials(db: Db, id: string): Promise<Json | null> {
  const { data, error } = await db.rpc("source_credentials_get", { p_connection_id: id });
  if (error) throw new DbFailure(error, "cannot read the footage account's token");
  return data ?? null;
}

export async function dropSourceCredentials(db: Db, id: string): Promise<boolean> {
  const { data, error } = await db.rpc("source_credentials_drop", { p_connection_id: id });
  if (error) throw new DbFailure(error, "cannot drop the footage account's token");
  return data === true;
}

/* ------------------------------------------------------------------------------------------ the watched folders */

/** A workspace's watched folders, oldest first. */
export async function listMediaSourcesOf(db: Db, tenantId: TenantId): Promise<MediaSourceRow[]> {
  const { data, error } = await db
    .from("media_sources")
    .select("*")
    .eq("tenant_id", tenantId)
    .order("created_at", { ascending: true });
  if (error) throw new DbFailure(error, "cannot read the workspace's watched folders");
  return data;
}

/** The folders an account reads, whatever their state. */
export async function listMediaSourcesOfConnection(
  db: Db,
  tenantId: TenantId,
  connectionId: string,
): Promise<MediaSourceRow[]> {
  const { data, error } = await db
    .from("media_sources")
    .select("*")
    .eq("tenant_id", tenantId)
    .eq("connection_id", connectionId);
  if (error) throw new DbFailure(error, "cannot read the account's watched folders");
  return data;
}

/** One of a workspace's watched folders; null when it is not this workspace's. */
export async function findMediaSource(db: Db, tenantId: TenantId, id: string): Promise<MediaSourceRow | null> {
  const { data, error } = await db
    .from("media_sources")
    .select("*")
    .eq("tenant_id", tenantId)
    .eq("id", id)
    .maybeSingle();
  if (error) throw new DbFailure(error, "cannot read the watched folder");
  return data;
}

/**
 * A watched folder by its id alone, whichever workspace's: a provider's signal names a channel, and a channel's id a
 * folder, never a workspace. Null when there is none.
 */
export async function findMediaSourceAnywhere(db: Db, id: string): Promise<MediaSourceRow | null> {
  const { data, error } = await platformWide(db).from("media_sources").select("*").eq("id", id).maybeSingle();
  if (error) throw new DbFailure(error, "cannot read the watched folder");
  return data;
}

/**
 * A folder chosen: its row made, or found again with what it already knows (media_sources_one_a_folder), so choosing a
 * folder twice is one watch. `made` says which.
 */
export async function saveMediaSource(
  db: Db,
  row: {
    tenant_id: TenantId;
    connection_id: string;
    folder_id: string;
    folder_name: string;
    drive_id: string | null;
    include_subfolders: boolean;
    change_cursor: string;
    read_gap_seconds: number;
  },
): Promise<{ source: MediaSourceRow; made: boolean }> {
  const inserted = await db
    .from("media_sources")
    .upsert(
      // A new folder has walked nothing and read nothing: said here as the table's own defaults say it.
      { ...row, state: "setting_up", walk_run: 0, busy_reads: 0 },
      { onConflict: "connection_id,folder_id", ignoreDuplicates: true },
    )
    .select("*");
  if (inserted.error) throw new DbFailure(inserted.error, "cannot keep the watched folder");
  const [fresh] = inserted.data;
  if (fresh) return { source: fresh, made: true };
  const found = await db
    .from("media_sources")
    .select("*")
    .eq("tenant_id", row.tenant_id)
    .eq("connection_id", row.connection_id)
    .eq("folder_id", row.folder_id)
    .single();
  if (found.error) throw new DbFailure(found.error, "cannot read the watched folder");
  return { source: found.data, made: false };
}

/**
 * A change to one watched folder's row, only from the states named (a stale writer changes nothing and is told so):
 * the row as it now is, or null when it was not in one of them.
 */
export async function patchMediaSource(
  db: Db,
  params: { tenantId: TenantId; id: string; from: readonly SourceState[] | null; patch: SourcePatch },
): Promise<MediaSourceRow | null> {
  let query = db.from("media_sources").update(params.patch).eq("tenant_id", params.tenantId).eq("id", params.id);
  if (params.from?.length) query = query.in("state", [...params.from]);
  const { data, error } = await query.select("*");
  if (error) throw new DbFailure(error, "cannot change the watched folder");
  return data[0] ?? null;
}

/**
 * The folder's place in its provider's changes, moved: only from the place the read started at, so two reads at once
 * cannot both move it and a read that lost its place writes nothing. The row as it now is, or null when another
 * writer had moved it.
 */
export async function moveSourceCursor(
  db: Db,
  params: { tenantId: TenantId; id: string; from: string; to: string; patch: SourcePatch },
): Promise<MediaSourceRow | null> {
  const { data, error } = await db
    .from("media_sources")
    .update({ ...params.patch, change_cursor: params.to })
    .eq("tenant_id", params.tenantId)
    .eq("id", params.id)
    .eq("change_cursor", params.from)
    .select("*");
  if (error) throw new DbFailure(error, "cannot move the watched folder's place");
  return data[0] ?? null;
}

/**
 * A walk begun: the run after the folder's newest, and only while none is in flight, so two first steps of one run
 * begin it once. The row as it now is, or null when another walk holds the folder.
 */
export async function beginSourceWalk(
  db: Db,
  params: { tenantId: TenantId; id: string; run: number; kind: SchemaSet<"media_sources.walk_kind">; at: string },
): Promise<MediaSourceRow | null> {
  const { data, error } = await db
    .from("media_sources")
    .update({
      walk_run: params.run,
      walk_kind: params.kind,
      walk_started_at: params.at,
      walk_touched_at: params.at,
      // A whole walk counts what it spends from nothing; a new folder's own walk leaves the last whole walk's count.
      ...(params.kind === "subtree" ? {} : { walk_units: 0 }),
    })
    .eq("tenant_id", params.tenantId)
    .eq("id", params.id)
    .eq("walk_run", params.run - 1)
    .is("walk_kind", null)
    .select("*");
  if (error) throw new DbFailure(error, "cannot begin the watched folder's walk");
  return data[0] ?? null;
}

/**
 * A change to a walk in flight, only while it is still this run's: a step of a run that ended, or that another began
 * over, writes nothing. The row as it now is, or null.
 */
export async function patchSourceWalk(
  db: Db,
  params: { tenantId: TenantId; id: string; run: number; patch: SourcePatch },
): Promise<MediaSourceRow | null> {
  const { data, error } = await db
    .from("media_sources")
    .update(params.patch)
    .eq("tenant_id", params.tenantId)
    .eq("id", params.id)
    .eq("walk_run", params.run)
    .not("walk_kind", "is", null)
    .select("*");
  if (error) throw new DbFailure(error, "cannot change the watched folder's walk");
  return data[0] ?? null;
}

/**
 * A provider's signal, heard: the folder its channel belongs to, stamped as signalled, only where the token it sent is
 * the one the channel was opened with (its hash). Null for a channel nobody here holds, or a token that is not its own.
 * Read across workspaces on purpose: a signal names a channel, not a workspace.
 */
export async function stampSourceSignal(
  db: Db,
  params: { channelId: string; tokenHash: string; at: string },
): Promise<MediaSourceRow | null> {
  const { data, error } = await platformWide(db)
    .from("media_sources")
    .update({ signalled_at: params.at })
    .eq("channel_id", params.channelId)
    .eq("channel_token_hash", params.tokenHash)
    .select("*");
  if (error) throw new DbFailure(error, "cannot hear the watched folder's signal");
  return data[0] ?? null;
}

/**
 * A watched folder's next read brought forward, never back: written only where the read its row holds is later
 * than `to`, or it holds none. The clock then hands the folder that read, whatever became of a job asked for it.
 */
export async function pullSourceReadSooner(
  db: Db,
  params: { tenantId: TenantId; id: string; to: string },
): Promise<void> {
  const { error } = await db
    .from("media_sources")
    .update({ next_read_at: params.to })
    .eq("tenant_id", params.tenantId)
    .eq("id", params.id)
    .eq("state", "watching")
    .or(`next_read_at.is.null,next_read_at.gt.${params.to}`);
  if (error) throw new DbFailure(error, "cannot bring the watched folder's read forward");
}

/** What the clock handed out (00641 sources_hand_out). */
const HandedOut = z.object({ reads: z.number(), walks: z.number(), again: z.number() });

/**
 * The footage clock's one statement (00641, decision 0115): a read for each folder whose time has come, a re-walk for
 * each due one, and a walk whose steps stopped taken up again. Answers how many of each it wrote.
 */
export async function handOutSources(
  db: Db,
  params: { spreadSeconds: number; walkStaleSeconds: number },
): Promise<z.infer<typeof HandedOut>> {
  const { data, error } = await db.rpc("sources_hand_out", {
    p_spread_seconds: params.spreadSeconds,
    p_walk_stale_seconds: params.walkStaleSeconds,
  });
  if (error) throw new DbFailure(error, "cannot hand out the watched folders' work");
  return readAnswer("sources_hand_out", HandedOut, data);
}
