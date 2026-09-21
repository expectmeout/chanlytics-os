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
import { createServiceClient } from "./workspace/db.js";
import type { Database } from "./workspace/db.js";
import type { SupabaseClient } from "@supabase/supabase-js";

let client: SupabaseClient<Database> | null = null;
let injected: SupabaseClient<Database> | null = null;

/** Tests: a database handed in, so a handler runs over a fake without env or a network. Null restores the real one. */
export function setPg(c: SupabaseClient<Database> | null): void {
  injected = c;
}

export function pgEnabled(): boolean {
  return !!process.env.SUPABASE_URL && !!process.env.SUPABASE_SERVICE_ROLE_KEY;
}

export function pg(): SupabaseClient<Database> | null {
  if (injected) return injected;
  if (!pgEnabled()) return null;
  client ??= createServiceClient({
    url: process.env.SUPABASE_URL!,
    serviceRoleKey: process.env.SUPABASE_SERVICE_ROLE_KEY!,
  });
  return client;
}
