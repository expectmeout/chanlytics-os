/**
 * A freed time offered (decision 0081, 00497): the door the subscriber `freed_time_offer` and `visit_notice`'s clause ask
 * through (core subscribers.ts), injected into the job context by the tick (ops/jobs-tick.ts) as the website reader is.
 *
 * The workspace's running step on `slot_opened` runs for the time, through the implementation the hourly sweep and Run
 * now use (lib/playbooks.ts runPlaybook over core's run-playbook), as the system's decision under its sequence's mode.
 * Once per appointment: the batch made for it answers a second ask, and the database's unique index
 * (sequence_batches_offered_once) refuses a second made at the same moment, which fails that run, so its delivery asks
 * again and hears the first. A run that failed, or a workspace that could not be read, throws, so the delivery tries
 * again; every other outcome is an answer.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import type { FreedTimeOffer } from "../packages/contracts.js";
import type { FreedTimeRun } from "../packages/core.js";
import { freedTimeBatchOf, freedTimeStepOf, type Database } from "../packages/db.js";
import { CONTEXT_PAUSED, loadTenantRunContext, runPlaybook, type PlaybookRow } from "../playbooks.js";

type Db = SupabaseClient<Database>;

/**
 * Offer the time an appointment's change freed to the people who asked and never booked: what came of it, by the run's
 * outcome, or why nothing was asked (no step on the moment, the step or the workspace paused). `load` is the
 * workspace's run context, the sweep's own unless a caller hands another.
 */
export async function offerFreedTime(
  db: Db,
  tenantId: string,
  freed: FreedTimeRun,
  now: Date = new Date(),
  load: typeof loadTenantRunContext = loadTenantRunContext,
): Promise<FreedTimeOffer> {
  const found = await freedTimeStepOf(db, tenantId);
  if (found.state !== "running") return { offered: false, why: found.state === "paused" ? "paused" : "no_step" };
  const { step } = found;
  const made = await freedTimeBatchOf(db, tenantId, step.id, freed.from);
  if (made) return { offered: true, people: made.people, waits: made.waits };
  const ctx = await load(db, tenantId, now);
  if ("error" in ctx) {
    if (ctx.error === CONTEXT_PAUSED) return { offered: false, why: "paused" };
    throw new Error(`the workspace could not be read for its freed time: ${ctx.error}`);
  }
  const r = await runPlaybook(ctx, step as PlaybookRow, { by: { kind: "system" }, freed });
  switch (r.outcome) {
    case "sent":
      return { offered: true, people: r.eligible, waits: false };
    case "held":
      return { offered: true, people: r.eligible, waits: r.state === "pending_approval" };
    case "empty":
      return { offered: false, why: "nobody" };
    case "off":
      return { offered: false, why: "off", detail: r.skipped };
    case "failed":
      throw new Error(`the freed time's run failed: ${r.error}`);
  }
}
