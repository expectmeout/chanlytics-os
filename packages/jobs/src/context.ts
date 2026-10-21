/**
 * What every job handler is handed: the job as it was claimed, and the context its ports are built from. Moved whole
 * from handlers.ts (Reach out Part 2.5), which re-exports its public names.
 */
import type { ReceivedEmail } from "@chanlytics/channels";
import type { FeedNames, JobKind, JobNews, PushMessage, Unread } from "@chanlytics/contracts";
import type { BookingNoticePorts, EmailIngestPorts, ReplyNotice, ReplyReadPorts, Wire } from "@chanlytics/core";
import type { Database, Json } from "@chanlytics/db";
import type { SupabaseClient } from "@supabase/supabase-js";

export interface PushReceipt {
  to: string;
  status: "ok" | "error";
  /** The ticket's id when the service took the message: what its receipt is asked for by (00189). */
  id?: string;
  /** Expo's name for what went wrong; "DeviceNotRegistered" is a phone to forget. */
  error?: string;
}

/** One ticket kept for its receipt: which phone, by which id. */
export interface PushTicket {
  id: string;
  to: string;
}

export interface PushPort {
  send(messages: PushMessage[]): Promise<PushReceipt[]>;
  /** The receipts for these ticket ids; an id the service has no receipt for yet is absent. */
  receipts(ids: readonly string[]): Promise<Record<string, { status: "ok" | "error"; error?: string }>>;
}

