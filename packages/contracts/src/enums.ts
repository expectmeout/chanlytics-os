/**
 * Closed sets shared with the database CHECK constraints. Each is held to its
 * column at compile time by schema-sets.ts, against sets generated from the
 * database itself (tooling/scripts/gen-schema-sets.mjs).
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

/**
 * What the queue carries: each kind has a handler in packages/jobs and a
 * caller that schedules it. Kinds declared ahead of their slice (veto_fire,
 * media_fetch, rollup_daily, deadman, report_weekly) are gone — a vetoed reply
 * is an outbound_send with a delay, the deadman is a pg_cron sweep, media is
 * fetched inline — and so are the two timers (snooze_wake, pause_expire): a
 * snooze or a pause wakes from its own timestamp on the conversation (00098).
 * A new kind arrives with its handler, its caller and the jobs.kind CHECK,
 * together.
 */
export const JOB_KINDS = [
  "outbound_send",
  "broadcast_send",
  /**
   * Erase one customer's stored Blob thread. The DASHBOARD orchestrates
   * erasure and cannot reach Blob; the EDGE holds BLOB_READ_WRITE_TOKEN and
   * runs the ledger. This kind is the seam.
   */
  "blob_thread_erase",
  /**
   * A line's provisioning saga, run under the ledger's lease and resumed by
   * the heartbeat if a worker dies (00109). The saga itself stays on the
   * edge with the provider's credentials and is injected into the tick.
   */
  "line_provision",
] as const;
export type JobKind = (typeof JOB_KINDS)[number];

/**
 * `fired` means CLAIMED, not finished: claim_due_jobs() sets it with a lease,
 * and the tick moves the job to `done` or `failed` when its handler returns or
 * throws. A job still `fired` past its lease is one whose run never reported
 * back, and the next claim takes it again (packages/jobs/src/ledger.ts).
 */
export const JOB_STATES = ["scheduled", "fired", "done", "canceled", "failed"] as const;
export type JobState = (typeof JOB_STATES)[number];

/**
 * Meta's account-level webhook fields (WABA). Each arrives as an event of kind
 * `channel.<field>`, so this list is also the one computed family of event
 * kinds; the edge's WABA_FIELDS is a Set of it.
 */
export const WABA_FIELDS = [
  "phone_number_quality_update", "account_update", "message_template_status_update",
  "account_review_update", "message_template_quality_update", "template_category_update",
] as const;
export type WabaEventKind = `channel.${(typeof WABA_FIELDS)[number]}`;

/**
 * Every event kind the product writes, and nothing it does not.
 *
 * Held to the emitters by tooling/scripts/tests/event-kinds.test.mjs, a
 * repo-wide lint: a kind here that nothing emits is a dead declaration, a
 * kind emitted that is not here is a row nobody can name. Both were true for
 * months (three dead, fourteen undeclared) before the lint existed.
 */
