import { SupabaseClient } from '@supabase/supabase-js';
import { ResendConfig, EmailSendsAs, WaConfig, EmailRequest, ResendLimit, SendResult, ApifyClient, LeadJudge, NormalizedInbound, CarrierConsent } from '@chanlytics/channels';
import { SendPurpose, MessageAbout, DeliveryRefusal, TenantId, DecisionSubject, DecisionVerb, ContactId, ConsentChannel, WriteRow, ChannelsReady, WriteWay, AppointmentState, EmailHold, JobNews, BookingTool, DraftWhy, ReplyIntent, Unread, ReplyClaim, ReplyReading, ReadingPlan, PurposeRefusal, PurposeBearing, AskedPurpose, AppointmentStatus, NoticeHold, ParamSpec, Audience, PersonRowVM, ListRef, NumberHealth, PersonVisitsDto, Membership, DealPaceVM, CampaignMessage, CampaignHow, PlaybookTrigger, PlaybookPolicyClass, StepHand, TimetableDomain, LeadRoundState, LeadEmailState, JudgePlaceAnswer, LeadMemberClass, LeadFit, LeadRunState, LeadRoundEnding, LeadArea, LeadRoundPurpose, LeadSearchPlan, PlaceFacts, ProbeMember, BrainMeta, NotificationsConfig, BrainConfig, CalendarConfig, FeaturesConfig, PolicyLimits, KnownFacts, Handled, BrainIntent, EventSubscriber } from '@chanlytics/contracts';
export { AppointmentStatus, DeliveryRefusal } from '@chanlytics/contracts';
import { Json, Database, MessageVersionRow, RoutedChannel, LeadContext, IngestResult, DeliveredEvent } from '@chanlytics/db';

/**
 * The wires a workspace's words leave on: WhatsApp's from its credentials, and email's bound to its own addresses.
 * deliver() decides whether a send may leave; these only put it on the provider's wire, and refuse a request that
 * would leave as somebody else.
 */

/**
 * What a read of a workspace's credentials came back as, from wherever they
 * are kept (the edge's Vault, for WhatsApp). Three answers, because two of
 * them used to be one: `present` is the pair; `absent` is a channel that
 * carries none -- not connected, refused at the door and said to the owner;
 * `unavailable` is a read that FAILED (Vault, the database) whose truth nobody
 * has. The number may well be connected, so it is neither a refusal nor "not
 * connected": a send that meets it waits (WireUnavailable) rather than fail
 * for good and send the owner to reconnect a number that works.
 */
type CredentialsRead<C> = {
    outcome: "present";
    credentials: C;
} | {
    outcome: "absent";
} | {
    outcome: "unavailable";
    error: string;
};
/**
 * A wire that could not be BOUND this run: the workspace's credentials could
 * not be read (CredentialsRead unavailable). A plain object rather than a
 * class, because the value is built on the edge and read inside core's dist
 * and jobs' bundle of it, and `instanceof` does not cross a bundle.
 */
interface WireUnavailable {
    unavailable: true;
    /** The read's own words, for the log and the pager; an owner meets them only if every wait is spent (sendQueued). */
    error: string;
}
declare const wireUnavailable: (error: string) => WireUnavailable;
declare function isWireUnavailable(w: unknown): w is WireUnavailable;
/**
 * The door could not be opened: this channel's wire could not be bound
 * (Wire's WireUnavailable). Thrown before anything is written -- a queued row
 * stays queued, no event is emitted -- as every read that fails at the door
 * throws: "we could not check" is not "not connected". A caller that speaks to
 * a person tries again later (sendQueued, sendBroadcastBatch); deliverSafely
 * says it as `wire_unreadable`. Told apart by name, not by class, for the same
 * reason WireUnavailable is an object.
 */
declare class WireUnavailableError extends Error {
    readonly channel: Channel;
    constructor(channel: Channel, error: string);
}
declare function isWireUnavailableError(e: unknown): e is WireUnavailableError;
/**
 * The provider provably did not take the words (the send's outcome `retryable`, channels provider-fetch: its "not
 * now", a connection that never opened, its breaker open), for a delivery that asked to be held rather than failed
 * (Delivery.holdIfNotTaken). Thrown before anything is written, as WireUnavailableError is, so a queued row stays
 * queued for its caller's next try (sendQueued); told apart by name for the same reason.
 */
declare class NotTakenError extends Error {
    readonly channel: Channel;
    readonly status: number;
    readonly errorBody: string | null;
    constructor(channel: Channel, sent: {
        status: number;
        errorBody?: string;
    });
}
declare function isNotTakenError(e: unknown): e is NotTakenError;
/**
 * WhatsApp's wire from a workspace's credentials. Graph wants bare digits,
 * so the "+" is stripped here rather than by a caller who should not know.
 */
declare function whatsappSender(cfg: WaConfig | null): Sender | null;
/** WhatsApp's wire from a credentials READ: the sender, none to refuse with, or a wire that could not be bound. */
declare function whatsappWire(read: CredentialsRead<WaConfig>): Sender | null | WireUnavailable;
/**
 * One address a workspace's email may leave as, and the provider account it leaves through. "hosted" is the mailbox
 * on the platform's account, for replies, visit messages and everything but the two below; "campaigns" is the same mailbox
 * on the deployment's campaigns domain (the platform's account too), for offers (and the business's own news, which is one at
 * the door: decision D2) and nothing else, so a complaint about an offer never touches the domain replies leave from; "own" is one of the workspace's own verified domains on the cold
 * account, for outreach and nothing else.
 */
interface EmailRoute {
    lane: "hosted" | "campaigns" | "own";
    cfg: ResendConfig;
    as: EmailSendsAs;
}
/**
 * Email's wire, bound to ONE workspace's addresses. It sends the frozen request
 * and nothing it assembled itself: a delivery without one, one addressed to
 * somebody other than `to`, or one that would leave as another workspace, is a
 * failure the caller hears about, never a send. The provider keys are the
 * deployment's; the routes are what make the wire this workspace's: the hosted
 * mailbox on the platform's account, and each of its own verified domains on
 * the cold account (Reach out), so a cold email never spends the reputation
 * every workspace's replies share. The route is chosen by the request's From,
 * within the send's lane: an own domain carries outreach only, so a reply
 * frozen with an own domain's From never leaves around outreach's rules, and a
 * cold email never leaves as the hosted mailbox. That route's own Reply-To rule
 * still applies. No routes, no email line (null, like a number with no
 * credentials). `held` is the addresses of the workspace's own domains that
 * are held: no route, but a reply frozen with one says why it went as the
 * mailbox.
 */
declare function emailSender(routes: EmailRoute[], held?: readonly string[]): Sender | null;

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
     * queued (channels email/request.ts). Present on the email wire and nowhere else.
     */
    email?: EmailRequest;
    /** The send's purpose, on the email wire: only outreach may take an own domain's route (emailSender). */
    purpose?: SendPurpose;
    /** A person's reply (the door's kindOf), the one other send that may leave by an own domain: by its twin below. */
    reply?: boolean;
    /**
     * A person's reply to a reach-out, frozen a second time on the own domain the chain wrote from (G15): it leaves by
     * that domain's route when the route still holds it, and as `email` on the mailbox otherwise (N5).
     */
    ownEmail?: EmailRequest;
    /**
     * The most the wire may take to answer, in ms, from the moment the send is put on it (Delivery.sendBy, worked out at the
     * wire). The email wire bounds its tries by it (channels sendEmail); absent, by its own deadline alone.
     */
    deadlineMs?: number;
    /**
     * The thread the words are for (Delivery.conversationId). A wire that holds more than one number reads which of them
     * the person last wrote to by it (the job runner's WhatsApp wire); every other ignores it.
     */
    conversationId?: string;
}
/** How to put words on one channel's wire. Owns its own address format. */
type Sender = (to: string, p: WirePayload) => Promise<SendResult>;
/**
 * The wires one workspace has. `undefined`: this runtime has no such
 * channel at all. `null`: the channel exists but this workspace holds no
 * credentials or line for it -- refused here, never guessed from the
 * environment, which is how one business's message left on another's line.
 * A WireUnavailable: the channel may well be this workspace's, but its
 * credentials could not be read just now -- nothing is sent, nothing is
 * failed, and the caller tries again later.
 */
type Wire = Partial<Record<Channel, Sender | null | WireUnavailable>>;
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
    /**
     * What the message is about (contracts MessageAbout, decision D1): theirs (a visit they booked, their proposal, the
     * call they are on, a thread they wrote in) or ours (a broadcast, a moment's news). By email, ours asks for a yes
     * covering email or a relationship on record; theirs asks no yes. Required: a sender says which.
     */
    about: MessageAbout;
    /**
     * The playbook moment a broadcast's run was made for (contracts audienceTrigger), null for any other send: only the
     * day-before reminder passes the thread's 24-hour pause (contracts passesHandoverPause, decision D4). Required, as
     * `about` is: a sender says which, so a new one cannot forget the moment and have its reminder held.
     */
    trigger: string | null;
    body: string;
    template?: TemplateSend;
    /** The frozen request, on the email wire (WirePayload.email). */
    email?: EmailRequest;
    /**
     * A person's reply to a reach-out, frozen again on the own domain the chain wrote from (WirePayload.ownEmail): it
     * may leave by that domain only as a reply (kindOf), and under the same row's id as `email`.
     */
    ownEmail?: EmailRequest;
    /**
     * The lead a cold email was written for (a reach-out's always names one): outreach's facts are that lead's, so a
     * business closed or archived is refused even when its person has another lead still being written to.
     */
    leadId?: string | null;
    /**
     * An outbox row already written as `queued` (the honest undo): finalized
     * in place rather than inserted, and only while it is still queued, so a
     * cancel that wins the row is never overwritten.
     */
    messageId?: string | null;
    /** What this send is, for the rules (SendKind). Absent, the door derives it the way it always read `sender`: see kindOf. */
    kind?: SendKind;
    /**
     * The call this send is made on, by the provider's id for it (the hold's control_ref, as the inbound door took it):
     * that call's own hold on the thread does not refuse it (deliver-hold.ts). Absent for every send not made mid-call.
     */
    onCall?: string | null;
    /** Recorded on a row this call writes. */
    meta?: Record<string, Json>;
    /**
     * A caller that will try again (sendQueued): a send the provider provably did not take (outcome `retryable`) throws
     * NotTakenError before anything is written, and the row stays queued. Without it, it fails as any refusal does.
     */
    holdIfNotTaken?: boolean;
    /**
     * Epoch ms: the latest moment the provider's answer may still be waited for. A caller that runs inside a function with
     * a ceiling (a broadcast's batch: jobs sendByAt) says when the send must be over by, so one started late is bounded by
     * what is left rather than by the wire's own deadline, which is longer than the time a late start has. An email that
     * runs out of it settles as `failed` with an unknown outcome (the provider may have taken it), as any timeout does.
     */
    sendBy?: number;
}
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
    /** A mail provider's refusal for a limit of its own (channels resendLimitOf), named at the wire; email only. */
    limit?: ResendLimit;
    /**
     * WhatsApp said "not now" before it took the message (channels graphThrottled), named at the wire. Nothing left,
     * so the caller may try this person again later; a failure without it may have been taken all the same.
     */
    throttled?: true;
    /** The provider may have taken it all the same (provider-fetch outcome unknown): nobody sends it again blind. */
    mayHaveGone?: true;
};
interface DeliverPorts {
    db: Db;
    wire: Wire;
    /** Whether this deployment can send an OFFER by email now (its campaigns domain is verified: the edge says it). Absent: no. */
    emailOffers?: boolean;
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
    tenant_id: TenantId;
    state: string;
    paused_until: string | null;
    phone_e164: string | null;
}
/** What the thread verbs need of the world. */
interface ThreadPorts {
    /** How long a person's touch keeps the receptionist off a thread: the reply policy's pause_hours, or a day. */
    pauseMs(tenantId: TenantId): Promise<number>;
    /**
     * A person takes the thread, whole (00378): needs_human, paused until, snooze cleared, theirs; the live hold on who
     * is speaking; the receptionist's held drafts withdrawn; and the take_over decision, in one transaction. Null iff no
     * row changed: the thread moved while they looked, and nothing was written.
     */
    takeOver(tenantId: TenantId, conversationId: string, untilIso: string): Promise<{
        withdrawn_drafts: number;
        decision_id: string;
    } | null>;
    /**
     * The thread handed back, whole (00378): open with nothing paused, snoozed or claimed; this person's hold let go
     * (somebody else's is left alone); the hand_back decision; and the open escalation resolved by it, in one
     * transaction. Null iff no row changed, and then nothing was written.
     */
    handBack(tenantId: TenantId, conversationId: string): Promise<{
        decision_id: string;
    } | null>;
    /** snoozed until; pause and assignee cleared. True iff a row changed. */
    snooze(conversationId: string, untilIso: string): Promise<boolean>;
    /** open with the snooze cleared, only while still snoozed. True iff a row changed. */
    wake(conversationId: string): Promise<boolean>;
    /** archived; pause and assignee cleared. True iff a row changed. */
    archive(conversationId: string): Promise<boolean>;
    /**
     * The live hold on the thread, taken for this person (00132).
     *
     * Apart from `claim`, which records who is RESPONSIBLE: this says who is
     * speaking now, and it expires. A person's hold outranks a call's and is
     * never refused, so this answers with nothing -- a failure throws, because a
     * hold we could not take is not a hold we have.
     */
    takeControl(tenantId: TenantId, conversationId: string, userId: string, seconds: number): Promise<void>;
    /** The receptionist's held drafts on the thread withdrawn, rows then jobs; how many. */
    withdrawDrafts(tenantId: TenantId, conversationId: string): Promise<number>;
    /** The open escalation on the thread resolved by this decision, when there is one. */
    resolveEscalation(conversationId: string, decisionId: string): Promise<void>;
    /** The ledger: who did what to which row. The decision's id. */
    record(tenantId: TenantId, subject: DecisionSubject, id: string, verb: DecisionVerb, payload?: Json): Promise<string>;
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
    /**
     * The message withdrawn with its send job and the cancel_send decision as the member's, in one write, only while it
     * is queued and no run has claimed it: null when the send won, and then nothing was written.
     */
    callBack(tenantId: TenantId, messageId: string): Promise<{
        decision_id: string;
    } | null>;
}

type TakeOverPorts = Pick<ThreadPorts, "pauseMs" | "takeOver" | "now">;
/**
 * The longest a person's hold lasts without being renewed.
 *
 * The pause a take-over sets is how long the RECEPTIONIST is held off, and a
 * workspace may set that to a week. How long a person is actually on a thread
 * is a different question and a shorter one, and a hold that outlives the
 * person holding it is the defect this fact was added to end -- so the pause
 * window is the ceiling, and a day is the ceiling on that. The take-over's own
 * door keeps the same ceiling (00378, over 00132's claim); a reply's hold is
 * taken here (reply.ts).
 */
declare const PERSON_CONTROL_MAX_S: number;
interface TakeOverResult {
    state: "needs_human";
    paused_until: string;
    decision_id: string;
    withdrawn_drafts: number;
}
/** Take over: pause the receptionist, claim the thread. The open escalation stays open (§4). */
declare function takeOver(ports: TakeOverPorts, cmd: {
    conv: Pick<Thread, "id" | "tenant_id" | "phone_e164">;
}): Promise<TakeOverResult>;

type HandBackPorts = Pick<ThreadPorts, "handBack">;
/** Hand back: the receptionist resumes; the open escalation resolves (§4). */
declare function handBack(ports: HandBackPorts, cmd: {
    conv: Pick<Thread, "id" | "tenant_id" | "phone_e164" | "paused_until">;
}): Promise<{
    state: "open";
    decision_id: string;
}>;

declare const MAX_SNOOZE_MS: number;
declare const NEEDS_UNTIL = "snooze needs a future `until` timestamp.";
type SnoozePorts = Pick<ThreadPorts, "snooze" | "record" | "now">;
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

type ArchivePorts = Pick<ThreadPorts, "archive" | "record" | "resolveEscalation">;
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
        tenant_id: TenantId;
        state: string;
    };
}): Promise<ResolveResult>;

/** The honest undo (§6): inside the grace window a queued send cancels cleanly; after fire it is out, and this says so. */
declare function cancelSend(ports: CancelSendPorts, cmd: {
    msg: {
        id: string;
        tenant_id: TenantId;
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
/**
 * How long a claim with no receipt yet is the other caller's reply on its
 * way, before the next caller under the key takes it over as abandoned. It
 * is longer than any reply can live: the reply route pins its own lifetime
 * with maxDuration (60 s; core-reply.test.mjs holds this above it), so a hold
 * this old was left by a caller the platform has already ended, never one
 * still about to write. The receipt is written on the claim's stamp all the
 * same, so a caller that somehow outlived this could not complete either.
 */
declare const HOLD_EXPIRY_MS: number;
/** What the second of two callers under one key hears while the first one's reply is still on its way. */
declare const REPLY_IN_PROGRESS_REFUSAL = "This reply is already being sent. Give it a moment, then check the thread before sending it again.";
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
    /**
     * Email only: the subject of an email that answers none of theirs (the thread holds no email from them). An email
     * that answers one carries that email's subject, and this is not read.
     */
    subject?: string;
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
    contact_id: ContactId | null;
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
    tenant_id: TenantId;
    conversation_id: string;
    contact_id: ContactId | null;
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
}) & {
    /**
     * The first thing the person hears from the business on this wire (conversations/begin.ts): the job judges it as a
     * start and holds it as a person's own words (messages/send.ts).
     */
    starts?: true;
};
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
        tenant_id: TenantId;
    }): Promise<EmailParentFacts | null>;
    /**
     * The request this reply leaves as, frozen, and the subject it carries; null when the workspace has no mailbox to send
     * from. A reply to a reach-out on one of the workspace's own domains, verified now, is frozen a second time on that
     * domain (`own`, C15): the edge sends it when that route still holds it, and the mailbox's request otherwise (N5).
     */
    freeze(input: {
        tenantId: TenantId;
        conversationId: string;
        messageId: string;
        to: string;
        parent: EmailParentFacts;
        body: string;
    }): Promise<{
        request: Json;
        subject: string;
        own?: Json | null;
    } | null>;
    /**
     * The request a first email leaves as, frozen, and the subject it carries: an email that answers none of theirs, so
     * it names its own subject and threads under nothing. Null when the workspace has no mailbox to send from.
     */
    first(input: {
        tenantId: TenantId;
        messageId: string;
        to: string;
        subject: string;
        body: string;
    }): Promise<{
        request: Json;
        subject: string;
    } | null>;
    /**
     * The subject of the newest email the business sent on this thread, or null when it has sent none: what a second
     * email is filed under when they have not answered the first.
     */
    lastSubject(conv: {
        id: string;
        tenant_id: TenantId;
    }): Promise<string | null>;
    /** The row's id before the row exists. */
    newId(): string;
}
/** What the key's holder left: its receipt once kept, and nothing while its reply is still on its way. */
interface KeyHold {
    response: ReplyReceipt | null;
    created_at: string;
    request_hash: string | null;
}
type KeyClaim = {
    won: true;
} | {
    won: false;
    held: KeyHold | null;
};
interface ReplyPorts extends Pick<ThreadPorts, "pauseMs" | "takeControl" | "withdrawDrafts" | "record" | "resolveEscalation" | "now"> {
    /** Where the person last wrote: a text and an email have no 24-hour window and no templates. */
    replyChannel(conv: {
        id: string;
        tenant_id: TenantId;
    }): Promise<"whatsapp" | "sms" | "email">;
    email: EmailReplyPorts;
    /**
     * The key claimed, before anything else is written: a row on the table's
     * unique (tenant_id, key), so the database picks the one winner among
     * callers under one key at once. A loser is shown the hold, or null when it
     * went between the claim and the read.
     */
    claimKey(tenantId: TenantId, key: string, requestHash: string, nowIso: string): Promise<KeyClaim>;
    /**
     * A hold taken over by the stamp it was read at: true iff this caller holds the key now; false when another took it
     * first. Taking over a receipt for other words puts the first words' receipt out of reach, so a replay of those
     * words inside their window would send again. Accepted: the key is derived from the words (inbox-verbs.ts), so two
     * intents under one key is a client that changed what the key means, not a retry.
     */
    takeKey(tenantId: TenantId, key: string, requestHash: string, nowIso: string, from: string): Promise<boolean>;
    /**
     * The row stamped `nowIso` let go, whatever it holds, and only that one: a caller lets go only when its send did not
     * happen, and another caller's takeover moved the stamp. A receipt kept before a job that then could not be
     * scheduled goes with it, so a replay of those words sends afresh instead of answering with a canceled message.
     * Never throws: the reply is already failing.
     */
    releaseKey(tenantId: TenantId, key: string, nowIso: string): Promise<void>;
    /** The workspace's template by name and language, as Meta last told us about it; `variables` is one entry per slot, when the sync has filled it. */
    template(tenantId: TenantId, name: string, language: string): Promise<{
        name: string;
        language: string;
        body_preview: string | null;
        meta_status: string | null;
        category: string | null;
        variables?: unknown;
    } | null>;
    /**
     * The facts a template's params come from, when the workspace has them: its name, and its booking link or null for
     * a business that quotes each job (the first run's decision 2).
     */
    templateFacts(tenantId: TenantId): Promise<{
        business_name: string;
        booking_link: string | null;
    } | null>;
    /** needs_human, paused until, snooze cleared, claimed by the user, and the thread touched now. True iff a row changed. */
    claimForReply(conversationId: string, untilIso: string, userId: string, nowIso: string): Promise<boolean>;
    /** The operator's words as a queued outbound row; its id. */
    queue(row: QueuedReply): Promise<string>;
    /** The send job, due after the grace window; throws when it could not be scheduled. */
    schedule(tenantId: TenantId, dueAt: Date, payload: SendPayload): Promise<void>;
    /** A queued row with no job to send it, withdrawn so it never sits "Sending…" forever. */
    cancelOrphan(tenantId: TenantId, messageId: string): Promise<void>;
    /**
     * The receipt kept under the key, written only onto the row that still carries this caller's stamp: true iff it
     * does, false when another caller took the key over since. Throws when the write itself could not be made; where
     * the verb stands decides what that means.
     */
    storeReceipt(tenantId: TenantId, key: string, requestHash: string, response: ReplyReceipt, stamp: string): Promise<boolean>;
    /** A stable digest of a string, for the intent and the content. */
    hash(s: string): string;
}
interface ReplyCommand {
    conv: ReplyThread;
    userId: string;
    body: ReplyBody;
    idempotencyKey: string | null;
    /**
     * The first thing the person hears from the business on this wire, as the caller judged it (conversations/begin.ts,
     * by contracts writeWaysOf). A reply from the thread's own box never says it: it answers a thread that exists.
     */
    starts?: boolean;
    /**
     * The words as they leave, where they are not the words written: a first text carries the line that says how to
     * stop (conversations/begin.ts). The key's intent stays the words written (`body`), so a retry is the same intent
     * whichever way that line fell.
     */
    leavesAs?: string;
    /**
     * How long a receipt kept under the key answers the same intent, where the caller's key names one press and not the
     * words (begin.ts: the client's own key, kept a day). Absent, a reply's own thirty seconds (IDEMPOTENCY_WINDOW_MS).
     */
    replayMs?: number;
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
 * A member begins a conversation with one person (a conversation begins from the Inbox): a message by the wire they
 * chose, to someone who may never have written. The same send as a reply's, through the same verb and the same door,
 * with four things a reply never needs: the wire is the member's choice, judged before anything is written (contracts
 * writeWaysOf, the one rule the sheet drew its choices from); what the reply verb would refuse is asked before the
 * person's thread is opened, so a refusal leaves no empty thread; the thread is opened when they have none; and the
 * member says who answers what comes back, with the plan kept as a note the receptionist reads before it is asked to.
 *
 * It is also how a thread's own reply box writes on a thread nothing has come to (the dashboard's reply route): what
 * is written there answers nobody, so it is judged as the start it is.
 */