export interface JobContext {
  db: SupabaseClient<Database>;
  /**
   * The job's own tenant's wires, bound by the edge where the credentials
   * are: WhatsApp on the tenant's credentials, the texting line when the
   * workspace has one. A null wire is a refusal at the door, never a guess
   * from the environment.
   */
  wire: Wire;
  /** Tell this job's tenant. The news carries its own kind and door (contracts JobNews); the runtime that addresses it never chooses them. */
  alert: (news: JobNews) => Promise<void>;
  /**
   * The platform's own pager, for a condition that is the platform's: a
   * provider refusing sends with 401 or 403 is credentials, not content.
   * Optional so a test context need not supply one. The workspace rides along, so the pager can leave ours out (00469).
   */
  page?: (key: string, subject: string, body: string, tenantId?: string | null) => Promise<unknown>;
  /**
   * Run a line's provisioning saga, or resume it. INJECTED, not imported:
   * the provider and the receptionist's credentials live on the edge, and a
   * package must not reach into an app. The saga reads its own receipts, so a
   * second run repeats nothing. Optional so a test context need not supply
   * one; a job of this kind in a runtime without it fails loudly rather than
   * guessing.
   */
  provisionLine?: (
    lineId: string,
    by: "owner" | "support" | "sweep",
    /** No provider call starts after this (the job's deadline); the saga stops between two and says `more`. */
    deadline?: number,
  ) => Promise<{ ok: boolean; step?: string; error?: string; did?: string; more?: boolean }>;
  /**
   * Email's intake, as the edge holds it. INJECTED like the one above: the
   * provider's key and the deployment's mail domain live on the edge, and so
   * does the read of who asked to be forgotten. Optional so a test context
   * need not supply one; an email_ingest job in a runtime without it fails
   * loudly rather than guessing.
   */
  email?: {
    /** The deployment's mail domain: what a mailbox's local part is an address on. */
    domain: string;
    /**
     * Where an OFFER by email leaves from (One message, every channel, step 4), bound by the edge only for a job that sends one
     * (a broadcast's batch) and only while the deployment's campaigns domain is verified: that domain, and what seals the
     * unsubscribe link every offer carries (the secret, and the origin its page answers on). Absent: this runtime sends no
     * offer by email, and the door refuses one (core deliver `emailOffers`).
     */
    campaigns?: { domain: string; unsubscribeSecret: string; unsubscribeOrigin: string } | null;
    /**
     * Why offers by email are closed on this runtime although the deployment names a campaigns domain: the provider says it
     * is not verified for sending (bound with `campaigns` null, for a broadcast's batch only). The run stops with this said
     * rather than hold each offer person as having no channel (core BroadcastBatchPorts.offersClosed). Absent: nothing of the
     * kind to say, which is also what a deployment that names no campaigns domain reads as.
     */
    campaignsClosed?: string | null;
    /**
     * Why it is not known whether offers by email may leave: the deployment names a campaigns domain and the provider could
     * not be asked about it (bound for a broadcast's batch only, the email wire itself bound as ever, so a visit's email
     * goes). An offer's run waits and asks again (core BroadcastBatchPorts.offersUnread). Absent: nothing of the kind.
     */
    campaignsUnread?: string | null;
    /** One received email by the provider's id; null when the provider has none such. Throws when it cannot be asked. */
    fetch: (receivedId: string) => Promise<ReceivedEmail | null>;
    /** Was this email received before a person with this address asked to be forgotten (00125's digest)? */
    erasedBefore: (tenantId: string, address: string, receivedAtIso: string) => Promise<boolean>;
    /** Tell the workspace's people an email is waiting: the edge's notify, addressed from that workspace. Never throws. */
    tell: (tenantId: string, note: Parameters<EmailIngestPorts["tell"]>[1]) => Promise<void>;
  };
  /**
   * The intake of the mailboxes businesses connected (decision 0056), as the edge holds it: a message fetched from the
   * mailbox's own provider with its token, by the connection and the provider's id for it. INJECTED like `email`: the
   * tokens live on the edge. An email_ingest job whose payload says `source: "mailbox"` reads through this one, and in
   * a runtime without it fails loudly. Erasure and the owner's note are `email`'s, or these when `email` is absent.
   */
  mailboxIntake?: {
    fetch: (connectionId: string, providerId: string) => Promise<ReceivedEmail | null>;
    erasedBefore: (tenantId: string, address: string, receivedAtIso: string) => Promise<boolean>;
    tell: (tenantId: string, note: Parameters<EmailIngestPorts["tell"]>[1]) => Promise<void>;
  };
  /**
   * The owner's calendar feed, as the edge reads it (kept five minutes). INJECTED like email's intake: the fetch, its cache
   * and the workspace's feed address live on the edge. Optional so a test context need not supply one; a broadcast's
   * reminders then go on the record alone.
   */
  calendar?: {
    /**
     * What the workspace's calendar feed names now, over the span it was read for; null where the workspace has no feed to
     * ask. Throws when the feed cannot be read: a reminder for a calendar event waits for the next batch (core broadcast).
     */
    feedNames: (tenantId: string, now: Date) => Promise<FeedNames | null>;
  };
  /**
   * The lead finder's pipeline (00140), as the edge holds it. INJECTED like
   * the two above: the provider's token, the judge's client and the
   * webhook base live on the edge (release A2 binds them). Optional so a
   * test context need not supply one; a lead job in a runtime without it
   * fails loudly rather than guessing. Each takes the claimed job whole and
   * bounds itself to one page or one batch before ctx.deadline.
   */
  leads?: {
    roundStart: (ctx: JobContext, job: ClaimedJob) => Promise<void>;
    collect: (ctx: JobContext, job: ClaimedJob) => Promise<void>;
    check: (ctx: JobContext, job: ClaimedJob) => Promise<void>;
  };
  /**
   * The phones: one message each through Expo's push service, as the edge
   * binds it (lib/ops/push.ts). INJECTED like email's intake. A receipt per
   * message, in order; a transport failure throws and the ledger tries again.
   */
  push?: PushPort;
  /**
   * The reading of a reach-out's reply (Reach out Part 5), as the edge holds it. INJECTED like email's intake: the
   * model's key, the workspace's spend and the notification door live on the edge. Optional so a test context need
   * not supply one; a reply_read job in a runtime without it fails loudly rather than guessing.
   */
  replies?: {
    /**
     * The reader's answer, unparsed; null when it answered nothing usable. Throws on a failed call. No call runs past
     * `deadline`. `forWhom` is the usage ledger's row: the reply's workspace and message.
     */
    ask: (
      system: string,
      user: string,
      deadline: number,
      forWhom: { tenantId: string; subjectId: string },
    ) => Promise<unknown>;
    /** One read taken, or why not: no model, a workspace that may not spend, the day's reads spent. */
    mayRead: (tenantId: string, at: Date) => Promise<Exclude<Unread, "model_failed"> | null>;
    /** Tell the workspace once (notifyOnce): true only when the owner was told. */
    tell: (tenantId: string, notice: ReplyNotice) => Promise<boolean>;
    /**
     * The receptionist's draft of an answer (decision 0017): its text, or the gate that stopped it or that it was not
     * drafted. Throws when it failed; no call runs past `ask.deadline`.
     */
    draft: ReplyReadPorts["draft"];
  };
  /**
   * The reading of a booking tool's notice (docs/plans/2026-10-07-bookings-arrive-by-email.md), as the edge holds it.
   * INJECTED like `replies`: the model's key, the workspace's spend and the person-making rules live on the edge.
   * Optional so a test context need not supply one; a booking_read job in a runtime without it fails loudly.
   */
  bookings?: {
    /** The reader's answer, unparsed; null when it answered nothing usable. Throws on a failed call. No call runs past `deadline`. */
    ask: (
      system: string,
      user: string,
      deadline: number,
      forWhom: { tenantId: string; subjectId: string },
    ) => Promise<unknown>;
    /** Why the model may not be asked now, or null when it may. */
    mayRead: (tenantId: string, at: Date) => Promise<"no_model" | "may_not_spend" | null>;
    /** The person the booking is for, matched or made by the calendar sweep's rules; null when nobody can be. */
    personFor: BookingNoticePorts["personFor"];
    /** Tell the workspace a notice is held for a person (the bell, once per delivery and hold). Never throws. */
    tell: (
      tenantId: string,
      notice: { noticeId: string; tool: string; subject: string | null; reason: string; hold: string },
    ) => Promise<void>;
  };
  /**
   * A text answered after its acknowledgement (decision 0031, Phase 2), as the edge holds it: the line, its sender and
   * the receptionist's ports live there. INJECTED like email's intake. Optional so a test context need not supply one;
   * an inbound_answer job in a runtime without it fails loudly rather than guessing.
   */
  inbound?: {
    /** The job's text taken up again through the whole inbound phase; throws when it could not be, and the ledger retries. */
    answer: (job: ClaimedJob) => Promise<void>;
  };
  /**
   * Schedule a job of this tenant — how a broadcast continues itself, one
   * batch after another, through the same door the dashboard uses.
   */
  schedule: (kind: JobKind, dueAt: Date, payload: Json) => Promise<void>;
  /**
   * Schedule a job of this tenant that the ledger holds at most one of per subject (scheduleJobOnce: a unique index on
   * its payload, as reply_read's jobs_reply_read_once). A second one is answered already_scheduled, never thrown.
   */
  scheduleOnce: (kind: JobKind, dueAt: Date, payload: Json) => Promise<"scheduled" | "already_scheduled">;
  /**
   * Epoch ms. A handler that loops over outward work starts no new send after
   * this and leaves the rest to a follow-up job through `schedule`. The runner
   * is killed at a fixed ceiling, and a send cut off mid-flight is a send
   * whose outcome nobody knows.
   */
  deadline: number;
}

