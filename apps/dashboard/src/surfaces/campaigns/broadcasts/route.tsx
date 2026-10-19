/**
 * Broadcasts as the route draws it (decision 0015, step 7): what the address opens the page on. What the frame's table did
 * in its `drawBroadcasts` row, now that the layout draws the page: `run:<id>` is one broadcast, `get-yes` the section
 * every "nobody has said yes to offers" goes through, and any other word the audience the composer opens on. The address
 * is read from the path, never from the route params. Sent's own list lands on Sequences (D3), the address replaced; a
 * run's sheet (`/sheet`), To send, Get their yes and an audience stay here.
 *
 * A run's address a link names (a bell row, Today, the Inbox, Ask's card) lands by what the run is, once Sent's runs or
 * the run's own read say it (contracts runLandingOf; the Inbox's run review, 18 Oct 2026): a run decided on its own page
 * stays, on its sheet, where it was already drawn; one that has gone lands on its sequence's History with that day open
 * (the parity review's W4). Whenever the address is one, the page's first or a link pressed while it stands (the bell over
 * a sheet): a run the page opens itself is written at its sheet's address (runSheetRoute), which no landing takes. It
 * landed only the address the page opened on, and a link from the bell left a run that went on Sent's report.
 */
import { useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import { arrivedRunOf, routeOfPath, runLandingOf, sequenceLandingOf, type BroadcastDto } from "@chanlytics/contracts";
import { demoSession, replaceRoute } from "../../legacy-verbs";
import { useSurface } from "../../use-surface";
import { broadcastsProps } from "../routes";
import { BroadcastsPage } from "./broadcasts-page";
import { hearRunDetail, peekRunDetail } from "./detail-read";
import { broadcastsSample } from "./sample";

/**
 * The run a link names, as the landing reads it: its row among Sent's runs, which say whether its emails are held; else, for
 * a run older than the newest fifty, the page's own read of it (the tab's last answer, then each answer as it lands: its
 * open, and a Retry after a read that failed). Null while neither is in, and for a run this workspace does not have (the
 * page says it is gone). It read the run itself, once: a read that failed never landed, whatever a Retry read after it.
 */
function useLinkedRun(id: string | null): BroadcastDto | null {
  const live = useSurface("broadcasts");
  const rows = (live ?? (demoSession() ? broadcastsSample() : null))?.rows ?? null;
  const row = id && rows ? (rows.find((r) => r.id === id) ?? null) : null;
  const [heard, setHeard] = useState<BroadcastDto | null>(null);
  const unlisted = id !== null && rows !== null && row === null;
  useEffect(() => {
    if (!unlisted || !id) return undefined;
    return hearRunDetail(id, (r) => {
      if (r.ok) setHeard(r.data.broadcast);
    });
  }, [unlisted, id]);
  if (row) return row;
  if (!unlisted || !id) return null;
  if (heard && heard.id === id) return heard;
  const held = peekRunDetail(id);
  return held && held.ok ? held.data.broadcast : null;
}

export function BroadcastsRoute() {
  const route = routeOfPath(usePathname()) ?? "broadcasts";
  // The address the page was opened on lands where an older address of Campaigns does, and Sent's own list always lands on
  // Sequences, a sheet closed onto it among them (D3: Sent is History now). A run's address lands whenever it is the one.
  const arrived = useRef(route);
  const landing = route === arrived.current || route === "broadcasts" ? sequenceLandingOf(route) : null;
  const runId = arrivedRunOf(route);
  const run = useLinkedRun(runId);
  const runLanding = run ? runLandingOf(route, run) : null;
  const to = landing ?? runLanding;
  useEffect(() => {
    if (to) replaceRoute(to);
  }, [to]);
  // The route's second word, as the shell reads its param (`broadcasts/run:b-1/x` names run:b-1).
  const param = route.split("/")[1] || null;
  return <BroadcastsPage {...broadcastsProps(param)} />;
}
