/**
 * Broadcasts as the route draws it (decision 0015, step 7): what the address opens the page on. What the frame's table did
 * in its `drawBroadcasts` row, now that the layout draws the page: `run:<id>` is one broadcast, `get-yes` the section
 * every "nobody has said yes to offers" goes through, and any other word the audience the composer opens on. The address
 * is read from the path, never from the route params.
 */
import { usePathname } from "next/navigation";
import { routeOfPath } from "@chanlytics/contracts";
import { BroadcastsPage } from "./broadcasts-page";

export function BroadcastsRoute() {
  const route = routeOfPath(usePathname()) ?? "broadcasts";
  // The route's second word, as the shell reads its param (`broadcasts/run:b-1/x` names run:b-1).
  const param = route.split("/")[1] || null;
  const run = param && param.startsWith("run:") ? param.slice(4) : null;
  const yes = param === "get-yes";
  return <BroadcastsPage initialSegment={run || yes ? null : param} initialRun={run} initialYes={yes} />;
}
