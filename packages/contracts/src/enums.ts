/**
 * Closed sets shared with the database CHECK constraints.
 * A unit test diffs these against the migrations (Blueprint P5) — grow per slice.
 */
export const TENANT_STATUSES = ["active", "paused", "test"] as const;
export type TenantStatus = (typeof TENANT_STATUSES)[number];

export const MEMBERSHIP_ROLES = ["owner", "staff"] as const;
export type MembershipRole = (typeof MEMBERSHIP_ROLES)[number];

/* ---- Slice 1: Conversations ---- */

export const CHANNEL_KINDS = ["whatsapp", "voice", "sms", "email", "instagram"] as const;
export type ChannelKind = (typeof CHANNEL_KINDS)[number];

export const CONVERSATION_STATES = ["open", "needs_human", "snoozed", "archived"] as const;
export type ConversationState = (typeof CONVERSATION_STATES)[number];

export const MESSAGE_CHANNELS = ["whatsapp", "voice", "sms", "email", "system"] as const;
export type MessageChannel = (typeof MESSAGE_CHANNELS)[number];

export const MESSAGE_DIRECTIONS = ["inbound", "outbound"] as const;
export type MessageDirection = (typeof MESSAGE_DIRECTIONS)[number];

export const MESSAGE_SENDERS = ["customer", "ai", "human", "system"] as const;
export type MessageSender = (typeof MESSAGE_SENDERS)[number];

export const MESSAGE_TYPES = ["text", "template", "media", "call_summary", "note"] as const;
export type MessageType = (typeof MESSAGE_TYPES)[number];

export const MESSAGE_STATUSES = ["received", "queued", "sent", "delivered", "read", "failed", "canceled"] as const;
export type MessageStatus = (typeof MESSAGE_STATUSES)[number];

export const CONSENT_STATES = ["unknown", "opted_in", "opted_out"] as const;
export type ConsentState = (typeof CONSENT_STATES)[number];

export const JOB_KINDS = [
  "outbound_send",
  "veto_fire",
  "snooze_wake",
  "pause_expire",
  "media_fetch",
  "rollup_daily",
  "deadman",
  "report_weekly",
  "broadcast_send",
] as const;
export type JobKind = (typeof JOB_KINDS)[number];

export const JOB_STATES = ["scheduled", "fired", "canceled", "failed"] as const;
export type JobState = (typeof JOB_STATES)[number];

/** Dot-namespaced event kinds emitted so far (grows per slice). */
export const EVENT_KINDS = [
  "message.received",
  "message.sent",
  "message.status",
  "escalation.opened",
  "contact.consent_changed",
  "usage.llm_tokens",
  "usage.wa_conversation",
  "ingest.allowlist_skip",
  "ingest.pg_failed",
  "message.send_failed",
] as const;
export type EventKind = (typeof EVENT_KINDS)[number];

/** Customer texts that mean opt-out (webhook consent handling, §4). */
export const OPT_OUT_PATTERN = /^\s*(stop|baja|unsubscribe|alto)\s*[.!]?\s*$/i;

/* ---- Slice 2: Inbox ---- */

export const ESCALATION_REASONS = [
  "human_token", "non_text", "refusal", "rate_cap", "policy_block",
  "send_failed", "deadman", "brain_error", "manual",
] as const;
export type EscalationReason = (typeof ESCALATION_REASONS)[number];

export const ESCALATION_STATES = ["open", "resolved"] as const;
export type EscalationState = (typeof ESCALATION_STATES)[number];

export const DECISION_VERBS = [
  "approve", "edit", "decline", "snooze", "take_over", "hand_back",
  "resolve", "archive", "reply", "cancel_send", "pause_agent", "resume_agent",
] as const;
export type DecisionVerb = (typeof DECISION_VERBS)[number];

export const DECISION_SUBJECTS = ["conversation", "escalation", "draft", "lead", "message", "agent"] as const;
export type DecisionSubject = (typeof DECISION_SUBJECTS)[number];

export const ACTOR_TYPES = ["user", "ai", "system", "owner_phone"] as const;
export type ActorType = (typeof ACTOR_TYPES)[number];

export const TEMPLATE_STATUSES = ["approved", "pending", "rejected"] as const;
export type TemplateStatus = (typeof TEMPLATE_STATUSES)[number];
