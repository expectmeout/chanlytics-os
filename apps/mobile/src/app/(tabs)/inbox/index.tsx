import { Surface } from "@/shell/Surface";

/** The Inbox is the page's own list; a thread opened on it is drawn natively over it (the stack in _layout.tsx). */
export default function InboxTab() {
  return <Surface route="inbox" tab="inbox" />;
}
