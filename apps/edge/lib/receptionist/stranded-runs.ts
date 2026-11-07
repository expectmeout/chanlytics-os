/**
 * A run nothing is sending, found and said: a broadcast still `scheduled` well past its time with no send job on the
 * ledger (packages/db listStrandedRuns). It happens when an approval moved the run and then could neither write its job nor
 * put the run back to wait (core approveRun): the page said "Scheduled" for ever, and nobody was told.
 *
 * Each is marked not sent (`run_interrupted`, the words the run's page already has) and its owner is told once, on the
 * bell and by mail, with the run's own link: what the failure words say to do, by whose run it was (contracts
 * broadcastFailureFix: a playbook's run is never told to send it again). Nobody got it: a run leaves `scheduled` the
 * moment its first batch starts (core startSending).
 *
 * Run from the deadman tick (every ten minutes), after the run's time plus a margin the jobs tick never needs, and over
 * the last week: a run stranded before this watchdog existed is found too. Bounded per tick; every write is guarded on
 * the row's present state, so two overlapping ticks tell once.
 */
import { broadcastFailureFix, audienceTrigger, MIN_MS, DAY_MS, runRoute } from "@chanlytics/contracts";
import { failStrandedRun, listStrandedRuns, type StrandedRun } from "@chanlytics/db/campaigns";
import type { SweepTick } from "../ops/sweep-door.js";
import type { notifyOnce as notifyOnceFn } from "../shared/alerts/notify.js";
import type { loadTenantNotifications as loadFn } from "../shared/tenant-runtime.js";

/** A run this long past its time with no job is nobody's: the jobs tick claims a due job within a minute. */
const STRANDED_AFTER_MS = 10 * MIN_MS;
/** How far back a stranded run is still found. */
const LOOKBACK_MS = 7 * DAY_MS;
const BATCH = 50;

interface StrandedPorts {
  db: SweepTick["db"];
  L: SweepTick["L"];
  notifyOnce: typeof notifyOnceFn;
  loadTenantNotifications: typeof loadFn;
  /** When to stop telling and leave the rest to the next tick: the deadman tick's own work comes after this. */
  deadline: number;
  now?: () => number;
}

/** What its owner is told: the run named, why it did not go, and what becomes of it. */
function strandedNews(strandedRun: StrandedRun) {
  const fix = broadcastFailureFix("run_interrupted", 0, {
    playbook_id: strandedRun.playbook_id,
    trigger: audienceTrigger(strandedRun.audience),
  });
  return {
    kind: "broadcast_stopped" as const,
    route: runRoute(strandedRun.id),
    about: { type: "broadcast", id: strandedRun.id },
    subject: `Campaign “${strandedRun.name}” not sent`,
    body: `It was due to go out, and nothing was left to send it, so it is marked not sent. ${fix ?? ""}`.trim(),
    redactedBody: "A campaign run in this workspace was due with nothing left to send it; it is marked not sent.",
  };
}

/** How many runs were found stranded and marked not sent this tick. */
export async function sweepStrandedRuns(strandedPorts: StrandedPorts): Promise<{ stranded: number }> {
  const now = strandedPorts.now ? strandedPorts.now() : Date.now();
  const runs = await listStrandedRuns(strandedPorts.db, {
    since: new Date(now - LOOKBACK_MS),
    before: new Date(now - STRANDED_AFTER_MS),
    limit: BATCH,
  });
  let stranded = 0;
  for (const run of runs) {
    // A backlog (the first tick over the week, a slow mail provider) is left to the next tick, never the tick's other work.
    if ((strandedPorts.now ? strandedPorts.now() : Date.now()) > strandedPorts.deadline) break;
    try {
      if (!(await failStrandedRun(strandedPorts.db, { tenantId: run.tenant_id, id: run.id }))) continue;
      stranded += 1;
      // Told once (notifyOnce: the row, then the mail, and the row withdrawn when the mail fails). A notice that could not
      // be given is an error line: the run is not found again (it is no longer scheduled), and its page says not sent.
      const addressing = await strandedPorts.loadTenantNotifications(strandedPorts.db, run.tenant_id);
      const notice = await strandedPorts.notifyOnce({ tenantId: run.tenant_id, ...addressing }, strandedNews(run));
      if (notice) strandedPorts.L.warn("stranded_run_failed", { tenant_id: run.tenant_id, broadcast_id: run.id });
      else strandedPorts.L.error("stranded_run_untold", { tenant_id: run.tenant_id, broadcast_id: run.id });
    } catch (e) {
      strandedPorts.L.error("stranded_run_sweep_failed", {
        tenant_id: run.tenant_id,
        broadcast_id: run.id,
        error: e instanceof Error ? e.message : String(e),
      });
    }
  }
  return { stranded };
}
