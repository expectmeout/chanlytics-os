/**
 * A message open where it is needed, drawn as the Library draws it (templates/template-pane.tsx): its languages, its
 * channels and its menu, with the Library's own verbs (templates/page-acts.tsx), so a change made here is the change the
 * Library makes, said in the opener's toast. The settings surface holds the messages, as it does for the Library: read as
 * it is drawn. A name the workspace no longer holds says so, with the Library one press away.
 */
import { useRef, useState } from "react";
import { CAMPAIGN_ROOMS, LIBRARY_WORDS, LIFECYCLE_WORDS, MESSAGES_ROUTE } from "@chanlytics/contracts";
import type { TemplateDto } from "@/surfaces/inbox/types";
import { canDo, gateTitle, routeDoor } from "../../legacy-verbs";
import type { useLegacyToast } from "../../legacy-verbs";
import { EmptyState, FailedRead } from "../../kit/empty/empty";
import { LinkButton } from "../../kit/link-button/link-button";
import { useSurface } from "../../use-surface";
import { groupNamed, listingOf } from "../templates/group";
import { pageActs } from "../templates/page-acts";
import { TemplatePane } from "../templates/template-pane";
import { starters as library } from "../templates/verbs";
import { brainOf } from "../templates/words";

/** No email or text rows read: one array for every draw, so nothing that takes it sees it change. */
const NONE_READ: readonly TemplateDto[] = [];

/** Where a message is opened from: its name, the toast a change says itself in, and how its pane is closed. */
export interface MessageInPlaceProps {
  name: string;
  /** The opener's toast host: what a change says outlives the pane. */
  flash: ReturnType<typeof useLegacyToast>[1];
  onClose: () => void;
}

/**
 * The message's pane, once the messages are read: its languages, channels and verbs, as the Library draws it. Opened over
 * the page a message was pressed on (surfaces/see), and where a sequence's step stands, in place of its preview
 * (sequences/step-editor.tsx: the canvas's step editor, its words written where they are read).
 */
export function MessageInPlace({ name, flash, onClose }: MessageInPlaceProps) {
  const settings = useSurface("settings");
  // The numbers, from the channels read (surfaces/channels/surface.ts): a WhatsApp version needs one.
  const channels = useSurface("channels")?.rows;
  const [doing, setDoing] = useState<string | null>(null);
  const doingRef = useRef<string | null>(null);
  const templates = settings ? settings.templatesAll : undefined;
  const messages = settings?.messages;
  if (templates === undefined || messages === undefined)
    return (
      <p className="route-reading cmh-reading" role="status" data-testid="cmh-message-reading">
        {LIFECYCLE_WORDS.reading}
      </p>
    );
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
            <LinkButton {...routeDoor(MESSAGES_ROUTE)} data-testid="cmh-message-library">
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
