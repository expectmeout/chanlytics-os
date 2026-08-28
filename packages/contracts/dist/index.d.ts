import { z } from 'zod';

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
declare const MEMBERSHIP_ROLES: readonly ["owner", "operator", "viewer"];
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
declare const EVENT_KINDS: readonly ["message.received", "message.sent", "message.status", "escalation.opened", "contact.consent_changed", "usage.llm_tokens", "usage.wa_conversation", "ingest.allowlist_skip", "ingest.pg_failed", "message.send_failed", "message.send_blocked", "message.send_raced_cancel", "conversation.reopened", "conversation.pause_expired"];
type EventKind = (typeof EVENT_KINDS)[number];
/** Customer texts that mean opt-out (webhook consent handling, §4). */
declare const OPT_OUT_PATTERN: RegExp;
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
declare const OPT_IN_PATTERN: RegExp;
declare const ESCALATION_REASONS: readonly ["human_token", "non_text", "refusal", "rate_cap", "policy_block", "send_failed", "deadman", "brain_error", "manual", "opt_out", "state_unavailable"];
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
 * May we contact this person?
 *
 * One predicate, because this rule was hand-inlined in five places — the
 * webhook's consent gate, the reply route, the send job, the voice booking-link
 * function and the view model — and a rule about not contacting people who
 * asked to be left alone is the last one that should drift. Five copies is five
 * chances for the next send path to check only `consent` and miss `dnc`.
 *
 * Both columns matter and either alone is decisive:
 *   consent  the state machine the customer drives — 'unknown' | 'opted_in'
 *            | 'opted_out', written by ingest when they text STOP or START.
 *   dnc      the operator-settable override, for a request made by phone, in
 *            person, or by a regulator.
 *
 * Absence is NOT an opt-out. Both fields are optional here because a caller may
 * be holding a row selected before these columns were projected, and reading a
 * missing value as a block would silence every contact the moment somebody
 * forgot a column in a SELECT.
 */
interface ConsentBearing {
    consent?: string | null;
    dnc?: boolean | null;
}
declare function isOptedOutContact(c: ConsentBearing): boolean;
/** The customer-facing reason, used wherever a refusal is explained. */
declare const OPT_OUT_REFUSAL = "This customer asked to stop receiving messages. They can text START to opt back in.";

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
    status?: string;
    created_at: string;
}
interface ConversationDto {
    id: string;
    state: "open" | "needs_human" | "snoozed" | "archived";
    paused_until: string | null;
    snooze_until?: string | null;
    assignee_user_id?: string | null;
    assignee_is_me?: boolean;
    last_wa_inbound_at?: string | null;
    last_message_at: string | null;
    contact: {
        id: string;
        display_name: string | null;
        wa_profile_name: string | null;
        phone_e164: string | null;
        /** 'unknown' | 'opted_in' | 'opted_out'. Absent on payloads written before
         *  opt-out was enforced, which is why every reader treats it as optional
         *  and only 'opted_out'/dnc blocks — never the absence of a value. */
        consent?: string | null;
        dnc?: boolean | null;
    };
    messages: MessageDto[];
}
/** The customer asked not to be contacted. Delegates to the one predicate in
 *  ./consent so the view model and every send path cannot disagree. */
declare function isOptedOut(dto: Pick<ConversationDto, "contact">): boolean;
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
    /** Epoch ms of the previewed message — the SORT key. Rows were being
     *  ordered by localeCompare on display strings ("Aug 26" vs "3:22 AM"),
     *  which is not an ordering at all. */
    ts: number;
    live?: boolean;
    /** False when the customer has only ever phoned. Their calls already have
     *  their own rows, so a chat row with nothing to preview is pure duplication. */
    hasChat: boolean;
}
/** The display name for a contact, without building a whole thread viewmodel
 *  to read one field (Today was doing exactly that per open escalation). */
declare function contactName(dto: ConversationDto): string;
/** The "WhatsApp · +1 …" subtitle line, same source as the thread viewmodel. */
declare function contactMeta(dto: ConversationDto): string;
declare function messageText(m: MessageDto): string;
interface EscalationDto {
    id: string;
    reason: string;
    details: string | null;
    state: "open" | "resolved";
    created_at: string;
}
declare const ESCALATION_REASON_LABELS: Record<string, string>;
/** "8m" / "3h" / "2d". An overnight wait is the NORMAL case for a morning
 *  brief, and "561 min" is not a number anyone reads as half a day. */
