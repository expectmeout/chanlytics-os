/**
 * What came while the business was closed, by its own hours and closures (spec D16, A2): each quarter hour something
 * arrived is asked the one question (openAt), never a guess at 8 to 8.
 */
import { hasHours, openAt } from "../calendar/availability";
import type { Closure, Hours } from "../config/workspace-config/business-profile";

/** When something came in, on the business's clock: a day ("2026-09-17"), its quarter hour (0..95) and how many (00304). */
export interface ReportArrivalDto {
  d: string;
  q: number;
  n: number;
}

/** The hours and closures a workspace keeps on its profile (config.brain.profile), as the report reads them. */
export interface ReportProfile {
  hours?: Record<string, Hours | undefined>;
  closures?: Closure[];
}

/**
 * How many came while the business was closed by its own hours and closures, each quarter hour asked the one
 * question (openAt). A quarter hour is judged by its start: an opening at 9:20 calls the 9:15 quarter closed. Null
 * where the workspace has not said its hours, or the payload has no arrivals (a report from before 00304). The
 * arrivals are ReportDto's own (reports.ts).
 */
export function closedOf(
  arrivals: readonly ReportArrivalDto[] | undefined,
  profile: ReportProfile | null | undefined,
): number | null {
  if (!arrivals || !profile || !hasHours(profile.hours)) return null;
  return arrivals.reduce((s, a) => s + (openAt(profile.hours, profile.closures, a.d, a.q * 15) ? 0 : a.n), 0);
}

/**
 * Whether the report can say the workspace has not set its hours: its profile was read and holds no open day, and the
 * payload carries arrivals. An empty list (`arrivals: []`) sets it too, which is harmless: Worth knowing is hidden on an
 * empty period, so nothing is said of hours where there was nothing to count. False where the profile could not be
 * read (null), and for a report from before 00304: neither says anything about the hours, so neither is ever a guess.
 */
export function hoursUnsetOf(
  arrivals: readonly ReportArrivalDto[] | undefined,
  profile: ReportProfile | null | undefined,
): boolean {
  return arrivals !== undefined && profile != null && !hasHours(profile.hours);
}