export const EVENT_KINDS = [
  "message.received",
  "message.sent",
  "contact.consent_changed",
  "usage.llm_tokens",
  "usage.wa_conversation",
  "ingest.allowlist_skip",
  /** The sender cannot receive a reply — a short code. Recorded, never answered. */
  "ingest.unreachable_sender",
  "message.send_failed",
  "message.send_blocked",
  "message.send_raced_cancel",
  "conversation.reopened",
  "conversation.pause_expired",
  "contact.erased",
  "contact.blob_erased",
  "setup.requested",
  "voice.provisioned",
  "line.answering",
  "line.failed",
  "line.released",
  "line.forwarding_verified",
  /**
   * Somebody at Chanlytics acted on a workspace they are not a member of.
   *
   * The back office's write half. Recorded BEFORE the action, and the action is
   * refused if it cannot be recorded: a cross-tenant write that nobody can be
   * held to is worse than one that did not happen. What happened next is the
   * line's own event, written by the edge, immediately after this one.
   */
  "platform.acted",
  /** The carriers answered: texting is on, the business is through, or it came back. */
  "line.texting_on",
  "line.texting_approved",
  "line.texting_rejected",
  /** The business on record for the carriers, saved or changed. */
  "business.recorded",
  /** The workspace's listing on Google: linked, removed, and a read that found new reviews or ratings. */
  "google.linked",
  "google.unlinked",
  "google.reviews",
  /** The owner's Business Profile: connected, disconnected, and a review answered from here. */
  "google.connected",
  "google.disconnected",
  "google.replied",
  "workspace.created",
  /** The owner's controls changed: which config fields moved (never their values); a policy row's class, mode and the limit keys that moved. */
  "settings.changed",
  "policy.changed",
  "billing.updated",
  "billing.paused",
  "billing.resumed",
  /** A call: the row (00007) and the seconds it cost. */
  "call.recorded",
  "usage.voice_seconds",
  /** The assistant's model usage, per turn (ask-gateway). */
  "usage.ask_tokens",
  /** Retell's webhook: every delivery and every refused signature, kept thirty days (00038). */
  "webhook.auth",
  "webhook.delivery",
  /** A person who came from the calendar or a hand, not from a message (00053). */
  "contact.added",
  /** A person renamed or annotated at the desk (00054). */
  "contact.named",
  "contact.noted",
  /** An inbound the router could not place on any workspace. */
  "ingest.unroutable",
  /** A reply skipped because its veto window had already been spent. */
  "policy.veto_window_skipped",
  /** The sweep woke a snooze whose time had passed (00082). */
  "conversation.snooze_expired",
  /** A broadcast finished, with its tally; a playbook made a run. */
  "broadcast.sent",
  "playbook.run",
  /** A WhatsApp number connected through Embedded Signup (admin/whatsapp/connect). */
  "channel.connected",
] as const;
export type EventKind = (typeof EVENT_KINDS)[number] | WabaEventKind;

/** Customer texts that mean opt-out (webhook consent handling, §4). */
export const OPT_OUT_PATTERN = /^\s*(stop|baja|unsubscribe|alto)\s*[.!]?\s*$/i;

/**
 * The carriers' opt-out words, for a TEXTING LINE only.
 *
 * Twilio's default list (STOP, STOPALL, UNSUBSCRIBE, CANCEL, END, QUIT, REVOKE,
 * OPTOUT, per the FCC ruling) blocks the number at the carrier whatever our
 * record says, so on SMS our record must agree with theirs: a QUIT we did not
 * recognise left a customer opted in on our side and unreachable on the
 * carrier's, with the next send bouncing and an owner told a delivery failed.
 *
 * WhatsApp has no carrier rule, and its appointment templates carry "Cancel"
 * and "End" buttons that mean a booking, not a goodbye -- so these words are
 * never applied to a WhatsApp message. Whole-message only: "stop by at 4?" is
 * a booking on either channel.
 */
export const SMS_OPT_OUT_PATTERN = /^\s*(stop|stopall|end|cancel|quit|unsubscribe|revoke|optout|baja|alto)\s*[.!]?\s*$/i;

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
// NOT what the wire reads any more. The inbound reading takes the two split
// patterns below, one per question, because a message that answers both is one
// opt-in enrolling a person in two programs -- which the carriers refuse a
// campaign for (30913), and which the message flow then had to confess. Kept
// for the readers that want "any opt-in word at all".
export const OPT_IN_PATTERN = /^\s*(start|unstop|resume|alta|yes offers|si ofertas|s\u00ed ofertas)\s*[.!]?\s*$/i;

/**
 * The words that answer the MARKETING question, and only that one.
 *
 * THE DEFECT THIS SPLITS. OPT_IN_PATTERN above treats "YES OFFERS" and "START"
 * as the same event: both set the single `consent` column, which then gates
 * appointment reminders, the receptionist's replies and promotional broadcasts
 * alike. So one message gave one yes that covered three purposes -- which is
 * carrier error 30913 exactly: "marketing consent was combined with other
 * consents. Marketing consent must be collected separately."
 *
 * These words say offers, in both languages this product speaks. Nothing here
 * is a bare "yes": that is how a person answers an ordinary question, and it
 * must never be read as express written consent to be marketed to.
 */
export const MARKETING_OPT_IN_PATTERN = /^\s*(yes offers|si ofertas|s\u00ed ofertas)\s*[.!]?\s*$/i;