declare function formatWaited(ms: number): string;
interface InboxThreadVM {
    id: string;
    real: true;
    conversationId: string;
    escalationId: string | null;
    windowOpen: boolean;
    /** The customer asked to stop receiving messages. Stronger than a closed
     *  24h window: an approved template can't reach them either. */
    optedOut: boolean;
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
        warn?: boolean;
    }>;
    lastAt: string;
    lastAtFull: string;
    unread: boolean;
    pinned: false;
    value?: number;
    tags: string[];
    confidence?: number;
    priority: "P2";
    waitingMin?: number;
    wake?: string;
    timeline: Array<{
        type: "msg";
        from: "client" | "agent";
        channel: string;
        at: string;
        body: string;
        byYou?: boolean;
        status?: string;
        messageId?: string;
    } | {
        type: "event";
        kind: string;
        at: string;
        body: string;
    }>;
}
declare function toInboxThreadVM(dto: ConversationDto, escalation: EscalationDto | null, now?: Date): InboxThreadVM;
declare function toConversationVM(dto: ConversationDto, now?: Date): ConversationVM;
interface CallDto {
    id: string;
    retell_call_id: string;
    direction: "inbound" | "outbound";
    call_type: string | null;
    status: string;
    from_e164: string | null;
    from_raw: string | null;
    to_e164: string | null;
    started_at: string | null;
    ended_at: string | null;
    duration_ms: number | null;
    disconnection_reason: string | null;
    sentiment: string | null;
    call_successful: boolean | null;
    in_voicemail: boolean | null;
    summary: string | null;
    transcript_object: Array<{
        role?: string;
        content?: string;
        words?: Array<{
            start?: number;
        }>;
    }> | null;
    /** storage_path and provider_url are stripped server-side — audio is only
     *  reachable through the signed-URL route. */
    recording: {
        fetch_state?: string;
        mime?: string | null;
        bytes?: number;
    } | null;
    conversation_id: string | null;
    contact_id: string | null;
    message_id: string | null;
    contact: {
        display_name: string | null;
        wa_profile_name: string | null;
        phone_e164: string | null;
    } | null;
}
/** Why the call ended, in words a salon owner uses. */
declare const DISCONNECTION_LABELS: Record<string, string>;
interface CallVM {
    id: string;
    real: true;
    callId: string;
    who: string;
    whoShort: string;
    initials: string;
    clientId: null;
    channel: "phone";
    agent: {
        glyph: string;
        name: string;
    };
    at: string;
    duration?: string;
    ts: number;
    outcome: "live" | "handled";
    live?: boolean;
    snippet: string;
    summary: {
        headline: string;
        bullets: string[];
    };
    transcript: Array<{
        t: string;
        speaker: "agent" | "client";
        text: string;
    }>;
    recordingState: "ready" | "pending" | "none";
    recordingUrl?: string;
    threadId?: string;
}
declare function toCallVM(dto: CallDto, now?: Date): CallVM;

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

/**
 * Today (Slice 4): the morning brief.
 *
 * The rule that shapes every line below: a number that cannot be traced to a
 * row does not appear, and a region with nothing true to say is not rendered
 * at all rather than rendered empty. Zero traffic stated positively — with a
 * timestamp and a channel status — is reassurance; the same morning rendered
 * as four zeroes and a flat sparkline reads as a product that died overnight.
 *
 * Every clock value comes from the SERVER's tenant-local time, never the
 * browser's: the owner of a New York salon checking from Madrid must still be
 * told what time it is at the salon.
 */

