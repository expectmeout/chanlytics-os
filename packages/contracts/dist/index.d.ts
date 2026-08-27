/** Closed error-code enum for the /api/v1 envelope (Blueprint §4). */
declare const ERROR_CODES: readonly ["unauthorized", "forbidden", "not_found", "validation", "conflict", "rate_limited", "window_closed", "upstream_meta", "upstream_retell", "upstream_anthropic", "internal"];
type ErrorCode = (typeof ERROR_CODES)[number];
declare class AppError extends Error {
    readonly code: ErrorCode;
    readonly status: number;
    readonly details?: unknown;
    constructor(code: ErrorCode, message: string, status?: number, details?: unknown);
}

/** API envelope (Blueprint §4): success {ok:true,data} / error {ok:false,error:{code,...}}. */
interface Ok<T> {
    ok: true;
    data: T;
}
interface Err {
    ok: false;
    error: {
        code: ErrorCode;
        message: string;
        details?: unknown;
    };
}
type Envelope<T> = Ok<T> | Err;
declare const ok: <T>(data: T) => Ok<T>;
declare const err: (code: ErrorCode, message: string, details?: unknown) => Err;

/**
 * THE phone normalizer (Blueprint §3 conventions). One implementation, imported
 * by edge ingestion, backfill scripts, and the dashboard alike.
 *
 * Returns E.164 with leading "+", or null when the input can't be a phone number.
 * Bare 10-digit numbers are treated as US national (the pilot's market);
 * provider ids (e.g. Meta wa_id) are stored verbatim in contact_identities —
 * this normalizer is for the display/dial identity only.
 */
declare function normalizePhone(raw: string | null | undefined): string | null;

/**
 * Closed sets shared with the database CHECK constraints.
 * A unit test diffs these against the migrations (Blueprint P5) — grow per slice.
 */
declare const TENANT_STATUSES: readonly ["active", "paused", "test"];
type TenantStatus = (typeof TENANT_STATUSES)[number];
declare const MEMBERSHIP_ROLES: readonly ["owner", "staff"];
type MembershipRole = (typeof MEMBERSHIP_ROLES)[number];
declare const CHANNEL_KINDS: readonly ["whatsapp", "voice", "sms", "email", "instagram"];
type ChannelKind = (typeof CHANNEL_KINDS)[number];
declare const CONVERSATION_STATES: readonly ["open", "needs_human", "snoozed", "archived"];
type ConversationState = (typeof CONVERSATION_STATES)[number];
declare const MESSAGE_CHANNELS: readonly ["whatsapp", "voice", "sms", "email", "system"];
type MessageChannel = (typeof MESSAGE_CHANNELS)[number];
declare const MESSAGE_DIRECTIONS: readonly ["inbound", "outbound"];
type MessageDirection = (typeof MESSAGE_DIRECTIONS)[number];
declare const MESSAGE_SENDERS: readonly ["customer", "ai", "human", "system"];
type MessageSender = (typeof MESSAGE_SENDERS)[number];
declare const MESSAGE_TYPES: readonly ["text", "template", "media", "call_summary", "note"];
type MessageType = (typeof MESSAGE_TYPES)[number];
declare const MESSAGE_STATUSES: readonly ["received", "queued", "sent", "delivered", "read", "failed", "canceled"];
type MessageStatus = (typeof MESSAGE_STATUSES)[number];
declare const CONSENT_STATES: readonly ["unknown", "opted_in", "opted_out"];
type ConsentState = (typeof CONSENT_STATES)[number];
declare const JOB_KINDS: readonly ["outbound_send", "veto_fire", "snooze_wake", "pause_expire", "media_fetch", "rollup_daily", "deadman", "report_weekly", "broadcast_send"];
type JobKind = (typeof JOB_KINDS)[number];
declare const JOB_STATES: readonly ["scheduled", "fired", "canceled", "failed"];
type JobState = (typeof JOB_STATES)[number];
/** Dot-namespaced event kinds emitted so far (grows per slice). */
declare const EVENT_KINDS: readonly ["message.received", "message.sent", "message.status", "escalation.opened", "contact.consent_changed", "usage.llm_tokens", "usage.wa_conversation", "ingest.allowlist_skip", "ingest.pg_failed"];
type EventKind = (typeof EVENT_KINDS)[number];
/** Customer texts that mean opt-out (webhook consent handling, §4). */
declare const OPT_OUT_PATTERN: RegExp;

export { AppError, CHANNEL_KINDS, CONSENT_STATES, CONVERSATION_STATES, type ChannelKind, type ConsentState, type ConversationState, ERROR_CODES, EVENT_KINDS, type Envelope, type Err, type ErrorCode, type EventKind, JOB_KINDS, JOB_STATES, type JobKind, type JobState, MEMBERSHIP_ROLES, MESSAGE_CHANNELS, MESSAGE_DIRECTIONS, MESSAGE_SENDERS, MESSAGE_STATUSES, MESSAGE_TYPES, type MembershipRole, type MessageChannel, type MessageDirection, type MessageSender, type MessageStatus, type MessageType, OPT_OUT_PATTERN, type Ok, TENANT_STATUSES, type TenantStatus, err, normalizePhone, ok };
