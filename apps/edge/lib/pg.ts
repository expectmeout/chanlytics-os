/**
 * Postgres dual-write switch (Blueprint §9 Slice 1). PG_WRITES=on + Supabase
 * env enables ADDITIVE writes alongside the Blob path; anything else is a
 * silent no-op. Rollback is flipping the env var — never a deploy.
 */
import { createServiceClient } from "@chanlytics/db";
import type { Database } from "@chanlytics/db";
import type { SupabaseClient } from "@supabase/supabase-js";

let client: SupabaseClient<Database> | null = null;

export function pgEnabled(): boolean {
  return (
    process.env.PG_WRITES === "on" &&
    !!process.env.SUPABASE_URL &&
    !!process.env.SUPABASE_SERVICE_ROLE_KEY
  );
}

export function pg(): SupabaseClient<Database> | null {
  if (!pgEnabled()) return null;
  client ??= createServiceClient({
    url: process.env.SUPABASE_URL!,
    serviceRoleKey: process.env.SUPABASE_SERVICE_ROLE_KEY!,
  });
  return client;
}