interface MetricsSummaryDto {
    workspace: {
        name: string;
        timezone: string;
        status: string;
    };
    channels: Array<{
        kind: string;
        status: string;
        number: string | null;
    }>;
    window: {
        days: number;
        since: string;
        since_local: string;
        now_local: string;
    };
    now: {
        escalations_open: number;
        oldest_open_escalation_at: string | null;
        threads_needing_human: number;
        threads_snoozed: number;
        threads_awaiting_reply: number;
        last_inbound_at: string | null;
        last_outbound_at: string | null;
    };
    period: {
        messages_in: number;
        messages_out_ai: number;
        messages_out_you: number;
        conversations_active: number;
        answered_by_ai: number;
        answered_by_you: number;
        unanswered_in_window: number;
        median_reply_seconds_ai: number | null;
        send_failures: number;
        escalations_new: number;
        escalation_reasons: Record<string, number>;
        calls: number;
        call_seconds: number;
        call_sentiments: Record<string, number>;
        calls_voicemail: number;
        new_contacts: number;
    };
}
interface TodayNeedsRowVM {
    id: string;
    conversationId: string;
    escalationId: string;
    who: string;
    reason: string;
    waited: string;
    warn: boolean;
    quote: string;
    meta: string;
    windowNote: string | null;
    to: string;
}
interface TodayCallRowVM {
    id: string;
    who: string;
    at: string;
    duration: string;
    note: string;
    to: string;
}
interface TodayFactVM {
    label: string;
    value: string;
    hint?: string;
}
interface TodaySentenceVM {
    text: string;
    /** True for the one line that must never read as calm: a reply that
     *  failed to deliver. */
    warn?: boolean;
}
interface TodayVM {
    standing: {
        eyebrow: string;
        chips: Array<{
            text: string;
            ok: boolean;
        }>;
        alert: string | null;
        greeting: string;
        headline: string;
        detail: string | null;
        tone: "needs" | "calm" | "alert";
    };
    needsYou: {
        count: number;
        hint: string;
        rows: TodayNeedsRowVM[];
        empty: string | null;
    } | null;
    windowClosing: {
        label: string;
        hint: string;
        rows: Array<{
            id: string;
            text: string;
            to: string;
        }>;
    } | null;
    recap: {
        label: string;
        sentences: TodaySentenceVM[];
        facts: TodayFactVM[];
        receipts: Array<{
            at: string;
            text: string;
            to: string;
        }>;
    } | null;
    /** Answered-by-AI ratio for the hero arc — null when nothing came in
     *  (an arc of 0/0 is a gauge with no needle). */
    pulse: {
        num: number;
        den: number;
    } | null;
    calls: {
        line: string;
        rows: TodayCallRowVM[];
    } | null;
    launchpad: Array<{
        label: string;
        to: string;
    }>;
    updatedAt: string;
    quiet: {
        headline: string;
        sub: string;
        proof: Array<{
            label: string;
            value: string;
        }>;
        launchpad: {
            label: string;
            to: string;
        } | null;
    } | null;
}
declare function toTodayVM(m: MetricsSummaryDto, conversations: ConversationDto[], escalations: Array<EscalationDto & {
    conversation_id: string;
}>, calls: CallDto[], now?: Date): TodayVM;

/**
 * Control plane types (PRD E1/E3/E4) — the single source every boundary
 * imports: the Settings form, the /v1 routes, and the edge runtime all parse
 * the same schemas, so an option that exists in the UI exists in the runtime
 * by construction (anti-junk rule R1).
 */

declare const ROLES: readonly ["owner", "operator", "viewer"];
type Role = (typeof ROLES)[number];
/** What each role may do. Mirrors the mockup's ST_PERMS exactly — the client
 *  gate() chips read this shape; the server re-checks via requireRole. */
declare const ROLE_PERMS: Record<Role, {
    approve: boolean;
    autonomy: boolean;
    disconnect: boolean;
    billing: boolean;
    team: boolean;
}>;
declare const POLICY_CLASSES: readonly ["reply", "booking", "faq", "reengage", "campaign", "money"];
type PolicyClass = (typeof POLICY_CLASSES)[number];
/** 'veto' exists in the enum (and the DB CHECK) but is NOT offered by any UI
 *  until the drafts/countdown engine exists — R1: no option without an
 *  enforcer. The runtime treats an unexpected mode as 'ask' (fail safe). */
