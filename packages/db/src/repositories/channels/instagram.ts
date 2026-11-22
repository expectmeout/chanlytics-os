/**
 * A workspace's Instagram accounts as channels (decision 0001, step 8): the rows the connect door writes and turns on and
 * off, the token each keeps in the Vault, and the accounts the token sweep visits; and what the DM door reads and writes
 * of its people and messages: who an Instagram-scoped id is here, whether a message id is ours, a DM taken back. The edge's lib/instagram holds the
 * wire and the order; every table and every SQL function it reaches is named here.
 *
 * Each read that fails THROWS (or answers `failed`): "we could not read it" is never "there is none".
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database, Json } from "../../types";

import type { TenantId, ContactId } from "@chanlytics/contracts";
import { DbFailure } from "@chanlytics/contracts";
type Db = SupabaseClient<Database>;

/** An account's row as the sweep and the wires take it. */
export interface InstagramAccountRow {
  id: string;
  tenant_id: TenantId;
  external_id: string;
  credentials_ref: string | null;
  config: Json;
}

/** Every active Instagram account on the platform, oldest first: the token sweep's round. */
export async function listActiveInstagramAccounts(db: Db): Promise<InstagramAccountRow[]> {
  const { data, error } = await db
    .from("tenant_channels")
    .select("id, tenant_id, external_id, credentials_ref, config")
    .eq("kind", "instagram")
    .eq("status", "active")
    .order("created_at", { ascending: true });
  if (error) throw new DbFailure(error, "listActiveInstagramAccounts");
  return data ?? [];
}

/** What a channel keeps in the Vault (get_channel_credentials), as stored; null when it keeps nothing. */
export async function readChannelSecret(db: Db, channelId: string): Promise<Json | null> {
  const { data, error } = await db.rpc("get_channel_credentials", { p_channel_id: channelId });
  if (error) throw new DbFailure(error, "readChannelSecret");
  return data ?? null;
}

/** A channel's secret put in the Vault, through the one function that writes a credential (put_channel_credentials). */
export async function putChannelSecret(db: Db, channelId: string, secret: Json): Promise<void> {
  const { error } = await db.rpc("put_channel_credentials", { p_channel_id: channelId, p_secret: secret });
  if (error) throw new DbFailure(error, "putChannelSecret");
}

/**
 * Which workspace's row holds an Instagram account's id, if any, and whether it is connected: the connect door refuses an
 * account another workspace has connected before it asks Meta for anything. A row that was disconnected holds no id
 * (instagram_account_disconnect, 00677), so it is not found here. A read that fails THROWS.
 */
export async function findInstagramAccountHolder(
  db: Db,
  accountId: string,
): Promise<{ id: string; tenant_id: TenantId; status: string } | null> {
  const { data, error } = await db
    .from("tenant_channels")
    .select("id, tenant_id, status")
    .eq("kind", "instagram")
    .eq("external_id", accountId)
    .maybeSingle();
  if (error) throw new DbFailure(error, "findInstagramAccountHolder");
  return data;
}

/**
 * The Instagram accounts this workspace has connected, oldest first: one account a workspace, so a connect of a
 * different one is refused with the handle of the one that stands (decision 0143). A read that fails THROWS.
 */
export async function listConnectedInstagramAccounts(
  db: Db,
  tenantId: TenantId,
): Promise<{ id: string; external_id: string; config: Json }[]> {
  const { data, error } = await db
    .from("tenant_channels")
    .select("id, external_id, config")
    .eq("tenant_id", tenantId)
    .eq("kind", "instagram")
    .eq("status", "active")
    .order("created_at", { ascending: true });
  if (error) throw new DbFailure(error, "listConnectedInstagramAccounts");
  return data;
}

/**
 * One of this workspace's Instagram rows by its id, as a disconnect finds it: its config and whether it keeps a token.
 * Null for a row that is not this workspace's. A read that fails THROWS.
 */
export async function findInstagramChannel(
  db: Db,
  tenantId: TenantId,
  channelId: string,
): Promise<{ id: string; config: Json; credentials_ref: string | null } | null> {
  const { data, error } = await db
    .from("tenant_channels")
    .select("id, config, credentials_ref")
    .eq("id", channelId)
    .eq("tenant_id", tenantId)
    .eq("kind", "instagram")
    .maybeSingle();
  if (error) throw new DbFailure(error, "findInstagramChannel");
  return data;
}

/**
 * This workspace's own row for an Instagram account, as it stands: what a connect over it puts back when the new token
 * could not be kept (the Meta link taking over a working account). Null for none. A read that fails THROWS.
 */
export async function findInstagramAccountRow(
  db: Db,
  tenantId: TenantId,
  accountId: string,
): Promise<{ id: string; status: string; config: Json; credentials_ref: string | null } | null> {
  const { data, error } = await db
    .from("tenant_channels")
    .select("id, status, config, credentials_ref")
    .eq("kind", "instagram")
    .eq("external_id", accountId)
    .eq("tenant_id", tenantId)
    .maybeSingle();
  if (error) throw new DbFailure(error, "findInstagramAccountRow");
  return data;
}

