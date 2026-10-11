/**
 * A failure the provider reports after it took the message: the edge's wiring of core's raiseLateFailure, for the two
 * wires whose status webhooks say it (WhatsApp's receipts, lib/whatsapp/receipts.ts; Twilio's status callback,
 * lib/sms/sms-status.ts). An email's receipt flags its own thread (lib/email/email-receipts.ts).
 *
 * The rule is core's (messages/late-failure.ts): the same hold a send that fails at the wire raises, once per message.
 * What is here is the runtime's half: the message is read by the provider's id, the thread is flagged through the one
 * escalation writer (jobs upsertEscalation), whose event tells the owner (core SUBSCRIBERS.owner_notice, decision 0043),
 * and the ledger says it. Called BEFORE the row is moved to failed, so a flag that cannot be written throws, the row is
 * untouched, and the provider's redelivery tries again.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { emitEvent, messageByExternalId, type Database } from "../packages/db.js";
import { raiseLateFailure, type LateFailureCommand, type LateFailureOutcome } from "../packages/core.js";
import { upsertEscalation } from "../packages/jobs.js";

export async function flagLateFailure(
  db: SupabaseClient<Database>,
  tenantId: string,
  cmd: LateFailureCommand,
): Promise<LateFailureOutcome> {
  return raiseLateFailure(
    {
      message: (externalId) => messageByExternalId(db, tenantId, externalId),
      escalate: (conversationId, reason, details) => upsertEscalation(db, tenantId, conversationId, reason, details),
      noteFailed: (messageId, data) => emitEvent(db, tenantId, "message.send_failed", "message", messageId, data),
    },
    cmd,
  );
}
