/**
 * What the platform's back office reads (decision 0111): the platform's day counts and overview, one workspace's row
 * and its newest events. Read by the platform's own staff, across workspaces on purpose. Each answer is the database's
 * as it came.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "../../database.types";
import { platformWide } from "../../shared/tenant-db";

type Db = SupabaseClient<Database>;

/** The platform's numbers, a row a day, for `days` (platform_metrics_read). */
export const readPlatformMetrics = async (db: Db, days: number) => db.rpc("platform_metrics_read", { p_days: days });

/** The platform at a glance (platform_overview), asked as the staff member signed in. */
export const readPlatformOverview = async (db: Db) => db.rpc("platform_overview");

/** One workspace's row as the back office shows it, or none. */
export const findWorkspaceForConsole = async (db: Db, tenantId: string) =>
  platformWide(db)
    .from("tenants")
    .select("id, slug, name, status, timezone, created_at")
    .eq("id", tenantId)
    .maybeSingle();

/** One workspace's newest events, `limit` of them: their kind and subject, never their data. */
export const listWorkspaceEvents = async (db: Db, tenantId: string, limit: number) =>
  db
    .from("events")
    .select("kind, category, subject_type, created_at")
    .eq("tenant_id", tenantId)
    .order("created_at", { ascending: false })
    .limit(limit);
