/**
 * The people who are told: the workspace (a handoff that names the thread)
 * and the platform (traffic for a channel nobody routes). The customer is
 * texted through the one door, deliver() in packages/core, from the sink.
 */
import { notify, type NotifyTarget } from "../notify.js";
import { formatPhoneDisplay } from "../workspace/contracts.js";

/**
 * The customer's own words travel in this email, so it goes only to an address
 * we know belongs to THIS tenant. `notify` decides that; a workspace we cannot
 * address gets a redacted platform notice rather than someone else's mailbox.
 */
/** The reasons the handler names, in the owner's words. Anything else is said as it came. */
const REASON_WORDS: Record<string, string> = {
  "passed to a human": "asked for a person",
  "assistant flagged handoff": "the receptionist asked for a person",
  "assistant flagged handoff (reply held for review)": "a reply is waiting for your review",
  "non-text message": "sent a photo or a voice note",
  "opt-out": "asked to stop",
  "state unavailable": "the receptionist could not read the thread",
  "late message": "arrived too late to answer automatically",
  "rate cap": "the receptionist reached its daily limit",
  budget: "the day's model budget is used up",
  wa_send_failed: "the reply failed to send",
  carriers: "texted before the carriers approved the line",
};

export async function alertStaff(
  threadId: string,
  userText: string,
  botText: string,
  reason: string,
  target: NotifyTarget,
  pauseHours = 24,
  /** Where the bell sends the reader: the thread when it is known, else the Inbox. */
  route = "inbox",
  /** The customer's name when the channel gave one; the number stands in otherwise. */
  who: string | null = null,
  /** The conversation the row is about, so the bell can say a thing once. */
  about: { type: string; id: string } | null = null,
): Promise<void> {
  const name = who?.trim() || formatPhoneDisplay(`+${threadId}`) || `+${threadId}`;
  const why = REASON_WORDS[reason] ?? reason;
  await notify(target, {
    kind: "handoff",
    route,
    about,
    subject: `${name} needs a person — ${why}`,
    body:
      `They wrote: “${userText}”\n` +
      `${botText}\n\n` +
      `WhatsApp · +${threadId}\n` +
      `Reply from the Inbox — the receptionist is paused on this thread for ${pauseHours}h.`,
    redactedBody: `A WhatsApp conversation needed a person (${why}), and nobody could be told.`,
  });
}

/**
 * Traffic arrived for a channel the control plane will not route. Customers are
 * texting a live number and nobody is answering, so this must reach a human —
 * but one email per inbound message would be its own outage, so it is throttled
 * per phone number id. The window is per lambda instance, which is imprecise in
 * the right direction: a burst across instances sends a few notes, not none.
 */
const UNROUTABLE_ALERT_MS = 15 * 60 * 1000;
const unroutableAlerted = new Map<string, number>();

export async function alertUnroutable(phoneNumberId: string | undefined, count: number): Promise<void> {
  const key = phoneNumberId || "unknown";
  const last = unroutableAlerted.get(key) ?? 0;
  if (Date.now() - last < UNROUTABLE_ALERT_MS) return;
  // Genuinely platform-level: by definition there is no tenant to address, so
  // this is the PLATFORM's own mailbox and carries no customer content — only
  // the phone number id and a count.
  const delivered = await notify(
    { tenantId: null, notifications: null, isEnvDefault: true },
    {
      subject: "WhatsApp messages are arriving for a channel that is switched off",
      body:
        `${count} message(s) just arrived for phone_number_id ${key}, which the control plane will not route ` +
        `(the channel row is missing or its status is not 'active').\n\n` +
        `Nobody is answering these customers and nothing is being recorded. ` +
        `Re-enable the channel in tenant_channels, or confirm this number is not ours.\n\n` +
        `Further notices for this number are suppressed for 15 minutes.`,
    },
  );
  // The suppression window was claimed BEFORE the send, so a failed alert used
  // to buy 15 minutes of silence on the only warning that customers are being
  // dropped. Only a delivered notice earns the quiet.
  if (!delivered) unroutableAlerted.delete(key);
}

