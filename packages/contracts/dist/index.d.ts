import { z } from 'zod';

/** Closed error-code enum for the /api/v1 envelope (Blueprint §4). */
declare const ERROR_CODES: readonly ["unauthorized", "forbidden", "not_found", "validation", "conflict", "rate_limited", "window_closed", "upstream_meta", "upstream_retell", "upstream_anthropic", "upstream_email", "upstream_auth", "internal"];
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
declare const JOB_KINDS: readonly ["outbound_send", "veto_fire", "snooze_wake", "pause_expire", "media_fetch", "rollup_daily", "deadman", "report_weekly", "broadcast_send", "blob_thread_erase"];
type JobKind = (typeof JOB_KINDS)[number];
declare const JOB_STATES: readonly ["scheduled", "fired", "canceled", "failed"];
type JobState = (typeof JOB_STATES)[number];
/** Dot-namespaced event kinds emitted so far (grows per slice). */
declare const EVENT_KINDS: readonly ["message.received", "message.sent", "message.status", "escalation.opened", "contact.consent_changed", "usage.llm_tokens", "usage.wa_conversation", "ingest.allowlist_skip", "ingest.pg_failed", "message.send_failed", "message.send_blocked", "message.send_raced_cancel", "conversation.reopened", "conversation.pause_expired", "contact.erased", "contact.blob_erased"];
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
declare const ESCALATION_REASONS: readonly ["human_token", "non_text", "refusal", "rate_cap", "policy_block", "send_failed", "deadman", "brain_error", "manual", "opt_out", "state_unavailable", "stale", "person_hold"];
type EscalationReason = (typeof ESCALATION_REASONS)[number];
declare const ESCALATION_STATES: readonly ["open", "resolved"];
type EscalationState = (typeof ESCALATION_STATES)[number];
declare const DECISION_VERBS: readonly ["approve", "edit", "decline", "snooze", "wake", "take_over", "hand_back", "resolve", "archive", "reply", "cancel_send", "pause_agent", "resume_agent", "invite", "revoke_invite", "change_role", "remove_member", "erase"];
type DecisionVerb = (typeof DECISION_VERBS)[number];
declare const DECISION_SUBJECTS: readonly ["conversation", "escalation", "draft", "lead", "message", "agent", "membership", "invitation", "contact"];
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
    /**
     * When the event actually happened on its channel, as the provider reported
     * it — Meta's message timestamp, or the moment a call started.
     *
     * `created_at` is when WE wrote the row, which is the same thing for a live
     * WhatsApp message and emphatically not for a call: three calls placed at
     * 20:59, 21:01 and 23:39 were imported in one batch and rendered as three
     * rows one second apart, all reading "1:59 AM". The true time was already in
     * this column; nothing selected it.
     */
    channel_ts?: string | null;
}
/** When a message happened, preferring the channel's own clock over ours. */
declare function messageAt(m: MessageDto): string;
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
    /** Where it happened. A call note is not a WhatsApp bubble, and the
     *  viewer must not draw it as one. */
    channel: "whatsapp" | "phone";
    at: string;
    text: string;
    /** "Canceled before sending", "Sending…" — absent when there is nothing to
     *  say, which for an ordinary sent message is the honest answer. */
    statusLabel?: string;
    /** False when these words never reached the customer. The bubble must not
     *  read as part of the conversation, because it was not. */
    reachedCustomer?: boolean;
}
/**
 * What happened to a message we tried to send, in the operator's words.
 *
 * ONE vocabulary. The Inbox had its own ternary and the Conversations pane had
 * nothing at all, so the same message read as "Canceled before sending" on one
 * screen and as an ordinary delivered reply on the other — and Conversations is
 * the screen whose entire job is "what is my receptionist saying to people".
 */
declare function messageStatusLabel(status: string | undefined): string | undefined;
/** Did the customer actually receive these words? */
declare function reachedCustomer(status: string | undefined): boolean;
interface ConversationVM {
    id: string;
    who: string;
    /** First name, or the whole thing when it is a number. */
    whoShort: string;
    initials: string;
    clientId: string | null;
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
declare function shortTime(iso: string | null, now: Date): string;
/** The display name for a contact, without building a whole thread viewmodel
 *  to read one field (Today was doing exactly that per open escalation). */
declare function contactName(dto: ConversationDto): string;
/** The "WhatsApp · +1 …" subtitle line, same source as the thread viewmodel. */
declare function contactMeta(dto: ConversationDto): string;
declare function initialsOf(name: string): string;
/**
 * A reply the receptionist has WRITTEN but not sent — it is sitting out its veto
 * window, and until that expires a human can withdraw or replace it.
 *
 * The distinction matters most in the UI: rendered as an ordinary agent bubble a
 * held draft looks exactly like a message the customer has already read, so an
 * operator would either ignore it or apologise for something that never went out.
 */
declare function isHeldDraft(m: MessageDto): boolean;
/** When a held draft is due to send, in epoch ms. */
declare function draftSendsAtMs(m: MessageDto): number;
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
    /** The contact behind the thread — where "Open client" goes now that People is real. */
    clientId: string | null;
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
    /**
     * This thread is waiting on a human, and no human has it yet.
     *
     * THE definition of "needs you", emitted once. It was previously re-derived
     * in the Inbox JSX and separately approximated by /metrics' escalations_open,
     * which Today then dispatched over the top of the Inbox's number to "correct"
     * it — two rules that disagree whenever an escalation is open on a thread
     * someone has already claimed, racing to write the same badge.
     */
    needsYou: boolean;
    /**
     * The receptionist's reply, written and waiting out its veto window.
     *
     * Lifted to the thread so the pane can offer the controls without scanning
     * the timeline for them — and so "is there still something I can stop?" is a
     * single truthy check rather than a search that could miss.
     */
    heldDraft: {
        messageId: string;
        body: string;
        sendsAtMs: number;
    } | null;
    /**
     * The SAME shape the mockup's VetoBar and Composer already read.
     *
     * The design for this existed before the backend did — a countdown, Edit /
     * Hold / Take over, and a composer pre-filled with the draft. Mapping the
     * real held reply onto it means the feature arrives as the product was
     * drawn, rather than as a second control that looks nothing like it.
     *
     * `endsAtMs` is the SERVER's deadline. The mockup runs its own countdown in
     * VW_STORE and fabricates the send at zero; on a real thread the job fires
     * server-side and the UI only reports what is already true.
     */
    veto?: {
        window: number;
        draft: string;
        endsAtMs: number;
        messageId: string;
    };
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
        /** Written but NOT sent — sitting out its veto window. */
        pending?: true;
        /** When it fires, epoch ms. Drives the countdown. */
        sendsAtMs?: number;
        /** Per-bubble attribution — a phone summary is not the WhatsApp agent. */
        agentName?: string;
        agentGlyph?: string;
    } | {
        type: "event";
        kind: string;
        at: string;
        body: string;
    }>;
}
/**
 * Where a thread sits and who owes it work — the single implementation.
 *
 * Exported so the sidebar badge and Today's brief can agree without either one
 * re-deriving it. /metrics' `escalations_open` is NOT this number: it counts
 * open escalations, including ones a teammate has already claimed, so it reads
 * high exactly when someone is doing the work.
 */
declare function threadStanding(dto: ConversationDto, escalation: EscalationDto | null, now?: Date): {
    state: InboxThreadVM["state"];
    takenOver: boolean;
    needsYou: boolean;
};
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
    /** Moves on every provider event — the heartbeat isLiveCall() reads. */
    updated_at?: string | null;
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
    clientId: string | null;
    channel: "phone";
    agent: {
        glyph: string;
        name: string;
    };
    at: string;
    duration?: string;
    ts: number;
    /** live: in progress under the heartbeat rule · missed: the dial never
     *  connected (Retell's not_connected) · handled: everything else. */
    outcome: "live" | "handled" | "missed";
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
    recordingState: "ready" | "pending" | "failed" | "none";
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
 * How long a call may go without any sign of life before we stop calling it
 * live, whatever its status column says.
 *
 * `calls.status = 'ongoing'` is written from Retell's own `call_status`, and it
 * is only ever cleared by a later webhook. So a single lost `call_ended` — a
 * deploy mid-call, a provider blip, a 500 on our side — leaves that row
 * `ongoing` FOREVER, and anything reading the flag alone shows a call in
 * progress that hung up days ago. A status flag is a claim; this is the
 * evidence.
 *
 * Ten minutes, not ninety seconds, and the difference is a deployment fact
 * rather than a preference: with only `call_started` and `call_ended`
 * configured on the Retell webhook, nothing touches the row between them, so a
 * tight bound would declare every ordinary call dead a minute into it. Enabling
 * the `transcript_updated` event — which fires on every turn — makes the
 * heartbeat continuous and this bound effectively tight, at which point it can
 * come down.
 *
 * This is a DISPLAY guard, not the fix. It bounds how long a phantom can be
 * shown; only reconciling against the provider makes the row itself honest.
 */
declare const CALL_HEARTBEAT_MS: number;
declare function isLiveCall(call: {
    status: string;
    updated_at?: string | null;
    started_at?: string | null;
}, now?: Date): boolean;
/**
 * How long the receptionist holds its own reply before sending it.
 *
 * A text channel is not a phone call. Nobody expects a WhatsApp answer in under
 * a second, so a short pause costs the customer nothing — and it converts the
 * only two options a business had, "let the bot speak" or "turn the bot off",
 * into a third: let it draft, and redirect it before the customer ever sees it.
 * Correcting a message that has already been read is not a feature; this is.
 */
declare const REPLY_DELAY_DEFAULT_MS = 30000;
declare const REPLY_DELAY_MIN_MS = 5000;
declare const REPLY_DELAY_MAX_MS = 600000;
/**
 * The wait for THIS reply, in ms. Zero means send now.
 *
 * Clamped rather than trusted: `limits` is tenant-editable JSON, and a typo of
 * one extra zero would leave a customer waiting hours for an answer the bot had
 * already written. A configuration mistake should degrade the experience by
 * seconds, never strand someone.
 */
