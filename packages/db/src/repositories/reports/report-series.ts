/**
 * The report functions Reports reads (00251, 00304, 00241, 00350): the receptionist's series, the campaigns', the reviews'
 * and the reach-outs', each over a period of days and the period before it; and the counts Campaigns reads (00362,
 * 00363): a playbook's totals, a run's counts, a message's sends and every chain's numbers. The one place they are
 * called by name; the dashboard asks on the session client, so RLS decides what a member reads (`report_series`,
 * `campaign_series` and `reviews_ledger` are SECURITY INVOKER; `reach_out_report` is a definer that checks the member
 * again). A read that fails throws: "we could not read" is never "none".
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database, Json } from "../../database.types";
import type { JsonObject } from "../../events";
import { isMissingDoor } from "../templates";

type Db = SupabaseClient<Database>;

/** The receptionist's numbers day by day for `days` and the same number before them (`report_series`, 00304). */
export async function reportSeries(db: Db, tenantId: string, days: number): Promise<Json> {
  const { data, error } = await db.rpc("report_series", { p_tenant_id: tenantId, p_days: days });
  if (error) throw new Error(`report_series: ${error.message}`);
  return data;
}

/** What the broadcasts and playbooks sent, day by day for `days` and the same number before, and the period by source (`campaign_series`, 00251). */
export async function campaignSeries(db: Db, tenantId: string, days: number): Promise<Json> {
  const { data, error } = await db.rpc("campaign_series", { p_tenant_id: tenantId, p_days: days });
  if (error) throw new Error(`campaign_series: ${error.message}`);
  return data;
}

/**
 * The reviews on record for the Reviews lens, over `days` and the period before (`reviews_ledger`, 00350): the profile's
 * reviews dated in the workspace's own zone, the counts, the oldest few that wait. Contracts' `isReviewsLedgerDto` tells
 * its answer from `{ error: "unknown_tenant" }`. Null is a database that does not have the function yet: the dashboard
 * deploys at the merge and 00350 goes to production on the owner's word, so for that window every read answers it, and
 * the lens draws the listing alone (the function itself never answers null). Any other failure throws.
 */
export async function reviewsLedger(db: Db, tenantId: string, days: number): Promise<Json | null> {
  const { data, error } = await db.rpc("reviews_ledger", { p_tenant_id: tenantId, p_days: days });
  if (error) {
    if (isMissingDoor(error)) return null;
    throw new Error(`reviews_ledger: ${error.message}`);
  }
  return data;
}

/**
 * What the workspace's reach-outs wrote over `days`, and what came of it (`reach_out_report`, 00241). The function raises
 * contracts' own refusals with a code the door words (not found, not as it may be); they come back as they are, not thrown.
 */
export async function reachOutReport(
  db: Db,
  tenantId: string,
  days: number,
): Promise<{ ok: true; data: Json } | { ok: false; code: string; message: string }> {
  const { data, error } = await db.rpc("reach_out_report", { p_tenant_id: tenantId, p_days: days });
  if (error) return { ok: false, code: error.code ?? "", message: error.message };
  return { ok: true, data };
}

/**
 * A counts door's answer where the database may not have the function yet: its one jsonb object, keyed by a
 * playbook's, a run's or a chain's id or a message's name (an empty object: nothing counted), or "missing" on a
 * database before its
 * migration (isMissingDoor), where the dashboard reads the old way for one release so either deploy order works. Any
 * other failure throws, an answer that is no object among them: "we could not read" is never "none", nor "missing".
 */
function answerOrMissing(
  name: string,
  data: Json,
  error: { code: string; message: string } | null,
): JsonObject | "missing" {
  if (error) {
    if (isMissingDoor(error)) return "missing";
    throw new Error(`${name}: ${error.message}`);
  }
  if (data === null || typeof data !== "object" || Array.isArray(data)) throw new Error(`${name}: answered no object`);
  return data;
}

/**
 * What each moment playbook's runs earned, with its newest `history` runs (`playbook_totals`, 00362): one jsonb by
 * playbook id, which PostgREST's row cap never cuts; contracts' isPlaybookTotalsDto reads it.
 */
export async function playbookTotals(db: Db, tenantId: string, history: number): Promise<JsonObject | "missing"> {
  const { data, error } = await db.rpc("playbook_totals", { p_tenant_id: tenantId, p_history: history });
  return answerOrMissing("playbook_totals", data, error);
}

/** Each run's people, receipts and replies, by run id (`run_counts`, 00362): what Sent, a run's sheet and a card say. */
export async function runCounts(db: Db, tenantId: string, runIds: readonly string[]): Promise<JsonObject | "missing"> {
  const { data, error } = await db.rpc("run_counts", { p_tenant_id: tenantId, p_run_ids: [...runIds] });
  return answerOrMissing("run_counts", data, error);
}

/** How many of each message went out, and when the latest did, by name (`template_sends`, 00362). */
export async function templateSends(db: Db, tenantId: string): Promise<JsonObject | "missing"> {
  const { data, error } = await db.rpc("template_sends", { p_tenant_id: tenantId });
  return answerOrMissing("template_sends", data, error);
}

/**
 * Every chain's last `days`, by its first step's id (`reach_out_chain_totals`, 00363): what it wrote, how many wrote
 * back, when it last wrote. A definer behind may_read_workspace: a caller who is no member is refused (P0002), thrown.
 */
export async function reachOutChainTotals(db: Db, tenantId: string, days: number): Promise<JsonObject | "missing"> {
  const { data, error } = await db.rpc("reach_out_chain_totals", { p_tenant_id: tenantId, p_days: days });
  return answerOrMissing("reach_out_chain_totals", data, error);
}
