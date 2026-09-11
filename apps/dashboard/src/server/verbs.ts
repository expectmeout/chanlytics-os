/**
 * Shared verb machinery: every committing verb = decision row + subject
 * mutation (+ events implied by triggers/handlers), all on the SESSION client
 * so RLS is the enforcement (Blueprint §6). Jobs/Blob-mirror side effects go
 * through the server-only service module at the call sites.
 */
import { AppError, isOptedOutContact, OPT_OUT_REFUSAL, type DecisionVerb, type DecisionSubject } from "@chanlytics/contracts";
import type { Json } from "@chanlytics/db";
import { memberContext, requireRole, type RouteContext } from "./with-route";
import { requireUuid } from "./request-guards";
import { row } from "./route";

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
  /** The second answer: yes to OFFERS. A promotional template needs it. */
  marketing_consent: string | null;
}

export async function loadConversation(ctx: RouteContext, id: string): Promise<VerbConversation> {
  // The chokepoint every conversation verb goes through, so the id is checked
  // once here rather than remembered per route. A malformed id used to reach
  // PostgREST, come back as 22P02, and surface as a generic 500 "Something
  // went wrong" — a typo in a URL reading as a server fault.
  const convId = requireUuid(id, "conversation");
  const { data, error } = await ctx.supabase
    .from("conversations")
    .select("id, tenant_id, state, paused_until, last_wa_inbound_at, contact_id, contacts (phone_e164, consent, dnc, marketing_consent)")
    .eq("id", convId)
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
    marketing_consent: data.contacts?.marketing_consent ?? null,
  };
}

/**
 * The conversation a verb acts on, as a route scope (see route.ts): loaded
 * through loadConversation under RLS, so a thread the caller cannot see is a
 * 404, and judged in its own workspace, which for a member of two is the one
 * that matters. What `requireOperator(ctx, conv.tenant_id)` did by hand in
 * every verb, declared once.
 */
export const conversationScope = row((ctx, params) => loadConversation(ctx, String(params.id ?? "")));

export interface VerbContact {
  id: string;
  tenant_id: string;
  marketing_consent: string | null;
}

/**
 * The contact a consent verb acts on. RLS scopes this read, so a contact the
 * caller cannot see is a 404 rather than a leak, and an erased one is gone;
 * the role is then decided against the contact's tenant, never one from the
 * body. Both consent doors take their row from here.
 */
export async function loadContact(ctx: RouteContext, id: string): Promise<VerbContact> {
  const contactId = requireUuid(id, "contact");
  const { data: contact, error } = await ctx.supabase
    .from("contacts")
    .select("id, tenant_id, erased_at, marketing_consent")
    .eq("id", contactId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!contact || contact.erased_at) throw new AppError("not_found", "Contact not found.", 404);
  return { id: contact.id, tenant_id: contact.tenant_id, marketing_consent: contact.marketing_consent ?? null };
}

/** The contact named by `:id`, as the row a consent route acts on. */
export const contactScope = row((ctx, params) => loadContact(ctx, String(params.id ?? "")));

/**
 * The channel a reply goes out on: where the customer last wrote. A
 * conversation is one per person and its messages carry the channel. The reply
 * route sends on it and the assistant's reply card shows its window, so both
 * read it here.
 */
export async function replyChannelOf(ctx: RouteContext, conv: { id: string; tenant_id: string }): Promise<"whatsapp" | "sms"> {
  const { data, error } = await ctx.supabase
    .from("messages")
    .select("channel")
    .eq("conversation_id", conv.id)
    .eq("tenant_id", conv.tenant_id)
    .eq("direction", "inbound")
    .order("channel_ts", { ascending: false, nullsFirst: false })
    .limit(1)
    .maybeSingle();
  if (error) throw new Error(`reading the last inbound: ${error.message}`);
  return data?.channel === "sms" ? "sms" : "whatsapp";
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
      payload: ctx.via && payload && typeof payload === "object" && !Array.isArray(payload) ? { ...(payload as Record<string, Json>), via: ctx.via } : payload,
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
 * How long a human's touch keeps the receptionist off a thread.
 *
 * Settings promises "stays paused for N hours" from the reply policy's
 * `pause_hours`, and the WhatsApp edge honoured it — but a take-over or a
 * reply from the dashboard paused for a hard-coded day, so an owner who set
 * two hours was told one number and given another. Every pause reads the row;
 * a missing or unreadable limit falls back to the day it always was.
 */
export async function pauseMsFor(ctx: RouteContext, tenantId: string): Promise<number> {
  const { data } = await ctx.supabase
    .from("policies")
    .select("limits")
    .eq("tenant_id", tenantId)
    .eq("class", "reply")
    .is("subject_type", null)
    .maybeSingle();
  const hours = Number((data?.limits as { pause_hours?: unknown } | null)?.pause_hours);
  return Number.isFinite(hours) && hours >= 1 ? hours * 3600 * 1000 : PAUSE_MS;
}

/**
 * Take the bot's held reply off the table.
 *
 * Under a veto window the receptionist writes its answer as `queued` and a job
 * fires it after the configured delay. The whole point is that a human can get
 * there first — so every path where a human asserts control (replying, taking
 * the thread over) has to cancel that draft, or the customer receives BOTH the
 * override and the words it was meant to replace.
 *
 * Cancel by MESSAGE, never by conversation. Cancelling every scheduled
 * outbound_send on the thread also withdrew the job behind a HUMAN reply still
 * inside its 15-second grace window — while the row-level update only marked
 * `sender = 'ai'` rows canceled. So an operator who sent two replies in quick
 * succession, or replied and then pressed Take over, lost the first message:
 * its job was gone, its row stayed `queued`, the Inbox said "Sending…" forever
 * and the customer received nothing. Withdrawing the receptionist's draft must
 * not touch a colleague's words.
 *
 * Order is row first, then job, and that is deliberate. If the row update
 * lands and the job cancel fails, the job fires and no-ops on a row that is no
 * longer `queued`. The reverse leaves a queued row with nothing left to send
 * it — the same strand, reached from the other side.
 *
 * Returns how many drafts were withdrawn, so a caller can tell the operator
 * their reply replaced the bot's rather than merely followed it.
 */
export async function cancelPendingAiReply(
  ctx: RouteContext,
  conv: { id: string; tenant_id: string },
  cancelJobs: (tenantId: string, key: string, value: string) => Promise<number>,
): Promise<number> {
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
  const ids = (data ?? []).map((m) => m.id);
  for (const id of ids) {
    await cancelJobs(conv.tenant_id, "message_id", id);
  }
  return ids.length;
}