declare function replyDelayMs(mode: string | null | undefined, limits?: {
    reply_delay_ms?: number;
} | null): number;

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
    settings: boolean;
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
    /**
     * How long the receptionist WAITS before its own reply goes out, in ms.
     *
     * Only meaningful when mode is 'veto'. A text channel is not a phone
     * call — nobody expects an answer in under a second — so the delay costs
     * the customer nothing and buys the business a window to redirect the bot
     * before it speaks, rather than apologising for it afterwards.
     */
    reply_delay_ms: z.ZodOptional<z.ZodNumber>;
}, "strict", z.ZodTypeAny, {
    max_replies_day?: number | undefined;
    pause_hours?: number | undefined;
    reply_delay_ms?: number | undefined;
}, {
    max_replies_day?: number | undefined;
    pause_hours?: number | undefined;
    reply_delay_ms?: number | undefined;
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
/**
 * One stretch of the day the doors are open.
 *
 * DELIBERATELY LENIENT — no .strict(), no .refine(), no length bounds.
 *
 * This schema is on the READ path: apps/edge parses it out of the database on
 * every inbound message, and a parse failure there is not a warning. It sets
 * configBroken, the WhatsApp receptionist stops replying, and the voice agent
 * is handed no facts at all. Rules that reject a stored row are rules that
 * mute a live line, so the shape is all that lives here. Everything that can
 * be WRONG rather than malformed — reversed times, overlapping shifts, a
 * calendar date that does not exist — is checked on the way IN, and the
 * composer is written to tell the truth about whatever is already stored.
 */
declare const IntervalSchema: z.ZodObject<{
    open: z.ZodString;
    close: z.ZodString;
}, "strip", z.ZodTypeAny, {
    open: string;
    close: string;
}, {
    open: string;
    close: string;
}>;
declare const HoursSchema: z.ZodObject<{
    /** "09:00". Absent or null = closed that day, which is a real answer. */
    open: z.ZodOptional<z.ZodNullable<z.ZodString>>;
    close: z.ZodOptional<z.ZodNullable<z.ZodString>>;
    /**
     * Split shifts — 09:30-13:00 and 15:00-19:00, the lunch break a salon
     * actually keeps. Additive: a day that has always been one stretch keeps
     * saying so with open/close, and no stored config is rewritten.
     */
    intervals: z.ZodOptional<z.ZodArray<z.ZodObject<{
        open: z.ZodString;
        close: z.ZodString;
    }, "strip", z.ZodTypeAny, {
        open: string;
        close: string;
    }, {
        open: string;
        close: string;
    }>, "many">>;
}, "strict", z.ZodTypeAny, {
    open?: string | null | undefined;
    close?: string | null | undefined;
    intervals?: {
        open: string;
        close: string;
    }[] | undefined;
}, {
    open?: string | null | undefined;
    close?: string | null | undefined;
    intervals?: {
        open: string;
        close: string;
    }[] | undefined;
}>;
/**
 * A day the business is shut whatever the weekly grid says.
 *
 * `until` because "closed 24 December to 2 January" is ONE decision an owner
 * makes, and ten separate rows is how a holiday week ends up half-entered.
 *
 * Lenient for the same reason as IntervalSchema. Note the date regex accepts
 * 2026-11-31, which is not a day; the renderer checks that it round-trips and
 * prints the raw string when it does not, rather than confidently naming the
 * wrong date.
 */
declare const ClosureSchema: z.ZodObject<{
    date: z.ZodString;
    until: z.ZodOptional<z.ZodString>;
    note: z.ZodOptional<z.ZodString>;
}, "strip", z.ZodTypeAny, {
    date: string;
    note?: string | undefined;
    until?: string | undefined;
}, {
    date: string;
    note?: string | undefined;
    until?: string | undefined;
}>;
declare const DAYS: readonly ["mon", "tue", "wed", "thu", "fri", "sat", "sun"];
declare const ServiceSchema: z.ZodObject<{
    name: z.ZodString;
    /** Minutes. The receptionist is asked "how long does it take" constantly. */
    duration_min: z.ZodOptional<z.ZodNumber>;
    /**
     * Free text, not a number, and deliberately so: "from $45", "quoted at
     * consult", "varies by length". A price the business cannot state flatly
     * must not be forced into a field that looks like it can.
     */
    price_note: z.ZodOptional<z.ZodString>;
}, "strict", z.ZodTypeAny, {
    name: string;
    duration_min?: number | undefined;
    price_note?: string | undefined;
}, {
    name: string;
    duration_min?: number | undefined;
    price_note?: string | undefined;
}>;
/**
 * The rules that must survive editing.
 *
 * Flags, never prose. A free-text prompt box hands an owner the ability to
 * delete the price policy, the never-confirm-a-booking rule and the AI
 * disclosure without knowing they have — and nothing downstream could tell.
 * Composed in every time, and default ON: the safe reading of an absent value.
 */
declare const GuardrailsSchema: z.ZodObject<{
    never_quote_prices: z.ZodOptional<z.ZodBoolean>;
    never_confirm_booking: z.ZodOptional<z.ZodBoolean>;
    disclose_ai: z.ZodOptional<z.ZodBoolean>;
    /**
     * OPT-IN, unlike the three above. Those default on because absent means
     * "the safe reading"; this one arrived after prompts were live, and a
     * rule that defaulted on would have changed every composed prompt in
     * production the moment it deployed.
     */
    no_health_advice: z.ZodOptional<z.ZodBoolean>;
}, "strict", z.ZodTypeAny, {
    never_quote_prices?: boolean | undefined;
    never_confirm_booking?: boolean | undefined;
    disclose_ai?: boolean | undefined;
    no_health_advice?: boolean | undefined;
}, {
    never_quote_prices?: boolean | undefined;
    never_confirm_booking?: boolean | undefined;
    disclose_ai?: boolean | undefined;
    no_health_advice?: boolean | undefined;
}>;
/**
 * A thing the receptionist should know that fits no field — the academy, the
 * chair rental, the parking. One topic each, said by BOTH receptionists. The
 * long tail that a knowledge base would hold later; never the hours or the
 * booking link, which have fields.
 */
declare const NoteSchema: z.ZodObject<{
    title: z.ZodString;
    text: z.ZodString;
}, "strict", z.ZodTypeAny, {
    text: string;
    title: string;
}, {
    text: string;
    title: string;
}>;
type Note = z.infer<typeof NoteSchema>;
/** E.164: a plus, then 7–15 digits, no leading zero. */
declare const E164: RegExp;
declare const BusinessProfileSchema: z.ZodObject<{
    address: z.ZodOptional<z.ZodString>;
    hours: z.ZodOptional<z.ZodRecord<z.ZodEnum<["mon", "tue", "wed", "thu", "fri", "sat", "sun"]>, z.ZodObject<{
        /** "09:00". Absent or null = closed that day, which is a real answer. */
        open: z.ZodOptional<z.ZodNullable<z.ZodString>>;
        close: z.ZodOptional<z.ZodNullable<z.ZodString>>;
        /**
         * Split shifts — 09:30-13:00 and 15:00-19:00, the lunch break a salon
         * actually keeps. Additive: a day that has always been one stretch keeps
         * saying so with open/close, and no stored config is rewritten.
         */
        intervals: z.ZodOptional<z.ZodArray<z.ZodObject<{
            open: z.ZodString;
            close: z.ZodString;
        }, "strip", z.ZodTypeAny, {
            open: string;
            close: string;
        }, {
            open: string;
            close: string;
        }>, "many">>;
    }, "strict", z.ZodTypeAny, {
        open?: string | null | undefined;
        close?: string | null | undefined;
        intervals?: {
            open: string;
            close: string;
        }[] | undefined;
    }, {
        open?: string | null | undefined;
        close?: string | null | undefined;
        intervals?: {
            open: string;
            close: string;
        }[] | undefined;
    }>>>;
    /** Dates the business is shut regardless of the weekly grid. */
    closures: z.ZodOptional<z.ZodArray<z.ZodObject<{
        date: z.ZodString;
        until: z.ZodOptional<z.ZodString>;
        note: z.ZodOptional<z.ZodString>;
    }, "strip", z.ZodTypeAny, {
        date: string;
        note?: string | undefined;
        until?: string | undefined;
    }, {
        date: string;
        note?: string | undefined;
        until?: string | undefined;
    }>, "many">>;
    services: z.ZodOptional<z.ZodArray<z.ZodObject<{
        name: z.ZodString;
        /** Minutes. The receptionist is asked "how long does it take" constantly. */
        duration_min: z.ZodOptional<z.ZodNumber>;
        /**
         * Free text, not a number, and deliberately so: "from $45", "quoted at
         * consult", "varies by length". A price the business cannot state flatly
         * must not be forced into a field that looks like it can.
         */
        price_note: z.ZodOptional<z.ZodString>;
    }, "strict", z.ZodTypeAny, {
        name: string;
        duration_min?: number | undefined;
        price_note?: string | undefined;
    }, {
        name: string;
        duration_min?: number | undefined;
        price_note?: string | undefined;
    }>, "many">>;
    languages: z.ZodOptional<z.ZodArray<z.ZodString, "many">>;
    guardrails: z.ZodOptional<z.ZodObject<{
        never_quote_prices: z.ZodOptional<z.ZodBoolean>;
        never_confirm_booking: z.ZodOptional<z.ZodBoolean>;
        disclose_ai: z.ZodOptional<z.ZodBoolean>;
        /**
         * OPT-IN, unlike the three above. Those default on because absent means
         * "the safe reading"; this one arrived after prompts were live, and a
         * rule that defaulted on would have changed every composed prompt in
         * production the moment it deployed.
         */
        no_health_advice: z.ZodOptional<z.ZodBoolean>;
    }, "strict", z.ZodTypeAny, {
        never_quote_prices?: boolean | undefined;
        never_confirm_booking?: boolean | undefined;
        disclose_ai?: boolean | undefined;
        no_health_advice?: boolean | undefined;
    }, {
        never_quote_prices?: boolean | undefined;
        never_confirm_booking?: boolean | undefined;
        disclose_ai?: boolean | undefined;
        no_health_advice?: boolean | undefined;
    }>>;
    /** What must reach a person. One short line each. */
    escalate_when: z.ZodOptional<z.ZodArray<z.ZodString, "many">>;
    tone: z.ZodOptional<z.ZodString>;
    /**
     * The line a PERSON answers. The phone receptionist warm-transfers here
     * during opening hours; absent, it takes a message instead. Never the
     * receptionist's own line — that would ring itself.
     */
    handoff_number: z.ZodOptional<z.ZodString>;
    website: z.ZodOptional<z.ZodString>;
    notes: z.ZodOptional<z.ZodArray<z.ZodObject<{
        title: z.ZodString;
        text: z.ZodString;
    }, "strict", z.ZodTypeAny, {
        text: string;
        title: string;
    }, {
        text: string;
        title: string;
    }>, "many">>;
    /**
     * Anything the owner wants said that no field covers.
     *
     * The escape hatch that keeps this model honest — without it, structuring
     * the facts would mean losing whatever did not fit, and the first migration
     * would be a downgrade.
     */
    extra_instructions: z.ZodOptional<z.ZodString>;
}, "strict", z.ZodTypeAny, {
    address?: string | undefined;
    hours?: Partial<Record<"mon" | "tue" | "wed" | "thu" | "fri" | "sat" | "sun", {
        open?: string | null | undefined;
        close?: string | null | undefined;
        intervals?: {
            open: string;
            close: string;
        }[] | undefined;
    }>> | undefined;
    closures?: {
        date: string;
        note?: string | undefined;
        until?: string | undefined;
    }[] | undefined;
    services?: {
        name: string;
        duration_min?: number | undefined;
        price_note?: string | undefined;
    }[] | undefined;
    languages?: string[] | undefined;
    guardrails?: {
        never_quote_prices?: boolean | undefined;
        never_confirm_booking?: boolean | undefined;
        disclose_ai?: boolean | undefined;
        no_health_advice?: boolean | undefined;
    } | undefined;
    escalate_when?: string[] | undefined;
    tone?: string | undefined;
    handoff_number?: string | undefined;
    website?: string | undefined;
    notes?: {
        text: string;
        title: string;
    }[] | undefined;
    extra_instructions?: string | undefined;
}, {
    address?: string | undefined;
    hours?: Partial<Record<"mon" | "tue" | "wed" | "thu" | "fri" | "sat" | "sun", {
        open?: string | null | undefined;
        close?: string | null | undefined;
        intervals?: {
            open: string;
            close: string;
        }[] | undefined;
    }>> | undefined;
    closures?: {
        date: string;
        note?: string | undefined;
        until?: string | undefined;
    }[] | undefined;
    services?: {
        name: string;
        duration_min?: number | undefined;
        price_note?: string | undefined;
    }[] | undefined;
    languages?: string[] | undefined;
    guardrails?: {
        never_quote_prices?: boolean | undefined;
        never_confirm_booking?: boolean | undefined;
        disclose_ai?: boolean | undefined;
        no_health_advice?: boolean | undefined;
    } | undefined;
    escalate_when?: string[] | undefined;
    tone?: string | undefined;
    handoff_number?: string | undefined;
    website?: string | undefined;
    notes?: {
        text: string;
        title: string;
    }[] | undefined;
    extra_instructions?: string | undefined;
}>;
type BusinessProfile = z.infer<typeof BusinessProfileSchema>;
type Hours = z.infer<typeof HoursSchema>;
type Service = z.infer<typeof ServiceSchema>;
type Interval = z.infer<typeof IntervalSchema>;
type Closure = z.infer<typeof ClosureSchema>;
declare const BrainConfigSchema: z.ZodObject<{
    business_name: z.ZodString;
    phone_display: z.ZodString;
    booking_link: z.ZodString;
    /** The complete system prompt the model receives — the "AI memory" pane's
     *  one hard promise is that what it shows is EXACTLY this, nothing more. */
    system_prompt: z.ZodString;
    /**
     * The business's facts, as fields.
     *
     * Optional: every config written before this existed stays valid, and
     * nothing composes until a workspace actually fills it in. When present
     * it REPLACES system_prompt as the source the prompt is built from.
     */
    profile: z.ZodOptional<z.ZodObject<{
        address: z.ZodOptional<z.ZodString>;
        hours: z.ZodOptional<z.ZodRecord<z.ZodEnum<["mon", "tue", "wed", "thu", "fri", "sat", "sun"]>, z.ZodObject<{
            /** "09:00". Absent or null = closed that day, which is a real answer. */
            open: z.ZodOptional<z.ZodNullable<z.ZodString>>;
            close: z.ZodOptional<z.ZodNullable<z.ZodString>>;
            /**
             * Split shifts — 09:30-13:00 and 15:00-19:00, the lunch break a salon
             * actually keeps. Additive: a day that has always been one stretch keeps
             * saying so with open/close, and no stored config is rewritten.
             */
            intervals: z.ZodOptional<z.ZodArray<z.ZodObject<{
                open: z.ZodString;
                close: z.ZodString;
            }, "strip", z.ZodTypeAny, {
                open: string;
                close: string;
            }, {
                open: string;
                close: string;
            }>, "many">>;
        }, "strict", z.ZodTypeAny, {
            open?: string | null | undefined;
            close?: string | null | undefined;
            intervals?: {
                open: string;
                close: string;
            }[] | undefined;
        }, {
            open?: string | null | undefined;
            close?: string | null | undefined;
            intervals?: {
                open: string;
                close: string;
            }[] | undefined;
        }>>>;
        /** Dates the business is shut regardless of the weekly grid. */
        closures: z.ZodOptional<z.ZodArray<z.ZodObject<{
            date: z.ZodString;
            until: z.ZodOptional<z.ZodString>;
            note: z.ZodOptional<z.ZodString>;
        }, "strip", z.ZodTypeAny, {
            date: string;
            note?: string | undefined;
            until?: string | undefined;
        }, {
            date: string;
            note?: string | undefined;
            until?: string | undefined;
        }>, "many">>;
        services: z.ZodOptional<z.ZodArray<z.ZodObject<{
            name: z.ZodString;
            /** Minutes. The receptionist is asked "how long does it take" constantly. */
            duration_min: z.ZodOptional<z.ZodNumber>;
            /**
             * Free text, not a number, and deliberately so: "from $45", "quoted at
             * consult", "varies by length". A price the business cannot state flatly
             * must not be forced into a field that looks like it can.
             */
            price_note: z.ZodOptional<z.ZodString>;
        }, "strict", z.ZodTypeAny, {
            name: string;
            duration_min?: number | undefined;
            price_note?: string | undefined;
        }, {
            name: string;
            duration_min?: number | undefined;
            price_note?: string | undefined;
        }>, "many">>;
        languages: z.ZodOptional<z.ZodArray<z.ZodString, "many">>;
        guardrails: z.ZodOptional<z.ZodObject<{
            never_quote_prices: z.ZodOptional<z.ZodBoolean>;
            never_confirm_booking: z.ZodOptional<z.ZodBoolean>;
            disclose_ai: z.ZodOptional<z.ZodBoolean>;
            /**
             * OPT-IN, unlike the three above. Those default on because absent means
             * "the safe reading"; this one arrived after prompts were live, and a
             * rule that defaulted on would have changed every composed prompt in
             * production the moment it deployed.
             */
            no_health_advice: z.ZodOptional<z.ZodBoolean>;
        }, "strict", z.ZodTypeAny, {
            never_quote_prices?: boolean | undefined;
            never_confirm_booking?: boolean | undefined;
            disclose_ai?: boolean | undefined;
            no_health_advice?: boolean | undefined;
        }, {
            never_quote_prices?: boolean | undefined;
            never_confirm_booking?: boolean | undefined;
            disclose_ai?: boolean | undefined;
            no_health_advice?: boolean | undefined;
        }>>;
        /** What must reach a person. One short line each. */
        escalate_when: z.ZodOptional<z.ZodArray<z.ZodString, "many">>;
        tone: z.ZodOptional<z.ZodString>;
        /**
         * The line a PERSON answers. The phone receptionist warm-transfers here
         * during opening hours; absent, it takes a message instead. Never the
         * receptionist's own line — that would ring itself.
         */
        handoff_number: z.ZodOptional<z.ZodString>;
        website: z.ZodOptional<z.ZodString>;
        notes: z.ZodOptional<z.ZodArray<z.ZodObject<{
            title: z.ZodString;
            text: z.ZodString;
        }, "strict", z.ZodTypeAny, {
            text: string;
            title: string;
        }, {
            text: string;
            title: string;
        }>, "many">>;
        /**
         * Anything the owner wants said that no field covers.
         *
         * The escape hatch that keeps this model honest — without it, structuring
         * the facts would mean losing whatever did not fit, and the first migration
         * would be a downgrade.
         */
        extra_instructions: z.ZodOptional<z.ZodString>;
    }, "strict", z.ZodTypeAny, {
        address?: string | undefined;
        hours?: Partial<Record<"mon" | "tue" | "wed" | "thu" | "fri" | "sat" | "sun", {
            open?: string | null | undefined;
            close?: string | null | undefined;
            intervals?: {
                open: string;
                close: string;
            }[] | undefined;
        }>> | undefined;
        closures?: {
            date: string;
            note?: string | undefined;
            until?: string | undefined;
        }[] | undefined;
        services?: {
            name: string;
            duration_min?: number | undefined;
            price_note?: string | undefined;
        }[] | undefined;
        languages?: string[] | undefined;
        guardrails?: {
            never_quote_prices?: boolean | undefined;
            never_confirm_booking?: boolean | undefined;
            disclose_ai?: boolean | undefined;
            no_health_advice?: boolean | undefined;
        } | undefined;
        escalate_when?: string[] | undefined;
        tone?: string | undefined;
        handoff_number?: string | undefined;
        website?: string | undefined;
        notes?: {
            text: string;
            title: string;
        }[] | undefined;
        extra_instructions?: string | undefined;
    }, {
        address?: string | undefined;
        hours?: Partial<Record<"mon" | "tue" | "wed" | "thu" | "fri" | "sat" | "sun", {
            open?: string | null | undefined;
            close?: string | null | undefined;
            intervals?: {
                open: string;
                close: string;
            }[] | undefined;
        }>> | undefined;
        closures?: {
            date: string;
            note?: string | undefined;
            until?: string | undefined;
        }[] | undefined;
        services?: {
            name: string;
            duration_min?: number | undefined;
            price_note?: string | undefined;
        }[] | undefined;
        languages?: string[] | undefined;
        guardrails?: {
            never_quote_prices?: boolean | undefined;
            never_confirm_booking?: boolean | undefined;
            disclose_ai?: boolean | undefined;
            no_health_advice?: boolean | undefined;
        } | undefined;
        escalate_when?: string[] | undefined;
        tone?: string | undefined;
        handoff_number?: string | undefined;
        website?: string | undefined;
        notes?: {
            text: string;
            title: string;
        }[] | undefined;
        extra_instructions?: string | undefined;
    }>>;
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
    profile?: {
        address?: string | undefined;
        hours?: Partial<Record<"mon" | "tue" | "wed" | "thu" | "fri" | "sat" | "sun", {
            open?: string | null | undefined;
            close?: string | null | undefined;
            intervals?: {
                open: string;
                close: string;
            }[] | undefined;
        }>> | undefined;
        closures?: {
            date: string;
            note?: string | undefined;
            until?: string | undefined;
        }[] | undefined;
        services?: {
            name: string;
            duration_min?: number | undefined;
            price_note?: string | undefined;
        }[] | undefined;
        languages?: string[] | undefined;
        guardrails?: {
            never_quote_prices?: boolean | undefined;
            never_confirm_booking?: boolean | undefined;
            disclose_ai?: boolean | undefined;
            no_health_advice?: boolean | undefined;
        } | undefined;
        escalate_when?: string[] | undefined;
        tone?: string | undefined;
        handoff_number?: string | undefined;
        website?: string | undefined;
        notes?: {
            text: string;
            title: string;
        }[] | undefined;
        extra_instructions?: string | undefined;
    } | undefined;
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
    profile?: {
        address?: string | undefined;
        hours?: Partial<Record<"mon" | "tue" | "wed" | "thu" | "fri" | "sat" | "sun", {
            open?: string | null | undefined;
            close?: string | null | undefined;
            intervals?: {
                open: string;
                close: string;
            }[] | undefined;
        }>> | undefined;
        closures?: {
            date: string;
            note?: string | undefined;
            until?: string | undefined;
        }[] | undefined;
        services?: {
            name: string;
            duration_min?: number | undefined;
            price_note?: string | undefined;
        }[] | undefined;
        languages?: string[] | undefined;
        guardrails?: {
            never_quote_prices?: boolean | undefined;
            never_confirm_booking?: boolean | undefined;
            disclose_ai?: boolean | undefined;
            no_health_advice?: boolean | undefined;
        } | undefined;
        escalate_when?: string[] | undefined;
        tone?: string | undefined;
        handoff_number?: string | undefined;
        website?: string | undefined;
        notes?: {
            text: string;
            title: string;
        }[] | undefined;
        extra_instructions?: string | undefined;
    } | undefined;
}>;
type BrainConfig = z.infer<typeof BrainConfigSchema>;
/**
 * The parts of a brand-new receptionist nobody should have to write.
 *
 * BrainConfigSchema requires a system_prompt and three fallback messages, and
 * until this existed there was no way to produce them from inside the product:
 * provisioning inserts an empty tenant_config row and the settings form only
 * ever edited the profile ON an existing brain. Onboarding a business meant
 * hand-writing its config into the database.
 *
 * It lives HERE, beside the schema it has to satisfy, because a default that
 * drifts out of spec does not fail in review — it fails for the next business
 * that tries to set itself up.
 *
 * The prompt states no facts on purpose. The address, hours and services are
 * composed from the profile; a baseline that repeated them would be a second
 * copy of every one, free to go stale the moment the owner edits a field.
 */
declare function newReceptionistDefaults(businessName: string, phoneDisplay: string, bookingLink: string): Pick<BrainConfig, "system_prompt" | "fallbacks">;
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
        /**
         * The business's facts, as fields.
         *
         * Optional: every config written before this existed stays valid, and
         * nothing composes until a workspace actually fills it in. When present
         * it REPLACES system_prompt as the source the prompt is built from.
         */
        profile: z.ZodOptional<z.ZodObject<{
            address: z.ZodOptional<z.ZodString>;
            hours: z.ZodOptional<z.ZodRecord<z.ZodEnum<["mon", "tue", "wed", "thu", "fri", "sat", "sun"]>, z.ZodObject<{
                /** "09:00". Absent or null = closed that day, which is a real answer. */
                open: z.ZodOptional<z.ZodNullable<z.ZodString>>;
                close: z.ZodOptional<z.ZodNullable<z.ZodString>>;
                /**
                 * Split shifts — 09:30-13:00 and 15:00-19:00, the lunch break a salon
                 * actually keeps. Additive: a day that has always been one stretch keeps
                 * saying so with open/close, and no stored config is rewritten.
                 */
                intervals: z.ZodOptional<z.ZodArray<z.ZodObject<{
                    open: z.ZodString;
                    close: z.ZodString;
                }, "strip", z.ZodTypeAny, {
                    open: string;
                    close: string;
                }, {
                    open: string;
                    close: string;
                }>, "many">>;
            }, "strict", z.ZodTypeAny, {
                open?: string | null | undefined;
                close?: string | null | undefined;
                intervals?: {
                    open: string;
                    close: string;
                }[] | undefined;
            }, {
                open?: string | null | undefined;
                close?: string | null | undefined;
                intervals?: {
                    open: string;
                    close: string;
                }[] | undefined;
            }>>>;
            /** Dates the business is shut regardless of the weekly grid. */
            closures: z.ZodOptional<z.ZodArray<z.ZodObject<{
                date: z.ZodString;
                until: z.ZodOptional<z.ZodString>;
                note: z.ZodOptional<z.ZodString>;
            }, "strip", z.ZodTypeAny, {
                date: string;
                note?: string | undefined;
                until?: string | undefined;
            }, {
                date: string;
                note?: string | undefined;
                until?: string | undefined;
            }>, "many">>;
            services: z.ZodOptional<z.ZodArray<z.ZodObject<{
                name: z.ZodString;
                /** Minutes. The receptionist is asked "how long does it take" constantly. */
                duration_min: z.ZodOptional<z.ZodNumber>;
                /**
                 * Free text, not a number, and deliberately so: "from $45", "quoted at
                 * consult", "varies by length". A price the business cannot state flatly
                 * must not be forced into a field that looks like it can.
                 */
                price_note: z.ZodOptional<z.ZodString>;
            }, "strict", z.ZodTypeAny, {
                name: string;
                duration_min?: number | undefined;
                price_note?: string | undefined;
            }, {
                name: string;
                duration_min?: number | undefined;
                price_note?: string | undefined;
            }>, "many">>;
            languages: z.ZodOptional<z.ZodArray<z.ZodString, "many">>;
            guardrails: z.ZodOptional<z.ZodObject<{
                never_quote_prices: z.ZodOptional<z.ZodBoolean>;
                never_confirm_booking: z.ZodOptional<z.ZodBoolean>;
                disclose_ai: z.ZodOptional<z.ZodBoolean>;
                /**
                 * OPT-IN, unlike the three above. Those default on because absent means
                 * "the safe reading"; this one arrived after prompts were live, and a
                 * rule that defaulted on would have changed every composed prompt in
                 * production the moment it deployed.
                 */
                no_health_advice: z.ZodOptional<z.ZodBoolean>;
            }, "strict", z.ZodTypeAny, {
                never_quote_prices?: boolean | undefined;
                never_confirm_booking?: boolean | undefined;
                disclose_ai?: boolean | undefined;
                no_health_advice?: boolean | undefined;
            }, {
                never_quote_prices?: boolean | undefined;
                never_confirm_booking?: boolean | undefined;
                disclose_ai?: boolean | undefined;
                no_health_advice?: boolean | undefined;
            }>>;
            /** What must reach a person. One short line each. */
            escalate_when: z.ZodOptional<z.ZodArray<z.ZodString, "many">>;
            tone: z.ZodOptional<z.ZodString>;
            /**
             * The line a PERSON answers. The phone receptionist warm-transfers here
             * during opening hours; absent, it takes a message instead. Never the
             * receptionist's own line — that would ring itself.
             */
            handoff_number: z.ZodOptional<z.ZodString>;
            website: z.ZodOptional<z.ZodString>;
            notes: z.ZodOptional<z.ZodArray<z.ZodObject<{
                title: z.ZodString;
                text: z.ZodString;
            }, "strict", z.ZodTypeAny, {
                text: string;
                title: string;
            }, {
                text: string;
                title: string;
            }>, "many">>;
            /**
             * Anything the owner wants said that no field covers.
             *
             * The escape hatch that keeps this model honest — without it, structuring
             * the facts would mean losing whatever did not fit, and the first migration
             * would be a downgrade.
             */
            extra_instructions: z.ZodOptional<z.ZodString>;
        }, "strict", z.ZodTypeAny, {
            address?: string | undefined;
            hours?: Partial<Record<"mon" | "tue" | "wed" | "thu" | "fri" | "sat" | "sun", {
                open?: string | null | undefined;
                close?: string | null | undefined;
                intervals?: {
                    open: string;
                    close: string;
                }[] | undefined;
            }>> | undefined;
            closures?: {
                date: string;
                note?: string | undefined;
                until?: string | undefined;
            }[] | undefined;
            services?: {
                name: string;
                duration_min?: number | undefined;
                price_note?: string | undefined;
            }[] | undefined;
            languages?: string[] | undefined;
            guardrails?: {
                never_quote_prices?: boolean | undefined;
                never_confirm_booking?: boolean | undefined;
                disclose_ai?: boolean | undefined;
                no_health_advice?: boolean | undefined;
            } | undefined;
            escalate_when?: string[] | undefined;
            tone?: string | undefined;
            handoff_number?: string | undefined;
            website?: string | undefined;
            notes?: {
                text: string;
                title: string;
            }[] | undefined;
            extra_instructions?: string | undefined;
        }, {
            address?: string | undefined;
            hours?: Partial<Record<"mon" | "tue" | "wed" | "thu" | "fri" | "sat" | "sun", {
                open?: string | null | undefined;
                close?: string | null | undefined;
                intervals?: {
                    open: string;
                    close: string;
                }[] | undefined;
            }>> | undefined;
            closures?: {
                date: string;
                note?: string | undefined;
                until?: string | undefined;
            }[] | undefined;
            services?: {
                name: string;
                duration_min?: number | undefined;
                price_note?: string | undefined;
            }[] | undefined;
            languages?: string[] | undefined;
            guardrails?: {
                never_quote_prices?: boolean | undefined;
                never_confirm_booking?: boolean | undefined;
                disclose_ai?: boolean | undefined;
                no_health_advice?: boolean | undefined;
            } | undefined;
            escalate_when?: string[] | undefined;
            tone?: string | undefined;
            handoff_number?: string | undefined;
            website?: string | undefined;
            notes?: {
                text: string;
                title: string;
            }[] | undefined;
            extra_instructions?: string | undefined;
        }>>;
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
        profile?: {
            address?: string | undefined;
            hours?: Partial<Record<"mon" | "tue" | "wed" | "thu" | "fri" | "sat" | "sun", {
                open?: string | null | undefined;
                close?: string | null | undefined;
                intervals?: {
                    open: string;
                    close: string;
                }[] | undefined;
            }>> | undefined;
            closures?: {
                date: string;
                note?: string | undefined;
                until?: string | undefined;
            }[] | undefined;
            services?: {
                name: string;
                duration_min?: number | undefined;
                price_note?: string | undefined;
            }[] | undefined;
            languages?: string[] | undefined;
            guardrails?: {
                never_quote_prices?: boolean | undefined;
                never_confirm_booking?: boolean | undefined;
                disclose_ai?: boolean | undefined;
                no_health_advice?: boolean | undefined;
            } | undefined;
            escalate_when?: string[] | undefined;
            tone?: string | undefined;
            handoff_number?: string | undefined;
            website?: string | undefined;
            notes?: {
                text: string;
                title: string;
            }[] | undefined;
            extra_instructions?: string | undefined;
        } | undefined;
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
        profile?: {
            address?: string | undefined;
            hours?: Partial<Record<"mon" | "tue" | "wed" | "thu" | "fri" | "sat" | "sun", {
                open?: string | null | undefined;
                close?: string | null | undefined;
                intervals?: {
                    open: string;
                    close: string;
                }[] | undefined;
            }>> | undefined;
            closures?: {
                date: string;
                note?: string | undefined;
                until?: string | undefined;
            }[] | undefined;
            services?: {
                name: string;
                duration_min?: number | undefined;
                price_note?: string | undefined;
            }[] | undefined;
            languages?: string[] | undefined;
            guardrails?: {
                never_quote_prices?: boolean | undefined;
                never_confirm_booking?: boolean | undefined;
                disclose_ai?: boolean | undefined;
                no_health_advice?: boolean | undefined;
            } | undefined;
            escalate_when?: string[] | undefined;
            tone?: string | undefined;
            handoff_number?: string | undefined;
            website?: string | undefined;
            notes?: {
                text: string;
                title: string;
            }[] | undefined;
            extra_instructions?: string | undefined;
        } | undefined;
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
        profile?: {
            address?: string | undefined;
            hours?: Partial<Record<"mon" | "tue" | "wed" | "thu" | "fri" | "sat" | "sun", {
                open?: string | null | undefined;
                close?: string | null | undefined;
                intervals?: {
                    open: string;
                    close: string;
                }[] | undefined;
            }>> | undefined;
            closures?: {
                date: string;
                note?: string | undefined;
                until?: string | undefined;
            }[] | undefined;
            services?: {
                name: string;
                duration_min?: number | undefined;
                price_note?: string | undefined;
            }[] | undefined;
            languages?: string[] | undefined;
            guardrails?: {
                never_quote_prices?: boolean | undefined;
                never_confirm_booking?: boolean | undefined;
                disclose_ai?: boolean | undefined;
                no_health_advice?: boolean | undefined;
            } | undefined;
            escalate_when?: string[] | undefined;
            tone?: string | undefined;
            handoff_number?: string | undefined;
            website?: string | undefined;
            notes?: {
                text: string;
                title: string;
            }[] | undefined;
            extra_instructions?: string | undefined;
        } | undefined;
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
        profile?: {
            address?: string | undefined;
            hours?: Partial<Record<"mon" | "tue" | "wed" | "thu" | "fri" | "sat" | "sun", {
                open?: string | null | undefined;
                close?: string | null | undefined;
                intervals?: {
                    open: string;
                    close: string;
                }[] | undefined;
            }>> | undefined;
            closures?: {
                date: string;
                note?: string | undefined;
                until?: string | undefined;
            }[] | undefined;
            services?: {
                name: string;
                duration_min?: number | undefined;
                price_note?: string | undefined;
            }[] | undefined;
            languages?: string[] | undefined;
            guardrails?: {
                never_quote_prices?: boolean | undefined;
                never_confirm_booking?: boolean | undefined;
                disclose_ai?: boolean | undefined;
                no_health_advice?: boolean | undefined;
            } | undefined;
            escalate_when?: string[] | undefined;
            tone?: string | undefined;
            handoff_number?: string | undefined;
            website?: string | undefined;
            notes?: {
                text: string;
                title: string;
            }[] | undefined;
            extra_instructions?: string | undefined;
        } | undefined;
    } | undefined;
    notifications?: {
        escalation_emails: string[];
        from?: string | undefined;
    } | undefined;
}>;
type TenantConfig = z.infer<typeof TenantConfigSchema>;
/** The most shifts one day may be split into. Must match the editor's cap. */
declare const MAX_INTERVALS_PER_DAY = 4;
/** As many closures as the composer will state — there is no render cap. */
declare const MAX_CLOSURES = 60;
/** Does this string name a real day? "2026-11-31" does not. */
declare function isRealDate(key: string): boolean;
/**
 * The same config, with the rules that only apply on the way IN.
 *
 * Wrapping TenantConfigSchema rather than replacing it, so the shape and the
 * lenience stay defined in exactly one place and this can only ever be
 * stricter.
 */
