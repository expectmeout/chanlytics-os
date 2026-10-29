/**
 * The sweep's reconciliation: an unknown start looked for in the provider's own list (claim.ts), and reconciled, or
 * failed once its grace is over. And its give-up: a running run whose collects keep failing, failed in our books.
 */

import { actorsOf } from "../cards";
import { FINAL_RUN_STATES, runStateOf } from "../endings";
import type { CollectCommitResult, LeadPorts, LeadRunRow } from "../ports";
import { findOurRun } from "./claim";
import { LEASE_SECONDS, UNKNOWN_START_GRACE_MS, minute, outOfTime } from "./rules";

/* ------------------------------------------------------------- the sweep */

export type ReconcileOutcome = { runId: string; kind: "reconciled" | "failed" | "waiting" };

/** An unknown start is reconciled against the provider's own list; ours carry the run row id in their input (PRD §0.5, E1). */
export async function reconcileUnknownRuns(p: LeadPorts, unknownRuns: LeadRunRow[]): Promise<ReconcileOutcome[]> {
  const out: ReconcileOutcome[] = [];
  for (const row of unknownRuns) {
    if (outOfTime(p)) break;
    const round = await p.db.round(row.round_id);
    const actors = actorsOf(round?.plan ?? { card: "local_businesses" });
    const found = await findOurRun(p, row.purpose === "check" ? actors.check : actors.discover, row);
    if (found) {
      await p.db.runReconcile(row.id, found.id, found.datasetId, runStateOf(found.status));
      await p.schedule("lead_collect", { run_id: row.id, seq: `s${minute(p)}` }, 0);
      out.push({ runId: row.id, kind: "reconciled" });
      continue;
    }
    if (p.now().getTime() - Date.parse(row.claimed_at ?? row.created_at) > UNKNOWN_START_GRACE_MS) {
      await p.db.runReconcile(row.id, null, null, "failed");
      await p.schedule("lead_collect", { run_id: row.id, seq: `s${minute(p)}` }, 0);
      out.push({ runId: row.id, kind: "failed" });
    } else out.push({ runId: row.id, kind: "waiting" });
  }
  return out;
}

export type GiveUpOutcome =
  | { kind: "given_up"; roundEnded: boolean }
  | { kind: "busy" }
  | { kind: "not_running" }
  | { kind: "lost"; why: Exclude<CollectCommitResult, { ok: true }>["why"] };

/**
 * A running run the sweep gives up on (its collects failed for good too often, edge lead-sweep.ts): failed in our books
 * by a commit of its own, under the lease, at the offset it reached, so what it committed stays and nothing new settles.
 * When nothing else of its round is live, the same commit ends the round "the source failed" (00140's lead_round_end:
 * the round keeps what it found and gives back what it reserved and did not use), so no collect that comes after, the
 * provider's own delivery among them, can decide the round from a run that was never read to its end. Beside another
 * live run, the round goes on, and that run's decision weighs this one as failed. Asked again, it does nothing.
 */
export async function giveUpRun(p: Pick<LeadPorts, "db">, runId: string, owner: string): Promise<GiveUpOutcome> {
  const gen = await p.db.runLease(runId, owner, LEASE_SECONDS);
  if (gen === null) return { kind: "busy" };
  try {
    // Read under the lease: no collect can commit while it is ours, so the state and the offset hold until ours does.
    const run = await p.db.run(runId);
    if (!run || run.state !== "running") return { kind: "not_running" };
    const others = (await p.db.runsOfRound(run.round_id)).filter(
      (r) => r.id !== run.id && !FINAL_RUN_STATES.has(r.state),
    );
    const roundEnds = others.length === 0;
    const res = await p.db.collectCommit(run.id, owner, gen, run.read_offset, run.read_offset, {
      judgment: null,
      places: [],
      usage_usd: run.usage_usd,
      items_seen: run.items_seen,
      run_state: "failed",
      next: null,
      round: roundEnds ? { state: null, question: null, ending: "source_failed" } : null,
    });
    return res.ok ? { kind: "given_up", roundEnded: roundEnds } : { kind: "lost", why: res.why };
  } finally {
    await p.db.runRelease(runId, owner, gen);
  }
}
