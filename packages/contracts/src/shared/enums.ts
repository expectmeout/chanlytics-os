/**
 * Closed sets shared with the database CHECK constraints. Each is held to its
 * column at compile time by schema-sets.ts, against sets generated from the
 * database itself (tooling/scripts/gen/schema-sets.mjs).
 *
 * Kept by domain, a file each in enums/; this page names every set, from where it is declared.
 */
export { TENANT_STATUSES, type TenantStatus, MEMBERSHIP_ROLES, type MembershipRole } from "./enums/workspace";
export {
  CHANNEL_KINDS,
  type ChannelKind,
  IDENTITY_ASSURANCES,
  type IdentityAssurance,
  CONVERSATION_STATES,
  type ConversationState,
  MESSAGE_CHANNELS,
  type MessageChannel,
  MESSAGE_DIRECTIONS,
  type MessageDirection,
  MESSAGE_SENDERS,
  type MessageSender,
  MESSAGE_TYPES,
  type MessageType,
  MESSAGE_STATUSES,
  type MessageStatus,
  ESCALATION_REASONS,
  type EscalationReason,
  ESCALATION_STATES,
  type EscalationState,
  TEMPLATE_STATUSES,
  type TemplateStatus,
} from "./enums/conversations";
export {
  CONSENT_STATES,
  type ConsentState,
  OPT_OUT_PATTERN,
  EMAIL_STOP_PATTERN,
  EMAIL_UNSUBSCRIBE_PATTERN,
  SMS_OPT_OUT_PATTERN,
  OPT_IN_PATTERN,
  MARKETING_OPT_IN_PATTERN,
  CONVERSATION_OPT_IN_PATTERN,
  optInPurposeOf,
  OFFERS_OPT_IN_PHRASES,
} from "./enums/consent";
export {
  JOB_KINDS,
  type JobKind,
  EVENT_SUBSCRIBERS,
  type EventSubscriber,
  JOB_STATES,
  type JobState,
} from "./enums/jobs";
export { WABA_FIELDS, type WabaEventKind, EVENT_KINDS, type EventKind } from "./enums/events";
export {
  DECISION_VERBS,
  type DecisionVerb,
  DECISION_SUBJECTS,
  type DecisionSubject,
  ACTOR_TYPES,
  type ActorType,
  type VisitWord,
} from "./enums/decisions";
