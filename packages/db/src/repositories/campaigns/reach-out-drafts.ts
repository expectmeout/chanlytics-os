/**
 * A reach-out its owner sends (00429): its due sends claimed to be drafted, how much it holds of a day and in all, a
 * draft's lead as the send door would judge it, the owner's word on one (it went, or it did not), and what the business
 * wrote back as the owner says it. Sent is the member's own door, checked in SQL; what they wrote back is the service
 * role's, for the member the route checked, with the plan the server made. Each answers its refusal with its SQLSTATE
 * and its own words (DoorResult), as the workbench's doors do. A read that fails throws.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import type { DraftLeadFacts } from "@chanlytics/contracts";
import type { Database, Json } from "../../database.types";
import type { ReachOutSendRow } from "../reach-out";
import { answer, type DoorResult } from "./reach-out-leads";

type Db = SupabaseClient<Database>;

/** Up to `limit` due sends of reach-outs their owners send, claimed to be drafted: a step after the first before a first email. */
export async function claimDrafts(
  db: Db,
  p: { at: Date; limit: number; tenantId: string | null },
): Promise<ReachOutSendRow[]> {
  if (!Number.isInteger(p.limit) || Number.isNaN(p.at.getTime()))
    throw new Error(`cannot claim the drafts due: a limit is a whole number (${p.limit})`);
  const { data, error } = await db.rpc("reach_out_claim_drafts", {
    p_at: p.at.toISOString(),
    p_limit: p.limit,
    ...(p.tenantId ? { p_tenant_id: p.tenantId } : {}),
  });
  if (error) throw new Error(`cannot claim the drafts due: ${error.message}`);
  return data ?? [];
}

/** What a reach-out its owner sends holds: of one day's runs, skipped aside, and in all, not yet said to have gone. */
export interface DraftLoad {
  /** The emails its runs for the day hold already (its day's share is counted against it). */
  today: number;
  /** Its emails planned, held, claimed or handed over and not yet said, across every run: the owner's pile. */
  open: number;
}

/**
 * How much a reach-out its owner sends holds (contracts REACH_OUT_DRAFTS_PER_DAY, REACH_OUT_DRAFTS_OPEN_MAX): its
 * steps after the first, planned first, leave the rest of the day to new leads, and nothing new is handed to an owner
 * whose pile is full.
 */
export async function chainDraftLoad(
  db: Db,
  p: { tenantId: string; rootId: string; runFor: string },
): Promise<DraftLoad> {
  const [runs, open] = await Promise.all([
    db
      .from("broadcasts")
      .select("id")
      .eq("tenant_id", p.tenantId)
      .eq("audience->>kind", "reach_out")
      .eq("audience->>root_id", p.rootId)
      .eq("run_for", p.runFor),
    db
      .from("reach_out_sends")
      .select("id", { count: "exact", head: true })
      .eq("tenant_id", p.tenantId)
      .eq("root_id", p.rootId)
      .in("state", ["planned", "held", "claimed", "drafted"]),
  ]);
  if (runs.error) throw new Error(`cannot read the reach-out's runs of the day: ${runs.error.message}`);
  if (open.error) throw new Error(`cannot count the reach-out's emails waiting: ${open.error.message}`);
  const ids = (runs.data ?? []).map((r) => r.id);
  if (ids.length === 0) return { today: 0, open: open.count ?? 0 };
  const { count, error } = await db
    .from("reach_out_sends")
    .select("id", { count: "exact", head: true })
    .eq("tenant_id", p.tenantId)
    .in("broadcast_id", ids)
    .neq("state", "skipped");
  if (error) throw new Error(`cannot count the reach-out's emails of the day: ${error.message}`);
  return { today: count ?? 0, open: open.count ?? 0 };
}

/**
 * One lead's facts as the send door would judge them (00429 reach_out_draft_facts, contracts draftRefusalOf), on the
 * service role: asked before a draft is handed over. Null for a lead gone.
 */
export async function draftFactsOf(db: Db, tenantId: string, leadId: string): Promise<DraftLeadFacts | null> {
  const { data, error } = await db.rpc("reach_out_draft_facts", { p_tenant_id: tenantId, p_lead_id: leadId });
  if (error) throw new Error(`cannot read the draft's lead: ${error.message}`);
  return (data as DraftLeadFacts | null) ?? null;
}

/** A draft waiting for its owner, with its lead's facts (null for a lead gone). */
export interface DraftWaitingRow {
  id: string;
  tenant_id: string;
  lead_id: string;
  broadcast_id: string;
  drafted_at: string;
  facts: DraftLeadFacts | null;
}

/**
 * The drafts waiting for their owners, oldest first, with their leads' facts (00429 reach_out_drafts_waiting), on the
 * service role: one run's (its To send list) or every workspace's (the clock, which skips one the door would refuse).
 */
