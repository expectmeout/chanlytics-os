/** Playbooks: the two runs Today's day panel names, each with its next moment on the sample's clock. */
import { clockTime, type PlaybookCardLike } from "@chanlytics/contracts";
import { ZONE, MIN, type SampleClock } from "./clock";

export function samplePlaybooks({ nowMs, midnight }: SampleClock): { rows: PlaybookCardLike[] } {
  return {
    rows: [
      {
        trigger: "visit_tomorrow",
        state: "running",
        candidates: 3,
        next: `today ${clockTime(nowMs + 90 * MIN, ZONE)}`,
      },
      {
        trigger: "quiet_30",
        state: "running",
        candidates: 6,
        next: `tomorrow ${clockTime(midnight + 34 * 60 * MIN, ZONE)}`,
      },
    ],
  };
}
