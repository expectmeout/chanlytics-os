/**
 * Where Today stands, said to the frame's head in Glass (the plan's step 5.4, canvas E3): a greeting by the hour to the
 * member by their first name as the page's name, and under it where the day stands. The frame draws the head
 * (kit/head/frame-head.tsx) with the date and time; the page says the greeting and the sentence. The sentence is the view
 * model's own (`headline` with its `detail`, which Ask reads: "2 conversations need you. The oldest has been waiting
 * since 2:26 PM."); the greeting is the only sentence made here.
 */
import { useStanding } from "../../kit/head/standing";
import { useSurface } from "../../use-surface";
import { member, workspaceClock } from "../shell";

/** "Good morning, Marisa": by the hour in the business's zone, to the first name; without a name, the greeting alone. */
export function todayGreeting(nowMs: number, zone: string, displayName: string | null | undefined): string {
  const hour = Number(
    new Date(nowMs).toLocaleTimeString("en-US", { hour: "numeric", hour12: false, timeZone: zone }).slice(0, 2),
  );
  const hello = hour < 12 ? "Good morning" : hour < 17 ? "Good afternoon" : "Good evening";
  const first = (displayName ?? "").trim().split(/\s+/)[0];
  return first ? `${hello}, ${first}` : hello;
}

/**
 * Where the day stands, as one sentence: the headline and its detail, each ending as a sentence does (the ladder's
 * singular headline, "One conversation needs you", has no full stop of its own, which contracts owns).
 */
export function todayStanding(standing: { headline: string; detail: string | null }): string {
  const headline = /[.!?]$/.test(standing.headline) ? standing.headline : `${standing.headline}.`;
  return [headline, standing.detail].filter(Boolean).join(" ");
}

/** Today's standing, said to the frame's head as the page draws: the greeting over the day's sentence. */
export function useTodayStanding(): void {
  const vm = useSurface("today");
  const standing = vm?.standing;
  const zone = workspaceClock()?.zone() ?? "UTC";
  useStanding({
    stacked: true,
    title: todayGreeting(Date.now(), zone, member()?.display_name),
    sentence: standing ? todayStanding(standing) : undefined,
  });
}
