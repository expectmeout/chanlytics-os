/**
 * The Inbox as the route draws it (decision 0015, step 3): the thread the address names, this device's two Inbox
 * preferences, and where a person's name goes. What the frame's table did in its `drawInbox` row, now that the layout
 * draws the page: the address is read from the path, never from the route params, because a move from one thread to
 * the next is a change of the path alone (workspace.ts goToRoute) and the page stays mounted across it.
 */
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { isToSendParam, isUuid, newConversationOf, routeOfPath, sequenceRepliesOf } from "@chanlytics/contracts";
import { loadPrefs } from "@/legacy-bridge/device-prefs";
import { recordNamedBy, useReadNamedRecord } from "../use-named-record";
import { useSurface } from "../use-surface";
import { NewConversationAct } from "./new-conversation/act";
import { openNewConversation } from "./new-conversation/store";
import { useInboxStanding } from "./pages/inbox-head";
import { useSequenceReplies } from "./pages/inbox-from";
import { Inbox } from "./pages/inbox-page";
import { ixRouteThread } from "./rules";
import { appNavigate, navigate } from "./shell";
import { inboxData } from "./store";
import { inboxOverride } from "./surface";

/** The surfaces a link to an older thread asks to read again: the Inbox's own (use-named-record.ts). One list for the page's life. */
const INBOX_READS = [inboxOverride];

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
  // `inbox/from:<sequence>` lists that sequence's replies (contracts sequenceRepliesOf): a filter, never a thread.
  const from = asked ? null : sequenceRepliesOf(param);
  const replies = useSequenceReplies(from);
  // `inbox/to-send` is Needs you with its To send open (the Campaigns wiring review's lane 4): a part, never a thread.
  const toSend = isToSendParam(param);
  const threadParam = from || toSend ? null : ixRouteThread(asked ? null : param, inboxData().THREADS).id;
  // A thread older than the newest hundred is read by its id (the surface does it as it is read; this is for a link taken after:
  // a bell row, a person's "Open the thread"), so the Inbox opens the thread a link names and the notice is for one that is not
  // this workspace's (finding A2c).
  const named = recordNamedBy(route);
  // Only an id the server can read (a uuid): the mockup's seeded `th-1` is no record to ask for.
  const namedId = named?.kind === "conversation" && isUuid(named.id) ? named.id : null;
  const held = useSurface("inbox")?.THREADS.some((t) => t.id === `th-${namedId}`) ?? false;
  const opening = useReadNamedRecord("inbox", INBOX_READS, namedId, held);
  // Where the page stands, for the head the frame draws in Glass (kit/head/frame-head.tsx), and its one act.
  useInboxStanding(<NewConversationAct />);
  return (
    <>
      <Inbox
        density={prefs.inboxDensity}
        showAgentRail={prefs.showInboxAgentRail}
        initialThreadId={threadParam}
        replies={replies}
        toSendOpen={toSend}
        opening={opening}
        onOpenClient={(clientId) => navigate(clientId ? `clients/${clientId}` : "clients")}
      />
    </>
  );
}
