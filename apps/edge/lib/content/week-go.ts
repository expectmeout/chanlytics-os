/**
 * A week AI may approve (00712; the content loop PRD's 12.4, canvas v18 board B5). The owner sets Approve the week on the
 * Autonomy pane: holding it, a ready week goes up at 8:00 AM in the business's zone unless they stop it; sending it, it
 * goes as soon as it is ready. The plan job holds each ready week here (holdReadyWeek), and content_week_go puts it up at
 * its time (putTheWeekUp): everything read again first (the week still ready and not stopped, AI not paused, the rung
 * still holding or sending it, which the door reads once more in its own transaction), each slot held to the checks the
 * owner's press holds it to (core weekApprovalOf), and the week approved by the door as the service with the rung on its
 * snapshot, which queues it to be made.
 *
 * The making queue, sized for every held week of a zone at one 8:00: from the moment a week is held (Sunday evening) the
 * queue (content_weeks_start) PREPARES it in turn through the night, at most WEEKS_MAKING_AT_ONCE weeks at a time
 * platform-wide (a cap contracts derives from what the database's front can take), the earliest first post first, each
 * with its content_week_make job (makeTheWeek), which asks the dashboard: its pictures drawn and each placement readied on
 * its slot, nothing approved. At 8:00 the approval places what was prepared in its own transaction (one call a week,
 * spread over the hour before each week's first post); what was not prepared is made in turn after. A week stopped before
 * 8:00 has cost its pictures' drawing alone: no reel is begun, no model asked.
 *
 * A try again after the approval starts the queue again (it begins only what waits). A week the owner approved by hand
 * before its time is theirs: the job leaves it.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  asTenantId,
  WEEK_MADE_DOOR,
  WEEK_MAKING_QUEUE,
  weekGoesAtOf,
  type TenantId,
  type WeekMadeBody,
} from "@chanlytics/contracts";
import { weekApprovalOf } from "@chanlytics/core";
import { callDashboard } from "@chanlytics/channels/tokens";
import {
  approveWeek,
  findPlanForJob,
  findWeekRung,
  holdWeek,
  readContentWeek,
  startWeeksMaking,
  type WeekHold,
} from "@chanlytics/db/files";
import { findWorkspaceZone, isSendingStopped } from "@chanlytics/db/workspace";
import { jsonCopyOf } from "@chanlytics/db/shared";
import type { Database } from "@chanlytics/db/types";
import type { ClaimedJob } from "@chanlytics/jobs";
import { dashboardOrigin } from "../shared/dashboard-origin.js";
import { env } from "../shared/env.js";
import { logger } from "../shared/log.js";

type Db = SupabaseClient<Database>;

/** How long the dashboard has to take the making (it answers at once and makes after it has answered). */
const DASHBOARD_ANSWER_MS = 15_000;

/** How a ready week goes, as its notice says it: held to 8:00 AM, sent now, or waiting for the owner's press. */
export type WeekGoes = "held" | "sent" | "asks";

/** The plan job's last step: a ready week held to its time under the rung, or let go where the rung asks. */
export async function holdReadyWeek(
  db: Db,
  week: { tenantId: TenantId; planId: string; zone: string; nowMs: number },
): Promise<WeekGoes> {
  const mode = await findWeekRung(db, week.tenantId);
  const goesAt = weekGoesAtOf(mode, week.zone, week.nowMs);
  const held: WeekHold = await holdWeek(db, week.tenantId, { planId: week.planId, goesAt });
  if (held !== "held") return "asks";
  // Prepared ahead from now, in its turn.
  const started = await startWeeksMaking(db, WEEK_MAKING_QUEUE);
  const log = logger({ tenant_id: week.tenantId });
  log.info("week_held", { plan_id: week.planId, goes_at: goesAt, started });
  return mode === "auto" ? "sent" : "held";
}

/** Asks the dashboard to make a week AI approved; throws where it did not take it, so the ledger asks again. */
export type WeekMaker = (made: WeekMadeBody) => Promise<void>;

