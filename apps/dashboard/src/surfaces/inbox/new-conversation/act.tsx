/**
 * The Inbox's one filled act, New conversation (a conversation begins from the Inbox, the design's 4.1): the button the
 * frame's head draws at the right of the row of views on the Inbox's three tabs. It asks the store for the sheet, and
 * the frame's host answers (host.tsx): a tab's first load holds this button and the store, never the sheet. A pointer
 * or focus reaching it warms the sheet, so a press finds it loaded.
 *
 * Its words are the kit's part for an act's words (kit/head/act-words.tsx): the mark and the first word kept together,
 * the rest after them. On a phone, beside the row of views, the capsule says "+ New" (Ruben, 8 October 2026: it was a
 * bare circle, a plus that said nothing), as People's scopes say "New", "Add" and "Find" there; the rest of the name is
 * wrapped onto a line the capsule does not show, so a screen reader still hears "New conversation" (components.css).
 *
 * The button is written with the kit's own classes, as the Pipeline's New proposal is (people/pipeline/standing.tsx):
 * the classes are the ones the kit's Button writes, and the Inbox's folder is one the raw-element lint passes over.
 */
import { NEW_CONVERSATION_WORDS } from "@chanlytics/contracts";
import { ActWords } from "../../kit/head/act-words";
import { Icon } from "../../kit/icon/icon";
import { gate } from "../shell";
import { openNewConversation, warmNewConversation } from "./store";

/** The button, as the head draws it: shown to every role, and said why where a role may not write. */
export function NewConversationAct() {
  const W = NEW_CONVERSATION_WORDS;
  return (
    <button
      type="button"
      className="btn btn-lg btn-primary"
      data-testid="inbox-new"
      onClick={() => openNewConversation()}
      onPointerEnter={warmNewConversation}
      onFocus={warmNewConversation}
      {...gate("approve", W.gate)}
    >
      <ActWords icon={<Icon name="plus" size={14} />} words={W.act} />
    </button>
  );
}
