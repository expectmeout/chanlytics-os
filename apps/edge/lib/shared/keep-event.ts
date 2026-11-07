/**
 * The intake ledger's door-side half (decision 0032, 00336): a door keeps the delivery it verified before its verdict,
 * under the provider's own id, so an intake can be replayed after a fix (api/admin/intake/replay) instead of
 * waiting for a redelivery the provider never sends. One call per door, after its signature and before its decision.
 *
 * A keep that fails is a log line and nothing else: the ledger is a copy, and a provider is never refused because the
 * copy could not be taken. An unverified body is nobody's and is not kept, which is why the caller says it verified.
 */
import crypto from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { keepProviderEvent, type DeliveryProvider } from "@chanlytics/db/events";
import { type Database } from "@chanlytics/db/types";
import { logger } from "./log.js";

type Db = SupabaseClient<Database>;

/** The key a provider gave no id for: a digest of the body, so the same bytes delivered twice are one row. */
export function digestId(body: string): string {
  return "sha256:" + crypto.createHash("sha256").update(body).digest("hex");
}

/** The headers a signature reads, by their lower-case names, from the request as it came; absent ones are left out. */
export function signatureHeaders(request: Request, names: readonly string[]): Record<string, string> {
  const out: Record<string, string> = {};
  for (const name of names) {
    const v = request.headers.get(name);
    if (v !== null) out[name.toLowerCase()] = v;
  }
  return out;
}

/**
 * Keeps one verified delivery; a copy that could not be taken is said, never thrown. Answers whether it is kept (a
 * delivery the ledger already holds under that id is), for a door that must say where a delivery it could not take
 * went (sms/status.ts: Twilio sends a status callback once).
 */
export async function keepDelivery(
  db: Db,
  details: {
    provider: DeliveryProvider;
    id: string;
    door: string;
    url: string;
    tenantId: string | null;
    headers: Record<string, string>;
    body: string;
  },
): Promise<boolean> {
  const { error } = await keepProviderEvent(db, {
    provider: details.provider,
    provider_event_id: details.id,
    door: details.door,
    url: details.url,
    tenant_id: details.tenantId,
    headers: details.headers,
    body: details.body,
  });
  if (error)
    logger({ tenant_id: details.tenantId ?? undefined }).warn("provider_event_keep_failed", {
      provider: details.provider,
      door: details.door,
      error,
    });
  return !error;
}
