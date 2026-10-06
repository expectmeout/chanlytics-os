/**
 * POST /api/admin/intake/replay, everything after the knock: one kept delivery (provider_events, 00335;
 * decision 0031) knocks on its own door again, in-process, with the headers and body as they came, so its signature is
 * proved again and the door decides as it would have. What the door answers is answered back, so an operator sees a
 * 200 that took it in, a 401 from a signature whose window has passed (Resend's and Stripe's carry a timestamp),
 * or the door's own refusal. A delivery the ledger no longer holds is 404.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { SCHEMA_SETS } from "../packages/contracts.js";
import { providerEventOf, type Database, type DeliveryProvider } from "../packages/db.js";
import { json, refuse } from "../http.js";
import { logger } from "../log.js";

type Db = SupabaseClient<Database>;

/** The doors a kept delivery may knock on again, by the path it came to. */
type Doors = Readonly<Record<string, (request: Request) => Promise<Response>>>;

const KEPT_PROVIDERS: readonly string[] = SCHEMA_SETS["provider_events.provider"];

export async function replayProviderEvent(
  db: Db | null,
  body: Partial<{ provider: string; provider_event_id: string }>,
  doors: Doors,
): Promise<Response> {
  const L = logger({ door: "intake-replay" });
  const provider = typeof body.provider === "string" && KEPT_PROVIDERS.includes(body.provider) ? body.provider : null;
  const id = typeof body.provider_event_id === "string" ? body.provider_event_id.trim() : "";
  if (!provider || !id) return refuse(400, "bad_request", "provider and provider_event_id");
  if (!db) return refuse(503, "no_database");
  const kept = await providerEventOf(db, provider as DeliveryProvider, id);
  if (!kept) return refuse(404, "not_found", "no such delivery is kept");
  const door = doors[kept.door];
  if (!door) return refuse(400, "bad_request", `no door at ${kept.door}`);
  const answered = await door(new Request(kept.url, { method: "POST", headers: kept.headers, body: kept.body }));
  L.info("provider_event_replayed", {
    provider,
    door: kept.door,
    tenant_id: kept.tenant_id ?? undefined,
    status: answered.status,
  });
  return json(200, { ok: true, door: kept.door, received_at: kept.received_at, status: answered.status });
}
