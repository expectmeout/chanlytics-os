/**
 * Sent's route (decision 0015, step 7), which draws nothing of its own now: every address of it lands on the page that took
 * it over, by the one table of retired addresses (contracts retiredRouteOf), which every edge reads before the page is
 * asked. Sent's own list lands on Sequences (D3), a run's sheet (`run:<id>`) on the run's home under its sequence (the
 * Campaigns wiring review's lane 2), To send on the Inbox's Needs you (lane 4), an audience (`broadcasts/<list>`) on New's
 * Send once for it (lane 6) and Get their yes on People's sheet (lane 7). One that reaches the page some other way (a
 * history entry from before) is replaced here, and the page says it is on its way meanwhile.
 */
import { useEffect } from "react";
import { usePathname } from "next/navigation";
import { LIFECYCLE_WORDS, SEQUENCES_ROUTE, retiredRouteOf, routeOfPath } from "@chanlytics/contracts";
import { replaceRoute } from "../../legacy-verbs";

export function BroadcastsRoute() {
  const route = routeOfPath(usePathname()) ?? "broadcasts";
  const landing = retiredRouteOf(route) ?? SEQUENCES_ROUTE;
  useEffect(() => {
    replaceRoute(landing);
  }, [landing]);
  return (
    <div className="route-reading" role="status" aria-busy="true">
      {LIFECYCLE_WORDS.reading}
    </div>
  );
}
