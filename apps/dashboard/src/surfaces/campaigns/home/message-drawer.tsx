/**
 * Campaigns' home, a message open in a drawer of its own (`campaigns/message:<name>`; Ruben, 11 Oct 2026: "the template
 * page screen should not be like a page it should be another drawer screen like when you click on new campaign"): the
 * call's text's message, or the message a campaign's drawer names, read and changed where the home is, never on the
 * Library's page. What it draws is the Library's own pane (templates/template-pane.tsx), its languages, its channels and
 * its menu, with the Library's own verbs (templates/page-acts.tsx) and the home's toast, so a change is said once the
 * drawer has closed. The settings surface holds the messages, as it does for the Library: read as the drawer is drawn.
 *
 * Its kicker says where it was opened from: "The call's text" for the booking link's message, the Library's name for any
 * other. A name the workspace no longer holds says so, with the Library one press away.
 */
import type { ReactNode } from "react";
import { CAMPAIGN_ROOMS, LIFECYCLE_WORDS, bookingTemplate } from "@chanlytics/contracts";
import type { useLegacyToast } from "../../legacy-verbs";
import { useSurface } from "../../use-surface";
import { MessageInPlace } from "../parts/message-in-place";
import { messagePaneContext } from "../parts/message-pane";
import { PaneSheet, useKept } from "./pane-sheet";

interface MessageDrawerProps {
  /** The message's name the address holds, or null while none is open. */
  name: string | null;
  /** The home's toast host: what a change says outlives the drawer. */
  flash: ReturnType<typeof useLegacyToast>[1];
  onClose: () => void;
}

/** A message, open over the home in a drawer of its own. */
export function MessageDrawer(p: MessageDrawerProps) {
  const name = useKept(p.name);
  // The templates the home's call's text row is read from (the playbooks surface's), so the two name the same message.
  const library = useSurface("playbooks")?.library;
  if (name === null) return null;
  // The booking link's message is the call's text, and says so; any other is the Library's.
  const booking = library ? (bookingTemplate(library)?.name ?? null) : null;
  const kicker = booking === name ? LIFECYCLE_WORDS.callText.name : CAMPAIGN_ROOMS.library;
  return (
    <PaneSheet open={p.name !== null} title={kicker} onClose={p.onClose} testid="cmh-message">
      <MessageInPlace name={name} flash={p.flash} onClose={p.onClose} />
    </PaneSheet>
  );
}

/**
 * The same pane handed down to a view of Campaigns that draws it inside itself (the Sequences view's step editor;
 * parts/message-pane.ts), from here, where the home already holds it: the route reaching for the pane itself regrouped the
 * chunks the Campaigns page loads, and it carried the kit's icons a second time (+7 KB gzipped, #1644).
 */
export function MessagePaneProvider({ children }: { children: ReactNode }) {
  const Pane = messagePaneContext();
  return <Pane.Provider value={MessageInPlace}>{children}</Pane.Provider>;
}
