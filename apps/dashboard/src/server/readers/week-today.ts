import "server-only";
import {
  contentPlanOf,
  creativesOf,
  planWeekOf,
  weekDaysSaid,
  weekSizeSaid,
  zoneDayKey,
  type ContentTodayDto,
} from "@chanlytics/contracts";
import { readContentWeek } from "@chanlytics/db/files";
import { findWorkspaceZone } from "@chanlytics/db/workspace";
import { findConfigRow } from "../workspace/config-row";
import type { ReaderContext } from "../shared/reader";

/**
 * Today's two points of the week (the PRD's 12.5; the approved boards, Today 1 and the pass 3 rows): the week ready to
 * approve, with its size and days, and what AI asks to be filmed. Null where the workspace plans no weeks, or nothing of
 * the week waits on the owner. Each opens the Week; Today never approves.
 */
export async function readWeekToday(rc: ReaderContext): Promise<ContentTodayDto["plan"]> {
  const db = rc.ctx.supabase;
  const [row, zone] = await Promise.all([findConfigRow(db, rc.tenantId), findWorkspaceZone(db, rc.tenantId)]);
  if (!contentPlanOf(row?.config ?? null)) return null;
  const at = zone ?? "UTC";
  const week = await readContentWeek(db, rc.tenantId, planWeekOf(at, rc.now.getTime()));
  if (!week.plan) return null;
  const live = week.slots.filter((s) => s.state !== "needs_footage" && s.state !== "removed");
  const ready =
    week.plan.status === "ready" && live.length > 0
      ? {
          size: weekSizeSaid(creativesOf(live)),
          days: weekDaysSaid(live.map((s) => zoneDayKey(Date.parse(s.at), at))),
        }
      : null;
  const film = week.slots.flatMap((s) => (s.state === "needs_footage" && s.ask ? [s.ask.what] : []));
  return ready || film.length > 0 ? { ready, film } : null;
}
