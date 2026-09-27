/** The plumbing every domain uses: time and the clock, the three normalizers, CSV, the envelope and its errors, the closed sets. */
export { ok, err } from "./envelope";
export type { Ok, Err, Envelope } from "./envelope";
export { ERROR_CODES, AppError } from "./errors";
export type { ErrorCode } from "./errors";
export {
  normalizePhone,
  samePhone,
  shortCode,
  phoneDialable,
  whyNotAPhone,
  whyNotAHandoff,
  whyNotForward,
  handoffE164,
  phoneTail,
  formatPhoneDisplay,
  HANDOFF_FORWARDS_BACK,
  FORWARD_IS_HANDOFF,
} from "./phone";
export { normalizeEmail, whyNotAnEmail, addressInMessage } from "./email-address";
export { normalizeLink, whyNotALink, linkHost } from "./link";
export {
  optInPurposeOf,
  optInLink,
  TENANT_STATUSES,
  MEMBERSHIP_ROLES,
  CHANNEL_KINDS,
  CONVERSATION_STATES,
  MESSAGE_CHANNELS,
  MESSAGE_DIRECTIONS,
  MESSAGE_SENDERS,
  MESSAGE_TYPES,
  MESSAGE_STATUSES,
  CONSENT_STATES,
  JOB_KINDS,
  JOB_STATES,
  WABA_FIELDS,
  EVENT_KINDS,
  OPT_OUT_PATTERN,
  SMS_OPT_OUT_PATTERN,
  OPT_IN_PATTERN,
  MARKETING_OPT_IN_PATTERN,
  CONVERSATION_OPT_IN_PATTERN,
  OFFERS_OPT_IN_PHRASES,
  ESCALATION_REASONS,
  ESCALATION_STATES,
  DECISION_VERBS,
  DECISION_SUBJECTS,
  ACTOR_TYPES,
  TEMPLATE_STATUSES,
} from "./enums";
export type {
  TenantStatus,
  MembershipRole,
  ChannelKind,
  ConversationState,
  MessageChannel,
  MessageDirection,
  MessageSender,
  MessageType,
  MessageStatus,
  ConsentState,
  JobKind,
  JobState,
  WabaEventKind,
  EventKind,
  EscalationReason,
  EscalationState,
  DecisionVerb,
  DecisionSubject,
  ActorType,
  TemplateStatus,
} from "./enums";
export { spanUnits, spanLabel, waitedLabel, agoShort, agoWords, timezoneCity } from "./time";
export type { SpanUnits } from "./time";
export {
  zoneDayKey,
  clockTime,
  clockDate,
  clockDateYear,
  clockShort,
  clockStamp,
  clockWhen,
  localDaysBetween,
  inLocalWeek,
  clockNear,
  clockNearWhen,
  clockDayLabel,
  wallClockAt,
  tomorrowAtIn,
  zonedInputValue,
  fromZonedInput,
} from "./clock";
export type { SchemaSetKey, SchemaSet, Exactly, Within, Holds, SchemaAgreement } from "./schema-sets";
export { csvCell, parseCsv, matchColumns, importRowsOf, importCounts } from "./csv";
export type { CsvCell, ImportColumns, ImportRow } from "./csv";
export { SCHEMA_SETS } from "../schema-sets.generated";
export { ROUTE_KEYS } from "../route-keys.generated";
export type { ApiRouteKey } from "../route-keys.generated";