interface BeginPorts {
    /** The reply verb's world: the message is queued, claimed and scheduled exactly as a reply is. */
    reply: ReplyPorts;
    /** The hand-back verb's world, for a message the receptionist answers. */
    handBack: HandBackPorts;
    /** People's own row for this person, or null when they are not this workspace's (gone, erased, merged away). */
    person(tenantId: TenantId, personId: string): Promise<WriteRow | null>;
    /** What the workspace can send on now, asked fresh: a send is about to be committed on it. */
    ready(tenantId: TenantId): Promise<ChannelsReady>;
    /** Their one thread, opened when they have none, as the reply verb reads a thread. */
    open(tenantId: TenantId, personId: string): Promise<ReplyThread>;
    /** Whether a text of ours has ever reached them on this thread: what decides the line a first text carries. */
    textedBefore(tenantId: TenantId, conversationId: string): Promise<boolean>;
    /**
     * A first text as it leaves: with the line that says how to stop, which the first text to a number owes (channels
     * smsBody). Null when the words and that line do not fit one text: a line the carrier's ceiling cut is no line.
     */
    firstText(text: string): string | null;
    /**
     * The plan, kept on the person's page through the notes door (0007), as themselves, for the receptionist to read.
     * Answers the note's id where the door says it.
     */
    keepNote(personId: string, body: string): Promise<string | null>;
}
interface BeginCommand {
    tenantId: TenantId;
    personId: string;
    userId: string;
    /** The wire the member chose. Required: nothing here guesses where a first message goes. */
    wire: ConsentChannel;
    body: ReplyBody;
    /**
     * Who answers what they write back: the receptionist, with the thread handed back at once, or the member, who
     * keeps the thread as a reply keeps it. Required: a first message must not decide this by default.
     */
    then: "receptionist" | "me";
    /**
     * The plan, as the note the receptionist reads: kept once the message is queued and before the thread is handed
     * back, so the receptionist never answers this person without it. Absent where the member answers, or left it out.
     */
    note?: string;
    /** Their thread, where the caller already holds it (the thread's own reply box): nothing is opened then. */
    conv?: ReplyThread;
    /**
     * The key this send is known by: the client's own for one press of Send. The reply verb claims it before anything is
     * written and keeps its receipt before the job exists, so a retry after a failure further on (the ledger's row, the
     * note, the hand-back, a request that died) is answered with that receipt and queues nothing twice.
     */
    idempotencyKey?: string | null;
}
/** What a start is asked before anything is written: who it is for, the wire, the message, and their thread where one is held. */
type BeginAsk = Pick<BeginCommand, "tenantId" | "personId" | "wire" | "body"> & {
    conv?: Pick<ReplyThread, "id">;
};
interface BeginReceipt extends ReplyReceipt {
    conversation_id: string;
    /** The thread went back to the receptionist once the message was queued. */
    handed_back: boolean;
    /** The note was kept; false when it could not be, with the message still on its way; null when none was asked. */
    note_kept: boolean | null;
    /** The note that was kept, so a send taken back inside its window takes the note that said it with it. */
    note_id: string | null;
}
/**
 * The questions a start is asked before a thread is opened or a word is written, by themselves: the person is this
 * workspace's, the wire may carry a message to them now (contracts writeWaysOf), and the reply verb would take the
 * message (fitsWire). Answers the way, and the words as they leave where they are not the words written; throws the
 * refusal the send would be given. It writes nothing. beginConversation asks it first, and so does a draft that must
 * say now what the send would say later (Ask's reply card on a thread nothing has come to).
 */
declare function mayBegin(ports: BeginPorts, ask: BeginAsk): Promise<{
    way: WriteWay;
    leavesAs: string | undefined;
}>;
declare function beginConversation(ports: BeginPorts, cmd: BeginCommand): Promise<BeginReceipt>;

/**
 * The send path's view of the world: what the job verbs need, named for
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
        /** The frozen request, on an email's row. */ email?: Delivery["email"] | null;
        /** A person's reply to a reach-out, frozen again on the chain's own domain (meta.email.own_request, G15). */
        ownEmail?: Delivery["ownEmail"];
        /** The lead a reach-out's email was written for (its row's meta.reach_out.lead_id): the door asks about that lead. */
        leadId?: string | null;
    } | null>;
    /** Which yes this send needs: the template's category as Meta has it, read now; unreadable throws. */
    purposeOf(template: {
        name: string;
        language: string;
    } | undefined): Promise<SendPurpose>;
    /**
     * The row claimed for this run before anything reaches a wire (db claimQueuedSend, messages.sending_at): false when
     * another run holds it or it is no longer queued, and this run sends nothing. Two jobs naming one message, however
     * the second came to be scheduled, are never both answered yes. Throws when it could not be asked.
     */
    claim(messageId: string): Promise<boolean>;
    /**
     * The claim given back, when the provider provably did not take the message (db releaseQueuedSend): asked before
     * `retry`, so the fresh job may claim the row. Throws when it could not be written, and no fresh job is asked for.
     */
    release(messageId: string): Promise<void>;
    deliver: Door;
    /** The thread flagged for a person, with why; how it landed (jobs upsertEscalation: a hold is told once). */
    escalate(conversationId: string, reason: string, details: string): Promise<"opened" | "changed" | "refreshed" | "failed">;
    /** Tell this workspace's people. The news says what it IS (contracts JobNews); a caller cannot leave that to the sender. */
    alert(news: JobNews): Promise<void>;
    /** The platform's own pager, for a provider refusing every send on a wire. */
    page?(key: string, subject: string, body: string): Promise<unknown>;
    /**
     * The same send, as a FRESH job of its kind, due then (the ledger's scheduleJob). Asked when the wire could not be
     * bound (deliver WireUnavailableError): nothing left and nothing was written, so a second job is safe where a second
     * run of this one is not -- the ledger never tries a kind that speaks to a person again (SPEAKS_TO_A_PERSON), because
     * a run that threw mid-send may have sent. The payload carries how many fresh jobs this send is already the result
     * of (`resumes`, as a resumed broadcast's does), and the verb bounds them.
     */
    retry(dueAt: Date, payload: SendQueuedCommand["payload"]): Promise<void>;
    /** Epoch ms; injected so the wait is testable. */
    now?: () => number;
    /** The draw a wait is lengthened by (contracts jittered); Math.random when absent. */
    random?: () => number;
}
/** The command sendQueued takes: here rather than in send.ts, so the port above can name its payload without a cycle. */
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
        /**
         * What the send IS, when the job knows better than a template can: an offer is marketing whatever its words, and a
         * first email starts a conversation. Both can only make the door stricter: a payload never makes a template's
         * purpose looser, and only `true` makes a send proactive. "outreach" (a cold email, Reach out) is its own lane,
         * which the door holds to its own rules.
         */
        purpose?: SendPurpose;
        proactive?: boolean;
        /**
         * A person's own message that begins a conversation (core conversations/begin.ts): the first thing they hear from
         * the business on this wire. It is judged as a start, so the door asks the yes a start asks, and held as that
         * person's own words, so the thread's pause, which is theirs, does not hold it. A name of its own, not
         * `proactive`, which an edge deployed before this reads as a campaign's send and holds under that pause: an edge
         * that does not know the name sends the message as the reply it was before, so either deploy order works.
         */
        starts?: boolean;
        /** How many fresh jobs this send is already the result of, after a wire that could not be bound (retry above). */
        resumes?: number;
    };
}
interface ProvisionLinePorts {
    /** The saga, or its resumption: the edge's, because the provider and the credentials live there. Absent in a runtime that holds none. */
    provision?(lineId: string, by: "owner" | "support" | "sweep", deadline?: number): Promise<{
        ok: boolean;
        step?: string;
        error?: string;
        more?: boolean;
    }>;
    /** One more job of this kind, for the steps a run left at its deadline. */
    next?(payload: Record<string, unknown>): Promise<void>;
    /** Epoch ms: the run starts no provider call after it. */
    deadline?: number;
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
    /** The channel the run picked for them at enrolment (contracts reachFor); null or absent on a run made before: WhatsApp. */
    channel?: string | null;
    /**
     * How many times this person was claimed and given back (00301: the guard adds one on every release): what a broadcast's
     * email to them is named by. Absent from the read of a database that has not reached that migration.
     */
    attempt?: number;
}
interface ContactRow {
    id: string;
    phone_e164: string | null;
    /** Their email address as stored, which the door compares a frozen request's To with; null or absent with none. */
    email?: string | null;
    /** Email's own answer about offers (00174): an offer's foot says why they get it from it (asked for them, or a customer). */
    email_marketing?: string | null;
    erased_at: string | null;
    display_name: string | null;
    wa_profile_name: string | null;
}
type RecipientMark = {
    /**
     * `queued` only releases a claim the provider did not take: WhatsApp's "not now" or a mail provider's limit
     * (`throttled`, 00216), or a request that never reached it (`not_taken`, 00282): the send was not taken, so it is tried
     * again. The database refuses any other release.
     */
    state: "sent" | "skipped" | "failed" | "queued";
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
    /**
     * The message of this name and language, as the rows the workspace holds of it now, whatever their channel: WhatsApp's as
     * Meta has it (its status, its category, its words), and the email's and the text's, written here and approved the moment
     * they were saved (`components` is where an email's subject is stored). contracts campaignMessageOf picks the versions out of
     * them. None when it has no row; THROWS when it cannot be read: a message that could not be looked for is not one WhatsApp
     * withdrew, and none fails the whole run and tells the owner WhatsApp no longer approves it, a lie about their account told
     * over a statement timeout.
     */
    message(name: string, language: string): Promise<MessageVersionRow[]>;
    /**
     * The workspace's own words for the slots that name it, and its clock (IANA zone), which the sending hours are kept
     * by; and the postal address its emails' foot gives (the Business record's), null when it has none.
     */
    facts(): Promise<{
        businessName: string;
        bookingLink: string | null;
        timezone: string;
        address?: string | null;
    }>;
    /** Up to `limit` people still queued; throws when it cannot be read. */
    batch(id: string, limit: number): Promise<RecipientRow[]>;
    /** The people on the batch by id, one read for all of them; a row that is gone is absent. Throws when it cannot be read. */
    contacts(contactIds: string[]): Promise<Map<string, ContactRow>>;
    /**
     * The appointments a visit run's recipients were drawn for, by the key the calendar keeps each under (decision 0002,
     * contracts appointmentKeyOf), one read for the batch; a key with no row is absent. Absent where the runtime keeps no
     * appointments, and a read that fails is no rows: the send goes as it did before the record.
     */
    appointments?(keys: string[]): Promise<Map<string, AppointmentState>>;
    /** The thread this send belongs to, never created here. */
    target(phoneE164: string): Promise<{
        conversationId: string;
    } | null>;
    /** The same thread by the person, for an email, which reaches them by an address rather than a number; null for one that is gone. */
    targetOfContact(contactId: string): Promise<{
        conversationId: string;
    } | null>;
    /**
     * The request one person's email leaves as, frozen (channels buildEmailRequest) from the hosted mailbox: From the
     * workspace's address, Reply-To its reply route, To `to`, the subject and body, and `footer` after them, under
     * `messageId` as its idempotency key. An OFFER (`offer`) leaves from the mailbox on the campaigns domain instead, with the
     * one-click unsubscribe headers and its foot in HTML (`footerHtml`, which carries `unsubscribeUrl`). Null when the workspace
     * has no mailbox or this deployment no mail domain (no campaigns domain, for an offer), and for words no email may carry
     * (a subject posing as a reply): the person is held, never sent as something else.
     */
    emailRequest(i: {
        messageId: string;
        to: string;
        subject: string;
        body: string;
        footer: string;
        offer?: {
            unsubscribeUrl: string;
            footerHtml: string;
        };
    }): Promise<EmailRequest | null>;
    /**
     * The link that unsubscribes this person from this email (the page every offer's foot and List-Unsubscribe carry),
     * sealed for them: `/u/<token>` on the deployment's unsubscribe origin (channels unsubscribeUrl). Null where this runtime
     * cannot seal one (no secret, no campaigns domain): the person is held, an offer never goes without its way out.
     */
    unsubscribeUrl(i: {
        messageId: string;
        contactId: string;
    }): Promise<string | null>;
    /**
     * An email written as the queued row its request was frozen for, before it is sent (deliver assertFrozenFor), and only
     * once its person is claimed, so a claim that is lost or fails leaves no row behind: "written" when this call made it,
     * else the row that was already there under that id and how it stands. The row queued is claimed for the wire
     * (messages.sending_at, as sendQueued claims a reply's), so nothing that calls a send back takes it while the provider
     * answers. A write that fails throws.
     */
    queueEmail(row: {
        id: string;
        conversationId: string;
        contactId: string;
        body: string;
        /** The frozen request: the row keeps it as meta.email (subject, To and the request itself), as every email's row does. */
        request: EmailRequest;
        /** What marks the row a broadcast's: its source and the broadcast's ids (the adapter adds meta.email). */
        meta: Record<string, Json>;
    }): Promise<{
        status: string;
    }>;
    /**
     * An email written and never sent, because the provider did not take it (a send handed back) or the door threw before
     * the wire: its claim given back and the row withdrawn while it is still queued (a row the door settled is left as it
     * settled it), so nothing is left queued for a sweep to call lost, or counted against the month. Best effort: the
     * caller logs a failure and goes on.
     */
    withdrawEmail(messageId: string): Promise<void>;
    /**
     * How many emails or texts this workspace's campaigns sent this calendar month (packages/db campaignMonthSent): what
     * contracts CAMPAIGN_MONTH_ALLOWANCE is held against. Throws when it cannot be read.
     */
    monthSent(channel: "sms" | "email"): Promise<number>;
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
    /**
     * Whether any person on the run, whatever their state, goes another way than `than` (a recipient row's channel): the
     * run's own question when one channel is held for everyone on it. WhatsApp's template not being approved holds the run's
     * WhatsApp people alone, and a hold on the workspace's offers and news by email its email people alone: the run goes on
     * for the others, and only a run with nobody else on it stops. On a database that keeps no channel on a recipient
     * everyone goes by WhatsApp. Throws when it cannot be read.
     */
    byOtherChannels(id: string, than: "whatsapp" | "email"): Promise<boolean>;
    /**
     * One person's row, written. The claim (failed, outcome_unknown) is a compare-and-set: it answers whether THIS call
     * took the person, true, or false when they were no longer queued (another run took them first), and then nobody is
     * claimed twice, so nobody is sent twice. Every other write answers true.
     */
    mark(id: string, contactId: string, patch: RecipientMark): Promise<boolean>;
    deliver: Door;
    /**
     * Why the run's wire cannot be bound right now -- the workspace's credentials could not be read (deliver
     * WireUnavailable) -- or null when the door can be asked. Asked BEFORE anyone is claimed: a claim settles only to
     * sent or skipped (00182), never back to queued, so a wire known to be unbound claims nobody and the batch waits.
     * A number that is ABSENT is not this port's to say: the door answers that per person, as it always did.
     */
    wireUnavailable(channel: Channel): Promise<string | null>;
    /**
     * Why an OFFER by email cannot leave from this runtime right now though the deployment is meant to send them (it names
     * a campaigns domain, and the mail provider says the domain is not verified for sending), or null when it can, and for a
     * deployment that names none (an offer is then held person by person at enrolment and the door, as it always was).
     * Asked BEFORE anyone is claimed, for a run whose message is an offer and whose batch has anyone going by email: the
     * platform is paged with the reason, once (the pager's own quiet). A run of email alone stops, the reason said, rather
     * than skip each of them, a skip that is final; a run that also goes another way (byOtherChannels) skips its email people
     * (`email_marketing_disabled`) and goes on for everyone else. A domain that could not be read at all is not this port's:
     * that is the email wire not bound (`wireUnavailable`), and the run waits.
     */
    offersClosed(): Promise<string | null>;
    /**
     * Why it cannot yet be known whether an OFFER by email may leave: the deployment names a campaigns domain and the mail
     * provider could not be asked about it (a failed or slow read), or null. Asked where offersClosed is, before anyone is
     * claimed: the run waits a minute and asks again (a stall), as a wire that could not be bound does. Only an offer asks
     * it: a visit's email leaves from the mail domain, which is not in question, so a domain that could not be read holds
     * no reminder back.
     */
    offersUnread(): Promise<string | null>;
    /** The platform's own pager, for a wire that could not be bound: said once per six hours by the pager's own quiet. */
    page?(key: string, subject: string, body: string): Promise<unknown>;
    /** How many are still queued; throws when it cannot be counted. */
    remaining(id: string): Promise<number>;
    /** The broadcast's state now; null when gone. Throws when it cannot be read: an unreadable state is not a cancel. */
    state(id: string): Promise<string | null>;
    /**
     * The next batch, as this tenant, through the same door the dashboard uses; now unless told when. `carry` is what
     * the run has waited through so far (BatchCarry), carried to the next batch; a batch scheduled without it starts
     * the counts again.
     */
    scheduleNext(id: string, dueAt?: Date, carry?: BatchCarry): Promise<void>;
    /** Who got it and who was held, once nobody is queued. */
    tally(id: string): Promise<{
        sent: number;
        held: number;
    }>;
    /**
     * Which of the workspace's holds on email (contracts EMAIL_HOLDS) anyone on the run was skipped for: the finished run's
     * news names those, and only those, among its reasons. Asked once nobody is queued, of a run that held someone back.
     */
    heldForEmail(id: string): Promise<EmailHold[]>;
    /** sending → sent, and the event with the tally. */
    finish(id: string, tally: {
        sent: number;
        held: number;
    }): Promise<void>;
    /** Tell this workspace's people. The news says what it IS (contracts JobNews); a caller cannot leave that to the sender. */
    alert(news: JobNews): Promise<void>;
    now(): number;
    sleep(ms: number): Promise<void>;
    /** The draw a wait is lengthened by (contracts jittered); Math.random when absent. */
    random?: () => number;
}
/** What a run has waited through, carried from one batch to the next in the job's payload. */
interface BatchCarry {
    /**
     * How many times WhatsApp said "not now", or could not be reached at all, running (BROADCAST_THROTTLE_WAITS_MS).
     */
    waits?: number;
    /** How many batches in a row reached nobody because a read failed, the credentials' or the people's (BROADCAST_STALLS_MAX). */
    stalls?: number;
}
interface BroadcastBatchCommand extends BatchCarry {
    tenantId: string;
    broadcastId: string;
    deadline: number;
    /**
     * Epoch ms, by channel: the latest moment a send on that wire may start (jobs ledger startByAt). A wire whose send no
     * ceiling bounds (WhatsApp's, a text's) runs its own timeout whole, and one begun too late outlived the function. A
     * person whose wire's moment has passed is left queued for the next batch, the first person of a batch too, and
     * the batch is not a stall. A channel with none may start until the deadline.
     */
    startBy?: Partial<Record<Channel, number>>;
}

/**
 * How long a reply whose wire could not be bound waits before a FRESH job tries it again, by how many fresh jobs it
 * already is the result of (payload.resumes): a blip, a bad minute, a short outage, and one more before a person is
 * told. The list's length is the bound: a send past its last wait fails loudly by name, and the ledger settles the
 * row and tells the owner as it does for any run that did not finish -- never "reconnect the number", because
 * nobody knows that it is off. Fresh rows rather than the ledger's own retry (RETRY_WAITS_MS), which is closed to a
 * kind that speaks to a person: a run that threw mid-send may have sent, and this one provably did not.
 *
 * The same waits hold a send the provider provably did not take (retry by outcome: its "not now", a connection that
 * never opened; NotTakenError), which used to fail at once, flag the thread and tell the owner over a minute's
 * throttle. Nobody is paged for it: a throttle is one minute's problem. Its last try is not held: a provider still
 * saying no then is told as any failure is.
 */
declare const SEND_RETRY_WAITS_MS: readonly number[];
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

/** What a late failure needs to know of the message the provider's id names. */
interface LateFailureFacts {
    messageId: string;
    conversationId: string;
    /** customer, ai, human or system. */
    sender: string;
    /** inbound or outbound: a receipt is about a message of ours. */
    direction: string;
    /** What the row says now. */
    status: string;
    /** The row's meta, as stored: what a campaign's send is read from. */
    meta: unknown;
    /** Their number or address, as the hand-off names them; null when the row names no person. */
    to: string | null;
}
interface LateFailurePorts {
    /** The message of this workspace the provider's id names, as it stands; null when none is. Throws when it cannot be read. */
    message(externalId: string): Promise<LateFailureFacts | null>;
    /** The thread flagged for a person, once per hold (jobs upsertEscalation); how it landed. */
    escalate(conversationId: string, reason: string, details: string): Promise<"opened" | "changed" | "refreshed" | "failed">;
    /** Tell this workspace's people (the job runner's own alert, job-alert.ts: who is told is its decision). */
    alert(news: JobNews): Promise<void>;
    /** `message.send_failed` on the ledger, best effort: the Activity feed and the platform's day count it. */
    noteFailed(messageId: string, data: {
        reason: string;
        outcome: "refused";
        body: string;
    }): Promise<void>;
}
interface LateFailureCommand {
    /** The provider's id for the message: Meta's wamid, Twilio's message sid. */
    externalId: string;
    /** The wire it went out on, which says which provider's code the error holds. */
    channel: "whatsapp" | "sms";
    /** What the receipt said, as the row will keep it (messages.error). */
    error: Record<string, unknown>;
}
/**
 * What a late failure came to: `raised` (the thread flagged, the owner told, the ledger written), or nothing was owed:
 * `not_ours` (no message of this workspace carries the id), `not_a_reply` (not a message a person or the receptionist
 * wrote to a customer, or a campaign's), `already_over` (the row had already failed or been canceled: a receipt seen
 * before).
 */