declare const POLICY_MODES: readonly ["auto", "veto", "ask", "never"];
type PolicyMode = (typeof POLICY_MODES)[number];
declare const PolicyLimitsSchema: z.ZodObject<{
    max_replies_day: z.ZodOptional<z.ZodNumber>;
    pause_hours: z.ZodOptional<z.ZodNumber>;
}, "strict", z.ZodTypeAny, {
    max_replies_day?: number | undefined;
    pause_hours?: number | undefined;
}, {
    max_replies_day?: number | undefined;
    pause_hours?: number | undefined;
}>;
type PolicyLimits = z.infer<typeof PolicyLimitsSchema>;
interface PolicyRow {
    id: string;
    class: PolicyClass;
    mode: PolicyMode;
    subject_type: "segment" | "contact" | null;
    subject_id: string | null;
    limits: PolicyLimits;
    updated_at: string;
}
declare const BrainConfigSchema: z.ZodObject<{
    business_name: z.ZodString;
    phone_display: z.ZodString;
    booking_link: z.ZodString;
    /** The complete system prompt the model receives — the "AI memory" pane's
     *  one hard promise is that what it shows is EXACTLY this, nothing more. */
    system_prompt: z.ZodString;
    fallbacks: z.ZodObject<{
        /** Sent when no model key is configured. */
        greeting: z.ZodString;
        /** Sent when the model call failed. */
        error: z.ZodString;
        /** Sent for voice notes / photos before escalating. */
        non_text: z.ZodString;
    }, "strict", z.ZodTypeAny, {
        non_text: string;
        greeting: string;
        error: string;
    }, {
        non_text: string;
        greeting: string;
        error: string;
    }>;
}, "strict", z.ZodTypeAny, {
    business_name: string;
    phone_display: string;
    booking_link: string;
    system_prompt: string;
    fallbacks: {
        non_text: string;
        greeting: string;
        error: string;
    };
}, {
    business_name: string;
    phone_display: string;
    booking_link: string;
    system_prompt: string;
    fallbacks: {
        non_text: string;
        greeting: string;
        error: string;
    };
}>;
type BrainConfig = z.infer<typeof BrainConfigSchema>;
declare const NotificationsConfigSchema: z.ZodObject<{
    escalation_emails: z.ZodArray<z.ZodString, "many">;
    from: z.ZodOptional<z.ZodString>;
}, "strict", z.ZodTypeAny, {
    escalation_emails: string[];
    from?: string | undefined;
}, {
    escalation_emails: string[];
    from?: string | undefined;
}>;
type NotificationsConfig = z.infer<typeof NotificationsConfigSchema>;
/**
 * The whole tenant_config.config column. Sections are optional — a tenant with
 * no brain section is a tenant whose receptionist does not speak (persist +
 * escalate only). Safe-by-default beats a leaked persona.
 *
 * DELIBERATELY NOT `.strict()` AT THE TOP LEVEL, while each SECTION still is.
 *
 * The edge and the dashboard are separate Vercel projects that deploy
 * independently. With a strict top level, the first dashboard deploy to write a
 * new section — `guardrails`, a per-tenant allowlist, anything — would be
 * rejected in its entirety by the older edge still running beside it. The
 * receptionist would go completely silent on a live line, and it would be
 * logged identically to "no brain profile configured": a total mute that reads
 * as a configuration absence.
 *
 * Unknown top-level keys are therefore STRIPPED rather than fatal, so an older
 * edge ignores a section it has never heard of and keeps answering with the
 * persona it does understand. Strictness stays where it catches real mistakes:
 * inside a section, where a typo means a field the runtime silently would not
 * apply.
 */
