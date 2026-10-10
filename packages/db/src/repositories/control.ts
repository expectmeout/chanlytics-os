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
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "../database.types";

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
