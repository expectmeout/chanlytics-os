/**
 * The conversation verbs' view of the world.
 *
 * A verb takes the thread as a fact: the route's scope loaded it under RLS
 * and judged the role where it lives before the verb is called. Everything
 * else the verb needs arrives through a port named for what it means, never
 * for the table it touches; the adapter that knows both lives in
 * apps/dashboard/src/server/core-ports.ts.
 */
import type { DecisionSubject, DecisionVerb } from "@chanlytics/contracts";
import type { Json } from "@chanlytics/db";

/** The thread as the route's scope loaded it. A verb names only the fields it reads. */
export interface Thread {
  id: string;
  tenant_id: string;
  state: string;
  paused_until: string | null;
  phone_e164: string | null;
}

/** What the thread verbs need of the world. */
export interface ThreadPorts {
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
  /**
   * The live hold on the thread, taken for this person (00132).
   *
   * Apart from `claim`, which records who is RESPONSIBLE: this says who is
   * speaking now, and it expires. A person's hold outranks a call's and is
   * never refused, so this answers with nothing -- a failure throws, because a
   * hold we could not take is not a hold we have.
   */
  takeControl(tenantId: string, conversationId: string, userId: string, seconds: number): Promise<void>;
  /** This person's hold, let go. Somebody else's is left alone. */
  letControlGo(tenantId: string, conversationId: string, userId: string): Promise<void>;
  /** The receptionist's held drafts on the thread withdrawn, rows then jobs; how many. */
  withdrawDrafts(tenantId: string, conversationId: string): Promise<number>;
  /** The open escalation on the thread resolved by this decision, when there is one. */
  resolveEscalation(conversationId: string, decisionId: string): Promise<void>;
  /** The ledger: who did what to which row. The decision's id. */
  record(tenantId: string, subject: DecisionSubject, id: string, verb: DecisionVerb, payload?: Json): Promise<string>;
  now(): number;
}

export interface EscalationPorts {
  /** open → resolved by the user, only while open. True iff a row changed. */
  resolve(escalationId: string): Promise<boolean>;
  /** The decision linked back onto the escalation; a failure is logged, never fatal. */
  link(escalationId: string, decisionId: string): Promise<void>;
  record: ThreadPorts["record"];
}

export interface CancelSendPorts {
  /** queued → canceled, only while queued: zero rows means the send job won. */
  cancelQueued(messageId: string): Promise<boolean>;
  /** The outbound_send job for the message withdrawn; how many. */
  cancelJob(tenantId: string, messageId: string): Promise<number>;
  record: ThreadPorts["record"];
}
