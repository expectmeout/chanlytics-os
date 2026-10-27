/**
 * The send path's view of the world: what the job verbs need, named for
 * what each means. The adapter that knows the tables and the runtime's
 * services is packages/jobs/src/handlers.ts.
 */
import type { AppointmentState, FeedNames, JobNews, SendPurpose } from "@chanlytics/contracts";
import type { EmailRequest } from "@chanlytics/channels";
import type { Json, MessageVersionRow } from "@chanlytics/db";
import type { Channel, Delivered, Delivery } from "../deliver";

/** The door, handed in: a verb never builds it, so a test can answer whatever the case needs. */
export type Door = (d: Delivery) => Promise<Delivered>;

export interface SendQueuedPorts {
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
  purposeOf(template: { name: string; language: string } | undefined): Promise<SendPurpose>;
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
  escalate(
    conversationId: string,
    reason: string,
    details: string,
  ): Promise<"opened" | "changed" | "refreshed" | "failed">;
  /** The reason the thread waits for a person now (its open escalation), null when nothing holds it; unreadable throws. */
  openHold(conversationId: string): Promise<string | null>;
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
export interface SendQueuedCommand {
  tenantId: string;
  /**
   * `to_phone` on a phone's wire, `to_email` on email's, `to_instagram` (the person's Instagram-scoped id) on a DM's:
   * an address never travels in a field read as a number.
   */
  payload: {
    message_id: string;
    conversation_id: string;
    to_phone?: string;
    to_email?: string;
    to_instagram?: string;
    body?: string;
    template?: { name: string; language: string; params: string[] };
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

export interface ProvisionLinePorts {
  /** The saga, or its resumption: the edge's, because the provider and the credentials live there. Absent in a runtime that holds none. */
  provision?(
    lineId: string,
    by: "owner" | "support" | "sweep",
    deadline?: number,
  ): Promise<{ ok: boolean; step?: string; error?: string; more?: boolean }>;
  /** One more job of this kind, for the steps a run left at its deadline. */
  next?(payload: Record<string, unknown>): Promise<void>;
  /** Epoch ms: the run starts no provider call after it. */
  deadline?: number;
}

export interface BroadcastRow {
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
export interface RecipientRow {
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
export interface ContactRow {
  id: string;
  phone_e164: string | null;
  /** Their email address as stored, which the door compares a frozen request's To with; null or absent with none. */
  email?: string | null;
  /** Email's own answer about offers (00174): an offer's foot says why they get it from it (asked for them, or a customer). */
  email_marketing?: string | null;
  erased_at: string | null;
  display_name: string | null;
  wa_profile_name: string | null;
  /** Where that name came from, and whether a member settled it (0052): a stand-in is "there" (firstNameOf). */
  name_source?: string | null;
  name_settled_at?: string | null;
}
export type RecipientMark = {
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

export interface BroadcastBatchPorts {
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
   * The workspace's own words for the slots that name it, and its clock (IANA zone), which the sending hours are kept by;
   * and the postal address its emails' foot gives (the Business record's), null when it has none.
   */
  facts(): Promise<{
    businessName: string;
    bookingLink: string | null;
    timezone: string;
    address?: string | null;
  }>;
  /**
   * The link a customer leaves the business a review at, as its Google listing keeps it (db reviewLinkOf, 00415), or null
   * where it keeps none; throws when it cannot be read. Asked once a batch, and only of a run whose message has a review
   * slot: a send without one never depends on the listing.
   */
  reviewLink(): Promise<string | null>;
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
  /**
   * What the owner's calendar feed names now (the edge's feed, kept five minutes), asked beside the record because the
   * record is only as new as the hourly sweep: a visit cancelled in the calendar alone is still `booked` there, and its
   * reminder would go. Null where the workspace has no calendar feed (nothing to ask); absent where the runtime has none.
   * THROWS when the feed cannot be read: a reminder for a calendar event whose standing is unknown waits, queued, for the
   * next batch, as every read the send cannot make does (broadcast.ts readPeople), and is never sent on a guess.
   */
  feed?(): Promise<FeedNames | null>;
  /** The thread this send belongs to, never created here. */
  target(phoneE164: string): Promise<{ conversationId: string } | null>;
  /** The same thread by the person, for an email, which reaches them by an address rather than a number; null for one that is gone. */
  targetOfContact(contactId: string): Promise<{ conversationId: string } | null>;
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
    offer?: { unsubscribeUrl: string; footerHtml: string };
  }): Promise<EmailRequest | null>;
  /**
   * The link that unsubscribes this person from this email (the page every offer's foot and List-Unsubscribe carry),
   * sealed for them: `/u/<token>` on the deployment's unsubscribe origin (channels unsubscribeUrl). Null where this runtime
   * cannot seal one (no secret, no campaigns domain): the person is held, an offer never goes without its way out.
   */
  unsubscribeUrl(i: { messageId: string; contactId: string }): Promise<string | null>;
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
  }): Promise<{ status: string }>;
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
  alreadySent(id: string, contactIds: string[]): Promise<Map<string, { id: string; sentAt: string | null }>>;
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
  tally(id: string): Promise<{ sent: number; held: number }>;
  /**
   * Which of the reasons a finished run names only when counted (contracts HELD_WHEN_COUNTED: the workspace's holds on
   * email, the week's breath, the month's allowance) anyone on the run was skipped for: the finished run's news names
   * those, and only those, among its reasons. Asked once nobody is queued, of a run that held someone back.
   */
  heldFor(id: string): Promise<string[]>;
  /** sending → sent, and the event with the tally. */
  finish(id: string, tally: { sent: number; held: number }): Promise<void>;
  /** Tell this workspace's people. The news says what it IS (contracts JobNews); a caller cannot leave that to the sender. */
  alert(news: JobNews): Promise<void>;
  now(): number;
  sleep(ms: number): Promise<void>;
  /** The draw a wait is lengthened by (contracts jittered); Math.random when absent. */
  random?: () => number;
}
/** What a run has waited through, carried from one batch to the next in the job's payload. */
export interface BatchCarry {
  /**
   * How many times WhatsApp said "not now", or could not be reached at all, running (BROADCAST_THROTTLE_WAITS_MS).
   */
  waits?: number;
  /** How many batches in a row reached nobody because a read failed, the credentials' or the people's (BROADCAST_STALLS_MAX). */
  stalls?: number;
}
export interface BroadcastBatchCommand extends BatchCarry {
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
