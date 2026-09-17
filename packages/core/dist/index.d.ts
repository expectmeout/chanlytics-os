import { SupabaseClient } from '@supabase/supabase-js';
import { EmailRequest, SendResult, ResendConfig, EmailSendsAs, WaConfig } from '@chanlytics/channels';
import { SendPurpose, DecisionSubject, DecisionVerb, ParamSpec, Audience, PersonRowVM, NumberHealth, PersonVisitsDto, PlaybookTrigger, PlaybookPolicyClass } from '@chanlytics/contracts';
import { Json, Database } from '@chanlytics/db';

/**
 * deliver(): the one door a message leaves through.
 *
 * Four sequences used to put words on a wire, each assembled by hand: the
 * outbox job asked "opted out?" and nothing about the thread, the broadcast
 * asked the one predicate with the template's purpose and then checked the
 * pause, the voice booking link asked a gate of its own, and the webhook's
 * reply is the statement order of a 300-line function. They disagreed about
 * the pause and about marketing consent, and the disagreements were the
 * defects: a promotional template reaching someone who had said yes to
 * appointments and no to offers; a held draft firing under the owner's own
 * words.
 *
 * This is the door for the first three, and the shape the fourth grows into.
 * It RE-READS the facts at the wire -- the person's consent, the thread's
 * pause, the workspace's status -- because the moment before the send is the
 * one place a stale answer cannot be taken back. It knows nothing about who
 * should be told when a send fails: it returns what happened, and the caller
 * (a job with an owner to alert, a broadcast with a recipient to mark, a
 * voice agent with a caller waiting) says so in its own words.
 *
 * Every send NAMES ITS PURPOSE. A template's purpose is what Meta says it is
 * (purposeOfTemplate fails closed to marketing); words in a conversation are
 * conversational. A send is PROACTIVE when it starts a conversation rather
 * than answering one, and that decides whether a recorded yes is needed for
 * conversational words at all.
 */

type Db = SupabaseClient<Database>;
type Channel = "whatsapp" | "sms" | "email";
/**
 * What a send IS, for the door's rules -- never read off `sender`, which is a
 * fact about who wrote the words and is recorded as such.
 *  - "reply": a person's own words in a conversation; every pause exists for
 *    them, so none holds it.
 *  - "draft": the receptionist's held reply, queued; a person speaking since
 *    retires it, and the pause it now meets does not.
 *  - "broadcast": proactive and automated; it respects every pause like the
 *    machine it is.
 *  - "system": words the rules require of us -- an opt-in confirmation naming
 *    the program, HELP and STOP; a held thread does not hold them, a paused
 *    workspace does.
 *  - "answer": the receptionist answering now; every pause holds it.
 */
type SendKind = "reply" | "draft" | "broadcast" | "system" | "answer";
interface TemplateSend {
    name: string;
    language: string;
    params: string[];
}
interface WirePayload {
    body: string;
    template?: TemplateSend;
    /**
     * The request an email leaves as, built and frozen when the message was
     * queued (channels email.ts). Present on the email wire and nowhere else.
     */
    email?: EmailRequest;
}
/** How to put words on one channel's wire. Owns its own address format. */
type Sender = (to: string, p: WirePayload) => Promise<SendResult>;
/**
 * The wires one workspace has. `undefined`: this runtime has no such
 * channel at all. `null`: the channel exists but this workspace holds no
 * credentials or line for it -- refused here, never guessed from the
 * environment, which is how one business's message left on another's line.
 */
type Wire = Partial<Record<Channel, Sender | null>>;
/**
 * WhatsApp's wire from a workspace's credentials. Graph wants bare digits,
 * so the "+" is stripped here rather than by a caller who should not know.
 */
declare function whatsappSender(cfg: WaConfig | null): Sender | null;
/**
 * Email's wire, bound to ONE workspace's mailbox. It sends the frozen request
 * and nothing it assembled itself: a delivery without one, one addressed to
 * somebody other than `to`, or one that would leave as another workspace, is a
 * failure the caller hears about, never a send. The provider key is the
 * deployment's; `as` is what makes the wire this workspace's, and a workspace
 * with no mailbox has no email line (null, like a number with no credentials).
 */
declare function emailSender(cfg: ResendConfig | null, as: EmailSendsAs | null): Sender | null;
interface Delivery {
    tenantId: string;
    conversationId: string;
    contactId: string | null;
    /** Where it goes: E.164 (with or without the "+") on a phone's wire, the person's stored address on email's. Each wire shapes it. */
    to: string;
    channel: Channel;
    sender: "ai" | "human" | "system";
    purpose: SendPurpose;
    /** True when this send starts a conversation rather than answering one. */
    proactive: boolean;
    body: string;
    template?: TemplateSend;
    /** The frozen request, on the email wire (WirePayload.email). */
    email?: EmailRequest;
    /**
     * An outbox row already written as `queued` (the honest undo): finalized
     * in place rather than inserted, and only while it is still queued, so a
     * cancel that wins the row is never overwritten.
     */
    messageId?: string | null;
    /** What this send is, for the rules (SendKind). Absent, the door derives it the way it always read `sender`: see kindOf. */
    kind?: SendKind;
    /** Recorded on a row this call writes. */
    meta?: Record<string, Json>;
}
/** Why the door stayed shut. Each is a fact about the person, the thread or the workspace, never about us. */
type DeliveryRefusal = "opted_out" | "not_opted_in" | "no_marketing_consent" | "erased" | "paused" | "human_has_it" | "superseded_by_human" | "sms_carries_no_promotions" | "email_marketing_disabled" | "email_suppressed" | "recipient_changed";
type Delivered = {
    outcome: "sent";
    messageId: string | null;
    externalId: string | null;
} | {
    outcome: "refused";
    reason: DeliveryRefusal;
    messageId: string | null;
} | {
    outcome: "failed";
    /** Ours: no wire for the channel, no credentials for it, the provider said no, or the facts could not be read. */
    reason: "no_sender_for_channel" | "no_credentials" | "provider" | "wire_unreadable";
    status: number;
    errorBody: string | null;
    messageId: string | null;
};
interface DeliverPorts {
    db: Db;
    wire: Wire;
    /** Epoch ms; injected so the pause is testable. */
    now?: () => number;
}
declare function deliver(ports: DeliverPorts, d: Delivery): Promise<Delivered>;
/**
 * Which yes a queued template needs. Meta's category is the authority -- it
 * can recategorise a live template -- and purposeOfTemplate fails closed, so
 * a template whose category we do not have reads as marketing. A read that
 * fails throws: a purpose that cannot be read is not "utility".
 */
