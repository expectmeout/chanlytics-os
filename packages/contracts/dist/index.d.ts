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
/** Human-readable phone for display: NANP gets +1 (XXX) XXX-XXXX; others get spaced groups. */
declare function formatPhoneDisplay(e164: string | null | undefined): string | null;

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
declare const EVENT_KINDS: readonly ["message.received", "message.sent", "message.status", "escalation.opened", "contact.consent_changed", "usage.llm_tokens", "usage.wa_conversation", "ingest.allowlist_skip", "ingest.pg_failed", "message.send_failed"];
type EventKind = (typeof EVENT_KINDS)[number];
/** Customer texts that mean opt-out (webhook consent handling, §4). */
declare const OPT_OUT_PATTERN: RegExp;
declare const ESCALATION_REASONS: readonly ["human_token", "non_text", "refusal", "rate_cap", "policy_block", "send_failed", "deadman", "brain_error", "manual"];
type EscalationReason = (typeof ESCALATION_REASONS)[number];
declare const ESCALATION_STATES: readonly ["open", "resolved"];
type EscalationState = (typeof ESCALATION_STATES)[number];
declare const DECISION_VERBS: readonly ["approve", "edit", "decline", "snooze", "take_over", "hand_back", "resolve", "archive", "reply", "cancel_send", "pause_agent", "resume_agent"];
type DecisionVerb = (typeof DECISION_VERBS)[number];
declare const DECISION_SUBJECTS: readonly ["conversation", "escalation", "draft", "lead", "message", "agent"];
type DecisionSubject = (typeof DECISION_SUBJECTS)[number];
declare const ACTOR_TYPES: readonly ["user", "ai", "system", "owner_phone"];
type ActorType = (typeof ACTOR_TYPES)[number];
declare const TEMPLATE_STATUSES: readonly ["approved", "pending", "rejected"];
type TemplateStatus = (typeof TEMPLATE_STATUSES)[number];

/**
 * ThreadCard/ConversationVM viewmodels (Blueprint §7): pure mapping from API
 * DTOs into the exact shapes the mockup surfaces render. Fed fields only —
 * nothing invented: summaries are factual lines, never fabricated analysis.
 */
interface MessageDto {
    id: string;
    direction: "inbound" | "outbound";
    sender: "customer" | "ai" | "human" | "system";
    type: string;
    body: string | null;
    media: {
        mime_type?: string | null;
        fetch_state?: string;
    } | null;
    meta: Record<string, unknown> | null;
    created_at: string;
}
interface ConversationDto {
    id: string;
    state: "open" | "needs_human" | "snoozed" | "archived";
    paused_until: string | null;
    snooze_until?: string | null;
    last_wa_inbound_at?: string | null;
    last_message_at: string | null;
    contact: {
        id: string;
        display_name: string | null;
        wa_profile_name: string | null;
        phone_e164: string | null;
    };
    messages: MessageDto[];
}
interface ConversationMessageVM {
    from: "client" | "agent";
    at: string;
    text: string;
}
interface ConversationVM {
    id: string;
    who: string;
    initials: string;
    clientId: null;
    channel: "whatsapp";
    agent: {
        glyph: string;
        name: string;
    };
    at: string;
    outcome: "escalated" | "handled" | "open";
    snippet: string;
    summary: {
        headline: string;
        bullets: string[];
    };
    messages: ConversationMessageVM[];
    live?: boolean;
}
interface EscalationDto {
    id: string;
    reason: string;
    details: string | null;
    state: "open" | "resolved";
    created_at: string;
}
declare const ESCALATION_REASON_LABELS: Record<string, string>;
interface InboxThreadVM {
    id: string;
    real: true;
    conversationId: string;
    escalationId: string | null;
    windowOpen: boolean;
    who: string;
    whoMeta: string;
    avatar: string;
    state: "escalated" | "snoozed" | "done";
    takenOver: boolean;
    channels: string[];
    primaryChannel: "whatsapp";
    agent: {
        name: string;
        glyph: string;
        autonomy: string;
        tone: string;
    };
    subject: string;
    preview: string;
    summary: string;
    contextStrip: Array<{
        label: string;
        value: string;
    }>;
    lastAt: string;
    lastAtFull: string;
    unread: boolean;
    pinned: false;
    value: 0;
    tags: string[];
    confidence: 0;
    priority: "P2";
    waitingMin?: number;
    wake?: string;
    resolution?: {
        action: string;
        at: string;
    };
    timeline: Array<{
        type: "msg";
        from: "client" | "agent";
        channel: string;
        at: string;
        body: string;
        byYou?: boolean;
    } | {
        type: "event";
        kind: string;
        at: string;
        body: string;
    }>;
}
declare function toInboxThreadVM(dto: ConversationDto, escalation: EscalationDto | null, now?: Date): InboxThreadVM;
declare function toConversationVM(dto: ConversationDto, now?: Date): ConversationVM;

/**
 * Layer-2 policy enforcement (Blueprint §6): deterministic post-generation
 * checks — prompt text is never the only defense. v1 ships the one hard rule
 * of tenant #1: NO dollar prices, ever.
 */
declare function violatesNoPrices(text: string): boolean;
/** The WhatsApp 24h customer-service window (Blueprint §4/§6). Pure — imported
 *  by BOTH the reply endpoint (enforcement) and the composer (honest display). */
declare const WA_WINDOW_MS: number;
interface WaWindow {
    open: boolean;
    /** When the window closes (null when it never opened). */
    closesAtIso: string | null;
}
declare function waWindow(lastWaInboundAtIso: string | null | undefined, now?: Date): WaWindow;

export { ACTOR_TYPES, type ActorType, AppError, CHANNEL_KINDS, CONSENT_STATES, CONVERSATION_STATES, type ChannelKind, type ConsentState, type ConversationDto, type ConversationMessageVM, type ConversationState, type ConversationVM, DECISION_SUBJECTS, DECISION_VERBS, type DecisionSubject, type DecisionVerb, ERROR_CODES, ESCALATION_REASONS, ESCALATION_REASON_LABELS, ESCALATION_STATES, EVENT_KINDS, type Envelope, type Err, type ErrorCode, type EscalationDto, type EscalationReason, type EscalationState, type EventKind, type InboxThreadVM, JOB_KINDS, JOB_STATES, type JobKind, type JobState, MEMBERSHIP_ROLES, MESSAGE_CHANNELS, MESSAGE_DIRECTIONS, MESSAGE_SENDERS, MESSAGE_STATUSES, MESSAGE_TYPES, type MembershipRole, type MessageChannel, type MessageDirection, type MessageDto, type MessageSender, type MessageStatus, type MessageType, OPT_OUT_PATTERN, type Ok, TEMPLATE_STATUSES, TENANT_STATUSES, type TemplateStatus, type TenantStatus, WA_WINDOW_MS, type WaWindow, err, formatPhoneDisplay, normalizePhone, ok, toConversationVM, toInboxThreadVM, violatesNoPrices, waWindow };
