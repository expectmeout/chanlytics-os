/**
 * Reach out's sends and the doors they go through (Part 3): the one place `reach_out_sends` is typed, and the doors of
 * 00184. The service role asks every one of them (the edge's clock and run); a read or a door that fails throws,
 * because "we could not check" is not "yes".
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "../database.types";

type Db = SupabaseClient<Database>;
export type ReachOutSendRow = Database["public"]["Tables"]["reach_out_sends"]["Row"];
export type ReachOutSendInsert = Database["public"]["Tables"]["reach_out_sends"]["Insert"];

/** What a domain may still send (00184 sending_domain_capacity): the one reading the timetable, the claim and the door share. */
export interface DomainCapacity {
  state: string;
  clean_since: string | null;
  /** The days it sent on since it was clean, within the last 90 (D15). */
  sent_days: number;
  /** What it spends in the rolling day: left, of unknown outcome, queued, claimed. */
  used: number;
  /** When it spends each (ms): those of the rolling day, the waiting ones, and the planned ones ahead. */
  recent: number[];
  last_sent_at: string | null;
}

export async function domainCapacityOf(db: Db, domainId: string, at: Date): Promise<DomainCapacity> {
  const { data, error } = await db.rpc("sending_domain_capacity", {
    p_domain_id: domainId,
    p_at: at.toISOString(),
  } as never);
  if (error) throw new Error(`cannot read the domain's capacity: ${error.message}`);
  const c = (data ?? {}) as Partial<DomainCapacity>;
  if (typeof c.used !== "number" || typeof c.sent_days !== "number")
    throw new Error("cannot read the domain's capacity: the database answered without its counts");
  return {
    state: String(c.state ?? ""),
    clean_since: typeof c.clean_since === "string" ? c.clean_since : null,
    sent_days: c.sent_days,
    used: c.used,
    recent: Array.isArray(c.recent) ? c.recent.map(Number).filter(Number.isFinite) : [],
    last_sent_at: typeof c.last_sent_at === "string" ? c.last_sent_at : null,
  };
}

export interface AudienceLead {
  lead_id: string;
  email: string;
  business_name: string | null;
  city: string | null;
  region: string | null;
  hours: unknown;
}

/** The leads a chain's first step may write to (00184 reach_out_audience), strongest fit first. */
export async function reachOutAudience(
  db: Db,
  p: { tenantId: string; searchId: string; rootId: string; limit: number },
): Promise<AudienceLead[]> {
  const { data, error } = await db.rpc("reach_out_audience", {
    p_tenant_id: p.tenantId,
    p_search_id: p.searchId,
    p_root_id: p.rootId,
    p_limit: p.limit,
  } as never);
  if (error) throw new Error(`cannot read who a reach-out may write to: ${error.message}`);
  return (data ?? []) as AudienceLead[];
}

export type PersonForSend =
  | { ok: true; contactId: string; conversationId: string; made: boolean }
  | { ok: false; refused: "lead_gone" | "lead_closed" | "no_address" | "already_yours" };

/** The person a first send needs, made once (00184 reach_out_person): never a lead converted by it. */
export async function reachOutPerson(db: Db, tenantId: string, leadId: string): Promise<PersonForSend> {
  const { data, error } = await db.rpc("reach_out_person", { p_tenant_id: tenantId, p_lead_id: leadId } as never);
  if (error) throw new Error(`cannot make the person this send is for: ${error.message}`);
  const r = (data ?? {}) as { refused?: string; contact_id?: string; conversation_id?: string; made?: boolean };
  if (
    r.refused === "lead_gone" ||
    r.refused === "lead_closed" ||
    r.refused === "no_address" ||
    r.refused === "already_yours"
  )
    return { ok: false, refused: r.refused };
  if (!r.contact_id || !r.conversation_id)
    throw new Error("cannot make the person this send is for: no person came back");
  return { ok: true, contactId: r.contact_id, conversationId: r.conversation_id, made: r.made === true };
}

/** Up to `limit` due sends of a running chain on one domain, claimed under its lock within `cap` (00184, C7). */
export async function claimSends(
  db: Db,
  p: { domainId: string; cap: number; at: Date; limit: number },
): Promise<ReachOutSendRow[]> {
  const { data, error } = await db.rpc("reach_out_claim", {
    p_domain_id: p.domainId,
    p_cap: p.cap,
    p_at: p.at.toISOString(),
    p_limit: p.limit,
  } as never);
  if (error) throw new Error(`cannot claim the domain's due sends: ${error.message}`);
  return (data ?? []) as ReachOutSendRow[];
}

/** One send's move, only from the state it was read in: a stale writer changes nothing and is told so. */
export async function moveSend(
  db: Db,
  p: { tenantId: string; id: string; from: ReachOutSendRow["state"]; patch: Partial<ReachOutSendRow> },
): Promise<boolean> {
  const { data, error } = await db
    .from("reach_out_sends")
    .update(p.patch as never)
    .eq("tenant_id", p.tenantId)
    .eq("id", p.id)
    .eq("state", p.from)
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
  /** The door's own facts for this lead (outreach_facts, keyed by it): the answer the send will get. */
  facts: { lead_stage: string | null; suppressed: boolean; wrote_back: boolean };
  /** Any email of the chain to them bounced (C4): the chain stops. */
  bounced: boolean;
}

/** A step's leads: sent the step before at least `afterDays` ago, not on this step yet (00184 reach_out_followers). */
export async function reachOutFollowers(
  db: Db,
  p: { tenantId: string; stepId: string; parentId: string; afterDays: number; limit: number },
): Promise<FollowerLead[]> {
  const { data, error } = await db.rpc("reach_out_followers", {
    p_tenant_id: p.tenantId,
    p_step_id: p.stepId,
    p_parent_id: p.parentId,
    p_after_days: p.afterDays,
    p_limit: p.limit,
  } as never);
  if (error) throw new Error(`cannot read who a step may write to: ${error.message}`);
  const rows = (data ?? []) as FollowerLead[];
  // The door's facts without the one it added last read as a failed read, as outreachFactsOf does (00181).
  for (const r of rows)
    if (typeof r.facts?.wrote_back !== "boolean")
      throw new Error("cannot read who a step may write to: the database did not say whether they wrote back");
  return rows;
}

/** A run's sends, planned once: a lead already in the run keeps the plan it has. */
export async function planSends(db: Db, rows: ReachOutSendInsert[]): Promise<void> {
  if (rows.length === 0) return;
  const { error } = await db
    .from("reach_out_sends")
    .upsert(rows as never, { onConflict: "broadcast_id,lead_id", ignoreDuplicates: true });
  if (error) throw new Error(`cannot plan the run's sends: ${error.message}`);
}
