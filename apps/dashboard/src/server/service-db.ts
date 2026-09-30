import "server-only";
import { createServiceClient } from "@chanlytics/db";
import type { Database } from "@chanlytics/db";
import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Service-role territory (Blueprint §8): jobs scheduling, and the few calls
 * that cross to the edge. Tenant DATA writes never happen here — those run on
 * the session client so RLS enforces — but for the one door that writes a
 * broadcast, its people and its send job as a single transaction (00280
 * assemble_broadcast): it puts the job on the ledger, so it is the route's
 * role check and not RLS that stands in front of it, and the function asks for
 * itself that every row it names is the workspace's. This module cannot be
 * imported client-side.
 */

let svc: SupabaseClient<Database> | null = null;

export function serviceDb(): SupabaseClient<Database> {
  svc ??= createServiceClient({
    url: process.env.NEXT_PUBLIC_SUPABASE_URL!,
    serviceRoleKey: process.env.SUPABASE_SERVICE_ROLE_KEY!,
  });
  return svc;
}

/** For tests: the service-role client the calls here use. */
export function setServiceClient(db: SupabaseClient<Database> | null): void {
  svc = db;
}
