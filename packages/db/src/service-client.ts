/**
 * Service-role client factory — ingestion, jobs, and platform-admin paths ONLY.
 * App-plane (/api/v1) handlers must use the session-scoped client so RLS is
 * the enforcement (Blueprint P6/§8); the dashboard wraps this behind a
 * server-only module. Framework-agnostic: env is passed in, never read here.
 *
 * Workspace scope: makes the service-role client, which bypasses RLS and holds no statement; each caller filters by tenant_id.
 */
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "./database.types";
import { namedFetch } from "./observe";

export interface ServiceClientConfig {
  url: string;
  serviceRoleKey: string;
}

/** Every call names the request it is made for (observe.ts), so a row the ledger takes in it says which. */
export function createServiceClient(cfg: ServiceClientConfig): SupabaseClient<Database> {
  return createClient<Database>(cfg.url, cfg.serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { fetch: namedFetch() },
  });
}