declare function templatePurpose(db: Db, tenantId: string, template: {
    name: string;
    language: string;
} | undefined | null): Promise<SendPurpose>;
/**
 * The door for a caller that must never see it throw: the webhook, whose
 * outer catch only logs, so a thrown read used to be a customer's reply lost
 * with nobody told. A wire that cannot be read is a failure with its own
 * name, and the caller alerts a person the way it does for a provider's no.
 */
declare function deliverSafely(ports: DeliverPorts, d: Delivery): Promise<Delivered>;

/**
 * The conversation verbs' view of the world.
 *
 * A verb takes the thread as a fact: the route's scope loaded it under RLS
 * and judged the role where it lives before the verb is called. Everything
 * else the verb needs arrives through a port named for what it means, never
 * for the table it touches; the adapter that knows both lives in
 * apps/dashboard/src/server/core-ports.ts.
 */

/** The thread as the route's scope loaded it. A verb names only the fields it reads. */
interface Thread {
    id: string;
    tenant_id: string;
    state: string;
    paused_until: string | null;
    phone_e164: string | null;
}
/** What the thread verbs need of the world. */
interface ThreadPorts {
    /** How long a person's touch keeps the receptionist off a thread: the reply policy's pause_hours, or a day. */
    pauseMs(tenantId: string): Promise<number>;
    /** The live receptionist's own pause, kept outside Postgres and mirrored FIRST; 0 releases it. */
    pauseBot(tenantId: string, phone: string, untilMs: number): Promise<void>;
    /** needs_human, paused until, snooze cleared, claimed by the user. True iff a row changed. */
    claim(conversationId: string, untilIso: string, userId: string): Promise<boolean>;
    /** open, pause and snooze cleared, unassigned. True iff a row changed. */
    release(conversationId: string): Promise<boolean>;
    /** snoozed until; pause and assignee cleared. True iff a row changed. */
    snooze(conversationId: string, untilIso: string): Promise<boolean>;
    /** open with the snooze cleared, only while still snoozed. True iff a row changed. */
    wake(conversationId: string): Promise<boolean>;
    /** archived; pause and assignee cleared. True iff a row changed. */
    archive(conversationId: string): Promise<boolean>;
    /** The receptionist's held drafts on the thread withdrawn, rows then jobs; how many. */
    withdrawDrafts(tenantId: string, conversationId: string): Promise<number>;
    /** The open escalation on the thread resolved by this decision, when there is one. */
    resolveEscalation(conversationId: string, decisionId: string): Promise<void>;
    /** The ledger: who did what to which row. The decision's id. */
    record(tenantId: string, subject: DecisionSubject, id: string, verb: DecisionVerb, payload?: Json): Promise<string>;
    now(): number;
}
interface EscalationPorts {
    /** open → resolved by the user, only while open. True iff a row changed. */
    resolve(escalationId: string): Promise<boolean>;
    /** The decision linked back onto the escalation; a failure is logged, never fatal. */
    link(escalationId: string, decisionId: string): Promise<void>;
    record: ThreadPorts["record"];
}
interface CancelSendPorts {
    /** queued → canceled, only while queued: zero rows means the send job won. */
    cancelQueued(messageId: string): Promise<boolean>;
    /** The outbound_send job for the message withdrawn; how many. */
    cancelJob(tenantId: string, messageId: string): Promise<number>;
    record: ThreadPorts["record"];
}

type TakeOverPorts = Pick<ThreadPorts, "pauseMs" | "pauseBot" | "claim" | "withdrawDrafts" | "record" | "now">;
interface TakeOverResult {
    state: "needs_human";
    paused_until: string;
    decision_id: string;
    withdrawn_drafts: number;
}
/** Take over: pause the receptionist, claim the thread. The open escalation stays open (§4). */
declare function takeOver(ports: TakeOverPorts, cmd: {
    conv: Pick<Thread, "id" | "tenant_id" | "phone_e164">;
    userId: string;
}): Promise<TakeOverResult>;

type HandBackPorts = Pick<ThreadPorts, "pauseBot" | "release" | "record" | "resolveEscalation">;
/** Hand back: the receptionist resumes; the open escalation resolves (§4). */
declare function handBack(ports: HandBackPorts, cmd: {
    conv: Pick<Thread, "id" | "tenant_id" | "phone_e164" | "paused_until">;
}): Promise<{
    state: "open";
    decision_id: string;
}>;

declare const MAX_SNOOZE_MS: number;
declare const NEEDS_UNTIL = "snooze needs a future `until` timestamp.";
type SnoozePorts = Pick<ThreadPorts, "pauseBot" | "snooze" | "record" | "now">;
interface SnoozeResult {
    state: "snoozed";
    snooze_until: string;
    decision_id: string;
}
/** Snooze: hide from the queue until a wake time. The receptionist stays active. */
declare function snooze(ports: SnoozePorts, cmd: {
    conv: Pick<Thread, "id" | "tenant_id" | "paused_until" | "phone_e164">;
    until: string | undefined;
}): Promise<SnoozeResult>;

type WakePorts = Pick<ThreadPorts, "wake" | "record">;
/**
 * Wake now: end a snooze early and put the thread back exactly as it was.
 * Waking touches only the snooze — whatever the thread was (escalated, taken
 * over, open) is what it goes back to being; that state was never thrown
 * away when it was hidden.
 */
