/**
 * What follows when a run's last item is committed: the probe's question or its pass, or the main phase's ending
 * and where to look next. The collect (collect.ts) asks it, and commits the answer with the page: the round's move and
 * the job that carries it on (the checks, or the main phase) are one transaction (PRD §0.5), so a function killed after
 * the commit leaves nothing unwritten. `after` is only what is said once it is true (the question's mail).
 */

import { discoveryEnding, FINAL_RUN_STATES, standingRuns, termsShortOf } from "../endings";
import { runIdFor } from "../ids";
import type { CollectPage, LeadMemberRow, LeadPorts, LeadRoundRow, LeadRunRow } from "../ports";
import { afterProbe } from "../question";
import { runCaps, runsRoom, termsToAsk } from "../sizing";
import { areaKey } from "../ladder";
import { planMainAsk } from "./main-ask";
import { nearbyFor } from "./places";
import { LEAD_RUN_RETRY_SECONDS, retryOf } from "./retries";
import { type Phase, outOfTime, targetOf, wasJudged } from "./rules";
import { logAndGoOn } from "@chanlytics/log";
import { reachOf, type LeadArea } from "@chanlytics/contracts";

/** The round's first batch of mailbox checks, written with the page that sends the round to them. */
const FIRST_CHECK = { kind: "lead_check", batch: 0, run_after_seconds: 0 } as const;

interface Decision {
  round: CollectPage["round"];
  next: CollectPage["next"];
  after?: () => Promise<void>;
}

/** When a run's last item is committed: is the phase over, and what follows (§7.2, §0.5). */
async function roundDecision(
  leadPorts: LeadPorts,
  round: LeadRoundRow,
  run: LeadRunRow,
  phase: Phase,
  runNow: Pick<LeadRunRow, "state" | "items_seen">,
  members: LeadMemberRow[],
  spentNow: number,
): Promise<Decision | null> {
  const runs = (await leadPorts.db.runsOfRound(round.id)).map((r) => (r.id === run.id ? { ...r, ...runNow } : r));
  const phaseOf = new Map<string, Phase>();
  for (const r of runs)
    if (r.purpose === "discover" && r.term !== null)
      phaseOf.set(r.id, (await runIdFor(round.id, "probe", r.term)) === r.id ? "probe" : "main");
  const inPhase = runs.filter((r) => r.purpose === "discover" && phaseOf.get(r.id) === phase);
  if (!inPhase.every((r) => FINAL_RUN_STATES.has(r.state))) return null;

  // What will have counted once this page settles: a place Qualified at collect (a phone that dials, decision 0010)
  // counts now, whatever the search prefers; one waiting on its email counts after the checks.
  const countedNow = members.filter((m) => m.counted).length;
  const countable = members.filter((m) => !m.counted && m.class === "qualified").length;
  const counted = countedNow + Math.min(countable, Math.max(0, round.allowance_reserved - round.allowance_used));
  const toChecks: Decision = {
    round: { state: "checking", question: null, ending: null, ending_pending: "target_reached" },
    next: FIRST_CHECK,
  };

  if (phase === "probe") {
    // The probe decides once. A collect that reaches here after it did -- the webhook's `final` after the poll that
    // already asked, or a late poll once the owner answered -- decides nothing: asking again re-wrote the question
    // and its day, and told the owner a second time.
    if (round.state !== "queued" && round.state !== "probing") return null;
    // The probe alone may reach the count: nothing more is asked for, and the round goes to its checks.
    if (counted >= targetOf(round)) return toChecks;
    // What this page spends counts: a probe that leaves no run's room has nothing to run on, and no question it could act
    // on. It finishes on what it found, its emails checked, and says neither that the month's searching is used nor that
    // the area is.
    if (runsRoom(round.cost_reserved_usd - round.cost_usd - spentNow) === 0)
      return phaseOver(leadPorts, round, runs, inPhase, members, counted);
    const judged = members.filter(wasJudged);
    const result = afterProbe(
      round.plan,
      judged.map((m) => ({ class: m.class, excluded_by: m.excluded_by, term: m.term, phone: m.phone, email: m.email })),
      leadPorts.now(),
    );
    if (result.kind === "ask")
      return {
        round: { state: "waiting_on_owner", question: result.question, ending: null },
        next: null,
        // Once the question is committed: it waits a day on a person who may not be looking at the page.
        after: async () => {
          await leadPorts.tell?.({ kind: "question", roundId: round.id }).catch(() => undefined);
        },
      };
    // The probe passed: the round runs on to the plan's count (the door raised the target the same way for an answered question).
    return {
      round: { state: "running", question: null, ending: null, target: targetOf(round) },
      next: { kind: "lead_round_start", resume: true, run_after_seconds: 0 },
    };
  }
  return mainDecision(leadPorts, round, { runs, inPhase, members, counted, spentNow });
}

