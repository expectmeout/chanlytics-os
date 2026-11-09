/**
 * The check (Reach out Part 4, 00197): the sends it takes each tick, leased under their row locks, the business's record
 * each is checked against, the holds it leaves and its model spend. Moved from repositories/campaigns/reach-out/reach-out.ts when the record
 * took the listing's signals (00426); what the check found is written by that module's recordCheck, the one module that
 * writes a send.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "../../../types";
import { leadSends, type ReachOutSendRow } from "./reach-out";
import type { TenantId } from "@chanlytics/contracts";
import { DbFailure } from "@chanlytics/contracts";

type Db = SupabaseClient<Database>;

/** A business's record, as 00197's reach_out_record reads it (00426: and its signals): what the check writes and reads an opening from. */
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
  /** The listing's review spread, its stars to their counts, and whether its owner claimed it (00426): the signals. */
  reviews_dist: unknown;
  claimed: boolean | null;
}

/** A send to check (00197; sequence_unchecked, 00441), leased to this tick: the send, its step, its sequence and its record. */
export interface UncheckedSend {
  send: ReachOutSendRow;
  /** The words' version the send was read at: the check writes only while it is still this (R5). */
  check_gen: number;
  template_id: string;
  template_language: string;
  signed_by: string | null;
  /**
   * The holds its owner included it, or its lead in this chain, past (R7): the check honours the ones an Include carries
   * (contracts HOLDS_INCLUDED_FOR_CHAIN).
   */
  included_for: string[];
  /** Waiting for its owner, or due within the tick's `aheadMinutes`: taken first, and the only kind a model's bad hour holds (decision 0098). */
  due_soon: boolean;
  record: ReachOutRecordRow;
}

const num = (v: unknown): number | null => (v === null || v === undefined || v === "" ? null : Number(v));
const text = (v: unknown): string | null => (typeof v === "string" ? v : null);

function recordOf(record: Record<string, unknown>): ReachOutRecordRow {
  return {
    business_name: text(record.business_name),
    category: text(record.category),
    city: text(record.city),
    region: text(record.region),
    rating: num(record.rating),
    reviews: num(record.reviews),
    website_host: text(record.website_host),
    hours: record.hours ?? null,
    about: text(record.about),
    email: text(record.email),
    why_it_fits: text(record.why_it_fits),
    what_you_asked: text(record.what_you_asked),
    site_listings: Number(record.site_listings ?? 0),
    name_listings: Number(record.name_listings ?? 0),
    email_domain_shared: record.email_domain_shared === true,
    reviews_dist: record.reviews_dist ?? null,
    claimed: typeof record.claimed === "boolean" ? record.claimed : null,
  };
}

/**
 * The sends this tick checks, leased under their row locks (00197): at most `perWorkspace` of each workspace, round
 * robin, every planned send whatever its day (decision 0098), those waiting for their owner or due within `aheadMinutes`
 * first, none another tick started in the last two minutes. With `sendIds`, those sends alone (00505: a person pressed them).
 */
export async function listUncheckedSends(
  db: Db,
  params: { limit: number; perWorkspace: number; aheadMinutes: number; tenantId?: TenantId; sendIds?: string[] },
): Promise<UncheckedSend[]> {
  const { data, error } = await db.rpc("sequence_unchecked", {
    p_limit: params.limit,
    p_per_workspace: params.perWorkspace,
    p_ahead_minutes: params.aheadMinutes,
    ...(params.tenantId ? { p_tenant_id: params.tenantId } : {}),
    ...(params.sendIds ? { p_send_ids: params.sendIds } : {}),
  });
  if (error) throw new DbFailure(error, "cannot read the sends to check");
  return (data ?? []).map((item) => {
    const send = item.send as ReachOutSendRow;
    return {
      send,
      check_gen: Number(item.check_gen ?? send.check_gen ?? 0),
      template_id: String(item.template_id),
      template_language: text(item.template_language) ?? "en",
      signed_by: text(item.signed_by),
      included_for: Array.isArray(item.included_for)
        ? item.included_for.filter((x): x is string => typeof x === "string")
        : [],
      // A function from before 00546 says nothing, and takes only what is due soon.
      due_soon: item.due_soon !== false,
      record: recordOf(item),
    };
  });
}

/** Whether any send waits to be checked: what the check's clock answers for when it cannot check (R4). */
export async function getUncheckedWaiting(db: Db, tenantId?: TenantId): Promise<boolean> {
  let query = db
    .from("sequence_sends")
    .select("id")
    .not("lead_id", "is", null)
    .eq("state", "planned")
    .is("checked_at", null);
  if (tenantId) query = query.eq("tenant_id", tenantId);
  const { data, error } = await query.limit(1);
  if (error) throw new DbFailure(error, "cannot read the sends to check");
  return (data ?? []).length > 0;
}

/** One business's record for a search, whether or not a send exists for it yet (the sheet's preview). */
export async function readReachOutRecord(
  db: Db,
  params: { tenantId: TenantId; searchId: string; leadId: string },
): Promise<ReachOutRecordRow | null> {
  const { data, error } = await db.rpc("reach_out_record", {
    p_tenant_id: params.tenantId,
    p_search_id: params.searchId,
    p_lead_id: params.leadId,
  });
  if (error) throw new DbFailure(error, "cannot read the business's record");
  const row = (data ?? [])[0];
  return row ? recordOf(row) : null;
}

/** Holds left past `before`, oldest planned first (00197: fourteen days from when a send was planned, R10). */
export async function listHeldStale(
  db: Db,
  before: Date,
  limit: number,
  tenantId?: TenantId,
): Promise<ReachOutSendRow[]> {
  const { data, error } = await db.rpc("sequence_held_stale", {
    p_before: before.toISOString(),
    p_limit: limit,
    ...(tenantId ? { p_tenant_id: tenantId } : {}),
  });
  if (error) throw new DbFailure(error, "cannot read the held sends");
  return leadSends(data);
}

/**
 * Holds the check could not answer (check_unavailable, no rule broken) left since `before`: put back to be checked
 * again at their words' next version, in one statement (00197 reach_out_release_unavailable, R4). A hold for a rule an
 * opening broke keeps: it is its owner's to answer. How many went back.
 */
export async function releaseUnavailableHolds(db: Db, params: { before: Date; tenantId?: TenantId }): Promise<number> {
  const { data, error } = await db.rpc("reach_out_release_unavailable", {
    p_before: params.before.toISOString(),
    ...(params.tenantId ? { p_tenant_id: params.tenantId } : {}),
  });
  if (error) throw new DbFailure(error, "cannot put the holds back to be checked");
  return typeof data === "number" ? data : 0;
}

/**
 * One attempt of the check's model spend for a workspace's UTC day, taken only while the day is under `cap` (00197
 * reach_out_check_take, R12): true when taken. A reset of a send's check never gives it back.
 */
export async function takeCheckAttempt(
  db: Db,
  params: { tenantId: TenantId; cap: number; at: Date },
): Promise<boolean> {
  const { data, error } = await db.rpc("reach_out_check_take", {
    p_tenant_id: params.tenantId,
    p_cap: params.cap,
    p_at: params.at.toISOString(),
  });
  if (error) throw new DbFailure(error, "cannot take the check's attempt");
  return data === true;
}
