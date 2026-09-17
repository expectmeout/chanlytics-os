/**
 * Flagging a thread for a person, once per hold: the job handlers and the ledger's settle both do it, so it lives
 * apart from either. Here, rather than in handlers.ts, so that settling a job that died does not load the core.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@chanlytics/db";

/**
 * How an escalation landed.
 *
 *   opened     a new open row: nobody was waiting on this thread before.
 *   changed    a thread already waiting, for a DIFFERENT reason, which this
 *              one has now replaced.
 *   refreshed  the same reason saying itself again, with newer words.
 *   failed     nothing was written.
 *
 * `changed` exists because a thread has exactly one open escalation, so a
 * second reason overwrites the first -- and every caller that alerts only on
 * `opened` therefore said NOTHING when the reason a person was needed for
 * changed underneath them. An email arriving on a thread held for the carriers
 * was the case that showed it, but it was never an email bug: it was true of
 * every caller of this function.
 *
 * Callers that alert a human alert once per HOLD, not once per message -- and
 * a hold that now means something else is a different hold.
 */
export type EscalationOutcome = "opened" | "changed" | "refreshed" | "failed";

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
    // One open escalation per conversation, so this thread already has one.
    // Whether it said something ELSE is the whole question: asked as an update
    // that only matches a different reason, so the answer is a row count rather
    // than a read and a write with a gap between them.
    const { data: replaced, error: changeErr } = await db.from("escalations")
      .update({ details, reason })
      .eq("tenant_id", tenantId)
      .eq("conversation_id", conversationId)
      .eq("state", "open")
      .neq("reason", reason)
      .select("id");
    if (changeErr) {
      console.error("escalation_change_failed", changeErr.message);
      return "failed";
    }
    if (replaced && replaced.length > 0) return "changed";
    // The same reason, saying itself again: only the words move.
    //
    // A refresh that did not land must not come back as "refreshed": the caller
    // reads that as "the hold is already open and now says why" and stays quiet,
    // which is how a hold ends up open with a stale reason and nobody paged.
    const { error: refreshErr } = await db.from("escalations")
      .update({ details })
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
