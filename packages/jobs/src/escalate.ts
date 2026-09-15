/**
 * Flagging a thread for a person, once per hold: the job handlers and the ledger's settle both do it, so it lives
 * apart from either. Here, rather than in handlers.ts, so that settling a job that died does not load the core.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@chanlytics/db";

/** How an escalation landed: a new open row, a refresh of the one already
 *  open on that thread, or nothing (the insert failed for another reason).
 *  Callers that alert a human use it to alert once per hold, not once per
 *  message. */
export type EscalationOutcome = "opened" | "refreshed" | "failed";

export async function upsertEscalation(
  db: SupabaseClient<Database>,
  tenantId: string,
  conversationId: string,
  reason: string,
  details: string,
): Promise<EscalationOutcome> {
  const { error } = await db.from("escalations").insert({
    tenant_id: tenantId, conversation_id: conversationId, reason, details,
  });
  if (!error) return "opened";
  if (error.code === "23505") {
    // one open escalation per conversation: repeat triggers refresh details.
    // A refresh that did not land must not come back as "refreshed": the caller
    // reads that as "the hold is already open and now says why" and stays quiet,
    // which is how a hold ends up open with a stale reason and nobody paged.
    const { error: refreshErr } = await db.from("escalations")
      .update({ details, reason })
      .eq("tenant_id", tenantId)
      .eq("conversation_id", conversationId)
      .eq("state", "open");
    if (refreshErr) {
      console.error("escalation_refresh_failed", refreshErr.message);
      return "failed";
    }
    return "refreshed";
  }
  console.error("escalation_upsert_failed", error.message);
  return "failed";
}
