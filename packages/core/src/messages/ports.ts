/**
 * The send path's view of the world: what the job verbs need, named for
 * what each means. The adapter that knows the tables and the runtime's
 * services is packages/jobs/src/handlers.ts.
 */
import type { JobNews, SendPurpose } from "@chanlytics/contracts";
import type { Delivered, Delivery } from "../deliver";

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
  deliver: Door;
  /** The thread flagged for a person, with why. */
  escalate(conversationId: string, reason: string, details: string): Promise<unknown>;
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
  /** `to_phone` on a phone's wire, `to_email` on email's: an address never travels in a field read as a number. */
  payload: {
    message_id: string;
    conversation_id: string;
    to_phone?: string;
    to_email?: string;
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
}
export interface ContactRow {
  id: string;
  phone_e164: string | null;
  erased_at: string | null;
  display_name: string | null;
  wa_profile_name: string | null;
}
export type RecipientMark = {
  /**
   * `queued` only releases a claim WhatsApp answered "not now", with the reason `throttled` (00216): the send was not
   * taken, so it is tried again. The database refuses any other release.
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
  /** The template as Meta has it: its status, its words, its category. Null when gone; throws when it cannot be read. */
  template(
    name: string,
    language: string,
  ): Promise<{ meta_status: string | null; body_preview: string | null; category: string | null } | null>;
  /** The workspace's own words for the slots that name it, and its clock (IANA zone), which the sending hours are kept by. */
  facts(): Promise<{ businessName: string; bookingLink: string | null; timezone: string }>;
  /** Up to `limit` people still queued; throws when it cannot be read. */
  batch(id: string, limit: number): Promise<RecipientRow[]>;
  /** The people on the batch by id, one read for all of them; a row that is gone is absent. Throws when it cannot be read. */
  contacts(contactIds: string[]): Promise<Map<string, ContactRow>>;
  /** The thread this send belongs to, never created here. */
  target(phoneE164: string): Promise<{ conversationId: string } | null>;
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
  mark(id: string, contactId: string, patch: RecipientMark): Promise<void>;
  deliver: Door;
  /**
   * Why the run's wire cannot be bound right now -- the workspace's credentials could not be read (deliver
   * WireUnavailable) -- or null when the door can be asked. Asked BEFORE anyone is claimed: a claim settles only to
   * sent or skipped (00182), never back to queued, so a wire known to be unbound claims nobody and the batch waits.
   * A number that is ABSENT is not this port's to say: the door answers that per person, as it always did.
   */
  wireUnavailable(channel: "whatsapp"): Promise<string | null>;
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
}