declare const TenantConfigWriteSchema: z.ZodEffects<z.ZodObject<{
    brain: z.ZodOptional<z.ZodObject<{
        business_name: z.ZodString;
        phone_display: z.ZodString;
        booking_link: z.ZodString;
        /** The complete system prompt the model receives — the "AI memory" pane's
         *  one hard promise is that what it shows is EXACTLY this, nothing more. */
        system_prompt: z.ZodString;
        /**
         * The business's facts, as fields.
         *
         * Optional: every config written before this existed stays valid, and
         * nothing composes until a workspace actually fills it in. When present
         * it REPLACES system_prompt as the source the prompt is built from.
         */
        profile: z.ZodOptional<z.ZodObject<{
            address: z.ZodOptional<z.ZodString>;
            hours: z.ZodOptional<z.ZodRecord<z.ZodEnum<["mon", "tue", "wed", "thu", "fri", "sat", "sun"]>, z.ZodObject<{
                /** "09:00". Absent or null = closed that day, which is a real answer. */
                open: z.ZodOptional<z.ZodNullable<z.ZodString>>;
                close: z.ZodOptional<z.ZodNullable<z.ZodString>>;
                /**
                 * Split shifts — 09:30-13:00 and 15:00-19:00, the lunch break a salon
                 * actually keeps. Additive: a day that has always been one stretch keeps
                 * saying so with open/close, and no stored config is rewritten.
                 */
                intervals: z.ZodOptional<z.ZodArray<z.ZodObject<{
                    open: z.ZodString;
                    close: z.ZodString;
                }, "strip", z.ZodTypeAny, {
                    open: string;
                    close: string;
                }, {
                    open: string;
                    close: string;
                }>, "many">>;
            }, "strict", z.ZodTypeAny, {
                open?: string | null | undefined;
                close?: string | null | undefined;
                intervals?: {
                    open: string;
                    close: string;
                }[] | undefined;
            }, {
                open?: string | null | undefined;
                close?: string | null | undefined;
                intervals?: {
                    open: string;
                    close: string;
                }[] | undefined;
            }>>>;
            /** Dates the business is shut regardless of the weekly grid. */
            closures: z.ZodOptional<z.ZodArray<z.ZodObject<{
                date: z.ZodString;
                until: z.ZodOptional<z.ZodString>;
                note: z.ZodOptional<z.ZodString>;
            }, "strip", z.ZodTypeAny, {
                date: string;
                note?: string | undefined;
                until?: string | undefined;
            }, {
                date: string;
                note?: string | undefined;
                until?: string | undefined;
            }>, "many">>;
            services: z.ZodOptional<z.ZodArray<z.ZodObject<{
                name: z.ZodString;
                /** Minutes. The receptionist is asked "how long does it take" constantly. */
                duration_min: z.ZodOptional<z.ZodNumber>;
                /**
                 * Free text, not a number, and deliberately so: "from $45", "quoted at
                 * consult", "varies by length". A price the business cannot state flatly
                 * must not be forced into a field that looks like it can.
                 */
                price_note: z.ZodOptional<z.ZodString>;
            }, "strict", z.ZodTypeAny, {
                name: string;
                duration_min?: number | undefined;
                price_note?: string | undefined;
            }, {
                name: string;
                duration_min?: number | undefined;
                price_note?: string | undefined;
            }>, "many">>;
            languages: z.ZodOptional<z.ZodArray<z.ZodString, "many">>;
            guardrails: z.ZodOptional<z.ZodObject<{
                never_quote_prices: z.ZodOptional<z.ZodBoolean>;
                never_confirm_booking: z.ZodOptional<z.ZodBoolean>;
                disclose_ai: z.ZodOptional<z.ZodBoolean>;
                /**
                 * OPT-IN, unlike the three above. Those default on because absent means
                 * "the safe reading"; this one arrived after prompts were live, and a
                 * rule that defaulted on would have changed every composed prompt in
                 * production the moment it deployed.
                 */
                no_health_advice: z.ZodOptional<z.ZodBoolean>;
            }, "strict", z.ZodTypeAny, {
                never_quote_prices?: boolean | undefined;
                never_confirm_booking?: boolean | undefined;
                disclose_ai?: boolean | undefined;
                no_health_advice?: boolean | undefined;
            }, {
                never_quote_prices?: boolean | undefined;
                never_confirm_booking?: boolean | undefined;
                disclose_ai?: boolean | undefined;
                no_health_advice?: boolean | undefined;
            }>>;
            /** What must reach a person. One short line each. */
            escalate_when: z.ZodOptional<z.ZodArray<z.ZodString, "many">>;
            tone: z.ZodOptional<z.ZodString>;
            /**
             * The line a PERSON answers. The phone receptionist warm-transfers here
             * during opening hours; absent, it takes a message instead. Never the
             * receptionist's own line — that would ring itself.
             */
            handoff_number: z.ZodOptional<z.ZodString>;
            website: z.ZodOptional<z.ZodString>;
            notes: z.ZodOptional<z.ZodArray<z.ZodObject<{
                title: z.ZodString;
                text: z.ZodString;
            }, "strict", z.ZodTypeAny, {
                text: string;
                title: string;
            }, {
                text: string;
                title: string;
            }>, "many">>;
            /**
             * Anything the owner wants said that no field covers.
             *
             * The escape hatch that keeps this model honest — without it, structuring
             * the facts would mean losing whatever did not fit, and the first migration
             * would be a downgrade.
             */
            extra_instructions: z.ZodOptional<z.ZodString>;
        }, "strict", z.ZodTypeAny, {
            address?: string | undefined;
            hours?: Partial<Record<"mon" | "tue" | "wed" | "thu" | "fri" | "sat" | "sun", {
                open?: string | null | undefined;
                close?: string | null | undefined;
                intervals?: {
                    open: string;
                    close: string;
                }[] | undefined;
            }>> | undefined;
            closures?: {
                date: string;
                note?: string | undefined;
                until?: string | undefined;
            }[] | undefined;
            services?: {
                name: string;
                duration_min?: number | undefined;
                price_note?: string | undefined;
            }[] | undefined;
            languages?: string[] | undefined;
            guardrails?: {
                never_quote_prices?: boolean | undefined;
                never_confirm_booking?: boolean | undefined;
                disclose_ai?: boolean | undefined;
                no_health_advice?: boolean | undefined;
            } | undefined;
            escalate_when?: string[] | undefined;
            tone?: string | undefined;
            handoff_number?: string | undefined;
            website?: string | undefined;
            notes?: {
                text: string;
                title: string;
            }[] | undefined;
            extra_instructions?: string | undefined;
        }, {
            address?: string | undefined;
            hours?: Partial<Record<"mon" | "tue" | "wed" | "thu" | "fri" | "sat" | "sun", {
                open?: string | null | undefined;
                close?: string | null | undefined;
                intervals?: {
                    open: string;
                    close: string;
                }[] | undefined;
            }>> | undefined;
            closures?: {
                date: string;
                note?: string | undefined;
                until?: string | undefined;
            }[] | undefined;
            services?: {
                name: string;
                duration_min?: number | undefined;
                price_note?: string | undefined;
            }[] | undefined;
            languages?: string[] | undefined;
            guardrails?: {
                never_quote_prices?: boolean | undefined;
                never_confirm_booking?: boolean | undefined;
                disclose_ai?: boolean | undefined;
                no_health_advice?: boolean | undefined;
            } | undefined;
            escalate_when?: string[] | undefined;
            tone?: string | undefined;
            handoff_number?: string | undefined;
            website?: string | undefined;
            notes?: {
                text: string;
                title: string;
            }[] | undefined;
            extra_instructions?: string | undefined;
        }>>;
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
        profile?: {
            address?: string | undefined;
            hours?: Partial<Record<"mon" | "tue" | "wed" | "thu" | "fri" | "sat" | "sun", {
                open?: string | null | undefined;
                close?: string | null | undefined;
                intervals?: {
                    open: string;
                    close: string;
                }[] | undefined;
            }>> | undefined;
            closures?: {
                date: string;
                note?: string | undefined;
                until?: string | undefined;
            }[] | undefined;
            services?: {
                name: string;
                duration_min?: number | undefined;
                price_note?: string | undefined;
            }[] | undefined;
            languages?: string[] | undefined;
            guardrails?: {
                never_quote_prices?: boolean | undefined;
                never_confirm_booking?: boolean | undefined;
                disclose_ai?: boolean | undefined;
                no_health_advice?: boolean | undefined;
            } | undefined;
            escalate_when?: string[] | undefined;
            tone?: string | undefined;
            handoff_number?: string | undefined;
            website?: string | undefined;
            notes?: {
                text: string;
                title: string;
            }[] | undefined;
            extra_instructions?: string | undefined;
        } | undefined;
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
        profile?: {
            address?: string | undefined;
            hours?: Partial<Record<"mon" | "tue" | "wed" | "thu" | "fri" | "sat" | "sun", {
                open?: string | null | undefined;
                close?: string | null | undefined;
                intervals?: {
                    open: string;
                    close: string;
                }[] | undefined;
            }>> | undefined;
            closures?: {
                date: string;
                note?: string | undefined;
                until?: string | undefined;
            }[] | undefined;
            services?: {
                name: string;
                duration_min?: number | undefined;
                price_note?: string | undefined;
            }[] | undefined;
            languages?: string[] | undefined;
            guardrails?: {
                never_quote_prices?: boolean | undefined;
                never_confirm_booking?: boolean | undefined;
                disclose_ai?: boolean | undefined;
                no_health_advice?: boolean | undefined;
            } | undefined;
            escalate_when?: string[] | undefined;
            tone?: string | undefined;
            handoff_number?: string | undefined;
            website?: string | undefined;
            notes?: {
                text: string;
                title: string;
            }[] | undefined;
            extra_instructions?: string | undefined;
        } | undefined;
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
        profile?: {
            address?: string | undefined;
            hours?: Partial<Record<"mon" | "tue" | "wed" | "thu" | "fri" | "sat" | "sun", {
                open?: string | null | undefined;
                close?: string | null | undefined;
                intervals?: {
                    open: string;
                    close: string;
                }[] | undefined;
            }>> | undefined;
            closures?: {
                date: string;
                note?: string | undefined;
                until?: string | undefined;
            }[] | undefined;
            services?: {
                name: string;
                duration_min?: number | undefined;
                price_note?: string | undefined;
            }[] | undefined;
            languages?: string[] | undefined;
            guardrails?: {
                never_quote_prices?: boolean | undefined;
                never_confirm_booking?: boolean | undefined;
                disclose_ai?: boolean | undefined;
                no_health_advice?: boolean | undefined;
            } | undefined;
            escalate_when?: string[] | undefined;
            tone?: string | undefined;
            handoff_number?: string | undefined;
            website?: string | undefined;
            notes?: {
                text: string;
                title: string;
            }[] | undefined;
            extra_instructions?: string | undefined;
        } | undefined;
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
        profile?: {
            address?: string | undefined;
            hours?: Partial<Record<"mon" | "tue" | "wed" | "thu" | "fri" | "sat" | "sun", {
                open?: string | null | undefined;
                close?: string | null | undefined;
                intervals?: {
                    open: string;
                    close: string;
                }[] | undefined;
            }>> | undefined;
            closures?: {
                date: string;
                note?: string | undefined;
                until?: string | undefined;
            }[] | undefined;
            services?: {
                name: string;
                duration_min?: number | undefined;
                price_note?: string | undefined;
            }[] | undefined;
            languages?: string[] | undefined;
            guardrails?: {
                never_quote_prices?: boolean | undefined;
                never_confirm_booking?: boolean | undefined;
                disclose_ai?: boolean | undefined;
                no_health_advice?: boolean | undefined;
            } | undefined;
            escalate_when?: string[] | undefined;
            tone?: string | undefined;
            handoff_number?: string | undefined;
            website?: string | undefined;
            notes?: {
                text: string;
                title: string;
            }[] | undefined;
            extra_instructions?: string | undefined;
        } | undefined;
    } | undefined;
    notifications?: {
        escalation_emails: string[];
        from?: string | undefined;
    } | undefined;
}>, {
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
        profile?: {
            address?: string | undefined;
            hours?: Partial<Record<"mon" | "tue" | "wed" | "thu" | "fri" | "sat" | "sun", {
                open?: string | null | undefined;
                close?: string | null | undefined;
                intervals?: {
                    open: string;
                    close: string;
                }[] | undefined;
            }>> | undefined;
            closures?: {
                date: string;
                note?: string | undefined;
                until?: string | undefined;
            }[] | undefined;
            services?: {
                name: string;
                duration_min?: number | undefined;
                price_note?: string | undefined;
            }[] | undefined;
            languages?: string[] | undefined;
            guardrails?: {
                never_quote_prices?: boolean | undefined;
                never_confirm_booking?: boolean | undefined;
                disclose_ai?: boolean | undefined;
                no_health_advice?: boolean | undefined;
            } | undefined;
            escalate_when?: string[] | undefined;
            tone?: string | undefined;
            handoff_number?: string | undefined;
            website?: string | undefined;
            notes?: {
                text: string;
                title: string;
            }[] | undefined;
            extra_instructions?: string | undefined;
        } | undefined;
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
        profile?: {
            address?: string | undefined;
            hours?: Partial<Record<"mon" | "tue" | "wed" | "thu" | "fri" | "sat" | "sun", {
                open?: string | null | undefined;
                close?: string | null | undefined;
                intervals?: {
                    open: string;
                    close: string;
                }[] | undefined;
            }>> | undefined;
            closures?: {
                date: string;
                note?: string | undefined;
                until?: string | undefined;
            }[] | undefined;
            services?: {
                name: string;
                duration_min?: number | undefined;
                price_note?: string | undefined;
            }[] | undefined;
            languages?: string[] | undefined;
            guardrails?: {
                never_quote_prices?: boolean | undefined;
                never_confirm_booking?: boolean | undefined;
                disclose_ai?: boolean | undefined;
                no_health_advice?: boolean | undefined;
            } | undefined;
            escalate_when?: string[] | undefined;
            tone?: string | undefined;
            handoff_number?: string | undefined;
            website?: string | undefined;
            notes?: {
                text: string;
                title: string;
            }[] | undefined;
            extra_instructions?: string | undefined;
        } | undefined;
    } | undefined;
    notifications?: {
        escalation_emails: string[];
        from?: string | undefined;
    } | undefined;
}>;
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
/** "Monday–Friday 9:00–18:00" style lines, collapsing identical runs. */
/** One stretch of consecutive days that share the same hours. */
interface HoursRun {
    /** Day key the run starts on, e.g. "mon". */
    from: string;
    /** Day key it ends on. Equal to `from` for a single day. */
    to: string;
    /** "09:30–18:00", or "Closed". */
    text: string;
}
declare function hoursRuns(hours: Record<string, Hours> | undefined): HoursRun[];
/** True when a profile carries anything worth composing from. */
declare function hasProfile(p: BusinessProfile | undefined | null): boolean;
/**
 * The current moment, in the business's own timezone.
 *
 * Deliberately NOT part of composeSystemPrompt. That output is cached with the
 * request; this changes every minute, and folding it in would evict the whole
 * business profile from the prompt cache on every single message. It belongs
 * in its own uncached block, next to the lead note that changes per contact.
 *
 * The timezone is `tenants.timezone` — the one the metrics RPCs and the Today
 * surface already use. There is no second copy of it on the profile.
 */
