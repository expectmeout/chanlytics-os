import type { Channel } from "../deliver";
import type { SendQueuedPorts } from "./ports";

export interface SendQueuedCommand {
  tenantId: string;
  payload: { message_id: string; conversation_id: string; to_phone: string; body?: string; template?: { name: string; language: string; params: string[] } };
}

/**
 * outbound_send: the honest undo — the message sat status='queued' through
 * its cancel window; if it is STILL queued, send it through the door and
 * finalize. The door re-reads the person's consent with this message's
 * purpose, the thread's pause and the workspace's status at the wire; what is
 * here is the outbox's own business: whether the row is still there to send,
 * which yes its template needs, and who is told when the wire could not
 * carry it.
 */
export async function sendQueued(ports: SendQueuedPorts, cmd: SendQueuedCommand): Promise<void> {
  const p = cmd.payload;
  let msg: Awaited<ReturnType<SendQueuedPorts["queued"]>>;
  try {
    msg = await ports.queued(p.message_id);
  } catch (e) {
    // Throw: the tick fails the job, settles the message and tells the tenant,
    // so it is visibly stuck rather than invisibly lost.
    throw new Error(`outbound_send: cannot read message ${p.message_id}: ${e instanceof Error ? e.message : String(e)}`);
  }
  if (!msg || msg.status !== "queued") return; // canceled or already handled: no-op
  // Which yes this send needs. Never proactive: everything on this queue
  // answers a thread that exists.
  const purpose = await ports.purposeOf(p.template);
  // A channel this runtime has no wire for finds none at the door and fails
  // loudly, leaving the customer un-messaged rather than reached over the
  // wrong wire.
  const channel = (msg.channel ?? "whatsapp") as Channel;
  const out = await ports.deliver({
    tenantId: cmd.tenantId,
    conversationId: p.conversation_id,
    contactId: null,
    to: p.to_phone,
    channel,
    // Read from the ROW, not hardcoded: under a veto window the receptionist's
    // own reply travels this path, and stamping every send "human" would make
    // the metrics report a bot's words as a person's.
    sender: (msg.sender ?? "human") as "ai" | "human" | "system",
    purpose,
    proactive: false,
    body: p.body ?? msg.body ?? "",
    template: p.template,
    messageId: p.message_id,
  });
  if (out.outcome !== "failed") return;
  // A 401 or 403 from the provider is the platform's problem, not this
  // thread's: the credentials are wrong for every send on this wire.
  if (out.reason === "provider" && (out.status === 401 || out.status === 403)) {
    await ports.page?.(`provider_auth:${channel}`, `${channel} rejected a send with ${out.status}`, `Tenant ${cmd.tenantId}, message ${p.message_id}. Credentials, not content.`);
  }
  // The wire could not carry it: the thread is flagged for a person and the
  // owner told. A refusal needs neither; the row says why.
  await ports.escalate(p.conversation_id, "send_failed", `Dashboard reply could not be delivered (HTTP ${out.status}).`);
  await ports.alert(`Reply delivery failed: ${p.to_phone}`, `A reply queued from the dashboard could not be sent (HTTP ${out.status}). The thread is flagged in the Inbox.`);
}
