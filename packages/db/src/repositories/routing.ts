/**
 * Webhook → tenant routing over tenant_channels(kind, external_id).
 *
 * Cross-workspace: a webhook finds its workspace by the provider's id (kind, external_id) on tenant_channels.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database, Json } from "../database.types";
import { MIN_MS } from "@chanlytics/contracts";

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
    console.error("resolve_channel_failed", error.message);
    // Never cache errors. A stale positive is still a real answer, so serve it;
    // otherwise report that we could not find out.
    if (hit?.v) return { channel: hit.v, lookupFailed: false };
    return { channel: null, lookupFailed: true };
  }
  const routed: RoutedChannel | null =
    data && data.status === "active"
      ? {
          channelId: data.id,
          tenantId: data.tenant_id,
          kind: data.kind,
          externalId: data.external_id,
          numberE164: data.number_e164,
          credentialsRef: data.credentials_ref,
          config: data.config,
        }
      : null;
  cache.set(key, { v: routed, exp: Date.now() + (routed ? POS_TTL_MS : NEG_TTL_MS) });
  return { channel: routed, lookupFailed: false };
}

/** The common case: callers that cannot act on the distinction. */
export async function resolveChannel(
  db: SupabaseClient<Database>,
  kind: string,
  externalId: string,
): Promise<RoutedChannel | null> {
  return (await resolveChannelDetailed(db, kind, externalId)).channel;
}