declare function describeNow(tz: string | null | undefined, now?: Date, 
/**
 * The workspace's closures, so a shut day is stated HERE.
 *
 * It matters that it is here and not only in the composed block above. This
 * is the last thing the model reads, and on a closure day the weekly grid
 * says open while the closure list says shut. Leaving the tie to block order
 * would decide the single highest-stakes question — "are you open today?" —
 * by accident.
 */
closures?: Closure[]): string;
declare function composeSystemPrompt(base: {
    business_name: string;
    phone_display: string;
    booking_link: string;
}, profile: BusinessProfile, channel?: "whatsapp" | "voice", 
/** IANA zone from `tenants.timezone`, so stated hours are unambiguous. */
tz?: string | null, 
/**
 * Only used to drop closures that have already passed.
 *
 * No cron, no nightly prune: the composer already runs per message and
 * already knows the zone, so "has this gone by?" is a string comparison.
 * Rows that have passed stay in the config and simply stop being said.
 */
now?: Date): string;
/**
 * The instructions this workspace's receptionist should actually receive.
 *
 * ONE resolver, so no caller has to remember the precedence. A workspace that
 * has filled in its profile gets a prompt composed from those facts; one that
 * has not keeps the prompt it already had, byte for byte.
 *
 * That fallback is the whole reason this can ship: Melany's hand-written
 * prompt is live and answering real customers, and a migration that changed
 * what her receptionist says the moment the code deployed would be a
 * behaviour change nobody asked for.
 */
