/**
 * The business's clock, as an open piece says a day and a time ahead ("Monday", "Sat, 9:00 AM"): the viewer's, the desk
 * pane's, and the list of where it stands at each place (post-both.tsx). Its own module, so the list reads it without
 * reading the viewer.
 */
import { pageClock } from "@/bridge/zone";
import { viewerAheadOf, viewerDayOf, type ViewerClock } from "../model/viewer-line";

export function viewerClockOf(): ViewerClock & { zone: string } {
  const zone = pageClock().zone();
  const now = Date.now();
  return {
    zone,
    day: (at) => viewerDayOf(Date.parse(at), zone, now),
    ahead: (at) => viewerAheadOf(Date.parse(at), zone, now),
  };
}
