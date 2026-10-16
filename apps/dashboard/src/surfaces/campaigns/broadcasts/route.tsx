/**
 * Broadcasts as the route draws it (decision 0015, step 7): what the address opens the page on. What the frame's table did
 * in its `drawBroadcasts` row, now that the layout draws the page: `run:<id>` is one broadcast, `get-yes` the section
 * every "nobody has said yes to offers" goes through, and any other word the audience the composer opens on. The address
 * is read from the path, never from the route params. Where Sequences is drawn, a run's address a link arrived at (a bell
 * row, Today, Ask's card) lands on its sequence's History with that day open (contracts sequenceLandingOf, the parity
 * review's W4), the address replaced; a run opened from Sent's own list, or its sheet's address (`/sheet`), stays here.
 */
import { useEffect, useRef } from "react";
import { usePathname } from "next/navigation";
import { routeOfPath, sequenceLandingOf } from "@chanlytics/contracts";
import { replaceRoute } from "../../legacy-verbs";
import { broadcastsProps } from "../routes";
import { useSequencesShown } from "../sequences/shown";
import { BroadcastsPage } from "./broadcasts-page";

export function BroadcastsRoute() {
  const route = routeOfPath(usePathname()) ?? "broadcasts";
  // The address the page was opened on: only an arrival lands elsewhere, never a run the list opens in place.
  const arrived = useRef(route);
  const landing = useSequencesShown() && route === arrived.current ? sequenceLandingOf(route) : null;
  useEffect(() => {
    if (landing) replaceRoute(landing);
  }, [landing]);
  // The route's second word, as the shell reads its param (`broadcasts/run:b-1/x` names run:b-1).
  const param = route.split("/")[1] || null;
  return <BroadcastsPage {...broadcastsProps(param)} />;
}
