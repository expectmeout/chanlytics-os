/**
 * The edge's one Postgres handle, service role.
 *
 * This began as the Slice 1 dual-write switch: PG_WRITES=on turned on writes
 * ADDITIVE to the Blob path, and anything else was a silent no-op, so the
 * variable really was a rollback lever. It is not one any more. Every cron
 * sweep, the jobs tick, every admin door and the public /api/health now hold
 * their only database through this function, so withholding it does not roll
 * the bot's memory back to Blob — it answers `no_database` from the whole
 * platform while pg_cron keeps enqueuing. The lever that still exists is
 * PG_READS, which decides where the memory is READ from; the client itself is
 * a credential question, so that is all it asks for now.
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
