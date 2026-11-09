/**
 * What a row's sheet reads beyond the row (one sheet, 9 Nov 2026): when the business is open and what stands on a day, from the
 * Calendar the page already holds; what was last said to someone whose row holds no thread; the open times to offer. None is read
 * until a sheet asks.
 */
import { useEffect, useState } from "react";
import { dayInZone, type CalendarDayVM, type TodayRowSaid, saidOfMessages } from "@chanlytics/contracts";
import { api } from "@/bridge/api";
import type { CalendarSurface } from "@/surfaces/calendar/surface";
import { borrowed } from "../../shell";
import { openDayWord, type OpenClock } from "./moment";

/** When the business is open, from the Calendar the page holds; null where it holds none, and the clock says nothing then. */
export function openClockOf(): OpenClock | null {
  const vm = borrowed<CalendarSurface>("__CALENDAR")?.vm;
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
  const vm = borrowed<CalendarSurface>("__CALENDAR")?.vm;
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

/** One open time to offer: its words, its day's, and a word for the two together. */
export interface OpenTime {
  key: string;
  time: string;
  day: string;
}

/**
 * The open times a booking's Another time offers: the receptionist's own windows over the days ahead, each a time they could
 * have, from the first of each window, up to `max`. Null while it reads, none where the calendar has none to say.
 */
export function useOpenTimes(
  service: string | null,
  max: number,
  tz: string,
): { times: readonly OpenTime[]; state: string } | null {
  const [read, setRead] = useState<{ times: readonly OpenTime[]; state: string } | null>(null);
  useEffect(() => {
    let live = true;
    void api()("GET ask/openings", { query: { service: service ?? undefined } })
      .then((r) => {
        if (!live) return;
        if (!r.ok) return setRead({ times: [], state: "unavailable" });
        const { openings } = r.data;
        const times: OpenTime[] = [];
        for (const d of openings.days)
          for (const w of d.windows)
            if (times.length < max)
              times.push({ key: `${d.key}-${w}`, time: windowStart(w), day: openDayWord(d.key, tz, Date.now()) });
        setRead({ times, state: openings.state });
      })
      .catch(() => live && setRead({ times: [], state: "unavailable" }));
    return () => {
      live = false;
    };
  }, [service, max, tz]);
  return read;
}

/** The first time of a window: "2:30 – 4 PM" is "2:30 PM", "9 AM – 12 PM" is "9 AM". */
function windowStart(window: string): string {
  const [from = "", to = ""] = window.split(/\s*[–-]\s*/);
  if (/[ap]m/i.test(from)) return from.trim();
  const half = /[ap]m/i.exec(to)?.[0] ?? "";
  return `${from.trim()} ${half}`.trim();
}
