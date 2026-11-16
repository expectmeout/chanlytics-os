/**
 * What a round's main phase asks next (decision 0133): one term at a time, the widest first. The source charges for every
 * place it returns, one the search already holds too, and a search's terms are synonyms that mostly return the same
 * places: on 15 Nov 2026 three terms asked side by side for 341 places each returned 1,025, of which 472 were different.
 * So a term is asked alone and for all the phase still wants, and the next is asked only once every term before it came
 * back short, its area read (round-decision.ts); and a synonym whose runs mostly returned places the workspace already
 * held is not asked again by a later round (staleTermsOf).
 *
 * The start (start.ts) and the end of a run (round-decision.ts) both read it, over the same runs and members, so the
 * run's end starts a next term only where the start will find one to make.
 */

import { LEAD_CARDS } from "@chanlytics/contracts";
import { FINAL_RUN_STATES, failedRun } from "../endings";
import { runIdFor } from "../ids";
import { areaKey } from "../ladder";
import type { LeadMemberRow, LeadPorts, LeadRoundRow, LeadRunRow } from "../ports";
import { UNMEASURED_YIELD, finishedYield, mainAsk, probeYield, type TermsAsk, type TermsTried } from "../sizing";
import { targetOf } from "./rules";
import { mayYetCount, wasWeighed } from "./weighed";

/** A synonym is judged on what its runs returned once they returned this many places: fewer can be chance. */
const STALE_MIN_PLACES = 40;
/** Of what a synonym's runs returned, the share the workspace already held at which it is not asked again. */
const STALE_SHARE = 0.75;

/**
 * The terms whose runs mostly returned places the workspace already held: of at least STALE_MIN_PLACES places, three in
 * four. Each of those was paid for and skipped (the run's `already_yours`, 00506), so asking the term again in the next
 * area buys little that the terms before it do not. A failed run's places count: they were paid for too.
 */
function staleTermsOf(runs: readonly LeadRunRow[]): Set<string> {
  const seen = new Map<string, { places: number; held: number }>();
  for (const r of runs) {
    if (r.purpose !== "discover" || r.term === null) continue;
    const sum = seen.get(r.term) ?? { places: 0, held: 0 };
    seen.set(r.term, { places: sum.places + r.items_seen, held: sum.held + (r.already_yours ?? 0) });
  }
  const stale = new Set<string>();
  for (const [term, sum] of seen)
    if (sum.places >= STALE_MIN_PLACES && sum.held >= sum.places * STALE_SHARE) stale.add(term);
  return stale;
}

/**
 * The yield a top-up or a renewal sizes from (PRD §0.5, "later rounds use the running yield"): the search's own, over
 * every place its rounds judged, and an even one only when it judged none. A search whose places qualified at a tenth
 * used to ask the provider for a fifth of what it needed, and ended "few new matches" (3 Nov 2026).
 */
function runningYield(round: LeadRoundRow, searched: LeadMemberRow[]): number {
  const judged = searched.filter(wasWeighed);
  if (!judged.length) return UNMEASURED_YIELD;
  // A leg (decision 0133) sizes from what counted, every earlier round ended and checked: a candidate email is no lead
  // until its check, so the share with a way to reach them asked a leg for too few places.
  return round.purpose === "widen" ? finishedYield(judged) : probeYield(judged, round.plan.contact);
}

/** A round of the search as its other rounds are read: its area and how it ended. */
type SearchRound = Awaited<ReturnType<LeadPorts["db"]["roundsOfSearch"]>>[number];

/** The search's other rounds, each with its runs, and every member the search holds. */
interface Searched {
  others: { round: SearchRound; runs: LeadRunRow[] }[];
  members: LeadMemberRow[];
}

async function searchedOf(leadPorts: LeadPorts, round: LeadRoundRow): Promise<Searched> {
  const rounds = (await leadPorts.db.roundsOfSearch(round.search_id)).filter((r) => r.id !== round.id);
  const others: Searched["others"] = [];
  for (const other of rounds) others.push({ round: other, runs: await leadPorts.db.runsOfRound(other.id) });
  return { others, members: await leadPorts.db.membersOfSearch(round.search_id) };
}

/**
 * What the search's other rounds of this round's own area read of each term (decision 0133): the most a term's runs read
 * there, or what those rounds kept of it where that is more (a run's own count is the provider's; what was kept is the
 * floor of it). A term read in another area says nothing of this one, and an area a round read to its end (searched
 * everything) has nothing new for any term: placesPastRead asks past what was read.
 */
function readInArea(round: LeadRoundRow, searched: Searched): Map<string, number> {
  const here = areaKey(round.plan.area);
  const sameArea = searched.others.filter((o) => areaKey(o.round.plan.area) === here);
  const read = new Map<string, number>();
  if (sameArea.some((o) => o.round.ending === "searched_everything"))
    for (const t of round.plan.terms) read.set(t, Number.POSITIVE_INFINITY);
  const ids = new Set(sameArea.map((o) => o.round.id));
  for (const m of searched.members)
    if (m.term !== null && ids.has(m.round_id ?? "")) read.set(m.term, (read.get(m.term) ?? 0) + 1);
  for (const other of sameArea)
    for (const r of other.runs)
      if (r.purpose === "discover" && r.term !== null) read.set(r.term, Math.max(read.get(r.term) ?? 0, r.items_seen));
  return read;
}

