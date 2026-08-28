/**
 * Shared verb machinery: every committing verb = decision row + subject
 * mutation (+ events implied by triggers/handlers), all on the SESSION client
 * so RLS is the enforcement (Blueprint §6). Jobs/Blob-mirror side effects go
 * through the server-only service module at the call sites.
 */
import { AppError, type DecisionVerb, type DecisionSubject } from "@chanlytics/contracts";
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

/** The customer asked not to be contacted. Consent is the state machine, dnc
 *  the operator-settable override; either alone stops a send. */
export function assertCanSend(conv: VerbConversation): void {
  if (conv.consent === "opted_out" || conv.dnc) {
    throw new AppError(
      "conflict",
      "This customer asked to stop receiving messages. They can text START to opt back in.",
    );
  }
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
  const { error } = await ctx.supabase
    .from("escalations")
    .update({ state: "resolved", resolved_by_user_id: ctx.userId, decision_id: decisionId })
    .eq("conversation_id", conversationId)
    .eq("state", "open");
  if (error) console.error("resolve_escalation_failed", error.message);
}

export const PAUSE_MS = 24 * 3600 * 1000;
export const SEND_GRACE_MS = 15 * 1000; // the cancelable window IS the undo (§6)
