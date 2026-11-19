/**
 * The moment now, in a zone, and the clock that keeps it true (a date and time that stood still would be wrong by the
 * time it was read): what a head that names its date says (the console's Home, PageHead's `dateline`) and what a page
 * that counts the minutes keeps. The frame's head said it in the top bar's row until 19 Nov 2026 (Ruben: "not needed").
 */
import { useEffect, useState } from "react";
import { dateFormat, MIN_MS } from "@chanlytics/contracts";

/** The hour, by a formatter kept: every press draws the head, and a date's own method builds one each time it is asked. */
const hourIn = (nowMs: number, zone: string): string =>
  dateFormat("en-US", { hour: "numeric", minute: "2-digit", timeZone: zone }).format(nowMs);

/** The day and the hour apart, for a head that says the day alone ("Friday, October 2"). */
export function pageDatelineParts(nowMs: number, zone: string): { day: string; time: string } {
  return {
    day: dateFormat("en-US", { weekday: "long", month: "long", day: "numeric", timeZone: zone }).format(nowMs),
    time: hourIn(nowMs, zone),
  };
}

/** "Friday, October 2 · 4:02 PM", in a zone (the head says it in capitals, in the mono face). */
export function pageDateline(nowMs: number, zone: string): string {
  const { day, time } = pageDatelineParts(nowMs, zone);
  return `${day} · ${time}`;
}

/** The moment now, said again each minute. */
export function useMinute(): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const tick = setInterval(() => setNow(Date.now()), MIN_MS);
    return () => clearInterval(tick);
  }, []);
  return now;
}
