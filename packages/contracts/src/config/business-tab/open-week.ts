/**
 * When you're open: the line under the card's title, whose clock the hours being edited are on, and the closed
 * days still ahead, each counted on the business's own day.
 */
import { DAYS, type Closure, type Hours } from "../workspace-config/business-profile";
import { dayIntervals } from "../../calendar/availability";
import { closureDatesLabel, closuresFrom } from "../../calendar/calendar";
import { zoneDayKey } from "../../shared/clock";
import { timezoneCity } from "../../shared/time";

/* ---- When you're open ---- */

const DAY_COUNT_WORDS = ["No", "One", "Two", "Three", "Four", "Five", "Six", "Seven"] as const;

/**
 * The line under the card's title: how much of the week is open, and whose clock the times are on. "Six days a week,
 * in New York time".
 *
 * A day counts as open when the composer would state times for it (dayIntervals, which reads both shapes a stored day
 * may have), so the card never counts a day the receptionist calls closed. With no open day there is no week to
 * count, and the line says only whose clock it is; the Hours row under it says they are not set.
 */
export function openWeekWords(hours: Partial<Record<string, Hours>> | null | undefined, tz: string): string {
  const open = DAYS.filter((d) => dayIntervals(hours?.[d]).length > 0).length;
  const zone = `in ${timezoneCity(tz)} time`;
  if (!open) return `Times are ${zone}`;
  return `${DAY_COUNT_WORDS[open]} ${open === 1 ? "day" : "days"} a week, ${zone}`;
}

/**
 * The line over the week while it is being edited: whose clock these times are on, by the name the card above already
 * uses for it (openWeekWords, "in New York time"), and what they are.
 *
 * Never the IANA id. "All times America/New_York" is the machine's name for the place, on the one fold where somebody
 * is typing the hours their front door opens -- and a zone with an underscore in it reads as a setting rather than a
 * sentence. The zone row itself says the whole of it, where changing it is the point.
 */
export function hoursZoneWords(tz: string): string {
  return `All times in ${timezoneCity(tz)} time, as the receptionist states them.`;
}

export interface ClosuresAheadVM {
  /** How many closures are still to come, by the business's own day. */
  count: number;
  /** "2 ahead · next Dec 24 – 26 · Christmas"; null when none is, and the row says "None ahead". */
  line: string | null;
}

/**
 * The closed days still ahead, counted on the BUSINESS's day, not the browser's: an owner working from another
 * country must not be told a date has passed when it has not. A closure that ends today is still ahead, and one with
 * no date is a row somebody started and never finished, which no save writes. A zone the clock cannot use is read as
 * UTC, the clock's own rule (clock.ts), so the row is never lost to one.
 */
export function closuresAheadWords(
  closures: readonly Closure[] | null | undefined,
  tz: string,
  now: Date,
): ClosuresAheadVM {
  const dated = (closures ?? []).filter((c) => !!c?.date);
  const ahead = closuresFrom(dated, zoneDayKey(now.getTime(), tz));
  const next = ahead[0];
  if (!next) return { count: 0, line: null };
  const named = `${closureDatesLabel(next)}${next.note ? ` · ${next.note}` : ""}`;
  return { count: ahead.length, line: `${ahead.length} ahead · ${ahead.length > 1 ? "next " : ""}${named}` };
}
