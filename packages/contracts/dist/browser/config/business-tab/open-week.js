import { DAYS } from "../workspace-config/config-rules.js";
import { dayIntervals } from "../../calendar/availability.js";
import { closureDatesLabel, closuresFrom } from "../../calendar/calendar-words.js";
import { zoneDayKey } from "../../shared/clock.js";
import { timezoneCity } from "../../shared/time.js";
const DAY_COUNT_WORDS = ["No", "One", "Two", "Three", "Four", "Five", "Six", "Seven"];
export function openWeekWords(hours, tz) {
  const open = DAYS.filter((d) => dayIntervals(hours?.[d]).length > 0).length;
  const zone = `in ${timezoneCity(tz)} time`;
  if (!open) return `Times are ${zone}`;
  return `${DAY_COUNT_WORDS[open]} ${open === 1 ? "day" : "days"} a week, ${zone}`;
}
export function hoursZoneWords(tz) {
  return `In ${timezoneCity(tz)} time`;
}
export function closuresAheadWords(closures, tz, now) {
  const dated = (closures ?? []).filter((c) => !!c?.date);
  const ahead = closuresFrom(dated, zoneDayKey(now.getTime(), tz));
  const next = ahead[0];
  if (!next) return { count: 0, line: null };
  const named = `${closureDatesLabel(next)}${next.note ? ` \xB7 ${next.note}` : ""}`;
  return { count: ahead.length, line: `${ahead.length} ahead \xB7 ${ahead.length > 1 ? "next " : ""}${named}` };
}