type LateFailureOutcome = "raised" | "not_ours" | "not_a_reply" | "already_over";
/**
 * A message the provider took and then reported it did not deliver: the hold and the bell a send that fails at the wire
 * already raises (send.ts sayItFailed), for the failure the provider says LATER, in its receipt.
 *
 * WhatsApp's status webhook and Twilio's status callback both say `failed` (or `undelivered`) about a message they
 * accepted a moment before, and until this the row learned it and nobody else did: the thread read as answered, the
 * bell stayed quiet, and the customer waited on a reply that never arrived. An email receipt flags its thread
 * already (edge email-receipts.ts); this is the same rule for the other two wires, said once, in the same words the
 * send says it (raiseSendFailed).
 *
 * Whose failure it is, by the one predicate every reader of a campaign asks (contracts isAutomatedSend): a reply the
 * receptionist or a person wrote, to a customer. A broadcast's, a playbook's or a reach-out step's send is its run's to
 * count, on its own row, and flags no thread nobody wrote on (Reach out D4).
 *
 * Once per message, not once per receipt: the row says whether this is the first. A message already failed (or canceled,
 * which a failure cannot move: messages_guard) is a receipt seen before, and raises nothing. The caller flags BEFORE it
 * moves the row to failed, as an email's receipt does, so a flag that could not be written (this throws) leaves the row
 * as it was and the receipt comes again.
 */
declare function raiseLateFailure(ports: LateFailurePorts, cmd: LateFailureCommand): Promise<LateFailureOutcome>;

/**
 * line_provision: a line's provisioning, on the ledger (00109). The durable
 * part is the ledger's — claimed under a lease, resumed by the heartbeat when
 * a worker dies, tried up to its ceiling and then given up loudly — and the
 * saga is the edge's, reading its own receipts so a second run repeats
 * nothing. A saga that stopped fails the job with the step it stopped at, so
 * the next try resumes there.
 *
 * A run is bounded by the job's deadline, not the saga's length: the saga's
 * worst case (ten carrier calls at 15 s and four Retell calls at 8 s) is three
 * times the 60-second function it runs in. So it stops between two provider
 * calls when the deadline passes, and the rest is one more job -- a run the
 * function cuts off mid-call is a call whose outcome nobody knows.
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
type EmailClaim = "report" | "auto_reply" | "automated" | "person" | "booking_notice" | "forwarding_confirmation";
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
    /**
     * The receiving side PROVES the sender is who the From line says (channels senderAuthenticated: the provider's own
     * verdict, a DMARC pass or a DKIM pass by the From domain). A From anyone can forge is not one: a yes (YES OFFERS) is
     * taken only from an email that has it, and is refused, and logged, from one that does not. A no (STOP,
     * UNSUBSCRIBE) is always taken, since a no only narrows. Required: no caller may leave a proof out and have a yes taken.
     */
    senderAuthenticated: boolean;
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
     * A booking tool's notice is read into an appointment, not kept as a conversation (docs/plans/
     * 2026-10-07-bookings-arrive-by-email.md): one booking_read for the delivery, however often this intake runs.
     */
    readBooking(tenantId: string, mailboxId: string, receivedId: string, tool: BookingTool): Promise<void>;
    /**
     * The booking tool the workspace named as its own (config bookings.tool), or null for none: only that tool's notices
     * are read as bookings. A workspace that named none keeps every tool's email as the automated email it is.
     */
    bookingTool(tenantId: string): Promise<BookingTool | null>;
    /**
     * Is this address a member's of the workspace: the second thing a notice forwarded by hand must be, after its
     * sender is proved (00345).
     */
    memberAddress(tenantId: string, address: string): Promise<boolean>;
    /**
     * Gmail's confirmation that it may forward to this mailbox (contracts forwardingConfirmationOf), kept on the mailbox
     * for Settings to show with one press, never as a thread (00345).
     */
    keepForwarding(mailboxId: string, p: {
        account: string;
        code: string;
        link: string | null;
    }): Promise<void>;
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
        /** The email's own words are the opt-out (asksToStop): ingest_inbound then records the STOP, as it does for a text. */
        optOut: boolean;
        /**
         * The email's own words are START, from a sender the receiving side proved (asksToStart): ingest_inbound records the
         * yes to hearing from the business again, as it does for a text, and the yes covers email.
         */
        optIn: boolean;
        /** The email's own words are UNSUBSCRIBE (asksToUnsubscribe): offers by email end, through the unsubscribe link's door. */
        unsubscribe: boolean;
        /** The email's own words are YES OFFERS, from a sender the receiving side proved (asksForOffers): the yes to offers by email. */
        optInOffers: boolean;
        /**
         * A person wrote it, from a sender the receiving side proved: the address works, whatever a hard bounce once said of
         * it, so that stop is lifted (a complaint's, and the provider's own, are not this email's to lift).
         */
        fromThemProven: boolean;
        /** What they wrote, as the ledger quotes it: the words of the reply, never the history their client quoted. */
        words: string | null;
    }): Promise<{
        message_id: string;
        conversation_id: string;
        is_new: boolean;
        processed: boolean;
    }>;
    /**
     * Flag the thread for a person: a new hold, one that now means something else,
     * a refresh of the same one, or a write that did not land.
     */
    escalate(tenantId: string, conversationId: string, reason: "email_review", details: string): Promise<"opened" | "changed" | "refreshed" | "failed">;
    /** Tell the workspace's people, once per hold: the bell, and the mail their alerts go to. Never throws. */
    tell(tenantId: string, note: {
        conversationId: string;
        from: string;
        fromName: string | null;
        subject: string | null;
        preview: string | null;
        claim: EmailClaim;
    }): Promise<void>;
    /**
     * Is this kept message a reply to one of the workspace's reach-outs (00222 reach_out_reply_of)? Throws when it cannot
     * be asked: a reply taken for nobody's would never be read, and a no in it would be missed.
     */
    reachOutReply(tenantId: string, messageId: string): Promise<boolean>;
    /** Hand the reply to the reading (a reply_read job), at most once per message however often this runs. */
    readReply(tenantId: string, messageId: string): Promise<void>;
    markProcessed(tenantId: string, messageId: string): Promise<void>;
    received(mailboxId: string, at: string): Promise<void>;
    now(): number;
}
type EmailIngestOutcome = "kept_for_a_person" | "kept_for_the_reading" | "kept_quietly" | "kept_as_booking" | "kept_as_confirmation" | "already_handled" | "not_a_conversation" | "our_own" | "erased_person" | "no_sender" | "gone";
/** As much of one email's words as a thread keeps. The original stays with the provider; this is what a person reads and, one day, a model. */
declare const EMAIL_BODY_MAX = 20000;
/** What the person who opens the thread is told, by what the email claimed to be. */
declare const EMAIL_REVIEW_WORDS: Record<Extract<EmailClaim, "person" | "automated"> | "reach_out", string>;
declare function ingestEmail(ports: EmailIngestPorts, cmd: {
    payload: Record<string, unknown>;
}): Promise<EmailIngestOutcome>;

/**
 * reply_read: one reply to a reach-out, read for what it means (Reach out Part 5; the plan's G1-G4, G6, G16).
 *
 * The email intake keeps the message and hands a reach-out's reply here, once per message (the ledger's
 * jobs_reply_read_once). This asks the model what the reply means, applies what that reading does through the one
 * door (the plan is contracts' readingPlan: the door executes it and decides nothing), and tells the workspace once.
 *
 *   - One reading per message (G3). A run that finds the reading already kept asks no model and pays nothing: it
 *     carries on from what the row records (a re-read owed, a notice owed).
 *   - What may be spent (G4): a workspace that may read, under the day's reads, taken before the call. A reply that is
 *     not read (no model, a workspace that may not spend, the day's reads spent, a model that threw, ran out of time or
 *     answered nothing usable) is `other`, with `unread` saying why. The chain has stopped for a person's reply
 *     already (outreach_wrote_back), and the reply is read again later, so a missed no still becomes an opt-out.
 *   - A re-read (stage reread-<n>) applies only while the reading is still unread and at the re-read before it, and
 *     tells only what nobody was told (a no, and an automatic reply's first real reading).
 *   - The draft (PR 5, decision 0017): for interested, a question and not now, the receptionist writes an answer (or a
 *     line of thanks) and it is kept on the reading, never as a message: nothing sends it but a person. It is tried
 *     once, after the apply and before the notice, so the notice carries it. A job with too little time left marks it
 *     waiting, hands it to a job of its own (stage "draft"), and tells without it; that job tells nobody.
 *   - The notice, in two phases (B2): the claim, then the telling, then the mark only once the owner was told. A
 *     telling that failed throws, so the ledger tries again once the claim has gone stale; told is never marked before.
 *   - What the intake opened, the reading closes (closeWhatTheIntakeOpened): the intake flags every reach-out reply
 *     that is not an automatic one for a person (email_review), since until it is read nobody knows what it means. A
 *     no resolves that flag and archives the thread; a wrong person and a not now resolve the flag; the rest leave it
 *     to a person. An automatic reply was never flagged, so its reading closes nothing. The applying run's, after the
 *     apply and before the notice.
 *
 * It sends nothing to the business. The pages (PRs 7 and 8) come later.
 */

/** The reply and the reach-out it answers, as the job reads them (packages/db reachOutReplyOf). */
interface ReplyFacts {
    conversationId: string;
    claim: ReplyClaim;
    /** Their words as the thread keeps them; the quoted history is cut here (replyTextOf). */
    text: string | null;
    subject: string | null;
    /** The intake's bare sender address (its from.address), never the From header's display-name form. */
    from: string | null;
    /** When it arrived, epoch ms. */
    receivedAt: number;
    /** The email it answers, its first words. */
    answered: string | null;
    business: string;
    /** The address the reach-out wrote to, and the lead's website. */
    leadAddress: string | null;
    leadWebsite: string | null;
    /** Whether the finder saw that website as its host's root (00237); null when it was not kept. */
    leadWebsiteRoot?: boolean | null;
    /** The chain's signature ({{your name}}), which a draft ends with. */
    signedBy: string | null;
    /** The business's zone. */
    tz: string;
}
/** A reading as it is kept. */
interface KeptReading {
    intent: ReplyIntent;
    summary: string | null;
    unread: Unread | null;
    /** The re-reads already applied. */
    rereads: number;
    /** Whether its plan tells the owner. */
    tell: boolean;
    told: boolean;
    undone: boolean;
    /** What its plan drafts (contracts readingPlan), and how far the draft got: its text once written. */
    draft: "answer" | "thanks" | null;
    draftState: DraftState;
    draftText: string | null;
}
/** reach_out_replies.draft_state. */
type DraftState = "none" | "waiting" | "written" | "not_written";
/** A draft's mark: waiting for a job of its own, written, or not written and why. */
type DraftMark = {
    state: "waiting";
} | {
    state: "written";
    draft: string;
} | {
    state: "not_written";
    why: DraftWhy;
};
/** The notice as the workspace is told it: words only; where it goes and how is the runtime's. */
interface ReplyNotice {
    conversationId: string;
    subject: string;
    body: string;
    /** What the platform may be told when the workspace cannot be: no business, no words of theirs. */
    redacted: string;
}
interface ReplyReadPorts {
    /** Whose reply this is, and the reply: null when it answers no reach-out. Throws when it cannot be read. */
    reply(tenantId: string, messageId: string): Promise<ReplyFacts | null>;
    /** The reading kept for this message, if any. Throws when it cannot be read. */
    reading(tenantId: string, messageId: string): Promise<KeptReading | null>;
    /**
     * Whether one read may be spent now, taken when it may: null when it was taken, else why not (no model, a workspace
     * that may not spend, the day's reads spent). Throws when it cannot be asked.
     */
    mayRead(tenantId: string, at: number): Promise<Exclude<Unread, "model_failed"> | null>;
    /** The model's answer to the reader's question, unparsed; null when it answered nothing. Throws on a failed call. */
    ask(system: string, user: string): Promise<unknown>;
    /** The reading and its plan, applied once (reach_out_reply_apply). True when this call applied it. */
    apply(tenantId: string, messageId: string, p: {
        reading: ReplyReading;
        unread: Unread | null;
        plan: ReadingPlan;
        reread: number;
    }): Promise<boolean>;
    /**
     * The notice's first phase: this run's claim (its moment, as the row keeps it), or null when a live claim holds it or
     * it was told. A claim older than `staleBefore` is claimed again.
     */
    claimTell(tenantId: string, messageId: string, staleBefore: number): Promise<string | null>;
    /** Tell the workspace: true only when the owner was told. */
    tell(tenantId: string, notice: ReplyNotice): Promise<boolean>;
    /** The notice's second phase: marked told, only while this run's claim still holds it. */
    told(tenantId: string, messageId: string, claim: string): Promise<void>;
    /**
     * The receptionist's draft of an answer to their reply, over the thread and the lead note: the text, or which gate
     * stopped it (contracts draftRefusal) or that it was not drafted. Throws when it failed; no call runs past `deadline`.
     */
    draft(tenantId: string, ask: {
        conversationId: string;
        text: string;
        note: string;
        deadline: number;
    }): Promise<{
        text: string;
    } | {
        why: DraftWhy;
    }>;
    /** The draft's mark (reach_out_reply_draft): only from none or waiting, so a second stage never writes over the first. */
    markDraft(tenantId: string, messageId: string, mark: DraftMark): Promise<boolean>;
    /** This message's next read, or its draft, at most once per stage. */
    scheduleOnce(at: number, payload: {
        message_id: string;
        stage: string;
    }): Promise<"scheduled" | "already_scheduled">;
    /**
     * The thread's open flag of this reason resolved as the platform's own close: no member is named as resolving it and
     * no decision is recorded. True iff a row changed; false when none was open for that reason (a person resolved it
     * first, or it was replaced by another). A write that fails throws.
     */
    resolveEscalation(tenantId: string, conversationId: string, reason: typeof INTAKE_FLAG): Promise<boolean>;
    /** The thread archived (contracts' archive move, whole), unless it is archived already. True iff a row changed. A write that fails throws. */
    archiveConversation(tenantId: string, conversationId: string): Promise<boolean>;
    now(): number;
}
/** The flag the intake raises on a reach-out reply's thread (email-ingest.ts flagForAPerson): what a reading may close. */
declare const INTAKE_FLAG: "email_review";
interface ReadReplyCommand {
    tenantId: string;
    messageId: string;
    /** The job's stage: absent or "read" for the first read, "reread-<n>" for the n-th re-read. */
    stage?: unknown;
    /** How long a claim on the notice holds before another run may take it: the job's lease. */
    tellStaleMs: number;
    /** When this job stops starting work (epoch ms): a draft needs DRAFT_NEEDS_MS of it. */
    deadline: number;
}
type ReadReplyOutcome = "not_a_reply" | "already_read" | "read" | "told" | "drafted";
declare function readReply(ports: ReplyReadPorts, cmd: ReadReplyCommand): Promise<ReadReplyOutcome>;

/**
 * How long a batch that reached nobody waits before it is tried again. The
 * rest of a run is scheduled the moment a batch ends; a batch in which every
 * read failed would otherwise schedule itself again at once, and a read that
 * keeps failing would spin the ledger until somebody canceled by hand.
 */
declare const BROADCAST_STALL_RETRY_MS = 60000;
/**
 * How many batches in a row may reach nobody for a read that failed before the run stops and says so. A minute each
 * (BROADCAST_STALL_RETRY_MS), so about half an hour: a vault or a database that has not answered for that long is an
 * outage, and a run that waited through the evening would send at night the words written for the day.
 */
declare const BROADCAST_STALLS_MAX = 30;
/**
 * broadcast_send: one batch of a broadcast, then the next.
 *
 * The route enrolled the recipients, each on the channel picked for them (contracts reachFor); this sends to up to
 * BROADCAST_CHUNK of them, each on their own channel -- WhatsApp's template, a text's version, an email's version from
 * the hosted mailbox -- re-checking each person at the wire, the one place a miss is unrecoverable, and records why
 * anyone was held back. Then it schedules itself again for the rest, or closes the broadcast and tells the workspace.
 * A canceled broadcast stops at the next batch; a WhatsApp version that is no longer approved fails a run that goes by
 * WhatsApp alone before a single send; a wire that is down fails it at the first person it cannot reach.
 */
declare function sendBroadcastBatch(ports: BroadcastBatchPorts, cmd: BroadcastBatchCommand): Promise<void>;

/**
 * May an automated message go to this person, right now?
 *
 * Pure, and its one import is the pure predicate every other send path already
 * asks — which is the point of it rather than an exception to it.
 *
 * The WhatsApp handler enforces these rules as statement order across a
 * 300-line function, which works because every inbound message walks that one
 * path. The VOICE path is a second sender — the caller asks the phone agent to
 * text them a booking link — and it was assembled by hand: it checked consent
 * and stopped there. So a booking link would land in a thread a human had taken
 * over, which is the exact interruption the pause exists to prevent, and it
 * would keep landing after a workspace had switched its receptionist off.
 *
 * CONSENT IS ASKED HERE, and once. This file used to take a single `optedOut`
 * boolean and claim in this comment that "may we send" therefore had "ONE answer
 * rather than one-and-a-half". That stopped being true the moment consent became
 * two answers (00095): the broadcast wire moved to `mayMessageFor` and this path
 * did not, so the product was back to two bars decided per call site — which is
 * the defect 00095's own header names under UNDER-BLOCKING. It now takes the
 * person's consent row and the message's PURPOSE and asks `mayMessageFor`, so
 * there is one rule again and this file no longer holds a copy of it.
 *
 * WHY IT IS CORE'S. A rule the product enforces lives in packages/core (decision 0027): this one decides whether any
 * automated message may go, for whichever sender asks, so it moved here from apps/edge/lib/receptionist (4 Oct 2026),
 * unchanged, and the edge's voice path takes it through its package facade like every other rule it asks.
 */

interface OutboundFacts {
    /**
     * The person's consent row: both answers plus the do-not-contact override.
     * Passed whole rather than pre-decided, so this gate asks the question instead
     * of being handed somebody else's answer to it.
     */
    contact: PurposeBearing;
    /**
     * What kind of message this is. Required, never defaulted: the caller knows
     * what it is about to send and the gate cannot guess.
     */
    purpose: AskedPurpose;
    /**
     * True when this send STARTS a conversation. False when it answers somebody
     * who just contacted us — which is the honest reading of a caller on the line
     * asking to be texted, and the reason that send does not need a prior opt-in.
     */
    proactive: boolean;
    /** The channel the message would go out on: a yes covers the channels it was given for (consent-channels.ts). */
    channel: string;
    /**
     * What the message is about (contracts MessageAbout, decision D1): the receptionist's are theirs (the call they are
     * on, the thread they wrote in). Required, as the purpose is: by email, the business's own news asks for a yes.
     */
    about: MessageAbout;
    /** tenants.status = 'paused' (billing stopped): nothing automated goes out. */
    paused?: boolean;
    /** conversations.paused_until — a human has this thread. */
    pausedUntilMs: number | null;
    /** The mode in force — the workspace's, or the person's own when set.
     *  'auto' and 'veto' permit an unattended template send; anything else
     *  holds for a human. */
    replyMode: string;
    /**
     * The Autonomy pane's BOOKING row is not on auto.
     *
     * A separate answer from `replyMode`, because they are separate rows on that
     * pane and a workspace sets them independently. The text receptionist has
     * obeyed this row since it existed -- `layerTwo` takes the booking link back
     * out of a reply and hands the thread to a person -- while the phone agent
     * read the REPLY row and sent the link anyway. Same workspace, same request,
     * two answers.
     */
    bookingHeld: boolean;
    /** Voice-initiated sends already made to this thread today. */
    sentToday: number;
    /** The ceiling on those. */
    dailyCap: number;
    /** Clock, injected so this stays testable. */
    nowMs: number;
}
type OutboundRefusal = PurposeRefusal | "paused" | "human_has_it" | "policy_hold" | "booking_needs_a_person" | "daily_cap" | "sms_carries_no_promotions";
interface OutboundDecision {
    allowed: boolean;
    refusal: OutboundRefusal | null;
}
declare function outboundGate(f: OutboundFacts): OutboundDecision;
/**
 * What the voice agent SAYS when a send is refused.
 *
 * Spoken aloud to a caller who is waiting, so each one names an alternative
 * rather than describing our internal state. The caller must never hear "policy
 * hold" or learn that a colleague is mid-thread with them elsewhere.
 *
 * The send being refused is the booking link, which goes by WhatsApp and
 * nothing else (retell-fn.ts), so these call it a WhatsApp message and never
 * a text.
 */
declare function refusalScript(refusal: OutboundRefusal, phoneDisplay: string | null | undefined): string;

/**
 * What the booking-notice read takes the world through (docs/plans/2026-10-07-bookings-arrive-by-email.md, step 3):
 * the notice as the intake fetched it, the model, the two tables (the notices ledger and the appointments record) and
 * the person the booking is for. No database client, provider or environment inside the verb; the jobs handler binds
 * these over packages/db and the edge's model door.
 */

/** One received email as the read needs it: who sent it, its words, when it came, and the provider's id for it. */
interface NoticeEmail {
    /** The provider's id for the delivery: the ledger's key, so a repeat delivery meets its row. */
    id: string;
    from: {
        address: string;
        name: string | null;
    } | null;
    subject: string | null;
    text: string | null;
    receivedAt: string | null;
}

