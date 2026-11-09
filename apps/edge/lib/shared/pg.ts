/**
 * The edge's one Postgres handle, service role.
 *
 * Every cron sweep, the jobs tick, every admin door, the receptionist's memory
 * and the public /api/health hold their only database through this function.
 * There is no flag on it and nothing to withhold: a deployment without
 * credentials answers `no_database` from the whole platform while pg_cron
 * keeps enqueuing, so the client is purely a credential question and that is
 * all it asks for.
 */
import { createServiceClient } from "@chanlytics/db/shared";
import type { Database } from "@chanlytics/db/types";
import type { SupabaseClient } from "@supabase/supabase-js";
import { env } from "./env.js";

let dbClient: SupabaseClient<Database> | null = null;
let injectedDb: SupabaseClient<Database> | null = null;

/** Tests: a database handed in, so a handler runs over a fake without env or a network. Null restores the real one. */
export function setPg(db: SupabaseClient<Database> | null): void {
  injectedDb = db;
}

function pgEnabled(): boolean {
  return !!env.SUPABASE_URL && !!env.SUPABASE_SERVICE_ROLE_KEY;
}

export function pg(): SupabaseClient<Database> | null {
  if (injectedDb) return injectedDb;
  if (!pgEnabled()) return null;
  dbClient ??= createServiceClient({
    // pgEnabled holds both, so neither is blank here.
    url: env.SUPABASE_URL ?? "",
    serviceRoleKey: env.SUPABASE_SERVICE_ROLE_KEY ?? "",
  });
  return dbClient;
}
