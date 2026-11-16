/**
 * How much a round asks the provider for, and what each run may charge (PRD §0.5 "size from yield", S6, §13.3): the
 * arithmetic the runner (runner/) turns into runs, over contracts' placesToAsk (the places to ask each term for) and
 * estimateRoundUsd (their price, with room).
 *
 *   - probeAsk / mainAsk: the terms and places per term for the probe (LEAD_PROBE_PLACES spread across the terms the
 *     reserve holds a run for, E10) and for the main phase: one term at a time, for what remains over the yield,
 *     without the term the question dropped or a synonym that mostly returned places already held; a failed term due
 *     again first, then one not yet asked, then one asked before, past what it read.
 *   - yieldOf / probeYield / hasContact: the yield that sizes the main phase: the share of the probe's places that are not
 *     left out and hold a way to reach them that the search's standard counts (a candidate email for a search made for
 *     email, decision 0132; that or a phone that dials for one made for calls, decision 0010), never the Qualified share,
 *     and never under 5%; a probe that judged nothing counts as 20%.
 *   - runCaps: one dollar cap per run: the estimate for its places, every cap scaled down when the sum would pass what
 *     the round still has reserved, none under the actor's floor (MAPS_CAP_FLOOR_USD), and only as many runs as the
 *     reserve holds a floor for, in the plan's order: the caps together never pass it, and with less than one floor
 *     left the round starts nothing.
 */
import {
  LEAD_PROBE_PLACES,
  estimateRoundUsd,
  placesPastRead,
  placesToAsk,
  leadPhoneState,
  type LeadContactStandard,
  type LeadMemberClass,
  type LeadSearchPlan,
} from "@chanlytics/contracts";
import { MAPS_CAP_FLOOR_USD } from "./cards";

/**
 * What a start asks: the terms it can start runs for, the places each, the terms the reserve holds no run for, and (the
 * main phase's) the terms whose turn comes once the one before them has read its area.
 */
export interface TermsAsk {
  terms: string[];
  perTerm: number[];
  waiting: string[];
  later?: string[];
}

/**
 * What a search asked of its terms before this start: the places each has read, and the terms this phase has begun. And,
 * of this phase: whether a run is still out, the failed terms due another try, and the synonyms that mostly returned
 * places the workspace already held (runner/main-ask.ts staleTermsOf).
 */
export interface TermsTried {
  read: ReadonlyMap<string, number>;
  begun: ReadonlySet<string>;
  running?: boolean;
  again?: ReadonlySet<string>;
  stale?: ReadonlySet<string>;
}

/** The probe: LEAD_PROBE_PLACES spread across the terms the reserve holds a run for (E10), the rest waiting. */
export function probeAsk(plan: LeadSearchPlan, room: number): TermsAsk {
  const terms = plan.terms.slice(0, room);
  const perTerm = terms.length ? placesToAsk({ ...plan, terms }, LEAD_PROBE_PLACES, null).perTerm : [];
  return { terms, perTerm, waiting: plan.terms.slice(room) };
}

/**
 * The terms a main phase asks at all: the plan's, without the one the question dropped and without a synonym that mostly
 * returned places the workspace already held. The widest of them is always asked: a search with nothing else to ask
 * still asks it.
 */
export function termsToAsk(
  plan: Pick<LeadSearchPlan, "terms">,
  dropTerm: string | null,
  stale: ReadonlySet<string> | undefined,
): string[] {
  const left = plan.terms.filter((t) => t !== dropTerm);
  const kept = left.length ? left : plan.terms;
  return kept.filter((t, i) => i === 0 || !stale?.has(t));
}

/**
 * The main phase, one term at a time (decision 0133): the source charges for every place it returns, and a search's
 * terms are synonyms that mostly return the same places, so a term is asked alone, for all the phase still wants (the
 * remainder over the yield), and never beside a run still out. `remaining` is its caller's: for a term after the first,
 * the count less what the places already held may yet deliver, so none is asked where that is nothing. Whose turn: a
 * failed term due another try, then a term not yet asked, then one asked before, past what it read (placesPastRead);
 * never the term the question dropped, a term this phase began, or a synonym that mostly returned places the workspace
 * already held (the widest term is always asked). A term is asked for at least `page` places: a leg's (decision 0133),
 * so a leg reads its area for what the source answers first there, never for the few a count nearly met still wants.
 * `terms` is that one term where the reserve holds a run for it; `later`
 * is the terms still to come that it also holds a run for, which the end of a run starts once those before them came
 * back short (runner/round-decision.ts); `waiting` is the terms it holds none for.
 */
