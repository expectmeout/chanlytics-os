/**
 * The waitlist: the queue of people who asked for a place before any workspace exists for them. Four statements, as
 * the service role, each returning what the database answered with its error untouched, so the caller keeps its own
 * words: a repeat submission is told by the unique index's code (23505), which `joinWaitlist` reads.
 *
 * Cross-workspace: the waitlist has no tenant_id; nobody on it has a workspace to be scoped to, and the service role is
 * the only reader.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "./database.types";

/** A person asks for a place. The row is stored as given: the caller lower-cases the address the unique index reads. */
export async function addToWaitlist(
  db: SupabaseClient<Database>,
  row: Database["public"]["Tables"]["waitlist"]["Insert"],
) {
  return db.from("waitlist").insert(row);
}

/**
 * A repeat submission moves what they said and leaves their place in the queue (created_at) alone. A row already
 * invited is left entirely alone: a repeat is not a re-join.
 */
export async function refreshWaitlistRow(
  db: SupabaseClient<Database>,
  email: string,
  said: { business: string | null; source: string | null },
) {
  return db.from("waitlist").update(said).eq("email", email).is("invited_at", null);
}

/** Those still waiting, oldest first, and how many there are in all. */
export async function waitlistWaiting(db: SupabaseClient<Database>, limit: number) {
  return db
    .from("waitlist")
    .select("id, email, business, source, created_at", { count: "exact" })
    .is("invited_at", null)
    .order("created_at", { ascending: true })
    .limit(limit);
}

/** Records that somebody was invited, only while the row still waits, so two admins on one list do not both claim it. */
export async function markWaitlistInvited(db: SupabaseClient<Database>, id: string, by: string, at: string) {
  return db
    .from("waitlist")
    .update({ invited_at: at, invited_by: by })
    .eq("id", id)
    .is("invited_at", null)
    .select("id");
}