/** The row as the read needs it back: enough to tell a live booking from a finished one, and to move it. */
interface StoredAppointment {
    id: string;
    status: AppointmentStatus;
    /** ISO instants. */
    starts_at: string;
    ends_at: string;
    external_id: string | null;
    contact_id: string | null;
}
/** The client as a notice names them. */
interface NoticeClient {
    name: string | null;
    /** E.164. */
    phone: string | null;
    email: string | null;
}
/** A row the read writes: the booking as the notice stated it, under the one key a repeat meets. */
interface NewAppointment {
    tenantId: string;
    tool: string;
    externalId: string;
    status: Extract<AppointmentStatus, "booked" | "cancelled">;
    startsAt: string;
    endsAt: string;
    service: string | null;
    staff: string | null;
    price: string | null;
    note: string | null;
    client: NoticeClient;
    contactId: string | null;
    timezone: string;
}
/** What a read may change on a row it found: the time (a change), the status (a cancellation), what the notice restated. */
interface AppointmentPatch {
    externalId?: string;
    status?: AppointmentStatus;
    startsAt?: string;
    endsAt?: string;
    service?: string | null;
    staff?: string | null;
    price?: string | null;
    note?: string | null;
    client?: NoticeClient;
    contactId?: string | null;
}
/**
 * What became of a notice, as the ledger keeps it (appointment_notices.outcome). `dismissed` is one set aside: by a
 * person, from the held list, or by the read itself, for a tool's email that is about no booking.
 */
type NoticeOutcome = "booked" | "changed" | "cancelled" | "held" | "dismissed";
interface NoticeLedgerRow {
    outcome: NoticeOutcome;
    holdReason: NoticeHold | null;
    appointmentId: string | null;
}
interface BookingNoticePorts {
    /** Why the model may not be asked now (no key, a workspace that may not spend), or null when it may. */
    mayRead(tenantId: string, atMs: number): Promise<Extract<NoticeHold, "no_model" | "may_not_spend"> | null>;
    /** The model's answer, unparsed; null when it answered nothing usable. Throws on a failed call: the ledger's retry. */
    ask(system: string, user: string): Promise<unknown>;
    /** What the ledger already holds for this delivery, or null. */
    noticeOf(tenantId: string, noticeId: string): Promise<NoticeLedgerRow | null>;
    /** Keep what became of the notice, once per delivery: a second keep for the same delivery replaces the first. */
    keepNotice(p: {
        tenantId: string;
        noticeId: string;
        tool: string;
        fromAddress: string | null;
        subject: string | null;
        receivedAt: string;
        outcome: NoticeOutcome;
        holdReason: NoticeHold | null;
        appointmentId: string | null;
    }): Promise<void>;
    /** The row under this key (appointments_source_uq, source booking_email), or null. */
    byKey(tenantId: string, externalId: string): Promise<StoredAppointment | null>;
    /**
     * The live row (proposed or booked) this client has that starts within `withinMs` of `startMs`, soonest first, or
     * null: how a change finds the booking it moves, and a cancellation the one it ends, when the key does not.
     */
    byClientStart(tenantId: string, client: NoticeClient, startMs: number, withinMs: number): Promise<StoredAppointment | null>;
    insert(row: NewAppointment): Promise<{
        id: string;
    }>;
    /** "refused" when the row's guard would not take the move (a finished appointment cancelled): nothing changed. */
    update(tenantId: string, id: string, patch: AppointmentPatch): Promise<"updated" | "refused">;
    /**
     * The person this booking is for, matched or made by the calendar sweep's own rules (a number makes a person, a name
     * fills only an empty one, an erased person is not brought back); null when the notice names no number and nobody
     * holds its address. `visit` is what the person's first event says of where they came from.
     */
    personFor(tenantId: string, client: NoticeClient, visit: {
        title: string;
        uid: string;
        startMs: number;
    }): Promise<string | null>;
    now(): number;
}

/**
 * booking_read: one booking tool's notice, read into the appointments record (docs/plans/
 * 2026-10-07-bookings-arrive-by-email.md, step 3).
 *
 * The intake recognised the tool and scheduled this once per delivery. Here the model reads the notice into one shape
 * (contracts NOTICE_SCHEMA), the answer is held to that shape strictly (noticeAnswerOf), and the booking it states is
 * written under the one key a repeat meets (appointmentKey): a booking is a row, a change moves the row the old time
 * named, a cancellation ends the row the time names. A notice that cannot be read whole is kept on the ledger with the
 * reason and held for a person; nothing is dropped and nothing is invented. A tool's email that is about no booking (a
 * receipt, a digest, its newsletter, a confirmation written to a client about a visit somewhere else) is kept on the
 * ledger and set aside: nobody is asked to look at one. The receptionist is not a source: a notice is the tool's word
 * about a booking the tool made.
 *
 * It resumes. The ledger's row is written last, so a run that died after the appointment was written finds the row by
 * its key on the next try and writes it again in place; a run that died before writes it then. A delivery the ledger
 * already holds as read is answered `already` and pays nothing; one it holds as held is read again, since a held read
 * may have been the model's absence rather than the notice's shape.
 *
 * A time that was withdrawn and is booked again. A visit's key is its tool, its client and its start, so a client who
 * cancels Thursday at three and books Thursday at three again states the key of a row that has ended, and a row that
 * has ended does not come back (the table's guard). The ended row leaves the key (asideKey) and the visit is written
 * anew under it, for a time still ahead: left as it was, the time would be offered to someone else.
 */

interface ReadBookingNoticeCommand {
    tenantId: string;
    /** The business's zone: the notice's clock times are its own. */
    tz: string;
    tool: BookingTool;
    email: NoticeEmail;
}
/** What one run came to, for the log. */
type ReadBookingNoticeOutcome = "already" | "booked" | "booked_again" | "changed" | "changed_unknown" | "cancelled" | "cancelled_unknown" | "cancel_refused" | "set_aside" | `held:${NoticeHold}`;
declare function readBookingNotice(ports: BookingNoticePorts, cmd: ReadBookingNoticeCommand): Promise<ReadBookingNoticeOutcome>;

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
    /** The channels the run may go by (contracts reach-for.ts): `broadcasts.channels`, each person on one of them. */
    channels: string[];
}
/** One person on the run, with the words their row keeps for the slots (a visit run's), or none. */
interface NewRecipient {
    contact_id: string;
    facts: Record<string, string> | null;
    /** The channel the run reaches them on, picked once at enrolment (contracts reachFor): `broadcast_recipients.channel`. */
    channel: string;
}
/** Who asked: the sweep (system) or a person (their decision, sends now unless the class is never). */
type RunBy = {
    kind: "system";
} | {
    kind: "user";
    userId: string;
};
/**
 * Whose decision a run's send is, and what the ledger keeps of it: a member's (a broadcast's composer, a Run now) or the
 * system's (the sweep's, under the mode the owner chose). Written with the run, in its transaction.
 */
interface AssembleDecision {
    by: RunBy;
    payload: Json;
}
/** The run made: its id, and its decision's when one was asked for (null for a run that waits for a person). */
interface AssembledRun {
    id: string;
    decisionId: string | null;
}
interface AssemblePorts {
    /**
     * The run, its people, its send job when `sendAt` is set and the send_broadcast decision on it when `decision` is
     * given, written whole in one transaction (00373 assemble_broadcast): the run's id back with the decision's, or a
     * throw, and then nothing was written. A run that waits for a person is made with no decision: its approval is its
     * decision (ApproveRunPorts).
     */
    assemble(row: NewBroadcast, recipients: NewRecipient[], sendAt: Date | null, decision: AssembleDecision | null): Promise<AssembledRun>;
    /**
     * How many campaign emails or texts the workspace sent on this channel in the calendar month `at` falls in, in its zone,
     * that left, may have left or wait to go (packages/db campaignMonthSent): what that month's allowance has spent (contracts
     * CAMPAIGN_MONTH_ALLOWANCE). `at` is the moment the run opens, which is when its people are counted against the month: a
     * broadcast made on the 28th for the 1st counts against the new month, not the one it was made in, and a playbook's run
     * against the month of the moment it goes. Required, so no caller counts the month it was made in by leaving it out.
     * Throws when it cannot be counted.
     */
    monthSent(channel: "email" | "sms", at: Date): Promise<number>;
    /**
     * People of a run just assembled, held at once: each still queued is skipped, with `reason`, as the send would have
     * held them (allowance.ts). A person already settled is left as it is. Throws when it cannot be written, and then the
     * people stay queued, which the send's own check holds all the same.
     */
    holdRecipients(broadcastId: string, contactIds: string[], reason: string): Promise<void>;
}
interface AssembleCommand {
    broadcast: NewBroadcast;
    recipients: NewRecipient[];
    sendAt: Date | null;
    /**
     * The people of `recipients` the month's allowance already holds (allowance.ts pastTheMonth), by contact: they are
     * enrolled with everyone, and held the moment the run exists, so its report says so before anything is sent.
     */
    held: readonly string[];
    /** Whose decision the send is, kept with the run; none for a run that waits for a person. */
    decision: AssembleDecision | null;
}
/**
 * The run made (its id, and its decision's when one was asked for), or why not. `unheld` is how many of the people to
 * hold at enrolment could not be written as held: they are queued, and the send holds them at the wire, so nothing is
 * lost; the run's record says so.
 */
type Assembled = {
    ok: true;
    id: string;
    decisionId: string | null;
    unheld: number;
} | {
    ok: false;
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
    /** The list of the workspace's own a saved_list playbook runs on (00155); null otherwise, and when it was deleted. */
    list_id?: string | null;
    /** The People list a saved_list playbook runs on, by its id (00168); null otherwise. */
    list_key?: string | null;
    /** The channels it may go by (`playbooks.channels`); absent or empty on a row made before: WhatsApp alone. */
    channels?: string[] | null;
}
/** The workspace as the run reads it once per tenant: the people, the modes, the number, the touches, the calendar. */
interface RunContext {
    tz: string;
    now: Date;
    people: PersonRowVM[];
    modes: Map<string, string>;
    health: NumberHealth;
    /**
     * What the workspace can send on now, channel by channel (contracts channelsReady): its WhatsApp number's health, its
     * texting line, its mailbox. The message's own versions are not in it: the run puts them in (message-channels.ts).
     */
    ready: ChannelsReady;
    /** When each person last heard from each playbook, from any, and had a proposal follow-up; contact id → ms. */
    touches: {
        byThis: Map<string, Map<string, number>>;
        byAny: Map<string, number>;
        followUps: Map<string, number>;
        /** The latest follow-up by person and by what it was about (contracts followUpKey, 0029): which proposals had theirs. */
        followUpKeys: Map<string, Map<string, number>>;
    };
    /** The workspace's calendar: a visit playbook runs only when it is "ok". */
    calendar: "ok" | "unavailable" | "none";
    /** Each person's next and last visit from that calendar, for the words a visit run keeps. */
    visits: Map<string, PersonVisitsDto>;
    /**
     * Who is on a list a saved_list playbook runs on, by its reference (contracts lists.ts membersOf, with no one
     * looking): its people, or why it can't be counted; null when it is gone.
     */
    listMembers(ref: ListRef): (Membership & {
        rule?: unknown;
    }) | null;
    /** Deals are on here (dealsAreOn, 0008): the proposal follow-up runs only then (0006). */
    dealsOn: boolean;
    /** The workspace's pace (contracts dealPaceOf): when a proposal waits, for the follow-up; null without one. */
    pace: DealPaceVM | null;
}
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
    skipped: "never" | "template_not_approved" | "number_flagged" | "already_ran_today" | "no_calendar" | "no_list" | "list_uncounted" | "deals_off";
} | {
    outcome: "failed";
    error: string;
};
interface RunPlaybookPorts extends AssemblePorts {
    /**
     * The message of this name and language, as the rows the workspace holds of it now, whatever their channel (db
     * messageVersionRowsOf): WhatsApp's as Meta has it, and the email's and the text's, written here and approved the
     * moment they were saved. contracts campaignMessageOf picks the versions out of them: which of the playbook's ticks the
     * message can be said on, and its category, its purpose, which the run enrols by with its moment's class (contracts
     * enrolPurpose). None when it has no row (gone). Throws when it cannot be read: unreadable is not withdrawn, and a
     * version that could not be looked for is not one the workspace lacks.
     */
    message(name: string, language: string): Promise<MessageVersionRow[]>;
    /** Whether a run for this local day was already made (the unique index's fact, read first). */
    alreadyRan(playbookId: string, runFor: string): Promise<boolean>;
    /** The run recorded: the event, and the playbook's last run. Never throws. */
    record(playbookId: string, runFor: string, at: Date, data: Record<string, unknown>): Promise<void>;
    /**
     * The owner told that a run waits for them, or goes by itself unless they stop it, with the run it is about: the bell's
     * row and the phone open THAT run, where its Approve, Skip and Stop are. It named none, and opened Campaigns' home.
     */
    notify(subject: string, body: string, runId: string): Promise<void>;
}
interface RunPlaybookCommand {
    playbook: PlaybookRow;
    ctx: RunContext;
    /** The local day the run is for; one run per playbook per day. Read from the clock when absent. */
    runFor?: string;
    by: RunBy;
}
interface TemplateValuesPorts {
    /**
     * The rows of the message this id names, whatever their channel (db messageVersionRowsOf, by id): the version the id
     * belongs to and its siblings on the other channels, WhatsApp's as Meta has it, an email's and a text's as they were
     * written here. Any version's id names the message, and contracts campaignMessageOf picks its versions out of the rows.
     * `[]` when this workspace holds no such version. Throws when it cannot be read: unreadable is not absent.
     */
    message(id: string): Promise<MessageVersionRow[]>;
    /** The booking link on file, or null. */
    bookingLink(): Promise<string | null>;
}
/** A run or broadcast as the route's scope loaded it. */
interface BroadcastRef {
    id: string;
    tenant_id: TenantId;
    state: string;
    name: string;
    recipient_count: number | null;
    playbook_id: string | null;
    run_for?: string | null;
    /** Who the run is for; a reach-out's says so (contracts isReachOutRun). */
    audience?: unknown;
    /** When it is set to go: a reach-out's first send. */
    scheduled_for?: string | null;
}
/** A list as a send reads it: its people, or why it can't be counted. */
type ListCount = {
    label: string;
    memberIds: string[];
    rule?: unknown;
} | {
    label: string;
    unknown: string;
};
interface CreateBroadcastPorts extends AssemblePorts, TemplateValuesPorts {
    /** The business's clock, for the hours a send may go out in. */
    timezone(): Promise<string>;
    /** Everyone, with their visits as of now, the way the People page counts them. */
    people(now: Date): Promise<PersonRowVM[]>;
    /**
     * One list, resolved and counted the one way (contracts lists.ts resolveList, membersOf): a built-in or a saved list,
     * its name and who is on it -- or, when it can't be counted here (a calendar that was not read, a rule this build
     * cannot read), its name and why, in the page's words. Null when there is no such list here.
     */
    list(ref: ListRef, now: Date): Promise<ListCount | null>;
    /**
     * What the workspace can send on now (contracts channelsReady), and the active WhatsApp number's health as Meta rated
     * it (null when none is connected): one read of the rows each is judged by.
     */
    channels(): Promise<{
        ready: ChannelsReady;
        health: NumberHealth | null;
    }>;
}
interface CreateBroadcastCommand {
    userId: string;
    body: unknown;
    now: Date;
}
interface ApproveRunPorts {
    /** The business's clock, for the hours a send may go out in. */
    timezone(): Promise<string>;
    /** Whether the workspace is paused (`tenants.status = 'paused'`): nothing is approved while it is. Throws when it cannot be read. */
    paused(): Promise<boolean>;
    /**
     * The run released for `at` (pending_approval → scheduled, the row carrying the time its job carries: 00119), its
     * send job written when `job` says so, and the approval recorded as the approver's with `decision` as its payload,
     * in one transaction (00353 approve_broadcast): the decision's id. Null when the run was no longer waiting, and then
     * nothing was written. Throws when it failed, and then nothing was written either: the run waits, as it was.
     */
    approve(broadcastId: string, at: Date, o: {
        job: boolean;
        decision: Json;
    }): Promise<string | null>;
}
interface CancelBroadcastPorts {
    /** The scheduled send withdrawn from the ledger; how many jobs. */
    withdraw(broadcastId: string): Promise<number>;
    /** → canceled, only from the state the row was read in. True iff a row changed. */
    cancel(broadcastId: string, fromState: string): Promise<boolean>;
    record(subject: DecisionSubject, id: string, verb: DecisionVerb, payload: Json): Promise<string>;
}

/**
 * A run's assembly, the one implementation: the broadcast row, the people on it, the send job when the plan sends now
 * or later, and the decision to send when one is given, in one transaction (00282 assemble_broadcast, with its
 * decision since 00373). All are written or none is, so no run is left with no people, no people with no job to send
 * to them, and no run sending with nothing in the ledger saying who said so; a function that dies halfway leaves
 * nothing to clean up. It was three writes with a compensating fail between them, then the ledger's line after, and a
 * death between two left a broadcast that showed as scheduled and that nothing would ever send, or one the route
 * answered with a 500 that a person presses again. The caller decides what a failure means to whoever asked: the
 * sweep counts it, a person is told.
 *
 * Whom the month's allowance already holds (`cmd.held`) is written as held once the run exists, not before: the run's
 * people are enrolled whole and the held are skipped in their own write, so a write that fails leaves them queued and
 * the send holds them at the wire (overAllowance), which is the backstop. It never fails the run, but it is never silent:
 * the failure is logged (`campaign_hold_unwritten`) and the answer says how many were left unheld (`unheld`), which the
 * caller records beside what it did hold, so a receipt never claims a hold that was not written.
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
 * longest-unheard first, at most the cap. Each is reached once, on the first
 * of the playbook's channels the workspace can send on and the message has a
 * version on (contracts reachFor); a person none of them reaches is held, and
 * counted by why, never moved to another channel. What the run then does is the
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
 * Which channels a campaign may go by, once its message is in view (One message, every channel, step 3; the
 * campaigns-on-every-channel spec, 4.4 and 4.10).
 *
 * A channel is usable for a send only if the workspace is ready on it (contracts reach-for.ts `channelsReady`: its
 * number, its texting line, its mailbox) AND the message holds a version there (contracts messageHolds: WhatsApp's row
 * approved and whole, and for email and text a row of the same name and language on that channel). Contracts'
 * `readyForMessage` puts the second into the first; what is here is which channels a request ticks and the refusal of a
 * tick the send cannot keep.
 */

/**
 * The channels a request ticks: `channels` as the body names them, WhatsApp alone when it names none (so nothing made
 * before changes), in the product's order (contracts CONSENT_CHANNELS). Anything but a list of the three is refused.
 * `kept` is the channels a playbook already holds, which an edit that names none keeps.
 */
declare function parseChannels(asked: unknown, kept?: readonly string[] | null): ConsentChannel[];

/**
 * The message a version's id names, read once from the rows this workspace holds of it (contracts campaignMessageOf):
 * the one verb a broadcast, a playbook and Ask's proposals read a message by. The id is any version's, WhatsApp's or an
 * email's or a text's, and names the same message; a message needs no WhatsApp row. Refused: an id that is not one
 * ("Pick a template.") and a version this workspace does not hold ("Template not found.", a 404). Whether a channel can
 * send the message is each tick's to say (message-channels.ts), so a version WhatsApp has not approved is no refusal here.
 */
declare function readCampaignMessage(ports: Pick<TemplateValuesPorts, "message">, id: string): Promise<CampaignMessage>;
/**
 * The message and the values as its channels will accept them: what a broadcast and a playbook both name, judged once.
 * As many values as the message takes (contracts' one count, whichever version carries it); each typed text once or a
 * value the job fills per person; a booking-link slot needs a link on file. Every refusal is a sentence for the person
 * composing.
 */
declare function templateValues(ports: TemplateValuesPorts, 
/** `visits`: a visit playbook, whose run knows each visit; `proposal`: the follow-up, whose run knows each link. */
cmd: {
    templateId: string;
    params: unknown;
    visits: boolean;
    proposal: boolean;
}): Promise<{
    message: CampaignMessage;
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
    /**
     * How many of the people enrolled the month's allowance already holds, as written on the run (allowance.ts): held and
     * said so. A hold that could not be written is not counted: that person is queued and held at the wire, and the log
     * says so (`campaign_hold_unwritten`); the ledger's line says how many the month holds.
     */
    held_for_allowance: number;
    decision_id: string;
}
/**
 * The channels a send goes by as its message can carry them, and the WhatsApp number's health the day's limit is judged
 * by: the workspace's channels now (its number, its texting line, its mailbox) with the versions the message holds laid
 * over them (contracts readyForMessage), WhatsApp's among them: a version WhatsApp has not approved is no
 * version to send. Refuses nothing: a playbook keeps a tick that cannot send yet, and Ask counts a proposal by it.
 */
declare function campaignHow(ports: Pick<CreateBroadcastPorts, "channels">, message: Pick<CampaignMessage, "versions">, channels: ConsentChannel[], 
/** What the message is about: a broadcast's is ours, a visit or proposal moment's theirs (contracts MessageAbout). */
about: MessageAbout): Promise<{
    how: CampaignHow;
    health: NumberHealth | null;
}>;
/**
 * The channels this send may go by, and the WhatsApp number's health the day's limit is judged by. A tick the workspace
 * cannot send on, or whose message has no version, or that the purpose never carries, is refused here and now (spec
 * 4.10), in the words of contracts channelChoices -- before the people are read, which is the costly read. The number's
 * health is held to only when WhatsApp is ticked: a send that does not tick it never asks.
 *
 * The one rule for a broadcast's ticks: the route asks it, and so does Ask before it proposes one, so a card the route
 * would refuse is never shown.
 */
