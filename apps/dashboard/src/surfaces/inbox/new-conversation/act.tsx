/**
 * The Inbox's one filled act, New conversation (a conversation begins from the Inbox, the design's 4.1): the button the
 * frame's head draws at the right of the row of views on the Inbox's three tabs. It asks the store for the sheet, and
 * the frame's host answers (host.tsx): a tab's first load holds this button and the store, never the sheet. A pointer
 * or focus reaching it warms the sheet, so a press finds it loaded.
 *
 * The mark is the button's own child and the words a span beside it. On a phone the frame draws an act beside a strip
 * of views as a 44px circle and keeps every span of it for a screen reader alone (components.css): the plus stays in
 * the circle, and the name is still heard.
 *
 * The button is written with the kit's own classes, as the Pipeline's New proposal is (people/pipeline/standing.tsx):
 * the classes are the ones the kit's Button writes, and the Inbox's folder is one the raw-element lint passes over.
 */
import { NEW_CONVERSATION_WORDS } from "@chanlytics/contracts";
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
      <Icon name="plus" size={14} />
      <span>{W.act}</span>
    </button>
  );
}
