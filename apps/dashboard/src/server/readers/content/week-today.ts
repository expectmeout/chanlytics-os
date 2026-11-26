import "server-only";
import {
  HOUR_MS,
  clockTime,
  contentPlanOf,
  creativesOf,
  planWeekOf,
  reviewAskOf,
  weekDaysSaid,
  weekEndingOf,
  weekEndingSaid,
  weekSizeSaid,
  zoneDayKey,
  type ContentTodayDto,
  type ReviewAskDto,
  type TenantId,
  type WeekPlanDto,
} from "@chanlytics/contracts";
import { reviewLinkOf } from "@chanlytics/db/campaigns";
import { readReviewAskFacts } from "@chanlytics/db/content";
import { findWeekRung, listGoals, readContentWeek } from "@chanlytics/db/files";
import { findWorkspaceZone, isSendingStopped } from "@chanlytics/db/workspace";
import { logAndGoOn } from "@chanlytics/log";
import { getAppointmentWord } from "../../people/deals";
import { findConfigRow } from "../../workspace/config-row";
import type { ReaderContext } from "../../shared/reader";

/**
 * The plan's proposal of the review ask for a workspace now, or none (pass 6; the PRD's 10.5; the canvas's Loop4): from
 * the owner's goals, the review link, whether an ask runs, when it was last rested (content/review-ask.ts), and the newest
 * review. The Week reads it too (plan.ts).
 */
export async function readReviewAsk(
  db: ReaderContext["ctx"]["supabase"],
  tenantId: TenantId,
  nowMs: number,
): Promise<ReviewAskDto | null> {
  const [goals, link, facts, word] = await Promise.all([
    listGoals(db, tenantId),
    reviewLinkOf(db, tenantId),
    readReviewAskFacts(db, tenantId),
    getAppointmentWord({ supabase: db }, tenantId),
  ]);
  return reviewAskOf(
    { goal: goals.some((g) => g.goal === "reviews"), reviewLink: link !== null, word, ...facts },
    nowMs,
  );
}

/**
 * How long past its time a week still ready is said to go up by itself: its approval is spread over the hour after its
 * time, and its job is tried again for some minutes more. Past that, its job has stopped or the runner stands still.
 */
const HELD_SAID_FOR_MS = 2 * HOUR_MS;

/**
 * A week as the owner reads it: held to its time (00714) only while the rung still lets AI approve it. A rung moved back
 * to asking since the week was held says nothing goes by itself, whatever the plan still keeps; and so does a week still
 * ready long after its time, so a screen never goes on saying it goes up at 8:00 AM when it did not: the owner's own
 * Approve the week is offered again.
 */
export function weekAsHeld(week: WeekPlanDto, rung: string | null, nowMs: number): WeekPlanDto {
  if (!week.plan?.goes_at) return week;
  const holds = rung === "veto" || rung === "auto";
  const overdue = nowMs - Date.parse(week.plan.goes_at) > HELD_SAID_FOR_MS;
  return holds && !overdue ? week : { ...week, plan: { ...week.plan, goes_at: null } };
}

type WeekEnded = NonNullable<NonNullable<ContentTodayDto["plan"]>["ended"]>;

/**
 * How AI's approval of the week ended, as Today's point (the Week review of 25 Nov 2026, C2): the week waits on the owner
 * and why, or AI approved it (said the day it did, and for as long as a post it left out waits for another time). Null
 * where the week has no such point. Whether AI is paused is read only for a week that waits under a setting that lets AI
 * approve, the one place it changes the words.
 */
async function readWeekEnded(
  rc: ReaderContext,
  week: WeekPlanDto,
  at: { rung: string | null; zone: string },
): Promise<WeekEnded | null> {
  const plan = week.plan;
  if (!plan) return null;
  const nowMs = rc.now.getTime();
  const holds = at.rung === "veto" || at.rung === "auto";
  const waits = holds && plan.status === "ready" && !plan.goes_at && !plan.stopped_at;
  // A read that fails says the week waits, without the pause: the point is still true, and Today is not lost for it.
  const paused = waits
    ? await isSendingStopped(rc.ctx.supabase, rc.tenantId).catch(
        logAndGoOn("whether AI is paused, for the week", false),
      )
    : false;
  const ending = weekEndingOf(week, { rung: at.rung, paused, nowMs });
  if (!ending) return null;
  const today = (ms: number) => zoneDayKey(ms, at.zone);
  const news = plan.approved_at !== null && today(Date.parse(plan.approved_at)) === today(nowMs);
  if (ending.is === "approved" && ending.leftOut === 0 && !news) return null;
  return weekEndingSaid(ending, "").today;
}

/**
 * Today's points of the week (the PRD's 12.5; the approved boards, Today 1 and the pass 3 rows): the week ready to
 * approve, with its size and days, what AI asks to be filmed, and the plan's proposal to ask every client for a review
 * (pass 6; the canvas's Loop4); and, in the ready week's place, how AI's approval of it ended (readWeekEnded). Null where
 * the workspace plans no weeks, or nothing of the week waits on the owner. Each opens the Week; Today never approves.
 */
export async function readWeekToday(rc: ReaderContext): Promise<ContentTodayDto["plan"]> {
  const db = rc.ctx.supabase;
  const [row, zone] = await Promise.all([findConfigRow(db, rc.tenantId), findWorkspaceZone(db, rc.tenantId)]);
  if (!contentPlanOf(row?.config ?? null)) return null;
  const at = zone ?? "UTC";
  const [read, rung, reviewAsk] = await Promise.all([
    readContentWeek(db, rc.tenantId, planWeekOf(at, rc.now.getTime())),
    findWeekRung(db, rc.tenantId),
    readReviewAsk(db, rc.tenantId, rc.now.getTime()).catch(logAndGoOn("the week's review ask", null)),
  ]);
  const week = weekAsHeld(read, rung, rc.now.getTime());
  if (!week.plan) return reviewAsk ? { ready: null, film: [], review_ask: reviewAsk } : null;
  const live = week.slots.filter((s) => s.state !== "needs_footage" && s.state !== "removed");
  const ready =
    week.plan.status === "ready" && live.length > 0
      ? {
          size: weekSizeSaid(creativesOf(live)),
          days: weekDaysSaid(live.map((s) => zoneDayKey(Date.parse(s.at), at))),
          // Held to its time (00714): "8:00 AM", which Today says the week goes up at unless the owner stops it.
          held: week.plan.goes_at ? clockTime(Date.parse(week.plan.goes_at), at) : null,
        }
      : null;
  const film = week.slots.flatMap((s) => (s.state === "needs_footage" && s.ask ? [s.ask.what] : []));
  const ended = live.length > 0 ? await readWeekEnded(rc, week, { rung, zone: at }) : null;
  return ready || ended || film.length > 0 || reviewAsk
    ? { ready: ended ? null : ready, ended, film, review_ask: reviewAsk }
    : null;
}
