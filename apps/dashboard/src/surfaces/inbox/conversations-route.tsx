/**
 * Conversations as the route draws it (decision 0015, step 3): the tab and the row the address names, by the page's one
 * rule (`cvRoute`). What the frame's table did in its `drawConversations` row, now that the layout draws the page.
 */
import { usePathname } from "next/navigation";
import { routeOfPath } from "@chanlytics/contracts";
import { useStanding } from "../kit/head/standing";
import { NewConversationAct } from "./new-conversation/act";
import { ConversationsPage } from "./pages/conversations-page";
import { cvRoute } from "./cv-rules";

export function ConversationsRoute() {
  const route = routeOfPath(usePathname()) ?? "conversations";
  // A tab or a row's id, a chat's (its conversation's) or a call's (cv-), by the page's one rule (cvRoute).
  const cv = cvRoute(route.split("/")[1] || null);
  // The Inbox's one act stands over each of its tabs (New conversation); the name and the way back stay the crumbs'.
  useStanding({ act: <NewConversationAct /> });
  return <ConversationsPage channel={cv.channel} initialId={cv.id} />;
}
