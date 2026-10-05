/**
 * A failure the provider reports after it took the message: the edge's wiring of core's raiseLateFailure, for the two
 * wires whose status webhooks say it (WhatsApp's receipts, lib/whatsapp/receipts.ts; Twilio's status callback,
 * lib/sms/sms-status.ts). An email's receipt flags its own thread (lib/email/email-receipts.ts).
 *
 * The rule is core's (messages/late-failure.ts): the same hold and the same bell a send that fails at the wire raises,
 * once per message. What is here is the runtime's half: the message is read by the provider's id, the thread is flagged
 * through the one escalation writer (jobs upsertEscalation), the owner is told through the one way a job tells them
 * (ops/job-alert.ts alertFor, which decides who may read what), and the ledger says it. Called BEFORE the row is moved
 * to failed, so a flag that cannot be written throws, the row is untouched, and the provider's redelivery tries again.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { emitEvent, messageByExternalId, type Database } from "../packages/db.js";
import { raiseLateFailure, type LateFailureCommand, type LateFailureOutcome } from "../packages/core.js";
import { upsertEscalation } from "../packages/jobs.js";
import { alertFor } from "../ops/job-alert.js";

export async function flagLateFailure(
  db: SupabaseClient<Database>,
  tenantId: string,
  cmd: LateFailureCommand,
): Promise<LateFailureOutcome> {
  return raiseLateFailure(
    {
      message: (externalId) => messageByExternalId(db, tenantId, externalId),
      escalate: (conversationId, reason, details) => upsertEscalation(db, tenantId, conversationId, reason, details),
      // It is an outbound send's news, told as the send's own is: "outbound_send" names it to the platform when the
      // workspace cannot be addressed (job-alert.ts's redacted notice).
      alert: alertFor(db, { tenant_id: tenantId, kind: "outbound_send" }),
      noteFailed: (messageId, data) => emitEvent(db, tenantId, "message.send_failed", "message", messageId, data),
    },
    cmd,
  );
}
