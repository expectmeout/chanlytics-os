/**
 * Work on a lead: its stage, one or many at once, a check again, an erase. Moved whole from leads.ts (Reach out Part 2.5), which
 * re-exports it.
 */
import {
  AppError,
  type LeadsBulkInput,
  type LeadsCheckAgainInput,
  type LeadStageInput,
  stageArgs,
} from "@chanlytics/contracts";
import type { Json } from "@chanlytics/db";
import { answerOf, type DoorAnswer, refusalOf } from "./lead-answers";
import type { DoorArgs } from "./lead-helpers";
import type { LeadRow } from "./lead-searches";
import { recordDecision } from "./verbs";
import type { RouteContext } from "./with-route";

/* ------------------------------------------------------- one lead, worked */

/** What the owner reads after an act on one lead. The door decides what happened; this says it. */
function stageToast(input: LeadStageInput, a: DoorAnswer, name: string): string {
  if (a.converted) return `${name} is in People now, with this call on their page.`;
  switch (input.kind) {
    case "outcome":
      return input.outcome === "wrong_number"
        ? "That number is marked wrong."
        : input.outcome === "not_interested"
          ? "Marked as said no."
          : "Marked contacted.";
    case "stage":
      // A click to Talking marks Talking and nothing else: they join People on
      // a real conversation, never on a click (§9.6).
      return input.stage === "converted"
        ? "Marked talking. They join People when they write or call in, or when a call goes well."
        : input.stage === "nurture"
          ? "Marked contacted."
          : "Back in Ready.";
    case "emailed":
      return "Marked contacted.";
    case "said_no":
      return "Marked as said no.";
    case "not_a_fit":
      return input.why === "customer" ? "Hidden from every future search." : "Not a fit.";
  }
}

export interface StageAnswer {
  stage: string;
  closed_reason: string | null;
  contact_id: string | null;
  existed: boolean;
  converted: boolean;
  op_id: string | null;
  version: number;
  toast: string;
  /** Null when this act made a person: a person made is not undone from a toast (§9.6). */
  undo: { op_id: string; version: number } | null;
}

/** The one door for a stage, a call's outcome, "Did you send it?" and Not a fit. */
export async function setStage(
  ctx: Pick<RouteContext, "supabase">,
  lead: LeadRow,
  input: LeadStageInput,
): Promise<StageAnswer> {
  const { data, error } = await ctx.supabase.rpc("lead_set_stage", {
    p_lead_id: lead.id,
    ...stageArgs(input),
  } as DoorArgs<"lead_set_stage">);
  if (error) throw new Error(`lead_set_stage: ${error.message}`);
  const a = answerOf(data);
  const refused = refusalOf(a);
  if (refused) throw refused;
  const converted = a.converted === true;
  return {
    stage: a.stage ?? lead.stage,
    closed_reason: a.closed_reason ?? null,
    contact_id: a.contact_id ?? null,
    existed: a.existed === true,
    converted,
    op_id: a.op_id ?? null,
    version: a.version ?? 0,
    toast: stageToast(input, a, lead.business_name),
    undo: converted || !a.op_id ? null : { op_id: a.op_id, version: a.version ?? 0 },
  };
}

/** The selected ids, or every lead the view matches ("Select all 1,240 that match"): the door gets one or the other. */
export async function bulkStage(
  ctx: Pick<RouteContext, "supabase">,
  tenantId: string,
  input: LeadsBulkInput,
): Promise<{ done: number; op_id: string | null; version: number; toast: string }> {
  const { data, error } = await ctx.supabase.rpc("lead_bulk", {
    p_tenant_id: tenantId,
    p_action: input.action,
    ...(input.by === "ids"
      ? { p_ids: input.ids, ...(input.search_id ? { p_search_id: input.search_id } : {}) }
      : { p_ids: null, p_view: input.view as unknown as Json }),
  } as DoorArgs<"lead_bulk">);
  if (error) throw new Error(`lead_bulk: ${error.message}`);
  const a = answerOf(data);
  // Keep over a selection stops when the month's leads run out: what was kept before that stays kept, and the
  // sentence rides the toast instead of refusing an act that half happened. With nothing done it is a refusal.
  const ranOut = a.error === "month_leads_used" && (a.done ?? 0) > 0 ? (a.sentence ?? null) : null;
  const refused = ranOut ? null : refusalOf(a);
  if (refused) throw refused;
  return {
    done: a.done ?? 0,
    op_id: a.op_id ?? null,
    version: a.version ?? 1,
    toast: bulkToast(input.action, a.done ?? 0, a.skipped ?? 0, ranOut),
  };
}

/** What a bulk act says when it is done: the count for the acts that take one, and what stopped or skipped part of it. */
function bulkToast(action: LeadsBulkInput["action"], done: number, skipped: number, ranOut: string | null): string {
  const tail = ranOut
    ? ` ${ranOut}`
    : skipped > 0
      ? ` ${skipped} ${skipped === 1 ? "was" : "were"} not in Needs review.`
      : "";
  switch (action) {
    case "contacted":
      return "Marked contacted.";
    case "not_a_fit":
      return "Not a fit.";
    case "keep":
      return `Kept ${done}. ${done === 1 ? "It counts as a lead" : "They count as leads"} this month.${tail}`;
    case "exclude":
      return `Excluded ${done}. Nothing counted.${tail}`;
  }
}

/**
 * Check again (D3, 00145): the owner asks the mailbox check once more for addresses whose last check did not answer.
 * The door schedules the engine's own check job under each lead's round and says how many it took; none taken is a
 * refusal that says what the act is for, not a success that did nothing.
 */
export async function checkAgain(
  ctx: Pick<RouteContext, "supabase">,
  tenantId: string,
  input: LeadsCheckAgainInput,
): Promise<{ scheduled: number; skipped: number; toast: string }> {
  const { data, error } = await ctx.supabase.rpc("lead_check_again", {
    p_tenant_id: tenantId,
    p_lead_ids: input.ids,
  } as DoorArgs<"lead_check_again">);
  if (error) throw new Error(`lead_check_again: ${error.message}`);
  const a = answerOf(data);
  const refused = refusalOf(a);
  if (refused) throw refused;
  const scheduled = a.scheduled ?? 0;
  const skipped = a.skipped ?? 0;
  if (scheduled === 0)
    throw new AppError(
      "conflict",
      "None of these can be checked again. An address is asked again only after its last check did not answer, once its search has finished.",
      409,
    );
  const tail =
    skipped > 0
      ? ` ${skipped} ${skipped === 1 ? "was" : "were"} left as ${skipped === 1 ? "it is" : "they are"}: an address is asked again only after its last check did not answer.`
      : "";
  return {
    scheduled,
    skipped,
    toast: `Checking ${scheduled} again. ${scheduled === 1 ? "Its" : "Their"} answer lands here in a few minutes.${tail}`,
  };
}

/** Erase one lead, for good (§0.4): the door writes the tombstones and blanks it; the ledger row survives what it destroyed. */
export async function eraseLead(
  ctx: Pick<RouteContext, "supabase" | "userId" | "via" | "undoOf">,
  lead: LeadRow,
): Promise<{ erased: true; already: boolean }> {
  const { data, error } = await ctx.supabase.rpc("lead_erase", { p_lead_id: lead.id });
  if (error) throw new Error(`lead_erase: ${error.message}`);
  const a = answerOf(data);
  const refused = refusalOf(a);
  if (refused) throw refused;
  const already = a.already === true;
  if (!already) await recordDecision(ctx, lead.tenant_id, "lead", lead.id, "erase", {});
  return { erased: true, already };
}
