/**
 * The sweep's reconciliation: an unknown start looked for in the provider's own list (claim.ts), and reconciled, or
 * failed once its grace is over.
 */

import { CARDS } from "../cards";
import { runStateOf } from "../endings";
import type { LeadPorts, LeadRunRow } from "../ports";
import { findOurRun } from "./claim";
import { UNKNOWN_START_GRACE_MS, minute, outOfTime } from "./rules";

/* ------------------------------------------------------------- the sweep */

export type ReconcileOutcome = { runId: string; kind: "reconciled" | "failed" | "waiting" };

/** An unknown start is reconciled against the provider's own list; ours carry the run row id in their input (PRD §0.5, E1). */
export async function reconcileUnknownRuns(p: LeadPorts, unknownRuns: LeadRunRow[]): Promise<ReconcileOutcome[]> {
  const out: ReconcileOutcome[] = [];
  for (const row of unknownRuns) {
    if (outOfTime(p)) break;
    const round = await p.db.round(row.round_id);
    const card = CARDS[round?.plan.card ?? "local_businesses"];
    const found = await findOurRun(p, row.purpose === "check" ? card.checker.actor : card.actor, row);
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
