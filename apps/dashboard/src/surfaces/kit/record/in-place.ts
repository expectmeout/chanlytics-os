/**
 * The record kit's value typed where it is shown (Ruben, 28 Oct 2026: a rename that swapped the words for a box and two
 * buttons "causes weird layout shifts ... it should be seamless"). The words are drawn in a box the browser edits as
 * plain text (contenteditable), at their own size and in their own place, so beginning to type moves nothing: the box
 * was there all along, and a tap on it is the person's own request to type (no field focuses by itself on a touch
 * screen). The page draws the box, spreading `box`, and a pencil after it that `begin`s; while it is typed in the pencil
 * is ✓, which asks for the save (`done`).
 *
 * Two ways a typing ends. Asked (Enter, ✓): what is wrong is said under the box before a round trip (`check`), and the
 * box keeps the keys until the door answers, so a refusal is said there too, over what was typed (`problem`). Left (a
 * press elsewhere, Tab): the save goes on behind, the words said in the box while it does, and a refusal is said by the
 * page (`said`), with the value put back. Escape, and `leave`, put it back and save nothing.
 *
 *   const edit = useInPlace({ value: list.name, start: list.name, max: 60, same, save, said });
 *   <span data-in-place data-typing={edit.typing || undefined}>
 *     <span key={edit.round} {...edit.box} className="cl-in-place" aria-label="The list's name">{edit.shown}</span>
 *     {edit.typing ? <Button onMouseDown={edit.keep} onClick={edit.done}>✓</Button> : <Button onClick={edit.begin}>✎</Button>}
 *   </span>
 *
 * The words come from the box's own events, never a read of the page: the test stubs draw no document. While it is
 * typed in, the block marked `data-in-place` is held at its height, so words cut short or a value cleared take no line
 * from under it; and what is drawn is left alone, so a read that lands then does not take the words from under the keys.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import type { FocusEvent, KeyboardEvent, MouseEvent, SyntheticEvent } from "react";

export interface InPlaceOptions {
  /** What is shown at rest: the value, or what stands in its place (a number for a name). */
  value: string;
  /** What the box holds as typing begins: the value, or nothing where what is shown is not theirs. */
  start: string;
  /** The longest it may be. */
  max: number;
  /** Whether what was typed changes nothing: no save, the value back. */
  same: (typed: string) => boolean;
  /** What is wrong with what was typed, said before a round trip; null where it may be sent. */
  check?: (typed: string) => string | null;
  /** The door: null once it is done (the page says so), else its refusal in its own words. */
  save: (typed: string) => Promise<string | null>;
  /** A refusal of a typing that was left, or of what `check` found in it, said by the page. */
  said: (why: string) => void;
}

/** What a box the browser edits needs to be one, spread on the element that holds the words. */
interface InPlaceBox {
  ref: (el: HTMLElement | null) => void;
  contentEditable: "plaintext-only" | "false";
  suppressContentEditableWarning: true;
  role: "textbox";
  tabIndex: 0;
  "aria-invalid": true | undefined;
  "data-empty": "" | undefined;
  onPointerDown: () => void;
  onFocus: (e: FocusEvent<HTMLElement>) => void;
  onBlur: (e: FocusEvent<HTMLElement>) => void;
  onInput: (e: SyntheticEvent<HTMLElement>) => void;
  onKeyDown: (e: KeyboardEvent<HTMLElement>) => void;
}

export interface InPlace {
  typing: boolean;
  busy: boolean;
  /** What is wrong with what was asked to be saved, said under the box. */
  problem: string | null;
  /** The box's key: each end draws a new box, since React's own text may be gone by then. */
  round: number;
  /** What the box draws. */
  shown: string;
  box: InPlaceBox;
  /** The pencil: the box takes the keys, every word chosen. */
  begin: () => void;
  /** ✓: the save asked for. */
  done: () => Promise<void>;
  /** A press beside the box (✓, a door under it) leaves the keys in the box. */
  keep: (e: MouseEvent) => void;
  /** Put back, and saving nothing. */
  leave: () => void;
  /** The words said in the box while a save the page makes answers (an Undo). */
  hold: (words: string | null) => void;
}

/** What is typed, as a value: one line, its spaces single, at most `max`. */
function cleanOf(typed: string, max: number): string {
  return typed.replace(/\s+/g, " ").trim().slice(0, max);
}

/** The element the event is on, where it is one: a test's stub hands its own. */
function elementOf(e: { currentTarget: unknown }): HTMLElement | null {
  const el = e.currentTarget;
  return typeof HTMLElement !== "undefined" && el instanceof HTMLElement ? el : null;
}

/** The caret after the last word, or every word chosen. */
function caretIn(el: HTMLElement, all: boolean): void {
  const chosen = window.getSelection();
  if (!chosen) return;
  chosen.selectAllChildren(el);
  if (!all) chosen.collapseToEnd();
}

/** The block the box stands in, held at its height while it is typed in, or let go. */
function holdBlock(el: HTMLElement, held: boolean): void {
  const block = el.closest<HTMLElement>("[data-in-place]");
  if (!block) return;
  if (held) block.style.minHeight = `${block.offsetHeight}px`;
  else block.style.removeProperty("min-height");
}

