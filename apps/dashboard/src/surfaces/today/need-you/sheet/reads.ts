/**
 * What a row's sheet reads beyond the row (one sheet, 9 Nov 2026): when the business is open and what stands on a day, from the
 * Calendar the page already holds; what was last said to someone whose row holds no thread; the open times to offer. None is read
 * until a sheet asks.
 */
import { useEffect, useState } from "react";
import { dayInZone, type CalendarDayVM, type TodayRowSaid, saidOfMessages } from "@chanlytics/contracts";
import { api } from "@/bridge/api";
import { readOpenTimes, type OpenTime } from "../../../booking-request";
import { surfaceValue } from "../../../surface-values";

import type { OpenClock } from "./moment";

/** When the business is open, from the Calendar the page holds; null where it holds none, and the clock says nothing then. */
export function openClockOf(): OpenClock | null {
  const vm = surfaceValue("calendar")?.vm;
  if (!vm?.hours) return null;
  const at = vm.days.findIndex((d) => d.today);
  const today = at >= 0 ? vm.days[at] : null;
  if (!today) return null;
  const nextOpen = vm.days.slice(at + 1).findIndex((d) => !d.closed.yes);
  return {
    start: vm.hours.start,
    end: vm.hours.end,
    closedToday: today.closed.yes,
    nextOpenIn: nextOpen >= 0 ? nextOpen + 1 : 1,
  };
}

/** What stands on the day of an instant, where the Calendar the page holds has it: its blocks, and the hours its strip spans. */
export function dayOfInstant(
  atMs: number,
  tz: string,
): { day: CalendarDayVM; hours: { start: number; end: number } } | null {
  const vm = surfaceValue("calendar")?.vm;
  if (!vm?.hours) return null;
  const key = dayInZone(tz, atMs).key;
  const day = vm.days.find((d) => d.key === key);
  return day ? { day, hours: vm.hours } : null;
}

/** What was last said on a thread the row does not hold, read once as the sheet opens on it; null until it has. */
export function useThreadSaid(conversationId: string | null): readonly TodayRowSaid[] | null {
  const [said, setSaid] = useState<readonly TodayRowSaid[] | null>(null);
  useEffect(() => {
    if (!conversationId) return undefined;
    let live = true;
    void api()("GET conversations/[id]", { params: { id: conversationId } })
      .then((r) => {
        if (live && r.ok) setSaid(saidOfMessages(r.data.messages) ?? []);
      })
      .catch(() => undefined);
    return () => {
      live = false;
    };
  }, [conversationId]);
  return said;
}

/**
 * The open times a booking's Another time offers (booking-request.ts readOpenTimes, which the thread's Can't do it reads
 * too): null while it reads, none where the calendar has none to say.
 */
export function useOpenTimes(
  service: string | null,
  max: number,
  tz: string,
): { times: readonly OpenTime[]; state: string } | null {
  const [read, setRead] = useState<{ times: readonly OpenTime[]; state: string } | null>(null);
  useEffect(() => {
    let live = true;
    void readOpenTimes(service, max, tz).then((open) => {
      if (live) setRead(open);
    });
    return () => {
      live = false;
    };
  }, [service, max, tz]);
  return read;
}
