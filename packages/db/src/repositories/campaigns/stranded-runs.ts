/**
 * Runs nothing is sending: a broadcast still `scheduled` past its time, with no send job on the ledger to start it.
 *
 * A run and its job are written whole when a run is made (00282 assemble_broadcast). An approval writes them in two
 * steps: the row moves to `scheduled`, then its job is written, and when the job cannot be written the row is put back
 * to wait (core approveRun). When that put-back fails too, the row says "scheduled" for ever and nothing will send it:
 * the ledger settles a run whose JOB died (jobs settle.ts), and this run never had one. The edge's watchdog asks for
 * these (ops/stranded-runs.ts), marks each not sent and tells its owner.
 *
 * A reach-out's run is not one: approved, it is released with no broadcast job on purpose, and the reach-out clock claims
 * its planned sends (core approveReachOut).
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { isReachOutRun } from "@chanlytics/contracts";
import type { Database } from "../../database.types";

type Db = SupabaseClient<Database>;

/** A run found with nothing to send it: whose it is, and what its owner is told about it. */
export interface StrandedRun {
  id: string;
  tenant_id: string;
  name: string;
  playbook_id: string | null;
  audience: unknown;
  scheduled_for: string;
}

/**
 * The runs still `scheduled` whose time fell between `since` and `before`, and that no broadcast_send job is scheduled
 * for or working on, oldest first, at most `limit`. Reads every workspace (the service role's client). A read that fails
 * THROWS: "could not look" is not "none".
 */
export async function strandedRuns(db: Db, p: { since: Date; before: Date; limit: number }): Promise<StrandedRun[]> {
  const { data, error } = await db
    .from("broadcasts")
    .select("id, tenant_id, name, playbook_id, audience, scheduled_for")
    .eq("state", "scheduled")
    .gt("scheduled_for", p.since.toISOString())
    .lt("scheduled_for", p.before.toISOString())
    // A reach-out's run waits `scheduled` with no broadcast job until its clock writes its first email: left out here,
    // before the limit, or a page of them would hide every run this is for. NULL is not "not reach_out" to a `neq`.
    .or("audience->>kind.is.null,audience->>kind.neq.reach_out")
    .order("scheduled_for", { ascending: true })
    .limit(p.limit);
  if (error) throw new Error(`stranded runs: cannot read the scheduled runs: ${error.message}`);
  // The test in the query is the test here too (contracts isReachOutRun): a row the filter could not see is not let through.
  const runs = (data ?? []).filter((r) => !isReachOutRun(r.audience));
  if (!runs.length) return [];
  const jobs = await db
    .from("jobs")
    .select("payload")
    .eq("kind", "broadcast_send")
    .in("state", ["scheduled", "fired"])
    .in(
      "payload->>broadcast_id",
      runs.map((r) => r.id),
    );
  if (jobs.error) throw new Error(`stranded runs: cannot read their jobs: ${jobs.error.message}`);
  const live = new Set(
    (jobs.data ?? []).map((j) => {
      const id = (j.payload as { broadcast_id?: unknown } | null)?.broadcast_id;
      return typeof id === "string" ? id : "";
    }),
  );
  return runs.filter((r) => !live.has(r.id));
}

/**
 * A stranded run marked not sent: `failed` with `run_interrupted`, the failure a run gets when nothing will carry it on
 * (jobs settle.ts failBroadcast), so its page says so in those words. Only while it is still `scheduled`: a run that a
 * late job started, or its owner stopped, is left as it is. True iff this call moved it. Throws when it cannot be written.
 */
export async function failStrandedRun(db: Db, p: { tenantId: string; id: string }): Promise<boolean> {
  const { data, error } = await db
    .from("broadcasts")
    .update({ state: "failed", failure: "run_interrupted", finished_at: new Date().toISOString() })
    .eq("id", p.id)
    .eq("tenant_id", p.tenantId)
    .eq("state", "scheduled")
    .select("id");
  if (error) throw new Error(`stranded runs: cannot mark run ${p.id} not sent: ${error.message}`);
  return (data ?? []).length > 0;
}
