/**
 * The words of an email or a text version, written with its slots drawn by their names (One message, every channel;
 * the review's item 16). The owner never sees `{{1}}`: a slot is a chip ("First name", the bubble's tint, parts/slot.tsx)
 * that the caret passes over in one step, Backspace and Delete take whole, and a copy and a paste carry. The stored
 * words are the string with its `{{1}}`, or `{{business}}` for a reach-out's email, whose slots are named (contracts'
 * toSlotParts and fromSlotParts are the way between, over the message's slot set), and that is all the box says:
 * `onValueChange` hands it up as it is typed.
 *
 * It is a contenteditable, which is not a raw input but is a control all the same: a textbox to a screen reader, named
 * and said to be several lines or one, described by the field's hint (`describedBy`, the id the field's words give it),
 * read-only while a save is out. The browser types into it, moves the caret in it and deletes words in it;
 * slot-box-edits.ts is what is done for Enter, a paste, a slot, a limit and undo (the history is the seats', so a box
 * drawn again keeps it), and slot-dom.ts is how the DOM is read. The box is drawn once, from the words it opens with, and never
 * redrawn from the words it reports: a redraw under the caret loses it, so only a change the box cannot make in place
 * (a value put in by name, a slot typed as braces, which is to become its chip) is a new box, which the editor asks
 * for by changing the box's key and handing it the caret (`caret`).
 */
import { useCallback, useLayoutEffect, useRef, useState } from "react";
import type { ClipboardEvent, ReactNode, Ref, RefObject } from "react";
import { slotKnown, slotLabel, toSlotParts } from "@chanlytics/contracts";
import type { SlotEdit, SlotKey, SlotSet } from "@chanlytics/contracts";
import { SlotName } from "../../parts/slot";
import { TPL_VERSION_WORDS as WORDS } from "../words";
import {
  copyWords,
  extendOverSlot,
  historyKey,
  onBeforeInput,
  placeCaret,
  putWords,
  selectionOf,
  settle,
} from "./slot-box-edits";
import type { BoxContext } from "./slot-box-edits";
import type { HistoryKeeper } from "./slot-history";

interface SlotBoxProps {
  /** What the box is: its name to a screen reader, and the field's label. */
  label: string;
  /** The words as stored, `{{1}}` for a slot: what the box is drawn from as it opens, and not after. */
  value: string;
  /** The words as stored, as they are typed. */
  onValueChange: (words: string) => void;
  /** A slot was typed as braces, or taken whole, in a way the box cannot show in place: it is drawn again from these words. */
  onRepaint: (edit: SlotEdit) => void;
  /** The box's undo, held by the seats so that a box drawn again keeps it. */
  history: HistoryKeeper;
  /** A step of the history: the box is drawn again from these words, the caret in them. No new edit. */
  onRestore: (edit: SlotEdit) => void;
  /** The message's slots: how each is written, and what it is called. */
  slots: SlotSet;
  /** How many lines tall it is, which is its height: one is a line of words, with no Enter. */
  lines: 1 | 4 | 8;
  maxLength?: number;
  /** The id of the words that describe it (the field's hint), for a screen reader; none where it has no hint. */
  describedBy?: string;
  /** The box itself, so that the field's label can hand it the focus. */
  inputRef?: Ref<HTMLDivElement>;
  /** While a save is out: it keeps its words and its focus, and takes no typing. */
  readOnly?: boolean;
  /** Where the caret goes as the box opens, a place in the stored words: set for a box drawn again after an edit. */
  caret?: number | null;
  onFocus?: () => void;
  /** Where its caret or selection was as it lost focus, a place in the stored words; null where it was not in it. */
  onBlur?: (at: { start: number; end: number } | null) => void;
  "data-testid"?: string;
}