declare function wake(ports: WakePorts, cmd: {
    conv: Pick<Thread, "id" | "tenant_id" | "state">;
}): Promise<{
    state: "open";
    decision_id: string;
}>;

type ArchivePorts = Pick<ThreadPorts, "pauseBot" | "archive" | "record" | "resolveEscalation">;
/** Archive: close the thread (a state, never a deletion — P3). A later inbound reopens it. */
declare function archive(ports: ArchivePorts, cmd: {
    conv: Pick<Thread, "id" | "tenant_id" | "paused_until" | "phone_e164">;
}): Promise<{
    state: "archived";
    decision_id: string;
}>;

type ResolveResult = {
    state: "resolved";
    already: true;
} | {
    state: "resolved";
    decision_id: string;
};
/** Explicit resolve — "no change was needed" is also an answer (§4). */
declare function resolveEscalation(ports: EscalationPorts, cmd: {
    esc: {
        id: string;
        tenant_id: string;
        state: string;
    };
}): Promise<ResolveResult>;

/** The honest undo (§6): inside the grace window a queued send cancels cleanly; after fire it is out, and this says so. */
declare function cancelSend(ports: CancelSendPorts, cmd: {
    msg: {
        id: string;
        tenant_id: string;
        status: string;
    };
}): Promise<{
    status: "canceled";
    decision_id: string;
}>;

/** The cancelable window IS the undo (§6): a queued reply waits this long before the job sends it. */
declare const SEND_GRACE_MS: number;
/**
 * How long a stored reply receipt is replayed instead of sending again. The
 * key identifies the message, not the attempt, so this window is the ONLY
 * thing separating "a retry of the send that just timed out" from "the
 * operator meant to say that again". A retry arrives in seconds; repeating
 * the same words inside thirty seconds on purpose is implausible, and the
 * cost of getting it wrong is asymmetric: a swallowed send reports success
 * while the customer receives nothing.
 */
declare const IDEMPOTENCY_WINDOW_MS: number;
interface ReplyBody {
    text?: string;
    template?: {
        name: string;
        language: string;
        params?: string[];
    };
    /**
     * Email only: the address the operator was shown and agreed to, when the
     * address on the person's page is not the one they last wrote from. Agreed by
     * value, so an address that changed again in between is asked about again.
     */
    email_to?: string;
}
/** `decision_id` is the ledger row, for an undo to name; absent on a receipt stored before it was kept. */
interface ReplyReceipt {
    message_id: string;
    status: string;
    cancelable_until: string;
    window_open: boolean;
    withdrawn_drafts: number;
    decision_id?: string;
}
interface ReplyThread extends Pick<Thread, "id" | "tenant_id" | "phone_e164"> {
    contact_id: string | null;
    last_wa_inbound_at: string | null;
    consent: string | null;
    dnc: boolean | null;
    marketing_consent: string | null;
    /** The names on file, for a template that opens with their first name. */
    display_name?: string | null;
    wa_profile_name?: string | null;
    /** The address on the person's page, and whether it has stopped being sent to (00125, 00126). */
    email?: string | null;
    email_suppressed_at?: string | null;
}
interface QueuedReply {
    tenant_id: string;
    conversation_id: string;
    contact_id: string | null;
    channel: "whatsapp" | "sms" | "email";
    sent_by: string;
    type: "template" | "text";
    body: string;
    template_name: string | null;
    template_vars: Json | null;
    content_hash: string;
    /** An email's row is born with its id and its frozen request: the request is tagged with the id and sent under it. */
    id?: string;
    meta?: Json;
}
/** An address never travels in a field the send path reads as a phone number: an email's is `to_email`. */
type SendPayload = {
    message_id: string;
    conversation_id: string;
} & ({
    to_phone: string;
} | {
    to_email: string;
}) & ({
    body: string;
} | {
    template: {
        name: string;
        language: string;
        params: string[];
    };
});
/** The email a reply answers, as the thread stores it. */
interface EmailParentFacts {
    /** The stored message. */
    messageId: string;
    /** The address it came from, as its header spelled it. */
    from: string | null;
    /** Its own Message-ID and the chain it carried, for threading in the customer's mail client. */
    rfcMessageId: string | null;
    references: string[];
    subject: string | null;
}
/**
 * Email's half of a reply. The verb decides who it goes to and whether a
 * person must agree first; what it leaves AS is the adapter's, which knows the
 * workspace's mailbox and the deployment's mail domain (channels
 * buildEmailRequest, the one constructor of a request).
 */
