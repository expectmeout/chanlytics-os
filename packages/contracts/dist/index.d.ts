import { z } from 'zod';

/** Closed error-code enum for the /api/v1 envelope (Blueprint §4). */
declare const ERROR_CODES: readonly ["unauthorized", "forbidden", "not_found", "validation", "choose_workspace", "conflict", "rate_limited", "payment_required", "window_closed", "upstream_meta", "upstream_retell", "upstream_anthropic", "upstream_email", "upstream_auth", "internal"];
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
/**
 * The last four digits, for a log line: enough to follow one number through
 * a batch, never enough to call it back. A log is not a ledger; the number
 * and the words are on the rows, under RLS, and nowhere else.
 */
declare function phoneTail(raw: string | null | undefined): string | null;
declare function formatPhoneDisplay(e164: string | null | undefined): string | null;

/** The fields a name is made from. Any of them may be missing; each is null or absent when it is. */
interface NameableContact {
    display_name?: string | null;
    wa_profile_name?: string | null;
    phone_e164?: string | null;
    email?: string | null;
}
/**
 * The name a human typed, else their WhatsApp name, else their number, else
 * their email address. "Unknown" is a person with none of them — never a person
 * whose only identifier is an address.
 */
declare function personName(c: NameableContact | null | undefined): string;

/**
 * THE email-address normalizer, beside phone.ts. One implementation, imported
 * by the person's page, the door that stores an address, and (when the email
 * channel receives) the intake that finds a person by the address they wrote
 * from.
 *
 * Returns the address trimmed and lower-cased, or null when the input cannot
 * be one. Lower-casing the local part is this product's policy, not a claim
 * about SMTP: every host a salon or a moving company's customers use ignores
 * case, and two rows for `Ana@x.com` and `ana@x.com` would be two people who
 * are one. Dots and plus tags are KEPT: `a.b+c@x.com` and `ab@x.com` are
 * different addresses, and the product never guesses that they are not.
 *
 * It takes a bare address. A display-name form (`Ana <ana@x.com>`) is a
 * header, and a header is parsed by the intake before this is called; here it
 * is refused, so a pasted header never becomes an address with a name in it.
 */
declare function normalizeEmail(raw: string | null | undefined): string | null;
/**
 * Which kind of not-an-address it was given, in the product's words; null for
 * an address. The door refuses the same things (00125), and says less.
 */
declare function whyNotAnEmail(raw: string | null | undefined): string | null;

/**
 * A workspace's email address: the rules for choosing one, in the owner's
 * words, and what the pages are told about it.
 *
 * The table is the authority (00126's CHECKs and unique indexes): these are
 * the same rules said before the insert, so an owner reads a sentence about
 * what they typed instead of a constraint's name. A rule here that the table
 * does not have would be a lie, and one the table has that is missing here is
 * a worse sentence, never a wrong row; mailbox.db.test.mjs runs both lists
 * against each other.
 */
/** Addresses a mail system or a person expects to mean something else; "r" is the reply route (r+<token>@). 00126's list. */
declare const MAILBOX_RESERVED: ReadonlySet<string>;
declare const MAILBOX_LOCAL_PART_MAX = 40;
declare const MAILBOX_FROM_NAME_MAX = 80;
/** What an owner typed, as the table would store it: lower-case, no spaces around it. Nothing is guessed or stripped. */
declare function normalizeLocalPart(typed: string): string;
/** Why this cannot be a workspace's address, in a sentence; null when it can (whether it is FREE is the table's to say). */
declare function whyNotALocalPart(typed: string): string | null;
/** Why this cannot be the name customers see beside the address; null when it can. */
declare function whyNotAFromName(typed: string): string | null;
/**
 * An address to offer, from the business's name: its letters and numbers,
 * words joined by hyphens, cut to length. Null when nothing usable is left or
 * what is left is reserved; the owner then types their own.
 */
declare function suggestLocalPart(businessName: string | null | undefined): string | null;
/** A workspace's mailbox, as the pages are told about it. The reply route's token is not among them: no page needs it. */
interface MailboxDto {
    id: string;
    /** bestmovers@mail.chanlytics.com: what customers write to and replies leave as. */
    address: string;
    from_name: string;
    last_received_at: string | null;
    /**
     * What went wrong with this mailbox last, in a sentence written for the
     * owner — never a provider's error text or a job's reason, which belong
     * where a person at Chanlytics reads them. Null when nothing is wrong: the
     * next email taken in clears it (db stampMailboxReceived), so a mailbox
     * whose mail is flowing never carries an old one.
     */
    last_error: string | null;
}
/** Email, as Setup and Connections are told: whether this deployment has it at all, on which domain, and the workspace's mailbox when it has one. */
interface EmailSetupDto {
    ready: boolean;
    domain: string | null;
    mailbox: MailboxDto | null;
}
/** What Setup and Connections both say while the receptionist does not answer email: one sentence, so the two pages cannot drift apart. */
declare const EMAIL_NOT_ANSWERED_SENTENCE = "The receptionist does not answer email yet: every email waits for you in the Inbox.";
/** The one thing the product cannot see, said where the owner sets email up (the plan's §9). */
declare const EMAIL_ELSEWHERE_SENTENCE = "Replies you send from another mail app do not show here.";

/**
 * Closed sets shared with the database CHECK constraints. Each is held to its
 * column at compile time by schema-sets.ts, against sets generated from the
 * database itself (tooling/scripts/gen-schema-sets.mjs).
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
 * fetched inline — and so are the two timers (snooze_wake, pause_expire): a
 * snooze or a pause wakes from its own timestamp on the conversation (00098).
 * A new kind arrives with its handler, its caller and the jobs.kind CHECK,
 * together.
 */
declare const JOB_KINDS: readonly ["outbound_send", "broadcast_send", "blob_thread_erase", "line_provision", "email_ingest", "lead_round_start", "lead_collect", "lead_check"];
type JobKind = (typeof JOB_KINDS)[number];
/**
 * `fired` means CLAIMED, not finished: claim_due_jobs() sets it with a lease,
 * and the tick moves the job to `done` or `failed` when its handler returns or
 * throws. A job still `fired` past its lease is one whose run never reported
 * back, and the next claim takes it again (packages/jobs/src/ledger.ts).
 */
declare const JOB_STATES: readonly ["scheduled", "fired", "done", "canceled", "failed"];
type JobState = (typeof JOB_STATES)[number];
/**
 * Meta's account-level webhook fields (WABA). Each arrives as an event of kind
 * `channel.<field>`, so this list is also the one computed family of event
 * kinds; the edge's WABA_FIELDS is a Set of it.
 */
declare const WABA_FIELDS: readonly ["phone_number_quality_update", "account_update", "message_template_status_update", "account_review_update", "message_template_quality_update", "template_category_update"];
type WabaEventKind = `channel.${(typeof WABA_FIELDS)[number]}`;
/**
 * Every event kind the product writes, and nothing it does not.
 *
 * Held to the emitters by tooling/scripts/tests/event-kinds.test.mjs, a
 * repo-wide lint: a kind here that nothing emits is a dead declaration, a
 * kind emitted that is not here is a row nobody can name. Both were true for
 * months (three dead, fourteen undeclared) before the lint existed.
 */
declare const EVENT_KINDS: readonly ["message.received", "message.sent", "contact.consent_changed", "usage.llm_tokens", "usage.wa_conversation", "ingest.allowlist_skip", "ingest.unreachable_sender", "message.send_failed", "message.send_blocked", "message.send_raced_cancel", "conversation.reopened", "conversation.pause_expired", "contact.erased", "contact.blob_erased", "setup.requested", "voice.provisioned", "line.answering", "line.failed", "line.released", "line.forwarding_verified", "platform.acted", "line.texting_on", "line.texting_approved", "line.texting_rejected", "business.recorded", "google.linked", "google.unlinked", "google.reviews", "google.connected", "google.disconnected", "google.replied", "workspace.created", "settings.changed", "policy.changed", "billing.updated", "billing.paused", "billing.resumed", "call.recorded", "usage.voice_seconds", "usage.ask_tokens", "webhook.auth", "webhook.delivery", "contact.added", "contact.named", "contact.noted", "contact.email_set", "contact.email_suppressed", "ingest.unroutable", "policy.veto_window_skipped", "conversation.snooze_expired", "broadcast.sent", "playbook.run", "channel.connected", "mailbox.created", "mailbox.renamed", "lead.round", "lead.no_card", "lead.stage", "lead.emailed", "lead.call", "lead.converted", "lead.not_a_fit"];
type EventKind = (typeof EVENT_KINDS)[number] | WabaEventKind;
/** Customer texts that mean opt-out (webhook consent handling, §4). */
declare const OPT_OUT_PATTERN: RegExp;
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
declare const SMS_OPT_OUT_PATTERN: RegExp;
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
declare const ESCALATION_REASONS: readonly ["human_token", "non_text", "refusal", "rate_cap", "policy_block", "send_failed", "deadman", "brain_error", "manual", "opt_out", "state_unavailable", "stale", "person_hold", "budget", "policy_ask", "callback", "paused", "carriers", "email_review"];
type EscalationReason = (typeof ESCALATION_REASONS)[number];
declare const ESCALATION_STATES: readonly ["open", "resolved"];
type EscalationState = (typeof ESCALATION_STATES)[number];
declare const DECISION_VERBS: readonly ["approve", "edit", "decline", "snooze", "wake", "take_over", "hand_back", "resolve", "archive", "reply", "cancel_send", "pause_agent", "resume_agent", "invite", "revoke_invite", "change_role", "remove_member", "erase", "whisper", "connect_channel", "consent_change", "send_broadcast", "cancel_broadcast", "start_playbook", "pause_playbook", "reply_review", "export", "end_call"];
type DecisionVerb = (typeof DECISION_VERBS)[number];
declare const DECISION_SUBJECTS: readonly ["conversation", "escalation", "draft", "lead", "message", "agent", "membership", "invitation", "contact", "call", "channel", "broadcast", "playbook", "review", "workspace"];
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
/** Why the predicate said no: a closed set, so a door cannot admit a reason that has no words. */
type PurposeRefusal = "opted_out" | "no_marketing_consent" | "not_opted_in";
declare function mayMessageFor(c: PurposeBearing, purpose: SendPurpose, opts?: {
    proactive?: boolean;
}): {
    ok: true;
    reason: null;
} | {
    ok: false;
    reason: PurposeRefusal;
};
/** Why a send was withheld, in the operator's words. */
declare const PURPOSE_REFUSALS: Record<string, string>;
/**
 * Said once on the Broadcasts page, where an owner picks an offer to send.
 * The refusal above is per customer, at the wire; this is the rule, for the
 * page, so a customer who only ever texted being absent from an offer's count
 * reads as the rule it is and not as a bug.
 */
declare const OFFERS_BY_WHATSAPP_NOTE = "Offers and news go by WhatsApp only. The text line is registered with the carriers for replies and appointment messages, so nothing promotional is sent by text; someone who has only ever texted you hears about offers once they say yes on WhatsApp.";
/**
 * One change to one of the two answers, as the ledger recorded it.
 *
 * The events row is the proof: which question, what was said, how, by whom,
 * and -- for an answer the customer texted -- the channel, the provider's own
 * id of the message and the customer's words (00110). "When did she say yes,
 * to what, and how do we know" is answered from these and nothing else; the
 * profile's timeline and the workspace export both read this shape.
 */
interface ConsentChange {
    id: string;
    contact_id: string | null;
    at: string;
    /** Which question: messages about their visit, or offers. */
    purpose: "conversational" | "marketing";
    consent: string | null;
    previous: string | null;
    /** How it was given: in person, on the phone, a signed form, their own message; "operator" is the reset. */
    source: string | null;
    /** The member who recorded it (their user id), or null when the customer's own message did. */
    by: string | null;
    note: string | null;
    /** For an answer the customer texted: where it came from, which message, and what they wrote. */
    channel: string | null;
    message_external_id: string | null;
    words: string | null;
}
/** An events row of kind contact.consent_changed, as the doors write it (00043, 00013, 00095, 00110). */
declare function consentChangeOf(e: {
    id: string;
    subject_id: string | null;
    created_at: string;
    data: unknown;
}): ConsentChange;
/**
 * What kind of message a WhatsApp template is, from the category META assigned
 * it — which is the authority, not what the workspace asked for, and which Meta
 * can change on a live template.
 *
 * FAILS CLOSED, and this is the whole subtlety. `templates.category` is NULL for
 * exactly the rows most likely to matter: `booking_link` was seeded by hand
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
    intent: z.ZodCatch<z.ZodEnum<{
        booking: "booking";
        other: "other";
        location: "location";
        hours: "hours";
        services: "services";
        pricing: "pricing";
        complaint: "complaint";
        smalltalk: "smalltalk";
    }>>;
    escalate: z.ZodCatch<z.ZodBoolean>;
    reason: z.ZodPipe<z.ZodCatch<z.ZodString>, z.ZodTransform<string, string>>;
    confidence: z.ZodPipe<z.ZodCatch<z.ZodNumber>, z.ZodTransform<number, number>>;
    facts_used: z.ZodPipe<z.ZodCatch<z.ZodArray<z.ZodString>>, z.ZodTransform<string[], string[]>>;
    language: z.ZodCatch<z.ZodEnum<{
        other: "other";
        en: "en";
        es: "es";
    }>>;
}, z.core.$strip>;
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
        /** As stored (00125). Absent on payloads read without it. */
        email?: string | null;
        /** 'unknown' | 'opted_in' | 'opted_out'. Absent on payloads written before
         *  opt-out was enforced, which is why every reader treats it as optional
         *  and only 'opted_out'/dnc blocks — never the absence of a value. */
        consent?: string | null;
        dnc?: boolean | null;
        /** Yes to OFFERS: a promotional template goes only to someone who said it (the reply route's rule). */
        marketing_consent?: string | null;
    };
    messages: MessageDto[];
}
/** The customer asked not to be contacted. Delegates to the one predicate in
 *  ./consent so the view model and every send path cannot disagree. */
declare function isOptedOut(dto: Pick<ConversationDto, "contact">): boolean;
interface ConversationMessageVM {
    from: "client" | "agent";
    /** Where it happened. A call note is not a WhatsApp bubble, and the
     *  viewer must not draw it as one -- and neither is a text or an email. */
    channel: "whatsapp" | "sms" | "email" | "phone";
    at: string;
    text: string;
    /** The attachment, when the message is one. */
    media?: MediaVM;
    /** Why the receptionist said it, when the row remembers. */
    why?: ReplyWhyVM;
    /** Who sent it, for our messages: "the receptionist", "your team", "a broadcast (Spring offer)",
     *  "the Win-back playbook" (messageAuthor). Absent for the customer's words and a call note. */
    by?: string;
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
    /** The Inbox thread this chat is: `th-` and the conversation's id, the id the Inbox routes by. */
    threadId: string;
    /** Who sent the last message that reached them, when it was ours; null when they wrote last. */
    answeredBy: MessageAuthor["kind"] | null;
    /** The wire this conversation's words travelled: the last written one, or the phone when that is all there is. */
    channel: "whatsapp" | "sms" | "email" | "phone";
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

declare function agentFor(channel: "whatsapp" | "sms" | "email" | "phone"): {
    glyph: string;
    name: string;
};
/**
 * A time in a thread or a call, by the business's clock (clock.ts). The two
 * formatters here were built without a zone, so a message read in the browser's
 * zone and "the same day" meant the browser's day: one call read as two times
 * (the 12 September audit's D5). The formatters are built once per zone there,
 * which keeps what these hoisted ones were for: these mappers run twice per
 * refresh over every message, and constructing a formatter per call froze the
 * page when a message arrived.
 */
declare function shortTime(iso: string | null, tz: string, now: Date): string;
/** The display name for a contact, without building a whole thread viewmodel
 *  to read one field (Today was doing exactly that per open escalation). */
declare function contactName(dto: ConversationDto): string;
/** The wire a written message travelled, as a thread names it. Anything unnamed is WhatsApp, which is what every row was before the column said. */
declare function writtenChannelOf(channel: string | null | undefined): "whatsapp" | "sms" | "email";
/**
 * The wire a thread's written words LAST travelled; "phone" when it has none.
 *
 * One derivation, because three surfaces were each answering it their own way
 * and two of them answered "WhatsApp" whatever the row said. Today hard-coded
 * the word onto every escalation, so an email arriving read "WhatsApp \u00b7 waited
 * 12m"; the conversation row derived it properly only after the same defect
 * was found there. A row that names the wrong wire is worse than one that
 * names none: the owner replies in the wrong place, or does not recognise the
 * thread they are being asked about.
 */
declare function threadChannelOf(messages: ReadonlyArray<Pick<MessageDto, "type" | "channel">>): "whatsapp" | "sms" | "email" | "phone";
/** The same question, in the words a row shows. */
declare function threadChannelWords(messages: ReadonlyArray<Pick<MessageDto, "type" | "channel">>): "WhatsApp" | "Text" | "Email" | "Phone";
/**
 * What an email carried that the thread does not show. The intake keeps the
 * names of an email's files and never the files, and a bounded amount of its
 * words (core email-ingest.ts); an owner reading "see the attached floor plan"
 * above nothing at all would take the email for the whole of it. Said in one
 * line under the words, and only when something was left out.
 */
declare function emailLeftOutOf(meta: unknown): string | null;
/**
 * A name that is an identifier, a number or an address, has no first name to
 * shorten to: "+1" as a speaker label is nobody, and neither is "ana@".
 */
declare function isIdentifierName(name: string): boolean;
/** The "WhatsApp · +1 …" subtitle line, same source as the thread viewmodel; "Phone · …" for a caller with no thread. */
declare function contactMeta(dto: ConversationDto, channel?: "WhatsApp" | "Phone" | "Text" | "Email"): string;
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
/** An email's own words, and the chain it quoted back at us. `quoted` is null when there is none. */
declare function splitQuotedReply(body: string): {
    text: string;
    quoted: string | null;
};
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
    /** They said yes to offers, so a promotional template may go to them: the composer offers only what can send (I4). */
    offersOk: boolean;
    who: string;
    whoMeta: string;
    avatar: string;
    state: "escalated" | "snoozed" | "done";
    takenOver: boolean;
    /** A teammate has this thread: the page names them and offers no take-over. */
    claimedByOther: boolean;
    /** Who has it, when someone does -- the page names them from the team. */
    assigneeUserId: string | null;
    /**
     * The customer's own words beside the decision: what they last wrote, quoted,
     * or what the call left behind for a call back. Null when nothing is being decided.
     */
    ask: {
        label: string;
        text: string;
        quoted: boolean;
    } | null;
    /** Archived: closed, not handled. The pane says so, and that a new message brings it back. */
    archived: boolean;
    /**
     * A quiet thread's one line: who had the last word, in the words Conversations uses, and whether a reply
     * didn't send. Null unless the thread is Handled and not archived. Every quiet thread read "Answered by the
     * receptionist — no one asked for you", over a customer who wrote last and a reply that never left (I1).
     */
    lastWord: {
        text: string;
        tone: "ok" | "plain" | "warn" | "danger";
        short: string | null;
    } | null;
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
    primaryChannel: "whatsapp" | "phone" | "sms" | "email";
    /** That channel in the words a reply box names it by: "WhatsApp", "Text", "Email". One map, so a new wire is one entry and not a ternary per screen. */
    replyVia: string;
    /** A WhatsApp thread exists. False for a caller who has only ever phoned: no reply window, phone verbs. */
    hasChat: boolean;
    /** The number to call back, E.164, when known. */
    phone: string | null;
    /** That number as people read it, "+1 (917) 555-0106": the composer said "+19175550106" under a header that did not (I4). */
    phoneDisplay: string | null;
    /** How long the request has waited, in the one family every surface reads ("57m", "2h"). */
    waited?: string;
    /** Who answers, by name and glyph -- and nothing it was never given: an autonomy line and a voice were written into every thread, and the rail said them. */
    agent: {
        name: string;
        glyph: string;
    };
    /** Why a person is needed, as the list's row says it: the reason's label, or empty when nobody is. */
    subject: string;
    /** The last thing that happened: the newest message that came in or reached them, never a draft. */
    preview: string;
    summary: string;
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
        /** An email's subject line; absent on every other wire. */
        subject?: string;
        /** The chain an email quoted back at us, when it did: kept, and shown on a tap. */
        quoted?: string;
        /** What an email carried that is not shown: files whose names alone were kept, words past the bound (emailLeftOutOf). */
        leftOut?: string;
        /** The attachment, when the message is one. */
        media?: MediaVM;
        /** Why the receptionist said it, when the row remembers. */
        why?: ReplyWhyVM;
        byYou?: boolean;
        /** Who sent it, when a person or a run did, in the words Conversations uses: "your team", "a broadcast (…)". */
        byWords?: string;
        /** Sent by a broadcast, not typed: the name the owner gave it. */
        via?: {
            kind: "broadcast" | "playbook";
            name: string;
        };
        status?: string;
        /** "Didn't send", "Canceled before sending", "Read" (messageStatusLabel). */
        statusLabel?: string;
        /** False when these words never reached the customer: the page dashes them, as Conversations does. */
        reachedCustomer?: boolean;
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
    claimedByOther: boolean;
};
declare function toInboxThreadVM(dto: ConversationDto, escalation: EscalationDto | null, 
/** The workspace's zone: every time in the thread is said by its clock. */
tz: string, now?: Date): InboxThreadVM;
interface MessageAuthor {
    kind: "receptionist" | "team" | "broadcast" | "playbook";
    /** How a bubble names them: "the receptionist", "your team", "a broadcast (Spring offer)". */
    words: string;
}
/**
 * Who sent one of our messages, in the words the Inbox and Conversations both use.
 *
 * A person's reply is the team's: the row does not record which member sent
 * it, and the Inbox said "by you" for all of them. A broadcast or a playbook
 * run is named from the run. The customer's words and a call note have no
 * author here.
 */
declare function messageAuthor(m: MessageDto): MessageAuthor | null;
/** Words cut after a whole word, with an ellipsis, when they run past `max`; whole when they fit. */
declare function clipAtWord(text: string, max: number): string;
declare function toConversationVM(dto: ConversationDto, tz: string, now?: Date): ConversationVM;
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
/**
 * A caller who reached the receptionist and left with nothing.
 *
 * DELIBERATELY NOT "missed". This product already uses that word for exactly
 * one thing — `status === "not_connected"`, a dial that never connected — and
 * the Ask assistant, the day's snapshot and the conversations page all read it
 * that way. Today keeps those out of the attention region on purpose: an
 * attempt is not a call.
 *
 * This is the inbound one nobody had a word for. Somebody rang the business,
 * the receptionist began to speak, and they hung up a few seconds later. The
 * product filed it as `handled`, because technically it was, and Today either
 * dropped the row or labelled it "No summary from the voice provider" — our
 * machine's problem, not their departure. For a salon it is the most
 * commercially interesting event of the day, and the only lost one that leaves
 * a phone number behind.
 *
 * Fifteen seconds because the greeting carries a recording notice and the AI
 * disclosure and takes most of ten: a caller gone before that heard a machine
 * start talking and nothing else.
 *
 * The reason must be the CUSTOMER leaving. The receptionist ending a call, a
 * transfer to a person, and a call that ran out of time are all endings
 * somebody chose.
 */
declare const ABANDONED_MS = 15000;
declare function abandonedCall(dto: Pick<CallDto, "direction" | "status" | "duration_ms" | "disconnection_reason" | "in_voicemail">): boolean;
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
    outcome: "live" | "handled" | "missed" | "callback" | "abandoned";
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
    recordingState: "ready" | "pending" | "failed" | "purged" | "none";
    recordingUrl?: string;
    threadId?: string;
}
/** A call's length in words, the way the product says it everywhere: "2 min 5 sec", "6 sec". */
declare function spokenDuration(ms: number | null): string;
declare function toCallVM(dto: CallDto, tz: string, now?: Date): CallVM;

/**
 * Layer-2 policy enforcement (Blueprint §6): deterministic post-generation
 * checks — prompt text is never the only defense. v1 ships the one hard rule
 * of tenant #1: NO dollar prices, ever.
 */
declare function violatesNoPrices(text: string): boolean;
/**
 * THE SAME RULE, WHERE THERE IS NO DRAFT TO REPLACE.
 *
 * On text, layerTwo runs `violatesNoPrices` over the model's draft and swaps
 * the words before the customer ever sees them: real prevention, and it works
 * only because a draft sits between the model and the person reading it.
 *
 * A call has no such gap. The provider hosts the agent and it speaks
 * directly, so by the time a transcript turn reaches us the caller has
 * already heard it. The guardrails on that side were prompt lines and nothing
 * else, which is why voice rated lowest on the systems map: an instruction is
 * not an enforcement, and a model may disregard one.
 *
 * So this is the honest equivalent rather than a pretend one. The same
 * detector reads the agent's turns as they arrive; a breach cannot be
 * unspoken, but it can be corrected in what the agent says NEXT, and the
 * owner can be told while the call is still live. Detection is per turn
 * because the provider delivers per turn; when that delivery is switched off
 * on the agent, the same check still runs on the final transcript and the
 * owner is told after the fact instead. Degrading is the point: it never
 * silently does nothing.
 *
 * Only `price` is detected, and that is deliberate. A currency figure is a
 * clean signal. "You are booked for Tuesday" and "I am a real person" are
 * not: the phrases that would catch them also catch the agent DECLINING to
 * book and the agent CORRECTLY saying it is an automated assistant, and a
 * guardrail that fires on the compliant answer is worse than none, because
 * it teaches an owner to ignore it. The type is open so a second rule can
 * join it the day there is a signal worth trusting.
 */
type SpokenRule = "price";
interface SpokenBreach {
    rule: SpokenRule;
    /** The agent's own words, trimmed for the record. */
    said: string;
    /** Which of the agent's turns it was, counting only the agent's. */
    turn: number;
}
/** One spoken turn, as the provider delivers it. */
interface SpokenTurn {
    role: string;
    content: string;
}
/**
 * The FIRST thing the agent said that broke a standing rule, or null.
 *
 * ONLY the agent's own speech is read. The caller may say any figure they
 * like, and a correction arrives back in the transcript as a turn of role
 * "injected" — so a check that scanned every turn would find the rule it had
 * just quoted, correct the call again, and keep doing it for the length of
 * the call.
 */
declare function spokenBreach(turns: ReadonlyArray<SpokenTurn> | null | undefined): SpokenBreach | null;
/** What the owner reads in the Inbox. Names the words, and what they cost. */
declare function spokenBreachDetails(b: SpokenBreach): string;
interface SpokenGuardVerdict {
    breach: SpokenBreach | null;
    /** What the owner is told. The same reason a blocked text draft raises. */
    escalate: {
        reason: "policy_block";
        details: string;
    } | null;
    /** Whether the LIVE call should be corrected: only while it is still running, and only once. */
    correct: boolean;
}
/**
 * What to do about the agent's turns so far.
 *
 * The escalation is raised whether or not the call is still live, because the
 * owner needs to know either way; the correction is attempted only while
 * there is a call left to correct, and only once, because a receptionist
 * being told the same thing every turn is worse than being told once.
 */
declare function guardSpokenTurns(o: {
    turns: ReadonlyArray<SpokenTurn> | null | undefined;
    /** The call is still in progress. */
    live: boolean;
    alreadyCorrected: boolean;
}): SpokenGuardVerdict;
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
 * Whether a reply may be written freely, on the channel it goes out on.
 *
 * A reply goes back where the customer last wrote. A text has no window and no
 * templates; WhatsApp's is 24 hours from the customer's last WhatsApp message.
 * The reply route enforces it and the composer and the assistant display it,
 * so all three ask here: with separate expressions, the assistant's card told
 * an operator a texting thread was closed while the route would have sent.
 */
declare function replyWindow(replyChannel: string | null | undefined, lastWaInboundAtIso: string | null | undefined, now?: Date): WaWindow;
/**
 * How long one reply may be on each wire, and the sentence for one that is
 * longer. WhatsApp's and the carriers' limits are theirs; email's is ours, the
 * same bound an email taken in is kept to. Asked before anything is queued: a
 * reply over WhatsApp's limit was once stored, reported queued, and failed
 * fifteen seconds later as an escalation and an alert.
 */
declare const REPLY_LIMITS: {
    readonly whatsapp: {
        readonly max: 4096;
        readonly refusal: "WhatsApp refuses a message over 4096 characters.";
    };
    readonly sms: {
        readonly max: 1600;
        readonly refusal: "A text can be at most 1600 characters.";
    };
    readonly email: {
        readonly max: 20000;
        readonly refusal: "An email reply can be at most 20,000 characters.";
    };
};
/** The longest reply any wire takes: what a route may accept before it knows the wire. */
declare const REPLY_MAX_ANY: number;
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
 * The two limits a workspace is seeded with and Autonomy states: automatic
 * replies to one person in a day, and the hours a person's reply keeps the
 * receptionist off a thread. The runtime keeps its own copies (the edge's
 * MAX_REPLIES_PER_DAY and PAUSE_MS, the dashboard server's PAUSE_MS), and a test
 * holds the edge's equal to these.
 */
declare const REPLY_CAP_DEFAULT = 20;
declare const PAUSE_HOURS_DEFAULT = 24;
/**
 * The hard limits in an owner's words (the wiring audit's S6). The card called
 * the last two "this workspace's own values", then limits Chanlytics set that
 * nothing on the page could change; they are the owner's two dials now. Each
 * says what it does and what its default is, and the value a dial shows is the
 * stored one, or the default when nothing is stored.
 */
declare function hardLimitsWords(limits: {
    max_replies_day?: unknown;
    pause_hours?: unknown;
} | null | undefined): {
    sub: string;
    replies: string;
    pause: string;
    cap: number;
    hours: number;
};
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
 * "New York" from "America/New_York" — the part a person recognises. Here, with nothing to import, so the Calendar's
 * view model can name a zone without taking the sign-up schema into every package that bundles it (C3).
 */
declare function timezoneCity(tz: string): string;

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

/**
 * One wire a workspace can be reached on.
 *
 * `metrics_summary` answers the ROUTING rows (tenant_channels, 00087). Email
 * is not one of them: a workspace's email line is its `mailboxes` row plus the
 * deployment's mail domain (mailbox.ts), and the domain lives in EMAIL_DOMAIN,
 * which the database cannot see. `emailWires` below puts it in the same list,
 * from the same read Setup and Connections use, so the three cannot disagree.
 */
interface MetricsChannelDto {
    kind: string;
    /** `tenant_channels.status`: "active" or "disabled"; "active" for a mailbox that exists. */
    status: string;
    /** The phone number customers reach this wire on; null on a wire that is not a number. */
    number: string | null;
    /** Where customers reach a wire that is not a number: the workspace's email address. */
    address?: string | null;
}
/**
 * The email wire, for that list.
 *
 * A workspace HAS email when this deployment has it and the owner has made the
 * mailbox (00129), the judgement `emailSetupFor` already makes for Setup and
 * Connections. Nothing switches a mailbox off, so a mailbox that exists is a
 * wire that is connected: `last_error` is an intake that failed, which
 * Connections tells as "Waiting on us", and a failed intake is not a wire that
 * is down.
 */
declare function emailWires(email: EmailSetupDto | null | undefined): MetricsChannelDto[];
interface MetricsSummaryDto {
    workspace: {
        name: string;
        timezone: string;
        status: string;
    };
    channels: MetricsChannelDto[];
    /**
     * False when the workspace's email line could not be read (server/metrics.ts
     * caught the mailbox read): the count above the work is short by a wire it
     * cannot name, and says so rather than printing a smaller whole. Absent is
     * true, as every payload the database answers is.
     */
    linesRead?: boolean;
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
    /** The day's traffic, which the recap's one line already says. The page prints the line and skips these; Ask still
     *  reads every sentence. */
    traffic?: true;
    /** True for the one line that must never read as calm: a reply that
     *  failed to deliver. */
    warn?: boolean;
    /** The record the sentence is about, when the read holds it: the thread of the newest reply that failed. */
    to?: string;
}
/**
 * One row of the queue on Today, in the strip's grammar (people.ts
 * attentionRow): who, where and when, one sentence, one state line, one
 * verb — and, where the state asks a second thing of you, a second.
 */
interface TodayQueueRowVM {
    id: string;
    kind: "handoff" | "callback" | "window" | "call";
    /** The thread this row is about; null for a call with no thread. The away card drops a bell row about the same thread. */
    conversationId: string | null;
    /** The call this row is about: a call-back's newest call, a call worth a listen; null otherwise. */
    callId: string | null;
    who: string;
    initials: string;
    /** The wire, in the words a row shows. It was `"WhatsApp" | "Phone"`, which is
     *  what let every escalation row be hard-coded to WhatsApp: the type could
     *  not have held an email even if the code had tried to put one there. */
    channel: "WhatsApp" | "Phone" | "Text" | "Email";
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
/**
 * How much of a customer's own words a queue row carries.
 *
 * It was a bare `.slice(0, 110)`: a hard cut mid-word, with nothing to say a
 * cut had happened, at a length the row could not have shown anyway. The row's
 * line is the only thing that knows how wide it is, so it does the truncating
 * now -- two lines with a real ellipsis -- and this is only a ceiling on what
 * the view model carries, set well past what two lines can draw.
 */
declare const QUOTE_MAX = 240;
/** What an empty queue MEANS for this workspace: the colour rides with a glyph and the words. */
interface TodayQueueEmptyVM {
    title: string;
    /** The queue heading's own words when nothing is waiting: "nothing needs you" only where the receptionist is holding the floor. */
    sub: "nothing in the queue" | "nothing needs you";
    glyph: "alert" | "phone" | "mail" | "check";
    tone: "warn" | "ok" | "";
    testid: string;
}
type TodayFigureId = "messages" | "answered" | "calls" | "new";
/**
 * One of the day's four figures: the number, its word, the clause always drawn under it, and the why behind it with
 * one door. A receipt adds to its figure and never repeats its number or its clause, so nothing is said twice and
 * nothing an owner needs lives only behind a hover.
 */
interface TodayFigureVM {
    id: TodayFigureId;
    label: string;
    value: number;
    meta: string;
    receipt: {
        text: string;
        door: {
            label: string;
            to: string;
        } | null;
    } | null;
}
/** A thread where the customer wrote last and nothing went back for an hour or more, and nobody was handed it. */
interface TodayNoReplyVM {
    conversationId: string;
    who: string;
    sinceMs: number;
    to: string;
}
/** A message with nothing back for this long is one nobody answered; the receptionist answers in seconds. */
declare const NO_REPLY_AFTER_MS = 3600000;
interface TodayVM {
    standing: {
        eyebrow: string;
        chips: Array<{
            text: string;
            ok: boolean;
        }>;
        /**
         * The wires, counted, in one sentence: "2 of 3 lines connected", "no lines
         * connected yet". `down` is true when one of them is off, the dot beside
         * it. The PAGE counted the chips, so the count could not be told about a
         * wire that is not a tenant_channels row, and email was invisible in it.
         */
        lines: {
            text: string;
            down: boolean;
        };
        alert: string | null;
        /** Ask reads these three; the page draws none of them. */
        headline: string;
        detail: string | null;
        tone: "needs" | "calm" | "alert";
    };
    /** Ask's rows: the same escalations the queue draws, read once. */
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
    /** Ask reads the sentences and the facts; the page draws the sentences that are not numbers and the receipts. */
    recap: {
        label: string;
        line: string;
        sentences: TodaySentenceVM[];
        facts: TodayFactVM[];
        receipts: Array<{
            at: string;
            text: string;
            to: string;
        }>;
    } | null;
    /** The day's own figures, in order: customer messages, answered by the receptionist, calls, new people. Null on a day with nothing at all. */
    figures: TodayFigureVM[] | null;
    /** When the last message arrived and how long the answer took. Always said: on a day with traffic it is the messages figure's clause, on a quiet day the card's line. */
    proof: string;
    /** Who is waiting with nothing back, oldest first, for Worth a look to name. */
    noReply: TodayNoReplyVM[];
    calls: {
        line: string;
        rows: TodayCallRowVM[];
    } | null;
    /** Whether the calls read succeeded; false means the rows above omit the phone, and the card says so. */
    callsRead: boolean;
    /** Everything that asks for a person, in one row grammar, longest wait first: the rows, the rest as a count, and what the rows hold in words. */
    queue: {
        rows: TodayQueueRowVM[];
        more: number;
        parts: string[];
        empty: TodayQueueEmptyVM;
    };
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
/**
 * The proof the lines are listening: when the last message arrived and how long the receptionist took to answer it.
 * Always said, never gated on the queue: on this workspace (no traffic, three open escalations) it was suppressed
 * exactly when an owner needed it. On a day with traffic it is the messages figure's clause; on a quiet day the
 * card's line, and the quiet card's own sentence ends with it, so the two cannot drift.
 */
declare function todayProof(live: {
    last_inbound_at: string | null;
    last_outbound_at: string | null;
}, tz: string, now: Date): string;
declare function toTodayVM(m: MetricsSummaryDto, conversations: ConversationDto[], escalations: Array<EscalationDto & {
    conversation_id: string;
}>, calls: CallDto[] | null, now?: Date): TodayVM;
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
    /** How many of the day's entries the cap left out, and the line that says so ("2 more on the Calendar"). */
    more: number;
    moreLine: string | null;
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
/** Rows on Today's day card; the Calendar has the rest. */
declare const TODAY_DAY_MAX = 5;
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
} | null, max?: number): TodayDayVM;
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
    /** The period before, in counts ("up from 99"), as Reports says it; null with nothing to compare. */
    compare?: string | null;
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
        /** Who answered the period's customer messages: `none` is the number nobody ever answered. */
        answered?: {
            totals: {
                in: number;
                ai: number;
                you: number;
                none: number;
            };
            share?: number | null;
        };
        /** Why the receptionist stopped, most common first — the period's "driven by". */
        reasons?: Array<{
            id: string;
            label: string;
            value: number;
        }>;
        /** The reply time as Reports computes it; the period line says the median once. */
        replyTime?: {
            count: number;
            medianLabel: string;
        };
        /** Reports' own words for the period ("Last 7 days"), so the foot line never spells them a second time. */
        period?: {
            now: string;
        };
        /** Reports' own count of the period's calls: a number, never a tile's formatted value. */
        calls?: {
            total: number;
        };
    };
    /** Null: the offers' read failed on its own and the receptionist's own numbers still stand (the bridge's D9 catch). */
    campaigns: {
        tiles: WeekTileLike[];
        empty: boolean;
    } | null;
    booking: {
        present: boolean;
        headline: string;
        sub: string;
        pct: number | null;
        asked?: number;
        booked?: number;
    };
}
/**
 * The last seven (or thirty, or ninety) days in one sentence at the foot of the day's card, with a door to Reports,
 * which was rebuilt on 19 September to carry exactly this material. Every number is one Reports prints, read from the
 * view model Reports itself draws and never derived a second time here: its period words (`period.now`), the messages
 * tile's comparison in counts, its `answered.share` rounded as its tile rounds it, its `replyTime.medianLabel`, its
 * `calls.total`. It never reads `campaigns`: that read fails on its own (#686), and a period line that dereferenced it
 * took the whole page down.
 */
declare function todayPeriodLine(r: ReportsLike | null): {
    text: string;
    to: "reports";
} | null;
/** A broadcast or a playbook's run as the broadcasts surface publishes it (toBroadcastVM), as far as the words read it. */
interface RunLike {
    state: string;
    recipient_count: number;
    /** "today 9:00 AM" / "Sep 12 · 10:00 AM", by the business's clock (toBroadcastVM). */
    when: string;
    counts: {
        sent: number;
        replied: number;
    };
}
interface TodayRunWordsVM {
    /** "3 people" */
    people: string;
    /** A run waiting for a word. */
    waiting: {
        sentence: string;
        status: string[];
    };
    /** A run under the veto window: scheduled, not yet sending. */
    soon: {
        meta: string;
        sentence: string;
        status: string[];
    };
    /** A run that went out today: what it earned so far, and whether it is still sending. */
    done: {
        counts: string;
        still: boolean;
    };
}
/**
 * Every sentence with a number the queue and the day's card say about a playbook's run. The page kept seven of
 * them (dashboard-a-command.jsx, dashboard-a-brief.jsx); the rule that a number's sentence lives in contracts was
 * stated in this file's own header and enforced next door on Reports. The page keeps deciding WHICH rows wait, are
 * scheduled or went out today; it composes none of their words. The words are sentences now ("3 people. Nothing
 * sends until you say so."), where the page had a middle dot and no capital.
 */
declare function todayRunWords(r: RunLike): TodayRunWordsVM;
/** "2 runs waiting" beside the queue's own parts; null when none waits. */
declare function todayRunsSub(n: number): string | null;
/**
 * The toast when a waiting run is approved: the audience's name, which the page sets in bold, then who it reaches
 * and when it really goes (bcWhenWords). Two parts, so the page keeps its typography without composing the number.
 */
declare function todayRunApproved(label: string, n: number, when: string): {
    lead: string;
    rest: string;
};
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
/**
 * The few things this page holds that no row on it says on its own.
 *
 * Every one of them is a RE-PRINT: the numbers are the ones Reports and
 * People already publish, said together so the shape shows. "18 wrote or
 * called" sits on Reports and "17 asked, never booked" sits on People, and
 * neither page can tell you they are the same eighteen people. Nothing here
 * is counted twice, and nothing here is a trend -- a period over a period is
 * noise at these counts (reports.ts dropped tile deltas for exactly that).
 */
type TodayLeakId = "never-booked" | "unanswered" | "unreachable" | "quiet";
interface TodayLeakVM {
    id: TodayLeakId;
    tone: "danger" | "warn" | "info";
    /** The tone as a word, so severity never rides on colour alone: "Booking gap", "No reply", "Reach", "Gone quiet". */
    tag: string;
    /** The tone's icon (the legacy Icon set). */
    icon: "calendar" | "alert" | "users" | "clock";
    /** The problem, in one sentence, with the number in it. */
    text: string;
    /** The arithmetic behind the sentence, so nobody has to take it on faith. */
    math: string;
    /**
     * Who is waiting NOW with nothing back, up to two, on the unanswered row: the threads Today holds. They are not the
     * count's own subjects (the count is Reports' over its period), so the page draws them under "Waiting now" and
     * never as the people the sentence counts.
     */
    people: Array<{
        id: string;
        name: string;
        to: string;
    }>;
    /** What "Ask why" asks: the row's own sentence and its arithmetic. Ask grounds every citation in what it read. */
    ask: string;
    /** The door. */
    cta: {
        label: string;
        to: string;
    };
    /** The act, when the list this is about has one it can actually run. */
    also: {
        label: string;
        to: string;
    } | null;
}
/** The rows that made the cut, how many qualified past the cap, and the line that says so ("and 2 more"). */
interface TodayLeaksVM {
    rows: TodayLeakVM[];
    more: number;
    moreLine: string | null;
}
/** What People publishes, as far as this reads it. */
interface PeopleListsLike {
    lists: JourneyListLike[];
    aggregates?: {
        total: number;
    };
}
/** At most this many; the rest is not an insight, it is a list. */
declare const TODAY_LEAK_MAX = 2;
declare function todayLeaks(reports: ReportsLike | null, people: PeopleListsLike | null, 
/** Who is waiting with nothing back, from the day's view model (`noReply`); the unanswered row names two of them. */
noReply?: readonly TodayNoReplyVM[], max?: number): TodayLeaksVM;
/** A bell row as the bell publishes it, as far as this reads it. */
interface AwayRowLike {
    id?: string;
    key?: string;
    kind?: string;
    unread: boolean;
    title: string;
    message: string;
    tone: "" | "ok" | "warn";
    icon: string;
    about?: {
        type: string;
        id: string;
    } | null;
    /** Where the row's button goes (the bell's rows carry it as actions[0].to): a held draft is keyed by its message and names its thread only here. */
    to?: string;
    actions?: Array<{
        to: string;
    }>;
}
/** What a queue row is about, for the away card's dedupe: its thread, its call, or both. A bare string is a thread. */
type AwayQueueRef = string | {
    conversationId?: string | null;
    callId?: string | null;
    runLabel?: string | null;
};
interface AwayGroupVM<T extends AwayRowLike> {
    /** The row itself when it stands alone; the newest of the group otherwise. */
    row: T;
    /** How many rows this stands for. 1 is an ordinary row. */
    count: number;
    /** The group's words when it stands for more than one. */
    title: string | null;
    /** Every row it swallowed, so read and dismiss reach all of them. */
    ids: string[];
}
/** The away card: the rows it draws, the numbers beside them, and every sentence it says. */
interface TodayAwayVM<T extends AwayRowLike> {
    /** What it draws, grouped and capped. */
    groups: Array<AwayGroupVM<T>>;
    /**
     * The head's number: EVERY unread row the bell holds, including the ones
     * this card does not draw. The card and the badge are two readings of one
     * set, and a head counting only what survived the queue rule read 0 beside
     * a bell of 4. "Mark all read" sits against this number and clears exactly
     * this set.
     */
    total: number;
    /** Of `total`, how many are not on screen: under the cap, or in the queue above. */
    more: number;
    /** Of `more`, the ones dropped because the queue above already holds what they are about: their thread or their call. */
    queued: number;
    /** The foot, when a row is drawn and something unread is not on screen. */
    foot: string | null;
    /** What the card says when it draws no row, and the glyph beside it. */
    empty: {
        icon: string;
        text: string;
    } | null;
}
/**
 * What happened while the owner was away, as Today reads it rather than as
 * the bell lists it.
 *
 * Three rules, and each one was a real page: a row about anything already sitting
 * in the queue at the top of this page (its thread or its call) is NOT repeated here; twelve calls
 * from the same line become one row that says twelve, because five identical
 * "No conversation happened" cards pushed a WhatsApp quality downgrade and
 * three failed jobs off the bottom; and a warning sorts above good news, so
 * the downgrade is not outranked by a five-star rating that landed later.
 */
declare function todayAwayGrouped<T extends AwayRowLike>(rows: readonly T[], inQueue?: readonly AwayQueueRef[], max?: number): TodayAwayVM<T>;

/**
 * GENERATED by tooling/scripts/gen-schema-sets.mjs from the database's own CHECK
 * constraints: every closed set Postgres enforces, one entry per column, values
 * in the constraint's order. Do not edit. Change the migration, then run
 * `pnpm gen:schema-sets` with `supabase start` running. The Database workflow
 * regenerates this on every pull request and fails when it is stale, and
 * schema-sets.ts holds every hand-kept list to it at compile time.
 */
declare const SCHEMA_SETS: {
    readonly "ask_messages.role": readonly ["user", "assistant"];
    readonly "billing_accounts.mode": readonly ["stripe", "direct"];
    readonly "billing_accounts.status": readonly ["none", "incomplete", "incomplete_expired", "trialing", "active", "past_due", "canceled", "unpaid", "paused"];
    readonly "broadcast_recipients.state": readonly ["queued", "sent", "skipped", "failed"];
    readonly "broadcasts.state": readonly ["pending_approval", "scheduled", "sending", "sent", "canceled", "failed"];
    readonly "business_records.business_type": readonly ["Co-operative", "Corporation", "Limited Liability Corporation", "Non-profit Corporation", "Partnership"];
    readonly "business_records.company_type": readonly ["government", "non-profit", "private", "public"];
    readonly "calls.direction": readonly ["inbound", "outbound"];
    readonly "calls.outcome": readonly ["answered", "booking_link_sent", "callback_needed", "voicemail", "no_request", "other"];
    readonly "calls.status": readonly ["registered", "ongoing", "ended", "error", "not_connected"];
    readonly "capability_activations.capability": readonly ["voice", "whatsapp", "sms"];
    readonly "contact_identities.channel": readonly ["whatsapp", "voice", "sms", "email", "instagram"];
    readonly "contacts.consent": readonly ["unknown", "opted_in", "opted_out"];
    readonly "contacts.marketing_consent": readonly ["unknown", "opted_in", "opted_out"];
    readonly "conversations.state": readonly ["open", "needs_human", "snoozed", "archived"];
    readonly "decisions.actor_type": readonly ["user", "ai", "system", "owner_phone"];
    readonly "decisions.subject_type": readonly ["conversation", "escalation", "draft", "lead", "message", "agent", "membership", "invitation", "contact", "call", "channel", "broadcast", "playbook", "review", "workspace"];
    readonly "decisions.verb": readonly ["approve", "edit", "decline", "snooze", "wake", "take_over", "hand_back", "resolve", "archive", "reply", "cancel_send", "pause_agent", "resume_agent", "invite", "revoke_invite", "change_role", "remove_member", "erase", "whisper", "connect_channel", "consent_change", "send_broadcast", "cancel_broadcast", "start_playbook", "pause_playbook", "reply_review", "export", "end_call"];
    readonly "escalations.reason": readonly ["human_token", "non_text", "refusal", "rate_cap", "policy_block", "send_failed", "deadman", "brain_error", "manual", "opt_out", "state_unavailable", "stale", "person_hold", "budget", "policy_ask", "callback", "paused", "carriers", "email_review"];
    readonly "escalations.state": readonly ["open", "resolved"];
    readonly "google_reviews.origin": readonly ["places", "profile"];
    readonly "invitations.role": readonly ["operator", "viewer"];
    readonly "jobs.kind": readonly ["outbound_send", "broadcast_send", "blob_thread_erase", "line_provision", "email_ingest", "lead_round_start", "lead_collect", "lead_check"];
    readonly "jobs.state": readonly ["scheduled", "fired", "done", "canceled", "failed"];
    readonly "lead_counters.kind": readonly ["allowance", "budget", "day"];
    readonly "lead_operations.kind": readonly ["undo_search", "keep", "exclude", "put_back", "include", "stop", "stage", "bulk"];
    readonly "lead_preferences.kind": readonly ["chain", "wrong_kind", "too_far"];
    readonly "lead_rounds.answered": readonly ["keep", "include", "stop"];
    readonly "lead_rounds.ending": readonly ["target_reached", "searched_everything", "month_leads_used", "budget_used", "few_new_matches", "stopped", "source_failed", "question_unanswered", "paused"];
    readonly "lead_rounds.ending_pending": readonly ["target_reached", "searched_everything", "month_leads_used", "budget_used", "few_new_matches", "stopped", "source_failed", "question_unanswered", "paused"];
    readonly "lead_rounds.purpose": readonly ["probe", "main", "topup", "renew"];
    readonly "lead_rounds.state": readonly ["queued", "probing", "waiting_on_owner", "running", "checking", "ended"];
    readonly "lead_runs.purpose": readonly ["discover", "check"];
    readonly "lead_runs.state": readonly ["claimed", "starting", "running", "succeeded", "failed", "aborted", "timed_out", "unknown"];
    readonly "lead_search_members.class": readonly ["qualified", "review", "excluded"];
    readonly "lead_search_members.fit": readonly ["strong", "look", "long"];
    readonly "lead_searches.via": readonly ["people", "ask"];
    readonly "lead_suppressions.kind": readonly ["email", "place", "phone"];
    readonly "lead_suppressions.what": readonly ["email_opt_out", "customer", "erased"];
    readonly "leads.closed_reason": readonly ["said_no", "not_a_fit", "customer", "stale", "search_removed"];
    readonly "leads.email_state": readonly ["none", "checking", "ok", "catch_all", "unknown", "invalid"];
    readonly "leads.stage": readonly ["ready", "nurture", "converted", "archived"];
    readonly "lines.forwarding_state": readonly ["none", "instructed", "verified"];
    readonly "lines.kind": readonly ["chanlytics", "hosted", "ported", "forwarded"];
    readonly "lines.port_state": readonly ["none", "requested", "scheduled", "done", "rejected"];
    readonly "lines.provider": readonly ["twilio", "dry", "carrier"];
    readonly "lines.reg_step": readonly ["profile", "business", "representative", "address", "document", "primary", "submit", "a2p_profile", "brand", "campaign"];
    readonly "lines.sms_state": readonly ["none", "needs_record", "otp_waiting", "registering", "approved", "rejected", "hosting", "active", "failed"];
    readonly "lines.step": readonly ["subaccount", "number", "trunk", "agent", "import", "messaging", "channel"];
    readonly "lines.voice_state": readonly ["none", "provisioning", "answering", "failed"];
    readonly "lines.whatsapp_state": readonly ["none", "connecting", "connected", "coexistence", "failed"];
    readonly "mailboxes.reply_mode": readonly ["draft", "veto", "auto"];
    readonly "memberships.role": readonly ["owner", "operator", "viewer"];
    readonly "messages.channel": readonly ["whatsapp", "voice", "sms", "email", "system"];
    readonly "messages.direction": readonly ["inbound", "outbound"];
    readonly "messages.sender": readonly ["customer", "ai", "human", "system"];
    readonly "messages.status": readonly ["received", "queued", "sent", "delivered", "read", "failed", "canceled"];
    readonly "messages.type": readonly ["text", "template", "media", "call_summary", "note"];
    readonly "notifications.kind": readonly ["handoff", "deadman", "call", "number", "sweep", "job_failed", "playbook", "calendar_people", "alert", "review", "billing", "template_ready", "template_blocked", "broadcast_sent", "broadcast_stopped", "leads_ready", "leads_question"];
    readonly "playbooks.policy_class": readonly ["reengage", "campaign", "booking"];
    readonly "playbooks.state": readonly ["running", "paused"];
    readonly "playbooks.trigger": readonly ["quiet_30", "new_week", "phoned_only", "everyone_monthly", "visit_tomorrow", "visited"];
    readonly "policies.class": readonly ["reply", "booking", "faq", "reengage", "campaign", "money", "reviews"];
    readonly "policies.mode": readonly ["auto", "veto", "ask", "never"];
    readonly "policies.subject_type": readonly ["segment", "contact"];
    readonly "sweep_status.judged_by": readonly ["request", "run"];
    readonly "templates.category": readonly ["marketing", "utility", "authentication"];
    readonly "templates.channel": readonly ["whatsapp", "voice", "sms", "email", "instagram"];
    readonly "templates.meta_status": readonly ["approved", "pending", "rejected", "paused", "disabled"];
    readonly "templates.source": readonly ["meta", "chanlytics"];
    readonly "tenant_channels.kind": readonly ["whatsapp", "voice", "sms", "email", "instagram"];
    readonly "tenant_channels.status": readonly ["active", "disabled"];
    readonly "tenants.status": readonly ["active", "paused", "test"];
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
 * "Last changed by Ada, two days ago" for the Business card, from the row's
 * own author and stamp (migration 00085). A row written before the author
 * was kept says so rather than inventing one; no stamp at all says nothing.
 */
declare function lastChangedWords(updatedAt: string | null | undefined, byName: string | null, nowMs: number): string;

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
/** The channels a report names, in the order their colours are fixed (a channel keeps its colour whatever its rank). */
type ReportChannelKey = "whatsapp" | "voice" | "email" | "sms" | "instagram";
declare const REPORT_CHANNELS: readonly {
    key: ReportChannelKey;
    label: string;
}[];
type ReportChannelCounts = Record<ReportChannelKey, number>;
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
    /** v3 (00139): each receptionist first reply this period, with the day it was asked (tenant zone). */
    replies?: {
        day: string;
        s: number;
    }[];
    /** v3: inbound customer messages by channel, and connected calls as voice, this period and the one before. */
    channels?: {
        current: ReportChannelCounts;
        previous: ReportChannelCounts;
    };
    /** v3: inbound customer messages plus connected calls this period, 7 rows (Monday first) of 24 hours. */
    hours?: number[][];
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
     *  prior data to compare with (never a fabricated 0%). Ask reads it. */
    delta: {
        text: string;
        tone: "pos" | "neg" | "";
    } | null;
    /** One point per day of the current period (Ask and Today read these). */
    spark: number[];
    /** The period before, in counts ("up from 99"); null when there is nothing to compare with. */
    compare: string | null;
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
    /** The status a bar stands for, when it has one (a caller's mood): the page gives it that status's colour, beside its word. */
    tone?: "" | "ok" | "danger";
}
interface ReportSpeedPointVM {
    day: string;
    label: string;
    short: string;
    p50: number | null;
    p90: number | null;
    /** fmtSeconds of each, so the page never formats a duration itself. */
    p50Label: string;
    p90Label: string;
    count: number;
}
interface ReportWeekVM {
    axes: string[];
    long: string[];
    /** Messages and calls per weekday, Monday first: counts over a week, a weekday's average over a longer period. */
    current: number[];
    prior: number[] | null;
    /** The one busiest (quietest) weekday; null on a tie or with nothing in the period. */
    busiest: number | null;
    quietest: number | null;
    /** "count" when each weekday happened once in the period, "average" when some happened more than once. */
    unit: "count" | "average";
}
interface ReportHoursVM {
    /** Messages and calls per hour of the day, the period summed. */
    values: number[];
    /** The first hour of the busiest two-hour window; null when nothing came in. */
    peak: number | null;
    /** How many came in before 8am or from 8pm (said so in words until a workspace has business hours). */
    outside: number;
    /** Each hour in words, "12am" to "11pm", for the page's axis, tooltips and table. */
    labels: string[];
}
interface ReportChannelVM {
    key: ReportChannelKey;
    label: string;
    value: number;
    prior: number;
}
/** The one sentence under each chart, or null for none. Each adds the next thing, never a number a tile, the hero or a legend gives. */
interface ReportLinesVM {
    /** The headline beside the receptionist's share: how many of how many, and how fast half its replies went out. */
    hero: string;
    /** The share the period before, said beside the tick it draws on the ring; null with nothing answered then. */
    heroBefore: string | null;
    answered: string | null;
    reply: string | null;
    calls: string | null;
    channels: string | null;
    rhythm: string | null;
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
    /** `prior`: customer messages the period before, day for day (null where there is no such day). `share` and
     *  `priorShare`: the receptionist's part of the answered, 0..1, or null with nothing answered. */
    answered: {
        points: ReportPointVM[];
        totals: {
            in: number;
            ai: number;
            you: number;
            none: number;
        };
        max: number;
        prior: (number | null)[];
        share: number | null;
        priorShare: number | null;
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
        prior: (number | null)[];
    };
    people: {
        points: ReportPointVM[];
        total: number;
        max: number;
        prior: (number | null)[];
        /** New people added up over the period, and the period before's own running total day for day. */
        cumulative: {
            points: (ReportPointVM & {
                total: number;
            })[];
            prior: number[] | null;
        };
    };
    /** v3: reply speed a day (up to two weeks) or a week at a time; null on a v2 payload. */
    speed: {
        unit: "day" | "week";
        points: ReportSpeedPointVM[];
    } | null;
    week: ReportWeekVM;
    /** v3: null on a v2 payload. */
    hours: ReportHoursVM | null;
    /** v3: null on a v2 payload; channels with nothing now or before are left out. */
    channels: ReportChannelVM[] | null;
    /** The two periods by name, said the same way in every legend, tooltip and table: "Last 30 days", "The 30 days before". */
    period: {
        now: string;
        before: string;
    };
    lines: ReportLinesVM;
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
/**
 * A count against the period before, in counts: "up from 99", "down from 23", "same as the 30 days before", and
 * "none the 30 days before" when the period before had people reaching the business but none of this. Null when
 * the period before had no customer message and no call at all (a workspace too young to compare), and when both
 * are zero (nothing against nothing says nothing). Never a percentage: #557 took those out because they lied on
 * small counts.
 */
declare function compareWords(current: number, previous: number, rangeLabel: string, priorHadAny: boolean): string | null;
/**
 * The period before, day for day beside the current one: the n days before them, newest last, and null where the
 * series has no day that far back (a workspace younger than two periods).
 */
declare function priorOf<T>(n: number, previous: readonly T[], pick: (d: T) => number): (number | null)[];
declare const REPORT_WEEK_SHORT: readonly ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
declare const REPORT_WEEK_LONG: readonly ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];
/**
 * Messages and calls on each weekday, Monday first: the count over a week, and each weekday's average over its own
 * days in a longer period, because 30 days hold five of two weekdays and four of the rest, and a sum would lean
 * toward whichever weekdays the window repeats. One decimal.
 */
declare function weekOf(series: readonly ReportDayDto[]): number[];
/** "12am", "9am", "12pm", "5pm"; 24 is midnight again. */
declare function reportHourWords(h: number): string;
/**
 * The hours of the day, the period summed; the busiest two-hour window's first hour (the earliest on a tie); and how
 * many came in before 8am or from 8pm. Null without v3's grid.
 */
declare function hoursOf(grid: readonly (readonly number[])[] | undefined): ReportHoursVM | null;
/** The channels in their fixed order; one with nothing now and nothing before is left out. Null without v3. */
declare function channelsOf(ch: ReportDto["channels"]): ReportChannelVM[] | null;
declare function runningTotal(values: readonly (number | null)[]): number[];
/**
 * The receptionist's reply time a day at a time up to two weeks, and a week at a time past that. Weeks end on the
 * period's last day so the newest point is a whole week; a first week of fewer than four days joins the next. The
 * median and the slowest tenth are taken from the replies themselves, never averaged from daily medians.
 */
declare function speedOf(replies: readonly {
    day: string;
    s: number;
}[], days: readonly string[]): {
    unit: "day" | "week";
    points: ReportSpeedPointVM[];
};
/** A caller's mood as the voice provider reads it ("Positive", "Neutral", "Negative", "Unknown"), as a status tone. */
declare function callMoodTone(sentiment: string): "" | "ok" | "danger";
declare function toReportVM(dto: ReportDto): ReportVM;

/**
 * Google — a business's listing on Google Maps, as facts.
 *
 * Most businesses live on Google whether or not they asked to. The listing
 * is public: a name, an address, a rating, a count of reviews, and the five
 * reviews Google shows first. Setup finds it from the facts the workspace
 * already holds, the edge reads it once a day, and what changed reaches the
 * bell, Today and Reports. The owner's own Business Profile, connected once,
 * adds every review and the right to answer them.
 *
 * Two honesties shape every line: Google shows at most five reviews of the
 * public listing, sorted by relevance, so "new" is a review not on record
 * and written since the previous check, while the count of ratings is
 * exact; and fewer than two days of reading cannot say what a period
 * gained. Pure: the routes feed it rows, the tests feed it fixtures.
 */

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
    origin: SchemaSet<"google_reviews.origin">;
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
    /**
     * Which of Stripe's two worlds the edge's key opens: true live; false test, where only Stripe's test cards work and no
     * money moves; null when the edge did not say. Billing and Setup say test mode from it (the wiring audit's S9).
     */
    livemode: boolean | null;
    account: BillingAccountDto | null;
    price: BillingPriceDto | null;
    trial_days: number;
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
/**
 * Is there a card door to send anybody to?
 *
 * `maySpend` answers whether this workspace MAY put a charge on our account.
 * This answers something different and easily confused with it: whether a page
 * exists that a person could do anything on. They came apart on the deployment
 * that matters most — a brand-new self-serve workspace.
 *
 * `provision_tenant` gives every workspace `billing_accounts(mode='stripe',
 * status='none')`. With the Stripe keys unset, `billingReadiness()` is false, so
 * `toBillingVM` returns "Billing is not available on this deployment yet" with
 * every action false. Setup's billing ROW already knew that and drew nothing —
 * "a closed door draws nothing". The LINE row did not: it read `canSpend` alone,
 * concluded "cannot spend, so tell them to add a card", and sent the owner to a
 * page with no buttons on it. Nothing in the product could put the workspace on
 * a direct arrangement, so the only escape was a hand-written SQL UPDATE.
 *
 * Two rows deciding the same thing from the same facts, disagreeing. One
 * predicate, read by both.
 */
declare function billingDoorOpen<T extends {
    mode: BillingMode;
    ready: boolean;
}>(b: T | null | undefined): b is T;
declare function maySpend(mode: BillingMode, status: BillingStatus): boolean;
/**
 * What a refusal to spend says the money was FOR.
 *
 * Until the lead finder there was one spending route family and the sentences
 * named it outright — "Add a card before buying a number". An owner refused on
 * the Leads page then read about phone numbers, which is a refusal about
 * something they were not doing. Two forms, because the sentences need both:
 * `before` follows "before", `can` follows "can".
 */
interface SpendWords {
    before: string;
    can: string;
}
/** The default, and what every lines route keeps saying. */
declare const SPEND_NUMBER: SpendWords;
/** The lead finder: a search spends on someone else's account, not on a number. */
declare const SPEND_LEADS: SpendWords;
/**
 * Why a workspace may not spend, in the owner's words, or null when it may.
 *
 * A refusal at the moment somebody is trying to give you money has to say what
 * to do about it, so this is a sentence and a destination rather than a code.
 */
declare function whyCannotSpend(mode: BillingMode, status: BillingStatus, doing?: SpendWords): string | null;
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
/**
 * Said wherever a card is while Stripe runs on its test keys (the wiring audit's S9). Production ran them while Billing
 * said "Card on file" and Setup "The card on file is charged when the trial ends", and nothing said that a real card is
 * refused and no money moves. Setup lists it as a detail; the pane ends it with a full stop.
 */
declare const BILLING_TEST_MODE_CLAUSE = "Billing is in test mode, so only Stripe's test cards work and no real money moves";
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
    /** For a workspace that pays by card on Stripe's test keys, the sentence saying so; null when live or not said. */
    testMode: string | null;
}
declare function toBillingVM(dto: BillingDto, nowMs?: number): BillingVM;
/**
 * What a billing state means for the receptionist, for the pill beside the headline. The pill printed Stripe's own
 * word for the state ("trialing", "past due") next to a headline that already said it in ours (the wiring audit's
 * S20). What the headline does not say is whether the receptionist is answering, and that is receptionistOn's.
 */
declare function billingPill(vm: Pick<BillingVM, "status">): {
    words: string;
    tone: "ok" | "danger";
};
/** An invoice's status in an owner's words. A word Stripe adds later is shown as Stripe says it; none, as a dash. */
declare const INVOICE_STATUS_WORDS: Record<string, string>;
declare function invoiceStatusWords(status: string | null | undefined): string;
/** The Setup row's facts: enough to say the state and the one next step. */
interface SetupBillingFacts {
    ready: boolean;
    /** Which of Stripe's worlds the key opens, as BillingDto carries it: false says test mode on the row. */
    livemode: boolean | null;
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

/**
 * A failure at the vault that keeps a line's credentials, told from a
 * carrier's failure by the saga's own words (edge/lib/lines.ts: "reading the
 * line's credentials", "keeping the line's credentials"; lines-saga.ts: "the
 * subaccount's token is missing from the vault"). On the row it looked like
 * any other stopped setup and offered the same Retry, which ran into the
 * same wall until a person restored the credentials. Its own module so the
 * Setup rows and the capability status can both read it without a cycle.
 */
declare function lineCredentialFailure(lastError: string | null | undefined): boolean;
declare const LINE_CREDENTIALS_SENTENCE = "the vault that keeps the line's credentials";

/**
 * Setup — one page a new owner lands on until the receptionist is answering.
 *
 * Every row here is read from the workspace: the config, the channels, the
 * templates, the calendar feed, the team, the consent rows. Nothing stores a
 * "done" flag; a row is ready because the thing it names exists. "Later" is
 * a preference on one device that hides an optional row from Today's line,
 * and nothing else.
 *
 * Four words for every state, so the page reads the same way People and
 * Today do: Not started · Waiting on you · Waiting on carriers (or Meta, or
 * us) · Ready. "Waiting on us" is real: a line is set up by a person at
 * Chanlytics until lines provision themselves (plan, step 3).
 */

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
    /** Email: whether this deployment has the channel, and the workspace's mailbox when it has one (mailbox.ts). Absent reads as off. */
    email?: EmailSetupDto;
    templates: {
        approved: number;
        pending: number;
        startersApproved: number;
    };
    calendar: {
        state: "ok" | "unavailable" | "none";
        problem?: string | null;
    };
    team: {
        members: number;
        invitesOpen: number;
        alertEmails: number;
    };
    /**
     * The two answers, counted separately.
     *
     * `yes` is the conversational one -- they answer and they hear about their own
     * visit. `offers` is the promotional one, and it is the ONLY one that puts a
     * person on a marketing broadcast. This row used to read `yes` and say "said
     * yes to offers", so a workspace with seven people who had texted START was
     * told it had seven people it could send an offer to, and the composer then
     * refused all seven.
     */
    consent: {
        yes: number;
        offers: number;
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
    /**
     * What the owner has asked a person at Chanlytics for, and when: the newest
     * ask of each thing (00123 added bringing a number and a repair). Optional
     * beyond the line, so a reader built before them still parses.
     */
    requests: {
        line: string | null;
        port?: string | null;
        repair?: string | null;
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
    /** The owner's activations (00108), one per capability, as recorded. */
    activations?: ActivationRecord[];
}
/** A line as the page may see it — states in words, never a provider id. */
interface LineDto {
    id: string;
    e164: string | null;
    kind: string;
    provider: string;
    area_code: number | null;
    voice_state: SchemaSet<"lines.voice_state">;
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
/**
 * How long a line may be "setting up" before something has gone wrong.
 *
 * THE SAGA CANNOT ALWAYS FINISH INSIDE ITS OWN LAMBDA. `api/admin/lines.ts` is
 * capped at 60 seconds (apps/edge/vercel.json) and the saga makes ten Twilio
 * calls at a 15-second timeout each plus four Retell calls at eight — about 180
 * seconds worst case, three times the ceiling. So a run is killed not by a crash
 * but by a slow afternoon at the provider, and when it is killed the `catch` that
 * would write `voice_state: 'failed'` never runs. The row stays `provisioning`.
 *
 * Nothing used to move it again: no sweep reads `lines` for this, `retry` demanded
 * `failed`, `buy` refused because a line already existed, and `number_drift()`
 * deliberately exempts a line still being set up. The owner's Setup row said
 * "usually a minute or two" with no button, for ever. The only exit was a platform
 * admin handing the number back.
 *
 * Five minutes, because the honest worst case is three and a state that is
 * genuinely still running must never be declared dead underneath itself.
 */
declare const PROVISIONING_DEADLINE_MS: number;
/**
 * Has this line been setting up longer than a line can legitimately take?
 *
 * One predicate, because four places have to agree about it: the Setup row that
 * offers the owner a Retry, the back office's action list, the route that accepts
 * that Retry, and the sweep that resumes them unasked. A deadline that each of
 * them spelled out for itself is a deadline they would drift apart on.
 */
declare function lineStuckProvisioning(l: Pick<LineDto, "voice_state" | "state_since"> | null | undefined, nowMs: number): boolean;

declare function lineRetryRefusal(l: Pick<LineDto, "voice_state" | "state_since"> & Partial<Pick<LineDto, "last_error">> | null | undefined, nowMs: number): string | null;
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
    /** The quieter second act on a row: switching an activated capability off again. */
    undo?: SetupVerb | null;
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
 * Texting on a line that answers calls with nothing filed waits on the owner's
 * business record. Setup said "Texting is not available yet… this page will say
 * when" beside Connections' "waits on you" (the wiring audit's S7). Connections
 * says the sentence on the row that holds the form; Setup's clause adds where.
 */
declare const TEXTING_NEEDS_RECORD_SENTENCE = "Texting needs your business on record for the carriers \u2014 two minutes, once.";
declare const TEXTING_NEEDS_RECORD_CLAUSE = "Texting needs your business on record for the carriers \u2014 two minutes, once, on Connections.";
/**
 * A broken configuration, said once. Setup sent the owner to "Open Workspace to
 * repair them" while the Business pane said the form is closed and Chanlytics
 * repairs it (S8). Only Chanlytics can, and both pages now say so: the pane
 * from `title` and `body` (published by the bridge), Setup's row from `clause`.
 */
declare const BROKEN_CONFIG_WORDS: {
    readonly title: "This workspace's settings can't be read";
    readonly body: "Something saved in this workspace's configuration no longer passes the checks the receptionist runs before it answers, so the receptionist is silent and this form is closed — saving from here would replace what is still there. Chanlytics has to repair it.";
    readonly clause: "Your business settings could not be read, so the receptionist is silent until Chanlytics repairs them. Business lists what is wrong.";
    /** The owner's one move on a configuration only Chanlytics can repair (S8): it said so, with no way to ask. */
    readonly ask: "Ask for a repair";
    /** Once asked: when, and what happens next, on Setup's row and on the pane's card alike. */
    readonly requested: (at: string, nowMs: number) => string;
};
/**
 * What an owner can ask a person at Chanlytics for (00123): a phone line, until
 * lines provision themselves; bringing the number they have over (S14); and a
 * repair of a configuration the receptionist can no longer read (S8).
 */
declare const SETUP_REQUEST_KINDS: readonly ["line", "port", "repair"];
type SetupRequestKind = (typeof SETUP_REQUEST_KINDS)[number];
/**
 * Takes only the fields it reads. The back office renders the same
 * sentence for another workspace's line, and it has the registration facts
 * without the rest of a LineDto -- a synthetic one filled with plausible
 * blanks would be a second answer waiting to drift from this one. The voice
 * state is optional for the same reason: the back office asks only about the
 * states an owner acts on, and a line with nothing filed is not one of them.
 */
declare function textingWords(l: (Pick<LineDto, "sms_state" | "reg_mock" | "reg_sole_prop"> & {
    voice_state?: LineDto["voice_state"];
}) | null | undefined): {
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

/**
 * What a workspace's capabilities are, computed from records.
 *
 * PRD ON-02: a capability is available only when its records allow it;
 * readiness and owner activation are separate; blockers carry a code a
 * machine can act on and words a person can. Nothing here is persisted but
 * the owner's activation (capability_activations, 00108). Evidence is what
 * the records show -- a call answered, a message replied to -- never a claim
 * the product makes about itself.
 *
 * Texting is deliberately the honest one: until the carriers approve a real
 * registration it is not sold, and this says so rather than "not yet".
 */

declare const CAPABILITY_KINDS: readonly ["voice", "whatsapp", "sms"];
type CapabilityKind = (typeof CAPABILITY_KINDS)[number];
/** One row of capability_activations, as the dashboard reads it. */
interface ActivationRecord {
    capability: CapabilityKind;
    activated_at: string;
    activated_by: string | null;
    deactivated_at: string | null;
    note?: string | null;
}
interface CapabilityBlocker {
    /** Stable, for a machine: no_line, line_provisioning, line_failed, channel_off, no_business_facts, not_connected, meta_waiting, texting_not_sold. */
    code: string;
    words: string;
}
interface CapabilityStatus {
    kind: CapabilityKind;
    /** The records say it can work. */
    ready: boolean;
    /** Why not, in dependency order; empty when ready. */
    blockers: CapabilityBlocker[];
    /** The last real interaction on the capability: evidence that it works, never a claim. */
    tested: {
        at: string;
        what: string;
    } | null;
    /** The owner's act, when it stands (not deactivated). */
    activated: {
        at: string;
        by: string | null;
    } | null;
    /** ready, tested and activated: what the product may say is live. */
    live: boolean;
    /** One sentence for the owner. */
    words: string;
}
type CapabilityInputs = Pick<SetupDto, "channels" | "business" | "templates" | "lines"> & {
    activations?: ActivationRecord[];
};
declare function capabilityStatus(kind: CapabilityKind, i: CapabilityInputs, nowMs?: number): CapabilityStatus;

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
    /**
     * The address the event names as its ORGANIZER, lower-cased, or null. On a
     * business's own calendar that is the owner or the booking tool that writes
     * into it -- present on every event, and usually among the guests as well.
     * Kept so the match can tell them from the customer (calendar-people.ts).
     */
    organizer: string | null;
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
 * The local day `days` after the one `atMs` falls on -- BY THE CALENDAR, not by
 * the clock.
 *
 * THE DEFECT THIS EXISTS FOR. Every one of these used to be written as
 * `dayInZone(tz, now + n * 86_400_000)`: add a fixed number of milliseconds,
 * then ask which local day that landed on. Two days a year that is not the
 * next day. On 8 March 2026 New York loses an hour, so a customer asking at
 * 23:30 the night before was offered 9 March next and **8 March was never
 * offered at all**; on 1 November it gains one, so a read at 00:30 emitted
 * 1 November twice and lost a day off the far end of the horizon. Nobody sees
 * an error: the receptionist simply says the wrong days out loud.
 *
 * A calendar day is a count of days, so it is counted in days. The date is
 * read in the business's zone, stepped over UTC midnights (which never shift),
 * and handed back as a date -- no instant is carried across the boundary, so
 * there is nothing for an hour to move. The RRULE expander below has always
 * stepped this way, which is why a weekly appointment stays at 2 PM across a
 * change and the offered days did not. `calendar.ts shiftKey` is the twin that
 * steps a DATE to a date; this is the one that starts from an instant, which
 * is where reading "now" went wrong.
 */
declare function dayPlusInZone(tz: string, atMs: number, days: number): {
    key: string;
    weekday: string;
    y: number;
    m: number;
    d: number;
};
/**
 * The taken time in a feed. Cancelled events and events marked transparent
 * (free) are not taken. A recurring event is expanded when its rule is one a
 * salon's calendar carries (parseRule); a rule that cannot be read keeps its
 * first occurrence and is counted as skipped. RDATE adds dates to a series
 * (or makes one of a single event); a VEVENT with RECURRENCE-ID replaces one
 * occurrence of the series with the same UID -- the moved instance is drawn
 * where it moved to, and a cancelled override removes its instance -- which
 * is what Google writes when one appointment in a weekly series is moved.
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
/**
 * When a day is open, as one list of [open, close] spans.
 *
 * open/close and intervals are UNIONED, merged where they touch or overlap,
 * and a span that runs backwards is dropped. This is the ONE reader: the
 * prompt (config.ts), the free windows a caller is offered and the calendar
 * board all read a day through it. It used to have two readers -- the prompt
 * unioned the two, this one let intervals win -- so a row holding both could
 * be described two ways, and "are you open at nine?" had two answers.
 */
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
/** A service the business lists, as far as matching one needs it. */
interface ServiceLike {
    name: string;
    duration_min?: number;
}
/**
 * The listed service somebody means, from what they said ("a haircut", "the
 * balayage thing", "uñas"): exact first, then one name containing the other,
 * then the service sharing the most words of four letters or more.
 *
 * One function for the phone tool and the assistant. The two copies it
 * replaced split words differently, and the phone's cut "uñas" at the ñ into
 * two pieces too short to count, so a caller asking for nails matched nothing.
 */
declare function matchService<S extends ServiceLike>(services: readonly S[] | undefined, asked: unknown): S | null;
/** The booking rules as far as a consultation needs them. */
interface ConsultRules {
    consult_first?: readonly string[];
}
/**
 * Whether a listed service needs a consultation before it can be booked, as Business lists them. Accents, case and the
 * spaces around a name are not the name, as in matchService; the board matched them exactly, lower-cased.
 */
declare function needsConsultation(name: string, rules: ConsultRules | null | undefined): boolean;
/** What an asked-for service is offered as: itself, or a consultation first. */
interface ServiceOffer<S extends ServiceLike = ServiceLike> {
    /** The listed service asked about. */
    service: S;
    /** Offered as a consultation, never as itself. */
    consultation: boolean;
    /** The listed service a consultation is, when the business lists one: the one sharing the service's words first. */
    consultationService: S | null;
    /** How long an open time has to be: the service's own length, a consultation's, or null for any open time. */
    minMinutes: number | null;
}
/**
 * The one rule for a service asked about, for the phone tool, the assistant and the board. A service that needs a
 * consultation first is never offered itself: the consultation is, sized by the consultation the business lists
 * ("Consultation", "Consulta"), or any open time when it lists none. All three sized a three-hour color correction by
 * its own length while the prompt said a consultation comes first (C5b).
 */
declare function offerFor<S extends ServiceLike>(services: readonly S[] | undefined, rules: ConsultRules | null | undefined, asked: unknown): ServiceOffer<S> | null;
/**
 * The words before the open times, the phone's and the assistant's alike: a service's length, or that it needs a
 * consultation first and what is offered instead.
 */
declare function offerLead(offer: ServiceOffer | null): string;

/**
 * The people in a calendar: who an appointment is for, read from the words
 * a booking tool wrote into the owner's calendar and matched against People.
 *
 * Booksy, Square, Fresha, Acuity and Google's own appointment schedules all
 * put the client's name and the service in the title; some add a phone or
 * an email in the description, and a booking made through Google adds the
 * booker as a guest. None of it is structured, so the match goes by
 * evidence: a phone number found anywhere in the event beats an address, an
 * address beats a name, and a name only counts when it is a whole saved name
 * of four letters or more. A number and an address are exact — they are the
 * person, or nobody; a name is a guess, and a name match is the only one that
 * says so. People has held an address since 00125, so the customer a booking
 * through Google adds as a guest is now someone, not an unmatched block.
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
    /** Their address, lower-cased the way People stores it (00125), or null. Matched against, never created from: `create_person` wants a phone. */
    email: string | null;
    /** Their latest conversation, when they have one: the thread a booking link is texted into. */
    thread?: string | null;
    /** When they last wrote on WhatsApp, for the reply window. */
    waInboundAt?: string | null;
}
/** How a match was made, surest first: a number and an address are exact, a name is a guess. */
type MatchVia = "phone" | "email" | "name";
interface PersonMatch {
    id: string;
    name: string;
    via: MatchVia;
    /** Present only when the person has a thread: its conversation id, and their last WhatsApp message for the reply window. */
    thread?: string | null;
    wa_inbound_at?: string | null;
}
/**
 * THE BUSINESS'S OWN ADDRESSES. Never a customer's, on any calendar event.
 *
 * #626 took the calendar's ORGANISER off every event: the owner is on all of
 * them and is never who the appointment is for. That covered the owner as
 * organiser and left the owner as GUEST -- which is every meeting somebody
 * else sent them, and on a personal Google Calendar that is most of them. So
 * when the owner wrote to their own salon's new address to test it (the first
 * thing anybody does with a new inbox), they became a person in People, and
 * every event they were invited to became one of their "visits": "Visited ·
 * New voicemail notification received", "Last visit: Today". The index's own
 * comment predicted it: an owner who is in People "would take every
 * appointment they are a guest on".
 *
 * The timeline was the visible half. The worse half was the playbooks, which
 * read visits the same way to decide who is thanked after a visit and who is
 * reminded before one: they could have written to the owner, as a customer,
 * about a meeting on their own calendar.
 *
 * Two facts every reader of the calendar already holds say an address is the
 * business's: it is where the business is ALERTED (notifications
 * .escalation_emails -- somebody who is told "a customer needs you" is not the
 * customer), and it is the calendar's own owner (a Google feed names its
 * calendar, and a primary calendar is named by its owner's address). A
 * team member who is neither is not covered: the auth table holding members'
 * addresses is not something the edge can read without a new function, and
 * this is exact for the case that happened.
 *
 * It is a REQUIRED input of every function below that matches a person, so no
 * reader of the calendar can forget to pass it -- the playbooks, the phone
 * receptionist and three dashboard reads, and whichever comes next.
 */
type OwnAddresses = ReadonlySet<string>;
/**
 * The address a Google Calendar feed belongs to, or null.
 *
 * A private feed is https://calendar.google.com/calendar/ical/<id>/private-<key>/basic.ics,
 * and a primary calendar's id is its owner's address. A secondary calendar is
 * <hash>@group.calendar.google.com and an imported one @import.calendar.google.com:
 * calendars, not people, so neither is anybody's address.
 */
declare function calendarOwnerOf(url: string | null | undefined): string | null;
/** The business's own addresses, from the config every calendar reader already has: where it is alerted, and whose calendar it reads. */
declare function ownAddressesOf(cfg: {
    notifications?: {
        escalation_emails?: readonly string[] | null;
    } | null;
    calendar?: {
        ical_url?: string | null;
    } | null;
} | null | undefined): OwnAddresses;
/**
 * The phones, emails and guest names an event carries, wherever they were
 * written -- except the organiser's.
 *
 * The organiser is the calendar's owner, or the booking tool writing into it.
 * They are on EVERY event the feed carries, as ORGANIZER and usually among
 * the guests as well, and they are never who the appointment is for. Left in,
 * an owner who is also in People -- which the email channel makes likely,
 * since testing a new inbox means writing to it from your own address --
 * would take every appointment on their own calendar: by address, or by the
 * name their CN repeats on every line. So both come off, keyed by the
 * address, because that is the key the two arrive under. The cost is an
 * appointment a customer organised themselves, which stays unmatched --
 * matching nobody is the safe way to be wrong; attaching the owner is not.
 */
declare function extractContacts(item: Pick<FeedItem, "title" | "description" | "location" | "attendees" | "organizer">, own: OwnAddresses): EventContacts;
/**
 * A person whose whole name the text carries: four letters or more, on word
 * edges ("Dani" is not in "Daniela"), the longest match when several fit.
 * Never a bare number, never a name that is only a phone made words.
 */
declare function personInText(text: string, people: PersonLike[]): PersonLike | null;
/** Who the appointment is for: a phone in the event first, then an address, then a whole name in its title, guests or description. */
declare function matchPerson(item: Pick<FeedItem, "title" | "description" | "location" | "attendees" | "organizer">, everyone: PersonLike[], own: OwnAddresses): PersonMatch | null;
interface Visit {
    id: string;
    /** Epoch ms. */
    start: number;
    end: number;
    title: string;
    allDay: boolean;
    via: MatchVia;
}
interface Visits {
    /** The first appointment that has not ended. */
    next: Visit | null;
    /** The latest one that has. */
    last: Visit | null;
}
/** A feed indexed once — every item's phones, addresses and words found up front — so many people can be matched against it. */
interface FeedIndex {
    byPhone: Map<string, FeedItem[]>;
    /**
     * Lower-cased, as extractContacts gives them: every address the event
     * carried except the organiser's (#626) and the business's own (`own`). An
     * owner who is in People used to take every appointment they were a guest
     * on; the organiser rule covered them as organiser, and `own` as guest.
     */
    byEmail: Map<string, FeedItem[]>;
    texts: Array<{
        item: FeedItem;
        text: string;
    }>;
    /** The business's own addresses: taken off every event, and a person held under one has no visits. */
    own: OwnAddresses;
}
declare function indexFeed(items: FeedItem[], own: OwnAddresses): FeedIndex;
/** Every appointment of one person against an indexed feed, oldest first: their number first, their address second, their whole name third. */
declare function allVisitsIn(index: FeedIndex, person: PersonLike): Visit[];
/** One person's next and last appointment against an indexed feed: their number first, their address second, their whole name third. */
declare function visitsIn(index: FeedIndex, person: PersonLike, nowMs: number): Visits;
/** One person's next and last appointment in a parsed feed. */
declare function visitsOf(items: FeedItem[], person: PersonLike, nowMs: number, own: OwnAddresses): Visits;
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
    via: MatchVia;
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
declare function guessName(item: Pick<FeedItem, "title" | "attendees" | "organizer">, services?: string[]): string | null;
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
    /** Where the count came from: a calendar that was read, one that could not be read, or none connected. */
    calendar: "ok" | "unavailable" | "none";
    /** "12 of 40 booked" */
    headline: string;
    sub: string;
    /** What the share is of, for a page that draws the share itself (the sub is the share and these words); empty when nothing was counted. */
    words: string;
    pct: number | null;
    asked: number;
    booked: number;
    /** Of the ones who asked, how many still have nothing on the calendar. */
    unbooked: number;
    /** The share's other side, as a sentence of its own: "10 of the 26 who asked have nothing on the calendar yet",
     *  or the good news when everybody booked. Empty when there is nothing to count. */
    rest: string;
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
    /** As normalizeEmail stores it (00125). A person may have this and no number. */
    email: string | null;
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
    /** The wires their written words travelled: whatsapp, sms, email (00127). Absent on a row read before it. */
    message_channels?: string[] | null;
    queued_reply_at: string | null;
    /** Where they first came from (00138): calendar | lead | manual | import | call | whatsapp | sms | email, or null
     *  when nothing says. In words through cameFromOf; absent on a row read before the column existed. */
    came_from?: string | null;
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
    /** Every change to either answer, newest first: the ledger rows (contact.consent_changed), as evidence. */
    consent_history?: ConsentChange[];
}
/** What an owner may set for one person: answer, ask first, or stay out. */
type PersonMode = "auto" | "ask" | "never";
declare const PERSON_MODES: readonly PersonMode[];
declare const PERSON_MODE_LABELS: Record<PersonMode, string>;
/**
 * Every word for the receptionist's mode for one person, following the workspace included. The profile,
 * the bulk menu, a pill and an Ask receipt all say these: the mode was worded four ways on one journey
 * (Answer and Answer them, Never and Stay out, "Use the workspace setting" and "Follow the workspace").
 */
declare const PERSON_MODE_WORDS: Record<PersonMode | "inherit", string>;
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
/** "just now" · "5m ago" · "3h ago" · "2d ago", the business's date past a week — the one family (time.ts, clock.ts). */
declare function ago(ms: number, tz: string, nowMs: number): string;

type PersonChannel = "whatsapp" | "sms" | "voice" | "email";
/**
 * What the booking-link button says, by the wire a reply goes out on.
 *
 * Nothing is sent from the button: it opens the thread with the link ready in
 * the composer, or, where WhatsApp's window has shut, lets the thread offer the
 * approved template. Three pages carried their own two-way copy of these words,
 * so on an email-only person they read "Text the booking link" -- and before
 * the window was channel-aware, "Send the booking-link template", a template
 * that person cannot receive. `ready` is whether the composer may be filled.
 */
declare function bookingLinkAction(replyVia: "WhatsApp" | "Text" | "Email" | null, win: {
    open: boolean;
    hoursLeft: number;
} | null): {
    label: string;
    title: string;
    ready: boolean;
};
/** A channel in the owner's words. */
declare const PERSON_CHANNEL_WORDS: Record<PersonChannel, string>;
/**
 * Where a person first came from, as people_list decides it once (00138): the
 * door that added them (calendar, lead, manual), an imported history (import),
 * else their first call (call) or the wire of their first message (whatsapp,
 * sms, email). People's "Came from" column says it in these words; a stored
 * value is never shown.
 */
type PersonCameFrom = "whatsapp" | "sms" | "email" | "call" | "calendar" | "manual" | "import" | "lead";
/** The words for each, once: the three wires say what a reply on them says (REPLY_VIA), and a call says what its glyph says (PERSON_CHANNEL_WORDS.voice). */
declare const PERSON_CAME_FROM_WORDS: Record<PersonCameFrom, string>;
/** A row's came_from in words, or null: nothing known, a row read before 00138, or a value this build does not know. */
declare function cameFromOf(r: {
    came_from?: string | null;
}): {
    key: PersonCameFrom;
    label: string;
} | null;
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
    /** The offers answer in a word, as People's Offers column says it: Yes, No or Not asked. */
    marketingLabel: string;
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
/**
 * The ways a yes to OFFERS may have been given: in writing, and only in writing.
 *
 * Promotional texts need the customer's express WRITTEN consent. The carriers
 * refuse a campaign whose opt-in "relies on verbal consent instead of written
 * consent" -- Twilio lists it among the causes of error 30913 -- and CTIA's
 * principles require written consent for marketing. So a yes to offers is a
 * sign-up form the customer signed, or their own message; a spoken yes, in person
 * or on the phone, is a yes to messages about their visit and nothing more.
 *
 * 00095 said this in its own comment ("both are express written consent") while
 * its check let a spoken yes through. 00100 closes that in the database; this is
 * the same rule for the route and the menus, so all three say one thing.
 *
 * Only the YES is narrowed. A "no more offers" is honoured however it is said.
 */
declare const OFFERS_YES_SOURCES: readonly string[];
/** Why a yes to offers given this way cannot be recorded -- or null when it can. */
declare function offersYesRefusal(source: string | null | undefined): string | null;
/**
 * "Their own message" names the message (00137).
 *
 * A desk could record an answer "in their own message" with nothing behind it:
 * both doors took the source from any signed-in member, and the ledger then
 * said a customer had written something nobody had looked for. When the
 * conversation is in Chanlytics the desk now names the message they sent, and
 * the door copies its id and words into the evidence. An answer given
 * somewhere Chanlytics does not see is a sign-up form, with a note saying where.
 *
 * The database says these sentences too, so a refusal reads the same whichever
 * of the two gives it; their-own-message.db.test.mjs holds the two equal.
 */
declare const OWN_MESSAGE_REFUSALS: {
    /** Their own message, with no message named. */
    readonly missing: "Choose the message where they said it. If they wrote to you somewhere Chanlytics doesn't see, record a sign-up form and say where in the note.";
    /** The message named is not one this person sent this workspace. */
    readonly notTheirs: "That isn't a message this person sent you. Choose one of theirs.";
    /** The message named has nothing written in it. */
    readonly wordless: "That message has no words in it to show their answer. Choose the one where they said it.";
    /** A message named beside another way of answering. */
    readonly notOwnMessage: "Only an answer in their own message names a message.";
    /** Their own message, for many people at once: one message cannot be every person's. */
    readonly batch: "Their own message is recorded one person at a time, on their page, where you choose the message. For signed slips, choose Sign-up form.";
};
/** Why an answer given this way cannot be recorded with this message -- or null when it can. */
declare function ownMessageRefusal(source: string | null | undefined, messageId: string | null | undefined): string | null;
/** The words for a source; the reset has none, an unknown one is shown as itself. */
declare function consentSourceLabel(source: string | null | undefined): string | null;
/**
 * May a message of this purpose reach this person? A number to send to, and the
 * yes THIS message needs.
 *
 * IT LIVES HERE, beside `consentOf`, because it is a question about a person, and
 * because this module's own lists were answering it by hand. `offers_ok` and
 * `peopleListAction` each spelled "said yes to offers" as a bare
 * `consent.marketing === "opted_in"` -- no phone check -- while the broadcast route
 * enrolled with this. So a list could promise "4 said yes to offers -- a broadcast
 * reaches them" about people with no number the route would then leave out. It was
 * one rule in the commit message and three in the code.
 *
 * ONE RULE, NOT TWO. This used to restate `mayMessageFor`'s logic by hand,
 * because the two sides of one pipeline hold the person in two different shapes:
 * the route and the page hold a `PersonRowVM`, the send job holds the database
 * row. Two hand-written copies of a consent rule is the thing this file's own
 * header calls a defect, and it duly drifted -- the enrolment half asked for
 * marketing consent while the sending half asked what the template implied. So
 * the shape is adapted here and the QUESTION is answered in exactly one place.
 *
 * `proactive` is always true: a broadcast starts a conversation. Nobody wrote to
 * us to ask for it.
 *
 * THE PURPOSE IS REQUIRED, and that is the fix rather than a detail of it. It
 * used to default to marketing, described as "the safe answer for a caller that
 * has not thought about it" -- and every caller but one then failed to think
 * about it, so a utility message was refused to the very people migration 00095
 * exists to reach. A default cannot be audited; a required argument is checked
 * by the compiler at every call site, the way `businessRecordProblems` requires
 * its registration path.
 */
declare function mayReceive(r: Pick<PersonRowVM, "consent" | "phone">, purpose: SendPurpose): boolean;
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
    email: string | null;
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
    /** Where they first came from, in words (cameFromOf); null when nothing says. */
    cameFrom: {
        key: PersonCameFrom;
        label: string;
    } | null;
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
    /** The wire a reply goes out on, in words ("Email", "WhatsApp", "Text"); null for a person who has only phoned. */
    replyVia: "WhatsApp" | "Text" | "Email" | null;
    /** Their channels in words, in the order the page shows them: "WhatsApp · Phone", "Email". */
    channelWords: string;
    /** The booking-link button's words for the wire a reply goes out on (bookingLinkAction). */
    bookingLinkAction: {
        label: string;
        title: string;
        ready: boolean;
    };
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
declare function toPersonRowVM(r: PersonRowDto, tz: string, now?: Date): PersonRowVM;
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
 * Where a person's yes to offers is got: Broadcasts' "Get their yes" section,
 * brought into view -- the QR for the desk, the phrase, the link for a bio, the
 * paper form.
 *
 * Five places said the fix was there -- "The phrase and the QR are on
 * Broadcasts" -- and none of them went there: two steps opened the TOP of
 * Broadcasts, where the composer is and the QR is below the fold, and three
 * printed the sentence beside a disabled button. One route, one spelling.
 */
declare const GET_YES_ROUTE = "broadcasts/get-yes";
/**
 * The obvious next step for a list, when it has one. A broadcast reaches
 * only a recorded yes, so the sentence says how many of the list said it,
 * and the button waits until someone has.
 *
 * WHICH yes it counts is the MARKETING one, because these steps all open the
 * composer on a promotional send (win them back, reach the quiet ones, run an
 * offer). Counting the conversational answer here promised an audience the
 * composer would then refuse -- the same mismatch, one screen earlier.
 */
declare function peopleListAction(id: string, members: PersonRowVM[]): PeopleListAction | null;
/**
 * A list kept by hand has one onward step: a broadcast to the people on it who said yes to offers. The same
 * sentence and the same rule as a smart list's broadcast step, so the two kinds of list read alike on People,
 * which is where both live now (the Lists page folded into it).
 */
declare function savedListAction(id: string, members: PersonRowVM[]): PeopleListAction;
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
declare function attentionRow(p: PersonRowVM, tz: string, nowMs: number): AttentionRowVM;
type TimelineKind = "customer" | "receptionist" | "you" | "system" | "call" | "escalation" | "decision" | "visit" | "consent";
/**
 * How a profile's timeline narrows: everything, or one kind of record. "Messages" is the thread itself --
 * what was said, and the escalations and decisions in it; only "All" keeps the system lines.
 */
type TimelineFilterId = "all" | "messages" | "calls" | "visits" | "consent";
declare const TIMELINE_FILTERS: readonly {
    id: TimelineFilterId;
    label: string;
    kinds: readonly TimelineKind[] | null;
}[];
/** The items a filter shows, in the order they came; an unknown filter shows everything. */
declare function filterTimeline<T extends {
    kind: TimelineKind;
}>(items: readonly T[], id: string): T[];
/**
 * A consent change, in the words the timeline uses: what was answered, and
 * how we know. An answer the customer texted quotes them; one taken at the
 * desk names the way and the recorder's note. The words here are the only
 * ones the page has, so an owner reads "how do we know" without a database.
 */
declare function consentChangeWords(c: ConsentChange): {
    who: string;
    text: string;
    sub?: string;
};
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
    /** What they have written to you, newest first: the messages an answer "in their own message" may name (00137). */
    ownMessages: OwnMessageVM[];
}
/** One message a person wrote to the business, as the desk chooses it for an answer given in it. */
interface OwnMessageVM {
    /** The message's own id: what the door is handed, and what the evidence names. */
    id: string;
    /** What they wrote, on one line: the eighty characters the evidence keeps, and an ellipsis when there were more. */
    words: string;
    /** The wire it came on, in the page's word for it. */
    via: string;
    /** When they sent it, by the business's clock. */
    when: string;
}
declare function toPersonVM(d: PersonDetailDto, tz: string, now?: Date): PersonVM;

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
/** Meta's ceiling for the words on a button. */
declare const TEMPLATE_BUTTON_TEXT_MAX = 25;
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
    /**
     * One button under the words, opening a fixed address — the business's own
     * booking link. STATIC on purpose: a button whose URL takes a value needs a
     * parameter at send time, and `sendTemplate` puts the body on the wire and
     * nothing else, so such a template is refused by Meta for every recipient
     * (template-library.ts templateBlocked). A fixed link needs no parameter, so
     * this one sends exactly as it is written.
     */
    button?: {
        text: string;
        url: string;
    } | null;
}
interface TemplateDraft {
    name: string;
    language: string;
    category: TemplateCategoryChoice;
    body: string;
    footer: string | null;
    examples: string[];
    button: {
        text: string;
        url: string;
    } | null;
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
/**
 * Every slot's spec from a stored row, leniently: a value nothing recognises
 * stays as typed text, so a row written before the specs were typed still
 * renders. The one reader for the four places that used to spell this out.
 */
declare function parseParamSpecs(raw: unknown): ParamSpec[];
declare function paramLabel(spec: ParamSpec): string;
/**
 * The running playbooks that still send a template, as a refusal says it: "“Win-back” still sends this message.
 * Pause it, or give it another message, first." Deleting it would leave every later run skipped.
 */
declare function playbooksStillSending(names: readonly string[]): string;
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
/**
 * What actually sends a template.
 *
 * Every send names its template: a playbook keeps `template_name`, a broadcast
 * keeps `template_name`, and the Inbox picks the booking one by rule
 * (`bookingTemplate`). So the answer to "which of my messages does anything"
 * was one join away and nobody made it -- a workspace could carry a message
 * written in WhatsApp Manager a year ago that nothing has ever sent, and the
 * page that lists every template was the one place that could not say so.
 *
 * Keyed by NAME rather than by row, because a template is one message in
 * several languages and the thing that sends it names the message.
 */
interface TemplateUse {
    /** The playbooks that send it, by the name the owner gave them. */
    playbooks: {
        id: string;
        name: string;
        paused: boolean;
    }[];
    /** How many broadcasts a PERSON sent with it; a playbook's runs are its own. */
    broadcasts: number;
    /** The Inbox sends this one when somebody asks to book. */
    booking: boolean;
}
interface TemplateUseSource {
    playbooks: readonly {
        id: string;
        name: string;
        template_name: string;
        state?: string | null;
    }[];
    /** One entry per broadcast a person sent: a playbook's runs carry its id and are not counted here. */
    broadcasts: readonly {
        template_name: string;
        playbook_id?: string | null;
    }[];
    /** The name the Inbox books with, from `bookingTemplate`; null when the workspace has none. */
    bookingName: string | null;
}
/** One entry per template name that anything sends. A name absent from the map is sent by nothing. */
declare function templateUsage(src: TemplateUseSource): Record<string, TemplateUse>;
/**
 * What sends it, in one line. "Nothing sends it" is the answer worth showing:
 * it is the only one that asks the owner to do something about the message.
 */
declare function templateUseWords(use: TemplateUse | null | undefined): string;
/** True when nothing sends it: the one state the page draws differently. */
declare function templateUnused(use: TemplateUse | null | undefined): boolean;
/**
 * How many times a template actually went out, and when the latest did.
 *
 * Not a broadcast's `recipient_count`: that is the audience a run was scheduled
 * for, and the wire holds people back from it (no yes to offers, asked to stop,
 * no number, a person had the thread) while a run can stop part-way. Reports ›
 * Campaigns counts "Messages sent" apart from "Delivered" off the recipient rows
 * (campaign_series), and a Sent column summed from the audience would contradict
 * the page beside it. So this counts what that page counts -- a person a run
 * marked `sent` -- and the one door that page does not cover: a template the
 * Inbox sent into a thread whose window had closed, which left when WhatsApp
 * took it and the row got its wamid.
 *
 * Keyed by NAME, as `templateUsage` is: a run names its template, not a
 * language's row.
 */
interface TemplateSends {
    /** Messages that left with it: sent, which is not delivered and not read. */
    count: number;
    /** When the latest of them left (ISO), or null when none kept its time. */
    lastAt: string | null;
}
interface TemplateSendSource {
    /** Every broadcast -- one a person sent, or a playbook's run -- and the template it sent. */
    runs: readonly {
        id: string;
        template_name: string;
    }[];
    /** The people on those runs (`broadcast_recipients`). Only the ones in state `sent` went out. */
    recipients: readonly {
        broadcast_id: string;
        state: string;
        sent_at: string | null;
    }[];
    /** What the Inbox sent on a template (`messages.template_name`). Only the ones WhatsApp took -- a wamid -- went out. */
    inbox: readonly {
        template_name: string | null;
        external_id: string | null;
        created_at: string;
    }[];
}
/** One entry per template name that has gone out. A name absent from the map never has. */
declare function templateSends(src: TemplateSendSource): Record<string, TemplateSends>;
interface TemplateSentWords {
    /** "1,204": how many went out; null when none has. */
    count: string | null;
    /** "2d ago", "Jul 31" or "Never sent"; null when none of them kept its time. */
    when: string | null;
}
/**
 * The Sent cell. How long ago is said the way every page says it (time.ts):
 * "just now" · "3h ago" · "2d ago", and past a week the business's date.
 * A message that never went out says so in words: a "0" in a column of counts
 * reads as a quantity to compare with the others, and never is not one.
 */
declare function templateSentWords(s: TemplateSends | null | undefined, tz: string, nowMs: number): TemplateSentWords;

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
/**
 * A reply is an inbound within this long of the send; a question two weeks later is its own thread. The SQL series
 * keeps the same window (migration 00064's '72 hours'), and every page says it in these words.
 */
declare const REPLY_WINDOW_HOURS = 72;
declare const REPLY_WINDOW_MS: number;
declare const REPLY_WINDOW_WORDS = "within 3 days";
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
 * The people a broadcast may reach: the audience crossed with mayReceive.
 * The route enrols exactly these; the page shows exactly these counts.
 *
 * The purpose is required here for the same reason it is required above -- and
 * because this is the function every caller actually reaches for.
 */
declare function eligibleFor(rows: PersonRowVM[], kind: AudienceKind, id: string | null | undefined, savedIds: ReadonlySet<string> | null, 
/** What kind of message this audience is for. From the template's category, never assumed. */
purpose: SendPurpose): PersonRowVM[];
/**
 * A few of the people an audience really means, for a preview to walk through.
 *
 * An audience chip showed a count and nothing else, so the last thing an owner
 * saw before an irreversible send was a number: no way to see who the twenty-
 * three are, and no way to find out that three of them have no first name on
 * file and will be greeted "Hi there" (resolveParams, templates.ts). The rows
 * are already in hand -- the count is a length of exactly this list -- so this
 * takes the same pool and names a handful of it.
 *
 * The order is not the list's: an ordinary person first, then the first person
 * with no name on file if there is one, because that is the case nobody has
 * ever been shown and the one worth seeing. Anyone held back comes last, with
 * the reason in the operator's own words.
 */
interface PreviewPerson {
    id: string;
    /** What the operator calls them: their name, or the number on file. */
    label: string;
    /** The words the wire puts in a first-name slot, or null when nothing is on file. */
    firstName: string | null;
    /** Why nothing is sent to them, in the operator's words; null when it is. */
    refusal: string | null;
}
interface AudiencePreview {
    people: PreviewPerson[];
    /** How many the send really reaches, and how many in the list it does not. */
    sending: number;
    held: number;
}
declare function audiencePreview(rows: PersonRowVM[], kind: AudienceKind, id: string | null | undefined, savedIds: ReadonlySet<string> | null, purpose: SendPurpose, limit?: number): AudiencePreview;
/** The words a person will read: the body with its numbered slots filled. */
declare function renderTemplate(body: string | null | undefined, params: readonly string[]): string;
/**
 * One body value as Meta will accept it: trimmed, no line breaks or tabs, no
 * run of four spaces, under the ceiling. Null means "not acceptable".
 */
declare function cleanParam(raw: unknown): string | null;
/** A name when the owner gave none: the template and the day. */
declare function broadcastName(templateName: string, tz: string, now?: Date, title?: string | null): string;
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
    /** A failed broadcast's reason in the owner's words; null in any other state. */
    failureLabel: string | null;
}
/**
 * Why a whole broadcast stopped, in the owner's words: the codes the send job writes (core messages/broadcast.ts)
 * and the one the job ledger writes when a run died and none took it up again (jobs settle.ts). Spelled out, as
 * HELD_REASONS is, so the bundler can see through it.
 */
declare const BROADCAST_FAILURE_WORDS: Record<string, string>;
/** A failed broadcast's reason: its words, a code nobody has written words for yet, or none recorded. */
declare function broadcastFailureWords(failure: string | null | undefined): string;
/** "today 9:00 AM" · "tomorrow 9:00 AM" · "Sep 12 · 10:00 AM", by the business's day and clock (clock.ts). */
declare function whenLabel(iso: string, tz: string, now?: Date): string;
declare function toBroadcastVM(d: BroadcastDto, tz: string, now?: Date): BroadcastVM;
/**
 * The recipient's row while a send is in flight — and the reason it KEEPS if
 * the run never comes back to overwrite it.
 *
 * deliver() records a broadcast's message only once the provider has accepted
 * it, so a run killed in between leaves no message row at all: a resumed run
 * would find nothing, see the person still queued, and send them the same
 * template a second time. Written before the wire is touched, this is the row
 * saying "a run was mid-send here and nobody knows how it went" — the same
 * answer the ledger gives for an outbound_send whose run did not report back.
 */
declare const OUTCOME_UNKNOWN = "outcome_unknown";
/** The reasons a person is held back at the wire, in the owner's words. */
declare const HELD_REASONS: Record<string, string>;
/**
 * Why an audience came out empty, in the owner's words, for the purpose they
 * actually picked.
 *
 * The route used to refuse every empty audience with "Nobody there has said yes
 * to offers yet" -- which for a `utility` template names a consent that message
 * does not need and sends the owner to record an answer that would not help.
 *
 * Written out here rather than composed from `PURPOSE_REFUSALS`, and that is a
 * decision rather than a duplication: those sentences are about ONE PERSON, for a
 * reader looking at that person ("This customer has not said yes to OFFERS"), and
 * splicing one into an audience-level refusal produces a sentence that repeats
 * itself and calls an empty set "this customer". One source of truth is for FACTS.
 * The fact here is the reason code, which both registries key on and which a test
 * holds them both complete against; the prose is written for its own reader.
 */
declare function emptyAudienceRefusal(purpose: SendPurpose): string;
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
    /** When WhatsApp's receipts said so (00111 stamps each status as it arrives), and when the first reply came. */
    delivered_at: string | null;
    read_at: string | null;
    replied_at: string | null;
}
interface BroadcastDetailDto {
    broadcast: BroadcastDto;
    recipients: BroadcastRecipientDto[];
}

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
/**
 * The number on the bell's badge.
 *
 * Lives here because two surfaces say it: the badge itself, and Today's
 * "While you were away" head. They were two spellings of one fact and read
 * 4 and 0 on the same screen.
 */
declare function unreadCount(rows: readonly {
    unread: boolean;
}[]): number;
/** "now", "5m", "2h", "3d" — the bell's clock (the Inbox has its own `ago`). */
/** The bell's time: one family with every other surface (time.ts). */
declare function agoLabel(atMs: number, now: number): string;
/** The kinds a device is woken for; an invitation can wait for the bell. */
declare const ALERT_KINDS: readonly NotificationKind[];
/** What the edge writes when it raises an alert: the same kinds it emails. */
declare const SERVER_NOTIFICATION_KINDS: readonly ["handoff", "deadman", "call", "number", "sweep", "job_failed", "playbook", "calendar_people", "alert", "review", "billing", "template_ready", "template_blocked", "broadcast_sent", "broadcast_stopped", "leads_ready", "leads_question"];
type ServerNotificationKind = (typeof SERVER_NOTIFICATION_KINDS)[number];
/**
 * What a BACKGROUND JOB's alert can be. Four things, and a job says which;
 * none of them is read back off the subject.
 *
 * Every alert a job raised used to be kept as `job_failed`, because the one
 * place that addressed it hard-coded that kind for all six of its callers. A
 * broadcast that ran to completion ("Broadcast “Spring offer” sent, 38 people
 * got it") was therefore counted into Today's "6 jobs did not finish", in
 * warn amber, above everything else on the page, with a button to the Inbox.
 * Same defect as 00134's, where a template's approval arrived as the phone
 * number's bad news.
 */
type JobNewsKind = Extract<ServerNotificationKind, "job_failed" | "broadcast_sent" | "broadcast_stopped" | "handoff">;
/**
 * One alert from a job: what it IS, where its button goes, and the words.
 * The verb that raises it decides `kind` and `route`; the sender never
 * re-derives either (the rule waba-events.ts already follows). How it then
 * reads is SERVER_LOOK's, and how it groups is today.ts AWAY_NOUN's.
 */
interface JobNews {
    kind: JobNewsKind;
    /** A hash route without the leading "#/". */
    route: string;
    subject: string;
    body: string;
    /** What it is about, when it is one thing. */
    about?: {
        type: string;
        id: string;
    } | null;
}
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
 * A DERIVED "needs you" row's key: this prefix plus the thread's own id, which
 * for a real workspace is "th-" plus the conversation's. So the conversation a
 * derived row is about is its key with this prefix taken off — the only handle
 * such a row has, because it carries no `about` (nothing wrote it down; it is
 * computed from the Inbox the browser is already holding).
 */
declare const NEEDS_KEY_PREFIX = "needs:th-";
/** The conversation a derived "needs you" row stands for, or null. */
declare function conversationOfNeedsKey(key: string): string | null;
/** A derived missed-call row's key: this prefix plus the call's id (buildNotificationFeed). */
declare const CALL_KEY_PREFIX = "call:";
/** The call a derived missed-call row stands for, or null. */
declare function callOfKey(key: string): string | null;
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
type PlaybookPolicyClass = SchemaSet<"playbooks.policy_class">;
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
/** The hours a send may go out in, as the pages say them: "9:00–20:59", "between 9:00 and 20:59", and the hour a moved send waits for. */
declare const SENDING_HOURS_WORDS: {
    readonly min: 9;
    readonly max: 20;
    readonly first: "9:00";
    readonly range: "9:00–20:59";
    readonly between: "between 9:00 and 20:59";
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
 * The next moment a message may go out, by the business's clock: `when`
 * itself when it falls inside PLAYBOOK_HOURS (nine to the twenty-hundred
 * hour), nine that morning when it is earlier, nine the next morning when it
 * is later. The same window the playbooks keep, applied to a broadcast and to
 * a run somebody approves at night: a send asked for at 3 AM lands at nine,
 * and the receipt says it moved. Zone-aware through zoneMidnight, so the
 * night a clock changes still yields nine o'clock.
 */
declare function nextOpenMoment(tz: string, when: Date): {
    at: Date;
    moved: boolean;
};
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
/**
 * What a playbook will actually DO on its next run.
 *
 * "Running · next run tomorrow 10:00" is a promise, and on a workspace whose
 * list is empty it is one the run cannot keep. The salon had three playbooks,
 * two of them running every day, and every one of them watched a pool of
 * nought -- so two runs a day reached nobody and had been doing so since the
 * list emptied. The card said it: "0 people on the list said yes", in the
 * middle of a sentence, as a link, while the hour it would run at was in bold.
 *
 * An empty pool has two different causes and they are not the same news:
 * nobody on the list has said yes to offers (a thing to go and fix), or
 * everybody has and they all heard from you this week (a thing to wait out).
 */
type PlaybookReach = "waiting" | "paused" | "sends" | "nobody" | "all-heard";
declare function playbookReach(p: {
    state: string;
    candidates: number;
    held: number;
    waiting?: unknown;
}): PlaybookReach;
/**
 * Where a reach that can be fixed is fixed. "nobody": nobody on the list has
 * said yes to offers, so getting that yes is the move. "all-heard" is waited
 * out, not fixed, and gets no door.
 */
declare const PLAYBOOK_REACH_DOOR: Partial<Record<PlaybookReach, {
    label: string;
    to: string;
}>>;
/** The few words beside the state, when the schedule is not the whole truth; null when it is. */
declare const PLAYBOOK_REACH_WORDS: Record<PlaybookReach, string | null>;
declare const PLAYBOOK_CLASS_LABEL: Record<PlaybookPolicyClass, string>;
/**
 * The words a visit playbook's slots take for one person — when, and what
 * for — from the visit the run read. Resolved when the run is made and kept
 * on the recipient row, so the send says what the calendar said then.
 */
declare function visitFactsFor(trigger: string, visit: Pick<VisitDto, "start" | "title" | "all_day"> | null, tz: string, 
/** When the words will be read: the send's moment. Absent, they are read now, as the run assumes. */
sendAt?: Date): {
    visit_when: string;
    visit_service: string;
} | null;
/**
 * "tomorrow", "today", "yesterday", or the day's name: the visit's day as it
 * stands from the moment the words are read. A run asked for at eleven at
 * night goes at nine the next morning, and "tomorrow at 2:00 PM" said then is
 * the wrong day; the send's moment is what the words must be relative to.
 */
declare function visitDayWord(visit: Pick<VisitDto, "start">, tz: string, sendAt: Date | undefined, assumed: string): string;

/** One place, as the judge is shown it. Every string is capped at LEAD_FACT_MAX and stripped of control characters by judgeUserContent. */
interface PlaceFacts {
    ref: number;
    name: string;
    category: string | null;
    city: string | null;
    state: string | null;
    host: string | null;
    rating: number | null;
    reviews: number | null;
    /** The cleaned candidates, in the cleaner's order; the judge picks one by index. */
    emails: string[];
    /** The listing's number equals one on their site; null when the listing has no number. */
    phone_matches_site: boolean | null;
}
/** The keys a criterion's answer may cite: the facts, by name. */
declare const JUDGE_FACT_KEYS: readonly ["name", "category", "city", "state", "host", "rating", "reviews", "emails", "phone_matches_site"];
type JudgeFactKey = (typeof JUDGE_FACT_KEYS)[number];
type JudgeCriterionAnswer = "pass" | "fail" | "unknown";
interface JudgePlaceAnswer {
    ref: number;
    criteria: {
        key: string;
        answer: JudgeCriterionAnswer;
        facts: string[];
    }[];
    /** Into PlaceFacts.emails; null when none of them is the business's own. */
    email_index: number | null;
    /** Twelve words or fewer. */
    reason: string;
}
/**
 * Hand-written, the shape apps/edge/lib/brain.ts sends in production: every
 * property required, additionalProperties false, and no length or range
 * keywords (the API does not enforce them; the parser caps and checks after).
 */
declare const JUDGE_OUTPUT_SCHEMA: Record<string, unknown>;
/**
 * The criteria with their standards, and the exclusions as criteria the place
 * must not be. A seen standard must cite a fact key; a likely one may be
 * Claude's read of the facts. Unknown when the facts do not say.
 */
declare function judgeSystemPrompt(plan: LeadSearchPlan): string;
/** Each place's facts, capped and stripped, as quoted JSON inside a <places> block. */
declare function judgeUserContent(places: PlaceFacts[]): string;
/**
 * The answer, read by code. Rejected whole when a place is missing or answered
 * twice, a ref is not among the places, a criterion key is not the plan's or
 * is answered twice or not at all, a fact key is not one the place has, or an
 * email index is out of range. The reason is capped to twelve words.
 */
declare function parseJudgeAnswer(raw: unknown, plan: LeadSearchPlan, places: PlaceFacts[]): {
    ok: true;
    answers: JudgePlaceAnswer[];
} | {
    ok: false;
    why: string;
};
/** SHA-256 of a UTF-8 string, as lower-case hex. */
declare function sha256Hex(text: string): string;
/** The judge's operation id for one batch: sha256 hex of `${runId}:${fromOffset}:${batch}`, so a replayed page finds its answer and pays nothing (E4). */
declare function judgeOpId(runId: string, fromOffset: number, batch: number): string;

/**
 * The lead finder: the plan, the sets, the caps, and every rule with a right
 * answer (PRD 2026-09-17 v3 §0, §7.2, §10, §12, §13.3; release A1).
 *
 * Pure. The dashboard's routes, the edge's jobs and, later, the page read this
 * file. The model proposes a plan in these shapes and judges places criterion
 * by criterion (lead-judge.ts); everything decidable is decided here, by code:
 * what a junk address is, which class a place gets from the judge's answers
 * (§0.1), how many places a round asks for (S6), when the search stops to ask
 * (P4), which of the nine endings a round gets (S7), what a round is likely
 * to cost. No word here names the vendor that runs the searches: the owner
 * sees Claude finding businesses, and where each fact came from.
 */

declare const LEAD_SEARCH_VIAS: readonly ["people", "ask"];
type LeadSearchVia = (typeof LEAD_SEARCH_VIAS)[number];
declare const LEAD_ROUND_PURPOSES: readonly ["probe", "main", "topup", "renew"];
type LeadRoundPurpose = (typeof LEAD_ROUND_PURPOSES)[number];
declare const LEAD_ROUND_STATES: readonly ["queued", "probing", "waiting_on_owner", "running", "checking", "ended"];
type LeadRoundState = (typeof LEAD_ROUND_STATES)[number];
/** The nine endings, one closed set (§0.5, S7). */
declare const LEAD_ROUND_ENDINGS: readonly ["target_reached", "searched_everything", "month_leads_used", "budget_used", "few_new_matches", "stopped", "source_failed", "question_unanswered", "paused"];
type LeadRoundEnding = (typeof LEAD_ROUND_ENDINGS)[number];
declare const LEAD_ROUND_ANSWERS: readonly ["keep", "include", "stop"];
type LeadRoundAnswer = (typeof LEAD_ROUND_ANSWERS)[number];
declare const LEAD_RUN_PURPOSES: readonly ["discover", "check"];
declare const LEAD_RUN_STATES: readonly ["claimed", "starting", "running", "succeeded", "failed", "aborted", "timed_out", "unknown"];
type LeadRunState = (typeof LEAD_RUN_STATES)[number];
/** The five words of §10.4, plus `checking` while a batch is out. */
declare const LEAD_EMAIL_STATES: readonly ["none", "checking", "ok", "catch_all", "unknown", "invalid"];
type LeadEmailState = (typeof LEAD_EMAIL_STATES)[number];
declare const LEAD_STAGES: readonly ["ready", "nurture", "converted", "archived"];
declare const LEAD_CLOSED_REASONS: readonly ["said_no", "not_a_fit", "customer", "stale", "search_removed"];
declare const LEAD_MEMBER_CLASSES: readonly ["qualified", "review", "excluded"];
type LeadMemberClass = (typeof LEAD_MEMBER_CLASSES)[number];
declare const LEAD_FITS: readonly ["strong", "look", "long"];
type LeadFit = (typeof LEAD_FITS)[number];
declare const LEAD_COUNTER_KINDS: readonly ["allowance", "budget", "day"];
/** A's six, and release B's two: a lead's stage, and many at once. */
declare const LEAD_OPERATION_KINDS: readonly ["undo_search", "keep", "exclude", "put_back", "include", "stop", "stage", "bulk"];
declare const LEAD_PREFERENCE_KINDS: readonly ["chain", "wrong_kind", "too_far"];
declare const LEAD_SUPPRESSION_KINDS: readonly ["email", "place", "phone"];
declare const LEAD_SUPPRESSION_WHATS: readonly ["email_opt_out", "customer", "erased"];
/** §16.7, 18: Qualified leads a month, by the workspace's calendar month. */
declare const LEAD_MONTHLY_ALLOWANCE = 500;
/** §16.32: what searching may cost a workspace a month: scraping, judging, checks, retries. */
declare const LEAD_MONTHLY_BUDGET_USD = 25;
declare const LEAD_DAY_CAP_USD = 10;
declare const LEAD_PLATFORM_DAY_CAP_USD = 50;
/** §16.5: under this share of Qualified among the first places, the round stops and asks. */
declare const LEAD_QUESTION_THRESHOLD = 0.6;
/** Below this many judged places the question is not asked: too little to go on. */
declare const LEAD_QUESTION_MIN_EVIDENCE = 10;
declare const LEAD_PROBE_PLACES = 25;
declare const LEAD_JUDGE_BATCH = 25;
declare const LEAD_MAX_PLACES = 1000;
/** Every fact a place gives the judge is cut to this many characters (§7.1). */
declare const LEAD_FACT_MAX = 120;
/** The judge's one reason, in words (§0.1). */
declare const LEAD_REASON_MAX_WORDS = 12;
/**
 * The engine's own first criterion, on every plan: the place is the kind of
 * business the search names (PRD §7 step 4, "the right kind of business or
 * not"). It is not one the owner writes and not one the plan stores -- the
 * rubric asks it, the class rule reads it, the validator expects it, all by
 * this key -- because the first real searches showed what happens without
 * it: a photographer prospecting wedding planners was handed two other
 * photographers, a band and a caterer as Qualified, since the only criterion
 * on the plan was "could recommend a photographer", and all of them could.
 * A likely standard, because its evidence IS the name and category, which a
 * seen standard is not allowed to rest on.
 */
declare const LEAD_KIND_KEY = "kind";
/** What the Excluded chip says for a place that was the wrong kind: "Not a wedding planner". */
declare const leadKindWord: (name: string) => string;
/**
 * A place with no phone and no email is not a lead. It used to reach Needs
 * review as "phone:none" or "email:none" -- work dressed as a lead, and the
 * largest share of the review pile on the first five real searches. It is
 * left out under this key, and the chip says why (leads.ts leadExclusionWord).
 */
declare const LEAD_UNREACHABLE_KEY = "unreachable";
/** The yield assumed before a probe has measured one: half the places asked for qualify. The card's minutes and the route's estimate both read it. */
declare const LEAD_ASSUMED_YIELD = 0.5;
/** A round's estimate is reserved with this much room (§13.3: the cap is the estimate with room). */
declare const LEAD_ESTIMATE_MARGIN = 1.3;
/** The main round asks for the remainder over the probe's yield, clamped here (S6). */
declare const LEAD_ASK_MIN_FACTOR = 1.2;
declare const LEAD_ASK_MAX_FACTOR = 4;
/** An unanswered question ends the round after this long (§0.5). */
declare const LEAD_QUESTION_WAIT_MS: number;
type LeadContactStandard = "phone" | "email";
/** likely: Claude's read is enough. seen: a fact the card can show, cited by key (§0.1, 26). */
type LeadCriterionStandard = "likely" | "seen";
interface LeadCriterion {
    key: string;
    text: string;
    standard: LeadCriterionStandard;
    required: boolean;
}
/** A "Leaving out" chip. The judge answers it as a required criterion: `fail` means the place is what is left out. */
interface LeadExclusion {
    key: string;
    text: string;
    origin: "claude" | "you_said";
    category_key?: string;
}
interface LeadArea {
    kind: "zip" | "city" | "radius";
    /** As the sentence says it: "Austin, TX". */
    label: string;
    /** Two letters. */
    state: string;
    /** Null for a city ask until the probe's coordinates give one, or a ZIP ask until A2 derives it from the ZCTA table (§12.5, 31). */
    center: {
        lat: number;
        lng: number;
    } | null;
    radius_m: number;
    zip?: string;
    /** The card's own location query, built from the validated plan. */
    query: string;
}
interface LeadSearchPlan {
    version: number;
    card: "local_businesses";
    /** Who is sought, plural, as the sentence says it: "personal trainers". */
    name: string;
    /** The owner's words, at most 400 characters. */
    asked: string;
    terms: string[];
    area: LeadArea;
    count: number;
    contact: LeadContactStandard;
    criteria: LeadCriterion[];
    exclusions: LeadExclusion[];
}
/** The route's input and the door's: the same shape, checked twice on purpose. */
declare const LeadSearchPlanSchema: z.ZodType<LeadSearchPlan>;
/**
 * The plural the sentence calls them, with the area taken out of it (§8.3).
 * `name` is the model's own words, and a model asked for a plural writes the
 * place into it ("Hair salons in Brooklyn"), which the sentence then says
 * twice. A trailing place clause whose words are the area's is dropped; a
 * clause about something else ("pharmacies inside supermarkets") is kept. With
 * nothing left, the terms say who is sought, since those are the words the
 * source is actually searched with.
 */
declare function planWho(plan: LeadSearchPlan): string;
/**
 * Where the sentence says to look, with exactly one preposition -- code's, not
 * the model's. A label that already says where it is ("in Brooklyn, NY",
 * "within 25 miles of Austin") is said as it stands; anything else gets "in".
 */
declare function planWhere(area: LeadArea): string;
/**
 * The area as a bare noun, for a sentence that supplies its own preposition
 * ("There are 3 personal trainers in Austin, TX"): the label with a leading
 * place word and a radius phrase taken off, so nothing says "in" twice.
 */
declare function planArea(area: LeadArea): string;
/** One part of the plan's sentence: plain words, or a word the plan card makes a picker of. */
interface LeadPlanWord {
    text: string;
    /** Which picker this word opens on the card; null for the words between the pickers. */
    pick: "count" | "who" | "where" | "criterion" | "contact" | null;
    /** The criterion this word is, for a criterion picker. */
    key?: string;
}
/**
 * The plan as the words of one sentence, each marked with the picker it opens
 * (§7 step 2, §8.3): "Find 200 personal trainers in Austin, TX with a website,
 * then find their email and check it." The count, the plural, the area, each
 * criterion and the contact standard are the plan's own; nothing here reads
 * anything else. The sentence is derived once, here: the plan card draws these
 * words as buttons and `planSentence` joins them, so a card and a receipt can
 * never say the plan differently.
 */
declare function planWords(plan: LeadSearchPlan): LeadPlanWord[];
/** What the sentence's words say, with nothing marked: the sentence itself. */
declare function planSaid(plan: LeadSearchPlan): string;
/** What the plan leaves out, as one clause: " Leaving out: chain gyms." Empty when it leaves out nothing. */
declare function planLeavingOut(plan: LeadSearchPlan): string;
/**
 * The plan as one sentence, for a receipt, an Ask card's summary and a log:
 * the sentence the card draws, and what it leaves out. Every caller reads the
 * same words (§8.3).
 */
declare function planSentence(plan: LeadSearchPlan): string;
/** The counts the card's picker offers, unless the owner asked for a number of their own (§8.3). */
declare const LEAD_COUNT_CHOICES: readonly [50, 100, 200, 500];
/**
 * About how long a round takes, in minutes, for the card's "About 8 minutes --
 * leave the page if you like" and for the minutes beside each count in the
 * picker. From the places the round would ask for at the yield assumed before
 * a probe has measured one, the probe's own 25, and the card's rate. Never
 * under two minutes: a search that answers faster still reads as a moment.
 */
/** The most one area's terms can yield at the assumed rate: terms × the card's per-term cap × the yield. Above it the picker says so. */
declare function planCeiling(plan: LeadSearchPlan): number;
declare function planMinutes(plan: LeadSearchPlan): number;
/** The changed plan, with its version bumped when the area, count, contact standard, criteria or exclusions moved (S15). */
declare function planVersionOf(plan: LeadSearchPlan, changed: Partial<LeadSearchPlan>): LeadSearchPlan;
declare const LEAD_ENDING_WORDS: Record<LeadRoundEnding, string>;
/**
 * Which of the nine endings a round gets, in the order the facts outrank each
 * other (S7). The target overrides everything else: once it is reached, that
 * is the ending, whatever else happened on the page that reached it.
 * "Searched everything" only when every term returned fewer places than it
 * was asked for; otherwise the round ended at its limit with few new matches,
 * and the next step is another round in the same area.
 */
declare function endingOfRound(x: {
    counted: number;
    target: number;
    termsShort: boolean[];
    budgetLeftUsd: number;
    allowanceLeft: number;
    stopped: boolean;
    sourceFailed: boolean;
    unanswered: boolean;
    paused: boolean;
}): LeadRoundEnding;
/** The half of a card Claude reads (§0.3, 23). The half code holds is A2's `CARDS`. */
interface LeadCardBrief {
    id: "local_businesses";
    goodFor: string[];
    notFor: string[];
    settings: string[];
    /** Bronze prices, 18 Sep 2026 (§10.1). */
    costPerPlaceUsd: number;
    contactsPerPlaceUsd: number;
    judgePerPlaceUsd: number;
    checkPerEmailUsd: number;
    startUsd: number;
    /** One search on the source tops out near this many places (§7 step 3). */
    maxPerTerm: number;
    /** How many places this card gets through in a minute, discovery, contacts, judging and checks together: the card's "About 8 minutes". */
    placesPerMinute: number;
    examples: string[];
    approved: true;
}
declare const LEAD_CARDS: readonly LeadCardBrief[];
/**
 * What a round is likely to cost, from the card's prices, with room (§13.3):
 * discovery and contacts per place asked, the judge per place, the mailbox
 * check per place under an email standard, and one start per term. The route
 * computes it, the door stores it, the counters reserve it.
 */
declare function estimateRoundUsd(plan: LeadSearchPlan, purpose: LeadRoundPurpose, placesToAsk: number): number;
/**
 * How many places to ask the source for (S6). The probe asks for 25 spread
 * across every term (E10). A later round asks for the remainder over the
 * yield so far (new Qualified places per place asked), clamped between 1.2x
 * and 4x the remainder, never past LEAD_MAX_PLACES or what one term can
 * return. `yieldSoFar` null means the probe. `remaining` at or under zero asks
 * for nothing at all; when the total is smaller than the number of terms, a
 * term asked for 0 got nothing to ask for, and a caller skips it.
 */
declare function placesToAsk(plan: LeadSearchPlan, remaining: number, yieldSoFar: number | null): {
    total: number;
    perTerm: number[];
};
interface LeadClassification {
    class: LeadMemberClass;
    /** The criterion or exclusion whose required fail excluded the place; null otherwise. */
    excluded_by: string | null;
    /** For ordering only, never for counting. Null when excluded. */
    fit: LeadFit | null;
    /** Why it is not simply Qualified: `fail:<key>`, `unknown:<key>`, `inferred:<key>`, `out_of_area`, `email:<state>`, `phone:none`. */
    reasons: string[];
}
/** The reason tokens of a contact standard not met, so SQL and the check can find "the email was the only reason". */
declare const LEAD_EMAIL_REASON: RegExp;
/**
 * Code decides the class from the judge's per-criterion answers (§0.1, 26).
 * Exclusions are checked before criteria, so a place that is both a chain and
 * without a website is tallied as the chain. Only a REQUIRED criterion (or an
 * exclusion: every exclusion is required) gates the class: a required fail
 * excludes, with that key as the reason; a required criterion answered
 * `unknown`, or a required seen criterion only read (no fact cited beyond the
 * name or category, which are descriptions, not evidence), sends the place to
 * review. An optional criterion never excludes and never sends a place to
 * review by itself — it only softens the fit band. A place with no location
 * or one outside the area, or a contact standard not met, also sends it to
 * review. Everything else qualifies. A fit band is derived for ordering.
 */
declare function classify(plan: LeadSearchPlan, answer: JudgePlaceAnswer, facts: PlaceFacts, emailState: LeadEmailState, inArea: boolean): LeadClassification;
interface ProbeMember {
    class: LeadMemberClass;
    excluded_by: string | null;
    term?: string | null;
}
type LeadQuestion = {
    ask: true;
    sentence: string;
    criterionKey: string;
    dropTerm: string | null;
} | {
    ask: false;
};
/**
 * An intent check, never an accuracy measure (P4). Measured by exclusion, not
 * by qualification: under an email standard almost nothing is Qualified yet
 * while the mailbox checks are still out, so Review must never read as a no.
 * Over the probe's places, when more than 1 − LEAD_QUESTION_THRESHOLD were
 * excluded, the round waits and asks whether the search matches what the
 * owner meant, from the most common exclusion. Only an exclusion's own tally
 * can be the topic: Include lifts an exclusion, and must never be offered
 * against a real requirement, so a place excluded by a required criterion is
 * not counted here. The sentence's own lead word ("Most"/"Half"/"Some") comes
 * from that chip's own share of the first n, never from everything excluded
 * for any reason (P2, S12: a line claims only what it names); when more
 * places were excluded than the chip accounts for, the sentence says so with
 * "and other kinds of places". A term is dropped first when it is demonstrably the
 * problem and at least one other term with enough places is demonstrably
 * working; never when every term is bad, and never on the strength of a term
 * nobody else has tried. It never asks the owner to relax a fact.
 */
declare function questionAfterProbe(plan: LeadSearchPlan, members: ProbeMember[]): LeadQuestion;
/** Hosts that are a booking platform or a social page: a business there has no site of its own. */
declare const LEAD_PLATFORM_HOSTS: readonly ["vagaro.com", "square.site", "squareup.com", "glossgenius.com", "godaddysites.com", "wixsite.com", "business.site", "facebook.com", "instagram.com", "linktr.ee", "yelp.com", "booksy.com", "fresha.com", "styleseat.com", "schedulicity.com", "mindbodyonline.com", "setmore.com", "acuityscheduling.com", "google.com"];
/** Address domains that are never the business: platforms, builders' placeholders, trackers. */
declare const LEAD_JUNK_EMAIL_DOMAINS: readonly ["vagaro.com", "square.site", "squareup.com", "glossgenius.com", "godaddy.com", "wix.com", "wixpress.com", "sentry.io", "example.com", "domain.com", "yourdomain.com", "email.com"];
/** Local parts that are a template's placeholder, not a mailbox. */
declare const LEAD_PLACEHOLDER_LOCALS: readonly ["filler", "yourdomain", "youremail", "your", "example", "email", "name", "user", "username", "test", "noreply", "no-reply", "donotreply"];
/** Corporate roles that are not how a business takes a customer (§7.2). */
declare const LEAD_ROLE_LOCALS: readonly ["careers", "career", "jobs", "recruiting", "recruitment", "hr", "media", "press", "pr", "privacy", "legal", "webmaster", "abuse", "postmaster"];
declare const LEAD_FREE_MAIL: readonly ["gmail.com", "yahoo.com", "outlook.com", "hotmail.com", "icloud.com", "aol.com", "live.com", "msn.com", "me.com", "protonmail.com", "proton.me"];
interface CleanedEmails {
    /** Best first: the business's own (five at most, a front desk first), free-mail (three), another company's (two). */
    kept: string[];
    dropped: {
        email: string;
        why: "malformed" | "duplicate" | "junk_domain" | "placeholder" | "role" | "image" | "foreign_list" | "over_limit";
    }[];
}
/**
 * The addresses worth showing the judge, and why each of the others was
 * dropped (§7.2). When the page names more than three other companies'
 * domains, that is a list of partners or brands, not the business, and none
 * of theirs is kept.
 */
declare function cleanEmailCandidates(emails: string[], host: string | null): CleanedEmails;
/** A US number anyone can dial, in E.164; null for a placeholder, a mis-prefixed number or a foreign one. */
declare function usPhone(raw: string | null | undefined): string | null;
/** The website's host, www. removed; null when there is none of their own (a platform, a social page). */
declare function siteHost(url: string | null | undefined): string | null;
/** "Texas" or "TX" → "TX"; null for anything that is not a US state or DC. */
declare function stateCode(raw: string | null | undefined): string | null;
/** 'YYYY-MM' in the workspace's zone: the month a lead counts in (§0.2, 15). lead_month() in 00140 says the same. */
declare function leadMonth(zone: string, at: Date): string;

/**
 * The database's closed sets, and every hand-kept copy held to them.
 *
 * SCHEMA_SETS is generated from the CHECK constraints themselves
 * (schema-sets.generated.ts, written by tooling/scripts/gen-schema-sets.mjs).
 * The lists written by hand stay where they are, because they carry an order, a
 * comment per value, or a narrower meaning. Each is held here to its column:
 * exactly where it mirrors it, as a subset where it is narrower on purpose. When
 * a migration changes a set and the file is regenerated, a stale copy stops
 * compiling on the line below that names it. packages/channels holds its own two
 * copies the same way, in channels/src/schema-agreement.ts.
 *
 * This replaced a test that read the migrations as text and had to guess which
 * CHECK was the latest -- it guessed wrong twice, and it could see 20 of the 53
 * sets. The database cannot be wrong about its own constraints.
 */

type SchemaSetKey = keyof typeof SCHEMA_SETS;
/** The values one column's CHECK allows, e.g. SchemaSet<"lines.voice_state">. */
type SchemaSet<K extends SchemaSetKey> = (typeof SCHEMA_SETS)[K][number];
/** true when A and B are the same set of literals. */
type Exactly<A, B> = [A] extends [B] ? ([B] extends [A] ? true : false) : false;
/** true when every literal in A is also in B. */
type Within<A, B> = [A] extends [B] ? true : false;
/** Compiles only when T is true, so the failing line names the pair that drifted. */
type Holds<T extends true> = T;
type Of<T extends readonly unknown[]> = T[number];
type SchemaAgreement = [
    Holds<Exactly<Of<typeof TENANT_STATUSES>, SchemaSet<"tenants.status">>>,
    Holds<Exactly<Of<typeof MEMBERSHIP_ROLES>, SchemaSet<"memberships.role">>>,
    Holds<Within<SchemaSet<"invitations.role">, Of<typeof MEMBERSHIP_ROLES>>>,
    Holds<Exactly<Of<typeof CHANNEL_KINDS>, SchemaSet<"tenant_channels.kind">>>,
    Holds<Exactly<Of<typeof CAPABILITY_KINDS>, SchemaSet<"capability_activations.capability">>>,
    Holds<Exactly<Of<typeof CHANNEL_KINDS>, SchemaSet<"contact_identities.channel">>>,
    Holds<Exactly<Of<typeof CHANNEL_KINDS>, SchemaSet<"templates.channel">>>,
    Holds<Exactly<Of<typeof CONSENT_STATES>, SchemaSet<"contacts.consent">>>,
    Holds<Exactly<Of<typeof CONSENT_STATES>, SchemaSet<"contacts.marketing_consent">>>,
    Holds<Exactly<Of<typeof CONVERSATION_STATES>, SchemaSet<"conversations.state">>>,
    Holds<Exactly<Of<typeof MESSAGE_CHANNELS>, SchemaSet<"messages.channel">>>,
    Holds<Exactly<Of<typeof MESSAGE_DIRECTIONS>, SchemaSet<"messages.direction">>>,
    Holds<Exactly<Of<typeof MESSAGE_SENDERS>, SchemaSet<"messages.sender">>>,
    Holds<Exactly<Of<typeof MESSAGE_TYPES>, SchemaSet<"messages.type">>>,
    Holds<Exactly<Of<typeof MESSAGE_STATUSES>, SchemaSet<"messages.status">>>,
    Holds<Exactly<Of<typeof JOB_KINDS>, SchemaSet<"jobs.kind">>>,
    Holds<Exactly<Of<typeof JOB_STATES>, SchemaSet<"jobs.state">>>,
    Holds<Exactly<Of<typeof ESCALATION_REASONS>, SchemaSet<"escalations.reason">>>,
    Holds<Exactly<Of<typeof ESCALATION_STATES>, SchemaSet<"escalations.state">>>,
    Holds<Exactly<Of<typeof DECISION_VERBS>, SchemaSet<"decisions.verb">>>,
    Holds<Exactly<Of<typeof DECISION_SUBJECTS>, SchemaSet<"decisions.subject_type">>>,
    Holds<Exactly<Of<typeof ACTOR_TYPES>, SchemaSet<"decisions.actor_type">>>,
    Holds<Exactly<Of<typeof TEMPLATE_STATUSES>, SchemaSet<"templates.meta_status">>>,
    Holds<Within<Of<typeof TEMPLATE_CATEGORIES>, SchemaSet<"templates.category">>>,
    Holds<Exactly<Of<typeof POLICY_CLASSES>, SchemaSet<"policies.class">>>,
    Holds<Exactly<Of<typeof POLICY_MODES>, SchemaSet<"policies.mode">>>,
    Holds<Exactly<Of<typeof SERVER_NOTIFICATION_KINDS>, SchemaSet<"notifications.kind">>>,
    Holds<Exactly<Of<typeof BROADCAST_STATES>, SchemaSet<"broadcasts.state">>>,
    Holds<Exactly<Of<typeof RECIPIENT_STATES>, SchemaSet<"broadcast_recipients.state">>>,
    Holds<Exactly<Of<typeof PLAYBOOK_STATES>, SchemaSet<"playbooks.state">>>,
    Holds<Exactly<(typeof PLAYBOOK_TRIGGERS)[number]["id"], SchemaSet<"playbooks.trigger">>>,
    Holds<Within<SchemaSet<"playbooks.policy_class">, Of<typeof POLICY_CLASSES>>>,
    Holds<Exactly<Of<typeof MESSAGE_DIRECTIONS>, SchemaSet<"calls.direction">>>,
    Holds<Exactly<Of<typeof CALL_OUTCOMES>, SchemaSet<"calls.outcome">>>,
    Holds<Exactly<Of<typeof BILLING_MODES>, SchemaSet<"billing_accounts.mode">>>,
    Holds<Exactly<Of<typeof BILLING_STATUSES>, SchemaSet<"billing_accounts.status">>>,
    Holds<Exactly<Of<typeof BUSINESS_TYPES>, SchemaSet<"business_records.business_type">>>,
    Holds<Exactly<Of<typeof COMPANY_TYPES>, SchemaSet<"business_records.company_type">>>,
    Holds<Exactly<Of<typeof LEAD_SEARCH_VIAS>, SchemaSet<"lead_searches.via">>>,
    Holds<Exactly<Of<typeof LEAD_ROUND_PURPOSES>, SchemaSet<"lead_rounds.purpose">>>,
    Holds<Exactly<Of<typeof LEAD_ROUND_STATES>, SchemaSet<"lead_rounds.state">>>,
    Holds<Exactly<Of<typeof LEAD_ROUND_ENDINGS>, SchemaSet<"lead_rounds.ending">>>,
    Holds<Exactly<Of<typeof LEAD_ROUND_ENDINGS>, SchemaSet<"lead_rounds.ending_pending">>>,
    Holds<Exactly<Of<typeof LEAD_ROUND_ANSWERS>, SchemaSet<"lead_rounds.answered">>>,
    Holds<Exactly<Of<typeof LEAD_RUN_PURPOSES>, SchemaSet<"lead_runs.purpose">>>,
    Holds<Exactly<Of<typeof LEAD_RUN_STATES>, SchemaSet<"lead_runs.state">>>,
    Holds<Exactly<Of<typeof LEAD_EMAIL_STATES>, SchemaSet<"leads.email_state">>>,
    Holds<Exactly<Of<typeof LEAD_STAGES>, SchemaSet<"leads.stage">>>,
    Holds<Exactly<Of<typeof LEAD_CLOSED_REASONS>, SchemaSet<"leads.closed_reason">>>,
    Holds<Exactly<Of<typeof LEAD_MEMBER_CLASSES>, SchemaSet<"lead_search_members.class">>>,
    Holds<Exactly<Of<typeof LEAD_FITS>, SchemaSet<"lead_search_members.fit">>>,
    Holds<Exactly<Of<typeof LEAD_COUNTER_KINDS>, SchemaSet<"lead_counters.kind">>>,
    Holds<Exactly<Of<typeof LEAD_OPERATION_KINDS>, SchemaSet<"lead_operations.kind">>>,
    Holds<Exactly<Of<typeof LEAD_PREFERENCE_KINDS>, SchemaSet<"lead_preferences.kind">>>,
    Holds<Exactly<Of<typeof LEAD_SUPPRESSION_KINDS>, SchemaSet<"lead_suppressions.kind">>>,
    Holds<Exactly<Of<typeof LEAD_SUPPRESSION_WHATS>, SchemaSet<"lead_suppressions.what">>>
];

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
    find: boolean;
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
/** The four modes. 'veto' is honoured where there is something to hold: a
 *  reply waits in the hold window as a draft, a playbook run waits thirty
 *  minutes; POLICY_CLASS_MODES says which classes offer it. The runtime
 *  treats an unexpected mode as 'ask' (fail safe). */
declare const POLICY_MODES: readonly ["auto", "veto", "ask", "never"];
type PolicyMode = (typeof POLICY_MODES)[number];
/**
 * What each mode DOES, in the owner's words — the matrix's column headings, the
 * name a phone puts over each dot, and the words a policy chip says after the
 * dot.
 *
 * The stored values stay `auto | veto | ask | never`: those are filing words. A
 * salon owner does not say "veto", and the plain sentence for each mode existed
 * only as a hover tip on the column heading — which a phone has no way to
 * trigger and a mouse has no reason to look for. The heading says it instead.
 *
 * `head` is verb-first with the receptionist as its subject, `sub` is the one
 * clause that tells it apart from its neighbour, `chip` is the same fact small
 * enough for a pill, `does` is the whole sentence for a control's title. No
 * heading names a duration: how long a hold lasts belongs to the class (a reply
 * waits the workspace's hold window, a playbook run waits thirty minutes), and a
 * heading that said "30s" would be wrong on four of the six rows.
 */
declare const POLICY_MODE_WORDS: Record<PolicyMode, {
    head: string;
    sub: string;
    chip: string;
    does: string;
}>;
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
 * The Autonomy tab's Booking row holds the booking link back: it is not on
 * "auto", so a person confirms instead. An unknown mode counts, fail safe, as it
 * does in policyAskClass.
 *
 * The edge asks this question inline, through policyAskClass, and this must keep
 * agreeing with every place it does: apps/edge/api/retell-fn.ts (its
 * `bookingHeld`, which outbound-gate.ts refuses as booking_needs_a_person),
 * apps/edge/api/retell-availability.ts (which then offers a caller no times) and
 * apps/edge/lib/whatsapp/steps.ts layerTwo (which takes the link back out of a
 * chat reply classed as a booking -- a price or services reply still carries it).
 * Stated here so the Business tab reads the rule instead of keeping a copy of it.
 */
declare function bookingHeld(policy: Record<string, {
    mode: string;
}> | null | undefined): boolean;
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
    reply_delay_ms: z.ZodOptional<z.ZodNumber>;
    min_confidence: z.ZodOptional<z.ZodNumber>;
    max_llm_tokens_day: z.ZodOptional<z.ZodNumber>;
}, z.core.$strict>;
type PolicyLimits = z.infer<typeof PolicyLimitsSchema>;
interface PolicyRow {
    id: string;
    class: PolicyClass;
    mode: PolicyMode;
    subject_type: SchemaSet<"policies.subject_type"> | null;
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
}, z.core.$strip>;
declare const HoursSchema: z.ZodObject<{
    open: z.ZodOptional<z.ZodNullable<z.ZodString>>;
    close: z.ZodOptional<z.ZodNullable<z.ZodString>>;
    intervals: z.ZodOptional<z.ZodArray<z.ZodObject<{
        open: z.ZodString;
        close: z.ZodString;
    }, z.core.$strip>>>;
}, z.core.$strict>;
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
}, z.core.$strip>;
declare const DAYS: readonly ["mon", "tue", "wed", "thu", "fri", "sat", "sun"];
declare const ServiceSchema: z.ZodObject<{
    name: z.ZodString;
    duration_min: z.ZodOptional<z.ZodNumber>;
    price_note: z.ZodOptional<z.ZodString>;
}, z.core.$strict>;
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
    no_health_advice: z.ZodOptional<z.ZodBoolean>;
}, z.core.$strict>;
/**
 * A thing the receptionist should know that fits no field — the academy, the
 * chair rental, the parking. One topic each, said by BOTH receptionists. The
 * long tail that a knowledge base would hold later; never the hours or the
 * booking link, which have fields.
 */
declare const NoteSchema: z.ZodObject<{
    title: z.ZodString;
    text: z.ZodString;
}, z.core.$strict>;
type Note = z.infer<typeof NoteSchema>;
/**
 * How bookings may be OFFERED — never made. The receptionist sends the link;
 * these shape which open times it names first and what it says about them.
 */
declare const BookingRulesSchema: z.ZodObject<{
    lead_hours: z.ZodOptional<z.ZodNumber>;
    buffer_min: z.ZodOptional<z.ZodNumber>;
    max_days_ahead: z.ZodOptional<z.ZodNumber>;
    slot_min: z.ZodOptional<z.ZodNumber>;
    consult_first: z.ZodOptional<z.ZodArray<z.ZodString>>;
    party_max: z.ZodOptional<z.ZodNumber>;
    notes: z.ZodOptional<z.ZodArray<z.ZodString>>;
}, z.core.$strict>;
type BookingRules = z.infer<typeof BookingRulesSchema>;
/** E.164: a plus, then 7–15 digits, no leading zero. */
declare const E164: RegExp;
/**
 * The most either set of the receptionist's instructions holds: the prompt a
 * workspace wrote before it had fields, and the owner's own instructions that
 * prompt is carried into. One number, so a carried prompt always fits. The
 * owner's held 8,000 characters against the prompt's 20,000, and a longer
 * prompt failed every save of the form on a box nobody had touched (the
 * wiring audit's S4).
 */
declare const INSTRUCTIONS_MAX = 20000;
declare const BusinessProfileSchema: z.ZodObject<{
    address: z.ZodOptional<z.ZodString>;
    hours: z.ZodOptional<z.ZodRecord<z.ZodEnum<{
        mon: "mon";
        tue: "tue";
        wed: "wed";
        thu: "thu";
        fri: "fri";
        sat: "sat";
        sun: "sun";
    }> & z.core.$partial, z.ZodObject<{
        open: z.ZodOptional<z.ZodNullable<z.ZodString>>;
        close: z.ZodOptional<z.ZodNullable<z.ZodString>>;
        intervals: z.ZodOptional<z.ZodArray<z.ZodObject<{
            open: z.ZodString;
            close: z.ZodString;
        }, z.core.$strip>>>;
    }, z.core.$strict>>>;
    closures: z.ZodOptional<z.ZodArray<z.ZodObject<{
        date: z.ZodString;
        until: z.ZodOptional<z.ZodString>;
        note: z.ZodOptional<z.ZodString>;
    }, z.core.$strip>>>;
    services: z.ZodOptional<z.ZodArray<z.ZodObject<{
        name: z.ZodString;
        duration_min: z.ZodOptional<z.ZodNumber>;
        price_note: z.ZodOptional<z.ZodString>;
    }, z.core.$strict>>>;
    languages: z.ZodOptional<z.ZodArray<z.ZodString>>;
    guardrails: z.ZodOptional<z.ZodObject<{
        never_quote_prices: z.ZodOptional<z.ZodBoolean>;
        never_confirm_booking: z.ZodOptional<z.ZodBoolean>;
        disclose_ai: z.ZodOptional<z.ZodBoolean>;
        no_health_advice: z.ZodOptional<z.ZodBoolean>;
    }, z.core.$strict>>;
    escalate_when: z.ZodOptional<z.ZodArray<z.ZodString>>;
    tone: z.ZodOptional<z.ZodString>;
    handoff_number: z.ZodOptional<z.ZodString>;
    website: z.ZodOptional<z.ZodString>;
    notes: z.ZodOptional<z.ZodArray<z.ZodObject<{
        title: z.ZodString;
        text: z.ZodString;
    }, z.core.$strict>>>;
    booking_rules: z.ZodOptional<z.ZodObject<{
        lead_hours: z.ZodOptional<z.ZodNumber>;
        buffer_min: z.ZodOptional<z.ZodNumber>;
        max_days_ahead: z.ZodOptional<z.ZodNumber>;
        slot_min: z.ZodOptional<z.ZodNumber>;
        consult_first: z.ZodOptional<z.ZodArray<z.ZodString>>;
        party_max: z.ZodOptional<z.ZodNumber>;
        notes: z.ZodOptional<z.ZodArray<z.ZodString>>;
    }, z.core.$strict>>;
    extra_instructions: z.ZodOptional<z.ZodString>;
}, z.core.$strict>;
type BusinessProfile = z.infer<typeof BusinessProfileSchema>;
type Hours = z.infer<typeof HoursSchema>;
type Service = z.infer<typeof ServiceSchema>;
type Interval = z.infer<typeof IntervalSchema>;
type Closure = z.infer<typeof ClosureSchema>;
declare const BrainConfigSchema: z.ZodObject<{
    business_name: z.ZodString;
    phone_display: z.ZodOptional<z.ZodString>;
    booking_link: z.ZodString;
    system_prompt: z.ZodString;
    profile: z.ZodOptional<z.ZodObject<{
        address: z.ZodOptional<z.ZodString>;
        hours: z.ZodOptional<z.ZodRecord<z.ZodEnum<{
            mon: "mon";
            tue: "tue";
            wed: "wed";
            thu: "thu";
            fri: "fri";
            sat: "sat";
            sun: "sun";
        }> & z.core.$partial, z.ZodObject<{
            open: z.ZodOptional<z.ZodNullable<z.ZodString>>;
            close: z.ZodOptional<z.ZodNullable<z.ZodString>>;
            intervals: z.ZodOptional<z.ZodArray<z.ZodObject<{
                open: z.ZodString;
                close: z.ZodString;
            }, z.core.$strip>>>;
        }, z.core.$strict>>>;
        closures: z.ZodOptional<z.ZodArray<z.ZodObject<{
            date: z.ZodString;
            until: z.ZodOptional<z.ZodString>;
            note: z.ZodOptional<z.ZodString>;
        }, z.core.$strip>>>;
        services: z.ZodOptional<z.ZodArray<z.ZodObject<{
            name: z.ZodString;
            duration_min: z.ZodOptional<z.ZodNumber>;
            price_note: z.ZodOptional<z.ZodString>;
        }, z.core.$strict>>>;
        languages: z.ZodOptional<z.ZodArray<z.ZodString>>;
        guardrails: z.ZodOptional<z.ZodObject<{
            never_quote_prices: z.ZodOptional<z.ZodBoolean>;
            never_confirm_booking: z.ZodOptional<z.ZodBoolean>;
            disclose_ai: z.ZodOptional<z.ZodBoolean>;
            no_health_advice: z.ZodOptional<z.ZodBoolean>;
        }, z.core.$strict>>;
        escalate_when: z.ZodOptional<z.ZodArray<z.ZodString>>;
        tone: z.ZodOptional<z.ZodString>;
        handoff_number: z.ZodOptional<z.ZodString>;
        website: z.ZodOptional<z.ZodString>;
        notes: z.ZodOptional<z.ZodArray<z.ZodObject<{
            title: z.ZodString;
            text: z.ZodString;
        }, z.core.$strict>>>;
        booking_rules: z.ZodOptional<z.ZodObject<{
            lead_hours: z.ZodOptional<z.ZodNumber>;
            buffer_min: z.ZodOptional<z.ZodNumber>;
            max_days_ahead: z.ZodOptional<z.ZodNumber>;
            slot_min: z.ZodOptional<z.ZodNumber>;
            consult_first: z.ZodOptional<z.ZodArray<z.ZodString>>;
            party_max: z.ZodOptional<z.ZodNumber>;
            notes: z.ZodOptional<z.ZodArray<z.ZodString>>;
        }, z.core.$strict>>;
        extra_instructions: z.ZodOptional<z.ZodString>;
    }, z.core.$strict>>;
    fallbacks: z.ZodObject<{
        greeting: z.ZodString;
        error: z.ZodString;
        non_text: z.ZodString;
    }, z.core.$strict>;
}, z.core.$strict>;
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
declare function newReceptionistDefaults(businessName: string): Pick<BrainConfig, "system_prompt" | "fallbacks">;
/** The product's own opening lines, whatever business name they were written with -- words no owner wrote. */
declare function isBaselinePrompt(text: string): boolean;
/**
 * What the Business form's instructions box opens with (S4).
 *
 * The owner's own instructions when they have written some. Otherwise the
 * prompt a profile carries in their place, shown so nothing the receptionist
 * follows is out of sight and marked `carried` so the form can say where it
 * came from -- unless it is the product's baseline, which no owner wrote. A
 * save then keeps what the box holds as the owner's and puts the baseline back
 * as the prompt: the text is stored once, and an emptied box stays empty
 * instead of filling itself again from the copy left behind.
 *
 * DELIBERATELY NOT whoseWords, for now. This opens the box of the Settings form
 * that is live today, and the Business redesign's first phase promised to
 * change nothing live. An attempt to route this through whoseWords did change
 * it: the baseline stored in the owner's own field (a save before S4 put it
 * there) began opening an EMPTY box, and the next Save deleted it -- and a
 * workspace whose only composed field was that copy fell from a composed prompt
 * to the bare baseline, losing its hand-off and every rule line. So the two
 * disagree on exactly that one case, knowingly: the prompt view calls it the
 * platform's, which is true, and the box opens it as it always has. They are
 * reconciled in the redesign's Phase 3 (plan Task 3.8), where the save that
 * would have lost it is rewritten in the same change.
 */
declare function instructionsDraft(brain: {
    system_prompt?: string | null;
    profile?: {
        extra_instructions?: string | null;
    } | null;
} | null | undefined): {
    text: string;
    carried: boolean;
};
declare const NotificationsConfigSchema: z.ZodObject<{
    escalation_emails: z.ZodArray<z.ZodString>;
    from: z.ZodOptional<z.ZodString>;
}, z.core.$strict>;
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
    ical_url: z.ZodString;
}, z.core.$strict>;
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
}, z.core.$strict>;
type FeaturesConfig = z.infer<typeof FeaturesConfigSchema>;
declare const TenantConfigSchema: z.ZodObject<{
    brain: z.ZodOptional<z.ZodObject<{
        business_name: z.ZodString;
        phone_display: z.ZodOptional<z.ZodString>;
        booking_link: z.ZodString;
        system_prompt: z.ZodString;
        profile: z.ZodOptional<z.ZodObject<{
            address: z.ZodOptional<z.ZodString>;
            hours: z.ZodOptional<z.ZodRecord<z.ZodEnum<{
                mon: "mon";
                tue: "tue";
                wed: "wed";
                thu: "thu";
                fri: "fri";
                sat: "sat";
                sun: "sun";
            }> & z.core.$partial, z.ZodObject<{
                open: z.ZodOptional<z.ZodNullable<z.ZodString>>;
                close: z.ZodOptional<z.ZodNullable<z.ZodString>>;
                intervals: z.ZodOptional<z.ZodArray<z.ZodObject<{
                    open: z.ZodString;
                    close: z.ZodString;
                }, z.core.$strip>>>;
            }, z.core.$strict>>>;
            closures: z.ZodOptional<z.ZodArray<z.ZodObject<{
                date: z.ZodString;
                until: z.ZodOptional<z.ZodString>;
                note: z.ZodOptional<z.ZodString>;
            }, z.core.$strip>>>;
            services: z.ZodOptional<z.ZodArray<z.ZodObject<{
                name: z.ZodString;
                duration_min: z.ZodOptional<z.ZodNumber>;
                price_note: z.ZodOptional<z.ZodString>;
            }, z.core.$strict>>>;
            languages: z.ZodOptional<z.ZodArray<z.ZodString>>;
            guardrails: z.ZodOptional<z.ZodObject<{
                never_quote_prices: z.ZodOptional<z.ZodBoolean>;
                never_confirm_booking: z.ZodOptional<z.ZodBoolean>;
                disclose_ai: z.ZodOptional<z.ZodBoolean>;
                no_health_advice: z.ZodOptional<z.ZodBoolean>;
            }, z.core.$strict>>;
            escalate_when: z.ZodOptional<z.ZodArray<z.ZodString>>;
            tone: z.ZodOptional<z.ZodString>;
            handoff_number: z.ZodOptional<z.ZodString>;
            website: z.ZodOptional<z.ZodString>;
            notes: z.ZodOptional<z.ZodArray<z.ZodObject<{
                title: z.ZodString;
                text: z.ZodString;
            }, z.core.$strict>>>;
            booking_rules: z.ZodOptional<z.ZodObject<{
                lead_hours: z.ZodOptional<z.ZodNumber>;
                buffer_min: z.ZodOptional<z.ZodNumber>;
                max_days_ahead: z.ZodOptional<z.ZodNumber>;
                slot_min: z.ZodOptional<z.ZodNumber>;
                consult_first: z.ZodOptional<z.ZodArray<z.ZodString>>;
                party_max: z.ZodOptional<z.ZodNumber>;
                notes: z.ZodOptional<z.ZodArray<z.ZodString>>;
            }, z.core.$strict>>;
            extra_instructions: z.ZodOptional<z.ZodString>;
        }, z.core.$strict>>;
        fallbacks: z.ZodObject<{
            greeting: z.ZodString;
            error: z.ZodString;
            non_text: z.ZodString;
        }, z.core.$strict>;
    }, z.core.$strict>>;
    notifications: z.ZodOptional<z.ZodObject<{
        escalation_emails: z.ZodArray<z.ZodString>;
        from: z.ZodOptional<z.ZodString>;
    }, z.core.$strict>>;
    calendar: z.ZodOptional<z.ZodObject<{
        ical_url: z.ZodString;
    }, z.core.$strict>>;
    features: z.ZodOptional<z.ZodObject<{
        vision: z.ZodOptional<z.ZodBoolean>;
    }, z.core.$strict>>;
}, z.core.$strip>;
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
declare const TenantConfigWriteSchema: z.ZodObject<{
    brain: z.ZodOptional<z.ZodObject<{
        business_name: z.ZodString;
        phone_display: z.ZodOptional<z.ZodString>;
        booking_link: z.ZodString;
        system_prompt: z.ZodString;
        profile: z.ZodOptional<z.ZodObject<{
            address: z.ZodOptional<z.ZodString>;
            hours: z.ZodOptional<z.ZodRecord<z.ZodEnum<{
                mon: "mon";
                tue: "tue";
                wed: "wed";
                thu: "thu";
                fri: "fri";
                sat: "sat";
                sun: "sun";
            }> & z.core.$partial, z.ZodObject<{
                open: z.ZodOptional<z.ZodNullable<z.ZodString>>;
                close: z.ZodOptional<z.ZodNullable<z.ZodString>>;
                intervals: z.ZodOptional<z.ZodArray<z.ZodObject<{
                    open: z.ZodString;
                    close: z.ZodString;
                }, z.core.$strip>>>;
            }, z.core.$strict>>>;
            closures: z.ZodOptional<z.ZodArray<z.ZodObject<{
                date: z.ZodString;
                until: z.ZodOptional<z.ZodString>;
                note: z.ZodOptional<z.ZodString>;
            }, z.core.$strip>>>;
            services: z.ZodOptional<z.ZodArray<z.ZodObject<{
                name: z.ZodString;
                duration_min: z.ZodOptional<z.ZodNumber>;
                price_note: z.ZodOptional<z.ZodString>;
            }, z.core.$strict>>>;
            languages: z.ZodOptional<z.ZodArray<z.ZodString>>;
            guardrails: z.ZodOptional<z.ZodObject<{
                never_quote_prices: z.ZodOptional<z.ZodBoolean>;
                never_confirm_booking: z.ZodOptional<z.ZodBoolean>;
                disclose_ai: z.ZodOptional<z.ZodBoolean>;
                no_health_advice: z.ZodOptional<z.ZodBoolean>;
            }, z.core.$strict>>;
            escalate_when: z.ZodOptional<z.ZodArray<z.ZodString>>;
            tone: z.ZodOptional<z.ZodString>;
            handoff_number: z.ZodOptional<z.ZodString>;
            website: z.ZodOptional<z.ZodString>;
            notes: z.ZodOptional<z.ZodArray<z.ZodObject<{
                title: z.ZodString;
                text: z.ZodString;
            }, z.core.$strict>>>;
            booking_rules: z.ZodOptional<z.ZodObject<{
                lead_hours: z.ZodOptional<z.ZodNumber>;
                buffer_min: z.ZodOptional<z.ZodNumber>;
                max_days_ahead: z.ZodOptional<z.ZodNumber>;
                slot_min: z.ZodOptional<z.ZodNumber>;
                consult_first: z.ZodOptional<z.ZodArray<z.ZodString>>;
                party_max: z.ZodOptional<z.ZodNumber>;
                notes: z.ZodOptional<z.ZodArray<z.ZodString>>;
            }, z.core.$strict>>;
            extra_instructions: z.ZodOptional<z.ZodString>;
        }, z.core.$strict>>;
        fallbacks: z.ZodObject<{
            greeting: z.ZodString;
            error: z.ZodString;
            non_text: z.ZodString;
        }, z.core.$strict>;
    }, z.core.$strict>>;
    notifications: z.ZodOptional<z.ZodObject<{
        escalation_emails: z.ZodArray<z.ZodString>;
        from: z.ZodOptional<z.ZodString>;
    }, z.core.$strict>>;
    calendar: z.ZodOptional<z.ZodObject<{
        ical_url: z.ZodString;
    }, z.core.$strict>>;
    features: z.ZodOptional<z.ZodObject<{
        vision: z.ZodOptional<z.ZodBoolean>;
    }, z.core.$strict>>;
}, z.core.$strip>;
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
/**
 * How each part of the composed prompt opens, said once.
 *
 * Every value is the start of a line the composer writes: a section's heading,
 * the first words of a paragraph Chanlytics writes for every workspace, or one
 * of the two lines that can sit above the owner's own words. The composer
 * writes them from here, and the Business tab's prompt view (prompt-blocks.ts)
 * cuts the prompt on them from here. They were literal copies in two files, and
 * a copy that drifted folded one block into its neighbour without failing
 * anything: a closure list into the hours, the medium line into the owner's own
 * words.
 *
 * These are words the live receptionist reads. Changing one changes its prompt.
 */
declare const PROMPT_OPENINGS: {
    readonly hours: "Opening hours";
    readonly closures: "Closed on these dates";
    readonly services: "Services:";
    readonly notes: "Other things to know:";
    readonly bookingRules: "Booking rules:";
    readonly handoffChat: "Handing the conversation to a person:";
    readonly handoffCall: "Handing the caller to a person:";
    /** The call's tool mechanics: check_availability, send_booking_link, end_call. */
    readonly callTools: "Open times: use check_availability";
    readonly callMedium: "You are speaking aloud.";
    readonly chatMedium: "Keep replies short enough to read on a phone.";
    readonly openTimes: "If open times are listed after these instructions";
    /** The rules, last: the guardrails in a composed prompt, Autonomy's alone after a prompt nothing composed. */
    readonly rules: "Rules you must follow:";
    /** Above the owner's own words, when there are details above for them to disagree with. */
    readonly ownWordsUnderDetails: "Further instructions from the business.";
    /** Above the owner's own words on a call, alone or after the line above. */
    readonly ownWordsOnACall: "Some of it was written for text conversations";
};
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
/**
 * The owner's own words, as the receptionist is given them.
 *
 * What they have written into the form, once there is anything in it. Until
 * then the workspace's prompt stands in their place: carried whole when the
 * profile composes, so filling in one field loses nothing, and read as it
 * stands when it does not. The one statement of that rule. resolveSystemPrompt
 * composes with it, and anything that has to find those words in what the
 * resolver returned looks for them with it, rather than with a copy that can
 * drift.
 */
declare function ownWordsOf(brain: {
    system_prompt?: string | null;
    profile?: {
        extra_instructions?: string | null;
    } | null;
} | null | undefined): string | null;
/** Whose words stand in the owner's place: see whoseWords. */
type WhoseWords = {
    kind: "own" | "carried" | "prompt" | "baseline";
    text: string;
} | {
    kind: "none";
    text: null;
};
/**
 * Whose words the receptionist is given in the owner's place, decided once.
 *
 * The words are ownWordsOf's, the resolver's own rule. This says whose they are,
 * for the prompt view (promptBlocks). The instructions box (instructionsDraft)
 * does not ask here yet: it opens the Settings form that is live today, and on
 * one case -- the baseline stored in the owner's own field by a save before S4
 * -- asking here would change what it opens with. That case is reconciled in
 * the redesign's Phase 3 (plan Task 3.8); see instructionsDraft.
 *
 *   baseline  the product's own opening lines. In the stored prompt that is
 *             isBaselinePrompt, which reads only the opening and the closing:
 *             only the product writes that prompt. In the OWNER'S field it is
 *             stricter (isBaselineInOwnersField), because there an owner may
 *             have typed their own sentences where the business's name goes,
 *             and calling those the platform's would disown words they wrote.
 *   own       what the owner wrote into the profile's own field.
 *   carried   the profile composes, but its own field is blank, so the stored
 *             prompt stands in: the resolver carries it into the owner's place.
 *   prompt    nothing composes, so the stored prompt is simply the workspace's
 *             prompt, read as it stands. "Composes" is the resolver's own test
 *             (hasProfile): no profile at all, or one holding nothing the
 *             resolver composes from, and the resolver hands the prompt back.
 *   none      nothing to read.
 */
declare function whoseWords(brain: {
    system_prompt?: string | null;
    profile?: {
        extra_instructions?: string | null;
    } | null;
} | null | undefined): WhoseWords;
/** The details a message sent in the business's name may name, as the owner writes them. */
declare const FALLBACK_DETAILS: readonly ["business", "booking link", "phone"];
type FallbackDetail = (typeof FALLBACK_DETAILS)[number];
/**
 * The product's own wording for the three messages, naming the details rather
 * than copying them, so they follow the business's details from the first day
 * and a customer is never sent "call us at ." before a line exists.
 */
declare const FALLBACK_DEFAULTS: BrainConfig["fallbacks"];
/**
 * The three messages sent in the business's name when the receptionist cannot
 * answer, with its details as they are now (the wiring audit's S5).
 *
 * They were written once, from what the form held that day, with the number
 * and the booking link baked in, and nothing wrote them again: a changed link
 * or a new line left customers the old one. A message may now name
 * {business}, {booking link} and {phone}, filled here as it goes out from the
 * facts the prompt speaks (resolveFacts): the number is the one the owner
 * typed or the line the receptionist answers, formatted for a person. A
 * sentence naming a detail the workspace does not have is left out rather
 * than sent with a hole in it; a message naming none goes out exactly as
 * written; one that would leave nothing says the default instead.
 */
declare function fallbackMessages(brain: BrainConfig, known?: KnownFacts | null): BrainConfig["fallbacks"];
/**
 * The names in a message that nothing fills in -- "{bookinglink}", "{phone
 * number}" -- which a customer would read exactly as written. The Business
 * form says so under the message before it is saved (S5).
 */
declare function unknownDetails(text: string): string[];

declare function frameWhisper(text: string): string;
/**
 * A standing-rule correction, put into a live call by the platform.
 *
 * DELIBERATELY NOT frameWhisper. That frame opens `Owner: "` and
 * `whisperText` reads it back out, so the Live page can show the owner their
 * own words and never the wrapper. Nobody typed this one. Framing a platform
 * correction as the owner speaking would put words in their mouth inside the
 * transcript of a real call with a real customer, which is the one place a
 * fabrication would be least forgivable.
 *
 * The same influence rule as every other whisper: worked into the next
 * answer, in the agent's own words, never read out. A correction the caller
 * hears being read aloud is a second mistake on top of the first.
 */
declare function frameGuardrail(rule: "price"): string;
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
 * The hand-over: the owner is taking the call, and the receptionist passes it.
 *
 * Framed as the platform's, like the guardrail correction, and for the same
 * reason: nobody typed this, and `injectedTurn` must never read it back as
 * the owner's own words. Unlike a whisper it is an instruction to act now,
 * so the door that sends it triggers a response; and unlike the guardrail it
 * names a tool, because the receptionist has exactly one way to put a person
 * on the line -- transfer_to_staff, the warm transfer to the business's own
 * number, which the same update fills in case the call began without one.
 *
 * Three lines, like every platform frame: who is speaking, what happened,
 * what to do. The middle line is the one the Live page shows.
 */
declare function frameHandOver(): string;
/**
 * An injected turn, read back for the Live page: the owner's own words when
 * the owner spoke, and what the platform said when it did -- never the frame,
 * and never the platform's words in the owner's mouth. A turn with neither
 * frame is a whisper from before the frame existed, and still the owner's.
 */
declare function injectedTurn(content: string | null | undefined): {
    speaker: "whisper" | "platform";
    text: string;
};

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
/**
 * The model for a turn: choosing a tool and writing sixty words. On the eval
 * set (2026-09-07, 28 cases, all passing either way) Opus 5 answered in a
 * 7.2 s median with a one-round turn at 4.7–8 s; the answer's length, not
 * its difficulty, was the cost. Sonnet 5 writes it faster at the same
 * grounding. One name: the loop sends it, and the edge gateway defaults to
 * it when a request names none, so the two cannot drift apart. The eval set
 * decides if this stays.
 */
declare const ASK_MODEL = "claude-sonnet-5";
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
    answer: z.ZodPipe<z.ZodCatch<z.ZodString>, z.ZodTransform<string, string>>;
    citations: z.ZodPipe<z.ZodCatch<z.ZodArray<z.ZodObject<{
        kind: z.ZodCatch<z.ZodEnum<{
            conversation: "conversation";
            call: "call";
            thread: "thread";
            person: "person";
            page: "page";
        }>>;
        id: z.ZodPipe<z.ZodCatch<z.ZodString>, z.ZodTransform<string, string>>;
        label: z.ZodPipe<z.ZodCatch<z.ZodString>, z.ZodTransform<string, string>>;
    }, z.core.$strip>>>, z.ZodTransform<{
        kind: "conversation" | "call" | "thread" | "person" | "page";
        id: string;
        label: string;
    }[], {
        kind: "conversation" | "call" | "thread" | "person" | "page";
        id: string;
        label: string;
    }[]>>;
    followups: z.ZodPipe<z.ZodCatch<z.ZodArray<z.ZodString>>, z.ZodTransform<string[], string[]>>;
    navigate: z.ZodPipe<z.ZodCatch<z.ZodObject<{
        to: z.ZodCatch<z.ZodString>;
        label: z.ZodCatch<z.ZodString>;
        now: z.ZodCatch<z.ZodBoolean>;
    }, z.core.$strip>>, z.ZodTransform<{
        to: string;
        label: string;
        now: boolean;
    } | null, {
        to: string;
        label: string;
        now: boolean;
    }>>;
    language: z.ZodCatch<z.ZodEnum<{
        other: "other";
        en: "en";
        es: "es";
    }>>;
}, z.core.$strip>;
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
declare const ASK_PAGE_ROUTES: readonly ["today", "inbox", "clients", "clients/leads", "segments", "conversations", "live", "calendar", "outbound", "broadcasts", "messages", "reports", "admin/setup", "admin/workspace", "admin/team", "admin/autonomy", "admin/notifications", "admin/integrations", "admin/billing", "admin/activity", "admin/profile"];
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
type AskRole = SchemaSet<"ask_messages.role">;
/**
 * The Inbox verbs the assistant may propose on a thread. One list, read by
 * the proposer on the server and the committer in the browser, so a verb
 * cannot be proposable in one and unknown to the other.
 */
declare const ASK_THREAD_VERBS: readonly ["take_over", "hand_back", "snooze", "wake", "archive", "resolve"];
type AskThreadVerb = (typeof ASK_THREAD_VERBS)[number];
/** A proposal the model made; a card the person may approve. Executed by the client through the verbs. */
interface AskProposal {
    id: string;
    kind: "reply" | "steer" | "thread_verb" | "person_mode" | "policy" | "settings" | "whisper" | "invite" | "broadcast" | "playbook" | "lead_search";
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
declare const PROPOSAL_GATE: Record<AskProposal["kind"], "approve" | "autonomy" | "settings" | "team" | "find">;
/** What became of a card, kept with the turn that proposed it. */
interface AskProposalOutcome {
    state: "done" | "dismissed" | "failed" | "undone";
    /** One line: "Sent to Rosa", "Closed on Friday". */
    receipt: string;
    atMs: number;
    /** What Undo needs, when the verb has one: an id, a previous value. */
    undo?: Record<string, unknown> | null;
}
/** How long a committed card's undo stays open, for every verb whose route sets no window of its own. */
declare const ASK_UNDO_MS: number;
/**
 * Whether a committed card's undo is still true to offer.
 *
 * A reply's undo cancels the send, so it lives exactly as long as the send's own
 * cancel window. A settings undo writes the whole earlier config, so it is safe
 * only while nobody has saved since -- the version the card wrote is still the
 * version loaded. Everything else reverses cleanly for a while, then not.
 * An undo used to be offered forever, and to survive reopening a thread days later.
 */
declare function askUndoOpen(kind: string, undo: Record<string, unknown> | null | undefined, atMs: number, nowMs: number, settingsVersion: number | null): boolean;
declare const AskProposalOutcomeSchema: z.ZodObject<{
    state: z.ZodEnum<{
        failed: "failed";
        done: "done";
        dismissed: "dismissed";
        undone: "undone";
    }>;
    receipt: z.ZodCatch<z.ZodString>;
    atMs: z.ZodCatch<z.ZodNumber>;
    undo: z.ZodOptional<z.ZodNullable<z.ZodRecord<z.ZodString, z.ZodUnknown>>>;
}, z.core.$strip>;
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
    /**
     * Other words that find this page. A page is not always called what someone
     * types: Templates was "Messages" until the word came to mean three things,
     * and a person who learned it then still types it. Matched after the label,
     * so the name a page goes by always wins.
     */
    also?: readonly string[];
}
/**
 * The pages a real workspace has. Nothing here is seeded or demo-only. The list stopped at the pages that were real
 * before the Calendar, Lists, Campaigns, Setup, Billing and Activity shipped, so ⌘K "calendar" offered only to ask
 * about it (the wiring audit's N18).
 */
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
declare const AskSettingsChangeSchema: z.ZodDiscriminatedUnion<[z.ZodObject<{
    op: z.ZodLiteral<"add_closure">;
    date: z.ZodString;
    until: z.ZodOptional<z.ZodString>;
    note: z.ZodOptional<z.ZodString>;
}, z.core.$strip>, z.ZodObject<{
    op: z.ZodLiteral<"set_hours">;
    day: z.ZodEnum<{
        mon: "mon";
        tue: "tue";
        wed: "wed";
        thu: "thu";
        fri: "fri";
        sat: "sat";
        sun: "sun";
    }>;
    open: z.ZodNullable<z.ZodString>;
    close: z.ZodNullable<z.ZodString>;
}, z.core.$strip>, z.ZodObject<{
    op: z.ZodLiteral<"add_note">;
    title: z.ZodString;
    text: z.ZodString;
}, z.core.$strip>, z.ZodObject<{
    op: z.ZodLiteral<"add_service">;
    name: z.ZodString;
    duration_min: z.ZodOptional<z.ZodNumber>;
}, z.core.$strip>], "op">;
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
 * A calendar feed's address, and the ways a read of it fails.
 *
 * The address rule is one function because it guards three doors: the
 * preview before a save, the save itself (config.ts), and every fetch the
 * dashboard and the edge make of the saved address. Until 12 Sep 2026 only
 * the preview applied it, so a private address that reached the config was
 * fetched, hourly, from inside the platform's own network.
 *
 * The failure words are one function because the owner reads them in three
 * places: the preview's refusal, the Calendar page's card, and the Setup
 * row. Each way a feed fails has one sentence, and it names what to do.
 */
/** Only an address on the public internet, over https or http; webcal is https in a hat. Null when it is not one. */
declare function feedUrlOk(raw: string | null | undefined): string | null;
/** The most a feed may weigh: two megabytes of text, a season of a busy salon several times over. */
declare const FEED_MAX_BYTES = 2000000;
/**
 * Why the last read of a feed failed.
 *
 * "settings" is the one that is not about the address but about where the address is kept: a config row that
 * will not parse loses the calendar with it. It is here rather than off on its own because the owner is in the
 * same position either way -- their calendar could not be read -- and every reader of this union already knows
 * how to say that.
 */
type FeedFailure = "address" | "unreachable" | "http" | "too_large" | "not_ical" | "settings";
/** One sentence per way a feed fails, naming what to do; null when nothing failed. */
declare function feedProblemWords(reason: FeedFailure | null | undefined, status?: number | null): string | null;
/**
 * The two things that make a body we did fetch unusable.
 *
 * One judgement, because there were two: the dashboard refused a feed over
 * FEED_MAX_BYTES while the edge inlined `2 * 1024 * 1024`, so a feed between
 * 2,000,000 and 2,097,152 bytes was read by one reader and refused by the
 * other — and the receptionist and the board would then disagree about a
 * business's own week with nothing on any page to say why.
 */
declare function feedBodyProblem(text: string): FeedFailure | null;
/** A window of time a read of the feed has to cover. */
interface FeedHorizon {
    from: number;
    to: number;
}
/**
 * THREE WINDOWS, NAMED.
 *
 * Five call sites parsed the same feed with four hand-written expressions
 * between them, and two of those were byte-identical: the edge's own
 * `horizonFor` and the prompt preview's inline copy. Nothing said which
 * differences were deliberate, so the only way to know whether the board and
 * the receptionist were meant to see the same season was to read four files
 * and compare arithmetic.
 *
 * They are three rules, and they differ for reasons worth writing down.
 * Behaviour is unchanged at every site: the board's old ±90 days is exactly
 * `seasonHorizon(now)`, and the preview's is exactly `seasonHorizon(now,
 * daysAhead)`.
 */
/**
 * Only what the receptionist may offer: yesterday, for a visit already under
 * way, through the last day it is allowed to book into.
 */
declare function offeringHorizon(now: Date, daysAhead: number): FeedHorizon;
/**
 * A season either side: ninety days back for "when were they last in", and
 * ninety forward — or the offering window when a workspace books further out
 * than that, so the two never disagree about a day the receptionist can offer.
 */
declare function seasonHorizon(now: Date, daysAhead?: number): FeedHorizon;
/**
 * A month, to prove an address works. The preview exists to answer "is this
 * the right link", and a season of a busy salon is slower to fetch and no
 * more convincing than four weeks of it.
 */
declare function previewHorizon(now: Date): FeedHorizon;

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
/** What a business says about itself, for the slots that name it. */
interface OwnFacts {
    business_name?: string | null;
    booking_link?: string | null;
}
/**
 * One filled value per slot, in order -- the words alone, before they are put
 * back into the body. A preview that draws the message as a chat marks what
 * fills per person, and it cannot mark anything once the values have been
 * substituted into a string, so the values are decided here and the two
 * preview functions below are the same thing joined up.
 */
declare function starterPreviewValues(s: StarterTemplate, language: string, businessName?: string | null, bookingLink?: string | null): string[];
/** The message as a customer would read it: the business's own name and booking link, and a blank for what it has not given. */
declare function starterPreview(s: StarterTemplate, language: string, businessName?: string | null, bookingLink?: string | null): string;
/**
 * A saved template as a customer would read it, from the row as the sync keeps
 * it: a position, a label, the example filed with Meta -- and no kind. The kind
 * is a starter's own, known by its name, else a guess from the label and the
 * example (defaultSlotKinds), and the words follow slotWords. A slot with
 * nothing to show stays a slot.
 */
declare function templatePreviewValues(t: {
    name: string;
    language?: string | null;
    body_preview: string | null;
    variables: unknown;
}, own?: OwnFacts): string[];
declare function templatePreview(t: {
    name: string;
    language?: string | null;
    body_preview: string | null;
    variables: unknown;
}, own?: OwnFacts): string;
/**
 * The line under a message's words, from the components Meta holds.
 *
 * `templates.components` has carried Meta's own component array since 00045 --
 * the sync writes `t.components` straight through (edge meta-templates.ts
 * templateRow) and a template written here is submitted with the array
 * `templateComponents` builds, FOOTER included. So the footer has been STORED
 * all along and simply never read back: the three composers resolved one only
 * through `starterByName`, i.e. only for the five starters whose footers are
 * hard-coded below. A template a workspace wrote showed "Reply STOP to opt out"
 * while it was being drafted and nowhere afterwards.
 *
 * This is the same shape the edge's `bodyOf` reads for the body.
 */
declare function footerOf(components: unknown): string | null;
/**
 * A row's footer: the one Meta holds, else the starter's own.
 *
 * The fallback matters for a workspace that added the starter set before the
 * read existed -- its rows carry components, but a row written by hand or by an
 * older webhook may not, and the library still knows what that message says.
 */
declare function templateFooter(t: {
    name: string;
    language?: string | null;
    components?: unknown;
    footer?: string | null;
}): string | null;
interface TemplateButton {
    /** What the button says. */
    text: string;
    /** url: opens a link · reply: sends the words back · call: dials a number. */
    kind: "url" | "reply" | "call";
}
interface TemplateParts {
    /** A text heading above the words; null when there is none, or it is a picture. */
    header: string | null;
    /** The line under the words. */
    footer: string | null;
    /** The buttons under the message, in Meta's order. */
    buttons: TemplateButton[];
}
/**
 * The message as the customer receives it, from the components Meta holds.
 *
 * `body_preview` is the BODY component alone (edge `bodyOf`), so a template with
 * a heading or buttons was drawn as its words and nothing else -- the operator
 * never saw the "Book now" button the customer taps, which for an appointment
 * business is the whole point of the message.
 */
declare function templateParts(components: unknown): TemplateParts;
/**
 * Why this product cannot send a template, in the owner's words; null when it can.
 *
 * `sendTemplate` (packages/channels/src/whatsapp.ts) puts ONE component on the
 * wire -- `{ type: "body", parameters }` -- and `variablesOf` counts only the
 * BODY's `{{n}}`. So a template whose heading is a picture, or which takes a
 * value anywhere outside its body, is offered by the composers as an ordinary
 * choice, passes their "every slot filled" check, enrols its recipients, and is
 * then refused BY META FOR EVERY ONE of them on a parameter mismatch -- leaving
 * an owner looking at a broadcast that delivered to nobody, with no reason given.
 *
 * The composers ask this first and leave those templates out, the way
 * `inboxTemplates` leaves out the ones whose slots the Inbox cannot fill.
 */
declare function templateBlocked(t: {
    blocked?: string | null;
    components?: unknown;
}): string | null;
/** The templates a composer may offer, and one sentence for the ones it may not. */
declare function sendableTemplates<T extends {
    components?: unknown;
}>(list: readonly T[]): {
    sendable: T[];
    blocked: T[];
    why: string | null;
};
declare const TEMPLATE_TITLE_MAX = 60;
/**
 * Words for people: the title the workspace gave it, else the starter's,
 * else the name made words — a trailing version (_v1) is not a word.
 */
declare function templateTitle(name: string | null | undefined, title?: string | null): string;
/** A language code as people read it: "en_US" is "English", "es" is "Spanish"; the code itself where the runtime cannot say. */
declare function languageWords(code: string): string;
/** An approved template as the Inbox composer is given it (GET templates). */
interface InboxTemplateLike {
    id: string;
    name: string;
    language: string;
    category?: string | null;
    variables?: unknown;
    title?: string | null;
}
/**
 * The approved templates the Inbox can send to one person, in the owner's words, and why the rest are not offered.
 * The reply route fills a template's own slots and turns away one with words to write (slotToWrite, I6), and sends
 * a promotion only to someone who said yes to offers (core reply.ts), so the composer offered templates it would
 * refuse: a button whose only outcome was a refusal (I4). The same two judgements, asked before anything is pressed.
 */
declare function inboxTemplates<T extends InboxTemplateLike>(templates: readonly T[], to: {
    who: string;
    offersOk: boolean;
}): {
    sendable: Array<{
        template: T;
        title: string;
        label: string;
    }>;
    hidden: string | null;
};
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
    language?: string | null;
}, b: {
    name: string;
    category?: string | null;
    source?: string | null;
    language?: string | null;
}): number;
/**
 * The template a composer opens on: the trigger's starter, the quick note for a
 * broadcast, else the first.
 *
 * It used to `find` on the list AS GIVEN, so a workspace holding a starter in
 * two languages opened on whichever row the query happened to return first --
 * a different language on a different load, from a picker that drew the two
 * rows identically. The sort decides it now, and it is a total order.
 */
declare function defaultTemplate<T extends {
    name: string;
    category?: string | null;
    source?: string | null;
    language?: string | null;
}>(list: readonly T[], trigger: string | null): T | null;
/**
 * The languages of a set of rows, each with the words a person reads.
 *
 * `languageWords` strips the region, so "en_US" and "en" both read "English" --
 * and a workspace holding both would see one chip offering the same word twice.
 * Where two codes would read alike, each keeps its own code beside the word;
 * where they do not, the word stands alone.
 */
declare function languageLabels(codes: readonly string[]): Record<string, string>;
/** One entry per template NAME, in the library's order, with its rows by language. */
interface TemplateGroup<T> {
    name: string;
    /** The words for the name: the workspace's own title, else the starter's, else the name made words. */
    title: string;
    /** Every row of this name, language order, and the words for each language. */
    rows: T[];
    labels: Record<string, string>;
}
/**
 * The rows of a picker grouped by the template they are.
 *
 * A composer showed one chip per ROW and titled it with `templateTitle(name)`,
 * which takes no language -- so the starter set installed in English and Spanish,
 * which Messages advertises as the default, drew seven PAIRS of identical chips
 * sitting next to each other. The Inbox composer had already solved this
 * (`inboxTemplates` labels each "<title> · <language>"); the two Campaigns
 * composers had not.
 */
declare function groupTemplates<T extends {
    name: string;
    language: string;
    title?: string | null;
    category?: string | null;
    source?: string | null;
}>(list: readonly T[]): TemplateGroup<T>[];
/** Each slot's words for a person: a starter's own labels, else the labels the row carries, else "Value n". */
/**
 * The template this workspace may text somebody who asked to book.
 *
 * Three things at once, and none of them a name: APPROVED, because a row
 * asserting an approval Meta never gave is the defect this replaces; fillable
 * from the workspace's own facts, because the server fills the slots and never
 * asks a caller for words; and carrying the booking link, which is what makes
 * it the booking template rather than any other. A workspace with none has
 * none, and is owed that answer rather than a send that fails at Meta.
 */
declare function bookingTemplate<T extends {
    name: string;
    language: string;
    meta_status?: string | null;
    variables: unknown;
}>(templates: readonly T[]): T | null;
declare function slotLabels(t: {
    name: string;
    language?: string | null;
    variables: unknown;
}): string[];
/**
 * The slots the Inbox fills for a template, the way broadcasts and the assistant fill them (defaultParamSpecs): a
 * starter's own, else a guess per recorded slot. A template whose slots the sync never recorded keeps the two the
 * Inbox always sent, the business name and the booking link (I6).
 */
declare function inboxSlots(t: {
    name: string;
    variables?: unknown;
}): ParamSpec[];
/**
 * The first slot of a template the Inbox cannot fill by itself -- words to write, a visit's time or its service --
 * by its label; null when every slot is a fact the Inbox has: the first name, the business name, the booking link.
 * The reply route refuses such a template in these words, and the composer does not offer it (I6).
 */
declare function slotToWrite(t: {
    name: string;
    language?: string | null;
    variables?: unknown;
}): string | null;

/**
 * A refusal in the owner's words.
 *
 * The typed client had one branch for every refusal but the 401: the server's
 * sentence went on screen as it came, "Request failed (502)." whenever the
 * answer was not an envelope, and the envelope's details -- the rate limiter's
 * retry_after_s, a form's fields, the role a door wanted -- were dropped on the
 * way. A timeout was told "nothing was changed" of a write the server might
 * still be making.
 *
 * Decided here, once, so the client, the Ask stream and a courier's own
 * refusal say the same thing. The server's sentence stays wherever it wrote
 * one: it is already the owner's words ("Only an owner can do this.", "Too
 * many replies in a short time — try again in 40 seconds."). What this adds is
 * a title that says what kind of no it is, a sentence of ours where the server
 * gave none or gave its catch-all, the wait, and a form's fields.
 *
 * And the no before the press (roleGate): a control a role may not press says
 * who may, in the same words, before anyone presses it.
 */

/** The title of a no, by the least role the door wanted: the gate says it before the press (roleGate), the refusal after it. */
declare const NEEDS_TITLE: Readonly<Record<"owner" | "operator", string>>;
interface RefusalInput {
    /** The envelope's code; absent when the answer was not an envelope. `network`, `timeout` and `client` are the client's own. */
    code?: string | null;
    /** The HTTP status; 0 when nothing answered. */
    status: number;
    /** The server's sentence, when it sent one. */
    message?: string | null;
    /** The envelope's details: the rate limiter's `retry_after_s`, a form's `fields`, the role a door `needs`. */
    details?: unknown;
    /** The Retry-After header: seconds, or an HTTP date. */
    retryAfter?: string | null;
    /** A write may have gone through when no proper answer came back; a read changed nothing. */
    write: boolean;
    /** The clock, for a Retry-After given as a date. */
    nowMs?: number;
}
interface Refusal {
    code: string;
    status: number;
    /** What kind of no, in a few words: "Owner only", "Too many at once", "Check the details". */
    title: string;
    /** Why, and what to do next, in the owner's words. */
    message: string;
    /** Seconds until the same request may be tried again, when the server said. */
    retryAfterS: number | null;
    /** A form's refusal: one sentence per field, by the field's name in the request. */
    fields: Readonly<Record<string, string>> | null;
    /**
     * A reply by email that waits on a yes: the address it will go to, which is
     * not the one the person last wrote from (core reply.ts). The same request
     * sent again with `email_to` set to this value is the yes. Present on that
     * refusal and no other.
     */
    confirmEmailTo?: string;
}
declare function refusalOf(input: RefusalInput): Refusal;
/** A permission a control can be gated on (config.ts ROLE_PERMS). */
type RolePerm = keyof (typeof ROLE_PERMS)[Role];
/**
 * What a control on a permission does, when the control does not say. A control
 * whose own act is narrower names it: an owner's line is gated on `team`, and
 * "manage the team" is not what buying a number does.
 */
declare const PERM_DOING: Readonly<Record<RolePerm, string>>;
/**
 * The gate before the press: null when the role may; otherwise the least role
 * that may, and one sentence in the words the server's refusal gives after the
 * press ("Only an owner can change the business details."). A role that is not
 * one, or none yet, is a viewer: the gate fails closed, as the page's role does.
 */
declare function roleGate(role: string | null | undefined, perm: RolePerm, doing?: string | null): {
    needs: "owner" | "operator";
    title: string;
    reason: string;
} | null;

/** The business's day at an instant: "2026-09-06". */
declare function zoneDayKey(atMs: number, tz: string): string;
/** "3:10 PM", by the business's clock. */
declare function clockTime(atMs: number, tz: string): string;
/** "Sep 6" by the business's calendar, with the year when that is not this year there. */
declare function clockDate(atMs: number, tz: string, nowMs: number): string;
/** "Sep 6, 2026" by the business's calendar: a record that always says its year. */
declare function clockDateYear(atMs: number, tz: string): string;
/** A list row: the time on the business's today, the date before it. */
declare function clockShort(atMs: number, tz: string, nowMs: number): string;
/** A message: the time on the business's today; before it, the date and the time. */
declare function clockStamp(atMs: number, tz: string, nowMs: number): string;
/** When something goes: "today 6:00 PM" · "tomorrow 10:00 AM" · "Sep 12 · 10:00 AM". */
declare function clockWhen(atMs: number, tz: string, nowMs: number): string;
/** A day on a timeline: "Today · Sep 4" · "Yesterday · Sep 3" · "Sep 2". */
declare function clockDayLabel(atMs: number, tz: string, nowMs: number): string;
/** The instant of a wall-clock time on a business day ("2026-09-07", 10:00), clock changes included. */
declare function wallClockAt(tz: string, dayKey: string, hh: number, mm: number): number;
/** Tomorrow at a wall-clock time, by the business's day and clock: a snooze target. */
declare function tomorrowAtIn(tz: string, nowMs: number, hh: number, mm?: number): number;
/** A datetime-local box's value for an instant, by the business's clock: "2026-09-15T09:30". */
declare function zonedInputValue(atMs: number, tz: string): string;
/** A datetime-local box's value, read by the business's clock; null for anything that is not one. */
declare function fromZonedInput(value: string | null | undefined, tz: string): number | null;

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
    /** Messages sent the period before, day for day beside this one's (null where there is no such day). */
    prior: (number | null)[];
    table: {
        columns: string[];
        rows: (string | number)[][];
    };
    /** The one sentence under each campaign card: who said yes or stop (the funnel), and how many runs sent it (null with none). */
    lines: {
        funnel: string;
        sent: string | null;
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
    /** The person in People this appointment is for — by a phone in the event, else an address, else a whole name in its words; their thread and last WhatsApp message when they have one. */
    person: {
        id: string;
        name: string;
        via?: MatchVia;
        thread?: string | null;
        wa_inbound_at?: string | null;
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
    /** Why the last read failed, when it did; with "ok" and a reason the read shown is the last good one (stale). */
    reason?: FeedFailure | null;
    /** The HTTP status when the calendar answered with one. */
    status?: number | null;
    /** The reason as a sentence the owner can act on (feedProblemWords). */
    problem?: string | null;
    /** The last fetch failed and what is shown is the previous read. */
    stale?: boolean;
    /** Items left out of the span because a day held more than the board draws. */
    dropped?: number;
    /** When the calendar was last tried, good or not: the news when a read failed or a refresh couldn't reach it (C2). */
    checked_at?: string | null;
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
    /** The booking rules as Settings keeps them: how open times are offered, the party size, the services that need a consultation first. */
    rules: BookingRules | null;
    services: CalendarServiceDto[];
    booking_link: string | null;
    /**
     * The receptionist's next open time from now: the first of every time it would
     * offer, whatever span was asked for. The page worked it out from the loaded
     * weeks, so a board looking at December had none to name (C1).
     */
    next_opening: {
        start: string;
        end: string;
    } | null;
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
/** The booking rules as separate phrases, so a narrow screen wraps between rules and never inside one: "at least 2h notice", "15 min between appointments", "up to 14 days ahead", "30-min slots", "up to 6 people per booking" -- Business's own words, least notice and days ahead (C3). */
declare function ruleParts(rules: (BookingRulesLike & Pick<BookingRules, "party_max">) | null | undefined): string[];
/** "Offers times with at least 2h notice · 15 min between appointments · up to 14 days ahead · 30-min slots". */
declare function rulesLine(rules: (BookingRulesLike & Pick<BookingRules, "party_max">) | null | undefined): string;
/**
 * What a read left out, in words the owner can act on. The feed line said
 * "2 repeating rules read once" and "3 more not shown" and never what either
 * meant: a repeat whose pattern parseIcs cannot follow keeps only its first
 * date, so a later one could be offered to a caller; and a day holding more
 * events than the board draws still has every one of them taken, because the
 * windows are worked out from all of them.
 */
declare function feedNotes(feed: Pick<CalendarFeedDto, "state" | "skipped_recurring" | "dropped">): CalendarFeedNoteVM[];
/**
 * "Mon–Fri 10 AM – 7 PM", "Wed 9 AM – 1 PM and 3 – 7 PM", "Sun closed" — one line per run of days with the same hours:
 * the prompt's own runs, said in the board's clock. The bar said "10:00–19:00" over a board drawn in 10 AM, and a day
 * with half its hours said the prompt's "ask them to call" to the owner (C3).
 */
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
    /** Who it is for; `threadId` is the Inbox thread a booking link is texted into ("th-…"), `replyOpen` whether a plain text still reaches them. */
    person: {
        id: string;
        name: string;
        via: MatchVia | null;
        threadId: string | null;
        replyOpen: boolean;
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
    /** Blocks that overlap in time sit side by side: this block's lane, and how many lanes its cluster needs. */
    lane: number;
    lanes: number;
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
    /** Past the last day the receptionist offers: nothing on it is offered yet, however free it is (C1). */
    beyondOffer: boolean;
}
interface CalendarServiceVM {
    name: string;
    duration: number | null;
    consultFirst: boolean;
    /** How long an open time must be for it: its own length, or a consultation's when it needs one first (offerFor, C5b). */
    offerMinutes: number | null;
    /** "Balayage · 90 min" */
    label: string;
}
interface CalendarClosureVM {
    key: string;
    /** "Sep 12" or "Sep 12 – 14" */
    label: string;
    note: string | null;
}
/** Something a read of the calendar left out, said so the owner can act on it. */
interface CalendarFeedNoteVM {
    id: "repeats" | "undrawn";
    /** "2 repeating events count only once." */
    title: string;
    body: string;
}
/**
 * The calendar feed's state, in the words the Calendar's pill, Connections and Setup all use (C3): the page drew a
 * coloured dot where Connections said "Readable". `stale` is a read that landed before a refresh that didn't.
 */
declare const CALENDAR_FEED_WORDS: {
    readonly ok: "Readable";
    readonly stale: "Last good read";
    readonly unavailable: "Could not be read";
    readonly none: "Not connected";
};
type CalendarFeedHealth = keyof typeof CALENDAR_FEED_WORDS;
interface CalendarVM {
    timezone: string;
    /** "New York": the zone by the name Settings gives it (C3). */
    zoneCity: string;
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
        problem: string | null;
        stale: boolean;
        /** The state the pill says, in CALENDAR_FEED_WORDS. */
        health: CalendarFeedHealth;
        /** The line without the state the pill says: where and when it was read, when it was tried; "" when that is all. */
        detail: string;
        /** Repeating events whose pattern the receptionist cannot follow: only their first date is taken. */
        skippedRecurring: number;
        /** Events past what a crowded day draws; their times are still taken. */
        dropped: number;
        /** Those two explained, when a read that landed left anything out. */
        notes: CalendarFeedNoteVM[];
    };
    stats: {
        events: number;
        windows: number;
        next: string;
    };
    /** How far ahead the receptionist offers times: `days` from today, through the day `until` ("Sep 21"). */
    offer: {
        days: number;
        until: string;
        label: string;
    };
    rules: string;
    /** The same rules as separate phrases. */
    ruleParts: string[];
    hoursLines: string[];
    closuresAhead: CalendarClosureVM[];
    /** Closures ahead past the six the bar names. */
    closuresMore: number;
    /** The services that need a consultation before they can be booked, as Settings names them. */
    consultFirst: string[];
    services: CalendarServiceVM[];
    bookingLink: string | null;
}
/**
 * The span as the page draws it. `now` decides today, the now line, which
 * days are past, the next open time and the closures ahead.
 */
declare function toCalendarVM(dto: CalendarWeekDto, now?: Date): CalendarVM;
/** Midnight of a day key in `tz`, as an instant. */
/**
 * Midnight of a day key, in the business's zone.
 *
 * ONE CLOCK, NOT TWO. This was a hand-written two-pass guess over a private
 * `zoneOffsetOf`, which computed the same offset `zoneOffsetMs` in
 * availability.ts already computed, by a different route — and the two passes
 * were `localToUtcMs` spelled out again, in a file that already imported from
 * that module. Daylight saving is the one piece of arithmetic in this product
 * it is least affordable to have two of: a second copy does not fail, it
 * disagrees, twice a year, about which hour a day starts.
 */
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
/**
 * The row that speaks for a kind.
 *
 * A workspace can legitimately hold more than one row of a kind, and the way it
 * gets there is the escape from a line that stopped: `release` "switches off, never
 * deletes" the routing row so calls keep their history, so a released-then-rebought
 * number leaves a `disabled` voice row beside the new active one. Postgres row
 * order is unspecified, so a bare `.find(c => c.kind === kind)` picks arbitrarily
 * between them — and picking the disabled one made Setup say "your line is
 * switched off" about a line that was answering, drop `tryIt`, and bounce the owner
 * back onto Setup.
 *
 * `facts.ts` already resolved this correctly for the receptionist's own facts, and
 * `ensureVoiceAgent`, `line_forwarding_set` and `businessPageFor` all filter and
 * order too. This is that same rule where the two page-facing readers can share it.
 *
 * ACTIVE FIRST, then the oldest of them — deterministic, and the oldest active row
 * is the one every other resolver in this repo chooses. Falling back to any row of
 * the kind keeps "is there a row at all" answerable, which is what `present` means.
 */
interface ChannelPickable {
    kind: string;
    /** `tenant_channels.status`. Absent on a shape that has already resolved it. */
    status?: string | null;
    /** The resolved form of the same fact, as `ChannelVM` carries it. */
    on?: boolean;
    created_at?: string | null;
}
declare function channelFor<T extends ChannelPickable>(rows: readonly T[], kind: string): T | null;
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
    /** What WhatsApp has said about the number (the row's config), for numberHealth: null until Meta has said something. */
    quality: string | null;
    qualityEvent: string | null;
    messagingLimit: string | null;
    /** When the row was made. Carried so `channelFor` can break a tie the same way on
     *  either shape; the DTO has always had it. */
    created_at: string;
}
/**
 * A wire, in the owner's words: the one place a `tenant_channels.kind` (or
 * email, which has no row there) becomes a word for a sentence. Today's chips,
 * its count, its alert and its proof rows read it, so no page can print "sms".
 *
 * Three maps look like this one and answer different questions, deliberately:
 * `REPORT_CHANNELS` (reports.ts) labels a MEASUREMENT ("Calls", not "Phone
 * line"); `THREAD_CHANNEL_WORDS` (viewmodels.ts) and `PERSON_CHANNEL_WORDS`
 * (people.ts) label what a MESSAGE arrived on; the Connections titles name the
 * product ("WhatsApp Business"). This one names the wire.
 */
declare const CHANNEL_KIND_WORDS: Record<string, string>;
/** The word for a wire; an unknown kind is capitalised rather than shouted as a column value. */
declare function channelKindWords(kind: string): string;
/**
 * The wires the receptionist answers on by itself. Email is not one: every
 * email waits for a person (mailbox.ts EMAIL_NOT_ANSWERED_SENTENCE, and
 * setup.ts's `answering`, which counts WhatsApp and the phone line only).
 * When the receptionist learns to draft email, this is the line that changes.
 */
declare const CHANNEL_ANSWERED: ReadonlySet<string>;
declare function toChannelVM(dto: ChannelDto, now?: Date): ChannelVM;

/**
 * Worth knowing: the facts the Reports page leads with. At most three, in the order an owner should act on them:
 * messages with no reply, why the receptionist handed over, the busiest day and its hours, the campaign that drew
 * the most replies, and a channel whose share moved. Each is a count over the report's own columns, never an
 * estimate, and none says a tile's number again (the tiles already did). Pure; the page draws what this returns.
 */

interface ReportFactVM {
    id: "unanswered" | "handovers" | "busiest" | "campaign" | "channel";
    tone: "" | "warn";
    /** An icon the legacy Icon set draws. */
    icon: "alert" | "users" | "calendar" | "sparkle" | "chat";
    text: string;
    /** The dim second half of the line; empty when the text says it all. */
    sub: string;
    door: {
        label: string;
        to: string;
    } | null;
}
declare function reportFacts(vm: ReportVM, campaigns: CampaignReportVM | null): ReportFactVM[];

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
    /** "whisper" is the owner's own words, handed to the agent mid-call; "platform" is what Chanlytics told it -- a correction, or the hand-over. */
    speaker: "agent" | "client" | "whisper" | "platform";
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
    recordingState: "ready" | "pending" | "failed" | "purged" | "none";
    /** What the caller wanted, in the post-call analysis's plain words; null while live or without an analysis. */
    wanted: string | null;
    /** How it ended, in the owner's words (callOutcomeWords); null without an analysis outcome. */
    outcomeWords: string | null;
    /** What to do next, from the analysis. */
    followUp: string | null;
    /** The name the caller gave. */
    callerName: string | null;
    /** "3 min 10 sec" once the call has ended: a length in words, so it never reads as a time beside a date. */
    lengthWords: string | null;
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
    /** Whether the channels read succeeded; false means the line's state is unknown, not absent. */
    lineRead: boolean;
    heartbeatMs: number;
    fetchedAtMs: number;
}
/** Seconds → "m:ss", the page's clock format. */
declare function fmtClock(seconds: number): string;
/**
 * Whether a call the last read called live is STILL up, between refreshes.
 *
 * `live` is decided when the calls are read; a call the provider stops talking
 * about does not un-set it, so every reader has to re-apply the heartbeat. Three
 * did it by hand (the Live page, the tab strip's pulse, the phone tab bar's
 * count) and they did not agree — the bar counted `live` alone, so its badge
 * could stay lit for a call nobody had heard from until the next fetch. One
 * rule, here.
 */
declare function liveStillUp(c: Pick<LiveCallVM, "live" | "heartbeatAtMs" | "startedAtMs">, heartbeatMs: number, nowMs: number): boolean;
/** What the shell says across the top while someone is on the phone. */
interface LiveBarVM {
    /** The one call to open, or null when there are several and the bar opens the list. */
    callId: string | null;
    /** "On the phone now · Dana" or "2 calls on your line now". */
    text: string;
    /** How long it has been running, for the bar's clock; null when unknown or several. */
    sinceMs: number | null;
    /** Still marked live, but the provider has gone quiet: no clock, and it says so. */
    checking: boolean;
}
/**
 * The live-call bar, or nothing.
 *
 * A call in progress is the most time-critical thing the product knows, and it
 * is true for minutes a week — so it is a bar the shell shows while it is
 * happening rather than a place in the nav that is empty the rest of the time.
 * It carries no controls: ending a call and handing it over are decisions with
 * confirmations, and they belong on Live, which this opens.
 */
declare function liveBar(vm: LiveVM | null | undefined, nowMs: number): LiveBarVM | null;
declare function toLiveCallVM(dto: CallDto, tz: string, now?: Date): LiveCallVM;
declare function toLiveVM(calls: CallDto[], channels: ChannelDto[] | null, tz: string, now?: Date): LiveVM;

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
 * The name a sign-in provider gave -- Google's `full_name`, then `name` -- for
 * an account that has not given one itself. Still the rule above: a name is
 * what a person gave, and they gave this one to Google; never anything made
 * from an email. Trimmed to what `profiles.display_name` holds.
 */
declare function providerNameOf(metadata: unknown): string | null;
/**
 * An open invitation's state on the Team card. The roster returns every
 * invitation nobody accepted or revoked, expired ones included -- an expired
 * one is still the owner's to revoke and re-send, and a card that called it
 * "pending" for ever was lying about a door that had closed.
 */
declare function inviteState(expiresAt: string | null | undefined, nowMs: number): {
    expired: boolean;
    words: string;
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
/**
 * The preference after this one, in THEME_OPTIONS' order, so the top bar's one button reaches all three. It flipped
 * the resolved theme between light and dark, so System could not be chosen there and a press dropped it (the wiring
 * audit's N19). An unknown preference reads as System, so the next is the first.
 */
declare function nextThemePref(pref: unknown): ThemePref;
/** What the top bar's theme button shows and says: the preference in force, and what a press makes it. */
declare function themeButtonWords(pref: unknown): {
    icon: string;
    label: string;
};
/** What the page paints: a chosen theme, or the device's when the choice is "system". */
declare function resolveTheme(pref: unknown, systemDark: boolean): Theme;
type SidebarPref = "open" | "rail";
declare const isSidebarPref: (v: unknown) => v is SidebarPref;
/** ⌘1 … ⌘9 for the first nine workspaces; none beyond. */
declare function workspaceHotkey(index: number): string | null;
/** Whether a key press belongs to a field the person is typing in. */
declare function isTypingTarget(tagName: string | null | undefined, contentEditable: boolean): boolean;
/** A crumb as the shell draws it: words, or words and the route they open. */
type Crumb = string | {
    label: string;
    to?: string | null;
};
/**
 * The browser tab's name: where you are, most particular first, then the
 * product -- "Rosa · Inbox · Chanlytics" -- because a narrow tab keeps only its
 * first words, and those are what tell a row of tabs apart. What needs you is
 * counted in front, so a tab in the background still says someone is waiting.
 */
declare function pageTitle(crumbs: readonly Crumb[] | null | undefined, needs?: number | null): string;
/** What a public page's tab and search listing say about it: the fields of Next's metadata those pages set. */
interface PublicPageMetadata {
    title: string;
    description?: string;
    robots: {
        index: boolean;
        follow: boolean;
    };
}
/**
 * A public page with nothing to show: named Not found, like the app's own not-found page, and never indexed. A page
 * that named nothing before it called notFound() left the tab on the app's title (the wiring audit's N21).
 */
declare function notFoundPageMetadata(): PublicPageMetadata;
/** What the shell knows that the page does not: the connection, the live feed, a pause, a newer build, surfaces that stopped refreshing. */
interface ShellStatus {
    stale: boolean;
    degraded: string[];
    /** The workspace is paused (billing stopped): the receptionist answers nothing until Billing resumes it. */
    paused?: boolean;
    /** This device has no connection: nothing on screen is kept current, and nothing pressed reaches the workspace. */
    offline?: boolean;
    /** The live feed dropped and did not come back within its grace: the page is current only as of its last read. */
    disconnected?: boolean;
}
interface ShellStatusLine {
    kind: "offline" | "paused" | "stale" | "degraded" | "disconnected";
    /** How loud: danger when customers are affected, warn when this screen is, info when nothing is lost. */
    tone: "danger" | "warn" | "info";
    text: string;
    /** What it means for the person, when the line alone would leave them guessing. */
    detail: string | null;
    action: "reload" | "billing" | "retry" | null;
    /** The press's words, and its words while it works. */
    cta: string | null;
    busy: string | null;
}
/**
 * The one line the shell shows over the page, or nothing: one thing at a time,
 * in the order that matters. Offline first: while nothing reaches the
 * workspace, nothing else the line could offer would work. Then a pause, which
 * reaches the customers. Then a newer build, which a reload fixes along with
 * anything stale. Then surfaces that stopped refreshing, and last the live
 * feed, which only delays what the next read shows.
 */
declare function shellStatusLine(s: ShellStatus | null | undefined): ShellStatusLine | null;
interface Shortcut {
    group: string;
    keys: string[];
    does: string;
}
/**
 * Every shortcut the app answers to, in the order the sheet lists them, under the page that answers it. "/" and J/K
 * were listed for every list (the wiring audit's N17): "/" searches only People, and J/K walk only People's rows and
 * the Inbox's. People's rows are the keys its table's foot names.
 */
declare const SHORTCUTS: readonly Shortcut[];
/** The sheet's groups, in order, each with its shortcuts. */
declare function shortcutGroups(list?: readonly Shortcut[]): Array<{
    group: string;
    items: Shortcut[];
}>;
type ToastTone = "ok" | "info" | "warn" | "danger";
declare const TOAST_TONES: readonly ToastTone[];
/** How long a toast stays, by tone: long enough to read, and a failure longer than a confirmation. */
declare const TOAST_MS: Readonly<Record<ToastTone, number>>;
/**
 * A toast with an Undo lives as long as the undo does. Fifteen seconds is the
 * reply's cancel window (SEND_GRACE_MS in core, the one real window the
 * product has); an Undo that outlived its window would lie, and one that died
 * before it would waste it. A caller that knows its exact window passes `ms`.
 */
declare const TOAST_UNDO_MS = 15000;
/** The least a toast may stay: a window that is nearly over is still read. */
declare const TOAST_MIN_MS = 2000;
declare const TOAST_ICONS: Readonly<Record<ToastTone, string>>;
interface ToastShape {
    tone: ToastTone;
    icon: string;
    /** A failure interrupts a screen reader; everything else waits its turn. */
    role: "status" | "alert";
    ms: number;
}
declare function toastShape(p: {
    tone?: unknown;
    icon?: unknown;
    undo?: unknown;
    ms?: unknown;
}): ToastShape;

type Tone = "accent" | "warn" | "info" | "ok" | "danger" | "plain";
declare const TONES: readonly Tone[];
/** The families of state a pill can name. */
type StateKind = "thread" | "standing" | "call" | "person" | "consent" | "mode" | "broadcast" | "playbook" | "template" | "template_quality" | "setup" | "role" | "tone" | "calendar"
/** Where a fact came from: the chip beside a value on the Business tab. */
 | "fact" | "escalation" | "lead_class" | "lead_stage" | "lead_fit" | "reach" | "lead_call_outcome" | "lead_row_state";
/** The tone for a state, or plain for one this map has never heard of. */
declare function stateTone(kind: StateKind, value: unknown): Tone;
/** The words for a state, or the value itself when nobody has written any. */
declare function stateLabel(kind: StateKind, value: unknown): string;
/** Both at once: what the pill draws. */
declare function stateOf(kind: StateKind, value: unknown): {
    tone: Tone;
    label: string;
};
/** What a pin needs to know about a lead to take a tone: its class, its fit, its row state, its two slots. */
interface LeadPinnable {
    cls: string;
    fit: string | null;
    state: string;
    slots: {
        phone: {
            state: string;
        };
        mailbox: {
            state: string;
        };
    };
}
/**
 * The tone a lead's pin wears on the map, by what the map is coloured by.
 *
 * The map kept a table of its own, in leads.css, keyed by `strong`/`part`/`talking` -- words no tone vocabulary
 * knows -- so it was a sixth colour family that this file could not reach. It had already drifted: a `look` fit
 * drew amber on a pin while this map calls it plain. And because those rules named no element, and leads.css is
 * imported after clients.css, `.tone-ok` painted EVERY `tone-ok` in the app solid green -- a Today attention row,
 * and the peek's own Interested chip. Both now come through here.
 *
 * A pin is data, so by the chart kit's rule it never wears the accent, and none of these branches can return it.
 */
declare function leadPinTone(lead: LeadPinnable, by: "fit" | "reach" | "stage"): Tone;

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
/** One of the product's six tones (tone.ts): a channel that waits on someone is "in progress", not "live". */
type ConnectionTone = Tone;
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
    body: "google_choose" | "business_record" | "email_setup" | null;
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
    /** Email as Setup is told it (mailbox.ts); null or absent while Setup has not been read, or on a deployment without it. */
    email?: EmailSetupDto | null;
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

/**
 * The back office: every workspace, and what is up with each one.
 *
 * WHY THIS EXISTS. There was no cross-tenant view at all. Every support
 * question — "why isn't my receptionist answering?" — was answered by writing
 * SQL by hand, once, unrepeatably, by the one person who knew the schema. At
 * four workspaces that is merely slow. At four hundred it is the reason nobody
 * else can ever answer a customer.
 *
 * WHY IT IS NOT A TABLE OF COLUMNS. A list of states is another thing to
 * interpret, and interpreting it is the work. So every workspace gets a VERDICT
 * — one of ten, each meaning a different next action — and one sentence saying
 * what that action is. The list sorts itself so the ones needing a person are
 * at the top, and a support shift is "work down the page" rather than "know
 * which column matters".
 *
 * WHY THE WORDS ARE THE CUSTOMER'S. `textingWords` and `receptionistOn` are the
 * same functions the workspace's own Setup page and billing rows call. Support
 * reading a different rendering of the same facts is how you get two people on
 * a call disagreeing about what the product says — so there is one rendering,
 * and this file adds only the cross-workspace judgement that nobody else needs.
 */

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
    /** One of the product's six tones (tone.ts): waiting on an owner is "in progress", not "live". */
    tone: Tone;
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
type PlatformLineAction = "retry" | "refile" | "replace" | "release";
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
declare function platformLineActions(l: Pick<LineDto, "e164" | "voice_state" | "sms_state" | "reg_mock" | "state_since">, nowMs?: number): PlatformLineActionVM[];
/** The one line a confirmation leads with: what it costs, then whether it can be undone. */
/**
 * Whether the machinery under every workspace is running.
 *
 * The database has answered this for a while and nobody in the product could
 * see it: `sweep_health()` and `jobs_backlog()` were read by the health sweep
 * and by /api/health, both of which speak to a monitor outside the product,
 * and referenced nowhere in the dashboard. The platform knew whether it was
 * healthy and never told the person whose business depends on it.
 *
 * It is the BACK OFFICE's, not an owner's. Both functions count across every
 * workspace, so a salon owner shown "forty jobs are late" has been told
 * something that is not about them, cannot be acted on by them, and says
 * something about other customers' load.
 *
 * The judgement lives here so the outside monitor and the back office cannot
 * come to different conclusions from the same two rows. Their WIRE shapes
 * still differ on purpose: /api/health's body is read by a pinger that was
 * configured against it.
 */
/** One registered clock, as `sweep_health()` reports it. */
interface SweepHealthRow {
    sweep: string;
    healthy: boolean;
    detail: string | null;
    /** When it last spoke: the request it enqueued, or its last successful run. */
    last_request_at: string | null;
    status_code: number | null;
    scheduled: boolean;
    alerted_at: string | null;
}
interface PlatformHealth {
    ok: boolean;
    /** The clocks that are not healthy, in the order the function returned them. */
    unhealthy: Array<{
        sweep: string;
        detail: string | null;
    }>;
    /** Due jobs nobody has claimed for two minutes. Null when it could not be read. */
    backlog: number | null;
    checkedAt: string;
}
/**
 * Healthy is every clock healthy AND nothing piling up.
 *
 * A backlog that could not be READ is not a backlog of zero: null keeps the
 * verdict false, because "I could not find out" and "all clear" are the two
 * answers a health check must never confuse.
 */
declare function platformHealthOf(rows: readonly SweepHealthRow[] | null | undefined, backlog: number | null, now?: Date): PlatformHealth;
/** One sentence for the card: what is wrong, or that nothing is. */
declare function platformHealthWords(h: PlatformHealth): string;
declare function platformActionWarning(a: PlatformLineActionVM): string;
/** One person waiting, as the back office is told about them. */
interface WaitingPersonDto {
    id: string;
    email: string;
    /** What they said they run. Optional on the form, so often null. */
    business: string | null;
    /** The page they came from, when it said. */
    source: string | null;
    created_at: string;
}
interface PlatformQueue {
    /** Oldest first: the order they are invited in. Null when the queue could not be READ, which is not an empty queue. */
    waiting: WaitingPersonDto[] | null;
    /** How many are waiting in total; the list above is capped. Null when it could not be read. */
    total: number | null;
}
interface WaitingRowVM {
    id: string;
    email: string;
    /** "Melany's Beauty Salon · from the pricing page", or whichever half they gave. */
    detail: string | null;
    /** "asked 3d ago" */
    waited: string;
}
interface PlatformQueueVM {
    rows: WaitingRowVM[];
    /** One line for the card: how many, how long the first has waited, or that nobody is waiting. */
    sentence: string;
    /** True when the queue could not be read. An empty list and an unreadable one must never look the same. */
    unreadable: boolean;
    /** What the product does about any of this, said where the button is: nothing. */
    note: string;
}
/**
 * How many of the queue the page draws. A hundred is more than a person works
 * through in a sitting, and the sentence says how many there are in total, so
 * the cap costs nobody a fact -- only a scroll.
 */
declare const QUEUE_SHOWN = 100;
/** Said next to the only action there is, because the action is not what it looks like. */
declare const QUEUE_SENDS_NOTHING = "Chanlytics sends no invitations. Write to them yourself, then mark it here so the queue moves.";
declare function platformQueue(q: PlatformQueue, nowMs?: number): PlatformQueueVM;

interface ConsentPageFacts {
    businessName: string;
    /** The workspace's slug, for the links to its own privacy page and terms. */
    slug?: string | null;
    /** Whether `/b/<slug>` publishes: it needs a legal name and an address. Without it the links fall back to Chanlytics' own pages. */
    businessPage?: boolean;
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
    /** Privacy policy and terms, beside the asks: the business's own pages when it has them. */
    links: PolicyLinks;
    /** True when this workspace has no way to say yes yet: the page says so rather than pretending. */
    empty: boolean;
}
interface PolicyLinks {
    privacy: string;
    terms: string;
}
/**
 * Where the privacy policy and the terms are, beside the asks. A reviewer wants
 * both links "in or immediately next to the CTA" (30549, 30550, 30564), and
 * wants them to be the BUSINESS'S -- opt-in evidence for a different company is
 * its own refusal (30927). The business's own pages when it has them, and
 * Chanlytics' own when it has not said who it is yet.
 */
declare function policyLinks(f: Pick<ConsentPageFacts, "slug" | "businessPage">): PolicyLinks;
/**
 * The confirmation a customer receives the moment they say yes.
 *
 * Every recurring program owes it, however the yes was given -- web, paper or
 * text -- and the reviewers' guide says what it carries: the brand or program
 * name, "Message and data rates may apply", how to get help, how to stop, and
 * the frequency. ONE set of words: the campaign files them as its opt-in message
 * and the receptionist sends them, so the filing and the wire cannot disagree.
 * Which question was answered decides which confirmation goes, and neither
 * confirms the other -- the live campaign was refused three times over a
 * confirmation that said "offers and news" for the appointment keyword.
 */
declare function optInConfirmation(businessName: string, purpose: SendPurpose): string;
/**
 * The words staff say when they ask for a yes in person or on the phone.
 *
 * A spoken yes is an opt-in method the campaign has to describe, and the
 * reviewers accept one only with "the exact script or flow in enough detail
 * that a reviewer can verify" it (error 30896 -- the fifth refusal of the live
 * campaign, 12 Sep 2026, named the message flow, which said staff "record it
 * with the date" and nothing about what was asked). So the question is one
 * sentence, here: the filing quotes it as method (3) and the profile shows it
 * beside the "In person" and "On the phone" buttons, and the two cannot drift
 * apart. It carries what a call to action carries -- the program, the
 * frequency, the rates line, HELP and STOP -- and it is good for messages about
 * a visit only: a yes to offers is written or it is not recorded
 * (offersYesRefusal), and the flow says so.
 */
declare function verbalOptInScript(businessName: string): string;
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
 * One of the two questions on the paper form: its own box, its own disclosures,
 * its own signature.
 */
interface ConsentFormSection {
    purpose: SendPurpose;
    title: string;
    lead: string;
    /** What ticking the box says, in the customer's own voice. Printed unticked: a box that arrives ticked is not a yes. */
    box: string;
    optional: string | null;
    terms: string[];
    /** The line signed for THIS box only. */
    sign: string;
}
interface ConsentFormVM {
    title: string;
    lead: string;
    /** Filled in once, above both boxes. */
    fields: string[];
    sections: ConsentFormSection[];
    terms: string[];
    /** Printed as addresses a person can type: the business's own pages when it has them. */
    links: PolicyLinks;
    /** The line the business fills in when it records the sheet: its own audit trail. */
    office: string;
}
/**
 * The same two asks, on paper: `/yes/<slug>/form`.
 *
 * A yes to offers has to be WRITTEN -- the carriers refuse a campaign whose
 * marketing opt-in relies on a spoken yes (Twilio lists it among the causes of
 * error 30913) -- and a customer at the desk may not want to text anything.
 * Twilio names "a signed form section" as one of the three controls that qualify,
 * provided it is its own section. So each ask is its own box, printed unticked,
 * in the page's own words, with its own signature; the business records each
 * signed box as "Sign-up form" and keeps the sheet.
 *
 * It is also what a reviewer is shown. The filing names this URL as the paper way
 * to say yes, and a reviewer can only accept a form they can see.
 *
 * Unlike the page it needs no number: a business can take signed forms before its
 * line is approved for texting.
 */
declare function consentFormVM(f: Pick<ConsentPageFacts, "businessName" | "slug" | "businessPage"> & {
    whatsappE164?: string | null;
}): ConsentFormVM;
/**
 * What `/yes/<slug>`'s tab says: the page's own heading, or Not found when no workspace answers to the slug, which is
 * when the page shows Not found. Never indexed: the page is for the people given the link (the wiring audit's N21).
 */
declare function consentPageMetadata(f: ConsentPageFacts | null): PublicPageMetadata;
/** The paper form's tab: the sheet it is, for the business it asks for, or Not found. Never indexed. */
declare function consentFormMetadata(f: (Pick<ConsentPageFacts, "businessName" | "slug" | "businessPage"> & {
    whatsappE164?: string | null;
}) | null): PublicPageMetadata;
/**
 * The sign for the desk: `/yes/<slug>/sign`, printed and put where customers wait.
 *
 * The code was on every page an OWNER looks at and on nothing a customer does. "Download QR" handed over an .svg,
 * which most owners cannot open, let alone print; and a bare code on a desk says nothing a customer needs before
 * scanning it -- whose messages, what they are, how to stop them. Printing the public page printed a page of
 * disclosures with a small code in the middle. This is the thing itself: the business, what a yes gets you, the code
 * large enough to scan from where a customer stands, and under it what a call to action owes, which is the offers
 * ask's own terms and the page's foot -- the page's words, never a copy of them.
 *
 * ONE ask, the offers one, because the code is the offers one (consentPageVM's qrLink): a sign asking both questions
 * would need two codes and two blocks of disclosures, which is the page. And WhatsApp only, for the page's reason:
 * the texting line is registered for messages about a visit, and YES OFFERS offered on it is error 30896.
 */
interface DeskSignVM {
    /** Whose messages: the sign's first words. */
    business: string;
    /** What a yes gets you, as a call to action. */
    headline: string;
    /** Scan, and what happens when you do. */
    how: string;
    /** The same yes without scanning: the words, in both languages, and the number to send them to. */
    byHand: string | null;
    /** What a call to action owes beside it: the offers ask's terms, then what is true of both asks. */
    terms: string[];
    /** Who sends, for a reader who wants to know who is behind the number. */
    operator: string;
    /** The offers link, the one the page's QR encodes; null without WhatsApp. */
    qrLink: string | null;
    links: PolicyLinks;
    /** No WhatsApp number, so no code: said instead of printing a sign that opens nothing. */
    empty: boolean;
    /** What the page says when it is empty. */
    emptyLine: string;
}
declare function deskSignVM(f: ConsentPageFacts): DeskSignVM;
/** The desk sign's tab: the sheet it is and whose it is, or Not found. Never indexed, like the page it prints from. */
declare function deskSignMetadata(f: ConsentPageFacts | null): PublicPageMetadata;

/**
 * How long the product keeps what, in one place.
 *
 * The privacy page says it and a sweep enforces it, and both read this file, so
 * the two cannot drift. A table is listed here only once something actually
 * removes it on that schedule: a number on this list is a promise the product
 * keeps, not one it would like to. Until 12 Sep 2026 the page said "call
 * recordings are kept for 90 days" and nothing in the repo deleted one.
 */
declare const RETENTION_DAYS: {
    /** Call audio in the private media bucket. The transcript and the summary stay with the call (api/cron/calls). */
    readonly call_recordings: 90;
    /** The evidence kinds on the events ledger (EVENT_EVIDENCE_KINDS); every other kind is the record and is kept (purge_events, 00115). */
    readonly events_evidence: 30;
    /** Assistant threads untouched for this long, with their messages (purge_ask, 00040). */
    readonly ask_threads: 90;
    /** The bell's rows and their marks (purge_notifications, 00057). */
    readonly notifications: 90;
    /** The sweeps' run history; a clock that fires every few minutes keeps a day (purge_cron_history, 00099). */
    readonly cron_history: 14;
    /** A found lead nobody worked (no contact, no export, no person): set aside, then its details removed (purge_leads, 00140). */
    readonly leads_untouched: 90;
    readonly leads_untouched_blanked: 180;
    /** A place a search left out: its details removed, while the count of what was left out stays (purge_leads, 00140). */
    readonly leads_excluded_blanked: 30;
};
/** Rate-limit counters (00059): two hours, in hours. */
declare const RATE_HITS_RETENTION_HOURS = 2;
/**
 * The event kinds that are evidence rather than the record: receipts,
 * delivery logs, unplaced messages, and the model-usage rows the two budgets
 * read over a rolling day. Purged after RETENTION_DAYS.events_evidence; the
 * activity log hides the same families unless asked by name
 * (ACTIVITY_NOISE_PREFIXES). usage.voice_seconds and usage.wa_conversation
 * are NOT here: a call's cost and a WhatsApp conversation's opening are the
 * record, and the reports read them.
 */
declare const EVENT_EVIDENCE_KINDS: readonly ["webhook.auth", "webhook.delivery", "ingest.allowlist_skip", "ingest.unreachable_sender", "ingest.unroutable", "usage.llm_tokens", "usage.ask_tokens"];
/** The retention, as the privacy page states it: one paragraph, from the numbers above. */
declare function retentionWords(): string;
declare const RECORDING_RETENTION_DAYS: number;
/** What a call says once its audio has been removed on schedule. */
declare const RECORDING_PURGED_WORDS: string;

/**
 * The activity log: both ledgers, in an owner's words.
 *
 * The decisions ledger says what a person did (or the receptionist, or the
 * system, on their behalf); the events ledger says what happened. Both have
 * existed since the first slice and neither was readable by an owner except
 * inside one person's timeline. One row shape, one sentence per kind, and
 * nothing of a payload but the few fields a sentence names -- the payloads
 * carry numbers, addresses and provider ids from every corner of the product
 * and none of that belongs on a screen by accident.
 */
interface ActivityRowDto {
    id: string;
    at: string;
    /** Which ledger: a decision (somebody did) or an event (something happened). */
    source: "decision" | "event";
    /** The verb or the kind, as the ledger spells it. */
    kind: string;
    subject_type: string | null;
    subject_id: string | null;
    /** The member who did it, when a member did; null for the receptionist and the system. */
    actor_user_id: string | null;
    actor_type: string | null;
    /** The sentence. */
    text: string;
}
interface ActivityPageDto {
    rows: ActivityRowDto[];
    /** Member id → the name to show (their name, else the address they signed in with). */
    actors: Record<string, string>;
    /**
     * Where this page ended, not how far down it started: `next_cursor` is
     * `"<created_at>|<row id>"` and is what asks for the page behind it. An
     * offset made every page read the whole log above it (server/activity.ts).
     */
    page: {
        limit: number;
        has_more: boolean;
        next_cursor: string | null;
    };
    /** The kinds the page may filter by, both ledgers', for the picker. */
    kinds: string[];
}
/** Ledger families that are evidence rather than activity: hidden unless asked for by name. */
declare const ACTIVITY_NOISE_PREFIXES: readonly ["usage.", "webhook.", "ingest."];
/**
 * The sentence for a row: the kind's words, then the one or two fields a
 * reader wants and nothing else of the payload.
 */
declare function activityWords(kind: string, payload: unknown): string;
/** The tone for a row, or "plain" where the product does not claim to know. */
declare function activityTone(kind: string): Tone;
/** Every kind either ledger may hold, for the picker: the verbs, then the event kinds. */
declare const ACTIVITY_KINDS: readonly string[];
/** true for a kind an owner is not shown unless they ask for it by name. */
declare function isActivityNoise(kind: string): boolean;

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
/**
 * What the program collects and what it is used for. Error 30908's remedy asks a
 * privacy policy to "document what customer data you collect and how it's used";
 * the clause above says what is NOT done with it, and this says what is.
 */
declare function dataSentences(businessName: string): string[];
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
    /** This page, which is what the campaign files as the business's privacy policy: `/b/<slug>`. */
    privacyUrl: string;
    /** The program's terms, beside it: `/b/<slug>/terms`. */
    termsUrl: string;
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
    /** What the messaging program keeps about a customer and what for: the disclosure a privacy policy owes (30908). */
    yourData: string[];
    /** The program's own terms page. */
    termsUrl: string;
    /** Their own site, when they gave one. */
    websiteUrl: string | null;
    /** True when the record is too thin to publish honestly. */
    empty: boolean;
}
declare function businessPageVM(f: BusinessPageFacts): BusinessPageVM;
interface TextingTermsVM {
    title: string;
    /** Who is bound by these terms: the business, by its registered name and address. */
    lead: string;
    /** Each thing the carriers look for, in their order. HELP and STOP are set in bold by the page. */
    items: {
        label: string;
        text: string;
    }[];
    /** The business's privacy page, `/b/<slug>`. */
    privacyUrl: string;
    /** True when the record is too thin to publish honestly. */
    empty: boolean;
}
declare function textingTermsVM(f: BusinessPageFacts): TextingTermsVM;
/**
 * What `/b/<slug>`'s tab and search listing say, by the rule the page renders by: Not found, and unindexed, when there
 * is no record or it does not name a legal business with an address. An unknown slug left the tab on the app's own
 * title, and an unfinished record named Not found for the business and marked it indexable (the wiring audit's N21).
 */
declare function businessPageMetadata(f: BusinessPageFacts | null): PublicPageMetadata;
/** The program's terms, by the same rule: named for the business customers know, or Not found and unindexed. */
declare function textingTermsMetadata(f: BusinessPageFacts | null): PublicPageMetadata;
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
 * What the Business tab says, as view models.
 *
 * Named apart from `business-page.ts` (the public /b/<slug> page) and
 * `business-record.ts` (the carrier record). This one is the operator's own tab.
 *
 * Every sentence with a number or a judgement in it is composed here rather
 * than in the page, for the reason Today and Reports already hold to: a
 * sentence written in JSX cannot be tested, and the same sentence written
 * twice is one that will be edited once.
 *
 * The prompt view, which cuts what the receptionist reads into the blocks that
 * wrote it, is `prompt-blocks.ts`.
 */
/**
 * The guardrail keys the profile stores, read off the schema rather than copied
 * from it. A copy would let a new rule reach the schema without a strength here;
 * derived, `STRENGTHS` below fails to compile until somebody says how far it goes.
 *
 * Read inside a call marked pure: a top-level call is a side effect to the bundler,
 * so a bare one kept this list in the four dists that bundle contracts and never use it.
 */
declare const GUARDRAIL_KEYS: ("never_quote_prices" | "never_confirm_booking" | "disclose_ai" | "no_health_advice")[];
type GuardrailKey = (typeof GUARDRAIL_KEYS)[number];
/**
 * How far a rule actually goes.
 *
 * The page drew four identical switches over three different guarantees, which
 * is the quietest dishonesty it had. One of these the product cannot break at
 * all; one has a detector on both channels; two are lines in a prompt, and
 * `policy.ts` says in its own header that an instruction is not an enforcement.
 */
type RuleStrength = "structural" | "checked" | "instructed";
interface RuleStrengthVM {
    strength: RuleStrength;
    /** The chip beside the rule's name. */
    chip: string;
    /** What actually happens, in the owner's words. */
    sentence: string;
    /** For a checked rule, what happens per channel. Null otherwise. */
    checkedOn: {
        channel: "whatsapp" | "voice";
        words: string;
    }[] | null;
}
declare function ruleStrength(key: GuardrailKey): RuleStrengthVM;
/** The subset of the brain the standing line reads. */
interface StandingInputs {
    business_name?: string | null;
    booking_link?: string | null;
    profile?: {
        address?: string | null;
        tone?: string | null;
        hours?: Record<string, unknown> | null;
        services?: unknown[] | null;
    } | null;
}
interface StandingVM {
    /** What it can answer, in one clause. */
    can: string;
    /**
     * What it will not do: state a price. Said whenever there are services to price,
     * whatever the price switch says, because the detector runs either way (the owner's
     * decision, 20 Sep 2026). Null with nothing to price.
     */
    wont: string | null;
    /** The single most useful gap, and the row that fixes it. Null when there is none. */
    missing: {
        sentence: string;
        row: string;
    } | null;
}
/**
 * Three clauses, worst last.
 *
 * The gaps are ordered by what a customer notices: a receptionist with no name
 * cannot introduce itself, one with no hours cannot answer the commonest
 * question, and one with no voice answers in nobody's words. Only
 * the first gap is named — a list of six is a list nobody starts.
 */
declare function standingLine(i: StandingInputs): StandingVM;
/**
 * What the receptionist can do, and what it cannot.
 *
 * The tab sets the inputs to three of the phone agent's four tools
 * (`check_availability`, `send_booking_link`, `transfer_to_staff`) and has
 * never said a tool exists. An owner could not know their phone agent sends
 * the booking link to a caller's WhatsApp.
 *
 * Computed from what the records show, never typed: an ability is ready only
 * when its channel is live and its input is filled. Every sentence below was
 * checked against the code it describes, because the first draft of three of
 * them was not true: the link goes by WhatsApp and never by text, a transfer
 * happens only during opening hours and stays on the line, and a hand-off is a
 * pause that ends, not a stop.
 *
 * Every input is required, and the booleans are checked as it runs: the page
 * that calls this is untyped JSX, and a boolean it left out would be read as
 * false -- a live line drawn dark, a hold drawn as none -- with no error at all.
 */
interface AbilityInputs {
    voiceLive: boolean;
    whatsappLive: boolean;
    hasCalendarFeed: boolean;
    hasBookingLink: boolean;
    /** An approved booking-link template: the call sends the link as one (template-library bookingTemplate). */
    hasBookingTemplate: boolean;
    hasHandoffNumber: boolean;
    hasEscalateWhen: boolean;
    /**
     * The Autonomy reply row's `limits.pause_hours`, exactly as stored -- usually
     * nothing, because most owners never set it. Read here the way the Autonomy pane
     * reads it (hardLimitsWords), which is the way the edge applies it: nothing, null
     * or 0 is the 24-hour default.
     */
    pauseHours: unknown;
    visionOn: boolean;
    /**
     * The Autonomy tab's Booking row is not on auto, so a person confirms bookings
     * and the link is never sent: bookingHeld(policy), the edge's own question.
     */
    bookingHeld: boolean;
}
interface AbilityRowVM {
    id: "answer" | "open_times" | "booking_link" | "transfer" | "handoff" | "vision";
    title: string;
    detail: string;
    channels: {
        voice: boolean;
        whatsapp: boolean;
    };
    /** The row on this page that supplies it. Null when nothing does. */
    runsOn: {
        label: string;
        row: string;
    } | null;
    ready: boolean;
    /** Only the opt-in ability carries this. */
    on?: boolean;
}
declare function abilityRows(i: AbilityInputs): AbilityRowVM[];
interface CannotRowVM {
    id: "book" | "outbound_call" | "sms";
    title: string;
    detail: string;
    /** True when it is a thing the product intends to sell later. */
    soon?: boolean;
}
/**
 * Said here so nobody has to find out from a customer.
 *
 * None of these is a setting that could be switched on, and saying so on the
 * page that holds the switches is the difference between a limit and a bug.
 *
 * Texting is the one that changes: it goes live on an active carrier line that
 * is not a rehearsal filing (capabilities.ts), and on such a line "not part of
 * what is sold yet" is not true, so the row is left out. `smsLive` is checked as
 * it runs, like abilityRows' inputs: left out by an untyped page, it would read
 * as not live.
 */
declare function cannotRows(i: {
    smsLive: boolean;
}): CannotRowVM[];

/**
 * The Business tab's prompt view: the composed prompt, cut into the blocks that
 * wrote it.
 *
 * Apart from `business-tab.ts`, which holds the tab's sentence tables, because
 * this is a different kind of code: it reads what `config.ts` writes, and has to
 * keep reading it the way the composer writes it.
 */
/**
 * The composed prompt, cut into the blocks that wrote it.
 *
 * The preview was one 4,000-character <pre> behind a Show toggle. Every block
 * in it came from somewhere, and naming where turns a dump into a map back into
 * the page — which is also the only way an owner can see that services and
 * their own words are more than half of everything it reads.
 *
 * Four kinds of text, and each has to land in the right place:
 *
 *   - Text a row wrote, under a heading the composer emits: hours, services,
 *     the hand-off. Cut on those headings, read off `composeSystemPrompt`, so a
 *     heading it stops emitting simply stops appearing here.
 *   - The owner's own words, which have no reliable heading -- the composer
 *     frames them only when there is something above to disagree with. Found by
 *     their literal text instead, as `whoseWords` names them (the resolver's own
 *     rule, `ownWordsOf`, and whose they are), so a prompt the resolver carried
 *     in their place is found too. Fenced off FIRST: they are
 *     often a prompt written before the form existed, restating the hours and
 *     services under headings of their own, and a cut on headings would count
 *     that old prose as the Hours and Services rows.
 *   - Text Chanlytics writes for every workspace: the call's tool mechanics, the
 *     medium line, the open-times line, and the opening lines every new
 *     workspace is given as its prompt. Named as the platform's wherever it is a
 *     block of its own. Two kinds of platform line are not: the composer writes
 *     them under the rules heading, among the rules the owner switches -- the
 *     line for a customer who replies YES OFFERS, on every workspace, and under
 *     "ask" the Autonomy tab's rules. That block stays the rules row's, and its
 *     note says which of its lines are not the owner's.
 *   - The Autonomy tab's rules, where they are the only rules: a workspace with
 *     no fields is handed its own prompt back as it stands, and nothing is
 *     composed around it but those.
 */
interface PromptBlockVM {
    /** This block among the others, unique in one cut, so it can key a list and name a test id. */
    id: string;
    /**
     * Who wrote it: a row on the page ("hours", "handoff", "extra_instructions" and
     * the rest), "platform" for what Chanlytics writes, or "autonomy" for the
     * Autonomy tab's rules. The platform speaks on both sides of the owner's words
     * on a call, so a row can recur; `id` tells the two apart.
     */
    row: string;
    label: string;
    /** For display: the block's text, trimmed. */
    text: string;
    /** Its exact share of the prompt, separators included, so the blocks sum to the whole. */
    chars: number;
    /** A caveat worth saying beside the block. */
    note?: string;
}
/**
 * What a prompt was composed from, which decides whose words are looked for in
 * it. The stored brain, for the prompt `resolveSystemPrompt` returned: a blank
 * box carries the old prompt in, and that IS what the receptionist reads.
 * `{ profile }`, for a draft run through `composeSystemPrompt`, which never
 * carries. Null when there is nothing to look for.
 */
type PromptSource = {
    system_prompt?: string | null;
    profile?: {
        extra_instructions?: string | null;
    } | null;
} | null;
declare function promptBlocks(text: string, channel: "whatsapp" | "voice", from: PromptSource): PromptBlockVM[];

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
    password: z.ZodOptional<z.ZodString>;
    timezone: z.ZodOptional<z.ZodString>;
    code: z.ZodOptional<z.ZodString>;
}, z.core.$strict>;
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
/**
 * WHAT THE FORM SAID, KEPT UNTIL ITS OWNER PROVES THE INBOX.
 *
 * Sign-up used to make the workspace on the spot, for an address nobody had
 * proved. A stranger typing someone else's email got that person a workspace
 * named by the stranger, owned by an account they never asked for, provisioned
 * and counted against a cap they never spent -- and when the address's real
 * owner signed up, they were told nothing, sent a code, and signed in to the
 * stranger's choice of name.
 *
 * So the form's two answers ride on the auth user, under this key, and the
 * workspace is made by the person who enters the code, through the same door
 * a second workspace uses. This is a prefilled form, not a permission: the
 * screen shows the name and clock, the owner may change both, and nothing is
 * read from it once a workspace exists.
 */
declare const PENDING_WORKSPACE_KEY = "pending_workspace";
declare const PendingWorkspaceSchema: z.ZodObject<{
    name: z.ZodString;
    timezone: z.ZodPipe<z.ZodOptional<z.ZodNullable<z.ZodString>>, z.ZodTransform<string | null, string | null | undefined>>;
}, z.core.$strip>;
type PendingWorkspace = z.infer<typeof PendingWorkspaceSchema>;
/** The pending workspace on a user's metadata, or null when there is none worth showing. Never throws: metadata is whatever Supabase holds. */
declare function pendingWorkspaceOf(metadata: unknown): PendingWorkspace | null;
/** What the page says, in one place. The sentence after a submit is the same whether or not the address was known. */
declare const SIGNUP_WORDS: {
    readonly title: "Create your workspace";
    readonly lead: "Your business gets its own workspace: the receptionist, the inbox, the numbers. You become its owner.";
    readonly sent: (email: string) => string;
    readonly codeRequired: "Sign-up is by invitation right now. Enter the invite code you were given.";
    readonly notSentTitle: "We could not send your code";
    readonly notSent: "We could not send the sign-in code just now. Wait a few minutes and ask for it again from the sign-in page — nothing is lost.";
    readonly waitlistTitle: "Join the list";
    readonly waitlistLead: "We are onboarding businesses in small groups, so every new workspace gets set up properly. Leave your details and we will send you an invite.";
    readonly waitlistSent: (email: string) => string;
    readonly waitlistCta: "Join the list";
    /** Under the business's name on the first-workspace screen: the list writes to the address the person signed in with. */
    readonly waitlistWriteTo: (email: string) => string;
    /** The list answered, but not with a place on it. */
    readonly waitlistNotJoined: "You are not on the list yet. Refresh this page and try again.";
    /** No answer came back at all: said the same on the sign-up page and the first-workspace screen. */
    readonly unreachable: "Could not reach Chanlytics just now. Try again.";
    readonly codeWrong: "That invite code is not right.";
    readonly crossSite: "That request did not come from this site.";
    readonly haveOne: "Already have a workspace?";
    readonly newHere: "New to Chanlytics?";
    readonly clock: (tz: string) => string;
    readonly google: "Continue with Google";
    readonly or: "or, with your work email";
    readonly googleNext: "You'll name your workspace on the next screen.";
    readonly googleFailed: "Google sign-in didn't complete. Try again, or use your email.";
    readonly firstWorkspaceCode: "Sign-up is by invitation right now. Enter the invite code you were given to make your first workspace.";
    readonly confirmTitle: "Confirm your email";
    readonly confirmLead: (email: string) => string;
    readonly confirmSubmit: "Confirm and continue";
    /**
     * Arriving at the code step from SIGN-IN, because the address was never
     * confirmed. It says what is true, why they are seeing it, and that their
     * password was not the problem -- which is the thing they would otherwise
     * assume, and would then try to reset.
     */
    readonly confirmFromSignIn: (email: string) => string;
};
/**
 * Is a failed send OURS to admit, or the caller's not to learn?
 *
 * Two failures wear one shape. "This address is unknown / already registered" is
 * about THEM and must stay opaque: answering differently is an account-enumeration
 * oracle on a public form. "We are over our mail budget" or "no mail provider is
 * configured" is about US, discloses nothing about any address, and is the only
 * one a person can act on.
 *
 * Matched on Supabase's own codes and statuses first, with a message fallback,
 * because the code is the stable half and the wording is not. Anything
 * unrecognised is treated as THEIRS -- the safe direction, since a wrong guess
 * here leaks whether an account exists.
 *
 * "Error sending confirmation email", and its recovery and magic-link twins, is
 * how Supabase says the mail provider refused a send. It says the send failed,
 * not whether the address has an account, so it is OURS. Read as theirs it
 * threw, and sign-up answered a 500 where the page has a sentence for exactly
 * this (13 Sep 2026).
 */
declare function sendFailureIsOurs(e: {
    code?: string;
    status?: number;
    message?: string;
} | null | undefined): boolean;
/**
 * Is this the platform saying the address is already registered?
 *
 * THE PROJECT DOES NOT HIDE THIS BY ITSELF, and it is not going to. Supabase
 * returns an obfuscated user for a known address only when email AND phone
 * confirmations are both on, and the phone flag lives behind a phone provider
 * this product will never switch on: the dashboard will not save that form
 * without SMS credentials, and its own toggle says it enables phone-based
 * login. Adding a whole sign-in channel nobody uses, to hold one flag, is a
 * worse bargain than keeping the invariant ourselves.
 *
 * So the neutrality is OURS. The caller answers an address we already have
 * exactly as it answers a new one, and nothing downstream learns which it was.
 * Without this, an ordinary second sign-up becomes a 500 -- a dead end for the
 * person, and a 500-versus-200 oracle for everybody else.
 *
 * Matched on the code first: the code is the stable half and the wording is not.
 */
declare function addressAlreadyKnown(e: {
    code?: string;
    message?: string;
} | null | undefined): boolean;
/**
 * The account exists, the password is right, and the address was never
 * confirmed.
 *
 * REQUIRING CONFIRMATION CREATED THIS STATE, so requiring it obliges us to
 * offer a way out of it. Somebody signs up, reaches the code screen, closes
 * the tab, and comes back tomorrow: they have an account and they know their
 * password, and sign-in refuses them. The neutral sentence about the pair not
 * matching is the right answer for a wrong password and the wrong answer here,
 * and without this branch there is no screen anywhere that would send them
 * another confirmation.
 *
 * SAYING SO LEAKS NOTHING, which is the part worth being careful about. Only a
 * caller who has supplied the correct password for an existing account reaches
 * this answer, and they plainly know the account exists. Nobody else gets here.
 */
declare function emailNotConfirmed(e: {
    code?: string;
    message?: string;
} | null | undefined): boolean;
/** The device's zone when the runtime knows one; otherwise nothing, and the database defaults it. */
declare function deviceTimezone(resolve?: () => string | undefined): string | undefined;
/**
 * The door to a FIRST workspace, for an account that arrived through a
 * provider rather than the sign-up form.
 *
 * Sign in with Google makes the auth user before anything of ours runs, so the
 * posture cannot be asked at /api/v1/signup the way the email form asks it.
 * It is asked where every first workspace is made instead -- the create route
 * -- and only of an account with no membership yet. Somebody already inside
 * was let in by an invitation or by their first workspace, and makes the next
 * one without a code.
 */
type FirstWorkspaceDoor = {
    open: true;
} | {
    open: false;
    code: "forbidden";
    message: string;
};
declare function firstWorkspaceDoor(o: {
    posture: SignupPosture;
    memberships: number;
    codeMatches: boolean;
}): FirstWorkspaceDoor;
/**
 * Where Google sends the browser back: our callback, which exchanges the code
 * for the session cookie and lands where the page asked. Built here so the
 * page and its test agree on the shape, and so `next` is always encoded.
 */
declare function googleCallbackUrl(origin: string, next: string): string;
/** The sign-in page's resend cooldown, in seconds: the wait Supabase enforces per address, shown rather than discovered. */
declare const SIGNIN_RESEND_COOLDOWN_S = 60;
/** Seconds until "Resend code" may be pressed again; 0 when it may, or when no code was sent. */
declare function resendLeft(sentAtMs: number | null | undefined, nowMs: number, seconds?: number): number;
/**
 * Errors on the CODE-REQUEST step, translated for humans without confirming
 * whether an account exists.
 *
 * Supabase answers an unknown address with 422 "Signups not allowed for otp"
 * and a known one with 200, and the page used to render that difference as
 * "This email isn't on a Chanlytics workspace yet" -- a public oracle for
 * exactly who has an account. So a request either reports a real, actionable
 * problem or it reports nothing at all: the caller is told a code was sent
 * either way, and only someone who can read that inbox learns anything.
 * Returning null means "say the neutral thing".
 *
 * Two problems are real. The person's own: they asked twice inside the wait,
 * and are told how long. Ours: the mail budget, the provider, a project-wide
 * limit (sendFailureIsOurs, the same judgement the sign-up page makes), said
 * as the sign-up page says it and never as "too many requests" from them.
 *
 * This closes the oracle on OUR surface, not at its source -- the anon key is
 * public by design, so the Supabase endpoint still answers differently. The
 * complete fix is a CAPTCHA on the auth endpoints, which needs a provider
 * account and is flagged rather than silently half-done.
 */
declare function requestCodeWords(e: {
    code?: string;
    status?: number;
    message?: string;
} | null | undefined): string | null;
/** Errors on the VERIFY step, where the account is already implied. */
declare function verifyCodeWords(message: string): string;

/**
 * The password rule, and the words the three credential screens say.
 *
 * WHY LENGTH IS THE WHOLE RULE. The project's floor is twelve characters
 * (`minimum_password_length` in config.toml) and `password_requirements` is
 * deliberately empty: composition classes push people toward Passw0rd! and
 * buy nothing a longer passphrase does not buy more cheaply. The real
 * strength check is the hosted breach list ("Prevent use of leaked
 * passwords"), which refuses a password that has appeared in a known dump --
 * a check no regular expression can make.
 *
 * WHY THE CEILING IS IN BYTES. The hash behind Supabase Auth reads at most
 * 72 BYTES and ignores everything after them. A twenty-character passphrase
 * of emoji is already past that, so a character cap would silently accept a
 * credential whose tail does nothing -- and "my password stopped working
 * when I added a character" is a bug nobody can reproduce. Counted in bytes,
 * refused out loud.
 *
 * One function, called by the sign-up page, the reset page and the route, so
 * a rule the browser enforces and a rule the server enforces cannot drift.
 */
declare const PASSWORD_MIN = 12;
declare const PASSWORD_MAX_BYTES = 72;
/** What is wrong with this password, or null when nothing is. */
declare function passwordProblem(raw: unknown): string | null;
/**
 * The same rule, as a narrowing.
 *
 * `passwordProblem` answers with a SENTENCE, which is what a person needs and
 * what a type system cannot see through: a caller that has checked it and now
 * has to hand the value on still holds a `string | undefined`. This is that
 * other half, defined in terms of the first so the two can never disagree
 * about what a usable password is.
 */
declare function isUsablePassword(raw: unknown): raw is string;
/**
 * The sentence after a failed sign-in.
 *
 * It must read the same for an address nobody has, a password that is wrong,
 * and an account that only ever arrived through Google. Supabase already
 * answers all three identically; this keeps our surface from being more
 * helpful than that, because every improvement to this sentence is an oracle
 * for who has an account. The nudge under it is shown to everyone, so it
 * tells a Google-only account what to do without telling anyone else
 * anything.
 */
declare const PASSWORD_WORDS: {
    readonly label: "Password";
    readonly chooseLabel: "Choose a password";
    readonly newLabel: "New password";
    readonly hint: "At least 12 characters. A long phrase beats a short puzzle.";
    readonly wrong: "That email and password don't match an account.";
    readonly wrongNudge: "If you started with Google, use Continue with Google.";
    readonly codeInstead: "Email me a code instead";
    readonly passwordInstead: "Use your password instead";
    readonly forgot: "Forgot your password?";
    readonly resetTitle: "Reset your password";
    readonly resetLead: "We'll send a 6-digit code to your work email. Enter it with the password you want.";
    readonly resetSent: (email: string) => string;
    readonly resetSubmit: "Set my password";
    readonly resetDone: "Your password is set — signing you in.";
    /**
     * A recovery code that did not verify. The address is already implied here
     * (they typed it on the previous step), so this may say what is wrong.
     */
    readonly resetBadCode: "That code didn't match or has expired — ask for a new one.";
    readonly backToSignIn: "Back to sign-in";
};

/** Of the number as stored: E.164 with its "+". */
declare function erasedPhoneHash(tenantId: string, phoneE164: string): Promise<string>;
/** Of the address as stored: normalizeEmail's output, never a raw header. */
declare function erasedEmailHash(tenantId: string, email: string): Promise<string>;
/**
 * A lead's email, phone or place id on the never-again list (lead_suppressions,
 * 00140): the same keyed digest, so SQL's lead_suppression_hash(tenant, value)
 * and this agree byte for byte (lead-engine.db.test.mjs proves it). The value
 * is the one stored: E.164 with its "+", normalizeEmail's output, the place id.
 */
declare function leadSuppressionHash(tenantId: string, value: string): Promise<string>;

/**
 * The Leads scope of People, in words (PRD 2026-09-17 v3 §6, §9; release B).
 *
 * Release A (`lead-search.ts`, `lead-judge.ts`) holds the plan, the stored sets
 * and every rule with a right answer. This file is what the OWNER sees: the
 * word a stored value wears, the shape a request takes, the view a route
 * spells, and the view models the page draws a row, the rail and the standing
 * line from. Pure -- nothing here reads a file, a database or a clock of its
 * own; a caller hands in the workspace's zone and the moment.
 *
 * No word here names the vendor that runs the searches. Where a fact came from
 * is said the way the owner would say it ("Google Maps listing"), never by the
 * name of the service that fetched it.
 */

/** B's screen word for A's stored set (`lead_search_members.class`): one set, two names, never two lists. */
declare const LEAD_CLASSES: readonly ["qualified", "review", "excluded"];
type LeadClass = LeadMemberClass;
declare const LEAD_LISTS: readonly ["all", "ready", "nurture", "converted", "said_no", "not_a_fit"];
declare const LEAD_SORTS: readonly ["fit", "found", "distance", "business", "rating", "stage"];
declare const LEAD_CALL_OUTCOMES: readonly ["interested", "call_back", "not_interested", "voicemail", "no_answer", "wrong_number"];
declare const LEAD_NOT_A_FIT_WHYS: readonly ["chain", "wrong_kind", "too_far", "customer", "other"];
/** A's stored set has no type of its own; the word for one of its members is derived here, not a second list. */
type LeadStage = (typeof LEAD_STAGES)[number];

type LeadList = (typeof LEAD_LISTS)[number];
type LeadSort = (typeof LEAD_SORTS)[number];
type LeadCallOutcome = (typeof LEAD_CALL_OUTCOMES)[number];
type LeadNotAFitWhy = (typeof LEAD_NOT_A_FIT_WHYS)[number];
/** Stored values are never shown (§9.1). */
declare const LEAD_STAGE_WORDS: Record<LeadStage, string>;
declare const LEAD_CLOSED_WORDS: Record<(typeof LEAD_CLOSED_REASONS)[number], string>;
declare const LEAD_FIT_WORDS: Record<(typeof LEAD_FITS)[number], string>;
/** Claims only what the check saw (S12): a catch-all server accepts anything, so the check cannot tell. */
declare const LEAD_EMAIL_WORDS: Record<(typeof LEAD_EMAIL_STATES)[number], string>;
/** How an outcome reads at a glance (D5): the dot beside its word, never colour alone -- the word is always there. */
/**
 * What each outcome means, in the app's ONE tone vocabulary (tone.ts). This used to carry two words of its own --
 * `quiet` and `bad` -- which no pill and no stylesheet could draw: `.tone-quiet` was never written, so a voicemail
 * and a no-answer both fell through to the faintest grey, and a wrong number drew as if nothing had happened.
 */
declare const LEAD_CALL_OUTCOME_TONES: Record<(typeof LEAD_CALL_OUTCOMES)[number], Tone>;
declare const LEAD_CALL_OUTCOME_WORDS: Record<(typeof LEAD_CALL_OUTCOMES)[number], string>;
/** The rail's six lists, said once (§6.1). `leadRail` draws from here and nowhere else. */
declare const LEAD_LIST_WORDS: Record<LeadList, string>;
/** Where a lead's facts came from, in the owner's words. */
declare const LEAD_SOURCE_WORD = "Google Maps listing";
declare const LEAD_LOCKED_LINE = "Wait for their yes. Once they write back, they're in People and your yes page works for them.";
declare const LEAD_DRAFT_NOTE = "Your business address and a way to say no are added at the foot, as US law asks.";
declare const LEAD_NO_ADDRESS = "Add your business address in Settings first. US law asks for it at the foot of every email you send a business.";
/** Both consent doors say this, permanently, for a person a lead is linked to (decision 19). */
declare const LEAD_CONSENT_REFUSAL = "This person came from a lead you found. A yes has to come from them: their own message, or your yes page.";
/** Not a fit's five whys, in the order the peek and the bulk bar offer them (§9.5). */
declare const LEAD_NOT_A_FIT_WORDS: Record<LeadNotAFitWhy, string>;
declare const LEAD_NOT_A_FIT_TITLE = "What makes it not a fit?";
/** The one why that hides the place from every future search; the rest teach nothing in this release. */
declare const LEAD_SUPPRESSING_WHY: LeadNotAFitWhy;
declare const LEAD_REVIEW_WORD = "Needs review";
declare const LEAD_LEFT_OUT_WORD = "Left out";
/** What a lead's class is called. The page kept a second copy that said "Excluded" for the same state. */
declare const LEAD_CLASS_WORDS: Record<LeadMemberClass, string>;
/** The Excluded chip for a place with no phone and no email (lead-search.ts LEAD_UNREACHABLE_KEY). */
declare const LEAD_UNREACHABLE_WORD = "No way to reach them";
/** The peek's two groups of checks (P2, §0.1). Nothing read wears a plain check mark. */
declare const LEAD_CHECK_GROUP_WORDS: Record<"seen" | "read", string>;
declare const LEAD_CHECK_UNSURE = "Couldn't tell";
/** One label per check and answer; the particulars are the check's own reason. */
declare const LEAD_CHECK_WORDS: Record<LeadCheckKey, Record<"yes" | "no" | "unknown", string>>;
/** The mailbox check says the state it saw, never a word for it (§10.4, S12). */
declare const LEAD_MAILBOX_WORDS: Record<LeadEmailState, string>;
/** What the peek says under the email, from the plan's own contact standard (§0.1). */
declare const LEAD_CONTACT_STANDARD_WORDS: Record<"phone" | "email", string>;
/** The note under the email of a lead that came with none, and the one thing left to do. */
declare const LEAD_NO_EMAIL_LINE = "Checked their home, contact and about pages. Call instead.";
/** Both questions the peek asks when the owner comes back to the tab (§9.3, §9.4). */
declare const LEAD_SENT_QUESTION = "Did you send it?";
declare const LEAD_CALL_QUESTION = "How did the call go?";
declare const LEAD_NOTE_PLACEHOLDER = "A note for next time, if you like";
declare const LEAD_NOTE_MAX = 280;
/** A stage click never converts (§9.6): the control says where the yes comes from. */
declare const LEAD_TALKING_NOTE = "They join People when they write or call in, or when a call goes well.";
/** How much of the note is left, said in the field (§9.4). */
declare function leadNoteLeft(left: number, max: number): string;
/** An unclaimed listing rarely watches its email; the peek says so, quietly (D2). */
declare const LEAD_UNCLAIMED_NOTE = "Listing not claimed by the owner";
/** Below this, the unhappy reviews are the ordinary few every business has, and saying so would be noise. */
declare const LEAD_LOW_SHARE_FLOOR = 0.15;
/**
 * The one thing five bars said that the average cannot: how much of the score is carried by people who were unhappy.
 * A 4.5 out of forty reviews and a 4.5 out of forty where a quarter gave one star are different businesses to call,
 * and the mean hides it. So the peek says it in words, and only when it changes the picture -- under a sixth at one
 * or two stars is the ordinary tail of any listing, and a line about it would be noise on every lead.
 *
 * Null when the listing published no breakdown, when it has no reviews, or when nothing is worth saying.
 */
declare function leadLowShare(dist: {
    one: number;
    two: number;
    three: number;
    four: number;
    five: number;
} | null): string | null;
/** The first day of Leads, before a workspace has kept one search (§8.9). */
declare const LEAD_FIRST_DAY_TITLE = "Your people gather here";
declare const LEAD_FIRST_DAY_SUB = "Or have Claude find businesses worth reaching";
/** What the finder does not do, said where it is offered. */
declare const LEAD_FIRST_DAY_FOOT = "Claude finds businesses, not people at home.";
/** When the suggestions cannot be written at all: a note on the page, never a page that fails (4.4's suggestionsFor). */
declare const LEAD_SUGGEST_UNAVAILABLE = "Suggestions are not available right now.";
/**
 * Every word the Leads scope's own markup says, spelled once here and seeded onto the window as `window.__LEAD_WORDS`
 * by `seed-globals.ts`, because the legacy pages import nothing. A words record is a global seeded once at boot, like
 * `__FACT_WORDS`, not a courier's -- the courier carries acts. Task 19 adds the facts' own words (the stages, the
 * endings, the guardrail sentences) to THIS record; there is one `LEAD_WORDS` and nothing else holds a lead's words.
 * A sentence the server also says is not here: the routes' toasts are the routes' own.
 */
declare const LEAD_WORDS: {
    readonly close: "Close";
    readonly open: "Open";
    readonly stageLabel: "Stage";
    readonly notFit: string;
    readonly notFitTitle: "What makes it not a fit?";
    readonly whys: {
        id: "customer" | "other" | "chain" | "wrong_kind" | "too_far";
        label: string;
    }[];
    readonly keep: "Keep";
    readonly exclude: "Exclude";
    readonly putBack: "Put back";
    readonly leftOut: "Left out of this search. It doesn't count.";
    readonly reach: "How you can reach them";
    readonly checked: "Checked";
    readonly found: "Found";
    readonly call: "Call";
    readonly copy: "Copy";
    readonly copyAria: "Copy the email";
    readonly draft: "Draft";
    readonly noWebsite: "No website listed";
    readonly instagram: "Instagram";
    readonly talkingNote: "They join People when they write or call in, or when a call goes well.";
    readonly sentQuestion: "Did you send it?";
    readonly sentYes: "Yes, mark contacted";
    readonly sentNo: "Not yet";
    readonly callQuestion: "How did the call go?";
    readonly callSave: "Save";
    readonly callCancel: "I didn't call";
    readonly outcomes: {
        id: "voicemail" | "interested" | "call_back" | "not_interested" | "no_answer" | "wrong_number";
        label: string;
        tone: Tone;
    }[];
    readonly noteLabel: "A note about the call";
    readonly notePlaceholder: "A note for next time, if you like";
    readonly noteMax: 280;
    readonly noteLeft: typeof leadNoteLeft;
    readonly backTo: "Back to";
    readonly to: "To";
    readonly subject: "Subject";
    readonly draftRewrite: "Rewrite";
    readonly tones: readonly [{
        readonly id: "shorter";
        readonly label: "Shorter";
    }, {
        readonly id: "warmer";
        readonly label: "Warmer";
    }];
    readonly draftWriting: "Writing it…";
    readonly draftNote: "Your business address and a way to say no are added at the foot, as US law asks.";
    readonly draftOpen: "Open in your email";
    readonly draftFrom: "Sent from your own inbox";
    readonly copiedDraft: "Copied the email.";
    readonly firstDay: {
        readonly title: "Your people gather here";
        readonly sub: "Or have Claude find businesses worth reaching";
        readonly foot: "Claude finds businesses, not people at home.";
    };
    readonly about: "About";
    readonly reachHeading: "Reach";
    readonly unclaimed: "Listing not claimed by the owner";
    readonly suggestUnavailable: "Suggestions are not available right now.";
    readonly expand: "Expand";
    readonly photos: "Photos";
    readonly noPhoto: "No photo on the listing";
    readonly whereSits: "Where it sits";
    readonly openHours: "Open hours";
    readonly fromListing: "From the listing";
    readonly openMaps: "Open in Maps";
    readonly ratedHeading: "What people say";
    readonly closePhotos: "Close";
    readonly deckOf: (at: number, of: number) => string;
    readonly deckPrev: "The lead before";
    readonly deckNext: "The next lead";
    readonly callSaveNext: "Save and go to the next";
    readonly callSavedNote: "Saving moves them to Talking. They join People when they write or call in.";
};
/** How long a workspace's suggestions stand before Claude is asked again (4.4's suggestionsFor). */
declare const LEAD_SUGGEST_DAYS = 7;
/** The platform-wide prior for a kind of business, as `lead_niche_prior()` answers it. */
interface LeadNichePrior {
    places: number;
    matched: number;
    with_email: number;
}
/** Under this many judged matches the share is noise, and the line says so instead. */
declare const LEAD_PRIOR_MIN = 25;
/**
 * How reachable a kind of business is, in tenths, from what past searches
 * measured (`lead_niche_priors`, A1's calibration). Never a percentage and
 * never a promise: a kind nobody has searched says so, and the plan card says
 * the same thing ("checked after the first 25").
 */
declare function leadReachLine(prior: LeadNichePrior | null | undefined): string;
interface LeadWayFacts {
    /** The workspace's own line, when this tab has read the setup surface; null when it has not. */
    voice: {
        active: boolean;
        number: string | null;
    } | null;
    whatsapp: {
        present: boolean;
        active: boolean;
    } | null;
    calendar: "ok" | "unavailable" | "none";
    people: number;
}
interface LeadWay {
    id: "reach" | "calendar" | "yours";
    title: string;
    line: string;
    /** Only ever what this tab has read: null claims nothing. */
    status: string | null;
    doors: {
        id: string;
        label: string;
        to: string;
    }[];
}
/**
 * The three ways people arrive (§8.9), each claiming only what this tab has
 * read. The People surface carries the calendar and the count; the line is the
 * setup surface's, which this route does not load on a cold open -- so with no
 * facts the way says what it is and points at Setup, and never says a number is
 * live that nobody looked at. "Import a list" is Phase 2 and is not offered
 * until it exists.
 */
declare function leadsFirstDayWays(f: LeadWayFacts): LeadWay[];
/**
 * The three things the planner says instead of a plan (§8.8). They are words for
 * whoever asked -- the composer prints them under the input, Ask's tool hands
 * them to the model to say -- and never a card with a problem in it.
 */
declare const LEAD_NO_CARD_LINE = "I can find local businesses for now.";
declare const LEAD_OUTSIDE_US_LINE = "I can only find businesses in the US for now. The rules for emailing businesses in Canada, the UK and the EU are different, and Chanlytics follows the US ones.";
/** The second: what the workspace sells, in the owner's own words, or "what you do". */
declare function leadNotBusinessesLine(want: string | null): string;
/** The third: what was asked for, named, and what the one card can do. The ask is logged as demand (§0.3). */
declare function leadNoCardLine(what: string | null): string;
/** The platform's switch, in the owner's words: nothing about a vendor, nothing about money. */
declare const LEAD_PAUSED_TITLE = "Lead searches are paused for now";
interface LeadEndingFacts {
    /** The plan's subject in the owner's words: "personal trainers". */
    name: string;
    /** Where it looked, in the owner's words: "Austin". */
    area: string;
    counted: number;
    target: number;
    emails: number;
    phones: number;
    excluded: number;
    /** A stopped round whose emails are still being checked (S12). */
    checking: boolean;
    /** question_unanswered: how many were counted before it asked. */
    foundBefore: number;
    /** few_new_matches / searched_everything: where to look next, in the owner's words. */
    nearby: string[];
    /** How many places the source returned at all, and what left them all out. */
    seen: number;
    leftOutBy: string | null;
}
interface LeadEndingLine {
    /** A's word for the ending; the strip's accessible name, never its sentence. */
    mark: string;
    title: string;
    parts: string[];
    step: {
        id: string;
        label: string;
    } | null;
}
/** "Alpine and Fort Davis"; "Round Rock, Pflugerville and Kyle". */
declare function leadAnd(items: readonly string[]): string;
/**
 * Every ending, said once (§8.8, the States artboard): what happened, what was
 * kept, what was counted, and one next step. Two shapes only -- "Found N ..."
 * when the round delivered what it was for, "Stopped ..." when it did not --
 * because an owner reads the first word and must know which of the two this is.
 * LEAD_ENDING_WORDS stays A's short name for the ending and rides along as
 * `mark`, for the strip's accessible name and the kept-search menu.
 *
 * No dollar amount: the month's allowance and the searching budget are both
 * spoken as leads (§0.2), and no line here names what any of it is bought from.
 */
declare function leadEndingLine(ending: LeadRoundEnding, f: LeadEndingFacts): LeadEndingLine;
/** The plan card's and the strip's one unit: leads, never dollars (§0.2). */
declare function leadAllowanceFact(left: number): string;
/** What a call outcome does to the stage (§9.4). Only Interested converts; Wrong number keeps the stage. */
declare function outcomeMove(o: (typeof LEAD_CALL_OUTCOMES)[number]): {
    stage: LeadStage | null;
    closedReason: string | null;
    converts: boolean;
};
declare const LeadsQuerySchema: z.ZodObject<{
    list: z.ZodDefault<z.ZodEnum<{
        said_no: "said_no";
        not_a_fit: "not_a_fit";
        ready: "ready";
        nurture: "nurture";
        converted: "converted";
        all: "all";
    }>>;
    search: z.ZodOptional<z.ZodString>;
    class: z.ZodOptional<z.ZodEnum<{
        review: "review";
        qualified: "qualified";
        excluded: "excluded";
    }>>;
    sort: z.ZodDefault<z.ZodEnum<{
        stage: "stage";
        business: "business";
        rating: "rating";
        fit: "fit";
        found: "found";
        distance: "distance";
    }>>;
    dir: z.ZodDefault<z.ZodEnum<{
        asc: "asc";
        desc: "desc";
    }>>;
    after_key: z.ZodOptional<z.ZodString>;
    after_id: z.ZodOptional<z.ZodString>;
    limit: z.ZodDefault<z.ZodCoercedNumber<unknown>>;
}, z.core.$strip>;
type LeadsQuery = z.infer<typeof LeadsQuerySchema>;
/** The view a bulk act names when the owner chose "Select all N that match" (S13): the same keys GET leads takes. */
declare const LeadsViewSchema: z.ZodObject<{
    sort: z.ZodDefault<z.ZodEnum<{
        stage: "stage";
        business: "business";
        rating: "rating";
        fit: "fit";
        found: "found";
        distance: "distance";
    }>>;
    list: z.ZodDefault<z.ZodEnum<{
        said_no: "said_no";
        not_a_fit: "not_a_fit";
        ready: "ready";
        nurture: "nurture";
        converted: "converted";
        all: "all";
    }>>;
    search: z.ZodOptional<z.ZodString>;
    class: z.ZodOptional<z.ZodEnum<{
        review: "review";
        qualified: "qualified";
        excluded: "excluded";
    }>>;
    dir: z.ZodDefault<z.ZodEnum<{
        asc: "asc";
        desc: "desc";
    }>>;
}, z.core.$strip>;
/** POST leads/[id]/stage, the page's five acts made exclusive. */
declare const LeadStageInputSchema: z.ZodDiscriminatedUnion<[z.ZodObject<{
    kind: z.ZodLiteral<"stage">;
    stage: z.ZodEnum<{
        ready: "ready";
        nurture: "nurture";
        converted: "converted";
    }>;
}, z.core.$strip>, z.ZodObject<{
    kind: z.ZodLiteral<"not_a_fit">;
    why: z.ZodEnum<{
        customer: "customer";
        other: "other";
        chain: "chain";
        wrong_kind: "wrong_kind";
        too_far: "too_far";
    }>;
}, z.core.$strip>, z.ZodObject<{
    kind: z.ZodLiteral<"said_no">;
}, z.core.$strip>, z.ZodObject<{
    kind: z.ZodLiteral<"outcome">;
    outcome: z.ZodEnum<{
        voicemail: "voicemail";
        interested: "interested";
        call_back: "call_back";
        not_interested: "not_interested";
        no_answer: "no_answer";
        wrong_number: "wrong_number";
    }>;
    note: z.ZodOptional<z.ZodString>;
}, z.core.$strip>, z.ZodObject<{
    kind: z.ZodLiteral<"emailed">;
}, z.core.$strip>], "kind">;
type LeadStageInput = z.infer<typeof LeadStageInputSchema>;
/** The door's arguments (lead_set_stage). The door judges what converts; this only spells the ask. */
declare function stageArgs(i: LeadStageInput): {
    p_stage: string | null;
    p_reason: string | null;
    p_fit_reason: string | null;
    p_outcome: string | null;
    p_note: string | null;
};
declare const LeadsBulkSchema: z.ZodDiscriminatedUnion<[z.ZodObject<{
    by: z.ZodLiteral<"ids">;
    action: z.ZodEnum<{
        keep: "keep";
        exclude: "exclude";
        not_a_fit: "not_a_fit";
        contacted: "contacted";
    }>;
    ids: z.ZodArray<z.ZodString>;
    search_id: z.ZodOptional<z.ZodString>;
}, z.core.$strip>, z.ZodObject<{
    by: z.ZodLiteral<"view">;
    action: z.ZodEnum<{
        not_a_fit: "not_a_fit";
        contacted: "contacted";
    }>;
    view: z.ZodObject<{
        sort: z.ZodDefault<z.ZodEnum<{
            stage: "stage";
            business: "business";
            rating: "rating";
            fit: "fit";
            found: "found";
            distance: "distance";
        }>>;
        list: z.ZodDefault<z.ZodEnum<{
            said_no: "said_no";
            not_a_fit: "not_a_fit";
            ready: "ready";
            nurture: "nurture";
            converted: "converted";
            all: "all";
        }>>;
        search: z.ZodOptional<z.ZodString>;
        class: z.ZodOptional<z.ZodEnum<{
            review: "review";
            qualified: "qualified";
            excluded: "excluded";
        }>>;
        dir: z.ZodDefault<z.ZodEnum<{
            asc: "asc";
            desc: "desc";
        }>>;
    }, z.core.$strip>;
}, z.core.$strip>], "by">;
type LeadsBulkInput = z.infer<typeof LeadsBulkSchema>;
/** Check again (D3): the leads whose mailbox check did not answer, asked once more. */
declare const LeadsCheckAgainSchema: z.ZodObject<{
    ids: z.ZodArray<z.ZodString>;
}, z.core.$strip>;
type LeadsCheckAgainInput = z.infer<typeof LeadsCheckAgainSchema>;
declare const LeadDraftInputSchema: z.ZodObject<{
    tone: z.ZodDefault<z.ZodEnum<{
        shorter: "shorter";
        warmer: "warmer";
        first: "first";
    }>>;
    previous: z.ZodOptional<z.ZodObject<{
        subject: z.ZodString;
        body: z.ZodString;
    }, z.core.$strip>>;
}, z.core.$strip>;
declare const LeadExportQuerySchema: z.ZodObject<{
    sort: z.ZodDefault<z.ZodEnum<{
        stage: "stage";
        business: "business";
        rating: "rating";
        fit: "fit";
        found: "found";
        distance: "distance";
    }>>;
    list: z.ZodDefault<z.ZodEnum<{
        said_no: "said_no";
        not_a_fit: "not_a_fit";
        ready: "ready";
        nurture: "nurture";
        converted: "converted";
        all: "all";
    }>>;
    search: z.ZodOptional<z.ZodString>;
    class: z.ZodOptional<z.ZodEnum<{
        review: "review";
        qualified: "qualified";
        excluded: "excluded";
    }>>;
    dir: z.ZodDefault<z.ZodEnum<{
        asc: "asc";
        desc: "desc";
    }>>;
}, z.core.$strip>;
declare const RenameLeadSearchSchema: z.ZodObject<{
    name: z.ZodString;
}, z.core.$strip>;
declare const BusinessLineSchema: z.ZodObject<{
    business_line: z.ZodString;
}, z.core.$strip>;
declare const ProposeLeadSearchSchema: z.ZodObject<{
    looking_for: z.ZodEnum<{
        other: "other";
        people: "people";
        local_businesses: "local_businesses";
        online_sellers: "online_sellers";
    }>;
    country: z.ZodString;
    count: z.ZodNumber;
    who: z.ZodString;
    who_one: z.ZodString;
    category_key: z.ZodString;
    terms: z.ZodArray<z.ZodString>;
    city: z.ZodDefault<z.ZodNullable<z.ZodString>>;
    region: z.ZodString;
    zip: z.ZodDefault<z.ZodNullable<z.ZodString>>;
    contact: z.ZodEnum<{
        email: "email";
        phone: "phone";
    }>;
    criteria: z.ZodDefault<z.ZodArray<z.ZodObject<{
        text: z.ZodString;
        standard: z.ZodEnum<{
            likely: "likely";
            seen: "seen";
        }>;
        required: z.ZodBoolean;
    }, z.core.$strip>>>;
    leave_out: z.ZodDefault<z.ZodArray<z.ZodObject<{
        words: z.ZodString;
    }, z.core.$strip>>>;
    asked: z.ZodString;
}, z.core.$strip>;
type ProposeLeadSearch = z.infer<typeof ProposeLeadSearchSchema>;
/** The card's head. The rest of what the card draws is the plan itself and the workspace's facts. */
interface LeadPlanView {
    title: string;
}
type LeadPlanRefusalKind = "outside_us" | "not_businesses" | "no_card" | "not_a_plan";
type LeadPlanned = {
    ok: true;
    plan: LeadSearchPlan;
    view: LeadPlanView;
} | {
    ok: false;
    refusal: {
        kind: LeadPlanRefusalKind;
        text: string;
        what: string | null;
    };
};
/**
 * The ask as a plan, or one of the three refusals in words (§8.8): outside the
 * US, people rather than businesses, and an ask no source card fits, which is
 * logged as demand. Nothing here reads anything: the same function answers the
 * composer and Ask's tool, so a plan made by typing and a plan made by asking
 * are the same plan.
 */
declare function planLeadSearch(input: ProposeLeadSearch): LeadPlanned;
/**
 * The chips a view may carry. Release B parses none -- the route grammar keeps the key so the surface, the route and
 * the bulk act agree on one shape, and release C fills it (`2026-09-19-lead-finder-C-extras.md`). It is a type, not a
 * list: an empty record cannot be given a value by accident.
 */
type LeadChips = Record<string, never>;
/** "clients/leads:s-<search>:l-<list>:c-<class>" -- the grammar Ask's page citations admit (ask.ts PAGE_PREFIX). Chips join in release C. */
declare function leadsRoute(v: {
    searchId?: string | null;
    list?: LeadList | null;
    cls?: LeadClass | null;
    chips?: Record<string, unknown>;
}): string;
declare function parseLeadsRoute(route: string): {
    searchId: string | null;
    list: LeadList;
    cls: LeadClass | null;
    chips: Record<string, unknown>;
} | null;
declare const LEAD_DRAFT_JSON_SCHEMA: {
    readonly type: "object";
    readonly additionalProperties: false;
    readonly required: readonly ["subject", "body"];
    readonly properties: {
        readonly subject: {
            readonly type: "string";
        };
        readonly body: {
            readonly type: "string";
        };
    };
};
declare const LeadDraftAnswerSchema: z.ZodObject<{
    subject: z.ZodString;
    body: z.ZodString;
}, z.core.$strip>;
declare const LEAD_SUGGEST_JSON_SCHEMA: {
    readonly type: "object";
    readonly additionalProperties: false;
    readonly required: readonly ["line", "items"];
    readonly properties: {
        readonly line: {
            readonly type: "string";
        };
        readonly items: {
            readonly type: "array";
            readonly items: {
                readonly type: "object";
                readonly additionalProperties: false;
                readonly required: readonly ["words", "who_for", "category_key"];
                readonly properties: {
                    readonly words: {
                        readonly type: "string";
                    };
                    readonly who_for: {
                        readonly type: "string";
                    };
                    readonly category_key: {
                        readonly type: "string";
                    };
                };
            };
        };
    };
};
declare const LeadSuggestAnswerSchema: z.ZodObject<{
    line: z.ZodString;
    items: z.ZodArray<z.ZodObject<{
        words: z.ZodString;
        who_for: z.ZodString;
        category_key: z.ZodString;
    }, z.core.$strip>>;
}, z.core.$strip>;
/** The foot every draft carries: the business's postal address and a way to say no (CAN-SPAM). */
declare function leadDraftFooter(business: string, address: string): string;
interface LeadPeekReach {
    phone: {
        value: string;
        note: string;
        tel: string | null;
        wrong: boolean;
    } | null;
    /** `standard` is null beside an address that checks out: there it would be a line saying nothing (D5). */
    email: {
        value: string;
        note: string;
        standard: string | null;
        state: LeadEmailState;
        word: string;
        address: string | null;
        canDraft: boolean;
    };
    locked: {
        title: string;
        line: string;
    };
}
interface LeadPeekVM {
    id: string;
    searchId: string | null;
    mark: string;
    name: string;
    /** The first two words of the name, for "Back to Zilker Strength". */
    short: string;
    sub: string;
    /** Who they are, from what the listing shows (D2): each null when the listing did not say. */
    about: string | null;
    where: {
        line: string;
        href: string | null;
    } | null;
    today: string | null;
    claimedNote: string | null;
    /**
     * The business's face, in the same shape the row's tile wears it: the mark over the listing's photo over initials
     * on a tint the kind decides. The photograph has ONE home, here -- the band paints it under the mark and the
     * lightbox opens it on its own. While it rode beside the tile the two surfaces drifted over which one wins (D6).
     */
    tile: {
        initials: string;
        tint: number;
        image: string | null;
        logo: string | null;
    };
    /**
     * "4.7" and "1,284", apart; null where the source does not rate. `low` is the one thing five bars said that an
     * average cannot, and it is null unless it is worth saying: see `leadLowShare`.
     */
    rated: {
        score: string;
        count: string;
        low: string | null;
    } | null;
    /** The two reach slots, as the row wears them. */
    slots: {
        phone: LeadSlot;
        mailbox: LeadSlot;
    };
    /** The week's hours as bars, in the listing's own order, today marked; [] when the listing showed no hours. */
    week: LeadWeekRow[];
    /** "From the listing": the facts about the place the expanded photo lists beside it. */
    facts: {
        k: string;
        v: string;
    }[];
    /** "Open every day · 11 AM to 10 PM": the head the week folds under; "" when the listing published no hours. */
    weekSummary: string;
    /** "From the listing — kind, price, rated": the head the listing's facts fold under; "" when there are none. */
    factsSummary: string;
    /** "5 checks passed · 2 couldn't tell": the head the checks fold under. */
    checksSummary: string;
    /** One mark per check, in the order they were made: the strip beside the head, so the shape of the evidence reads at a glance. */
    checkDots: ("yes" | "unknown" | "no")[];
    /** "Found 3 ways, 2:02 PM · #9 for “independent bookstore”": the line the trace folds under. */
    foundSummary: string;
    /** "1.2 mi", from the search's centre; "" when the search has none. */
    distance: string;
    cls: LeadClass;
    stage: LeadStage;
    stages: {
        id: "ready" | "nurture" | "converted";
        label: string;
        on: boolean;
    }[];
    canStage: boolean;
    notFitWord: string;
    fit: {
        word: string;
        cls: string;
        sentence: string;
    };
    reach: LeadPeekReach;
    groups: {
        how: "seen" | "read";
        label: string;
        checks: {
            key: LeadCheckKey;
            label: string;
            answer: "yes" | "no" | "unknown";
            source: string;
            reason: string | null;
        }[];
    }[];
    others: {
        summary: string;
        picked: string | null;
        items: {
            email: string;
            why: string;
        }[];
    } | null;
    found: {
        at: string;
        what: string;
    }[];
    links: {
        website: {
            label: string;
            href: string;
        } | null;
        instagram: {
            label: string;
            href: string;
        } | null;
        facebook: {
            label: string;
            href: string;
        } | null;
        linkedin: {
            label: string;
            href: string;
        } | null;
        tiktok: {
            label: string;
            href: string;
        } | null;
        maps: {
            label: string;
            href: string;
        } | null;
    };
    version: number;
}
/** "Open today · 9 AM to 6 PM", "Closed today", or null when the listing showed no hours. The day is the business's own (tz). */
declare function leadTodayLine(hours: {
    day: string;
    hours: string;
}[], tz: string, now: Date): string | null;
/** One day of the week's hours as a bar across the day (D5): x and w in percent of 24 hours; null for a day the parser cannot draw. */
interface LeadWeekRow {
    day: string;
    hours: string;
    bar: {
        x: number;
        w: number;
    } | null;
    today: boolean;
}
/**
 * The week in one line, so the seven rows can fold away behind it: how many days they open, and the hours they keep
 * on most of them. Nothing is claimed that the listing did not say -- a week with no two days alike says only how
 * many days it opens, because "most days" would then be one day.
 */
declare function leadWeekSummary(week: LeadWeekRow[]): string;
/** What the listing had to say about the place, named rather than listed: "From the listing — kind, price, rated". */
declare function leadFactsSummary(facts: {
    k: string;
    v: string;
}[]): string;
/**
 * The week's hours as bars (D5): "9 AM to 6 PM" is a bar from 37.5% to 75% of the day, "Open 24 hours" the whole
 * day, "Closed" no bar, and a line the parser cannot read keeps its words and draws nothing. Overnight hours run to
 * the end of the day. The listing's own order is kept; today is the business's own day (tz).
 */
declare function leadWeekBars(hours: {
    day: string;
    hours: string;
}[], tz: string, now: Date): LeadWeekRow[];
/** "101 Biscayne Blvd, Miami, FL 33132", with the Maps page when the listing has one. */
declare function leadWhere(r: Pick<LeadRowDto, "street" | "city" | "state" | "postal_code" | "maps_url">): {
    line: string;
    href: string | null;
} | null;
/** The owner's own word for the criterion a place was left out by; the plan holds it. */
/** A day, from the round's end, in which the untouched leads may be removed and the month credited (§8.6). */
declare const LEAD_UNDO_MS: number;
/**
 * Whether a search's latest round may still be undone: ended within the day,
 * and not undone already. Read by the rail's menu, which is where the removal
 * lives -- not the strip, where "Undo" beside "yours" read as deleting what was
 * just paid for.
 */
declare function leadUndoable(s: {
    round: {
        undo_op_id: string | null;
        ended_at: string | null;
    } | null;
} | null, now: Date): boolean;
declare function leadExclusionWord(search: LeadSearchDto | null, key: string | null): string;
/**
 * The peek (§9.2, P2, S12): the sub-line, the fit sentence, how to reach them, the checks in two groups (what was
 * seen, and what Claude read), the other addresses, Found, the site. Every sentence here, so the page says nothing
 * of its own. The mark is `initialsOf`, the same derivation the row wears, never a second one.
 */
declare function toLeadPeekVM(r: LeadRowDto, search: LeadSearchDto | null, tz: string, now: Date): LeadPeekVM;
/** What removing a search keeps: the leads already worked. Said before the press; the number comes after it. */
declare const LEAD_REMOVE_KEEPS = "Keeps the ones you contacted or are talking to.";
/**
 * A kept search, in the owner's own words (§8.10): what they asked for, the day they asked, and what the plan
 * leaves out. One derivation, because the rail's menu and the question before Remove both say it.
 */
declare function leadSearchWords(s: {
    asked: string;
    asked_on: string;
    plan?: LeadSearchPlan;
} | null, tz: string): {
    askedLine: string;
    keepsLine: string;
};
interface LeadCheck {
    key: LeadCheckKey;
    how: "seen" | "read";
    answer: "yes" | "no" | "unknown";
    source: string;
    reason: string | null;
}
/** The seven checks §0.1 and the interface name, four seen and three read; §9.2's "six" is the PRD's count of one screen. */
declare const LEAD_CHECK_KEYS: readonly ["on_maps", "in_area", "phone_two_sources", "mailbox", "independent", "right_kind", "own_address"];
type LeadCheckKey = (typeof LEAD_CHECK_KEYS)[number];
interface LeadRowDto {
    id: string;
    search_id: string;
    place_id: string;
    business_name: string;
    category: string | null;
    city: string | null;
    state: string | null;
    street: string | null;
    /** `leads_page` answers it beside the city; the area cell reads "78704 · Austin, TX" from the pair. */
    postal_code?: string | null;
    /** Not the door's: `leads_page` returns the search's id, and 4.4 fills the name from the same read that loads the searches. */
    search_name?: string | null;
    phone: string | null;
    phone_agrees: boolean;
    phone_wrong: boolean;
    email: string | null;
    email_state: LeadEmailState;
    email_checked_at: string | null;
    website: string | null;
    instagram: string | null;
    rating: number | null;
    reviews: number | null;
    /** What the listing shows about the business (D2, 00144). Optional: a fixture from before carries none, and the view models read them as absent. */
    about?: string | null;
    hours?: {
        day: string;
        hours: string;
    }[];
    image_url?: string | null;
    price?: string | null;
    reviews_dist?: {
        one: number;
        two: number;
        three: number;
        four: number;
        five: number;
    } | null;
    facebook_url?: string | null;
    linkedin_url?: string | null;
    tiktok_url?: string | null;
    claimed?: boolean | null;
    maps_url?: string | null;
    rank?: number | null;
    /** D5 (00146): the neighbourhood the listing names, and the coordinates leads_page returns, for the row's line about where and the map. */
    neighborhood?: string | null;
    lat?: number | null;
    lng?: number | null;
    /** D6 (00147): the business's own mark, from its home page. */
    logo_url?: string | null;
    stage: LeadStage;
    closed_reason: string | null;
    contact_id: string | null;
    /** How the lead has been worked, from `leads_page` (4.2): a fixture copies the real shape even where B draws none of it. */
    last_outcome: string | null;
    last_note: string | null;
    contacted_at: string | null;
    converted_at: string | null;
    places: number;
    found_at: string;
    exported_at: string | null;
    version: number;
    member: {
        class: LeadClass;
        fit: "strong" | "look" | "long" | null;
        reason: string;
        excluded_by: string | null;
        distance_m: number | null;
        counted: boolean;
        checks: LeadCheck[];
        other_emails: {
            email: string;
            why: string;
        }[];
        /** The class rule's reason tokens (D3): what Needs review is grouped by. Optional: a fixture from before carries none. */
        reasons?: string[];
    };
}
/** "Independent" -> "independent" for the middle of a sentence; a name that is capitals stays as it is. */
declare const leadLowerFirst: (s: string) => string;
declare const LEAD_REVIEW_GROUP_WORDS: {
    readonly mailbox_waiting: "Waiting on the mailbox check";
    readonly checks_out: "Their email checks out";
    readonly mailbox_silent: "Their mail server wouldn't answer";
    readonly bad_email: "Their email bounces";
    readonly no_email: "No email on their site";
    readonly no_phone: "No phone on their listing";
    readonly catch_all: "Unconfirmed — the mailbox accepts any address";
    readonly unsure: "Couldn't tell if";
    readonly read_only: "Only the listing says so";
    readonly out_of_area: "Just outside the area you asked for";
};
type LeadReviewGroupId = keyof typeof LEAD_REVIEW_GROUP_WORDS;
type LeadReviewAct = "check_again" | "find_email" | "keep" | "exclude";
declare const LEAD_REVIEW_ACT_WORDS: Record<LeadReviewAct, string>;
/** Why a pile is waiting, in a sentence: what was looked at, and what is true of every lead in it. */
declare const LEAD_REVIEW_GROUP_WHY: Record<LeadReviewGroupId, string>;
/** A mailbox re-check, in cents an address (the source card's own price): what "Check again" says it costs. */
declare const LEAD_CHECK_CENTS_EACH = 0.089;
declare const leadCheckAgainCents: (n: number) => number;
/**
 * What each press on the bench does, and what it costs (D5). One derivation, because the bar offers the acts and
 * the column beside it explains them: a Keep that spends a lead of the month says so with the number left.
 */
declare function leadReviewCosts(acts: LeadReviewAct[], n: number, month: LeadMonthDto | null): {
    act: LeadReviewAct;
    label: string;
    line: string;
}[];
/** What a search asked for, in the owner's own words: its criteria, then what it leaves out (D5's right column). */
declare function leadAskedFor(search: LeadSearchDto | null): {
    text: string;
    kind: "criterion" | "exclusion";
}[];
interface LeadReviewGroup {
    id: LeadReviewGroupId;
    key: string;
    label: string;
    ids: string[];
    acts: LeadReviewAct[];
}
/**
 * Needs review as a queue: one group per thing that would resolve it, each with the leads in it and the acts that
 * resolve it. A lead with two reasons sits in the first group that fits it, in the order above; a group about one
 * criterion names it in the owner's own words from the plan, and two criteria make two groups.
 */
declare function leadReviewGroups(rows: {
    id: string;
    cls: LeadClass;
    reasons: string[];
}[], search: LeadSearchDto | null): LeadReviewGroup[];
interface LeadSearchRoundDto {
    id: string;
    seq: number;
    purpose: string;
    state: string;
    ending: LeadRoundEnding | null;
    question: {
        sentence: string;
        criterion_key: string;
    } | null;
    target: number;
    counted: number;
    qualified: number;
    review: number;
    excluded: number;
    /** Counted leads whose address was found and checked: "88 you can email", and "41 emails checked" while it runs. */
    emails_checked: number;
    /** Counted leads reachable by phone: "72 by phone" (§8.6's sentence needs both, W2 put both on the view). */
    with_phone: number;
    /** The round is stopping and still checking what it found (S12): the only way to tell Stopping from Checking. */
    ending_pending: boolean;
    waiting_since: string | null;
    cost_usd: number;
    ended_at: string | null;
    undo_op_id: string | null;
    undo_version: number | null;
    /** Where to look next when the round ran dry (D3, 00145): the nearest ZIP centres past its area, nearest first; [] otherwise. */
    nearby: LeadArea[];
    /** The qualified members by fit band (D5, 00146), for the band bar. Optional: a fixture from before carries none. */
    fits?: {
        strong: number;
        look: number;
        long: number;
    };
}
interface LeadSearchDto {
    id: string;
    name: string;
    asked: string;
    asked_on: string;
    plan: LeadSearchPlan;
    plan_version: number;
    round: LeadSearchRoundDto | null;
}
interface LeadMapPin {
    id: string;
    x: number;
    y: number;
}
interface LeadMapPlot {
    /** Every lead the door gave a place, in a square of 0..1 with 0,0 at the top left. */
    pins: LeadMapPin[];
    /** The area the search asked for, when it has a centre: where it sits in the same square, and how wide. */
    ring: {
        x: number;
        y: number;
        r: number;
    } | null;
    /** How many metres the square is across, for the scale bar; 0 when there was nothing to place. */
    spanM: number;
    /**
     * True when these leads are not one place. Without an area to anchor on, the square is drawn from the leads
     * themselves, so six searches in six cities produced one square four thousand miles across with every city
     * collapsed into a dot. That is arithmetically honest and tells the owner nothing.
     */
    tooWide: boolean;
    /** What the square is centred on, so "widen the area" asks about the ground the owner is looking at. */
    center: {
        lat: number;
        lng: number;
    } | null;
}
/**
 * Where the leads sit on the ground, relative to each other and to the area the search asked for (D5). Everything
 * is measured in metres from one centre and then scaled into a square, so the picture is honest at a town's size
 * without a projection, a tile or a request to anyone. A lead the source placed nowhere is simply not on it.
 */
/** Past this, leads with no area to anchor them are not one place. Fifty miles: a city and the towns around it. */
declare const LEAD_MAP_MAX_SPAN_M = 80000;
declare function leadMapPlot(rows: {
    id: string;
    point: {
        lat: number;
        lng: number;
    } | null;
}[], area: LeadArea | null): LeadMapPlot;
/** How wide the square is, in the owner's own unit: "3.4 mi across", and nothing when there was nothing to place. */
declare const leadMapAcross: (spanM: number) => string;
/**
 * What the line under the plot says. A city ask has no centre until its probe measures one, so there is often no
 * area to draw and the picture is only where the leads are -- which is worth saying rather than implying a ring
 * that is not there.
 */
declare function leadMapNote(plot: LeadMapPlot, oneSearch: boolean): string;
interface LeadCounts {
    all: number;
    ready: number;
    nurture: number;
    converted: number;
    said_no: number;
    not_a_fit: number;
}
/**
 * The month, as a surface says it (D5): how many of its leads are spoken for, how many are left, and the day it
 * renews. The workbench reads it to say what a press costs -- "5 of your 238 left" -- so a Keep is never a number
 * nobody can see. The whole is contracts' LEAD_MONTHLY_ALLOWANCE, never a number a page invents.
 */
interface LeadMonthDto {
    used: number;
    left: number;
    renewsOn: string;
}
interface LeadSuggestionsDto {
    business_line: string;
    by_owner: boolean;
    made_at: string;
    items: {
        words: string;
        who_for: string;
        category_key: string;
        reach: string | null;
    }[];
    note?: string;
}
/** What the card knows beyond the plan: the reads release A's doors answer, folded into one unit (§0.2). `planFacts` in `server/leads.ts` (4.4) builds exactly this. */
interface LeadPlanFacts {
    /** Places already in People or Leads this plan would skip: "Skips the 14 already yours". */
    dupes: number;
    /** Leads this month still covers, every limit folded in. */
    leadsLeft: number;
    /** Which limit made that number, when one of them binds before the plan's own count. A's counter kinds, never a word of its own. */
    bound: "allowance" | "budget" | null;
    /** The platform-wide prior for this kind of business (lead_niche_prior), or null when it was never searched. */
    prior: {
        places: number;
        matched: number;
        with_email: number;
    } | null;
    /** The kind of business the prior is for, in the owner's words: "trainers". */
    priorOf: string | null;
    /** A must-be-seen criterion the chosen card cannot see (§0.1), with the likely version offered. */
    cannotSee: {
        key: string;
        text: string;
        likely: string;
    } | null;
    /** The day the month's leads renew, in the workspace's zone: "Oct 1". */
    renewsOn: string;
    /** Claude's nearby areas, for the card's area picker and for a round further out. */
    nearby: LeadArea[];
}
/**
 * One row as the table draws it (§6.2). Every field is a word or a shape, and not one of them is a stored value:
 * `stage` rides along only so the row's dot has a class. Task 2's `LEAD_COLUMNS` reads exactly these and nothing else.
 */
type LeadSlotState = "ok" | "part" | "none" | "bad" | "checking";
/** One reach slot: the shape carries the meaning (state), the word repeats it, the tip gives the value back. */
interface LeadSlot {
    state: LeadSlotState;
    value: string | null;
    word: string;
    tip: string;
    copy: boolean;
}
declare const LEAD_SLOT_WORDS: Record<LeadSlotState, string>;
/** The name card's facts (D5): the same derivations the peek draws from, so a hover decides without opening it. */
interface LeadRowCard {
    about: string | null;
    today: string | null;
    where: {
        line: string;
        href: string | null;
    } | null;
    site: {
        label: string;
        href: string;
    } | null;
    maps: {
        label: string;
        href: string;
    } | null;
    found: {
        at: string;
        what: string;
    }[];
}
/** The band over the table (D5): the search's whole shape in one line, which is also the class tabs, and the qualified split by fit. */
interface LeadBand {
    classes: {
        id: LeadClass;
        label: string;
        count: number;
    }[];
    fits: {
        id: "strong" | "look" | "long";
        label: string;
        count: number;
    }[];
    /** Worth drawing the split only when the fits differ: a search whose every row is strong says nothing by it. */
    mixed: boolean;
}
/**
 * The two reach slots, phone then mailbox (D5): five states a shape can carry, so the column survives greyscale.
 * A mail server that would not answer wears Unconfirmed's shape with its own sentence; a number the owner marked
 * wrong is Bad; a source that gave nothing is Nothing found, never a failure.
 */
declare function leadSlots(r: Pick<LeadRowDto, "phone" | "phone_agrees" | "phone_wrong" | "email" | "email_state">): {
    phone: LeadSlot;
    mailbox: LeadSlot;
};
/** The tile's tint, one of six, from the kind of business: the same kind wears the same tint on every row and in the peek. */
declare function leadTintOf(kind: string | null | undefined): number;
declare function leadBand(search: LeadSearchDto | null): LeadBand | null;
interface LeadRowVM {
    id: string;
    searchId: string;
    searchName: string;
    mark: string;
    name: string;
    places: number;
    category: string;
    area: string;
    cls: LeadClass;
    /** The fit band itself (D5), for the band bar's filter; null for a row that is not qualified. */
    fit: "strong" | "look" | "long" | null;
    fitLabel: string;
    fitTitle: string;
    email: string | null;
    emailState: LeadEmailState;
    emailLabel: string;
    emailWord: string;
    phone: string | null;
    phoneAgrees: boolean;
    phoneWrong: boolean;
    /** The two contacts as one glance (D2's Reach column). */
    reach: {
        email: {
            address: string;
            state: LeadEmailState;
            word: string;
        } | null;
        phone: {
            number: string;
            agrees: boolean;
        } | null;
    };
    /** The class rule's reason tokens, for the Needs review queue (D3); [] on a row from before. */
    reasons: string[];
    why: string;
    rating: string;
    /** The spread of reviews, "5★ 30 · 4★ 8 · 3★ 2 · 2★ 0 · 1★ 1", for the Rating cell's title; blank when the listing did not say. */
    reviewsTitle: string;
    stage: LeadStage;
    stageLabel: string;
    foundLabel: string;
    foundAt: string;
    distance: string;
    source: string;
    host: string;
    excludedBy: string | null;
    version: number;
    /** "Book store · Hawthorne · 97214 · 1.2 mi": whatever the source gave, in that order; "" when it gave none. */
    sub: string;
    /** The two reach slots, phone then mailbox. */
    slots: {
        phone: LeadSlot;
        mailbox: LeadSlot;
    };
    /** "4.7" and "1,284", apart, or null where the source does not rate. */
    rated: {
        score: string;
        count: string;
    } | null;
    /** The spread of reviews, one to five stars, or null when the listing did not say. */
    spread: [number, number, number, number, number] | null;
    /** The tile: the business's own mark, else the listing's photo, else initials on a tint the kind decides. */
    tile: {
        initials: string;
        tint: number;
        image: string | null;
        logo: string | null;
    };
    /** A review row's line: what would resolve it, in the queue's own words; null for any other row. */
    waitsOn: string | null;
    /** The row's state mark: Ready is silent; the rest wear an edge and a tag. */
    state: "ready" | "contacted" | "talking" | "review" | "out";
    stateTag: string | null;
    /** The name card's facts. */
    card: LeadRowCard;
    /** Where it sits, when the door gave coordinates. */
    point: {
        lat: number;
        lng: number;
    } | null;
}
/**
 * One row's words and shapes (§6.2). Nothing here is a stored value. The search is the row's own (D5): a review
 * row names what it waits on in the queue's words, and the name card names the term it was found for.
 */
declare function toLeadRowVM(r: LeadRowDto, tz: string, now: Date, search?: LeadSearchDto | null): LeadRowVM;
/** The rail's rows under Leads (§6.1): the six lists with counts, then the searches with their marks. */
declare function leadRail(counts: LeadCounts, searches: LeadSearchDto[], now?: Date): {
    lists: {
        id: LeadList;
        label: string;
        count: number;
    }[];
    searches: {
        id: string;
        name: string;
        count: number;
        mark: "live" | "question" | null;
        undoable: boolean;
    }[];
};
/** "322 leads · 272 ready · 3 searches", and "1 search needs you" when one waits. */
declare function leadsStanding(counts: LeadCounts, searches: LeadSearchDto[]): {
    total: string;
    parts: string[];
    needsYou: {
        count: number;
        searchId: string;
    } | null;
};
/** Under this many places judged, a prior is too thin to say a number from. */
declare const LEAD_PRIOR_MIN_PLACES = 50;
/**
 * The Likely line and its two-part bar (§8.3): what past searches for this
 * kind of business found, never a promise about this one. A kind never
 * searched says the share is checked after the first 25 (P3).
 */
declare function leadPlanLikely(plan: LeadSearchPlan, facts: LeadPlanFacts): {
    emailPct: number | null;
    phonePct: number | null;
    line: string;
};
/** The facts under the sentence (§8.3), in the one unit the owner has: leads. No dollar meter. */
declare function leadPlanFacts(plan: LeadSearchPlan, facts: LeadPlanFacts): string[];
/**
 * What the card asks for, and how it says why it is not what was typed (§0.2,
 * decision 27). When a limit binds the count is clamped to what is left, the
 * button says that number, and one sentence says which limit and what else
 * would fit. There is no dollar meter, and the word is always leads.
 */
declare function leadPlanAsk(plan: LeadSearchPlan, facts: LeadPlanFacts): {
    count: number;
    label: string;
    covers: string | null;
};

/** What a CSV cell may hold before it is spelled. */
type CsvCell = string | number | boolean | null | undefined;
/**
 * One CSV cell. Quoted when it must be (RFC 4180), and any cell that a spreadsheet would read as a formula gets a
 * leading apostrophe: a WhatsApp profile name is customer-written text, and "=HYPERLINK(...)" is a real attack on
 * whoever opens the file. Phone numbers start with "+" and keep it this way too, instead of being summed.
 * One rule for every file the product writes: the route's export of everyone (apps/dashboard/src/server/export.ts)
 * and the page's export of a selection (clients-a.jsx, through window.__csvCell), which quoted and nothing more.
 */
declare function csvCell(v: CsvCell): string;

export { ABANDONED_MS, ACTIVITY_KINDS, ACTIVITY_NOISE_PREFIXES, ACTOR_TYPES, ALERT_KINDS, ANALYSIS_GRACE_MS, ASK_CAPS, ASK_CITATION_KINDS, ASK_FINISH_JSON_SCHEMA, ASK_LANGUAGES, ASK_MAX_CHARS, ASK_MAX_ROUNDS, ASK_MODEL, ASK_PAGES, ASK_PAGE_ROUTES, ASK_RETENTION_DAYS, ASK_THREAD_VERBS, ASK_TOKENS_DAY, ASK_TURN_BUDGET_MS, ASK_UNDO_MS, AUDIENCE_KINDS, type AbilityInputs, type AbilityRowVM, type ActivationRecord, type ActivityPageDto, type ActivityRowDto, type DecisionVerb as ActivityVerb, type ActorType, AppError, type AskCitation, type AskCitationKind, type AskFinish, AskFinishSchema, type AskLanguage, type AskMessageVM, type AskProposal, type AskProposalOutcome, AskProposalOutcomeSchema, type AskReadSet, type AskRole, type AskScope, type AskSettingsChange, AskSettingsChangeSchema, type AskSuggestion, type AskSurface, type AskThreadVM, type AskThreadVerb, type AttentionRowVM, type Audience, type AudienceKind, type AudiencePreview, type AwayGroupVM, type AwayQueueRef, type AwayRowLike, BILLING_MODES, BILLING_STATUSES, BILLING_TEST_MODE_CLAUSE, BILLING_TRIAL_DAYS, BOOKING_DEFAULTS, BRAIN_INTENTS, BRAIN_LANGUAGES, BRAIN_OUTPUT_JSON_SCHEMA, BROADCAST_CHUNK, BROADCAST_FAILURE_WORDS, BROADCAST_GAP_MS, BROADCAST_MAX_RECIPIENTS, BROADCAST_NAME_MAX, BROADCAST_PARAM_MAX, BROADCAST_SCHEDULE_MAX_DAYS, BROADCAST_STATES, BROADCAST_STATE_LABELS, BROKEN_CONFIG_WORDS, BUSINESS_INDUSTRIES, BUSINESS_TYPES, type BillingAccountDto, type BillingBell, type BillingDto, type BillingInvoiceDto, type BillingMode, type BillingPlan, type BillingPriceDto, type BillingStatus, type BillingVM, type BookingReportDto, type BookingReportVM, type BookingRules, type BookingRulesLike, BookingRulesSchema, type BrainConfig, BrainConfigSchema, type BrainIntent, type BrainMeta, type BrainOutput, BrainOutputSchema, type BroadcastCounts, type BroadcastDetailDto, type BroadcastDto, type BroadcastRecipientDto, type BroadcastState, type BroadcastVM, type BusinessFieldVM, type BusinessIndustry, BusinessLineSchema, type BusinessPageFacts, type BusinessPageVM, type BusinessProfile, BusinessProfileSchema, type BusinessRecordDto, type BusinessType, type BusyBlock, CALENDAR_FEED_WORDS, CALL_HEARTBEAT_MS, CALL_KEY_PREFIX, CALL_OUTCOMES, CALL_OUTCOME_WORDS, CAMPAIGN_REPORT_RANGES, CAPABILITY_KINDS, CARRIERS, CARRIER_WORDS, CHANNEL_ANSWERED, CHANNEL_KINDS, CHANNEL_KIND_WORDS, CHECKOUT_OUTCOME_WORDS, COMPANY_TYPES, CONFIDENCE_STEPS, CONNECTION_GROUP_WORDS, CONNECTION_KINDS, CONSENT_PHRASE, CONSENT_PHRASE_ES, CONSENT_RESET_SOURCE, CONSENT_SOURCES, CONSENT_STATES, CONVERSATION_OPT_IN_PATTERN, CONVERSATION_PHRASE, CONVERSATION_STATES, type CalendarBandVM, type CalendarBlockVM, type CalendarClosureVM, type CalendarConfig, CalendarConfigSchema, type CalendarDayDto, type CalendarDayVM, type CalendarFeedDto, type CalendarFeedHealth, type CalendarFeedNoteVM, type CalendarItemDto, type CalendarLike, type CalendarPerson, type CalendarServiceDto, type CalendarServiceVM, type CalendarVM, type CalendarView, type CalendarWeekDto, type CalendarWindowVM, type CallDto, type CallOutcome, type CallVM, type CampaignDayDto, type CampaignPointVM, type CampaignReportDto, type CampaignReportVM, type CampaignSourceDto, type CampaignSourceVM, type CampaignTotals, type CannotRowVM, type CapabilityBlocker, type CapabilityInputs, type CapabilityKind, type CapabilityStatus, type Carrier, type ChannelDto, type ChannelHealth, type ChannelKind, type ChannelPickable, type ChannelVM, type CleanedEmails, type Closure, ClosureSchema, type CompanyType, type ConflictSeverity, type ConnectionGroup, type ConnectionInputs, type ConnectionKind, type ConnectionRow, type ConnectionState, type ConnectionTone, type ConnectionVerb, type ConnectionWho, type ConsentAsk, type ConsentBearing, type ConsentChange, type ConsentFormSection, type ConsentFormVM, type ConsentPageFacts, type ConsentPageVM, type ConsentState, type ConsentWay, type ConsentWayKind, type ConsultRules, type ConversationDto, type ConversationMessageVM, type ConversationState, type ConversationVM, type Crumb, type CsvCell, DAYS, DECISION_SUBJECTS, DECISION_VERBS, DEFAULT_BUSINESS_TYPE, DEFAULT_COMPANY_TYPE, DEFAULT_INDUSTRY, DEFAULT_TIMEZONE, DISCONNECTION_LABELS, DISPLAY_NAME_MAX, type DayFrameLike, type DecisionSubject, type DecisionVerb, type DeskSignVM, E164, EMAIL_ELSEWHERE_SENTENCE, EMAIL_NOT_ANSWERED_SENTENCE, EMPTY_READ_STATE, ERROR_CODES, ESCALATION_REASONS, ESCALATION_REASON_LABELS, ESCALATION_STATES, EVENT_EVIDENCE_KINDS, EVENT_KINDS, EVERYONE_LABEL, type EmailSetupDto, type Envelope, type Err, type ErrorCode, type EscalationDto, type EscalationReason, type EscalationState, type EventContacts, type EventKind, type Exactly, FALLBACK_DEFAULTS, FALLBACK_DETAILS, FEED_MAX_BYTES, FORWARDING_MODES, FORWARDING_TEST_WINDOW_MS, type Fact, type FactConflict, type FactSource, type FallbackDetail, type FastCall, type FastContext, type FastPath, type FeaturesConfig, FeaturesConfigSchema, type FeedAttendee, type FeedCall, type FeedFailure, type FeedHorizon, type FeedIndex, type FeedInput, type FeedInvite, type FeedItem, type FeedThread, type FirstWorkspaceDoor, type ForwardingCode, type ForwardingCodes, type ForwardingFacts, type ForwardingMode, type FreeWindowsInput, GET_YES_ROUTE, GOOGLE_SHOWN_REVIEWS, GUARDRAIL_KEYS, type GoogleAudience, type GoogleCandidateDto, type GoogleConnectionDto, type GoogleDayDto, type GoogleDto, type GoogleGainedPointVM, type GoogleListingDto, type GoogleLocationDto, type GoogleReviewDto, type GoogleReviewVM, type GoogleVM, type GuardrailKey, GuardrailsSchema, HELD_REASONS, type Holds, type Hours, type HoursRun, HoursSchema, INSTRUCTIONS_MAX, INTENT_LABELS, INVOICE_STATUS_WORDS, type IdentityInput, type IdentityWords, type InboxTemplateLike, type InboxThreadVM, type Interval, IntervalSchema, JOB_KINDS, JOB_STATES, JUDGE_FACT_KEYS, JUDGE_OUTPUT_SCHEMA, type JobKind, type JobNews, type JobNewsKind, type JobState, type JourneyListLike, type JudgeCriterionAnswer, type JudgeFactKey, type JudgePlaceAnswer, type JumpEntry, type KnownFacts, LEAD_ASK_MAX_FACTOR, LEAD_ASK_MIN_FACTOR, LEAD_ASSUMED_YIELD, LEAD_CALL_OUTCOMES, LEAD_CALL_OUTCOME_TONES, LEAD_CALL_OUTCOME_WORDS, LEAD_CALL_QUESTION, LEAD_CARDS, LEAD_CHECK_CENTS_EACH, LEAD_CHECK_GROUP_WORDS, LEAD_CHECK_KEYS, LEAD_CHECK_UNSURE, LEAD_CHECK_WORDS, LEAD_CLASSES, LEAD_CLASS_WORDS, LEAD_CLOSED_REASONS, LEAD_CLOSED_WORDS, LEAD_CONSENT_REFUSAL, LEAD_CONTACT_STANDARD_WORDS, LEAD_COUNTER_KINDS, LEAD_COUNT_CHOICES, LEAD_DAY_CAP_USD, LEAD_DRAFT_JSON_SCHEMA, LEAD_DRAFT_NOTE, LEAD_EMAIL_REASON, LEAD_EMAIL_STATES, LEAD_EMAIL_WORDS, LEAD_ENDING_WORDS, LEAD_ESTIMATE_MARGIN, LEAD_FACT_MAX, LEAD_FIRST_DAY_FOOT, LEAD_FIRST_DAY_SUB, LEAD_FIRST_DAY_TITLE, LEAD_FITS, LEAD_FIT_WORDS, LEAD_FREE_MAIL, LEAD_JUDGE_BATCH, LEAD_JUNK_EMAIL_DOMAINS, LEAD_KIND_KEY, LEAD_LEFT_OUT_WORD, LEAD_LISTS, LEAD_LIST_WORDS, LEAD_LOCKED_LINE, LEAD_LOW_SHARE_FLOOR, LEAD_MAILBOX_WORDS, LEAD_MAP_MAX_SPAN_M, LEAD_MAX_PLACES, LEAD_MEMBER_CLASSES, LEAD_MONTHLY_ALLOWANCE, LEAD_MONTHLY_BUDGET_USD, LEAD_NOTE_MAX, LEAD_NOTE_PLACEHOLDER, LEAD_NOT_A_FIT_TITLE, LEAD_NOT_A_FIT_WHYS, LEAD_NOT_A_FIT_WORDS, LEAD_NO_ADDRESS, LEAD_NO_CARD_LINE, LEAD_NO_EMAIL_LINE, LEAD_OPERATION_KINDS, LEAD_OUTSIDE_US_LINE, LEAD_PAUSED_TITLE, LEAD_PLACEHOLDER_LOCALS, LEAD_PLATFORM_DAY_CAP_USD, LEAD_PLATFORM_HOSTS, LEAD_PREFERENCE_KINDS, LEAD_PRIOR_MIN, LEAD_PRIOR_MIN_PLACES, LEAD_PROBE_PLACES, LEAD_QUESTION_MIN_EVIDENCE, LEAD_QUESTION_THRESHOLD, LEAD_QUESTION_WAIT_MS, LEAD_REASON_MAX_WORDS, LEAD_REMOVE_KEEPS, LEAD_REVIEW_ACT_WORDS, LEAD_REVIEW_GROUP_WHY, LEAD_REVIEW_GROUP_WORDS, LEAD_REVIEW_WORD, LEAD_ROLE_LOCALS, LEAD_ROUND_ANSWERS, LEAD_ROUND_ENDINGS, LEAD_ROUND_PURPOSES, LEAD_ROUND_STATES, LEAD_RUN_PURPOSES, LEAD_RUN_STATES, LEAD_SEARCH_VIAS, LEAD_SENT_QUESTION, LEAD_SLOT_WORDS, LEAD_SORTS, LEAD_SOURCE_WORD, LEAD_STAGES, LEAD_STAGE_WORDS, LEAD_SUGGEST_DAYS, LEAD_SUGGEST_JSON_SCHEMA, LEAD_SUGGEST_UNAVAILABLE, LEAD_SUPPRESSING_WHY, LEAD_SUPPRESSION_KINDS, LEAD_SUPPRESSION_WHATS, LEAD_TALKING_NOTE, LEAD_UNCLAIMED_NOTE, LEAD_UNDO_MS, LEAD_UNREACHABLE_KEY, LEAD_UNREACHABLE_WORD, LEAD_WORDS, LIMIT_TIERS, LINE_CREDENTIALS_SENTENCE, LINE_STEP_WORDS, LIVE_OVERLONG_MS, LIVE_STALE_MS, type LeadArea, type LeadBand, type LeadCallOutcome, type LeadCardBrief, type LeadCheck, type LeadCheckKey, type LeadChips, type LeadClass, type LeadClassification, type LeadContactStandard, type LeadCounts, type LeadCriterion, type LeadCriterionStandard, LeadDraftAnswerSchema, LeadDraftInputSchema, type LeadEmailState, type LeadEndingFacts, type LeadEndingLine, type LeadExclusion, LeadExportQuerySchema, type LeadFit, type LeadList, type LeadMapPin, type LeadMapPlot, type LeadMemberClass, type LeadMonthDto, type LeadNichePrior, type LeadNotAFitWhy, type LeadPeekReach, type LeadPeekVM, type LeadPinnable, type LeadPlanFacts, type LeadPlanRefusalKind, type LeadPlanView, type LeadPlanWord, type LeadPlanned, type LeadQuestion, type LeadReviewAct, type LeadReviewGroup, type LeadReviewGroupId, type LeadRoundAnswer, type LeadRoundEnding, type LeadRoundPurpose, type LeadRoundState, type LeadRowCard, type LeadRowDto, type LeadRowVM, type LeadRunState, type LeadSearchDto, type LeadSearchPlan, LeadSearchPlanSchema, type LeadSearchRoundDto, type LeadSearchVia, type LeadSlot, type LeadSlotState, type LeadSort, type LeadStage, type LeadStageInput, LeadStageInputSchema, LeadSuggestAnswerSchema, type LeadSuggestionsDto, type LeadWay, type LeadWayFacts, type LeadWeekRow, type LeadsBulkInput, LeadsBulkSchema, type LeadsCheckAgainInput, LeadsCheckAgainSchema, type LeadsQuery, LeadsQuerySchema, LeadsViewSchema, type LineDto, type LiveBarVM, type LiveCallVM, type LiveLineVM, type LiveTurnVM, type LiveVM, MAILBOX_FROM_NAME_MAX, MAILBOX_LOCAL_PART_MAX, MAILBOX_RESERVED, MARKETING_OPT_IN_PATTERN, MAX_CLOSURES, MAX_INTERVALS_PER_DAY, MEMBERSHIP_ROLES, MESSAGE_CHANNELS, MESSAGE_DIRECTIONS, MESSAGE_SENDERS, MESSAGE_STATUSES, MESSAGE_TYPES, MOCK_TEXTING_SENTENCE, MODE_WORDS, type MailboxDto, type MatchVia, type MediaVM, type MembershipRole, type MessageAuthor, type MessageChannel, type MessageDirection, type MessageDto, type MessageSender, type MessageStatus, type MessageType, type MetricsChannelDto, type MetricsSummaryDto, NEEDS_KEY_PREFIX, NEEDS_TITLE, NEW_WINDOW_MS, NO_REPLY_AFTER_MS, type NameableContact, type Note, NoteSchema, type NotificationDto, type NotificationItem, type NotificationKind, type NotificationReadState, type NotificationRow, type NotificationsConfig, NotificationsConfigSchema, type NotificationsDto, type NumberHealth, type NumberHealthInput, OFFERS_BY_WHATSAPP_NOTE, OFFERS_OPT_IN_PHRASES, OFFERS_YES_SOURCES, OPT_IN_PATTERN, OPT_OUT_PATTERN, OPT_OUT_REFUSAL, OUTCOME_UNKNOWN, OWN_MESSAGE_REFUSALS, type Ok, type Opening, type OwnAddresses, type OwnFacts, type OwnMessageVM, PARAM_SOURCES, PARAM_SOURCE_LABELS, PASSWORD_MAX_BYTES, PASSWORD_MIN, PASSWORD_WORDS, PAUSE_HOURS_DEFAULT, PENDING_WORKSPACE_KEY, PEOPLE_LISTS, PEOPLE_LIST_GROUPS, PEOPLE_TABS, PERM_DOING, PERSON_CAME_FROM_WORDS, PERSON_CHANNEL_WORDS, PERSON_MODES, PERSON_MODE_LABELS, PERSON_MODE_WORDS, PERSON_STATE_LABELS, PLATFORM_NEW_DAYS, PLATFORM_QUIET_DAYS, PLATFORM_VERDICTS, PLAYBOOK_BREATH_MS, PLAYBOOK_CLASS_LABEL, PLAYBOOK_DEFAULTS, PLAYBOOK_HOURS, PLAYBOOK_NAME_MAX, PLAYBOOK_REACH_DOOR, PLAYBOOK_REACH_WORDS, PLAYBOOK_STATES, PLAYBOOK_TRIGGERS, PLAYBOOK_VETO_DELAY_MS, POLICY_CLASSES, POLICY_CLASS_MODES, POLICY_CLASS_WORDS, POLICY_MODES, POLICY_MODE_WORDS, PROMPT_OPENINGS, PROPOSAL_GATE, PROVISIONING_DEADLINE_MS, PURPOSE_REFUSALS, type ParamFacts, type ParamSourceKind, type ParamSpec, type ParseOptions, type ParsedFeed, type PendingWorkspace, PendingWorkspaceSchema, type PeopleAggregates, type PeopleListAction, type PeopleListGroup, type PeopleListsLike, type PersonCameFrom, type PersonChannel, type PersonConsent, type PersonDecisionDto, type PersonDetailDto, type PersonEscalationDto, type PersonFact, type PersonFirstContact, type PersonIdentityDto, type PersonLastContact, type PersonLike, type PersonMatch, type PersonMode, type PersonReceptionist, type PersonRightNow, type PersonRowDto, type PersonRowVM, type PersonState, type PersonTimelineItemVM, type PersonVM, type PersonVisitsDto, type PlaceFacts, type PlatformHealth, type PlatformLineAction, type PlatformLineActionVM, type PlatformQueue, type PlatformQueueVM, type PlatformRowVM, type PlatformTenantDto, type PlatformVerdict, type PlatformVerdictWords, type PlaybookCardLike, type PlaybookDto, type PlaybookPolicyClass, type PlaybookReach, type PlaybookState, type PlaybookTrigger, type PlaybookTriggerKind, type PolicyClass, type PolicyLimits, PolicyLimitsSchema, type PolicyLinks, type PolicyMode, type PolicyRow, type PreflightFacts, type PreflightProblem, type PreviewPerson, type ProbeMember, type PromptBlockVM, type PromptSource, type ProposeLeadSearch, ProposeLeadSearchSchema, type PublicPageMetadata, type PurposeBearing, type PurposeRefusal, QUEUE_SENDS_NOTHING, QUEUE_SHOWN, QUIET_AFTER_MS, QUOTE_MAX, RATE_HITS_RETENTION_HOURS, RECENT_MAX, RECIPIENT_STATES, RECORDING_PURGED_WORDS, RECORDING_RETENTION_DAYS, REGISTRATION_COST_WORDS, REGISTRATION_PATHS, REGISTRATION_PATH_WORDS, REGISTRATION_QUESTION, REPLY_CAP_DEFAULT, REPLY_DELAY_DEFAULT_MS, REPLY_DELAY_MAX_MS, REPLY_DELAY_MIN_MS, REPLY_LIMITS, REPLY_MAX_ANY, REPLY_WINDOW_HOURS, REPLY_WINDOW_MS, REPLY_WINDOW_WORDS, REPORT_CHANNELS, REPORT_RANGES, REPORT_WEEK_LONG, REPORT_WEEK_SHORT, RETENTION_DAYS, REVIEW_AUTO_REPLIES_PER_SYNC, REVIEW_AUTO_REPLY_MAX_AGE_MS, REVIEW_NEWS_MAX_AGE_MS, REVIEW_NEWS_MS, REVIEW_REPLY_MAX_CHARS, REVIEW_REPLY_MAX_WORDS, ROLES, ROLE_PERMS, ROLE_WORDS, type ReceptionistTone, type RecipientState, type RecordCheckFacts, type Refusal, type RefusalInput, type RegistrationPath, type RegistrationPathWords, RenameLeadSearchSchema, type ReplyWhyVM, type ReportBarVM, type ReportChannelCounts, type ReportChannelKey, type ReportChannelVM, type ReportDayDto, type ReportDto, type ReportFactVM, type ReportHoursVM, type ReportLinesVM, type ReportPointVM, type ReportSpeedPointVM, type ReportTileVM, type ReportVM, type ReportWeekVM, type ReportsLike, type ResolvedFacts, type ReviewOnRecord, type ReviewReplyFacts, type ReviewReplyMode, type ReviewToAnswer, type Role, type RolePerm, type RuleStrength, type RuleStrengthVM, type RunLike, type RunPlan, SCHEMA_SETS, SENDING_HOURS_WORDS, SERVER_KEY_PREFIX, SERVER_NOTIFICATION_KINDS, SETUP_REQUEST_KINDS, SETUP_STATE_WORDS, SHORTCUTS, SIGNIN_RESEND_COOLDOWN_S, SIGNUP_NAME_MAX, SIGNUP_NAME_MIN, SIGNUP_WAITLIST, SIGNUP_WORDS, SMS_CLAUSES, SMS_OPT_OUT_PATTERN, SOLE_PROP_CEILING_SENTENCE, SOLE_PROP_LIMITS, SOLE_PROP_TEXTING_SENTENCE, SOURCE_WORDS, SPEND_LEADS, SPEND_NUMBER, STARTER_LANGUAGES, STARTER_TEMPLATES, type SchemaAgreement, type SchemaSet, type SchemaSetKey, type SendPurpose, type ServerNotificationKind, type Service, type ServiceLike, type ServiceOffer, ServiceSchema, type SetupBillingFacts, type SetupDto, type SetupGoogleFacts, type SetupInputs, type SetupRequestKind, type SetupRowVM, type SetupState, type SetupVM, type SetupVerb, type ShellStatus, type ShellStatusLine, type Shortcut, type SidebarPref, type SignupInput, type SignupPosture, SignupSchema, type SpanUnits, type SpendWords, type SpokenBreach, type SpokenGuardVerdict, type SpokenRule, type SpokenTurn, type Standing, type StandingInput, type StandingInputs, type StandingVM, type StandingVerdict, type StarterSlot, type StarterSlotKind, type StarterTemplate, type StarterText, type StateKind, type SubscriptionFacts, type SuggestionInput, type SweepHealthRow, TEMPLATE_BODY_MAX, TEMPLATE_BUTTON_TEXT_MAX, TEMPLATE_CATEGORIES, TEMPLATE_EXAMPLE_MAX, TEMPLATE_FOOTER_MAX, TEMPLATE_LANGUAGES, TEMPLATE_NAME_MAX, TEMPLATE_STATUSES, TEMPLATE_TITLE_MAX, TENANT_STATUSES, TEXTING_NEEDS_RECORD_CLAUSE, TEXTING_NEEDS_RECORD_SENTENCE, THEME_OPTIONS, TIMELINE_FILTERS, TOAST_ICONS, TOAST_MIN_MS, TOAST_MS, TOAST_TONES, TOAST_UNDO_MS, TODAY_DAY_MAX, TODAY_LEAK_MAX, TODAY_QUEUE_MAX, TONES, type TemplateButton, type TemplateCategoryChoice, type TemplateDraft, type TemplateDraftCheck, type TemplateDraftInput, type TemplateGroup, type TemplateParts, type TemplateSendSource, type TemplateSends, type TemplateSentWords, type TemplateStatus, type TemplateUse, type TemplateUseSource, type TenantConfig, type TenantConfigParse, TenantConfigSchema, TenantConfigWriteSchema, type TenantStatus, type TextingTermsVM, type Theme, type ThemePref, type TimelineFilterId, type TimelineKind, type ToastShape, type ToastTone, type TodayAwayVM, type TodayCallRowVM, type TodayDayFrameVM, type TodayDayItemVM, type TodayDayVM, type TodayFactVM, type TodayFigureId, type TodayFigureVM, type TodayLeakId, type TodayLeakVM, type TodayLeaksVM, type TodayNeedsRowVM, type TodayNoReplyVM, type TodayQueueEmptyVM, type TodayQueueRowVM, type TodayRunWordsVM, type TodaySentenceVM, type TodayVM, type Tone, type Touches, type TypedFacts, type Visit, type VisitDto, type Visits, WABA_FIELDS, WA_WINDOW_MS, type WaWindow, type WabaEventKind, type WaitingPersonDto, type WaitingRowVM, type WeekTileLike, type WhoseWords, type Within, abandonedCall, abilityRows, activityTone, activityWords, addressAlreadyKnown, afterPersonRefused, agentFor, ago, agoLabel, agoShort, agoWords, allVisitsIn, applyReadState, applySettingsChange, asPersonMode, askJump, askUndoOpen, attentionRow, audiencePreview, autoReplyBell, autoReplyCandidates, billingAccountDto, billingDoorOpen, billingPill, bookedAfterAsk, bookingHeld, bookingLinkAction, bookingTemplate, brainMetaOf, broadcastFailureWords, broadcastName, buildAskSuggestions, buildNotificationFeed, businessFieldsFor, businessGroupWordsFor, businessPageMetadata, businessPageVM, businessRecordForPath, businessRecordLine, businessRecordProblems, businessTypeOf, calendarOwnerOf, callMoodTone, callOfKey, callOutcomeOf, callOutcomeWords, cameFromOf, cannotRows, capabilityStatus, changedConfigFields, channelFor, channelKindWords, channelsOf, checkedWords, citationRoute, citationsToShow, classify, cleanAnswer, cleanDisplayName, cleanDraft, cleanEmailCandidates, cleanParam, cleanTimezone, clipAtWord, clockDate, clockDateYear, clockDayLabel, clockInZone, clockLabel, clockShort, clockStamp, clockTime, clockWhen, closedOn, companyTypeOf, compareTemplates, compareWords, composeSystemPrompt, connectionRows, connectionWords, consentChangeOf, consentChangeWords, consentFormMetadata, consentFormVM, consentPageMetadata, consentPageVM, consentSourceLabel, contactMeta, contactName, conversationOfNeedsKey, coversSpan, csvCell, dailyLimit, dataSentences, dayDate, dayFromQuestion, dayInZone, dayIntervals, dayPlusInZone, dayWords, dedupeFeed, defaultParamSpecs, defaultSlotKinds, defaultTemplate, deltaOf, describeNow, describeOpenings, describeSettingsChange, describeVisits, deskSignMetadata, deskSignVM, detectLanguage, deviceTimezone, draftSendsAtMs, durationLabel, eligibleFor, eligibleForPlaybook, emailLeftOutOf, emailNotConfirmed, emailWires, emptyAudienceRefusal, emptyBusinessRecord, emptyReadSet, endingOfRound, erasedEmailHash, erasedPhoneHash, err, estimateRoundUsd, eventText, exampleParams, extractContacts, factConflicts, fallbackMessages, fastPath, feedBodyProblem, feedNotes, feedProblemWords, feedSourceLabel, feedUrlOk, filterOpenings, filterTimeline, firstNameOf, firstWorkspaceDoor, fmtClock, fmtDay, fmtSeconds, followupsToShow, footerOf, formatPhoneDisplay, formatWaited, forwardingCodes, forwardingMatch, forwardingTestOpen, frameGuardrail, frameHandOver, frameOf, frameSteer, frameWhisper, freeWindows, fromZonedInput, gainedOver, googleAudienceWords, googleCallbackUrl, groundCitations, groupTemplates, guardSpokenTurns, guessName, guessSlotKind, handoffE164, hardLimitsWords, hasProfile, hoursLines, hoursOf, hoursRuns, identityWords, inboxSlots, inboxTemplates, indexFeed, industryOf, industryWords, initialsOf, injectedTurn, instructionsDraft, inviteState, invoiceStatusWords, isActivityNoise, isBaselinePrompt, isCarrier, isDayKey, isForwardingMode, isHeldDraft, isIdentifierName, isLiveCall, isOptedOut, isOptedOutContact, isOwned, isRealDate, isSidebarPref, isThemePref, isTimezone, isTypingTarget, isUngrounded, isUsablePassword, judgeOpId, judgeSystemPrompt, judgeUserContent, knownTimezones, languageLabels, languageWords, lastChangedWords, leadAllowanceFact, leadAnd, leadAskedFor, leadBand, leadCheckAgainCents, leadDraftFooter, leadEndingLine, leadExclusionWord, leadFactsSummary, leadKindWord, leadLowShare, leadLowerFirst, leadMapAcross, leadMapNote, leadMapPlot, leadMonth, leadNoCardLine, leadNotBusinessesLine, leadNoteLeft, leadPinTone, leadPlanAsk, leadPlanFacts, leadPlanLikely, leadRail, leadReachLine, leadReviewCosts, leadReviewGroups, leadSearchWords, leadSlots, leadSuppressionHash, leadTintOf, leadTodayLine, leadUndoable, leadWeekBars, leadWeekSummary, leadWhere, leadsFirstDayWays, leadsRoute, leadsStanding, lineCredentialFailure, lineRetryRefusal, lineStuckProvisioning, listingLine, liveBar, liveStillUp, localDate, localHour, localToUtcMs, matchPerson, matchService, mayMessageFor, mayReceive, maySpend, mediaKind, mediaVM, memberWords, messageAt, messageAuthor, messageStatusLabel, messageText, mondayOf, moneyWords, monthLabelOf, monthSpan, navigateLabel, needsConsultation, newReceptionistDefaults, nextOpenMoment, nextRunLabel, nextThemePref, normalizeEmail, normalizeLocalPart, normalizeNavigate, normalizePhone, notFoundPageMetadata, numberHealth, offerFor, offerLead, offeringHorizon, offersYesRefusal, ok, optInConfirmation, optInLink, optInPurposeOf, outcomeMove, overLimitRefusal, ownAddressesOf, ownMessageRefusal, ownWordsOf, pageTitle, paramLabel, parseAskFinish, parseBrainOutput, parseIcs, parseJudgeAnswer, parseLeadsRoute, parseParamSpec, parseParamSpecs, parseTenantConfig, parseTenantConfigResult, partialAnswer, passwordProblem, pausedVoiceFacts, pendingWorkspaceOf, peopleAggregates, peopleFromItems, peopleListAction, personInText, personInitials, personName, personStanding, personStateFor, phoneTail, placeholdersOf, placeholdersSequential, placesToAsk, planArea, planBilling, planCeiling, planLeadSearch, planLeavingOut, planMinutes, planRun, planSaid, planSentence, planVersionOf, planWhere, planWho, planWords, platformActionWarning, platformHealthOf, platformHealthWords, platformLineActions, platformNumber, platformQueue, platformRows, platformSummary, playbookReach, playbooksStillSending, pointsDelta, policyAskClass, policyClassOfIntent, policyLinks, policyRules, previewHorizon, priceWords, priorOf, promptBlocks, providerNameOf, purposeOfPlaybook, purposeOfTemplate, quantile, questionAfterProbe, ratingWords, reachedCustomer, readAgoLabel, reasonShort, recencyCells, receptionistOn, recoverCitations, refusalOf, registrationPathOf, registrationPreflight, renderTemplate, replyDelayMs, replyWhy, replyWindow, reportFacts, reportHourWords, requestCodeWords, resendLeft, resolveFacts, resolveParams, resolveSystemPrompt, resolveTheme, retentionWords, reviewIsNew, reviewReplyModeOf, reviewReplyPrompt, reviewReplyWords, reviewSnippet, reviewsWords, roleGate, ruleParts, ruleStrength, rulesLine, runDueNow, runningTotal, safeNavigate, sameAddress, sameName, samePhone, sameQuestion, savedListAction, scheduleLine, scopeFromRoute, seasonHorizon, sendFailureIsOurs, sendableTemplates, serverNotificationRows, setupRoute, setupSteps, sha256Hex, shellStatusLine, shiftKey, shiftMonth, shortCode, shortTime, shortcutGroups, shouldLandOnSetup, signupPosture, siteHost, slotLabels, slotToWrite, slugTemplateName, smsConsentSentence, smsStateRow, soleProprietorLimits, spanForView, spanLabel, spanUnits, speedOf, splitQuotedReply, spokenBreach, spokenBreachDetails, spokenDuration, stageArgs, standingLine, standingOf, starsOf, starterByKey, starterByName, starterDraft, starterForTrigger, starterIndex, starterPreview, starterPreviewValues, starterText, stateCode, stateLabel, stateOf, stateTone, suggestLocalPart, telHref, templateBlocked, templateComponents, templateFooter, templateNameOk, templateParts, templatePreview, templatePreviewValues, templateSends, templateSentWords, templateTitle, templateUnused, templateUsage, templateUseWords, tenantStatusFor, textingTermsMetadata, textingTermsVM, textingWords, themeButtonWords, threadChannelOf, threadChannelWords, threadStanding, tidyCallSummary, timezoneCity, timezoneWords, toBillingVM, toBookingReportVM, toBroadcastVM, toCalendarVM, toCallVM, toCampaignReportVM, toChannelVM, toConversationVM, toGoogleReviewVM, toGoogleVM, toInboxThreadVM, toLeadPeekVM, toLeadRowVM, toLiveCallVM, toLiveVM, toPersonRowVM, toPersonVM, toReportVM, toTodayVM, toVisitDto, toastShape, todayAwayGrouped, todayDay, todayLeaks, todayPeriodLine, todayProof, todayRunApproved, todayRunWords, todayRunsSub, tomorrowAtIn, trialOffer, trialWords, triggerOf, tzClock, unknownDetails, unreadCount, usPhone, usableDeviceTimezone, validateTemplateDraft, verbForRoute, verbalOptInScript, verifyCodeWords, violatesNoPrices, visitDateKey, visitDay, visitDayWord, visitFactsFor, visitLine, visitStartTime, visitTime, visitsIn, visitsOf, waWindow, waitedLabel, wallClockAt, weekOf, whenLabel, whisperText, whoseWords, whyCannotSpend, whyNotAFromName, whyNotAHandoff, whyNotALocalPart, whyNotAPhone, whyNotAnEmail, windowFor, workspaceHotkey, writtenChannelOf, zoneDayKey, zoneMidnight, zoneOffsetMs, zonedInputValue };