declare function campaignHowOf(ports: Pick<CreateBroadcastPorts, "channels">, message: Pick<CampaignMessage, "versions">, channels: ConsentChannel[], purpose: AskedPurpose): Promise<{
    how: CampaignHow;
    health: NumberHealth | null;
}>;
/**
 * A person's broadcast: one message to the people who said yes.
 *
 * { template_id, params, audience: { kind, id }, channels?, scheduled_for?, name? }.
 * `template_id` is any version of the message, and the message needs no WhatsApp
 * version: each channel ticked needs only its own (WhatsApp's approved by Meta, an
 * email's and a text's written here), and a tick whose version the message does not
 * hold is refused with that version's standing; the values must fill the message's
 * slots; the audience is one of People's lists, a list kept by hand, or everyone —
 * crossed with who said yes and a way to reach them, for the yes this message's
 * category needs. It goes by WhatsApp, text or email (`channels`, WhatsApp alone
 * when none is named), each person once, on the first channel the send can reach
 * them on (contracts reachFor), written on their row. The recipients are enrolled
 * now, so the owner sees who and how many; the job re-checks each person at the
 * wire. The ledger records the decision to send, in the run's own write. The body is judged here, in
 * sentences for the person composing: the values are judged against the message
 * the workspace holds, which no schema knows.
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
 * recipients are enrolled, nothing is scheduled. Approving releases the run,
 * schedules its send and records the decision as the approver's, in one
 * transaction (00353): any of the three that cannot be written leaves the run
 * waiting, as it was. Skipping is the cancel. A paused workspace sends
 * nothing, so nothing is approved in it.
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
    /** The list of the workspace's own a saved_list playbook runs on; null for every other trigger. */
    list_id: string | null;
    /** The People list a saved_list playbook runs on, by its id (00168); null otherwise. Never both. */
    list_key: string | null;
    template_id: string;
    template_name: string;
    template_language: string;
    params: ParamSpec[];
    policy_class: PlaybookPolicyClass;
    run_hour: number;
    cap_per_run: number;
    gap_days: number;
    cadence_days: number;
    /** The channels it may go by: WhatsApp alone when none is named (an edit that names none keeps the ones it has). */
    channels: ConsentChannel[];
}
/** What a playbook's check reads beyond its message: the name of a list it runs on, or null when there is none. */
interface CheckPlaybookPorts extends TemplateValuesPorts {
    listName(id: string): Promise<string | null>;
    /** Whether deals are on here (dealsAreOn, 0008): a proposal follow-up is made only then (0006). */
    dealsOn(): Promise<boolean>;
    /**
     * Whether a calendar is connected here, its feed readable just now or not (the Playbooks page's calendar state is not
     * "none"): which of the two win-backs a new playbook may be (contracts momentOffered).
     */
    calendarOn(): Promise<boolean>;
}
/**
 * A playbook's channels alone, changed (the review of 8 October 2026): what the Goes by row of its drawer and Ask's card
 * ask for. They are judged against the playbook as it stands, its own class and its own message read from its row, the
 * way a save judges them (channelsItMayGoBy), and nothing else of it is taken from the caller, so nothing else can be
 * written back. A whole playbook re-sent to change one tick wrote a caller's copy of every other field over whatever
 * had been edited since, and re-derived its class. `asked` must be a list: this door exists to name them.
 */
declare function checkPlaybookChannels(ports: Pick<TemplateValuesPorts, "message">, row: {
    trigger: string;
    policy_class: string | null;
    template_id: string | null;
    channels: string[] | null;
}, asked: unknown): Promise<ConsentChannel[]>;
/**
 * Everything a playbook names, checked the way a broadcast is: the trigger,
 * then the message and its values through the one judgement, then the
 * whole numbers. A playbook can never name a message a broadcast could not
 * send or a slot the workspace cannot fill. `existing` is the playbook being changed, null for a new one.
 */
declare function checkPlaybook(ports: CheckPlaybookPorts, body: Record<string, unknown> | null, existing: {
    trigger: string;
    channels?: string[] | null;
} | null): Promise<PlaybookInput>;

declare const reachOutRunIdFor: (stepId: string, runFor: string) => Promise<string>;
declare const sendIdFor: (runId: string, leadId: string) => Promise<string>;
declare const sendMessageId: (sendId: string, attempt: number) => Promise<string>;
/** The team's step a hand step makes for a lead (Part 5, G20): once per step and lead, whichever day's run reaches it. */
declare const handStepIdFor: (stepId: string, leadId: string) => Promise<string>;

/**
 * What assembling a reach-out step's run needs (Part 3), as ports: the edge's run context builds them over the database
 * (apps/edge lib/reach-out/run-context.ts); tests build them from arrays.
 */

interface ReachOutStep {
    id: string;
    /** The chain's first step: the step's own id for a root, its parent's root for a later step. */
    root_id: string;
    tenant_id: string;
    name: string;
    trigger: "lead_first" | "after_step";
    /** The chain's: paused when the step or its root is (a paused root pauses every step of it). */
    state: "running" | "paused";
    lead_search_id: string | null;
    /** The chain's (its root's): its catch-all addresses are written to too, as its owner chose (Part 4, F9). */
    include_unconfirmed: boolean;
    after_playbook_id: string | null;
    after_days: number | null;
    gap_minutes: number;
    domain_ids: string[];
    cap_per_run: number;
    template_id: string;
    template_name: string;
    template_language: string;
}
/** What a later step's leads are read by (reach_out_followers): an email step's, or a hand step's. */
type FollowedStep = Pick<ReachOutStep, "id" | "after_playbook_id" | "after_days" | "cap_per_run">;
/**
 * A chain's last step that hands each lead it reaches to the team (Part 5, G20): an email step's shape without its
 * template, and with its hand.
 */
interface HandStep extends Omit<ReachOutStep, "template_id" | "template_name" | "template_language"> {
    hand: StepHand;
}
/** One lead a hand step hands over, as the door takes it (00228 reach_out_hand_run). */
type HandItem = {
    send_id: string;
    lead_id: string;
    contact_id: string;
    words: string;
    source_id: string;
};
/** What a hand step's run reads and writes, over the database on the edge and arrays in tests. */
interface HandStepPorts {
    followers(step: FollowedStep): Promise<ReachOutFollower[]>;
    /** The businesses' names, by lead id: what the team's step calls each. */
    businessNames(leadIds: string[]): Promise<Map<string, string>>;
    /** The run, a handed send per lead and each lead's step, written whole: how many made, how many it had already. */
    handRun(p: {
        stepId: string;
        runId: string;
        day: string;
        items: HandItem[];
    }): Promise<{
        made: number;
        already: number;
    }>;
}
interface ReachOutLead {
    lead_id: string;
    region: string | null;
    hours: unknown;
    /** Known for a later step's leads (their person was made at the first send); null for a first step's. */
    contact_id?: string | null;
}
interface ReachOutFollower extends ReachOutLead {
    contact_id: string;
    /** The lead's own facts (outreach_lead_facts): the answer the send door will give about them. */
    facts: {
        lead_stage: string | null;
        suppressed: boolean;
        wrote_back: boolean;
        away?: boolean;
        stopped?: boolean;
    };
    /** Any email of the chain to them bounced or failed for good (C4). */
    bounced: boolean;
}
interface NewReachOutRun {
    /** Its step and its day (reachOutRunIdFor): a replay meets its own run. */
    id: string;
    tenant_id: string;
    playbook_id: string;
    run_for: string;
    name: string;
    template_id: string;
    template_name: string;
    template_language: string;
    state: "pending_approval" | "scheduled";
    scheduled_for: string;
    recipient_count: number;
    audience: {
        kind: "reach_out";
        root_id: string;
        step_id: string;
        search_id: string | null;
    };
}
/**
 * One lead in a run: planned, with its time and domain; or skipped, with why, so a lead the step may never write to
 * (the door refuses it, or it keeps no open hour all week) leaves the step's page rather than heading it every day.
 */
type PlannedSend = {
    id: string;
    tenant_id: string;
    broadcast_id: string;
    playbook_id: string;
    root_id: string;
    lead_id: string;
    contact_id: string | null;
} & ({
    state: "planned";
    domain_id: string;
    send_at: string;
    reason?: null;
} | {
    state: "skipped";
    domain_id: null;
    send_at: null;
    reason: string;
});
interface ReachOutRunPorts {
    now(): number;
    /** The workspace's zone: a lead whose state has no zone keeps the business's hours. */
    workspaceZone: string;
    /** The workspace's policy for the class outreach: veto | ask | never (contracts POLICY_CLASS_MODES.outreach). */
    mode: "veto" | "ask" | "never";
    /** Whether the workspace may spend (contracts maySpend): cold email is a cost on the platform's account. */
    maySpend: boolean;
    alreadyRan(stepId: string, runFor: string): Promise<boolean>;
    /**
     * waiting: a run of the chain waits for its owner (its first, or any under ask), and nothing more is made until they
     * answer it; approved: one went ahead without its owner's yes being owed; none: neither, so the next run asks.
     */
    chainState(rootId: string): Promise<"none" | "waiting" | "approved">;
    audience(step: ReachOutStep): Promise<ReachOutLead[]>;
    followers(step: FollowedStep): Promise<ReachOutFollower[]>;
    /** The step's verified domains, each with its day's share and the times it already spends (db capacity). */
    domains(step: ReachOutStep): Promise<TimetableDomain[]>;
    /**
     * The run and its sends, written whole (db reach_out_plan_run): never a run with nothing planned in it. "exists" when
     * this step already has its run for the day.
     */
    planRun(run: NewReachOutRun, sends: PlannedSend[]): Promise<{
        id: string;
    } | "exists">;
    /**
     * The run, on the record: its event, and when it goes without its owner's yes, the system's decision under the mode
     * the owner chose (as a moment's run records one). An owner's yes records theirs when they approve it.
     */
    recordRun(run: NewReachOutRun, counts: {
        planned: number;
        skipped: number;
    }): Promise<void>;
    notifyWaiting(runId: string, planned: number, firstAt: number): Promise<void>;
}
type ReachOutRunOutcome = {
    outcome: "sent";
    planned: number;
} | {
    outcome: "held";
    reason: "waiting_for_you" | "no_domain" | "no_room" | "billing";
    planned: number;
} | {
    outcome: "empty";
    reason: "already_ran" | "nobody";
    planned: 0;
} | {
    outcome: "off";
    reason: "paused" | "never";
    planned: 0;
};

declare function runReachOut(ports: ReachOutRunPorts, step: ReachOutStep, cmd: {
    runFor: string;
}): Promise<ReachOutRunOutcome>;

declare function runHandStep(ports: HandStepPorts, step: HandStep, cmd: {
    runFor: string;
}): Promise<ReachOutRunOutcome>;

/**
 * The mark we keep (D6, 00161): the bytes of a business's logo, judged before we store a copy.
 *
 * mark.ts reads WHICH address a site calls its mark; this file reads what came back from it. A logo drawn straight off
 * the business's own site never shows: the dashboard's content policy lets images in from three hosts, and a hundred
 * shops' sites are a hundred more. So the collect asks for the bytes once, and a copy we hold is what every row draws.
 *
 * Before a copy is kept it has to be an image a browser draws, big enough to be sharp in a tile, and not a banner:
 *   - PNG, JPEG, WebP, GIF or ICO, read from the bytes themselves and never from what the server called them. An SVG
 *     can carry script and a HEIC draws in one browser, so neither is kept.
 *   - Its shorter side at least MARK_MIN_SIDE: the peek draws the mark at 96px, and on a phone's screen that is 288
 *     pixels of glass. A sixteen-pixel favicon blown up to that is mush, and the photograph under it is better.
 *   - Its longer side at most MARK_MAX_RATIO times the shorter: a wordmark four times as wide as it is tall is a thin
 *     line inside a square tile. The page's next candidate (a home-screen icon, which is square) is tried instead.
 *   - No more than MARK_MAX_BYTES: a logo is a few kilobytes, and a megabyte "logo" is a photograph.
 *
 * Nothing here decodes an image. Each format says its size in its first few dozen bytes, and those are all we read.
 */
type MarkKind = "png" | "jpg" | "webp" | "gif" | "ico";
interface MarkImage {
    kind: MarkKind;
    /** What the copy is served as: ours, from the bytes, never the site's header. */
    contentType: string;
    width: number;
    height: number;
}
declare const MARK_MIN_SIDE = 64;
declare const MARK_MAX_RATIO = 2;
declare const MARK_MAX_BYTES: number;
/** What the bytes are and how big they say they are, or null for anything that is not one of the five. */
declare function imageHeaderOf(bytes: Uint8Array): MarkImage | null;
/** The image worth keeping as this lead's mark, or null: the three rules above, over the bytes as they came. */
declare function markImageFrom(bytes: Uint8Array): MarkImage | null;

/**
 * The lead finder's view of the world (PRD §12.5): what the runner needs,
 * named for what each means. The database half is one method per service
 * RPC of migration 00140 plus a few reads (apps/edge/lib/leads/lead-db.ts, service
 * role); the provider and the judge are the channels package's clients, bound
 * by the edge where the keys are (apps/edge/lib/leads/lead-wires.ts). Every verb
 * here runs over fakes in a test: no network, no database.
 */

/** The question after the probe, as lead_rounds.question keeps it (PRD §7.2, P4): contracts' LeadQuestion with when it was asked. */
interface RoundQuestion {
    sentence: string;
    criterionKey: string;
    dropTerm: string | null;
    asked_at: string;
}
interface LeadRoundRow {
    id: string;
    tenant_id: TenantId;
    search_id: string;
    seq: number;
    purpose: LeadRoundPurpose;
    plan: LeadSearchPlan;
    plan_version: number;
    target: number;
    state: LeadRoundState;
    ending: LeadRoundEnding | null;
    /** The ending the collect left for lead_check_commit to apply on the last batch. */
    ending_pending: LeadRoundEnding | null;
    question: RoundQuestion | null;
    answered: "keep" | "include" | "stop" | null;
    waiting_since: string | null;
    allowance_reserved: number;
    allowance_used: number;
    cost_reserved_usd: number;
    cost_usd: number;
    judge_tokens: number;
    /** The counter rows this round reserved in: the workspace's month and day, and the platform's day in UTC. */
    month: string;
    day: string;
    platform_day: string;
}
interface LeadRunRow {
    id: string;
    tenant_id: TenantId;
    round_id: string;
    purpose: "discover" | "check";
    term: string | null;
    actor: string;
    build: string;
    apify_run_id: string | null;
    dataset_id: string | null;
    state: LeadRunState;
    claimed_by: string | null;
    claimed_at: string | null;
    lease_owner: string | null;
    lease_gen: number;
    lease_until: string | null;
    read_offset: number;
    items_seen: number;
    cap_usd: number | null;
    usage_usd: number;
    created_at: string;
    finished_at: string | null;
}
/** A member of the round with the facts of its lead the runner reads back (the probe's yield, the center, the emails to check). */
interface LeadMemberRow {
    lead_id: string;
    class: LeadMemberClass;
    excluded_by: string | null;
    fit: LeadFit | null;
    reason: string | null;
    distance_m: number | null;
    counted: boolean;
    judgment: unknown;
    lat: number | null;
    lng: number | null;
    /** What the contact standard reads: the phone kept, and the address picked for the mailbox check. */
    phone: string | null;
    email: string | null;
    email_state: LeadEmailState;
    /** The term of the run that found it, from the judgment. */
    term: string | null;
    /** The place the source listed it as, for reading it again (an answer's re-judge); null once blanked. */
    place_id: string | null;
    /** The owner decided it (Keep, Put back, Exclude) or has worked the lead: nothing the engine decides overrides it. */
    decided: boolean;
}
/** The columns of `leads` the runner writes (PRD §12.4, Appendix B). */
interface LeadColumns {
    place_id: string;
    business_name: string;
    category: string | null;
    street: string | null;
    city: string | null;
    region: string | null;
    postal_code: string | null;
    country: string;
    lat: number | null;
    lng: number | null;
    website_host: string | null;
    /**
     * Whether the website is that host's root (00237): a page under a host (an ISP's "/~joe/") is no proof the host is
     * the business's own, so a no from it never closes the host's whole domain.
     */
    website_root: boolean | null;
    instagram_url: string | null;
    /** The neighbourhood the listing names (D5, 00146): "Hawthorne", for the row's one line about where. */
    neighborhood: string | null;
    /** The business's own mark (D6, 00147): the logo its home page declares. Null without a site, or when it declared none. */
    logo_url: string | null;
    /**
     * The copy of that mark we keep (00161): `<sha256>.<ext>` in the public lead-marks bucket, stored once its bytes
     * passed mark-image.ts. What every tile draws; the site's own address is only where it came from.
     */
    mark_path: string | null;
    /** What the listing shows about the business (D2, 00144): written for a lead, null or empty for a left-out place. */
    about: string | null;
    hours: {
        day: string;
        hours: string;
    }[];
    image_url: string | null;
    price: string | null;
    reviews_dist: {
        one: number;
        two: number;
        three: number;
        four: number;
        five: number;
    } | null;
    facebook_url: string | null;
    linkedin_url: string | null;
    tiktok_url: string | null;
    claimed: boolean | null;
    maps_url: string | null;
    rank: number | null;
    phone_e164: string | null;
    phone_sources: number;
    email: string | null;
    email_alternates: {
        email: string;
        why: string;
    }[];
    email_state: LeadEmailState;
    rating: number | null;
    reviews: number | null;
}
/** A shared detail, looked up and marked, never merged on (decision 25): with a lead, a person, or a place found in the same batch. */
interface LeadShare {
    kind: "phone" | "email" | "host";
    lead_id?: string;
    contact_id?: ContactId;
    place_id?: string;
}
/**
 * What a member's judgment jsonb holds: the judge's answer for this place, the
 * operation that paid for it, the term that found it, and the reason tokens
 * code decided the class from (contracts' LeadClassification.reasons, which
 * lead_check_commit reads to find "the email was the only reason").
 */
interface MemberJudgment {
    op_id: string | null;
    term: string;
    answer: JudgePlaceAnswer | null;
    model: string | null;
    reasons: string[];
    /** The version of the plan the class was decided under; absent is 1. An answer that changed the plan re-judges below it. */
    plan_version?: number;
    /** What each key asked when the judge answered (contracts judgeAsked): an answer is reused only for the same question. */
    asked?: Record<string, string>;
}
interface CollectPlace {
    place: LeadColumns;
    member: {
        judgment: MemberJudgment;
        class: LeadMemberClass;
        excluded_by: string | null;
        fit: LeadFit | null;
        reason: string;
        distance_m: number | null;
    };
    duplicate_of_place_id: string | null;
    shares: LeadShare[];
}
interface CollectJudgment {
    op_id: string;
    batch: number;
    request_hash: string;
    answer: unknown;
    model: string;
    tokens: number;
}
/**
 * One page, as lead_collect_commit takes it: everything a commit writes, in
 * one call (E4). `round.ending` ends the round inline; `round.ending_pending`
 * leaves the ending for lead_check_commit's last batch; `round.target` raises
 * the round's target once the probe passed.
 */
interface CollectPage {
    judgment: CollectJudgment | null;
    places: CollectPlace[];
    /** The run's usage as the provider reports it now; the commit settles the difference from the row. */
    usage_usd: number;
    items_seen: number;
    run_state: LeadRunState | null;
    next: {
        kind: "lead_collect";
        seq: string;
        run_after_seconds: number;
    } | null;
    /** `nearby` (D3): where to look next when the round ran dry, written with the ending it belongs to. */
    round: {
        state: LeadRoundState | null;
        question: RoundQuestion | null;
        ending: LeadRoundEnding | null;
        ending_pending?: LeadRoundEnding;
        target?: number;
        nearby?: LeadArea[];
    } | null;
}
type RejudgeResult = {
    ok: true;
    changed: number;
    counted: number;
    uncounted: number;
} | {
    ok: false;
    why: "round" | "state" | "version";
};
type CollectCommitResult = {
    ok: true;
    counted: number;
    qualified: number;
    review: number;
    excluded: number;
    round_state: LeadRoundState;
} | {
    ok: false;
    why: "lease" | "offset" | "run" | "ended";
};
interface LeadDb {
    runClaim(runId: string, owner: string): Promise<boolean>;
    runRecordStart(runId: string, owner: string, apifyRunId: string, datasetId: string, capUsd: number): Promise<boolean>;
    runMarkUnknown(runId: string, owner: string): Promise<boolean>;
    runReconcile(runId: string, apifyRunId: string | null, datasetId: string | null, state: LeadRunState): Promise<boolean>;
    /** Takes or renews the lease; the generation, or null when another holds it. */
    runLease(runId: string, owner: string, seconds: number): Promise<number | null>;
    runRelease(runId: string, owner: string, gen: number): Promise<boolean>;
    collectCommit(runId: string, owner: string, gen: number, fromOffset: number, toOffset: number, page: CollectPage): Promise<CollectCommitResult>;
    /** usageUsd is the CHECK RUN's total so far, never this batch's delta: only what is new settles, so a job tried again charges once. */
    checkCommit(roundId: string, runId: string | null, results: {
        lead_id: string;
        email_state: LeadEmailState;
        checked_at: string;
    }[], usageUsd: number, last: boolean): Promise<{
        ok: boolean;
    }>;
    roundEnd(roundId: string, ending: LeadRoundEnding): Promise<boolean>;
    /**
     * lead_round_rejudge (00165): the verdicts of an answer that changed the plan, over places the probe already judged,
     * committed on a round running at that plan version. Never over the owner's decision, never twice, counted both
     * ways from the round's reservation.
     */
    roundRejudge(roundId: string, planVersion: number, places: CollectPlace[], judgment: CollectJudgment | null): Promise<RejudgeResult>;
    /** Insert the run rows that are not there yet, by their deterministic ids, and answer every row of the round. */
    runsEnsure(rows: {
        id: string;
        tenant_id: TenantId;
        round_id: string;
        purpose: "discover" | "check";
        term: string | null;
        actor: string;
        build: string;
        webhook_token_hash: string;
        cap_usd: number;
    }[]): Promise<LeadRunRow[]>;
    round(id: string): Promise<LeadRoundRow | null>;
    run(id: string): Promise<LeadRunRow | null>;
    runsOfRound(roundId: string): Promise<LeadRunRow[]>;
    membersOfRound(roundId: string): Promise<LeadMemberRow[]>;
    /** place id -> lead id, for the place ids this workspace already holds (leads and folded listings). */
    placeIdsHeld(tenantId: TenantId, placeIds: string[]): Promise<Map<string, string>>;
    sharesOf(tenantId: TenantId, keys: {
        phones: string[];
        emails: string[];
        hosts: string[];
    }): Promise<{
        key: string;
        share: LeadShare;
    }[]>;
    suppressed(tenantId: TenantId, keys: {
        emails: string[];
        placeIds: string[];
    }): Promise<{
        emails: Set<string>;
        placeIds: Set<string>;
    }>;
    zoneOf(tenantId: TenantId): Promise<string>;
    leadSearchesOn(tenantId: TenantId): Promise<boolean>;
    /** Whether the workspace may spend on the platform's account now (contracts maySpend); a read that fails throws. */
    maySpend(tenantId: TenantId): Promise<boolean>;
}
interface LeadPorts {
    db: LeadDb;
    apify: ApifyClient;
    judge: LeadJudge;
    now(): Date;
    /** The edge's own origin, where the provider's webhook lands. */
    webhookBase: string;
    /** A run row's webhook token, derived from its id by the edge: made once (its sha256 on the row), never rewritten, rebuilt by any later job of ours. */
    webhookToken(runRowId: string): Promise<string>;
    /** scheduleJobOnce for this workspace: a second row for the same key is an answer, not an error. */
    schedule(kind: "lead_round_start" | "lead_collect" | "lead_check", payload: Record<string, unknown>, runAfterSeconds: number): Promise<void>;
    /**
     * One GET of a page as text, for the engine's own reading -- today the business's home page, for its mark (D6).
     * Answers null rather than throwing on anything that is not a page we can read. Absent in a runtime that has no
     * business fetching (a test world that models none): the collect then simply marks nothing.
     */
    fetchText?(url: string, timeoutMs: number): Promise<string | null>;
    /**
     * One GET of an image's bytes (00161): at most `maxBytes`, null on anything else -- a refusal, a timeout, a body
     * that runs longer. What the bytes are is the engine's to judge (mark-image.ts), never the server's word for them.
     */
    fetchBytes?(url: string, timeoutMs: number, maxBytes: number): Promise<Uint8Array | null>;
    /**
     * Keep a copy of a mark that passed (00161): the bytes under their own hash, served as the type they were read as.
     * Answers the stored path (`<sha256>.<ext>`), or null when it could not be kept; the same bytes twice are one copy.
     */
    storeMark?(bytes: Uint8Array, image: MarkImage): Promise<string | null>;
    /**
     * Tell the workspace something happened that waits on a person: today, that a round stopped to ask its question
     * (the bell's row is lead_rounds_notify's, written with the question; this is the email). Called after the commit
     * that made it true, best effort: it answers nothing and a failure never reaches the collect. Absent in a runtime
     * that tells nobody.
     */
    tell?(e: {
        kind: "question";
        roundId: string;
    }): Promise<void>;
    /** Epoch ms: no provider or model call is started after this. */
    deadline: number;
}
/** The token that identifies a claim or a lease: the job's own id, so a retried job finds its own claim. */
type Owner = string;