/**
 * The workspace's Instagram account connected through Meta (decision 0117: one a workspace), active, as a post is sent from
 * it: its row and what the row keeps (the token's permissions, whether it lapsed). Null for none. A read that fails THROWS.
 */
export async function findMetaInstagramRow(
  db: Db,
  tenantId: TenantId,
): Promise<{ id: string; external_id: string; config: Json; credentials_ref: string | null } | null> {
  const { data, error } = await db
    .from("tenant_channels")
    .select("id, external_id, config, credentials_ref")
    .eq("tenant_id", tenantId)
    .eq("kind", "instagram")
    .eq("status", "active")
    .eq("config->>login", "meta")
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();
  if (error) throw new DbFailure(error, "findMetaInstagramRow");
  return data;
}

/** What the connect door answered (instagram_account_connect, 00677). */
export type InstagramConnect =
  | { outcome: "connected"; channelId: string; was: "own" | "new" }
  | { outcome: "taken"; heldBy: string | null }
  | { outcome: "another_here"; username: string | null };

/** What a door answered, read as a record of text: a field that is not a string reads as null. */
function textFields(answer: Json | null): Record<string, string | null> {
  const fields = answer && typeof answer === "object" && !Array.isArray(answer) ? answer : {};
  return Object.fromEntries(
    Object.entries(fields).map(([name, value]) => [name, typeof value === "string" ? value : null]),
  );
}

/**
 * An Instagram account connected to this workspace in one write, through its door (instagram_account_connect, 00677):
 * the row (this workspace's own for the account, the one it let go revived, or a new one), its token in the Vault, the
 * row on. `taken` while another workspace has the account connected, with that workspace; `another_here` while this one
 * has a different account connected, with its handle. A write that fails THROWS, and nothing was changed.
 */
export async function connectInstagramAccount(
  db: Db,
  fields: { tenantId: TenantId; accountId: string; config: Json; secret: Json },
): Promise<InstagramConnect> {
  const { data, error } = await db.rpc("instagram_account_connect", {
    p_tenant_id: fields.tenantId,
    p_account_id: fields.accountId,
    p_config: fields.config,
    p_secret: fields.secret,
  });
  if (error) throw new DbFailure(error, "connectInstagramAccount");
  const answer = textFields(data);
  if (answer.outcome === "taken") return { outcome: "taken", heldBy: answer.held_by ?? null };
  if (answer.outcome === "another_here") return { outcome: "another_here", username: answer.username ?? null };
  if (answer.outcome !== "connected" || !answer.channel_id)
    throw new DbFailure({ message: "the door answered no channel" }, "connectInstagramAccount");
  return { outcome: "connected", channelId: answer.channel_id, was: answer.was === "own" ? "own" : "new" };
}

/**
 * One of this workspace's Instagram accounts disconnected and let go, through its door (instagram_account_disconnect,
 * 00677): the row off, the account's id freed for any workspace, its token deleted from the Vault. `let_go` with the
 * account it held, `already` for a row let go before, `gone` for a row that is not this workspace's. A write that fails
 * THROWS.
 */
export async function disconnectInstagramAccount(
  db: Db,
  fields: { tenantId: TenantId; channelId: string; by: string },
): Promise<{ outcome: "let_go"; accountId: string | null } | { outcome: "already" } | { outcome: "gone" }> {
  const { data, error } = await db.rpc("instagram_account_disconnect", {
    p_tenant_id: fields.tenantId,
    p_channel_id: fields.channelId,
    p_by: fields.by,
  });
  if (error) throw new DbFailure(error, "disconnectInstagramAccount");
  const answer = textFields(data);
  if (answer.outcome === "let_go") return { outcome: "let_go", accountId: answer.account_id ?? null };
  return answer.outcome === "already" ? { outcome: "already" } : { outcome: "gone" };
}

/**
 * What the token sweep keeps on an account's row beside its config (merged, never over it): when its token was last
 * refreshed and when it lapses, or that Meta refused it (the Connections row then asks for a reconnect). True when a row
 * changed.
 */
export async function noteInstagramToken(
  db: Db,
  channelId: string,
  config: Json,
  note: {
    token_refreshed_at?: string;
    token_expires_at?: string | null;
    token_lapsed_at?: string | null;
    /** An account connected through Meta: when its token was last asked about, and what it may do (contracts metaLinesOf). */
    token_checked_at?: string;
    scopes?: string[];
  },
): Promise<boolean> {
  const base = config && typeof config === "object" && !Array.isArray(config) ? config : {};
  const { data, error } = await db
    .from("tenant_channels")
    .update({ config: { ...base, ...note } })
    .eq("id", channelId)
    .eq("kind", "instagram")
    .select("id");
  if (error) throw new DbFailure(error, "noteInstagramToken");
  return !!data?.length;
}

