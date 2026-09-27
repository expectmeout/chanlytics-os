/**
 * How long a workspace's yeses take (0004, 0008 amended): the one rule Reports' median and the workspace's pace both
 * read (yesWaits), and the pace from the workspace's own deals (dealPaceFrom), which says when a proposal out is
 * waiting everywhere (deals.ts dealPaceOf, waitingOnProposal). Pure.
 */
import { isYes, PACE_WINDOW_DAYS, type DealPaceDto } from "./deals";
import { quantile } from "../reports/reports";
import { DAY_MS, HOUR_MS } from "../shared/time";

/** A yes put on file within this long of its proposal is a client entered after the fact, not a decision. */
export const SAME_SITTING_MS = HOUR_MS;

/** A deal as the wait for its yes is measured: its stage and its two days. */
export interface DealWaitRow {
  stage: string;
  proposed_at: string;
  decided_at: string | null;
}

/**
 * The whole days each yes took from its proposal, sorted. A yes with no day, one dated before its proposal and one put
 * on file within an hour of it are clients entered after the fact -- the proposal and the yes recorded together, or
 * the yes back-dated -- not a wait anyone had, and are left out: counted, they would say every proposal is decided
 * the same day.
 */
export function yesWaits(rows: readonly DealWaitRow[]): number[] {
  return rows
    .filter(isYes)
    .map((d) => (d.decided_at ? Date.parse(d.decided_at) - Date.parse(d.proposed_at) : Number.NaN))
    .filter((ms) => Number.isFinite(ms) && ms >= SAME_SITTING_MS)
    .map((ms) => Math.floor(ms / DAY_MS))
    .sort((a, b) => a - b);
}

/** The middle of the waits in whole days, half up between two; null with none. */
export function medianWait(waits: readonly number[]): number | null {
  const m = quantile([...waits], 0.5);
  return m === null ? null : Math.round(m);
}

/** A workspace's pace from its deals: its yeses decided in the last year, their median wait, and how many. */
export function dealPaceFrom(rows: readonly DealWaitRow[], nowMs: number): DealPaceDto {
  const since = nowMs - PACE_WINDOW_DAYS * DAY_MS;
  const waits = yesWaits(rows.filter((d) => d.decided_at !== null && Date.parse(d.decided_at) >= since));
  return { median_days: medianWait(waits), yeses: waits.length };
}
