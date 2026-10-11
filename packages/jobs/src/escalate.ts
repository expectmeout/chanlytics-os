/**
 * Flagging a thread for a person, once per hold: the job handlers and the ledger's settle both do it, so it lives
 * apart from either. Here, rather than in handlers.ts, so that settling a job that died does not load the core.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { openEscalation, type Database } from "@chanlytics/db";
import { logger } from "@chanlytics/channels";

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
  // One door (00388 escalation_open): the row and its escalation.opened on the ledger, or the open one's reason or
  // words, in one transaction. The event used to be written after the insert, best effort, so a hold could be open with
  // nothing on the ledger saying so; and a hold resolved between the insert that found it and the update after came
  // back "refreshed", leaving the caller quiet about a thread nothing held.
  try {
    return await openEscalation(db, { tenantId, conversationId, reason, details });
  } catch (e) {
    logger().error("escalation_upsert_failed", {
      tenant_id: tenantId,
      conversation_id: conversationId,
      error: e instanceof Error ? e.message : String(e),
    });
    return "failed";
  }
}
