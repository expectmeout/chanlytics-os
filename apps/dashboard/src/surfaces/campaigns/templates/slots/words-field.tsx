/**
 * The two parts every place that writes an email's or a text's words draws the same way (One message, every channel,
 * step 5): a box of words in the kit's field, whose slots are chips ("First name", "Their business") and never braces,
 * and the menu that puts one of the message's slots into the words by its name, at the caret. The version editor on the
 * Templates page and the reach-out's sheet both draw them, so a campaign email and a reach-out's email are written with
 * one editor over their own slot sets.
 */
import { useId, useRef } from "react";
import { VERSION_CHANNEL_WORDS, slotLabel } from "@chanlytics/contracts";
import type { OwnVersionChannel, SlotKey, SlotSet, SlotValue } from "@chanlytics/contracts";
import { Button } from "../../../kit/button/button";
import { Field } from "../../../kit/field/field";
import { Icon } from "../../../kit/icon/icon";
import { Menu } from "../../../kit/menu/menu";
import { TPL_VERSION_WORDS as WORDS } from "../words";
import { SlotBox } from "./slot-box";
import type { BoxName, SlotSeats } from "./slot-seats";

interface ValuesMenuProps {
  channel: OwnVersionChannel;
  slots: SlotSet;
  /** A few words beside each slot's name, in the set's order: the example that fills it in a preview, or what it is. */
  values: readonly SlotValue[];
  onPick: (slot: SlotKey) => void;
  /** The trigger's test id; the editor's own where none is given. */
  testid?: string;
}

/** The menu that puts a slot of the message into the words, each by its name and, beside it, a few words about it. */
export function ValuesMenu({ channel, slots, values, onPick, testid = "template-version-values" }: ValuesMenuProps) {
  return (
    <Menu
      align="start"
      label={WORDS.addValueName(VERSION_CHANNEL_WORDS[channel])}
      trigger={
        <Button size="sm" data-testid={testid}>
          <Icon name="plus" size={12} /> {WORDS.addValue}
        </Button>
      }
      groups={[
        {
          items: slots.keys.map((key, i) => ({
            label: slotLabel(slots, key),
            meta: values[i] || undefined,
            onSelect: () => onPick(key),
          })),
        },
      ]}
    />
  );
}

interface WordsFieldProps {
  name: BoxName;
  label: string;
  hint?: string;
  lines: 1 | 4 | 8;
  value: string;
  maxLength?: number;
  slots: SlotSet;
  readOnly: boolean;
  seats: SlotSeats;
  onType: (words: string) => void;
  testid?: string;
}

/**
 * One box of words, in the kit's field: its slots are chips, and it is drawn again where an edit asks. The box is no
 * Base UI control, so the field cannot wire it: the hint (the subject's count) is the box's description by the id given
 * it here, and pressing the label hands the box the focus.
 */
export function WordsField(p: WordsFieldProps) {
  const { name, label, hint, lines, value, maxLength, slots, readOnly, seats, onType, testid } = p;
  const seat = seats.seats[name];
  const hintId = `${useId()}-hint`;
  const box = useRef<HTMLDivElement | null>(null);
  return (
    <Field
      label={label}
      hint={hint}
      hintId={hint ? hintId : undefined}
      onLabelPress={() => box.current?.focus()}
      control={
        <SlotBox
          key={seat.draws}
          label={label}
          value={value}
          onValueChange={onType}
          onRepaint={(edit) => seats.put(name, edit)}
          history={seats.history[name]}
          onRestore={(edit) => seats.put(name, edit)}
          describedBy={hint ? hintId : undefined}
          inputRef={box}
          slots={slots}
          lines={lines}
          maxLength={maxLength}
          readOnly={readOnly}
          caret={seat.caret}
          onFocus={seats.focused(name)}
          onBlur={seats.left(name)}
          data-testid={testid ?? `template-version-${name}-box`}
        />
      }
    />
  );
}
