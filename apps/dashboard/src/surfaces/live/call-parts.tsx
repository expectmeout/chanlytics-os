/**
 * The two small parts Live's list and panel share (moved from legacy/pages/live-monitor.jsx, decision 0015): the clock a
 * call runs on, and its state as the one pill draws it.
 */
import { mmss, type LiveCallVM } from "@chanlytics/contracts";
import { statePillPart } from "../legacy-parts";

export const lrClock = (sec: number) => mmss(sec * 1000);

// The call's state as the one pill draws it: live is the accent, the rest are
// plain, and the words are the label map's. A call that is over says how it ended by the ladder
// Conversations reads (contracts callOutcomeFor): hung up early, asked for a call back, voicemail, failed --
// "Ended" only where it was simply handled.
export const LrPill = ({ c }: { c: LiveCallVM }) => {
  const StatePill = statePillPart();
  const value = c.live ? "live" : c.stale ? "stale" : c.outcome === "handled" ? "ended" : c.outcome;
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
