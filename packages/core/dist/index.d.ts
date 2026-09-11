import { SupabaseClient } from '@supabase/supabase-js';
import { SendResult, WaConfig } from '@chanlytics/channels';
import { SendPurpose, DecisionSubject, DecisionVerb } from '@chanlytics/contracts';
import { Database, Json } from '@chanlytics/db';

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
type Channel = "whatsapp" | "sms";
interface TemplateSend {
    name: string;
    language: string;
    params: string[];
}
interface WirePayload {
    body: string;
    template?: TemplateSend;
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
interface Delivery {
    tenantId: string;
    conversationId: string;
    contactId: string | null;
    /** E.164, with or without the "+"; each wire shapes it. */
    to: string;
    channel: Channel;
    sender: "ai" | "human" | "system";
    purpose: SendPurpose;
    /** True when this send starts a conversation rather than answering one. */
    proactive: boolean;
    body: string;
    template?: TemplateSend;
    /**
     * An outbox row already written as `queued` (the honest undo): finalized
     * in place rather than inserted, and only while it is still queued, so a
     * cancel that wins the row is never overwritten.
     */
    messageId?: string | null;
    /** Recorded on a row this call writes. */
    meta?: Record<string, Json>;
}
/** Why the door stayed shut. Each is a fact about the person, the thread or the workspace, never about us. */
type DeliveryRefusal = "opted_out" | "not_opted_in" | "no_marketing_consent" | "erased" | "paused" | "human_has_it" | "superseded_by_human";
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
    conv: Pick<Thread, "id" | "tenant_id" | "phone_e164">;
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
}
interface ReplyReceipt {
    message_id: string;
    status: string;
    cancelable_until: string;
    window_open: boolean;
    withdrawn_drafts: number;
}
interface ReplyThread extends Pick<Thread, "id" | "tenant_id" | "phone_e164"> {
    contact_id: string | null;
    last_wa_inbound_at: string | null;
    consent: string | null;
    dnc: boolean | null;
    marketing_consent: string | null;
}
interface QueuedReply {
    tenant_id: string;
    conversation_id: string;
    contact_id: string | null;
    channel: "whatsapp" | "sms";
    sent_by: string;
    type: "template" | "text";
    body: string;
    template_name: string | null;
    template_vars: Json | null;
    content_hash: string;
}
type SendPayload = {
    message_id: string;
    conversation_id: string;
    to_phone: string;
} & ({
    body: string;
} | {
    template: {
        name: string;
        language: string;
        params: string[];
    };
});
interface ReplyPorts extends Pick<ThreadPorts, "pauseMs" | "pauseBot" | "withdrawDrafts" | "record" | "resolveEscalation" | "now"> {
    /** Where the person last wrote: a text has no 24-hour window and no templates. */
    replyChannel(conv: {
        id: string;
        tenant_id: string;
    }): Promise<"whatsapp" | "sms">;
    /** The receipt stored under this caller's key, with when and for which intent it was stored. */
    priorReceipt(tenantId: string, key: string): Promise<{
        response: ReplyReceipt;
        created_at: string;
        request_hash: string | null;
    } | null>;
    /** The workspace's template by name and language, as Meta last told us about it. */
    template(tenantId: string, name: string, language: string): Promise<{
        name: string;
        language: string;
        body_preview: string | null;
        meta_status: string | null;
        category: string | null;
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
        sender: string | null;
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

interface SendQueuedCommand {
    tenantId: string;
    payload: {
        message_id: string;
        conversation_id: string;
        to_phone: string;
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

export { type ArchivePorts, type CancelSendPorts, type Channel, type Db, type DeliverPorts, type Delivered, type Delivery, type DeliveryRefusal, type Door, type EraseThreadCommand, type EraseThreadPorts, type EscalationPorts, type HandBackPorts, IDEMPOTENCY_WINDOW_MS, MAX_SNOOZE_MS, NEEDS_UNTIL, type ProvisionLinePorts, type QueuedReply, type ReplyBody, type ReplyCommand, type ReplyPorts, type ReplyReceipt, type ReplyThread, type ResolveResult, SEND_GRACE_MS, type SendPayload, type SendQueuedCommand, type SendQueuedPorts, type Sender, type SnoozePorts, type SnoozeResult, type TakeOverPorts, type TakeOverResult, type TemplateSend, type Thread, type ThreadPorts, type WakePorts, type Wire, type WirePayload, archive, cancelSend, deliver, deliverSafely, eraseBlobThread, handBack, provisionLine, replyToConversation, resolveEscalation, sendQueued, snooze, takeOver, templatePurpose, wake, whatsappSender };
