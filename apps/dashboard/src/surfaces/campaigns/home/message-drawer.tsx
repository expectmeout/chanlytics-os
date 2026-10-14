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
import { useRef, useState } from "react";
import { CAMPAIGN_ROOMS, LIBRARY_WORDS, LIFECYCLE_WORDS, bookingTemplate } from "@chanlytics/contracts";
import type { TemplateDto } from "@/surfaces/inbox/types";
import { canDo, gateTitle, routeDoor } from "../../legacy-verbs";
import type { useLegacyToast } from "../../legacy-verbs";
import { EmptyState, FailedRead } from "../../kit/empty/empty";
import { LinkButton } from "../../kit/link-button/link-button";
import { useSurface } from "../../use-surface";
import { customKey, listingOf } from "../templates/group";
import type { TemplateGroup } from "../templates/group";
import { pageActs } from "../templates/page-acts";
import { TemplatePane } from "../templates/template-pane";
import { starters as library } from "../templates/verbs";
import { brainOf } from "../templates/words";
import { useKept } from "./drawer";
import { HomeReading } from "./failed";
import { PaneSheet } from "./pane-sheet";

/** No email or text rows read: one array for every draw, so nothing that takes it sees it change. */
const NONE_READ: readonly TemplateDto[] = [];

interface MessageDrawerProps {
  /** The message's name the address holds, or null while none is open. */
  name: string | null;
  /** The home's toast host: what a change says outlives the drawer. */
  flash: ReturnType<typeof useLegacyToast>[1];
  onClose: () => void;
}

/** The message by its name in the Library's listing: a starter by its own name, a message the workspace wrote by its key. */
function groupNamed(groups: readonly TemplateGroup[], name: string): TemplateGroup | null {
  return groups.find((g) => (g.starter ? g.starter.name === name : g.key === customKey(name))) ?? null;
}

/** The message's pane, once the messages are read: its languages, channels and verbs, as the Library draws it. */
function MessageBody({ name, flash, onClose }: Omit<MessageDrawerProps, "name"> & { name: string }) {
  const settings = useSurface("settings");
  // The numbers, from the channels read (surfaces/channels/surface.ts): a WhatsApp version needs one.
  const channels = useSurface("channels")?.rows;
  const [doing, setDoing] = useState<string | null>(null);
  const doingRef = useRef<string | null>(null);
  const templates = settings ? settings.templatesAll : undefined;
  const messages = settings?.messages;
  if (templates === undefined || messages === undefined) return <HomeReading testid="cmh-message-reading" />;
  if (templates === null || messages === null) {
    return (
      <FailedRead
        kind="line"
        what={LIBRARY_WORDS.failedWhat}
        body={LIBRARY_WORDS.failedBody}
        surface="settings"
        testid="cmh-message-failed"
      />
    );
  }
  const listing = listingOf(templates, messages, library);
  const g = groupNamed([...listing.starters, ...listing.customGroups, ...listing.hiddenGroups], name);
  if (!g) {
    const W = LIFECYCLE_WORDS.messageGone;
    return (
      <EmptyState
        kind="line"
        title={W.title}
        body={
          <>
            {W.body}{" "}
            <LinkButton {...routeDoor("messages")} data-testid="cmh-message-library">
              {CAMPAIGN_ROOMS.library}
            </LinkButton>
          </>
        }
        testid="cmh-message-gone"
      />
    );
  }
  const hasWhatsApp = (channels || []).some((c) => c.kind === "whatsapp");
  // Who may add, change or remove a message: the role store's answer, View-as included; a WhatsApp version needs a number.
  const canAct = !!canDo("approve");
  const addWhy = !hasWhatsApp ? LIBRARY_WORDS.addNeedsNumber : !canAct ? gateTitle("approve", "add a language") : null;
  const acts = pageActs({ doingRef, setDoing, flash });
  return (
    <TemplatePane
      key={g.key}
      g={g}
      langs={listing.langs}
      bizName={brainOf(settings?.settings).business_name || null}
      canAct={canAct && hasWhatsApp}
      canAdd={canAct && hasWhatsApp}
      addWhy={addWhy}
      busy={doing !== null}
      doing={doing}
      S={library}
      onClose={onClose}
      onAdd={(gg, lang) => acts.addStarters([gg.starter.key], [lang.id])}
      onRename={acts.rename}
      onHide={acts.toggleHidden}
      onDelete={acts.remove}
      onWritten={acts.written}
      versions={settings?.templateVersions ?? NONE_READ}
      canWrite={canAct}
      onSaveVersion={acts.saveVersion}
      onRemoveVersion={acts.removeVersion}
    />
  );
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
      <MessageBody name={name} flash={p.flash} onClose={p.onClose} />
    </PaneSheet>
  );
}