interface EmailReplyPorts {
    /** The person's latest email on this thread; null when it holds none. Read inside this workspace and this conversation only. */
    parent(conv: {
        id: string;
        tenant_id: string;
    }): Promise<EmailParentFacts | null>;
    /** The request this reply leaves as, frozen, and the subject it carries; null when the workspace has no mailbox to send from. */
    freeze(input: {
        tenantId: string;
        messageId: string;
        to: string;
        parent: EmailParentFacts;
        body: string;
    }): Promise<{
        request: Json;
        subject: string;
    } | null>;
    /** The row's id before the row exists. */
    newId(): string;
}
interface ReplyPorts extends Pick<ThreadPorts, "pauseMs" | "pauseBot" | "withdrawDrafts" | "record" | "resolveEscalation" | "now"> {
    /** Where the person last wrote: a text and an email have no 24-hour window and no templates. */
    replyChannel(conv: {
        id: string;
        tenant_id: string;
    }): Promise<"whatsapp" | "sms" | "email">;
    email: EmailReplyPorts;
    /** The receipt stored under this caller's key, with when and for which intent it was stored. */
    priorReceipt(tenantId: string, key: string): Promise<{
        response: ReplyReceipt;
        created_at: string;
        request_hash: string | null;
    } | null>;
    /** The workspace's template by name and language, as Meta last told us about it; `variables` is one entry per slot, when the sync has filled it. */
    template(tenantId: string, name: string, language: string): Promise<{
        name: string;
        language: string;
        body_preview: string | null;
        meta_status: string | null;
        category: string | null;
        variables?: unknown;
    } | null>;
    /** The facts a template's params come from, when the workspace has them. */
    templateFacts(tenantId: string): Promise<{
        business_name: string;
        booking_link: string;
    } | null>;
    /** needs_human, paused until, snooze cleared, claimed by the user, and the thread touched now. True iff a row changed. */
    claimForReply(conversationId: string, untilIso: string, userId: string, nowIso: string): Promise<boolean>;
    /** The operator's words as a queued outbound row; its id. */
    queue(row: QueuedReply): Promise<string>;
    /** The send job, due after the grace window; throws when it could not be scheduled. */
    schedule(tenantId: string, dueAt: Date, payload: SendPayload): Promise<void>;
    /** A queued row with no job to send it, canceled so it never sits "Sending…" forever. */
    cancelOrphan(messageId: string): Promise<void>;
    /** The receipt kept under the key for the replay window; a failure is logged there, never fatal. */
    storeReceipt(tenantId: string, key: string, requestHash: string, response: ReplyReceipt): Promise<void>;
    /** A stable digest of a string, for the intent and the content. */
    hash(s: string): string;
}
interface ReplyCommand {
    conv: ReplyThread;
    userId: string;
    body: ReplyBody;
    idempotencyKey: string | null;
}
/**
 * Human reply (§4/§6): honest by API shape. Inside the 24h window → freeform;
 * outside → approved template only. The send is NEVER synchronous: the row
 * sits status='queued' through a cancel window (the honest undo), then the
 * outbound_send job fires it. A dashboard reply implicitly pauses the
 * receptionist (D10).
 */
declare function replyToConversation(ports: ReplyPorts, cmd: ReplyCommand): Promise<ReplyReceipt>;

/**
 * The send path's view of the world: what the four job verbs need, named for
 * what each means. The adapter that knows the tables and the runtime's
 * services is packages/jobs/src/handlers.ts.
 */

/** The door, handed in: a verb never builds it, so a test can answer whatever the case needs. */
type Door = (d: Delivery) => Promise<Delivered>;
interface SendQueuedPorts {
    /**
     * The row as it stands, or null when it is gone. Throws when it cannot be
     * read: a read that FAILED and a message that is genuinely gone are
     * different facts, and collapsing them is how a reply once vanished.
     */
    queued(messageId: string): Promise<{
        status: string;
        body: string | null;
        channel: string | null;
        sender: string | null; /** The frozen request, on an email's row. */
        email?: Delivery["email"] | null;
    } | null>;
    /** Which yes this send needs: the template's category as Meta has it, read now; unreadable throws. */
    purposeOf(template: {
        name: string;
        language: string;
    } | undefined): Promise<SendPurpose>;
    deliver: Door;
    /** The thread flagged for a person, with why. */
    escalate(conversationId: string, reason: string, details: string): Promise<unknown>;
    alert(subject: string, body: string): Promise<void>;
    /** The platform's own pager, for a provider refusing every send on a wire. */
    page?(key: string, subject: string, body: string): Promise<unknown>;
}
interface EraseThreadPorts {
    /** One stored Blob thread gone. False when it is still there. */
    eraseThread(namespace: string, threadId: string): Promise<boolean>;
    /** Every job row for this contact, or this one job, carries the scrubbed payload from now on. */
    scrub(tenantId: string, by: {
        contactId: string;
    } | {
        jobId: string;
    }, scrubbed: Json): Promise<void>;
    /** The same ledger as the owner's own erase decision, and the event. */
    recordErased(tenantId: string, contactId: string, threads: number, jobId: string): Promise<void>;
}
interface ProvisionLinePorts {
    /** The saga, or its resumption: the edge's, because the provider and the credentials live there. Absent in a runtime that holds none. */
    provision?(lineId: string, by: "owner" | "support" | "sweep"): Promise<{
        ok: boolean;
        step?: string;
        error?: string;
    }>;
}
interface BroadcastRow {
    id: string;
    state: string;
    name: string;
    template_name: string;
    template_language: string;
    params: unknown;
    recipient_count: number | null;
    playbook_id: string | null;
    audience: unknown;
}
interface RecipientRow {
    contact_id: string;
    facts: unknown;
}
interface ContactRow {
    id: string;
    phone_e164: string | null;
    erased_at: string | null;
    display_name: string | null;
    wa_profile_name: string | null;
}
type RecipientMark = {
    state: "sent" | "skipped" | "failed";
    reason?: string | null;
    message_id?: string | null;
    sent_at?: string | null;
};
interface BroadcastBatchPorts {
    /** The broadcast, or null when it is gone; throws when it cannot be read. */
    broadcast(id: string): Promise<BroadcastRow | null>;
    workspacePaused(): Promise<boolean>;
    fail(id: string, failure: string): Promise<void>;
    /** scheduled → sending, only while scheduled. True iff the row changed: false is a cancel that landed first. */
    startSending(id: string): Promise<boolean>;
    /** The template as Meta has it: its status, its words, its category. Null when gone; throws when it cannot be read. */
    template(name: string, language: string): Promise<{
        meta_status: string | null;
        body_preview: string | null;
        category: string | null;
    } | null>;
    /** The workspace's own words for the slots that name it. */
    facts(): Promise<{
        businessName: string;
        bookingLink: string | null;
    }>;
    /** Up to `limit` people still queued; throws when it cannot be read. */
    batch(id: string, limit: number): Promise<RecipientRow[]>;
    /** The people on the batch by id, one read for all of them; a row that is gone is absent. Throws when it cannot be read. */
    contacts(contactIds: string[]): Promise<Map<string, ContactRow>>;
    /** The thread this send belongs to, never created here. */
    target(phoneE164: string): Promise<{
        conversationId: string;
    } | null>;
    /**
     * The messages this broadcast already sent these people, if a run died
     * between the wire and its own bookkeeping: contact id → the message's id
     * and when it left, one read for the batch. A resumed batch reads them
     * rather than sending twice, and records the time each message actually
     * went out rather than the time it noticed — the broadcast's own page
     * orders its recipients by that column. A read that fails THROWS: "could
     * not check" read as "never sent" is exactly the second send this exists
     * to stop.
     */
    alreadySent(id: string, contactIds: string[]): Promise<Map<string, {
        id: string;
        sentAt: string | null;
    }>>;
    mark(id: string, contactId: string, patch: RecipientMark): Promise<void>;
    deliver: Door;
    /** How many are still queued; throws when it cannot be counted. */
    remaining(id: string): Promise<number>;
    /** The broadcast's state now; null when gone. Throws when it cannot be read: an unreadable state is not a cancel. */
    state(id: string): Promise<string | null>;
    /** The next batch, as this tenant, through the same door the dashboard uses; now unless told when. */
    scheduleNext(id: string, dueAt?: Date): Promise<void>;
    /** Who got it and who was held, once nobody is queued. */
    tally(id: string): Promise<{
        sent: number;
        held: number;
    }>;
    /** sending → sent, and the event with the tally. */
    finish(id: string, tally: {
        sent: number;
        held: number;
    }): Promise<void>;
    alert(subject: string, body: string): Promise<void>;
    now(): number;
    sleep(ms: number): Promise<void>;
}
interface BroadcastBatchCommand {
    tenantId: string;
    broadcastId: string;
    deadline: number;
}

