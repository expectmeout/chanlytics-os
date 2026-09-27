import "server-only";
import { createServiceClient } from "@chanlytics/db";
import type { Database } from "@chanlytics/db";
import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Service-role territory (Blueprint §8): jobs scheduling, and the few calls
 * that cross to the edge. Tenant DATA writes never happen here — those run on
 * the session client so RLS enforces. This module cannot be imported
 * client-side.
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
