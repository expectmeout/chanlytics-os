/**
 * A week AI may approve (00714; the content loop PRD's 12.4, canvas v18 board B5). The owner sets Approve the week on the
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
 * before its time is theirs: the job leaves it, and a making the queue had begun for it gives its place back at once
 * (leaveTheQueue), as one does whose week was stopped or whose rung now asks. A week changed in the instant it was
 * approved is read again by the job's next try, never left saying it goes up. Stop everything is read here and again by
 * the door, inside the approval (00727): pressed in between, the door lets the week go and nothing is approved.
 *
 * Every ending is said to the owner once (the Week review of 25 Nov 2026, C2; contracts week-endings.ts): approved, with
 * how many go up and how many were left out; or not approved because AI is paused, the setting asks again, nothing was
 * left to approve, or the week changed on every try. The owner's own stop they pressed themselves. A slot left out
 * because its reason no longer stands is held on its row with why (holdSlotsLeftOut); one whose time passed says so by
 * itself. And a week made while AI is paused is not held at all: its notice promises no time (holdReadyWeek).
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  asTenantId,
  clockTime,
  WEEK_MADE_DOOR,
  WEEK_MAKING_QUEUE,
  weekEndingOf,
  weekGoesAtOf,
  type PlanSlotDto,
  type TenantId,
  type WeekEnding,
  type WeekMadeBody,
} from "@chanlytics/contracts";
import { judgeWeekApproval } from "@chanlytics/core";
import { callDashboard } from "@chanlytics/channels/tokens";
import {
  approveWeek,
  findPlanForJob,
  findWeekRung,
  holdSlotsLeftOut,
  holdWeek,
  listClaims,
  markWeekMade,
  readContentWeek,
  startWeeksMaking,
  type WeekHold,
} from "@chanlytics/db/files";
import { findWorkspaceZone, getTenantConfig, isSendingStopped } from "@chanlytics/db/workspace";
import { jsonCopyOf } from "@chanlytics/db/shared";
import type { Database } from "@chanlytics/db/types";
import { MAX_ATTEMPTS, type ClaimedJob } from "@chanlytics/jobs";
import { dashboardOrigin } from "../shared/dashboard-origin.js";
import { env } from "../shared/env.js";
import { logger } from "../shared/log.js";
import { notifyWeekEnding, type WeekGoes } from "./plan-notices.js";

type Db = SupabaseClient<Database>;

/** How long the dashboard has to take the making (it answers at once and makes after it has answered). */
const DASHBOARD_ANSWER_MS = 15_000;

/**
 * The plan job's last step: a ready week held to its time under the rung, or let go where the rung asks. A week made
 * while AI is paused (Stop everything) is not held: the job at its time would only let it go, after its notice had said
 * it goes up. It waits for the owner, and its notice says why.
 */
export async function holdReadyWeek(
  db: Db,
  week: { tenantId: TenantId; planId: string; zone: string; nowMs: number },
): Promise<WeekGoes> {
  const mode = await findWeekRung(db, week.tenantId);
  const time = weekGoesAtOf(mode, week.zone, week.nowMs);
  const paused = time !== null && (await isSendingStopped(db, week.tenantId));
  // The door is asked either way, and decides: with no time it lets go whatever the week kept from a draft before this.
  const goesAt = paused ? null : time;
  const held: WeekHold = await holdWeek(db, week.tenantId, { planId: week.planId, goesAt });
  if (paused) return { is: "paused" };
  if (held !== "held" || !goesAt) return { is: "asks" };
  // Prepared ahead from now, in its turn.
  const started = await startWeeksMaking(db, WEEK_MAKING_QUEUE);
  const log = logger({ tenant_id: week.tenantId });
  log.info("week_held", { plan_id: week.planId, goes_at: goesAt, started });
  return mode === "auto" ? { is: "sent" } : { is: "held", goesAt };
}

/** The dashboard's answer for a week that is not AI's to make (its door's 409): not held any more, or not the rung's. */
const NOT_AI_S = 409;

/**
 * Asks the dashboard to make a week AI approved: whether it took it, or found it not AI's to make (the rung asks now, the
 * week was stopped, its owner approved it). Throws where it gave no such answer, so the ledger asks again.
 */
