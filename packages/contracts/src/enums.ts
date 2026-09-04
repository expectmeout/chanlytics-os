/**
 * Closed sets shared with the database CHECK constraints.
 * A unit test diffs these against the migrations (Blueprint P5) — grow per slice.
 */
export const TENANT_STATUSES = ["active", "paused", "test"] as const;
export type TenantStatus = (typeof TENANT_STATUSES)[number];

export const MEMBERSHIP_ROLES = ["owner", "operator", "viewer"] as const;
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
  /**
   * Erase one customer's stored Blob thread. The DASHBOARD orchestrates
   * erasure and cannot reach Blob; the EDGE holds BLOB_READ_WRITE_TOKEN and
   * cannot publish QStash jobs. This kind is the seam.
   */
  "blob_thread_erase",
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
  "message.send_blocked",
  "message.send_raced_cancel",
  "conversation.reopened",
  "conversation.pause_expired",
  "contact.erased",
  "contact.blob_erased",
] as const;
export type EventKind = (typeof EVENT_KINDS)[number];

/** Customer texts that mean opt-out (webhook consent handling, §4). */
export const OPT_OUT_PATTERN = /^\s*(stop|baja|unsubscribe|alto)\s*[.!]?\s*$/i;

/**
 * Customer texts that mean opt back IN — the way out of an opt-out.
 *
 * Without this, enforcing opt-out silences someone permanently: they text STOP
 * once and nothing they ever send again gets a reply, including "start". Only
 * these exact words count. A looser test (any message means they're back)
 * would lift the block the moment they said anything, which is the same as not
 * having one — and "sí"/"yes" is deliberately excluded because it is how
 * people answer an ordinary question, not how they rejoin a list.
 */
export const OPT_IN_PATTERN = /^\s*(start|unstop|resume|alta)\s*[.!]?\s*$/i;

/* ---- Slice 2: Inbox ---- */

export const ESCALATION_REASONS = [
  "human_token", "non_text", "refusal", "rate_cap", "policy_block",
  "send_failed", "deadman", "brain_error", "manual", "opt_out", "state_unavailable",
  /** Delivered so late that an automated reply would arrive out of nowhere. */
  "stale",
  /** The owner set the receptionist to Ask or Never for THIS person; the
   *  thread is theirs to answer. A choice about one customer, never a
   *  workspace setting. */
  "person_hold",
] as const;
export type EscalationReason = (typeof ESCALATION_REASONS)[number];

export const ESCALATION_STATES = ["open", "resolved"] as const;
export type EscalationState = (typeof ESCALATION_STATES)[number];

export const DECISION_VERBS = [
  "approve", "edit", "decline", "snooze", "wake", "take_over", "hand_back",
  "resolve", "archive", "reply", "cancel_send", "pause_agent", "resume_agent",
  /**
   * What one member can do to another.
   *
   * The ledger recorded every conversation verb and nothing about the team —
   * the one table where "who did this" is hardest to reconstruct afterwards
   * and matters most. Promoting someone to owner hands them billing, the
   * ability to remove everyone else, and the receptionist's voice.
   *
   * These must stay in step with decisions_verb_check (migration 00023): the
   * database rejects a verb this list allows, and a verb the database allows
   * but this omits cannot be written by any typed caller.
   */
  "invite", "revoke_invite", "change_role", "remove_member",
  /**
   * The only irreversible verb. privacy.html promises deletion on verified
   * request; this is the record that it happened, on subject_type 'contact',
   * and it survives the data it destroyed. Written twice per erasure: once by
   * the owner (actor_type 'user') and once by the job that finishes the Blob
   * leg (actor_type 'system').
   */
  "erase",
  /**
   * A sentence handed to the phone receptionist mid-call, heard by it alone
   * and worked into its next answer (Retell update-live-call). Subject
   * 'call'. The ledger keeps the words: they are the operator's, and they
   * changed what a customer was told.
   */
  "whisper",
] as const;
export type DecisionVerb = (typeof DECISION_VERBS)[number];

export const DECISION_SUBJECTS = [
  "conversation", "escalation", "draft", "lead", "message", "agent",
  "membership", "invitation", "contact", "call",
] as const;
export type DecisionSubject = (typeof DECISION_SUBJECTS)[number];

export const ACTOR_TYPES = ["user", "ai", "system", "owner_phone"] as const;
export type ActorType = (typeof ACTOR_TYPES)[number];

export const TEMPLATE_STATUSES = ["approved", "pending", "rejected"] as const;
export type TemplateStatus = (typeof TEMPLATE_STATUSES)[number];
