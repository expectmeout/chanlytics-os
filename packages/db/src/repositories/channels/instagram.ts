/**
 * A workspace's Instagram accounts as channels (decision 0001, step 8): the rows the connect door writes and turns on and
 * off, the token each keeps in the Vault, and the accounts the token sweep visits; and what the DM door reads and writes
 * of its people and messages: who an Instagram-scoped id is here, whether a message id is ours, a DM taken back. The edge's lib/instagram holds the
 * wire and the order; every table and every SQL function it reaches is named here.
 *
 * Each read that fails THROWS (or answers `failed`): "we could not read it" is never "there is none".
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database, Json } from "../../database.types";

type Db = SupabaseClient<Database>;

/** An account's row as the sweep and the wires take it. */
export interface InstagramAccountRow {
  id: string;
  tenant_id: string;
  external_id: string;
  credentials_ref: string | null;
  config: Json;
}

/** Every active Instagram account on the platform, oldest first: the token sweep's round. */
export async function activeInstagramAccounts(db: Db): Promise<InstagramAccountRow[]> {
  const { data, error } = await db
    .from("tenant_channels")
    .select("id, tenant_id, external_id, credentials_ref, config")
    .eq("kind", "instagram")
    .eq("status", "active")
    .order("created_at", { ascending: true });
  if (error) throw new Error(`activeInstagramAccounts: ${error.message}`);
  return data ?? [];
}

/** What a channel keeps in the Vault (get_channel_credentials), as stored; null when it keeps nothing. */
export async function readChannelSecret(db: Db, channelId: string): Promise<Json | null> {
  const { data, error } = await db.rpc("get_channel_credentials", { p_channel_id: channelId });
  if (error) throw new Error(`readChannelSecret: ${error.message}`);
  return data ?? null;
}

/** A channel's secret put in the Vault, through the one function that writes a credential (put_channel_credentials). */
export async function putChannelSecret(db: Db, channelId: string, secret: Json): Promise<void> {
  const { error } = await db.rpc("put_channel_credentials", { p_channel_id: channelId, p_secret: secret });
  if (error) throw new Error(`putChannelSecret: ${error.message}`);
}

/** Which workspace holds an Instagram account's row, if any: the connect door refuses one another workspace holds. */
export async function instagramAccountHolder(
  db: Db,
  accountId: string,
): Promise<{ id: string; tenant_id: string } | null> {
  const { data, error } = await db
    .from("tenant_channels")
    .select("id, tenant_id")
    .eq("kind", "instagram")
    .eq("external_id", accountId)
    .maybeSingle();
  if (error) throw new Error(`instagramAccountHolder: ${error.message}`);
  return data;
}

/**
 * An account's row, written for THIS workspace: an update of the row it holds, else an insert, written disabled (it
 * routes only once its token is in the Vault), that the unique (kind, external_id) refuses when another workspace raced
 * it there; this workspace's own row found that way is a double submit. Its id, `taken`, or `failed` with the words.
 */
export async function writeInstagramAccount(
  db: Db,
  fields: { tenantId: string; accountId: string; config: Json },
): Promise<{ id: string } | "taken" | { failed: string }> {
  const row = {
    tenant_id: fields.tenantId,
    kind: "instagram",
    external_id: fields.accountId,
    number_e164: null,
    waba_id: null,
    config: fields.config,
  };
  const mine = await db
    .from("tenant_channels")
    .update(row)
    .eq("kind", "instagram")
    .eq("external_id", fields.accountId)
    .eq("tenant_id", fields.tenantId)
    .select("id")
    .maybeSingle();
  if (mine.error) return { failed: mine.error.message };
  if (mine.data) return mine.data;
  const made = await db
    .from("tenant_channels")
    .insert({ ...row, status: "disabled" })
    .select("id")
    .single();
  if (made.error?.code === "23505") {
    const holder = await instagramAccountHolder(db, fields.accountId).catch(() => null);
    return holder?.tenant_id === fields.tenantId ? { id: holder.id } : "taken";
  }
  if (made.error || !made.data) return { failed: made.error?.message ?? "no row" };
  return made.data;
}

/**
 * An account's row turned on or off, for this workspace only: true when a row changed, counted, since a forbidden or
 * mis-aimed UPDATE reports success with no row.
 */