declare function resolveSystemPrompt(brain: BrainConfig, channel?: "whatsapp" | "voice", 
/** IANA zone from `tenants.timezone`. Labels the hours; never a second copy. */
tz?: string | null, 
/** Only used to drop closures that have already passed. */
now?: Date): string;

/** One row of `people_list(tenant, contact?)`. Every column is nullable on
 *  the wire (RETURNS TABLE), so readers coalesce. */
interface PersonRowDto {
    id: string;
    display_name: string | null;
    wa_profile_name: string | null;
    phone_e164: string | null;
    consent: string | null;
    consent_source: string | null;
    consent_updated_at: string | null;
    dnc: boolean | null;
    channels: string[] | null;
    conversation_count: number | null;
    escalation_count: number | null;
    needs_human: boolean | null;
    open_escalation_reason: string | null;
    open_escalation_since: string | null;
    latest_conversation_id: string | null;
    latest_state: string | null;
    latest_paused_until: string | null;
    latest_assignee_user_id: string | null;
    latest_snooze_until: string | null;
    latest_wa_inbound_at: string | null;
    last_message_at: string | null;
    last_message_direction: string | null;
    last_message_sender: string | null;
    last_inbound_text: string | null;
    last_inbound_at: string | null;
    last_call_at: string | null;
    call_count: number | null;
    call_seconds: number | null;
    /** Earliest REAL event time: a dated message or a call. Null when the only
     *  history is an undated import. */
    first_contact_at: string | null;
    /** Earliest row we hold, whatever it dates — the import moment for a
     *  backfilled person. The floor for "before …". */
    earliest_row_at: string | null;
    has_backfill: boolean | null;
    has_chat: boolean | null;
    queued_reply_at: string | null;
    /** The reply mode in force for this person — their own setting, else the
     *  workspace's. Attached by the API from the policies table; people_list
     *  does not carry it. */
    effective_reply_mode?: string | null;
}
interface PersonIdentityDto {
    channel: string;
    external_id: string;
    created_at: string;
}
interface PersonEscalationDto {
    id: string;
    conversation_id: string;
    reason: string;
    state: string;
    details: string | null;
    created_at: string;
    updated_at: string;
    resolved_by_user_id: string | null;
}
interface PersonDecisionDto {
    id: string;
    verb: string;
    subject_type: string;
    subject_id: string;
    actor_type: string;
    actor_user_id: string | null;
    created_at: string;
    payload: Record<string, unknown> | null;
}
interface PersonDetailDto {
    row: PersonRowDto;
    identities: PersonIdentityDto[];
    conversations: ConversationDto[];
    calls: CallDto[];
    escalations: PersonEscalationDto[];
    decisions: PersonDecisionDto[];
    /** This person's own receptionist mode, or null to follow the workspace. */
    receptionist_mode?: string | null;
    /** The workspace's reply policy mode, for the "following …" hint. */
    workspace_reply_mode?: string | null;
}
/** What an owner may set for one person: answer, ask first, or stay out. */
type PersonMode = "auto" | "ask" | "never";
declare const PERSON_MODES: readonly PersonMode[];
declare const PERSON_MODE_LABELS: Record<PersonMode, string>;
declare function asPersonMode(s: string | null | undefined): PersonMode | null;
type PersonState = "needs_you" | "waiting_on_you" | "opted_out" | "new" | "quiet" | "active";
declare const PERSON_STATE_LABELS: Record<PersonState, string>;
/** The list's tabs: the states, in the order the rule evaluates them. */
declare const PEOPLE_TABS: readonly {
    id: "all" | PersonState;
    label: string;
}[];
/** First contact this recent, with no imported history, is "new". */
declare const NEW_WINDOW_MS: number;
/** Nothing heard for this long is "quiet". */
declare const QUIET_AFTER_MS: number;
declare function reasonShort(reason: string | null | undefined): string;
/** "2h ago" inside a week; the date beyond it. */
declare function ago(ms: number, nowMs: number): string;
declare function personName(r: Pick<PersonRowDto, "display_name" | "wa_profile_name" | "phone_e164">): string;
type PersonChannel = "whatsapp" | "voice";
declare function isOwned(r: Pick<PersonRowDto, "latest_assignee_user_id" | "latest_paused_until">, nowMs: number): boolean;
declare function personStateFor(r: PersonRowDto, nowMs: number): PersonState;
interface PersonLastContact {
    ts: number | null;
    at: string | null;
    kind: "message" | "call" | null;
    who: "they" | "receptionist" | "you" | "system" | null;
    /** "They wrote · 2h ago" */
    label: string;
}
interface PersonFirstContact {
    ts: number | null;
    /** "Jul 14", "Before Aug 27", or "—" */
    label: string;
    /** True when the only history is an undated import: we know a floor, not a date. */
    estimate: boolean;
    /** True when this date may count as "new" (no imported history). */
    evidence: boolean;
}
interface PersonConsent {
    state: "unknown" | "opted_in" | "opted_out";
    dnc: boolean;
    label: string;
    sub: string;
}
type ReceptionistTone = "answering" | "escalated" | "queued" | "snoozed" | "paused" | "silent";
interface PersonReceptionist {
    tone: ReceptionistTone;
    label: string;
}
interface PersonRowVM {
    id: string;
    real: true;
    name: string;
    initials: string;
    phone: string | null;
    waName: string | null;
    channels: PersonChannel[];
    hasChat: boolean;
    state: PersonState;
    stateLabel: string;
    /** The reason behind the state, in a few words. Empty for "active". */
    stateDetail: string;
    lastContact: PersonLastContact;
    receptionist: PersonReceptionist;
    firstContact: PersonFirstContact;
    consent: PersonConsent;
    /** The customer's last words, verbatim. */
    quote: string | null;
    threads: number;
    calls: number;
    escalations: number;
    callSeconds: number;
    /** The Inbox route id (`th-<conversation>`); null without a chat. */
    threadId: string | null;
    needsYouSinceMs: number | null;
}
declare function toPersonRowVM(r: PersonRowDto, now?: Date): PersonRowVM;
/** The rail's smart lists: computed filters over facts, not saved segments. */
declare const PEOPLE_LISTS: readonly {
    id: string;
    label: string;
    test: (vm: PersonRowVM) => boolean;
}[];
interface PeopleAggregates {
    total: number;
    needsYou: number;
    needsYouOldestMs: number | null;
    /** First contact within 30 days, by evidence. */
    newThisMonth: number;
    /** Any message or call within 7 days. */
    reachedWeek: number;
    reachedWeekNew: number;
}
declare function peopleAggregates(rows: PersonRowVM[], nowMs: number): PeopleAggregates;
/** Days since last contact, bucketed — the honest replacement for the
 *  mockup's temperature strip. */