/**
 * The half of a source card the code holds (PRD §0.3, decision 23): the
 * actors with their pinned builds, the input builder from the validated plan
 * (never from Claude's words), the output mapper from an item to a lead
 * (Appendix B), and the checker beside it. The half Claude reads is
 * contracts' LEAD_CARDS.
 *
 * The Maps input asks for exactly what a lead needs: contacts from the
 * business's own site, no reviewer data, no images, no detail pages. A ZIP or
 * radius ask is a circle around its center; a city ask is the actor's own
 * location query (decision 31). Every field read from an item is in
 * MAPS_FIELDS, including `location` (E7); an item without a name does not
 * read, and its offset still counts.
 */

/** The Maps item fields a lead is built from. Nothing else is asked for. */
declare const MAPS_FIELDS: readonly ["title", "categoryName", "neighborhood", "street", "city", "state", "postalCode", "countryCode", "phoneUnformatted", "phone", "phones", "website", "domain", "emails", "instagrams", "placeId", "totalScore", "reviewsCount", "permanentlyClosed", "temporarilyClosed", "location", "description", "ownerDescription", "openingHours", "imageUrl", "reviewsDistribution", "price", "facebooks", "linkedIns", "tiktoks", "claimThisBusiness", "rank", "url"];
declare const CHECKER_FIELDS: readonly ["email", "status", "is_catch_all"];
/** This actor refuses a cap under $0.50 (PRD §10.1). */
declare const MAPS_CAP_FLOOR_USD = 0.5;
/** A run may hold the provider this long before the sweep aborts it (PRD §12.5). */
declare const MAPS_RUN_TIMEOUT_SECS: number;
declare const CHECKER_RUN_TIMEOUT_SECS: number;
interface MapsPlace {
    placeId: string;
    title: string;
    category: string | null;
    neighborhood: string | null;
    street: string | null;
    city: string | null;
    state: string | null;
    postalCode: string | null;
    countryCode: string | null;
    phoneRaw: string | null;
    sitePhones: string[];
    website: string | null;
    emails: string[];
    instagram: string | null;
    rating: number | null;
    reviews: number | null;
    closed: boolean;
    location: {
        lat: number;
        lng: number;
    } | null;
    /** The listing's own line about the business: Google's, else the owner's; capped like every fact. For the owner, never the judge. */
    about: string | null;
    hours: {
        day: string;
        hours: string;
    }[];
    imageUrl: string | null;
    reviewsDist: {
        one: number;
        two: number;
        three: number;
        four: number;
        five: number;
    } | null;
    price: string | null;
    facebook: string | null;
    linkedin: string | null;
    tiktok: string | null;
    /** true: the owner claimed the listing; false: "claim this business" is showing; null: the item did not say. */
    claimed: boolean | null;
    rank: number | null;
    mapsUrl: string | null;
}
interface LeadCardRunner {
    actor: string;
    build: string;
    buildInput(plan: LeadSearchPlan, term: string, places: number): unknown;
    mapItem(item: unknown): MapsPlace | null;
    fields: readonly string[];
    checker: {
        actor: string;
        build: string;
        buildInput(emails: string[]): unknown;
        mapItem(item: unknown): {
            email: string;
            state: Exclude<LeadEmailState, "none" | "checking">;
        } | null;
        fields: readonly string[];
    };
}
/** The circle a ZIP or radius ask searches: the plan's center, else the ZIP table's. Null for a city ask. */
declare function areaCenter(plan: LeadSearchPlan): {
    lat: number;
    lng: number;
} | null;
declare const CARDS: Record<"local_businesses", LeadCardRunner>;

interface CleanPlace {
    raw: MapsPlace;
    phone: string | null;
    /** 0 none, 1 the listing, 2 the listing's number is on their site too. */
    phoneSources: 0 | 1 | 2;
    host: string | null;
    /** Whether the listing's website is that host's root, not a page under it (00237); null without a host. */
    root: boolean | null;
    region: string | null;
    emails: string[];
    dropped: {
        email: string;
        why: string;
    }[];
}
declare function cleanPlace(raw: MapsPlace): CleanPlace;

/** A personal inbox at a free-mail domain (contracts' one list): never an identity. */
declare function isFreeMail(email: string): boolean;
/** Same name, same street and same phone: one place listed twice. The later listing folds into the first. */
declare function foldDuplicates(places: CleanPlace[]): {
    kept: CleanPlace[];
    folded: Map<string, string>;
};
/** The details a place could share with a lead or a person: its phone, its own-domain emails, its host. */
declare function shareKeysOf(p: CleanPlace): {
    phones: string[];
    emails: string[];
    hosts: string[];
};
/**
 * The details places in ONE batch share with each other: the second place with
 * a number is marked as sharing it with the first, by place id, since neither
 * is a lead yet when the workspace is asked (sharesOf finds the ones that are).
 */
declare function sharesWithin(places: CleanPlace[]): Map<string, LeadShare[]>;
type Identity = {
    kind: "already_yours";
    leadId: string;
} | {
    kind: "hidden";
} | {
    kind: "new";
    shares: LeadShare[];
};
/**
 * What the workspace already knows of this place. Held by its place id: already
 * yours, skipped. Suppressed by its place id: hidden. Otherwise new, with the
 * shared details marked from what was looked up.
 */
declare function identityOf(p: CleanPlace, held: Map<string, string>, suppressedPlaceIds: Set<string>, shares: {
    key: string;
    share: LeadShare;
}[]): Identity;

/**
 * Geography (PRD E7, decision 31): a ZIP ask takes its center from the bundled
 * ZCTA table; a city ask is geocoded by the card's own location query and its
 * center is the median of the probe's coordinates, with a radius from their
 * spread. Distance is haversine, in metres, deterministic. No other gazetteer
 * is bundled.
 *
 * zcta-centroids.generated.ts is written by tooling/scripts/gen/zcta-centroids.mjs
 * from the Census 2020 gazetteer: one zip,lat,lng row a line, sorted by zip.
 */

interface LatLng {
    lat: number;
    lng: number;
}
declare function haversineM(a: LatLng, b: LatLng): number;
/** The ZCTA's internal point, or null for a ZIP the table does not have (a PO-box-only ZIP, a typo). */
declare function zctaCenter(zip: string): LatLng | null;
/** The median of the points, coordinate by coordinate: robust to one listing geocoded on the wrong coast. */
declare function medianCenter(points: LatLng[]): LatLng | null;
declare const RADIUS_MIN_M = 5000;
declare const RADIUS_MAX_M = 60000;
/** A radius from the spread: twice the distance within which three quarters of the probe's places fall, clamped. */
declare function radiusFromSpread(center: LatLng, points: LatLng[]): number;
/** Inside the circle; a place with no location is never inside (PRD §0.1: Needs review). */
declare function inArea(center: LatLng | null, radiusM: number, point: LatLng | null): boolean;
/**
 * Where to look when an area ran dry (D3): the nearest ZCTA centres past a ring around the centre, nearest first,
 * each as an area the plan can take -- a ZIP with its own centre and a radius that reads as "near 78660". The ring
 * keeps them out of the area just searched; the ceiling keeps them a drive away, not a flight.
 */
declare function nearestAreas(center: LatLng, o: {
    excludeWithinM: number;
    take: number;
    maxM?: number;
    state?: string;
}): LeadArea[];

declare function sha256Hex(s: string): Promise<string>;
/** A uuid, version 5-shaped, from its parts (uuid-v5.ts): stable across invocations, unique across rounds. */
declare function runIdFor(roundId: string, phase: "probe" | "main" | "check", term: string): Promise<string>;

/**
 * The judge as the runner uses it (PRD §7.1, E4): what is shown, and one batch asked of the port the edge binds.
 *
 *   - factsOf / fact: a place's listing facts as the judge sees them, each one line without control characters and at
 *     most FACT_MAX characters, never a page's own words.
 *   - judgeBatch: one call for a batch of at most 25 places (contracts LEAD_JUDGE_BATCH), asked once and once more when
 *     the answer is a refusal, a capped answer or out of its shape; refused twice, the batch is Needs review with the
 *     reason JUDGE_REFUSED_REASON. A 429, a 5xx or no answer is thrown, and the jobs ledger's waits retry the job. The
 *     answer comes back by place ref with the judgment to keep, under the operation id (opIdFor) so a replayed page pays
 *     nothing twice.
 *   - JUDGE_TIMEOUT_MS and PAGE_READ_ALLOWANCE_MS: the registry's bound for one call (contracts MODEL_ROUTES.lead_judge),
 *     and why the runner's margin (rules.ts JUDGE_MARGIN_MS) leaves room for it in a tick.
 *
 * The call itself is channels' leadJudge over the edge's model port (apps/edge/lib/leads/lead-wires.ts), which writes each
 * call to the usage ledger for the search's workspace (the round's `tenant_id`), names the round it is paid in as the row's
 * subject (`subject_id`: the judge's cost per search is the ledger's lead_judge rows joined to their round), and, while the
 * switch is on, puts each place's criteria to a second model in shadow (decision 0023), its rows naming the same round.
 * Nothing of that is seen here: the verb takes a LeadJudge and the round, and returns answers.
 */

declare const JUDGE_REFUSED_REASON = "the judge could not read these";
declare const FACT_MAX = 120;
/**
 * How long one judge call may take: the registry's route for the judge (contracts MODEL_ROUTES.lead_judge), which the
 * model port bounds each call by (no retry, no fallback: an overload is the ledger's retry), and the runner's
 * JUDGE_MARGIN_MS covers it, so a call is never started with less time left than it may take.
 */
declare const JUDGE_TIMEOUT_MS: number;
/**
 * Why 28 and not more. A collect is claimed up to CLAIM_FOR_MS (20s) into a
 * tick and handed a deadline LEAD_YIELD_AT_MS (52s) from the tick's start
 * (packages/jobs ledger.ts), so the least it is promised is 32 seconds; it
 * reads its page from the provider first (PAGE_READ_ALLOWANCE_MS), and the
 * judge, which is never started with less than its own timeout left
 * (runner/rules.ts JUDGE_MARGIN_MS), must fit in what remains. Core does not import
 * the ledger, so tick-geometry.test.mjs holds these numbers to each other.
 * A low-effort structured call over 25 places answers in well under this.
 */
declare const PAGE_READ_ALLOWANCE_MS = 4000;
/** A fact as the judge sees it: one line, no control characters, at most 120 characters. */
declare function fact(v: string | null): string | null;
/** Listing facts only, never a page's words (PRD §7.1). */
declare function factsOf(ref: number, p: CleanPlace): PlaceFacts;
interface JudgedBatch {
    answers: Map<number, JudgePlaceAnswer>;
    judgment: CollectJudgment | null;
    model: string | null;
    refused: boolean;
    /** Why the judge refused, in its own word ("max_tokens", "stop"): the members say the plan's sentence, and this is what the collect's line logs. */
    why: string | null;
}
declare function opIdFor(runId: string, fromOffset: number, batch: number): string;
/** One batch, asked once and once more; a throw is the provider's trouble and propagates. */
declare function judgeBatch(judge: LeadJudge, plan: LeadSearchPlan, places: PlaceFacts[], opId: string, 
/** The round the batch is paid in: its workspace is the usage ledger's row for each call, and its id the row's subject. */
round?: {
    id: string;
    tenant_id: string;
}): Promise<JudgedBatch>;

/**
 * How much a round asks the provider for, and what each run may charge (PRD §0.5 "size from yield", S6, §13.3): the
 * arithmetic the runner (runner/) turns into runs, over contracts' placesToAsk (the places to ask each term for) and
 * estimateRoundUsd (their price, with room).
 *
 *   - probeAsk / mainAsk: the terms and places per term for the probe (LEAD_PROBE_PLACES spread across every term, E10)
 *     and for the main phase (what remains, over the probe's yield, without the term the question dropped).
 *   - yieldOf / probeYield / hasContact: the yield that sizes the main phase: the share of the probe's places that are not
 *     left out and hold a way to reach them (a phone that dials, or a candidate email: decision 0010), never the Qualified
 *     share, and never under 5%; a probe that judged nothing counts as 20%.
 *   - runCaps: one dollar cap per run: the estimate for its places, every cap scaled down when the sum would pass what
 *     the round still has reserved, none under the actor's floor (MAPS_CAP_FLOOR_USD), and only as many runs as the
 *     reserve holds a floor for, in the plan's order: the caps together never pass it, and with less than one floor
 *     left the round starts nothing.
 */

/** The probe: LEAD_PROBE_PLACES spread across every term (E10). */
declare function probeAsk(plan: LeadSearchPlan): {
    terms: string[];
    perTerm: number[];
};
/** The main phase: the remainder over the probe's yield, without the term the question dropped. */
declare function mainAsk(plan: LeadSearchPlan, remaining: number, yieldSoFar: number, dropTerm: string | null): {
    terms: string[];
    perTerm: number[];
};
/** A share of what was judged, floored so one bad probe never asks for everything. */
declare function yieldOf(judged: number, usable: number): number;
/**
 * A place a lead could come from (decision 0010): a phone that dials, or a candidate email the cleaner kept -- either,
 * whichever the search prefers, since either one checked makes the lead count.
 */
declare function hasContact(place: {
    phone: string | null;
    email: string | null;
}): boolean;
/**
 * The probe's yield, the one number that sizes the main round (S6, A1's
 * review): the share of the probe's places that are NOT left out and hold a
 * way to reach them. Never the Qualified share -- a place waiting on its
 * email is not Qualified until the mailbox checks land, and a round sized
 * from zero asks the provider for everything it is allowed to.
 */
declare function probeYield(members: {
    class: LeadMemberClass;
    phone: string | null;
    email: string | null;
}[]): number;
/**
 * One cap per run: the estimate for its places (with the estimate's own
 * room); when the sum would pass what the round still has reserved, every
 * cap is scaled to fit. The actor refuses a cap under $0.50, so none goes
 * under it -- and the caps together never pass what is left: the floor is a
 * floor on each run, so the round starts only as many runs as the reserve
 * holds a floor for, the terms in the plan's order, and a term past them gets
 * nothing (0), which its caller starts no run for. A term asked for no places
 * takes no run's room.
 */
declare function runCaps(plan: LeadSearchPlan, perTerm: number[], reservedLeftUsd: number): number[];

/**
 * After the probe (PRD §7.2, §0.5, P4): an intent check, from the most common
 * exclusion, when fewer than 60% of the first places pass; else the main
 * phase, sized from the probe's yield. contracts' questionAfterProbe holds
 * the words and the threshold; this holds what the runner does with its
 * answer.
 */

/** A probe member as this reads it: contracts' own shape, with what the contact standard would need. */
type ProbeYieldMember = ProbeMember & {
    phone: string | null;
    email: string | null;
};
type AfterProbe = {
    kind: "ask";
    question: RoundQuestion;
} | {
    kind: "go";
    yield: number;
};
declare function afterProbe(plan: LeadSearchPlan, members: ProbeYieldMember[], now: Date): AfterProbe;

/**
 * How a round ends (PRD §0.5, S7): one closed set, decided by contracts'
 * endingOfRound from facts the runner gathers here. "Searched everything"
 * only when every term returned fewer places than it was asked for; a run
 * that returned what it was asked for ended at its limit, and the round says
 * "few new matches" so the next step is another round in the same area.
 */

declare const FINAL_RUN_STATES: ReadonlySet<string>;
/** The provider's status as the row's state; anything else is still running. */
declare function runStateOf(status: string): "running" | "succeeded" | "failed" | "aborted" | "timed_out";
/** A term is short when its run saw fewer places than it asked for. Unknown asks read as not short. */
declare function termsShortOf(runs: LeadRunRow[], askedOf: (run: LeadRunRow) => number | null): boolean[];
declare function discoveryEnding(round: LeadRoundRow, runs: LeadRunRow[], x: {
    counted: number;
    target: number;
    termsShort: boolean[];
    stopped: boolean;
}): LeadRoundEnding;

/**
 * The runner (PRD §0.5, §12.5): the three jobs of the lead finder and the
 * sweep's reconciliation, over ports.
 *
 *   startRound   lead_round_start  a run row per term, made by its deterministic
 *                                  id, claimed, and only then started at the
 *                                  provider; a lost answer stays unknown
 *   collect      lead_collect      one batch of a run's items per commit: clean,
 *                                  identity, judge, classify, distance, commit
 *   check        lead_check        one checker run per batch of addresses
 *   reconcileUnknownRuns           the provider's own list, by our run row id
 *
 * The rules the verbs keep: a claim before any provider call (E1); a lease
 * with an owner and a generation, and one commit per batch that inserts,
 * settles, advances the offset by compare-and-set and inserts the next job
 * (E3, E4); the judge's answer kept by operation id; code deciding the class
 * (§0.1); the deadline checked before every provider or model call, and the
 * offset committed before yielding. A provider's 429 or 5xx throws for the
 * ledger's waits; a refusal is an answer.
 *
 * The webhook token of a run row is derived from the row's id by the edge
 * (ports.webhookToken), so a job tried again can rebuild the URL its earlier
 * try sent without the row's stored hash ever being rewritten (E1).
 *
 * This module holds what the jobs share: the lease, the clocks and the page sizes, the reasons a place is held by
 * rule, the deadline check and the provider's two kinds of trouble. Each job is a module beside it: start.ts,
 * collect.ts, check.ts and sweep.ts.
 */

declare const LEASE_SECONDS = 90;
declare const FIRST_COLLECT_SECONDS = 20;
declare const POLL_SECONDS = 15;
declare const PAGE_ITEMS = 100;
declare const CHECK_BATCH = 500;
/** No provider call starts with less than this left before the function is killed. */
declare const DEADLINE_MARGIN_MS = 8000;
/**
 * The judge's own margin: it may take its whole timeout to answer, so it is
 * never started with less than that left. A margin shorter than the call it
 * guards buys nothing -- the function is killed mid-call, the page is never
 * committed, and the batch is paid for twice when the job is tried again.
 */
declare const JUDGE_MARGIN_MS: number;
/** An unknown start with no run at the provider after this long is failed. */
declare const UNKNOWN_START_GRACE_MS: number;
/** The key our runs carry in their input, so the sweep can tell ours from anyone else's. */
declare const INPUT_MARKER = "chanlyticsRunId";
/**
 * How far into the provider's own list a lost start is looked for: the list
 * answers a hundred runs since a time (channels apify.ts), and ours can be
 * anywhere in it -- a round starting three terms, or another search on the
 * same account, pushes it down. The list carries no input, so there is no
 * cheaper way than reading each run's input key until ours is found; stopping
 * at twenty failed a run the provider was still charging for.
 */
declare const PROVIDER_RUN_PAGE = 100;
declare const OUT_OF_AREA_REASON = "outside the area you asked for";
declare const NO_LOCATION_REASON = "no location on the listing";
declare const CLOSED_REASON = "closed on Google Maps";
declare const DUPLICATE_REASON = "the same place, listed twice";
type Phase = "probe" | "main";
/** A condition worth trying again that is not the provider's: the ledger's waits take it. */
declare class LeadRetry extends Error {
    constructor(message: string);
}
/** Round 1 runs to the plan's count (its probe asks for 25 of it); a later round to what lead_search_more set as its target. */
declare const targetOf: (round: LeadRoundRow) => number;

/**
 * lead_round_start: a run row per term, made by its deterministic id, claimed (claim.ts), and only then started at
 * the provider. A round whose answer changed the plan re-judges its probe first (rejudge.ts).
 */

/** no_room: a term past the runs the round's reserve holds the actor's floor for (runCaps), said and never started. */
type TermOutcome = "started" | "reconciled" | "refused" | "unknown" | "someone_elses" | "already" | "no_room";
type StartOutcome = {
    kind: "not_open";
} | {
    kind: "paused" | "may_not_spend";
} | {
    kind: "spent";
} | {
    kind: "started";
    phase: Phase;
    runs: {
        term: string;
        kind: TermOutcome;
    }[];
};
declare function startRound(p: LeadPorts, roundId: string, owner: string, resume?: boolean): Promise<StartOutcome>;

/**
 * A place as the collect takes it (collect.ts; rejudge.ts makes its members here too): what a page's items become before
 * the judge and after it.
 *
 *   - takeBatch: the next batch of a page's items from a cursor, at most LEAD_JUDGE_BATCH places the judge must see,
 *     each item cleaned (clean.ts) and marked when a rule settles it before judging (closed for good: left out; no
 *     location: Needs review), with the items around them.
 *   - centerOf / nearbyFor: where the round measures from (the plan's centre, or for a city ask the median of the probe's
 *     places, E7) and where to look next when a round ran dry (the three nearest ZIP centres past the area, D3).
 *   - memberOf: the member and the lead's columns the commit writes for one place, its class decided by code from the
 *     judge's answers (contracts classify, §0.1) or by the rule that kept it from the judge, a left-out place keeping none
 *     of its candidate emails or listing detail (PRD §0.4, §15).
 *   - askedOf: what each key asked under a plan, worked out once per plan (judgeAsked hashes every question).
 */

