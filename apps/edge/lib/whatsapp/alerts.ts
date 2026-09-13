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
  // The handler passes these four too, and each used to reach the subject line
  // as its raw internal token: "Jane Smith needs a person — location". The map
  // is the one place these are translated, so it has to hold every reason its
  // callers name.
  location: "shared a location",
  contacts: "sent a contact card",
  paused: "the workspace is paused",
  "message not recorded": "their message could not be recorded",
  "opt-in not confirmed": "the confirmation of their yes could not be sent",
};

/**
 * Everything about the handoff other than the words: who is told, on which
 * wire the conversation is, where the bell sends the reader, and whether this
 * branch actually took the receptionist out of the thread.
 *
 * An object rather than five more positional arguments, because the handler
 * repeated the same tail at a dozen call sites and every new fact here meant
 * a dozen edits -- which is how `channel` came to be known at every one of
 * them and stated at none.
 */
export interface HandoffContext {
  target: NotifyTarget;
  /** The wire the customer wrote on. WhatsApp unless the text came in on a carrier's. */
  channel?: "whatsapp" | "sms";
  /**
   * How long the receptionist is out of this thread, when THIS branch paused
   * it. Null is the common case and must stay the default: the email used to
   * promise a pause unconditionally, so an owner told "the receptionist is
   * paused on this thread for 24h" by a branch that paused nothing took their
   * time replying and the bot answered the customer's next message on top of
   * them.
   */
  pausedHours?: number | null;
  /** Where the bell sends the reader: the thread when it is known, else the Inbox. */
  route?: string;
  /** The customer's name when the channel gave one; the number stands in otherwise. */
  who?: string | null;
  /** The conversation the row is about, so the bell can say a thing once. */
  about?: { type: string; id: string } | null;
}

export async function alertStaff(
  threadId: string,
  userText: string,
  botText: string,
  reason: string,
  ctx: HandoffContext,
): Promise<void> {
  const name = ctx.who?.trim() || formatPhoneDisplay(`+${threadId}`) || `+${threadId}`;
  const why = REASON_WORDS[reason] ?? reason;
  // The owner of a workspace with both wires connected opens the thread this
  // names. Saying "WhatsApp" for a text sends them to an app the conversation
  // is not in.
  const where = ctx.channel === "sms" ? "Text" : "WhatsApp";
  await notify(ctx.target, {
    kind: "handoff",
    route: ctx.route ?? "inbox",
    about: ctx.about ?? null,
    subject: `${name} needs a person — ${why}`,
    body:
      `They wrote: “${userText}”\n` +
      `${botText}\n\n` +
      `${where} · +${threadId}\n` +
      (ctx.pausedHours
        ? `Reply from the Inbox — the receptionist is paused on this thread for ${ctx.pausedHours}h.`
        : `Reply from the Inbox.`),
    redactedBody: `A ${where.toLowerCase()} conversation needed a person (${why}), and nobody could be told.`,
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

export async function alertUnroutable(kind: keyof typeof UNROUTABLE_WORDS, key: string | undefined, count: number, why?: string): Promise<void> {
  const k = `${kind}:${key || "unknown"}`;
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

