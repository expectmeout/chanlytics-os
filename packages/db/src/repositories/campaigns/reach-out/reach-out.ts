/** Reach out: reach out. */

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "../../../types";
import { withdrawQueued } from "../../conversations/control";
import { recordOrEmpty } from "@chanlytics/contracts";

export type Db = SupabaseClient<Database>;

/** One message of a sequence to one person (00440): a customer's (contact_id, no lead_id) or a lead's. */
export type SequenceSendRow = Database["public"]["Tables"]["sequence_sends"]["Row"];

/** A sequence's send to a lead: its lead always named, with its sequence and its batch (a lead's own email has neither, 00540). */
export type ReachOutSendRow = Omit<SequenceSendRow, "lead_id" | "sequence_id" | "batch_id"> & {
  lead_id: string;
  sequence_id: string;
  batch_id: string;
};

export type ReachOutSendInsert = Database["public"]["Tables"]["sequence_sends"]["Insert"];

/** A send to a lead as the clock settles it: a sequence's, or a lead's own email, which names neither (00540). */
export type LeadSendRow = Omit<SequenceSendRow, "lead_id"> & { lead_id: string };

/** A sequence's own of a lead's sends: a lead's own email has no run to go back to, and no step to write it from. */
export const ofASequence = (leadSend: LeadSendRow): leadSend is ReachOutSendRow =>
  leadSend.sequence_id !== null && leadSend.batch_id !== null;

/** The rows a lead's reader handed back, each with its lead: a customer's send among them would be a reader's mistake. */
export function leadSends(rows: readonly SequenceSendRow[] | null): ReachOutSendRow[] {
  return (rows ?? []).flatMap((r) => {
    const s = r.lead_id ? { ...r, lead_id: r.lead_id } : null;
    return s && ofASequence(s) ? [s] : [];
  });
}

export interface AudienceLead {
  lead_id: string;
  email: string;
  business_name: string | null;
  city: string | null;
  region: string | null;
  hours: unknown;
}

/**
 * The leads a chain's first step may write to (00197 reach_out_audience), strongest fit first: never one any chain of
 * the workspace planned, held or wrote to, and a catch-all address only when the chain includes them.
 */
export async function listReachOutAudience(
  db: Db,
  params: { tenantId: string; searchId: string; limit: number; includeUnconfirmed: boolean },
): Promise<AudienceLead[]> {
  const { data, error } = await db.rpc("reach_out_audience", {
    p_tenant_id: params.tenantId,
    p_search_id: params.searchId,
    p_limit: params.limit,
    p_include_unconfirmed: params.includeUnconfirmed,
  });
  if (error) throw new Error(`cannot read who a reach-out may write to: ${error.message}`);
  return data ?? [];
}

export type PersonForSend =
  | { ok: true; contactId: string; conversationId: string; made: boolean }
  | { ok: false; refused: "lead_gone" | "lead_closed" | "no_address" | "already_yours" | "erased" };

/**
 * The person a first send needs, made once (00184 reach_out_person, through resolve_person since 00344): never a lead
 * converted by it, and never a person who asked to be forgotten (`erased`: the door's PE001, said in the door's answer).
 */
export async function addReachOutPerson(db: Db, tenantId: string, leadId: string): Promise<PersonForSend> {
  const { data, error } = await db.rpc("reach_out_person", { p_tenant_id: tenantId, p_lead_id: leadId });
  if (error) throw new Error(`cannot make the person this send is for: ${error.message}`);
  const row = (data ?? {}) as { refused?: string; contact_id?: string; conversation_id?: string; made?: boolean };
  if (
    row.refused === "lead_gone" ||
    row.refused === "lead_closed" ||
    row.refused === "no_address" ||
    row.refused === "already_yours" ||
    row.refused === "erased"
  )
    return { ok: false, refused: row.refused };
  if (!row.contact_id || !row.conversation_id)
    throw new Error("cannot make the person this send is for: no person came back");
  return { ok: true, contactId: row.contact_id, conversationId: row.conversation_id, made: row.made === true };
}