interface Prepared {
    index: number;
    clean: CleanPlace;
    /** Left out or held by rule before any judging; null means the judge decides. `token` is the reason as contracts spells it. */
    rule: null | {
        class: "excluded" | "review";
        reason: string;
        token: string;
        excluded_by: string | null;
    };
}
/** Where a round's places are measured from: the plan's center, or for a city ask the median of the probe's places (E7, decision 31). */
declare function centerOf(plan: LeadSearchPlan, members: LeadMemberRow[]): {
    center: LatLng | null;
    radiusM: number;
};
/**
 * Where to look next when a round ran dry (D3): the nearest ZIP centres past the area it measured from, three of them.
 * Nothing when the round has no centre yet (a city ask whose probe placed nothing).
 */
declare function nearbyFor(plan: LeadSearchPlan, members: LeadMemberRow[]): LeadArea[];
/** One place as the commit takes it: the lead's columns, the member's class decided by code (§0.1), its shares. */
declare function memberOf(plan: LeadSearchPlan, term: string, c: CleanPlace, a: JudgePlaceAnswer | null, opId: string | null, model: string | null, rule: Prepared["rule"], geo: {
    center: LatLng | null;
    radiusM: number;
}, shares: LeadShare[], duplicateOf: string | null): CollectPlace;
/** The next batch of items from `cursor`: at most LEAD_JUDGE_BATCH places the judge must see, with the items around them. */
declare function takeBatch(card: LeadCardRunner, items: unknown[], cursor: number): {
    end: number;
    prepared: Prepared[];
};

/**
 * lead_collect: one batch of a run's items per commit (clean, identity, judge, classify, distance, commit), a Stop,
 * and a checker run's answers. The places it commits are made in places.ts and marked in mark-places.ts; what
 * follows a run's last item is round-decision.ts.
 */

type CollectOutcome = {
    kind: "gone";
} | {
    kind: "not_started";
} | {
    kind: "round_ended";
} | {
    kind: "round_closing";
} | {
    kind: "busy";
} | {
    kind: "lost";
    why: Exclude<CollectCommitResult, {
        ok: true;
    }>["why"];
} | {
    kind: "committed";
    commits: number;
    toOffset: number;
    runState: LeadRunState | null;
    roundState: LeadRoundState | null;
    judgeRefused: string | null;
} | {
    kind: "checked";
    results: number;
    last: boolean;
} | {
    kind: "stopped";
} | {
    kind: "polling";
};
declare function collect(p: LeadPorts, runId: string, seq: string, owner: string): Promise<CollectOutcome>;

/**
 * An answer that changed the plan re-judges the places the probe already judged. The start (start.ts) calls it
 * before it sizes the main phase; the members are made as the collect makes them (places.ts).
 */

type RejudgeOutcome = {
    changed: number;
    reused: number;
    judged: number;
    unread: number;
};
/**
 * An answer that changed the plan re-judges the places the probe already judged (00165). The question asked
 * "is that what you meant?" about them; when the owner answers by changing the plan -- Include the thing it left out,
 * or Change what I asked -- those places were still classed by the plan they had just said was wrong, and the main
 * phase never sees them again (a place the workspace holds is skipped), so an Include brought back nothing.
 *
 * A left-out place kept no email and nothing its listing showed (PRD §0.4), so the places are read again from the
 * probe's own items (a read of its dataset, not a run) and cleaned as the collect cleaned them. A stored answer that
 * answers every key the new plan asks is the answer (an Include lifts a key: free, and exactly what was said before);
 * otherwise the places are judged again under the new plan, a batch at a time, before the deadline. Classes are
 * code's, through the collect's own memberOf, against the plan's area. The door (lead_round_rejudge) never overrides
 * the owner's decision and never applies twice. A refused batch is left as it was; a place the source no longer
 * lists (an expired dataset) is left as it was and counted as unread.
 */
declare function rejudgeProbe(p: LeadPorts, round: LeadRoundRow): Promise<RejudgeOutcome>;

/**
 * The business's own mark, for the places a page is about to commit. What a home page declares is read by mark.ts
 * and the bytes worth keeping are told by mark-image.ts, one folder up; the collect (collect.ts) and the re-judging
 * (rejudge.ts) call it.
 */

/**
 * The business's own mark (D6), for the places this page is about to commit: one small GET of each new lead's home
 * page, read for the logos it declares (mark.ts), then the first of those whose bytes are a mark worth keeping
 * (mark-image.ts), stored as our own copy (00161) -- the site's address never draws past the dashboard's content
 * policy, and our copy does. It is the last thing the collect does and the first thing it gives up: a page that does
 * not answer inside the allowance, or a collect already short of time, simply commits leads with no mark, and the
 * next round's copy of that place fills it where it was empty.
 *
 * A left-out place is never marked, as it stores none of the rest (§0.4), and a place with no site has nothing to read.
 * Answers how many places were given a kept copy.
 */
declare const MARK_ALLOWANCE_MS = 8000;
declare const MARK_AT_ONCE = 6;
/**
 * A page's candidates tried for bytes worth keeping: its said logo, then its best icon. Past two, it is a favicon.
 * An SVG is never kept (mark-image.ts), so an address that says it is one is not asked for and spends no try.
 */
declare const MARK_TRIES = 2;
declare function markPlaces(p: LeadPorts, places: CollectPlace[]): Promise<number>;

/**
 * lead_check: one checker run per batch of the addresses still waiting, claimed first (claim.ts). The checker run's
 * answers are read by the collect (collect.ts).
 */

type CheckOutcome = {
    kind: "not_open";
} | {
    kind: "paused" | "may_not_spend";
} | {
    kind: "nothing_to_check";
} | {
    kind: "started";
    emails: number;
    more: boolean;
} | {
    kind: "already";
} | {
    kind: "unknown";
} | {
    kind: "refused";
};
/** Check again (D3, 00145): the nonce that gives the run an id of its own, and the leads the owner named. */
type CheckAgain = {
    nonce: string;
    leadIds: string[];
};
/** A run started by Check again: the door's nonce is in its term, so the round may have ended by the time it commits. */
declare const isAgainRun: (run: Pick<LeadRunRow, "purpose" | "term">) => boolean;
/** The members whose picked address still waits for its check, in one fixed order. */
declare function checkable(members: LeadMemberRow[]): LeadMemberRow[];
declare function check(p: LeadPorts, roundId: string, batch: number, owner: string, again?: CheckAgain | null): Promise<CheckOutcome>;

/**
 * The sweep's reconciliation: an unknown start looked for in the provider's own list (claim.ts), and reconciled, or
 * failed once its grace is over.
 */

type ReconcileOutcome = {
    runId: string;
    kind: "reconciled" | "failed" | "waiting";
};
/** An unknown start is reconciled against the provider's own list; ours carry the run row id in their input (PRD §0.5, E1). */
declare function reconcileUnknownRuns(p: LeadPorts, unknownRuns: LeadRunRow[]): Promise<ReconcileOutcome[]>;

/**
 * The receptionist's memory of one conversation, as the handler reads it.
 *
 * Postgres is the only memory. The rows are assembled by packages/db's
 * readThreadState and handed over by lib/whatsapp/persist.ts; this file is
 * the shape they arrive in, and it is dependency-free so the brain can name a
 * turn without importing the database.
 *
 * The one distinction that changes behaviour lives here: a thread Postgres
 * could not produce is UNKNOWN, not empty. A blank thread has `pausedUntil:
 * 0`, so reading a failed read as blank makes the receptionist believe nobody
 * has taken the thread over, that it has never spoken to this person, and
 * that it has used none of its daily replies — so it talks over the human
 * handling the conversation and re-greets a customer mid-thread. There is
 * nowhere to fall back to, so an unknown thread goes to a person instead.
 */
interface ThreadTurn {
    role: "user" | "assistant";
    content: string;
}
interface ThreadState {
    /** The conversation so far, oldest first — what the model is shown. */
    history: ThreadTurn[];
    /** Epoch ms — a human is handling this thread until then. */
    pausedUntil: number;
    /** Epoch ms of the bot's replies in the last day (the rate cap). */
    replies: number[];
    /**
     * Postgres could not produce this thread.
     *
     * A FIELD on a fresh object, never a shared sentinel compared by identity.
     * Callers mutate what they are handed (`t.pausedUntil = ...`), so one
     * exported instance accumulated every customer's state on a process-global
     * object and leaked it to the next customer inside a warm lambda.
     */
    unknown?: boolean;
    /**
     * A text of ours has reached this person before, per Postgres (db readThreadState).
     *
     * It exists because the question "is this our first text to them", which decides whether a text carries the
     * rates/STOP/HELP footer the campaign filing promises, cannot be answered from anything else here. The history reads a
     * voice call note (an INBOUND row whose sender is "system") as an assistant turn, so a customer who phoned and then
     * texted for the first time was taken for someone we had already written to. And a message of ours on another wire is
     * not a text: a person a WhatsApp or email campaign had reached got their first text reply without the disclosure.
     */
    textedBefore?: boolean;
}
/**
 * The state of a thread nobody can read. `pausedUntil: -1` is a second line
 * of defence: a caller that forgets the check still fails closed.
 */
declare const unreadableThread: () => ThreadState;
/** True when this state came from a failed read rather than from the rows. */
declare function isThreadUnknown(s: ThreadState): boolean;

/**
 * Everything answerInbound reaches outside itself, as one object.
 *
 * The verb is the customer path: an order of phases (./answer.ts), each a
 * module beside it, their decisions most of them pure steps (./steps.ts),
 * joined to the world by a dozen modules -- the database, the memory, the
 * tenant runtime, the sink and the sender, the alerts, the pager, the model.
 * On the edge those were module imports, which is why no test could run the
 * handler and fifty source reads pinned its text instead; here they are named
 * ports, and the adapter that knows the tables, the provider and the
 * environment is apps/edge/lib/whatsapp/ports.ts.
 *
 * Every member was `typeof someEdgeModule` there. Written out here because a
 * verb may not import the edge: the signature is the contract, copied from the
 * declaration it used to point at. Nothing in this file decides anything.
 */

/** The text channels a thread can arrive on (the edge's alerts.ts says them in an owner's words). */
type InboundChannel = "whatsapp" | "sms";
/**
 * The database handle, opaque here on purpose.
 *
 * The verb never calls it. It takes one from `db()` and hands it to the
 * persist, runtime, leads, budget and pager ports -- all of them the
 * adapter's, and the adapter is where the tables are. Typing it as the real
 * client would put @supabase/supabase-js inside a verb, which is the one thing
 * a verb may not know.
 */
interface InboundDb {
    /**
     * The real client's table accessor. Never read here: it is only what makes a
     * genuine client satisfy this type, and an empty object not.
     */
    readonly from: unknown;
}
/**
 * The ingest write itself failed. The message is NOT recorded, and the provider
 * must be told so it retries.
 *
 * Core owns it because both sides need it: the verb catches it to copy the
 * customer's words to the workspace mailbox, and the edge's persist adapter
 * throws it (apps/edge/lib/whatsapp/persist.ts re-exports it for the two doors
 * that count it into their 503).
 */
declare class IngestFailed extends Error {
    constructor(message: string);
}
/**
 * A logger with context bound to it, as the verb uses one: three levels and a
 * JSON-carrying field bag. The edge's lib/log.ts `Logger` is this plus a child;
 * the verb binds once and never narrows, so it names only what it uses.
 */
interface InboundLog {
    info(event: string, fields?: Record<string, unknown>): void;
    warn(event: string, fields?: Record<string, unknown>): void;
    error(event: string, fields?: Record<string, unknown>): void;
}
/**
 * The control plane's answer for one workspace, as the verb reads it: the
 * persona, the policy, the credentials, the recipients and the facts the
 * prompt states. The shape of `TenantRuntime` in apps/edge/lib/tenant-runtime.ts,
 * which is the one door that loads it.
 */
interface InboundRuntime {
    tenantId: string;
    /** null = this tenant's receptionist does not speak (unconfigured persona —
     *  persist + escalate only; silence over someone else's voice). */
    brain: BrainConfig | null;
    notifications: NotificationsConfig | null;
    /** The calendar the receptionist may read for open times; null = none set. */
    calendar: CalendarConfig | null;
    /** Opt-in abilities (features.vision, …); null = none set. */
    features: FeaturesConfig | null;
    /** Workspace-level policy modes, class → mode. Unexpected/missing → 'ask'. */
    policy: Record<string, {
        mode: string;
        limits: PolicyLimits;
    }>;
    /** Per-tenant WhatsApp credentials from Vault; null = the channel carries none, or the vault did not answer. */
    waCreds: {
        accessToken: string;
        phoneId: string;
    } | null;
    /** This workspace's WhatsApp number IS the environment's own pilot line. */
    envNumber: boolean;
    /** IANA zone from `tenants.timezone`; null only when the row could not be read. */
    timezone: string | null;
    /** tenants.status = 'paused', written by billing for a workspace whose subscription stopped. */
    paused: boolean;
    /** What the platform KNOWS, as opposed to what somebody typed. */
    known: KnownFacts;
    /** True when the control plane could not be read (infra blip, not config absence). */
    loadFailed: boolean;
    /** The config row EXISTS but does not parse — a mistake somebody can fix. */
    configBroken?: boolean;
    /** tenant_config.version, stamped on each answer's meta; absent or null when it could not be read. */
    configVersion?: number | null;
}
/**
 * Everything about a handoff other than the words: who is told, on which wire
 * the conversation is, where the bell sends the reader, and whether this branch
 * actually took the receptionist out of the thread. The edge's alerts.ts
 * `HandoffContext`.
 */
interface InboundHandoff {
    target: {
        /** The tenant this message is ABOUT. */
        tenantId: string | null;
        /** That tenant's configured notification settings, when we could read them. */
        notifications: NotificationsConfig | null;
        /** True when this tenant is the env-default one, whose owner IS the address in LEAD_TO. */
        isEnvDefault: boolean;
    };
    /** The wire the customer wrote on. WhatsApp unless the text came in on a carrier's. */
    channel?: InboundChannel;
    /** How long the receptionist is out of this thread, when THIS branch paused it. */
    pausedHours?: number | null;
    /** Where the bell sends the reader: the thread when it is known, else the Inbox. */
    route?: string;
    /** The customer's name when the channel gave one; the number stands in otherwise. */
    who?: string | null;
    /** The conversation the row is about, so the bell can say a thing once. */
    about?: {
        type: string;
        id: string;
    } | null;
}
/**
 * Who an answer is for: the ledger's row (ai_usage, written by the model port) and the stamp on its meta (the settings'
 * version its prompt was composed from). The purpose is the receptionist's own unless a draft says otherwise.
 */
interface BrainCall {
    tenantId: string | null;
    /** The conversation it answers. */
    subjectId?: string | null;
    /** tenant_config.version the prompt was composed from; null when it could not be read. */
    configVersion?: number | null;
    purpose?: "receptionist" | "reply_draft";
    /** The customer's own words, when a second model may be put beside this turn in shadow (decision 0023). */
    shadowText?: string;
}
/** What the model answered, and what the row remembers about it (the edge's brain.ts `BrainReply`). */
interface InboundBrainReply {
    text: string;
    escalate: boolean;
    reason?: "human_token" | "refusal" | "brain_error";
    usage?: {
        input_tokens: number;
        output_tokens: number;
    };
    /** Absent when the model's answer could not be read and the holding reply went out instead. */
    meta?: BrainMeta;
}
/**
 * All the Postgres bookkeeping of one inbound message, as one object every
 * branch reports through. Every method no-ops when Postgres is unconfigured and
 * none of them throws into the handling path (the edge's persist.ts `pgSink`).
 */
interface InboundSink {
    /** Whether there is a database, a workspace and an ingested row to write against. */
    on: boolean;
    /** The words leave through the one door (../deliver.ts), which re-reads consent, the pause and the workspace's status. */
    deliver(to: string, text: string, meta?: Record<string, Json>, purpose?: SendPurpose, kind?: SendKind): Promise<Delivered>;
    /**
     * The message is finished with, and says what it became (contracts Handled) and, where the model read it, what it was
     * about; the adapter marks it processed and stamps both (K1, ./handled.ts). Both are optional so a caller with nothing
     * to say still marks it.
     */
    processed(handled?: Handled, intent?: BrainIntent | null): Promise<unknown>;
    /**
     * Say what the message became WITHOUT marking it processed: for the one way out that leaves a message unfinished on
     * purpose, a reply that could not be delivered, whose `send_failed` escalation landed (the deadman sweep finishes it,
     * ./handled.ts). The adapter writes the same stamp `processed` does, through the same door and the same guard, and
     * never touches processed_at.
     */
    noteHandled(handled: Handled, intent?: BrainIntent | null): Promise<unknown>;
    allowlistSkip(): Promise<unknown>;
    /** The sender cannot receive a reply (a short code). Recorded like any other message, and not answered. */
    unreachableSender(): Promise<unknown>;
    /** An address the customer gave in their own words: kept only where none is on file; a taken address is said, never moved. */
    noteEmail(address: string): Promise<unknown>;
    /** A veto window this workspace CONFIGURED did not happen, and the customer has the words already. */
    vetoFallback(delayMs: number, source?: "veto_window" | "low_confidence"): Promise<unknown>;
    /** The thread handed to a person; its held drafts go with it, all but the one this handoff queued. */
    pause(iso: string, keepMessageId?: string): Promise<unknown>;
    /** Tokens in and out, and the quality signal beside them. */
    usage(u: Record<string, unknown>): Promise<unknown>;
    /**
     * Resolves to how the escalation landed — "opened" for a new one, "refreshed"
     * when the thread already had one open — so a caller can alert once per hold
     * rather than once per message. Undefined when Postgres is off or the write
     * failed. The set is packages/jobs escalate.ts `EscalationOutcome`.
     */
    escalate(reason: string, details: string): Promise<"opened" | "changed" | "refreshed" | "failed" | undefined>;
    /** Download from the provider, upload to storage, record where it went. The bytes when they were fetched. */
    media(n: NormalizedInbound): Promise<{
        bytes: ArrayBuffer;
        mime: string | null;
    } | null | undefined>;
}
interface InboundPorts {
    /** The database, or null when this deployment persists nothing. */
    db(): InboundDb | null;
    /** The control plane's one door: the workspace's persona, policy, credentials. */
    runtime(db: InboundDb, routed: RoutedChannel): Promise<InboundRuntime>;
    leads: {
        /** Who this person is, from the rows: the same reader the voice agent uses. */
        read(db: InboundDb, tenantId: string, phoneE164: string, historyLimit?: number): Promise<LeadContext>;
        /** People → profile → "Receptionist for …": this person's own mode, or null. */
        personReplyMode(db: InboundDb, tenantId: string, contactId: string): Promise<string | null>;
        /**
         * This person's answer about offers and how it was given, or null where there is no such person: what a START's
         * confirmation on WhatsApp reads to say a STOP ended their yes (reply-gates.ts). Absent in an adapter that has
         * none: the confirmation is then the filed words alone.
         */
        offersAnswer?(db: InboundDb, tenantId: string, contactId: string): Promise<{
            marketingConsent: string | null;
            marketingConsentSource: string | null;
        } | null>;
        /**
         * That context in a line or two, for the model. A VALUE from the db package
         * on the edge, so it arrives as a port rather than as an import. The zone is
         * the business's, for the dates a deal's sentence says (0004). The channel is the conversation's: a text rides this
         * road on the WhatsApp prompt, and the ask for the yes to offers is for WhatsApp alone.
         */
        describe(lead: LeadContext, now?: Date, tz?: string, channel?: InboundChannel): string;
    };
    calendar: {
        openings(rt: InboundRuntime, now?: Date): Promise<string | null>;
        visits(rt: InboundRuntime, who: {
            phone: string | null;
            name: string | null;
        }, now?: Date): Promise<string | null>;
    };
    budget: {
        /** A rolling day of this workspace's model usage; it may stop counting at `stopAt`. */
        tokensLast24h(db: InboundDb, tenantId: string, stopAt?: number): Promise<number>;
    };
    /** The Postgres bookkeeping of one message: ingest, the memory, the held draft, the sink. */
    persist: {
        /** The rows as memory, or an UNKNOWN thread when they cannot be produced. */
        thread(db: InboundDb | null, tenantId: string | null, ing: IngestResult | null): Promise<ThreadState>;
        /** Persist first. Null when there is nothing to record for; IngestFailed when the write FAILED. */
        ingest(db: InboundDb | null, tenantId: string | null, n: NormalizedInbound, channel?: InboundChannel, 
        /** The line the message came in on, a tenant_channels id: the first touch of the person it makes carries it (K3). */
        line?: string | null): Promise<IngestResult | null>;
        sink(db: InboundDb | null, tenantId: string | null, ing: IngestResult | null, rt?: InboundRuntime | null, channel?: InboundChannel, wire?: Wire): InboundSink;
        /**
         * The thread's reply turn (00284, ./turn.ts): `claim` takes it for this message before the model is asked, and
         * withdraws the drafts an older turn left waiting; `holds` asks again before the words go out. False when a newer
         * message of the thread holds it. Absent in an adapter that has none: the turn is then always held.
         */
        turn?: {
            claim(db: InboundDb, tenantId: string, conversationId: string, messageId: string): Promise<boolean>;
            holds(db: InboundDb, conversationId: string, messageId: string): Promise<boolean>;
        };
        /**
         * Whether a reply names this message (its `reply_to`), whatever became of it: what a text's answer, taken up again
         * after a runner died mid-turn, asks before it speaks. Absent in an adapter that keeps no such mark: then nothing is
         * known to have answered it.
         */
        answered?(db: InboundDb | null, tenantId: string | null, ing: IngestResult): Promise<boolean>;
        /** The reply written as a DRAFT and scheduled to fire; null when it could not be queued. */
        queueReply(db: InboundDb | null, tenantId: string | null, ing: IngestResult | null, toPhone: string, body: string, delayMs: number, L: InboundLog, source?: "veto_window" | "low_confidence", brainMeta?: BrainMeta, channel?: InboundChannel): Promise<string | null>;
    };
    /** The workspace's handoff mail: the customer's words, what the bot said, and why a person is needed. */
    alertStaff(threadId: string, userText: string, botText: string, reason: string, ctx: InboundHandoff): Promise<void>;
    /** The PLATFORM's pager, once per condition per window. Never an owner. */
    page(ports: {
        db: InboundDb;
    }, key: string, subject: string, body: string): Promise<"sent" | "suppressed" | "unaddressed" | "failed">;
    /** WhatsApp's wire from a workspace's credentials. */
    sender(cfg: WaConfig | null): Sender | null;
    /** The model, loaded only when there is a key: it is the one import that pulls the SDK. */
    brain(): Promise<{
        generateReply(history: ThreadTurn[], userText: string, systemPrompt: string, fallbackText: string, leadNote?: string, nowNote?: string, image?: {
            mime: string;
            base64: string;
        }, steer?: string, call?: BrainCall): Promise<InboundBrainReply>;
    }>;
    /**
     * A logger FACTORY, not a logger: the verb binds the tenant once, where it
     * becomes known, and every line beneath it carries it. The edge hands in
     * `logger` from lib/log.ts, which already has this shape.
     */
    log(base: Record<string, unknown>): InboundLog;
    /**
     * Which WhatsApp credentials this message's replies leave on: the tenant's
     * own, or the environment pair for the environment's own number.
     */
    waCfg(rt?: InboundRuntime | null, arrivedOnEnvNumber?: boolean): WaConfig | null;
    env: {
        /** The pilot allowlist for the environment's own number: comma-separated E.164 digits; empty disables it. */
        allowlist: string;
        modelKey: string | undefined;
    };
}

