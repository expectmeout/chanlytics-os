/**
 * Today's first band: the line above the work (moved from pages/dashboard-a-brief.jsx, decision 0015, step 4).
 *
 * It says the one thing on Today that cannot wait for the card under the work: a line is down, or the workspace is
 * paused (contracts `standing.alert`). Where a hero with a greeting, a headline the queue says again, four sentences, a
 * chip repeating the queue's count, an arc and six stat cards used to stand, and on a phone the first thing that needed
 * a person started 679px down, nothing stands with every line up. The day's own card is card.tsx, and what is left to
 * set up is setup-card.tsx.
 */
import type { TodayVM } from "@chanlytics/contracts";
import { surfaceValue } from "../../surface-values";
import { useMoved } from "../shell";

// Above the work, only while a line is down or the workspace is paused (contracts `standing.alert`): the one thing on
// Today that cannot wait for the card under the work. With every line up nothing stands here. The standing line that
// said the date, the time, the workspace and "3 of 3 lines connected" went (Ruben, 23 Sep): the queue says its own
// good news, and the clock is the device's.
const TodayAlert = ({ vm }: { vm: TodayVM }) => {
  const { alert } = vm.standing;
  if (!alert) return null;
  return (
    <div className="today-alert" role="alert" data-testid="today-alert">
      {/* Its own dot, red with a ring: never the coral live-dot, which is the agent's live state (components.css). */}
      <span className="today-alert-dot" aria-hidden="true" />
      <span>{alert}</span>
    </div>
  );
};

export const HeroBrief = () => {
  useMoved("today");
  const vm = surfaceValue("today");
  return vm ? <TodayAlert vm={vm} /> : null;
};