declare function recencyCells(rows: PersonRowVM[], nowMs: number): {
    label: string;
    count: number;
}[];
type TimelineKind = "customer" | "receptionist" | "you" | "system" | "call" | "escalation" | "decision";
interface PersonTimelineItemVM {
    id: string;
    ts: number;
    time: string;
    day: string;
    kind: TimelineKind;
    who: string;
    text: string;
    sub?: string;
    link?: {
        label: string;
        to: string;
    };
}
interface PersonRightNow {
    tone: ReceptionistTone;
    title: string;
    detail: string;
    cta: {
        label: string;
        to: string;
    } | null;
}
interface PersonFact {
    label: string;
    value: string | number;
    meta: string;
    tone?: "neg" | "pos" | "";
}
interface PersonVM extends PersonRowVM {
    /** "Since Jul 14" / "Since before Aug 27" / "" */
    since: string;
    /** "3 conversations · 2 calls" */
    metaLine: string;
    lastExchange: {
        customer: {
            text: string;
            at: string;
        } | null;
        reply: {
            text: string;
            at: string;
            who: "Receptionist" | "You";
        } | null;
    };
    facts: PersonFact[];
    rightNow: PersonRightNow;
    timeline: PersonTimelineItemVM[];
    about: {
        k: string;
        v: string;
    }[];
    /** "inbox/th-…" or null for a phone-only person. */
    openThread: string | null;
    /** The person's own setting (null = following the workspace) and the
     *  workspace's mode, so the rail can say which is in force. 'veto' at the
     *  workspace level still answers, after a hold, so it reads as "Answer". */
    receptionistMode: {
        person: PersonMode | null;
        workspace: PersonMode | null;
    };
}
declare function toPersonVM(d: PersonDetailDto, now?: Date): PersonVM;