interface SendQueuedCommand {
    tenantId: string;
    /** `to_phone` on a phone's wire, `to_email` on email's: an address never travels in a field read as a number. */
    payload: {
        message_id: string;
        conversation_id: string;
        to_phone?: string;
        to_email?: string;
        body?: string;
        template?: {
            name: string;
            language: string;
            params: string[];
        };
    };
}
/**
 * outbound_send: the honest undo — the message sat status='queued' through
 * its cancel window; if it is STILL queued, send it through the door and
 * finalize. The door re-reads the person's consent with this message's
 * purpose, the thread's pause and the workspace's status at the wire; what is
 * here is the outbox's own business: whether the row is still there to send,
 * which yes its template needs, and who is told when the wire could not
 * carry it.
 */
declare function sendQueued(ports: SendQueuedPorts, cmd: SendQueuedCommand): Promise<void>;

interface EraseThreadCommand {
    tenantId: string;
    jobId: string;
    payload: {
        contact_id?: string;
        namespace?: string;
        thread_ids?: unknown;
        scrubbed?: boolean;
    };
}
/**
 * blob_thread_erase: the copy Postgres cannot reach. The Vercel Blob thread
 * holds the verbatim conversation outside RLS and outside the database, so
 * deleting the rows is not deleting the data. The dashboard queues this job
 * BEFORE it destroys anything, so a crash mid-erasure leaves a retryable
 * request rather than an orphaned transcript whose key nobody can reconstruct.
 */
declare function eraseBlobThread(ports: EraseThreadPorts, cmd: EraseThreadCommand): Promise<void>;

/**
 * line_provision: a line's provisioning, on the ledger (00109). The durable
 * part is the ledger's — claimed under a lease, resumed by the heartbeat when
 * a worker dies, tried up to its ceiling and then given up loudly — and the
 * saga is the edge's, reading its own receipts so a second run repeats
 * nothing. A saga that stopped fails the job with the step it stopped at, so
 * the next try resumes there.
 */
declare function provisionLine(ports: ProvisionLinePorts, cmd: {
    payload: Record<string, unknown>;
}): Promise<void>;

/**
 * email_ingest: one received email, taken in (00127).
 *
 * The webhook that announced it was a pointer. This fetches the email, decides
 * what it CLAIMS to be, keeps it, and asks a person to read it. It never
 * answers: until the receptionist drafts email replies, every email from a
 * person is a person's to answer, and the day it does draft, it drafts only
 * for mail whose sender could be verified. A claim decides how LITTLE is done
 * (an automatic reply is kept and never flagged; a delivery report is not a
 * conversation at all), never how much.
 *
 * It resumes. The replay gate is the provider's id for the delivery, so a run
 * that died after the message was stored finds it on the next try and carries
 * on from there; it stops early only when the row says it was handled. (The
 * WhatsApp road skips a message it has seen, on purpose: there a missed reply
 * beats a double text. Here nothing is sent, so nothing can be sent twice, and
 * a lost customer email is the worse outcome.)
 */
/** What an email claims to be, from headers anyone can write (the adapter decides it: channels classifyReceived). */
type EmailClaim = "report" | "auto_reply" | "automated" | "person";
/**
 * One received email as this verb needs it: the provider's shape and the
 * parsing of headers and HTML are the adapter's (packages/jobs, over
 * packages/channels); what arrives here is already words and ids.
 */
