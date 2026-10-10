/**
 * The report functions Reports reads (00251, 00304, 00241, 00350, 00380, 00393): the receptionist's series, the campaigns',
 * the reviews', the Receptionist lens's, the People lens's and the reach-outs', each over a period of days and the period
 * before it; and the counts Campaigns reads (00374, 00375): a playbook's totals, a run's counts, a message's sends and
 * every chain's numbers. The one place they are called by name; the dashboard asks on the session client, so RLS decides
 * what a member reads (`report_series`, `campaign_series`, `reviews_ledger`, `receptionist_series` and `people_series` are
 * SECURITY INVOKER; `reach_out_report` is a definer that checks the member again). A read that fails throws: "we could
 * not read" is never "none".
 *
 * Each reads a WINDOW (00360): a count of days, and the day they end on. A period by name ends on the workspace's today
 * and names no day, which is the call every one of these was before 00360, so a database that has not run it yet reads a
 * period as it always did, and the dashboard and the migration may deploy in either order. Only days a member picked that
 * ended before today name their last day (`end`), and a database without 00360 has no function that takes one: that is
 * `ReportWindowNotReadable`, which the reader says in words, never a count of some other days.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database, Json } from "../../database.types";
import type { JsonObject } from "../../events";
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
 * The receptionist's numbers for the Receptionist lens, over the window and the period before it (`receptionist_series`,
 * 00380): the answered and handed-over counts, the speed, the missed calls and what came of them, day by day. Null is a
 * database that does not have the function yet: the dashboard deploys at the merge and 00380 goes to production on the
 * owner's word (either order works), so for that window every read answers it and the lens draws its kept cards and none of
 * its own parts (the function itself never answers null). A window that names its last day is the same answer, for the
 * same reason: the one function takes the last day, so a database without it has no function at all. Any other failure
 * throws.
 */
export async function receptionistSeries(db: Db, tenantId: string, window: ReportWindow): Promise<Json | null> {
  const { data, error } = await db.rpc("receptionist_series", windowArgs(tenantId, window));
  if (error) {
    if (isMissingDoor(error)) return null;
    throw new Error(`receptionist_series: ${error.message}`);
  }
  return data;
}

/**
 * The People lens's numbers, over the window and the period before it (`people_series`, 00393): the people who reached
 * the business and how many of them were new, by the way they came in and the way they first came, the answers recorded
 * about being written to, the email addresses that stopped working and the steps done and done on time. Counts only.
 * Null is a database that does not have the function yet: the dashboard deploys at the merge and 00393 goes to production
 * on the owner's word (either order works), so for that window every read answers it, and the lens draws the book
 * (People's own pool) and its kept cards and none of its series parts (the function itself never answers null). A window
 * that names its last day is the same answer, for the same reason: the one function takes the last day, so a database
 * without it has no function at all. Any other failure throws.
 */
export async function peopleSeries(db: Db, tenantId: string, window: ReportWindow): Promise<Json | null> {
  const { data, error } = await db.rpc("people_series", windowArgs(tenantId, window));
  if (error) {
    if (isMissingDoor(error)) return null;
    throw new Error(`people_series: ${error.message}`);
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

/**
 * A counts door's answer where the database may not have the function yet: its one jsonb object, keyed by a
 * playbook's, a run's or a chain's id or a message's name (an empty object: nothing counted), or "missing" on a
 * database before its migration (isMissingDoor), where the dashboard reads the old way for one release so either
 * deploy order works. Any other failure throws, an answer that is no object among them: "we could not read" is never
 * "none", nor "missing".
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
 * What each moment playbook's runs earned, with its newest `history` runs (`playbook_totals`, 00374): one jsonb by
 * playbook id, which PostgREST's row cap never cuts; contracts' isPlaybookTotalsDto reads it.
 */
export async function playbookTotals(db: Db, tenantId: string, history: number): Promise<JsonObject | "missing"> {
  const { data, error } = await db.rpc("playbook_totals", { p_tenant_id: tenantId, p_history: history });
  return answerOrMissing("playbook_totals", data, error);
}

/** Each run's people, receipts and replies, by run id (`run_counts`, 00374): what Sent, a run's sheet and a card say. */
export async function runCounts(db: Db, tenantId: string, runIds: readonly string[]): Promise<JsonObject | "missing"> {
  const { data, error } = await db.rpc("run_counts", { p_tenant_id: tenantId, p_run_ids: [...runIds] });
  return answerOrMissing("run_counts", data, error);
}

/** How many of each message went out, and when the latest did, by name (`template_sends`, 00374). */
export async function templateSends(db: Db, tenantId: string): Promise<JsonObject | "missing"> {
  const { data, error } = await db.rpc("template_sends", { p_tenant_id: tenantId });
  return answerOrMissing("template_sends", data, error);
}

/**
 * Every chain's numbers over the window, by its first step's id (`reach_out_chain_totals`, 00375): what it wrote, how
 * many wrote back, when it last wrote. The window is read as `reachOutReport` reads it, its last day named only where it
 * is not today, so Reports' chains and its report count the same days; the function takes a last day from its first
 * migration, so a database without it answers "missing", never ReportWindowNotReadable. A definer behind
 * may_read_workspace: a caller who is no member is refused (P0002), thrown.
 */
export async function reachOutChainTotals(
  db: Db,
  tenantId: string,
  window: ReportWindow,
): Promise<JsonObject | "missing"> {
  const { data, error } = await db.rpc("reach_out_chain_totals", windowArgs(tenantId, window));
  return answerOrMissing("reach_out_chain_totals", data, error);
}