/**
 * When the main phase's runs are all in: a failed term's next try, the next term's turn, or the phase's end. A term whose
 * run failed partway is tried again before the round ends on the source (retries.ts), where the count is still short and
 * the round has room for a run; every term failing at once is a fault, said to the platform now. The next term has its
 * turn (main-ask.ts) where the count is still short, every term asked so far came back under its ask, so its area holds
 * no more for them, and the start will find a term to ask and the room for its run. What the phase would ask is read
 * only where it could go on: it is the search's every round and member.
 */
async function mainDecision(
  leadPorts: LeadPorts,
  round: LeadRoundRow,
  phase: { runs: LeadRunRow[]; inPhase: LeadRunRow[]; members: LeadMemberRow[]; counted: number; spentNow: number },
): Promise<Decision> {
  const { runs, inPhase, members, counted } = phase;
  const leftUsd = round.cost_reserved_usd - round.cost_usd - phase.spentNow;
  const isShort = counted < targetOf(round);
  const retry = isShort ? retryOf(inPhase, leadPorts.now().getTime()) : "none";
  if (retry === "retry" && runsRoom(leftUsd) > 0) return TRY_AGAIN;
  const requests = await requestsOf(leadPorts, standingRuns(inPhase));
  const cameShort = termsShortOf(standingRuns(inPhase), (r) => requests.get(r.id) ?? null);
  const isReadWhole = retry === "none" && isShort && cameShort.length > 0 && cameShort.every(Boolean);
  const main = isReadWhole ? await planMainAsk(leadPorts, round, runs, members, runsRoom(leftUsd)) : null;
  if (main && (runCaps(round.plan, main.ask.perTerm, leftUsd)[0] ?? 0) > 0) return NEXT_TERM;
  return phaseOver(leadPorts, round, runs, inPhase, members, counted, {
    sourceDown: retry === "down",
    requests,
    ...(main ? { stale: main.stale } : {}),
  });
}

/** The main phase starts its failed terms again, twenty minutes on: the round runs on meanwhile, ending nothing. */
const TRY_AGAIN: Decision = {
  round: { state: "running", question: null, ending: null },
  next: { kind: "lead_round_start", resume: true, run_after_seconds: LEAD_RUN_RETRY_SECONDS },
};

/** The main phase starts its next term now: the round runs on, ending nothing. */
const NEXT_TERM: Decision = {
  round: { state: "running", question: null, ending: null },
  next: { kind: "lead_round_start", resume: true, run_after_seconds: 0 },
};

/**
 * What each run was asked for, from the input the provider keeps for it: null where it cannot be read or there is no
 * time left to ask, and such a run is never taken for one that came back short (endings.ts termsShortOf).
 */
async function requestsOf(leadPorts: LeadPorts, runs: readonly LeadRunRow[]): Promise<Map<string, number | null>> {
  const requests = new Map<string, number | null>();
  for (const r of runs) {
    if (outOfTime(leadPorts) || !r.apify_run_id) continue;
    const input = (await leadPorts.apify.runInput(r.apify_run_id).catch(logAndGoOn("runInput", null))) as Record<
      string,
      unknown
    > | null;
    requests.set(r.id, typeof input?.maxCrawledPlacesPerSearch === "number" ? input.maxCrawledPlacesPerSearch : null);
  }
  return requests;
}

/**
 * The ladder's next rung for the search (decision 0133): measured from the area on its card and the places found there,
 * past the area of every leg it opened, this one's too. A leg's own plan names its leg's area, so the card's is the
 * newest round that is no leg.
 */
