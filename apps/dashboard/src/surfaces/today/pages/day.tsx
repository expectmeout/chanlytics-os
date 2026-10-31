/**
 * The day (moved from pages/dashboard-a-day.jsx, decision 0015, step 4), as the brief and the queue read it: today and
 * tomorrow from the calendar the receptionist reads -- who is coming and when, what is open, what is closed -- and the
 * visit playbooks' line. Reads the calendar and playbooks surfaces the page already holds, and People for a visit that
 * needs someone and a person's channel -- People lands last on a cold boot (surface-registry.ts ROUTE_DRAWS), so a reader
 * redraws on it too; the words are contracts/today.ts todayDay, which the page reaches as TODAY_HELPERS.
 *
 * No pane draws it any more: canvas E3 folded the day into a strip under the head (its next appointment is the frame's
 * now, beside the bell on every page: frame/topbar/status-bars.tsx NextVisitBar) and the brief's sentence (brief-pane.tsx),
 * and the steps due that stood at the pane's head are rows of the queue (queue-steps.tsx; decision 0007, amended). What is
 * left here is the one derivation both read.
 */
import type { CalendarLike, TodayDayVM } from "@chanlytics/contracts";
import type { CalendarSurface } from "@/surfaces/calendar/surface";
import type { PeopleSurface } from "@/surfaces/people/surface";
import type { PlaybooksSurface } from "@/surfaces/campaigns/playbooks/surface";
import { TODAY_HELPERS } from "../helpers";
import { borrowed, useMoved } from "../shell";

/**
 * The day the calendar says, or null: no feed, one that could not be read, or nothing in its span. The brief and the queue
 * read this one derivation. The calendar's `now` is null when today is not in its span; todayDay reads it only on today's
 * frame, where it is a number, and its own type (CalendarLike) does not say null: what the surface published is handed
 * over as the JSX handed it. A playbook's `candidates` is null when the server could not count it, and PlaybookCardLike
 * says so: the count is left out. The reminders say the workspace's word from the playbooks surface Today already reads
 * (its shape, from GET playbooks), as Campaigns says it: no read more.
 */
function dayVmOf(
  C: CalendarSurface | undefined,
  P: PlaybooksSurface | undefined,
  people: PeopleSurface | undefined,
): TodayDayVM | null {
  if (!C || !C.vm || C.vm.feed.state !== "ok") return null;
  const vm = TODAY_HELPERS.day(C.vm as CalendarLike, P ? { rows: P.rows, word: P.shape.word } : null, people || null);
  return vm.frames.length ? vm : null;
}

/** The day as the brief reads it: the reads the brief makes, the one derivation. */
export function useDayVm(): TodayDayVM | null {
  useMoved(["calendar", "playbooks", "people"]);
  return dayVmOf(
    borrowed<CalendarSurface>("__CALENDAR"),
    borrowed<PlaybooksSurface>("__PLAYBOOKS"),
    borrowed<PeopleSurface>("__PEOPLE"),
  );
}
