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
declare const ESCALATION_REASONS: readonly ["human_token", "non_text", "refusal", "rate_cap", "policy_block", "send_failed", "deadman", "brain_error", "manual", "opt_out", "state_unavailable", "stale", "person_hold", "budget"];
type EscalationReason = (typeof ESCALATION_REASONS)[number];
declare const ESCALATION_STATES: readonly ["open", "resolved"];
type EscalationState = (typeof ESCALATION_STATES)[number];
declare const DECISION_VERBS: readonly ["approve", "edit", "decline", "snooze", "wake", "take_over", "hand_back", "resolve", "archive", "reply", "cancel_send", "pause_agent", "resume_agent", "invite", "revoke_invite", "change_role", "remove_member", "erase", "whisper"];
type DecisionVerb = (typeof DECISION_VERBS)[number];
declare const DECISION_SUBJECTS: readonly ["conversation", "escalation", "draft", "lead", "message", "agent", "membership", "invitation", "contact", "call"];
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
 * What the receptionist says back, as a record and not just a string.
 *
 * The brain used to return text with a handoff token hidden in it, and
 * nothing else: no reading of what the customer wanted, no sense of how sure
 * it was, no trace of which fact it leaned on. Every "why did it say that?"
 * had to be guessed from the words. This is the shape it answers in now,
 * constrained by the API (output_config.format), validated here, carried on
 * the message row's meta, and read by the Inbox.
 *
 * Kept to what a salon owner can act on: the intent names the class of
 * question, the confidence drives the hold-for-review dial, the reason is one
 * sentence for the rail, the facts are what to check when the answer is
 * wrong.
 */

declare const BRAIN_INTENTS: readonly ["booking", "pricing", "hours", "services", "location", "complaint", "smalltalk", "other"];
type BrainIntent = (typeof BRAIN_INTENTS)[number];
declare const INTENT_LABELS: Record<BrainIntent, string>;
declare const BRAIN_LANGUAGES: readonly ["en", "es", "other"];
/**
 * The JSON Schema the API constrains decoding to. Only what the API supports:
 * no numeric ranges, no length limits, no nullable unions — those are checked
 * by the zod schema below after the fact, and clamped rather than refused.
 */
declare const BRAIN_OUTPUT_JSON_SCHEMA: {
    readonly type: "object";
    readonly properties: {
        readonly reply: {
            readonly type: "string";
            readonly description: "Exactly what the customer receives, in their language, in the receptionist's voice. Nothing else goes here.";
        };
        readonly intent: {
            readonly type: "string";
            readonly enum: readonly ["booking", "pricing", "hours", "services", "location", "complaint", "smalltalk", "other"];
            readonly description: "What the customer is after.";
        };
        readonly escalate: {
            readonly type: "boolean";
            readonly description: "True when a person should take over now: they asked for one, you cannot help, or a rule you were given says so.";
        };
        readonly reason: {
            readonly type: "string";
            readonly description: "One short sentence: why a person is needed, or why this answer might be wrong. Empty when neither applies.";
        };
        readonly confidence: {
            readonly type: "number";
            readonly description: "How sure you are that this reply is right and complete for this customer, from 0 to 1.";
        };
        readonly facts_used: {
            readonly type: "array";
            readonly items: {
                readonly type: "string";
            };
            readonly description: "The business facts this reply relied on, each in a few words (an hour, a service, a note). Empty when none.";
        };
        readonly language: {
            readonly type: "string";
            readonly enum: readonly ["en", "es", "other"];
            readonly description: "The language the reply is written in.";
        };
    };
    readonly required: readonly ["reply", "intent", "escalate", "reason", "confidence", "facts_used", "language"];
    readonly additionalProperties: false;
};
/** The read side: tolerant of what a model might still do, strict about shape. */
declare const BrainOutputSchema: z.ZodObject<{
    reply: z.ZodString;
    intent: z.ZodCatch<z.ZodEnum<["booking", "pricing", "hours", "services", "location", "complaint", "smalltalk", "other"]>>;
    escalate: z.ZodCatch<z.ZodBoolean>;
    reason: z.ZodEffects<z.ZodCatch<z.ZodString>, string, unknown>;
    confidence: z.ZodEffects<z.ZodCatch<z.ZodNumber>, number, unknown>;
    facts_used: z.ZodEffects<z.ZodCatch<z.ZodArray<z.ZodString, "many">>, string[], unknown>;
    language: z.ZodCatch<z.ZodEnum<["en", "es", "other"]>>;
}, "strip", z.ZodTypeAny, {
    reply: string;
    intent: "booking" | "pricing" | "hours" | "services" | "location" | "complaint" | "smalltalk" | "other";
    escalate: boolean;
    reason: string;
    confidence: number;
    facts_used: string[];
    language: "other" | "en" | "es";
}, {
    reply: string;
    intent?: unknown;
    escalate?: unknown;
    reason?: unknown;
    confidence?: unknown;
    facts_used?: unknown;
    language?: unknown;
}>;
type BrainOutput = z.infer<typeof BrainOutputSchema>;
/**
 * Parse what the model returned. With constrained decoding the JSON is well
 * formed unless the answer was cut off by max_tokens; a truncated document
 * fails here and the caller falls back to the holding reply, as it always
 * did for a capped answer.
 */
declare function parseBrainOutput(raw: string): {
    ok: true;
    value: BrainOutput;
} | {
    ok: false;
    error: string;
};
/**
 * What a message row remembers about its own reasoning. Written by the edge
 * beside source/delay_ms; read back by the Inbox through the meta the DTO
 * already carries.
 */
