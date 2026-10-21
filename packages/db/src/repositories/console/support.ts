/**
 * What customers report, and what came in (decision 0066): support_reports (00466), written when a member presses Send
 * on Report a problem and marked once the mail to the support inbox left; and the setup asks a workspace made of a
 * person (setup_request's `setup.requested` events, 00439), read across workspaces for Home and Support.
 *
 * On the service role: the table is the service role's alone, and a report is written by the dashboard's route after
 * it checked the member belongs to the workspace the tab named. Each answers what the database answered.
 *
 * Cross-workspace: Support reads every workspace's reports and asks; only the Console's admin check reaches the reads.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "../../database.types";

type Db = SupabaseClient<Database>;

export type SupportReportInsert = Database["public"]["Tables"]["support_reports"]["Insert"];

const REPORT_COLUMNS =
  "id, number, tenant_id, email, page, error_id, error_name, error_message, words, created_at, mailed_at, mail_error, tenant:tenants(slug, name)";

/** A report kept: its id and its number, which the inbox's subject says. */
export async function fileReport(db: Db, row: SupportReportInsert) {
  return db.from("support_reports").insert(row).select("id, number").single();
}

/** Whether the mail to the inbox left, and when; or what refused it. */
export async function markReportMailed(db: Db, id: string, outcome: { at: string } | { error: string }) {
  return db
    .from("support_reports")
    .update("at" in outcome ? { mailed_at: outcome.at, mail_error: null } : { mail_error: outcome.error.slice(0, 300) })
    .eq("id", id);
}

/** Reports since `sinceIso` (or all), newest first, with their workspace's name. */
export async function listReports(db: Db, q: { sinceIso?: string; tenantId?: string; limit: number }) {
  let query = db
    .from("support_reports")
    .select(REPORT_COLUMNS)
    .order("created_at", { ascending: false })
    .limit(q.limit);
  if (q.sinceIso) query = query.gte("created_at", q.sinceIso);
  if (q.tenantId) query = query.eq("tenant_id", q.tenantId);
  return query;
}

/** One report as the support inbox is told it, read by its id and the member who sent it: never from a caller's body. */
export async function reportToMail(db: Db, id: string, userId: string) {
  return db.from("support_reports").select(REPORT_COLUMNS).eq("id", id).eq("user_id", userId).maybeSingle();
}

/** The setup asks since `sinceIso`, newest first: which workspace, what, when. */
export async function setupAsks(db: Db, q: { sinceIso: string; tenantId?: string; limit: number }) {
  let query = db
    .from("events")
    .select("tenant_id, data, created_at")
    .eq("kind", "setup.requested")
    .gte("created_at", q.sinceIso)
    .order("created_at", { ascending: false })
    .limit(q.limit);
  if (q.tenantId) query = query.eq("tenant_id", q.tenantId);
  return query;
}
