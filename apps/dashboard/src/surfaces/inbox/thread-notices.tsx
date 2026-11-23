/**
 * What the Inbox's pane says of a link to a thread outside the loaded list (finding A2c; pages/inbox-page.tsx): on its way
 * while it is read by its id, or not among the newest shown, with the way to the person in People. Nobody else's
 * conversation opens in its place.
 */
import { EmptyState } from "../kit/empty/empty";

/** A link to a thread outside the loaded list, while it is read by its id: say it is on its way, and open nobody else's in its place. */
export function openingThread() {
  return (
    <EmptyState
      kind="page"
      glyph="inbox"
      title="Opening this conversation…"
      body="It shows here as soon as it has been read."
      testid="inbox-opening-thread"
    />
  );
}

/** A link to a thread outside the loaded list: say so in the pane, and open nobody else's conversation in its place. */
export function missingThread(showInbox: () => void) {
  return (
    <EmptyState
      kind="page"
      glyph="inbox"
      title="That conversation isn't among the newest shown here"
      body="The Inbox loads the newest conversations first. Open the person in People to find this one."
      action={{ label: "Open People", to: "clients" }}
      also={{ label: "Show the Inbox", onClick: showInbox }}
      testid="inbox-missing-thread"
    />
  );
}
