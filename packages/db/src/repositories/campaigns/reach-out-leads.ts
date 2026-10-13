/**
 * The lead workbench's doors (00426): leads added to a reach-out fed by a list (reach_out_add, dry or not), a lead put
 * off for later in a pass of the pile (lead_member_later), the pile's progress line (lead_pile_counts) and who is in a
 * reach-out (reach_out_chain_people). Each is asked on the member's own session: the door checks who may in SQL, and
 * answers its refusal with its SQLSTATE and its own words, which come back here as they came (code and all), so the
 * route says them at the status the code means (dbRefusal).
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { isLeadList } from "@chanlytics/contracts";
import type {
  LeadBackDto,
  LeadPileCountsDto,
  ReachOutAddDto,
  ReachOutChainPeopleDto,
  ReachOutFedBy,
  ReachOutPeopleCountsDto,
  ReachOutSourceDto,
} from "@chanlytics/contracts";
import type { Database } from "../../database.types";

type Db = SupabaseClient<Database>;

/** A door's answer, or its refusal as the database raised it. */
export type DoorResult<T> = { data: T; error: null } | { data: null; error: { code?: string; message: string } };

const answer = <T>(data: unknown, error: { code?: string; message: string } | null): DoorResult<T> =>
  error ? { data: null, error: { code: error.code, message: error.message } } : { data: data as T, error: null };

/** What the add door answers: what joined (or, dry, would), or why nothing could. */
export type ReachOutAddAnswer = ReachOutAddDto | { error: "list_gone" | "fed_by_search"; search_id?: string };

/** Leads added to a list-fed reach-out, or, dry, what each would do (contracts ReachOutAddDto). */
export async function reachOutAdd(
  db: Db,
  p: { rootId: string; leadIds: string[]; dry: boolean },
): Promise<DoorResult<ReachOutAddAnswer>> {
  const { data, error } = await db.rpc("reach_out_add", { p_root_id: p.rootId, p_lead_ids: p.leadIds, p_dry: p.dry });
  return answer<ReachOutAddAnswer>(data, error);
}

/** Later: one lead of a search put off in this pass, with its undo's id and version, or the door's refusal word. */
export async function leadMemberLater(
  db: Db,
  p: { searchId: string; leadId: string },
): Promise<DoorResult<{ op_id?: string; version?: number; error?: string }>> {
  const { data, error } = await db.rpc("lead_member_later", { p_search_id: p.searchId, p_lead_id: p.leadId });
  return answer<{ op_id?: string; version?: number; error?: string }>(data, error);
}

/** The pile's progress line: {total, added, closed, later, left} of a search's shown members, against a list. */
export async function leadPileCounts(
  db: Db,
  p: { tenantId: string; searchId: string; listId: string | null; cls?: string },
): Promise<DoorResult<LeadPileCountsDto>> {
  const { data, error } = await db.rpc("lead_pile_counts", {
    p_tenant_id: p.tenantId,
    p_search_id: p.searchId,
    ...(p.listId ? { p_list_id: p.listId } : {}),
    ...(p.cls ? { p_class: p.cls } : {}),
  });
  return answer<LeadPileCountsDto>(data, error);
}

/** Who is in a reach-out (contracts ReachOutChainPeopleDto), or null for one the workspace does not hold. */
export async function reachOutChainPeople(
  db: Db,
  p: { tenantId: string; rootId: string; limit?: number },
): Promise<DoorResult<ReachOutChainPeopleDto | null>> {
  const { data, error } = await db.rpc("reach_out_chain_people", {
    p_tenant_id: p.tenantId,
    p_root_id: p.rootId,
    ...(p.limit ? { p_limit: p.limit } : {}),
  });
  return answer<ReachOutChainPeopleDto | null>(data, error);
}

/**
 * What feeds a reach-out (00426): a list its owner adds to (a search of via chosen or import), else the finder's
 * search. The run reads it, so every first-email run of a list-fed chain waits for its owner. A read that fails throws:
 * not being able to tell is not "a search".
 */
export async function reachOutFedByOf(db: Db, tenantId: string, searchId: string | null): Promise<ReachOutFedBy> {
  if (!searchId) return "search";
  const { data, error } = await db
    .from("lead_searches")
    .select("via")
    .eq("tenant_id", tenantId)
    .eq("id", searchId)
    .maybeSingle();
  if (error) throw new Error(`cannot read the chain's search: ${error.message}`);
  return isLeadList(data) ? "list" : "search";
}

/** Leads' Back today (00426 leads_back_today): the leads who asked to hear back on a day that has come. */
export async function leadsBackToday(db: Db, tenantId: string): Promise<DoorResult<LeadBackDto[]>> {
  const { data, error } = await db.rpc("leads_back_today", { p_tenant_id: tenantId });
  return answer<LeadBackDto[]>(data, error);
}

/** Leave out: one lead off a list-fed reach-out's list before anything left for it (00426 reach_out_leave_out). */
export async function reachOutLeaveOut(db: Db, p: { rootId: string; leadId: string }): Promise<DoorResult<unknown>> {
  const { data, error } = await db.rpc("reach_out_leave_out", { p_root_id: p.rootId, p_lead_id: p.leadId });
  return answer<unknown>(data, error);
}

/** What a reach-out could start from (00426 reach_out_sources): the searches and lists with none yet, newest first. */
export async function reachOutSources(db: Db, tenantId: string): Promise<DoorResult<ReachOutSourceDto[]>> {
  const { data, error } = await db.rpc("reach_out_sources", { p_tenant_id: tenantId });
  return answer<ReachOutSourceDto[]>(data, error);
}

/**
 * Who is in each reach-out now, by root (00426 reach_out_people_counts: the drawer's one rule), for Campaigns' ledger.
 * Null where they could not be counted: the ledger says a dash, never a zero nobody counted.
 */
export async function reachOutPeopleCounts(
  db: Db,
  tenantId: string,
): Promise<Record<string, ReachOutPeopleCountsDto> | null> {
  try {
    const { data, error } = await db.rpc("reach_out_people_counts", { p_tenant_id: tenantId });
    const r = answer<Record<string, ReachOutPeopleCountsDto> | null>(data, error);
    return r.error ? null : r.data;
  } catch {
    // A read that threw (the network, a client that does not know the door) is the same dash: never the chains' failure.
    return null;
  }
}