interface IncomingEmail {
    /** The provider's id for this delivery: the replay gate. */
    id: string;
    from: {
        address: string;
        name: string | null;
    } | null;
    to: string[];
    cc: string[];
    subject: string | null;
    /** The words, as plain text; null when the email had none. */
    text: string | null;
    /** Its own Message-ID, its parent's, and the chain it carried: written by the sender, used for threading and never as a key. */
    messageId: string | null;
    inReplyTo: string | null;
    references: string[];
    receivedAt: string | null;
    claim: EmailClaim;
    attachments: Array<{
        filename: string | null;
        contentType: string | null;
        size: number | null;
    }>;
}
interface EmailIngestPorts {
    /** The mailbox the delivery named, or null when it is gone. */
    mailbox(id: string): Promise<{
        id: string;
        tenant_id: string;
        address: string;
    } | null>;
    /** The email, by the provider's id; null when the provider no longer has it. Throws when it cannot be asked. */
    fetch(receivedId: string): Promise<IncomingEmail | null>;
    /**
     * Does this email belong to an erasure? True when the address left a digest (00125) AND the email was received
     * before the person asked to be forgotten: taking it in late would make them again from data they asked us to
     * drop. An email received AFTER the request is the person coming back, and is a new conversation (edge erased.ts).
     */
    erasedBefore(tenantId: string, address: string, receivedAtIso: string): Promise<boolean>;
    /** Our own email, coming back: a forward loop, or a copy. */
    ours(tenantId: string, rfcMessageId: string): Promise<boolean>;
    record(p: {
        tenantId: string;
        address: string;
        receivedId: string;
        body: string | null;
        channelTs: string | null;
        meta: Json;
    }): Promise<{
        message_id: string;
        conversation_id: string;
        is_new: boolean;
        processed: boolean;
    }>;
    /** Flag the thread for a person: a new hold, a refresh of the one already open, or a write that did not land. */
    escalate(tenantId: string, conversationId: string, reason: "email_review", details: string): Promise<"opened" | "refreshed" | "failed">;
    /** Tell the workspace's people, once per hold: the bell, and the mail their alerts go to. Never throws. */
    tell(tenantId: string, note: {
        conversationId: string;
        from: string;
        fromName: string | null;
        subject: string | null;
        preview: string | null;
        claim: EmailClaim;
    }): Promise<void>;
    markProcessed(tenantId: string, messageId: string): Promise<void>;
    received(mailboxId: string, at: string): Promise<void>;
    now(): number;
}
type EmailIngestOutcome = "kept_for_a_person" | "kept_quietly" | "already_handled" | "not_a_conversation" | "our_own" | "erased_person" | "no_sender" | "gone";
/** As much of one email's words as a thread keeps. The original stays with the provider; this is what a person reads and, one day, a model. */
declare const EMAIL_BODY_MAX = 20000;
/** What the person who opens the thread is told, by what the email claimed to be. */
declare const EMAIL_REVIEW_WORDS: Record<Extract<EmailClaim, "person" | "automated">, string>;
declare function ingestEmail(ports: EmailIngestPorts, cmd: {
    payload: Record<string, unknown>;
}): Promise<EmailIngestOutcome>;

/**
 * How long a batch that reached nobody waits before it is tried again. The
 * rest of a run is scheduled the moment a batch ends; a batch in which every
 * read failed would otherwise schedule itself again at once, and a read that
 * keeps failing would spin the ledger until somebody canceled by hand.
 */
declare const BROADCAST_STALL_RETRY_MS = 60000;
/**
 * broadcast_send: one batch of a broadcast, then the next.
 *
 * The route enrolled the recipients; this sends to up to BROADCAST_CHUNK of
 * them, re-checking each person at the wire — the one place a miss is
 * unrecoverable — and records why anyone was held back. Then it schedules
 * itself again for the rest, or closes the broadcast and tells the
 * workspace. A canceled broadcast stops at the next batch; a template that
 * is no longer approved fails it before a single send; a wire that is down
 * fails it at the first person it cannot reach.
 */
declare function sendBroadcastBatch(ports: BroadcastBatchPorts, cmd: BroadcastBatchCommand): Promise<void>;

/**
 * The campaigns' view of the world: what a run's assembly, a playbook's run
 * and a person's broadcast need, named for what each means. The adapters
 * that know the tables are apps/edge/lib/playbooks.ts (the run, hourly or at
 * a person's request) and apps/dashboard/src/server/campaign-ports.ts (a
 * person's broadcast, approve, cancel, the playbook's check).
 */

