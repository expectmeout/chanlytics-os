/**
 * The day, as Today's zones read it (moved from pages/day.tsx with the page, Today in three zones, 2 Nov 2026): today and
 * tomorrow from the calendar the receptionist reads, who is coming and when, what is open, what is closed, and the visit
 * playbooks' line. It reads the calendar and playbooks surfaces the page already holds; the facts on who is coming are the
 * board's own read's (calendar-person-facts.ts), so People's book is no read of the day's. The words are contracts'
 * todayDay, which the page reaches as TODAY_HELPERS; the day's zone (day.tsx), Listen and To do read this one derivation.
 * Its word for a visit is the workspace's, as Today's own read says it, before a playbook's: a workspace with playbooks
 * off never reads one (the canvas of 2 Nov 2026).
 */
import type { AppointmentWord, CalendarLike, TodayDayVM } from "@chanlytics/contracts";
import type { CalendarSurface } from "@/surfaces/calendar/surface";
import type { PlaybooksSurface } from "@/surfaces/campaigns/playbooks/surface";
import { surfaceValue } from "../../surface-values";
import { TODAY_HELPERS } from "../helpers";
import { borrowed, useMoved } from "../shell";

/**
 * The day the calendar says, or null: no feed, one that could not be read, or nothing in its span. The calendar's `now` is
 * null when today is not in its span; todayDay reads it only on today's frame, where it is a number, and its own type
 * (CalendarLike) does not say null: what the surface published is handed over as it is. The reminders say the
 * workspace's word (Today's read's), else the playbooks surface's, as Campaigns says it: no read more.
 */
function dayVmOf(
  C: CalendarSurface | undefined,
  P: PlaybooksSurface | undefined,
  word: AppointmentWord | null,
): TodayDayVM | null {
  if (!C || !C.vm || C.vm.feed.state !== "ok") return null;
  // Every entry of the day, never the old card's five: the zone draws its own lines and folds what is over ("3 earlier"),
  // which a cut list would undercount (the 3 Nov audit); Listen's brief and the closing read the whole day too.
  const vm = TODAY_HELPERS.day(
    C.vm as CalendarLike,
    P ? { rows: P.rows, word: word ?? P.shape.word } : null,
    word ? { rows: [], word } : null,
    Number.POSITIVE_INFINITY,
  );
  return vm.frames.length ? vm : null;
}

/** The day as the zones read it: the reads the page makes, the one derivation. */
export function useDayVm(): TodayDayVM | null {
  useMoved(["calendar", "playbooks", "today"]);
  return dayVmOf(
    borrowed<CalendarSurface>("__CALENDAR"),
    borrowed<PlaybooksSurface>("__PLAYBOOKS"),
    surfaceValue("today")?.word ?? null,
  );
}

/**
 * What the workspace calls an appointment, for the rows that say it with no calendar to read: the day's where there is
 * one, else Today's own read's, else the word a workspace has until it picks.
 */
export function useTodayWord(): AppointmentWord {
  const day = useDayVm();
  return day?.word ?? surfaceValue("today")?.word ?? "appointment";
}
