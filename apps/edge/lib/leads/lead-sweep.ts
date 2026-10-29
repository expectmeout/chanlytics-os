/**
 * The lead finder's sweep, decided (PRD §12.5): every five minutes, from the
 * rows alone. A running run nobody is collecting gets a collect; one past 45
 * minutes is aborted and read one last time; one whose collects failed for
 * good three times is given up (core giveUpRun), its round ending with it
 * when nothing else of it is live; a start whose answer was lost is
 * reconciled against the provider's own list (core reconcileUnknownRuns); a
 * claim that never recorded a start is marked unknown so the next sweep
 * reconciles it; a stale lease is released by its own owner and generation;
 * a question unanswered for a day ends its round, keeping what was found; a
 * round with nothing live left, an hour old, is ended "the source failed",
 * which is what 00140's trigger_leads_sweep promises for a round whose start
 * job died before it wrote a run -- until something ends it, its allowance
 * and its share of the platform's day cap are held for ever and the clock
 * calls this route every five minutes for nothing.
 *
 * Every action is idempotent: a collect is scheduled once per minute key, a
 * release names the generation it saw, an ending is a conditional move. A
 * sweep that runs twice does nothing twice.
 */

import { MIN_MS, HOUR_MS } from "../packages/contracts.js";

export const RUN_MAX_AGE_MS = 45 * MIN_MS;
export const STARTING_STALE_MS = 10 * MIN_MS;
/** A run row made and never claimed: its start job died before the claim and was given up. */
export const CLAIMED_STALE_MS = 60 * MIN_MS;
export const LEASE_STALE_MS = 2 * MIN_MS;
export const QUESTION_WAIT_MS = 24 * HOUR_MS;
/** A round this old with no run of its own still live is stuck: a run is capped at 45 minutes, so an hour is past every way it could still be working. */
export const ROUND_STUCK_MS = 60 * MIN_MS;
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
  /** A lead_collect job for this run is scheduled or fired. */
  collect_scheduled: boolean;
  /** The lead_collect jobs for this run that failed for good, each after its three tries. */
  collects_failed: number;
}

export interface SweepRoundRow {
  id: string;
  tenant_id: string;
  state: string;
  waiting_since: string | null;
  created_at: string;
}

type SweepAction =
  | { kind: "collect"; runId: string; tenantId: string; seq: string }
  | { kind: "abort"; runId: string; tenantId: string; apifyRunId: string; seq: string }
  | { kind: "give_up"; runId: string; apifyRunId: string; owner: string }
  | { kind: "reconcile"; runId: string }
  | { kind: "mark_unknown"; runId: string; owner: string }
  | { kind: "orphan"; runId: string; owner: string }
  | { kind: "release_lease"; runId: string; owner: string; gen: number }
  | { kind: "end_question"; roundId: string; tenantId: string }
  | { kind: "end_stuck"; roundId: string; tenantId: string };

export function planLeadSweep(rows: { runs: SweepRunRow[]; rounds: SweepRoundRow[] }, now: number): SweepAction[] {
  const out: SweepAction[] = [];
  const seq = `s${Math.floor(now / MIN_MS)}`;
  for (const r of rows.runs) {
    if (r.lease_owner && r.lease_until && Date.parse(r.lease_until) < now - LEASE_STALE_MS) {
      out.push({ kind: "release_lease", runId: r.id, owner: r.lease_owner, gen: r.lease_gen });
    }
    if (r.state === "unknown") {
      out.push({ kind: "reconcile", runId: r.id });
      continue;
    }
    if (r.state === "starting" && r.claimed_by && Date.parse(r.claimed_at ?? r.created_at) < now - STARTING_STALE_MS) {
      // The claimer never recorded a start: the next sweep reconciles it as unknown.
      out.push({ kind: "mark_unknown", runId: r.id, owner: r.claimed_by });
      continue;
    }
    if (r.state === "claimed" && !r.claimed_by && Date.parse(r.created_at) < now - CLAIMED_STALE_MS) {
      out.push({ kind: "orphan", runId: r.id, owner: `sweep:${Math.floor(now / MIN_MS)}` });
      continue;
    }
    if (r.state !== "running" || !r.apify_run_id) continue;
    if (r.collects_failed >= GIVE_UP_FAILED_COLLECTS) {
      // Not collected again, so not rung again: failed in our books, and the round ends with it when nothing else of
      // it is live. A collect still on its way then finds the round ended, so it is not waited for.
      out.push({
        kind: "give_up",
        runId: r.id,
        apifyRunId: r.apify_run_id,
        owner: `sweep:${Math.floor(now / MIN_MS)}`,
      });
      continue;
    }
    if (Date.parse(r.created_at) < now - RUN_MAX_AGE_MS) {
      out.push({ kind: "abort", runId: r.id, tenantId: r.tenant_id, apifyRunId: r.apify_run_id, seq });
      continue;
    }
    if (!r.collect_scheduled) out.push({ kind: "collect", runId: r.id, tenantId: r.tenant_id, seq });
  }
  const working = new Set(rows.runs.filter((r) => LIVE_RUN_STATES.has(r.state)).map((r) => r.round_id));
  for (const rd of rows.rounds) {
    if (rd.state === "ended") continue;
    if (rd.state === "waiting_on_owner") {
      // A question is waiting on a person, not stuck: it keeps its own day.
      if (rd.waiting_since && Date.parse(rd.waiting_since) < now - QUESTION_WAIT_MS)
        out.push({ kind: "end_question", roundId: rd.id, tenantId: rd.tenant_id });
      continue;
    }
    if (!working.has(rd.id) && Date.parse(rd.created_at) < now - ROUND_STUCK_MS) {
      out.push({ kind: "end_stuck", roundId: rd.id, tenantId: rd.tenant_id });
    }
  }
  return out;
}
