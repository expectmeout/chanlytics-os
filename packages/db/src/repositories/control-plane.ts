/**
 * Control-plane repository (Session A): config, policies, team.
 * Same shape as ingest/calls/thread — thin, typed, no business rules here;
 * enforcement lives in RLS + the DB triggers + requireRole at the routes.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database, Json } from "../database.types";

type Db = SupabaseClient<Database>;

export interface TenantConfigRow {
  tenant_id: string;
  config: unknown;
  version: number;
  updated_at: string;
}

export async function getTenantConfig(db: Db, tenantId: string): Promise<TenantConfigRow | null> {
  const { data, error } = await db
    .from("tenant_config")
    .select("tenant_id, config, version, updated_at")
    .eq("tenant_id", tenantId)
    .maybeSingle();
  if (error) throw new Error(`getTenantConfig: ${error.message}`);
  return data;
}

/**
 * Optimistic-concurrency write: the caller sends back the version it read.
 * A stale write updates zero rows and returns null — the route turns that
 * into a 409 so two owners editing at once never silently clobber each other.
 */
export async function putTenantConfig(
  db: Db,
  tenantId: string,
  config: unknown,
  expectedVersion: number,
): Promise<TenantConfigRow | null> {
  const { data, error } = await db
    .from("tenant_config")
    .update({ config: config as Json, version: expectedVersion + 1 })
    .eq("tenant_id", tenantId)
    .eq("version", expectedVersion)
    .select("tenant_id, config, version, updated_at")
    .maybeSingle();
  if (error) throw new Error(`putTenantConfig: ${error.message}`);
  return data;
}

export interface PolicyRecord {
  id: string;
  class: string;
  mode: string;
  subject_type: string | null;
  subject_id: string | null;
  limits: unknown;
  updated_at: string;
}

/** Workspace-level rows only (subject IS NULL) — guardrail rows arrive with
 *  the People slice and get their own accessor then. */
export async function listPolicies(db: Db, tenantId: string): Promise<PolicyRecord[]> {
  const { data, error } = await db
    .from("policies")
    .select("id, class, mode, subject_type, subject_id, limits, updated_at")
    .eq("tenant_id", tenantId)
    .is("subject_type", null)
    .order("class");
  if (error) throw new Error(`listPolicies: ${error.message}`);
  return data ?? [];
}

export async function setPolicyMode(
  db: Db,
  tenantId: string,
  policyClass: string,
  mode: string,
): Promise<PolicyRecord | null> {
  const { data, error } = await db
    .from("policies")
    .update({ mode })
    .eq("tenant_id", tenantId)
    .eq("class", policyClass)
    .is("subject_type", null)
    .select("id, class, mode, subject_type, subject_id, limits, updated_at")
    .maybeSingle();
  // the money-lock trigger raises here — surface it as-is, the route maps it
  if (error) throw new Error(error.message);
  return data;
}