/** A broadcast row as it is made: the assembly writes exactly these columns. */
interface NewBroadcast {
    name: string;
    template_id: string;
    template_name: string;
    template_language: string;
    params: ParamSpec[];
    audience: Audience;
    state: "scheduled" | "pending_approval";
    scheduled_for: string;
    recipient_count: number;
    created_by: string | null;
    playbook_id?: string;
    run_for?: string;
}
/** One person on the run, with the words their row keeps for the slots (a visit run's), or none. */
interface NewRecipient {
    contact_id: string;
    facts: Record<string, string> | null;
}
interface AssemblePorts {
    /** The broadcast row, its id back; throws when it cannot be written. */
    create(row: NewBroadcast): Promise<string>;
    /** The people on it, all of them in one call (the adapter chunks); throws when they cannot be written. */
    enrol(broadcastId: string, rows: NewRecipient[]): Promise<void>;
    /** The row says why it failed. */
    fail(broadcastId: string, failure: string): Promise<void>;
    /** The send job, as this tenant, through the ledger; throws when the ledger refuses. */
    schedule(broadcastId: string, at: Date): Promise<void>;
}
interface AssembleCommand {
    broadcast: NewBroadcast;
    recipients: NewRecipient[];
    sendAt: Date | null;
}
type Assembled = {
    ok: true;
    id: string;
} | {
    ok: false;
    failure: "run_not_created" | "recipients_write_failed" | "schedule_failed";
    error: string;
};
/** The playbook as its row reads. A run names only what it uses. */
interface PlaybookRow {
    id: string;
    tenant_id: string;
    name: string;
    trigger: string;
    template_id: string;
    template_name: string;
    template_language: string;
    params: unknown;
    policy_class: string;
    state: string;
    run_hour: number;
    cap_per_run: number;
    gap_days: number;
    cadence_days: number;
    created_by: string | null;
    last_run_for: string | null;
}
/** The workspace as the run reads it once per tenant: the people, the modes, the number, the touches, the calendar. */
interface RunContext {
    tz: string;
    now: Date;
    people: PersonRowVM[];
    modes: Map<string, string>;
    health: NumberHealth;
    /** When each person last heard from each playbook, and from any; contact id → ms. */
    touches: {
        byThis: Map<string, Map<string, number>>;
        byAny: Map<string, number>;
    };
    /** The workspace's calendar: a visit playbook runs only when it is "ok". */
    calendar: "ok" | "unavailable" | "none";
    /** Each person's next and last visit from that calendar, for the words a visit run keeps. */
    visits: Map<string, PersonVisitsDto>;
}
/** Who asked: the sweep (system) or a person (their decision, sends now unless the class is never). */
type RunBy = {
    kind: "system";
} | {
    kind: "user";
    userId: string;
};
type RunOutcome = 
/** Sent: when it really goes, and the moment asked for when the hours moved it to nine (else null). */
{
    outcome: "sent";
    broadcast_id: string;
    eligible: number;
    mode: string;
    state: string;
    scheduled_for: string;
    moved_from: string | null;
} | {
    outcome: "held";
    broadcast_id: string;
    eligible: number;
    mode: string;
    state: string;
} | {
    outcome: "empty";
    eligible: 0;
    mode: string;
} | {
    outcome: "off";
    mode: string;
    skipped: "never" | "template_not_approved" | "number_flagged" | "already_ran_today" | "no_calendar";
} | {
    outcome: "failed";
    error: string;
};
interface RunPlaybookPorts extends AssemblePorts {
    /** The template as Meta has it now, by name and language; null when gone. Throws when it cannot be read: unreadable is not withdrawn. */
    template(name: string, language: string): Promise<{
        meta_status: string | null;
    } | null>;
    /** Whether a run for this local day was already made (the unique index's fact, read first). */
    alreadyRan(playbookId: string, runFor: string): Promise<boolean>;
    /** The run recorded: the event, and the playbook's last run. Never throws. */
    record(playbookId: string, runFor: string, at: Date, data: Record<string, unknown>): Promise<void>;
    /** The ledger: whose decision the send was. */
    decide(d: {
        broadcastId: string;
        by: RunBy;
        payload: Record<string, unknown>;
    }): Promise<void>;
    /** The owner told that a run waits for them. */
    notify(subject: string, body: string): Promise<void>;
}
interface RunPlaybookCommand {
    playbook: PlaybookRow;
    ctx: RunContext;
    /** The local day the run is for; one run per playbook per day. Read from the clock when absent. */
    runFor?: string;
    by: RunBy;
}
/** The template as Meta holds it, read by id in this workspace. */
interface TemplateRow {
    id: string;
    name: string;
    language: string;
    meta_status: string | null;
    category: string | null;
    variables: unknown;
    title: string | null;
}
interface TemplateValuesPorts {
    /** Null when there is no such template here; throws when it cannot be read. */
    template(id: string): Promise<TemplateRow | null>;
    /** The booking link on file, or null. */
    bookingLink(): Promise<string | null>;
}
/** A run or broadcast as the route's scope loaded it. */
interface BroadcastRef {
    id: string;
    tenant_id: string;
    state: string;
    name: string;
    recipient_count: number | null;
    playbook_id: string | null;
    run_for?: string | null;
}
interface CreateBroadcastPorts extends AssemblePorts, TemplateValuesPorts {
    /** The business's clock, for the hours a send may go out in. */
    timezone(): Promise<string>;
    /** Everyone, with their visits as of now, the way the People page counts them. */
    people(now: Date): Promise<PersonRowVM[]>;
    /** A list kept by hand: its name and who is on it; null when there is no such list here. */
    savedList(id: string): Promise<{
        name: string;
        memberIds: string[];
    } | null>;
    /** The active WhatsApp number's health as Meta rated it; null when none is connected. */
    number(): Promise<NumberHealth | null>;
    record(subject: DecisionSubject, id: string, verb: DecisionVerb, payload: Json): Promise<string>;
}
interface CreateBroadcastCommand {
    userId: string;
    body: unknown;
    now: Date;
}
interface ApproveRunPorts {
    /** The business's clock, for the hours a send may go out in. */
    timezone(): Promise<string>;
    /** pending_approval → scheduled for `at`, only while pending. True iff a row changed. The row carries the time the job carries (00119). */
    release(broadcastId: string, at: Date): Promise<boolean>;
    /** Back to waiting, when the job could not be made. */
    hold(broadcastId: string): Promise<void>;
    schedule(broadcastId: string, at: Date): Promise<void>;
    record(subject: DecisionSubject, id: string, verb: DecisionVerb, payload: Json): Promise<string>;
}
interface CancelBroadcastPorts {
    /** The scheduled send withdrawn from the ledger; how many jobs. */
    withdraw(broadcastId: string): Promise<number>;
    /** → canceled, only from the state the row was read in. True iff a row changed. */
    cancel(broadcastId: string, fromState: string): Promise<boolean>;
    record(subject: DecisionSubject, id: string, verb: DecisionVerb, payload: Json): Promise<string>;
}

/**
 * A run's assembly, the one implementation: the broadcast row, then the
 * people on it, then the send job when the plan sends now or later. A stage
 * that fails names itself on the row, so a failed run reads why on the page
 * rather than as a row with no reason; nothing is scheduled for a row whose
 * people could not be written, and no job exists for a row the ledger
 * refused. The caller decides what a failure means to whoever asked: the
 * sweep counts it, a person is told.
 */
declare function assembleRun(ports: AssemblePorts, cmd: AssembleCommand): Promise<Assembled>;

/**
 * One playbook's run, the one implementation.
 *
 * The hourly sweep runs every playbook whose hour it is; "Run now" on the
 * page runs one at a person's request. Both come here. A run is a broadcast
 * for the people who became eligible since the last run — the trigger's
 * list crossed with who said yes, minus anyone who heard from this playbook
 * within its gap, minus anyone who heard from any playbook this week, the
 * longest-unheard first, at most the cap. What the run then does is the
 * class's autonomy mode: auto schedules the send now, veto schedules it half
 * an hour ahead with a Stop, ask leaves it waiting for a person, never does
 * nothing. A person who asks for a run now has decided: it sends now, unless
 * the class is set to never. Never at 3 AM, whoever asks: a send that would
 * go out past the hours a run keeps on its own (a "Run now" at eleven at
 * night, a veto window ending past twenty) goes at nine, and the ledger says
 * what was asked for. Every run is recorded as an event, a run that found
 * nobody included. A run never throws: the sweep behind it must go on.
 */
