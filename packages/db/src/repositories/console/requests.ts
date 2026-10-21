/**
 * The promise's clock (privacy_requests, 00466, decision 0066): a request the data-deletion page promises an answer to
 * within thirty days, filed by a person on the Console's staff as it came in, and its steps as each is done. On the
 * service role the dashboard's backOffice() hands out; each answers what the database answered.
 *
 * Cross-workspace: requests about any workspace, and about one already deleted; only the Console's admin check reaches them.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "../../database.types";

type Db = SupabaseClient<Database>;

export type PrivacyRequestInsert = Database["public"]["Tables"]["privacy_requests"]["Insert"];

const REQUEST_COLUMNS =
  "id, number, kind, tenant_id, slug, name, asked_by, asked_at, ticket, note, due_at, steps, closed_at, created_at";

/** A request filed: the row as kept. */
export async function fileRequest(db: Db, row: PrivacyRequestInsert) {
  return db.from("privacy_requests").insert(row).select(REQUEST_COLUMNS).single();
}

/** One request. */
export async function requestById(db: Db, id: string) {
  return db.from("privacy_requests").select(REQUEST_COLUMNS).eq("id", id).maybeSingle();
}

/**
 * A request's steps written whole, and closed when `closedAt` says so, only while it is still open and its steps are
 * still the ones the change was judged against (`was`): two people marking it at once cannot erase each other's step,
 * nor close it on steps one of them has just undone. The empty answer says it was closed or changed first.
 */
export async function setRequestSteps(
  db: Db,
  id: string,
  was: Database["public"]["Tables"]["privacy_requests"]["Row"]["steps"],
  steps: Record<string, string>,
  closedAt: string | null,
) {
  return db
    .from("privacy_requests")
    .update({ steps, ...(closedAt ? { closed_at: closedAt } : {}) })
    .eq("id", id)
    .is("closed_at", null)
    .filter("steps", "eq", JSON.stringify(was))
    .select(REQUEST_COLUMNS);
}

/** The open requests, the nearest due first, and those closed since `closedSinceIso`. */
export async function listRequests(db: Db, closedSinceIso: string, limit: number) {
  return db
    .from("privacy_requests")
    .select(REQUEST_COLUMNS)
    .or(`closed_at.is.null,closed_at.gte.${closedSinceIso}`)
    .order("due_at", { ascending: true })
    .limit(limit);
}