/**
 * The box as typing begins: held at its height, and holding `start` where that is not what was shown (a number cleared
 * from a name's place), the caret after it; otherwise every word chosen, unless a pointer put the caret.
 */
function openBox(el: HTMLElement, start: string, shown: string, pointed: boolean): void {
  holdBlock(el, true);
  if (start !== shown) {
    el.textContent = start;
    el.toggleAttribute("data-empty", !start);
    caretIn(el, false);
  } else if (!pointed) caretIn(el, true);
}

/**
 * What the box says, as one line at most `max` long, the box put right where the browser left it otherwise. Emptied, it
 * is emptied whole: a line break the browser leaves would take the pencil onto a line of its own.
 */
function wordsOf(box: { textContent: string | null }, el: HTMLElement | null, max: number): string {
  const words = box.textContent ?? "";
  const kept = words.replace(/[\r\n]+/g, " ").slice(0, max);
  if (kept !== words || (!kept && el?.childNodes.length)) {
    box.textContent = kept;
    if (el) caretIn(el, false);
  }
  el?.toggleAttribute("data-empty", !kept);
  return kept;
}

export function useInPlace(o: InPlaceOptions): InPlace {
  const box = useRef<HTMLElement | null>(null);
  const [typing, setTyping] = useState(false);
  const [round, setRound] = useState(0);
  const [frozen, setFrozen] = useState("");
  const [held, setHeld] = useState<string | null>(null);
  // A save on its way: asked from the box, which keeps the keys, or behind a typing left, while the box waits.
  const [saving, setSaving] = useState<"asked" | "behind" | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  // What is typed, as the box last said it.
  const text = useRef("");
  const leaving = useRef(false);
  const pointed = useRef(false);
  // A save asked for from the box: it holds the keys until the door answers. `left` is its typing left meanwhile.
  const asking = useRef(false);
  const left = useRef(false);
  useEffect(() => setHeld(null), [o.value]);
  const shown = typing ? frozen : (held ?? o.value);
  const setBox = useCallback((el: HTMLElement | null) => {
    box.current = el;
  }, []);

  const blur = () => box.current?.blur();
  const ask = async () => {
    if (asking.current) return;
    const typed = cleanOf(text.current, o.max);
    if (o.same(typed)) {
      leaving.current = true;
      blur();
      return;
    }
    const why = o.check?.(typed) ?? null;
    if (why) {
      setProblem(why);
      return;
    }
    asking.current = true;
    left.current = false;
    setSaving("asked");
    const refused = await o.save(typed);
    setSaving(null);
    asking.current = false;
    if (left.current) {
      // The box was left while the door answered: the words stay said, or the value comes back and the page says why.
      setHeld(refused ? null : typed || null);
      if (refused) o.said(refused);
      return;
    }
    if (refused) {
      setProblem(refused);
      return;
    }
    setHeld(typed || null);
    leaving.current = true;
    blur();
  };
  const end = async () => {
    const typed = cleanOf(text.current, o.max);
    if (o.same(typed)) return;
    const why = o.check?.(typed) ?? null;
    if (why) {
      o.said(why);
      return;
    }
    setHeld(typed || null);
    setSaving("behind");
    const refused = await o.save(typed);
    setSaving(null);
    if (refused) {
      setHeld(null);
      o.said(refused);
    }
  };

  return {
    typing,
    busy: saving !== null,
    problem,
    round,
    shown,
    box: {
      ref: setBox,
      contentEditable: saving === "behind" ? "false" : "plaintext-only",
      suppressContentEditableWarning: true,
      role: "textbox",
      tabIndex: 0,
      "aria-invalid": problem ? true : undefined,
      "data-empty": shown ? undefined : "",
      onPointerDown: () => {
        pointed.current = true;
      },
      onFocus: (e) => {
        const el = elementOf(e);
        setFrozen(shown);
        setTyping(true);
        setProblem(null);
        text.current = o.start;
        if (el) openBox(el, o.start, shown, pointed.current);
        pointed.current = false;
      },
      onBlur: (e) => {
        const el = elementOf(e);
        if (el) holdBlock(el, false);
        setTyping(false);
        setRound((n) => n + 1);
        setProblem(null);
        if (leaving.current) {
          leaving.current = false;
          return;
        }
        if (asking.current) {
          left.current = true;
          return;
        }
        void end();
      },
      onInput: (e) => {
        text.current = wordsOf(e.currentTarget, elementOf(e), o.max);
        setProblem(null);
      },
      onKeyDown: (e) => {
        if (e.nativeEvent.isComposing) return;
        if (e.key === "Enter") {
          e.preventDefault();
          void ask();
        } else if (e.key === "Escape") {
          e.preventDefault();
          e.stopPropagation();
          leaving.current = true;
          blur();
        }
      },
    },
    begin: () => box.current?.focus(),
    done: ask,
    keep: (e) => e.preventDefault(),
    leave: () => {
      leaving.current = true;
      blur();
    },
    hold: setHeld,
  };
}
