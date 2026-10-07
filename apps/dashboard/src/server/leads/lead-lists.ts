/**
 * A list of your own (Reach out, Part 7; 00242): a file's rows, or leads chosen on Leads, as a search a reach-out writes
 * to, and the one refusal a list gives a door that would search it again (J9).
 *
 * The doors read every row again and decide what joins; these hand them the body the route checked and say their
 * refusals in the owner's words (lead-answers.ts's rule: a door's own sentence, as it is).
 */
import {
  AppError,
  isLeadList,
  LEAD_IMPORT_WORDS,
  leadImportEstimateUsd,
  type LeadChooseAnswer,
  type LeadChooseInput,
  type LeadImportAnswer,
  type LeadImportInput,
} from "@chanlytics/contracts";
import { answerOf, refusalOf } from "./lead-answers";
import type { RouteContext } from "../with-route";

type Ctx = Pick<RouteContext, "supabase">;

/** The door's answer, once it did not refuse. */
function taken<T>(fn: string, data: unknown, error: { message: string } | null): T {
  if (error) throw new Error(`${fn}: ${error.message}`);
  const refused = refusalOf(answerOf(data));
  if (refused) throw refused;
  return data as T;
}

/** A file's rows as a search, every address checked first (J2-J6). */
export async function importLeads(ctx: Ctx, tenantId: string, input: LeadImportInput): Promise<LeadImportAnswer> {
  const { data, error } = await ctx.supabase.rpc("lead_search_import", {
    p_tenant_id: tenantId,
    p_name: input.name,
    p_asked: input.asked ?? "",
    p_rows: input.rows,
    // What checking every row may cost, reserved as a round's estimate is; what is not spent goes back (J3).
    p_estimate_usd: leadImportEstimateUsd(input.rows.length),
  });
  return taken<LeadImportAnswer>("lead_search_import", data, error);
}

/** Leads already counted, chosen on Leads, as a search a reach-out writes to (J7). */
export async function chooseLeads(ctx: Ctx, tenantId: string, input: LeadChooseInput): Promise<LeadChooseAnswer> {
  const { data, error } = await ctx.supabase.rpc("lead_search_choose", {
    p_tenant_id: tenantId,
    p_name: input.name,
    p_lead_ids: input.lead_ids,
  });
  return taken<LeadChooseAnswer>("lead_search_choose", data, error);
}

/** A list of your own is never searched again (J9): refused in words before a door that would. */
export function refuseList(search: { via: string }): void {
  if (isLeadList(search)) throw new AppError("conflict", LEAD_IMPORT_WORDS.searchAgain, 409);
}