/** Up to `limit` due sends of a running chain from one mailbox, claimed under its lock within `cap` (00424, C7). */
export async function claimSends(
  db: Db,
  params: { mailboxId: string; cap: number; at: Date; limit: number },
): Promise<ReachOutSendRow[]> {
  // A share or a limit that is not a whole number is a caller's mistake, never "no cap" (JSON would send NaN as null).
  if (!Number.isInteger(params.cap) || !Number.isInteger(params.limit) || Number.isNaN(params.at.getTime()))
    throw new Error(
      `cannot claim the mailbox's due sends: a cap and a limit are whole numbers (${params.cap}, ${params.limit})`,
    );
  const { data, error } = await db.rpc("sequence_claim_from", {
    p_mailbox_id: params.mailboxId,
    p_cap: params.cap,
    p_at: params.at.toISOString(),
    p_limit: params.limit,
  });
  if (error) throw new Error(`cannot claim the mailbox's due sends: ${error.message}`);
  return leadSends(data);
}

/** One send's move, only from the state it was read in: a stale writer changes nothing and is told so. */
export async function moveSend(
  db: Db,
  params: { tenantId: string; id: string; from: LeadSendRow["state"]; patch: Partial<LeadSendRow> },
): Promise<boolean> {
  const { data, error } = await db
    .from("sequence_sends")
    .update(params.patch)
    .eq("tenant_id", params.tenantId)
    .eq("id", params.id)
    .eq("state", params.from)
    .select("id");
  if (error) throw new Error(`cannot move the send: ${error.message}`);
  return (data ?? []).length === 1;
}

export interface FollowerLead {
  lead_id: string;
  contact_id: string;
  email: string;
  region: string | null;
  hours: unknown;
  parent_message_id: string;
  /**
   * The lead's own facts (outreach_lead_facts, keyed by it): the answer the send door will give about them. `away` is
   * absent before 00226, and read as not away.
   */
  facts: { lead_stage: string | null; suppressed: boolean; wrote_back: boolean; away?: boolean };
  /** Any email of the chain to them bounced or failed for good (C4): the chain stops. */
  bounced: boolean;
  /** The mailbox the step before wrote to them from (00424): the nudge leaves from it, in its thread. */
  mailbox_id: string | null;
  /** The lead's country (decision 0056, 9). A database before 00424 says none: the finder's, the United States. */
  country: string | null;
}

/** A step's leads: sent the step before at least `afterDays` ago, not on this step yet (00184 reach_out_followers). */
export async function listReachOutFollowers(
  db: Db,
  params: { tenantId: string; stepId: string; parentId: string; afterDays: number; limit: number },
): Promise<FollowerLead[]> {
  const { data, error } = await db.rpc("reach_out_followers", {
    p_tenant_id: params.tenantId,
    p_step_id: params.stepId,
    p_parent_id: params.parentId,
    p_after_days: params.afterDays,
    p_limit: params.limit,
  });
  if (error) throw new Error(`cannot read who a step may write to: ${error.message}`);
  const rows = (data ?? []) as FollowerLead[];
  // The door's facts without the one it added last read as a failed read, as getOutreachFacts does (00181).
  for (const r of rows)
    if (typeof r.facts?.wrote_back !== "boolean")
      throw new Error("cannot read who a step may write to: the database did not say whether they wrote back");
  return rows;
}

/* ------------------------------------------------------------- the clock -- */

/** A queued send and what became of its email (00186 reach_out_queued_outcomes). An email row gone is all nulls. */
export interface QueuedOutcome {
  send: LeadSendRow;
  status: string | null;
  error: unknown;
  /** When it left, as its row was stamped (messages_guard's status_at.sent). */
  sent_at: string | null;
  /** When its email row was written. */
  written_at: string | null;
}

/** Queued sends with their emails, the ones with an outcome to read first (00186; sequence_queued_outcomes, 00441). */
export async function listQueuedOutcomes(db: Db, limit: number, tenantId?: string): Promise<QueuedOutcome[]> {
  const { data, error } = await db.rpc("sequence_queued_outcomes", {
    p_limit: limit,
    ...(tenantId ? { p_tenant_id: tenantId } : {}),
  });
  if (error) throw new Error(`cannot read the queued sends: ${error.message}`);
  return (data ?? []) as QueuedOutcome[];
}

