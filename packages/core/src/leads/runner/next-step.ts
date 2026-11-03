/**
 * What a round needs next, said once (PRD §0.5): the one reading the sweep asks of every round that has not ended, so a
 * round whose next job was never written is carried on, not ended in words that are not true.
 *
 * A round moves only by its own jobs: the start, a run's collects, the checks. While any of them is live, or a run is
 * at the provider, the round is being worked and nothing is needed. A round quiet for REDRIVE_AFTER_MS is given the
 * job that carries it on from where it stands: the start (or the main phase's, once its probe passed), a collect of its
 * newest finished run (which decides what that run's end should have decided), or its checks. Every one of those is
 * idempotent: run rows by deterministic ids, collects keyed by their sequence, the checks by their batch's run id, so a
 * job the sweep writes beside one already on its way does nothing twice. Only a round nothing can carry on, or one
 * carried on MAX_CARRY_ONS times since it last moved and still quiet, is ended, with the ending it had pending when it
 * had one, and through a door that looks again under its own lock (00506's lead_round_end_stuck), because what the
 * sweep read was three reads, not one.
 *
 * Pure: the rows in, the step out. The edge reads the rows (apps/edge/lib/leads/leads-sweep.ts) and applies the step.
 */

import { MIN_MS, type LeadRoundEnding, type LeadRoundPurpose, type LeadRoundState } from "@chanlytics/contracts";
import { FINAL_RUN_STATES } from "../endings";
import type { Phase } from "./rules";

/** Quiet this long, with nothing of its own live, a round is carried on. */
export const REDRIVE_AFTER_MS = 10 * MIN_MS;
/** Carried on this often since its last move and still quiet, a round is ended: what carries it on is not working. */
export const MAX_CARRY_ONS = 3;

/** The round as the step reads it: its state, what it was made for, the ending it left pending, since when it stands. */
export interface StepRound {
  id: string;
  state: LeadRoundState;
  purpose: LeadRoundPurpose;
  ending_pending: LeadRoundEnding | null;
  /** Epoch ms of the round's last move (lead_rounds.state_since). */
  since: number;
}

/** A run of the round: its state, and which part of the round it is (a check, or a discovery run of a phase). */
export interface StepRun {
  id: string;
  state: string;
  part: Phase | "check";
  created_at: string;
}

/**
 * The round's own jobs: its start, its checks and the runs whose collect is still to run or running, and how many of the
 * jobs the sweep wrote to carry it on have run since the round last moved.
 */
export interface StepJobs {
  start: boolean;
  check: boolean;
  collectFor: ReadonlySet<string>;
  carriedOn: number;
}

export type RoundStep =
  | { kind: "none" }
  | { kind: "start"; resume: boolean }
  | { kind: "collect"; runId: string }
  | { kind: "check" }
  | { kind: "end"; ending: LeadRoundEnding };

const NONE: RoundStep = { kind: "none" };

/** The newest finished run of a part of the round, or null. */
function newestFinished(runs: readonly StepRun[], part: StepRun["part"]): StepRun | null {
  const done = runs.filter((r) => r.part === part && FINAL_RUN_STATES.has(r.state));
  return done.sort((a, b) => (a.created_at < b.created_at ? 1 : a.created_at > b.created_at ? -1 : 0))[0] ?? null;
}

/** The job that carries a quiet round on from where it stands, or null when none would. */
function carryOn(round: StepRound, runs: readonly StepRun[]): RoundStep | null {
  if (round.state === "checking") {
    // A check that finished and never told the round reads its answers again, and ends the round if it was the last;
    // no check at all yet is the first batch.
    const check = newestFinished(runs, "check");
    return check ? { kind: "collect", runId: check.id } : { kind: "check" };
  }
  // A probe round's own phase while it probes, the main phase once it runs on; a later round has only a main phase.
  const part: Phase = round.purpose === "probe" && round.state !== "running" ? "probe" : "main";
  const run = newestFinished(runs, part);
  if (run) return { kind: "collect", runId: run.id };
  if (round.state === "queued") return { kind: "start", resume: false };
  // Running with no run of its phase: the start that should have followed the probe, or a later round's own.
  if (round.state === "running") return { kind: "start", resume: true };
  return null;
}

export function nextStepOf(round: StepRound, runs: readonly StepRun[], jobs: StepJobs, now: number): RoundStep {
  if (round.state === "ended" || round.state === "waiting_on_owner") return NONE;
  // Being worked: a run at the provider (the sweep's run-level steps watch it), or a job of the round's on its way.
  if (runs.some((r) => !FINAL_RUN_STATES.has(r.state))) return NONE;
  if (jobs.start || jobs.check || runs.some((r) => jobs.collectFor.has(r.id))) return NONE;
  // Quiet long enough to carry on; a round whose moment cannot be read is never taken for a quiet one.
  if (!(now - round.since >= REDRIVE_AFTER_MS)) return NONE;
  const step = jobs.carriedOn < MAX_CARRY_ONS ? carryOn(round, runs) : null;
  return step ?? { kind: "end", ending: round.ending_pending ?? "source_failed" };
}
