import { Surface } from "@/shell/Surface";
import { TAB_ROUTES } from "@/shell/notifications-pure";

/** The Inbox is the page's own, its threads too: on a phone a thread is an entry of its own, and Back closes it. */
export default function InboxTab() {
  return <Surface route={TAB_ROUTES.inbox} tab="inbox" />;
}
