/**
 * The report functions Reports reads (00251, 00304, 00241, 00350): the receptionist's series, the campaigns', the reviews'
 * and the reach-outs', each over a period of days and the period before it. The one place they are called by name; the
 * dashboard asks on the session client, so RLS decides what a member reads (`report_series`, `campaign_series` and
 * `reviews_ledger` are SECURITY INVOKER; `reach_out_report` is a definer that checks the member again). A read that
 * fails throws: "we could not read" is never "none".
 *
 * Each reads a WINDOW (00360): a count of days, and the day they end on. A period by name ends on the workspace's today
 * and names no day, which is the call every one of these was before 00360, so a database that has not run it yet reads a
 * period as it always did, and the dashboard and the migration may deploy in either order. Only days a member picked that
 * ended before today name their last day (`end`), and a database without 00360 has no function that takes one: that is
 * `ReportWindowNotReadable`, which the reader says in words, never a count of some other days.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database, Json } from "../../database.types";
import { isMissingDoor } from "../templates";

type Db = SupabaseClient<Database>;

/** The days a report function reads: how many, and their last day ("YYYY-MM-DD") where that is before today; null where they end today. */
export interface ReportWindow {
  days: number;
  end: string | null;
}

/** A window that ended before today, asked of a database whose report functions cannot read one yet (00360 not applied). */
export class ReportWindowNotReadable extends Error {
  constructor(door: string) {
    super(`${door}: this database cannot read a report of days that ended before today (00360)`);
    this.name = "ReportWindowNotReadable";
  }
}

/** A function's arguments for a window: its last day named only where it is not today, so a period reads as it always did. */
const windowArgs = (tenantId: string, w: ReportWindow) =>
  w.end === null ? { p_tenant_id: tenantId, p_days: w.days } : { p_tenant_id: tenantId, p_days: w.days, p_end: w.end };

/** A refusal that says the function taking a last day is not on this database, for a window that names one. */
const notReadable = (w: ReportWindow, error: { code?: string | null }): boolean =>
  w.end !== null && isMissingDoor({ code: error.code ?? null });

/** The receptionist's numbers day by day for the window and the same number of days before it (`report_series`, 00304). */
export async function reportSeries(db: Db, tenantId: string, window: ReportWindow): Promise<Json> {
  const { data, error } = await db.rpc("report_series", windowArgs(tenantId, window));
  if (error) {
    if (notReadable(window, error)) throw new ReportWindowNotReadable("report_series");
    throw new Error(`report_series: ${error.message}`);
  }
  return data;
}

/** What the broadcasts and playbooks sent, day by day for the window and the same number before, and the window by source (`campaign_series`, 00251). */
export async function campaignSeries(db: Db, tenantId: string, window: ReportWindow): Promise<Json> {
  const { data, error } = await db.rpc("campaign_series", windowArgs(tenantId, window));
  if (error) {
    if (notReadable(window, error)) throw new ReportWindowNotReadable("campaign_series");
    throw new Error(`campaign_series: ${error.message}`);
  }
  return data;
}

/**
 * The reviews on record for the Reviews lens, over the window and the period before (`reviews_ledger`, 00350): the
 * profile's reviews dated in the workspace's own zone, the counts, the oldest few that wait. Contracts'
 * `isReviewsLedgerDto` tells its answer from `{ error: "unknown_tenant" }`. Null is a database that does not have the
 * function yet: the dashboard deploys at the merge and 00350 goes to production on the owner's word, so for that window
 * every read answers it, and the lens draws the listing alone (the function itself never answers null). A window that
 * names its last day on a database without 00360 is the same answer, for the same reason. Any other failure throws.
 */
export async function reviewsLedger(db: Db, tenantId: string, window: ReportWindow): Promise<Json | null> {
  const { data, error } = await db.rpc("reviews_ledger", windowArgs(tenantId, window));
  if (error) {
    if (isMissingDoor(error)) return null;
    throw new Error(`reviews_ledger: ${error.message}`);
  }
  return data;
}

/**
 * What the workspace's reach-outs wrote over the window, and what came of it (`reach_out_report`, 00241). The function
 * raises contracts' own refusals with a code the door words (not found, not as it may be); they come back as they are,
 * not thrown.
 */
export async function reachOutReport(
  db: Db,
  tenantId: string,
  window: ReportWindow,
): Promise<{ ok: true; data: Json } | { ok: false; code: string; message: string }> {
  const { data, error } = await db.rpc("reach_out_report", windowArgs(tenantId, window));
  if (error) {
    if (notReadable(window, error)) throw new ReportWindowNotReadable("reach_out_report");
    return { ok: false, code: error.code ?? "", message: error.message };
  }
  return { ok: true, data };
}
