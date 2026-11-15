/**
 * What the platform's back office reads (decision 0111): the platform's day counts and overview, one workspace's row
 * and its newest events. Read by the platform's own staff, across workspaces on purpose. Each answer is the database's
 * as it came.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "../../types";
import { platformWide } from "../../shared/tenant-db";
import type { TenantId } from "@chanlytics/contracts";

type Db = SupabaseClient<Database>;

/** The platform's numbers, a row a day, for `days` (platform_metrics_read). */
export const readPlatformMetrics = async (db: Db, days: number) => db.rpc("platform_metrics_read", { p_days: days });

/** The platform at a glance (platform_overview), asked as the staff member signed in. */
export const readPlatformOverview = async (db: Db) => db.rpc("platform_overview");

/** One workspace's row as the back office shows it, or none. */
export const findWorkspaceForConsole = async (db: Db, tenantId: TenantId) =>
  platformWide(db)
    .from("tenants")
    .select("id, slug, name, status, timezone, created_at")
    .eq("id", tenantId)
    .maybeSingle();

/** What each of a workspace's searches spent, round by round: the provider's runs and the judge's calls (decision 0133). */
export const listSearchSpend = async (db: Db, tenantId: TenantId, searchIds: string[]) =>
  db.from("lead_rounds").select("search_id, cost_usd, judge_usd").eq("tenant_id", tenantId).in("search_id", searchIds);

/**
 * The places one of a workspace's searches set aside, newest first, `limit` of them (decision 0133): Needs review and
 * Left out, each with why, the term that found it and the lead's name. The team's view; the owner never sees these.
 */
export const listSetAsidePlaces = async (db: Db, tenantId: TenantId, searchId: string, limit: number) =>
  db
    .from("lead_search_members")
    .select("class, excluded_by, created_at, term:judgment->>term, lead:leads(business_name)")
    .eq("tenant_id", tenantId)
    .eq("search_id", searchId)
    .in("class", ["review", "excluded"])
    .order("created_at", { ascending: false })
    .limit(limit);

/** One workspace's newest events, `limit` of them: their kind and subject, never their data. */
export const listWorkspaceEvents = async (db: Db, tenantId: TenantId, limit: number) =>
  db
    .from("events")
    .select("kind, category, subject_type, created_at")
    .eq("tenant_id", tenantId)
    .order("created_at", { ascending: false })
    .limit(limit);
