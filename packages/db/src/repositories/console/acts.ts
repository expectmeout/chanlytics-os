/**
 * The Admin log (platform_acts, 00466, decision 0066): every act the Console's staff take, written before it runs, then
 * what came of it. Three statements, on the service role the dashboard's backOffice() hands out: a row in, its outcome,
 * and a page of the log. Nothing here deletes a row.
 *
 * Cross-workspace: the Console's own log; the service-role client exists only behind backOffice(ctx)'s admin check.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "../../database.types";

type Db = SupabaseClient<Database>;

export type PlatformActInsert = Database["public"]["Tables"]["platform_acts"]["Insert"];

const ACT_COLUMNS =
  "id, at, actor_id, actor_email, actor_role, act, tenant_id, target_kind, target_id, reason_kind, ticket, note, outcome, outcome_note, finished_at, tenant:tenants(slug, name)";

/** An act written down before it runs: its id, or the error that means it must not run. */
export async function startAct(db: Db, row: PlatformActInsert) {
  return db.from("platform_acts").insert(row).select("id").single();
}

/** What came of an act, once: a row already finished is left as it was. */
export async function finishAct(
  db: Db,
  id: string,
  outcome: "done" | "refused" | "failed",
  note: string | null,
  atIso: string,
) {
  return db
    .from("platform_acts")
    .update({ outcome, outcome_note: note ? note.slice(0, 500) : null, finished_at: atIso })
    .eq("id", id)
    .eq("outcome", "running");
}

/** A page of the log, newest first: everyone's or one person's, one workspace's or all, older than `before`. */
export async function listActs(db: Db, q: { who?: string; tenantId?: string; before?: string; limit: number }) {
  let query = db.from("platform_acts").select(ACT_COLUMNS).order("at", { ascending: false }).limit(q.limit);
  if (q.who) query = query.eq("actor_id", q.who);
  if (q.tenantId) query = query.eq("tenant_id", q.tenantId);
  if (q.before) query = query.lt("at", q.before);
  return query;
}
