/**
 * The send path's view of the world: what the four job verbs need, named for
 * what each means. The adapter that knows the tables and the runtime's
 * services is packages/jobs/src/handlers.ts.
 */
import type { SendPurpose } from "@chanlytics/contracts";
import type { Json } from "@chanlytics/db";
import type { Delivered, Delivery } from "../deliver";

/** The door, handed in: a verb never builds it, so a test can answer whatever the case needs. */
export type Door = (d: Delivery) => Promise<Delivered>;

export interface SendQueuedPorts {
  /**
   * The row as it stands, or null when it is gone. Throws when it cannot be
   * read: a read that FAILED and a message that is genuinely gone are
   * different facts, and collapsing them is how a reply once vanished.
   */
  queued(messageId: string): Promise<{ status: string; body: string | null; channel: string | null; sender: string | null } | null>;
  /** Which yes this send needs: the template's category as Meta has it, read now; unreadable throws. */
  purposeOf(template: { name: string; language: string } | undefined): Promise<SendPurpose>;
  deliver: Door;
  /** The thread flagged for a person, with why. */
  escalate(conversationId: string, reason: string, details: string): Promise<unknown>;
  alert(subject: string, body: string): Promise<void>;
  /** The platform's own pager, for a provider refusing every send on a wire. */
  page?(key: string, subject: string, body: string): Promise<unknown>;
}

export interface EraseThreadPorts {
  /** One stored Blob thread gone. False when it is still there. */
  eraseThread(namespace: string, threadId: string): Promise<boolean>;
  /** Every job row for this contact, or this one job, carries the scrubbed payload from now on. */
  scrub(tenantId: string, by: { contactId: string } | { jobId: string }, scrubbed: Json): Promise<void>;
  /** The same ledger as the owner's own erase decision, and the event. */
  recordErased(tenantId: string, contactId: string, threads: number, jobId: string): Promise<void>;
}

export interface ProvisionLinePorts {
  /** The saga, or its resumption: the edge's, because the provider and the credentials live there. Absent in a runtime that holds none. */
  provision?(lineId: string, by: "owner" | "support" | "sweep"): Promise<{ ok: boolean; step?: string; error?: string }>;
}
