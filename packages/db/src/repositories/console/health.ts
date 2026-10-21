/**
 * What the Console's Health reads (decision 0068), and the two writes beside it: every clock beside pg_cron's own record
 * of its runs (platform_clocks, 00469), the clocks' judgement and the ledger's backlog (sweep_health, jobs_backlog), the
 * failed jobs, what paged us (operator_pages), every part's numbers in one read (platform_health_parts, 00469), the
 * workspaces and which are ours, the errors pages hit (client_errors, 00469), and a subscriber's failed deliveries sent
 * again (event_deliveries_redrive, 00334).
 *
 * On the service role: each table and function here is the service role's alone. Each answers what the database
 * answered; the reader in the dashboard decides what a failed read says.
 *
 * Cross-workspace: Health reads every workspace; only the Console's admin check reaches these reads.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "../../database.types";

type Db = SupabaseClient<Database>;

export type ClientErrorInsert = Database["public"]["Tables"]["client_errors"]["Insert"];

/** Every registered clock, its schedule, and how many of its runs in the last `days` ran and failed. */
export async function healthClocks(db: Db, days: number) {
  return db.rpc("platform_clocks", { p_days: days });
}

/** The clocks as sweep_health() judges them: the pager's judgement, so Health and the pager never disagree. */
export async function healthSweeps(db: Db) {
  return db.rpc("sweep_health");
}

/** Due jobs nobody has claimed for two minutes. */
export async function healthBacklog(db: Db) {
  return db.rpc("jobs_backlog");
}

/** The jobs that failed for good since `sinceIso`, newest first, with their workspace. */
export async function healthFailedJobs(db: Db, q: { sinceIso: string; limit: number }) {
  return db
    .from("jobs")
    .select("id, tenant_id, kind, lane, attempts, last_error, created_at, updated_at")
    .eq("state", "failed")
    .gte("updated_at", q.sinceIso)
    .order("updated_at", { ascending: false })
    .limit(q.limit);
}

/** What paged us: each condition the pager remembers, the newest first. */
export async function healthPages(db: Db, limit: number) {
  return db
    .from("operator_pages")
    .select("key, first_at, last_at, count, alerted_at")
    .order("last_at", { ascending: false })
    .limit(limit);
}

/** Every part's numbers over the last `days`, each keyed by whether its workspace is ours. */
export async function healthParts(db: Db, days: number) {
  return db.rpc("platform_health_parts", { p_days: days });
}

/** Every workspace's name and address, and whether it is ours: Health names a row's workspace and splits by it. */
export async function healthWorkspaces(db: Db, limit: number) {
  return db.from("tenants").select("id, slug, name, status, ours").order("created_at").limit(limit);
}

/** Whether a workspace is ours: the pager leaves ours out. A workspace it cannot read is not ours. */
export async function workspaceIsOurs(db: Db, tenantId: string): Promise<boolean> {
  const { data, error } = await db.from("tenants").select("ours").eq("id", tenantId).maybeSingle();
  return !error && data?.ours === true;
}

/** One error a page hit, kept (POST /api/v1/client-errors). */
export async function keepClientError(db: Db, row: ClientErrorInsert) {
  return db.from("client_errors").insert(row);
}

/** The errors pages hit since `sinceIso`, newest first: Health groups them by fingerprint. */
export async function healthClientErrors(db: Db, q: { sinceIso: string; limit: number }) {
  return db
    .from("client_errors")
    .select("at, fingerprint, boundary, page, name, message, build, device, member_key")
    .gte("at", q.sinceIso)
    .order("at", { ascending: false })
    .limit(q.limit);
}

/** Every failed or paused delivery of one subscriber scheduled again, each once: how many were. */
export async function redriveDeliveries(db: Db, subscriber: string) {
  return db.rpc("event_deliveries_redrive", { p_subscriber: subscriber });
}
