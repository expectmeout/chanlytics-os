/** Webhook → tenant routing over tenant_channels(kind, external_id). */
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database, Json } from "../database.types";

export interface RoutedChannel {
  channelId: string;
  tenantId: string;
  kind: string;
  numberE164: string | null;
  credentialsRef: string | null;
  config: Json;
}

// TTL cache: hits 5min, misses/disabled 60s — a newly onboarded (or re-enabled)
// tenant channel must route without waiting for a lambda cold start.
const POS_TTL_MS = 5 * 60 * 1000;
const NEG_TTL_MS = 60 * 1000;
const cache = new Map<string, { v: RoutedChannel | null; exp: number }>();

export async function resolveChannel(
  db: SupabaseClient<Database>,
  kind: string,
  externalId: string,
): Promise<RoutedChannel | null> {
  const key = `${kind}:${externalId}`;
  const hit = cache.get(key);
  if (hit && hit.exp > Date.now()) return hit.v;
  const { data, error } = await db
    .from("tenant_channels")
    .select("id, tenant_id, kind, status, number_e164, credentials_ref, config")
    .eq("kind", kind)
    .eq("external_id", externalId)
    .maybeSingle();
  if (error) {
    console.error("resolve_channel_failed", error.message);
    return hit?.v ?? null; // never cache errors; serve last-known on transient failure
  }
  const routed: RoutedChannel | null =
    data && data.status === "active"
      ? {
          channelId: data.id,
          tenantId: data.tenant_id,
          kind: data.kind,
          numberE164: data.number_e164,
          credentialsRef: data.credentials_ref,
          config: data.config,
        }
      : null;
  cache.set(key, { v: routed, exp: Date.now() + (routed ? POS_TTL_MS : NEG_TTL_MS) });
  return routed;
}
