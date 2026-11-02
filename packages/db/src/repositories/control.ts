/**
 * Who is speaking on a thread right now.
 *
 * Apart from `assignee_user_id`, which says who is RESPONSIBLE and may outlive
 * any one exchange, and apart from `paused_until`, which says how long the
 * machine is held. Three facts, three lifetimes; this is the middle one, which
 * until 00130 had nowhere to live.
 *
 * Every write goes through the database's own claim, never a read here and an
 * update after it: two claimants who both read an empty thread both believe it
 * is theirs, and one of them is wrong about the only question this fact exists
 * to answer.
 *
 * A member's take-over and hand-back (takeOverThread, handBackThread) are the
 * two doors of 00386, on the member's own session: a person's hold taken with
 * the claim, the drafts and the ledger around it, and let go with the release,
 * the ledger and the escalation, each in one transaction.
 *
 * What a thread holds queued is withdrawn by one door too (00387 withdraw_queued): a row no run has claimed, with the
 * send job that would send it, wherever the withdrawal starts (a reply, a call-back, a pause, a steer, a take-over).
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "../database.types";
import { dbLog } from "../observe";

type Db = SupabaseClient<Database>;

/** A person mid-conversation, or a call in progress. */
export type ControlHolder = { kind: "person"; userId: string } | { kind: "call"; callId: string };

/**
 * How long a hold lasts unless it is renewed or let go.
 *
 * A call renews on its own events, so this is the ceiling on a call whose end
 * we never hear about -- long enough to cover a real conversation, short
 * enough that a lost hangup does not mute a thread for the afternoon.
 */
export const CALL_CONTROL_S = 15 * 60;

export type ControlOutcome = "claimed" | "renewed" | "held" | "gone";

/**
 * Take the hold, or renew one this holder already has.
 *
 * `held` means somebody else has it and this caller must not speak. A throw is
 * a read that could not be made, which is not the same as a free thread, so it
 * is left to the caller to fail loudly rather than swallowed here.
 */
export async function claimControl(
  db: Db,
  p: { tenantId: string; conversationId: string; holder: ControlHolder; seconds: number },
): Promise<ControlOutcome> {
  const { data, error } = await db.rpc("claim_conversation_control", {
    p_tenant_id: p.tenantId,
    p_conversation_id: p.conversationId,
    p_kind: p.holder.kind,
    p_by: p.holder.kind === "person" ? p.holder.userId : null,
    p_ref: p.holder.kind === "call" ? p.holder.callId : null,
    p_seconds: p.seconds,
  } as never);
  if (error) throw new Error(`claim_conversation_control: ${error.message}`);
  return data as unknown as ControlOutcome;
}

/**
 * Let go of a hold this holder has. False when somebody else holds it now --
 * the honest answer to a release that arrives after a person took the thread
 * over, which must not clear their hold.
 */
export async function releaseControl(
  db: Db,
  p: { tenantId: string; conversationId: string; holder: ControlHolder },
): Promise<boolean> {
  const { data, error } = await db.rpc("release_conversation_control", {
    p_tenant_id: p.tenantId,
    p_conversation_id: p.conversationId,
    p_kind: p.holder.kind,
    p_by: p.holder.kind === "person" ? p.holder.userId : null,
    p_ref: p.holder.kind === "call" ? p.holder.callId : null,
  } as never);
  if (error) throw new Error(`release_conversation_control: ${error.message}`);
  return data === true;
}

/**
 * The thread's reply turn (00284; the verb's rule is core inbound/turn.ts): claimed for a message before the model is
 * asked, so a newer message of the thread holds it. False only when a newer message has the turn. A call that fails
 * throws, and the verb reads that as a turn held: a reply is never lost to this bookkeeping.
 */
export async function claimReplyTurn(
  db: Db,
  tenantId: string,
  conversationId: string,
  messageId: string,
): Promise<boolean> {
  const { data, error } = await db.rpc("claim_reply_turn", {
    p_tenant: tenantId,
    p_conversation: conversationId,
    p_message: messageId,
  });
  if (error) throw new Error(`claim_reply_turn: ${error.message}`);
  return data !== false;
}

