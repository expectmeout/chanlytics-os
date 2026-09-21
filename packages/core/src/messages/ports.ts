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
  queued(messageId: string): Promise<{ status: string; body: string | null; channel: string | null; sender: string | null; /** The frozen request, on an email's row. */ email?: Delivery["email"] | null } | null>;
  /** Which yes this send needs: the template's category as Meta has it, read now; unreadable throws. */
  purposeOf(template: { name: string; language: string } | undefined): Promise<SendPurpose>;
  deliver: Door;
  /** The thread flagged for a person, with why. */
  escalate(conversationId: string, reason: string, details: string): Promise<unknown>;
  /** Tell this workspace's people. The news says what it IS (contracts JobNews); a caller cannot leave that to the sender. */
  alert(news: JobNews): Promise<void>;
  /** The platform's own pager, for a provider refusing every send on a wire. */
  page?(key: string, subject: string, body: string): Promise<unknown>;
}

export interface ProvisionLinePorts {
  /** The saga, or its resumption: the edge's, because the provider and the credentials live there. Absent in a runtime that holds none. */
  provision?(lineId: string, by: "owner" | "support" | "sweep"): Promise<{ ok: boolean; step?: string; error?: string }>;
}

export interface BroadcastRow { id: string; state: string; name: string; template_name: string; template_language: string; params: unknown; recipient_count: number | null; playbook_id: string | null; audience: unknown }
export interface RecipientRow { contact_id: string; facts: unknown }
export interface ContactRow { id: string; phone_e164: string | null; erased_at: string | null; display_name: string | null; wa_profile_name: string | null }
export type RecipientMark = { state: "sent" | "skipped" | "failed"; reason?: string | null; message_id?: string | null; sent_at?: string | null };

export interface BroadcastBatchPorts {
  /** The broadcast, or null when it is gone; throws when it cannot be read. */
  broadcast(id: string): Promise<BroadcastRow | null>;
  workspacePaused(): Promise<boolean>;
  fail(id: string, failure: string): Promise<void>;
  /** scheduled → sending, only while scheduled. True iff the row changed: false is a cancel that landed first. */
  startSending(id: string): Promise<boolean>;
  /** The template as Meta has it: its status, its words, its category. Null when gone; throws when it cannot be read. */
  template(name: string, language: string): Promise<{ meta_status: string | null; body_preview: string | null; category: string | null } | null>;
  /** The workspace's own words for the slots that name it. */
  facts(): Promise<{ businessName: string; bookingLink: string | null }>;
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
  /** How many are still queued; throws when it cannot be counted. */
  remaining(id: string): Promise<number>;
  /** The broadcast's state now; null when gone. Throws when it cannot be read: an unreadable state is not a cancel. */
  state(id: string): Promise<string | null>;
  /** The next batch, as this tenant, through the same door the dashboard uses; now unless told when. */
  scheduleNext(id: string, dueAt?: Date): Promise<void>;
  /** Who got it and who was held, once nobody is queued. */
  tally(id: string): Promise<{ sent: number; held: number }>;
  /** sending → sent, and the event with the tally. */
  finish(id: string, tally: { sent: number; held: number }): Promise<void>;
  /** Tell this workspace's people. The news says what it IS (contracts JobNews); a caller cannot leave that to the sender. */
  alert(news: JobNews): Promise<void>;
  now(): number;
  sleep(ms: number): Promise<void>;
}
export interface BroadcastBatchCommand { tenantId: string; broadcastId: string; deadline: number }