/** What an edit needs of the box, read from its latest props at the time of the edit. */
function contextOf(live: RefObject<SlotBoxProps>, composing: RefObject<boolean>): BoxContext {
  const { slots, lines, maxLength, readOnly = false, onValueChange, onRepaint, history, onRestore } = live.current;
  return {
    set: slots,
    lines,
    maxLength,
    readOnly,
    composing: composing.current,
    onValueChange,
    onRepaint,
    history,
    onRestore,
  };
}

/**
 * One slot as its chip: its name, or "Value 5" and a problem for a number the message has no slot for. `written` is how
 * the words write it where that is not its key between plain braces, which the chip keeps for the words to be read back.
 */
function chip(slot: SlotKey, set: SlotSet, key: number, written: string | undefined): ReactNode {
  const known = slotKnown(set, slot);
  const name = slotLabel(set, slot);
  return (
    <SlotName
      key={key}
      slot={slot}
      written={written}
      label={name}
      unknown={!known}
      said={known ? WORDS.slotSaid(name) : WORDS.slotUnknownSaid(name)}
    />
  );
}

/** The words as drawn: each piece of words as itself, each slot as its chip. */
const drawn = (value: string, set: SlotSet): ReactNode[] =>
  toSlotParts(value, set).map((part, i) => (part.kind === "text" ? part.text : chip(part.slot, set, i, part.written)));

export function SlotBox(p: SlotBoxProps) {
  const { label, slots, lines, readOnly = false, describedBy, inputRef, onFocus, onBlur } = p;
  // Drawn once, from the words it opens with: from then on the browser holds them and the box only reads them.
  const [words] = useState(() => drawn(p.value, slots));
  const root = useRef<HTMLDivElement>(null);
  // The box is its own ref's, and the field's label may hand it the focus through the page's.
  const place = useCallback(
    (el: HTMLDivElement | null) => {
      root.current = el;
      if (typeof inputRef === "function") inputRef(el);
      else if (inputRef) inputRef.current = el;
    },
    [inputRef],
  );
  const composing = useRef(false);
  const live = useRef(p);
  useLayoutEffect(() => {
    live.current = p;
  });
  useLayoutEffect(() => {
    const el = root.current;
    if (!el) return undefined;
    const caret = live.current.caret ?? null;
    if (caret !== null) placeCaret(el, caret);
    const hear = (e: InputEvent) => onBeforeInput(e, el, contextOf(live, composing));
    el.addEventListener("beforeinput", hear);
    return () => el.removeEventListener("beforeinput", hear);
  }, []);
  const read = () => {
    if (root.current) settle(root.current, contextOf(live, composing));
  };
  const copy = (e: ClipboardEvent<HTMLDivElement>, cut: boolean) => {
    if (root.current && copyWords(root.current, e.clipboardData, cut, contextOf(live, composing))) e.preventDefault();
  };
  return (
    <div
      ref={place}
      className="rec-input tpl-slotbox"
      role="textbox"
      tabIndex={0}
      aria-multiline={lines > 1}
      aria-label={label}
      aria-describedby={describedBy}
      aria-readonly={readOnly || undefined}
      contentEditable
      suppressContentEditableWarning
      data-lines={lines}
      data-testid={p["data-testid"]}
      onInput={read}
      onKeyDown={(e) => {
        if (root.current) extendOverSlot(e, root.current);
        historyKey(e, contextOf(live, composing));
      }}
      onCompositionStart={() => {
        composing.current = true;
      }}
      onCompositionEnd={() => {
        composing.current = false;
        read();
      }}
      onPaste={(e) => {
        e.preventDefault();
        if (root.current) putWords(root.current, e.clipboardData.getData("text/plain"), contextOf(live, composing));
      }}
      onCopy={(e) => copy(e, false)}
      onCut={(e) => copy(e, true)}
      onDrop={(e) => e.preventDefault()}
      onFocus={() => onFocus?.()}
      onBlur={() => onBlur?.(root.current ? selectionOf(root.current) : null)}
    >
      {words}
      <br />
    </div>
  );
}
