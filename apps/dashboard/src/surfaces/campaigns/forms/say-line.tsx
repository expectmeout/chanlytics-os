/**
 * One line said in words (the Forms canvas: "an input to AI, never preset rows"): what to collect, what to change,
 * what else to ask, where else a form is shared. The kit's line, as a message's own line to AI stands; Enter sends it,
 * and its words stay while the answer is on its way, so a press that failed has lost nothing.
 */
import { useState, type KeyboardEvent, type ReactNode } from "react";
import { Icon } from "../../kit/icon/icon";
import { LineBox, LineField, LinePress } from "../../kit/line/line";
import { gate } from "../../shell-doors";

interface SayLineProps {
  /** What stands at the line's head: AI's three where the words go to AI. */
  mark: ReactNode;
  placeholder: string;
  /** The line's name to a screen reader, and its send's. */
  label: string;
  send: string;
  /** The answer is on its way: the line holds its words and takes no second send. */
  busy?: boolean;
  /** What is said; answers whether the words may be let go of (true) or are kept for another try. */
  onSay: (words: string) => Promise<boolean> | boolean;
  /** Words the line opens holding: a sentence kept from a try that failed. */
  kept?: string;
  maxLength?: number;
  testid: string;
}

export function SayLine({
  mark,
  placeholder,
  label,
  send,
  busy = false,
  onSay,
  kept = "",
  maxLength = 600,
  testid,
}: SayLineProps) {
  const [said, setSaid] = useState(kept);
  const words = said.trim();
  const sendNow = async () => {
    if (!words || busy) return;
    if (await onSay(words)) setSaid("");
  };
  const onKey = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key !== "Enter" || event.shiftKey || event.nativeEvent.isComposing) return;
    event.preventDefault();
    void sendNow();
  };
  return (
    <LineBox mark={mark} busy={busy} data-testid={testid}>
      <LineField
        rows={1}
        value={said}
        onChange={(event) => setSaid(event.currentTarget.value)}
        onKeyDown={onKey}
        placeholder={placeholder}
        aria-label={label}
        enterKeyHint="send"
        maxLength={maxLength}
        readOnly={busy}
        data-testid={`${testid}-words`}
      />
      <LinePress
        kind="send"
        onClick={() => void sendNow()}
        disabled={!words || busy}
        aria-label={send}
        data-testid={`${testid}-send`}
        {...gate("approve", "change a form")}
      >
        <Icon name="arrow-up" size={15} />
      </LinePress>
    </LineBox>
  );
}
