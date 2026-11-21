/**
 * "Since you last looked", one sentence in the head (Working for you, W2): "Since 9:40 AM AI answered 6 people and booked
 * 2." Said only where the page is sure of what it shows (calm/quiet.ts: sure, or drawn from this device's copy while its read
 * is out), the last look was today, the day has not turned to tomorrow, and AI did something since. Where it stands, the
 * day's own count line steps aside (zones/foot.tsx DayCameTo), so nothing is said twice.
 */
import { DEFAULT_TIMEZONE, tzClock, type TodayAiVM } from "@chanlytics/contracts";
import { useSurface } from "../../use-surface";
import { useTodayQuiet, type TodayQuiet } from "../calm/quiet";
import { AI_WORDS } from "../model/ai";
import { workspaceClock } from "../shell";

/** The sentence, or null where it is not said. */
export function sinceSaidOf(ai: TodayAiVM | null | undefined, quiet: TodayQuiet, turned: boolean): string | null {
  if (!ai?.since || ai.looked_ms === null || turned) return null;
  if (quiet.kind !== "sure" && quiet.kind !== "settling") return null;
  const zone = workspaceClock()?.zone() ?? DEFAULT_TIMEZONE;
  const time = tzClock(new Date(ai.looked_ms).toISOString(), zone, new Date());
  return time ? AI_WORDS.since(time, ai.since.answered, ai.since.booked) : null;
}

/** The sentence as the head says it now; `turned` is the head's own (zones/head.tsx useDayTurned). */
export function useSinceSaid(turned: boolean): string | null {
  const ai = useSurface("today")?.ai;
  const quiet = useTodayQuiet("count");
  return sinceSaidOf(ai, quiet, turned);
}
