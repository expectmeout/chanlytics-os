/**
 * What follows when a run's last item is committed: the probe's question or its pass, or the main phase's ending
 * and where to look next. The collect (collect.ts) asks it, and commits the answer with the page: the round's move and
 * the job that carries it on (the checks, or the main phase) are one transaction (PRD §0.5), so a function killed after
 * the commit leaves nothing unwritten. `after` is only what is said once it is true (the question's mail).
 */

import { discoveryEnding, FINAL_RUN_STATES, termsShortOf } from "../endings";
import { runIdFor } from "../ids";
import type { CollectPage, LeadMemberRow, LeadPorts, LeadRoundRow, LeadRunRow } from "../ports";
import { afterProbe } from "../question";
import { runsRoom } from "../sizing";
import { nearbyFor } from "./places";
import { type Phase, outOfTime, targetOf, wasJudged } from "./rules";

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
  return phaseOver(leadPorts, round, runs, inPhase, members, counted);
}

/** The searching is over: the ending, pending the checks (a stopped round says so through stopRun). */
async function phaseOver(
  leadPorts: LeadPorts,
  round: LeadRoundRow,
  runs: LeadRunRow[],
  inPhase: LeadRunRow[],
  members: LeadMemberRow[],
  counted: number,
): Promise<Decision> {
  const byKey = new Map<string, number | null>();
  for (const r of inPhase) {
    if (outOfTime(leadPorts) || !r.apify_run_id) continue;
    const input = (await leadPorts.apify.runInput(r.apify_run_id).catch(() => null)) as Record<string, unknown> | null;
    byKey.set(r.id, typeof input?.maxCrawledPlacesPerSearch === "number" ? input.maxCrawledPlacesPerSearch : null);
  }
  // Every term short says the area is searched; a term this phase never asked has said no such thing.
  const dropTerm = round.answered === "keep" ? (round.question?.dropTerm ?? null) : null;
  const unasked = round.plan.terms.some((t) => t !== dropTerm && !inPhase.some((r) => r.term === t));
  const ending = discoveryEnding(round, runs, {
    counted,
    target: targetOf(round),
    termsShort: [...termsShortOf(inPhase, (r) => byKey.get(r.id) ?? null), ...(unasked ? [false] : [])],
    stopped: false,
  });
  // A round that ran dry says where to look next (D3): written with its ending, before the round is final.
  const nearby = ending === "searched_everything" || ending === "few_new_matches" ? nearbyFor(round.plan, members) : [];
  return {
    round: {
      state: "checking",
      question: null,
      ending: null,
      ending_pending: ending,
      ...(nearby.length ? { nearby } : {}),
    },
    next: FIRST_CHECK,
  };
}

export { roundDecision };
