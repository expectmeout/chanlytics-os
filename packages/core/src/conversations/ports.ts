/**
 * The conversation verbs' view of the world.
 *
 * A verb takes the thread as a fact: the route's scope loaded it under RLS
 * and judged the role where it lives before the verb is called. Everything
 * else the verb needs arrives through a port named for what it means, never
 * for the table it touches; the adapter that knows both lives in
 * apps/dashboard/src/server/core-ports.ts.
 */
import type { DecisionSubject, DecisionVerb, TenantId } from "@chanlytics/contracts";
import type { Json } from "@chanlytics/db";

/** The thread as the route's scope loaded it. A verb names only the fields it reads. */
export interface Thread {
  id: string;
  tenant_id: TenantId;
  state: string;
  paused_until: string | null;
  phone_e164: string | null;
}

/** What the thread verbs need of the world. */
export interface ThreadPorts {
  /** How long a person's touch keeps the receptionist off a thread: the reply policy's pause_hours, or a day. */
  pauseMs(tenantId: TenantId): Promise<number>;
  /**
   * A person takes the thread, whole (00386): needs_human, paused until, snooze cleared, theirs; the live hold on who
   * is speaking; the receptionist's held drafts withdrawn; and the take_over decision, in one transaction. Null iff no
   * row changed: the thread moved while they looked, and nothing was written.
   */
  takeOver(
    tenantId: TenantId,
    conversationId: string,
    untilIso: string,
  ): Promise<{ withdrawn_drafts: number; decision_id: string } | null>;
  /**
   * The thread handed back, whole (00386): open with nothing paused, snoozed or claimed; this person's hold let go
   * (somebody else's is left alone); the hand_back decision; and the open escalation resolved by it, in one
   * transaction. Null iff no row changed, and then nothing was written.
   */
  handBack(tenantId: TenantId, conversationId: string): Promise<{ decision_id: string } | null>;
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

export interface EscalationPorts {
  /** open → resolved by the user, only while open. True iff a row changed. */
  resolve(escalationId: string): Promise<boolean>;
  /** The decision linked back onto the escalation; a failure is logged, never fatal. */
  link(escalationId: string, decisionId: string): Promise<void>;
  record: ThreadPorts["record"];
}

export interface CancelSendPorts {
  /**
   * The message withdrawn with its send job and the cancel_send decision as the member's, in one write, only while it
   * is queued and no run has claimed it: null when the send won, and then nothing was written.
   */
  callBack(tenantId: TenantId, messageId: string): Promise<{ decision_id: string } | null>;
}
