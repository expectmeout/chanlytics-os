/**
 * A reach-out's doors as the member's pages ask them (decision 0111): a search's lines and reach, a lead's timeline
 * and its stop, a chain's report and its removal, and a run checked again. Each answer is the database's as it came.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "../../../types";

type Db = SupabaseClient<Database>;

/** A search's leads as its reach-out's lines (reach_out_search_lines). */
export const readReachOutLines = async (db: Db, tenantId: string, searchId: string) =>
  db.rpc("reach_out_search_lines", { p_tenant_id: tenantId, p_search_id: searchId });

/** A lead's reach-out, step by step (reach_out_lead_timeline). */
export const readReachOutTimeline = async (db: Db, tenantId: string, leadId: string) =>
  db.rpc("reach_out_lead_timeline", { p_tenant_id: tenantId, p_lead_id: leadId });

/** A lead taken out of its reach-out (reach_out_lead_stop). */
export const stopReachOutLead = async (db: Db, leadId: string) => db.rpc("reach_out_lead_stop", { p_lead_id: leadId });

/** A chain's report (reach_out_chain_report). */
export const readReachOutChainReport = async (db: Db, tenantId: string, rootId: string) =>
  db.rpc("reach_out_chain_report", { p_tenant_id: tenantId, p_root_id: rootId });

/** Who a search's reach-out can reach (reach_out_reach). */
export const readReachOutReach = async (db: Db, tenantId: string, searchId: string) =>
  db.rpc("reach_out_reach", { p_tenant_id: tenantId, p_search_id: searchId });

/** A chain removed (reach_out_remove). */
export const removeReachOutChain = async (db: Db, tenantId: string, rootId: string) =>
  db.rpc("reach_out_remove", { p_tenant_id: tenantId, p_root_id: rootId });

/** A run's emails checked again (reach_out_run_recheck). */
export const recheckReachOutRun = async (db: Db, runId: string) =>
  db.rpc("reach_out_run_recheck", { p_broadcast_id: runId });
