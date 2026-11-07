/**
 * The lead finder's sweep, decided (PRD §12.5): every five minutes, from the
 * rows alone. A running run nobody is collecting gets a collect; one past 45
 * minutes is aborted and read one last time; one whose collects failed for
 * good three times is given up (core giveUpRun), its round ending with it
 * when nothing else of it is live; a start whose answer was lost is
 * reconciled against the provider's own list (core reconcileUnknownRuns); a
 * claim that never recorded a start is marked unknown so the next sweep
 * reconciles it; a stale lease is released by its own owner and generation;
 * a question unanswered for a day ends its round, keeping what was found.
 *
 * Every other round that has not ended is asked what it needs next (core
 * nextStepOf): a round whose next job was never written is carried on from
 * where it stands -- its start, a collect of its newest finished run, or its
 * checks -- and only a round nothing can carry on, or one carried on three
 * times and still quiet, is ended, with the ending it had pending, through
 * 00506's lead_round_end_stuck, which looks again under its own lock. It used
 * to end every round an hour old with nothing live as "the source failed",
 * over the ending it had pending and with its addresses left "Checking…" for
 * good (3 Nov 2026).
 *
 * Every action is idempotent: a collect is scheduled once per minute key, the
 * round's start and checks once while one is live (jobs_dedupe_live), a
 * release names the generation it saw, an ending is a conditional move. A
 * sweep that runs twice does nothing twice.
 */

import {
  MIN_MS,
  HOUR_MS,
  type LeadRoundEnding,
  type LeadRoundPurpose,
  type LeadRoundState,
} from "@chanlytics/contracts";
import { nextStepOf, type StepRun } from "@chanlytics/core";

export const RUN_MAX_AGE_MS = 45 * MIN_MS;
export const STARTING_STALE_MS = 10 * MIN_MS;
/** A run row made and never claimed: its start job died before the claim and was given up. */
export const CLAIMED_STALE_MS = 60 * MIN_MS;
export const LEASE_STALE_MS = 2 * MIN_MS;
export const QUESTION_WAIT_MS = 24 * HOUR_MS;
/**
 * A run whose collects failed for good this often is given up. Each failed collect is the ledger's three tries over
 * twelve minutes (RETRY_WAITS_MS) and a page for the platform, never a bell (packages/jobs TOLD_ELSEWHERE), and the
 * sweep asks for the next one: one or two are a provider's bad half hour, three are the run's reading failing for most
 * of an hour. Without this the run stays running in our books, so its round never ends and the owner never hears it
 * stopped (29 Oct 2026, a judge call too big for its time); with it, the round ends source_failed and its notice says so.
 */
export const GIVE_UP_FAILED_COLLECTS = 3;
/** The run states that mean a round still has work at the provider. */
const LIVE_RUN_STATES: ReadonlySet<string> = new Set(["claimed", "starting", "running", "unknown"]);

export interface SweepRunRow {
  id: string;
  tenant_id: string;
  round_id: string;
  purpose: string;
  state: string;
  apify_run_id: string | null;
  claimed_by: string | null;
  claimed_at: string | null;
  lease_owner: string | null;
  lease_gen: number;
  lease_until: string | null;
  created_at: string;
  /** Which part of its round the run is: a check, or a discovery run of the probe or the main phase (core runIdFor). */
  part: StepRun["part"];
  /** A lead_collect job for this run is scheduled or fired. */
  collect_scheduled: boolean;
  /** The lead_collect jobs for this run that failed for good, each after its three tries. */
  collects_failed: number;
}

export interface SweepRoundRow {
  id: string;
  tenant_id: string;
  state: LeadRoundState;
  purpose: LeadRoundPurpose;
  ending_pending: LeadRoundEnding | null;
  waiting_since: string | null;
  /** When the round last moved (00506's lead_rounds.state_since). */
  state_since: string;
  created_at: string;
}

/** A round's own jobs, as the sweep read them: its start and its checks on their way, and the carry-ons that ran. */
export interface SweepRoundJobs {
  start: boolean;
  check: boolean;
  carriedOn: number;
}

/** A job that carries a quiet round on (core nextStepOf), written by the sweep. */
export type CarryAction =
  | { kind: "carry_start"; roundId: string; tenantId: string; resume: boolean }
  | { kind: "carry_collect"; runId: string; tenantId: string; seq: string }
  | { kind: "carry_check"; roundId: string; tenantId: string };

type SweepAction =
  | CarryAction
  | { kind: "collect"; runId: string; tenantId: string; seq: string }
  | { kind: "abort"; runId: string; tenantId: string; apifyRunId: string; seq: string }
  | { kind: "give_up"; runId: string; apifyRunId: string; owner: string }
  | { kind: "reconcile"; runId: string }
  | { kind: "mark_unknown"; runId: string; owner: string }
  | { kind: "orphan"; runId: string; owner: string }
  | { kind: "release_lease"; runId: string; owner: string; gen: number }
  | { kind: "end_question"; roundId: string; tenantId: string }
  | { kind: "end_stuck"; roundId: string; tenantId: string; ending: LeadRoundEnding; since: string };

