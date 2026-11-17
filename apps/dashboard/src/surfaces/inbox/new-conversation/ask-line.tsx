/**
 * One line to AI where no approved message can start a chat with this person yet (Campaigns, one tab, call C10): what it
 * should say, in the owner's own words, typed; AI writes a message the Inbox can start a chat with, for every channel its
 * kind may go by, and files it with one press on its card. It was Messages' New message, which went as Messages folded
 * into Campaigns. No form: no channel picked first, no kind, no name (Ruben, 12 Nov 2026: an input to AI, never preset
 * rows). Its own state, so the sheet's stays what it holds (state.ts).
 */
import { useState, type KeyboardEvent } from "react";
import { NEW_CONVERSATION_WORDS } from "@chanlytics/contracts";
import { Icon } from "../../kit/icon/icon";
import { LineBox, LineField, LinePress } from "../../kit/line/line";
import { gate } from "../shell";

const W = NEW_CONVERSATION_WORDS.approved.ask;

export function AskForMessage({ onAsk }: { onAsk: (words: string) => void }) {
  const [said, setSaid] = useState("");
  const words = said.trim();
  const send = () => {
    if (words) onAsk(words);
  };
  const onKey = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key !== "Enter" || event.shiftKey || event.nativeEvent.isComposing) return;
    event.preventDefault();
    send();
  };
  return (
    <div className="ix-new-ask" data-testid="ix-new-ask">
      <LineBox mark={<Icon name="three" size={15} />}>
        <LineField
          rows={1}
          value={said}
          onChange={(event) => setSaid(event.currentTarget.value)}
          onKeyDown={onKey}
          placeholder={W.hint}
          aria-label={W.label}
          enterKeyHint="send"
          maxLength={1000}
          data-testid="ix-new-ask-words"
        />
        <LinePress
          kind="send"
          onClick={send}
          disabled={!words}
          aria-label={W.send}
          data-testid="ix-new-ask-send"
          {...gate("approve", "write a message")}
        >
          <Icon name="arrow-up" size={15} />
        </LinePress>
      </LineBox>
      <p className="ix-new-said">{W.note}</p>
    </div>
  );
}