/** The real ask: one call, signed for the dashboard's door, that workspace and that body. */
export const askDashboardToMake: WeekMaker = async (made) => {
  const secret = env.EDGE_CALL_SECRET;
  if (!secret) throw new Error("content_week_make: no EDGE_CALL_SECRET to sign the dashboard's call with");
  const answer = await callDashboard(
    { origin: dashboardOrigin(), secret, path: WEEK_MADE_DOOR.path },
    { workspace: made.tenant_id, body: made, timeoutMs: DASHBOARD_ANSWER_MS },
  );
  if (!answer.ok) throw new Error(`content_week_make: the dashboard did not take the week (${answer.status})`);
};

/** A held week let go: nothing on a screen says it goes up, and it waits for the owner's press. */
async function letGo(db: Db, at: { tenantId: TenantId; planId: string }, why: string): Promise<{ skipped: string }> {
  await holdWeek(db, at.tenantId, { planId: at.planId, goesAt: null });
  const log = logger({ tenant_id: at.tenantId });
  log.info("week_let_go", { plan_id: at.planId, why });
  return { skipped: why };
}

/** The queue started: the weeks waiting begun in turn, as many as its cap lets. */
async function startTheQueue(db: Db, tenantId: TenantId, planId: string): Promise<void> {
  const started = await startWeeksMaking(db, WEEK_MAKING_QUEUE);
  const log = logger({ tenant_id: tenantId });
  log.info("week_queued", { plan_id: planId, started });
}

/** The job (content_week_go): a held week approved at its time, as the owner's press would, under the rung, and queued. */
export async function putTheWeekUp(db: Db, job: ClaimedJob): Promise<void | { skipped: string }> {
  const planId = typeof job.payload.plan_id === "string" ? job.payload.plan_id : "";
  const plan = await findPlanForJob(db, planId);
  if (!plan) return { skipped: "gone" };
  const tenantId = asTenantId(plan.tenant_id);
  // Approved already: by the rung on a try before this one (the queue started again), or by the owner's own press.
  if (plan.status === "approved")
    return plan.approved_by === null && plan.goes_at ? startTheQueue(db, tenantId, plan.id) : { skipped: "approved" };
  if (plan.status !== "ready") return { skipped: plan.status };
  if (plan.stopped_at || !plan.goes_at) return { skipped: "stopped" };
  const at = { tenantId, planId: plan.id };
  if (await isSendingStopped(db, tenantId)) return letGo(db, at, "paused");
  const zone = (await findWorkspaceZone(db, tenantId)) ?? "UTC";
  const week = await readContentWeek(db, tenantId, plan.week_of);
  const { going, leftOut, snapshot } = weekApprovalOf(week.slots, zone, Date.now());
  if (going.length === 0) return letGo(db, at, "nothing");
  const answer = await approveWeek(db, tenantId, { planId: plan.id, snapshot: jsonCopyOf(snapshot) });
  // The door read the rung, the stop and the time again: anything but approved leaves the week to its owner.
  if (answer.fate === "asks") return { skipped: "asks" };
  if (answer.fate !== "approved") return { skipped: answer.fate };
  const log = logger({ tenant_id: tenantId });
  log.info("week_went", {
    plan_id: plan.id,
    slots: answer.slots,
    left_out: leftOut.length,
  });
  await startTheQueue(db, tenantId, plan.id);
}

/**
 * The job (content_week_make): a week's pass in its turn, prepared while it is held or what is left made once AI approved
 * it. The queue began it (its place is held until the pass is said done, or its lease ends); the dashboard is asked, and
 * decides the pass by the week as it stands. `make` is the real call; a test hands its own.
 */
export async function makeTheWeek(
  db: Db,
  job: ClaimedJob,
  make: WeekMaker = askDashboardToMake,
): Promise<void | { skipped: string }> {
  const planId = typeof job.payload.plan_id === "string" ? job.payload.plan_id : "";
  const plan = await findPlanForJob(db, planId);
  if (!plan) return { skipped: "gone" };
  if (plan.made_at) return { skipped: "made" };
  if (!plan.making_since) return { skipped: "waiting" };
  // Held and not stopped (prepared ahead), or approved by the rung (what is left made). The owner's press makes the week
  // it approves; a week stopped or let go waits for that press.
  const held = plan.status === "ready" && !!plan.goes_at && !plan.stopped_at;
  const rungs = plan.status === "approved" && plan.approved_by === null;
  if (!held && !rungs) return { skipped: "not_the_rung_s" };
  await make({ tenant_id: asTenantId(plan.tenant_id), plan_id: plan.id });
}
