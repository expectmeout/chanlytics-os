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

/** A term is short when its run saw fewer places than it asked for. Unknown asks read as not short. */
export function termsShortOf(runs: LeadRunRow[], askedOf: (run: LeadRunRow) => number | null): boolean[] {
  return runs.map((r) => {
    const asked = askedOf(r);
    return asked !== null && r.items_seen < asked;
  });
}

export function discoveryEnding(
  round: LeadRoundRow,
  runs: LeadRunRow[],
  x: { counted: number; target: number; termsShort: boolean[]; stopped: boolean },
): LeadRoundEnding {
  const discover = runs.filter((r) => r.purpose === "discover");
  return endingOfRound({
    counted: x.counted,
    target: x.target,
    termsShort: x.termsShort,
    budgetLeftUsd: round.cost_reserved_usd - round.cost_usd,
    allowanceLeft: round.allowance_reserved - round.allowance_used,
    stopped: x.stopped,
    sourceFailed: discover.length > 0 && discover.every((r) => r.state === "failed" || r.state === "timed_out"),
    unanswered: false,
    paused: false,
  });
}
