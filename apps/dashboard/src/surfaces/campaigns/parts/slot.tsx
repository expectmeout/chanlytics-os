/**
 * A slot of a message, drawn in the bubble by the composer that fills it (the compact composer, C2's round 2: "the
 * bubble IS the fields"). Its words stand where a customer reads them, tinted as what varies; one the owner can change
 * is a quiet control there, and a press opens what fills it over the page -- the sources it may take, and the words
 * typed when it is typed. It replaced the table of slots under the bubble, which said every value a second time.
 *
 * A slot with no choice (a first name is each person's own) is its words alone, with what fills it on hover and focus.
 *
 * The bubble draws a slot by what fills it. A version editor draws it by its name ("First name"), in the same tint, as
 * one thing the caret passes over and Backspace takes whole (SlotName; templates/slots/slot-box.tsx).
 */
import { Field } from "../../kit/field/field";
import { LinkButton } from "../../kit/link-button/link-button";
import { Popover } from "../../kit/popover/popover";
import { Segmented } from "../../kit/segmented/segmented";
import { Tooltip } from "../../kit/tooltip/tooltip";

interface CmSlotProps {
  /** What the slot is ("Business name"): what its control and its popover are named. */
  label: string;
  /** The words it shows now, in the bubble. */
  text: string;
  /** What fills it now: a source's key, or "text" for words typed here. */
  kind: string;
  /** The sources it may take, in their words; one or none is no choice. */
  offers: readonly { id: string; label: string }[];
  onKind: (kind: string) => void;
  /** The words typed, while it is typed. */
  typed: string;
  onTyped: (words: string) => void;
  /** What the typed box says while empty. */
  placeholder?: string;
  /** Where its words come from, said under the choice ("From Settings › Business"). */
  hint?: string | null;
  /** The slot's test id, on its words or its control. */
  testid?: string;
}

/** One slot in the bubble: its words, or its words as the control that changes what fills it. */
export function CmSlot(p: CmSlotProps) {
  const { label, text, kind, offers, onKind, typed, onTyped, placeholder, hint, testid } = p;
  const choose = offers.length > 1;
  if (!choose && kind !== "text") {
    const words = (
      // eslint-disable-next-line jsx-a11y-x/no-noninteractive-tabindex -- a focus stop for its tip, the one way a keyboard reads where it comes from
      <span className="mp-slot" data-kind={kind} data-testid={testid} tabIndex={hint ? 0 : undefined}>
        {text}
      </span>
    );
    return hint ? <Tooltip tip={hint}>{words}</Tooltip> : words;
  }
  return (
    <Popover
      label={`What fills ${label}`}
      align="start"
      className="cm-slot-choice"
      trigger={
        <LinkButton
          className="mp-slot"
          data-kind={kind}
          data-testid={testid}
          aria-label={`${label}: ${text}. Change what fills it`}
        >
          {text}
        </LinkButton>
      }
    >
      <p className="cm-slot-name">{label}</p>
      {choose ? (
        <Segmented
          label={`What fills ${label}`}
          value={kind}
          onValueChange={onKind}
          options={offers.map((o) => ({ value: o.id, label: o.label }))}
        />
      ) : null}
      {kind === "text" ? (
        <Field label="The words" value={typed} onValueChange={onTyped} placeholder={placeholder} maxLength={1024} />
      ) : hint ? (
        <p className="cm-slot-hint">{hint}</p>
      ) : null}
    </Popover>
  );
}

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
