/**
 * The two small parts Live's list and panel share (moved from legacy/pages/live-monitor.jsx, decision 0015): the clock a
 * call runs on, and its state as the one pill draws it.
 */
import type { LiveCallVM } from "@chanlytics/contracts";
import { statePillPart } from "../legacy-parts";

export const lrClock = (sec: number) => `${Math.floor(sec / 60)}:${String(sec % 60).padStart(2, "0")}`;

// The call's state as the one pill draws it: live is the accent, the rest are
// plain, and the words are the label map's.
export const LrPill = ({ c }: { c: LiveCallVM }) => {
  const StatePill = statePillPart();
  const value = c.live ? "live" : c.missed ? "missed" : c.stale ? "stale" : "ended";
  return (
    <StatePill
      kind="call"
      value={value}
      title={
        c.stale
          ? "Marked live by the phone provider, but silent past the heartbeat. Checked within five minutes."
          : null
      }
    />
  );
};
