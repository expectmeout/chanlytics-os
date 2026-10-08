/**
 * The Inbox as the route draws it (decision 0015, step 3): the thread the address names, this device's two Inbox
 * preferences, and where a person's name goes. What the frame's table did in its `drawInbox` row, now that the layout
 * draws the page: the address is read from the path, never from the route params, because a move from one thread to
 * the next is a change of the path alone (workspace.ts goToRoute) and the page stays mounted across it.
 */
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { newConversationOf, routeOfPath } from "@chanlytics/contracts";
import { loadPrefs } from "@/legacy-bridge/device-prefs";
import { NewConversationAct } from "./new-conversation/act";
import { openNewConversation } from "./new-conversation/store";
import { useInboxStanding } from "./pages/inbox-head";
import { Inbox } from "./pages/inbox-page";
import { ixRouteThread } from "./rules";
import { appNavigate, navigate } from "./shell";
import { inboxData } from "./store";

export function InboxRoute() {
  const route = routeOfPath(usePathname()) ?? "inbox";
  // The route's second word, as the shell reads its param (`inbox/th-1/x` names th-1).
  const param = route.split("/")[1] || null;
  // This device's own, read as the page mounts: nothing in the app changes them while it is open.
  const [prefs] = useState(() => loadPrefs(() => localStorage));
  // `inbox/new` and `inbox/new:<person>` are the new conversation's door (contracts newConversationOf), never a
  // thread's address: the sheet opens, on that person where one is named, and the address goes back to the Inbox's
  // own, so a reload or Back does not open it again.
  const asked = newConversationOf(param);
  const askedFor = asked ? (asked.personId ?? "") : null;
  useEffect(() => {
    if (askedFor === null) return;
    openNewConversation(askedFor || null);
    appNavigate("inbox", { replace: true });
  }, [askedFor]);
  // The id is passed on even when that thread is not loaded: the Inbox says it is missing, rather than opening the
  // first thread in its place.
  const threadParam = ixRouteThread(asked ? null : param, inboxData().THREADS).id;
  // Where the page stands, for the head the frame draws in Glass (kit/head/frame-head.tsx), and its one act.
  useInboxStanding(<NewConversationAct />);
  return (
    <>
      <Inbox
        density={prefs.inboxDensity}
        showAgentRail={prefs.showInboxAgentRail}
        initialThreadId={threadParam}
        onOpenClient={(clientId) => navigate(clientId ? `clients/${clientId}` : "clients")}
      />
    </>
  );
}
