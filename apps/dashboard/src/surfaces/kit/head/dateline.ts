/**
 * The two things every page head says that are not the page's own: the moment now, in the business's zone, and the
 * clock that keeps it true (a date and time that stood still would be wrong by the time it was read). The frame's head
 * says it in Glass, in the top bar's row (frame-head.tsx); Classic, whose top bar carries the crumbs, has none.
 */
import { useEffect, useState } from "react";
import { MIN_MS } from "@chanlytics/contracts";

/** The day and the hour apart: a phone's head says the day alone (the canvases' phone boards; kit.css hides the hour). */
export function pageDatelineParts(nowMs: number, zone: string): { day: string; time: string } {
  const at = new Date(nowMs);
  return {
    day: at.toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric", timeZone: zone }),
    time: at.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", timeZone: zone }),
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
