/**
 * A slot of a message in the words being written: a version editor draws it by its name ("First name"), in the tint the
 * bubble gives what varies, as one thing the caret passes over and Backspace takes whole (templates/slots/slot-box.tsx).
 * The bubble's own slot, a control that changed what filled it, was the send screen's, and left with it (decision 0065
 * step 7).
 */

interface SlotNameProps {
  /** The slot's name as the editor draws it ("First name"). */
  label: string;
  /** Which of the message's slots it is: its key in the stored words (a number's digits, or its name), never drawn. */
  slot: string;
  /** How the stored words write it where that is not its key between plain braces (`{{01}}`): kept, so they read back as they were. */
  written?: string;
  /** What a screen reader says of it: the name, and that it is filled in for each person. */
  said: string;
  /** A slot the message has no value for: drawn as a problem, and still one thing. */
  unknown?: boolean;
}

/** One slot in the words being written: its name in the bubble's tint, a thing the caret passes over and Backspace takes whole. */
export function SlotName({ label, slot, written, said, unknown = false }: SlotNameProps) {
  return (
    <span
      className="mp-slot"
      contentEditable={false}
      data-slot={slot}
      data-written={written}
      data-unknown={unknown ? "true" : undefined}
      role="img"
      aria-label={said}
    >
      {label}
    </span>
  );
}
