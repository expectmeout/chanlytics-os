import { z } from 'zod';

/** Closed error-code enum for the /api/v1 envelope (Blueprint §4). */
declare const ERROR_CODES: readonly ["unauthorized", "forbidden", "not_found", "validation", "conflict", "rate_limited", "payment_required", "window_closed", "upstream_meta", "upstream_retell", "upstream_anthropic", "upstream_email", "upstream_auth", "internal"];
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
 * Why this is not a number anyone can be reached on — in the owner's words —
 * or null when it is one.
 *
 * "A phone number is needed to add a person" was said to every refusal alike,
 * including to an owner looking at the number on their own screen. A short
 * code is the case that matters: the product STORES them, because a carrier
 * or a two-factor message arriving on the line is written to contacts as
 * `+12345` by the inbound path, and it can never be a person — nothing can
 * be sent back to one from a ten-digit number.
 *
 * Seven digits is told apart from a short code on purpose: that is a local
 * number missing its area code, and calling it a short code would be a
 * confident wrong answer where an accurate one costs nothing.
 */
/**
 * Three to six digits: a short code. A sender, never a person.
 *
 * Nothing can be sent back to one from a ten-digit number, so a carrier notice
 * or a two-factor code arriving on a business's line is a message to read and
 * never a conversation to have. Seven digits is deliberately NOT one: that is
 * a local number missing its area code.
 */
declare function shortCode(raw: string | null | undefined): boolean;
declare function whyNotAPhone(raw: string | null | undefined): string | null;
/**
 * The transfer number, checked the way a dialler would need it.
 *
 * Stricter than whyNotAPhone on purpose: a handoff is DIALLED by the phone
 * receptionist mid-call, so a bare ten-digit number is a guess about the
 * country and a transfer tool dialling a guess rings a stranger. The country
 * code is required, in writing.
 *
 * The second refusal is the one an owner would never think of: the
 * receptionist's OWN line. A caller who insists on a person would be
 * transferred to the number they are already on, which answers as the
 * receptionist again.
 *
 * Returns the owner's sentence, or null when the number is usable. Lives here
 * rather than in the form because the number is now edited where it is read.
 */
declare function whyNotAHandoff(raw: string | null | undefined, ownLine?: string | null): string | null;
/** What a typed handoff is STORED as: E.164, or nothing at all. */
declare function handoffE164(raw: string | null | undefined): string | null;
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
/**
 * What the queue carries: each kind has a handler in packages/jobs and a
 * caller that schedules it. Kinds declared ahead of their slice (veto_fire,
 * media_fetch, rollup_daily, deadman, report_weekly) are gone — a vetoed reply
 * is an outbound_send with a delay, the deadman is a pg_cron sweep, media is
 * fetched inline. A new kind arrives with its handler, its caller and the
 * jobs.kind CHECK, together.
 */
declare const JOB_KINDS: readonly ["outbound_send", "snooze_wake", "pause_expire", "broadcast_send", "blob_thread_erase"];
type JobKind = (typeof JOB_KINDS)[number];
/**
 * `fired` means CLAIMED, not finished: claim_job sets it and fire.ts moves the
 * job to `done` when the handler returns. A job left in `fired` is one whose
 * run never reported back, which is what the stale-jobs sweep reaps.
 */
declare const JOB_STATES: readonly ["scheduled", "fired", "done", "canceled", "failed"];
type JobState = (typeof JOB_STATES)[number];
/** Dot-namespaced event kinds emitted so far (grows per slice). */
declare const EVENT_KINDS: readonly ["message.received", "message.sent", "message.status", "escalation.opened", "contact.consent_changed", "usage.llm_tokens", "usage.wa_conversation", "ingest.allowlist_skip", "ingest.unreachable_sender", "ingest.pg_failed", "message.send_failed", "message.send_blocked", "message.send_raced_cancel", "conversation.reopened", "conversation.pause_expired", "contact.erased", "contact.blob_erased", "setup.requested", "voice.provisioned", "line.answering", "line.failed", "line.released", "line.forwarding_verified", "platform.acted", "line.texting_on", "line.texting_approved", "line.texting_rejected", "business.recorded", "google.linked", "google.unlinked", "google.reviews", "google.connected", "google.disconnected", "google.replied", "workspace.created", "billing.updated", "billing.paused", "billing.resumed"];
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
declare const MARKETING_OPT_IN_PATTERN: RegExp;
/**
 * The words that answer the CONVERSATIONAL question: messages about your own
 * visit, and the receptionist writing back.
 *
 * START/UNSTOP/RESUME are the carriers' own standard words and are declared to
 * them in the campaign's opt-in keywords. ALTA is their Spanish equivalent.
 */
declare const CONVERSATION_OPT_IN_PATTERN: RegExp;
/** Which question a customer's message answers, or null when it answers neither. */
declare function optInPurposeOf(text: string): "conversational" | "marketing" | null;
/**
 * The phrase a customer sends to say yes to offers. Unambiguous on purpose,
 * so it can ride a wa.me link or a QR at the desk without "yes" to an
 * ordinary question ever counting; the ingest records it as their own
 * message, the strongest consent there is.
 */
declare const OFFERS_OPT_IN_PHRASES: {
    readonly en: "YES OFFERS";
    readonly es: "SI OFERTAS";
};
/** WhatsApp opened on the workspace's number with the phrase ready to send; null without a usable number. */
declare function optInLink(numberE164: string | null | undefined, phrase?: string): string | null;
declare const ESCALATION_REASONS: readonly ["human_token", "non_text", "refusal", "rate_cap", "policy_block", "send_failed", "deadman", "brain_error", "manual", "opt_out", "state_unavailable", "stale", "person_hold", "budget", "policy_ask", "callback", "paused", "carriers"];
type EscalationReason = (typeof ESCALATION_REASONS)[number];
declare const ESCALATION_STATES: readonly ["open", "resolved"];
type EscalationState = (typeof ESCALATION_STATES)[number];
declare const DECISION_VERBS: readonly ["approve", "edit", "decline", "snooze", "wake", "take_over", "hand_back", "resolve", "archive", "reply", "cancel_send", "pause_agent", "resume_agent", "invite", "revoke_invite", "change_role", "remove_member", "erase", "whisper", "connect_channel", "consent_change", "send_broadcast", "cancel_broadcast", "start_playbook", "pause_playbook", "reply_review"];
type DecisionVerb = (typeof DECISION_VERBS)[number];
declare const DECISION_SUBJECTS: readonly ["conversation", "escalation", "draft", "lead", "message", "agent", "membership", "invitation", "contact", "call", "channel", "broadcast", "playbook", "review"];
type DecisionSubject = (typeof DECISION_SUBJECTS)[number];
declare const ACTOR_TYPES: readonly ["user", "ai", "system", "owner_phone"];
type ActorType = (typeof ACTOR_TYPES)[number];
declare const TEMPLATE_STATUSES: readonly ["approved", "pending", "rejected", "paused", "disabled"];
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
type SendPurpose = "conversational" | "marketing";
interface PurposeBearing extends ConsentBearing {
    marketing_consent?: string | null;
}
/**
 * May a message of this purpose go to this person?
 *
 * `proactive` is the existing distinction, kept: answering somebody who wrote to
 * you needs only that they have not asked you to stop, while starting a
 * conversation needs their recorded yes.
 *
 * Marketing needs its own yes on top, and it FAILS CLOSED -- a row selected
 * without the column reads as `undefined`, which is not `'opted_in'`, so a
 * forgotten SELECT withholds an offer rather than sending one. That asymmetry
 * is deliberate and is the opposite of `isOptedOutContact`'s, which fails open
 * for the same reason in the other direction: a missing column must never
 * silence a reply, and must never authorise a promotion.
 */
declare function mayMessageFor(c: PurposeBearing, purpose: SendPurpose, opts?: {
    proactive?: boolean;
}): {
    ok: boolean;
    reason: string | null;
};
/** Why a send was withheld, in the operator's words. */
declare const PURPOSE_REFUSALS: Record<string, string>;
/**
 * What kind of message a WhatsApp template is, from the category META assigned
 * it — which is the authority, not what the workspace asked for, and which Meta
 * can change on a live template.
 *
 * FAILS CLOSED, and this is the whole subtlety. `templates.category` is NULL for
 * exactly the rows most likely to matter: `booking_link_v1` was seeded by hand
 * before the column existed, any workspace that has never run a template sync
 * has NULL throughout, and the mapper returns null for anything Meta names that
 * we do not recognise. Written the obvious way -- `category === 'marketing'` --
 * the gate would let every one of those through as if it were transactional.
 * So only the two categories that are POSITIVELY not marketing count as
 * conversational, and everything else, NULL included, is treated as marketing.
 */
declare function purposeOfTemplate(category: string | null | undefined): SendPurpose;
/**
 * What kind of message a playbook sends, from the class it already declares.
 *
 * `booking` is a reminder about an appointment the customer made. `reengage` and
 * `campaign` are promotional by definition -- reaching somebody who has gone
 * quiet, or running an offer. Unknown classes are marketing, for the same
 * fail-closed reason as templates.
 */
declare function purposeOfPlaybook(policyClass: string | null | undefined): SendPurpose;

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
    /** The wire it travelled — whatsapp · sms · voice; absent from older readers. */
    channel?: string;
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
/** The "WhatsApp · +1 …" subtitle line, same source as the thread viewmodel; "Phone · …" for a caller with no thread. */
declare function contactMeta(dto: ConversationDto, channel?: "WhatsApp" | "Phone"): string;
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
/** A wait, in the one family every surface reads (time.ts): "1m" at the least, "3h", "2d". */
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
    /** The channels the thread has actually used: "whatsapp", "phone", or both. */
    channels: string[];
    primaryChannel: "whatsapp" | "phone";
    /** A WhatsApp thread exists. False for a caller who has only ever phoned: no reply window, phone verbs. */
    hasChat: boolean;
    /** The number to call back, E.164, when known. */
    phone: string | null;
    /** How long the request has waited, in the one family every surface reads ("57m", "2h"). */
    waited?: string;
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
        /** Sent by a broadcast, not typed: the name the owner gave it. */
        via?: {
            kind: "broadcast" | "playbook";
            name: string;
        };
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
    /** From the post-call analysis (calls.wanted …): what the caller wanted in
     *  plain words, how it ended, what to do next, the name they gave. Absent
     *  on calls analysed before the schema existed. */
    wanted?: string | null;
    outcome?: string | null;
    follow_up?: string | null;
    caller_name?: string | null;
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
 * Who has a thread — decided once.
 *
 * Three surfaces used to answer this three ways. The Inbox counted a paused
 * thread with an open escalation as "needs you"; People counted the same
 * pause as ownership and called it "waiting on you"; Today counted every open
 * escalation, including the ones a person had already taken over. One word,
 * three numbers. Everything below reads this function, so a thread has one
 * standing wherever it is shown.
 *
 *   needs_you  flagged for a person, and nobody has it
 *   yours      flagged, and you have it — you took it, or you replied and the
 *              receptionist paused for you
 *   theirs     flagged, and a teammate has it
 *   snoozed    put aside until it wakes; whatever it was waits with it
 *   quiet      nothing open — the receptionist is answering, or nothing is
 *              happening
 */
interface StandingInput {
    /** The conversation's state column. */
    state: string;
    paused_until?: string | null;
    assignee_user_id?: string | null;
    /** Unknown (undefined) reads as "mine": a row that cannot say whose claim it is does not accuse a teammate. */
    assignee_is_me?: boolean | null;
    /** An escalation row still open on the thread. */
    open_escalation: boolean;
}
type Standing = "needs_you" | "yours" | "theirs" | "snoozed" | "quiet";
interface StandingVerdict {
    standing: Standing;
    /** Something asked for a person: an open escalation, the needs_human state, or a live pause. */
    flagged: boolean;
    /** The receptionist is paused on this thread right now. */
    paused: boolean;
    /** You have it. */
    takenOver: boolean;
    /** A teammate has it. */
    claimedByOther: boolean;
}
declare function standingOf(i: StandingInput, nowMs: number): StandingVerdict;

/**
 * Relative time, said one way.
 *
 * Five helpers used to round a gap into words on their own, and each rounded
 * differently at the seams: fifty-nine and a half minutes came out as "60m",
 * a thread's wait was printed as "146m" beside a strip that said "2h", and
 * the calendar wrote "5 min ago" where People wrote "5m ago". Every surface
 * now reads these two shapes:
 *
 *   spanLabel   "now" · "5m" · "3h" · "2d"        the bell, a wait, a countdown
 *   agoWords    "just now" · "5m ago" · "3h ago"  a sentence about the past
 *
 * Units carry: a gap that rounds to sixty minutes is "1h", one that rounds to
 * twenty-four hours is "1d". Beyond a week a sentence gives a date instead of
 * a count, because "31d ago" is not how anyone says it.
 */
interface SpanUnits {
    n: number;
    unit: "s" | "m" | "h" | "d";
}
/** The largest whole unit a gap rounds to, with carry across the seams. */
declare function spanUnits(ms: number): SpanUnits;
/** "now" · "5m" · "3h" · "2d" — the bell's time, a countdown, a wait. */
declare function spanLabel(ms: number): string;
/** A wait never reads as nothing: under a minute is "1m". */
declare function waitedLabel(ms: number): string;
/** The gap since a moment, as spanLabel says it: "now" · "5m" · "3h" · "2d". */
declare function agoShort(atMs: number, nowMs: number): string;
/**
 * "just now" · "5m ago" · "3h ago" · "2d ago", and a date once the gap is
 * older than `dateAfterMs` (a week unless the caller says otherwise).
 */
declare function agoWords(atMs: number, nowMs: number, opts?: {
    dateAfterMs?: number;
    date?: (ms: number) => string;
}): string;

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
/**
 * One row of the queue on Today, in the strip's grammar (people.ts
 * attentionRow): who, where and when, one sentence, one state line, one
 * verb — and, where the state asks a second thing of you, a second.
 */
interface TodayQueueRowVM {
    id: string;
    kind: "handoff" | "callback" | "window" | "call";
    who: string;
    initials: string;
    channel: "WhatsApp" | "Phone";
    /** "waited 2h" · "closes 5:10 PM · in 40m" · "2:14 PM · 1:35". */
    when: string;
    sentence: string;
    quoted: boolean;
    status: string[];
    tone: "escalated" | "warn";
    warn: boolean;
    cta: {
        label: string;
        to: string;
    };
    also: {
        label: string;
        verb: "snooze" | "resolve";
        conversationId: string;
        escalationId: string;
    } | null;
    /** For the order: the longest wait first; a window by how soon it closes; a call last. */
    waitedMs: number;
}
/** Six rows on Today; the rest is a count for the Inbox link. */
declare const TODAY_QUEUE_MAX = 6;
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
    /** Everything that asks for a person, in one row grammar, longest wait first. */
    /** The rows, the rest as a count, and what the rows hold in words: "2 need you", "1 reply window closing", "1 call worth a listen". */
    queue: {
        rows: TodayQueueRowVM[];
        more: number;
        parts: string[];
    };
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
/** Wall-clock time AT THE SALON, whatever clock the reader is holding. */
/**
 * A clock time that says which day when it is not today: "3:30 PM",
 * "tomorrow 6:46 PM", "Wed 9:00 AM". A closing window printed as "6:46 PM"
 * beside "since 6:46 PM" read as the same moment.
 */
declare function tzClock(iso: string | null | undefined, tz: string, now: Date): string | null;
declare function toTodayVM(m: MetricsSummaryDto, conversations: ConversationDto[], escalations: Array<EscalationDto & {
    conversation_id: string;
}>, calls: CallDto[], now?: Date): TodayVM;
/** What the day module reads, as the calendar surface publishes it. Minimal on purpose: the page hands the surface in. */
interface DayFrameLike {
    key: string;
    long: string;
    today: boolean;
    past: boolean;
    closed: {
        yes: boolean;
        note: string | null;
    };
    blocks: Array<{
        id: string;
        t: number;
        dur: number;
        time: string;
        title: string;
        person: {
            id: string;
            name: string;
        } | null;
    }>;
    allDay: Array<{
        id: string;
        t: number;
        dur: number;
        time: string;
        title: string;
        person: {
            id: string;
            name: string;
        } | null;
    }>;
    windows: Array<{
        label: string;
    }>;
}
interface CalendarLike {
    days: DayFrameLike[];
    /** The clock now, as hours in the business's zone (14.5 is 2:30 PM). */
    now: number;
    feed: {
        state: "ok" | "unavailable" | "none";
    };
    stats: {
        next: string;
    };
}
/** A playbook card as the playbooks surface publishes it. */
interface PlaybookCardLike {
    trigger: string;
    state: string;
    candidates: number;
    next: string;
}
interface TodayDayItemVM {
    id: string;
    /** "2 PM" · "10:15 AM" · "All day" — the column. */
    start: string;
    /** "2 – 5 PM" — the whole span, for the hover. */
    time: string;
    /** "3h" · "1h 30m" · "45m"; empty for all-day. */
    dur: string;
    title: string;
    person: {
        id: string;
        name: string;
    } | null;
    allDay: boolean;
    /** Where it sits against the clock, today only: past · now · next · later. */
    phase: "past" | "now" | "next" | "later";
    /** The person's open thread, when they have one: "Needs you — in Inbox". */
    flag: string | null;
}
interface TodayDayFrameVM {
    key: string;
    /** "Today · Sunday, September 6" */
    label: string;
    today: boolean;
    past: boolean;
    closed: {
        yes: boolean;
        note: string | null;
    };
    items: TodayDayItemVM[];
    /** "2 booked", and "1 needs you" when a person on the day has an open thread. */
    summary: {
        booked: string;
        flagged: string | null;
    } | null;
    /** The windows the receptionist would offer, as labels; none on a closed or past day. */
    open: string[];
}
/** "45m" · "1h" · "1h 30m" */
declare function durationLabel(minutes: number): string;
interface TodayDayVM {
    feed: "ok" | "unavailable" | "none";
    frames: TodayDayFrameVM[];
    nextOpening: string | null;
    /** The visit playbooks' line — what goes out and when — or the offer to start one. */
    reminders: {
        text: string;
        to: string;
    } | null;
}
/**
 * Today and tomorrow, as the calendar reads them: who is coming and when,
 * what is open, what is closed — and the visit playbooks' line. Nothing here
 * is derived from a message; the calendar is the source, the playbooks say
 * what they will do about it.
 */
declare function todayDay(cal: CalendarLike | null, playbooks: PlaybookCardLike[] | null, 
/** People's rows, for the red line: a person on the day whose thread needs someone. */
people?: {
    rows: Array<{
        id: string;
        state: string;
    }>;
} | null): TodayDayVM;
/** Two facts beside the recap's, only with a calendar: appointments today, and what is booked ahead. */
declare function todayDayFacts(cal: CalendarLike | null, agg: {
    booked: number;
    reachedWeek: number;
} | null): TodayFactVM[];
/** A Reports tile as Reports builds it; the page draws it with Reports' own component. */
interface WeekTileLike {
    id: string;
    label: string;
    value: string;
    meta: string;
    delta: {
        text: string;
        tone: "pos" | "neg" | "";
    } | null;
    spark: number[];
}
/** What the Reports surface publishes, as far as Today reads it. */
interface ReportsLike {
    vm: {
        days: number;
        rangeLabel: string;
        since: string;
        until: string;
        empty: boolean;
        tiles: WeekTileLike[];
    };
    campaigns: {
        tiles: WeekTileLike[];
        empty: boolean;
    };
    booking: {
        present: boolean;
        headline: string;
        sub: string;
        pct: number | null;
    };
}
interface TodayWeekVM {
    /** "Last 7 days" — the range the owner chose on Reports. */
    label: string;
    /** "Aug 31 – Sep 6 · against the 7 days before" */
    sub: string;
    tiles: WeekTileLike[];
    /** The offers' line and the booking line, each with where it leads. */
    lines: Array<{
        id: "campaigns" | "booking";
        text: string;
        to: string;
    }>;
}
/**
 * The period as Reports counts it: its tiles untouched, plus one line for
 * what the offers earned and one for who booked. The same numbers as the
 * page it links to, never a second count.
 */
declare function todayWeek(r: ReportsLike | null): TodayWeekVM | null;
/** A People list as the People surface publishes it. */
interface JourneyListLike {
    id: string;
    label: string;
    group: string;
    count: number;
    action: {
        text: string;
        cta: string;
        to: string;
        enabled: boolean;
    } | null;
}
interface TodayJourneyVM {
    rows: Array<{
        id: string;
        label: string;
        count: number;
        to: string;
        act: {
            label: string;
            to: string;
        } | null;
    }>;
    /** Said once when the calendar is not connected: which lists are missing and why. */
    note: string | null;
}
/** Where people are on the way to a booking: People's journey lists, their counts, and the step each has when it has one. */
declare function todayJourney(people: {
    lists: JourneyListLike[];
    calendar: {
        state: string;
    };
} | null): TodayJourneyVM | null;
/** While you were away: the bell's unread rows in the bell's order, capped, the rest counted. */
declare function todayAway<T extends {
    unread: boolean;
}>(rows: T[], max?: number): {
    rows: T[];
    more: number;
};

