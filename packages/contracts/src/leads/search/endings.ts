/**
 * The nine endings of a round (§0.5, S7): the words each is said in, and which one a round gets. The closed set
 * itself is sets.ts's LEAD_ROUND_ENDINGS.
 */
import type { LeadRoundEnding } from "./sets";

/* -------------------------------------------------------- the endings -- */

export const LEAD_ENDING_WORDS: Record<LeadRoundEnding, string> = {
  target_reached: "Found what you asked for",
  searched_everything: "Searched everything this plan covers",
  month_leads_used: "This month's leads are used",
  budget_used: "This month's searching budget is used",
  few_new_matches: "Few new matches",
  stopped: "Stopped by you",
  source_failed: "The source failed",
  question_unanswered: "Question unanswered",
  paused: "Paused for everyone",
};

/**
 * Which of the nine endings a round gets, in the order the facts outrank each
 * other (S7). The target overrides everything else: once it is reached, that
 * is the ending, whatever else happened on the page that reached it.
 * "Searched everything" only when every term returned fewer places than it
 * was asked for; otherwise the round ended at its limit with few new matches,
 * and the next step is another round in the same area.
 */
export function endingOfRound(x: {
  counted: number;
  target: number;
  termsShort: boolean[];
  budgetLeftUsd: number;
  allowanceLeft: number;
  stopped: boolean;
  sourceFailed: boolean;
  unanswered: boolean;
  paused: boolean;
}): LeadRoundEnding {
  if (x.counted >= x.target) return "target_reached";
  if (x.paused) return "paused";
  if (x.stopped) return "stopped";
  if (x.sourceFailed) return "source_failed";
  if (x.unanswered) return "question_unanswered";
  if (x.allowanceLeft <= 0) return "month_leads_used";
  if (x.budgetLeftUsd <= 0) return "budget_used";
  if (x.termsShort.length > 0 && x.termsShort.every(Boolean)) return "searched_everything";
  return "few_new_matches";
}
