/**
 * Shared verb machinery: every committing verb = decision row + subject
 * mutation (+ events implied by triggers/handlers), all on the SESSION client
 * so RLS is the enforcement (Blueprint §6). Jobs/Blob-mirror side effects go
 * through the server-only service module at the call sites.
 */
import { AppError, isOptedOutContact, OPT_OUT_REFUSAL, type DecisionVerb, type DecisionSubject } from "@chanlytics/contracts";
import type { Json } from "@chanlytics/db";
import { memberContext, requireRole, type RouteContext } from "./with-route";

/**
 * Every committing verb goes through here first.
 *
 * RLS is the floor and it stops cross-TENANT access, but the app-plane write
 * policies check membership only, not role — so until now a viewer could call
 * the reply route and text a real customer. Not in theory: the job that
 * performs the send is scheduled with the SERVICE ROLE, so RLS was never in
 * the path at all. The control-plane routes (settings, policies, team) have
 * had this check since Session A; the seven verb routes never did.
 *
 * The tenant is taken from the SUBJECT being acted on, not from a default
 * workspace — for a member of two workspaces, the role that matters is the one
 * they hold where the conversation actually lives.
 */
export async function requireOperator(ctx: RouteContext, tenantId: string): Promise<void> {
  requireRole(await memberContext(ctx, tenantId), "operator");
}

export interface VerbConversation {
  id: string;
  tenant_id: string;
  state: string;
  paused_until: string | null;
  last_wa_inbound_at: string | null;
  contact_id: string;
  phone_e164: string | null;
  /** Consent travels with every verb load so no send path has to remember to
   *  ask for it separately. */
  consent: string | null;
  dnc: boolean;
}

export async function loadConversation(ctx: RouteContext, id: string): Promise<VerbConversation> {
  const { data, error } = await ctx.supabase
    .from("conversations")
    .select("id, tenant_id, state, paused_until, last_wa_inbound_at, contact_id, contacts (phone_e164, consent, dnc)")
    .eq("id", id)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) throw new AppError("not_found", "Conversation not found.");
  return {
    id: data.id,
    tenant_id: data.tenant_id,
    state: data.state,
    paused_until: data.paused_until,
    last_wa_inbound_at: data.last_wa_inbound_at,
    contact_id: data.contact_id,
    phone_e164: data.contacts?.phone_e164 ?? null,
    consent: data.contacts?.consent ?? null,
    dnc: data.contacts?.dnc ?? false,
  };
}

/** The customer asked not to be contacted. The rule itself lives in
 *  contracts/consent so this route and every other send path cannot drift. */
export function assertCanSend(conv: VerbConversation): void {
  if (isOptedOutContact(conv)) throw new AppError("conflict", OPT_OUT_REFUSAL);
}

export async function recordDecision(
  ctx: RouteContext,
  tenantId: string,
  subjectType: DecisionSubject,
  subjectId: string,
  verb: DecisionVerb,
  payload: Json = {},
): Promise<string> {
  const { data, error } = await ctx.supabase
    .from("decisions")
    .insert({
      tenant_id: tenantId,
      subject_type: subjectType,
      subject_id: subjectId,
      verb,
      actor_type: "user",
      actor_user_id: ctx.userId,
      payload,
    })
    .select("id")
    .single();
  if (error) throw new Error(`decision: ${error.message}`);
  return data.id;
}

/** reply and hand-back auto-resolve; take-over claims but keeps open (§4). */
export async function resolveOpenEscalation(
  ctx: RouteContext,
  conversationId: string,
  decisionId: string | null,
): Promise<void> {
  // `.select()` matters: an UPDATE that RLS forbids does not raise — it matches
  // zero rows and returns success. Without counting rows, a permission failure
  // here would look identical to "there was nothing open to resolve", and the
  // thread would sit in Needs You with the operator believing they cleared it.
  const { data, error } = await ctx.supabase
    .from("escalations")
    .update({ state: "resolved", resolved_by_user_id: ctx.userId, decision_id: decisionId })
    .eq("conversation_id", conversationId)
    .eq("state", "open")
    .select("id");
  if (error) console.error("resolve_escalation_failed", conversationId, error.message);
  else if (!data || data.length === 0) console.log("resolve_escalation_noop", conversationId);
}

export const PAUSE_MS = 24 * 3600 * 1000;
export const SEND_GRACE_MS = 15 * 1000; // the cancelable window IS the undo (§6)

/**
 * Take the bot's held reply off the table.
 *
 * Under a veto window the receptionist writes its answer as `queued` and a job
 * fires it after the configured delay. The whole point is that a human can get
 * there first — so every path where a human asserts control (replying, taking
 * the thread over) has to cancel that draft, or the customer receives BOTH the
 * override and the words it was meant to replace.
 *
 * Order matters, and it is the opposite of the queueing order: cancel the JOB
 * first, then the row. Marking the row canceled while its job still runs is
 * harmless — outbound_send re-reads the row and no-ops on anything that is not
 * still `queued` — whereas leaving the job scheduled after the row is gone would
 * be a send with nothing left to stop it.
 *
 * Returns how many drafts were withdrawn, so a caller can tell the operator
 * their reply replaced the bot's rather than merely followed it.
 */
export async function cancelPendingAiReply(
  ctx: RouteContext,
  conv: { id: string; tenant_id: string },
  cancelJobs: (tenantId: string, key: string, value: string) => Promise<number>,
): Promise<number> {
  await cancelJobs(conv.tenant_id, "conversation_id", conv.id);
  const { data, error } = await ctx.supabase
    .from("messages")
    .update({ status: "canceled", error: { reason: "superseded_by_human" } })
    .eq("conversation_id", conv.id)
    .eq("status", "queued")
    .eq("sender", "ai")
    .select("id");
  if (error) {
    // Not fatal to the operator's own action — but it means a draft may still
    // fire, so it must be visible rather than swallowed.
    console.error("cancel_pending_ai_reply_failed", conv.id, error.message);
    return 0;
  }
  return data?.length ?? 0;
}
