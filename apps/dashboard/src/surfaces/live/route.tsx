/**
 * Live as the route draws it (decision 0015, step 8): the call the address names, opened on the page. What the frame's
 * table did in its `drawLive` row, now that the layout draws the page: the address is read from the path, never from the
 * route params, because the page writes the call it opens to the address (replaced) and stays mounted across it.
 */
import { usePathname } from "next/navigation";
import { routeOfPath } from "@chanlytics/contracts";
import { NewConversationAct } from "../inbox/new-conversation/act";
import { useStanding } from "../kit/head/standing";
import { LivePage } from "./live-page";

export function LiveRoute() {
  const route = routeOfPath(usePathname()) ?? "live";
  // The route's second word, as the shell reads its param (`live/lc-1/x` names lc-1).
  const param = route.split("/")[1] || null;
  // Live is a tab of the Inbox, and wears its one act (New conversation); the name and the way back stay the crumbs'.
  useStanding({ act: <NewConversationAct /> });
  return <LivePage initialCallId={param} />;
}
