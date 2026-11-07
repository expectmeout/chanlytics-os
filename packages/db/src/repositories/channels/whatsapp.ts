/**
 * A workspace's WhatsApp numbers as the edge connects, routes and watches them (decision 0111): the account a template is
 * filed under, the numbers of one business account, a number's row written, found and switched, its token kept, and the
 * sends that heard no receipt. A number's row is found across workspaces only to say who holds it (platformWide). Each
 * answer is the database's as it came; the caller says a failure in its words.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database, Json } from "../../database.types";
import { platformWide, tenantDb } from "../../shared/tenant-db";

type Db = SupabaseClient<Database>;
type ChannelUpdate = Database["public"]["Tables"]["tenant_channels"]["Update"];

/** The workspace's oldest active WhatsApp number's row and its business account. */
export const findWhatsAppAccount = (db: Db, tenantId: string) =>
  db
    .from("tenant_channels")
    .select("id, waba_id")
    .eq("tenant_id", tenantId)
    .eq("kind", "whatsapp")
    .eq("status", "active")
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();

/** Every active number of one business account, whichever workspace's, oldest first: where its events route. */
export const listNumbersOfWaba = (db: Db, wabaId: string) =>
  platformWide(db)
    .from("tenant_channels")
    .select("id, tenant_id, number_e164, config")
    .eq("kind", "whatsapp")
    .eq("waba_id", wabaId)
    .eq("status", "active")
    .order("created_at", { ascending: true });

/** One of the workspace's channels' config. */
export const findChannelConfig = (db: Db, tenantId: string, channelId: string) =>
  db.from("tenant_channels").select("config").eq("id", channelId).eq("tenant_id", tenantId).maybeSingle();

/** One of the workspace's channels changed. */
export const patchChannelRow = (db: Db, tenantId: string, channelId: string, set: ChannelUpdate) =>
  db.from("tenant_channels").update(set).eq("id", channelId).eq("tenant_id", tenantId);

/** One of the workspace's channels switched on or off, its id back: none when the row is not the workspace's. */
export const setChannelStatus = (db: Db, tenantId: string, channelId: string, status: "active" | "disabled") =>
  db.from("tenant_channels").update({ status }).eq("id", channelId).eq("tenant_id", tenantId).select("id");

/** The workspace's own row for a WhatsApp number written over, its id back: none when it holds no row for it. */
export const patchWhatsAppNumberRow = (db: Db, tenantId: string, phoneNumberId: string, set: ChannelUpdate) =>
  db
    .from("tenant_channels")
    .update(set)
    .eq("kind", "whatsapp")
    .eq("external_id", phoneNumberId)
    .eq("tenant_id", tenantId)
    .select("id")
    .maybeSingle();

/** A new channel row for the workspace, its id back: the database keeps a number on one row (23505 for a second). */
export const insertChannelRow = (
  db: Db,
  tenantId: string,
  row: Database["public"]["Tables"]["tenant_channels"]["Insert"],
) => tenantDb(db, tenantId).from("tenant_channels").insert(row).select("id").single();

/** Whose row a WhatsApp number is, whichever workspace's: the row's id and its workspace, or none. */
export const findWhatsAppNumberHolder = (db: Db, phoneNumberId: string) =>
  platformWide(db)
    .from("tenant_channels")
    .select("id, tenant_id")
    .eq("kind", "whatsapp")
    .eq("external_id", phoneNumberId)
    .maybeSingle();

/** A channel's secret put in Vault (put_channel_credentials), as the database answered (putChannelSecret throws). */
export const putChannelCredentials = (db: Db, channelId: string, secret: Json) =>
  db.rpc("put_channel_credentials", { p_channel_id: channelId, p_secret: secret });

/** The sends Meta took (status `sent`) and has said nothing more of, since `watchedSince`, whichever workspace's. */
const sendsAccepted = (db: Db) =>
  platformWide(db)
    .from("messages")
    .select("tenant_id, created_at, status_updated_at")
    .eq("channel", "whatsapp")
    .eq("direction", "outbound")
    .eq("status", "sent")
    .not("external_id", "is", null);

/**
 * The WhatsApp sends with no receipt between `watchedSince` and `quietSince`, whichever workspace's, `limit` of each
 * kind: the ones taken directly (no status since) and the ones queued (a status, and none after).
 */
export const listSendsWithoutReceipt = (db: Db, quietSince: string, watchedSince: string, limit: number) =>
  Promise.all([
    sendsAccepted(db)
      .is("status_updated_at", null)
      .lt("created_at", quietSince)
      .gte("created_at", watchedSince)
      .limit(limit),
    sendsAccepted(db).lt("status_updated_at", quietSince).gte("status_updated_at", watchedSince).limit(limit),
  ]);

/** One of the workspace's WhatsApp sends that heard a receipt (delivered, read or failed) after `since`, or none. */
export const findReceiptSince = (db: Db, tenantId: string, since: string) =>
  db
    .from("messages")
    .select("id")
    .eq("tenant_id", tenantId)
    .eq("channel", "whatsapp")
    .eq("direction", "outbound")
    .in("status", ["delivered", "read", "failed"])
    .not("external_id", "is", null)
    .gt("status_updated_at", since)
    .limit(1);
