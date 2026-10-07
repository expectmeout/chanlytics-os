/**
 * The runner (PRD §0.5, §12.5): the three jobs of the lead finder and the
 * sweep's reconciliation, over ports.
 *
 *   startRound   lead_round_start  a run row per term, made by its deterministic
 *                                  id, claimed, and only then started at the
 *                                  provider; a lost answer stays unknown
 *   collect      lead_collect      one batch of a run's items per commit: clean,
 *                                  identity, judge, classify, distance, commit
 *   check        lead_check        one checker run per batch of addresses
 *   reconcileUnknownRuns           the provider's own list, by our run row id
 *
 * The rules the verbs keep: a claim before any provider call (E1); a lease
 * with an owner and a generation, and one commit per batch that inserts,
 * settles, advances the offset by compare-and-set and inserts the next job
 * (E3, E4); the judge's answer kept by operation id; code deciding the class
 * (§0.1); the deadline checked before every provider or model call, and the
 * offset committed before yielding. A provider's 429 or 5xx throws for the
 * ledger's waits; a refusal is an answer.
 *
 * The webhook token of a run row is derived from the row's id by the edge
 * (ports.webhookToken), so a job tried again can rebuild the URL its earlier
 * try sent without the row's stored hash ever being rewritten (E1).
 *
 * This module holds what the jobs share: the lease, the clocks and the page sizes, the reasons a place is held by
 * rule, the deadline check and the provider's two kinds of trouble. Each job is a module beside it: start.ts,
 * collect.ts, check.ts and sweep.ts.
 */

import { MIN_MS } from "@chanlytics/contracts";
import { JUDGE_TIMEOUT_MS } from "../judge";
import type { LeadMemberRow, LeadPorts, LeadRoundRow } from "../ports";

export const LEASE_SECONDS = 90;
export const FIRST_COLLECT_SECONDS = 20;
export const POLL_SECONDS = 15;
export const PAGE_ITEMS = 100;
export const CHECK_BATCH = 500;
/** No provider call starts with less than this left before the function is killed. */
export const DEADLINE_MARGIN_MS = 8_000;
/**
 * The judge's own margin: it may take its whole timeout to answer, so it is
 * never started with less than that left. A margin shorter than the call it
 * guards buys nothing -- the function is killed mid-call, the page is never
 * committed, and the batch is paid for twice when the job is tried again.
 */
export const JUDGE_MARGIN_MS = JUDGE_TIMEOUT_MS;
/** An unknown start with no run at the provider after this long is failed. */
export const UNKNOWN_START_GRACE_MS = 10 * MIN_MS;
/** The key our runs carry in their input, so the sweep can tell ours from anyone else's. */
export const INPUT_MARKER = "chanlyticsRunId";
/**
 * How far into the provider's own list a lost start is looked for: the list
 * answers a hundred runs since a time (channels apify.ts), and ours can be
 * anywhere in it -- a round starting three terms, or another search on the
 * same account, pushes it down. The list carries no input, so there is no
 * cheaper way than reading each run's input key until ours is found; stopping
 * at twenty failed a run the provider was still charging for.
 */
export const PROVIDER_RUN_PAGE = 100;
export const OUT_OF_AREA_REASON = "outside the area you asked for";
export const NO_LOCATION_REASON = "no location on the listing";
export const CLOSED_REASON = "closed on Google Maps";
export const DUPLICATE_REASON = "the same place, listed twice";

export type Phase = "probe" | "main";

/** A condition worth trying again that is not the provider's: the ledger's waits take it. */
export class LeadRetry extends Error {
  constructor(message: string) {
    super(message);
    this.name = "LeadRetry";
  }
}

const iso = (d: Date) => d.toISOString();
/** The provider's two kinds of trouble, told by name: the class may come from another copy of the channels package (its dist, or a test's fake). */
const isRefused = (e: unknown): boolean => (e as { name?: string } | null)?.name === "ApifyRefused";
const isRetryable = (e: unknown): e is { name: string; status: number | null } =>
  (e as { name?: string } | null)?.name === "ApifyRetryable";
const minute = (p: LeadPorts) => Math.floor(p.now().getTime() / MIN_MS);
const outOfTime = (p: LeadPorts, marginMs: number = DEADLINE_MARGIN_MS) => p.now().getTime() + marginMs > p.deadline;
const webhookUrl = (p: LeadPorts, runRowId: string, token: string) =>
  `${p.webhookBase}/api/apify-webhook?run=${encodeURIComponent(runRowId)}&token=${encodeURIComponent(token)}`;
/** Round 1 runs to the plan's count (its probe asks for 25 of it); a later round to what lead_search_more set as its target. */
export const targetOf = (round: LeadRoundRow): number => (round.purpose === "probe" ? round.plan.count : round.target);
/** A member the judge answered for, as opposed to one left out or held by rule. */
const wasJudged = (m: LeadMemberRow): boolean => {
  const j = m.judgment as { answer?: unknown } | null;
  return !!j && typeof j === "object" && j.answer !== null && j.answer !== undefined;
};

export { iso, isRefused, isRetryable, minute, outOfTime, webhookUrl, wasJudged };
