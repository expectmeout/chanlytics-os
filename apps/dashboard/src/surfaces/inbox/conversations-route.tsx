/**
 * Conversations as the route draws it (decision 0015, step 3): the tab and the row the address names, by the page's one
 * rule (`cvRoute`). What the frame's table did in its `drawConversations` row, now that the layout draws the page.
 */
import { usePathname } from "next/navigation";
import { isUuid, routeOfPath } from "@chanlytics/contracts";
import { useStanding } from "../kit/head/standing";
import { recordNamedBy, useReadNamedRecord } from "../use-named-record";
import { useSurface } from "../use-surface";
import { NewConversationAct } from "./new-conversation/act";
import { ConversationsPage } from "./pages/conversations-page";
import { conversationsOverride } from "./conversations-surface";
import { cvRoute } from "./cv-rules";
import { inboxOverride } from "./surface";

/**
 * The surfaces a link to an older chat or call asks to read again: Conversations' rows, and the Inbox's threads, which a chat
 * draws its thread from (use-named-record.ts). One list for the page's life.
 */
const CONVERSATIONS_READS = [conversationsOverride, inboxOverride];

export function ConversationsRoute() {
  const route = routeOfPath(usePathname()) ?? "conversations";
  // A tab or a row's id, a chat's (its conversation's) or a call's (cv-), by the page's one rule (cvRoute).
  const cv = cvRoute(route.split("/")[1] || null);
  // A chat or a call older than the hundred each read holds is read by its id (the surfaces do it as they are read; this is for
  // a link taken after), so the row a link names opens and the notice is for one that is not this workspace's (finding A2c).
  const named = recordNamedBy(route);
  // Only an id the server can read (a uuid): the mockup's seeded rows are no record to ask for.
  const rowId =
    named?.kind === "call" && isUuid(named.id)
      ? `cv-${named.id}`
      : named?.kind === "conversation" && isUuid(named.id)
        ? named.id
        : null;
  const rows = useSurface("conversations")?.CONVERSATIONS;
  const threads = useSurface("inbox")?.THREADS;
  // A chat draws its thread from the Inbox's store, so the thread is held too; a call opens alone.
  const held =
    (rows?.some((c) => c.id === rowId) ?? false) &&
    (named?.kind !== "conversation" || (threads?.some((t) => t.id === `th-${named.id}`) ?? false));
  const opening = useReadNamedRecord("conversations", CONVERSATIONS_READS, rowId, held);
  // The Inbox's one act stands over each of its tabs (New conversation); the name and the way back stay the crumbs'.
  useStanding({ act: <NewConversationAct /> });
  return <ConversationsPage channel={cv.channel} initialId={cv.id} opening={opening} />;
}