/** Whether this message still holds its thread's turn once the model has answered: false only when a newer message took it. */
export async function holdsReplyTurn(db: Db, conversationId: string, messageId: string): Promise<boolean> {
  const { data, error } = await db.rpc("holds_reply_turn", { p_conversation: conversationId, p_message: messageId });
  if (error) throw new Error(`holds_reply_turn: ${error.message}`);
  return data !== false;
}

/**
 * The thread's live hold as its row says it: who holds it, the call's own ref and until when, as columns; null when the
 * thread is not there. Read by the receptionist's memory (the edge's pgThread) beside the rest of the thread's state, so
 * the send door's question can be asked before the model is asked; the columns are read into a hold by one function,
 * core's liveHoldOf, off this row and off the wire's own (wireRowOf). A read that fails throws: a thread the database
 * could not produce is unknown, never one nobody holds.
 */
export async function readLiveHold(
  db: Db,
  tenantId: string,
  conversationId: string,
): Promise<{ control_kind: string | null; control_ref: string | null; control_until: string | null } | null> {
  const { data, error } = await db
    .from("conversations")
    .select("control_kind, control_ref, control_until")
    .eq("tenant_id", tenantId)
    .eq("id", conversationId)
    .maybeSingle();
  if (error) throw new Error(`readLiveHold: ${error.message}`);
  return data;
}

/** What the door names a take-over or a hand-back by: the thread, and what the request carried (the `via`, an undo link). */
interface MemberMove {
  tenantId: string;
  conversationId: string;
  via: string | null;
  undoOf: string | null;
}

/** What a take-over leaves (00386 conversation_take_over). */
export interface TakenOver {
  /** The moment the receptionist is paused until, as the caller named it. */
  pausedUntil: string;
  /** How many of the receptionist's held drafts on the thread were withdrawn, with their send jobs. */
  withdrawnDrafts: number;
  /** The take_over decision, recorded as the caller's. */
  decisionId: string;
  /** The undo link the request named was dropped: it named a decision this database does not hold. */
  undoDropped: boolean;
}

/**
 * A member takes a thread over, whole (00386 conversation_take_over), on their own session: the claim (needs_human,
 * paused until `pausedUntil`, the snooze cleared, theirs), the live hold on who is speaking (at most a day), the
 * receptionist's queued drafts on the thread withdrawn with their send jobs, and the take_over decision as theirs, in
 * one transaction. Null when no thread of the workspace's answered (it moved while they looked), and then nothing was
 * written. The door's refusals are thrown as they came (not a member who may act here: `Workspace not found.`), and
 * then nothing was written either.
 */
export async function takeOverThread(db: Db, p: MemberMove & { pausedUntil: string }): Promise<TakenOver | null> {
  const { data, error } = await db.rpc("conversation_take_over", {
    p_tenant_id: p.tenantId,
    p_conversation_id: p.conversationId,
    p_paused_until: p.pausedUntil,
    ...(p.via ? { p_via: p.via } : {}),
    ...(p.undoOf ? { p_undo_of: p.undoOf } : {}),
  });
  if (error) throw error;
  if (data === null || typeof data !== "object" || Array.isArray(data)) return null;
  const id = data.decision_id;
  if (typeof id !== "string" || typeof data.paused_until !== "string" || typeof data.withdrawn_drafts !== "number")
    throw new Error("conversation_take_over: the door answered without its decision");
  return {
    pausedUntil: data.paused_until,
    withdrawnDrafts: data.withdrawn_drafts,
    decisionId: id,
    undoDropped: data.undo_dropped === true,
  };
}

/** What a hand-back leaves (00386 conversation_hand_back). */
export interface HandedBack {
  /** The hand_back decision, recorded as the caller's. */
  decisionId: string;
  /** How many open escalations on the thread it resolved: one, or none when nothing was open. */
  resolvedEscalations: number;
  /** The undo link the request named was dropped: it named a decision this database does not hold. */
  undoDropped: boolean;
}

/**
 * A member hands a thread back, whole (00386 conversation_hand_back), on their own session: the release (open, nothing
 * paused, snoozed or claimed), this person's hold let go and nobody else's, the hand_back decision as theirs, and the
 * open escalation resolved by it, in one transaction. Null when no thread of the workspace's answered, and then nothing
 * was written; a refusal is thrown as it came, with nothing written either.
 */