/** Where an answer came from, strongest claim first. */
type FactSource = 
/** The platform provisioned it: a channel row, a bought number. */
"provisioned"
/** A third party verified it: the linked Google Business Profile. */
 | "verified"
/** The workspace record itself (tenants.name, tenants.timezone). */
 | "workspace"
/** Somebody typed it into the business form. */
 | "typed"
/** Nobody has said. */
 | "absent";
interface Fact<T> {
    value: T | null;
    source: FactSource;
    /** Another source's answer for the same fact, when it differs. */
    disputed?: {
        value: T;
        source: FactSource;
    };
}
/** What the platform and its integrations know, independent of anything typed. */
interface KnownFacts {
    workspace?: {
        name?: string | null;
        timezone?: string | null;
    } | null;
    /** tenant_channels rows: what the receptionist actually answers on. */
    channels?: ReadonlyArray<{
        kind: string;
        number_e164?: string | null;
        status?: string | null;
    }> | null;
    /** The linked Google Business Profile, when there is one. */
    listing?: {
        name?: string | null;
        address?: string | null;
    } | null;
}
/** The brain fields this resolves over. A subset, so callers need not have parsed everything. */
interface TypedFacts {
    business_name?: string | null;
    phone_display?: string | null;
    booking_link?: string | null;
    profile?: {
        address?: string | null;
        website?: string | null;
        handoff_number?: string | null;
    } | null;
}
interface ResolvedFacts {
    business_name: Fact<string>;
    /** What the receptionist tells customers to call. */
    phone_display: Fact<string>;
    booking_link: Fact<string>;
    address: Fact<string>;
    website: Fact<string>;
    /** Where a caller who insists on a person is transferred. Human-only by nature. */
    handoff_number: Fact<string>;
    /** The line the receptionist ANSWERS. Provisioned or nothing — never typed. */
    voice_line: Fact<string>;
    /** The WhatsApp line. Provisioned or nothing. */
    whatsapp_line: Fact<string>;
}
/** Two ways of writing one number. `(646) 932-5775` and `+16469325775` are the same fact. */
declare function samePhone(a: string | null | undefined, b: string | null | undefined): boolean;
/**
 * Two ways of writing one address.
 *
 * Deliberately loose: Google returns "2581 Pitkin Ave, Brooklyn, NY 11208, USA"
 * for an owner who typed the same thing without the country. Reporting that as
 * a disagreement would train people to ignore the warning, which costs more
 * than the warning is worth.
 */
declare function sameAddress(a: string | null | undefined, b: string | null | undefined): boolean;
/** Same business, allowing for punctuation and case. */
declare function sameName(a: string | null | undefined, b: string | null | undefined): boolean;
/**
 * The facts as the product should understand them: one answer each, its source,
 * and whatever disagrees with it.
 */
declare function resolveFacts(typed: TypedFacts | null | undefined, known?: KnownFacts | null): ResolvedFacts;
type ConflictSeverity = "serious" | "minor";
interface FactConflict {
    /** Which resolved fact disagrees. */
    fact: keyof ResolvedFacts;
    severity: ConflictSeverity;
    /** What is being used. */
    used: string;
    /** What the system knows instead. */
    known: string;
    knownSource: FactSource;
    /** Said the way this product says things: what it means for a customer. */
    sentence: string;
    /** Where a person goes to settle it. */
    to: string;
}
/**
 * The disagreements, worst first, in the words an owner needs.
 *
 * Severity is about the CUSTOMER, not about the data. A published number that
 * is not the line being answered sends real people to the wrong place; an
 * address that differs from Google's by a country suffix does not.
 */
declare function factConflicts(f: ResolvedFacts): FactConflict[];
/** The words for a source, where one is shown beside a value. */
declare const SOURCE_WORDS: Record<FactSource, string>;
/**
 * Which parts of a config a save actually moved.
 *
 * Recorded on the change rather than the values themselves: the config holds a
 * business's own words, its booking link and its customers' escalation rules,
 * and the events ledger is read by more people and for longer than a settings
 * pane is. "hours, services" answers the question anybody actually asks —
 * what changed, and who by — without copying the contents into a second place.
 */
declare function changedConfigFields(before: unknown, after: unknown): string[];

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
declare const POLICY_CLASSES: readonly ["reply", "booking", "faq", "reengage", "campaign", "reviews", "money"];
type PolicyClass = (typeof POLICY_CLASSES)[number];
/**
 * The words for each class, said once. The Autonomy matrix rows, a playbook's
 * "runs under" chip and the assistant's proposals all read these; three maps
 * used to name the same row three ways ("Campaigns" on a playbook for the row
 * the matrix called "Standing offers").
 */
declare const POLICY_CLASS_WORDS: Record<PolicyClass, {
    name: string;
    short: string;
    note: string;
}>;
/** 'veto' exists in the enum (and the DB CHECK) but is NOT offered by any UI
 *  until the drafts/countdown engine exists — R1: no option without an
 *  enforcer. The runtime treats an unexpected mode as 'ask' (fail safe). */
declare const POLICY_MODES: readonly ["auto", "veto", "ask", "never"];
type PolicyMode = (typeof POLICY_MODES)[number];
/**
 * The modes each class can honour — a switch nothing enforces is a switch
 * that lies. Replies can wait (veto), wait for a person (ask) or stay silent
 * (never). Booking and service questions are answered by the receptionist
 * or by a person: there is no "never" for a salon that takes bookings, and
 * no draft to hold for review. The playbook classes run, wait, wait for a
 * person, or do not run. Reviews are answered, drafted for a person, or
 * left alone — there is no draft to hold on a countdown. Money is the
 * charter's.
 */
declare const POLICY_CLASS_MODES: Record<PolicyClass, readonly PolicyMode[]>;
/** The class a customer's intent falls under, when the Autonomy pane has a row for it. */
declare function policyClassOfIntent(intent: string | null | undefined): "booking" | "faq" | null;
/** The class that is set to "ask" and that this intent falls under, or null. An unknown mode counts as ask, fail safe. */
declare function policyAskClass(policy: Record<string, {
    mode: string;
}> | null | undefined, intent: string | null | undefined): "booking" | "faq" | null;
/**
 * What the Booking and FAQ rows say in the prompt, per channel. "auto" says
 * nothing — the profile already tells the receptionist how to book and what
 * it offers. "ask" hands the matter to a person, in words the customer can
 * hear on the phone and read on WhatsApp.
 */
declare function policyRules(policy: Record<string, {
    mode: string;
}> | null | undefined, channel: "whatsapp" | "voice"): string[];
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
    address?: string | undefined;
    website?: string | undefined;
    handoff_number?: string | undefined;
    notes?: {
        text: string;
        title: string;
    }[] | undefined;
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
    address?: string | undefined;
    website?: string | undefined;
    handoff_number?: string | undefined;
    notes?: {
        text: string;
        title: string;
    }[] | undefined;
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
    /**
     * The number the receptionist tells customers to call — an OVERRIDE, and
     * optional because it should almost never be set.
     *
     * It was required, free text, and named the same as the line the
     * receptionist answers, so every workspace typed something into it and
     * nothing checked what. On the first live salon that produced a
     * receptionist publishing the number it transfers to: customers who rang
     * it reached a person's mobile and never the receptionist standing by,
     * and the same string went to Google.
     *
     * Absent is now the right answer and the default: resolveFacts falls back
     * to the provisioned voice line, formatted for speech, so the number
     * published is the number answered by construction. A value here means a
     * business deliberately publishes something else — a tracking line, a
     * shopfront — and the pane says so in those words.
     */
    phone_display: z.ZodOptional<z.ZodString>;
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
        address?: string | undefined;
        website?: string | undefined;
        handoff_number?: string | undefined;
        notes?: {
            text: string;
            title: string;
        }[] | undefined;
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
        address?: string | undefined;
        website?: string | undefined;
        handoff_number?: string | undefined;
        notes?: {
            text: string;
            title: string;
        }[] | undefined;
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
    booking_link: string;
    system_prompt: string;
    fallbacks: {
        non_text: string;
        error: string;
        greeting: string;
    };
    phone_display?: string | undefined;
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
        address?: string | undefined;
        website?: string | undefined;
        handoff_number?: string | undefined;
        notes?: {
            text: string;
            title: string;
        }[] | undefined;
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
    booking_link: string;
    system_prompt: string;
    fallbacks: {
        non_text: string;
        error: string;
        greeting: string;
    };
    phone_display?: string | undefined;
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
        address?: string | undefined;
        website?: string | undefined;
        handoff_number?: string | undefined;
        notes?: {
            text: string;
            title: string;
        }[] | undefined;
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
        /**
         * The number the receptionist tells customers to call — an OVERRIDE, and
         * optional because it should almost never be set.
         *
         * It was required, free text, and named the same as the line the
         * receptionist answers, so every workspace typed something into it and
         * nothing checked what. On the first live salon that produced a
         * receptionist publishing the number it transfers to: customers who rang
         * it reached a person's mobile and never the receptionist standing by,
         * and the same string went to Google.
         *
         * Absent is now the right answer and the default: resolveFacts falls back
         * to the provisioned voice line, formatted for speech, so the number
         * published is the number answered by construction. A value here means a
         * business deliberately publishes something else — a tracking line, a
         * shopfront — and the pane says so in those words.
         */
        phone_display: z.ZodOptional<z.ZodString>;
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
            address?: string | undefined;
            website?: string | undefined;
            handoff_number?: string | undefined;
            notes?: {
                text: string;
                title: string;
            }[] | undefined;
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
            address?: string | undefined;
            website?: string | undefined;
            handoff_number?: string | undefined;
            notes?: {
                text: string;
                title: string;
            }[] | undefined;
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
        booking_link: string;
        system_prompt: string;
        fallbacks: {
            non_text: string;
            error: string;
            greeting: string;
        };
        phone_display?: string | undefined;
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
            address?: string | undefined;
            website?: string | undefined;
            handoff_number?: string | undefined;
            notes?: {
                text: string;
                title: string;
            }[] | undefined;
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
        booking_link: string;
        system_prompt: string;
        fallbacks: {
            non_text: string;
            error: string;
            greeting: string;
        };
        phone_display?: string | undefined;
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
            address?: string | undefined;
            website?: string | undefined;
            handoff_number?: string | undefined;
            notes?: {
                text: string;
                title: string;
            }[] | undefined;
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
        booking_link: string;
        system_prompt: string;
        fallbacks: {
            non_text: string;
            error: string;
            greeting: string;
        };
        phone_display?: string | undefined;
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
            address?: string | undefined;
            website?: string | undefined;
            handoff_number?: string | undefined;
            notes?: {
                text: string;
                title: string;
            }[] | undefined;
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
        booking_link: string;
        system_prompt: string;
        fallbacks: {
            non_text: string;
            error: string;
            greeting: string;
        };
        phone_display?: string | undefined;
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
            address?: string | undefined;
            website?: string | undefined;
            handoff_number?: string | undefined;
            notes?: {
                text: string;
                title: string;
            }[] | undefined;
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
        /**
         * The number the receptionist tells customers to call — an OVERRIDE, and
         * optional because it should almost never be set.
         *
         * It was required, free text, and named the same as the line the
         * receptionist answers, so every workspace typed something into it and
         * nothing checked what. On the first live salon that produced a
         * receptionist publishing the number it transfers to: customers who rang
         * it reached a person's mobile and never the receptionist standing by,
         * and the same string went to Google.
         *
         * Absent is now the right answer and the default: resolveFacts falls back
         * to the provisioned voice line, formatted for speech, so the number
         * published is the number answered by construction. A value here means a
         * business deliberately publishes something else — a tracking line, a
         * shopfront — and the pane says so in those words.
         */
        phone_display: z.ZodOptional<z.ZodString>;
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
            address?: string | undefined;
            website?: string | undefined;
            handoff_number?: string | undefined;
            notes?: {
                text: string;
                title: string;
            }[] | undefined;
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
            address?: string | undefined;
            website?: string | undefined;
            handoff_number?: string | undefined;
            notes?: {
                text: string;
                title: string;
            }[] | undefined;
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
        booking_link: string;
        system_prompt: string;
        fallbacks: {
            non_text: string;
            error: string;
            greeting: string;
        };
        phone_display?: string | undefined;
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
            address?: string | undefined;
            website?: string | undefined;
            handoff_number?: string | undefined;
            notes?: {
                text: string;
                title: string;
            }[] | undefined;
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
        booking_link: string;
        system_prompt: string;
        fallbacks: {
            non_text: string;
            error: string;
            greeting: string;
        };
        phone_display?: string | undefined;
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
            address?: string | undefined;
            website?: string | undefined;
            handoff_number?: string | undefined;
            notes?: {
                text: string;
                title: string;
            }[] | undefined;
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
        booking_link: string;
        system_prompt: string;
        fallbacks: {
            non_text: string;
            error: string;
            greeting: string;
        };
        phone_display?: string | undefined;
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
            address?: string | undefined;
            website?: string | undefined;
            handoff_number?: string | undefined;
            notes?: {
                text: string;
                title: string;
            }[] | undefined;
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
        booking_link: string;
        system_prompt: string;
        fallbacks: {
            non_text: string;
            error: string;
            greeting: string;
        };
        phone_display?: string | undefined;
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
            address?: string | undefined;
            website?: string | undefined;
            handoff_number?: string | undefined;
            notes?: {
                text: string;
                title: string;
            }[] | undefined;
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
        booking_link: string;
        system_prompt: string;
        fallbacks: {
            non_text: string;
            error: string;
            greeting: string;
        };
        phone_display?: string | undefined;
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
            address?: string | undefined;
            website?: string | undefined;
            handoff_number?: string | undefined;
            notes?: {
                text: string;
                title: string;
            }[] | undefined;
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
        booking_link: string;
        system_prompt: string;
        fallbacks: {
            non_text: string;
            error: string;
            greeting: string;
        };
        phone_display?: string | undefined;
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
            address?: string | undefined;
            website?: string | undefined;
            handoff_number?: string | undefined;
            notes?: {
                text: string;
                title: string;
            }[] | undefined;
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
    phone_display?: string | null;
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
now?: Date, 
/** The workspace's Autonomy rows (class → mode): Booking and FAQ under "ask" become rules here. */
policy?: Record<string, {
    mode: string;
}> | null): string;
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
now?: Date, 
/** The workspace's Autonomy rows, so Booking and FAQ under "ask" reach a hand-written prompt too. */
policy?: Record<string, {
    mode: string;
}> | null, 
/**
 * What the platform knows independently of what was typed: the channel rows
 * it provisioned, the Google listing it verified.
 *
 * The prompt is the one place these facts are SPOKEN, so it is the one place
 * they have to be resolved rather than read raw. Typed still wins — see
 * facts.ts for why silently overriding a live receptionist's words would be
 * the worse bug — but a workspace that never typed a number now says the line
 * it actually answers instead of nothing, and the disagreement is nameable
 * everywhere else because it is computed here.
 */
known?: KnownFacts | null): string;

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
type NotificationKind = "needs_you" | "held_draft" | "missed_call" | "invite" | ServerNotificationKind;
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
    /** What a kept row is about, when the edge said: a conversation, a call, a broadcast. */
    about?: {
        type: string;
        id: string;
    } | null;
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
/** The bell's time: one family with every other surface (time.ts). */
declare function agoLabel(atMs: number, now: number): string;
/** The kinds a device is woken for; an invitation can wait for the bell. */
declare const ALERT_KINDS: readonly NotificationKind[];
/** What the edge writes when it raises an alert: the same kinds it emails. */
declare const SERVER_NOTIFICATION_KINDS: readonly ["handoff", "deadman", "call", "number", "sweep", "job_failed", "playbook", "calendar_people", "alert", "review", "billing"];
type ServerNotificationKind = (typeof SERVER_NOTIFICATION_KINDS)[number];
interface NotificationDto {
    id: string;
    kind: string;
    title: string;
    body: string;
    /** A hash route without the leading "#/", or null. */
    route: string | null;
    subject_type: string | null;
    subject_id: string | null;
    created_at: string;
    /** This person's marks. */
    read: boolean;
    dismissed: boolean;
}
/** What `GET /api/v1/notifications` returns: the month's rows and this person's "seen everything" moment. */
interface NotificationsDto {
    notifications: NotificationDto[];
    seen_at: string | null;
}
declare function verbForRoute(route: string | null | undefined): string | null;
/** A kept row's key on the bell, so the bridge can tell it from a derived one. */
declare const SERVER_KEY_PREFIX = "n:";
/**
 * The kept rows as the bell shows them: dismissed ones gone, unread decided
 * by the person's seen moment and their own read mark — the same on every
 * device, because both live on the server.
 */
declare function serverNotificationRows(dto: NotificationsDto | null | undefined): NotificationRow[];
/**
 * One row per thing. A derived "needs you" row and the kept handoff (or
 * call-back) row for the same conversation said the same thing twice, in two
 * voices. While the derived row stands, the kept one about that conversation
 * is not shown; once the thread is answered the derived row goes and the kept
 * row remains as the record.
 */
declare function dedupeFeed(rows: NotificationRow[]): NotificationRow[];

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
/**
 * Ask's own daily token budget per workspace, apart from the receptionist's.
 * Counted on uncached input plus output. With the day's snapshot riding into
 * every round, a turn costs two to eight thousand such tokens; a busy owner
 * asking sixty questions stays well under this, and an eval run of the whole
 * case set fits several times over. The first cap (400k) was spent by a day
 * of eval runs and refused the palette until the window rolled.
 */
