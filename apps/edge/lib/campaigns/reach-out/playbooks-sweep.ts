/**
 * The playbooks sweep: every hour, each workspace with a running moment or reach-out step whose hour it is, by the business's
 * own clock, is handed a job, and the ledger runs it (decision 0115, 00569; the running is workspace-runs.ts). Then each
 * business whose 6 PM it is gets its reach-out numbers as a line on its bell.
 *
 * The route is api/cron/playbooks.ts: sweepDoor (lib/ops/sweep-door.ts) names the request, finds the database and checks the
 * sweep key, then hands this its tick, so nothing below runs for a knock without the key.
 *
 * Called by pg_cron at :05 ('playbooks-sweep', 00048) through trigger_playbooks_sweep, which asks the edge every hour
 * whatever is due (request_sweep, 00086), with the Vault sweep key in x-cron-key (authorizeCron). The request is recorded in
 * sweep_status and sweep_health() judges the answer (registered in 00107).
 *
 * WHY IT HANDS THEM OUT. This ran each moment and step itself, serially, inside a sixty-second function, so it had a ceiling:
 * twenty-five moments and twenty-five steps an hour across every business, 600 a day of each, however many were due. The
 * rotation made that fair and the alarm made it honest, and the campaigns past it still did not go out on their day. A
 * job a workspace has no such ceiling: it waits its turn behind a customer's reply (lane 2), a workspace with nothing
 * running goes first, a throw is tried again, and Health shows what failed. A workspace still due next hour because its job
 * is still waiting writes no second one (the kind's key), and the ledger's own alarm says when the work outruns it.
 *
 * First of all, a missed day's run ends itself (endRunsWhoseDayPassed): a playbook's run still waiting for approval after the
 * day it was made for can only be skipped (the approve verb refuses it, contracts runApprovalRefusal), so the sweep skips it
 * through the cancel verb, as the system (a decision with no hand on it, reason `day_passed`), up to DAY_PASSED_BATCH a tick
 * and until DAY_PASSED_UNTIL_MS. A paused or ended workspace's are skipped too: the day passed whatever the standing. Its "is
 * ready" line on the bell reads as read (contracts notice-closes.ts), and the owner is told it did not go (contracts
 * skippedRunNotice, decision 0064: nothing is skipped in silence), on the bell and by mail as the ready line was; its people
 * are in line again (00453), but for a visit's, whom no later batch names: its notice says it did not reach them. A read that
 * fails is logged (runs_day_passed_read_failed) and the hand-out still happens (the wiring's second audit, S7-3).
 *
 * Answers: 503 without a database, 401 or 503 at the door, and 500 when the moments cannot be handed out (an edge deployed
 * ahead of 00569 fails loudly, not quietly). Steps that cannot be handed out are logged (reach_outs_read_failed) and the
 * moments still are. Its lines carry `sweep: "playbooks"`; the tick ends in one playbooks_swept with the counts.
 */
import { json } from "../../shared/http.js";
import type { pg } from "../../shared/pg.js";
import type { Logger } from "../../shared/log.js";
import { HAND_OUT_SPREAD_SECONDS } from "../../shared/sweep-rotation.js";
import { tellReachOutDays } from "./day-numbers.js";
import { cancelBroadcastFrom, recordSystemDecision, listWaitingPlaybookRuns } from "@chanlytics/db/campaigns";
import { handOutStepsDue } from "@chanlytics/db/jobs";
import { cancelBroadcast } from "@chanlytics/core";
import {
  AppError,
  addressOf,
  audienceTrigger,
  clockNearWhen,
  runDaysAt,
  runTooLate,
  skippedRunNotice,
} from "@chanlytics/contracts";
import { notify } from "../../shared/alerts/notify.js";
import { loadTenantNotifications } from "../../shared/tenant-runtime.js";
import type { SweepTick } from "../../ops/sweep-door.js";

/** When the day's reach-out lines at 6 PM stop being written for the tick: inside the function's sixty seconds. */
const REACH_OUT_DAY_UNTIL_MS = 50_000;

/** The runs waiting for approval read a tick, oldest day first: the rest are read on the hours after. */
const DAY_PASSED_BATCH = 50;

/** When the tick stops ending missed days' runs, so the hand-out keeps its time: what is left ends next hour. */
const DAY_PASSED_UNTIL_MS = 5_000;

type SweepCounts = Record<"moments" | "steps" | "told" | "ended", number>;

/** One tick: its database, its moment, its log, what it has counted so far, and when it began. */
interface Tick {
  db: NonNullable<ReturnType<typeof pg>>;
  now: Date;
  L: Logger;
  out: SweepCounts;
  started: number;
}

/**
 * A missed day's run ends itself: each playbook's run still waiting for approval whose day has passed in its workspace's
 * zone (contracts runTooLate, the approve verb's own rule, in the zone the verb reads) is skipped through the cancel
 * verb, as the system, and its owner is told (tellSkipped). A run approved or skipped since the read is left as it is
 * (the verb's conflict), quietly. Counted as `ended`.
 */