interface ChannelDto {
    id: string;
    kind: string;
    number_e164: string | null;
    status: string;
    created_at: string;
    /** Newest inbound on this channel: a WhatsApp message's channel_ts, or a
     *  call's started_at. Null when nobody has used it yet. */
    last_inbound_at: string | null;
}
type ChannelHealth = "receiving" | "quiet" | "off" | "unused";
interface ChannelVM {
    id: string;
    kind: string;
    /** "WhatsApp Business" / "Phone line" / the kind, capitalised. */
    name: string;
    /** What it does, in one line. */
    what: string;
    icon: "chat" | "phone" | "mail" | "instagram";
    number: string | null;
    on: boolean;
    health: ChannelHealth;
    /** "Receiving · last message 2h ago" and the like. */
    healthLabel: string;
    lastInboundMs: number | null;
}
declare function toChannelVM(dto: ChannelDto, now?: Date): ChannelVM;

interface ReportDayDto {
    day: string;
    messages_in: number;
    conversations: number;
    answered_ai: number;
    answered_you: number;
    unanswered: number;
    out_ai: number;
    out_you: number;
    escalations: number;
    calls: number;
    call_seconds: number;
    new_contacts: number;
}
/** What `report_series(tenant, days)` returns. `series` spans TWO periods —
 *  the requested one and the one before it — newest last. */