/** The seq of a collect the sweep writes to carry a round on: its own word, so the carry-ons can be counted. */
export const carrySeq = (now: number): string => `r${Math.floor(now / MIN_MS)}`;

/** What one run needs (§12.5), from its row alone. */
function runActions(sweepRun: SweepRunRow, now: number, seq: string): SweepAction[] {
  const out: SweepAction[] = [];
  if (sweepRun.lease_owner && sweepRun.lease_until && Date.parse(sweepRun.lease_until) < now - LEASE_STALE_MS) {
    out.push({ kind: "release_lease", runId: sweepRun.id, owner: sweepRun.lease_owner, gen: sweepRun.lease_gen });
  }
  if (sweepRun.state === "unknown") return [...out, { kind: "reconcile", runId: sweepRun.id }];
  if (
    sweepRun.state === "starting" &&
    sweepRun.claimed_by &&
    Date.parse(sweepRun.claimed_at ?? sweepRun.created_at) < now - STARTING_STALE_MS
  )
    // The claimer never recorded a start: the next sweep reconciles it as unknown.
    return [...out, { kind: "mark_unknown", runId: sweepRun.id, owner: sweepRun.claimed_by }];
  if (sweepRun.state === "claimed" && !sweepRun.claimed_by && Date.parse(sweepRun.created_at) < now - CLAIMED_STALE_MS)
    return [...out, { kind: "orphan", runId: sweepRun.id, owner: `sweep:${Math.floor(now / MIN_MS)}` }];
  if (sweepRun.state !== "running" || !sweepRun.apify_run_id) return out;
  if (sweepRun.collects_failed >= GIVE_UP_FAILED_COLLECTS)
    // Not collected again, so not rung again: failed in our books, and the round ends with it when nothing else of
    // it is live. A collect still on its way then finds the round ended, so it is not waited for.
    return [
      ...out,
      {
        kind: "give_up",
        runId: sweepRun.id,
        apifyRunId: sweepRun.apify_run_id,
        owner: `sweep:${Math.floor(now / MIN_MS)}`,
      },
    ];
  if (Date.parse(sweepRun.created_at) < now - RUN_MAX_AGE_MS)
    return [
      ...out,
      { kind: "abort", runId: sweepRun.id, tenantId: sweepRun.tenant_id, apifyRunId: sweepRun.apify_run_id, seq },
    ];
  if (!sweepRun.collect_scheduled) out.push({ kind: "collect", runId: sweepRun.id, tenantId: sweepRun.tenant_id, seq });
  return out;
}

/** What one round needs, asked of core's one reading (nextStepOf) once its question is not what it waits on. */
function roundAction(
  rd: SweepRoundRow,
  runs: readonly SweepRunRow[],
  jobs: SweepRoundJobs,
  now: number,
): SweepAction | null {
  if (rd.state === "ended") return null;
  if (rd.state === "waiting_on_owner") {
    // A question is waiting on a person, not stuck: it keeps its own day.
    return rd.waiting_since && Date.parse(rd.waiting_since) < now - QUESTION_WAIT_MS
      ? { kind: "end_question", roundId: rd.id, tenantId: rd.tenant_id }
      : null;
  }
  const step = nextStepOf(
    {
      id: rd.id,
      state: rd.state,
      purpose: rd.purpose,
      ending_pending: rd.ending_pending,
      since: Date.parse(rd.state_since),
    },
    runs.map((r) => ({ id: r.id, state: r.state, part: r.part, created_at: r.created_at })),
    { ...jobs, collectFor: new Set(runs.filter((r) => r.collect_scheduled).map((r) => r.id)) },
    now,
  );
  switch (step.kind) {
    case "none":
      return null;
    case "start":
      return { kind: "carry_start", roundId: rd.id, tenantId: rd.tenant_id, resume: step.resume };
    case "collect":
      return { kind: "carry_collect", runId: step.runId, tenantId: rd.tenant_id, seq: carrySeq(now) };
    case "check":
      return { kind: "carry_check", roundId: rd.id, tenantId: rd.tenant_id };
    case "end":
      return { kind: "end_stuck", roundId: rd.id, tenantId: rd.tenant_id, ending: step.ending, since: rd.state_since };
  }
}

export function planLeadSweep(
  rows: { runs: SweepRunRow[]; rounds: SweepRoundRow[]; roundJobs?: ReadonlyMap<string, SweepRoundJobs> },
  now: number,
): SweepAction[] {
  const seq = `s${Math.floor(now / MIN_MS)}`;
  const out: SweepAction[] = rows.runs.flatMap((r) => runActions(r, now, seq));
  const noJobs: SweepRoundJobs = { start: false, check: false, carriedOn: 0 };
  for (const rd of rows.rounds) {
    const a = roundAction(
      rd,
      rows.runs.filter((r) => r.round_id === rd.id),
      rows.roundJobs?.get(rd.id) ?? noJobs,
      now,
    );
    if (a) out.push(a);
  }
  return out;
}

export { LIVE_RUN_STATES };
