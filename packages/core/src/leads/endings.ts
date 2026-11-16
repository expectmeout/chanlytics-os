/**
 * How a round ends (PRD §0.5, S7): one closed set, decided by contracts'
 * endingOfRound from facts the runner gathers here. "Searched everything"
 * only when every term returned fewer places than it was asked for; a run
 * that returned what it was asked for ended at its limit, and the round says
 * "few new matches" so the next step is another round in the same area.
 */
import { endingOfRound, type LeadRoundEnding } from "@chanlytics/contracts";
import type { LeadRoundRow, LeadRunRow } from "./ports";

export const FINAL_RUN_STATES: ReadonlySet<string> = new Set(["succeeded", "failed", "aborted", "timed_out"]);

/** The provider's status as the row's state; anything else is still running. */
export function runStateOf(status: string): "running" | "succeeded" | "failed" | "aborted" | "timed_out" {
  switch (status) {
    case "SUCCEEDED":
      return "succeeded";
    case "FAILED":
      return "failed";
    case "TIMED-OUT":
      return "timed_out";
    case "ABORTED":
      return "aborted";
    default:
      return "running";
  }
}

/** A run the provider failed or let time out: the source stopped answering it. */
export const failedRun = (run: LeadRunRow): boolean => run.state === "failed" || run.state === "timed_out";

/**
 * The runs that stand for their terms (decision 0133): a failed run that a later run of its term followed (a try
 * again, or the main phase asking past what a failed probe read) is set aside, so a term tried again and read whole
 * ends its round as one that never failed.
 */
export function standingRuns(runs: readonly LeadRunRow[]): LeadRunRow[] {
  const later = (first: LeadRunRow, next: LeadRunRow) => Date.parse(next.created_at) > Date.parse(first.created_at);
  return runs.filter(
    (r) =>
      !(failedRun(r) && runs.some((other) => other.purpose === r.purpose && other.term === r.term && later(r, other))),
  );
}

/** A run that never finished reading its term: it says nothing of how many places the term holds. */
const unfinished = (r: LeadRunRow): boolean => r.state === "failed" || r.state === "timed_out" || r.state === "aborted";

/**
 * A term is short when its run saw fewer places than it asked for. Unknown asks read as not short, and so does a run that
 * failed partway: it stopped, the area did not run out (Ruben, 14 Nov 2026: three runs failed after 33 to 94 places, and
 * the search said it had searched everything).
 */
export function termsShortOf(runs: LeadRunRow[], askedOf: (run: LeadRunRow) => number | null): boolean[] {
  return runs.map((r) => {
    if (unfinished(r)) return false;
    const request = askedOf(r);
    return request !== null && r.items_seen < request;
  });
}

export function discoveryEnding(
  round: LeadRoundRow,
  runs: LeadRunRow[],
  input: { counted: number; target: number; termsShort: boolean[]; stopped: boolean },
): LeadRoundEnding {
  const discover = runs.filter((r) => r.purpose === "discover");
  return endingOfRound({
    counted: input.counted,
    target: input.target,
    termsShort: input.termsShort,
    allowanceLeft: round.allowance_reserved - round.allowance_used,
    stopped: input.stopped,
    // Any run that failed or timed out, and was not tried again, stopped the search short of what it asked: "the source
    // stopped answering", with Try again, never "searched everything" and its places nearby (the live run of 14 Nov 2026).
    sourceFailed: standingRuns(discover).some(failedRun),
    unanswered: false,
    paused: false,
  });
}
