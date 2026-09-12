/**
 * Postgres dual-write switch (Blueprint §9 Slice 1). PG_WRITES=on + Supabase
 * env enables ADDITIVE writes alongside the Blob path; anything else is a
 * silent no-op. Rollback is flipping the env var — never a deploy.
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
  return (
    process.env.PG_WRITES === "on" &&
    !!process.env.SUPABASE_URL &&
    !!process.env.SUPABASE_SERVICE_ROLE_KEY
  );
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