interface ReportDto {
    timezone: string;
    days: number;
    span_days: number;
    today: string;
    series: ReportDayDto[];
    reasons: Record<string, number>;
    reply_seconds: number[];
    sentiments: Record<string, number>;
    voicemail: number;
    error?: string;
}
declare const REPORT_RANGES: readonly {
    days: number;
    id: string;
    label: string;
}[];
interface ReportTileVM {
    id: string;
    label: string;
    value: string;
    meta: string;
    /** Signed change against the previous period, or null when there is no
     *  prior data to compare with (never a fabricated 0%). */
    delta: {
        text: string;
        tone: "pos" | "neg" | "";
    } | null;
    /** One point per day of the current period, for the sparkline. */
    spark: number[];
}
interface ReportPointVM {
    day: string;
    /** "Aug 28" */
    label: string;
    /** "28" */
    short: string;
    in: number;
    ai: number;
    you: number;
    none: number;
    calls: number;
    callSeconds: number;
    escalations: number;
    newPeople: number;
}
interface ReportBarVM {
    id: string;
    label: string;
    value: number;
    /** 0..1 of the largest bar in its group. */
    share: number;
}
interface ReportVM {
    days: number;
    rangeLabel: string;
    since: string;
    until: string;
    timezone: string;
    /** Nothing came in during the period: no customer message and no call. */
    empty: boolean;
    tiles: ReportTileVM[];
    answered: {
        points: ReportPointVM[];
        totals: {
            in: number;
            ai: number;
            you: number;
            none: number;
        };
        max: number;
    };
    reasons: ReportBarVM[];
    replyTime: {
        count: number;
        median: number | null;
        p90: number | null;
        medianLabel: string;
        p90Label: string;
        buckets: ReportBarVM[];
    };
    calls: {
        points: ReportPointVM[];
        total: number;
        minutes: number;
        voicemail: number;
        sentiments: ReportBarVM[];
        max: number;
    };
    people: {
        points: ReportPointVM[];
        total: number;
        max: number;
    };
    table: {
        columns: string[];
        rows: (string | number)[][];
    };
}
declare function fmtDay(day: string): string;
/** "12s", "1m 05s", "14m", "2h 10m". */
declare function fmtSeconds(s: number | null | undefined): string;
declare function quantile(sorted: number[], q: number): number | null;
/**
 * Signed change vs the previous period. Null when the previous period has
 * nothing to compare against: "+∞%" and "vs 0" are not information.
 * `upIsGood` decides the tone; a change of zero has none.
 */
declare function deltaOf(current: number, previous: number, upIsGood: boolean, noun: string): ReportTileVM["delta"];
/**
 * A share against the prior period's share, in percentage points — never a
 * percentage of a percentage, and null when either period has nothing to
 * take a share of.
 */
declare function pointsDelta(current: number | null, previous: number | null, noun: string): ReportTileVM["delta"];
declare function toReportVM(dto: ReportDto): ReportVM;

/** A live call whose heartbeat is older than this is "still marked live · checking". */
declare const LIVE_STALE_MS: number;
/** A call live longer than this is flagged the same way: long calls happen, rarely. */
declare const LIVE_OVERLONG_MS: number;
/** Retell's analysis lands a little after call_ended; until then "no summary"
 *  is a fact about the clock, not the call. */
declare const ANALYSIS_GRACE_MS: number;
/** How many finished calls the page lists beside the live ones. */
declare const RECENT_MAX = 8;
interface LiveTurnVM {
    speaker: "agent" | "client";
    text: string;
    /** "0:42" from the provider's word timings, or "—". */
    t: string;
}
interface LiveCallVM {
    callId: string;
    /** The call's row in Conversations. */
    cvId: string;
    clientId: string | null;
    who: string;
    whoShort: string;
    initials: string;
    /** Display phone, or null when the caller ID was withheld. */
    number: string | null;
    direction: "inbound" | "outbound";
    status: string;
    /** In progress under the heartbeat rule. */
    live: boolean;
    /** Retell's not_connected: the dial never connected. */
    missed: boolean;
    /** Marked ongoing by the provider but silent past the heartbeat: the
     *  reconcile sweep will settle it; until then it is neither live nor
     *  ended, and the page must not call it either. */
    stale: boolean;
    /** Live, but the heartbeat is older than LIVE_STALE_MS or the call has run
     *  past LIVE_OVERLONG_MS: shown as "still marked live · checking". */
    checking: boolean;
    checkingWhy: string | null;
    startedAtMs: number | null;
    /** The last time the provider told us anything about this call. */
    heartbeatAtMs: number | null;
    /** "2:14 PM" today, "Aug 26" otherwise. */
    startedLabel: string;
    /** mm:ss once the call has ended; null while live (the page runs its own clock). */
    duration: string | null;
    summaryState: "ready" | "pending" | "none" | "missed";
    summary: string | null;
    sentiment: string | null;
    /** Why the call ended, in the owner's words. */
    endedHow: string | null;
    recordingState: "ready" | "pending" | "failed" | "none";
    transcript: LiveTurnVM[];
}
interface LiveLineVM {
    number: string | null;
    on: boolean;
    /** When the line last rang, in the same short form. */
    lastCallLabel: string | null;
}
interface LiveVM {
    /** In progress, oldest first — the one that has been waiting longest leads. */
    now: LiveCallVM[];
    /** Finished or missed, newest first, at most RECENT_MAX. */
    recent: LiveCallVM[];
    /** The voice channel, or null when the workspace has no phone line. */
    line: LiveLineVM | null;
    heartbeatMs: number;
    fetchedAtMs: number;
}
/** Seconds → "m:ss", the page's clock format. */
declare function fmtClock(seconds: number): string;
declare function toLiveCallVM(dto: CallDto, now?: Date): LiveCallVM;
declare function toLiveVM(calls: CallDto[], channels: ChannelDto[] | null, now?: Date): LiveVM;

export { ACTOR_TYPES, ANALYSIS_GRACE_MS, type ActorType, AppError, type BrainConfig, BrainConfigSchema, type BusinessProfile, BusinessProfileSchema, CALL_HEARTBEAT_MS, CHANNEL_KINDS, CONSENT_STATES, CONVERSATION_STATES, type CallDto, type CallVM, type ChannelDto, type ChannelHealth, type ChannelKind, type ChannelVM, type Closure, ClosureSchema, type ConsentBearing, type ConsentState, type ConversationDto, type ConversationMessageVM, type ConversationState, type ConversationVM, DAYS, DECISION_SUBJECTS, DECISION_VERBS, DISCONNECTION_LABELS, type DecisionSubject, type DecisionVerb, E164, ERROR_CODES, ESCALATION_REASONS, ESCALATION_REASON_LABELS, ESCALATION_STATES, EVENT_KINDS, type Envelope, type Err, type ErrorCode, type EscalationDto, type EscalationReason, type EscalationState, type EventKind, GuardrailsSchema, type Hours, type HoursRun, HoursSchema, type InboxThreadVM, type Interval, IntervalSchema, JOB_KINDS, JOB_STATES, type JobKind, type JobState, LIVE_OVERLONG_MS, LIVE_STALE_MS, type LiveCallVM, type LiveLineVM, type LiveTurnVM, type LiveVM, MAX_CLOSURES, MAX_INTERVALS_PER_DAY, MEMBERSHIP_ROLES, MESSAGE_CHANNELS, MESSAGE_DIRECTIONS, MESSAGE_SENDERS, MESSAGE_STATUSES, MESSAGE_TYPES, type MembershipRole, type MessageChannel, type MessageDirection, type MessageDto, type MessageSender, type MessageStatus, type MessageType, type MetricsSummaryDto, NEW_WINDOW_MS, type Note, NoteSchema, type NotificationsConfig, NotificationsConfigSchema, OPT_IN_PATTERN, OPT_OUT_PATTERN, OPT_OUT_REFUSAL, type Ok, PEOPLE_LISTS, PEOPLE_TABS, PERSON_MODES, PERSON_MODE_LABELS, PERSON_STATE_LABELS, POLICY_CLASSES, POLICY_MODES, type PeopleAggregates, type PersonChannel, type PersonConsent, type PersonDecisionDto, type PersonDetailDto, type PersonEscalationDto, type PersonFact, type PersonFirstContact, type PersonIdentityDto, type PersonLastContact, type PersonMode, type PersonReceptionist, type PersonRightNow, type PersonRowDto, type PersonRowVM, type PersonState, type PersonTimelineItemVM, type PersonVM, type PolicyClass, type PolicyLimits, PolicyLimitsSchema, type PolicyMode, type PolicyRow, QUIET_AFTER_MS, RECENT_MAX, REPLY_DELAY_DEFAULT_MS, REPLY_DELAY_MAX_MS, REPLY_DELAY_MIN_MS, REPORT_RANGES, ROLES, ROLE_PERMS, type ReceptionistTone, type ReportBarVM, type ReportDayDto, type ReportDto, type ReportPointVM, type ReportTileVM, type ReportVM, type Role, type Service, ServiceSchema, TEMPLATE_STATUSES, TENANT_STATUSES, type TemplateStatus, type TenantConfig, type TenantConfigParse, TenantConfigSchema, TenantConfigWriteSchema, type TenantStatus, type TimelineKind, type TodayCallRowVM, type TodayFactVM, type TodayNeedsRowVM, type TodaySentenceVM, type TodayVM, WA_WINDOW_MS, type WaWindow, ago, asPersonMode, composeSystemPrompt, contactMeta, contactName, deltaOf, describeNow, draftSendsAtMs, err, fmtClock, fmtDay, fmtSeconds, formatPhoneDisplay, formatWaited, hasProfile, hoursRuns, initialsOf, isHeldDraft, isLiveCall, isOptedOut, isOptedOutContact, isOwned, isRealDate, messageAt, messageStatusLabel, messageText, newReceptionistDefaults, normalizePhone, ok, parseTenantConfig, parseTenantConfigResult, peopleAggregates, personName, personStateFor, pointsDelta, quantile, reachedCustomer, reasonShort, recencyCells, replyDelayMs, resolveSystemPrompt, shortTime, threadStanding, toCallVM, toChannelVM, toConversationVM, toInboxThreadVM, toLiveCallVM, toLiveVM, toPersonRowVM, toPersonVM, toReportVM, toTodayVM, violatesNoPrices, waWindow };
