import { isAutomatedSend, sendFailureWords } from "@chanlytics/contracts";
import { raiseSendFailed } from "./send";
import { toldFromItsEvent } from "../subscribers";

/** What a late failure needs to know of the message the provider's id names. */
export interface LateFailureFacts {
  messageId: string;
  conversationId: string;
  /** customer, ai, human or system. */
  sender: string;
  /** inbound or outbound: a receipt is about a message of ours. */
  direction: string;
  /** What the row says now. */
  status: string;
  /** The row's meta, as stored: what a campaign's send is read from. */
  meta: unknown;
}

export interface LateFailurePorts {
  /** The message of this workspace the provider's id names, as it stands; null when none is. Throws when it cannot be read. */
  message(externalId: string): Promise<LateFailureFacts | null>;
  /** The thread flagged for a person, once per hold (jobs upsertEscalation); how it landed. */
  escalate(
    conversationId: string,
    reason: string,
    details: string,
  ): Promise<"opened" | "changed" | "refreshed" | "failed">;
  /** `message.send_failed` on the ledger, best effort: the Activity feed and the platform's day count it. */
  noteFailed(messageId: string, data: { reason: string; outcome: "refused"; body: string }): Promise<void>;
}

export interface LateFailureCommand {
  /** The provider's id for the message: Meta's wamid, Twilio's message sid. */
  externalId: string;
  /** The wire it went out on, which says which provider's code the error holds. */
  channel: "whatsapp" | "sms";
  /** What the receipt said, as the row will keep it (messages.error). */
  error: Record<string, unknown>;
}

/**
 * What a late failure came to: `raised` (the thread flagged, which its event tells the owner of, and the ledger
 * written), or nothing was owed:
 * `not_ours` (no message of this workspace carries the id), `not_a_reply` (not a message a person or the receptionist
 * wrote to a customer, or a campaign's), `already_over` (the row had already failed or been canceled: a receipt seen
 * before).
 */
export type LateFailureOutcome = "raised" | "not_ours" | "not_a_reply" | "already_over";

/**
 * A message the provider took and then reported it did not deliver: the hold and the bell a send that fails at the wire
 * already raises (send.ts sayItFailed), for the failure the provider says LATER, in its receipt.
 *
 * WhatsApp's status webhook and Twilio's status callback both say `failed` (or `undelivered`) about a message they
 * accepted a moment before, and until this the row learned it and nobody else did: the thread read as answered, the
 * bell stayed quiet, and the customer waited on a reply that never arrived. An email receipt flags its thread
 * already (edge email-receipts.ts); this is the same rule for the other two wires, said once, in the same words the
 * send says it (raiseSendFailed).
 *
 * Whose failure it is, by the one predicate every reader of a campaign asks (contracts isAutomatedSend): a reply the
 * receptionist or a person wrote, to a customer. A broadcast's, a playbook's or a reach-out step's send is its run's to
 * count, on its own row, and flags no thread nobody wrote on (Reach out D4).
 *
 * Once per message, not once per receipt: the row says whether this is the first. A message already failed (or canceled,
 * which a failure cannot move: messages_guard) is a receipt seen before, and raises nothing. The caller flags BEFORE it
 * moves the row to failed, as an email's receipt does, so a flag that could not be written (this throws) leaves the row
 * as it was and the receipt comes again.
 */
export async function raiseLateFailure(ports: LateFailurePorts, cmd: LateFailureCommand): Promise<LateFailureOutcome> {
  const m = await ports.message(cmd.externalId);
  if (!m) return "not_ours";
  if (m.direction !== "outbound" || (m.sender !== "ai" && m.sender !== "human") || isAutomatedSend(m.meta))
    return "not_a_reply";
  if (m.status === "failed" || m.status === "canceled") return "already_over";

  const why = sendFailureWords(cmd.error, cmd.channel) ?? "The provider reported it as not delivered.";
  const who = m.sender === "ai" ? "The receptionist's reply" : "A reply from your team";
  // The hold is the one thing that must not be lost: written, its event tells the owner, once, after the commit and out
  // of the provider's request (decision 0043); a flag that could not be written throws, and the receipt's redelivery
  // says it again.
  const flagged = await raiseSendFailed(ports, {
    conversationId: m.conversationId,
    details: `${who} was accepted for sending but did not reach them. ${why}`,
  });
  if (!toldFromItsEvent(flagged)) throw new Error(`send failed: its thread ${m.conversationId} could not be flagged`);
  await ports.noteFailed(m.messageId, {
    reason: "receipt",
    outcome: "refused",
    body: JSON.stringify(cmd.error).slice(0, 500),
  });
  return "raised";
}