/**
 * A DM the person unsent (Meta's is_deleted), through its door (message_unsent, 00486): its words and attachment no
 * longer kept, never answered after. `forgot` with the stored attachment's path for the caller to remove, or `none` for a
 * DM not kept here. A write that fails THROWS, so the door has the delivery sent again.
 */
export async function markMessageUnsent(
  db: Db,
  tenantId: TenantId,
  externalId: string,
): Promise<{ outcome: "forgot"; storagePath: string | null } | { outcome: "none" }> {
  const { data, error } = await db.rpc("message_unsent", { p_tenant_id: tenantId, p_external_id: externalId });
  if (error) throw new DbFailure(error, "message_unsent");
  const o = data && typeof data === "object" && !Array.isArray(data) ? data : {};
  if (o.outcome !== "forgot") return { outcome: "none" };
  return { outcome: "forgot", storagePath: typeof o.storage_path === "string" ? o.storage_path : null };
}

/**
 * A person's Instagram-scoped id (contact_identities, channel instagram): where a DM to them goes (decision 0001, step 8).
 * Their newest, where a merge left them two; null for a person who never wrote by DM. A read that fails THROWS: "we could
 * not read it" is never "they have none".
 */
export async function findInstagramId(db: Db, tenantId: TenantId, contactId: ContactId): Promise<string | null> {
  const { data, error } = await db
    .from("contact_identities")
    .select("external_id")
    .eq("tenant_id", tenantId)
    .eq("contact_id", contactId)
    .eq("channel", "instagram")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw new DbFailure(error, "findInstagramId");
  return data?.external_id ?? null;
}

/**
 * The person an Instagram-scoped id belongs to here (contact_identities, channel instagram), or null for an id nobody
 * holds: an echo of the business's own DM is kept on that person's thread, and on no one's when nobody holds it. An id a
 * merge moved points at the kept person (00326: one hop is every hop). A read that fails THROWS.
 */
export async function findPersonOfInstagramId(db: Db, tenantId: TenantId, igsid: string): Promise<ContactId | null> {
  const { data, error } = await db
    .from("contact_identities")
    .select("contact_id, contacts (merged_into_contact_id, erased_at)")
    .eq("tenant_id", tenantId)
    .eq("channel", "instagram")
    .eq("external_id", igsid)
    .limit(1)
    .maybeSingle();
  if (error) throw new DbFailure(error, "findPersonOfInstagramId");
  if (!data || data.contacts?.erased_at) return null;
  return data.contacts?.merged_into_contact_id ?? data.contact_id;
}

/**
 * The words of the last DMs this workspace sent a person (`DMS_TO_COMPARE`, newest first), across their threads: a reply
 * too long for one DM leaves as several, each with its own id at Instagram, and its row keeps the first part's id alone,
 * so a later part's echo is told from a message the team typed in the app by its words. A read that fails THROWS.
 */
export async function listLastDmsSentTo(db: Db, tenantId: TenantId, contactId: ContactId): Promise<string[]> {
  const threads = await db.from("conversations").select("id").eq("tenant_id", tenantId).eq("contact_id", contactId);
  if (threads.error) throw new DbFailure(threads.error, "listLastDmsSentTo");
  const ids = (threads.data ?? []).map((c) => c.id);
  if (!ids.length) return [];
  const { data, error } = await db
    .from("messages")
    .select("body")
    .eq("tenant_id", tenantId)
    .in("conversation_id", ids)
    .eq("channel", "instagram")
    .eq("direction", "outbound")
    .order("created_at", { ascending: false })
    .limit(DMS_TO_COMPARE);
  if (error) throw new DbFailure(error, "listLastDmsSentTo");
  return (data ?? []).flatMap((m) => (m.body ? [m.body] : []));
}
/** How many of the DMs sent last an echo's words are compared with: a split reply's parts follow it within seconds. */
const DMS_TO_COMPARE = 5;

/**
 * When a customer last wrote to the workspace on a wire (the message's own time, else when it was kept), or null when
 * nobody has: what a channel's row says of its last message (Settings › Connections, the channels read). Under the
 * caller's row security. A read that fails THROWS.
 */
export async function findLastInboundOn(
  db: Db,
  tenantId: TenantId,
  channel: "whatsapp" | "instagram",
): Promise<string | null> {
  const { data, error } = await db
    .from("messages")
    .select("channel_ts, created_at")
    .eq("tenant_id", tenantId)
    .eq("direction", "inbound")
    .eq("channel", channel)
    .order("channel_ts", { ascending: false, nullsFirst: false })
    .limit(1)
    .maybeSingle();
  if (error) throw new DbFailure(error, "findLastInboundOn");
  return data?.channel_ts ?? data?.created_at ?? null;
}

/** A stored attachment removed from the media bucket (a DM the person unsent): true when it went, or was not there. */
export async function removeStoredMedia(db: Db, path: string): Promise<boolean> {
  const { error } = await db.storage.from("media").remove([path]);
  return !error;
}
