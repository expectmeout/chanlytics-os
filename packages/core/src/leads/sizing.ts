/**
 * How much a round asks the provider for, and what each run may charge (PRD
 * §0.5 "size from yield", S6, §13.3). contracts' placesToAsk sizes the ask
 * and estimateRoundUsd prices it with room; this turns them into one cap per
 * run: the term's estimate, scaled down when the sum would pass what the
 * round still has reserved, never under the actor's floor.
 */
import {
  LEAD_PROBE_PLACES,
  estimateRoundUsd,
  placesToAsk,
  type LeadContactStandard,
  type LeadMemberClass,
  type LeadSearchPlan,
} from "@chanlytics/contracts";
import { MAPS_CAP_FLOOR_USD } from "./cards";

/** The probe: LEAD_PROBE_PLACES spread across every term (E10). */
export function probeAsk(plan: LeadSearchPlan): { terms: string[]; perTerm: number[] } {
  return { terms: plan.terms, perTerm: placesToAsk(plan, LEAD_PROBE_PLACES, null).perTerm };
}

/** The main phase: the remainder over the probe's yield, without the term the question dropped. */
export function mainAsk(
  plan: LeadSearchPlan,
  remaining: number,
  yieldSoFar: number,
  dropTerm: string | null,
): { terms: string[]; perTerm: number[] } {
  const terms = plan.terms.filter((t) => t !== dropTerm);
  const kept = terms.length ? terms : plan.terms;
  const sized = placesToAsk({ ...plan, terms: kept }, Math.max(1, remaining), yieldSoFar);
  return { terms: kept, perTerm: sized.perTerm };
}

/** A share of what was judged, floored so one bad probe never asks for everything. */
export function yieldOf(judged: number, usable: number): number {
  if (judged <= 0) return 0.2;
  return Math.max(0.05, usable / judged);
}

/** What the contact standard needs on a place: a phone, or a candidate email the cleaner kept. */
export function hasContact(
  contact: LeadContactStandard,
  place: { phone: string | null; email: string | null },
): boolean {
  return contact === "phone" ? place.phone !== null : place.email !== null;
}

/**
 * The probe's yield, the one number that sizes the main round (S6, A1's
 * review): the share of the probe's places that are NOT left out and hold
 * what the contact standard needs. Never the Qualified share -- under an
 * email standard that is zero until the mailbox checks land, and a round
 * sized from zero asks the provider for everything it is allowed to.
 */
export function probeYield(
  contact: LeadContactStandard,
  members: { class: LeadMemberClass; phone: string | null; email: string | null }[],
): number {
  return yieldOf(members.length, members.filter((m) => m.class !== "excluded" && hasContact(contact, m)).length);
}

/**
 * One cap per run: the estimate for its places (with the estimate's own
 * room); when the sum would pass what the round still has reserved, every
 * cap is scaled to fit. The actor refuses a cap under $0.50, so none goes
 * under it.
 */
export function runCaps(plan: LeadSearchPlan, perTerm: number[], reservedLeftUsd: number): number[] {
  const wants = perTerm.map((n) => estimateRoundUsd({ ...plan, terms: [plan.terms[0] ?? ""] }, "main", n));
  const sum = wants.reduce((a, b) => a + b, 0);
  const left = Math.max(0, reservedLeftUsd);
  // The floor is a floor on a cap, never a licence to spend what the round has
  // not reserved: with less left than one run's floor, every term gets nothing
  // and the round starts nothing (runner startRound).
  if (left < MAPS_CAP_FLOOR_USD) return wants.map(() => 0);
  const scale = sum > left && sum > 0 ? left / sum : 1;
  return wants.map((w) => Math.max(MAPS_CAP_FLOOR_USD, Math.round(w * scale * 100) / 100));
}