export async function setInstagramStatus(
  db: Db,
  tenantId: string,
  channelId: string,
  status: "active" | "disabled",
): Promise<boolean> {
  const { data, error } = await db
    .from("tenant_channels")
    .update({ status })
    .eq("id", channelId)
    .eq("tenant_id", tenantId)
    .eq("kind", "instagram")
    .select("id");
  return !error && !!data?.length;
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
  note: { token_refreshed_at?: string; token_expires_at?: string | null; token_lapsed_at?: string | null },
): Promise<boolean> {
  const base = config && typeof config === "object" && !Array.isArray(config) ? config : {};
  const { data, error } = await db
    .from("tenant_channels")
    .update({ config: { ...base, ...note } })
    .eq("id", channelId)
    .eq("kind", "instagram")
    .select("id");
  if (error) throw new Error(`noteInstagramToken: ${error.message}`);
  return !!data?.length;
}

/**
 * A DM the person unsent (Meta's is_deleted), through its door (message_unsent, 00486): its words and attachment no
 * longer kept, never answered after. `forgot` with the stored attachment's path for the caller to remove, or `none` for a
 * DM not kept here. A write that fails THROWS, so the door has the delivery sent again.
 */
export async function messageUnsent(
  db: Db,
  tenantId: string,
  externalId: string,
): Promise<{ outcome: "forgot"; storagePath: string | null } | { outcome: "none" }> {
  const { data, error } = await db.rpc("message_unsent", { p_tenant_id: tenantId, p_external_id: externalId });
  if (error) throw new Error(`message_unsent: ${error.message}`);
  const o = data && typeof data === "object" && !Array.isArray(data) ? data : {};
  if (o.outcome !== "forgot") return { outcome: "none" };
  return { outcome: "forgot", storagePath: typeof o.storage_path === "string" ? o.storage_path : null };
}

/**
 * A person's Instagram-scoped id (contact_identities, channel instagram): where a DM to them goes (decision 0001, step 8).
 * Their newest, where a merge left them two; null for a person who never wrote by DM. A read that fails THROWS: "we could
 * not read it" is never "they have none".
 */
export async function instagramIdOf(db: Db, tenantId: string, contactId: string): Promise<string | null> {
  const { data, error } = await db
    .from("contact_identities")
    .select("external_id")
    .eq("tenant_id", tenantId)
    .eq("contact_id", contactId)
    .eq("channel", "instagram")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw Object.assign(new Error(`instagramIdOf: ${error.message}`), { code: error.code });
  return data?.external_id ?? null;
}

/**
 * The person an Instagram-scoped id belongs to here (contact_identities, channel instagram), or null for an id nobody
 * holds: an echo of the business's own DM is kept on that person's thread, and on no one's when nobody holds it. An id a
 * merge moved points at the kept person (00326: one hop is every hop). A read that fails THROWS.
 */
export async function personOfInstagramId(db: Db, tenantId: string, igsid: string): Promise<string | null> {
  const { data, error } = await db
    .from("contact_identities")
    .select("contact_id, contacts (merged_into_contact_id, erased_at)")
    .eq("tenant_id", tenantId)
    .eq("channel", "instagram")
    .eq("external_id", igsid)
    .limit(1)
    .maybeSingle();
  if (error) throw Object.assign(new Error(`personOfInstagramId: ${error.message}`), { code: error.code });
  if (!data || data.contacts?.erased_at) return null;
  return data.contacts?.merged_into_contact_id ?? data.contact_id;
}

/**
 * The words of the last DMs this workspace sent a person (`DMS_TO_COMPARE`, newest first), across their threads: a reply
 * too long for one DM leaves as several, each with its own id at Instagram, and its row keeps the first part's id alone,
 * so a later part's echo is told from a message the team typed in the app by its words. A read that fails THROWS.
 */
export async function lastDmsSentTo(db: Db, tenantId: string, contactId: string): Promise<string[]> {
  const threads = await db.from("conversations").select("id").eq("tenant_id", tenantId).eq("contact_id", contactId);
  if (threads.error) throw new Error(`lastDmsSentTo: ${threads.error.message}`);
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
  if (error) throw new Error(`lastDmsSentTo: ${error.message}`);
  return (data ?? []).flatMap((m) => (m.body ? [m.body] : []));
}
/** How many of the DMs sent last an echo's words are compared with: a split reply's parts follow it within seconds. */
const DMS_TO_COMPARE = 5;

/**
 * When a customer last wrote to the workspace on a wire (the message's own time, else when it was kept), or null when
 * nobody has: what a channel's row says of its last message (Settings › Connections, the channels read). Under the
 * caller's row security. A read that fails THROWS.
 */
export async function lastInboundOn(
  db: Db,
  tenantId: string,
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
  if (error) throw new Error(`lastInboundOn: ${error.message}`);
  return data?.channel_ts ?? data?.created_at ?? null;
}

/** A stored attachment removed from the media bucket (a DM the person unsent): true when it went, or was not there. */
export async function removeStoredMedia(db: Db, path: string): Promise<boolean> {
  const { error } = await db.storage.from("media").remove([path]);
  return !error;
}
