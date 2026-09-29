/**
 * How a Leads door answers: its refusals, the member's now, and a round's estimate. Moved whole from leads.ts (Reach out Part 2.5), which
 * re-exports it.
 */
import {
  AppError,
  estimateRoundUsd,
  LEAD_ASSUMED_YIELD,
  LEAD_PROBE_PLACES,
  type LeadRoundPurpose,
  type LeadSearchPlan,
  placesToAsk,
} from "@chanlytics/contracts";
import { log } from "@/server/log";

export interface DoorAnswer {
  error?: string;
  /** lead_set_stage: what the lead is now, and whether this act made a person. */
  stage?: string;
  closed_reason?: string | null;
  contact_id?: string | null;
  existed?: boolean;
  converted?: boolean;
  /** lead_bulk: how many leads the act reached. lead_search_remove: how many memberships it blanked. */
  done?: number;
  /** lead_bulk keep/exclude: how many of the named leads were not in Needs review. lead_check_again: how many were not asked. */
  skipped?: number;
  /** lead_check_again: how many addresses are being checked again. */
  scheduled?: number;
  blanked?: number;
  /** lead_search_undo: how many left the search, and how many went back to a month. */
  removed?: number;
  credited?: number;
  /** lead_erase: final, and answered again rather than re-executed. */
  erased?: boolean;
  already?: boolean;
  /** lead_search_rename: the name as the door cleaned it. */
  name?: string;
  /** The door's own sentence for its refusal (00140): said as it is when present. */
  sentence?: string;
  state?: string;
  /** A member door's own word for "not in that state": the class the member is in now (lead_member_move). */
  class?: string;
  left?: number;
  left_usd?: number;
  counted?: number;
  search_id?: string;
  round_id?: string;
  op_id?: string;
  version?: number;
}

/** The jsonb a door answers, as an object; anything else is an empty answer. */
export function answerOf(data: unknown): DoorAnswer {
  return data && typeof data === "object" && !Array.isArray(data) ? (data as DoorAnswer) : {};
}

/** What a member's class is called on the screen, for the sentence a member door's `state` refusal says. */
const MEMBER_NOW: Record<string, string> = {
  qualified: "already counted",
  review: "in Needs review",
  excluded: "left out",
};

/** A door's refusal, in a sentence the owner can act on; null when the door did not refuse. */
export function refusalOf(a: DoorAnswer): AppError | null {
  if (a.error && a.sentence) return new AppError("conflict", a.sentence, 409);
  switch (a.error) {
    case undefined:
      return null;
    case "state":
      // Two doors say `state`. A round says which state it is in; a member
      // door says which class the place is in now (lead_member_move), and
      // "this search is not waiting for an answer" is not what happened to it.
      return typeof a.class === "string"
        ? new AppError("conflict", `This place is ${MEMBER_NOW[a.class] ?? a.class} now. Reload and try again.`, 409)
        : new AppError("conflict", "This search is not waiting for an answer.", 409);
    case "no_card":
      return new AppError("conflict", a.sentence ?? "I can find local businesses for now.", 409);
    case "paused":
      return new AppError("conflict", "Searching is paused for now. Nothing was started.", 409);
    case "month_leads_used":
      return new AppError(
        "conflict",
        a.left && a.left > 0
          ? `This month covers ${a.left} more leads. Ask for ${a.left} or fewer, or wait for next month.`
          : "This month's leads are used up. Nothing more counts until next month.",
        409,
      );
    case "budget_used":
      return new AppError(
        "conflict",
        "This month's searching budget is used. A smaller search, or a phone standard, may still fit.",
        409,
      );
    case "day_cap":
      return new AppError("conflict", "Today's searching is at its cap. Try again tomorrow.", 409);
    case "hidden":
      return new AppError("conflict", "This place is hidden: it is already a customer, or was erased.", 409);
    case "out_of_area":
      return new AppError("conflict", "This place is outside the area the search covers.", 409);
    case "changed":
      return new AppError("conflict", "Someone changed this since you saw it. Reload and try again.", 409);
    case "not_found":
      return new AppError("not_found", "That place is not in this search.", 404);
    case "removed":
      return new AppError("conflict", "This search was removed, so nothing more counts against it.", 409);
    case "live":
      return new AppError("conflict", "This search is still running. Let it finish, then ask for more.", 409);
    case "running":
      // The Done strip's Undo, asked of a round that has not finished: a
      // different act from "ask for more", so a sentence of its own.
      return new AppError("conflict", "This search is still running, so there is nothing to take back yet.", 409);
    case "too_late":
      return new AppError("conflict", "That was more than a day ago, so these leads stay yours and stay counted.", 409);
    case "nothing_to_add":
      return new AppError(
        "conflict",
        a.counted
          ? `This search already found the ${a.counted} you asked for. Ask for more than that to add any.`
          : "This search already found what you asked for.",
        409,
      );
    case "undone":
      return new AppError("conflict", "That change was already undone.", 409);
    case "kind":
      return new AppError("conflict", "That change cannot be undone.", 409);
    default:
      // A door said something this build has no sentence for. The owner gets
      // one plain sentence rather than a de-underscored word out of the
      // database; the code goes to the log, where it can be looked up.
      log.warn("lead_door_refusal_unknown", { error: String(a.error).slice(0, 80) });
      return new AppError(
        "conflict",
        "Something about this search stopped that from going through. Reload and try again.",
        409,
      );
  }
}

/** The yield assumed before a probe has measured one: half the places qualify (contracts' LEAD_ASSUMED_YIELD, which the plan card's minutes read too). */
const ASSUMED_YIELD = LEAD_ASSUMED_YIELD;

/**
 * What a round is expected to cost, from the card's brief prices: the probe and
 * its main phase for a first round, the main phase alone after. A top-up runs
 * to the count minus what already counted (00140's lead_search_more sets that
 * as its target), so that is what it is priced for -- pricing the whole count
 * reserves money the round will never be allowed to spend.
 */
export function estimateForRound(plan: LeadSearchPlan, purpose: LeadRoundPurpose, counted = 0): number {
  const wanted = purpose === "topup" ? Math.max(1, plan.count - counted) : plan.count;
  const main = estimateRoundUsd(plan, "main", placesToAsk(plan, wanted, ASSUMED_YIELD).total);
  if (purpose !== "probe") return Math.round(main * 100) / 100;
  return Math.round((estimateRoundUsd(plan, "probe", LEAD_PROBE_PLACES) + main) * 100) / 100;
}