/**
 * The words that answer the CONVERSATIONAL question: messages about your own
 * visit, and the receptionist writing back.
 *
 * START/UNSTOP/RESUME are the carriers' own standard words and are declared to
 * them in the campaign's opt-in keywords. ALTA is their Spanish equivalent.
 */
export const CONVERSATION_OPT_IN_PATTERN = /^\s*(start|unstop|resume|alta)\s*[.!]?\s*$/i;

/** Which question a customer's message answers, or null when it answers neither. */
export function optInPurposeOf(text: string): "conversational" | "marketing" | null {
  if (MARKETING_OPT_IN_PATTERN.test(text)) return "marketing";
  if (CONVERSATION_OPT_IN_PATTERN.test(text)) return "conversational";
  return null;
}

/**
 * The phrase a customer sends to say yes to offers. Unambiguous on purpose,
 * so it can ride a wa.me link or a QR at the desk without "yes" to an
 * ordinary question ever counting; the ingest records it as their own
 * message, the strongest consent there is.
 */
export const OFFERS_OPT_IN_PHRASES = { en: "YES OFFERS", es: "SI OFERTAS" } as const;

/** WhatsApp opened on the workspace's number with the phrase ready to send; null without a usable number. */
export function optInLink(numberE164: string | null | undefined, phrase: string = OFFERS_OPT_IN_PHRASES.en): string | null {
  const digits = String(numberE164 ?? "").replace(/\D/g, "");
  if (digits.length < 8) return null;
  return `https://wa.me/${digits}?text=${encodeURIComponent(phrase)}`;
}

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
  /** The workspace's day of model tokens is spent (limits.max_llm_tokens_day). */
  "budget",
  /** A booking or a service/pricing question, with that class set to Ask me first on the Autonomy pane: a person answers. */
  "policy_ask",
  /** The phone receptionist could not finish the call: a person calls them back. What to do rides in the details. */
  "callback",
  /** The workspace is paused (billing): messages land, nothing is answered until it resumes. */
  "paused",
  /** A text arrived on a line the carriers have not approved for texting yet: kept, a person answers. */
  "carriers",
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
  /**
   * A business connected its own channel (Embedded Signup): subject
   * 'channel', payload the number, the WABA and the registration outcome.
   * The one verb whose consequence is a credential in Vault.
   */
  "connect_channel",
  /**
   * A customer's answer about marketing messages, recorded by the person
   * who heard it: subject 'contact', payload the answer, how it was given,
   * and what it was before. The record a broadcast stands on.
   */
  "consent_change",
  /**
   * A broadcast: one approved template to the people who said yes. The
   * decision to send (subject 'broadcast', payload the template, the
   * audience and the count) and the decision to stop one.
   */
  "send_broadcast",
  "cancel_broadcast",
  /** A playbook started or paused: subject 'playbook'. Its runs are send_broadcast rows. */
  "start_playbook",
  "pause_playbook",
  /**
   * An answer to a review on Google, in the business's own words: subject
   * 'review' (the row's id), payload the words and when Google took them.
   * Replaces the previous answer; Google keeps one per review.
   */
  "reply_review",
  /**
   * A copy of the workspace's data left the building: everyone as a CSV, a
   * thread, a call, or the whole workspace. Subject "workspace" for the two
   * that carry everyone; the thread's or the call's own row for the others.
   * The one verb an auditor asks about that the ledger did not keep.
   */
  "export",
] as const;
export type DecisionVerb = (typeof DECISION_VERBS)[number];

export const DECISION_SUBJECTS = [
  "conversation", "escalation", "draft", "lead", "message", "agent",
  "membership", "invitation", "contact", "call", "channel", "broadcast", "playbook", "review",
  /** The workspace itself: an export of everyone, or of everything. Its id is the tenant's. */
  "workspace",
] as const;
export type DecisionSubject = (typeof DECISION_SUBJECTS)[number];

export const ACTOR_TYPES = ["user", "ai", "system", "owner_phone"] as const;
export type ActorType = (typeof ACTOR_TYPES)[number];

export const TEMPLATE_STATUSES = ["approved", "pending", "rejected", "paused", "disabled"] as const;
export type TemplateStatus = (typeof TEMPLATE_STATUSES)[number];
