import "server-only";
import {
  clockTime,
  contentPlanOf,
  creativesOf,
  planWeekOf,
  reviewAskOf,
  weekDaysSaid,
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
import { findWorkspaceZone } from "@chanlytics/db/workspace";
import { logAndGoOn } from "@chanlytics/log";
import { getAppointmentWord } from "../people/deals";
import { findConfigRow } from "../workspace/config-row";
import type { ReaderContext } from "../shared/reader";

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
 * A week as the owner reads it: held to its time (00712) only while the rung still lets AI approve it. A rung moved back
 * to asking since the week was held says nothing goes by itself, whatever the plan still keeps.
 */
export function weekAsHeld(week: WeekPlanDto, rung: string | null): WeekPlanDto {
  if (!week.plan?.goes_at || rung === "veto" || rung === "auto") return week;
  return { ...week, plan: { ...week.plan, goes_at: null } };
}

/**
 * Today's points of the week (the PRD's 12.5; the approved boards, Today 1 and the pass 3 rows): the week ready to
 * approve, with its size and days, what AI asks to be filmed, and the plan's proposal to ask every client for a review
 * (pass 6; the canvas's Loop4). Null where the workspace plans no weeks, or nothing of the week waits on the owner. Each
 * opens the Week; Today never approves.
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
  const week = weekAsHeld(read, rung);
  if (!week.plan) return reviewAsk ? { ready: null, film: [], review_ask: reviewAsk } : null;
  const live = week.slots.filter((s) => s.state !== "needs_footage" && s.state !== "removed");
  const ready =
    week.plan.status === "ready" && live.length > 0
      ? {
          size: weekSizeSaid(creativesOf(live)),
          days: weekDaysSaid(live.map((s) => zoneDayKey(Date.parse(s.at), at))),
          // Held to its time (00712): "8:00 AM", which Today says the week goes up at unless the owner stops it.
          held: week.plan.goes_at ? clockTime(Date.parse(week.plan.goes_at), at) : null,
        }
      : null;
  const film = week.slots.flatMap((s) => (s.state === "needs_footage" && s.ask ? [s.ask.what] : []));
  return ready || film.length > 0 || reviewAsk ? { ready, film, review_ask: reviewAsk } : null;
}