interface BrainMeta {
    intent: BrainIntent;
    confidence: number;
    reason: string;
    facts_used: string[];
    language: (typeof BRAIN_LANGUAGES)[number];
    model: string;
}
declare function brainMetaOf(out: BrainOutput, model: string): BrainMeta;
/** The rail beside a reply: why it said what it said. */
interface ReplyWhyVM {
    intent: BrainIntent;
    intentLabel: string;
    /** 0–100, or null when the row predates this. */
    confidence: number | null;
    reason: string | null;
    facts: string[];
    /** Why the draft is waiting, when it is. */
    heldFor: "low_confidence" | "veto_window" | null;
    /** One line for a chip: "Pricing question · 62% sure". */
    summary: string;
}
/** From a message row's meta; null when the row carries no reasoning. */
declare function replyWhy(meta: Record<string, unknown> | null | undefined): ReplyWhyVM | null;
/** The confidence dial, as the Autonomy pane offers it. 0 means off. */
declare const CONFIDENCE_STEPS: readonly [0, 0.6, 0.75, 0.9];

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
    /** The attachment facts a browser may see; the bytes are behind
     *  /api/v1/messages/:id/media. Absent for words. */
    media: {
        mime_type?: string | null;
        fetch_state?: string;
        filename?: string | null;
        caption?: string | null;
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
    /** The attachment, when the message is one. */
    media?: MediaVM;
    /** Why the receptionist said it, when the row remembers. */
    why?: ReplyWhyVM;
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
/** An attachment as the thread draws it. */
interface MediaVM {
    messageId: string;
    kind: "image" | "audio" | "video" | "document" | "other";
    mime: string | null;
    filename: string | null;
    caption: string | null;
    /** Stored and servable; false while it is fetching or after a failed fetch. */
    available: boolean;
}
/** What kind of thing an attachment is: from its mime, else from WhatsApp's own word for it. */
declare function mediaKind(mime: string | null | undefined, raw?: string | null): MediaVM["kind"];
/** The attachment on a message, as the thread draws it; null for words. */
declare function mediaVM(m: MessageDto): MediaVM | null;
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
        why?: ReplyWhyVM;
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
    /** Absolute times, epoch ms, for anything that must not drift with the
     *  clock — the bell keys its read state on them. */
    lastAtMs: number;
    escalatedAtMs?: number;
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
        /** The attachment, when the message is one. */
        media?: MediaVM;
        /** Why the receptionist said it, when the row remembers. */
        why?: ReplyWhyVM;
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
    /** Turns. `start` (seconds) is the turn's first word; `words` is the raw
     *  provider shape and is stripped by the list route (F15). */
    transcript_object: Array<{
        role?: string;
        content?: string;
        start?: number;
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
        speaker: "agent" | "client" | "whisper";
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
    export: boolean;
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
    /**
     * The confidence dial. Under 'auto', a reply the model is less sure about
     * than this waits in the hold window (reply_delay_ms) for a person instead
     * of going straight out — sure enough sends itself, not sure enough waits.
     * 0 or absent means off.
     */
    min_confidence: z.ZodOptional<z.ZodNumber>;
    /**
     * The day's token budget: model tokens in and out over a rolling 24
     * hours, read from the usage events every reply writes. Over it the
     * receptionist stops and files a `budget` escalation, as it does at the
     * reply cap. 0 or absent is off; a value is at least a thousand, because
     * a budget of ten would be a mute button with a misleading name.
     */
    max_llm_tokens_day: z.ZodOptional<z.ZodEffects<z.ZodNumber, number, number>>;
}, "strict", z.ZodTypeAny, {
    max_replies_day?: number | undefined;
    pause_hours?: number | undefined;
    reply_delay_ms?: number | undefined;
    min_confidence?: number | undefined;
    max_llm_tokens_day?: number | undefined;
}, {
    max_replies_day?: number | undefined;
    pause_hours?: number | undefined;
    reply_delay_ms?: number | undefined;
    min_confidence?: number | undefined;
    max_llm_tokens_day?: number | undefined;
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
/**
 * How bookings may be OFFERED — never made. The receptionist sends the link;
 * these shape which open times it names first and what it says about them.
 */
declare const BookingRulesSchema: z.ZodObject<{
    /** Least notice for a slot, in hours. Absent = 2. */
    lead_hours: z.ZodOptional<z.ZodNumber>;
    /** Gap kept around each existing appointment, in minutes. Absent = 0. */
    buffer_min: z.ZodOptional<z.ZodNumber>;
    /** How far ahead open times are offered, in days. Absent = 14. */
    max_days_ahead: z.ZodOptional<z.ZodNumber>;
    /** The shortest window worth naming, in minutes. Absent = 30. */
    slot_min: z.ZodOptional<z.ZodNumber>;
    /** Services that need a consultation before they can be booked. */
    consult_first: z.ZodOptional<z.ZodArray<z.ZodString, "many">>;
    party_max: z.ZodOptional<z.ZodNumber>;
    /** Anything else about booking, one short line each. */
    notes: z.ZodOptional<z.ZodArray<z.ZodString, "many">>;
}, "strict", z.ZodTypeAny, {
    lead_hours?: number | undefined;
    buffer_min?: number | undefined;
    max_days_ahead?: number | undefined;
    slot_min?: number | undefined;
    consult_first?: string[] | undefined;
    party_max?: number | undefined;
    notes?: string[] | undefined;
}, {
    lead_hours?: number | undefined;
    buffer_min?: number | undefined;
    max_days_ahead?: number | undefined;
    slot_min?: number | undefined;
    consult_first?: string[] | undefined;
    party_max?: number | undefined;
    notes?: string[] | undefined;
}>;
type BookingRules = z.infer<typeof BookingRulesSchema>;
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
    booking_rules: z.ZodOptional<z.ZodObject<{
        /** Least notice for a slot, in hours. Absent = 2. */
        lead_hours: z.ZodOptional<z.ZodNumber>;
        /** Gap kept around each existing appointment, in minutes. Absent = 0. */
        buffer_min: z.ZodOptional<z.ZodNumber>;
        /** How far ahead open times are offered, in days. Absent = 14. */
        max_days_ahead: z.ZodOptional<z.ZodNumber>;
        /** The shortest window worth naming, in minutes. Absent = 30. */
        slot_min: z.ZodOptional<z.ZodNumber>;
        /** Services that need a consultation before they can be booked. */
        consult_first: z.ZodOptional<z.ZodArray<z.ZodString, "many">>;
        party_max: z.ZodOptional<z.ZodNumber>;
        /** Anything else about booking, one short line each. */
        notes: z.ZodOptional<z.ZodArray<z.ZodString, "many">>;
    }, "strict", z.ZodTypeAny, {
        lead_hours?: number | undefined;
        buffer_min?: number | undefined;
        max_days_ahead?: number | undefined;
        slot_min?: number | undefined;
        consult_first?: string[] | undefined;
        party_max?: number | undefined;
        notes?: string[] | undefined;
    }, {
        lead_hours?: number | undefined;
        buffer_min?: number | undefined;
        max_days_ahead?: number | undefined;
        slot_min?: number | undefined;
        consult_first?: string[] | undefined;
        party_max?: number | undefined;
        notes?: string[] | undefined;
    }>>;
    /**
     * Anything the owner wants said that no field covers.
     *
     * The escape hatch that keeps this model honest — without it, structuring
     * the facts would mean losing whatever did not fit, and the first migration
     * would be a downgrade.
     */
    extra_instructions: z.ZodOptional<z.ZodString>;
}, "strict", z.ZodTypeAny, {
    hours?: Partial<Record<"mon" | "tue" | "wed" | "thu" | "fri" | "sat" | "sun", {
        open?: string | null | undefined;
        close?: string | null | undefined;
        intervals?: {
            open: string;
            close: string;
        }[] | undefined;
    }>> | undefined;
    services?: {
        name: string;
        duration_min?: number | undefined;
        price_note?: string | undefined;
    }[] | undefined;
    notes?: {
        text: string;
        title: string;
    }[] | undefined;
    address?: string | undefined;
    closures?: {
        date: string;
        note?: string | undefined;
        until?: string | undefined;
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
    booking_rules?: {
        lead_hours?: number | undefined;
        buffer_min?: number | undefined;
        max_days_ahead?: number | undefined;
        slot_min?: number | undefined;
        consult_first?: string[] | undefined;
        party_max?: number | undefined;
        notes?: string[] | undefined;
    } | undefined;
    extra_instructions?: string | undefined;
}, {
    hours?: Partial<Record<"mon" | "tue" | "wed" | "thu" | "fri" | "sat" | "sun", {
        open?: string | null | undefined;
        close?: string | null | undefined;
        intervals?: {
            open: string;
            close: string;
        }[] | undefined;
    }>> | undefined;
    services?: {
        name: string;
        duration_min?: number | undefined;
        price_note?: string | undefined;
    }[] | undefined;
    notes?: {
        text: string;
        title: string;
    }[] | undefined;
    address?: string | undefined;
    closures?: {
        date: string;
        note?: string | undefined;
        until?: string | undefined;
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
    booking_rules?: {
        lead_hours?: number | undefined;
        buffer_min?: number | undefined;
        max_days_ahead?: number | undefined;
        slot_min?: number | undefined;
        consult_first?: string[] | undefined;
        party_max?: number | undefined;
        notes?: string[] | undefined;
    } | undefined;
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
        booking_rules: z.ZodOptional<z.ZodObject<{
            /** Least notice for a slot, in hours. Absent = 2. */
            lead_hours: z.ZodOptional<z.ZodNumber>;
            /** Gap kept around each existing appointment, in minutes. Absent = 0. */
            buffer_min: z.ZodOptional<z.ZodNumber>;
            /** How far ahead open times are offered, in days. Absent = 14. */
            max_days_ahead: z.ZodOptional<z.ZodNumber>;
            /** The shortest window worth naming, in minutes. Absent = 30. */
            slot_min: z.ZodOptional<z.ZodNumber>;
            /** Services that need a consultation before they can be booked. */
            consult_first: z.ZodOptional<z.ZodArray<z.ZodString, "many">>;
            party_max: z.ZodOptional<z.ZodNumber>;
            /** Anything else about booking, one short line each. */
            notes: z.ZodOptional<z.ZodArray<z.ZodString, "many">>;
        }, "strict", z.ZodTypeAny, {
            lead_hours?: number | undefined;
            buffer_min?: number | undefined;
            max_days_ahead?: number | undefined;
            slot_min?: number | undefined;
            consult_first?: string[] | undefined;
            party_max?: number | undefined;
            notes?: string[] | undefined;
        }, {
            lead_hours?: number | undefined;
            buffer_min?: number | undefined;
            max_days_ahead?: number | undefined;
            slot_min?: number | undefined;
            consult_first?: string[] | undefined;
            party_max?: number | undefined;
            notes?: string[] | undefined;
        }>>;
        /**
         * Anything the owner wants said that no field covers.
         *
         * The escape hatch that keeps this model honest — without it, structuring
         * the facts would mean losing whatever did not fit, and the first migration
         * would be a downgrade.
         */
        extra_instructions: z.ZodOptional<z.ZodString>;
    }, "strict", z.ZodTypeAny, {
        hours?: Partial<Record<"mon" | "tue" | "wed" | "thu" | "fri" | "sat" | "sun", {
            open?: string | null | undefined;
            close?: string | null | undefined;
            intervals?: {
                open: string;
                close: string;
            }[] | undefined;
        }>> | undefined;
        services?: {
            name: string;
            duration_min?: number | undefined;
            price_note?: string | undefined;
        }[] | undefined;
        notes?: {
            text: string;
            title: string;
        }[] | undefined;
        address?: string | undefined;
        closures?: {
            date: string;
            note?: string | undefined;
            until?: string | undefined;
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
        booking_rules?: {
            lead_hours?: number | undefined;
            buffer_min?: number | undefined;
            max_days_ahead?: number | undefined;
            slot_min?: number | undefined;
            consult_first?: string[] | undefined;
            party_max?: number | undefined;
            notes?: string[] | undefined;
        } | undefined;
        extra_instructions?: string | undefined;
    }, {
        hours?: Partial<Record<"mon" | "tue" | "wed" | "thu" | "fri" | "sat" | "sun", {
            open?: string | null | undefined;
            close?: string | null | undefined;
            intervals?: {
                open: string;
                close: string;
            }[] | undefined;
        }>> | undefined;
        services?: {
            name: string;
            duration_min?: number | undefined;
            price_note?: string | undefined;
        }[] | undefined;
        notes?: {
            text: string;
            title: string;
        }[] | undefined;
        address?: string | undefined;
        closures?: {
            date: string;
            note?: string | undefined;
            until?: string | undefined;
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
        booking_rules?: {
            lead_hours?: number | undefined;
            buffer_min?: number | undefined;
            max_days_ahead?: number | undefined;
            slot_min?: number | undefined;
            consult_first?: string[] | undefined;
            party_max?: number | undefined;
            notes?: string[] | undefined;
        } | undefined;
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
        error: string;
        greeting: string;
    }, {
        non_text: string;
        error: string;
        greeting: string;
    }>;
}, "strict", z.ZodTypeAny, {
    business_name: string;
    phone_display: string;
    booking_link: string;
    system_prompt: string;
    fallbacks: {
        non_text: string;
        error: string;
        greeting: string;
    };
    profile?: {
        hours?: Partial<Record<"mon" | "tue" | "wed" | "thu" | "fri" | "sat" | "sun", {
            open?: string | null | undefined;
            close?: string | null | undefined;
            intervals?: {
                open: string;
                close: string;
            }[] | undefined;
        }>> | undefined;
        services?: {
            name: string;
            duration_min?: number | undefined;
            price_note?: string | undefined;
        }[] | undefined;
        notes?: {
            text: string;
            title: string;
        }[] | undefined;
        address?: string | undefined;
        closures?: {
            date: string;
            note?: string | undefined;
            until?: string | undefined;
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
        booking_rules?: {
            lead_hours?: number | undefined;
            buffer_min?: number | undefined;
            max_days_ahead?: number | undefined;
            slot_min?: number | undefined;
            consult_first?: string[] | undefined;
            party_max?: number | undefined;
            notes?: string[] | undefined;
        } | undefined;
        extra_instructions?: string | undefined;
    } | undefined;
}, {
    business_name: string;
    phone_display: string;
    booking_link: string;
    system_prompt: string;
    fallbacks: {
        non_text: string;
        error: string;
        greeting: string;
    };
    profile?: {
        hours?: Partial<Record<"mon" | "tue" | "wed" | "thu" | "fri" | "sat" | "sun", {
            open?: string | null | undefined;
            close?: string | null | undefined;
            intervals?: {
                open: string;
                close: string;
            }[] | undefined;
        }>> | undefined;
        services?: {
            name: string;
            duration_min?: number | undefined;
            price_note?: string | undefined;
        }[] | undefined;
        notes?: {
            text: string;
            title: string;
        }[] | undefined;
        address?: string | undefined;
        closures?: {
            date: string;
            note?: string | undefined;
            until?: string | undefined;
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
        booking_rules?: {
            lead_hours?: number | undefined;
            buffer_min?: number | undefined;
            max_days_ahead?: number | undefined;
            slot_min?: number | undefined;
            consult_first?: string[] | undefined;
            party_max?: number | undefined;
            notes?: string[] | undefined;
        } | undefined;
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
/**
 * The calendar the receptionist may READ. An iCal address — what any booking
 * tool that syncs to Google, Apple or Outlook produces — never credentials to
 * write with. Nothing is ever booked from here; the booking link does that,
 * whichever tool is behind it.
 */
declare const CalendarConfigSchema: z.ZodObject<{
    ical_url: z.ZodEffects<z.ZodString, string, string>;
}, "strict", z.ZodTypeAny, {
    ical_url: string;
}, {
    ical_url: string;
}>;
type CalendarConfig = z.infer<typeof CalendarConfigSchema>;
/**
 * Opt-in abilities, off unless the workspace turns them on.
 *
 * `vision`: the receptionist looks at photos customers send over WhatsApp and
 * answers them like words, under every rule it already follows. Off, a photo
 * is acknowledged and handed to a person, as before.
 */
declare const FeaturesConfigSchema: z.ZodObject<{
    vision: z.ZodOptional<z.ZodBoolean>;
}, "strict", z.ZodTypeAny, {
    vision?: boolean | undefined;
}, {
    vision?: boolean | undefined;
}>;
type FeaturesConfig = z.infer<typeof FeaturesConfigSchema>;
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
            booking_rules: z.ZodOptional<z.ZodObject<{
                /** Least notice for a slot, in hours. Absent = 2. */
                lead_hours: z.ZodOptional<z.ZodNumber>;
                /** Gap kept around each existing appointment, in minutes. Absent = 0. */
                buffer_min: z.ZodOptional<z.ZodNumber>;
                /** How far ahead open times are offered, in days. Absent = 14. */
                max_days_ahead: z.ZodOptional<z.ZodNumber>;
                /** The shortest window worth naming, in minutes. Absent = 30. */
                slot_min: z.ZodOptional<z.ZodNumber>;
                /** Services that need a consultation before they can be booked. */
                consult_first: z.ZodOptional<z.ZodArray<z.ZodString, "many">>;
                party_max: z.ZodOptional<z.ZodNumber>;
                /** Anything else about booking, one short line each. */
                notes: z.ZodOptional<z.ZodArray<z.ZodString, "many">>;
            }, "strict", z.ZodTypeAny, {
                lead_hours?: number | undefined;
                buffer_min?: number | undefined;
                max_days_ahead?: number | undefined;
                slot_min?: number | undefined;
                consult_first?: string[] | undefined;
                party_max?: number | undefined;
                notes?: string[] | undefined;
            }, {
                lead_hours?: number | undefined;
                buffer_min?: number | undefined;
                max_days_ahead?: number | undefined;
                slot_min?: number | undefined;
                consult_first?: string[] | undefined;
                party_max?: number | undefined;
                notes?: string[] | undefined;
            }>>;
            /**
             * Anything the owner wants said that no field covers.
             *
             * The escape hatch that keeps this model honest — without it, structuring
             * the facts would mean losing whatever did not fit, and the first migration
             * would be a downgrade.
             */
            extra_instructions: z.ZodOptional<z.ZodString>;
        }, "strict", z.ZodTypeAny, {
            hours?: Partial<Record<"mon" | "tue" | "wed" | "thu" | "fri" | "sat" | "sun", {
                open?: string | null | undefined;
                close?: string | null | undefined;
                intervals?: {
                    open: string;
                    close: string;
                }[] | undefined;
            }>> | undefined;
            services?: {
                name: string;
                duration_min?: number | undefined;
                price_note?: string | undefined;
            }[] | undefined;
            notes?: {
                text: string;
                title: string;
            }[] | undefined;
            address?: string | undefined;
            closures?: {
                date: string;
                note?: string | undefined;
                until?: string | undefined;
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
            booking_rules?: {
                lead_hours?: number | undefined;
                buffer_min?: number | undefined;
                max_days_ahead?: number | undefined;
                slot_min?: number | undefined;
                consult_first?: string[] | undefined;
                party_max?: number | undefined;
                notes?: string[] | undefined;
            } | undefined;
            extra_instructions?: string | undefined;
        }, {
            hours?: Partial<Record<"mon" | "tue" | "wed" | "thu" | "fri" | "sat" | "sun", {
                open?: string | null | undefined;
                close?: string | null | undefined;
                intervals?: {
                    open: string;
                    close: string;
                }[] | undefined;
            }>> | undefined;
            services?: {
                name: string;
                duration_min?: number | undefined;
                price_note?: string | undefined;
            }[] | undefined;
            notes?: {
                text: string;
                title: string;
            }[] | undefined;
            address?: string | undefined;
            closures?: {
                date: string;
                note?: string | undefined;
                until?: string | undefined;
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
            booking_rules?: {
                lead_hours?: number | undefined;
                buffer_min?: number | undefined;
                max_days_ahead?: number | undefined;
                slot_min?: number | undefined;
                consult_first?: string[] | undefined;
                party_max?: number | undefined;
                notes?: string[] | undefined;
            } | undefined;
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
            error: string;
            greeting: string;
        }, {
            non_text: string;
            error: string;
            greeting: string;
        }>;
    }, "strict", z.ZodTypeAny, {
        business_name: string;
        phone_display: string;
        booking_link: string;
        system_prompt: string;
        fallbacks: {
            non_text: string;
            error: string;
            greeting: string;
        };
        profile?: {
            hours?: Partial<Record<"mon" | "tue" | "wed" | "thu" | "fri" | "sat" | "sun", {
                open?: string | null | undefined;
                close?: string | null | undefined;
                intervals?: {
                    open: string;
                    close: string;
                }[] | undefined;
            }>> | undefined;
            services?: {
                name: string;
                duration_min?: number | undefined;
                price_note?: string | undefined;
            }[] | undefined;
            notes?: {
                text: string;
                title: string;
            }[] | undefined;
            address?: string | undefined;
            closures?: {
                date: string;
                note?: string | undefined;
                until?: string | undefined;
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
            booking_rules?: {
                lead_hours?: number | undefined;
                buffer_min?: number | undefined;
                max_days_ahead?: number | undefined;
                slot_min?: number | undefined;
                consult_first?: string[] | undefined;
                party_max?: number | undefined;
                notes?: string[] | undefined;
            } | undefined;
            extra_instructions?: string | undefined;
        } | undefined;
    }, {
        business_name: string;
        phone_display: string;
        booking_link: string;
        system_prompt: string;
        fallbacks: {
            non_text: string;
            error: string;
            greeting: string;
        };
        profile?: {
            hours?: Partial<Record<"mon" | "tue" | "wed" | "thu" | "fri" | "sat" | "sun", {
                open?: string | null | undefined;
                close?: string | null | undefined;
                intervals?: {
                    open: string;
                    close: string;
                }[] | undefined;
            }>> | undefined;
            services?: {
                name: string;
                duration_min?: number | undefined;
                price_note?: string | undefined;
            }[] | undefined;
            notes?: {
                text: string;
                title: string;
            }[] | undefined;
            address?: string | undefined;
            closures?: {
                date: string;
                note?: string | undefined;
                until?: string | undefined;
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
            booking_rules?: {
                lead_hours?: number | undefined;
                buffer_min?: number | undefined;
                max_days_ahead?: number | undefined;
                slot_min?: number | undefined;
                consult_first?: string[] | undefined;
                party_max?: number | undefined;
                notes?: string[] | undefined;
            } | undefined;
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
    calendar: z.ZodOptional<z.ZodObject<{
        ical_url: z.ZodEffects<z.ZodString, string, string>;
    }, "strict", z.ZodTypeAny, {
        ical_url: string;
    }, {
        ical_url: string;
    }>>;
    features: z.ZodOptional<z.ZodObject<{
        vision: z.ZodOptional<z.ZodBoolean>;
    }, "strict", z.ZodTypeAny, {
        vision?: boolean | undefined;
    }, {
        vision?: boolean | undefined;
    }>>;
}, "strip", z.ZodTypeAny, {
    brain?: {
        business_name: string;
        phone_display: string;
        booking_link: string;
        system_prompt: string;
        fallbacks: {
            non_text: string;
            error: string;
            greeting: string;
        };
        profile?: {
            hours?: Partial<Record<"mon" | "tue" | "wed" | "thu" | "fri" | "sat" | "sun", {
                open?: string | null | undefined;
                close?: string | null | undefined;
                intervals?: {
                    open: string;
                    close: string;
                }[] | undefined;
            }>> | undefined;
            services?: {
                name: string;
                duration_min?: number | undefined;
                price_note?: string | undefined;
            }[] | undefined;
            notes?: {
                text: string;
                title: string;
            }[] | undefined;
            address?: string | undefined;
            closures?: {
                date: string;
                note?: string | undefined;
                until?: string | undefined;
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
            booking_rules?: {
                lead_hours?: number | undefined;
                buffer_min?: number | undefined;
                max_days_ahead?: number | undefined;
                slot_min?: number | undefined;
                consult_first?: string[] | undefined;
                party_max?: number | undefined;
                notes?: string[] | undefined;
            } | undefined;
            extra_instructions?: string | undefined;
        } | undefined;
    } | undefined;
    notifications?: {
        escalation_emails: string[];
        from?: string | undefined;
    } | undefined;
    calendar?: {
        ical_url: string;
    } | undefined;
    features?: {
        vision?: boolean | undefined;
    } | undefined;
}, {
    brain?: {
        business_name: string;
        phone_display: string;
        booking_link: string;
        system_prompt: string;
        fallbacks: {
            non_text: string;
            error: string;
            greeting: string;
        };
        profile?: {
            hours?: Partial<Record<"mon" | "tue" | "wed" | "thu" | "fri" | "sat" | "sun", {
                open?: string | null | undefined;
                close?: string | null | undefined;
                intervals?: {
                    open: string;
                    close: string;
                }[] | undefined;
            }>> | undefined;
            services?: {
                name: string;
                duration_min?: number | undefined;
                price_note?: string | undefined;
            }[] | undefined;
            notes?: {
                text: string;
                title: string;
            }[] | undefined;
            address?: string | undefined;
            closures?: {
                date: string;
                note?: string | undefined;
                until?: string | undefined;
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
            booking_rules?: {
                lead_hours?: number | undefined;
                buffer_min?: number | undefined;
                max_days_ahead?: number | undefined;
                slot_min?: number | undefined;
                consult_first?: string[] | undefined;
                party_max?: number | undefined;
                notes?: string[] | undefined;
            } | undefined;
            extra_instructions?: string | undefined;
        } | undefined;
    } | undefined;
    notifications?: {
        escalation_emails: string[];
        from?: string | undefined;
    } | undefined;
    calendar?: {
        ical_url: string;
    } | undefined;
    features?: {
        vision?: boolean | undefined;
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
            booking_rules: z.ZodOptional<z.ZodObject<{
                /** Least notice for a slot, in hours. Absent = 2. */
                lead_hours: z.ZodOptional<z.ZodNumber>;
                /** Gap kept around each existing appointment, in minutes. Absent = 0. */
                buffer_min: z.ZodOptional<z.ZodNumber>;
                /** How far ahead open times are offered, in days. Absent = 14. */
                max_days_ahead: z.ZodOptional<z.ZodNumber>;
                /** The shortest window worth naming, in minutes. Absent = 30. */
                slot_min: z.ZodOptional<z.ZodNumber>;
                /** Services that need a consultation before they can be booked. */
                consult_first: z.ZodOptional<z.ZodArray<z.ZodString, "many">>;
                party_max: z.ZodOptional<z.ZodNumber>;
                /** Anything else about booking, one short line each. */
                notes: z.ZodOptional<z.ZodArray<z.ZodString, "many">>;
            }, "strict", z.ZodTypeAny, {
                lead_hours?: number | undefined;
                buffer_min?: number | undefined;
                max_days_ahead?: number | undefined;
                slot_min?: number | undefined;
                consult_first?: string[] | undefined;
                party_max?: number | undefined;
                notes?: string[] | undefined;
            }, {
                lead_hours?: number | undefined;
                buffer_min?: number | undefined;
                max_days_ahead?: number | undefined;
                slot_min?: number | undefined;
                consult_first?: string[] | undefined;
                party_max?: number | undefined;
                notes?: string[] | undefined;
            }>>;
            /**
             * Anything the owner wants said that no field covers.
             *
             * The escape hatch that keeps this model honest — without it, structuring
             * the facts would mean losing whatever did not fit, and the first migration
             * would be a downgrade.
             */
            extra_instructions: z.ZodOptional<z.ZodString>;
        }, "strict", z.ZodTypeAny, {
            hours?: Partial<Record<"mon" | "tue" | "wed" | "thu" | "fri" | "sat" | "sun", {
                open?: string | null | undefined;
                close?: string | null | undefined;
                intervals?: {
                    open: string;
                    close: string;
                }[] | undefined;
            }>> | undefined;
            services?: {
                name: string;
                duration_min?: number | undefined;
                price_note?: string | undefined;
            }[] | undefined;
            notes?: {
                text: string;
                title: string;
            }[] | undefined;
            address?: string | undefined;
            closures?: {
                date: string;
                note?: string | undefined;
                until?: string | undefined;
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
            booking_rules?: {
                lead_hours?: number | undefined;
                buffer_min?: number | undefined;
                max_days_ahead?: number | undefined;
                slot_min?: number | undefined;
                consult_first?: string[] | undefined;
                party_max?: number | undefined;
                notes?: string[] | undefined;
            } | undefined;
            extra_instructions?: string | undefined;
        }, {
            hours?: Partial<Record<"mon" | "tue" | "wed" | "thu" | "fri" | "sat" | "sun", {
                open?: string | null | undefined;
                close?: string | null | undefined;
                intervals?: {
                    open: string;
                    close: string;
                }[] | undefined;
            }>> | undefined;
            services?: {
                name: string;
                duration_min?: number | undefined;
                price_note?: string | undefined;
            }[] | undefined;
            notes?: {
                text: string;
                title: string;
            }[] | undefined;
            address?: string | undefined;
            closures?: {
                date: string;
                note?: string | undefined;
                until?: string | undefined;
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
            booking_rules?: {
                lead_hours?: number | undefined;
                buffer_min?: number | undefined;
                max_days_ahead?: number | undefined;
                slot_min?: number | undefined;
                consult_first?: string[] | undefined;
                party_max?: number | undefined;
                notes?: string[] | undefined;
            } | undefined;
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
            error: string;
            greeting: string;
        }, {
            non_text: string;
            error: string;
            greeting: string;
        }>;
    }, "strict", z.ZodTypeAny, {
        business_name: string;
        phone_display: string;
        booking_link: string;
        system_prompt: string;
        fallbacks: {
            non_text: string;
            error: string;
            greeting: string;
        };
        profile?: {
            hours?: Partial<Record<"mon" | "tue" | "wed" | "thu" | "fri" | "sat" | "sun", {
                open?: string | null | undefined;
                close?: string | null | undefined;
                intervals?: {
                    open: string;
                    close: string;
                }[] | undefined;
            }>> | undefined;
            services?: {
                name: string;
                duration_min?: number | undefined;
                price_note?: string | undefined;
            }[] | undefined;
            notes?: {
                text: string;
                title: string;
            }[] | undefined;
            address?: string | undefined;
            closures?: {
                date: string;
                note?: string | undefined;
                until?: string | undefined;
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
            booking_rules?: {
                lead_hours?: number | undefined;
                buffer_min?: number | undefined;
                max_days_ahead?: number | undefined;
                slot_min?: number | undefined;
                consult_first?: string[] | undefined;
                party_max?: number | undefined;
                notes?: string[] | undefined;
            } | undefined;
            extra_instructions?: string | undefined;
        } | undefined;
    }, {
        business_name: string;
        phone_display: string;
        booking_link: string;
        system_prompt: string;
        fallbacks: {
            non_text: string;
            error: string;
            greeting: string;
        };
        profile?: {
            hours?: Partial<Record<"mon" | "tue" | "wed" | "thu" | "fri" | "sat" | "sun", {
                open?: string | null | undefined;
                close?: string | null | undefined;
                intervals?: {
                    open: string;
                    close: string;
                }[] | undefined;
            }>> | undefined;
            services?: {
                name: string;
                duration_min?: number | undefined;
                price_note?: string | undefined;
            }[] | undefined;
            notes?: {
                text: string;
                title: string;
            }[] | undefined;
            address?: string | undefined;
            closures?: {
                date: string;
                note?: string | undefined;
                until?: string | undefined;
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
            booking_rules?: {
                lead_hours?: number | undefined;
                buffer_min?: number | undefined;
                max_days_ahead?: number | undefined;
                slot_min?: number | undefined;
                consult_first?: string[] | undefined;
                party_max?: number | undefined;
                notes?: string[] | undefined;
            } | undefined;
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
    calendar: z.ZodOptional<z.ZodObject<{
        ical_url: z.ZodEffects<z.ZodString, string, string>;
    }, "strict", z.ZodTypeAny, {
        ical_url: string;
    }, {
        ical_url: string;
    }>>;
    features: z.ZodOptional<z.ZodObject<{
        vision: z.ZodOptional<z.ZodBoolean>;
    }, "strict", z.ZodTypeAny, {
        vision?: boolean | undefined;
    }, {
        vision?: boolean | undefined;
    }>>;
}, "strip", z.ZodTypeAny, {
    brain?: {
        business_name: string;
        phone_display: string;
        booking_link: string;
        system_prompt: string;
        fallbacks: {
            non_text: string;
            error: string;
            greeting: string;
        };
        profile?: {
            hours?: Partial<Record<"mon" | "tue" | "wed" | "thu" | "fri" | "sat" | "sun", {
                open?: string | null | undefined;
                close?: string | null | undefined;
                intervals?: {
                    open: string;
                    close: string;
                }[] | undefined;
            }>> | undefined;
            services?: {
                name: string;
                duration_min?: number | undefined;
                price_note?: string | undefined;
            }[] | undefined;
            notes?: {
                text: string;
                title: string;
            }[] | undefined;
            address?: string | undefined;
            closures?: {
                date: string;
                note?: string | undefined;
                until?: string | undefined;
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
            booking_rules?: {
                lead_hours?: number | undefined;
                buffer_min?: number | undefined;
                max_days_ahead?: number | undefined;
                slot_min?: number | undefined;
                consult_first?: string[] | undefined;
                party_max?: number | undefined;
                notes?: string[] | undefined;
            } | undefined;
            extra_instructions?: string | undefined;
        } | undefined;
    } | undefined;
    notifications?: {
        escalation_emails: string[];
        from?: string | undefined;
    } | undefined;
    calendar?: {
        ical_url: string;
    } | undefined;
    features?: {
        vision?: boolean | undefined;
    } | undefined;
}, {
    brain?: {
        business_name: string;
        phone_display: string;
        booking_link: string;
        system_prompt: string;
        fallbacks: {
            non_text: string;
            error: string;
            greeting: string;
        };
        profile?: {
            hours?: Partial<Record<"mon" | "tue" | "wed" | "thu" | "fri" | "sat" | "sun", {
                open?: string | null | undefined;
                close?: string | null | undefined;
                intervals?: {
                    open: string;
                    close: string;
                }[] | undefined;
            }>> | undefined;
            services?: {
                name: string;
                duration_min?: number | undefined;
                price_note?: string | undefined;
            }[] | undefined;
            notes?: {
                text: string;
                title: string;
            }[] | undefined;
            address?: string | undefined;
            closures?: {
                date: string;
                note?: string | undefined;
                until?: string | undefined;
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
            booking_rules?: {
                lead_hours?: number | undefined;
                buffer_min?: number | undefined;
                max_days_ahead?: number | undefined;
                slot_min?: number | undefined;
                consult_first?: string[] | undefined;
                party_max?: number | undefined;
                notes?: string[] | undefined;
            } | undefined;
            extra_instructions?: string | undefined;
        } | undefined;
    } | undefined;
    notifications?: {
        escalation_emails: string[];
        from?: string | undefined;
    } | undefined;
    calendar?: {
        ical_url: string;
    } | undefined;
    features?: {
        vision?: boolean | undefined;
    } | undefined;
}>, {
    brain?: {
        business_name: string;
        phone_display: string;
        booking_link: string;
        system_prompt: string;
        fallbacks: {
            non_text: string;
            error: string;
            greeting: string;
        };
        profile?: {
            hours?: Partial<Record<"mon" | "tue" | "wed" | "thu" | "fri" | "sat" | "sun", {
                open?: string | null | undefined;
                close?: string | null | undefined;
                intervals?: {
                    open: string;
                    close: string;
                }[] | undefined;
            }>> | undefined;
            services?: {
                name: string;
                duration_min?: number | undefined;
                price_note?: string | undefined;
            }[] | undefined;
            notes?: {
                text: string;
                title: string;
            }[] | undefined;
            address?: string | undefined;
            closures?: {
                date: string;
                note?: string | undefined;
                until?: string | undefined;
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
            booking_rules?: {
                lead_hours?: number | undefined;
                buffer_min?: number | undefined;
                max_days_ahead?: number | undefined;
                slot_min?: number | undefined;
                consult_first?: string[] | undefined;
                party_max?: number | undefined;
                notes?: string[] | undefined;
            } | undefined;
            extra_instructions?: string | undefined;
        } | undefined;
    } | undefined;
    notifications?: {
        escalation_emails: string[];
        from?: string | undefined;
    } | undefined;
    calendar?: {
        ical_url: string;
    } | undefined;
    features?: {
        vision?: boolean | undefined;
    } | undefined;
}, {
    brain?: {
        business_name: string;
        phone_display: string;
        booking_link: string;
        system_prompt: string;
        fallbacks: {
            non_text: string;
            error: string;
            greeting: string;
        };
        profile?: {
            hours?: Partial<Record<"mon" | "tue" | "wed" | "thu" | "fri" | "sat" | "sun", {
                open?: string | null | undefined;
                close?: string | null | undefined;
                intervals?: {
                    open: string;
                    close: string;
                }[] | undefined;
            }>> | undefined;
            services?: {
                name: string;
                duration_min?: number | undefined;
                price_note?: string | undefined;
            }[] | undefined;
            notes?: {
                text: string;
                title: string;
            }[] | undefined;
            address?: string | undefined;
            closures?: {
                date: string;
                note?: string | undefined;
                until?: string | undefined;
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
            booking_rules?: {
                lead_hours?: number | undefined;
                buffer_min?: number | undefined;
                max_days_ahead?: number | undefined;
                slot_min?: number | undefined;
                consult_first?: string[] | undefined;
                party_max?: number | undefined;
                notes?: string[] | undefined;
            } | undefined;
            extra_instructions?: string | undefined;
        } | undefined;
    } | undefined;
    notifications?: {
        escalation_emails: string[];
        from?: string | undefined;
    } | undefined;
    calendar?: {
        ical_url: string;
    } | undefined;
    features?: {
        vision?: boolean | undefined;
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

declare function frameWhisper(text: string): string;
/**
 * The text whisper: an instruction for a reply that has not gone out yet.
 *
 * Same frame, different moment. A call whisper is kept in mind for what
 * comes next; a steer rewrites the one draft that is waiting, following the
 * instruction where it fits and keeping everything else that was right. The
 * standing rules are restated because "just tell them it's $80" is the most
 * likely thing an owner will type.
 */
declare function frameSteer(text: string): string;
/** The owner's own words out of an injected turn — framed or not. */
declare function whisperText(content: string | null | undefined): string;

/**
 * The bell: what needs the owner, from what the browser already holds.
 *
 * The seeded bell promised five things to read that never happened, and a
 * real session showed nothing. The feed here is built from the rows the
 * surfaces have already fetched — the Inbox threads, the Live calls, the open
 * invitations — so it costs no request and is exactly as fresh as the pages
 * around it. Read state is per device (the bridge keeps it in localStorage):
 * honest, and enough until a person has more than one phone.
 *
 * Pure: the bridge feeds it the globals, the tests feed it fixtures.
 */
type NotificationKind = "needs_you" | "held_draft" | "missed_call" | "invite";
interface NotificationItem {
    /** Stable across refreshes: the row it stands for. */
    key: string;
    kind: NotificationKind;
    /** When it became true, epoch ms. */
    at: number;
    title: string;
    message: string;
    /** Hash route, without the leading "#/". */
    to: string;
    icon: string;
    tone: "" | "ok" | "warn";
    /** The button under it. */
    action: string;
}
/** The slice of the Inbox thread view-model the feed reads. */
interface FeedThread {
    id: string;
    real?: boolean;
    needsYou?: boolean;
    who: string;
    preview?: string;
    waitingMin?: number;
    /** Absolute times, when the view-model carries them. */
    lastAtMs?: number;
    escalatedAtMs?: number;
    veto?: {
        window: number;
        endsAtMs: number;
        messageId: string;
        draft: string;
        why?: {
            heldFor?: string | null;
            summary?: string;
        };
    };
}
/** The slice of the Live call view-model the feed reads. */
interface FeedCall {
    callId: string;
    cvId: string;
    who: string;
    number?: string | null;
    missed: boolean;
    live: boolean;
    startedAtMs: number | null;
}
interface FeedInvite {
    id: string;
    email: string;
    created_at: string;
}
interface FeedInput {
    threads?: FeedThread[] | null;
    calls?: FeedCall[] | null;
    invites?: FeedInvite[] | null;
    now: number;
}
/** Everything that needs the owner right now, newest first. */
declare function buildNotificationFeed(input: FeedInput): NotificationItem[];
/** What one device remembers about the bell. */
interface NotificationReadState {
    /** "Mark all read" moves this; opening the bell does not, so "New" stays new until the owner says so. */
    seenAt: number;
    read: string[];
    dismissed: string[];
    /** Device alerts while the app is in the background. */
    alerts: boolean;
}
declare const EMPTY_READ_STATE: NotificationReadState;
interface NotificationRow extends NotificationItem {
    unread: boolean;
}
/** The feed as a device sees it: dismissed rows gone, unread decided. */
declare function applyReadState(items: NotificationItem[], state: NotificationReadState): NotificationRow[];
/** "now", "5m", "2h", "3d" — the bell's clock (the Inbox has its own `ago`). */
declare function agoLabel(atMs: number, now: number): string;
/** The kinds a device is woken for; an invitation can wait for the bell. */
declare const ALERT_KINDS: readonly NotificationKind[];

/**
 * Ask: the workspace assistant, as a contract.
 *
 * What lives here is everything about Ask that is pure and shared: the shape
 * of a turn's final answer and how it is parsed, the rule that keeps a
 * citation honest, the palette's jump index and suggestions, the three
 * questions that are answered without a model, and the small partial-JSON
 * reader that lets the answer stream while the rest of the turn is still
 * being written. The route that runs the model lives in the dashboard; the
 * palette that shows the answer lives in the mockup; both read from here.
 */

/** One question, in characters. Longer than this is a document, not a question. */
declare const ASK_MAX_CHARS = 1000;
/** Tool rounds per turn: reads, then the answer. The last round is forced to finish. */
declare const ASK_MAX_ROUNDS = 4;
/** End to end, under the route's sixty-second ceiling. */
declare const ASK_TURN_BUDGET_MS = 45000;
/** Ask's own daily token budget per workspace, apart from the receptionist's. */
declare const ASK_TOKENS_DAY = 400000;
/** Ask threads are purged after this many days; they quote customers. */
declare const ASK_RETENTION_DAYS = 90;
/** How much of the workspace one read may return. The words stay the pages' words. */
declare const ASK_CAPS: {
    readonly threads: 20;
    readonly messages: 30;
    readonly messagesMore: 80;
    readonly calls: 20;
    readonly transcript: 40;
    readonly people: 12;
    readonly citations: 6;
    readonly followups: 3;
    readonly needsRows: 10;
};
declare const ASK_CITATION_KINDS: readonly ["thread", "conversation", "call", "person", "page"];
type AskCitationKind = (typeof ASK_CITATION_KINDS)[number];
interface AskCitation {
    kind: AskCitationKind;
    /** A conversation, call or contact id; for a page, its route. */
    id: string;
    label: string;
}
declare const ASK_LANGUAGES: readonly ["en", "es", "other"];
type AskLanguage = (typeof ASK_LANGUAGES)[number];
/**
 * The shape the model must answer in, as the `finish` tool's input. Every
 * property is required and nothing else is allowed, so the API can decode it
 * under constraint; "no navigation" is an empty route, never a missing key.
 */
declare const ASK_FINISH_JSON_SCHEMA: {
    readonly type: "object";
    readonly properties: {
        readonly answer: {
            readonly type: "string";
            readonly description: "The answer, in the person's language: two or three short sentences, under sixty words, unless they asked for detail (a transcript, a list). Plain text only: no markdown, no headings, and never a tag such as <answer> or <parameter> inside this string. More than two items go one per line, separated by newlines. Say what you found; if a read returned nothing, say so plainly.";
        };
        readonly citations: {
            readonly type: "array";
            readonly description: "The rows the answer rests on, taken ONLY from what the tools returned this turn. Each needs the kind, the exact id the tool gave you, and a short label (a name, a day, a call time).";
            readonly items: {
                readonly type: "object";
                readonly properties: {
                    readonly kind: {
                        readonly type: "string";
                        readonly enum: readonly ["thread", "conversation", "call", "person", "page"];
                    };
                    readonly id: {
                        readonly type: "string";
                    };
                    readonly label: {
                        readonly type: "string";
                    };
                };
                readonly required: readonly ["kind", "id", "label"];
                readonly additionalProperties: false;
            };
        };
        readonly followups: {
            readonly type: "array";
            readonly description: "Up to three short questions the person might ask next, in their language. Empty when nothing natural follows.";
            readonly items: {
                readonly type: "string";
            };
        };
        readonly navigate: {
            readonly type: "object";
            readonly description: "When the best answer is a page, the route to open and a label. to: the exact `route` field a tool returned for a row (a call, a thread, a person), or a page route (today, inbox, clients, conversations, live, reports, admin/workspace). Empty strings when there is nothing to open. now: true when the person asked to open, show or see that thing; the app goes there as soon as the answer is read, so keep the answer to one line.";
            readonly properties: {
                readonly to: {
                    readonly type: "string";
                };
                readonly label: {
                    readonly type: "string";
                };
                readonly now: {
                    readonly type: "boolean";
                };
            };
            readonly required: readonly ["to", "label", "now"];
            readonly additionalProperties: false;
        };
        readonly language: {
            readonly type: "string";
            readonly enum: readonly ["en", "es", "other"];
        };
    };
    readonly required: readonly ["answer", "citations", "followups", "navigate", "language"];
    readonly additionalProperties: false;
};
declare function cleanAnswer(raw: string): string;
/** Citations the model wrote into the wrong field, when the answer carried them as JSON. */
declare function recoverCitations(raw: string): AskCitation[];
declare const AskFinishSchema: z.ZodObject<{
    answer: z.ZodEffects<z.ZodCatch<z.ZodString>, string, unknown>;
    citations: z.ZodEffects<z.ZodCatch<z.ZodArray<z.ZodObject<{
        kind: z.ZodCatch<z.ZodEnum<["thread", "conversation", "call", "person", "page"]>>;
        id: z.ZodEffects<z.ZodCatch<z.ZodString>, string, unknown>;
        label: z.ZodEffects<z.ZodCatch<z.ZodString>, string, unknown>;
    }, "strip", z.ZodTypeAny, {
        id: string;
        kind: "conversation" | "call" | "person" | "thread" | "page";
        label: string;
    }, {
        id?: unknown;
        kind?: unknown;
        label?: unknown;
    }>, "many">>, {
        id: string;
        kind: "conversation" | "call" | "person" | "thread" | "page";
        label: string;
    }[], unknown>;
    followups: z.ZodEffects<z.ZodCatch<z.ZodArray<z.ZodString, "many">>, string[], unknown>;
    navigate: z.ZodEffects<z.ZodCatch<z.ZodObject<{
        to: z.ZodCatch<z.ZodString>;
        label: z.ZodCatch<z.ZodString>;
        now: z.ZodCatch<z.ZodBoolean>;
    }, "strip", z.ZodTypeAny, {
        label: string;
        to: string;
        now: boolean;
    }, {
        label?: unknown;
        to?: unknown;
        now?: unknown;
    }>>, {
        to: string;
        label: string;
        now: boolean;
    } | null, unknown>;
    language: z.ZodCatch<z.ZodEnum<["en", "es", "other"]>>;
}, "strip", z.ZodTypeAny, {
    language: "other" | "en" | "es";
    answer: string;
    citations: {
        id: string;
        kind: "conversation" | "call" | "person" | "thread" | "page";
        label: string;
    }[];
    followups: string[];
    navigate: {
        to: string;
        label: string;
        now: boolean;
    } | null;
}, {
    language?: unknown;
    answer?: unknown;
    citations?: unknown;
    followups?: unknown;
    navigate?: unknown;
}>;
type AskFinish = z.infer<typeof AskFinishSchema>;
declare function parseAskFinish(raw: unknown): {
    ok: true;
    value: AskFinish;
} | {
    ok: false;
    error: string;
};
/** What the tools returned this turn, by kind: the only rows a citation may name. */
type AskReadSet = Record<Exclude<AskCitationKind, "page">, Set<string>>;
declare function emptyReadSet(): AskReadSet;
/** The pages a citation or a navigate target may point at without a read. */
declare const ASK_PAGE_ROUTES: readonly ["today", "inbox", "clients", "conversations", "live", "reports", "admin/workspace", "admin/autonomy", "admin/notifications", "admin/integrations", "admin/memory"];
/**
 * Drop every citation that names a row the tools did not return this turn.
 * A model that read nothing cannot cite anything; a model that read the
 * Inbox can cite only the threads it saw. Pages are always allowed, because
 * a page is not a claim.
 */
declare function groundCitations(citations: AskCitation[], read: AskReadSet): {
    kept: AskCitation[];
    dropped: number;
};
/** Where a citation opens. The same routes the pages use for the same rows. */
declare function citationRoute(c: AskCitation): string;
/**
 * The route the app knows for what the model meant.
 *
 * The model writes routes as it understands them: "conversations/cv-<id>"
 * when a tool said so, but also "calls/<id>", "people/<id>", "inbox/<id>",
 * or a bare id. Any spelling that names a row the tools returned this turn
 * becomes that row's canonical route; a page route passes as is; anything
 * else is nothing. Dropping a real row over its spelling left "Opening the
 * call…" opening nothing.
 */
declare function normalizeNavigate(to: string, read: AskReadSet): string | null;
/** A navigate target is safe when it is a page or a row route the tools could have produced. */
declare function safeNavigate(to: string, read: AskReadSet): boolean;
/**
 * An answer that states a figure without having read anything is not from
 * the workspace. Times, counts and money all carry digits; a turn with no
 * read tool behind such an answer is marked so the palette can say so.
 */
declare function isUngrounded(answer: string, reads: number): boolean;
/**
 * The `answer` string out of a JSON prefix that is still arriving.
 *
 * The finish tool's input streams as partial JSON; the palette wants the
 * words as they come. This reads `"answer": "` and then the string up to the
 * first unescaped quote, decoding the escapes it has seen so far. Anything
 * before the key, or a key that has not arrived, is an empty string.
 */
declare function partialAnswer(prefix: string): string;
type AskRole = "user" | "assistant";
/** A proposal the model made; a card the person may approve. Executed by the client through the verbs. */
interface AskProposal {
    id: string;
    kind: "reply" | "steer" | "thread_verb" | "person_mode" | "policy" | "settings" | "whisper" | "invite";
    /** The lowest role that may commit it; the route re-checks on Approve. */
    needs: "operator" | "owner";
    title: string;
    /** The exact change, in the person's words. */
    summary: string;
    payload: Record<string, unknown>;
    /** What undo looks like, when the verb has one. */
    undo: string | null;
    /** Set once the person acted on the card. */
    outcome?: AskProposalOutcome | null;
}
/** The client gate (data-bits `gate`) a card of this kind checks before Approve; the route re-checks the role. */
declare const PROPOSAL_GATE: Record<AskProposal["kind"], "approve" | "autonomy" | "settings" | "team">;
/** What became of a card, kept with the turn that proposed it. */
interface AskProposalOutcome {
    state: "done" | "dismissed" | "failed" | "undone";
    /** One line: "Sent to Rosa", "Closed on Friday". */
    receipt: string;
    atMs: number;
    /** What Undo needs, when the verb has one: an id, a previous value. */
    undo?: Record<string, unknown> | null;
}
declare const AskProposalOutcomeSchema: z.ZodObject<{
    state: z.ZodEnum<["done", "dismissed", "failed", "undone"]>;
    receipt: z.ZodCatch<z.ZodString>;
    atMs: z.ZodCatch<z.ZodNumber>;
    undo: z.ZodOptional<z.ZodNullable<z.ZodRecord<z.ZodString, z.ZodUnknown>>>;
}, "strip", z.ZodTypeAny, {
    state: "failed" | "done" | "dismissed" | "undone";
    receipt: string;
    atMs: number;
    undo?: Record<string, unknown> | null | undefined;
}, {
    state: "failed" | "done" | "dismissed" | "undone";
    receipt?: unknown;
    atMs?: unknown;
    undo?: Record<string, unknown> | null | undefined;
}>;
interface AskMessageVM {
    id: string;
    role: AskRole;
    text: string;
    at: string;
    atMs: number;
    citations: Array<AskCitation & {
        to: string;
    }>;
    followups: string[];
    navigate: {
        to: string;
        label: string;
        now?: boolean;
    } | null;
    proposals: AskProposal[];
    language: AskLanguage;
    /** A figure with no read behind it. */
    ungrounded: boolean;
    /** The tools this turn ran, in order. */
    tools: string[];
    latencyMs: number | null;
    /** Model rounds the turn took; one means the snapshot was enough. */
    rounds?: number | null;
    /** Set on a turn that could not be answered; the text says why. */
    failed: boolean;
}
interface AskThreadVM {
    id: string;
    title: string;
    lastAtMs: number;
    scope: AskScope | null;
}
/** What the person was looking at when they asked. Carried into the turn as a fact. */
interface AskScope {
    kind: "thread" | "conversation" | "call" | "person" | "page";
    id: string;
    label: string;
}
/** The scope a route implies, when it names a row. */
declare function scopeFromRoute(page: string, param: string | null | undefined, label?: string | null): AskScope | null;
/** A light guess at the language of a question; the model settles it. */
declare function detectLanguage(text: string): AskLanguage;
interface JumpEntry {
    label: string;
    to: string;
    kind: "page" | "person" | "thread" | "call";
    sub?: string;
}
/** The pages a real workspace has. Nothing here is seeded or demo-only. */
declare const ASK_PAGES: JumpEntry[];
/**
 * Two words jump to a page, a person, a thread or a call from what the
 * browser already holds. A question mark or a long sentence is a question,
 * not a jump.
 */
declare function askJump(query: string, index: JumpEntry[], limit?: number): JumpEntry[];
type AskSurface = "today" | "inbox" | "people" | "conversations" | "live" | "reports" | "settings" | "other";
interface AskSuggestion {
    /** The words sent, or placed in the input when `compose` is set. */
    q: string;
    kind: "ask" | "act";
    icon: string;
    /** Answered without a model. */
    fast?: boolean;
    /** What the row shows when it differs from the words. */
    label?: string;
    /** Put the words in the input for the person to finish, rather than sending them. */
    compose?: boolean;
}
interface SuggestionInput {
    surface: AskSurface;
    language: AskLanguage;
    needsYou: number;
    heldDrafts: number;
    missedToday: number;
    liveNow: number;
    hasCalendar: boolean;
    scope?: AskScope | null;
    /** Operators and owners may act; a viewer is never offered a card. */
    canAct?: boolean;
}
/**
 * Questions the workspace can answer today, for where the person is. Built
 * from the data, in the person's language, never from a seed; a workspace
 * with no missed call is not offered a question about missed calls.
 */
declare function buildAskSuggestions(input: SuggestionInput): AskSuggestion[];
interface FastCall {
    callId: string;
    who: string;
    missed: boolean;
    live: boolean;
    startedAtMs: number | null;
}
interface FastContext {
    feed: NotificationItem[];
    calls: FastCall[];
    now: number;
    language: AskLanguage;
    timezone?: string | null;
}
type FastPath = {
    kind: "needs";
    answer: string;
    links: Array<{
        label: string;
        to: string;
    }>;
} | {
    kind: "calls";
    answer: string;
    links: Array<{
        label: string;
        to: string;
    }>;
} | {
    kind: "openings";
    day: string | null;
    service: string;
} | null;
/** The day a question names: a weekday key, "today"/"tomorrow" as a date, or nothing. */
declare function dayFromQuestion(q: string, now: number, tz?: string | null): string | null;
/**
 * The three questions an owner asks most, answered without a model: who
 * needs me, did anyone call, what is open. The first two come from what the
 * page already holds; the third names the day and the service so the palette
 * can ask the availability engine directly. Everything else is the model's.
 */
declare function fastPath(question: string, ctx: FastContext): FastPath;
/**
 * The few settings an owner changes from the floor, as a change the model
 * may propose and a card may apply: a closure, a day's hours, a note the
 * receptionist will read, a service. Applied to a parsed config, never to
 * the row, so the settings route's own validation still decides.
 */
type AskSettingsChange = {
    op: "add_closure";
    date: string;
    until?: string;
    note?: string;
} | {
    op: "set_hours";
    day: string;
    open: string | null;
    close: string | null;
} | {
    op: "add_note";
    title: string;
    text: string;
} | {
    op: "add_service";
    name: string;
    duration_min?: number;
};
declare const AskSettingsChangeSchema: z.ZodDiscriminatedUnion<"op", [z.ZodObject<{
    op: z.ZodLiteral<"add_closure">;
    date: z.ZodString;
    until: z.ZodOptional<z.ZodString>;
    note: z.ZodOptional<z.ZodString>;
}, "strip", z.ZodTypeAny, {
    date: string;
    op: "add_closure";
    note?: string | undefined;
    until?: string | undefined;
}, {
    date: string;
    op: "add_closure";
    note?: string | undefined;
    until?: string | undefined;
}>, z.ZodObject<{
    op: z.ZodLiteral<"set_hours">;
    day: z.ZodEnum<["mon", "tue", "wed", "thu", "fri", "sat", "sun"]>;
    open: z.ZodNullable<z.ZodString>;
    close: z.ZodNullable<z.ZodString>;
}, "strip", z.ZodTypeAny, {
    open: string | null;
    day: "mon" | "tue" | "wed" | "thu" | "fri" | "sat" | "sun";
    close: string | null;
    op: "set_hours";
}, {
    open: string | null;
    day: "mon" | "tue" | "wed" | "thu" | "fri" | "sat" | "sun";
    close: string | null;
    op: "set_hours";
}>, z.ZodObject<{
    op: z.ZodLiteral<"add_note">;
    title: z.ZodString;
    text: z.ZodString;
}, "strip", z.ZodTypeAny, {
    text: string;
    title: string;
    op: "add_note";
}, {
    text: string;
    title: string;
    op: "add_note";
}>, z.ZodObject<{
    op: z.ZodLiteral<"add_service">;
    name: z.ZodString;
    duration_min: z.ZodOptional<z.ZodNumber>;
}, "strip", z.ZodTypeAny, {
    name: string;
    op: "add_service";
    duration_min?: number | undefined;
}, {
    name: string;
    op: "add_service";
    duration_min?: number | undefined;
}>]>;
type Cfg = {
    brain?: {
        profile?: Record<string, unknown>;
    } & Record<string, unknown>;
} & Record<string, unknown>;
declare function applySettingsChange<C extends Cfg>(config: C, change: AskSettingsChange): C;
/** One line for a card: what the change does, in the person's words. */
declare function describeSettingsChange(change: AskSettingsChange): string;

/**
 * Read-only availability: what is open, from a calendar feed and the rules.
 *
 * The receptionist never books. It may SEE the calendar — the owner's
 * appointments as an iCal feed, which every booking tool that syncs to
 * Google, Apple or Outlook can produce (Booksy Biz syncs two-way with Google
 * and Apple; Calendly, Square and the rest do the same) — subtract what is
 * taken from the opening hours, apply the owner's booking rules, and say
 * which windows are open before sending the booking link. The link is the
 * only way anything gets booked, whatever provider stands behind it.
 *
 * Pure: the feed text comes in, the windows come out, nothing is fetched
 * here. The edge fetches and caches; tests feed fixtures.
 */

/** A taken stretch of time, epoch milliseconds. */
interface BusyBlock {
    start: number;
    end: number;
}
interface ParsedFeed {
    busy: BusyBlock[];
    /** VEVENTs read, before any were dropped. */
    events: number;
    /** Recurring events expanded inside the horizon. */
    recurringExpanded: number;
    /** Recurring rules this parser does not understand (BYSETPOS, numbered
     *  BYDAY, hourly…): their first occurrence is kept, the rest is not, and
     *  they are counted so the diagnostic can say so. */
    skippedRecurring: number;
}
interface ParseOptions {
    /** Occurrences of recurring events are produced inside this window only
     *  (epoch ms). Default: yesterday to ninety days out. */
    horizon?: {
        from: number;
        to: number;
    };
}
/** Offset of `tz` from UTC at the instant `atMs`, in milliseconds. */
declare function zoneOffsetMs(tz: string, atMs: number): number;
/** The instant a wall-clock time in `tz` refers to. Two passes cover a DST edge. */
declare function localToUtcMs(tz: string, y: number, m: number, d: number, hh: number, mm: number): number;
/** "YYYY-MM-DD" and the weekday key ("mon".."sun") of an instant in `tz`. */
declare function dayInZone(tz: string, atMs: number): {
    key: string;
    weekday: string;
    y: number;
    m: number;
    d: number;
};
/**
 * The taken time in a feed. Cancelled events and events marked transparent
 * (free) are not taken. Recurring events are counted, not expanded.
 */
declare function parseIcs(text: string, fallbackTz: string, opts?: ParseOptions): ParsedFeed;
interface BookingRulesLike {
    lead_hours?: number;
    buffer_min?: number;
    max_days_ahead?: number;
    slot_min?: number;
}
interface Opening {
    key: string;
    /** "mon".."sun" in the business's zone. */
    weekday: string;
    /** "Tuesday, September 9" */
    label: string;
    windows: Array<{
        start: number;
        end: number;
    }>;
}
interface FreeWindowsInput {
    hours: Record<string, Hours | undefined> | undefined;
    closures?: Closure[];
    tz: string;
    busy: BusyBlock[];
    rules?: BookingRulesLike | null;
    now: Date;
}
/**
 * The open windows, day by day: opening hours minus what is taken (each
 * taken block widened by the buffer), never earlier than now plus the lead
 * time, never shorter than one slot, never on a closed date.
 */
declare function freeWindows(input: FreeWindowsInput): Opening[];
/**
 * The openings a caller actually asked about: one day (a date or a weekday
 * name), and only windows long enough for the service they want. Days with
 * nothing left are dropped.
 */
declare function filterOpenings(openings: Opening[], by: {
    day?: string | null;
    minMinutes?: number | null;
}): Opening[];
/**
 * The openings as the receptionist is told them: a few days, the windows on
 * each, and the rule that the calendar decides. Text on both channels; the
 * phone agent reads it aloud in its own words.
 */
declare function describeOpenings(openings: Opening[], tz: string, opts?: {
    maxDays?: number;
    daysAhead?: number;
}): string;

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
    /** "whisper" is the owner's own words, handed to the agent mid-call. */
    speaker: "agent" | "client" | "whisper";
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

export { ACTOR_TYPES, ALERT_KINDS, ANALYSIS_GRACE_MS, ASK_CAPS, ASK_CITATION_KINDS, ASK_FINISH_JSON_SCHEMA, ASK_LANGUAGES, ASK_MAX_CHARS, ASK_MAX_ROUNDS, ASK_PAGES, ASK_PAGE_ROUTES, ASK_RETENTION_DAYS, ASK_TOKENS_DAY, ASK_TURN_BUDGET_MS, type ActorType, AppError, type AskCitation, type AskCitationKind, type AskFinish, AskFinishSchema, type AskLanguage, type AskMessageVM, type AskProposal, type AskProposalOutcome, AskProposalOutcomeSchema, type AskReadSet, type AskRole, type AskScope, type AskSettingsChange, AskSettingsChangeSchema, type AskSuggestion, type AskSurface, type AskThreadVM, BRAIN_INTENTS, BRAIN_LANGUAGES, BRAIN_OUTPUT_JSON_SCHEMA, type BookingRules, type BookingRulesLike, BookingRulesSchema, type BrainConfig, BrainConfigSchema, type BrainIntent, type BrainMeta, type BrainOutput, BrainOutputSchema, type BusinessProfile, BusinessProfileSchema, type BusyBlock, CALL_HEARTBEAT_MS, CHANNEL_KINDS, CONFIDENCE_STEPS, CONSENT_STATES, CONVERSATION_STATES, type CalendarConfig, CalendarConfigSchema, type CallDto, type CallVM, type ChannelDto, type ChannelHealth, type ChannelKind, type ChannelVM, type Closure, ClosureSchema, type ConsentBearing, type ConsentState, type ConversationDto, type ConversationMessageVM, type ConversationState, type ConversationVM, DAYS, DECISION_SUBJECTS, DECISION_VERBS, DISCONNECTION_LABELS, type DecisionSubject, type DecisionVerb, E164, EMPTY_READ_STATE, ERROR_CODES, ESCALATION_REASONS, ESCALATION_REASON_LABELS, ESCALATION_STATES, EVENT_KINDS, type Envelope, type Err, type ErrorCode, type EscalationDto, type EscalationReason, type EscalationState, type EventKind, type FastCall, type FastContext, type FastPath, type FeaturesConfig, FeaturesConfigSchema, type FeedCall, type FeedInput, type FeedInvite, type FeedThread, type FreeWindowsInput, GuardrailsSchema, type Hours, type HoursRun, HoursSchema, INTENT_LABELS, type InboxThreadVM, type Interval, IntervalSchema, JOB_KINDS, JOB_STATES, type JobKind, type JobState, type JumpEntry, LIVE_OVERLONG_MS, LIVE_STALE_MS, type LiveCallVM, type LiveLineVM, type LiveTurnVM, type LiveVM, MAX_CLOSURES, MAX_INTERVALS_PER_DAY, MEMBERSHIP_ROLES, MESSAGE_CHANNELS, MESSAGE_DIRECTIONS, MESSAGE_SENDERS, MESSAGE_STATUSES, MESSAGE_TYPES, type MediaVM, type MembershipRole, type MessageChannel, type MessageDirection, type MessageDto, type MessageSender, type MessageStatus, type MessageType, type MetricsSummaryDto, NEW_WINDOW_MS, type Note, NoteSchema, type NotificationItem, type NotificationKind, type NotificationReadState, type NotificationRow, type NotificationsConfig, NotificationsConfigSchema, OPT_IN_PATTERN, OPT_OUT_PATTERN, OPT_OUT_REFUSAL, type Ok, type Opening, PEOPLE_LISTS, PEOPLE_TABS, PERSON_MODES, PERSON_MODE_LABELS, PERSON_STATE_LABELS, POLICY_CLASSES, POLICY_MODES, PROPOSAL_GATE, type ParseOptions, type ParsedFeed, type PeopleAggregates, type PersonChannel, type PersonConsent, type PersonDecisionDto, type PersonDetailDto, type PersonEscalationDto, type PersonFact, type PersonFirstContact, type PersonIdentityDto, type PersonLastContact, type PersonMode, type PersonReceptionist, type PersonRightNow, type PersonRowDto, type PersonRowVM, type PersonState, type PersonTimelineItemVM, type PersonVM, type PolicyClass, type PolicyLimits, PolicyLimitsSchema, type PolicyMode, type PolicyRow, QUIET_AFTER_MS, RECENT_MAX, REPLY_DELAY_DEFAULT_MS, REPLY_DELAY_MAX_MS, REPLY_DELAY_MIN_MS, REPORT_RANGES, ROLES, ROLE_PERMS, type ReceptionistTone, type ReplyWhyVM, type ReportBarVM, type ReportDayDto, type ReportDto, type ReportPointVM, type ReportTileVM, type ReportVM, type Role, type Service, ServiceSchema, type SuggestionInput, TEMPLATE_STATUSES, TENANT_STATUSES, type TemplateStatus, type TenantConfig, type TenantConfigParse, TenantConfigSchema, TenantConfigWriteSchema, type TenantStatus, type TimelineKind, type TodayCallRowVM, type TodayFactVM, type TodayNeedsRowVM, type TodaySentenceVM, type TodayVM, WA_WINDOW_MS, type WaWindow, ago, agoLabel, applyReadState, applySettingsChange, asPersonMode, askJump, brainMetaOf, buildAskSuggestions, buildNotificationFeed, citationRoute, cleanAnswer, composeSystemPrompt, contactMeta, contactName, dayFromQuestion, dayInZone, deltaOf, describeNow, describeOpenings, describeSettingsChange, detectLanguage, draftSendsAtMs, emptyReadSet, err, fastPath, filterOpenings, fmtClock, fmtDay, fmtSeconds, formatPhoneDisplay, formatWaited, frameSteer, frameWhisper, freeWindows, groundCitations, hasProfile, hoursRuns, initialsOf, isHeldDraft, isLiveCall, isOptedOut, isOptedOutContact, isOwned, isRealDate, isUngrounded, localToUtcMs, mediaKind, mediaVM, messageAt, messageStatusLabel, messageText, newReceptionistDefaults, normalizeNavigate, normalizePhone, ok, parseAskFinish, parseBrainOutput, parseIcs, parseTenantConfig, parseTenantConfigResult, partialAnswer, peopleAggregates, personName, personStateFor, pointsDelta, quantile, reachedCustomer, reasonShort, recencyCells, recoverCitations, replyDelayMs, replyWhy, resolveSystemPrompt, safeNavigate, scopeFromRoute, shortTime, threadStanding, toCallVM, toChannelVM, toConversationVM, toInboxThreadVM, toLiveCallVM, toLiveVM, toPersonRowVM, toPersonVM, toReportVM, toTodayVM, violatesNoPrices, waWindow, whisperText, zoneOffsetMs };
