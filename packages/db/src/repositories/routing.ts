/** Webhook → tenant routing over tenant_channels(kind, external_id). */
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "../database.types";

export interface RoutedChannel {
  channelId: string;
  tenantId: string;
  kind: string;
}

const cache = new Map<string, RoutedChannel | null>();

export async function resolveChannel(
  db: SupabaseClient<Database>,
  kind: string,
  externalId: string,
): Promise<RoutedChannel | null> {
  const key = `${kind}:${externalId}`;
  if (cache.has(key)) return cache.get(key) ?? null;
  const { data, error } = await db
    .from("tenant_channels")
    .select("id, tenant_id, kind, status")
    .eq("kind", kind)
    .eq("external_id", externalId)
    .maybeSingle();
  if (error) {
    console.error("resolve_channel_failed", error.message);
    return null; // never cache errors
  }
  const routed = data && data.status === "active"
    ? { channelId: data.id, tenantId: data.tenant_id, kind: data.kind }
    : null;
  cache.set(key, routed);
  return routed;
}