type WeekMaker = (week: WeekMadeBody) => Promise<"taken" | "not_ai_s">;

/** The real ask: one call, signed for the dashboard's door, that workspace and that body. */
const askDashboardToMake: WeekMaker = async (week) => {
  const secret = env.EDGE_CALL_SECRET;
  if (!secret) throw new Error("content_week_make: no EDGE_CALL_SECRET to sign the dashboard's call with");
  const answer = await callDashboard(
    { origin: dashboardOrigin(), secret, path: WEEK_MADE_DOOR.path },
    { workspace: week.tenant_id, body: week, timeoutMs: DASHBOARD_ANSWER_MS },
  );
  if (answer.status === NOT_AI_S) return "not_ai_s";
  if (!answer.ok) throw new Error(`content_week_make: the dashboard did not take the week (${answer.status})`);
  return "taken";
};

/** A held week at its time, as its endings are told: whose, which, and the time it was to go ("8:00 AM"). */
interface WeekAtItsTime {
  tenantId: TenantId;
  planId: string;
  when: string;
}

/**
 * A held week let go, and its owner told why once: nothing on a screen says it goes up, and it waits for their press.
 */
async function letTheWeekGo(db: Db, week: WeekAtItsTime, ending: WeekEnding): Promise<{ skipped: string }> {
  await holdWeek(db, week.tenantId, { planId: week.planId, goesAt: null });
  const log = logger({ tenant_id: week.tenantId });
  log.info("week_let_go", { plan_id: week.planId, why: ending.is });
  await notifyWeekEnding(db, week, ending);
  return { skipped: ending.is };
}

/** What the business says of itself, as the week's approval asks it: its settings as stored, and its owner's claims. */
const businessReader = (db: Db, tenantId: TenantId) => async () => {
  const [row, claims] = await Promise.all([getTenantConfig(db, tenantId), listClaims(db, tenantId)]);
  return { config: row?.config ?? null, claims };
};

/** A week AI approved as its notice counts it: the posts that go up, the reels made for the owner's look, what was left out. */
function approvedEnding(going: readonly PlanSlotDto[], leftOut: number): WeekEnding {
  const reels = new Set(going.filter((slot) => slot.kind === "reel").map((slot) => slot.creative)).size;
  return { is: "approved", going: going.filter((slot) => slot.kind !== "reel").length, reels, leftOut };
}

/** The queue started: the weeks waiting begun in turn, as many as its cap lets. */
async function startTheQueue(db: Db, tenantId: TenantId, planId: string): Promise<void> {
  const started = await startWeeksMaking(db, WEEK_MAKING_QUEUE);
  const log = logger({ tenant_id: tenantId });
  log.info("week_queued", { plan_id: planId, started });
}

/**
 * A making the queue began for a week that is not AI's to make: its place is given back now, not when its lease ends, and
 * the next in turn begins. Said as a prepare pass done (content_week_made): a week still ready leaves the queue, and one
 * that has moved on only frees the place.
 */
async function leaveTheQueue(db: Db, tenantId: TenantId, planId: string): Promise<{ skipped: string }> {
  const started = await markWeekMade(db, tenantId, { planId, pass: "prepare" }, WEEK_MAKING_QUEUE);
  const log = logger({ tenant_id: tenantId });
  log.info("week_queued", { plan_id: planId, started, left: true });
  return { skipped: "not_the_rung_s" };
}

/**
 * A week the rung approved on a try before this one: the queue started again, and its owner told, if that try ended
 * before it could tell them (told once, whatever the tries).
 */
async function carryOnApproved(
  db: Db,
  plan: { id: string; week_of: string; goes_at: string | null },
  week: Omit<WeekAtItsTime, "when">,
): Promise<void> {
  const zone = (await findWorkspaceZone(db, week.tenantId)) ?? "UTC";
  const read = await readContentWeek(db, week.tenantId, plan.week_of);
  const ending = weekEndingOf(read, { rung: null, paused: false, nowMs: Date.now() });
  const when = plan.goes_at ? clockTime(Date.parse(plan.goes_at), zone) : "";
  if (ending) await notifyWeekEnding(db, { ...week, when }, ending);
  await startTheQueue(db, week.tenantId, plan.id);
}

