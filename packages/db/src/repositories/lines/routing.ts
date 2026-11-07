/**
 * The routing rows a line answers on (tenant_channels), as the line's setup and release keep them (decision 0111): the
 * row a number's key holds, read across workspaces on purpose since another's must be seen to be refused; a row taken
 * over only as it was read; a row written; and, on release, the workspace's other line that shares a row, the row's
 * settings, and the row repointed or switched off. Each answer is the database's as it came.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "../../database.types";
import { platformWide } from "../../shared/tenant-db";

type Db = SupabaseClient<Database>;
type ChannelInsert = Database["public"]["Tables"]["tenant_channels"]["Insert"];
type ChannelUpdate = Database["public"]["Tables"]["tenant_channels"]["Update"];

/** The routing row a kind and a provider's key hold, whichever workspace's it is. */
export const findRoutingRowByKey = async (db: Db, kind: string, externalId: string) =>
  platformWide(db)
    .from("tenant_channels")
    .select("id, tenant_id, status")
    .eq("kind", kind)
    .eq("external_id", externalId)
    .maybeSingle();

/** A routing row taken over, pinned to the workspace and state it was read in: none back means another claimed it first. */
export const takeRoutingRow = async (
  db: Db,
  was: { id: string; tenantId: string; status: string },
  patch: ChannelUpdate,
) =>
  platformWide(db)
    .from("tenant_channels")
    .update(patch)
    .eq("id", was.id)
    .eq("tenant_id", was.tenantId)
    .eq("status", was.status)
    .select("id")
    .maybeSingle();

/** A routing row written, its id back. */
export const insertRoutingRow = async (db: Db, row: ChannelInsert) =>
  db.from("tenant_channels").insert(row).select("id").single();

/** The workspace's oldest other line that answers on the same routing row, by the line's fact that names it. */
export const findOtherLineOnRow = async (
  db: Db,
  params: { tenantId: string; lineId: string; fact: "channel_id" | "sms_channel_id"; channelId: string },
) =>
  db
    .from("lines")
    .select("id, e164")
    .eq("tenant_id", params.tenantId)
    .neq("id", params.lineId)
    .filter(`facts->>${params.fact}`, "eq", params.channelId)
    .order("created_at")
    .limit(1);

/** A routing row's settings. */
/** A routing row changed: repointed to the line that keeps it, or switched off. */
export const patchRoutingRow = async (db: Db, tenantId: string, channelId: string, patch: ChannelUpdate) =>
  db.from("tenant_channels").update(patch).eq("id", channelId).eq("tenant_id", tenantId);

/** The kinds of the workspace's active routing rows among `kinds`: where a customer can write in. */
export const listActiveRoutingKinds = async (db: Db, tenantId: string, kinds: string[]) =>
  db.from("tenant_channels").select("kind").eq("tenant_id", tenantId).eq("status", "active").in("kind", kinds);

/** The workspace's oldest active voice row: its agent and the agent's config. */
export const findVoiceRouting = async (db: Db, tenantId: string) =>
  db
    .from("tenant_channels")
    .select("external_id, config")
    .eq("tenant_id", tenantId)
    .eq("kind", "voice")
    .eq("status", "active")
    .order("created_at")
    .limit(1)
    .maybeSingle();

/** Every voice routing row, whichever workspace's: its agent and its status (the diagnostic's read). */
export const listVoiceRoutingRows = async (db: Db) =>
  platformWide(db).from("tenant_channels").select("external_id, status").eq("kind", "voice");

/** Every active voice agent, whichever workspace's. */
export const listActiveVoiceAgentRows = async (db: Db) =>
  platformWide(db).from("tenant_channels").select("external_id").eq("kind", "voice").eq("status", "active");

/** The workspace's oldest voice routing row, whatever its status. */
export const findVoiceRow = async (db: Db, tenantId: string) =>
  db
    .from("tenant_channels")
    .select("id, status, external_id, number_e164")
    .eq("tenant_id", tenantId)
    .eq("kind", "voice")
    .order("created_at")
    .limit(1)
    .maybeSingle();
