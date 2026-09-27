/**
 * What every job handler is handed: the job as it was claimed, and the context its ports are built from. Moved whole
 * from handlers.ts (Reach out Part 2.5), which re-exports its public names.
 */
import type { ReceivedEmail } from "@chanlytics/channels";
import type { JobKind, JobNews, PushMessage, Unread } from "@chanlytics/contracts";
import type { EmailIngestPorts, ReplyNotice, Wire } from "@chanlytics/core";
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
   * Optional so a test context need not supply one.
   */
  page?: (key: string, subject: string, body: string) => Promise<unknown>;
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
    /** One received email by the provider's id; null when the provider has none such. Throws when it cannot be asked. */
    fetch: (receivedId: string) => Promise<ReceivedEmail | null>;
    /** Was this email received before a person with this address asked to be forgotten (00125's digest)? */
    erasedBefore: (tenantId: string, address: string, receivedAtIso: string) => Promise<boolean>;
    /** Tell the workspace's people an email is waiting: the edge's notify, addressed from that workspace. Never throws. */
    tell: (tenantId: string, note: Parameters<EmailIngestPorts["tell"]>[1]) => Promise<void>;
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
    /** The reader's answer, unparsed; null when it answered nothing usable. Throws on a failed call. No call runs past `deadline`. */
    ask: (system: string, user: string, deadline: number) => Promise<unknown>;
    /** One read taken, or why not: no model, a workspace that may not spend, the day's reads spent. */
    mayRead: (tenantId: string, at: Date) => Promise<Exclude<Unread, "model_failed"> | null>;
    /** Tell the workspace once (notifyOnce): true only when the owner was told. */
    tell: (tenantId: string, notice: ReplyNotice) => Promise<boolean>;
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
