/**
 * Where a value goes when the owner adds one by its name, and how a box is drawn again for it (version-editor.tsx).
 * The editor has up to two slot boxes, the subject and the message. Each remembers where its caret stood as it lost
 * focus (the menu that adds a value takes focus), and the one last used is the one a value goes into, at that caret or
 * at the end where it never had one. A value put in, a slot typed as braces, words cut back to their limit and a step of
 * undo change the words in a way the box cannot make in place, so the box is drawn again: its seat's `draws` is its key
 * and its `caret` is where it opens. A box drawn again is a new element, so what it must keep is held here: its history
 * (slot-history.ts), one for each box, over the words it first had.
 */
import { useRef, useState } from "react";
import { insertSlot } from "@chanlytics/contracts";
import type { SlotEdit, SlotKey } from "@chanlytics/contracts";
import { keeperOf } from "./slot-history";
import type { HistoryKeeper } from "./slot-history";

export type BoxName = "subject" | "body";

/** Where a box's caret stood as it lost focus, a place in its stored words; null where it never had one. */
type Mark = { start: number; end: number } | null;

/** One box's turn: how many times it has been drawn again, and where its caret goes as it is. */
export type Seat = { draws: number; caret: number | null };

const OPENING: Record<BoxName, Seat> = { subject: { draws: 0, caret: null }, body: { draws: 0, caret: null } };

export interface SlotSeats {
  seats: Record<BoxName, Seat>;
  /** Each box's undo, which outlives the box. */
  history: Record<BoxName, HistoryKeeper>;
  /**
   * The words, and the box drawn again: an edit it asks for (a slot typed as braces, words cut to their limit), a step of
   * its history, or a value put in. Told to the history by whoever made the edit, never here.
   */
  put: (to: BoxName, edit: SlotEdit) => void;
  /** A value put in the box last used, at its caret, or at the end. */
  add: (slot: SlotKey) => void;
  /** A box took focus: it is the one a value goes into. */
  focused: (name: BoxName) => () => void;
  /** A box lost focus: where its caret was. */
  left: (name: BoxName) => (at: Mark) => void;
}

/** The words of each box now, and how the editor changes them. */
export function useSlotSeats(words: Record<BoxName, string>, write: (to: BoxName, text: string) => void): SlotSeats {
  const [seats, setSeats] = useState(OPENING);
  const last = useRef<BoxName>("body");
  const marks = useRef<Record<BoxName, Mark>>({ subject: null, body: null });
  const [history] = useState(() => ({
    subject: keeperOf(words.subject, Date.now),
    body: keeperOf(words.body, Date.now),
  }));
  const put = (to: BoxName, edit: SlotEdit) => {
    write(to, edit.text);
    setSeats((now) => ({ ...now, [to]: { draws: now[to].draws + 1, caret: edit.caret } }));
  };
  const add = (slot: SlotKey) => {
    const to = last.current;
    const text = words[to];
    const at = marks.current[to] ?? { start: text.length, end: text.length };
    const edit = insertSlot(text, slot, at.start, at.end);
    history[to].begin("insertSlot", Math.min(at.start, at.end));
    history[to].record(edit.text, edit.caret);
    put(to, edit);
  };
  return {
    seats,
    history,
    put,
    add,
    focused: (name) => () => {
      last.current = name;
    },
    left: (name) => (at) => {
      marks.current[name] = at;
    },
  };
}
