/**
 * The intake ledger (provider_events, 00334; decision 0030): every verified delivery a provider made to a door, kept a
 * week under the provider's own id, as it came. The one place the table is typed. Written by the edge's doors before
 * their verdict (apps/edge/lib/intake/keep.ts), read by the replay door, scrubbed by an erasure.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import type { SCHEMA_SETS } from "@chanlytics/contracts";
import type { Database, Json } from "./database.types";

type Db = SupabaseClient<Database>;

/** The providers whose deliveries are kept: the table's own closed set. */
export type DeliveryProvider = (typeof SCHEMA_SETS)["provider_events.provider"][number];

/** A delivery as a door kept it. */
export interface KeptDelivery {
  provider: DeliveryProvider;
  provider_event_id: string;
  /** The door's path, as a replay knocks on it. */
  door: string;
  /** The request's own address, as a signature may cover it. */
  url: string;
  tenant_id: string | null;
  /** The headers the door's signature reads, by their lower-case names. */
  headers: Record<string, string>;
  body: string;
}

/** The row, as read back for a replay. */
export interface KeptDeliveryRow extends KeptDelivery {
  verified: boolean;
  received_at: string;
}

/**
 * Keeps one delivery; a redelivery under the same id keeps the first. Answers the write's error, never throws: a door
 * must not refuse a provider because the ledger could not take a copy.
 */
export async function keepProviderEvent(db: Db, d: KeptDelivery): Promise<{ error: string | null }> {
  const { error } = await db
    .from("provider_events")
    .upsert(
      { ...d, headers: d.headers as Json, verified: true },
      { onConflict: "provider,provider_event_id", ignoreDuplicates: true },
    );
  return { error: error?.message ?? null };
}

/** A kept delivery by its key; null when none, or when it has been purged. */
export async function providerEventOf(
  db: Db,
  provider: DeliveryProvider,
  providerEventId: string,
): Promise<KeptDeliveryRow | null> {
  const { data, error } = await db
    .from("provider_events")
    .select("provider, provider_event_id, door, url, tenant_id, verified, headers, body, received_at")
    .eq("provider", provider)
    .eq("provider_event_id", providerEventId)
    .maybeSingle();
  if (error) throw new Error(`provider_events: ${error.message}`);
  // The row's provider is the one asked for: the column's closed set is the table's, which the types do not carry.
  return data ? { ...data, provider, headers: headersOf(data.headers) } : null;
}

/** A stored {name: value} object as strings; anything else in it is dropped. */
function headersOf(v: Json): Record<string, string> {
  const out: Record<string, string> = {};
  if (v && typeof v === "object" && !Array.isArray(v))
    for (const [k, s] of Object.entries(v)) if (typeof s === "string") out[k] = s;
  return out;
}

/** An erasure's hand (provider_events_scrub): the kept deliveries naming any of the person's identifiers, deleted. */
export async function scrubProviderEvents(db: Db, tenantId: string, needles: readonly string[]): Promise<number> {
  const { data, error } = await db.rpc("provider_events_scrub", { p_tenant_id: tenantId, p_needles: [...needles] });
  if (error) throw new Error(`provider_events_scrub: ${error.message}`);
  return data ?? 0;
}
