/**
 * The plumbing every domain uses: time and the clock, the three normalizers, what an id looks like, the small words,
 * HTML escaping, reading a value from outside, bytes and sums, the envelope and its errors, the closed sets.
 */
export { ROUTE_KEYS } from "../route-keys.generated";
export type { ApiRouteKey } from "../route-keys.generated";
export { SCHEMA_SETS } from "../schema-sets.generated";
export { hexOf, utf8Bytes } from "./bytes";
export {
  callLength,
  clockDate,
  clockDateYear,
  clockDayLabel,
  clockHour,
  clockNear,
  clockNearWhen,
  clockShort,
  clockStamp,
  clockTime,
  clockWhen,
  durationWords,
  fromZonedInput,
  inLocalWeek,
  localDaysBetween,
  mmss,
  tomorrowAtIn,
  wallClockAt,
  zoneDayKey,
  zonedInputValue,
} from "./clock";
export { EDGE_ERROR_CODES } from "./edge-errors";
export type { EdgeAnswerBody, EdgeAnswerCode, EdgeCallCode, EdgeErrorCode, EdgeRefusal } from "./edge-errors";
export { addressInMessage, normalizeEmail, whyNotAnEmail } from "./email-address";
export {
  ACTOR_TYPES,
  CHANNEL_KINDS,
  CONSENT_STATES,
  CONVERSATION_OPT_IN_PATTERN,
  CONVERSATION_STATES,
  DECISION_SUBJECTS,
  DECISION_VERBS,
  EMAIL_STOP_PATTERN,
  EMAIL_UNSUBSCRIBE_PATTERN,
  ESCALATION_REASONS,
  ESCALATION_STATES,
  EVENT_KINDS,
  EVENT_SUBSCRIBERS,
  IDENTITY_ASSURANCES,
  JOB_KINDS,
  JOB_STATES,
  MARKETING_OPT_IN_PATTERN,
  MEMBERSHIP_ROLES,
  MESSAGE_CHANNELS,
  MESSAGE_DIRECTIONS,
  MESSAGE_SENDERS,
  MESSAGE_STATUSES,
  MESSAGE_TYPES,
  OFFERS_OPT_IN_PHRASES,
  OPT_IN_PATTERN,
  OPT_OUT_PATTERN,
  optInPurposeOf,
  SMS_OPT_OUT_PATTERN,
  TEMPLATE_STATUSES,
  TENANT_STATUSES,
  WABA_FIELDS,
} from "./enums";
export type {
  ActorType,
  ChannelKind,
  ConsentState,
  ConversationState,
  DecisionSubject,
  DecisionVerb,
  EscalationReason,
  EscalationState,
  EventKind,
  EventSubscriber,
  IdentityAssurance,
  JobKind,
  JobState,
  MembershipRole,
  MessageChannel,
  MessageDirection,
  MessageSender,
  MessageStatus,
  MessageType,
  TemplateStatus,
  TenantStatus,
  WabaEventKind,
} from "./enums";
export { err, ok, SERVED_AT_HEADER } from "./envelope";
export type { Envelope, Err, Ok } from "./envelope";
export { AppError, bodyRefusal, ERROR_CODES } from "./errors";
export type { ErrorCode } from "./errors";
export { escapeHtml, linkifyEscaped } from "./html";
export { asContactId, asTenantId, isUuid, UUID } from "./identity";
export type { ContactId, TenantId } from "./identity";
export { linkHost, normalizeLink, publicObjectSrc, whyNotALink } from "./link";
export { sumOf } from "./numbers";
export {
  areaCodeOf,
  formatPhoneDisplay,
  FORWARD_IS_HANDOFF,
  HANDOFF_FORWARDS_BACK,
  handoffE164,
  normalizePhone,
  phoneDialable,
  phoneTail,
  samePhone,
  shortCode,
  whyNotAHandoff,
  whyNotAPhone,
  whyNotForward,
} from "./phone";
export type { Exactly, Holds, SchemaAgreement, SchemaSet, SchemaSetKey, Within } from "./schema-sets";
export {
  agoShort,
  agoWords,
  DAY_MS,
  HOUR_MS,
  jittered,
  MIN_MS,
  SECOND_MS,
  spanLabel,
  spanUnits,
  timezoneCity,
  waitedLabel,
  WEEK_MS,
} from "./time";
export type { SpanUnits } from "./time";
export { finiteOrNull, finiteOrZero, lineOrNull, nonBlankOrNull, recordOrNull, trimmedOrNull } from "./unknown";
export { plural } from "./words";
