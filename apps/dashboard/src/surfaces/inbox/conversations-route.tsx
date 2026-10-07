/**
 * Conversations as the route draws it (decision 0015, step 3): the tab and the row the address names, by the page's one
 * rule (`cvRoute`). What the frame's table did in its `drawConversations` row, now that the layout draws the page.
 */
import { usePathname } from "next/navigation";
import { routeOfPath } from "@chanlytics/contracts";
import { ConversationsPage } from "./pages/conversations-page";
import { cvRoute } from "./cv-rules";

export function ConversationsRoute() {
  const route = routeOfPath(usePathname()) ?? "conversations";
  // A tab or a row's id, a chat's (its conversation's) or a call's (cv-), by the page's one rule (cvRoute).
  const cv = cvRoute(route.split("/")[1] || null);
  return <ConversationsPage channel={cv.channel} initialId={cv.id} />;
}