export async function findNextAreas(leadPorts: LeadPorts, round: LeadRoundRow): Promise<LeadArea[]> {
  const rounds = await leadPorts.db.roundsOfSearch(round.search_id);
  const card = rounds.filter((r) => r.purpose !== "widen").at(-1) ?? round;
  // A leg's plan is the search's own with its area swapped, so it carries the reach the owner asked last ("Look up to
  // 50 miles"); the card's round may carry the reach before it.
  const plan = { ...card.plan, ...(round.plan.reach_m === undefined ? {} : { reach_m: round.plan.reach_m }) };
  // The ladder measures from the card's area and what its rounds found there, and passes every other area read.
  const onCard = new Set(rounds.filter((r) => areaKey(r.plan.area) === areaKey(card.plan.area)).map((r) => r.id));
  const read = rounds.filter((r) => !onCard.has(r.id)).map((r) => r.plan.area);
  const found = (await leadPorts.db.membersOfSearch(round.search_id)).filter((m) => onCard.has(m.round_id ?? ""));
  const within = nearbyFor(plan, found, read);
  // Nothing left within the reach on its card: the areas past it, up to the farthest an owner may ask (reachOf holds
  // every reach to it), each marked with that reach, so the round's end never opens one by itself and the owner's Look up
  // to 50 miles can.
  const farthest = reachOf(plan.area, Number.POSITIVE_INFINITY);
  if (within.length || reachOf(plan.area, plan.reach_m) >= farthest) return within;
  return nearbyFor({ ...plan, reach_m: farthest }, found, read).map((a) => ({ ...a, beyond_m: farthest }));
}

/**
 * The searching is over: the ending, pending the checks (a stopped round says so through stopRun). `known` is what the
 * main phase's decision already read: what each run was asked for, and the synonyms the search passes over.
 */
async function phaseOver(
  leadPorts: LeadPorts,
  round: LeadRoundRow,
  runs: LeadRunRow[],
  phaseRuns: LeadRunRow[],
  members: LeadMemberRow[],
  counted: number,
  known: { sourceDown?: boolean; requests?: Map<string, number | null>; stale?: ReadonlySet<string> } = {},
): Promise<Decision> {
  // A term tried again stands by its newest run: the tries that failed before it say nothing of the area.
  const inPhase = standingRuns(phaseRuns);
  const byKey = known.requests ?? (await requestsOf(leadPorts, inPhase));
  // Every term short says the area is searched; a term this phase never asked has said no such thing. A term the search
  // does not ask at all (the one the question dropped, a synonym that mostly returned places already held) is not one.
  const dropTerm = round.answered === "keep" ? (round.question?.dropTerm ?? null) : null;
  const unasked = termsToAsk(round.plan, dropTerm, known.stale).some((t) => !inPhase.some((r) => r.term === t));
  const ending = discoveryEnding(round, runs, {
    counted,
    target: targetOf(round),
    termsShort: [...termsShortOf(inPhase, (r) => byKey.get(r.id) ?? null), ...(unasked ? [false] : [])],
    stopped: false,
  });
  // A round that ran dry says where to look next (D3): written with its ending, before the round is final. Where the
  // search widens by itself (decision 0133), its first area is the next leg's, which the round's end opens.
  const nearby =
    ending === "searched_everything" || ending === "few_new_matches" ? await findNextAreas(leadPorts, round) : [];
  return {
    round: {
      state: "checking",
      question: null,
      ending: null,
      ending_pending: ending,
      ...(nearby.length ? { nearby } : {}),
    },
    next: FIRST_CHECK,
    ...(known.sourceDown ? { after: () => tellSourceDown(leadPorts, inPhase) } : {}),
  };
}

/** Every term's run failed within half a minute: the platform is paged now, in the provider's own names (retries.ts). */
async function tellSourceDown(leadPorts: LeadPorts, runs: LeadRunRow[]): Promise<void> {
  const run = runs[0];
  if (!run) return;
  await leadPorts
    .tell?.({ kind: "source_down", actor: run.actor, build: run.build, runs: runs.length })
    .catch(logAndGoOn("telling the platform a lead source fails every run"));
}

export { roundDecision };
