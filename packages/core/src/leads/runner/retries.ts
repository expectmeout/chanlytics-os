/**
 * A source's failure tried again (decision 0133, step 4). A term whose run failed or timed out partway is started again
 * twenty minutes on, up to three times, before its round ends on the source: a provider that drops a run now and then
 * no longer ends a search for 300 at 140. A run that failed within half a minute on every term is a fault no wait mends
 * (a key or a build refused once the run began): the platform is paged at once, and no try is spent on it. A start the
 * provider refused is claim.ts's, and told there.
 */
import { MIN_MS, SECOND_MS } from "@chanlytics/contracts";
import { failedRun, standingRuns } from "../endings";
import type { LeadRunRow } from "../ports";

/** How many times a term's run that failed is started again before the round ends on the source. */
export const LEAD_RUN_RETRIES = 3;
/** How long a round waits before it tries a failed term again: a provider's bad minute passes. */
export const LEAD_RUN_RETRY_SECONDS = (20 * MIN_MS) / SECOND_MS;
/** A run that failed sooner than this after it was made failed at its start: a fault, not a bad minute. */
export const LEAD_RUN_QUICK_FAIL_MS = 30 * SECOND_MS;

/** How many of a term's runs failed in this phase: its tries so far. */
export const triesFailed = (inPhase: readonly LeadRunRow[], term: string | null): number =>
  inPhase.filter((r) => r.term === term && failedRun(r)).length;

/**
 * A run that failed within half a minute of being made. The run being collected has no end written yet: it ended by
 * now, the moment its failure is read.
 */
const quick = (r: LeadRunRow, nowMs: number): boolean =>
  (r.finished_at === null ? nowMs : Date.parse(r.finished_at)) - Date.parse(r.created_at) < LEAD_RUN_QUICK_FAIL_MS;

/**
 * What the end of a phase does about its failed runs: try their terms again, say the source is down (every term failed
 * within half a minute), or nothing (none failed, or a failed term has had its three tries).
 */
export function retryOf(inPhase: readonly LeadRunRow[], nowMs: number): "retry" | "down" | "none" {
  const standing = standingRuns(inPhase).filter((r) => r.purpose === "discover");
  const down = standing.filter(failedRun);
  if (!down.length) return "none";
  if (standing.every((r) => failedRun(r) && quick(r, nowMs))) return "down";
  return down.every((r) => triesFailed(inPhase, r.term) <= LEAD_RUN_RETRIES) ? "retry" : "none";
}
