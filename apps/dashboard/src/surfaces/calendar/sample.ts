/**
 * A Calendar for the tests to draw the real board over: a sample day (sample-day.ts: six on the calendar today, three
 * tomorrow, two open times) laid in the weeks around today the page loads, so the page reads every view of it and steps a
 * few weeks without a read. The same contracts function a workspace's calendar goes through builds its view model
 * (toCalendarVM), so it is the one Calendar there is. No page imports it: the demo session that drew it went with demo mode
 * (16 Nov 2026).
 */
import { MIN_MS, shiftKey, toCalendarVM, windowFor } from "@chanlytics/contracts";
import { sampleCalendarDto } from "./sample-day";
import { sampleClock } from "./sample-clock";
import type { CalendarSurface } from "./surface";

let lastSample: { minute: number; sample: CalendarSurface } | null = null;

/** The sample as of `nowMs`: the same minute gives the same value, kept rather than rebuilt on every draw. */
export function calendarSample(nowMs: number = Date.now()): CalendarSurface {
  const minute = Math.floor(nowMs / MIN_MS);
  if (lastSample && lastSample.minute === minute) return lastSample.sample;
  const clock = sampleClock(nowMs);
  const dto = sampleCalendarDto(clock, "usual");
  // The weeks around today, as a read would have loaded them: the sample's days where it has them, the rest empty.
  const loaded = windowFor(clock.today);
  const held = new Map(dto.days.map((d) => [d.key, d]));
  dto.days = Array.from({ length: loaded.days }, (_, i) => {
    const key = shiftKey(loaded.from, i);
    return held.get(key) ?? { key, items: [], windows: [] };
  });
  dto.from = loaded.from;
  dto.to = shiftKey(loaded.from, loaded.days - 1);
  const sample: CalendarSurface = { vm: toCalendarVM(dto, clock.now), fetchedAt: nowMs };
  lastSample = { minute, sample };
  return sample;
}