export async function handBackThread(db: Db, p: MemberMove): Promise<HandedBack | null> {
  const { data, error } = await db.rpc("conversation_hand_back", {
    p_tenant_id: p.tenantId,
    p_conversation_id: p.conversationId,
    ...(p.via ? { p_via: p.via } : {}),
    ...(p.undoOf ? { p_undo_of: p.undoOf } : {}),
  });
  if (error) throw error;
  if (data === null || typeof data !== "object" || Array.isArray(data)) return null;
  const id = data.decision_id;
  if (typeof id !== "string" || typeof data.resolved_escalations !== "number")
    throw new Error("conversation_hand_back: the door answered without its decision");
  return { decisionId: id, resolvedEscalations: data.resolved_escalations, undoDropped: data.undo_dropped === true };
}

/* ------------------------------------------------------------- what a thread holds, withdrawn (00387) -- */

/** Why a message was withdrawn, kept on its row (`messages.error`): a member's call-back keeps none. */
export interface WithdrawReason {
  reason: string;
  [detail: string]: string;
}

/**
 * The one door a queued message is withdrawn by (00387 withdraw_queued), the service role's: each named message of the
 * workspace that is still queued and that no run has claimed (sending_at, 00352) canceled, with `reason` on its row,
 * and the send job that would send it canceled with it, in one transaction. Answers the ids withdrawn: a row on its
 * way, or gone, is left to its run and is not among them. A failure throws, and then nothing moved.
 */
export async function withdrawQueued(
  db: Db,
  p: { tenantId: string; messageIds: string[]; reason: WithdrawReason | null },
): Promise<string[]> {
  const { data, error } = await db.rpc("withdraw_queued", {
    p_tenant_id: p.tenantId,
    p_message_ids: p.messageIds,
    ...(p.reason ? { p_reason: p.reason } : {}),
  });
  if (error) throw new Error(`withdraw_queued: ${error.message}`);
  return Array.isArray(data) ? data : [];
}

/** The receptionist's queued drafts on a thread, all but `keepMessageId`, through the one door (00387 withdraw_ai_drafts). */
export async function withdrawAiDrafts(
  db: Db,
  p: { tenantId: string; conversationId: string; reason: WithdrawReason; keepMessageId: string | null },
): Promise<string[]> {
  const { data, error } = await db.rpc("withdraw_ai_drafts", {
    p_tenant_id: p.tenantId,
    p_conversation_id: p.conversationId,
    p_reason: p.reason,
    ...(p.keepMessageId ? { p_keep_message_id: p.keepMessageId } : {}),
  });
  if (error) throw new Error(`withdraw_ai_drafts: ${error.message}`);
  return Array.isArray(data) ? data : [];
}

/**
 * On a member's own session (00387 member_withdraw_drafts): the receptionist's queued drafts on a thread a reply
 * supersedes, withdrawn with their send jobs. How many. A refusal (not a member who may act here) throws as it came.
 */
export async function memberWithdrawDrafts(db: Db, p: { tenantId: string; conversationId: string }): Promise<number> {
  const { data, error } = await db.rpc("member_withdraw_drafts", {
    p_tenant_id: p.tenantId,
    p_conversation_id: p.conversationId,
  });
  if (error) throw error;
  return typeof data === "number" ? data : 0;
}

/** On a member's own session (00387 member_withdraw_message): one queued message withdrawn with its send job. */
export async function memberWithdrawMessage(
  db: Db,
  p: { tenantId: string; messageId: string; reason: WithdrawReason | null },
): Promise<boolean> {
  const { data, error } = await db.rpc("member_withdraw_message", {
    p_tenant_id: p.tenantId,
    p_message_id: p.messageId,
    ...(p.reason ? { p_reason: p.reason } : {}),
  });
  if (error) throw error;
  return data === true;
}

/** What a call-back leaves (00387 message_call_back). */
export interface CalledBack {
  /** The cancel_send decision, recorded as the caller's. */
  decisionId: string;
  /** The undo link the request named was dropped: it named no decision of this workspace. */
  undoDropped: boolean;
}

