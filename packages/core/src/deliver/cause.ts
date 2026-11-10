/**
 * Why a send did not leave, said once for every caller (decision 0114: a failure keeps what it knows, and says it in the
 * owner's words).
 */
import type { Channel, Delivered } from "./deliver";

/**
 * Why it did not leave, in words for the owner: a number with no credentials is not "HTTP 503". The one statement of it:
 * a queued reply's job (messages/send.ts) and the receptionist answering in its own turn (inbound/dispatch.ts) both say it
 * this way.
 */
export function causeOf(out: Extract<Delivered, { outcome: "failed" }>, channel: Channel): string {
  const limit = out.limit ?? null;
  // Named for the wire it was going out on: a text with no line is not a
  // WhatsApp number that failed.
  const notConnected =
    channel === "sms"
      ? "the texting line is not connected"
      : channel === "whatsapp"
        ? "the WhatsApp number is not connected"
        : `the ${channel} channel is not connected`;
  return out.reason === "no_credentials"
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
              : // Status 0 is no answer at all: no answer in time or a connection dropped after it left (it may have
                // gone), a connection that never opened, or the email wire refusing a request it will not send
                // (wire-senders.ts emailSender). The row keeps which; "HTTP 0" told an owner nothing.
                out.status === 0 && out.mayHaveGone
                ? "the provider did not answer, so it may have gone; check the thread before sending it again"
                : out.status === 0
                  ? "it never reached the provider"
                  : `HTTP ${out.status}`;
}
