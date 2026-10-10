/**
 * How much a round asks the provider for, and what each run may charge (PRD §0.5 "size from yield", S6, §13.3): the
 * arithmetic the runner (runner/) turns into runs, over contracts' placesToAsk (the places to ask each term for) and
 * estimateRoundUsd (their price, with room).
 *
 *   - probeAsk / mainAsk: the terms and places per term for the probe (LEAD_PROBE_PLACES spread across every term, E10)
 *     and for the main phase (what remains, over the probe's yield, without the term the question dropped).
 *   - yieldOf / probeYield / hasContact: the yield that sizes the main phase: the share of the probe's places that are not
 *     left out and hold a way to reach them (a phone that dials, or a candidate email: decision 0010), never the Qualified
 *     share, and never under 5%; a probe that judged nothing counts as 20%.
 *   - runCaps: one dollar cap per run: the estimate for its places, every cap scaled down when the sum would pass what
 *     the round still has reserved, none under the actor's floor (MAPS_CAP_FLOOR_USD), and only as many runs as the
 *     reserve holds a floor for, in the plan's order: the caps together never pass it, and with less than one floor
 *     left the round starts nothing.
 */
import {
  LEAD_PROBE_PLACES,
  estimateRoundUsd,
  placesToAsk,
  leadPhoneState,
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

/**
 * A place a lead could come from (decision 0010): a phone that dials, or a candidate email the cleaner kept -- either,
 * whichever the search prefers, since either one checked makes the lead count.
 */
export function hasContact(place: { phone: string | null; email: string | null }): boolean {
  return leadPhoneState(place.phone) === "ok" || place.email !== null;
}

/**
 * The probe's yield, the one number that sizes the main round (S6, A1's
 * review): the share of the probe's places that are NOT left out and hold a
 * way to reach them. Never the Qualified share -- a place waiting on its
 * email is not Qualified until the mailbox checks land, and a round sized
 * from zero asks the provider for everything it is allowed to.
 */
export function probeYield(members: { class: LeadMemberClass; phone: string | null; email: string | null }[]): number {
  return yieldOf(members.length, members.filter((m) => m.class !== "excluded" && hasContact(m)).length);
}

/** Dollars as whole cents, read down, so a sum of caps is never a rounding over what it is held to. */
const centsDown = (usd: number) => Math.floor(usd * 100 + 1e-6);

/**
 * One cap per run: the estimate for its places (with the estimate's own
 * room); when the sum would pass what the round still has reserved, every
 * cap is scaled to fit. The actor refuses a cap under $0.50, so none goes
 * under it -- and the caps together never pass what is left: the floor is a
 * floor on each run, so the round starts only as many runs as the reserve
 * holds a floor for, the terms in the plan's order, and a term past them gets
 * nothing (0), which its caller starts no run for. A term asked for no places
 * takes no run's room.
 */
export function runCaps(plan: LeadSearchPlan, perTerm: number[], reservedLeftUsd: number): number[] {
  const wants = perTerm.map((n) => estimateRoundUsd({ ...plan, terms: [plan.terms[0] ?? ""] }, "main", n));
  const left = Math.max(0, reservedLeftUsd);
  // The floor is a floor on a cap, never a licence to spend what the round has
  // not reserved: with less left than one run's floor, every term gets nothing
  // and the round starts nothing (runner startRound); with room for two, a
  // third term waits.
  let room = Math.floor(centsDown(left) / centsDown(MAPS_CAP_FLOOR_USD));
  const runs = perTerm.map((n) => {
    if (n <= 0 || room <= 0) return false;
    room -= 1;
    return true;
  });
  const sum = wants.reduce((a, w, i) => a + (runs[i] ? w : 0), 0);
  const scale = sum > left && sum > 0 ? left / sum : 1;
  const caps = wants.map((w, i) => (runs[i] ? Math.max(MAPS_CAP_FLOOR_USD, Math.round(w * scale * 100) / 100) : 0));
  if (centsDown(caps.reduce((a, c) => a + c, 0)) <= centsDown(left)) return caps;
  // The floors and the rounding took it past the reserve: each run its floor, and what is left over the floors shared
  // by what each wants above its own, read down to the cent.
  const spare = centsDown(left) - caps.filter((c) => c > 0).length * centsDown(MAPS_CAP_FLOOR_USD);
  const above = wants.map((w, i) => (runs[i] ? Math.max(0, w - MAPS_CAP_FLOOR_USD) : 0));
  const share = Math.min(1, spare / 100 / (above.reduce((a, b) => a + b, 0) || 1));
  return above.map((x, i) => (runs[i] ? (centsDown(MAPS_CAP_FLOOR_USD) + Math.floor(x * share * 100)) / 100 : 0));
}