declare const ASK_TOKENS_DAY = 1500000;
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
            readonly description: "The rows the answer rests on, taken ONLY from what the tools returned this turn, at most four — the ones the answer names. Each needs the kind, the exact id the tool gave you, and a short label (a name, a day, a call time).";
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
            readonly description: "Up to two short questions the person might ask next, in their language. Empty when nothing natural follows.";
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
        now: boolean;
        to: string;
        label: string;
    }, {
        now?: unknown;
        to?: unknown;
        label?: unknown;
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
    kind: "reply" | "steer" | "thread_verb" | "person_mode" | "policy" | "settings" | "whisper" | "invite" | "broadcast" | "playbook";
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
/** Two questions are the same thread when they differ only in case, spacing and punctuation. */
declare function sameQuestion(a: string, b: string): boolean;
/** The Open button's words, by where it goes; the model's label only for a page. */
declare function navigateLabel(nav: {
    to: string;
    label: string;
} | null, language: AskLanguage): string | null;
/** The source chips, minus the one the Open button already is, minus repeats of a place. */
declare function citationsToShow<C extends {
    to: string;
}>(citations: C[], nav: {
    to: string;
} | null): C[];
/**
 * Follow-ups worth a chip: not one that echoes a place the answer already
 * offers to open. "Show this caller's profile" beside an Open the profile
 * button is the same thing twice.
 */
declare function followupsToShow(followups: string[], citations: Array<{
    to: string;
}>, nav: {
    to: string;
} | null): string[];

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
/** A guest on the event, as the calendar carried them. */
interface FeedAttendee {
    name: string | null;
    email: string | null;
}
/** One taken block with the words the owner's calendar gave it. */
interface FeedItem extends BusyBlock {
    title: string;
    allDay: boolean;
    uid: string | null;
    /** The event's description and place, unescaped, as the owner or their booking tool wrote them. */
    description: string | null;
    location: string | null;
    attendees: FeedAttendee[];
}
interface ParsedFeed {
    busy: BusyBlock[];
    /** The same blocks as `busy`, with their titles — for the board. */
    items: FeedItem[];
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
/** The wall clock of an instant in `tz`. */
declare function clockInZone(tz: string, atMs: number): {
    hh: number;
    mm: number;
    ss: number;
};
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
/** The booking rules a workspace has until it sets its own. */
declare const BOOKING_DEFAULTS: {
    lead_hours: number;
    buffer_min: number;
    max_days_ahead: number;
    slot_min: number;
};
declare function dayIntervals(h: Hours | undefined): Array<[string, string]>;
declare function closedOn(closures: Closure[] | undefined, key: string): boolean;
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

/**
 * The people in a calendar: who an appointment is for, read from the words
 * a booking tool wrote into the owner's calendar and matched against People.
 *
 * Booksy, Square, Fresha, Acuity and Google's own appointment schedules all
 * put the client's name and the service in the title; some add a phone or
 * an email in the description, and a booking made through Google adds the
 * booker as a guest. None of it is structured, so the match goes by
 * evidence: a phone number found anywhere in the event beats a name, and a
 * name only counts when it is a whole saved name of four letters or more.
 * An email is carried for the panel; People holds no email to match yet.
 *
 * Pure. The dashboard's calendar, the person's profile, both receptionists
 * and the tests share it, so an appointment is the same person everywhere.
 */

interface EventContacts {
    /** E.164. */
    phones: string[];
    emails: string[];
    /** Guest names the calendar carried. */
    names: string[];
}
interface PersonLike {
    id: string;
    /** A name a human gave — display or WhatsApp — or "" when there is none. Never a phone made words. */
    name: string;
    /** E.164, or null. */
    phone: string | null;
}
interface PersonMatch {
    id: string;
    name: string;
    via: "phone" | "name";
}
/** The phones, emails and guest names an event carries, wherever they were written. */
declare function extractContacts(item: Pick<FeedItem, "title" | "description" | "location" | "attendees">): EventContacts;
/**
 * A person whose whole name the text carries: four letters or more, on word
 * edges ("Dani" is not in "Daniela"), the longest match when several fit.
 * Never a bare number, never a name that is only a phone made words.
 */
declare function personInText(text: string, people: PersonLike[]): PersonLike | null;
/** Who the appointment is for: a phone in the event first, then a whole name in its title, guests or description. */
declare function matchPerson(item: Pick<FeedItem, "title" | "description" | "location" | "attendees">, people: PersonLike[]): PersonMatch | null;
interface Visit {
    id: string;
    /** Epoch ms. */
    start: number;
    end: number;
    title: string;
    allDay: boolean;
    via: "phone" | "name";
}
interface Visits {
    /** The first appointment that has not ended. */
    next: Visit | null;
    /** The latest one that has. */
    last: Visit | null;
}
/** A feed indexed once — every item's phones and words found up front — so many people can be matched against it. */
interface FeedIndex {
    byPhone: Map<string, FeedItem[]>;
    texts: Array<{
        item: FeedItem;
        text: string;
    }>;
}
declare function indexFeed(items: FeedItem[]): FeedIndex;
/** Every appointment of one person against an indexed feed, oldest first: their number first, their whole name second. */
declare function allVisitsIn(index: FeedIndex, person: PersonLike): Visit[];
/** One person's next and last appointment against an indexed feed: their number first, their whole name second. */
declare function visitsIn(index: FeedIndex, person: PersonLike, nowMs: number): Visits;
/** One person's next and last appointment in a parsed feed. */
declare function visitsOf(items: FeedItem[], person: PersonLike, nowMs: number): Visits;
/** "Tue, Sep 8" — or "Today" / "Tomorrow" by the business's clock. */
declare function visitDay(start: number | string, tz: string, nowMs: number): string;
/** "2:00 – 5:00 PM", or "all day". */
declare function visitTime(v: {
    start: number | string;
    end: number | string;
    allDay?: boolean;
    all_day?: boolean;
}, tz: string): string;
/** "Tue, Sep 8 · 2:00 – 5:00 PM" */
/** "2026-09-08" — the day a visit falls on, by the calendar's own clock. */
declare function visitDateKey(start: number | string, tz: string): string;
/** "2:00 PM" — the start alone, for a reminder's sentence. */
declare function visitStartTime(v: {
    start: number | string;
    allDay?: boolean;
    all_day?: boolean;
}, tz: string): string;
declare function visitLine(v: {
    start: number | string;
    end: number | string;
    allDay?: boolean;
    all_day?: boolean;
}, tz: string, nowMs: number): string;
/**
 * The receptionist's lines about a caller's appointments — facts from the
 * calendar, with the rule that nothing is changed from here. A match by
 * name alone says so, so the receptionist confirms it is them before it
 * reads details back.
 */
declare function describeVisits(visits: Visits, tz: string, nowMs: number): string | null;
/** Which calendar the feed comes from, from its address alone — the address itself never leaves the server. */
declare function feedSourceLabel(url: string | null | undefined): string;
/** A description as plain text: tags out, entities back, at most a screen of it. */
declare function eventText(raw: string | null | undefined, max?: number): string | null;
/** One appointment on the wire. */
interface VisitDto {
    id: string;
    /** ISO instants. */
    start: string;
    end: string;
    title: string;
    all_day: boolean;
    via: "phone" | "name";
}
/** A person's appointments as their profile reads them. */
interface PersonVisitsDto {
    timezone: string;
    source: string;
    state: "ok" | "unavailable";
    next: VisitDto | null;
    last: VisitDto | null;
    /** Every visit the feed holds for them, oldest first — the profile's timeline. Absent on the list. */
    all?: VisitDto[];
}
declare function toVisitDto(v: Visit | null): VisitDto | null;
/**
 * The client's name as the title or the guests give it — "Maria Lopez -
 * Balayage", "Balayage · Maria Lopez", "Haircut with Maria Lopez" — or
 * null. A guest's name first; else the first part of the title, split on
 * the separators booking tools use, that is two to four capitalised words
 * of letters and not a service the workspace lists. Shown in the button
 * before anything is added, so a wrong guess is seen, not saved unread.
 */
declare function guessName(item: Pick<FeedItem, "title" | "attendees">, services?: string[]): string | null;
/** One person an appointment names: the phone that keys them, the name as the event gives it, and the appointment it came from. */
interface CalendarPerson {
    /** E.164. */
    phone: string;
    name: string | null;
    title: string;
    uid: string | null;
    /** Epoch ms of the appointment that named them — the soonest upcoming, else the latest past. */
    start: number;
}
/**
 * Everyone the feed names by phone inside the window — a month back, three
 * months ahead — one row per number, so the sweep and the page create each
 * person once. A name is taken from the appointment that keys the row; a
 * later appointment with a name fills in for one without.
 */
declare function peopleFromItems(items: FeedItem[], services: string[], nowMs: number, window?: {
    backDays?: number;
    aheadDays?: number;
}): CalendarPerson[];
/** Of the people who wrote or called in the period, how many have an appointment on the calendar. */
/**
 * What a refusal from `create_person` means for the rest of the batch.
 *
 * `22023` is the door's own refusal of THIS row — a phone that is not in
 * international form, or a name over 80 characters (00052_create_person.sql).
 * The appointments behind it are innocent: skipping costs one person, and
 * stopping costs everyone after them. Stopping is what the calendar read used
 * to do, so a single short code on the calendar silently kept every later
 * person out of People for as long as it stayed there, leaving one line in a
 * log nobody reads.
 *
 * Every other code fails identically for every row — `28000` not signed in,
 * `P0002` no membership, `42501` the grant gone, `PGRST202` the function
 * gone — so spending forty more calls proving it during a page load helps
 * nobody. An absent code is treated as systemic too: unknown means unproven,
 * and the safe unknown is the one that does less.
 */
declare function afterPersonRefused(code: string | null | undefined): "skip" | "stop";
interface BookingReportDto {
    calendar: "ok" | "unavailable" | "none";
    days: number;
    asked: number;
    booked: number;
}
interface BookingReportVM {
    /** False without a readable calendar: nothing to count against. */
    present: boolean;
    /** "12 of 40 booked" */
    headline: string;
    sub: string;
    pct: number | null;
    asked: number;
    booked: number;
}
/**
 * Whether someone who reached out has an appointment that answers it: one
 * upcoming, or one held since they got in touch. The conversion Chanlytics
 * counts is the booking, not a stage somebody moved a card into.
 */
declare function bookedAfterAsk(visits: Visits | null | undefined, askedMs: number): boolean;
declare function toBookingReportVM(dto: BookingReportDto | null | undefined): BookingReportVM;

/** One row of `people_list(tenant, contact?)`. Every column is nullable on
 *  the wire (RETURNS TABLE), so readers coalesce. */
interface PersonRowDto {
    id: string;
    display_name: string | null;
    wa_profile_name: string | null;
    phone_e164: string | null;
    consent: string | null;
    consent_source: string | null;
    marketing_consent?: string | null;
    marketing_consent_source?: string | null;
    marketing_consent_updated_at?: string | null;
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
    /** The last call THEY placed — the one that means they reached out. */
    last_inbound_call_at?: string | null;
    /** What they wanted from that call in the analysis's plain words, else the
     *  provider's summary; null until the call is analysed. */
    last_inbound_call_summary?: string | null;
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
    /** Their appointments on the owner's calendar, attached by the API when the
     *  workspace has one connected; null means no calendar. */
    visits?: PersonVisitsDto | null;
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
    /** Their appointments on the owner's calendar, when the workspace has one connected. */
    visits?: PersonVisitsDto;
    /** How they came to be in People when it was not by writing or calling: the calendar sweep, or a hand. */
    added?: {
        at: string;
        source: string;
        title: string | null;
    };
    /** The owner's notes on this person — the receptionist reads them. */
    notes?: string | null;
    /** The workspace's booking link, for the profile's one-step send. */
    booking_link?: string | null;
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
/** "just now" · "5m ago" · "3h ago" · "2d ago", a date past a week — the one family (time.ts). */
declare function ago(ms: number, nowMs: number): string;
declare function personName(r: Pick<PersonRowDto, "display_name" | "wa_profile_name" | "phone_e164">): string;
type PersonChannel = "whatsapp" | "voice";
type StandingRow = Pick<PersonRowDto, "latest_state" | "latest_paused_until" | "latest_assignee_user_id" | "needs_human" | "open_escalation_reason">;
/** The latest thread's standing, from the one rule every surface reads (standing.ts). */
declare function personStanding(r: StandingRow, nowMs: number): StandingVerdict;
/** A person has the thread: they claimed it, or their own reply paused the receptionist. */
declare function isOwned(r: StandingRow, nowMs: number): boolean;
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
    /** How the answer was given, raw: in_person | phone | form | customer_message | operator | null. */
    source: string | null;
    /**
     * The OTHER answer: offers, specifically.
     *
     * Separate because the carriers require it separate (error 30913) and because
     * the two mean different things -- a person can want to hear about their own
     * appointment and not want to hear about a sale. An opt-out or a do-not-call
     * on the main answer overrides this one; the reverse does not.
     */
    marketing: "unknown" | "opted_in" | "opted_out";
    marketingSource: string | null;
    /** One line for the person's profile: what they said about offers, and when. */
    marketingSub: string;
}
/**
 * How a customer's answer about marketing messages was given. The ingest
 * writes 'customer_message' for STOP and START; a person at the desk picks
 * one of these four. 'operator' is the reset to "not asked" and is never
 * offered as a source.
 */
declare const CONSENT_SOURCES: readonly {
    id: string;
    label: string;
}[];
declare const CONSENT_RESET_SOURCE = "operator";
/** The words for a source; the reset has none, an unknown one is shown as itself. */
declare function consentSourceLabel(source: string | null | undefined): string | null;
type ReceptionistTone = "answering" | "escalated" | "queued" | "snoozed" | "paused" | "silent";
interface PersonReceptionist {
    tone: ReceptionistTone;
    label: string;
}
interface PersonRowVM {
    id: string;
    real: true;
    name: string;
    /** The name a human typed, or null — what a rename field starts from. */
    givenName: string | null;
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
    /** The last call they placed, summarised by the receptionist; null without one. */
    callSummary: string | null;
    threads: number;
    calls: number;
    escalations: number;
    callSeconds: number;
    /** The Inbox route id (`th-<conversation>`); null without a chat. */
    threadId: string | null;
    needsYouSinceMs: number | null;
    /** The calendar's state for this workspace: the outcome lists exist only when it is "ok". */
    calendar: "ok" | "unavailable" | "none";
    /** An appointment ahead on the calendar. */
    booked: boolean;
    /** "Tue, Sep 8" — the day of the next appointment, for the chip. */
    nextVisitDay: string | null;
    /** "Tue, Sep 8 · 2:00 – 5:00 PM · Balayage" */
    nextVisit: string | null;
    lastVisit: string | null;
    /** "Thu, Aug 20" — the day of the last visit, for the row when nothing is ahead. */
    lastVisitDay: string | null;
    /** WhatsApp's 24-hour window for a free reply: open, and how long is left. Null without a chat. */
    replyWindow: {
        open: boolean;
        hoursLeft: number;
    } | null;
    /** When they last wrote or called, whichever is later. */
    askedMs: number | null;
    /** Wrote or called in the last 30 days, and the calendar has never had them. */
    askedNotBooked: boolean;
    nextVisitMs: number | null;
    lastVisitMs: number | null;
    /** Days until the next appointment (0 = today); null without one. */
    nextVisitDays: number | null;
    /** Days since the last visit; null without one. */
    lastVisitDays: number | null;
    /** "2026-09-08": the day of the next / last visit by the calendar's own clock — what a day-keyed playbook reads. */
    nextVisitDate: string | null;
    lastVisitDate: string | null;
    /** The calendar's zone; null without a calendar. */
    calendarTz: string | null;
}
declare function toPersonRowVM(r: PersonRowDto, now?: Date): PersonRowVM;
type PeopleListGroup = "attention" | "journey" | "reach";
/** The rail's three quiet labels: what needs a person, where each person is on the way to a booking, who can be reached. */
declare const PEOPLE_LIST_GROUPS: readonly {
    id: PeopleListGroup;
    label: string;
}[];
/**
 * The rail's smart lists: computed filters over facts, not saved segments,
 * in three groups. The journey lists that read the calendar exist only when
 * one is connected; the booking is the conversion, and a visit is the fact
 * a salon cares about — a regular who never texts is not quiet.
 */
declare const PEOPLE_LISTS: readonly {
    id: string;
    label: string;
    group: PeopleListGroup;
    needsCalendar?: boolean;
    test: (vm: PersonRowVM) => boolean;
}[];
interface PeopleListAction {
    /** The sentence under the list: what the step reaches, or why it cannot yet. */
    text: string;
    /** The button's words. */
    cta: string;
    /** A route. */
    to: string;
    enabled: boolean;
}
/**
 * The obvious next step for a list, when it has one. A broadcast reaches
 * only a recorded yes, so the sentence says how many of the list said it,
 * and the button waits until someone has.
 */
declare function peopleListAction(id: string, members: PersonRowVM[]): PeopleListAction | null;
interface PeopleAggregates {
    total: number;
    needsYou: number;
    needsYouOldestMs: number | null;
    /** First contact within 30 days, by evidence. */
    newThisMonth: number;
    /** Any message or call within 7 days. */
    reachedWeek: number;
    reachedWeekNew: number;
    /** An appointment ahead on the calendar. */
    booked: number;
    /** Wrote or called this month; the calendar has never had them. */
    askedNotBooked: number;
}
declare function peopleAggregates(rows: PersonRowVM[], nowMs: number): PeopleAggregates;
/** Days since last contact, bucketed — the honest replacement for the
 *  mockup's temperature strip. */
declare function recencyCells(rows: PersonRowVM[], nowMs: number): {
    label: string;
    count: number;
}[];
interface AttentionRowVM {
    /** Where they last reached us: "WhatsApp" or "Phone"; null with no contact. */
    channel: "WhatsApp" | "Phone" | null;
    /** "2h ago"; "no contact yet". */
    when: string;
    /** What the row says about them: their own words, or the best evidence. */
    sentence: string;
    /** True when `sentence` is their words, verbatim. */
    quoted: boolean;
    /** "Escalated · asked for a person · since 2:14 PM", as segments. */
    status: string[];
    tone: ReceptionistTone;
    /** The one thing this state asks of you, when it differs from opening the profile. */
    cta: {
        label: string;
        kind: "primary" | "ghost";
        to: string;
    } | null;
}
/**
 * One row of "where your attention matters": the mockup's grammar — a name,
 * where and when, one sentence, one state line, one button — filled only
 * with what is on record. Their words come first; then the last call's
 * summary; then the calendar; then the plain fact of a call. The button is
 * the one thing the state asks of you, and it exists only when that differs
 * from opening the profile, which the row itself does.
 */
declare function attentionRow(p: PersonRowVM, nowMs: number): AttentionRowVM;
type TimelineKind = "customer" | "receptionist" | "you" | "system" | "call" | "escalation" | "decision" | "visit";
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
    /** The owner's notes, the receptionist's reading material. */
    notes: string | null;
    /** The workspace's booking link, or null when none is on file. */
    bookingLink: string | null;
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

/**
 * Templates a business writes here, and the values a broadcast fills them with.
 *
 * Meta approves the words; Chanlytics helps write them and sends them for
 * review. Everything Meta will refuse at the wire is refused here first, in
 * the person's words, and everything a broadcast puts into a numbered slot
 * is decided once: typed text, the person's first name, the business's name,
 * or its booking link — resolved per recipient by the job with the same
 * function the page previews with.
 */
declare const TEMPLATE_LANGUAGES: readonly {
    id: string;
    label: string;
}[];
declare const TEMPLATE_CATEGORIES: readonly ["marketing", "utility"];
type TemplateCategoryChoice = (typeof TEMPLATE_CATEGORIES)[number];
declare const TEMPLATE_BODY_MAX = 1024;
declare const TEMPLATE_FOOTER_MAX = 60;
declare const TEMPLATE_EXAMPLE_MAX = 100;
declare const TEMPLATE_NAME_MAX = 60;
declare function templateNameOk(name: string): boolean;
/** A name Meta accepts, from anything a person typed: lowercase, digits and underscores. */
declare function slugTemplateName(raw: string): string;
/** The numbered slots a body names, sorted and unique. */
declare function placeholdersOf(body: string): number[];
/** Meta wants {{1}}, {{2}}, … with no gaps and nothing else. */
declare function placeholdersSequential(positions: number[]): boolean;
interface TemplateDraftInput {
    name: string;
    language: string;
    category: string;
    body: string;
    footer?: string | null;
    /** One example per slot, in order — Meta's reviewers read these. */
    examples?: string[];
}
interface TemplateDraft {
    name: string;
    language: string;
    category: TemplateCategoryChoice;
    body: string;
    footer: string | null;
    examples: string[];
}
type TemplateDraftCheck = {
    ok: true;
    value: TemplateDraft;
    warnings: string[];
} | {
    ok: false;
    error: string;
};
/**
 * What Meta refuses at the wire, refused here in the person's words. The
 * warnings are things reviewers frown on but do not always reject.
 */
declare function validateTemplateDraft(d: TemplateDraftInput): TemplateDraftCheck;
/** The components Meta's create call takes, from a checked draft. */
declare function templateComponents(v: TemplateDraft): Array<Record<string, unknown>>;
declare const PARAM_SOURCES: readonly ["text", "first_name", "business_name", "booking_link", "visit_when", "visit_service"];
type ParamSourceKind = (typeof PARAM_SOURCES)[number];
type ParamSpec = {
    kind: "text";
    value: string;
} | {
    kind: "first_name";
} | {
    kind: "business_name";
} | {
    kind: "booking_link";
}
/** A visit playbook's own words: "tomorrow at 2:00 PM", and the service. */
 | {
    kind: "visit_when";
} | {
    kind: "visit_service";
};
declare const PARAM_SOURCE_LABELS: Record<ParamSourceKind, string>;
/**
 * A slot's spec from what a route or a card was given: a plain string is
 * typed text; "@first_name" and the like are the sources; an object with a
 * kind is itself. Null means "not a spec".
 */
declare function parseParamSpec(raw: unknown): ParamSpec | null;
declare function paramLabel(spec: ParamSpec): string;
interface ParamFacts {
    firstName: string | null;
    businessName: string;
    bookingLink: string | null;
    /** A visit playbook's words for this person, resolved when the run was made; absent elsewhere. */
    visitWhen?: string | null;
    visitService?: string | null;
}
/** The first name a message may use, or null when all that is on file is a number. */
declare function firstNameOf(displayName: string | null | undefined, waProfileName: string | null | undefined): string | null;
/**
 * The words that go into the slots for one person. A first name nobody has
 * on file becomes "there" ("Hi there"); a booking link the workspace has not
 * set becomes empty, which the route refuses before any broadcast is made.
 */
declare function resolveParams(specs: readonly ParamSpec[], f: ParamFacts): string[];
/** Example words for a preview: what a real person would see. */
declare function exampleParams(specs: readonly ParamSpec[], businessName: string): string[];

declare const BROADCAST_STATES: readonly ["pending_approval", "scheduled", "sending", "sent", "canceled", "failed"];
type BroadcastState = (typeof BROADCAST_STATES)[number];
declare const RECIPIENT_STATES: readonly ["queued", "sent", "skipped", "failed"];
type RecipientState = (typeof RECIPIENT_STATES)[number];
declare const BROADCAST_STATE_LABELS: Record<BroadcastState, string>;
/** How many go in one job, and the breath between two sends. */
declare const BROADCAST_CHUNK = 25;
declare const BROADCAST_GAP_MS = 300;
/** More than this is not a salon's list; it is a mistake. */
declare const BROADCAST_MAX_RECIPIENTS = 2000;
/** Meta's ceiling for one body parameter. */
declare const BROADCAST_PARAM_MAX = 1024;
declare const BROADCAST_SCHEDULE_MAX_DAYS = 30;
declare const BROADCAST_NAME_MAX = 80;
type AudienceKind = "everyone" | "list" | "saved" | "playbook";
/** The kinds a person may pick; "playbook" is the sweep's own. */
declare const AUDIENCE_KINDS: readonly AudienceKind[];
interface Audience {
    kind: AudienceKind;
    /** A People list id (kind "list") or a saved list id (kind "saved"). */
    id: string | null;
    label: string;
}
declare const EVERYONE_LABEL = "Everyone who said yes";
/**
 * The one predicate: the yes THIS message needs, no do-not-contact, and a number
 * to send to.
 *
 * The purpose defaults to marketing, which is what a broadcast has always been
 * and is also the safe answer for a caller that has not thought about it: an
 * omitted argument withholds an offer rather than sending one.
 */
declare function mayReceiveOffers(r: Pick<PersonRowVM, "consent" | "phone">, purpose?: SendPurpose): boolean;
/**
 * The people a broadcast may reach: the audience crossed with mayReceiveOffers.
 * The route enrols exactly these; the page shows exactly these counts.
 */
declare function eligibleFor(rows: PersonRowVM[], kind: AudienceKind, id: string | null | undefined, savedIds: ReadonlySet<string> | null, 
/** What kind of message this audience is for. Marketing unless the caller knows better. */
purpose?: SendPurpose): PersonRowVM[];
/** The words a person will read: the body with its numbered slots filled. */
declare function renderTemplate(body: string | null | undefined, params: readonly string[]): string;
/**
 * One body value as Meta will accept it: trimmed, no line breaks or tabs, no
 * run of four spaces, under the ceiling. Null means "not acceptable".
 */
declare function cleanParam(raw: unknown): string | null;
/** A name when the owner gave none: the template and the day. */
declare function broadcastName(templateName: string, now?: Date, title?: string | null): string;
interface BroadcastCounts {
    queued: number;
    sent: number;
    skipped: number;
    failed: number;
    delivered: number;
    read: number;
    replied: number;
}
interface BroadcastDto {
    id: string;
    name: string;
    template_id: string;
    template_name: string;
    template_language: string;
    /** What fills each numbered slot: typed text, or the person's first name, the business's name, its booking link. */
    params: ParamSpec[];
    audience: Audience;
    state: BroadcastState;
    scheduled_for: string;
    started_at: string | null;
    finished_at: string | null;
    recipient_count: number;
    failure: string | null;
    created_at: string;
    /** A playbook's run: which one, and which local day it ran for. */
    playbook_id: string | null;
    run_for: string | null;
    counts: BroadcastCounts;
}
interface BroadcastVM extends BroadcastDto {
    stateLabel: string;
    /** "today 9:00 AM" / "Sep 12 · 10:00 AM". */
    when: string;
    /** Delivered or read, over sent. Null until something was sent. */
    deliveredPct: number | null;
    readPct: number | null;
    /** Still to come: scheduled or sending. */
    open: boolean;
    /** Sent + skipped + failed over enrolled, for the sending row. */
    progress: number;
}
declare function whenLabel(iso: string, now?: Date): string;
declare function toBroadcastVM(d: BroadcastDto, now?: Date): BroadcastVM;
/** The reasons a person is held back at the wire, in the owner's words. */
declare const HELD_REASONS: Record<string, string>;
/** Meta's messaging-limit tiers: business-initiated conversations in a rolling day. */
declare const LIMIT_TIERS: Record<string, number>;
declare function dailyLimit(tier: string | null | undefined): number | null;
interface NumberHealthInput {
    /** Meta's quality rating as read at connection: GREEN, YELLOW, RED, UNKNOWN. */
    quality: string | null | undefined;
    /** The newest quality webhook: FLAGGED, UNFLAGGED, DOWNGRADE, UPGRADE. */
    event: string | null | undefined;
    /** The newest messaging limit webhook: TIER_250 and the like. */
    limit: string | null | undefined;
}
interface NumberHealth {
    canSend: boolean;
    tone: "ok" | "warn" | "danger" | "unknown";
    label: string;
    limitPerDay: number | null;
    refusal: string | null;
}
/**
 * The one reading of a number's health. A flagged or red number cannot
 * broadcast: sending more marketing on it risks the number itself. Anything
 * Meta has not reported is said so, never assumed good or bad.
 */
declare function numberHealth(n: NumberHealthInput): NumberHealth;
/** Null when the audience fits the day's limit; otherwise the refusal, with the numbers. */
declare function overLimitRefusal(h: NumberHealth, audience: number): string | null;
interface BroadcastRecipientDto {
    contact_id: string;
    name: string;
    phone: string | null;
    state: RecipientState;
    /** Why they were held back or not reached, as the job recorded it. */
    reason: string | null;
    sent_at: string | null;
    /** The message's status from WhatsApp's receipts: sent, delivered, read, failed. */
    message_status: string | null;
    conversation_id: string | null;
    /** Their thread heard from them after the broadcast reached them. */
    replied: boolean;
}
interface BroadcastDetailDto {
    broadcast: BroadcastDto;
    recipients: BroadcastRecipientDto[];
}

/**
 * What starts a playbook. A list trigger sends to a list that keeps itself
 * current; the cadence trigger to everyone, on a rhythm; a visit trigger to
 * the people the calendar names for one day — the day before an appointment,
 * the day after a visit. The reminder runs under the Booking row of the
 * Autonomy pane: the setting that governs bookings governs their reminders.
 */
declare const PLAYBOOK_TRIGGERS: readonly [{
    readonly id: "quiet_30";
    readonly label: "Win-back";
    readonly list: "quiet";
    readonly cls: "reengage";
    readonly kind: "list";
    readonly hint: "Nothing heard in 30 days";
}, {
    readonly id: "new_week";
    readonly label: "Welcome";
    readonly list: "new_week";
    readonly cls: "campaign";
    readonly kind: "list";
    readonly hint: "First contact in the last 7 days";
}, {
    readonly id: "phoned_only";
    readonly label: "Save our number";
    readonly list: "phoned_only";
    readonly cls: "reengage";
    readonly kind: "list";
    readonly hint: "Only ever phoned, never texted";
}, {
    readonly id: "everyone_monthly";
    readonly label: "The month's offer";
    readonly list: null;
    readonly cls: "campaign";
    readonly kind: "cadence";
    readonly hint: "Everyone who said yes, on a cadence";
}, {
    readonly id: "visit_tomorrow";
    readonly label: "Visit reminder";
    readonly list: null;
    readonly cls: "booking";
    readonly kind: "visit";
    readonly hint: "The day before an appointment on the calendar";
}, {
    readonly id: "visited";
    readonly label: "After the visit";
    readonly list: null;
    readonly cls: "reengage";
    readonly kind: "visit";
    readonly hint: "The day after a visit, when nothing is booked next";
}];
type PlaybookTrigger = (typeof PLAYBOOK_TRIGGERS)[number]["id"];
type PlaybookTriggerKind = (typeof PLAYBOOK_TRIGGERS)[number]["kind"];
type PlaybookPolicyClass = "reengage" | "campaign" | "booking";
declare const PLAYBOOK_STATES: readonly ["running", "paused"];
type PlaybookState = (typeof PLAYBOOK_STATES)[number];
declare const PLAYBOOK_DEFAULTS: {
    readonly runHour: 10;
    readonly capPerRun: 25;
    readonly gapDays: 90;
    readonly cadenceDays: 30;
};
declare const PLAYBOOK_HOURS: {
    readonly min: 9;
    readonly max: 20;
};
/** One playbook message per person per week, across playbooks. */
declare const PLAYBOOK_BREATH_MS: number;
/** Under veto, a run is scheduled this far ahead with a Stop. */
declare const PLAYBOOK_VETO_DELAY_MS: number;
declare const PLAYBOOK_NAME_MAX = 80;
declare function triggerOf(id: string): (typeof PLAYBOOK_TRIGGERS)[number] | null;
interface PlaybookDto {
    id: string;
    name: string;
    trigger: PlaybookTrigger;
    template_id: string;
    template_name: string;
    template_language: string;
    params: ParamSpec[];
    policy_class: PlaybookPolicyClass;
    state: PlaybookState;
    run_hour: number;
    cap_per_run: number;
    gap_days: number;
    cadence_days: number;
    last_run_for: string | null;
    last_run_at: string | null;
    created_at: string;
}
/** When a person last heard from this playbook, and from any playbook. contact id → ms. */
interface Touches {
    byThis: Map<string, number>;
    byAny: Map<string, number>;
}
/**
 * The people a run may reach: the trigger's list crossed with who said yes to
 * THIS KIND of message, minus anyone who heard from this playbook within its
 * gap (its cadence, for the month's offer), minus anyone who heard from any
 * playbook this week; the longest-unheard first; at most the cap.
 *
 * The purpose is the trigger's own `cls`, which every trigger has always
 * declared and which nothing has ever read. `booking` is a reminder about an
 * appointment the customer made; everything else is promotional.
 *
 * That distinction fixes a real loss. `visit_tomorrow` sends the one utility
 * template in the starter library to somebody with a visit on the calendar
 * tomorrow -- and it was skipped with `not_opted_in` unless that person had
 * given marketing-grade consent. A customer who booked an appointment was not
 * reminded of it because they had never asked for offers.
 */
declare function eligibleForPlaybook(rows: PersonRowVM[], p: Pick<PlaybookDto, "trigger" | "cap_per_run" | "gap_days" | "cadence_days">, touches: Touches, nowMs: number): PersonRowVM[];
type RunPlan = {
    kind: "send";
    state: "scheduled";
    at: Date;
} | {
    kind: "hold";
    state: "pending_approval";
} | {
    kind: "off";
};
/** What a run does under the class's mode: sends now, sends after a stop window, waits for a person, or nothing. */
declare function planRun(mode: string | null | undefined, now: Date): RunPlan;
/** YYYY-MM-DD by the business's clock. */
declare function localDate(tz: string, now: Date): string;
declare function localHour(tz: string, now: Date): number;
/**
 * A running playbook runs once per local day: at its hour, or later that day
 * when the sweep missed the hour or the playbook was started or resumed
 * after it — never past the last hour a message may go out.
 */
declare function runDueNow(p: Pick<PlaybookDto, "state" | "run_hour" | "last_run_for">, tz: string, now: Date): boolean;
/** "Daily 10:00 · up to 25 · once per person, again after 90 days". */
declare function scheduleLine(p: Pick<PlaybookDto, "trigger" | "run_hour" | "cap_per_run" | "gap_days" | "cadence_days">): string;
/** "today 10:00", "today, within the hour" or "tomorrow 10:00", by the business's clock; "paused" when it is. */
declare function nextRunLabel(p: Pick<PlaybookDto, "state" | "run_hour" | "last_run_for">, tz: string, now: Date): string;
declare const PLAYBOOK_CLASS_LABEL: Record<PlaybookPolicyClass, string>;
/**
 * The words a visit playbook's slots take for one person — when, and what
 * for — from the visit the run read. Resolved when the run is made and kept
 * on the recipient row, so the send says what the calendar said then.
 */
declare function visitFactsFor(trigger: string, visit: Pick<VisitDto, "start" | "title" | "all_day"> | null, tz: string): {
    visit_when: string;
    visit_service: string;
} | null;

/**
 * The starter set: five WhatsApp templates written for the moments
 * Chanlytics acts on — a win-back, a welcome, save our number, the month's
 * offer, a quick note — in English and Spanish, with the slots the wire
 * fills per person. Meta approves the words; a workspace adds the set with
 * one click, the playbooks pick from it, and a broadcast starts from it.
 *
 * Every entry passes the same check a template written by hand passes, with
 * no warnings (a test holds it to that), so what a new workspace gets is a
 * set WhatsApp is expected to approve, not a set that needs fixing first.
 * Titles are for people; names are what Meta and the wire use.
 */

type StarterSlotKind = "first_name" | "business_name" | "booking_link" | "visit_when" | "visit_service" | "text";
interface StarterSlot {
    kind: StarterSlotKind;
    /** The words a person sees for the slot. */
    label: string;
    /** What WhatsApp's reviewers read; also the preview's words. */
    example: string;
}
interface StarterText {
    body: string;
    footer: string | null;
    slots: StarterSlot[];
}
interface StarterTemplate {
    key: string;
    /** Meta's name: lowercase, digits, underscores. Same as the key. */
    name: string;
    title: string;
    /** One line on when it is for. */
    purpose: string;
    category: "marketing" | "utility";
    /** The playbook trigger it is written for, when there is one. */
    trigger: PlaybookTrigger | null;
    texts: Record<string, StarterText>;
}
declare const STARTER_LANGUAGES: readonly [{
    readonly id: "en_US";
    readonly label: "English";
}, {
    readonly id: "es";
    readonly label: "Spanish";
}];
declare const STARTER_TEMPLATES: readonly StarterTemplate[];
declare function starterByName(name: string | null | undefined): StarterTemplate | null;
declare function starterByKey(key: string): StarterTemplate | null;
declare function starterForTrigger(trigger: string | null | undefined): StarterTemplate | null;
/** The text in a language, English when the language is not written. */
declare function starterText(s: StarterTemplate, language: string): StarterText;
/** What the submit route takes: the same shape a template written by hand has. */
declare function starterDraft(s: StarterTemplate, language: string): {
    name: string;
    language: string;
    category: string;
    body: string;
    footer: string | null;
    examples: string[];
};
/** The message as a customer would read it, with the business's own name when known. */
declare function starterPreview(s: StarterTemplate, language: string, businessName?: string | null): string;
declare const TEMPLATE_TITLE_MAX = 60;
/**
 * Words for people: the title the workspace gave it, else the starter's,
 * else the name made words — a trailing version (_v1) is not a word.
 */
declare function templateTitle(name: string | null | undefined, title?: string | null): string;
/**
 * What a slot most likely takes, from the label Meta or a person gave it and
 * the example beside it. Only a guess for templates written elsewhere; a
 * starter's slots are known.
 */
declare function guessSlotKind(label: string | null | undefined, example?: string | null): StarterSlotKind;
/** The source of each slot for a template row: the starter's own, or a guess per variable. */
declare function defaultSlotKinds(t: {
    name: string;
    variables: unknown;
}): StarterSlotKind[];
/** The specs a run or a broadcast would send with, from the default kinds — typed text stays empty for the person to fill. */
declare function defaultParamSpecs(t: {
    name: string;
    variables: unknown;
}): ParamSpec[];
/** A starter's place in the library's order; everything else after. */
declare function starterIndex(name: string | null | undefined): number;
/**
 * Starters in the library's order, then templates written here, then the
 * rest — marketing before utility, then by name. What a composer most
 * often needs is nearest.
 */
declare function compareTemplates(a: {
    name: string;
    category?: string | null;
    source?: string | null;
}, b: {
    name: string;
    category?: string | null;
    source?: string | null;
}): number;
/** The template a composer opens on: the trigger's starter, the quick note for a broadcast, else the first. */
declare function defaultTemplate<T extends {
    name: string;
    category?: string | null;
    source?: string | null;
}>(list: readonly T[], trigger: string | null): T | null;
/** Each slot's words for a person: a starter's own labels, else the labels the row carries, else "Value n". */
declare function slotLabels(t: {
    name: string;
    language?: string | null;
    variables: unknown;
}): string[];

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
/** A calendar day ("2026-09-04") as a local date, without the UTC shift that
 *  `new Date("2026-09-04")` would apply. */
declare function dayDate(day: string): Date;
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

/**
 * Reports › Campaigns — what the offers earned, as facts.
 *
 * Messages sent by broadcasts and playbook runs, WhatsApp's own delivered
 * and read receipts, who wrote back afterwards, and the people who said
 * yes or asked to stop — over the period and the one before it, and the
 * current period by source. Every number is a count over columns; the
 * shares are counts over counts; nothing is scored or estimated. Colors are
 * the page's.
 */

interface CampaignDayDto {
    day: string;
    sent: number;
    delivered: number;
    read: number;
    replied: number;
    opt_ins: number;
    opt_outs: number;
}
interface CampaignSourceDto {
    id: string;
    kind: "playbook" | "broadcast";
    name: string;
    template_name: string | null;
    runs: number;
    sent: number;
    delivered: number;
    read: number;
    replied: number;
    last_at: string | null;
}
/** What `campaign_series(tenant, days)` returns. `series` spans TWO periods, newest last; `sources` is the current one. */
interface CampaignReportDto {
    timezone: string;
    days: number;
    span_days: number;
    today: string;
    series: CampaignDayDto[];
    sources: CampaignSourceDto[];
    error?: string;
}
interface CampaignPointVM {
    day: string;
    label: string;
    short: string;
    sent: number;
    delivered: number;
    replied: number;
    optIns: number;
    optOuts: number;
}
interface CampaignSourceVM {
    id: string;
    kind: "playbook" | "broadcast";
    kindLabel: string;
    name: string;
    templateName: string | null;
    /** The template's words for people; the page may swap in the workspace's own title. */
    template: string;
    runs: number;
    sent: number;
    delivered: number;
    read: number;
    replied: number;
    deliveredPct: number | null;
    readPct: number | null;
    repliedPct: number | null;
    lastLabel: string;
    /** 0..1 of the source that sent the most. */
    share: number;
}
interface CampaignTotals {
    sent: number;
    delivered: number;
    replied: number;
    sends: number;
    optIns: number;
    optOuts: number;
}
interface CampaignReportVM {
    days: number;
    tiles: ReportTileVM[];
    points: CampaignPointVM[];
    totals: CampaignTotals;
    sources: CampaignSourceVM[];
    /** Nothing went out and nobody answered about offers: no send, no yes, no stop. */
    empty: boolean;
    max: number;
    table: {
        columns: string[];
        rows: (string | number)[][];
    };
}
declare function toCampaignReportVM(dto: CampaignReportDto): CampaignReportVM;
declare const CAMPAIGN_REPORT_RANGES: readonly {
    days: number;
    id: string;
    label: string;
}[];

/**
 * Calendar — the owner's calendar as the receptionist reads it.
 *
 * A viewer, never a scheduler: what the feed says is taken, the hours and
 * closures the business keeps, and the windows the receptionist would offer
 * a caller — the same windows the phone tool and the assistant compute
 * (availability.ts), so the page shows what callers are told. Nothing is
 * booked here; the booking link does that, whichever tool stands behind it.
 *
 * The DTO is what the route returns for one span of days; the view model is
 * what the page draws — a week or a day on the mockup's own geometry (hours
 * down, days across), a month of counts, or an agenda — with bands where
 * the business is closed, blocks where the calendar is taken, dashed
 * windows where it is open, and the words Settings gave it: the hours, the
 * closures ahead, the booking rules, the services and how long they take.
 * Pure; tests feed fixtures.
 */

interface CalendarItemDto {
    id: string;
    /** ISO instants. */
    start: string;
    end: string;
    title: string;
    all_day: boolean;
    /** The person in People this appointment is for — by a phone in the event, else a whole name in its words. */
    person: {
        id: string;
        name: string;
        via?: "phone" | "name";
    } | null;
    /** The event's own words, plain text. */
    description?: string | null;
    location?: string | null;
    /** Phones (E.164) and emails found in the event, for the panel. */
    contacts?: {
        phones: string[];
        emails: string[];
    };
    /** The client's name as the event gives it, for "Add … to People"; null when the title says nothing name-like. */
    guess?: string | null;
}
interface CalendarDayDto {
    /** "YYYY-MM-DD" in the business's zone. */
    key: string;
    items: CalendarItemDto[];
    /** The windows the receptionist would offer that day, ISO instants. */
    windows: Array<{
        start: string;
        end: string;
    }>;
}
interface CalendarFeedDto {
    present: boolean;
    /** "Google Calendar", "Apple Calendar", "Outlook" or "your calendar" — from the address, which stays on the server. */
    source?: string;
    state: "ok" | "unavailable" | "none";
    read_at: string | null;
    events: number;
    recurring_expanded: number;
    skipped_recurring: number;
}
interface CalendarServiceDto {
    name: string;
    duration_min: number | null;
    /** Needs a consultation first: the receptionist books the consult, never the service. */
    consult_first: boolean;
}
/** What `GET /api/v1/calendar?from=&days=` returns. */
interface CalendarWeekDto {
    timezone: string;
    from: string;
    to: string;
    feed: CalendarFeedDto;
    hours: Record<string, Hours | undefined> | null;
    closures: Closure[];
    rules: BookingRulesLike | null;
    services: CalendarServiceDto[];
    booking_link: string | null;
    days: CalendarDayDto[];
    error?: string;
}
/** The key `n` days after `key`. */
declare function shiftKey(key: string, n: number): string;
/** The Monday of the week `key` is in. */
declare function mondayOf(key: string): string;
declare function isDayKey(s: unknown): s is string;
/** The span a month view shows: six weeks from the Monday on or before the first. */
declare function monthSpan(key: string): {
    from: string;
    days: number;
};
/** The first of the month `n` months away from `key`'s month. */
declare function shiftMonth(key: string, n: number): string;
/** "September 2026" */
declare function monthLabelOf(key: string): string;
/** "9 AM", "2:30 PM". */
declare function clockLabel(t: number): string;
declare function readAgoLabel(iso: string | null, now: Date): string | null;
/** "Offers times at least 2h ahead · 15 min between appointments · up to 14 days out · 30-min slots". */
declare function rulesLine(rules: BookingRulesLike | null | undefined): string;
/** "Mon–Fri 10:00–19:00", "Sat 10:00–16:00", "Sun closed" — one line per run of days with the same hours. */
declare function hoursLines(hours: Record<string, Hours | undefined> | null | undefined): string[];
interface CalendarBlockVM {
    id: string;
    /** Hours from midnight in the business's zone, fractional. */
    t: number;
    /** Minutes. */
    dur: number;
    title: string;
    /** "2 – 3:30 PM" */
    time: string;
    person: {
        id: string;
        name: string;
        via: "phone" | "name" | null;
    } | null;
    description: string | null;
    location: string | null;
    /** Display-formatted phones (and the same in E.164, for the add), and the emails the event carried. */
    contacts: {
        phones: string[];
        e164: string[];
        emails: string[];
    };
    /** The client's name as the event gives it, or null. */
    guess: string | null;
    start: string;
    end: string;
}
interface CalendarBandVM {
    from: number;
    to: number;
    label: string | null;
}
interface CalendarWindowVM {
    t: number;
    dur: number;
    /** "2:30 – 4 PM" */
    label: string;
}
interface CalendarDayVM {
    key: string;
    dow: string;
    date: string;
    long: string;
    /** "8" — the day of the month, for the month grid. */
    dayNum: string;
    today: boolean;
    past: boolean;
    closed: {
        yes: boolean;
        note: string | null;
    };
    bands: CalendarBandVM[];
    blocks: CalendarBlockVM[];
    allDay: CalendarBlockVM[];
    windows: CalendarWindowVM[];
}
interface CalendarServiceVM {
    name: string;
    duration: number | null;
    consultFirst: boolean;
    /** "Balayage · 90 min" */
    label: string;
}
interface CalendarClosureVM {
    key: string;
    /** "Sep 12" or "Sep 12 – 14" */
    label: string;
    note: string | null;
}
interface CalendarVM {
    timezone: string;
    from: string;
    to: string;
    /** "Sep 7 – 13" */
    rangeLabel: string;
    /** "September 2026" — the month a six-week span shows, else the month of `from`. */
    monthLabel: string;
    /** The hours the grid draws, whole hours. */
    hours: {
        start: number;
        end: number;
    };
    days: CalendarDayVM[];
    today: string;
    /** Where the now line sits, hours from midnight, when today is in the span. */
    now: number | null;
    feed: {
        present: boolean;
        state: "ok" | "unavailable" | "none";
        line: string;
        events: number;
        source: string;
    };
    stats: {
        events: number;
        windows: number;
        next: string;
    };
    rules: string;
    hoursLines: string[];
    closuresAhead: CalendarClosureVM[];
    services: CalendarServiceVM[];
    bookingLink: string | null;
}
/**
 * The span as the page draws it. `now` decides today, the now line, which
 * days are past, the next opening and the closures ahead.
 */
declare function toCalendarVM(dto: CalendarWeekDto, now?: Date): CalendarVM;
/** Midnight of a day key in `tz`, as an instant. */
declare function zoneMidnight(tz: string, key: string): number;
type CalendarView = "week" | "day" | "month" | "agenda";
/** The days a view needs, from the day it looks at: a week (the day's week), six weeks for a month, two weeks for the agenda. */
declare function spanForView(view: CalendarView, anchor: string): {
    from: string;
    days: number;
};
/**
 * The window loaded around an anchor: nine weeks from the Monday a week
 * before the anchor's month starts — enough for the month grid, the anchor's
 * week and its neighbours, and two weeks of agenda from any day in it, so
 * switching views and moving a week are slices, not reads.
 */
declare function windowFor(anchor: string): {
    from: string;
    days: number;
};
/** Whether contiguous loaded days cover `count` days from `from`. */
declare function coversSpan(days: ReadonlyArray<{
    key: string;
}>, from: string, count: number): boolean;
/** A day's frame from its key alone — the shape a view draws before the day's data has landed. */
declare function frameOf(key: string, todayKey: string): {
    key: string;
    dow: string;
    date: string;
    long: string;
    dayNum: string;
    today: boolean;
    past: boolean;
};

/**
 * The words of a call's outcome: the choices the phone receptionist's
 * post-call analysis picks from, what each says on a surface, and the tidy
 * of a provider summary written before the analysis carried what the caller
 * wanted.
 */
/** How a call ended for the caller. The agent's analysis picks one; the CHECK on calls.outcome admits the same six. */
declare const CALL_OUTCOMES: readonly ["answered", "booking_link_sent", "callback_needed", "voicemail", "no_request", "other"];
type CallOutcome = (typeof CALL_OUTCOMES)[number];
/** What a surface says for each outcome. */
declare const CALL_OUTCOME_WORDS: Record<CallOutcome, string>;
declare function callOutcomeOf(v: unknown): CallOutcome | null;
/** The outcome's words, or null when the call has none on record. */
declare function callOutcomeWords(v: unknown): string | null;
/**
 * A provider summary from before the analysis carried what the caller
 * wanted reads "The user called Melany's Beauty Salon to inquire about…".
 * Nobody says that. The opening is folded to "Called to inquire about…"
 * without touching a word of the rest, so nothing is invented; a summary
 * that opens any other way is kept as it is.
 */
declare function tidyCallSummary(text: string | null | undefined): string | null;

interface ChannelDto {
    id: string;
    kind: string;
    number_e164: string | null;
    status: string;
    created_at: string;
    /** Newest inbound on this channel: a WhatsApp message's channel_ts, or a
     *  call's started_at. Null when nobody has used it yet. */
    last_inbound_at: string | null;
    /** What WhatsApp has said about the number, from the channel row's config:
     *  the quality rating read at connection, the newest quality and limit
     *  webhooks, and when. All null until Meta has said something. */
    quality?: string | null;
    quality_event?: string | null;
    messaging_limit?: string | null;
    quality_at?: string | null;
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

/**
 * The receptionist under a Google review — the pure half.
 *
 * What the Autonomy row for reviews means, the prompt that writes a reply in
 * the business's name, which unreplied reviews the auto mode may answer in
 * one sync, how a draft is cleaned before it is shown or posted, and the
 * words the pages say. No model, no network: the edge calls the model with
 * the prompt built here; the tests read the same functions.
 */
type ReviewReplyMode = "auto" | "ask" | "never";
/** The row's mode, from the workspace's policy rows. No row, or a mode the class cannot take, reads as ask: a draft on request, nothing posted alone. */
declare function reviewReplyModeOf(rows: ReadonlyArray<{
    class: string;
    mode: string;
}> | null | undefined): ReviewReplyMode;
/** What the receptionist knows about the business when it writes under a review. */
interface ReviewReplyFacts {
    name: string;
    /** The owner's own words for how the receptionist speaks, when given. */
    tone: string | null;
    /** The languages the business speaks, first one first. */
    languages: string[];
    /** The line customers already use, for the invitation on a poor review. */
    phone: string | null;
    website: string | null;
    /** Service names, so a reply can name what they had without inventing it. */
    services: string[];
}
interface ReviewToAnswer {
    rating: number | null;
    author: string | null;
    text: string | null;
    /** When it was written, ISO, when known. */
    written_at: string | null;
}
/** At most this many words; Google shows a reply beside the review, not under a fold. */
declare const REVIEW_REPLY_MAX_WORDS = 60;
/** A cap on the cleaned draft, well above the words asked for and well under Google's 4096. */
declare const REVIEW_REPLY_MAX_CHARS = 1000;
/** How many unreplied reviews the auto mode answers in one sync; the rest wait for the next hour. */
declare const REVIEW_AUTO_REPLIES_PER_SYNC = 3;
/** The auto mode answers reviews written within this long; older ones are the owner's. */
declare const REVIEW_AUTO_REPLY_MAX_AGE_MS: number;
/**
 * The prompt: the business as the system, the review as the message. The
 * rules are the charter's — no money, no invented facts, no arguing — and
 * the reply's length and language are fixed here, not left to taste.
 */
declare function reviewReplyPrompt(facts: ReviewReplyFacts, review: ReviewToAnswer): {
    system: string;
    user: string;
};
/**
 * A draft as the model returned it, made fit to show or post: labels the
 * model sometimes prefixes, quotation marks around the whole, and runs of
 * whitespace gone; empty when nothing usable remains.
 */
declare function cleanDraft(raw: unknown): string;
interface ReviewOnRecord {
    id: string;
    review_id: string;
    origin: string;
    published_at: string | null;
    reply_text: string | null;
}
/**
 * The reviews the auto mode may answer in one sync: from the profile, with
 * no reply yet, written after the profile was connected — what came in
 * while the receptionist was on duty, never the years before — and not
 * older than two weeks. Newest first, capped; the rest wait for the next
 * hour, which finds them still unreplied.
 */
declare function autoReplyCandidates<T extends ReviewOnRecord>(rows: readonly T[], connectedAt: string | null, nowMs: number, cap?: number): T[];
/** The bell after the receptionist answered: one review by name, several by count. */
declare function autoReplyBell(answered: ReadonlyArray<{
    author: string | null;
    text: string;
}>): {
    title: string;
    body: string;
} | null;
/** What the Reports card says beside the source of its reviews, when replies can go out from here. */
declare function reviewReplyWords(mode: ReviewReplyMode | null | undefined, canReply: boolean): string;

interface GoogleListingDto {
    place_id: string;
    name: string;
    address: string | null;
    maps_uri: string | null;
    business_status: string | null;
    rating: number | null;
    review_count: number | null;
    linked_at: string;
    /** The last successful read; null before the first. */
    checked_at: string | null;
    /** The words of the last failed read; null once a read succeeds again. */
    check_error: string | null;
}
interface GoogleReviewDto {
    id: string;
    review_id: string;
    origin: "places" | "profile";
    rating: number | null;
    author: string | null;
    author_uri: string | null;
    author_photo_uri: string | null;
    body: string | null;
    language_code: string | null;
    published_at: string | null;
    reply_text: string | null;
    replied_at: string | null;
    maps_uri: string | null;
    first_seen_at: string;
}
/** The rating and the count on one local day, as the edge read them. */
interface GoogleDayDto {
    day: string;
    rating: number | null;
    review_count: number;
}
/** The owner's Business Profile, connected: whose account, which location, when it last synced. Never a token. */
interface GoogleConnectionDto {
    google_email: string | null;
    account_title: string | null;
    /** Null while the owner still has to choose among several locations. */
    location_name: string | null;
    location_title: string | null;
    connected_at: string;
    last_synced_at: string | null;
    sync_error: string | null;
}
/** Google's consent-screen audience for our app, as the operator set it on the edge; null = nothing to say. */
type GoogleAudience = "testing" | "unverified" | "verified";
/** What `GET /api/v1/google` returns. */
interface GoogleDto {
    /** Whether this deployment can look listings up (a Places key on the edge) and connect profiles (an OAuth client on the edge), and which audience Google's consent screen has. */
    ready: {
        places: boolean;
        profile: boolean;
        audience?: GoogleAudience | null;
    };
    listing: GoogleListingDto | null;
    connection: GoogleConnectionDto | null;
    /** The newest first; at most a screenful. */
    reviews: GoogleReviewDto[];
    /** Oldest first. */
    days: GoogleDayDto[];
    /** The Autonomy row for reviews: what the receptionist does under a new one. */
    reply_mode: ReviewReplyMode;
    role: string;
}
/** What a search found: what the owner confirms with one tap. */
interface GoogleCandidateDto {
    place_id: string;
    name: string;
    address: string | null;
    maps_uri: string | null;
}
/** A location of the connected account, for the owner to choose. */
interface GoogleLocationDto {
    account_name: string;
    account_title: string;
    location_name: string;
    title: string;
    address: string | null;
    /** Null for a location not on Maps yet — it cannot be chosen until Google lists it. */
    place_id: string | null;
    maps_uri: string | null;
}
/** The facts Setup reads: can the listing be found here, is one linked, is the profile connected. */
interface SetupGoogleFacts {
    /** Either door is open: listings can be found here, or profiles connected. */
    ready: boolean;
    /** Listings can be found here (a Places key); absent means yes. */
    places?: boolean;
    listing: {
        name: string;
        rating: number | null;
        review_count: number | null;
        checked_at: string | null;
        check_error: string | null;
    } | null;
    connected?: boolean;
}
/** Google shows this many reviews of a listing, the most relevant first. */
declare const GOOGLE_SHOWN_REVIEWS = 5;
/** A review first seen this recently is news on Today. */
declare const REVIEW_NEWS_MS: number;
/** …unless it was written long ago and merely resurfaced in the five Google shows. */
declare const REVIEW_NEWS_MAX_AGE_MS: number;
/** "4.8 ★"; "no rating yet" when Google has none. */
declare function ratingWords(rating: number | null | undefined): string;
/** "★★★★☆" for a review's stars; five hollow stars for none. */
declare function starsOf(rating: number | null | undefined): string;
/** "213 reviews"; "reviews not counted yet" before the first read. */
declare function reviewsWords(count: number | null | undefined): string;
/** One line about the listing: "Northside Movers · 4.8 ★ · 213 reviews on Google". */
declare function listingLine(l: {
    name: string;
    rating: number | null;
    review_count: number | null;
}): string;
/** When the listing was read, in words — the fact the owner wants when a number looks stale. */
declare function checkedWords(l: Pick<GoogleListingDto, "checked_at" | "check_error">, nowMs: number): string;
/** The connection in words: whose account, and when it last synced or why it could not. */
declare function connectionWords(c: GoogleConnectionDto, nowMs: number): string;
/** A review's words, cut for a line: the first sentence or so. */
declare function reviewSnippet(body: string | null | undefined, max?: number): string;
interface GoogleReviewVM {
    id: string;
    stars: string;
    rating: number | null;
    author: string;
    /** "3d ago" or the date. */
    when: string;
    text: string;
    replied: boolean;
    replyText: string;
    mapsUri: string | null;
    /** First seen recently, written recently, and not part of the first read. */
    isNew: boolean;
    /** Read through the owner's profile: every review, and it can be answered. */
    fromProfile: boolean;
}
interface GoogleGainedPointVM {
    day: string;
    label: string;
    short: string;
    gained: number;
}
interface GoogleVM {
    listing: {
        name: string;
        address: string | null;
        ratingLabel: string;
        count: number | null;
        /** "Checked 3h ago" · "Google could not be read since 2d ago — …" */
        checked: string;
        mapsUri: string | null;
        /** The last read failed. */
        trouble: boolean;
    } | null;
    /** The owner's profile, when connected: whose account, the location, when it synced. */
    connection: {
        email: string | null;
        location: string | null;
        words: string;
        pending: boolean;
        trouble: boolean;
    } | null;
    /** Reviews can be answered from here: the profile is connected and complete. */
    canReply: boolean;
    /** What the receptionist does under a new review, and the words for it beside the source; empty until replies can go out from here. */
    reply: {
        mode: ReviewReplyMode;
        words: string;
    };
    /** Rating now · reviews on Google · gained in the period · newest review. */
    tiles: ReportTileVM[];
    gained: {
        points: GoogleGainedPointVM[];
        max: number;
        /** Null until two days of reading exist. */
        total: number | null;
        /** "Sep 3" — the first day the count is known from, when it is inside the period. */
        sinceLabel: string | null;
    };
    latest: GoogleReviewVM[];
    /** "the five Google shows first" or "every review, from your Business Profile". */
    source: string;
    table: {
        columns: string[];
        rows: (string | number)[][];
    };
    /** Today's one line when a review is news, and where it leads. */
    todayLine: {
        text: string;
        to: string;
    } | null;
}
/** Whether a review is news: first seen recently, written recently, and after the first read. */
declare function reviewIsNew(r: Pick<GoogleReviewDto, "first_seen_at" | "published_at">, linkedAt: string, nowMs: number): boolean;
declare function toGoogleReviewVM(r: GoogleReviewDto, linkedAt: string, nowMs: number): GoogleReviewVM;
/**
 * What a period gained, from the day snapshots: the count on the last read
 * day less the count on the newest day before the period (or the first day
 * inside it, which is then named), and the same for the period before.
 */
declare function gainedOver(days: GoogleDayDto[], periodDays: number): {
    current: GoogleVM["gained"];
    previous: number | null;
};
declare function toGoogleVM(dto: GoogleDto, periodDays: number, nowMs?: number): GoogleVM;

declare const BILLING_MODES: readonly ["stripe", "direct"];
type BillingMode = (typeof BILLING_MODES)[number];
/** Stripe's subscription statuses, plus 'none' before one exists. */
declare const BILLING_STATUSES: readonly ["none", "incomplete", "incomplete_expired", "trialing", "active", "past_due", "canceled", "unpaid", "paused"];
type BillingStatus = (typeof BILLING_STATUSES)[number];
/** The trial a new workspace gets at Checkout, in days. */
declare const BILLING_TRIAL_DAYS = 14;
interface BillingAccountDto {
    mode: BillingMode;
    status: BillingStatus;
    price_id: string | null;
    current_period_end: string | null;
    trial_end: string | null;
    cancel_at: string | null;
    cancel_at_period_end: boolean;
    card_brand: string | null;
    card_last4: string | null;
    last_payment_failed_at: string | null;
    last_paid_at: string | null;
    updated_at: string;
}
/** The plan as Stripe states it: the amount is Stripe's, never a literal in this repo. */
interface BillingPriceDto {
    id: string;
    currency: string;
    unit_amount: number | null;
    interval: "day" | "week" | "month" | "year" | null;
    product_name: string | null;
}
interface BillingDto {
    /** Whether this deployment can charge at all: the key, the price and the webhook secret are on the edge. */
    ready: boolean;
    account: BillingAccountDto | null;
    price: BillingPriceDto | null;
    trial_days: number;
    role: string;
}
interface BillingInvoiceDto {
    id: string;
    number: string | null;
    status: string | null;
    amount_due: number;
    amount_paid: number;
    currency: string;
    created_at: string;
    hosted_url: string | null;
    pdf_url: string | null;
}
/**
 * ANSWERING and SPENDING are two questions, and this file used to answer only
 * the first — which is how a workspace that had never entered a card came to
 * be entitled to buy a phone number and file a carrier registration on
 * Chanlytics' account.
 *
 * Keep them apart and each can be tuned for what it actually risks:
 *
 *   receptionistOn   generous. Getting it wrong drops a live conversation,
 *                    which the customer feels immediately and we cannot undo.
 *   maySpend         strict. Getting it wrong costs real money on our account,
 *                    and the customer feels nothing at all.
 */
/** What Stripe's word means for the receptionist: on, or paused. incomplete is the minutes between Checkout and the first payment; never a pause. */
declare function receptionistOn(status: BillingStatus): boolean;
/**
 * May this workspace incur a cost on Chanlytics' own account?
 *
 * Buying a number is $1.15 a month for as long as it is held; a carrier
 * registration is $4.50 for the brand and $15.00 for the campaign, one time
 * and non-refundable. All of it lands on the platform's Twilio balance
 * whatever the workspace does next.
 *
 * `direct` is every workspace that predates Stripe. They are invoiced by hand
 * and are not asked for a card, so the question does not apply — the same
 * carve-out tenantStatusFor already makes.
 *
 * `none` and `incomplete` are deliberately ABSENT while receptionistOn admits
 * them. `none` is a workspace that has never entered a card; `incomplete` is
 * the minutes between Checkout opening and the first payment, which is exactly
 * the window an abandoned Checkout leaves behind. Both are fine reasons to keep
 * answering an existing conversation. Neither is a reason to spend.
 */
declare function maySpend(mode: BillingMode, status: BillingStatus): boolean;
/**
 * Why a workspace may not spend, in the owner's words, or null when it may.
 *
 * A refusal at the moment somebody is trying to give you money has to say what
 * to do about it, so this is a sentence and a destination rather than a code.
 */
declare function whyCannotSpend(mode: BillingMode, status: BillingStatus): string | null;
/** The switch the runtime reads, for a stripe-mode workspace. A direct one is never touched. */
declare function tenantStatusFor(mode: BillingMode, status: BillingStatus): "active" | "paused" | null;
/** The subscription as the webhook or a sync reads it, already flattened. */
interface SubscriptionFacts {
    id: string;
    status: BillingStatus;
    price_id: string | null;
    current_period_end: string | null;
    trial_end: string | null;
    cancel_at: string | null;
    cancel_at_period_end: boolean;
    card_brand: string | null;
    card_last4: string | null;
}
interface BillingBell {
    title: string;
    body: string;
}
interface BillingPlan {
    row: Partial<BillingAccountDto> & {
        stripe_subscription_id: string;
    };
    /** The tenant switch to write, when it changes; null when nothing changes or the workspace is direct. */
    tenantStatus: "active" | "paused" | null;
    /** True when the receptionist goes from on to paused, or back. */
    switched: "paused" | "resumed" | null;
    bell: BillingBell | null;
}
/**
 * What one subscription reading means for the row and the switch. The
 * status is copied verbatim; the switch follows receptionistOn; a bell
 * rings only when the receptionist's state changes, never on every update.
 */
declare function planBilling(before: {
    mode: BillingMode;
    status: BillingStatus;
    tenant_status: string;
}, sub: SubscriptionFacts, nowMs: number): BillingPlan;
declare function dayWords(iso: string | null | undefined): string;
/** "13 days left, until Sep 21" · "ends today" · "" */
/**
 * The offer, in the owner's words, for however many trial days there are.
 * Zero is a legitimate setting — no trial, charge today — and the sentence has
 * to stay true at zero rather than promising "the 0-day trial".
 */
declare function trialOffer(days: number, again?: boolean): string;
declare function trialWords(trialEnd: string | null | undefined, nowMs: number): string;
/** "$49.00 a month" from Stripe's own figures; "" when the price is not readable. */
declare function priceWords(p: BillingPriceDto | null | undefined): string;
interface BillingVM {
    mode: BillingMode;
    status: BillingStatus;
    /** One line for the pane's head and the Setup row. */
    headline: string;
    /** The sentence under it. */
    detail: string;
    /** A pill's tone. */
    tone: "ok" | "warn" | "danger" | "";
    /** The plan and its price, when Stripe states one. */
    plan: string;
    card: string | null;
    /** What an owner may do from here. */
    actions: {
        checkout: boolean;
        portal: boolean;
        resume: boolean;
    };
    paused: boolean;
}
declare function toBillingVM(dto: BillingDto, nowMs?: number): BillingVM;
/** The Setup row's facts: enough to say the state and the one next step. */
interface SetupBillingFacts {
    ready: boolean;
    mode: BillingMode;
    status: BillingStatus;
    trial_end: string | null;
    current_period_end: string | null;
    trial_days: number;
    /** Set when the subscription is cancelled ahead: it runs out on that day. */
    cancel_at?: string | null;
    cancel_at_period_end?: boolean;
}
/** The words the pages say for what came back from Stripe (the query the card reads once). */
declare const CHECKOUT_OUTCOME_WORDS: Record<string, string>;
/** "$49.00" from cents and a currency, as Stripe states them. */
declare function moneyWords(amountCents: number, currency: string): string;
/** The row as the pages read it, from whatever the database returned; a word the enum does not know reads as none. */
declare function billingAccountDto(r: {
    mode?: string | null;
    status?: string | null;
    price_id?: string | null;
    current_period_end?: string | null;
    trial_end?: string | null;
    cancel_at?: string | null;
    cancel_at_period_end?: boolean | null;
    card_brand?: string | null;
    card_last4?: string | null;
    last_payment_failed_at?: string | null;
    last_paid_at?: string | null;
    updated_at: string;
}): BillingAccountDto;
/**
 * What the phone receptionist is told when the workspace is paused: take a
 * message and promise a call back, nothing more. Replaces the business's
 * whole prompt for the call, so no price, no booking and no transfer can
 * come out of a line whose subscription stopped.
 */
declare function pausedVoiceFacts(businessName: string | null | undefined): string;

interface SetupDto {
    business: {
        name: string | null;
        hours: boolean;
        services: number;
        bookingLink: boolean;
        address: boolean;
        /** The number the phone receptionist warm-transfers to, E.164. */
        handoff: string | null;
        /** The config row exists but the parser refused it. */
        broken: boolean;
    };
    channels: {
        whatsapp: {
            present: boolean;
            active: boolean;
            number: string | null;
            quality: string | null;
            lastInboundAt: string | null;
        };
        voice: {
            present: boolean;
            active: boolean;
            number: string | null;
            lastInboundAt: string | null;
        };
    };
    templates: {
        approved: number;
        pending: number;
        startersApproved: number;
    };
    calendar: {
        state: "ok" | "unavailable" | "none";
    };
    team: {
        members: number;
        invitesOpen: number;
        alertEmails: number;
    };
    consent: {
        yes: number;
    };
    /**
     * Facts that disagree with what the platform knows (contracts/facts.ts).
     *
     * The checklist called Business facts "ready" on a workspace whose
     * receptionist was publishing the number it transfers to instead of the line
     * it answers -- because "ready" only ever meant "the fields are filled in",
     * and nothing compared a filled-in field to anything. A checklist that says
     * ready while a customer-facing fact is wrong is worse than no checklist.
     */
    conflicts?: FactConflict[];
    /** What the owner has asked a person at Chanlytics for, and when. */
    requests: {
        line: string | null;
    };
    /** The workspace's own lines, and whether this deployment can get one. */
    lines?: {
        rows: LineDto[];
        ready: boolean;
        provider: string | null;
        costs: {
            local_number_month_usd: number;
        };
    };
    /** The business on Google: whether it can be found here, and the listing once it is. */
    google?: SetupGoogleFacts;
    /** How the workspace pays, when it pays by card and this deployment can charge. */
    billing?: SetupBillingFacts;
}
/** A line as the page may see it — states in words, never a provider id. */
interface LineDto {
    id: string;
    e164: string | null;
    kind: string;
    provider: string;
    area_code: number | null;
    voice_state: "none" | "provisioning" | "answering" | "failed";
    sms_state: string;
    /** Where a carrier registration stopped, when one did. */
    reg_step?: string | null;
    /** Filed against Twilio's free test registry rather than the carriers. */
    reg_mock?: boolean;
    /**
     * The registration on this line is the sole-proprietor one: one number, one
     * campaign, about one message a second. A fact about the FILING, so it is
     * read from the row and never re-derived from the business record, which can
     * change after the brand is registered.
     */
    reg_sole_prop?: boolean;
    /** Both the brand and the campaign are on record. */
    registered?: boolean;
    whatsapp_state: string;
    port_state: string;
    forwarding_state: string;
    step: string | null;
    last_error: string | null;
    state_since: string;
    created_at: string;
    /** A forwarded line's facts, in words: the carrier, the mode, where the calls go, the test window. */
    forwarding?: {
        carrier: string;
        mode: string;
        destination_e164: string | null;
        test_from: string | null;
        test_until: string | null;
        verified_at: string | null;
    } | null;
}
/** The saga's step, in the owner's words — the row, the bell and the platform email say the same thing. */
declare const LINE_STEP_WORDS: Record<string, string>;
interface SetupInputs extends SetupDto {
    /** Row ids marked Later on this device. */
    later: string[];
}
type SetupState = "not_started" | "waiting_you" | "waiting_them" | "ready";
declare const SETUP_STATE_WORDS: Record<SetupState, string>;
/** A verb whose `to` starts with "verb:" is an action the page performs; "tel:" dials; anything else is a route. */
interface SetupVerb {
    label: string;
    to: string;
}
interface SetupRowVM {
    id: string;
    icon: string;
    title: string;
    state: SetupState;
    /** The state in words; "Waiting on Meta" when Meta is the one waited on. */
    stateWords: string;
    sentence: string;
    details: string[];
    verb: SetupVerb | null;
    /** Counts toward "answering"; cannot be put off for later. */
    required: boolean;
    later: boolean;
}
interface SetupVM {
    rows: SetupRowVM[];
    readiness: {
        answering: boolean;
        sentence: string;
    };
    /** The first open row's verb, in dependency order. */
    next: {
        label: string;
        to: string;
        row: string;
        title: string;
    } | null;
    done: number;
    total: number;
    /** Today's one line while something is open: "Setup · 3 of 8 · Calendar: paste the feed". */
    line: string | null;
    /** The numbers to try, once the receptionist answers somewhere. */
    tryIt: {
        voice: string | null;
        voiceLabel: string | null;
        whatsapp: string | null;
        whatsappLabel: string | null;
    } | null;
}
/**
 * What this line's texting actually IS, in the owner's words.
 *
 * Every one of these sentences used to be the same sentence -- "Texting is not
 * available yet" -- said whatever the line's registration had done, because
 * nothing here read sms_state. That was honest while no line could text and a
 * lie in both directions afterwards: a line the carriers had approved still
 * read "not available", and a line filed against Twilio's MOCK registry -- free,
 * routes nothing, gone in thirty days -- read exactly like one that was real.
 *
 * The mock case is named out loud because it is the one that looks finished
 * from every angle: the console shows four green ticks, the brand says
 * Approved, and not one message would ever be delivered.
 */
/**
 * The one sentence a rehearsal filing gets, wherever an owner meets it: the
 * Setup row, the Integrations texting row, and the refusal the register route
 * answers with. Three surfaces said three different things about one state
 * before this -- and one of them ("the carriers did not answer") was not even
 * about the state it was describing.
 */
/**
 * The ceiling a working sole-proprietor line lives under, in one clause that
 * reads correctly after any sentence.
 *
 * It quotes SOLE_PROP_LIMITS rather than repeating its numbers, so what is said
 * to a working line and what was said before the owner committed to that
 * registration cannot drift apart.
 */
declare const SOLE_PROP_CEILING_SENTENCE: string;
/** Setup's version: the good news, then the ceiling. */
declare const SOLE_PROP_TEXTING_SENTENCE: string;
declare const MOCK_TEXTING_SENTENCE = "Texting is filed against a test registry, so nothing is delivered \u2014 a person at Chanlytics is filing it with the carriers for real.";
/**
 * Takes only the three fields it reads. The back office renders the same
 * sentence for another workspace's line, and it has the registration facts
 * without the rest of a LineDto -- a synthetic one filled with plausible
 * blanks would be a second answer waiting to drift from this one.
 */
declare function textingWords(l: Pick<LineDto, "sms_state" | "reg_mock" | "reg_sole_prop"> | null | undefined): {
    sentence: string;
    done: boolean;
};
declare function setupSteps(i: SetupInputs, nowMs?: number): SetupVM;
/** The hash route without "#/": "#/admin/setup" → "admin/setup"; nothing → "today". */
declare function setupRoute(hash: string): string;
/**
 * Whether this arrival lands on Setup: an owner, a receptionist that answers
 * nowhere yet, a plain arrival (Today or nothing), and not already sent
 * there this session. Everyone else gets Today.
 */
declare function shouldLandOnSetup(role: string | null | undefined, answering: boolean, route: string, landed: boolean): boolean;

type Carrier = "verizon" | "att" | "tmobile" | "other";
type ForwardingMode = "unanswered" | "always";
declare const CARRIERS: readonly Carrier[];
declare const FORWARDING_MODES: readonly ForwardingMode[];
declare const CARRIER_WORDS: Record<Carrier, string>;
declare const MODE_WORDS: Record<ForwardingMode, string>;
/** How long a test window stays open once the owner presses Test it. */
declare const FORWARDING_TEST_WINDOW_MS: number;
interface ForwardingCode {
    /** As dialed. */
    code: string;
    /** A tel: link a phone can dial: + and # escaped, * kept. */
    tel: string;
}
interface ForwardingCodes {
    on: ForwardingCode;
    off: ForwardingCode;
    /** What the owner should know, in order: how to dial, what can break it. */
    notes: string[];
}
declare function telHref(code: string): string;
declare function forwardingCodes(carrier: Carrier, mode: ForwardingMode, destinationE164: string): ForwardingCodes;
/** What the page and the webhook read off a forwarded line's facts. */
interface ForwardingFacts {
    carrier?: string | null;
    mode?: string | null;
    destination_e164?: string | null;
    test_from?: string | null;
    test_started_at?: string | null;
    test_until?: string | null;
    verified_at?: string | null;
}
declare const isCarrier: (v: unknown) => v is Carrier;
declare const isForwardingMode: (v: unknown) => v is ForwardingMode;
/**
 * The verification rule: an inbound call that started inside the test
 * window, on the receptionist's line, from the phone the owner said they
 * would call from when they said one. A minute of clock slack at the start:
 * the owner's phone and ours do not agree to the second.
 */
declare function forwardingMatch(facts: ForwardingFacts, call: {
    fromE164: string | null;
    toE164: string | null;
    startedAtIso: string | null;
}, nowMs?: number): boolean;
/** Whether a test window is open at `nowMs`. */
declare function forwardingTestOpen(facts: ForwardingFacts, nowMs?: number): boolean;

/**
 * Who a person is, in words.
 *
 * The rule the sidebar has kept since it stopped wearing a mockup persona: a
 * name is what the person gave, never something invented from an email.
 * "hi@chanlytics.agency" is not "Hi". With no name, the account is "Your
 * account" and a member is their email, and both read as exactly what they
 * are.
 */
interface IdentityInput {
    email: string | null;
    display_name?: string | null;
    role?: string | null;
}
interface IdentityWords {
    /** The name given, else "Your account". */
    name: string;
    email: string;
    /** Two letters from the name, one from the email, "?" from nothing. */
    initials: string;
    /** Owner · Operator · Viewer, or "" when unknown. */
    role: string;
    /** Whether a name was given. */
    named: boolean;
}
declare const ROLE_WORDS: Record<string, string>;
/** Initials for a person: from the name they gave (the contacts' rule), else one letter from the email, else "?". */
declare function personInitials(name: string | null | undefined, email: string | null | undefined): string;
declare function identityWords(me: IdentityInput | null | undefined): IdentityWords;
/**
 * A member as a roster shows them: the name they gave with the email under
 * it, or the email alone — never the email's local part dressed as a name.
 */
declare function memberWords(m: {
    email: string | null;
    display_name?: string | null;
}): {
    name: string;
    sub: string | null;
};
declare const DISPLAY_NAME_MAX = 80;
/** What a name may be before it is sent: trimmed, at most 80 characters. Empty clears it. */
declare function cleanDisplayName(raw: unknown): {
    ok: true;
    name: string;
} | {
    ok: false;
    reason: string;
};

/**
 * The workspace itself, in words.
 *
 * One field so far, and it is the one that decides what "today" means.
 * tenants.timezone has defaulted to America/New_York since 00001 with no write
 * path in the product, so every workspace on the database is still on it —
 * which for a business anywhere else means its own receptionist quotes the
 * wrong opening hours, its day rolls over at the wrong time in Reports, and
 * nothing on any screen says why.
 *
 * The rule here is that an owner should be able to CHECK the setting without
 * knowing what an IANA zone is. "America/New_York" tells them nothing;
 * "New York · 3:42 PM there now" tells them immediately whether it is right.
 */
/** The house fallback, and the value every workspace still carries. */
declare const DEFAULT_TIMEZONE = "America/New_York";
/**
 * Is this a zone this machine can actually resolve?
 *
 * Intl is the only authority — a list checked into the repo goes stale every
 * time the IANA database moves a city, and Postgres cannot answer from a CHECK
 * constraint because pg_timezone_names is a set-returning function and not
 * immutable. So the database stores text and this is the gate in front of it.
 */
declare function isTimezone(raw: unknown): raw is string;
declare function cleanTimezone(raw: unknown): {
    ok: true;
    tz: string;
} | {
    ok: false;
    reason: string;
};
/** "New York" from "America/New_York" — the part a person recognises. */
declare function timezoneCity(tz: string): string;
/**
 * What to show beside the zone so an owner can tell at a glance whether it is
 * theirs: the local time in it, right now.
 */
declare function timezoneWords(tz: string | null | undefined, nowMs?: number): {
    city: string;
    zone: string;
    /** Local time in that zone, or null when the zone cannot be resolved. */
    timeThere: string | null;
    /** The one-line summary the settings row shows. */
    line: string;
};
/**
 * Every zone this machine knows, for the picker.
 *
 * supportedValuesOf is the modern answer and needs no list in the repo; where
 * it is missing, the browser's own zone plus the default is still a real
 * choice rather than an empty menu.
 */
declare function knownTimezones(): string[];
/**
 * The device's zone, when it is one this machine can resolve.
 *
 * Narrows signup.ts's deviceTimezone rather than redefining it: signup hands
 * the raw string to workspace creation and lets the database default it, while
 * a picker needs a value it can pre-select, so the two answers differ by
 * exactly this check.
 */
declare function usableDeviceTimezone(resolve?: () => string | undefined): string | null;

/**
 * The chrome's own words and rules: the theme, the sidebar's two states, the
 * workspace hotkeys, the one status line the shell owes the person, and the
 * shortcuts sheet. Pure, so the sidebar, the shell and a test read the same
 * thing.
 */
type ThemePref = "light" | "dark" | "system";
type Theme = "light" | "dark";
declare const THEME_OPTIONS: ReadonlyArray<{
    id: ThemePref;
    label: string;
    icon: string;
}>;
declare const isThemePref: (v: unknown) => v is ThemePref;
/** What the page paints: a chosen theme, or the device's when the choice is "system". */
declare function resolveTheme(pref: unknown, systemDark: boolean): Theme;
type SidebarPref = "open" | "rail";
declare const isSidebarPref: (v: unknown) => v is SidebarPref;
/** ⌘1 … ⌘9 for the first nine workspaces; none beyond. */
declare function workspaceHotkey(index: number): string | null;
/** Whether a key press belongs to a field the person is typing in. */
declare function isTypingTarget(tagName: string | null | undefined, contentEditable: boolean): boolean;
/** What the shell knows that the page does not: a newer build, surfaces that stopped refreshing. */
interface ShellStatus {
    stale: boolean;
    degraded: string[];
    /** The workspace is paused (billing stopped): nothing is answered until Billing resumes it. */
    paused?: boolean;
}
/** The one line the sidebar's foot shows, or nothing. A pause outranks everything: nothing is answered until Billing resumes it. Then a new build outranks stale surfaces: refreshing fixes both. */
declare function shellStatusLine(s: ShellStatus | null | undefined): {
    text: string;
    action: "reload" | "billing" | null;
} | null;
interface Shortcut {
    group: string;
    keys: string[];
    does: string;
}
/** Every shortcut the app answers to, in the order the sheet lists them. */
declare const SHORTCUTS: readonly Shortcut[];
/** The sheet's groups, in order, each with its shortcuts. */
declare function shortcutGroups(list?: readonly Shortcut[]): Array<{
    group: string;
    items: Shortcut[];
}>;

/**
 * Connections — everything a workspace can be joined to, as one row shape.
 *
 * The Integrations page used to be three hand-built cards and a paragraph
 * of names "not yet". Every connection is the same question asked of the
 * same facts: can this deployment do it at all, where does this workspace
 * stand with it, what is the one sentence, what is the one verb, since
 * when. So every connection is one row, and "later" is a state a row can
 * be in rather than a list at the bottom. Setup says what to do next;
 * this says what is joined. Both derive from the same facts and cannot
 * disagree. Pure: the page feeds it window globals, the tests fixtures.
 */

type ConnectionKind = "whatsapp" | "phone" | "sms" | "google_listing" | "google_profile" | "calendar" | "instagram" | "email" | "deposits";
declare const CONNECTION_KINDS: readonly ConnectionKind[];
/** Where the row sits: joined, joinable from here, or not built yet. */
type ConnectionGroup = "connected" | "available" | "later";
/** Where this workspace stands with it. `attention` is joined but not working. */
type ConnectionState = "connected" | "attention" | "off" | "waiting_you" | "waiting_them" | "none" | "later";
type ConnectionTone = "ok" | "warn" | "accent" | "muted";
/** Who may press the verb: an owner (team-level), or anyone who may approve (operators and owners). */
type ConnectionWho = "owner" | "operator";
interface ConnectionVerb {
    label: string;
    /** A route ("admin/setup", "messages") or a `verb:` id the page runs. */
    to: string;
    who: ConnectionWho;
}
interface ConnectionRow {
    kind: ConnectionKind;
    icon: string;
    title: string;
    /** The number, the account, the listing's address — what makes this row this workspace's. */
    detail: string | null;
    group: ConnectionGroup;
    state: ConnectionState;
    stateWords: string;
    tone: ConnectionTone;
    /** One line, in the owner's words, with "since" on every wait. */
    sentence: string;
    verb: ConnectionVerb | null;
    /** The page's own hook for the parts a row cannot say in one line: a choice of locations, a form. */
    body: "google_choose" | "business_record" | null;
}
interface ConnectionInputs {
    /** The rows of tenant_channels as the page already shows them. */
    channels: ChannelVM[];
    /** Meta's Embedded Signup: whether this deployment can start it. `undefined` = still asking. */
    whatsapp: {
        ready: boolean;
        reason: string | null;
    } | null | undefined;
    lines: {
        rows: LineDto[];
        ready: boolean;
    };
    /** When the owner asked a person at Chanlytics for a line; null = never. */
    lineRequestedAt: string | null;
    google: {
        ready: {
            places: boolean;
            profile: boolean;
            audience?: GoogleAudience | null;
        };
        listing: GoogleListingDto | null;
        connection: GoogleConnectionDto | null;
    } | null;
    calendar: {
        state: "ok" | "unavailable" | "none";
    } | null;
}
type Draft = Omit<ConnectionRow, "group" | "tone" | "body"> & {
    body?: ConnectionRow["body"];
};
/** What Google's audience means for the person about to press Connect. */
declare function googleAudienceWords(a: GoogleAudience | null | undefined): string | null;
/** The texting states of a line, in the owner's words. The carriers' vocabulary stays out. */
declare function smsStateRow(line: LineDto | null, nowMs: number): Draft;
declare function connectionRows(i: ConnectionInputs, nowMs?: number): ConnectionRow[];
declare const CONNECTION_GROUP_WORDS: Record<ConnectionGroup, {
    title: string;
    sub: (rows: ConnectionRow[]) => string;
}>;

/** One workspace as `platform_overview()` returns it. Every field is a fact something else already recorded. */
interface PlatformTenantDto {
    tenant_id: string;
    slug: string;
    name: string;
    status: string;
    timezone: string;
    created_at: string;
    members: number;
    billing_mode: string | null;
    billing_status: string | null;
    trial_end: string | null;
    current_period_end: string | null;
    line_e164: string | null;
    line_kind: string | null;
    voice_state: string | null;
    sms_state: string | null;
    reg_step: string | null;
    reg_mock: boolean | null;
    reg_sole_prop: boolean | null;
    line_error: string | null;
    whatsapp_number: string | null;
    whatsapp_active: boolean | null;
    voice_number: string | null;
    voice_active: boolean | null;
    last_inbound_at: string | null;
}
/**
 * What is up with a workspace, as one word — and each word is a different
 * NEXT ACTION, which is the only reason to have more than two.
 *
 *   broken         something failed and a person at Chanlytics owns it
 *   billing        money needs attention and the receptionist is at risk
 *   rehearsal      texting is filed against the test registry: it looks
 *                  registered, delivers nothing, and expires in thirty days
 *   stalled        set up long enough ago that nothing answering is a problem
 *   waiting_owner  the next move is theirs, and they may not know it
 *   quiet          answering, and nobody has reached them in a fortnight
 *   new            too young for any of the above to mean anything
 *   live           answering, and heard from
 *   paused         the workspace itself is paused
 *   test           not a customer
 */
type PlatformVerdict = "broken" | "billing" | "rehearsal" | "stalled" | "waiting_owner" | "quiet" | "new" | "live" | "paused" | "test";
interface PlatformVerdictWords {
    label: string;
    tone: "ok" | "warn" | "danger" | "accent" | "muted";
    /** Higher sorts first: the page is worked from the top down. */
    rank: number;
}
declare const PLATFORM_VERDICTS: Record<PlatformVerdict, PlatformVerdictWords>;
interface PlatformRowVM {
    tenantId: string;
    slug: string;
    name: string;
    verdict: PlatformVerdict;
    /** What to do about it, or why there is nothing to do. One line, always. */
    sentence: string;
    /** The four facts that answer most questions, each already in words. */
    facts: {
        paying: string;
        answering: string;
        texting: string;
        heard: string;
    };
    /** How long they have been a workspace. */
    age: string;
    members: number;
}
/** Younger than this and "nothing is set up" is not yet a fact about anything. */
declare const PLATFORM_NEW_DAYS = 1;
/** Answering, but nobody has reached them: long enough to be worth a call, short enough to still matter. */
declare const PLATFORM_QUIET_DAYS = 14;
/**
 * Every workspace, judged and sorted: the ones needing a person first, and
 * inside a verdict the one waiting longest first.
 *
 * Pure. The route hands it the RPC's rows and the page renders what comes back
 * — no interpretation on either side, so what support sees can be tested.
 */
declare function platformRows(rows: readonly PlatformTenantDto[], nowMs?: number): PlatformRowVM[];
/** The one line at the top: what the whole platform looks like right now. */
declare function platformSummary(rows: readonly PlatformRowVM[]): {
    total: number;
    needsUs: number;
    needsThem: number;
    live: number;
    sentence: string;
};
/** A number as the back office shows it, or a dash. Support reads these aloud on calls. */
declare function platformNumber(e164: string | null | undefined): string;
type PlatformLineAction = "retry" | "refile" | "release";
interface PlatformLineActionVM {
    action: PlatformLineAction;
    label: string;
    /** What it does, in one line. */
    sentence: string;
    /** What it spends, or null when it spends nothing. Said FIRST in any confirmation. */
    cost: string | null;
    /** Cannot be undone. */
    permanent: boolean;
}
/**
 * The actions this line can actually take right now.
 *
 * An action that would be refused is not offered: the edge answers 409 for a
 * retry on a line that is not failed, and for a refile on a filing that stands.
 * Showing a button that is going to be refused teaches somebody to ignore
 * buttons.
 */
declare function platformLineActions(l: Pick<LineDto, "e164" | "voice_state" | "sms_state" | "reg_mock">): PlatformLineActionVM[];
/** The one line a confirmation leads with: what it costs, then whether it can be undone. */
declare function platformActionWarning(a: PlatformLineActionVM): string;

interface ConsentPageFacts {
    businessName: string;
    /** The WhatsApp number customers already write to, E.164; null when there is none. */
    whatsappE164: string | null;
    /** The line that receives texts, E.164; null until one is approved for texting. */
    smsE164: string | null;
}
type ConsentWayKind = "whatsapp" | "sms";
interface ConsentWay {
    kind: ConsentWayKind;
    title: string;
    /** What the customer does, in their words. */
    sentence: string;
    /** The phrase they send. */
    phrase: string;
    /** Where the button goes; null for a way with nothing to tap (a number to text by hand). */
    href: string | null;
    /** The number, as a person reads it. */
    display: string | null;
}
/**
 * One of the two questions, with its own ways to answer and its own disclosures.
 *
 * They are separate objects rather than a flag on one, because that separation
 * is the thing the carriers are asking to see: a reader must be able to give one
 * and not the other without hunting for how.
 */
interface ConsentAsk {
    purpose: SendPurpose;
    title: string;
    /** What this yes is for, in one line. */
    lead: string;
    /** Said only on the optional one: that it is optional, and that nothing depends on it. */
    optional: string | null;
    ways: ConsentWay[];
    /** What the carriers require stated beside THIS ask. */
    terms: string[];
}
interface ConsentPageVM {
    title: string;
    /** One line under the title: what this page is. */
    lead: string;
    /** The transactional ask first, then the promotional one. */
    asks: ConsentAsk[];
    /** The link the QR encodes — the OFFERS one, since that is what a QR at the desk is for; null when there is nothing to encode. */
    qrLink: string | null;
    /** What is true of both asks, said once at the foot. */
    terms: string[];
    /** True when this workspace has no way to say yes yet: the page says so rather than pretending. */
    empty: boolean;
}
/** The words the customer sends, so a page, a QR and a carrier filing can never disagree about them. */
declare const CONSENT_PHRASE: "YES OFFERS";
declare const CONSENT_PHRASE_ES: "SI OFERTAS";
/**
 * The word for the OTHER yes.
 *
 * START is the carriers' own standard opt-in keyword, already declared to them
 * in the campaign's opt-in keywords and already honoured by the receptionist. A
 * bare "yes" is deliberately not used: that is how a person answers an ordinary
 * question, and reading it as consent is the mistake this whole change exists to
 * undo.
 */
declare const CONVERSATION_PHRASE = "START";
declare function consentPageVM(f: ConsentPageFacts): ConsentPageVM;

/**
 * The clauses every carrier review looks for, word for word.
 *
 * Identical wherever they appear — this page and Chanlytics' own privacy policy
 * both render them from here, because two copies of a compliance sentence is one
 * copy that will be edited and one that will not. The mobile-information clause
 * in particular is checked almost verbatim by reviewers and by CTIA's own
 * guidance, and "standard rates" is refused because it implies premium-rate
 * messaging, which no longer exists in the US.
 */
declare const SMS_CLAUSES: readonly string[];
/** The lead sentence, which is the only part that names who is sending. */
declare function smsConsentSentence(businessName: string): string;
interface BusinessPageFacts {
    /** From `business_records`, which the carriers vetted when the brand was registered. */
    legalName: string;
    tradeName: string | null;
    street: string;
    streetSecondary: string | null;
    city: string;
    region: string;
    postalCode: string;
    country: string;
    contactEmail: string;
    /** The line customers reach them on, E.164; null before there is one. */
    publicPhoneE164: string | null;
    /** Their own website, when they have one. The page links to it rather than replacing it. */
    websiteUrl: string | null;
    /** What they do, from the receptionist's own profile. */
    services: readonly {
        name: string;
        durationMin?: number | null;
        priceNote?: string | null;
    }[];
    /** Where a customer says yes: `/yes/<slug>`. */
    optInUrl: string;
}
interface BusinessPageVM {
    /** The trading name if there is one, because that is what customers call them. */
    title: string;
    /** One line: who this is and why the page exists. */
    lead: string;
    /** The four facts a reviewer scans for, as label/value pairs. */
    identity: {
        label: string;
        value: string;
        href?: string;
    }[];
    services: {
        name: string;
        detail: string | null;
    }[];
    smsLead: string;
    smsClauses: readonly string[];
    optInUrl: string;
    /** Their own site, when they gave one. */
    websiteUrl: string | null;
    /** True when the record is too thin to publish honestly. */
    empty: boolean;
}
declare function businessPageVM(f: BusinessPageFacts): BusinessPageVM;
interface PreflightFacts {
    /** The name the CAMPAIGN will state — `tenants.name`, which is not the record's name. */
    workspaceName: string;
    /** The names on the record, which is what the BRAND is registered as. */
    legalName: string;
    tradeName: string | null;
    /** Enough of an address to identify a business on the hosted page. */
    street: string;
    city: string;
    /** Their own site, when they gave one. */
    websiteUrl: string | null;
    /** Whether a customer has any way to say yes: a number the opt-in page can name. */
    hasOptInNumber: boolean;
}
interface PreflightProblem {
    id: "name_mismatch" | "no_identity" | "no_opt_in_number" | "website_unusable";
    /** What a reviewer will see, in the owner's words. */
    what: string;
    /** What to do about it. */
    fix: string;
}
declare function registrationPreflight(f: PreflightFacts): PreflightProblem[];

/**
 * The carriers' vocabulary: the closed lists Twilio keeps for a business
 * registration, and the coercions that keep a value it would refuse from
 * ever reaching it.
 *
 * They live here, with the rest of the product's words, rather than beside
 * the provider calls: the form offers them, the endpoint checks against
 * them, and `packages/channels` sends them. One list, three readers.
 *
 * Read from Twilio's documentation on 2026-09-08. A value outside a list is
 * refused at the evaluation — after the profile, the business, the person,
 * the address and the document have all been made — so nothing guesses.
 */
/** What a business does. */
declare const BUSINESS_INDUSTRIES: readonly ["AGRICULTURE", "AUTOMOTIVE", "BANKING", "CONSTRUCTION", "CONSUMER", "EDUCATION", "ELECTRONICS", "ENERGY", "ENGINEERING", "FAST_MOVING_CONSUMER_GOODS", "FINANCIAL", "FINTECH", "FOOD_AND_BEVERAGE", "GOVERNMENT", "HEALTHCARE", "HOSPITALITY", "INSURANCE", "JEWELRY", "LEGAL", "MANUFACTURING", "MEDIA", "NOT_FOR_PROFIT", "OIL_AND_GAS", "ONLINE", "PROFESSIONAL_SERVICES", "RAW_MATERIALS", "REAL_ESTATE", "RELIGION", "RETAIL", "TECHNOLOGY", "TELECOMMUNICATIONS", "TRANSPORTATION", "TRAVEL"];
type BusinessIndustry = (typeof BUSINESS_INDUSTRIES)[number];
/** What a small local business is, unless it says otherwise. */
declare const DEFAULT_INDUSTRY: BusinessIndustry;
/** Its legal form. Told to the carriers in its name, so it is asked and never inferred. */
declare const BUSINESS_TYPES: readonly ["Co-operative", "Corporation", "Limited Liability Corporation", "Non-profit Corporation", "Partnership"];
type BusinessType = (typeof BUSINESS_TYPES)[number];
declare const DEFAULT_BUSINESS_TYPE: BusinessType;
/** Who owns it. */
declare const COMPANY_TYPES: readonly ["government", "non-profit", "private", "public"];
type CompanyType = (typeof COMPANY_TYPES)[number];
declare const DEFAULT_COMPANY_TYPE: CompanyType;
/** The value Twilio will accept, or the default — never a guess it refuses. */
declare function industryOf(v: string | null | undefined): BusinessIndustry;
declare function businessTypeOf(v: string | null | undefined): BusinessType;
declare function companyTypeOf(v: string | null | undefined): CompanyType;
/** The words for a value, where the carriers' spelling is not the owner's. */
declare function industryWords(v: string): string;

/**
 * Which registration a business is on, and what that path costs it.
 *
 * THE DEFECT THIS EXISTS FOR. The business-record form asked for a tax ID and
 * marked it required, because the only registration this product filed was the
 * one that needs one. A business without an EIN — a solo barber, a chair
 * renter, a one-person moving company — filled in fourteen fields and was
 * stopped at the fifteenth by a hint saying the other registration was not
 * offered yet. They are customers, and the carriers have a path for them.
 *
 * So the question is asked FIRST and the answer picks the path. Which puts a
 * fork in three places at once — which fields are asked, what counts as
 * complete, and which bundle is filed — and a fork in three places is three
 * places to disagree. This file is the one place: the two paths, how to tell
 * which one a record is on, what the narrow one gives up, and the words for
 * all of it.
 *
 * WHY IT IS NOT A COLUMN. A saved record needs no `path` field, because the
 * answer is already in it: a record with a tax ID is on the standard path, one
 * without is a sole proprietor. That reads back exactly — but only because the
 * writers keep an invariant. A standard record cannot be SAVED without its tax
 * id (`businessRecordProblems`), and a sole-proprietor record is never saved
 * WITH one (`businessRecordForPath`), so a stored record with no tax id is
 * never a standard record with a blank field.
 *
 * The one thing genuinely not derivable is an unanswered form. An empty tax id
 * box means "no EIN" or "not typed yet", the two lead to different
 * registrations, and one of them cannot be undone. So `registrationPathOf`
 * answers null for a record that is not on file yet, and the form asks instead
 * of guessing.
 */
/** The two registrations the carriers run. Nothing outside this product says these words to a customer. */
type RegistrationPath = "standard" | "sole_proprietor";
declare const REGISTRATION_PATHS: readonly RegistrationPath[];
/**
 * The path a record on file is already on, or null when there is nothing on
 * file and nobody has answered.
 *
 * Null is a third state, not a failure: it is the difference between "this
 * business has no tax id" and "we have not asked yet", and rendering a form
 * before knowing which would either demand an EIN of somebody who has none or
 * quietly file the narrow, permanent registration for somebody who does not
 * need it.
 */
declare function registrationPathOf(saved: {
    ein?: string | null;
} | null | undefined): RegistrationPath | null;
/**
 * What the carriers allow a sole-proprietor registration, as numbers.
 *
 * TCR's own limits, not ours, and not negotiable by us. The three "ever"
 * counts are kept by TCR across EVERY vendor — a business that tried this with
 * another provider has already spent some — so nothing here can check them,
 * which is why they are said out loud in `soleProprietorLimits()` instead.
 */
declare const SOLE_PROP_LIMITS: {
    readonly campaignsPerBrand: 1;
    readonly numbersPerCampaign: 1;
    readonly messagesPerSecond: 1;
    readonly perDayTMobile: 1000;
    readonly perMinuteAtt: 15;
    readonly mobileUsesEver: 3;
    readonly emailUsesEver: 10;
    readonly addressUsesEver: 10;
};
/**
 * What a sole proprietor is agreeing to, before they agree to it.
 *
 * Every number is SOLE_PROP_LIMITS, read once. Said BEFORE the button rather
 * than after, because a registered brand cannot be withdrawn — the carriers
 * answer 405 to a delete, which this codebase found out by trying — so the
 * moment to hear "about one message a second" is while it is still a choice.
 */
declare function soleProprietorLimits(): readonly string[];
/** The fork, as the owner is asked it. */
declare const REGISTRATION_QUESTION: {
    readonly title: "Does the business have a tax ID?";
    readonly sub: "It decides which registration the carriers run, and the two are not the same. Asked once.";
    /** Said under the answers, because the narrow path is a real cost and the choice is permanent. */
    readonly nudge: "If there is an EIN, use it — none of the limits below apply to that registration.";
};
interface RegistrationPathWords {
    /** The answer, in the owner's words. */
    choice: string;
    /** What that answer means, in one line. */
    sub: string;
    /** How the filed registration is described once the answer is given. */
    filed: string;
}
declare const REGISTRATION_PATH_WORDS: Record<RegistrationPath, RegistrationPathWords>;
/**
 * What filing costs, per path.
 *
 * The standard figure is the one on a real invoice: $4.50 for the brand and
 * $15 for campaign vetting, read off this account's own usage records. There
 * is no verified sole-proprietor figure yet because no sole-proprietor filing
 * has happened here — so that path says the shape of the cost and not a number
 * nobody has been billed. Put the number in the moment the first invoice shows
 * it; do not put a guess in before then.
 */
declare const REGISTRATION_COST_WORDS: Record<RegistrationPath, string>;

interface BusinessRecordDto {
    legal_name: string;
    trade_name: string | null;
    ein: string | null;
    street: string;
    street_secondary: string | null;
    city: string;
    region: string;
    postal_code: string;
    country: string;
    website_url: string;
    industry: string;
    business_type: string;
    company_type: string;
    contact_first_name: string;
    contact_last_name: string;
    contact_email: string;
    contact_phone: string;
    contact_title: string;
    contact_job_position: string;
    updated_at?: string;
}
interface BusinessFieldVM {
    /** The column, which is also the form's field name. */
    name: keyof BusinessRecordDto;
    /** What the owner is asked, in their words. */
    label: string;
    /** Why the carriers want it, when that is not obvious. */
    hint?: string;
    /** A closed list, when the carriers keep one. */
    options?: readonly string[];
    required: boolean;
    /** Placeholder text, shown empty. */
    placeholder?: string;
    /** Which part of the form it belongs to. */
    group: "business" | "address" | "contact";
}
/**
 * The fields this path asks for, in the order it asks them.
 *
 * Built once per path and handed back by reference, so a form that calls this
 * every render is not rebuilding seventeen objects a keystroke.
 */
declare function businessFieldsFor(path: RegistrationPath): readonly BusinessFieldVM[];
/** The headings over each part of the form. A sole proprietor has no tax filing, so the standard headings would be lying. */
declare function businessGroupWordsFor(path: RegistrationPath): Record<BusinessFieldVM["group"], {
    title: string;
    sub: string;
}>;
/** An empty record, with the defaults the carriers accept already chosen. */
declare function emptyBusinessRecord(o?: {
    websiteUrl?: string;
    email?: string;
}): BusinessRecordDto;
/** Facts a record cannot check about itself. Optional: a check with nothing to check against is skipped, never guessed. */
interface RecordCheckFacts {
    /**
     * The numbers this workspace was given BY US.
     *
     * A sole proprietor's mobile may not be one of them: the carriers refuse a
     * CPaaS number as the handset they text a code to, and it is the mistake a
     * business makes without noticing, because it is the number on their own
     * website. Checkable, so checked here rather than discovered after the fee.
     */
    ourNumbers?: readonly string[];
}
/**
 * What is still wrong, by field, in the owner's words. Empty means it can be filed.
 *
 * `path` is required and has no default on purpose. The whole class of bug this
 * replaced was one validator answering for two registrations: with a default,
 * the caller that forgot to pass it would quietly validate a business as a sole
 * proprietor — which is the narrow, permanent registration — and say nothing
 * was missing.
 */
declare function businessRecordProblems(r: Partial<BusinessRecordDto>, path: RegistrationPath, facts?: RecordCheckFacts): Partial<Record<keyof BusinessRecordDto, string>>;
/**
 * The record as this path files it.
 *
 * One field today, and the reason it is a function rather than a line at the
 * call site is that there are three writers. A sole-proprietor record must be
 * stored with NO tax id, or `registrationPathOf` reads it back as a standard
 * record later and the whole derivation stops being exact. The legal form and
 * ownership columns are left at their defaults rather than blanked: they are
 * not null, nothing on this path sends them, and a default is not a claim.
 */
declare function businessRecordForPath<T extends Partial<BusinessRecordDto>>(r: T, path: RegistrationPath): T;
/** What the pane says about the record as it stands. */
declare function businessRecordLine(r: BusinessRecordDto | null): string;

/**
 * Sign-up, the pure half: what the form may send, the sentences the page
 * says, and where it goes next. The route decides who exists; this file
 * decides nothing about a person.
 */
declare const SIGNUP_NAME_MIN = 2;
declare const SIGNUP_NAME_MAX = 120;
declare const SignupSchema: z.ZodObject<{
    name: z.ZodString;
    email: z.ZodString;
    /** IANA zone from the device; the database validates it and the route retries without one it does not know. */
    timezone: z.ZodOptional<z.ZodString>;
    /** The invite code, when sign-up is by invitation. */
    code: z.ZodOptional<z.ZodString>;
}, "strict", z.ZodTypeAny, {
    email: string;
    name: string;
    code?: string | undefined;
    timezone?: string | undefined;
}, {
    email: string;
    name: string;
    code?: string | undefined;
    timezone?: string | undefined;
}>;
type SignupInput = z.infer<typeof SignupSchema>;
/**
 * The three postures sign-up can be in, and the one switch that chooses.
 *
 * There were two: open to anyone, or closed behind an invite code. Production
 * ran OPEN, which is the right posture eventually and the wrong one before the
 * product can carry the people it lets in.
 *
 * The missing third is what a launch actually wants. A wall turns away the
 * people who wanted this enough to type their address; a queue keeps them.
 *
 * `SIGNUP_CODE` unset is open, the sentinel below is the waitlist, and any
 * other value is that invite code — so the posture changes without a deploy,
 * which matters on the day the queue is longer than the product can serve.
 */
declare const SIGNUP_WAITLIST = "waitlist";
type SignupPosture = "open" | "waitlist" | "invite";
declare function signupPosture(code: string | undefined | null): SignupPosture;
/** What the page says, in one place. The sentence after a submit is the same whether or not the address was known. */
declare const SIGNUP_WORDS: {
    readonly title: "Create your workspace";
    readonly lead: "Your business gets its own workspace: the receptionist, the inbox, the numbers. You become its owner.";
    readonly sent: (email: string) => string;
    readonly codeRequired: "Sign-up is by invitation right now. Enter the invite code you were given.";
    readonly waitlistTitle: "Join the list";
    readonly waitlistLead: "We are onboarding businesses in small groups, so every new workspace gets set up properly. Leave your details and we will send you an invite.";
    readonly waitlistSent: (email: string) => string;
    readonly waitlistCta: "Join the list";
    readonly codeWrong: "That invite code is not right.";
    readonly crossSite: "That request did not come from this site.";
    readonly haveOne: "Already have a workspace?";
    readonly newHere: "New to Chanlytics?";
    readonly clock: (tz: string) => string;
};
/** Where the page goes once the code is on its way: sign-in, at the code step, for this address. */
declare function signupNext(email: string): string;
/** The device's zone when the runtime knows one; otherwise nothing, and the database defaults it. */
declare function deviceTimezone(resolve?: () => string | undefined): string | undefined;

export { ACTOR_TYPES, ALERT_KINDS, ANALYSIS_GRACE_MS, ASK_CAPS, ASK_CITATION_KINDS, ASK_FINISH_JSON_SCHEMA, ASK_LANGUAGES, ASK_MAX_CHARS, ASK_MAX_ROUNDS, ASK_PAGES, ASK_PAGE_ROUTES, ASK_RETENTION_DAYS, ASK_TOKENS_DAY, ASK_TURN_BUDGET_MS, AUDIENCE_KINDS, type ActorType, AppError, type AskCitation, type AskCitationKind, type AskFinish, AskFinishSchema, type AskLanguage, type AskMessageVM, type AskProposal, type AskProposalOutcome, AskProposalOutcomeSchema, type AskReadSet, type AskRole, type AskScope, type AskSettingsChange, AskSettingsChangeSchema, type AskSuggestion, type AskSurface, type AskThreadVM, type AttentionRowVM, type Audience, type AudienceKind, BILLING_MODES, BILLING_STATUSES, BILLING_TRIAL_DAYS, BOOKING_DEFAULTS, BRAIN_INTENTS, BRAIN_LANGUAGES, BRAIN_OUTPUT_JSON_SCHEMA, BROADCAST_CHUNK, BROADCAST_GAP_MS, BROADCAST_MAX_RECIPIENTS, BROADCAST_NAME_MAX, BROADCAST_PARAM_MAX, BROADCAST_SCHEDULE_MAX_DAYS, BROADCAST_STATES, BROADCAST_STATE_LABELS, BUSINESS_INDUSTRIES, BUSINESS_TYPES, type BillingAccountDto, type BillingBell, type BillingDto, type BillingInvoiceDto, type BillingMode, type BillingPlan, type BillingPriceDto, type BillingStatus, type BillingVM, type BookingReportDto, type BookingReportVM, type BookingRules, type BookingRulesLike, BookingRulesSchema, type BrainConfig, BrainConfigSchema, type BrainIntent, type BrainMeta, type BrainOutput, BrainOutputSchema, type BroadcastCounts, type BroadcastDetailDto, type BroadcastDto, type BroadcastRecipientDto, type BroadcastState, type BroadcastVM, type BusinessFieldVM, type BusinessIndustry, type BusinessPageFacts, type BusinessPageVM, type BusinessProfile, BusinessProfileSchema, type BusinessRecordDto, type BusinessType, type BusyBlock, CALL_HEARTBEAT_MS, CALL_OUTCOMES, CALL_OUTCOME_WORDS, CAMPAIGN_REPORT_RANGES, CARRIERS, CARRIER_WORDS, CHANNEL_KINDS, CHECKOUT_OUTCOME_WORDS, COMPANY_TYPES, CONFIDENCE_STEPS, CONNECTION_GROUP_WORDS, CONNECTION_KINDS, CONSENT_PHRASE, CONSENT_PHRASE_ES, CONSENT_RESET_SOURCE, CONSENT_SOURCES, CONSENT_STATES, CONVERSATION_OPT_IN_PATTERN, CONVERSATION_PHRASE, CONVERSATION_STATES, type CalendarBandVM, type CalendarBlockVM, type CalendarClosureVM, type CalendarConfig, CalendarConfigSchema, type CalendarDayDto, type CalendarDayVM, type CalendarFeedDto, type CalendarItemDto, type CalendarLike, type CalendarPerson, type CalendarServiceDto, type CalendarServiceVM, type CalendarVM, type CalendarView, type CalendarWeekDto, type CalendarWindowVM, type CallDto, type CallOutcome, type CallVM, type CampaignDayDto, type CampaignPointVM, type CampaignReportDto, type CampaignReportVM, type CampaignSourceDto, type CampaignSourceVM, type CampaignTotals, type Carrier, type ChannelDto, type ChannelHealth, type ChannelKind, type ChannelVM, type Closure, ClosureSchema, type CompanyType, type ConflictSeverity, type ConnectionGroup, type ConnectionInputs, type ConnectionKind, type ConnectionRow, type ConnectionState, type ConnectionTone, type ConnectionVerb, type ConnectionWho, type ConsentAsk, type ConsentBearing, type ConsentPageFacts, type ConsentPageVM, type ConsentState, type ConsentWay, type ConsentWayKind, type ConversationDto, type ConversationMessageVM, type ConversationState, type ConversationVM, DAYS, DECISION_SUBJECTS, DECISION_VERBS, DEFAULT_BUSINESS_TYPE, DEFAULT_COMPANY_TYPE, DEFAULT_INDUSTRY, DEFAULT_TIMEZONE, DISCONNECTION_LABELS, DISPLAY_NAME_MAX, type DayFrameLike, type DecisionSubject, type DecisionVerb, E164, EMPTY_READ_STATE, ERROR_CODES, ESCALATION_REASONS, ESCALATION_REASON_LABELS, ESCALATION_STATES, EVENT_KINDS, EVERYONE_LABEL, type Envelope, type Err, type ErrorCode, type EscalationDto, type EscalationReason, type EscalationState, type EventContacts, type EventKind, FORWARDING_MODES, FORWARDING_TEST_WINDOW_MS, type Fact, type FactConflict, type FactSource, type FastCall, type FastContext, type FastPath, type FeaturesConfig, FeaturesConfigSchema, type FeedAttendee, type FeedCall, type FeedIndex, type FeedInput, type FeedInvite, type FeedItem, type FeedThread, type ForwardingCode, type ForwardingCodes, type ForwardingFacts, type ForwardingMode, type FreeWindowsInput, GOOGLE_SHOWN_REVIEWS, type GoogleAudience, type GoogleCandidateDto, type GoogleConnectionDto, type GoogleDayDto, type GoogleDto, type GoogleGainedPointVM, type GoogleListingDto, type GoogleLocationDto, type GoogleReviewDto, type GoogleReviewVM, type GoogleVM, GuardrailsSchema, HELD_REASONS, type Hours, type HoursRun, HoursSchema, INTENT_LABELS, type IdentityInput, type IdentityWords, type InboxThreadVM, type Interval, IntervalSchema, JOB_KINDS, JOB_STATES, type JobKind, type JobState, type JourneyListLike, type JumpEntry, type KnownFacts, LIMIT_TIERS, LINE_STEP_WORDS, LIVE_OVERLONG_MS, LIVE_STALE_MS, type LineDto, type LiveCallVM, type LiveLineVM, type LiveTurnVM, type LiveVM, MARKETING_OPT_IN_PATTERN, MAX_CLOSURES, MAX_INTERVALS_PER_DAY, MEMBERSHIP_ROLES, MESSAGE_CHANNELS, MESSAGE_DIRECTIONS, MESSAGE_SENDERS, MESSAGE_STATUSES, MESSAGE_TYPES, MOCK_TEXTING_SENTENCE, MODE_WORDS, type MediaVM, type MembershipRole, type MessageChannel, type MessageDirection, type MessageDto, type MessageSender, type MessageStatus, type MessageType, type MetricsSummaryDto, NEW_WINDOW_MS, type Note, NoteSchema, type NotificationDto, type NotificationItem, type NotificationKind, type NotificationReadState, type NotificationRow, type NotificationsConfig, NotificationsConfigSchema, type NotificationsDto, type NumberHealth, type NumberHealthInput, OFFERS_OPT_IN_PHRASES, OPT_IN_PATTERN, OPT_OUT_PATTERN, OPT_OUT_REFUSAL, type Ok, type Opening, PARAM_SOURCES, PARAM_SOURCE_LABELS, PEOPLE_LISTS, PEOPLE_LIST_GROUPS, PEOPLE_TABS, PERSON_MODES, PERSON_MODE_LABELS, PERSON_STATE_LABELS, PLATFORM_NEW_DAYS, PLATFORM_QUIET_DAYS, PLATFORM_VERDICTS, PLAYBOOK_BREATH_MS, PLAYBOOK_CLASS_LABEL, PLAYBOOK_DEFAULTS, PLAYBOOK_HOURS, PLAYBOOK_NAME_MAX, PLAYBOOK_STATES, PLAYBOOK_TRIGGERS, PLAYBOOK_VETO_DELAY_MS, POLICY_CLASSES, POLICY_CLASS_MODES, POLICY_CLASS_WORDS, POLICY_MODES, PROPOSAL_GATE, PURPOSE_REFUSALS, type ParamFacts, type ParamSourceKind, type ParamSpec, type ParseOptions, type ParsedFeed, type PeopleAggregates, type PeopleListAction, type PeopleListGroup, type PersonChannel, type PersonConsent, type PersonDecisionDto, type PersonDetailDto, type PersonEscalationDto, type PersonFact, type PersonFirstContact, type PersonIdentityDto, type PersonLastContact, type PersonLike, type PersonMatch, type PersonMode, type PersonReceptionist, type PersonRightNow, type PersonRowDto, type PersonRowVM, type PersonState, type PersonTimelineItemVM, type PersonVM, type PersonVisitsDto, type PlatformLineAction, type PlatformLineActionVM, type PlatformRowVM, type PlatformTenantDto, type PlatformVerdict, type PlatformVerdictWords, type PlaybookCardLike, type PlaybookDto, type PlaybookPolicyClass, type PlaybookState, type PlaybookTrigger, type PlaybookTriggerKind, type PolicyClass, type PolicyLimits, PolicyLimitsSchema, type PolicyMode, type PolicyRow, type PreflightFacts, type PreflightProblem, type PurposeBearing, QUIET_AFTER_MS, RECENT_MAX, RECIPIENT_STATES, REGISTRATION_COST_WORDS, REGISTRATION_PATHS, REGISTRATION_PATH_WORDS, REGISTRATION_QUESTION, REPLY_DELAY_DEFAULT_MS, REPLY_DELAY_MAX_MS, REPLY_DELAY_MIN_MS, REPORT_RANGES, REVIEW_AUTO_REPLIES_PER_SYNC, REVIEW_AUTO_REPLY_MAX_AGE_MS, REVIEW_NEWS_MAX_AGE_MS, REVIEW_NEWS_MS, REVIEW_REPLY_MAX_CHARS, REVIEW_REPLY_MAX_WORDS, ROLES, ROLE_PERMS, ROLE_WORDS, type ReceptionistTone, type RecipientState, type RecordCheckFacts, type RegistrationPath, type RegistrationPathWords, type ReplyWhyVM, type ReportBarVM, type ReportDayDto, type ReportDto, type ReportPointVM, type ReportTileVM, type ReportVM, type ReportsLike, type ResolvedFacts, type ReviewOnRecord, type ReviewReplyFacts, type ReviewReplyMode, type ReviewToAnswer, type Role, type RunPlan, SERVER_KEY_PREFIX, SERVER_NOTIFICATION_KINDS, SETUP_STATE_WORDS, SHORTCUTS, SIGNUP_NAME_MAX, SIGNUP_NAME_MIN, SIGNUP_WAITLIST, SIGNUP_WORDS, SMS_CLAUSES, SOLE_PROP_CEILING_SENTENCE, SOLE_PROP_LIMITS, SOLE_PROP_TEXTING_SENTENCE, SOURCE_WORDS, STARTER_LANGUAGES, STARTER_TEMPLATES, type SendPurpose, type ServerNotificationKind, type Service, ServiceSchema, type SetupBillingFacts, type SetupDto, type SetupGoogleFacts, type SetupInputs, type SetupRowVM, type SetupState, type SetupVM, type SetupVerb, type ShellStatus, type Shortcut, type SidebarPref, type SignupInput, type SignupPosture, SignupSchema, type SpanUnits, type Standing, type StandingInput, type StandingVerdict, type StarterSlot, type StarterSlotKind, type StarterTemplate, type StarterText, type SubscriptionFacts, type SuggestionInput, TEMPLATE_BODY_MAX, TEMPLATE_CATEGORIES, TEMPLATE_EXAMPLE_MAX, TEMPLATE_FOOTER_MAX, TEMPLATE_LANGUAGES, TEMPLATE_NAME_MAX, TEMPLATE_STATUSES, TEMPLATE_TITLE_MAX, TENANT_STATUSES, THEME_OPTIONS, TODAY_QUEUE_MAX, type TemplateCategoryChoice, type TemplateDraft, type TemplateDraftCheck, type TemplateDraftInput, type TemplateStatus, type TenantConfig, type TenantConfigParse, TenantConfigSchema, TenantConfigWriteSchema, type TenantStatus, type Theme, type ThemePref, type TimelineKind, type TodayCallRowVM, type TodayDayFrameVM, type TodayDayItemVM, type TodayDayVM, type TodayFactVM, type TodayJourneyVM, type TodayNeedsRowVM, type TodayQueueRowVM, type TodaySentenceVM, type TodayVM, type TodayWeekVM, type Touches, type TypedFacts, type Visit, type VisitDto, type Visits, WA_WINDOW_MS, type WaWindow, type WeekTileLike, afterPersonRefused, ago, agoLabel, agoShort, agoWords, allVisitsIn, applyReadState, applySettingsChange, asPersonMode, askJump, attentionRow, autoReplyBell, autoReplyCandidates, billingAccountDto, bookedAfterAsk, brainMetaOf, broadcastName, buildAskSuggestions, buildNotificationFeed, businessFieldsFor, businessGroupWordsFor, businessPageVM, businessRecordForPath, businessRecordLine, businessRecordProblems, businessTypeOf, callOutcomeOf, callOutcomeWords, changedConfigFields, checkedWords, citationRoute, citationsToShow, cleanAnswer, cleanDisplayName, cleanDraft, cleanParam, cleanTimezone, clockInZone, clockLabel, closedOn, companyTypeOf, compareTemplates, composeSystemPrompt, connectionRows, connectionWords, consentPageVM, consentSourceLabel, contactMeta, contactName, coversSpan, dailyLimit, dayDate, dayFromQuestion, dayInZone, dayIntervals, dayWords, dedupeFeed, defaultParamSpecs, defaultSlotKinds, defaultTemplate, deltaOf, describeNow, describeOpenings, describeSettingsChange, describeVisits, detectLanguage, deviceTimezone, draftSendsAtMs, durationLabel, eligibleFor, eligibleForPlaybook, emptyBusinessRecord, emptyReadSet, err, eventText, exampleParams, extractContacts, factConflicts, fastPath, feedSourceLabel, filterOpenings, firstNameOf, fmtClock, fmtDay, fmtSeconds, followupsToShow, formatPhoneDisplay, formatWaited, forwardingCodes, forwardingMatch, forwardingTestOpen, frameOf, frameSteer, frameWhisper, freeWindows, gainedOver, googleAudienceWords, groundCitations, guessName, guessSlotKind, handoffE164, hasProfile, hoursLines, hoursRuns, identityWords, indexFeed, industryOf, industryWords, initialsOf, isCarrier, isDayKey, isForwardingMode, isHeldDraft, isLiveCall, isOptedOut, isOptedOutContact, isOwned, isRealDate, isSidebarPref, isThemePref, isTimezone, isTypingTarget, isUngrounded, knownTimezones, listingLine, localDate, localHour, localToUtcMs, matchPerson, mayMessageFor, mayReceiveOffers, maySpend, mediaKind, mediaVM, memberWords, messageAt, messageStatusLabel, messageText, mondayOf, moneyWords, monthLabelOf, monthSpan, navigateLabel, newReceptionistDefaults, nextRunLabel, normalizeNavigate, normalizePhone, numberHealth, ok, optInLink, optInPurposeOf, overLimitRefusal, paramLabel, parseAskFinish, parseBrainOutput, parseIcs, parseParamSpec, parseTenantConfig, parseTenantConfigResult, partialAnswer, pausedVoiceFacts, peopleAggregates, peopleFromItems, peopleListAction, personInText, personInitials, personName, personStanding, personStateFor, placeholdersOf, placeholdersSequential, planBilling, planRun, platformActionWarning, platformLineActions, platformNumber, platformRows, platformSummary, pointsDelta, policyAskClass, policyClassOfIntent, policyRules, priceWords, purposeOfPlaybook, purposeOfTemplate, quantile, ratingWords, reachedCustomer, readAgoLabel, reasonShort, recencyCells, receptionistOn, recoverCitations, registrationPathOf, registrationPreflight, renderTemplate, replyDelayMs, replyWhy, resolveFacts, resolveParams, resolveSystemPrompt, resolveTheme, reviewIsNew, reviewReplyModeOf, reviewReplyPrompt, reviewReplyWords, reviewSnippet, reviewsWords, rulesLine, runDueNow, safeNavigate, sameAddress, sameName, samePhone, sameQuestion, scheduleLine, scopeFromRoute, serverNotificationRows, setupRoute, setupSteps, shellStatusLine, shiftKey, shiftMonth, shortCode, shortTime, shortcutGroups, shouldLandOnSetup, signupNext, signupPosture, slotLabels, slugTemplateName, smsConsentSentence, smsStateRow, soleProprietorLimits, spanForView, spanLabel, spanUnits, standingOf, starsOf, starterByKey, starterByName, starterDraft, starterForTrigger, starterIndex, starterPreview, starterText, telHref, templateComponents, templateNameOk, templateTitle, tenantStatusFor, textingWords, threadStanding, tidyCallSummary, timezoneCity, timezoneWords, toBillingVM, toBookingReportVM, toBroadcastVM, toCalendarVM, toCallVM, toCampaignReportVM, toChannelVM, toConversationVM, toGoogleReviewVM, toGoogleVM, toInboxThreadVM, toLiveCallVM, toLiveVM, toPersonRowVM, toPersonVM, toReportVM, toTodayVM, toVisitDto, todayAway, todayDay, todayDayFacts, todayJourney, todayWeek, trialOffer, trialWords, triggerOf, tzClock, usableDeviceTimezone, validateTemplateDraft, verbForRoute, violatesNoPrices, visitDateKey, visitDay, visitFactsFor, visitLine, visitStartTime, visitTime, visitsIn, visitsOf, waWindow, waitedLabel, whenLabel, whisperText, whyCannotSpend, whyNotAHandoff, whyNotAPhone, windowFor, workspaceHotkey, zoneMidnight, zoneOffsetMs };