export function mainAsk(
  plan: LeadSearchPlan,
  remaining: number,
  yieldSoFar: number,
  dropTerm: string | null,
  room: number,
  tried: TermsTried,
  page = 0,
): TermsAsk {
  const fresh = termsToAsk(plan, dropTerm, tried.stale);
  const open = fresh.filter((t) => !tried.begun.has(t));
  const again = (t: string) => tried.again?.has(t) ?? false;
  const order = [
    ...open.filter(again),
    ...open.filter((t) => !again(t) && !tried.read.has(t)),
    ...open.filter((t) => !again(t) && tried.read.has(t)),
  ];
  // The phase's first term is asked for one place at least, as a main phase always was; a later one for nothing where
  // nothing more is wanted.
  const wanted =
    remaining > 0 || !tried.begun.size
      ? Math.max(page, placesToAsk({ ...plan, terms: fresh }, Math.max(1, remaining), yieldSoFar).total)
      : 0;
  const asks = order.map((t) => placesPastRead(plan, tried.read.get(t) ?? 0, wanted));
  const at = tried.running ? -1 : asks.findIndex((n) => n > 0);
  const next = order[at];
  if (next === undefined) return { terms: [], perTerm: [], waiting: [], later: order };
  // Of the terms still to come, those the reserve holds a run for after this one wait their turn; the rest it has no
  // room for, as a term past the reserve never did.
  const rest = order.filter((t) => t !== next);
  if (room <= 0) return { terms: [], perTerm: [], waiting: [next, ...rest], later: [] };
  return { terms: [next], perTerm: [asks[at] ?? 0], waiting: rest.slice(room - 1), later: rest.slice(0, room - 1) };
}

/** The even yield a later round sizes from when its search has judged nothing yet. */
export const UNMEASURED_YIELD = 0.5;

/** A share of what was judged, floored so one bad probe never asks for everything. */
export function yieldOf(judged: number, usable: number): number {
  if (judged <= 0) return 0.2;
  return Math.max(0.05, usable / judged);
}

/**
 * A place a lead could come from under the search's standard, as contracts' classify counts one once its email is
 * checked. A search made for email counts a lead only with an email that checked out (decision 0132), so only a candidate
 * email the cleaner kept is a way to it: nearly every place has a phone, and a probe that counted them sized an email
 * search's main phase at about half the places its count needed. A search made for calls counts either (decision 0010):
 * a phone that dials, or a candidate email.
 */
export function hasContact(
  place: { phone: string | null; email: string | null },
  contact: LeadContactStandard,
): boolean {
  if (contact === "email") return place.email !== null;
  return leadPhoneState(place.phone) === "ok" || place.email !== null;
}

/**
 * The probe's yield, the one number that sizes the main round (S6, A1's
 * review): the share of the probe's places that are NOT left out and hold a
 * way to reach them. Never the Qualified share -- a place waiting on its
 * email is not Qualified until the mailbox checks land, and a round sized
 * from zero asks the provider for everything it is allowed to.
 */
export function probeYield(
  members: { class: LeadMemberClass; phone: string | null; email: string | null }[],
  contact: LeadContactStandard,
): number {
  return yieldOf(members.length, members.filter((m) => m.class !== "excluded" && hasContact(m, contact)).length);
}

/**
 * What a search's earlier rounds delivered for each place they judged: the share that counted, every one of them ended
 * and its emails checked. A leg (decision 0133) sizes from it, never from a candidate email that may not check out.
 */
export function finishedYield(members: { counted: boolean }[]): number {
  return yieldOf(members.length, members.filter((m) => m.counted).length);
}

/** Dollars as whole cents, read down, so a sum of caps is never a rounding over what it is held to. */
const centsDown = (usd: number) => Math.floor(usd * 100 + 1e-6);

/** How many runs what is left of a reserve holds the actor's floor for. */
export function runsRoom(reservedLeftUsd: number): number {
  return Math.floor(centsDown(Math.max(0, reservedLeftUsd)) / centsDown(MAPS_CAP_FLOOR_USD));
}

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
  let room = runsRoom(left);
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
