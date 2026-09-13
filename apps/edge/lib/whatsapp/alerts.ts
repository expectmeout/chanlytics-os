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
  "no model": "the receptionist has no model to answer with",
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

const UNROUTABLE_WORDS = {
  whatsapp_unreadable: {
    subject: "WhatsApp messages are arriving and the control plane cannot be read",
    what: (key: string, count: number) =>
      `${count} message(s) just arrived for phone_number_id ${key} and the channel row could not be read, so they were NOT recorded and nobody was answered.`,
    // Deliberately not "re-enable the channel": the channel is probably fine.
    // Reported as its own kind so it also keeps its own suppression window —
    // sharing one with the switched-off alert let a database outage and a
    // deliberate switch-off silence each other for fifteen minutes, and the
    // two need opposite responses.
    fix: "Check Postgres and /api/diag. Meta is being told 503, so it redelivers for up to seven days and nothing is lost once the read works.",
  },
  whatsapp: {
    subject: "WhatsApp messages are arriving for a channel that is switched off",
    what: (key: string, count: number) =>
      `${count} message(s) just arrived for phone_number_id ${key}, which the control plane will not route (the channel row is missing or its status is not 'active').`,
    fix: "Re-enable the channel in tenant_channels, or confirm this number is not ours.",
  },
  sms: {
    subject: "A text arrived on a line the platform could not handle",
    what: (key: string, count: number) => `${count} text(s) just arrived for ${key} and could not be handled.`,
    fix: "Check the line row, its vault token and its sms channel row; the customer's text was NOT recorded.",
  },
  voice: {
    subject: "Calls are arriving for a voice channel that is switched off",
    what: (key: string, count: number) =>
      `${count} call(s) just arrived for agent ${key}, which the control plane will not route (the voice channel row is missing or its status is not 'active'); the receptionist picked up without the business's facts and the call was NOT recorded.`,
    fix: "Re-enable the voice channel in tenant_channels, or confirm this agent is not ours.",
  },
} as const;

export async function alertUnroutable(
  kind: keyof typeof UNROUTABLE_WORDS,
  key: string | undefined,
  count: number,
  why?: string,
  /**
   * What the fifteen-minute window is keyed on, when that is not the number.
   *
   * These were one argument, which is wrong wherever the identifier is chosen
   * by whoever sent the request: keying the window on it lets a caller rotate
   * the value and send one email per request, and keying the WORDS on a
   * constant instead leaves the operator an alert that names nothing they can
   * act on. The SMS door needs both — the number in the sentence, one window
   * for the whole class — so they are two arguments.
   */
  suppressAs?: string,
): Promise<void> {
  const k = `${kind}:${suppressAs || key || "unknown"}`;
  const last = unroutableAlerted.get(k) ?? 0;
  if (Date.now() - last < UNROUTABLE_ALERT_MS) return;
  unroutableAlerted.set(k, Date.now());
  const words = UNROUTABLE_WORDS[kind];
  // Genuinely platform-level: by definition there is no tenant to address, so
  // this is the PLATFORM's own mailbox and carries no customer content — only
  // the number, a count and the reason.
  const delivered = await notify(
    { tenantId: null, notifications: null, isEnvDefault: true },
    {
      subject: words.subject,
      body:
        `${words.what(key || "unknown", count)}${why ? ` Reason: ${why}.` : ""}\n\n` +
        `Nobody is answering these customers and nothing is being recorded. ${words.fix}\n\n` +
        `Further notices for this number are suppressed for 15 minutes.`,
    },
  );
  // The suppression window was claimed BEFORE the send, so a failed alert used
  // to buy 15 minutes of silence on the only warning that customers are being
  // dropped. Only a delivered notice earns the quiet.
  if (!delivered) unroutableAlerted.delete(k);
}

