/**
 * Broadcasts as the route draws it (decision 0015, step 7): what the address opens the page on. What the frame's table did
 * in its `drawBroadcasts` row, now that the layout draws the page: `run:<id>` is one broadcast, `get-yes` the section
 * every "nobody has said yes to offers" goes through, and any other word the audience the composer opens on. The address
 * is read from the path, never from the route params. A run's address a link arrived at (a bell row, Today, Ask's card)
 * lands on its sequence's History with that day open (contracts sequenceLandingOf, the parity review's W4), and Sent's own
 * list on Sequences (D3), the address replaced; a run's sheet (`/sheet`), To send, Get their yes and an audience stay here.
 */
import { useEffect, useRef } from "react";
import { usePathname } from "next/navigation";
import { routeOfPath, sequenceLandingOf } from "@chanlytics/contracts";
import { replaceRoute } from "../../legacy-verbs";
import { broadcastsProps } from "../routes";
import { BroadcastsPage } from "./broadcasts-page";

export function BroadcastsRoute() {
  const route = routeOfPath(usePathname()) ?? "broadcasts";
  // The address the page was opened on: an arrival lands elsewhere, never a run the list opens in place; and Sent's own list
  // always lands on Sequences, a sheet closed onto it among them (D3: Sent is History now).
  const arrived = useRef(route);
  const landing = route === arrived.current || route === "broadcasts" ? sequenceLandingOf(route) : null;
  useEffect(() => {
    if (landing) replaceRoute(landing);
  }, [landing]);
  // The route's second word, as the shell reads its param (`broadcasts/run:b-1/x` names run:b-1).
  const param = route.split("/")[1] || null;
  return <BroadcastsPage {...broadcastsProps(param)} />;
}
