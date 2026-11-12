/**
 * New, said (the Messages redesign's step 4, the canvas's New board): one line in the owner's own words, typed or said, and
 * Ask writes the message for every channel it can go by, names it, says who can get it, checks it against WhatsApp's rules
 * and what the business has said, and files every version with one press on its card (propose_sequence's action message,
 * the door POST templates/message). No form: no channel picked first, no kind, no name with underscores, no numbered
 * values, no starters to pick from (Ruben, 12 Nov 2026: an input to Ask, never preset rows). The pane goes as Ask comes;
 * the message lands in the list once its card is pressed.
 */
import { useEffect, useRef, useState, type KeyboardEvent } from "react";
import { askAbout, gate } from "../../frame-verbs";
import { Icon } from "../../kit/icon/icon";
import { LineField, LinePress } from "../../kit/line/line";
import { CmPane } from "../parts/split";
import { TPL_NEW_WORDS as W } from "./words";

export function NewSaid({ onClose }: { onClose: () => void }) {
  const [said, setSaid] = useState("");
  const field = useRef<HTMLTextAreaElement>(null);
  useEffect(() => {
    field.current?.focus({ preventScroll: true });
  }, []);
  const words = said.trim();
  const send = () => {
    if (!words) return;
    onClose();
    askAbout({ prompt: W.asked(words), fresh: true });
  };
  const onKey = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key !== "Enter" || event.shiftKey || event.nativeEvent.isComposing) return;
    event.preventDefault();
    send();
  };
  return (
    <CmPane testid="template-new" title={W.title} sub={<span>{W.sub}</span>} onClose={onClose}>
      <div className="tpl-new-said">
        <div className="tpl-ask-line">
          <span className="tpl-ask-mark" aria-hidden="true">
            <Icon name="three" size={15} />
          </span>
          <LineField
            ref={field}
            className="tpl-ask-words"
            rows={1}
            value={said}
            onChange={(event) => setSaid(event.currentTarget.value)}
            onKeyDown={onKey}
            placeholder={W.hint}
            aria-label={W.label}
            enterKeyHint="send"
            maxLength={1000}
            data-testid="template-new-words"
          />
          <LinePress
            kind="send"
            onClick={send}
            disabled={!words}
            aria-label={W.send}
            data-testid="template-new-send"
            {...gate("approve", "write a message")}
          >
            <Icon name="arrow-up" size={15} />
          </LinePress>
        </div>
        <p className="tpl-ver-note">{W.note}</p>
      </div>
    </CmPane>
  );
}