export interface ClaimedJob {
  id: string;
  tenant_id: string;
  kind: string;
  payload: Record<string, unknown>;
  /**
   * Which try this is, as the claim counts them (the ledger's attempts: 1 on the first run). For a handler that must
   * leave its own record when the last try fails (booking_read holds the notice for a person rather than leaving only
   * a failed job). Absent in a context that does not say, which reads as a first try.
   */
  attempts?: number;
  /**
   * Set by the handler the moment before it puts words on a wire (ledger markSpoke), and read back by the runner once
   * the handler returns or throws: a job that spoke is never run again.
   */
  spoke_at?: string | null;
}

/**
 * A read or a write whose failure is not an answer.
 *
 * Every port below is a question the run then acts on — may I send, was this
 * person already reached, is this broadcast still wanted — and destructuring
 * `{ data }` alone turns a failed read into a confident wrong answer. Each of
 * those wrong answers points the same way: an unreadable `tenants` row reads as
 * "not paused", an unreadable `templates` row as "Meta withdrew it", an
 * unreadable `messages` row as "this person has not been messaged yet". They
 * fail OPEN, towards a real message to a real person, or towards a broadcast
 * terminally failed over a statement timeout. So a read that cannot be made
 * throws, the job fails, and settleJob says what it was in the middle of:
 * "we could not check" is not a yes.
 */
export function must<T>(what: string, r: { data: T; error: { message: string } | null }): T {
  if (r.error) throw new Error(`${what}: ${r.error.message}`);
  return r.data;
}
