/**
 * The check (Reach out Part 4, 00197): the sends it takes each tick, leased under their row locks, the business's record
 * each is checked against, the holds it leaves and its model spend. Moved from repositories/reach-out.ts when the record
 * took the listing's signals (00423); what the check found is written by that module's recordCheck, the one module that
 * writes a send.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "../../database.types";
import type { ReachOutSendRow } from "../reach-out";

type Db = SupabaseClient<Database>;

/** A business's record, as 00197's reach_out_record reads it (00423: and its signals): what the check writes and reads an opening from. */
export interface ReachOutRecordRow {
  business_name: string | null;
  category: string | null;
  city: string | null;
  region: string | null;
  rating: number | null;
  reviews: number | null;
  website_host: string | null;
  hours: unknown;
  about: string | null;
  email: string | null;
  why_it_fits: string | null;
  what_you_asked: string | null;
  site_listings: number;
  name_listings: number;
  email_domain_shared: boolean;
  /** The listing's review spread, its stars to their counts, and whether its owner claimed it (00423): the signals. */
  reviews_dist: unknown;
  claimed: boolean | null;
}

/** A send to check (00197 reach_out_unchecked), leased to this tick: the send, its step, its chain and its record. */
export interface UncheckedSend {
  send: ReachOutSendRow;
  /** The words' version the send was read at: the check writes only while it is still this (R5). */
  check_gen: number;
  template_id: string;
  template_language: string;
  signed_by: string | null;
  /** The holds its owner included it, or its lead in this chain, past (R7): never held for them again. */
  included_for: string[];
  record: ReachOutRecordRow;
}

const num = (v: unknown): number | null => (v === null || v === undefined || v === "" ? null : Number(v));
const text = (v: unknown): string | null => (typeof v === "string" ? v : null);

function recordOf(r: Record<string, unknown>): ReachOutRecordRow {
  return {
    business_name: text(r.business_name),
    category: text(r.category),
    city: text(r.city),
    region: text(r.region),
    rating: num(r.rating),
    reviews: num(r.reviews),
    website_host: text(r.website_host),
    hours: r.hours ?? null,
    about: text(r.about),
    email: text(r.email),
    why_it_fits: text(r.why_it_fits),
    what_you_asked: text(r.what_you_asked),
    site_listings: Number(r.site_listings ?? 0),
    name_listings: Number(r.name_listings ?? 0),
    email_domain_shared: r.email_domain_shared === true,
    reviews_dist: r.reviews_dist ?? null,
    claimed: typeof r.claimed === "boolean" ? r.claimed : null,
  };
}

/**
 * The sends this tick checks, leased under their row locks (00197): at most `perWorkspace` of each workspace, round
 * robin, waiting for their owner or due within `aheadMinutes`, none another tick started in the last two minutes.
 */
export async function uncheckedSends(
  db: Db,
  p: { limit: number; perWorkspace: number; aheadMinutes: number; tenantId?: string },
): Promise<UncheckedSend[]> {
  const { data, error } = await db.rpc("reach_out_unchecked", {
    p_limit: p.limit,
    p_per_workspace: p.perWorkspace,
    p_ahead_minutes: p.aheadMinutes,
    ...(p.tenantId ? { p_tenant_id: p.tenantId } : {}),
  });
  if (error) throw new Error(`cannot read the sends to check: ${error.message}`);
  return ((data ?? []) as Array<Record<string, unknown>>).map((r) => {
    const send = r.send as ReachOutSendRow;
    return {
      send,
      check_gen: Number(r.check_gen ?? send.check_gen ?? 0),
      template_id: String(r.template_id),
      template_language: text(r.template_language) ?? "en",
      signed_by: text(r.signed_by),
      included_for: Array.isArray(r.included_for)
        ? r.included_for.filter((x): x is string => typeof x === "string")
        : [],
      record: recordOf(r),
    };
  });
}

/** Whether any send waits to be checked: what the check's clock answers for when it cannot check (R4). */
export async function uncheckedWaiting(db: Db, tenantId?: string): Promise<boolean> {
  let q = db.from("reach_out_sends").select("id").eq("state", "planned").is("checked_at", null);
  if (tenantId) q = q.eq("tenant_id", tenantId);
  const { data, error } = await q.limit(1);
  if (error) throw new Error(`cannot read the sends to check: ${error.message}`);
  return (data ?? []).length > 0;
}

/** One business's record for a search, whether or not a send exists for it yet (the sheet's preview). */
export async function reachOutRecord(
  db: Db,
  p: { tenantId: string; searchId: string; leadId: string },
): Promise<ReachOutRecordRow | null> {
  const { data, error } = await db.rpc("reach_out_record", {
    p_tenant_id: p.tenantId,
    p_search_id: p.searchId,
    p_lead_id: p.leadId,
  });
  if (error) throw new Error(`cannot read the business's record: ${error.message}`);
  const row = ((data ?? []) as Array<Record<string, unknown>>)[0];
  return row ? recordOf(row) : null;
}

/** Holds left past `before`, oldest planned first (00197: fourteen days from when a send was planned, R10). */
export async function heldStale(db: Db, before: Date, limit: number, tenantId?: string): Promise<ReachOutSendRow[]> {
  const { data, error } = await db.rpc("reach_out_held_stale", {
    p_before: before.toISOString(),
    p_limit: limit,
    ...(tenantId ? { p_tenant_id: tenantId } : {}),
  });
  if (error) throw new Error(`cannot read the held sends: ${error.message}`);
  return data ?? [];
}

/**
 * Holds the check could not answer (check_unavailable, no rule broken) left since `before`: put back to be checked
 * again at their words' next version, in one statement (00197 reach_out_release_unavailable, R4). A hold for a rule an
 * opening broke keeps: it is its owner's to answer. How many went back.
 */
export async function releaseUnavailableHolds(db: Db, p: { before: Date; tenantId?: string }): Promise<number> {
  const { data, error } = await db.rpc("reach_out_release_unavailable", {
    p_before: p.before.toISOString(),
    ...(p.tenantId ? { p_tenant_id: p.tenantId } : {}),
  });
  if (error) throw new Error(`cannot put the holds back to be checked: ${error.message}`);
  return typeof data === "number" ? data : 0;
}

/**
 * One attempt of the check's model spend for a workspace's UTC day, taken only while the day is under `cap` (00197
 * reach_out_check_take, R12): true when taken. A reset of a send's check never gives it back.
 */
export async function takeCheckAttempt(db: Db, p: { tenantId: string; cap: number; at: Date }): Promise<boolean> {
  const { data, error } = await db.rpc("reach_out_check_take", {
    p_tenant_id: p.tenantId,
    p_cap: p.cap,
    p_at: p.at.toISOString(),
  });
  if (error) throw new Error(`cannot take the check's attempt: ${error.message}`);
  return data === true;
}
