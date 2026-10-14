/**
 * A reach-out its owner sends (00428): its due sends claimed to be drafted, the day's share already planned, a run's
 * drafts as its To send list draws them, the owner's word on one (it went, or it did not), and what the business wrote
 * back as the owner says it. The two doors are asked on the member's own session: each checks who may in SQL and answers
 * its refusal with its SQLSTATE and its own words (DoorResult), as the workbench's doors do. A read that fails throws.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database, Json } from "../../database.types";
import type { ReachOutSendRow } from "../reach-out";
import type { DoorResult } from "./reach-out-leads";

type Db = SupabaseClient<Database>;

const answer = <T>(data: unknown, error: { code?: string; message: string } | null): DoorResult<T> =>
  error ? { data: null, error: { code: error.code, message: error.message } } : { data: data as T, error: null };

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

/**
 * How many emails a reach-out's runs for one day hold already, skipped aside: what its owner's day's share is counted
 * against (REACH_OUT_DRAFTS_PER_DAY), so its steps after the first, planned first, leave the rest to new leads.
 */
export async function chainPlannedOn(db: Db, p: { tenantId: string; rootId: string; runFor: string }): Promise<number> {
  const { data: runs, error } = await db
    .from("broadcasts")
    .select("id")
    .eq("tenant_id", p.tenantId)
    .eq("audience->>kind", "reach_out")
    .eq("audience->>root_id", p.rootId)
    .eq("run_for", p.runFor);
  if (error) throw new Error(`cannot read the reach-out's runs of the day: ${error.message}`);
  const ids = (runs ?? []).map((r) => r.id);
  if (ids.length === 0) return 0;
  const { count, error: e2 } = await db
    .from("reach_out_sends")
    .select("id", { count: "exact", head: true })
    .eq("tenant_id", p.tenantId)
    .in("broadcast_id", ids)
    .neq("state", "skipped");
  if (e2) throw new Error(`cannot count the reach-out's emails of the day: ${e2.message}`);
  return count ?? 0;
}

/** One email handed to its owner, as its run's To send list reads it. */
export interface DraftedSendRow {
  id: string;
  lead_id: string;
  angle: string | null;
  draft: Json | null;
  drafted_at: string | null;
}

/** A run's emails handed to its owner and not yet said to have gone, oldest first (at most 200, a run's cap). */
export async function draftedSendsOf(db: Db, p: { tenantId: string; runId: string }): Promise<DraftedSendRow[]> {
  const { data, error } = await db
    .from("reach_out_sends")
    .select("id, lead_id, angle, draft, drafted_at")
    .eq("tenant_id", p.tenantId)
    .eq("broadcast_id", p.runId)
    .eq("state", "drafted")
    .order("drafted_at", { ascending: true })
    .limit(200);
  if (error) throw new Error(`cannot read the run's drafts: ${error.message}`);
  return data ?? [];
}

/** What a lead's story says of a send its owner sends (00428): the run a draft waits in, and whether it went on their word. */
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
  reason: string | null;
  message_id?: string;
  contact_id?: string;
  conversation_id?: string;
}

/**
 * The owner's word on an email handed to them (reach_out_send_said), on the member's own session: sent, under the email's
 * own id (core sendMessageId); or not sent, with why (owner_skipped, or the door's refusal read at Sent).
 */
export async function sendSaid(
  db: Db,
  p: { sendId: string; outcome: "sent" | "not_sent"; messageId: string | null; reason: string | null },
): Promise<DoorResult<SendSaidAnswer>> {
  const { data, error } = await db.rpc("reach_out_send_said", {
    p_send_id: p.sendId,
    p_outcome: p.outcome,
    ...(p.messageId ? { p_message_id: p.messageId } : {}),
    ...(p.reason ? { p_reason: p.reason } : {}),
  });
  return answer<SendSaidAnswer>(data, error);
}

/** What the reading door answered for the owner's word: whether it applied, its own id, the email it is about. */
export interface ReplySaidAnswer {
  applied: boolean;
  message_id?: string;
  send_id?: string;
  changed?: Json;
}

/**
 * What the business wrote back to an email its owner sent, as the owner says it (reach_out_reply_said), on the member's
 * own session: the reading and the plan the server made of it (contracts readingPlan, claim owner), and the note in the
 * owner's words the door writes on the person's thread.
 */
export async function replySaid(
  db: Db,
  p: { leadId: string; reading: Json; plan: Json; note: string },
): Promise<DoorResult<ReplySaidAnswer>> {
  const { data, error } = await db.rpc("reach_out_reply_said", {
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