declare const TenantConfigSchema: z.ZodObject<{
    brain: z.ZodOptional<z.ZodObject<{
        business_name: z.ZodString;
        phone_display: z.ZodString;
        booking_link: z.ZodString;
        /** The complete system prompt the model receives — the "AI memory" pane's
         *  one hard promise is that what it shows is EXACTLY this, nothing more. */
        system_prompt: z.ZodString;
        fallbacks: z.ZodObject<{
            /** Sent when no model key is configured. */
            greeting: z.ZodString;
            /** Sent when the model call failed. */
            error: z.ZodString;
            /** Sent for voice notes / photos before escalating. */
            non_text: z.ZodString;
        }, "strict", z.ZodTypeAny, {
            non_text: string;
            greeting: string;
            error: string;
        }, {
            non_text: string;
            greeting: string;
            error: string;
        }>;
    }, "strict", z.ZodTypeAny, {
        business_name: string;
        phone_display: string;
        booking_link: string;
        system_prompt: string;
        fallbacks: {
            non_text: string;
            greeting: string;
            error: string;
        };
    }, {
        business_name: string;
        phone_display: string;
        booking_link: string;
        system_prompt: string;
        fallbacks: {
            non_text: string;
            greeting: string;
            error: string;
        };
    }>>;
    notifications: z.ZodOptional<z.ZodObject<{
        escalation_emails: z.ZodArray<z.ZodString, "many">;
        from: z.ZodOptional<z.ZodString>;
    }, "strict", z.ZodTypeAny, {
        escalation_emails: string[];
        from?: string | undefined;
    }, {
        escalation_emails: string[];
        from?: string | undefined;
    }>>;
}, "strip", z.ZodTypeAny, {
    brain?: {
        business_name: string;
        phone_display: string;
        booking_link: string;
        system_prompt: string;
        fallbacks: {
            non_text: string;
            greeting: string;
            error: string;
        };
    } | undefined;
    notifications?: {
        escalation_emails: string[];
        from?: string | undefined;
    } | undefined;
}, {
    brain?: {
        business_name: string;
        phone_display: string;
        booking_link: string;
        system_prompt: string;
        fallbacks: {
            non_text: string;
            greeting: string;
            error: string;
        };
    } | undefined;
    notifications?: {
        escalation_emails: string[];
        from?: string | undefined;
    } | undefined;
}>;
type TenantConfig = z.infer<typeof TenantConfigSchema>;
type TenantConfigParse = {
    ok: true;
    config: TenantConfig;
} | {
    ok: false;
    issues: string[];
};
/**
 * Parse unknown JSONB into TenantConfig.
 *
 * Returns the ISSUES rather than a bare null, because the runtime needs to tell
 * "this tenant has not been configured" from "this tenant's configuration is
 * broken". Both end in silence, but only one of them is somebody's mistake, and
 * collapsing them meant an operator reading "no brain profile configured" while
 * a perfectly good persona sat in the database behind one bad field.
 */
declare function parseTenantConfigResult(raw: unknown): TenantConfigParse;
/** Convenience for callers that genuinely cannot act on the difference. */
declare function parseTenantConfig(raw: unknown): TenantConfig | null;

export { ACTOR_TYPES, type ActorType, AppError, type BrainConfig, BrainConfigSchema, CHANNEL_KINDS, CONSENT_STATES, CONVERSATION_STATES, type CallDto, type CallVM, type ChannelKind, type ConsentBearing, type ConsentState, type ConversationDto, type ConversationMessageVM, type ConversationState, type ConversationVM, DECISION_SUBJECTS, DECISION_VERBS, DISCONNECTION_LABELS, type DecisionSubject, type DecisionVerb, ERROR_CODES, ESCALATION_REASONS, ESCALATION_REASON_LABELS, ESCALATION_STATES, EVENT_KINDS, type Envelope, type Err, type ErrorCode, type EscalationDto, type EscalationReason, type EscalationState, type EventKind, type InboxThreadVM, JOB_KINDS, JOB_STATES, type JobKind, type JobState, MEMBERSHIP_ROLES, MESSAGE_CHANNELS, MESSAGE_DIRECTIONS, MESSAGE_SENDERS, MESSAGE_STATUSES, MESSAGE_TYPES, type MembershipRole, type MessageChannel, type MessageDirection, type MessageDto, type MessageSender, type MessageStatus, type MessageType, type MetricsSummaryDto, type NotificationsConfig, NotificationsConfigSchema, OPT_IN_PATTERN, OPT_OUT_PATTERN, OPT_OUT_REFUSAL, type Ok, POLICY_CLASSES, POLICY_MODES, type PolicyClass, type PolicyLimits, PolicyLimitsSchema, type PolicyMode, type PolicyRow, ROLES, ROLE_PERMS, type Role, TEMPLATE_STATUSES, TENANT_STATUSES, type TemplateStatus, type TenantConfig, type TenantConfigParse, TenantConfigSchema, type TenantStatus, type TodayCallRowVM, type TodayFactVM, type TodayNeedsRowVM, type TodaySentenceVM, type TodayVM, WA_WINDOW_MS, type WaWindow, contactMeta, contactName, err, formatPhoneDisplay, formatWaited, isOptedOut, isOptedOutContact, messageText, normalizePhone, ok, parseTenantConfig, parseTenantConfigResult, toCallVM, toConversationVM, toInboxThreadVM, toTodayVM, violatesNoPrices, waWindow };
