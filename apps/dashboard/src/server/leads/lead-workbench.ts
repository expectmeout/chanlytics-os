/**
 * The lead workbench's doors (00423), on the member's own session: leads added to a reach-out fed by a list (dry, what
 * each would do; else what joined, with its undo), Later in a pass of the pile, and who is in a reach-out (its drawer's
 * People), and what a reach-out could start from. The rules are SQL's (reach_out_add, lead_member_later,
 * reach_out_chain_people and reach_out_sources, over reach_out_why_not and reach_out_root_lines); these say their
 * refusals in contracts' words, and a door's own SQLSTATE at its status (dbRefusal). Ask's tools call the same
 * functions, so what it adds is what the card adds.
 */
import {
  AppError,
  REACH_OUT_ADD_WORDS,
  type LeadBackDto,
  type ReachOutAddDto,
  type ReachOutChainPeopleDto,
  type ReachOutSourceDto,
} from "@chanlytics/contracts";
import {
  leadMemberLater,
  leadsBackToday,
  reachOutAdd,
  reachOutChainPeople,
  reachOutLeaveOut,
  reachOutSources,
} from "@chanlytics/db";
import { answerOf, refusalOf } from "./lead-answers";
import { dbRefusal, type RouteContext } from "../with-route";

type Ctx = Pick<RouteContext, "supabase">;

/** Leads added to a list-fed reach-out by its first step's id; dry answers what each would do and writes nothing. */
export async function addToReachOut(
  ctx: Ctx,
  rootId: string,
  input: { lead_ids: string[] },
  dry: boolean,
): Promise<ReachOutAddDto> {
  const { data, error } = await reachOutAdd(ctx.supabase, { rootId, leadIds: input.lead_ids, dry });
  if (error) throw dbRefusal(error);
  if ("error" in data)
    throw new AppError(
      "conflict",
      data.error === "list_gone" ? REACH_OUT_ADD_WORDS.listGone : REACH_OUT_ADD_WORDS.fedBySearch,
      409,
    );
  return data;
}

/** Later: a lead of a search put off in this pass, with its undo's id and version. */
export async function laterLead(
  ctx: Ctx,
  leadId: string,
  searchId: string,
): Promise<{ lead_id: string; op_id: string; version: number }> {
  const { data, error } = await leadMemberLater(ctx.supabase, { searchId, leadId });
  if (error) throw dbRefusal(error);
  const a = answerOf(data);
  const refused = refusalOf(a);
  if (refused) throw refused;
  return { lead_id: leadId, op_id: String(a.op_id), version: Number(a.version) };
}

/** Who is in a reach-out: waiting, writing and done, each at most `limit` lines, with their counts. */
export async function chainPeopleOf(
  ctx: Ctx,
  tenantId: string,
  rootId: string,
  limit?: number,
): Promise<ReachOutChainPeopleDto> {
  const { data, error } = await reachOutChainPeople(ctx.supabase, { tenantId, rootId, ...(limit ? { limit } : {}) });
  if (error) throw dbRefusal(error);
  if (!data) throw new AppError("not_found", "That reach-out is not in your workspace.", 404);
  return data;
}

/** What a reach-out could start from (00423): New message's Write to leads lists them. */
export async function reachOutSourcesOf(ctx: Ctx, tenantId: string): Promise<{ sources: ReachOutSourceDto[] }> {
  const { data, error } = await reachOutSources(ctx.supabase, tenantId);
  if (error) throw dbRefusal(error);
  return { sources: data };
}

/**
 * Leave out: one lead off a list-fed reach-out's list before anything left for it (00423), with its undo. One on its way
 * or sent stays, said in the add's own words (Stop writing is the correction there).
 */
export async function leaveOut(
  ctx: Ctx,
  rootId: string,
  leadId: string,
): Promise<{ lead_id: string; op_id: string; version: number; skipped: number }> {
  const { data, error } = await reachOutLeaveOut(ctx.supabase, { rootId, leadId });
  if (error) throw dbRefusal(error);
  const a = answerOf(data);
  const W = REACH_OUT_ADD_WORDS;
  const own = { list_gone: W.listGone, fed_by_search: W.fedBySearch, not_on_it: W.notOnIt } as const;
  if (a.error && a.error in own) throw new AppError("conflict", own[a.error as keyof typeof own], 409);
  const refused = refusalOf(a);
  if (refused) throw refused;
  return { lead_id: leadId, op_id: String(a.op_id), version: Number(a.version), skipped: Number(a.skipped ?? 0) };
}

/** Leads' Back today (00423): who asked to hear back on a day that has come, to write to by hand (decision 9). */
export async function backTodayOf(ctx: Ctx, tenantId: string): Promise<{ leads: LeadBackDto[] }> {
  const { data, error } = await leadsBackToday(ctx.supabase, tenantId);
  if (error) throw dbRefusal(error);
  return { leads: data };
}
