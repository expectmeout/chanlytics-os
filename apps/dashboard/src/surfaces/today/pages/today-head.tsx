/**
 * What Glass puts above Today (the plan's step 5.4, canvas E3): the date and time, a greeting by the hour to the member by
 * their first name, and under it where the day stands. Drawn by `<Glass>` in the route, so Classic has none of it, and by
 * the kit's PageHead. The date line and the sentence are the view model's own (`standing.eyebrow`, and `headline` with its
 * `detail`, which Ask reads: "2 conversations need you. The oldest has been waiting since 2:26 PM."); the greeting is the
 * only sentence made here.
 */
import { PageHead } from "../../kit/head/page-head";
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

export function TodayHead() {
  const vm = useSurface("today");
  const standing = vm?.standing;
  const zone = workspaceClock()?.zone() ?? "UTC";
  return (
    <PageHead
      stacked
      dateline={standing?.eyebrow}
      title={todayGreeting(Date.now(), zone, member()?.display_name)}
      sentence={standing ? todayStanding(standing) : undefined}
    />
  );
}