/**
 * What a search has asked of its terms, for a start of its main phase: the provider answers a term from the top, so
 * what it read is what a new ask must go past. This round's probe says exactly; so do the runs of the search's other
 * rounds of this same area, and only those: a term read in another area says nothing of this one (decision 0133: a
 * fresh ZIP was asked for nothing past the 120 a term had read in the city), and an area a round read to its end
 * (searched everything) has nothing new for any term. A main run of this round is one this phase began, unless it
 * failed: a term whose main runs all failed is asked again, past the most any of its runs read, under its next try
 * (retries.ts), and before any term not yet asked.
 */
async function termsTried(
  round: LeadRoundRow,
  runs: readonly LeadRunRow[],
  searched: Searched,
): Promise<TermsTried & { tries: Map<string, number> }> {
  const read = new Map<string, number>();
  const begun = new Set<string>();
  const tries = new Map<string, number>();
  let running = false;
  for (const r of runs) {
    if (r.purpose !== "discover" || r.term === null) continue;
    const probe = (await runIdFor(round.id, "probe", r.term)) === r.id;
    if (probe || failedRun(r)) read.set(r.term, Math.max(read.get(r.term) ?? 0, r.items_seen));
    if (probe) continue;
    if (failedRun(r)) tries.set(r.term, (tries.get(r.term) ?? 0) + 1);
    else begun.add(r.term);
    if (!FINAL_RUN_STATES.has(r.state)) running = true;
  }
  for (const [term, n] of readInArea(round, searched)) read.set(term, Math.max(read.get(term) ?? 0, n));
  const again = new Set([...tries.keys()].filter((t) => !begun.has(t)));
  const stale = staleTermsOf([...runs, ...searched.others.flatMap((o) => o.runs)]);
  return { read, begun, tries, running, again, stale };
}

/**
 * The fewest places a leg asks of a term (decision 0133): the card's page, what one search of a ZIP returns. The source
 * answers a term near a place from its top, and the top of an area next to ones the search read is mostly what it
 * already holds: a leg asked for the few its count still wanted read only those, found none of its own, and ended the
 * search one short, saying every area within reach was searched (15 Nov 2026: 16, 8 and 4 places asked, 2, 1 and 0
 * found, 99 of 100). Nothing for any other round, which sizes its ask from its yield alone.
 */
function legPageOf(round: Pick<LeadRoundRow, "purpose" | "plan">): number {
  if (round.purpose !== "widen") return 0;
  return LEAD_CARDS.find((card) => card.id === round.plan.card)?.maxPerTerm ?? 0;
}

/** What the main phase asks now, the tries its failed terms have had, the terms it began and the synonyms it passes over. */
interface MainAsk {
  ask: TermsAsk;
  tries: ReadonlyMap<string, number>;
  begun: string[];
  stale: ReadonlySet<string>;
}

/**
 * The main phase's next ask, from the round's runs and members as they stand: the count still wanted over the yield so
 * far (round 1's from its own places; a later round's from every place its search judged), for the one term whose turn
 * it is. A term after the phase's first is asked for the count less what the places already held may yet deliver, once
 * their addresses are checked (weighed.ts mayYetCount). `room` is the runs what the round reserved still holds a floor for.
 */
export async function planMainAsk(
  leadPorts: LeadPorts,
  round: LeadRoundRow,
  runs: readonly LeadRunRow[],
  members: readonly LeadMemberRow[],
  room: number,
): Promise<MainAsk> {
  const searched = await searchedOf(leadPorts, round);
  // A place Qualified on the page being committed counts with it: read here as counted, so the end of a run and the
  // start that follows it size the next ask from the same count.
  const counted = members.filter((m) => m.counted || m.class === "qualified").length;
  // Round 1 sizes from its probe; a top-up or a renewal from what the search found in every round before it.
  const yieldSoFar =
    round.purpose === "probe"
      ? probeYield(members.filter(wasWeighed), round.plan.contact)
      : runningYield(round, searched.members);
  // The question said "I'm dropping X: it mostly returned those", and a yes accepted it. An answer that changed the
  // plan is a new plan, and its terms are the owner's: the dropped one finds the very kind they just included.
  const dropTerm = round.answered === "keep" ? (round.question?.dropTerm ?? null) : null;
  const tried = await termsTried(round, runs, searched);
  const onTheirWay = tried.begun.size ? members.filter(mayYetCount).length : 0;
  return {
    ask: mainAsk(
      round.plan,
      targetOf(round) - counted - onTheirWay,
      yieldSoFar,
      dropTerm,
      room,
      tried,
      legPageOf(round),
    ),
    tries: tried.tries,
    begun: [...tried.begun],
    stale: tried.stale ?? new Set(),
  };
}