/** Claims older than `before`, oldest first: a writer that died mid-send left them. */
export async function listStuckClaims(
  db: Db,
  before: Date,
  limit: number,
  tenantId?: string,
): Promise<ReachOutSendRow[]> {
  let q = db.from("sequence_sends").select("*").not("lead_id", "is", null).eq("state", "claimed");
  if (tenantId) q = q.eq("tenant_id", tenantId);
  const { data, error } = await q
    .lt("claimed_at", before.toISOString())
    .order("claimed_at", { ascending: true })
    .limit(limit);
  if (error) throw new Error(`cannot read the claimed sends: ${error.message}`);
  return leadSends(data);
}

/** Planned sends left past `before` in runs that go ahead on running chains (00186; sequence_stale_sends, 00441). */
export async function listStaleSends(
  db: Db,
  before: Date,
  limit: number,
  tenantId?: string,
): Promise<ReachOutSendRow[]> {
  const { data, error } = await db.rpc("sequence_stale_sends", {
    p_before: before.toISOString(),
    p_limit: limit,
    ...(tenantId ? { p_tenant_id: tenantId } : {}),
  });
  if (error) throw new Error(`cannot read the stale sends: ${error.message}`);
  return leadSends(data);
}

/** The open sends of canceled or failed runs, with their email's state (00186; sequence_closed_sends, 00441). */
export async function listClosedRunSends(
  db: Db,
  stuckBefore: Date,
  limit: number,
  tenantId?: string,
): Promise<Array<{ send: ReachOutSendRow; email_status: string | null }>> {
  const { data, error } = await db.rpc("sequence_closed_sends", {
    p_stuck_before: stuckBefore.toISOString(),
    p_limit: limit,
    ...(tenantId ? { p_tenant_id: tenantId } : {}),
  });
  if (error) throw new Error(`cannot read the closed runs' sends: ${error.message}`);
  return (data ?? []) as Array<{ send: ReachOutSendRow; email_status: string | null }>;
}

/** Reach-out runs that go ahead with nothing left open (00186 reach_out_finishable). */
export async function listFinishableRuns(db: Db, limit: number, tenantId?: string): Promise<string[]> {
  const { data, error } = await db.rpc("reach_out_finishable", {
    p_limit: limit,
    ...(tenantId ? { p_tenant_id: tenantId } : {}),
  });
  if (error) throw new Error(`cannot read the runs to finish: ${error.message}`);
  return (data ?? []).map((r) => (typeof r === "string" ? r : String(recordOrEmpty(r).reach_out_finishable ?? "")));
}

/** Which of these email ids have a row, a hundred at a time (an id list rides in the request's address). */
export async function getWrittenEmails(db: Db, ids: string[]): Promise<Set<string>> {
  const out = new Set<string>();
  const all = [...new Set(ids)];
  for (let i = 0; i < all.length; i += 100) {
    const { data, error } = await db
      .from("messages")
      .select("id")
      .in("id", all.slice(i, i + 100));
    if (error) throw new Error(`cannot read the sends' emails: ${error.message}`);
    for (const m of data ?? []) out.add(m.id);
  }
  return out;
}

/** An email withdrawn while it is still queued and no run has begun to send it, through the one door (00387): its job
 *  then sends nothing. False when it was not: it had moved on, or it is on its way, and what became of it is its job's. */
export async function withdrawEmail(
  db: Db,
  params: { tenantId: string; id: string; reason: string },
): Promise<boolean> {
  const withdrawn = await withdrawQueued(db, {
    tenantId: params.tenantId,
    messageIds: [params.id],
    reason: { reason: params.reason },
  });
  return withdrawn.length > 0;
}

/* ---------------------------------------------------- a lead's own email -- */

/** The mailbox a lead's sequence writes to it from (each lead hears from one, 00424), the latest; null where none has. */
export async function findLeadSequenceMailbox(db: Db, tenantId: string, leadId: string): Promise<string | null> {
  const { data, error } = await db
    .from("sequence_sends")
    .select("mailbox_id")
    .eq("tenant_id", tenantId)
    .eq("lead_id", leadId)
    .not("sequence_id", "is", null)
    .not("mailbox_id", "is", null)
    .order("created_at", { ascending: false })
    .limit(1);
  if (error) throw new Error(`cannot read the lead's sequence's mailbox: ${error.message}`);
  return data?.[0]?.mailbox_id ?? null;
}
