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
  source_failed: "The source stopped answering",
  question_unanswered: "Question unanswered",
  paused: "Paused for everyone",
  reach_searched: "Searched everywhere within reach",
  day_used: "Today's searching is used",
};

/**
 * Which of the nine endings a round gets, in the order the facts outrank each
 * other (S7). The target overrides everything else: once it is reached, that
 * is the ending, whatever else happened on the page that reached it.
 * "Searched everything" only when every term returned fewer places than it
 * was asked for; otherwise the round ended at its limit with few new matches,
 * and the next step is another round in the same area.
 *
 * What a round reserved running out is not among them: that is the round's own estimate, never the month's searching.
 * "This month's searching budget is used" is said by the door that reserves the next step and is refused (SQL
 * lead_reserve, through lead_round_end's next leg or an owner's Carry on), where it is true. A round that ended on it
 * for its own estimate stopped a search at 41 of 267 with $24 of the month's $40 unspent, and opened no nearby area
 * (15 Nov 2026, decision 0133).
 */
export function endingOfRound(input: {
  counted: number;
  target: number;
  termsShort: boolean[];
  allowanceLeft: number;
  stopped: boolean;
  sourceFailed: boolean;
  unanswered: boolean;
  paused: boolean;
}): LeadRoundEnding {
  if (input.counted >= input.target) return "target_reached";
  if (input.paused) return "paused";
  if (input.stopped) return "stopped";
  if (input.sourceFailed) return "source_failed";
  if (input.unanswered) return "question_unanswered";
  if (input.allowanceLeft <= 0) return "month_leads_used";
  if (input.termsShort.length > 0 && input.termsShort.every(Boolean)) return "searched_everything";
  return "few_new_matches";
}
