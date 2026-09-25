import type { SendPurpose } from "@chanlytics/contracts";
import type { Channel } from "../deliver";
import type { SendQueuedPorts } from "./ports";

export interface SendQueuedCommand {
  tenantId: string;
  /** `to_phone` on a phone's wire, `to_email` on email's: an address never travels in a field read as a number. */
  payload: {
    message_id: string;
    conversation_id: string;
    to_phone?: string;
    to_email?: string;
    body?: string;
    template?: { name: string; language: string; params: string[] };
    /**
     * What the send IS, when the job knows better than a template can: an offer is marketing whatever its words, and a
     * first email starts a conversation. Both can only make the door stricter: a payload never makes a template's
     * purpose looser, and only `true` makes a send proactive. "outreach" (a cold email, Reach out) is its own lane,
     * which the door holds to its own rules.
     */
    purpose?: SendPurpose;
    proactive?: boolean;
  };
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
    throw new Error(
      `outbound_send: cannot read message ${p.message_id}: ${e instanceof Error ? e.message : String(e)}`,
    );
  }
  if (!msg || msg.status !== "queued") return; // canceled or already handled: no-op
  // Which yes this send needs: the template's, as Meta has it, or stricter when the job says the words are an offer.
  // A payload is our own code's word, and our own code is not the authority on a template's category, so it can only
  // tighten. Proactive likewise: only a job that says so starts a conversation; everything else on this queue answers
  // a thread that exists.
  const fromTemplate = await ports.purposeOf(p.template);
  // Outreach is its own lane (a cold email to a business the finder found): it loosens nothing, because the door
  // refuses it anywhere outside its own rules (email only, a lead, an unsubscribe, an own verified domain).
  const purpose: SendPurpose =
    p.purpose === "outreach" ? "outreach" : p.purpose === "marketing" ? "marketing" : fromTemplate;
  // A channel this runtime has no wire for finds none at the door and fails
  // loudly, leaving the customer un-messaged rather than reached over the
  // wrong wire.
  const channel = (msg.channel ?? "whatsapp") as Channel;
  const to = channel === "email" ? p.to_email : p.to_phone;
  // A job that does not say where its words go was scheduled wrongly: it fails, and the tick settles the row and tells the owner.
  if (!to)
    throw new Error(
      `outbound_send: message ${p.message_id} goes out by ${channel} and the job names no ${channel === "email" ? "address" : "number"}`,
    );
  const out = await ports.deliver({
    tenantId: cmd.tenantId,
    conversationId: p.conversation_id,
    contactId: null,
    to,
    channel,
    // Read from the ROW, not hardcoded: under a veto window the receptionist's
    // own reply travels this path, and stamping every send "human" would make
    // the metrics report a bot's words as a person's.
    sender: (msg.sender ?? "human") as "ai" | "human" | "system",
    purpose,
    proactive: p.proactive === true,
    body: p.body ?? msg.body ?? "",
    template: p.template,
    // The request the row was queued with, sent as it was frozen. A row without one fails at the wire, by name.
    ...(msg.email ? { email: msg.email } : {}),
    messageId: p.message_id,
  });
  if (out.outcome !== "failed") return;
  // A limit at the mail provider (named by the door, deliver.ts) is not this thread's fault either. A used-up day or
  // month stops every workspace's email on the key, so it is recorded for the platform (provider_quota:email, shown on
  // /api/diag); the page's own mail rides the same key and cannot leave until the quota resets. "Slow down" is one
  // second's problem, and a try still in flight may yet arrive: neither pages anyone.
  const limit = out.limit ?? null;
  // Cold email leaves through an account of its own (deliver.ts emailSender), so its limits and its key are paged
  // under their own name, and say what they do not stop.
  const outreach = channel === "email" && purpose === "outreach";
  if (limit === "daily" || limit === "monthly") {
    await ports.page?.(
      outreach ? "provider_quota:email_outreach" : "provider_quota:email",
      `${outreach ? "cold email" : "email"}: the ${limit} sending limit is used up`,
      outreach
        ? `Tenant ${cmd.tenantId}, message ${p.message_id}. Cold email is refused until it resets. Replies and reminders are not affected.`
        : `Tenant ${cmd.tenantId}, message ${p.message_id}. Every workspace's email is refused until it resets or the plan grows.`,
    );
  }
  // A 401 or 403 from the provider is the platform's problem, not this
  // thread's: the credentials are wrong for every send on this wire.
  // A 403 that names a domain is the provider refusing to send from one that stopped verifying at its end: the domain's
  // fact, which the domains sweep holds, never our credentials.
  const domainRefused = channel === "email" && out.status === 403 && /domain/i.test(out.errorBody ?? "");
  if (out.reason === "provider" && (out.status === 401 || (out.status === 403 && !domainRefused))) {
    await ports.page?.(
      `provider_auth:${outreach ? "email_outreach" : channel}`,
      `${channel} rejected a send with ${out.status}`,
      `Tenant ${cmd.tenantId}, message ${p.message_id}. Credentials, not content.`,
    );
  }
  // A cold email's failure is its run's to report, once (Part 3), and its row already says it: never a flag on a thread
  // nobody has opened, or an owner alert per email of a run.
  if (outreach) return;
  // The wire could not carry it: the thread is flagged for a person and the
  // owner told, in words that say whose reply it was and what stopped it --
  // a number with no credentials is not "HTTP 503". A refusal needs neither;
  // the row says why.
  // Named for the wire it was going out on: a text with no line is not a
  // WhatsApp number that failed.
  const notConnected =
    channel === "sms"
      ? "the texting line is not connected"
      : channel === "whatsapp"
        ? "the WhatsApp number is not connected"
        : `the ${channel} channel is not connected`;
  const cause =
    out.reason === "no_credentials"
      ? notConnected
      : out.reason === "no_sender_for_channel"
        ? `this runtime has no ${channel} line`
        : out.reason === "wire_unreadable"
          ? "the thread could not be read at the wire"
          : limit === "daily" || limit === "monthly"
            ? "the mail provider's sending limit is used up for now"
            : limit === "rate"
              ? "the mail provider asked us to slow down"
              : limit === "in_flight"
                ? "the mail provider is still sending an earlier try of it; check the thread before sending it again"
                : // Status 0 is no answer at all: the network failed, or the email wire refused a request it will not send
                  // (deliver.ts emailSender). The row keeps which; "HTTP 0" told an owner nothing.
                  out.status === 0
                  ? "it never reached the provider"
                  : `HTTP ${out.status}`;
  const receptionist = msg.sender === "ai";
  await ports.escalate(
    p.conversation_id,
    "send_failed",
    `${receptionist ? "The receptionist's reply" : "Dashboard reply"} could not be delivered (${cause}).`,
  );
  // The line above just flagged the thread, so this is a conversation that
  // needs a person: the same thing a WhatsApp handoff is, drawn the same way,
  // and its button opens THAT thread rather than the Inbox's front page. The
  // job itself completes; it never was "a job did not finish". (Today drops an
  // away-row whose conversation the queue already shows, so this row usually
  // appears only as the thread at the top of the page, which is where it is.)
  await ports.alert({
    kind: "handoff",
    route: `inbox/th-${p.conversation_id}`,
    about: { type: "conversation", id: p.conversation_id },
    subject: `Reply delivery failed: ${to}`,
    body: `${receptionist ? "A reply the receptionist queued" : "A reply queued from the dashboard"} could not be sent (${cause}). The thread is flagged in the Inbox.`,
  });
}
