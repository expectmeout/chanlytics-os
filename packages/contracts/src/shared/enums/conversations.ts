/** The closed sets of a conversation's: the wires, the messages, their states, the escalations and the templates. Held to their columns as every set is (shared/enums.ts). */
export const CHANNEL_KINDS = ["whatsapp", "voice", "sms", "email", "instagram"] as const;
export type ChannelKind = (typeof CHANNEL_KINDS)[number];

/**
 * How sure the door that kept an identity was of it (decision 0034, 00342): observed, they wrote to us on that wire;
 * asserted, a member typed it; found, the finder or a feed named it. A stronger word replaces a weaker one, never the
 * reverse, and resolution prefers them in that order.
 */
export const IDENTITY_ASSURANCES = ["observed", "asserted", "found"] as const;
export type IdentityAssurance = (typeof IDENTITY_ASSURANCES)[number];

export const CONVERSATION_STATES = ["open", "needs_human", "snoozed", "archived"] as const;
export type ConversationState = (typeof CONVERSATION_STATES)[number];

export const MESSAGE_CHANNELS = ["whatsapp", "voice", "sms", "email", "system", "instagram"] as const;
export type MessageChannel = (typeof MESSAGE_CHANNELS)[number];

export const MESSAGE_DIRECTIONS = ["inbound", "outbound"] as const;
export type MessageDirection = (typeof MESSAGE_DIRECTIONS)[number];

export const MESSAGE_SENDERS = ["customer", "ai", "human", "system"] as const;
export type MessageSender = (typeof MESSAGE_SENDERS)[number];

export const MESSAGE_TYPES = ["text", "template", "media", "call_summary", "note"] as const;
export type MessageType = (typeof MESSAGE_TYPES)[number];

export const MESSAGE_STATUSES = ["received", "queued", "sent", "delivered", "read", "failed", "canceled"] as const;
export type MessageStatus = (typeof MESSAGE_STATUSES)[number];

export const ESCALATION_REASONS = [
  "human_token",
  "non_text",
  "refusal",
  "rate_cap",
  "policy_block",
  "send_failed",
  "deadman",
  "brain_error",
  "manual",
  "opt_out",
  "state_unavailable",
  /** Delivered so late that an automated reply would arrive out of nowhere. */
  "stale",
  /** The owner set the receptionist to Ask or Never for THIS person; the
   *  thread is theirs to answer. A choice about one customer, never a
   *  workspace setting. */
  "person_hold",
  /** The workspace's day of model tokens is spent (limits.max_llm_tokens_day). */
  "budget",
  /** A booking or a service/pricing question, with that class set to Ask me first on the Autonomy pane: a person answers. */
  "policy_ask",
  /** The phone receptionist could not finish the call: a person calls them back. What to do rides in the details. */
  "callback",
  /** The workspace is paused (billing): calls only take a message and messages wait for a person, until it resumes. */
  "paused",
  /** A text arrived on a line the carriers have not approved for texting yet: kept, a person answers. */
  "carriers",
  /** An email a person must read before anyone answers it (00127). */
  "email_review",
  /** A time the customer picked by text, held for the owner to confirm (00443, decision 0061): Booked it or Can't. */
  "booking_request",
  /**
   * A time the customer asked for by text that a person answers (00443, decision 0061): the owner said Can't, or the
   * time was not one the code found open, or the request could not be kept. The receptionist told them the team will
   * confirm, so a reply is owed.
   */
  "booking_reply",
  /** The customer wrote while a person had the thread: held for them, never in another hold's place (00454). */
  "wrote_while_held",
] as const;
export type EscalationReason = (typeof ESCALATION_REASONS)[number];

export const ESCALATION_STATES = ["open", "resolved"] as const;
export type EscalationState = (typeof ESCALATION_STATES)[number];

export const TEMPLATE_STATUSES = ["approved", "pending", "rejected", "paused", "disabled"] as const;
export type TemplateStatus = (typeof TEMPLATE_STATUSES)[number];
