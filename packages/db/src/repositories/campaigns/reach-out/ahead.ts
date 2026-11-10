/**
 * Whether a step's note is still owed (decision 0120, D7): the reply job writes the note a step arrives with (a not-now's
 * check-back on its day, a first note to the person a wrong person named) only while its step is open, nothing newer
 * came from them on the thread and the lead still stands. On the service role, as the reply's job reads everything.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { DbFailure } from "@chanlytics/contracts";
import type { Database } from "../../../types";
import type { TenantId } from "@chanlytics/contracts";

type Db = SupabaseClient<Database>;

/** What the job asks of one reading's note: the reply, its thread, the step it made, and when the reply arrived. */
export interface AheadAsked {
  tenantId: TenantId;
  messageId: string;
  conversationId: string;
  stepId: string;
  receivedAt: string;
}

/**
 * True while the note is owed: the step is there and not done, no message of theirs on the thread came after this reply,
 * and its lead is there, not erased, not taken out and not closed (said no, a customer). A read that fails throws.
 */
export async function findAheadOwed(db: Db, asked: AheadAsked): Promise<boolean> {
  const [step, newer, reading] = await Promise.all([
    db.from("person_notes").select("id, done_at").eq("tenant_id", asked.tenantId).eq("id", asked.stepId).maybeSingle(),
    db
      .from("messages")
      .select("id")
      .eq("tenant_id", asked.tenantId)
      .eq("conversation_id", asked.conversationId)
      .eq("direction", "inbound")
      .gt("created_at", asked.receivedAt)
      .neq("id", asked.messageId)
      .limit(1),
    db
      .from("sequence_replies")
      .select("lead_id")
      .eq("tenant_id", asked.tenantId)
      .eq("message_id", asked.messageId)
      .maybeSingle(),
  ]);
  if (step.error) throw new DbFailure(step.error, "cannot read the step a note is for");
  if (newer.error) throw new DbFailure(newer.error, "cannot read what came after the reply");
  if (reading.error) throw new DbFailure(reading.error, "cannot read the reply's reading");
  if (!step.data || step.data.done_at !== null || newer.data.length > 0) return false;
  const leadId = reading.data?.lead_id;
  if (!leadId) return false;
  const lead = await db
    .from("leads")
    .select("stage, closed_reason, erased_at, blanked_at")
    .eq("tenant_id", asked.tenantId)
    .eq("id", leadId)
    .maybeSingle();
  if (lead.error) throw new DbFailure(lead.error, "cannot read the lead a note is for");
  const l = lead.data;
  return !!l && l.erased_at === null && l.blanked_at === null && l.stage !== "archived" && l.closed_reason === null;
}
