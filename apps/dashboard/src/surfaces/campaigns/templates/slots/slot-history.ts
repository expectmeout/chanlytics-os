/**
 * A slot box's own undo (slot-box.tsx). The browser's undo stack knows only what the browser did, and this box is edited in
 * place by its own code as well (Enter, a paste, a cut, a slot taken whole, the box drawn again with chips where braces
 * were typed, a value put in from the menu), which leaves that stack out of step with the words: Ctrl+Z after a paste
 * restored nothing, or the wrong thing. So the box takes undo and redo itself, and keeps what it needs for them: the words
 * it held after each edit, the caret that edit left, and where the edit began.
 *
 * Typing, or deleting a letter at a time, joins one step while it runs on (the same kind of edit, no pause longer than
 * `HISTORY_RUN_MS`), as the browser's own undo groups it, so one Ctrl+Z takes back a word and not a letter. Any other edit
 * is a step of its own, and an edit after an undo ends what could be redone. Pure over what it is given (the clock is
 * handed in), so it runs in node (slot-history.test.mjs). The keeper outlives the box it serves: a box drawn again for an
 * edit is a new element over the same history, which the seats hold (slot-seats.ts).
 */

/** One state of a box: its words as stored, where the caret stands after the edit that made it, and where that edit began. */
interface Step {
  text: string;
  caret: number;
  from: number;
}

/** The words a step back or forward comes to, and where the caret goes in them. */
export interface HistoryTo {
  text: string;
  caret: number;
}

/** The longest pause, in milliseconds, between two edits of a kind that join, which still joins them. */
export const HISTORY_RUN_MS = 1000;
/** How many steps are kept; the oldest go first. */
export const HISTORY_STEPS = 200;

/** The kinds of edit that run on into one step: typing, deleting a letter at a time, an input method's word. */
const RUNS: ReadonlySet<string> = new Set([
  "insertText",
  "insertCompositionText",
  "deleteContentBackward",
  "deleteContentForward",
]);

/** The history: its steps oldest first (the last is what the box holds), what undo took off, and the run that may go on. */
interface History {
  readonly done: readonly Step[];
  readonly undone: readonly Step[];
  readonly run: { readonly kind: string; readonly at: number } | null;
}

/** A history that holds the words a box opens with. */
export function startOf(text: string): History {
  return { done: [{ text, caret: text.length, from: text.length }], undone: [], run: null };
}

/** An edit made: the words now, the caret after them and where the edit began, of this kind, at this time. */
export function recorded(h: History, edit: Step, kind: string, at: number): History {
  const top = h.done[h.done.length - 1];
  // Words that did not change are no step: a caret that moved, an event that did nothing.
  if (top && top.text === edit.text) return h;
  const joins =
    top !== undefined && h.run !== null && h.run.kind === kind && RUNS.has(kind) && at - h.run.at <= HISTORY_RUN_MS;
  const step = joins ? { ...edit, from: top.from } : edit;
  const done = joins ? [...h.done.slice(0, -1), step] : [...h.done, step];
  return { done: done.slice(-HISTORY_STEPS), undone: [], run: { kind, at } };
}

/** One step back: the words before the last edit, with the caret where that edit began. Null where there is none. */
export function undone(h: History): { history: History; to: HistoryTo } | null {
  const top = h.done[h.done.length - 1];
  const before = h.done[h.done.length - 2];
  if (!top || !before) return null;
  return {
    history: { done: h.done.slice(0, -1), undone: [...h.undone, top], run: null },
    to: { text: before.text, caret: Math.min(top.from, before.text.length) },
  };
}

/** One step forward again: the words the undone edit made, with the caret it left. Null where there is none. */
export function redone(h: History): { history: History; to: HistoryTo } | null {
  const next = h.undone[h.undone.length - 1];
  if (!next) return null;
  return {
    history: { done: [...h.done, next], undone: h.undone.slice(0, -1), run: null },
    to: { text: next.text, caret: Math.min(next.caret, next.text.length) },
  };
}

/** What a box tells its history, and asks of it. The history is held here, not in the box, so a redrawn box keeps it. */
export interface HistoryKeeper {
  /** An edit is about to be made: its kind (the input event's type), and where the selection starts. */
  begin: (kind: string, from: number) => void;
  /** The box holds these words now, the caret after them. */
  record: (text: string, caret: number) => void;
  /** One step back or forward, which the box is then drawn at; null where there is none. */
  step: (way: "undo" | "redo") => HistoryTo | null;
}

/** A keeper over the words a box opens with; `now` is the clock in milliseconds. */
export function keeperOf(opening: string, now: () => number): HistoryKeeper {
  let history = startOf(opening);
  let pending: { kind: string; from: number } | null = null;
  return {
    begin(kind, from) {
      pending = { kind, from };
    },
    record(text, caret) {
      const how = pending ?? { kind: "other", from: caret };
      pending = null;
      history = recorded(history, { text, caret, from: how.from }, how.kind, now());
    },
    step(way) {
      const moved = way === "undo" ? undone(history) : redone(history);
      if (!moved) return null;
      history = moved.history;
      pending = null;
      return moved.to;
    },
  };
}
