/**
 * One reach-out step's run, planned now (Part 3's sweep loop body, moved so the sheet's Start can ask it too: Part 4
 * F11, R13). The run context, core's runReachOut, and the day stamped on the row. A step whose context cannot be read
 * keeps its day open for the next hour, as the sweep always did. The playbooks sweep (api/cron/playbooks.ts) and the
 * run-now door (api/admin/playbooks-run.ts) both call it.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "../packages/db.js";
import { reachOutRunIdFor, runReachOut } from "../packages/core.js";
import { localDate } from "../packages/contracts.js";
import { reachOutRunContext, type ReachOutRow } from "./run-context.js";
import type { Logger } from "../log.js";

type Db = SupabaseClient<Database>;

export interface ReachOutStepRun {
  /** core's outcomes, and "failed" when the step's context could not be read. */
  outcome: "sent" | "held" | "empty" | "off" | "failed";
  /** Why it held, came back empty, is off, or failed (R14: the words are contracts'). */
  reason?: string;
  planned: number;
  runFor: string;
  /** The run it made, or the day's run it already had. */
  runId: string | null;
}

export async function runReachOutStep(
  db: Db,
  row: ReachOutRow,
  now: Date,
  tz: string,
  log: Logger,
): Promise<ReachOutStepRun> {
  const runFor = localDate(tz, now);
  const tried = () => db.from("playbooks").update({ last_run_at: now.toISOString() }).eq("id", row.id);
  const ctx = await reachOutRunContext(db, row, now);
  if ("error" in ctx) {
    await tried();
    // A paused workspace is said as the workspace's, never as the chain's own pause (core's "paused").
    return ctx.error === "paused"
      ? { outcome: "off", reason: "workspace_paused", planned: 0, runFor, runId: null }
      : { outcome: "failed", reason: ctx.error, planned: 0, runFor, runId: null };
  }
  const r = await runReachOut(ctx.ports, ctx.step, { runFor });
  log.info("reach_out_ran", { tenant_id: row.tenant_id, playbook_id: row.id, ...r });
  await db.from("playbooks").update({ last_run_for: runFor, last_run_at: now.toISOString() }).eq("id", row.id);
  const reason = "reason" in r ? r.reason : undefined;
  const runId = r.planned > 0 || reason === "already_ran" ? await reachOutRunIdFor(row.id, runFor) : null;
  return { outcome: r.outcome, reason, planned: r.planned, runFor, runId };
}