async function endRunsWhoseDayPassed(tick: Tick): Promise<void> {
  const { db, now, L, out } = tick;
  let runs: Awaited<ReturnType<typeof listWaitingPlaybookRuns>>;
  try {
    runs = await listWaitingPlaybookRuns(db, { limit: DAY_PASSED_BATCH });
  } catch (e) {
    L.error("runs_day_passed_read_failed", { error: e instanceof Error ? e.message : String(e) });
    return;
  }
  for (const run of runs) {
    if (Date.now() - tick.started > DAY_PASSED_UNTIL_MS) return;
    if (!runTooLate(run, runDaysAt(run.timezone, now))) continue;
    try {
      await cancelBroadcast(
        {
          // A run waiting for approval never had a send job: nothing to withdraw.
          withdraw: () => Promise.resolve(0),
          cancel: (id, from) => cancelBroadcastFrom(db, { tenantId: run.tenant_id, id, from }),
          record: (subjectType, subjectId, verb, payload) =>
            recordSystemDecision(db, { tenantId: run.tenant_id, subjectType, subjectId, verb, payload }),
        },
        // A freed time's batch ends when its time comes (0082); every other run when its day passes.
        {
          row: { id: run.id, state: run.state, name: run.name },
          reason: run.offered_start ? "time_passed" : "day_passed",
        },
      );
      out.ended += 1;
      L.info("run_day_passed_skipped", {
        tenant_id: run.tenant_id,
        broadcast_id: run.id,
        run_for: run.run_for,
        ...(run.offered_start ? { offered_start: run.offered_start } : {}),
      });
      await tellSkipped(db, run, L, now);
    } catch (e) {
      if (e instanceof AppError && e.code === "conflict") continue;
      L.error("run_day_passed_failed", {
        tenant_id: run.tenant_id,
        broadcast_id: run.id,
        error: e instanceof Error ? e.message : String(e),
      });
    }
  }
}

/**
 * A skipped run told to its owner (decision 0064): the bell row opens the run, which says it was skipped and why, and the
 * mail goes where the workspace's notices go. The skip stands either way: a notice that fails is logged, never retried.
 */
async function tellSkipped(
  db: Tick["db"],
  row: Awaited<ReturnType<typeof listWaitingPlaybookRuns>>[number],
  log: Logger,
  now: Date,
) {
  const about = row.audience && typeof row.audience === "object" ? (row.audience as { label?: unknown }).label : null;
  // Its moment, as the run kept it: a visit's people are not in line for a later batch, and the notice says so; a freed
  // time's says the time it offered.
  const notice = skippedRunNotice(
    typeof about === "string" && about ? about : row.name,
    row.recipient_count,
    audienceTrigger(row.audience),
    row.offered_start ? clockNearWhen(Date.parse(row.offered_start), row.timezone, now.getTime()) : null,
  );
  try {
    const target = await loadTenantNotifications(db, row.tenant_id);
    await notify(
      { tenantId: row.tenant_id, ...target },
      {
        kind: "playbook",
        route: addressOf({ kind: "send", id: row.id }),
        about: { type: "broadcast", id: row.id },
        subject: notice.subject,
        body: notice.body,
      },
    );
  } catch (e) {
    log.error("run_day_passed_untold", {
      tenant_id: row.tenant_id,
      broadcast_id: row.id,
      error: e instanceof Error ? e.message : String(e),
    });
  }
}

export async function sweepPlaybooks({ db, L, started }: SweepTick): Promise<Response> {
  const now = new Date();
  const out: SweepCounts = { moments: 0, steps: 0, told: 0, ended: 0 };
  await endRunsWhoseDayPassed({ db, now, L, out, started });
  try {
    out.moments = await handOutStepsDue(db, {
      kind: "moment",
      jobKind: "campaign_moments",
      at: now,
      spreadSeconds: HAND_OUT_SPREAD_SECONDS,
    });
  } catch (e) {
    L.error("playbooks_read_failed", { error: e instanceof Error ? e.message : String(e) });
    return json(500, { ok: false });
  }
  try {
    out.steps = await handOutStepsDue(db, {
      kind: "reach_out",
      jobKind: "reach_out_steps",
      at: now,
      spreadSeconds: HAND_OUT_SPREAD_SECONDS,
    });
  } catch (e) {
    L.error("reach_outs_read_failed", { error: e instanceof Error ? e.message : String(e) });
  }
  // The day's reach-out numbers at 6 PM in each business's zone (Reach out Part 6, H12): a line in the bell, once.
  out.told = await tellReachOutDays(db, now, L, started + REACH_OUT_DAY_UNTIL_MS);
  L.info("playbooks_swept", { ...out });
  return json(200, { ok: true, ...out });
}
