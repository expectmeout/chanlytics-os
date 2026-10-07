/**
 * What the frame says around the Inbox and Conversations (moved from the rows `drawInbox` and `drawConversations` of
 * legacy/pages/app-routes.jsx, decision 0015, step 3): the sidebar item each address lights and the crumbs it wears, both
 * by the address's own word (`inbox/<thread>`, `conversations/<tab>:<row>`) and by what the surfaces hold, so a crumb never
 * names a thread that has not been read. The frame asks these as it draws (src/surfaces/routes.ts).
 */
import { cvRoute } from "./cv-rules";
import { ixRouteThread } from "./rules";
import { conversationsData, inboxData } from "./store";

type Crumb = string | { label: string; to: string };

/** The Inbox's crumbs: "Inbox", and the person whose thread is open after it once that thread is read. */
export function inboxCrumbs(param: string | null): Crumb[] {
  const threadWho = ixRouteThread(param, inboxData().THREADS).who;
  return threadWho ? [{ label: "Inbox", to: "inbox" }, threadWho] : ["Inbox"];
}

/** The nav item Conversations lights: its tab's own (Calls, Chats, Email) where the sidebar has one, else Conversations. */
export function conversationsNav(param: string | null): string {
  const channel = cvRoute(param).channel;
  const own: Record<string, string> = { phone: "calls", chats: "chats", mail: "email" };
  return own[channel] || "conversations";
}

/** Conversations' crumbs: a row's person, else the tab in its chip's words, else "Conversations". */
export function conversationsCrumbs(param: string | null): Crumb[] {
  // A tab or a row's id, a chat's (its conversation's) or a call's (cv-), by the page's one rule (cvRoute).
  const data = conversationsData();
  const cv = cvRoute(param);
  const cvTab = cv.channel !== "all" && (data.CV_CHANNELS || []).find((t) => t.id === cv.channel);
  const cvWho = cv.id && (data.CONVERSATIONS || []).find((c) => c.id === cv.id)?.who;
  const inbox = { label: "Inbox", to: "inbox" };
  const conversations = { label: "Conversations", to: "conversations" };
  return cvWho ? [inbox, conversations, cvWho] : cvTab ? [inbox, conversations, cvTab.label] : [inbox, "Conversations"];
}
