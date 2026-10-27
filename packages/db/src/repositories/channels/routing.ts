/**
 * Webhook → tenant routing over tenant_channels(kind, external_id).
 *
 * Cross-workspace: a webhook finds its workspace by the provider's id (kind, external_id) on tenant_channels.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database, Json } from "../../database.types";
import { MIN_MS } from "@chanlytics/contracts";
import { dbLog } from "../../observe";

export interface RoutedChannel {
  channelId: string;
  tenantId: string;
  kind: string;
  /** The provider's id this row routes on: a WhatsApp phone_number_id, a Retell agent id, an SMS number. */
  externalId: string;
  numberE164: string | null;
  credentialsRef: string | null;
  config: Json;
}

// TTL cache: hits 5min, misses/disabled 60s — a newly onboarded (or re-enabled)
// tenant channel must route without waiting for a lambda cold start.
const POS_TTL_MS = 5 * MIN_MS;
const NEG_TTL_MS = MIN_MS;
const cache = new Map<string, { v: RoutedChannel | null; exp: number }>();

export interface ChannelLookup {
  channel: RoutedChannel | null;
  /**
   * The lookup could not be COMPLETED (database error, no cached answer). This
   * is NOT the same as "no active channel", and callers must not conflate them:
   * "the database says this channel is off" is a deliberate configuration state
   * that should silence the receptionist, while "the database did not answer"
   * is an infrastructure blip the door refuses to acknowledge, so the provider
   * redelivers once the read works. Returning a bare null for both made a
   * Postgres hiccup indistinguishable from someone flipping the off switch.
   */
  lookupFailed: boolean;
}

export async function resolveChannelDetailed(
  db: SupabaseClient<Database>,
  kind: string,
  externalId: string,
): Promise<ChannelLookup> {
  const key = `${kind}:${externalId}`;
  const hit = cache.get(key);
  if (hit && hit.exp > Date.now()) return { channel: hit.v, lookupFailed: false };
  const { data, error } = await db
    .from("tenant_channels")
    .select("id, tenant_id, kind, status, number_e164, credentials_ref, config, external_id")
    .eq("kind", kind)
    .eq("external_id", externalId)
    .maybeSingle();
  if (error) {
    dbLog().error("resolve_channel_failed", { kind, error: error.message });
    // Never cache errors. A stale positive is still a real answer, so serve it;
    // otherwise report that we could not find out.
    if (hit?.v) return { channel: hit.v, lookupFailed: false };
    return { channel: null, lookupFailed: true };
  }
  const routed: RoutedChannel | null = data && data.status === "active" ? routedOf(data) : null;
  cache.set(key, { v: routed, exp: Date.now() + (routed ? POS_TTL_MS : NEG_TTL_MS) });
  return { channel: routed, lookupFailed: false };
}

/** The columns a channel routes by, as a row of them is read. */
const ROUTED_COLUMNS = "id, tenant_id, kind, number_e164, credentials_ref, config, external_id";

/** A channel's row as the runtime takes it. */
function routedOf(row: {
  id: string;
  tenant_id: string;
  kind: string;
  external_id: string;
  number_e164: string | null;
  credentials_ref: string | null;
  config: Json;
}): RoutedChannel {
  return {
    channelId: row.id,
    tenantId: row.tenant_id,
    kind: row.kind,
    externalId: row.external_id,
    numberE164: row.number_e164,
    credentialsRef: row.credentials_ref,
    config: row.config,
  };
}

/**
 * A workspace's channel of a kind as a door that no channel routed reads it (a steer, an eval): its oldest active row,
 * the one contracts channelFor picks, since a workspace may hold two of a kind. Null with none. A read that fails throws.
 */
export async function oldestActiveChannel(
  db: SupabaseClient<Database>,
  tenantId: string,
  kind: string,
): Promise<RoutedChannel | null> {
  const { data, error } = await db
    .from("tenant_channels")
    .select(ROUTED_COLUMNS)
    .eq("tenant_id", tenantId)
    .eq("kind", kind)
    .eq("status", "active")
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();
  if (error) throw new Error(`cannot read the workspace's ${kind} channel: ${error.message}`);
  return data ? routedOf(data) : null;
}

/** The common case: callers that cannot act on the distinction. */
export async function resolveChannel(
  db: SupabaseClient<Database>,
  kind: string,
  externalId: string,
): Promise<RoutedChannel | null> {
  return (await resolveChannelDetailed(db, kind, externalId)).channel;
}

/** One of a workspace's WhatsApp numbers, as a send from it needs the row: its id, its vault reference, Meta's id for it. */
export interface WhatsappNumberRow {
  id: string;
  credentials_ref: string | null;
  external_id: string;
}

/**
 * A workspace's active WhatsApp numbers, oldest first. Connecting a second number leaves the first one active, so there
 * may be two; the first is the one contracts channelFor picks, and the one a send goes from when nothing says which
 * number its person wrote to. A read that fails throws.
 */
export async function activeWhatsappNumbers(
  db: SupabaseClient<Database>,
  tenantId: string,
): Promise<WhatsappNumberRow[]> {
  return activeChannelRows(db, tenantId, "whatsapp");
}

/** What a failed read says it could not read, in the words a person searching the logs knows. */
const CHANNEL_ROWS_WORDS = { whatsapp: "WhatsApp numbers", instagram: "Instagram accounts" } as const;

/**
 * A workspace's active channels of a kind that sends (its WhatsApp numbers, its Instagram accounts), oldest first, as a
 * send from one needs the row. A read that fails throws.
 */
export async function activeChannelRows(
  db: SupabaseClient<Database>,
  tenantId: string,
  kind: "whatsapp" | "instagram",
): Promise<WhatsappNumberRow[]> {
  const { data, error } = await db
    .from("tenant_channels")
    .select("id, credentials_ref, external_id")
    .eq("tenant_id", tenantId)
    .eq("kind", kind)
    .eq("status", "active")
    .order("created_at", { ascending: true });
  if (error) throw new Error(`cannot read the workspace's ${CHANNEL_ROWS_WORDS[kind]}: ${error.message}`);
  return data ?? [];
}

/**
 * The WhatsApp number a thread's person last wrote to: the line their newest WhatsApp message came in on (meta.line, the
 * id of the channel that routed it, which core inbound/ingest.ts writes). Null when nothing says: they never wrote on
 * WhatsApp, or their newest message was kept before its line was. A read that fails throws.
 */
export async function whatsappLineOf(
  db: SupabaseClient<Database>,
  tenantId: string,
  conversationId: string,
): Promise<string | null> {
  return lineWrittenTo(db, tenantId, conversationId, "whatsapp");
}

/**
 * The channel a thread's person last wrote to on a wire that may have several (a WhatsApp number, an Instagram account,
 * whose ids for a person are its own): the line their newest message on that wire came in on (meta.line). Null when
 * nothing says. A read that fails throws.
 */
export async function lineWrittenTo(
  db: SupabaseClient<Database>,
  tenantId: string,
  conversationId: string,
  channel: "whatsapp" | "instagram",
): Promise<string | null> {
  const { data, error } = await db
    .from("messages")
    .select("meta")
    .eq("tenant_id", tenantId)
    .eq("conversation_id", conversationId)
    .eq("channel", channel)
    .eq("direction", "inbound")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw new Error(`cannot read the ${channel} line this thread was written to: ${error.message}`);
  const meta = data?.meta;
  const line = meta && typeof meta === "object" && !Array.isArray(meta) ? meta.line : null;
  return typeof line === "string" && line ? line : null;
}
