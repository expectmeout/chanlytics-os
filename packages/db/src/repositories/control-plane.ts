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

export type PutTenantConfigResult =
  | { ok: true; row: TenantConfigRow }
  /** Someone else saved between the read and the write. A real conflict. */
  | { ok: false; reason: "stale" }
  /** There is no config row at all — this workspace was never provisioned.
   *  NOT a conflict, and telling the owner to "reload and reapply" sends them
   *  round a loop that cannot terminate. */
  | { ok: false; reason: "missing" };

/**
 * Optimistic-concurrency write: the caller sends back the version it read.
 *
 * Returns WHY it failed, because zero rows updated has two very different
 * causes and the route used to report both as "someone else saved settings
 * after you loaded them". For a tenant with no config row that sentence is
 * false in every particular — nobody saved anything, no colleague exists, and
 * reloading changes nothing.
 */
export async function putTenantConfig(
  db: Db,
  tenantId: string,
  config: unknown,
  expectedVersion: number,
): Promise<PutTenantConfigResult> {
  const { data, error } = await db
    .from("tenant_config")
    .update({ config: config as Json, version: expectedVersion + 1 })
    .eq("tenant_id", tenantId)
    .eq("version", expectedVersion)
    .select("tenant_id, config, version, updated_at")
    .maybeSingle();
  if (error) throw new Error(`putTenantConfig: ${error.message}`);
  if (data) return { ok: true, row: data };

  // Zero rows. Distinguish an absent row from a losing race — one query, only
  // on the failure path.
  const existing = await getTenantConfig(db, tenantId);
  return { ok: false, reason: existing ? "stale" : "missing" };
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
  /**
   * Merged into the existing limits, never replacing them.
   *
   * `limits` holds several unrelated settings for one class — a reply row
   * carries both max_replies_day and reply_delay_ms — so a PUT that sent the
   * whole object would silently drop whichever one the caller did not know
   * about. Callers set what they mean and leave the rest alone.
   */
  limits?: Record<string, unknown>,
): Promise<PolicyRecord | null> {
  let merged: Record<string, unknown> | undefined;
  if (limits && Object.keys(limits).length) {
    const { data: current } = await db
      .from("policies")
      .select("limits")
      .eq("tenant_id", tenantId)
      .eq("class", policyClass)
      .is("subject_type", null)
      .maybeSingle();
    merged = { ...((current?.limits as Record<string, unknown>) ?? {}), ...limits };
  }
  const { data, error } = await db
    .from("policies")
    .update(merged ? { mode, limits: merged as never } : { mode })
    .eq("tenant_id", tenantId)
    .eq("class", policyClass)
    .is("subject_type", null)
    .select("id, class, mode, subject_type, subject_id, limits, updated_at")
    .maybeSingle();
  // the money-lock trigger raises here — surface it as-is, the route maps it
  if (error) throw new Error(error.message);
  return data;
}
