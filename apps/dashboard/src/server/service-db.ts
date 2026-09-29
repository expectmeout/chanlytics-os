import "server-only";
import { createServiceClient } from "@chanlytics/db";
import type { Database } from "@chanlytics/db";
import type { SupabaseClient } from "@supabase/supabase-js";
import { env } from "./env";

/**
 * Service-role territory (Blueprint §8): jobs scheduling, and the few calls
 * that cross to the edge. Tenant DATA writes never happen here — those run on
 * the session client so RLS enforces. This module cannot be imported
 * client-side.
 *
 * The one construction of the service-role client in the dashboard: the
 * unsubscribe page and the rate limiter each built their own from the raw
 * environment, and now ask here.
 */

let svc: SupabaseClient<Database> | null = null;

/**
 * The service-role client when this deployment holds its keys, or null on one that does not (a laptop): the
 * unsubscribe page and the rate limiter answer without it, each in its own words. A production deployment always
 * holds them (env.ts, REQUIRED_IN_PRODUCTION).
 */
export function serviceDbIfConfigured(): SupabaseClient<Database> | null {
  if (svc) return svc;
  const url = env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceRoleKey) return null;
  svc = createServiceClient({ url, serviceRoleKey });
  return svc;
}

/** The service-role client; a deployment without its keys throws here, on the first call that needs it. */
export function serviceDb(): SupabaseClient<Database> {
  const db = serviceDbIfConfigured();
  if (!db) throw new Error("service_db_unconfigured: NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY");
  return db;
}

/** For tests: the service-role client the calls here use. */
export function setServiceClient(db: SupabaseClient<Database> | null): void {
  svc = db;
}