/**
 * A member calls back a send in its grace, on their own session (00387 message_call_back): the message withdrawn with
 * its send job and the cancel_send decision as theirs, in one transaction. Null when it was too late (sent, claimed by
 * its run, gone), and then nothing was written; a refusal throws as it came.
 */
export async function callBackMessage(
  db: Db,
  p: { tenantId: string; messageId: string; via: string | null; undoOf: string | null },
): Promise<CalledBack | null> {
  const { data, error } = await db.rpc("message_call_back", {
    p_tenant_id: p.tenantId,
    p_message_id: p.messageId,
    ...(p.via ? { p_via: p.via } : {}),
    ...(p.undoOf ? { p_undo_of: p.undoOf } : {}),
  });
  if (error) throw error;
  if (data === null || typeof data !== "object" || Array.isArray(data)) return null;
  const id = data.decision_id;
  if (typeof id !== "string") throw new Error("message_call_back: the door answered without its decision");
  return { decisionId: id, undoDropped: data.undo_dropped === true };
}

/**
 * A member lets a held reply go now, on their own session (00503 message_send_now): the send job of a message still queued
 * and claimed by no run brought to now, and the approve decision on it as theirs, in one transaction. Null when there was
 * nothing to bring forward (sent, claimed by its run, withdrawn, gone), and then nothing was written; a refusal throws as
 * it came.
 */
export async function sendQueuedNow(
  db: Db,
  p: { tenantId: string; messageId: string; via: string | null; undoOf: string | null },
): Promise<CalledBack | null> {
  const { data, error } = await db.rpc("message_send_now", {
    p_tenant_id: p.tenantId,
    p_message_id: p.messageId,
    ...(p.via ? { p_via: p.via } : {}),
    ...(p.undoOf ? { p_undo_of: p.undoOf } : {}),
  });
  if (error) throw error;
  if (data === null || typeof data !== "object" || Array.isArray(data)) return null;
  const id = data.decision_id;
  if (typeof id !== "string") throw new Error("message_send_now: the door answered without its decision");
  return { decisionId: id, undoDropped: data.undo_dropped === true };
}

/* -------------------------------------------------------------------- a thread handed to a person (00388) -- */

/**
 * A thread handed to a person, through the one door (00388 escalation_open), the service role's: a new open escalation
 * with its escalation.opened event ("opened"), the open one taking another reason ("changed"), or the same reason's
 * words moved ("refreshed"), in one transaction. A failure throws, and then nothing moved.
 */
export async function openEscalation(
  db: Db,
  p: { tenantId: string; conversationId: string; reason: string; details: string },
): Promise<"opened" | "changed" | "refreshed"> {
  const { data, error } = await db.rpc("escalation_open", {
    p_tenant_id: p.tenantId,
    p_conversation_id: p.conversationId,
    p_reason: p.reason,
    p_details: p.details,
  });
  if (error) throw new Error(`escalation_open: ${error.message}`);
  if (data !== "opened" && data !== "changed" && data !== "refreshed")
    throw new Error(`escalation_open: the door answered ${String(data)}`);
  return data;
}

/**
 * The holds a reply from the WhatsApp Business app answers, settled (00438 conversation_echo_settles; the wiring's second
 * audit, S7-5): resolved when it was typed, as a reply from the dashboard resolves the hold it answers, so the customer
 * leaves Needs you and nobody is told "Still waiting" of them. An echo with no id of its own cannot be found again, and
 * settles nothing. False when the door failed, which the webhook answers with a 503: Meta's redelivery finds the echo
 * kept and asks again, and a hold settled already is not settled twice.
 */
export async function settleByEcho(
  db: Db,
  p: { tenantId: string; externalId: string | null; settles: readonly string[] },
): Promise<boolean> {
  if (!p.externalId) return true;
  const { error } = await db.rpc("conversation_echo_settles", {
    p_tenant_id: p.tenantId,
    p_external_id: p.externalId,
    p_reasons: [...p.settles],
  });
  if (!error) return true;
  dbLog().error("record_echo_settle_failed", { tenant_id: p.tenantId, error: error.message });
  return false;
}