/**
 * Whether the receptionist may reply to this person at all.
 *
 * Pure and dependency-free, for the same reason reply-posture.ts is: the
 * answer has two sources that disagree under exactly the conditions nobody
 * exercises by hand — an opt-out from last week, a START arriving in the same
 * message — and a truth table can be read and tested, while two `||` clauses
 * inline in a 700-line handler cannot.
 *
 * Consent lives in `contacts.consent`, which only Postgres knows. There used
 * to be a third source, a copy cached on the retired Blob thread, for the
 * case where Postgres did not answer. It has no case left: the memory is
 * Postgres, so a message whose thread could not be read never reaches this
 * gate — it is handed to a person instead.
 */
interface ConsentInputs {
    /** THIS message is an explicit opt-out (STOP / BAJA / unsubscribe / alto). */
    optOutNow: boolean;
    /** THIS message is an explicit opt-in (START / ALTA) — the only way back. */
    optInNow: boolean;
    /**
     * What Postgres says, or null if it did not answer. `false` and `null` are
     * emphatically different: one is a record saying they are opted in, the other
     * is no record at all.
     */
    recorded: boolean | null;
    /**
     * THIS message was already held when it was taken in now (the ingest's
     * `is_new` false): a text's answer job, a redelivery. Its START was written
     * when it was first taken in, and nothing now (00361). Absent: a new message.
     */
    takenAgain?: boolean;
}
type ConsentSource = "this_message" | "record" | "none";
interface ConsentDecision {
    optedOut: boolean;
    /** Which input decided it — logged, so a disagreement is legible after the fact. */
    source: ConsentSource;
}
declare function resolveConsent(i: ConsentInputs): ConsentDecision;

/**
 * Whether the receptionist may speak, and in whose voice: the reply mode in force, as two rules with no dependencies,
 * so each is a truth table a test runs (reply-posture.test.mjs).
 *
 * replyPosture turns what the control plane said into the workspace's mode: a routed workspace whose runtime was read
 * follows its own reply policy, and anything else is 'ask'. effectiveReplyMode lets a person's own setting (People,
 * their profile, "Receptionist for ...") win over it; an absent setting changes nothing. openInbound (./context.ts)
 * calls the first once per message, modeInForce (./gates.ts) calls the second once the person's setting is looked up,
 * and the phone agent's booking-link message (apps/edge/api/retell-fn.ts) calls the second too, so a caller set to
 * never is left alone on a call as well.
 *
 * There is no fallback profile: a control plane that cannot be read is an outage, and during an outage the
 * receptionist says nothing in anyone's voice, so 'auto' is never the answer without a usable runtime to say so. Only
 * 'auto' and 'veto' let a message on to the model (./reply-gates.ts holds every other mode); a held message is already
 * persisted, its thread is escalated and a person is told. This file decides the mode, not the hold.
 */
interface RoutingFacts {
    /** The tenant runtime was read AND the read succeeded. */
    runtimeUsable: boolean;
    /** policies.reply.mode for this tenant, when the runtime carried one. */
    policyMode?: string;
}
interface ReplyPosture {
    /** The reply policy in force. Anything but 'auto' or 'veto' holds for a human. */
    replyMode: string;
}
declare function replyPosture(f: RoutingFacts): ReplyPosture;
/**
 * The mode in force for ONE message, once the person's own setting is known.
 *
 * A person-level setting (People, their profile, "Receptionist for ...") wins
 * over the workspace policy. An absent setting changes nothing.
 */
declare function effectiveReplyMode(posture: ReplyPosture, personMode: string | null | undefined): string;

/**
 * A photo the receptionist may look at.
 *
 * Off by default (tenant_config.features.vision). On, a customer's photo over
 * WhatsApp is fetched before the reply instead of after the acknowledgement,
 * handed to the model beside the words below, and answered like a message —
 * under every rule the system prompt already carries. Off, or for anything
 * that is not a small image, the photo is acknowledged and handed to a person
 * exactly as before.
 *
 * Pure: the handler decides WHEN, this file says WHAT.
 */
/** The API's own limit is 10 MB base64; a phone photo is well under this, and
 *  anything bigger is not worth the seconds it would cost the reply. */
declare const VISION_MAX_BYTES: number;
/** What the API accepts as an image block. */
declare const VISION_MIMES: Set<string>;
declare function isVisionMime(mime: string | null | undefined): mime is string;
/**
 * The words that go beside the image. The customer's caption is quoted as
 * theirs; the rest tells the receptionist how to treat a picture, and says
 * out loud that the standing rules still hold — a photo is the easiest way to
 * be asked "how much would this be?".
 */
declare function photoUserText(caption: string | null | undefined): string;
declare function toBase64(bytes: ArrayBuffer): string;

declare const MAX_REPLIES_PER_DAY = 20;
declare const STALE_MS: number;
declare const STALE_REPLY_MS: number;
/**
 * How late a message is, and what that means. Inside the reply horizon the
 * customer is still in the conversation they started, and answering late
 * beats not answering; beyond it an automated reply would arrive out of
 * nowhere, so a person picks it up. Meta redelivers for days, so an outage
 * longer than the horizon must never turn its backlog into silence.
 */
declare function ageVerdict(timestampS: string | number | undefined, now?: number): {
    ageMs: number;
    verdict: "fresh" | "late" | "stale";
};
/**
 * How long the reply waits before it goes out, and why.
 *
 * Under 'veto' every reply waits in the configured window so the business
 * can redirect the receptionist before the customer reads it. Under 'auto'
 * a reply the model itself is not sure enough about waits in the same
 * window (the confidence dial: limits.min_confidence, 0 or absent is off);
 * sure enough sends itself. A reply with no confidence on record sends too:
 * the dial compares a number, and none is not a low one -- the pane says so
 * beside the dial.
 */
declare function holdPlan(replyMode: string, replyLimits: PolicyLimits, brainMeta: BrainMeta | undefined): {
    delayMs: number;
    heldForConfidence: boolean;
    source: "veto_window" | "low_confidence";
    minConfidence: number;
};
interface LayerTwoIn {
    replyText: string;
    escalate: boolean;
    escalationReason: string;
    brainCfg: BrainConfig;
    policy: Record<string, {
        mode: string;
    }> | null | undefined;
    intent: string | null;
    /** The language the model answered in (its record's), so a replaced reply is said in it. */
    language?: string | null;
    /** What the platform knows independently of what was typed; the number to call resolves over both. */
    known?: KnownFacts | null;
}
interface LayerTwoOut {
    replyText: string;
    escalate: boolean;
    escalationReason: string;
    /** A price in the draft blocked the send outright. */
    priceBlocked: boolean;
    /** Money in the draft or in the model's intent: a person answers (the charter). */
    moneyHeld: boolean;
    /** The class under "ask" (or money's "never") this reply fell into, if any. */
    askClass: "booking" | "faq" | "money" | null;
    /** Whether the model had already done what the prompt asked (null when no class applied). */
    complied: boolean | null;
}
/**
 * Layer-2 policy enforcement (Blueprint §6): prompt text is never the only
 * defense. A price in the draft blocks the send outright. Money -- a refund, a
 * discount, a deposit, a payment term, named in the draft or read as the
 * model's intent -- is a person's, whatever the model's record says (the
 * charter's locked row). Under "ask", a booking or a service/pricing question
 * is a person's to answer: a reply that still carries the booking link, or
 * still answers, is replaced with the handoff line; one that complied keeps
 * its words. Every replacement is said in the answer's language
 * (contracts heldLine). Either way the thread is a person's now, and the Inbox
 * says why.
 */
declare function layerTwo(x: LayerTwoIn): LayerTwoOut;
/**
 * What a held thread says, and to whom. A hold the owner chose for THIS
 * person is its own reason — the Inbox should say "you handle this person",
 * not "held by policy". A saved-but-unparseable config is a MISTAKE, not an
 * absence, and the sentence sends the operator to the right place.
 */
declare function holdCopy(x: {
    brainCfg: BrainConfig | null;
    personMode: string | null;
    replyMode: string;
    configBroken: boolean;
    /**
     * The control plane could not be READ (tenant-runtime's failed read). A third
     * state, because it is neither of the other two: a workspace with a perfectly
     * good persona was being told it had none and sent to Settings to fix a
     * database outage.
     */
    loadFailed?: boolean;
}): {
    personHold: boolean;
    reason: "person_hold" | "policy_block";
    details: string;
    botText: string;
    why: string;
};
/**
 * What the receptionist does when it has no model to think with (PRD AI-04).
 * A canned greeting passed off as an answer would be the quiet failure: the
 * workspace's own greeting still goes, labelled a fallback so nobody counts
 * it as an answer, the thread is handed to a person, and the platform is
 * paged once per window, because the condition is the platform's, not this
 * workspace's. The escalation reason is brain_error, the closed set's word
 * for "the receptionist could not answer and a holding message went out".
 */
declare const NO_MODEL_PAGE: {
    readonly key: "brain_unavailable";
    readonly subject: "The receptionist has no model key";
    readonly body: "ANTHROPIC_API_KEY is not set on the edge. Every reply is the workspace's generic greeting, labelled a fallback, and every thread is handed to a person until the key is back.";
};
declare function noModelPlan(fallbacks: {
    greeting: string;
}): {
    replyText: string;
    meta: {
        ack: true;
        fallback: "no_model";
    };
    escalate: true;
    escalationReason: "brain_error";
    escalationDetails: (customerText: string) => string;
    alertReason: "no model";
};

/**
 * A channel other than WhatsApp riding the same road. It says how a reply
 * goes out, what the words become on its wire (a text's first reply to a
 * person carries the footer), and whether every message is held for a
 * person for now (a line the carriers have not approved for texting).
 * Null = WhatsApp, on the tenant's credentials, as before.
 */
interface InboundCarrier {
    channel: "sms";
    /** The provider's answer, its own code with it: the door tells the carrier's no on the person's behalf (21610) from a failure of ours. */
    send(to: string, body: string): Promise<SendResult>;
    body(text: string, isFirstReply: boolean): string;
    held: {
        reason: string;
        details: string;
    } | null;
    /** What the carrier itself decided about the text: its STOP or START outranks our reading of the words. */
    consent?: CarrierConsent | null;
}
/** One inbound message, as the door's adapter hands it over. */
interface InboundInput {
    /** withCarrierConsent(normalizeInbound(m, value), carrier?.consent ?? null), done by the adapter. */
    message: NormalizedInbound;
    /**
     * The raw fields this body still reads off the provider's own shape: the
     * message id and the sender for the log envelope and the wire, the raw type
     * for the words an owner reads ("Customer sent a sticker message"), and the
     * provider's timestamp for the staleness check. Everything else is read from
     * the normalised record above.
     */
    raw: {
        id: string;
        from: string;
        type: string;
        timestamp: string | number | null;
    };
    tenantId: string | null;
    routed: RoutedChannel | null;
    isEnvDefault: boolean;
    carrier: InboundCarrier | null;
    /**
     * The job that answers a text after its acknowledgement (recordInbound recorded it in the door): its ingest is a
     * redelivery, and the message is answered while it is unprocessed and no reply names it yet.
     */
    resume?: boolean;
}
/**
 * The door's half of a text answered after its acknowledgement (decision 0031, Phase 2): the message set aside or
 * recorded, nothing decided about the answer. The ingest's row when it waits for its answer, which a job gives it
 * (answerInbound with `resume`); null when it was set aside, is a redelivery, or there is nowhere to record it;
 * IngestFailed when the write failed, so the door refuses and the provider sends it again.
 */
declare function recordInbound(input: InboundInput, ports: InboundPorts): Promise<IngestResult | null>;
declare function answerInbound(input: InboundInput, ports: InboundPorts): Promise<void>;

/**
 * The booking page a page links to as the way to book: the first `<a href>` whose words -- its text, its images'
 * `alt`, its `aria-label` or `title` -- say booking, and whose address, as a browser resolves it against the page, is
 * a business's own page on a booking platform (contracts' bookingPageOf). A platform link that does not say booking is
 * a badge, a gift card or a shop, and is not taken. Null when the page names none.
 *
 * Read in one pass: each link's tag and words are read within a bound, and the next link is looked for after the
 * tag, so a page written to be slow to read is read no slower than any other.
 */
declare function bookingPageLinkedFrom(html: string, pageUrl: string): string | null;

/**
 * The subscribers a delivery can name (contracts EVENT_SUBSCRIBERS; decision 0032, 00334): each a verb over the event
 * it is handed and the ports it acts through, run by the event_deliver job (packages/jobs handlers.ts) after the relay
 * wrote its delivery row.
 *
 * Every one may see the same delivery twice and must leave the same rows: a lease that ran out, a re-drive, a second
 * relay of a late commit are all second runs, and the ledger's rule below the commit line is at least once
 * (0031, invariant 3). The harness in tooling/scripts/tests/events runs each subscriber twice on one delivery.
 *
 *   audit             settles and does nothing else: it measures the relay (0032, step 3).
 *   reach_out_booked  an appointment kept, moved or back on the record (appointment.changed, 00348 and 00381) is
 *                     handed to the booking door, so the lead a reach-out wrote to is booked however the booking
 *                     arrived: the hourly feed's, and a booking tool's notice by email, which never reached it. The
 *                     door stamps a lead once, so a second run moves nothing.
 */

/** What a subscriber acts through: the job's own database, behind the verbs it needs. */
interface SubscriberPorts {
    /** The booking door over one appointment of the record (00381 reach_out_booked_from): how many leads moved. */
    bookedFromAppointment(tenantId: string, appointmentId: string): Promise<number>;
}
/** A subscriber: the event, once; nothing to return, a throw is a failed delivery. */
type Subscriber = (event: DeliveredEvent, ports: SubscriberPorts) => Promise<void>;
declare const SUBSCRIBERS: Readonly<Record<EventSubscriber, Subscriber>>;

export { type AfterProbe, type AppointmentPatch, type ApproveReceipt, type ApproveRunPorts, type ArchivePorts, type AssembleCommand, type AssembleDecision, type AssemblePorts, type Assembled, type AssembledRun, BROADCAST_STALLS_MAX, BROADCAST_STALL_RETRY_MS, type BatchCarry, type BeginAsk, type BeginCommand, type BeginPorts, type BeginReceipt, type BookingNoticePorts, type BrainCall, type BroadcastBatchCommand, type BroadcastBatchPorts, type BroadcastReceipt, type BroadcastRef, type BroadcastRow, CARDS, CHECKER_FIELDS, CHECKER_RUN_TIMEOUT_SECS, CHECK_BATCH, CLOSED_REASON, type CancelBroadcastPorts, type CancelReceipt, type CancelSendPorts, type Channel, type CheckAgain, type CheckOutcome, type CheckPlaybookPorts, type CleanPlace, type CollectCommitResult, type CollectJudgment, type CollectOutcome, type CollectPage, type CollectPlace, type ConsentDecision, type ConsentInputs, type ConsentSource, type ContactRow, type CreateBroadcastCommand, type CreateBroadcastPorts, type CredentialsRead, DEADLINE_MARGIN_MS, DUPLICATE_REASON, type Db, type DeliverPorts, type Delivered, type Delivery, type Door, type DraftMark, type DraftState, EMAIL_BODY_MAX, EMAIL_REVIEW_WORDS, type EmailClaim, type EmailIngestOutcome, type EmailIngestPorts, type EmailParentFacts, type EmailReplyPorts, type EmailRoute, type EscalationPorts, FACT_MAX, FINAL_RUN_STATES, FIRST_COLLECT_SECONDS, type FollowedStep, HOLD_EXPIRY_MS, type HandBackPorts, type HandItem, type HandStep, type HandStepPorts, IDEMPOTENCY_WINDOW_MS, INPUT_MARKER, type Identity, type InboundBrainReply, type InboundCarrier, type InboundChannel, type InboundDb, type InboundHandoff, type InboundInput, type InboundLog, type InboundPorts, type InboundRuntime, type InboundSink, type IncomingEmail, IngestFailed, JUDGE_MARGIN_MS, JUDGE_REFUSED_REASON, JUDGE_TIMEOUT_MS, type JudgedBatch, type KeptReading, type KeyClaim, type KeyHold, LEASE_SECONDS, type LatLng, type LateFailureCommand, type LateFailureFacts, type LateFailureOutcome, type LateFailurePorts, type LayerTwoIn, type LayerTwoOut, type LeadCardRunner, type LeadColumns, type LeadDb, type LeadMemberRow, type LeadPorts, LeadRetry, type LeadRoundRow, type LeadRunRow, type LeadShare, type ListCount, MAPS_CAP_FLOOR_USD, MAPS_FIELDS, MAPS_RUN_TIMEOUT_SECS, MARK_ALLOWANCE_MS, MARK_AT_ONCE, MARK_MAX_BYTES, MARK_MAX_RATIO, MARK_MIN_SIDE, MARK_TRIES, MAX_REPLIES_PER_DAY, MAX_SNOOZE_MS, type MapsPlace, type MarkImage, type MarkKind, type MemberJudgment, NEEDS_UNTIL, NO_LOCATION_REASON, NO_MODEL_PAGE, type NewAppointment, type NewBroadcast, type NewReachOutRun, type NewRecipient, NotTakenError, type NoticeClient, type NoticeEmail, type NoticeLedgerRow, type NoticeOutcome, OUT_OF_AREA_REASON, type OutboundRefusal, type Owner, PAGE_ITEMS, PAGE_READ_ALLOWANCE_MS, PERSON_CONTROL_MAX_S, POLL_SECONDS, PROVIDER_RUN_PAGE, type Phase, type PlannedSend, type PlaybookInput, type PlaybookRow, type ProbeYieldMember, type ProvisionLinePorts, type QueuedReply, RADIUS_MAX_M, RADIUS_MIN_M, REPLY_IN_PROGRESS_REFUSAL, type ReachOutFollower, type ReachOutLead, type ReachOutRunOutcome, type ReachOutRunPorts, type ReachOutStep, type ReadBookingNoticeCommand, type ReadBookingNoticeOutcome, type ReadReplyCommand, type ReadReplyOutcome, type RecipientMark, type RecipientRow, type ReconcileOutcome, type RejudgeOutcome, type RejudgeResult, type ReplyBody, type ReplyCommand, type ReplyFacts, type ReplyNotice, type ReplyPorts, type ReplyPosture, type ReplyReadPorts, type ReplyReceipt, type ReplyThread, type ResolveResult, type RoundQuestion, type RoutingFacts, type RunBy, type RunContext, type RunOutcome, type RunPlaybookCommand, type RunPlaybookPorts, SEND_GRACE_MS, SEND_RETRY_WAITS_MS, STALE_MS, STALE_REPLY_MS, SUBSCRIBERS, type SendKind, type SendPayload, type SendQueuedCommand, type SendQueuedPorts, type Sender, type SnoozePorts, type SnoozeResult, type StartOutcome, type StoredAppointment, type Subscriber, type SubscriberPorts, type TakeOverPorts, type TakeOverResult, type TemplateSend, type TemplateValuesPorts, type TermOutcome, type Thread, type ThreadPorts, type ThreadState, type ThreadTurn, UNKNOWN_START_GRACE_MS, VISION_MAX_BYTES, VISION_MIMES, type WakePorts, type Wire, type WirePayload, type WireUnavailable, WireUnavailableError, afterProbe, ageVerdict, answerInbound, approveRun, archive, areaCenter, assembleRun, beginConversation, bookingPageLinkedFrom, campaignHow, campaignHowOf, cancelBroadcast, cancelSend, centerOf, check, checkPlaybook, checkPlaybookChannels, checkable, cleanPlace, collect, createBroadcast, deliver, deliverSafely, discoveryEnding, effectiveReplyMode, emailSender, fact, factsOf, foldDuplicates, handBack, handStepIdFor, hasContact, haversineM, holdCopy, holdPlan, identityOf, imageHeaderOf, inArea, ingestEmail, isAgainRun, isFreeMail, isNotTakenError, isThreadUnknown, isVisionMime, isWireUnavailable, isWireUnavailableError, judgeBatch, layerTwo, mainAsk, markImageFrom, markPlaces, mayBegin, medianCenter, memberOf, nearbyFor, nearestAreas, noModelPlan, opIdFor, outboundGate, parseChannels, photoUserText, probeAsk, probeYield, provisionLine, radiusFromSpread, raiseLateFailure, reachOutRunIdFor, readBookingNotice, readCampaignMessage, readReply, reconcileUnknownRuns, recordInbound, refusalScript, rejudgeProbe, replyPosture, replyToConversation, resolveConsent, resolveEscalation, runCaps, runHandStep, runIdFor, runPlaybook, runReachOut, runStateOf, sendBroadcastBatch, sendIdFor, sendMessageId, sendQueued, sha256Hex, shareKeysOf, sharesWithin, snooze, startRound, takeBatch, takeOver, targetOf, templatePurpose, templateValues, termsShortOf, toBase64, unreadableThread, wake, whatsappSender, whatsappWire, wireUnavailable, yieldOf, zctaCenter };
