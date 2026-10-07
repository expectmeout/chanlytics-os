/**
 * The claim (E1) the start and the check make before any provider call, and the look through the provider's own
 * list for the run that carries our row's id, which the sweep (sweep.ts) makes too. The shared rules are rules.ts.
 */

import { MIN_MS } from "@chanlytics/contracts";
import { runStateOf } from "../endings";
import type { LeadPorts, LeadRunRow } from "../ports";
import { INPUT_MARKER, PROVIDER_RUN_PAGE, iso, isRefused, isRetryable } from "./rules";

/** The provider's run that carries this row's id in its input, if one exists. */
async function findOurRun(
  p: LeadPorts,
  actor: string,
  row: LeadRunRow,
): Promise<{ id: string; status: string; datasetId: string | null } | null> {
  const since = new Date(Date.parse(row.claimed_at ?? row.created_at) - 5 * MIN_MS);
  const runs = await p.apify.listActorRuns(actor, iso(since));
  for (const r of runs.slice(0, PROVIDER_RUN_PAGE)) {
    const input = (await p.apify.runInput(r.id)) as Record<string, unknown> | null;
    if (input && input[INPUT_MARKER] === row.id) return r;
  }
  return null;
}

/**
 * The claim (E1). "mine" when this job holds the row and may start it. A row
 * this same job claimed earlier and never recorded is looked for at the
 * provider first: found, it is reconciled and "recovered"; not found, it is
 * "mine" to start. Anybody else's is "not_mine".
 */
async function claimOrRecover(
  p: LeadPorts,
  actor: string,
  row: LeadRunRow,
  owner: string,
): Promise<"mine" | "recovered" | "not_mine"> {
  if (await p.db.runClaim(row.id, owner)) return "mine";
  if (!(row.claimed_by === owner && row.state === "starting")) return "not_mine";
  const found = await findOurRun(p, actor, row);
  if (!found) return "mine";
  await p.db.runMarkUnknown(row.id, owner);
  await p.db.runReconcile(row.id, found.id, found.datasetId, runStateOf(found.status));
  await p.schedule("lead_collect", { run_id: row.id, seq: "p0" }, 0);
  return "recovered";
}

/** A start's trouble, sorted: a refusal fails the run through the reconcile door; no answer leaves it unknown; a busy provider throws for the ledger. */
async function startFailed(p: LeadPorts, row: LeadRunRow, owner: string, e: unknown): Promise<"refused" | "unknown"> {
  if (isRefused(e)) {
    await p.db.runMarkUnknown(row.id, owner);
    await p.db.runReconcile(row.id, null, null, "failed");
    return "refused";
  }
  if (isRetryable(e) && e.status === null) {
    // Nobody knows whether it runs. Never started again blindly; the sweep reconciles it (PRD §0.5).
    await p.db.runMarkUnknown(row.id, owner);
    return "unknown";
  }
  throw e; // 429 or 5xx: nothing started, and the row is this job's to start when the ledger tries again
}

export { findOurRun, claimOrRecover, startFailed };
