/**
 * What members ask, and what came in (decisions 0066 and 0067): support_reports (00467, its kind 00468), written when a
 * member presses Send on Get help and marked once the mail to the support inbox left; the setup asks a workspace made
 * of a person (setup_request's `setup.requested` events, 00439), read across workspaces for Home and Support; who sent
 * each, by their membership and the name they gave; the team's marks on them (platform_acts); and the forwarding test
 * that finishes an ask for forwarding.
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
  "id, number, kind, tenant_id, user_id, email, page, error_id, error_name, error_message, words, created_at, mailed_at, mail_error, tenant:tenants(slug, name)";

/** Which reports a read takes: Support's (every kind but a bug), Health's (the bugs), or all. */
export type ReportSide = "support" | "health" | "all";

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

/** Reports since `sinceIso` (or all), newest first, with their workspace's name: Support's, Health's, or all. */
export async function listReports(
  db: Db,
  q: { sinceIso?: string; tenantId?: string; side?: ReportSide; limit: number },
) {
  let query = db
    .from("support_reports")
    .select(REPORT_COLUMNS)
    .order("created_at", { ascending: false })
    .limit(q.limit);
  if (q.sinceIso) query = query.gte("created_at", q.sinceIso);
  if (q.tenantId) query = query.eq("tenant_id", q.tenantId);
  if (q.side === "support") query = query.neq("kind", "wrong");
  if (q.side === "health") query = query.eq("kind", "wrong");
  return query;
}

/** How many bug reports came in since `sinceIso`: the line Support says of what went to Health. */
export async function countBugReports(db: Db, sinceIso: string) {
  return db
    .from("support_reports")
    .select("id", { count: "exact", head: true })
    .eq("kind", "wrong")
    .gte("created_at", sinceIso);
}

/** One report by its id, as the Console acts on it. */
export async function reportById(db: Db, id: string) {
  return db.from("support_reports").select(REPORT_COLUMNS).eq("id", id).maybeSingle();
}

/** A report moved between Support and Health: what the member needed, as the team judged it. */
export async function setReportKind(db: Db, id: string, kind: "how_to" | "setup" | "wrong" | "billing") {
  return db.from("support_reports").update({ kind }).eq("id", id).select("id").maybeSingle();
}

/** One report as the support inbox is told it, read by its id and the member who sent it: never from a caller's body. */
export async function reportToMail(db: Db, id: string, userId: string) {
  return db.from("support_reports").select(REPORT_COLUMNS).eq("id", id).eq("user_id", userId).maybeSingle();
}

/** The setup asks since `sinceIso`, newest first: the event, which workspace, what, when, and who asked. */
export async function setupAsks(db: Db, q: { sinceIso: string; tenantId?: string; limit: number }) {
  let query = db
    .from("events")
    .select("id, tenant_id, data, created_at")
    .eq("kind", "setup.requested")
    .gte("created_at", q.sinceIso)
    .order("created_at", { ascending: false })
    .limit(q.limit);
  if (q.tenantId) query = query.eq("tenant_id", q.tenantId);
  return query;
}

/** One setup ask by its event's id. */
export async function setupAskById(db: Db, id: string) {
  return db
    .from("events")
    .select("id, tenant_id, data, created_at")
    .eq("id", id)
    .eq("kind", "setup.requested")
    .maybeSingle();
}

/** Who these people are in their workspaces: each membership's role and since when, and the name each gave. */
export async function supportPeople(db: Db, userIds: readonly string[]) {
  const [members, profiles] = await Promise.all([
    db
      .from("memberships")
      .select("user_id, tenant_id, role, created_at")
      .in("user_id", [...userIds]),
    db
      .from("profiles")
      .select("user_id, display_name")
      .in("user_id", [...userIds]),
  ]);
  return { members, profiles };
}

/** A person's sign-in address, from the platform's identity store: an ask names who asked by their id alone. */
export async function personEmail(db: Db, userId: string): Promise<string | null> {
  const { data, error } = await db.auth.admin.getUserById(userId);
  return error ? null : (data.user?.email ?? null);
}

/** The team's marks on questions and asks since `sinceIso`: the acts that ran to their end, newest first. */
export async function supportMarks(db: Db, q: { sinceIso: string; limit: number }) {
  return db
    .from("platform_acts")
    .select("act, target_kind, target_id, at, actor_email")
    .in("target_kind", ["report", "ask"])
    .eq("outcome", "done")
    .gte("at", q.sinceIso)
    .order("at", { ascending: false })
    .limit(q.limit);
}

/** The forwarded numbers that passed their test call, of these workspaces, and since when. */
export async function forwardingVerified(db: Db, tenantIds: readonly string[]) {
  return db
    .from("lines")
    .select("tenant_id, state_since")
    .eq("kind", "forwarded")
    .eq("forwarding_state", "verified")
    .in("tenant_id", [...tenantIds]);
}
