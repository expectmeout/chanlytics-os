/**
 * A visit open over Today (the second look of 20 Nov 2026, N1: a visit to mark is one thing, and one thing opens over the
 * page it was pressed on): the Calendar's own sheet for it (visit-sheet.tsx OpenVisit), a sheet on a phone and the peek
 * on a desk, drawn from the Calendar's read that Today already makes for its day. Once it is marked, its Next opens the
 * next visit to mark in its place (`onWalk`), so the visits Today counts are marked one after another over Today, and
 * Today is under the sheet as it was left when it closes.
 *
 * The read holds the weeks around today, so a visit Today asks about is among them. One it does not hold (the Calendar's
 * window moved off to another month in this tab) opens at its home on the Calendar instead (`onMissing`).
 */
import { useEffect, type ReactNode } from "react";
import type { CalendarBlockVM } from "@chanlytics/contracts";
import { useSurface } from "../../use-surface";
import type { CalendarFrame } from "../../calendar/types";
import { OpenVisit } from "../../calendar/visit/visit-sheet";

/** The visit a day holds by the record's id, the all-day ones first, as the board walks them. */
const visitIn = (day: CalendarFrame, id: string): CalendarBlockVM | null =>
  [...day.allDay, ...day.blocks].find((b) => b.visit?.id === id) ?? null;

/** The day a visit stands on, among the days the read holds. */
const frameHolding = (days: readonly CalendarFrame[], b: CalendarBlockVM): CalendarFrame | null =>
  days.find((d) => d.blocks.includes(b) || d.allDay.includes(b)) ?? null;

export function VisitOver({
  id,
  day,
  onClose,
  onWalk,
  onMissing,
  flash,
  home,
}: {
  /** The record's id of the visit, and the day it is on ("2026-11-18"). */
  id: string;
  day: string;
  onClose: () => void;
  /** Open another visit in this one's place: the next to mark, once this one is said. */
  onWalk: (visit: { id: string; day: string }) => void;
  /** The read holds no such visit: its home opens instead. */
  onMissing: () => void;
  flash: (text: string) => void;
  /** Its door to its day on the Calendar. */
  home: ReactNode;
}) {
  const cal = useSurface("calendar");
  const runs = useSurface("calendar_runs");
  const vm = cal?.vm ?? null;
  const frame = vm?.days.find((d) => d.key === day) ?? null;
  const visit = frame ? visitIn(frame, id) : null;
  const missing = !!vm && !visit;
  useEffect(() => {
    if (missing) onMissing();
  }, [missing, onMissing]);
  if (!vm || !frame || !visit) return null;
  return (
    <OpenVisit
      key={visit.id}
      b={visit}
      day={frame}
      todayKey={vm.today}
      tz={vm.timezone}
      source={vm.feed.source || "your calendar"}
      bookingLink={vm.bookingLink}
      moments={runs?.dto?.moments ?? null}
      days={vm.days}
      onClose={onClose}
      onWalk={(next) => {
        const on = frameHolding(vm.days, next);
        if (next.visit?.id && on) onWalk({ id: next.visit.id, day: on.key });
      }}
      flash={flash}
      home={home}
      over
    />
  );
}
