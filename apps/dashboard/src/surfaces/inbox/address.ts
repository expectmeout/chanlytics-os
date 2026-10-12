/**
 * What an address of the Inbox or of Conversations names (wiring/records-not-pages, task 4.1; finding A2c): the one
 * conversation or call a link opens, which the page may not hold. Each page holds the newest hundred threads and calls, and
 * a bell row from last week, an Activity line, a person's "Open the thread", an Ask citation or a tapped push can name an
 * older one. The page used to say "That conversation isn't among the newest shown here", because it looked the record up in
 * the window it holds; a link is a read of one record by its id, and these say which (the surfaces read it: surface.ts,
 * conversations-surface.ts).
 *
 * Pure, and light, so the surfaces that read at boot can ask it without the registry of every page's addresses
 * (surfaces/addresses.ts holds these same parses for the Inbox and Conversations, beside the other pages').
 */
import { isUuid, newConversationOf } from "@chanlytics/contracts";
import { cvRoute } from "./cv-rules";
import { ixRouteThread } from "./rules";

/**
 * The conversation the Inbox's param names (`th-<conversation>`), by the conversation's own id; null for the door of a new
 * conversation (`new`, `new:<person>`), which names no thread, and for a word that is no thread's. The thread the page opens
 * is the Inbox's rule (rules.ts ixRouteThread); this reads the conversation off its id.
 */
export function inboxThread(param: string | null): string | null {
  if (newConversationOf(param)) return null;
  const id = ixRouteThread(param, null).id;
  return id !== null && id.startsWith("th-") && id.length > 3 ? id.slice(3) : null;
}

/**
 * The row Conversations' param opens (`<tab>:<row>`, or the row alone: cvRoute): a chat by its conversation's id, a call by
 * the call's (`cv-<call>`). A tab alone names neither.
 */
export function conversationsRow(param: string | null): { chat: string | null; call: string | null } {
  const id = cvRoute(param).id;
  if (!id) return { chat: null, call: null };
  return id.startsWith("cv-") ? { chat: null, call: id.slice(3) || null } : { chat: id, call: null };
}

/**
 * What a route on screen asks of the server by id: the conversation (the Inbox's thread, or the chat Conversations has open,
 * which draws its thread from the Inbox's store) and the call it names. Only an id the server can read (a uuid): a seeded
 * thread's `th-1` is the mockup's, and a word that is no id names nothing to read. Any other page names neither.
 */
export function namedByRoute(route: string): { chat: string | null; call: string | null } {
  const at = route.indexOf("/");
  const page = at < 0 ? route : route.slice(0, at);
  const param =
    at < 0
      ? null
      : route
          .slice(at + 1)
          .split("/")
          .at(0) || null;
  const named =
    page === "inbox"
      ? { chat: inboxThread(param), call: null }
      : page === "conversations"
        ? conversationsRow(param)
        : { chat: null, call: null };
  return { chat: isUuid(named.chat) ? named.chat : null, call: isUuid(named.call) ? named.call : null };
}