declare function runPlaybook(ports: RunPlaybookPorts, cmd: RunPlaybookCommand): Promise<RunOutcome>;

/**
 * The template as Meta holds it and the values as Meta will accept them:
 * what a broadcast and a playbook both name, judged once. Approved; as many
 * values as the template takes; each typed text once or a value the job
 * fills per person; a booking-link slot needs a link on file. Every refusal
 * is a sentence for the person composing.
 */
declare function templateValues(ports: TemplateValuesPorts, cmd: {
    templateId: string;
    params: unknown;
    visits: boolean;
}): Promise<{
    template: TemplateRow;
    specs: ParamSpec[];
}>;

interface BroadcastReceipt {
    id: string;
    name: string;
    state: "scheduled";
    recipient_count: number;
    scheduled_for: string;
    /** The time asked for (or "now") when it fell outside the hours a send may go out in, and was moved. */
    moved_from: string | null;
    decision_id: string;
}
/**
 * A person's broadcast: one approved template to the people who said yes.
 *
 * { template_id, params, audience: { kind, id }, scheduled_for?, name? }.
 * The template must be approved by WhatsApp; the values must be ones Meta
 * accepts; the audience is one of People's lists, a list kept by hand, or
 * everyone — crossed with who said yes and has a number, for the yes this
 * template's category needs. The recipients are enrolled now, so the owner
 * sees who and how many; the job re-checks each person at the wire. The
 * ledger records the decision to send. The body is judged here, in
 * sentences for the person composing: the values are judged against the
 * template Meta holds, which no schema knows.
 */
declare function createBroadcast(ports: CreateBroadcastPorts, cmd: CreateBroadcastCommand): Promise<BroadcastReceipt>;

interface ApproveReceipt {
    id: string;
    state: "scheduled";
    recipient_count: number | null;
    scheduled_for: string;
    moved_from: string | null;
    decision_id: string;
}
/**
 * A run that was waiting for a person goes out now.
 *
 * Under the ask mode a playbook's run is made as pending_approval: the
 * recipients are enrolled, nothing is scheduled. Approving schedules the
 * send now and records the decision as the approver's; skipping is the
 * cancel. A job the ledger refused leaves the run waiting, as it was.
 */
declare function approveRun(ports: ApproveRunPorts, cmd: {
    row: BroadcastRef;
    now: Date;
}): Promise<ApproveReceipt>;

interface CancelReceipt {
    id: string;
    state: "canceled";
    was: string;
    decision_id: string;
}
/**
 * Stop a broadcast that has not finished.
 *
 * Scheduled: the job is withdrawn and nothing is sent. Sending: the job
 * stops at its next batch — the messages already on their way are on their
 * way, and the row says how many. Waiting for approval (a playbook's run
 * under the ask mode): skipped, nothing was ever scheduled. Anything else
 * has already ended and says so. The ledger records the decision.
 */
declare function cancelBroadcast(ports: CancelBroadcastPorts, cmd: {
    row: Pick<BroadcastRef, "id" | "state" | "name">;
}): Promise<CancelReceipt>;

/** Everything a playbook names, checked. */
interface PlaybookInput {
    name: string;
    trigger: PlaybookTrigger;
    template_id: string;
    template_name: string;
    template_language: string;
    params: ParamSpec[];
    policy_class: PlaybookPolicyClass;
    run_hour: number;
    cap_per_run: number;
    gap_days: number;
    cadence_days: number;
}
/**
 * Everything a playbook names, checked the way a broadcast is: the trigger,
 * then the template and its values through the one judgement, then the
 * whole numbers. A playbook can never name a template a broadcast could not
 * send or a slot the workspace cannot fill.
 */
declare function checkPlaybook(ports: TemplateValuesPorts, body: Record<string, unknown> | null): Promise<PlaybookInput>;

export { type ApproveReceipt, type ApproveRunPorts, type ArchivePorts, type AssembleCommand, type AssemblePorts, type Assembled, BROADCAST_STALL_RETRY_MS, type BroadcastBatchCommand, type BroadcastBatchPorts, type BroadcastReceipt, type BroadcastRef, type BroadcastRow, type CancelBroadcastPorts, type CancelReceipt, type CancelSendPorts, type Channel, type ContactRow, type CreateBroadcastCommand, type CreateBroadcastPorts, type Db, type DeliverPorts, type Delivered, type Delivery, type DeliveryRefusal, type Door, EMAIL_BODY_MAX, EMAIL_REVIEW_WORDS, type EmailClaim, type EmailIngestOutcome, type EmailIngestPorts, type EmailParentFacts, type EmailReplyPorts, type EraseThreadCommand, type EraseThreadPorts, type EscalationPorts, type HandBackPorts, IDEMPOTENCY_WINDOW_MS, type IncomingEmail, MAX_SNOOZE_MS, NEEDS_UNTIL, type NewBroadcast, type NewRecipient, type PlaybookInput, type PlaybookRow, type ProvisionLinePorts, type QueuedReply, type RecipientMark, type RecipientRow, type ReplyBody, type ReplyCommand, type ReplyPorts, type ReplyReceipt, type ReplyThread, type ResolveResult, type RunBy, type RunContext, type RunOutcome, type RunPlaybookCommand, type RunPlaybookPorts, SEND_GRACE_MS, type SendKind, type SendPayload, type SendQueuedCommand, type SendQueuedPorts, type Sender, type SnoozePorts, type SnoozeResult, type TakeOverPorts, type TakeOverResult, type TemplateRow, type TemplateSend, type TemplateValuesPorts, type Thread, type ThreadPorts, type WakePorts, type Wire, type WirePayload, approveRun, archive, assembleRun, cancelBroadcast, cancelSend, checkPlaybook, createBroadcast, deliver, deliverSafely, emailSender, eraseBlobThread, handBack, ingestEmail, provisionLine, replyToConversation, resolveEscalation, runPlaybook, sendBroadcastBatch, sendQueued, snooze, takeOver, templatePurpose, templateValues, wake, whatsappSender };