/**
 * The job (content_week_go): a held week approved at its time, as the owner's press would, under the rung, and queued.
 * However it ends, its owner is told once.
 */
export async function putTheWeekUp(db: Db, job: ClaimedJob): Promise<void | { skipped: string }> {
  const planId = typeof job.payload.plan_id === "string" ? job.payload.plan_id : "";
  const plan = await findPlanForJob(db, planId);
  if (!plan) return { skipped: "gone" };
  const tenantId = asTenantId(plan.tenant_id);
  // Approved already: by the rung on a try before this one (the queue started again), or by the owner's own press.
  if (plan.status === "approved")
    return plan.approved_by === null && plan.goes_at
      ? carryOnApproved(db, plan, { tenantId, planId: plan.id })
      : { skipped: "approved" };
  if (plan.status !== "ready") return { skipped: plan.status };
  // Stopped by its owner, who pressed it themselves: nothing more to say.
  if (plan.stopped_at || !plan.goes_at) return { skipped: "stopped" };
  const zone = (await findWorkspaceZone(db, tenantId)) ?? "UTC";
  const week: WeekAtItsTime = { tenantId, planId: plan.id, when: clockTime(Date.parse(plan.goes_at), zone) };
  if (await isSendingStopped(db, tenantId)) return letTheWeekGo(db, week, { is: "paused" });
  const nowMs = Date.now();
  const read = await readContentWeek(db, tenantId, plan.week_of);
  const approval = await judgeWeekApproval(read.slots, { zone, nowMs }, businessReader(db, tenantId));
  const { going, leftOut, snapshot } = approval;
  const left = { planId: plan.id, slots: approval.holds };
  if (going.length === 0) {
    await holdSlotsLeftOut(db, tenantId, left);
    return letTheWeekGo(db, week, { is: "nothing", leftOut: leftOut.length });
  }
  const answer = await approveWeek(db, tenantId, { planId: plan.id, snapshot: jsonCopyOf(snapshot) });
  // A slot moved or left out between the read and the approval: the week still says it goes up, so it is read again by
  // the ledger's next try. On its last try it is let go and said, never left saying it goes up or told as a failed job.
  if (answer.fate === "changed") {
    if ((job.attempts ?? 1) < MAX_ATTEMPTS) throw new Error("content_week_go: the week changed as it was approved");
    return letTheWeekGo(db, week, { is: "changed" });
  }
  // The door read the rung again and let the week go itself: the setting asks now, so the owner is told it waits. So it
  // is for everything stopped in the moment after this job's own read of it (00727: the door reads the stop inside the
  // approval, and a Stop pressed first leaves nothing approved).
  if (answer.fate === "asks" || answer.fate === "paused") {
    await notifyWeekEnding(db, week, { is: answer.fate });
    return { skipped: answer.fate };
  }
  // Stopped by its owner meanwhile, or not yet its time: anything else but approved leaves the week as it stands.
  if (answer.fate !== "approved") return { skipped: answer.fate };
  await holdSlotsLeftOut(db, tenantId, left);
  const log = logger({ tenant_id: tenantId });
  log.info("week_went", {
    plan_id: plan.id,
    slots: answer.slots,
    left_out: leftOut.length,
  });
  await notifyWeekEnding(db, week, approvedEnding(going, leftOut.length));
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
  const tenantId = asTenantId(plan.tenant_id);
  // Held and not stopped (prepared ahead), or approved by the rung (what is left made). The owner's press makes the week
  // it approves; a week stopped or let go waits for that press.
  const held = plan.status === "ready" && !!plan.goes_at && !plan.stopped_at;
  const rungs = plan.status === "approved" && plan.approved_by === null;
  if (!held && !rungs) return leaveTheQueue(db, tenantId, plan.id);
  // The dashboard reads the rung too: a held week whose rung now asks is not AI's to prepare.
  if ((await make({ tenant_id: tenantId, plan_id: plan.id })) === "not_ai_s")
    return leaveTheQueue(db, tenantId, plan.id);
}
