/**
 * Broadcasts as the route draws it (decision 0015, step 7): what the address opens the page on. What the frame's table did
 * in its `drawBroadcasts` row, now that the layout draws the page: `run:<id>` is one broadcast, `get-yes` the section
 * every "nobody has said yes to offers" goes through, and any other word the audience the composer opens on. The address
 * is read from the path, never from the route params. Sent's own list lands on Sequences (D3), the address replaced; a
 * run's sheet (`/sheet`), To send, Get their yes and an audience stay here.
 *
 * A run's address a link arrived at (a bell row, Today, the Inbox, Ask's card) lands by what the run is, once Sent's runs
 * or the run's own read say it (contracts runLandingOf; the Inbox's run review, 18 Oct 2026): a run decided on its own
 * page stays, on its sheet, where it was already drawn; one that has gone lands on its sequence's History with that day
 * open (the parity review's W4). It landed on History whatever it was, and a run waiting for approval drew its sheet here,
 * then went to History, whose day held only the door back to the same sheet.
 */
import { useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import { arrivedRunOf, routeOfPath, runLandingOf, sequenceLandingOf, type BroadcastDto } from "@chanlytics/contracts";
import { demoSession, replaceRoute } from "../../legacy-verbs";
import { useSurface } from "../../use-surface";
import { broadcastsProps } from "../routes";
import { BroadcastsPage } from "./broadcasts-page";
import { runDetail } from "./detail-read";
import { broadcastsSample } from "./sample";

/**
 * The run a link arrived at, as the landing reads it: its row among Sent's runs, which say whether its emails are held;
 * else, for a run older than the newest fifty, its own read. Null while neither is in, and for a run this workspace does
 * not have (the page says it is gone).
 */
function useArrivedRun(id: string | null): BroadcastDto | null {
  const live = useSurface("broadcasts");
  const rows = (live ?? (demoSession() ? broadcastsSample() : null))?.rows ?? null;
  const row = id && rows ? (rows.find((r) => r.id === id) ?? null) : null;
  const [read, setRead] = useState<BroadcastDto | null>(null);
  // Read by its id only once Sent's runs are in and do not hold it: the page draws the run from the same read.
  const unlisted = id !== null && rows !== null && row === null;
  useEffect(() => {
    if (!unlisted || !id) return undefined;
    let on = true;
    void runDetail(id).then((r) => {
      if (on && r.ok) setRead(r.data.broadcast);
    });
    return () => {
      on = false;
    };
  }, [unlisted, id]);
  return row ?? (read && read.id === id ? read : null);
}

export function BroadcastsRoute() {
  const route = routeOfPath(usePathname()) ?? "broadcasts";
  // The address the page was opened on: an arrival lands elsewhere, never a run the list opens in place; and Sent's own list
  // always lands on Sequences, a sheet closed onto it among them (D3: Sent is History now).
  const arrived = useRef(route);
  const landing = route === arrived.current || route === "broadcasts" ? sequenceLandingOf(route) : null;
  const runId = route === arrived.current ? arrivedRunOf(route) : null;
  const run = useArrivedRun(runId);
  const runLanding = run ? runLandingOf(route, run) : null;
  const to = landing ?? runLanding;
  useEffect(() => {
    if (to) replaceRoute(to);
  }, [to]);
  // The route's second word, as the shell reads its param (`broadcasts/run:b-1/x` names run:b-1).
  const param = route.split("/")[1] || null;
  return <BroadcastsPage {...broadcastsProps(param)} />;
}