export async function draftsWaiting(
  db: Db,
  p: {
    limit: number;
    tenantId?: string | null;
    runId?: string | null;
    /** The last draft a page read: the next page starts after it. */
    after?: { drafted_at: string; id: string } | null;
  },
): Promise<DraftWaitingRow[]> {
  const { data, error } = await db.rpc("reach_out_drafts_waiting", {
    p_limit: p.limit,
    ...(p.tenantId ? { p_tenant_id: p.tenantId } : {}),
    ...(p.runId ? { p_run_id: p.runId } : {}),
    ...(p.after ? { p_after_at: p.after.drafted_at, p_after_id: p.after.id } : {}),
  });
  if (error) throw new Error(`cannot read the drafts waiting: ${error.message}`);
  return (data ?? []).map((r) => ({ ...r, facts: (r.facts as DraftLeadFacts | null) ?? null }));
}

/** What a lead's story says of a send its owner sends (00429): the run a draft waits in, and whether it went on their word. */
export interface OwnerSendFacts {
  runId: string | null;
  said: boolean;
}

/** For each send named, its owner's facts: the run it waits in while drafted, and whether it was sent on their word. */
export async function ownerSendFactsOf(
  db: Db,
  p: { tenantId: string; sendIds: readonly string[] },
): Promise<Map<string, OwnerSendFacts>> {
  if (p.sendIds.length === 0) return new Map();
  const { data, error } = await db
    .from("reach_out_sends")
    .select("id, broadcast_id, state, said_at")
    .eq("tenant_id", p.tenantId)
    .in("id", [...p.sendIds]);
  if (error) throw new Error(`cannot read the owner's sends: ${error.message}`);
  return new Map(
    (data ?? []).map((r) => [
      r.id,
      { runId: r.state === "drafted" ? r.broadcast_id : null, said: r.state === "sent" && r.said_at !== null },
    ]),
  );
}

/** What the owner's word on a drafted email answered: whether it was the first word, and how the email stands now. */
export interface SendSaidAnswer {
  said: boolean;
  state: string;
  reason?: string | null;
  message_id?: string | null;
  contact_id?: string | null;
  conversation_id?: string | null;
  /** What would refuse the email now, said beside its record (it went all the same): null when nothing would. */
  since?: string | null;
}

/**
 * The owner's word on an email handed to them (reach_out_send_said), on the member's own session: sent, recorded
 * whatever changed since it was handed (its email under an id of its own); or not sent, with why (owner_skipped).
 */
export async function sendSaid(
  db: Db,
  p: { sendId: string; outcome: "sent" | "not_sent"; reason: string | null },
): Promise<DoorResult<SendSaidAnswer>> {
  const { data, error } = await db.rpc("reach_out_send_said", {
    p_send_id: p.sendId,
    p_outcome: p.outcome,
    ...(p.reason ? { p_reason: p.reason } : {}),
  });
  return answer<SendSaidAnswer>(data, error);
}

/** What the reading door answered for the owner's word: whether it applied, or stood already, its own id, the email. */
export interface ReplySaidAnswer {
  applied: boolean;
  /** A reading of that email stood already: nothing was written. */
  already?: boolean;
  message_id?: string;
  send_id?: string;
  changed?: Json;
}

/**
 * What the business wrote back to an email its owner sent, as the owner says it (reach_out_reply_said), on the service
 * role for the member the route checked: the reading and the plan the server made of it (contracts readingPlan, claim
 * owner), and the note in the owner's words the door writes on the person's thread. Once per email that went.
 */
export async function replySaid(
  db: Db,
  p: { tenantId: string; userId: string; leadId: string; reading: Json; plan: Json; note: string },
): Promise<DoorResult<ReplySaidAnswer>> {
  const { data, error } = await db.rpc("reach_out_reply_said", {
    p_tenant_id: p.tenantId,
    p_user_id: p.userId,
    p_lead_id: p.leadId,
    p_reading: p.reading,
    p_plan: p.plan,
    p_note: p.note,
  });
  return answer<ReplySaidAnswer>(data, error);
}

/** What a lead's reading is planned by, as the reply job's is (contracts readingPlan): its business, address and site. */
export interface LeadReplyFacts {
  business_name: string;
  email: string | null;
  website_host: string | null;
  website_root: boolean | null;
}

/** A lead's reply facts, on the member's own session (RLS decides); null for a lead the workspace does not hold. */
export async function leadReplyFactsOf(
  db: Db,
  p: { tenantId: string; leadId: string },
): Promise<LeadReplyFacts | null> {
  const { data, error } = await db
    .from("leads")
    .select("business_name, email, website_host, website_root")
    .eq("tenant_id", p.tenantId)
    .eq("id", p.leadId)
    .maybeSingle();
  if (error) throw new Error(`cannot read the lead: ${error.message}`);
  return data ? { ...data, business_name: data.business_name ?? "" } : null;
}
