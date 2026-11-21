/**
 * What Stop watching says before the press, from the folder's one count (the content loop PRD v3.1, pass 0, F4): the
 * same `in` the row in Settings, the Library's line and AI's facts say, read once with the page (GET sources), never a
 * second count of its own. The first real run's Stop sheet said 24 where the row said 23 and the Library held 25. Pure.
 */
import { FOOTAGE_SETUP, type FootageCountsDto } from "@chanlytics/contracts";

/** The sheet's two sentences: what stays, and what of it is kept in Drive (null where none is). */
export function stopWordsOf(counts: Pick<FootageCountsDto, "in" | "away">): { stays: string; away: string | null } {
  return {
    stays: FOOTAGE_SETUP.stop.stays(counts.in),
    away: counts.away > 0 ? FOOTAGE_SETUP.stop.away(counts.away) : null,
  };
}
