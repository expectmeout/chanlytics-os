/**
 * What follows when a run's last item is committed: the probe's question or its pass, or the main phase's ending
 * and where to look next. The collect (collect.ts) asks it, and commits the answer with the page.
 */

import type { LeadRunState } from "@chanlytics/contracts";
import { discoveryEnding, FINAL_RUN_STATES, termsShortOf } from "../endings";
import { runIdFor } from "../ids";
import type { CollectPage, LeadMemberRow, LeadPorts, LeadRoundRow, LeadRunRow } from "../ports";
import { afterProbe } from "../question";
import { nearbyFor } from "./places";
import { type Phase, outOfTime, targetOf, wasJudged } from "./rules";

interface Decision {
  round: CollectPage["round"];
  next: CollectPage["next"];
  after?: () => Promise<void>;
}

/** When a run's last item is committed: is the phase over, and what follows (§7.2, §0.5). */
async function roundDecision(
  p: LeadPorts,
  round: LeadRoundRow,
  run: LeadRunRow,
  phase: Phase,
  runState: LeadRunState,
  members: LeadMemberRow[],
  itemsSeenNow: number,
): Promise<Decision | null> {
  const runs = (await p.db.runsOfRound(round.id)).map((r) =>
    r.id === run.id ? { ...r, state: runState, items_seen: itemsSeenNow } : r,
  );
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
    next: null,
    after: () => p.schedule("lead_check", { round_id: round.id, batch: 0 }, 0),
  };

  if (phase === "probe") {
    // The probe decides once. A collect that reaches here after it did -- the webhook's `final` after the poll that
    // already asked, or a late poll once the owner answered -- decides nothing: asking again re-wrote the question
    // and its day, and told the owner a second time.
    if (round.state !== "queued" && round.state !== "probing") return null;
    // The probe alone may reach the count: nothing more is asked for, and the round goes to its checks.
    if (counted >= targetOf(round)) return toChecks;
    const judged = members.filter(wasJudged);
    const a = afterProbe(
      round.plan,
      judged.map((m) => ({ class: m.class, excluded_by: m.excluded_by, term: m.term, phone: m.phone, email: m.email })),
      p.now(),
    );
    if (a.kind === "ask")
      return {
        round: { state: "waiting_on_owner", question: a.question, ending: null },
        next: null,
        // Once the question is committed: it waits a day on a person who may not be looking at the page.
        after: async () => {
          await p.tell?.({ kind: "question", roundId: round.id }).catch(() => undefined);
        },
      };
    // The probe passed: the round runs on to the plan's count (the door raised the target the same way for an answered question).
    return {
      round: { state: "running", question: null, ending: null, target: targetOf(round) },
      next: null,
      after: () => p.schedule("lead_round_start", { round_id: round.id, resume: true }, 0),
    };
  }
  // The main phase is over: the ending, pending the checks (a stopped round says so through stopRun).
  const asked = new Map<string, number | null>();
  for (const r of inPhase) {
    if (outOfTime(p) || !r.apify_run_id) continue;
    const input = (await p.apify.runInput(r.apify_run_id).catch(() => null)) as Record<string, unknown> | null;
    asked.set(r.id, typeof input?.maxCrawledPlacesPerSearch === "number" ? input.maxCrawledPlacesPerSearch : null);
  }
  const ending = discoveryEnding(round, runs, {
    counted,
    target: targetOf(round),
    termsShort: termsShortOf(inPhase, (r) => asked.get(r.id) ?? null),
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
    next: null,
    after: () => p.schedule("lead_check", { round_id: round.id, batch: 0 }, 0),
  };
}

export { roundDecision };
